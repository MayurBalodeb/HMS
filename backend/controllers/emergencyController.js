const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

exports.getAmbulances = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ambulances ORDER BY status, vehicle_no');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createAmbulance = async (req, res, next) => {
  try {
    const { vehicle_no, driver_name, driver_phone } = req.body;
    if (!vehicle_no) return res.status(400).json({ success: false, message: 'vehicle_no is required.' });
    const [result] = await pool.query(
      'INSERT INTO ambulances (vehicle_no, driver_name, driver_phone) VALUES (?, ?, ?)',
      [vehicle_no, driver_name || null, driver_phone || null]
    );
    await logAction(req, { action: 'CREATE', entity: 'ambulances', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Ambulance added.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.updateAmbulance = async (req, res, next) => {
  try {
    const { status, driver_name, driver_phone } = req.body;
    const fields = [];
    const values = [];
    if (status) { fields.push('status = ?'); values.push(status); }
    if (driver_name) { fields.push('driver_name = ?'); values.push(driver_name); }
    if (driver_phone) { fields.push('driver_phone = ?'); values.push(driver_phone); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No changes provided.' });
    await pool.query(`UPDATE ambulances SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'ambulances', entityId: req.params.id });
    res.json({ success: true, message: 'Ambulance updated.' });
  } catch (err) { next(err); }
};

exports.getCases = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ec.*, pu.name AS patient_name, am.vehicle_no, du.name AS doctor_name
       FROM emergency_cases ec
       LEFT JOIN patients p ON ec.patient_id = p.id LEFT JOIN users pu ON p.user_id = pu.id
       LEFT JOIN ambulances am ON ec.ambulance_id = am.id
       LEFT JOIN doctors d ON ec.assigned_doctor_id = d.id LEFT JOIN users du ON d.user_id = du.id
       ORDER BY ec.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createCase = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { patient_id, ambulance_id, case_type, severity, notes } = req.body;
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO emergency_cases (patient_id, ambulance_id, case_type, severity, notes, status)
       VALUES (?, ?, ?, ?, ?, 'reported')`,
      [patient_id || null, ambulance_id || null, case_type || null, severity || 'medium', notes || null]
    );
    if (ambulance_id) {
      await conn.query(`UPDATE ambulances SET status = 'on_call' WHERE id = ?`, [ambulance_id]);
    }
    await conn.commit();

    const [emStaff] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='emergency_staff'`);
    for (const e of emStaff) await notifyUser(e.id, { title: 'New emergency case', message: `${case_type || 'Case'} reported — severity ${severity || 'medium'}.`, type: 'emergency' });

    await logAction(req, { action: 'CREATE', entity: 'emergency_cases', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Emergency case logged.', data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateCase = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { status, assigned_doctor_id, arrival_time, notes } = req.body;
    const [[caseRow]] = await conn.query('SELECT * FROM emergency_cases WHERE id = ?', [req.params.id]);
    if (!caseRow) return res.status(404).json({ success: false, message: 'Case not found.' });

    const fields = [];
    const values = [];
    if (status) { fields.push('status = ?'); values.push(status); }
    if (assigned_doctor_id) { fields.push('assigned_doctor_id = ?'); values.push(assigned_doctor_id); }
    if (arrival_time) { fields.push('arrival_time = ?'); values.push(arrival_time); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No changes provided.' });

    await conn.beginTransaction();
    await conn.query(`UPDATE emergency_cases SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    if (status === 'closed' && caseRow.ambulance_id) {
      await conn.query(`UPDATE ambulances SET status = 'available' WHERE id = ?`, [caseRow.ambulance_id]);
    }
    await conn.commit();
    await logAction(req, { action: 'UPDATE', entity: 'emergency_cases', entityId: req.params.id });
    res.json({ success: true, message: 'Emergency case updated.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};
