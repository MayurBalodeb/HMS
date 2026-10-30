const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

exports.getAll = async (req, res, next) => {
  try {
    let sql = `SELECT t.*, au.name AS assigned_by_name, tu.name AS assigned_to_name
               FROM tasks t JOIN users au ON t.assigned_by = au.id JOIN users tu ON t.assigned_to = tu.id`;
    const params = [];
    if (req.user.role !== 'admin') {
      sql += ' WHERE t.assigned_to = ? OR t.assigned_by = ?';
      params.push(req.user.id, req.user.id);
    }
    sql += ' ORDER BY FIELD(t.priority,"urgent","high","medium","low"), t.due_date IS NULL, t.due_date ASC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { assigned_to, title, description, priority, due_date } = req.body;
    if (!assigned_to || !title) return res.status(400).json({ success: false, message: 'assigned_to and title are required.' });
    const [result] = await pool.query(
      `INSERT INTO tasks (assigned_by, assigned_to, title, description, priority, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, assigned_to, title, description || null, priority || 'medium', due_date || null]
    );
    await notifyUser(assigned_to, { title: 'New task assigned', message: title, type: 'task' });
    await logAction(req, { action: 'CREATE', entity: 'tasks', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Task assigned.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { status, title, description, priority, due_date } = req.body;
    const [[task]] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });

    const isAssignee = task.assigned_to === req.user.id;
    const isAssigner = task.assigned_by === req.user.id;
    if (!isAssignee && !isAssigner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this task.' });
    }

    const fields = [];
    const values = [];
    if (status && (isAssignee || isAssigner || req.user.role === 'admin')) { fields.push('status = ?'); values.push(status); }
    if (title && (isAssigner || req.user.role === 'admin')) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined && (isAssigner || req.user.role === 'admin')) { fields.push('description = ?'); values.push(description); }
    if (priority && (isAssigner || req.user.role === 'admin')) { fields.push('priority = ?'); values.push(priority); }
    if (due_date && (isAssigner || req.user.role === 'admin')) { fields.push('due_date = ?'); values.push(due_date); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No permitted changes provided.' });

    await pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    if (status) await notifyUser(task.assigned_by, { title: 'Task updated', message: `"${task.title}" is now ${status}.`, type: 'task' });
    await logAction(req, { action: 'UPDATE', entity: 'tasks', entityId: req.params.id });
    res.json({ success: true, message: 'Task updated.' });
  } catch (err) { next(err); }
};
