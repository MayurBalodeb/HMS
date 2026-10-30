const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const { logAction } = require('../middleware/auditLogger');
const { generatePatientQR } = require('../utils/qrGenerator');

const STAFF_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_staff', 'emergency_staff', 'accountant', 'blood_bank'];

exports.getAll = async (req, res, next) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : null;
    let sql = `SELECT p.id, u.name, u.email, u.phone, p.dob, p.gender, p.blood_group, p.address, p.created_at
               FROM patients p JOIN users u ON p.user_id = u.id`;
    const params = [];
    if (search) {
      sql += ` WHERE u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?`;
      params.push(search, search, search);
    }
    sql += ' ORDER BY p.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(id)) {
      return res.status(403).json({ success: false, message: 'You may only view your own profile.' });
    }
    const [[patient]] = await pool.query(
      `SELECT p.*, u.name, u.email, u.phone FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
      [id]
    );
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found.' });
    res.json({ success: true, data: patient });
  } catch (err) { next(err); }
};

exports.getQrCode = async (req, res, next) => {
  try {
    const [[patient]] = await pool.query(
      `SELECT p.id, p.qr_code_path, u.name, u.email 
       FROM patients p JOIN users u ON p.user_id = u.id 
       WHERE p.id = ?`, 
      [req.params.id]
    );
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found.' });
    
    let qrPath = patient.qr_code_path;
    let fullPath = qrPath ? path.join(__dirname, '..', 'uploads', qrPath) : null;

    if (!fullPath || !fs.existsSync(fullPath)) {
      qrPath = await generatePatientQR(patient.id, { name: patient.name, email: patient.email });
      await pool.query('UPDATE patients SET qr_code_path = ? WHERE id = ?', [qrPath, patient.id]);
      fullPath = path.join(__dirname, '..', 'uploads', qrPath);
    }

    res.sendFile(fullPath);
  } catch (err) { next(err); }
};

// Reception/Admin registers a walk-in patient (creates user + patient in one go)
exports.create = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, email, password, phone, dob, gender, blood_group, address, emergency_contact, emergency_phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'name, email and password are required.' });

    const [[existing]] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

    const [[role]] = await conn.query(`SELECT id FROM roles WHERE name = 'patient'`);
    const { hashPassword } = require('../utils/password');
    const { generatePatientQR } = require('../utils/qrGenerator');

    await conn.beginTransaction();
    const [userResult] = await conn.query(
      `INSERT INTO users (name, email, password_hash, phone, role_id) VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashPassword(password), phone || null, role.id]
    );
    const [patientResult] = await conn.query(
      `INSERT INTO patients (user_id, dob, gender, blood_group, address, emergency_contact, emergency_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userResult.insertId, dob || null, gender || null, blood_group || null, address || null, emergency_contact || null, emergency_phone || null]
    );
    const qrPath = await generatePatientQR(patientResult.insertId, { name, email });
    await conn.query('UPDATE patients SET qr_code_path = ? WHERE id = ?', [qrPath, patientResult.insertId]);
    await conn.commit();

    await logAction(req, { action: 'CREATE', entity: 'patients', entityId: patientResult.insertId });
    res.status(201).json({ success: true, message: 'Patient registered.', data: { id: patientResult.insertId } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.update = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(id)) {
      return res.status(403).json({ success: false, message: 'You may only edit your own profile.' });
    }
    const fields = ['dob', 'gender', 'blood_group', 'address', 'emergency_contact', 'emergency_phone'];
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (updates.length) {
      const setClause = updates.map((f) => `${f} = ?`).join(', ');
      await pool.query(`UPDATE patients SET ${setClause} WHERE id = ?`, [...updates.map((f) => req.body[f]), id]);
    }
    if (req.body.name || req.body.phone) {
      const [[p]] = await pool.query('SELECT user_id FROM patients WHERE id = ?', [id]);
      const userFields = [];
      const userValues = [];
      if (req.body.name) { userFields.push('name = ?'); userValues.push(req.body.name); }
      if (req.body.phone) { userFields.push('phone = ?'); userValues.push(req.body.phone); }
      await pool.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = ?`, [...userValues, p.user_id]);
    }
    await logAction(req, { action: 'UPDATE', entity: 'patients', entityId: id });
    res.json({ success: true, message: 'Patient profile updated.' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const [[p]] = await pool.query('SELECT user_id FROM patients WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ success: false, message: 'Patient not found.' });
    await pool.query('DELETE FROM users WHERE id = ?', [p.user_id]); // cascades to patients
    await logAction(req, { action: 'DELETE', entity: 'patients', entityId: req.params.id });
    res.json({ success: true, message: 'Patient deleted.' });
  } catch (err) { next(err); }
};

exports.getHistory = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(id)) {
      return res.status(403).json({ success: false, message: 'You may only view your own history.' });
    }

    const [[patientInfo]] = await pool.query(
      `SELECT p.*, u.name, u.email, u.phone 
       FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
      [id]
    );

    const [records] = await pool.query(
      `SELECT mr.*, u.name AS doctor_name, d.specialization, d.qualification, dep.name AS department_name
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id JOIN users u ON d.user_id = u.id
       LEFT JOIN departments dep ON d.department_id = dep.id
       WHERE mr.patient_id = ? ORDER BY mr.visit_date DESC, mr.created_at DESC`,
      [id]
    );
    for (const r of records) {
      const [meds] = await pool.query(
        `SELECT id, medicine_name, dosage, frequency, timing, duration, instructions, status, created_at 
         FROM prescriptions WHERE medical_record_id = ? ORDER BY id ASC`,
        [r.id]
      );
      r.prescriptions = meds;
    }

    const [admissions] = await pool.query(
      `SELECT a.*, b.bed_no, r.room_no, du.name AS doctor_name
       FROM admissions a
       JOIN beds b ON a.bed_id = b.id JOIN rooms r ON b.room_id = r.id
       LEFT JOIN doctors d ON a.doctor_id = d.id LEFT JOIN users du ON d.user_id = du.id
       WHERE a.patient_id = ? ORDER BY a.admit_date DESC`,
      [id]
    );

    const [labReports] = await pool.query(
      `SELECT req.id AS request_id, req.status, req.requested_at,
              lt.name AS test_name, lt.category, lt.price,
              lr.result_summary, lr.report_file, lr.uploaded_at,
              du.name AS doctor_name
       FROM lab_requests req
       JOIN lab_tests lt ON req.test_id = lt.id
       LEFT JOIN lab_reports lr ON lr.request_id = req.id
       LEFT JOIN doctors d ON req.doctor_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       WHERE req.patient_id = ? ORDER BY req.requested_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        patient: patientInfo,
        medicalRecords: records,
        admissions,
        labReports
      }
    });
  } catch (err) { next(err); }
};

