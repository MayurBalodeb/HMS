const pool = require('../config/db');

exports.overview = async (req, res, next) => {
  try {
    const [[patients]] = await pool.query('SELECT COUNT(*) AS count FROM patients');
    const [[doctors]] = await pool.query('SELECT COUNT(*) AS count FROM doctors');
    const [[appointmentsToday]] = await pool.query('SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = CURDATE()');
    const [[admittedNow]] = await pool.query(`SELECT COUNT(*) AS count FROM admissions WHERE status = 'admitted'`);
    const [[bedsTotal]] = await pool.query('SELECT COUNT(*) AS count FROM beds');
    const [[bedsOccupied]] = await pool.query(`SELECT COUNT(*) AS count FROM beds WHERE status = 'occupied'`);
    const [[revenueTotal]] = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'success'`);
    const [[pendingLab]] = await pool.query(`SELECT COUNT(*) AS count FROM lab_requests WHERE status IN ('requested','sample_collected','in_progress')`);
    const [[openEmergency]] = await pool.query(`SELECT COUNT(*) AS count FROM emergency_cases WHERE status != 'closed'`);

    res.json({
      success: true,
      data: {
        totalPatients: patients.count,
        totalDoctors: doctors.count,
        appointmentsToday: appointmentsToday.count,
        currentlyAdmitted: admittedNow.count,
        bedOccupancyRate: bedsTotal.count ? Math.round((bedsOccupied.count / bedsTotal.count) * 100) : 0,
        totalRevenue: revenueTotal.total,
        pendingLabRequests: pendingLab.count,
        openEmergencyCases: openEmergency.count
      }
    });
  } catch (err) { next(err); }
};

exports.occupancy = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.type AS room_type, b.status, COUNT(*) AS count FROM beds b JOIN rooms r ON b.room_id = r.id
       GROUP BY r.type, b.status`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.revenue = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE(payment_date) AS date, SUM(amount) AS total FROM payments
       WHERE status = 'success' AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(payment_date) ORDER BY date`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.inventoryAlerts = async (req, res, next) => {
  try {
    const [lowStock] = await pool.query(
      `SELECT medicine_name, quantity, reorder_level FROM pharmacy_inventory WHERE quantity <= reorder_level`
    );
    const [lowBlood] = await pool.query(
      `SELECT blood_group, units_available FROM blood_inventory WHERE units_available < 5`
    );
    res.json({ success: true, data: { lowStockMedicines: lowStock, lowBloodUnits: lowBlood } });
  } catch (err) { next(err); }
};

exports.appointmentsTrend = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT appointment_date AS date, COUNT(*) AS count FROM appointments
       WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
       GROUP BY appointment_date ORDER BY appointment_date`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};
