const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/insuranceController');

router.get('/providers', auth, ctrl.getProviders);
router.post('/providers', auth, requireRole(['admin', 'accountant']), ctrl.createProvider);

router.get('/claims', auth, ctrl.getClaims);
router.post('/claims', auth, requireRole(['receptionist', 'accountant', 'admin']), ctrl.createClaim);
router.put('/claims/:id', auth, requireRole(['accountant', 'admin']), ctrl.updateClaim);

module.exports = router;
