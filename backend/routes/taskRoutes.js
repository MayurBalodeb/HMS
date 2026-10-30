const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/taskController');

router.get('/', auth, ctrl.getAll);
router.post('/', auth, requireRole(['admin', 'doctor', 'receptionist', 'nurse']), ctrl.create);
router.put('/:id', auth, ctrl.update);

module.exports = router;
