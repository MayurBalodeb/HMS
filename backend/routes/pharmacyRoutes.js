const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/pharmacyController');

router.get('/inventory', auth, ctrl.getInventory);
router.post('/inventory', auth, requireRole(['pharmacist', 'admin']), ctrl.createInventory);
router.put('/inventory/:id', auth, requireRole(['pharmacist', 'admin']), ctrl.updateInventory);
router.delete('/inventory/:id', auth, requireRole(['pharmacist', 'admin']), ctrl.deleteInventory);

router.get('/sales', auth, requireRole(['pharmacist', 'accountant', 'admin']), ctrl.getSales);
router.post('/sales', auth, requireRole(['pharmacist']), ctrl.createSale);

module.exports = router;
