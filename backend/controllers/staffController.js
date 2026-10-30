const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');

exports.getAll = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.user_id, u.name, u.email, u.phone, r.name AS role, dep.name AS department, s.shift, u.status
       FROM staff s JOIN users u ON s.user_id = u.id
       JOIN roles r ON s.role_id = r.id
       LEFT JOIN departments dep ON s.department_id = dep.id
       ORDER BY r.name, u.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const fields = ['department_id', 'shift'];
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (updates.length) {
      const setClause = updates.map((f) => `${f} = ?`).join(', ');
      await pool.query(`UPDATE staff SET ${setClause} WHERE id = ?`, [...updates.map((f) => req.body[f]), req.params.id]);
    }
    if (req.body.status) {
      const [[s]] = await pool.query('SELECT user_id FROM staff WHERE id = ?', [req.params.id]);
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [req.body.status, s.user_id]);
    }
    await logAction(req, { action: 'UPDATE', entity: 'staff', entityId: req.params.id });
    res.json({ success: true, message: 'Staff record updated.' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const [[s]] = await pool.query('SELECT user_id FROM staff WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ success: false, message: 'Staff not found.' });
    await pool.query('DELETE FROM users WHERE id = ?', [s.user_id]);
    await logAction(req, { action: 'DELETE', entity: 'staff', entityId: req.params.id });
    res.json({ success: true, message: 'Staff removed.' });
  } catch (err) { next(err); }
};
