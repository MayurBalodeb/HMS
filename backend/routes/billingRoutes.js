const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/billingController');

router.get('/invoices', auth, ctrl.getInvoices);
router.get('/invoices/:id', auth, ctrl.getInvoiceById);
router.post('/invoices', auth, requireRole(['accountant', 'receptionist', 'pharmacist']), ctrl.createInvoice);
router.post('/invoices/:id/items', auth, requireRole(['accountant', 'pharmacist', 'receptionist']), ctrl.addInvoiceItem);
router.get('/patient/:patientId/prescriptions', auth, requireRole(['pharmacist', 'accountant', 'doctor']), ctrl.getPatientPendingPrescriptions);
router.get('/patient/:patientId/lab-tests', auth, requireRole(['receptionist', 'accountant', 'doctor', 'lab_staff']), ctrl.getPatientPendingLabTests);

router.post('/payments', auth, requireRole(['accountant', 'receptionist', 'pharmacist']), ctrl.createPayment);
router.get('/payments/:invoiceId', auth, ctrl.getPaymentsByInvoice);

module.exports = router;

