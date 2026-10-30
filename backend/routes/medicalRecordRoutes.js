const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/medicalRecordController');

router.get('/prescriptions/queue', auth, requireRole(['pharmacist', 'accountant', 'admin', 'doctor']), ctrl.getPrescriptionQueue);
router.put('/prescriptions/:id/status', auth, requireRole(['pharmacist', 'accountant', 'admin']), ctrl.updatePrescriptionStatus);
router.get('/patient/:id', auth, requireRole(['admin', 'doctor', 'nurse', 'patient', 'pharmacist', 'accountant']), ctrl.getByPatient);
router.post('/', auth, requireRole(['doctor']), ctrl.create);
router.put('/:id', auth, requireRole(['doctor', 'admin']), ctrl.update);
router.post('/:id/prescriptions', auth, requireRole(['doctor']), ctrl.addPrescription);

module.exports = router;

