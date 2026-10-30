const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');

exports.getProviders = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM insurance_providers ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createProvider = async (req, res, next) => {
  try {
    const { name, contact } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required.' });
    const [result] = await pool.query('INSERT INTO insurance_providers (name, contact) VALUES (?, ?)', [name, contact || null]);
    await logAction(req, { action: 'CREATE', entity: 'insurance_providers', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Provider added.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.getClaims = async (req, res, next) => {
  try {
    let sql = `SELECT ic.*, pu.name AS patient_name, ip.name AS provider_name
               FROM insurance_claims ic
               JOIN patients p ON ic.patient_id = p.id JOIN users pu ON p.user_id = pu.id
               JOIN insurance_providers ip ON ic.provider_id = ip.id`;
    const params = [];
    if (req.user.role === 'patient') { sql += ' WHERE ic.patient_id = ?'; params.push(req.user.patientId); }
    sql += ' ORDER BY ic.submitted_date DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createClaim = async (req, res, next) => {
  try {
    const { patient_id, provider_id, admission_id, claim_amount, notes } = req.body;
    if (!patient_id || !provider_id || !claim_amount) {
      return res.status(400).json({ success: false, message: 'patient_id, provider_id and claim_amount are required.' });
    }
    const [result] = await pool.query(
      `INSERT INTO insurance_claims (patient_id, provider_id, admission_id, claim_amount, notes) VALUES (?, ?, ?, ?, ?)`,
      [patient_id, provider_id, admission_id || null, claim_amount, notes || null]
    );
    await logAction(req, { action: 'CREATE', entity: 'insurance_claims', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Insurance claim submitted.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.updateClaim = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const allowed = ['submitted', 'under_review', 'approved', 'rejected', 'settled'];
    const fields = [];
    const values = [];
    if (status) {
      if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
      fields.push('status = ?'); values.push(status);
    }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No changes provided.' });
    await pool.query(`UPDATE insurance_claims SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'insurance_claims', entityId: req.params.id });
    res.json({ success: true, message: 'Claim updated.' });
  } catch (err) { next(err); }
};
