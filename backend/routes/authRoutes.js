const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/authController');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/staff/create', auth, requireRole(['admin']), ctrl.createStaff);
router.get('/me', auth, ctrl.me);
router.put('/change-password', auth, ctrl.changePassword);

module.exports = router;
