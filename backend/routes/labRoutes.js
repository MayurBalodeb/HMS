const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/labController');
const { uploadFactory } = require('../middleware/upload');
const uploadReport = uploadFactory('lab_reports');

router.get('/tests', auth, ctrl.getTests);
router.post('/tests', auth, requireRole(['admin', 'lab_staff']), ctrl.createTest);

router.get('/requests', auth, ctrl.getRequests);
router.post('/requests', auth, requireRole(['doctor', 'receptionist', 'admin', 'emergency_staff']), ctrl.createRequest);
router.put('/requests/:id', auth, requireRole(['lab_staff', 'admin']), ctrl.updateRequestStatus);
router.post('/requests/:id/report', auth, requireRole(['lab_staff']), uploadReport.single('file'), ctrl.uploadReport);
router.get('/requests/:id/report/file', auth, ctrl.downloadReportFile);

router.get('/reports/patient/:id', auth, requireRole(['admin', 'doctor', 'patient', 'lab_staff']), ctrl.getReportsByPatient);

module.exports = router;
