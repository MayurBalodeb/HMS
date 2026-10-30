const pool = require('../config/db');

/** Recomputes invoice totals from line items, categories, and updates paid/status. */
async function recalculateInvoice(invoiceId) {
  const [items] = await pool.query(
    `SELECT description, amount, category FROM invoice_items WHERE invoice_id = ?`,
    [invoiceId]
  );
  
  let hospitalTotal = 0;
  let pharmacyTotal = 0;
  
  for (const it of items) {
    const amt = Number(it.amount) || 0;
    if (it.category === 'pharmacy') {
      pharmacyTotal += amt;
    } else {
      hospitalTotal += amt;
    }
  }

  const [[inv]] = await pool.query(
    `SELECT discount, tax FROM invoices WHERE id = ?`,
    [invoiceId]
  );
  const discount = Number(inv?.discount) || 0;
  const tax = Number(inv?.tax) || 0;
  const total = Math.max(0, (hospitalTotal + pharmacyTotal - discount + tax));

  const [[{ paid }]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND status = 'success'`,
    [invoiceId]
  );

  const rawPaid = Number(paid) || 0;
  const cappedPaid = total > 0 ? Math.min(total, rawPaid) : rawPaid;

  let status = 'unpaid';
  if (rawPaid >= total && total > 0) status = 'paid';
  else if (rawPaid > 0) status = 'partial';

  await pool.query(
    `UPDATE invoices 
     SET hospital_total = ?, pharmacy_total = ?, total_amount = ?, paid_amount = ?, status = ? 
     WHERE id = ?`,
    [hospitalTotal, pharmacyTotal, total, cappedPaid, status, invoiceId]
  );

  return { total, paid: cappedPaid, status, hospitalTotal, pharmacyTotal };
}

module.exports = { recalculateInvoice };

