const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser, sendEmailReminder } = require('../utils/notifier');

const ALL_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

exports.getAll = async (req, res, next) => {
  try {
    let sql = `SELECT a.*, pu.name AS patient_name, du.name AS doctor_name
               FROM appointments a
               JOIN patients p ON a.patient_id = p.id JOIN users pu ON p.user_id = pu.id
               JOIN doctors d ON a.doctor_id = d.id JOIN users du ON d.user_id = du.id`;
    const conditions = [];
    const params = [];

    if (req.user.role === 'patient') { conditions.push('a.patient_id = ?'); params.push(req.user.patientId); }
    if (req.user.role === 'doctor') { conditions.push('a.doctor_id = ?'); params.push(req.user.doctorId); }
    if (req.query.date) { conditions.push('a.appointment_date = ?'); params.push(req.query.date); }
    if (req.query.status) { conditions.push('a.status = ?'); params.push(req.query.status); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY a.appointment_date DESC, a.time_slot DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) return res.status(400).json({ success: false, message: 'doctorId and date are required.' });
    const [booked] = await pool.query(
      `SELECT time_slot FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'`,
      [doctorId, date]
    );
    const bookedSet = new Set(booked.map((b) => b.time_slot));
    const available = ALL_SLOTS.filter((s) => !bookedSet.has(s));
    res.json({ success: true, data: available });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    let { patient_id, doctor_id, appointment_date, time_slot, reason } = req.body;
    if (req.user.role === 'patient') patient_id = req.user.patientId;
    if (!patient_id || !doctor_id || !appointment_date || !time_slot) {
      return res.status(400).json({ success: false, message: 'patient_id, doctor_id, appointment_date and time_slot are required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, time_slot, reason) VALUES (?, ?, ?, ?, ?)`,
      [patient_id, doctor_id, appointment_date, time_slot, reason || null]
    );

    const [[doc]] = await pool.query(`SELECT u.name, u.id AS user_id FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.id = ?`, [doctor_id]);
    const [[pat]] = await pool.query(`SELECT u.name, u.email, u.id AS user_id FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?`, [patient_id]);

    await notifyUser(doc.user_id, { title: 'New appointment', message: `${pat.name} booked ${time_slot} on ${appointment_date}.`, type: 'appointment' });
    await notifyUser(pat.user_id, { title: 'Appointment booked', message: `Your appointment with Dr. ${doc.name} is set for ${appointment_date} ${time_slot}.`, type: 'appointment' });
    await sendEmailReminder(pat.email, 'Appointment Confirmation', `Your appointment with Dr. ${doc.name} on ${appointment_date} at ${time_slot} is confirmed.`);

    await logAction(req, { action: 'CREATE', entity: 'appointments', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Appointment booked.', data: { id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That slot is already booked. Please choose another.' });
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { status, appointment_date, time_slot, reason } = req.body;
    const id = req.params.id;
    const [[appt]] = await pool.query('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    if (req.user.role === 'patient' && req.user.patientId !== appt.patient_id) {
      return res.status(403).json({ success: false, message: 'You may only modify your own appointments.' });
    }
    if (req.user.role === 'patient' && status && status !== 'cancelled') {
      return res.status(403).json({ success: false, message: 'Patients may only cancel appointments.' });
    }

    const fields = [];
    const values = [];
    if (status) { fields.push('status = ?'); values.push(status); }
    if (appointment_date) { fields.push('appointment_date = ?'); values.push(appointment_date); }
    if (time_slot) { fields.push('time_slot = ?'); values.push(time_slot); }
    if (reason !== undefined) { fields.push('reason = ?'); values.push(reason); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No changes provided.' });

    await pool.query(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    await logAction(req, { action: 'UPDATE', entity: 'appointments', entityId: id, details: JSON.stringify(req.body) });
    res.json({ success: true, message: 'Appointment updated.' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM appointments WHERE id = ?', [req.params.id]);
    await logAction(req, { action: 'DELETE', entity: 'appointments', entityId: req.params.id });
    res.json({ success: true, message: 'Appointment deleted.' });
  } catch (err) { next(err); }
};
