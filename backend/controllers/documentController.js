const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const { logAction } = require('../middleware/auditLogger');

exports.getByPatient = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(patientId)) {
      return res.status(403).json({ success: false, message: 'You may only view your own documents.' });
    }
    const [rows] = await pool.query(
      `SELECT d.*, u.name AS uploaded_by_name FROM documents d JOIN users u ON d.uploaded_by = u.id
       WHERE d.patient_id = ? ORDER BY d.uploaded_at DESC`,
      [patientId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.upload = async (req, res, next) => {
  try {
    const { patient_id, doc_type } = req.body;
    if (!patient_id) return res.status(400).json({ success: false, message: 'patient_id is required.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    if (req.user.role === 'patient' && String(req.user.patientId) !== String(patient_id)) {
      return res.status(403).json({ success: false, message: 'You may only upload documents to your own profile.' });
    }

    const [result] = await pool.query(
      `INSERT INTO documents (patient_id, uploaded_by, doc_type, original_name, file_path) VALUES (?, ?, ?, ?, ?)`,
      [patient_id, req.user.id, doc_type || 'general', req.file.originalname, `documents/${req.file.filename}`]
    );
    await logAction(req, { action: 'UPLOAD', entity: 'documents', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Document uploaded.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.download = async (req, res, next) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });
    if (req.user.role === 'patient' && req.user.patientId !== doc.patient_id) {
      return res.status(403).json({ success: false, message: 'You may only download your own documents.' });
    }
    const fullPath = path.join(__dirname, '..', 'uploads', doc.file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, message: 'File missing on server.' });
    res.download(fullPath, doc.original_name);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });
    await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    const fullPath = path.join(__dirname, '..', 'uploads', doc.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await logAction(req, { action: 'DELETE', entity: 'documents', entityId: req.params.id });
    res.json({ success: true, message: 'Document deleted.' });
  } catch (err) { next(err); }
};
