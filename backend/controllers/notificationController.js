const pool = require('../config/db');
const { notifyUser } = require('../utils/notifier');
const { logAction } = require('../middleware/auditLogger');

exports.getMine = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.markRead = async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Marked as read.' });
  } catch (err) { next(err); }
};

exports.broadcast = async (req, res, next) => {
  try {
    const { title, message, role } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'title and message are required.' });

    let sql = 'SELECT u.id FROM users u';
    const params = [];
    if (role) {
      sql += ' JOIN roles r ON u.role_id = r.id WHERE r.name = ?';
      params.push(role);
    }
    const [users] = await pool.query(sql, params);
    for (const u of users) {
      await notifyUser(u.id, { title, message, type: 'broadcast' });
    }
    await logAction(req, { action: 'BROADCAST', entity: 'notifications', details: `role=${role || 'all'}, recipients=${users.length}` });
    res.json({ success: true, message: `Broadcast sent to ${users.length} user(s).` });
  } catch (err) { next(err); }
};
