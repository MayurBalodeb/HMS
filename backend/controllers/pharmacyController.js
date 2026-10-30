const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

exports.getInventory = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pharmacy_inventory ORDER BY medicine_name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createInventory = async (req, res, next) => {
  try {
    const { medicine_name, category, batch_no, expiry_date, quantity, unit_price, reorder_level } = req.body;
    if (!medicine_name) return res.status(400).json({ success: false, message: 'medicine_name is required.' });
    const [result] = await pool.query(
      `INSERT INTO pharmacy_inventory (medicine_name, category, batch_no, expiry_date, quantity, unit_price, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [medicine_name, category || null, batch_no || null, expiry_date || null, quantity || 0, unit_price || 0, reorder_level || 10]
    );
    await logAction(req, { action: 'CREATE', entity: 'pharmacy_inventory', entityId: result.insertId });
    res.status(201).json({ success: true, message: 'Medicine added to inventory.', data: { id: result.insertId } });
  } catch (err) { next(err); }
};

exports.updateInventory = async (req, res, next) => {
  try {
    const fields = ['medicine_name', 'category', 'batch_no', 'expiry_date', 'quantity', 'unit_price', 'reorder_level'];
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ success: false, message: 'No valid fields provided.' });
    const setClause = updates.map((f) => `${f} = ?`).join(', ');
    await pool.query(`UPDATE pharmacy_inventory SET ${setClause} WHERE id = ?`, [...updates.map((f) => req.body[f]), req.params.id]);
    await logAction(req, { action: 'UPDATE', entity: 'pharmacy_inventory', entityId: req.params.id });
    res.json({ success: true, message: 'Inventory updated.' });
  } catch (err) { next(err); }
};

exports.deleteInventory = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pharmacy_inventory WHERE id = ?', [req.params.id]);
    await logAction(req, { action: 'DELETE', entity: 'pharmacy_inventory', entityId: req.params.id });
    res.json({ success: true, message: 'Item removed.' });
  } catch (err) { next(err); }
};

// items: [{ inventory_id, quantity }]
exports.createSale = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { patient_id, items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'At least one item is required.' });

    await conn.beginTransaction();
    let total = 0;
    const lineDetails = [];

    for (const item of items) {
      const [[stock]] = await conn.query('SELECT * FROM pharmacy_inventory WHERE id = ? FOR UPDATE', [item.inventory_id]);
      if (!stock) throw Object.assign(new Error('Medicine not found.'), { status: 404 });
      if (stock.quantity < item.quantity) {
        throw Object.assign(new Error(`Insufficient stock for ${stock.medicine_name}. Available: ${stock.quantity}.`), { status: 409, publicMessage: `Insufficient stock for ${stock.medicine_name}. Available: ${stock.quantity}.` });
      }
      const lineTotal = stock.unit_price * item.quantity;
      total += lineTotal;
      lineDetails.push({ inventory_id: stock.id, quantity: item.quantity, price: stock.unit_price, name: stock.medicine_name, remaining: stock.quantity - item.quantity, reorder: stock.reorder_level });
      await conn.query('UPDATE pharmacy_inventory SET quantity = quantity - ? WHERE id = ?', [item.quantity, stock.id]);
    }

    const [saleResult] = await conn.query(
      `INSERT INTO pharmacy_sales (patient_id, pharmacist_id, total_amount) VALUES (?, ?, ?)`,
      [patient_id || null, req.user.id, total]
    );
    for (const line of lineDetails) {
      await conn.query(
        `INSERT INTO pharmacy_sale_items (sale_id, inventory_id, quantity, price) VALUES (?, ?, ?, ?)`,
        [saleResult.insertId, line.inventory_id, line.quantity, line.price]
      );
    }

    // If sale is tied to a patient, add it to their invoice too
    if (patient_id) {
      let [[invoice]] = await conn.query(
        `SELECT id FROM invoices WHERE patient_id = ? AND status != 'paid' ORDER BY created_at DESC LIMIT 1`,
        [patient_id]
      );
      let invoiceId;
      if (!invoice) {
        const [inv] = await conn.query('INSERT INTO invoices (patient_id) VALUES (?)', [patient_id]);
        invoiceId = inv.insertId;
      } else invoiceId = invoice.id;
      await conn.query(
        `INSERT INTO invoice_items (invoice_id, description, amount) VALUES (?, ?, ?)`,
        [invoiceId, `Pharmacy sale #${saleResult.insertId}`, total]
      );
      await conn.query('UPDATE invoices SET total_amount = total_amount + ? WHERE id = ?', [total, invoiceId]);
    }

    await conn.commit();

    for (const line of lineDetails) {
      if (line.remaining <= line.reorder) {
        const [admins] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='admin'`);
        for (const a of admins) {
          await notifyUser(a.id, { title: 'Low stock alert', message: `${line.name} is low on stock (${line.remaining} left).`, type: 'inventory' });
        }
      }
    }

    await logAction(req, { action: 'CREATE', entity: 'pharmacy_sales', entityId: saleResult.insertId, details: `total=${total}` });
    res.status(201).json({ success: true, message: 'Sale completed.', data: { id: saleResult.insertId, total } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.getSales = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.*, pu.name AS patient_name, u.name AS pharmacist_name
       FROM pharmacy_sales ps
       LEFT JOIN patients p ON ps.patient_id = p.id LEFT JOIN users pu ON p.user_id = pu.id
       JOIN users u ON ps.pharmacist_id = u.id
       ORDER BY ps.sale_date DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};
