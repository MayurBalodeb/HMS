const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');

exports.getAll = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, u.name, u.email, u.phone, dep.name AS department, d.specialization,
              d.qualification, d.consultation_fee, d.available_days, d.available_time
       FROM doctors d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN departments dep ON d.department_id = dep.id
       ORDER BY u.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const [[doc]] = await pool.query(
      `SELECT d.*, u.name, u.email, u.phone FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.id = ?`,
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const fields = ['department_id', 'specialization', 'qualification', 'consultation_fee', 'available_days', 'available_time'];
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ success: false, message: 'No valid fields provided.' });
    const setClause = updates.map((f) => `${f} = ?`).join(', ');
    await pool.query(`UPDATE doctors SET ${setClause} WHERE id = ?`, [...updates.map((f) => req.body[f]), req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'doctors', entityId: req.params.id });
    res.json({ success: true, message: 'Doctor profile updated.' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const [[d]] = await pool.query('SELECT user_id FROM doctors WHERE id = ?', [req.params.id]);
    if (!d) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    await pool.query('DELETE FROM users WHERE id = ?', [d.user_id]);
    await logAction(req, { action: 'DELETE', entity: 'doctors', entityId: req.params.id });
    res.json({ success: true, message: 'Doctor removed.' });
  } catch (err) { next(err); }
};
