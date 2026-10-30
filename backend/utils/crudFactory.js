const pool = require('../config/db');
const { logAction } = require('../middleware/auditLogger');

/**
 * Generic CRUD generator for straightforward tables (no complex joins/business
 * rules). Complex modules (appointments, billing, admissions...) have their
 * own dedicated controllers instead of using this factory.
 */
function crudFactory({ table, entityName, allowedFields, orderBy = 'id DESC' }) {
  return {
    async getAll(req, res, next) {
      try {
        const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY ${orderBy}`);
        res.json({ success: true, data: rows });
      } catch (err) { next(err); }
    },

    async getOne(req, res, next) {
      try {
        const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: `${entityName} not found.` });
        res.json({ success: true, data: rows[0] });
      } catch (err) { next(err); }
    },

    async create(req, res, next) {
      try {
        const fields = allowedFields.filter((f) => req.body[f] !== undefined);
        if (!fields.length) return res.status(400).json({ success: false, message: 'No valid fields provided.' });
        const values = fields.map((f) => req.body[f]);
        const placeholders = fields.map(() => '?').join(', ');
        const [result] = await pool.query(
          `INSERT INTO \`${table}\` (${fields.map((f) => `\`${f}\``).join(', ')}) VALUES (${placeholders})`,
          values
        );
        await logAction(req, { action: 'CREATE', entity: table, entityId: result.insertId, details: JSON.stringify(req.body) });
        res.status(201).json({ success: true, message: `${entityName} created.`, data: { id: result.insertId } });
      } catch (err) { next(err); }
    },

    async update(req, res, next) {
      try {
        const fields = allowedFields.filter((f) => req.body[f] !== undefined);
        if (!fields.length) return res.status(400).json({ success: false, message: 'No valid fields provided.' });
        const values = fields.map((f) => req.body[f]);
        const setClause = fields.map((f) => `\`${f}\` = ?`).join(', ');
        await pool.query(`UPDATE \`${table}\` SET ${setClause} WHERE id = ?`, [...values, req.params.id]);
        await logAction(req, { action: 'UPDATE', entity: table, entityId: req.params.id, details: JSON.stringify(req.body) });
        res.json({ success: true, message: `${entityName} updated.` });
      } catch (err) { next(err); }
    },

    async remove(req, res, next) {
      try {
        await pool.query(`DELETE FROM \`${table}\` WHERE id = ?`, [req.params.id]);
        await logAction(req, { action: 'DELETE', entity: table, entityId: req.params.id });
        res.json({ success: true, message: `${entityName} deleted.` });
      } catch (err) { next(err); }
    }
  };
}

module.exports = crudFactory;
