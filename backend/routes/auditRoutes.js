const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const pool = require('../config/db');

router.get('/', auth, requireRole(['admin']), async (req, res, next) => {
  try {
    let sql = `SELECT al.*, u.name AS user_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id`;
    const conditions = [];
    const params = [];
    if (req.query.entity) { conditions.push('al.entity = ?'); params.push(req.query.entity); }
    if (req.query.userId) { conditions.push('al.user_id = ?'); params.push(req.query.userId); }
    if (req.query.from) { conditions.push('al.created_at >= ?'); params.push(req.query.from); }
    if (req.query.to) { conditions.push('al.created_at <= ?'); params.push(req.query.to); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY al.created_at DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
