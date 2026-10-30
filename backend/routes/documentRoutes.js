const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/documentController');
const { uploadFactory } = require('../middleware/upload');
const uploadDoc = uploadFactory('documents');

router.get('/patient/:id', auth, requireRole(['admin', 'doctor', 'nurse', 'receptionist', 'lab_staff', 'patient']), ctrl.getByPatient);
router.post('/', auth, uploadDoc.single('file'), ctrl.upload);
router.get('/:id/download', auth, ctrl.download);
router.delete('/:id', auth, requireRole(['admin', 'doctor', 'receptionist']), ctrl.remove);

module.exports = router;
