/**
 * Utility script — run with: npm run hash-passwords
 * Prints password hashes (scrypt, via utils/password.js) for the default
 * seed passwords so you can regenerate database/seed.sql if you change any
 * default password.
 */
const { hashPassword } = require('./password');

const users = [
  ['admin@hms.com', 'Admin@123'],
  ['doctor@hms.com', 'Doctor@123'],
  ['nurse@hms.com', 'Nurse@123'],
  ['reception@hms.com', 'Reception@123'],
  ['pharmacist@hms.com', 'Pharma@123'],
  ['lab@hms.com', 'Lab@123'],
  ['bloodbank@hms.com', 'Blood@123'],
  ['emergency@hms.com', 'Emergency@123'],
  ['accountant@hms.com', 'Account@123'],
  ['patient@hms.com', 'Patient@123']
];

for (const [email, plain] of users) {
  const hash = hashPassword(plain);
  console.log(`${email} | ${plain} | ${hash}`);
}
