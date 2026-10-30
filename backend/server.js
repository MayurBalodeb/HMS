require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception caught:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const errorHandler = require('./middleware/errorHandler');
const { attachIO: attachNotifierIO } = require('./utils/notifier');
const { attachIO: attachBedIO } = require('./controllers/bedController');

const app = express();
const server = http.createServer(app);

// ---------------- Security & core middleware ----------------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 2000 });
app.use('/api', apiLimiter);

// ---------------- Socket.IO (real-time updates) ----------------
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // allow anonymous connect for public bed-status board
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(); // invalid token: still allow connection but without user room
  }
});

io.on('connection', (socket) => {
  if (socket.user) {
    socket.join(`user:${socket.user.id}`);
  }
  socket.on('disconnect', () => {});
});

attachNotifierIO(io);
attachBedIO(io);

// Note: uploaded files (QR codes, documents, lab reports) are NOT served via
// express.static — every download goes through an authenticated controller
// route (see patientRoutes, documentRoutes, labRoutes) which checks the
// requester's role/ownership before streaming the file. This avoids exposing
// a predictable public URL for sensitive files.

// ---------------- Routes ----------------
app.get('/api/health', (req, res) => res.json({ success: true, message: 'HMS API is running.', time: new Date() }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/patients', require('./routes/patientRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/staff', require('./routes/staffRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/medical-records', require('./routes/medicalRecordRoutes'));
app.use('/api/beds', require('./routes/bedRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/pharmacy', require('./routes/pharmacyRoutes'));
app.use('/api/lab', require('./routes/labRoutes'));
app.use('/api/bloodbank', require('./routes/bloodBankRoutes'));
app.use('/api/emergency', require('./routes/emergencyRoutes'));
app.use('/api/insurance', require('./routes/insuranceRoutes'));
app.use('/api/billing', require('./routes/billingRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/documents', require('./routes/documentRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));

const path = require('path');

// ---------------- Static Frontend ----------------
app.use(express.static(path.join(__dirname, '../frontend')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🏥  HMS backend running at http://localhost:${PORT}`);
  console.log(`    Frontend accessible directly at http://localhost:${PORT}`);
  console.log(`    Socket.IO live-update channel active on the same port.\n`);
});

module.exports = { app, server, io };

