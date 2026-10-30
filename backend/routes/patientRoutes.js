const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/patientController');

const CLINICAL_STAFF = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_staff', 'emergency_staff', 'blood_bank', 'accountant'];

router.get('/', auth, requireRole(CLINICAL_STAFF), ctrl.getAll);
router.get('/:id', auth, requireRole([...CLINICAL_STAFF, 'patient']), ctrl.getOne);
router.get('/:id/qrcode', auth, requireRole([...CLINICAL_STAFF, 'patient']), ctrl.getQrCode);
router.get('/:id/history', auth, requireRole(['admin', 'doctor', 'nurse', 'patient']), ctrl.getHistory);
router.post('/', auth, requireRole(['admin', 'receptionist']), ctrl.create);
router.put('/:id', auth, requireRole(['admin', 'receptionist', 'patient']), ctrl.update);
router.delete('/:id', auth, requireRole(['admin']), ctrl.remove);

module.exports = router;
