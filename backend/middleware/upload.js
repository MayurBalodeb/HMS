const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const ALLOWED_MIME = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function makeStorage(subfolder) {
  const dir = path.join(__dirname, '..', 'uploads', subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const safeExt = path.extname(file.originalname).toLowerCase();
      const randomName = crypto.randomBytes(16).toString('hex');
      cb(null, `${Date.now()}_${randomName}${safeExt}`);
    }
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('Unsupported file type. Allowed: PDF, JPG, PNG, DOC/DOCX.'));
  }
  cb(null, true);
}

function uploadFactory(subfolder) {
  return multer({
    storage: makeStorage(subfolder),
    limits: { fileSize: MAX_SIZE },
    fileFilter
  });
}

module.exports = { uploadFactory };
