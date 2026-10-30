const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const QR_DIR = path.join(__dirname, '..', 'uploads', 'qrcodes');
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });

/**
 * Generates a QR code PNG encoding a compact patient-identification payload.
 * Returns the relative file path (to store in DB) e.g. "qrcodes/patient_12.png".
 */
async function generatePatientQR(patientId, meta = {}) {
  const payload = JSON.stringify({ type: 'HMS_PATIENT', patientId, ...meta });
  const filename = `patient_${patientId}.png`;
  const filePath = path.join(QR_DIR, filename);
  await QRCode.toFile(filePath, payload, { width: 300, margin: 2 });
  return `qrcodes/${filename}`;
}

module.exports = { generatePatientQR };
