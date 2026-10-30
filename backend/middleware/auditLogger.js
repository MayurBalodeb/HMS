const pool = require('../config/db');

/**
 * Call this from inside controllers after a successful mutating action.
 * Not a blocking middleware — fire-and-forget so it never slows down the response.
 */
async function logAction(req, { action, entity, entityId, details }) {
  try {
    const userId = req.user ? req.user.id : null;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, entity, entityId || null, details || '', ip]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAction };
