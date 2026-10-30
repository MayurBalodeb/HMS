const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
let ioInstance = null;
function attachIO(io) { ioInstance = io; }

exports.attachIO = attachIO;

exports.getRooms = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, dep.name AS department_name FROM rooms r LEFT JOIN departments dep ON r.department_id = dep.id ORDER BY r.room_no`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createRoom = async (req, res, next) => {
  try {
    const { room_no, type, department_id, floor } = req.body;
    const [result] = await pool.query(
      `INSERT INTO rooms (room_no, type, department_id, floor) VALUES (?, ?, ?, ?)`,
      [room_no, type || 'general', department_id || null, floor || null]
    );
    await logAction(req, { action: 'CREATE', entity: 'rooms', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Room created.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.getBeds = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, r.room_no, r.type AS room_type,
              (SELECT pu.name FROM admissions a JOIN patients p ON a.patient_id=p.id JOIN users pu ON p.user_id=pu.id
               WHERE a.bed_id = b.id AND a.status='admitted' LIMIT 1) AS current_patient
       FROM beds b JOIN rooms r ON b.room_id = r.id ORDER BY r.room_no, b.bed_no`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createBed = async (req, res, next) => {
  try {
    const { room_id, bed_no, daily_rate } = req.body;
    if (!room_id || !bed_no) return res.status(400).json({ success: false, message: 'room_id and bed_no are required.' });
    const [result] = await pool.query(
      `INSERT INTO beds (room_id, bed_no, daily_rate) VALUES (?, ?, ?)`,
      [room_id, bed_no, daily_rate || 0]
    );
    await logAction(req, { action: 'CREATE', entity: 'beds', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Bed added.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.updateBedStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['available', 'occupied', 'maintenance'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await pool.query('UPDATE beds SET status = ? WHERE id = ?', [status, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'beds', entityId: req.params.id, details: `status=${status}` });
    if (ioInstance) ioInstance.emit('bed:update', { bedId: req.params.id, status });
    res.json({ success: true, message: 'Bed status updated.' });
  } catch (err) { next(err); }
};

// ---------------- Admissions ----------------
exports.getAdmissions = async (req, res, next) => {
  try {
    let sql = `SELECT ad.*, pu.name AS patient_name, du.name AS doctor_name, b.bed_no, r.room_no
               FROM admissions ad
               JOIN patients p ON ad.patient_id = p.id JOIN users pu ON p.user_id = pu.id
               LEFT JOIN doctors d ON ad.doctor_id = d.id LEFT JOIN users du ON d.user_id = du.id
               JOIN beds b ON ad.bed_id = b.id JOIN rooms r ON b.room_id = r.id`;
    const params = [];
    if (req.query.status) { sql += ' WHERE ad.status = ?'; params.push(req.query.status); }
    if (req.user.role === 'patient') { sql += (params.length ? ' AND' : ' WHERE') + ' ad.patient_id = ?'; params.push(req.user.patientId); }
    sql += ' ORDER BY ad.admit_date DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.admitPatient = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { patient_id, bed_id, doctor_id, reason } = req.body;
    if (!patient_id || !bed_id) return res.status(400).json({ success: false, message: 'patient_id and bed_id are required.' });

    const [[bed]] = await conn.query('SELECT status FROM beds WHERE id = ?', [bed_id]);
    if (!bed) return res.status(404).json({ success: false, message: 'Bed not found.' });
    if (bed.status !== 'available') return res.status(409).json({ success: false, message: 'Selected bed is not available.' });

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO admissions (patient_id, bed_id, doctor_id, reason) VALUES (?, ?, ?, ?)`,
      [patient_id, bed_id, doctor_id || null, reason || null]
    );
    await conn.query(`UPDATE beds SET status = 'occupied' WHERE id = ?`, [bed_id]);
    await conn.commit();

    if (ioInstance) ioInstance.emit('bed:update', { bedId: bed_id, status: 'occupied' });
    await logAction(req, { action: 'CREATE', entity: 'admissions', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Patient admitted.', data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.dischargePatient = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { discharge_summary } = req.body;
    const [[admission]] = await conn.query('SELECT * FROM admissions WHERE id = ?', [req.params.id]);
    if (!admission) return res.status(404).json({ success: false, message: 'Admission not found.' });
    if (admission.status === 'discharged') return res.status(400).json({ success: false, message: 'Already discharged.' });

    await conn.beginTransaction();
    await conn.query(
      `UPDATE admissions SET status='discharged', discharge_date = NOW(), discharge_summary = ? WHERE id = ?`,
      [discharge_summary || null, req.params.id]
    );
    await conn.query(`UPDATE beds SET status = 'available' WHERE id = ?`, [admission.bed_id]);

    // Auto-create a draft invoice line for room charges based on stay duration
    const [[bed]] = await conn.query('SELECT daily_rate FROM beds WHERE id = ?', [admission.bed_id]);
    const days = Math.max(1, Math.ceil((new Date() - new Date(admission.admit_date)) / (1000 * 60 * 60 * 24)));
    const roomCharge = (bed.daily_rate || 0) * days;

    let [[invoice]] = await conn.query('SELECT id FROM invoices WHERE admission_id = ?', [admission.id]);
    let invoiceId;
    if (!invoice) {
      const [invResult] = await conn.query(
        `INSERT INTO invoices (patient_id, admission_id) VALUES (?, ?)`,
        [admission.patient_id, admission.id]
      );
      invoiceId = invResult.insertId;
    } else {
      invoiceId = invoice.id;
    }
    await conn.query(
      `INSERT INTO invoice_items (invoice_id, description, amount) VALUES (?, ?, ?)`,
      [invoiceId, `Room/Bed charges (${days} day(s))`, roomCharge]
    );
    await conn.query(`UPDATE invoices SET total_amount = total_amount + ? WHERE id = ?`, [roomCharge, invoiceId]);

    await conn.commit();
    if (ioInstance) ioInstance.emit('bed:update', { bedId: admission.bed_id, status: 'available' });
    await logAction(req, { action: 'DISCHARGE', entity: 'admissions', entityId: req.params.id });
    res.json({ success: true, message: 'Patient discharged. Draft invoice generated.', data: { invoiceId } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};
