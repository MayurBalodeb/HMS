const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/aiController');

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

router.post('/chat', optionalAuth, ctrl.chatAssistant);
router.post('/triage-suggestion', auth, requireRole(['doctor', 'nurse', 'admin']), ctrl.triageSuggestion);
router.get('/history', auth, requireRole(['admin', 'doctor']), ctrl.getHistory);

module.exports = router;
