const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/notificationController');

router.get('/', auth, ctrl.getMine);
router.put('/:id/read', auth, ctrl.markRead);
router.post('/broadcast', auth, requireRole(['admin']), ctrl.broadcast);

module.exports = router;
