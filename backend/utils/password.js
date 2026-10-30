/**
 * Password hashing using Node's built-in crypto (scrypt) — no external
 * native/npm dependency required. Format stored in DB: "salt:hash" (hex).
 * scrypt is a memory-hard KDF (recommended by OWASP as a bcrypt alternative).
 */
const crypto = require('crypto');

const KEY_LEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const hashBuffer = Buffer.from(hashHex, 'hex');
  const testBuffer = crypto.scryptSync(plain, salt, KEY_LEN);
  if (hashBuffer.length !== testBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, testBuffer);
}

module.exports = { hashPassword, verifyPassword };
