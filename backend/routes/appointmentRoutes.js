const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/appointmentController');

router.get('/', auth, ctrl.getAll);
router.get('/slots', auth, ctrl.getAvailableSlots);
router.post('/', auth, requireRole(['patient', 'receptionist', 'admin']), ctrl.create);
router.put('/:id', auth, requireRole(['patient', 'doctor', 'receptionist', 'admin']), ctrl.update);
router.delete('/:id', auth, requireRole(['admin', 'receptionist']), ctrl.remove);

module.exports = router;
