const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/doctorController');

router.get('/', auth, ctrl.getAll);
router.get('/:id', auth, ctrl.getOne);
router.put('/:id', auth, requireRole(['admin', 'doctor']), ctrl.update);
router.delete('/:id', auth, requireRole(['admin']), ctrl.remove);

module.exports = router;
