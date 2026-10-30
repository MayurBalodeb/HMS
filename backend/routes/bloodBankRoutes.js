const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/bloodBankController');

router.get('/inventory', auth, ctrl.getInventory);
router.put('/inventory/:id', auth, requireRole(['blood_bank', 'admin']), ctrl.updateInventory);

router.get('/donors', auth, requireRole(['blood_bank', 'admin']), ctrl.getDonors);
router.post('/donors', auth, requireRole(['blood_bank', 'admin']), ctrl.createDonor);

router.get('/requests', auth, ctrl.getRequests);
router.post('/requests', auth, requireRole(['doctor', 'receptionist', 'admin', 'emergency_staff']), ctrl.createRequest);
router.put('/requests/:id', auth, requireRole(['blood_bank', 'admin']), ctrl.updateRequest);

module.exports = router;
