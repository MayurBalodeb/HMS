const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/bedController');

const VIEW_ROLES = ['admin', 'nurse', 'receptionist', 'doctor', 'emergency_staff'];

router.get('/rooms', auth, requireRole(VIEW_ROLES), ctrl.getRooms);
router.post('/rooms', auth, requireRole(['admin']), ctrl.createRoom);

router.get('/', auth, requireRole(VIEW_ROLES), ctrl.getBeds);
router.post('/', auth, requireRole(['admin']), ctrl.createBed);
router.put('/:id/status', auth, requireRole(['admin', 'nurse', 'receptionist']), ctrl.updateBedStatus);

router.get('/admissions/all', auth, requireRole([...VIEW_ROLES, 'patient']), ctrl.getAdmissions);
router.post('/admissions', auth, requireRole(['admin', 'receptionist', 'emergency_staff']), ctrl.admitPatient);
router.put('/admissions/:id/discharge', auth, requireRole(['admin', 'doctor']), ctrl.dischargePatient);

module.exports = router;
