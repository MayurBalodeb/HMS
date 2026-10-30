const pool = require('../config/db');
const path = require('path');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

exports.getTests = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM lab_tests ORDER BY category, name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createTest = async (req, res, next) => {
  try {
    const { name, category, price } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required.' });
    const [result] = await pool.query('INSERT INTO lab_tests (name, category, price) VALUES (?, ?, ?)', [name, category || null, price || 0]);
    await logAction(req, { action: 'CREATE', entity: 'lab_tests', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Lab test added.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.getRequests = async (req, res, next) => {
  try {
    let sql = `SELECT lr.*, pu.name AS patient_name, du.name AS doctor_name, lt.name AS test_name, lt.price
               FROM lab_requests lr
               JOIN patients p ON lr.patient_id = p.id JOIN users pu ON p.user_id = pu.id
               LEFT JOIN doctors d ON lr.doctor_id = d.id LEFT JOIN users du ON d.user_id = du.id
               JOIN lab_tests lt ON lr.test_id = lt.id`;
    const conditions = [];
    const params = [];
    if (req.query.status) { conditions.push('lr.status = ?'); params.push(req.query.status); }
    if (req.user.role === 'patient') { conditions.push('lr.patient_id = ?'); params.push(req.user.patientId); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY lr.requested_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createRequest = async (req, res, next) => {
  try {
    const { patient_id, test_id } = req.body;
    const doctor_id = req.user.role === 'doctor' ? req.user.doctorId : (req.body.doctor_id || null);
    if (!patient_id || !test_id) return res.status(400).json({ success: false, message: 'patient_id and test_id are required.' });
    const [result] = await pool.query(
      'INSERT INTO lab_requests (patient_id, doctor_id, test_id) VALUES (?, ?, ?)',
      [patient_id, doctor_id, test_id]
    );
    const [labStaff] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='lab_staff'`);
    for (const l of labStaff) await notifyUser(l.id, { title: 'New lab request', message: `Test #${test_id} requested.`, type: 'lab' });
    await logAction(req, { action: 'CREATE', entity: 'lab_requests', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Lab test requested.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.updateRequestStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['requested', 'sample_collected', 'in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
    await pool.query('UPDATE lab_requests SET status = ? WHERE id = ?', [status, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'lab_requests', entityId: req.params.id, details: `status=${status}` });
    res.json({ success: true, message: 'Lab request status updated.' });
  } catch (err) { next(err); }
};

exports.uploadReport = async (req, res, next) => {
  try {
    const { result_summary } = req.body;
    const requestId = req.params.id;
    const filePath = req.file ? `lab_reports/${req.file.filename}` : null;

    const [[existing]] = await pool.query('SELECT id FROM lab_reports WHERE request_id = ?', [requestId]);
    if (existing) {
      await pool.query('UPDATE lab_reports SET result_summary = ?, report_file = COALESCE(?, report_file) WHERE request_id = ?', [result_summary || null, filePath, requestId]);
    } else {
      await pool.query(
        'INSERT INTO lab_reports (request_id, lab_staff_id, result_summary, report_file) VALUES (?, ?, ?, ?)',
        [requestId, req.user.id, result_summary || null, filePath]
      );
    }
    await pool.query(`UPDATE lab_requests SET status = 'completed' WHERE id = ?`, [requestId]);

    const [[reqRow]] = await pool.query(
      `SELECT p.user_id FROM lab_requests lr JOIN patients p ON lr.patient_id = p.id WHERE lr.id = ?`, [requestId]
    );
    if (reqRow) await notifyUser(reqRow.user_id, { title: 'Lab report ready', message: 'Your lab report has been uploaded.', type: 'lab' });

    await logAction(req, { action: 'UPLOAD_REPORT', entity: 'lab_reports', entityId: requestId });
    res.json({ success: true, message: 'Report uploaded.' });
  } catch (err) { next(err); }
};

exports.getReportsByPatient = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(patientId)) {
      return res.status(403).json({ success: false, message: 'You may only view your own reports.' });
    }
    const [rows] = await pool.query(
      `SELECT lr.id AS request_id, lt.name AS test_name, rep.result_summary, rep.report_file, rep.uploaded_at, lr.status
       FROM lab_requests lr JOIN lab_tests lt ON lr.test_id = lt.id
       LEFT JOIN lab_reports rep ON rep.request_id = lr.id
       WHERE lr.patient_id = ? ORDER BY lr.requested_at DESC`,
      [patientId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.downloadReportFile = async (req, res, next) => {
  try {
    const [[rep]] = await pool.query('SELECT report_file FROM lab_reports WHERE request_id = ?', [req.params.id]);
    if (!rep || !rep.report_file) return res.status(404).json({ success: false, message: 'Report file not found.' });
    res.sendFile(path.join(__dirname, '..', 'uploads', rep.report_file));
  } catch (err) { next(err); }
};
