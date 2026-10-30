const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generatePatientQR } = require('../utils/qrGenerator');
const { logAction } = require('../middleware/auditLogger');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

async function buildUserContext(userId) {
  const [[user]] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, r.name AS role
     FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
    [userId]
  );
  if (!user) return null;

  let extra = {};
  if (user.role === 'patient') {
    const [[p]] = await pool.query('SELECT id FROM patients WHERE user_id = ?', [userId]);
    if (p) extra.patientId = p.id;
  } else if (user.role === 'doctor') {
    const [[d]] = await pool.query('SELECT id FROM doctors WHERE user_id = ?', [userId]);
    if (d) extra.doctorId = d.id;
  } else {
    const [[s]] = await pool.query('SELECT id FROM staff WHERE user_id = ?', [userId]);
    if (s) extra.staffId = s.id;
  }
  return { ...user, ...extra };
}

// Public: self-registration is only for patients. Staff/doctor accounts are created by Admin.
exports.register = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, email, password, phone, dob, gender, blood_group, address, emergency_contact, emergency_phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }

    const [[existing]] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    const [[patientRole]] = await conn.query(`SELECT id FROM roles WHERE name = 'patient'`);
    await conn.beginTransaction();

    const passwordHash = hashPassword(password);
    const [userResult] = await conn.query(
      `INSERT INTO users (name, email, password_hash, phone, role_id) VALUES (?, ?, ?, ?, ?)`,
      [name, email, passwordHash, phone || null, patientRole.id]
    );
    const [patientResult] = await conn.query(
      `INSERT INTO patients (user_id, dob, gender, blood_group, address, emergency_contact, emergency_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userResult.insertId, dob || null, gender || null, blood_group || null, address || null, emergency_contact || null, emergency_phone || null]
    );

    const qrPath = await generatePatientQR(patientResult.insertId, { name, email });
    await conn.query('UPDATE patients SET qr_code_path = ? WHERE id = ?', [qrPath, patientResult.insertId]);

    await conn.commit();
    await logAction(req, { action: 'REGISTER', entity: 'users', entityId: userResult.insertId, details: 'Patient self-registration' });

    const context = await buildUserContext(userResult.insertId);
    const token = signToken(context);
    res.status(201).json({ success: true, message: 'Registration successful.', data: { token, user: context } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// Admin only: create staff/doctor/other role accounts.
exports.createStaff = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, email, password, phone, role, department_id, specialization, qualification, consultation_fee, shift } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'name, email, password and role are required.' });
    }

    const [[roleRow]] = await conn.query('SELECT id FROM roles WHERE name = ?', [role]);
    if (!roleRow) return res.status(400).json({ success: false, message: 'Invalid role.' });

    const [[existing]] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ success: false, message: 'Email already in use.' });

    await conn.beginTransaction();
    const passwordHash = hashPassword(password);
    const [userResult] = await conn.query(
      `INSERT INTO users (name, email, password_hash, phone, role_id) VALUES (?, ?, ?, ?, ?)`,
      [name, email, passwordHash, phone || null, roleRow.id]
    );

    if (role === 'doctor') {
      await conn.query(
        `INSERT INTO doctors (user_id, department_id, specialization, qualification, consultation_fee) VALUES (?, ?, ?, ?, ?)`,
        [userResult.insertId, department_id || null, specialization || null, qualification || null, consultation_fee || 0]
      );
    } else {
      await conn.query(
        `INSERT INTO staff (user_id, role_id, department_id, shift) VALUES (?, ?, ?, ?)`,
        [userResult.insertId, roleRow.id, department_id || null, shift || 'Day']
      );
    }

    await conn.commit();
    await logAction(req, { action: 'CREATE_STAFF', entity: 'users', entityId: userResult.insertId, details: `role=${role}` });
    res.status(201).json({ success: true, message: `${role} account created.`, data: { id: userResult.insertId } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (user.status !== 'active') return res.status(403).json({ success: false, message: 'This account is not active. Contact admin.' });

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const context = await buildUserContext(user.id);
    const token = signToken(context);
    await logAction(req, { action: 'LOGIN', entity: 'users', entityId: user.id });
    res.json({ success: true, message: 'Login successful.', data: { token, user: context } });
  } catch (err) { next(err); }
};

exports.me = async (req, res, next) => {
  try {
    const context = await buildUserContext(req.user.id);
    res.json({ success: true, data: context });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Both current and new password are required.' });

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    const newHash = hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
    await logAction(req, { action: 'CHANGE_PASSWORD', entity: 'users', entityId: req.user.id });
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) { next(err); }
};
