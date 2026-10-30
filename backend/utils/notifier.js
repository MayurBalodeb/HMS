const pool = require('../config/db');
let ioInstance = null;

function attachIO(io) {
  ioInstance = io;
}

/**
 * Creates an in-app notification row and pushes it live via Socket.IO
 * to the room named `user:<id>` (each client joins their own room on connect).
 */
async function notifyUser(userId, { title, message, type = 'general' }) {
  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
    [userId, title, message, type]
  );
  const notification = { id: result.insertId, user_id: userId, title, message, type, is_read: 0, created_at: new Date() };

  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit('notification:new', notification);
  }
  return notification;
}

/**
 * Email reminder stub — if SMTP env vars are configured, sends a real email
 * via nodemailer; otherwise just logs (so the whole flow still "works" out
 * of the box without needing real SMTP credentials for a demo/capstone).
 */
async function sendEmailReminder(toEmail, subject, text) {
  if (!process.env.SMTP_HOST) {
    console.log(`📧 [Email stub] To: ${toEmail} | Subject: ${subject} | ${text}`);
    return { stub: true };
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@hms.com',
    to: toEmail,
    subject,
    text
  });
}

module.exports = { attachIO, notifyUser, sendEmailReminder };
