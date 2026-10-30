const pool = require('../config/db');
const crypto = require('crypto');
const { logAction } = require('../middleware/auditLogger');
const { recalculateInvoice } = require('../utils/invoiceHelper');
const { notifyUser } = require('../utils/notifier');

// List invoices with strict role-based access segregation
exports.getInvoices = async (req, res, next) => {
  try {
    let sql = `SELECT i.*, 
                      pu.name AS patient_name, pu.email AS patient_email, pu.phone AS patient_phone,
                      p.blood_group, p.gender
               FROM invoices i
               JOIN patients p ON i.patient_id = p.id 
               JOIN users pu ON p.user_id = pu.id`;
    const params = [];
    const conditions = [];

    // STRICT RBAC SEGREGATION:
    // - Pharmacist: sees ONLY Pharmacy bills
    // - Receptionist: sees ONLY Hospital Healthcare bills
    // - Accountant: sees Master financial ledger (all bills / totals)
    // - Patient: sees only their own bills
    // - Admin & others: strictly barred from cashier operations
    if (req.user.role === 'pharmacist') {
      conditions.push("i.bill_type = 'pharmacy'");
    } else if (req.user.role === 'receptionist') {
      conditions.push("i.bill_type = 'hospital'");
    } else if (req.user.role === 'patient') {
      conditions.push('i.patient_id = ?');
      params.push(req.user.patientId);
    } else if (req.user.role === 'accountant') {
      if (req.query.bill_type) {
        conditions.push('i.bill_type = ?');
        params.push(req.query.bill_type);
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Direct billing records are restricted to Billing, Pharmacy, and Reception desks.'
      });
    }

    if (req.query.status) {
      conditions.push('i.status = ?');
      params.push(req.query.status);
    }
    if (req.query.patient_id) {
      conditions.push('i.patient_id = ?');
      params.push(req.query.patient_id);
    }

    if (conditions.length) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY i.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// Get single invoice with itemized breakdown
exports.getInvoiceById = async (req, res, next) => {
  try {
    const [[invoice]] = await pool.query(
      `SELECT i.*, 
              pu.name AS patient_name, pu.email AS patient_email, pu.phone AS patient_phone,
              p.dob, p.gender, p.blood_group, p.address,
              a.admit_date, a.discharge_date, a.reason AS admission_reason,
              r.room_no, b.bed_no
       FROM invoices i
       JOIN patients p ON i.patient_id = p.id 
       JOIN users pu ON p.user_id = pu.id
       LEFT JOIN admissions a ON i.admission_id = a.id
       LEFT JOIN beds b ON a.bed_id = b.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE i.id = ?`,
      [req.params.id]
    );

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

    // Strict Role Boundaries
    if (req.user.role === 'patient' && String(req.user.patientId) !== String(invoice.patient_id)) {
      return res.status(403).json({ success: false, message: 'You may only view your own invoices.' });
    }
    if (req.user.role === 'pharmacist' && invoice.bill_type !== 'pharmacy') {
      return res.status(403).json({ success: false, message: 'Access denied. Pharmacists may only view pharmacy invoices.' });
    }
    if (req.user.role === 'receptionist' && invoice.bill_type !== 'hospital') {
      return res.status(403).json({ success: false, message: 'Access denied. Reception desk may only view hospital service invoices.' });
    }
    if (!['accountant', 'pharmacist', 'receptionist', 'patient'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Unauthorized role.' });
    }

    const [items] = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY category, id',
      [req.params.id]
    );
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC',
      [req.params.id]
    );

    const hospitalItems = items.filter(it => it.category !== 'pharmacy');
    const pharmacyItems = items.filter(it => it.category === 'pharmacy');

    res.json({
      success: true,
      data: {
        ...invoice,
        items,
        hospitalItems,
        pharmacyItems,
        payments
      }
    });
  } catch (err) { next(err); }
};

// Create Invoice: Enforce strict role-based creation (Pharmacist -> Pharmacy, Receptionist -> Hospital, Accountant -> Master/Any)
exports.createInvoice = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      patient_id,
      admission_id,
      bill_type = 'unified',
      hospital_items = [],
      pharmacy_items = [],
      items = [], // fallback support for older payload
      discount = 0,
      tax = 0,
      payment_method = 'cash',
      paid_amount = 0,
      notes = ''
    } = req.body;

    if (!patient_id) {
      return res.status(400).json({ success: false, message: 'patient_id is required.' });
    }

    let finalBillType = bill_type;
    if (req.user.role === 'pharmacist') {
      if (hospital_items && hospital_items.length > 0) {
        return res.status(403).json({ success: false, message: 'Pharmacists cannot issue hospital service charges.' });
      }
      finalBillType = 'pharmacy';
    } else if (req.user.role === 'receptionist') {
      if (pharmacy_items && pharmacy_items.length > 0) {
        return res.status(403).json({ success: false, message: 'Reception desk cannot issue pharmacy medicine bills. Please refer to Pharmacy.' });
      }
      finalBillType = 'hospital';
    } else if (req.user.role === 'accountant') {
      finalBillType = bill_type || 'unified';
    } else {
      return res.status(403).json({ success: false, message: 'Access denied. Only Billing, Pharmacy, and Reception desks can issue invoices.' });
    }

    await conn.beginTransaction();

    // 1. Insert main invoice record
    const [invResult] = await conn.query(
      `INSERT INTO invoices 
       (patient_id, admission_id, bill_type, discount, tax, payment_method, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patient_id, admission_id || null, finalBillType, Number(discount) || 0, Number(tax) || 0, payment_method || 'cash', notes || null]
    );
    const invoiceId = invResult.insertId;

    let hospitalSubtotal = 0;
    let pharmacySubtotal = 0;

    // 2. Insert Hospital Items (Consultations, Room/Bed, Lab, Nursing, Procedures)
    for (const item of hospital_items) {
      const amount = Number(item.amount) || (Number(item.quantity || 1) * Number(item.unit_price || 0));
      hospitalSubtotal += amount;
      await conn.query(
        `INSERT INTO invoice_items (invoice_id, description, amount, category, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.description, amount, item.category || 'hospital', Number(item.quantity) || 1, Number(item.unit_price) || amount]
      );
    }

    // 3. Insert Pharmacy / Medical Items (Prescriptions, Medicines, Supplies)
    const dispensedPrescriptionIds = [];
    for (const med of pharmacy_items) {
      const qty = Number(med.quantity) || 1;
      const unitPrice = Number(med.unit_price) || 0;
      const amount = Number(med.amount) || (qty * unitPrice);
      pharmacySubtotal += amount;

      await conn.query(
        `INSERT INTO invoice_items (invoice_id, description, amount, category, quantity, unit_price)
         VALUES (?, ?, ?, 'pharmacy', ?, ?)`,
        [invoiceId, med.medicine_name || med.description, amount, qty, unitPrice]
      );

      // If tied to inventory, deduct stock safely
      if (med.inventory_id) {
        const [[stock]] = await conn.query('SELECT quantity, medicine_name FROM pharmacy_inventory WHERE id = ? FOR UPDATE', [med.inventory_id]);
        if (stock) {
          const newQty = Math.max(0, stock.quantity - qty);
          await conn.query('UPDATE pharmacy_inventory SET quantity = ? WHERE id = ?', [newQty, med.inventory_id]);
        }
      }

      if (med.prescription_id) {
        dispensedPrescriptionIds.push(med.prescription_id);
      }
    }

    // Support legacy generic items array if passed
    for (const gen of items) {
      const amt = Number(gen.amount) || 0;
      const cat = gen.category || 'hospital';
      if (cat === 'pharmacy') pharmacySubtotal += amt;
      else hospitalSubtotal += amt;
      await conn.query(
        `INSERT INTO invoice_items (invoice_id, description, amount, category, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, gen.description, amt, cat, Number(gen.quantity) || 1, Number(gen.unit_price) || amt]
      );
    }

    // Mark fulfilled prescriptions as dispensed
    if (dispensedPrescriptionIds.length > 0) {
      await conn.query(
        `UPDATE prescriptions SET status = 'dispensed' WHERE id IN (?)`,
        [dispensedPrescriptionIds]
      );
    }

    // 4. Calculate final grand total
    const numDiscount = Number(discount) || 0;
    const numTax = Number(tax) || 0;
    const grandTotal = Math.max(0, (hospitalSubtotal + pharmacySubtotal - numDiscount + numTax));

    // 5. Handle initial payment if paid at counter
    const numPaid = Number(paid_amount) || 0;
    let status = 'unpaid';
    if (numPaid >= grandTotal && grandTotal > 0) status = 'paid';
    else if (numPaid > 0) status = 'partial';

    if (numPaid > 0) {
      await conn.query(
        `INSERT INTO payments (invoice_id, amount, method, status) VALUES (?, ?, ?, 'success')`,
        [invoiceId, numPaid, payment_method || 'cash']
      );
    }

    await conn.query(
      `UPDATE invoices 
       SET hospital_total = ?, pharmacy_total = ?, total_amount = ?, paid_amount = ?, status = ?
       WHERE id = ?`,
      [hospitalSubtotal, pharmacySubtotal, grandTotal, numPaid, status, invoiceId]
    );

    await conn.commit();

    await logAction(req, {
      action: 'CREATE',
      entity: 'invoices',
      entityId: invoiceId,
      details: `Unified Bill: Hospital ₹${hospitalSubtotal}, Pharmacy ₹${pharmacySubtotal}, Total ₹${grandTotal}`
    });

    res.status(201).json({
      success: true,
      message: 'Unified invoice generated successfully.',
      data: {
        id: invoiceId,
        hospital_total: hospitalSubtotal,
        pharmacy_total: pharmacySubtotal,
        total_amount: grandTotal,
        paid_amount: numPaid,
        status
      }
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// Add line item to existing invoice
exports.addInvoiceItem = async (req, res, next) => {
  try {
    const { description, amount, category = 'hospital', quantity = 1, unit_price } = req.body;
    if (!description || amount === undefined) {
      return res.status(400).json({ success: false, message: 'description and amount are required.' });
    }
    await pool.query(
      `INSERT INTO invoice_items (invoice_id, description, amount, category, quantity, unit_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, description, amount, category, quantity, unit_price || amount]
    );
    const totals = await recalculateInvoice(req.params.id);
    await logAction(req, { action: 'UPDATE', entity: 'invoices', entityId: req.params.id, details: `added item ${description}` });
    res.json({ success: true, message: 'Item added to invoice.', data: totals });
  } catch (err) { next(err); }
};

// Fetch pending prescriptions for a patient to auto-populate into Unified Bill
exports.getPatientPendingPrescriptions = async (req, res, next) => {
  try {
    const patientId = req.params.patientId;
    const [prescriptions] = await pool.query(
      `SELECT pr.id AS prescription_id, pr.medicine_name, pr.dosage, pr.duration, pr.instructions, pr.frequency, pr.timing, pr.created_at,
              mr.id AS medical_record_id, mr.visit_date, mr.diagnosis,
              du.name AS doctor_name,
              inv.id AS inventory_id, inv.unit_price, inv.quantity AS stock_available, inv.batch_no
       FROM prescriptions pr
       JOIN medical_records mr ON pr.medical_record_id = mr.id
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN users du ON d.user_id = du.id
       LEFT JOIN pharmacy_inventory inv ON LOWER(TRIM(inv.medicine_name)) = LOWER(TRIM(pr.medicine_name))
       WHERE mr.patient_id = ? AND (pr.status IS NULL OR pr.status != 'dispensed')
       ORDER BY pr.created_at DESC`,
      [patientId]
    );
    res.json({ success: true, data: prescriptions });
  } catch (err) { next(err); }
};

// Fetch doctor-ordered lab tests for a patient to auto-populate into Hospital Bill
exports.getPatientPendingLabTests = async (req, res, next) => {
  try {
    const patientId = req.params.patientId;
    const [labRequests] = await pool.query(
      `SELECT lr.id AS request_id, lr.requested_at, lr.status,
              lt.id AS test_id, lt.name AS test_name, lt.category, lt.price,
              du.name AS doctor_name
       FROM lab_requests lr
       JOIN lab_tests lt ON lr.test_id = lt.id
       LEFT JOIN doctors d ON lr.doctor_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       WHERE lr.patient_id = ?
       ORDER BY lr.requested_at DESC`,
      [patientId]
    );
    res.json({ success: true, data: labRequests });
  } catch (err) { next(err); }
};

function mockGatewayCharge(amount, method) {
  return {
    success: true,
    transaction_id: `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    method,
    amount
  };
}

// Record payment towards an invoice
exports.createPayment = async (req, res, next) => {
  try {
    const { invoice_id, amount, method } = req.body;
    if (!invoice_id || !amount) return res.status(400).json({ success: false, message: 'invoice_id and amount are required.' });

    const [[invoice]] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invoice_id]);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

    const currentDue = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));
    if (currentDue <= 0 || invoice.status === 'paid') {
      return res.status(400).json({ success: false, message: 'This invoice is already fully settled. Outstanding balance is ₹0.00.' });
    }
    const payAmt = Number(amount);
    if (payAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }
    if (payAmt > currentDue + 0.01) {
      return res.status(400).json({ success: false, message: `Payment amount (₹${payAmt.toFixed(2)}) exceeds outstanding balance of ₹${currentDue.toFixed(2)}.` });
    }

    if (req.user.role === 'patient') {
      return res.status(403).json({ success: false, message: 'Access denied. Patients cannot record payments directly. Please settle fees at the Reception or Cashier desk.' });
    }
    if (req.user.role === 'pharmacist' && invoice.bill_type !== 'pharmacy') {
      return res.status(403).json({ success: false, message: 'Pharmacists can only collect payments for pharmacy invoices.' });
    }
    if (req.user.role === 'receptionist' && invoice.bill_type !== 'hospital') {
      return res.status(403).json({ success: false, message: 'Reception desk can only collect payments for hospital invoices.' });
    }
    if (!['accountant', 'pharmacist', 'receptionist'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Only Reception, Pharmacy, or Accounting counter can record payments.' });
    }

    const gatewayResult = method === 'online' ? mockGatewayCharge(amount, method) : { success: true, transaction_id: null };

    const [result] = await pool.query(
      `INSERT INTO payments (invoice_id, amount, method, transaction_id, status) VALUES (?, ?, ?, ?, 'success')`,
      [invoice_id, amount, method || 'cash', gatewayResult.transaction_id]
    );
    const totals = await recalculateInvoice(invoice_id);

    await notifyUser(req.user.id, {
      title: 'Payment received',
      message: `Payment of ₹${amount} recorded for invoice #${invoice_id}.`,
      type: 'billing'
    });
    await logAction(req, {
      action: 'CREATE',
      entity: 'payments',
      entityId: result.insertId,
      details: `amount=${amount}, method=${method}`
    });

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully.',
      data: { id: result.insertId, transaction_id: gatewayResult.transaction_id, ...totals }
    });
  } catch (err) { next(err); }
};

exports.getPaymentsByInvoice = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC', [req.params.invoiceId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

