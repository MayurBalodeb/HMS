const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/analyticsController');

const DASH_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_staff', 'blood_bank', 'emergency_staff', 'accountant'];

router.get('/overview', auth, requireRole(['admin']), ctrl.overview);
router.get('/occupancy', auth, requireRole(['admin', 'nurse', 'receptionist']), ctrl.occupancy);
router.get('/revenue', auth, requireRole(['admin', 'accountant']), ctrl.revenue);
router.get('/inventory-alerts', auth, requireRole(['admin', 'pharmacist', 'blood_bank']), ctrl.inventoryAlerts);
router.get('/appointments-trend', auth, requireRole(DASH_ROLES), ctrl.appointmentsTrend);

module.exports = router;
