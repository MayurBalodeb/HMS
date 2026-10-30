const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/emergencyController');

router.get('/ambulances', auth, ctrl.getAmbulances);
router.post('/ambulances', auth, requireRole(['emergency_staff', 'admin']), ctrl.createAmbulance);
router.put('/ambulances/:id', auth, requireRole(['emergency_staff', 'admin']), ctrl.updateAmbulance);

router.get('/cases', auth, ctrl.getCases);
router.post('/cases', auth, requireRole(['emergency_staff', 'receptionist', 'admin']), ctrl.createCase);
router.put('/cases/:id', auth, requireRole(['emergency_staff', 'doctor', 'admin']), ctrl.updateCase);

module.exports = router;
