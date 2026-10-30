const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

exports.getInventory = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blood_inventory ORDER BY blood_group');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.updateInventory = async (req, res, next) => {
  try {
    const { units_available } = req.body;
    if (units_available === undefined) return res.status(400).json({ success: false, message: 'units_available is required.' });
    await pool.query('UPDATE blood_inventory SET units_available = ? WHERE id = ?', [units_available, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'blood_inventory', entityId: req.params.id });
    res.json({ success: true, message: 'Blood inventory updated.' });
  } catch (err) { next(err); }
};

exports.getDonors = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blood_donors ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createDonor = async (req, res, next) => {
  try {
    const { name, blood_group, phone, last_donation_date } = req.body;
    if (!name || !blood_group) return res.status(400).json({ success: false, message: 'name and blood_group are required.' });
    const [result] = await pool.query(
      'INSERT INTO blood_donors (name, blood_group, phone, last_donation_date) VALUES (?, ?, ?, ?)',
      [name, blood_group, phone || null, last_donation_date || null]
    );
    await logAction(req, { action: 'CREATE', entity: 'blood_donors', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Donor registered.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.getRequests = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.*, u.name AS requested_by_name, pu.name AS patient_name
       FROM blood_requests br
       LEFT JOIN users u ON br.requested_by = u.id
       LEFT JOIN patients p ON br.patient_id = p.id LEFT JOIN users pu ON p.user_id = pu.id
       ORDER BY br.request_date DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createRequest = async (req, res, next) => {
  try {
    const { patient_id, blood_group, units_required } = req.body;
    if (!blood_group || !units_required) return res.status(400).json({ success: false, message: 'blood_group and units_required are required.' });
    const [result] = await pool.query(
      'INSERT INTO blood_requests (patient_id, blood_group, units_required, requested_by) VALUES (?, ?, ?, ?)',
      [patient_id || null, blood_group, units_required, req.user.id]
    );
    const [bbStaff] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='blood_bank'`);
    for (const b of bbStaff) await notifyUser(b.id, { title: 'Blood request', message: `${units_required} unit(s) of ${blood_group} requested.`, type: 'blood' });
    await logAction(req, { action: 'CREATE', entity: 'blood_requests', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Blood request submitted.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.updateRequest = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { status } = req.body;
    const allowed = ['pending', 'approved', 'fulfilled', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });

    const [[reqRow]] = await conn.query('SELECT * FROM blood_requests WHERE id = ?', [req.params.id]);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Request not found.' });

    await conn.beginTransaction();
    if (status === 'fulfilled' && reqRow.status !== 'fulfilled') {
      const [[inv]] = await conn.query('SELECT * FROM blood_inventory WHERE blood_group = ? FOR UPDATE', [reqRow.blood_group]);
      if (!inv || inv.units_available < reqRow.units_required) {
        throw Object.assign(new Error('Insufficient blood units in stock.'), { status: 409, publicMessage: 'Insufficient blood units in stock to fulfil this request.' });
      }
      await conn.query('UPDATE blood_inventory SET units_available = units_available - ? WHERE id = ?', [reqRow.units_required, inv.id]);
    }
    await conn.query('UPDATE blood_requests SET status = ? WHERE id = ?', [status, req.params.id]);
    await conn.commit();
    await logAction(req, { action: 'UPDATE', entity: 'blood_requests', entityId: req.params.id, details: `status=${status}` });
    res.json({ success: true, message: 'Blood request updated.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};
