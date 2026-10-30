const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

// Get all medical records & prescriptions for a patient (history timeline)
exports.getByPatient = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(patientId)) {
      return res.status(403).json({ success: false, message: 'You may only view your own records.' });
    }

    const [records] = await pool.query(
      `SELECT mr.*, 
              u.name AS doctor_name, d.specialization, d.qualification,
              dep.name AS department_name
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id 
       JOIN users u ON d.user_id = u.id
       LEFT JOIN departments dep ON d.department_id = dep.id
       WHERE mr.patient_id = ? 
       ORDER BY mr.visit_date DESC, mr.created_at DESC`,
      [patientId]
    );

    for (const r of records) {
      const [rx] = await pool.query(
        `SELECT id, medicine_name, dosage, frequency, timing, duration, instructions, status, created_at 
         FROM prescriptions 
         WHERE medical_record_id = ? ORDER BY id ASC`,
        [r.id]
      );
      r.prescriptions = rx;
    }

    res.json({ success: true, data: records });
  } catch (err) { next(err); }
};

// Create a new consultation record with clinical notes, diagnosis, vitals, prescriptions, and lab tests
exports.create = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      patient_id,
      appointment_id,
      diagnosis,
      notes,
      vitals,
      prescriptions,
      lab_tests
    } = req.body;

    const doctorId = req.user.doctorId;
    if (!doctorId) {
      return res.status(403).json({ success: false, message: 'Only doctors can create clinical records.' });
    }
    if (!patient_id) {
      return res.status(400).json({ success: false, message: 'patient_id is required.' });
    }

    await conn.beginTransaction();

    // 1. Insert Medical Record
    const [result] = await conn.query(
      `INSERT INTO medical_records (patient_id, doctor_id, diagnosis, notes, vitals_json, visit_date) 
       VALUES (?, ?, ?, ?, ?, CURRENT_DATE)`,
      [patient_id, doctorId, diagnosis || null, notes || null, vitals ? JSON.stringify(vitals) : null]
    );
    const medicalRecordId = result.insertId;

    // 2. Insert Prescriptions
    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      for (const rx of prescriptions) {
        if (!rx.medicine_name) continue;
        await conn.query(
          `INSERT INTO prescriptions 
           (medical_record_id, medicine_name, dosage, frequency, timing, duration, instructions, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            medicalRecordId,
            rx.medicine_name,
            rx.dosage || null,
            rx.frequency || null,
            rx.timing || null,
            rx.duration || null,
            rx.instructions || null
          ]
        );
      }
    }

    // 3. Insert Lab Orders if requested during consultation
    if (Array.isArray(lab_tests) && lab_tests.length > 0) {
      for (const testId of lab_tests) {
        if (!testId) continue;
        await conn.query(
          `INSERT INTO lab_requests (patient_id, doctor_id, test_id, status) VALUES (?, ?, ?, 'requested')`,
          [patient_id, doctorId, testId]
        );
      }
    }

    // 4. If an appointment was linked, mark it completed
    if (appointment_id) {
      await conn.query(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [appointment_id]);
    }

    // 5. Fetch doctor & patient user IDs to notify
    const [[docUser]] = await conn.query('SELECT u.name FROM users u WHERE u.id = ?', [req.user.id]);
    const [[patUser]] = await conn.query('SELECT user_id FROM patients WHERE id = ?', [patient_id]);

    await conn.commit();

    // Notify patient
    if (patUser) {
      await notifyUser(patUser.user_id, {
        title: 'Prescription & Consultation Notes Available',
        message: `Dr. ${docUser?.name || 'Your doctor'} has recorded your consultation and issued your prescription.`,
        type: 'clinical'
      });
    }

    // Notify pharmacists that a prescription is ready
    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      const [pharmacists] = await pool.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'pharmacist'`
      );
      for (const pharma of pharmacists) {
        await notifyUser(pharma.id, {
          title: 'New Prescription in Queue',
          message: `Dr. ${docUser?.name || 'Doctor'} prescribed medicines for Patient #${patient_id}. Ready for dispensing.`,
          type: 'pharmacy'
        });
      }
    }

    await logAction(req, {
      action: 'CREATE',
      entity: 'medical_records',
      entityId: medicalRecordId,
      details: `Consultation recorded for patient #${patient_id} with ${prescriptions?.length || 0} medicines prescribed.`
    });

    res.status(201).json({
      success: true,
      message: 'Consultation recorded and prescription saved to patient history.',
      data: { id: medicalRecordId }
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// Prescription queue for pharmacists and billing desk
exports.getPrescriptionQueue = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pr.id AS prescription_id, pr.medicine_name, pr.dosage, pr.frequency, pr.timing, pr.duration, pr.instructions, pr.status, pr.created_at,
              mr.id AS medical_record_id, mr.visit_date, mr.diagnosis,
              p.id AS patient_id, pu.name AS patient_name, pu.phone AS patient_phone,
              du.name AS doctor_name,
              inv.id AS inventory_id, inv.quantity AS stock_available, inv.unit_price, inv.batch_no
       FROM prescriptions pr
       JOIN medical_records mr ON pr.medical_record_id = mr.id
       JOIN patients p ON mr.patient_id = p.id
       JOIN users pu ON p.user_id = pu.id
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN users du ON d.user_id = du.id
       LEFT JOIN pharmacy_inventory inv ON LOWER(TRIM(inv.medicine_name)) = LOWER(TRIM(pr.medicine_name))
       ORDER BY pr.created_at DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// Update prescription status (e.g. dispensed / cancelled)
exports.updatePrescriptionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status is required.' });

    await pool.query('UPDATE prescriptions SET status = ? WHERE id = ?', [status, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'prescriptions', entityId: req.params.id, details: `status=${status}` });
    res.json({ success: true, message: `Prescription marked as ${status}.` });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { diagnosis, notes } = req.body;
    const [[record]] = await pool.query('SELECT * FROM medical_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    if (req.user.doctorId !== record.doctor_id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You may only edit your own records.' });
    }
    await pool.query('UPDATE medical_records SET diagnosis = ?, notes = ? WHERE id = ?', [diagnosis, notes, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'medical_records', entityId: req.params.id });
    res.json({ success: true, message: 'Medical record updated.' });
  } catch (err) { next(err); }
};

exports.addPrescription = async (req, res, next) => {
  try {
    const { medicine_name, dosage, duration, frequency, timing, instructions } = req.body;
    if (!medicine_name) return res.status(400).json({ success: false, message: 'medicine_name is required.' });
    const [result] = await pool.query(
      `INSERT INTO prescriptions (medical_record_id, medicine_name, dosage, frequency, timing, duration, instructions, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [req.params.id, medicine_name, dosage || null, frequency || null, timing || null, duration || null, instructions || null]
    );
    await logAction(req, { action: 'CREATE', entity: 'prescriptions', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Prescription added.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

