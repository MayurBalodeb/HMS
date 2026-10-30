# 🏥 Hospital Management System (HMS) — Full-Stack Capstone Project

A modular, role-based, production-style Hospital Management System.
Backend: **Node.js + Express + MySQL**. Frontend: **HTML/CSS/JavaScript (vanilla, no build step)**.
No Docker required — runs directly in VS Code with Node.js and MySQL installed locally.

---

## 1. Tech Stack (Recommended & Used)

| Layer | Technology | Why |
|---|---|---|
| Backend runtime | Node.js (v18+) + Express.js | Lightweight, huge ecosystem, easy to run without Docker |
| Database | MySQL 8 | Relational, ACID, normalized schema, widely available (XAMPP/WAMP/native) |
| DB Driver | mysql2 (with connection pooling, promises) | Fast, prepared statements (SQL-injection safe) |
| Auth | JWT (jsonwebtoken) + scrypt (Node built-in `crypto`) | Stateless, scalable, secure password hashing with zero native/npm crypto dependency |
| Real-time | Socket.IO | Live bed status, notifications, task updates |
| File uploads | Multer | Reports, documents, profile photos |
| QR Codes | `qrcode` npm package | Patient ID QR generation |
| Validation | express-validator | Input sanitation/validation on every route |
| Security | helmet, cors, express-rate-limit, bcrypt, JWT | Production-style hardening |
| Frontend | Vanilla HTML/CSS/JS (fetch API) + Chart.js (CDN) | Simple, no build tools, easy for a hospital IT team to maintain, light UI |
| Email/SMS reminders | Nodemailer (stubbed transport, pluggable) | Appointment reminders |
| Payments | Mock Payment Gateway module (pluggable interface for Razorpay/Stripe) | Online payment integration point |

> Everything runs with `npm install` + `npm start`. No containers, no complex bundlers.

---

## 2. System Architecture

```
                        ┌────────────────────────┐
                        │   Frontend (Static)    │
                        │  HTML/CSS/JS (Browser) │
                        │  Role-based Dashboards │
                        └───────────┬────────────┘
                                    │ REST (fetch) + WebSocket
                                    ▼
                        ┌────────────────────────┐
                        │   Express.js API       │
                        │  (backend/server.js)   │
                        │ ┌────────────────────┐ │
                        │ │ Middleware Layer    │ │  auth(JWT) → role-guard → validation → controller
                        │ └────────────────────┘ │
                        │ ┌────────────────────┐ │
                        │ │ Routes (modular)    │ │  /api/patients, /api/appointments, /api/pharmacy ...
                        │ └────────────────────┘ │
                        │ ┌────────────────────┐ │
                        │ │ Controllers         │ │  business logic per module
                        │ └────────────────────┘ │
                        │ ┌────────────────────┐ │
                        │ │ Utils: audit log,   │ │
                        │ │ QR gen, notifier,   │ │
                        │ │ AI decision-support │ │
                        │ └────────────────────┘ │
                        └───────────┬────────────┘
                                    │ mysql2 pool (prepared statements)
                                    ▼
                        ┌────────────────────────┐
                        │   MySQL Database       │
                        │  30 normalized tables  │
                        └────────────────────────┘
```

**Design principles applied:**
- **Modular monolith**: each domain (patients, pharmacy, lab, billing…) is its own route + controller file — easy to later split into microservices.
- **Role-Based Access Control (RBAC)** enforced centrally via middleware, not scattered in UI.
- **Audit logging** middleware records every write action (who/what/when) into `audit_logs`.
- **Every password hashed** with bcrypt; **every query parameterized** (no string-concatenated SQL).
- **Real-time layer** (Socket.IO) pushes bed-status changes, task assignments, and notifications live.
- **AI module is decision-support only**: it returns *suggestions/flags* (e.g. "high fever + low SpO2 → recommend urgent vitals recheck") based on an explainable rule engine over structured vitals/symptoms — it never issues a diagnosis and always requires clinician confirmation. It is isolated in `utils/decisionSupport.js` so it can be swapped for a real ML/LLM service later without touching other modules.

---

## 3. Roles Supported

`admin, doctor, nurse, receptionist, pharmacist, lab_staff, blood_bank, emergency_staff, accountant, patient`

See **docs/ROLE_PERMISSION_MATRIX.md** for the full matrix.

---

## 4. Getting Started (VS Code, no Docker)

### Prerequisites
- Node.js 18+
- MySQL Server 8 running locally (or XAMPP/WAMP MySQL)
- VS Code

### Steps
```bash
# 1. Create the database & schema
mysql -u root -p < backend/database/schema.sql
mysql -u root -p hms_db < backend/database/seed.sql

# 2. Configure environment
cd backend
cp .env.example .env
# edit .env with your MySQL username/password

# 3. Install & run
npm install
npm run dev        # nodemon, auto-restarts
# or
npm start

# Server runs at http://localhost:5000
```

### Frontend
Open `frontend/index.html` — this is now the **public hospital landing page** — with VS Code's "Live Server" extension (or any static server). From there, click **Log In** (goes to `login.html`) or **Register** (goes to `register.html`) to reach the authenticated dashboard. It talks to the API at `http://localhost:5000`. No build step needed.

### Default seeded logins (change immediately in production)
| Role | Email | Password |
|---|---|---|
| Admin | admin@hms.com | Admin@123 |
| Doctor | doctor@hms.com | Doctor@123 |
| Nurse | nurse@hms.com | Nurse@123 |
| Receptionist | reception@hms.com | Reception@123 |
| Pharmacist | pharmacist@hms.com | Pharma@123 |
| Lab Staff | lab@hms.com | Lab@123 |
| Blood Bank | bloodbank@hms.com | Blood@123 |
| Emergency | emergency@hms.com | Emergency@123 |
| Accountant | accountant@hms.com | Account@123 |
| Patient | patient@hms.com | Patient@123 |

---

## 5. Folder Structure

```
hms-project/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ROLE_PERMISSION_MATRIX.md
│   ├── API_DOCUMENTATION.md
│   ├── ER_DIAGRAM.md
│   └── DEVELOPMENT_PLAN.md
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── config/
│   │   └── db.js
│   ├── database/
│   │   ├── schema.sql
│   │   └── seed.sql
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── role.js
│   │   ├── upload.js
│   │   ├── auditLogger.js
│   │   └── errorHandler.js
│   ├── utils/
│   │   ├── qrGenerator.js
│   │   ├── notifier.js
│   │   ├── decisionSupport.js
│   │   └── invoiceHelper.js
│   ├── routes/            (18 route files, one per module)
│   ├── controllers/       (18 controller files, one per module)
│   └── uploads/           (documents, lab_reports, qrcodes)
└── frontend/
    ├── index.html          (public hospital landing page — starting point)
    ├── login.html          (sign-in page, reached via "Log In" on the landing page)
    ├── register.html       (patient self-registration)
    ├── css/
    │   ├── style.css       (shared design system for auth pages + dashboard)
    │   └── landing.css     (landing-page-only styles)
    ├── js/
    │   ├── api.js
    │   ├── auth.js
    │   └── app.js          (generic dashboard/table/form renderer)
    └── pages/
        └── dashboard.html  (shared authenticated shell, role-aware sidebar)
```

---

## 6. Key Modules Implemented

1. Auth & RBAC (JWT, bcrypt, 10 roles)
2. Patient registration & profile management + QR ID card
3. Doctor/staff directory & schedules
4. Appointment booking + reminder queue (email stub, extensible to SMS)
5. Medical history / EMR (diagnosis, prescriptions, attachments)
6. Bed & room management with live occupancy (Socket.IO)
7. Admission & discharge management
8. Nurse/staff task board (assign, track, complete)
9. Pharmacy inventory + point-of-sale billing
10. Lab test requests, sample tracking & report upload
11. Blood bank inventory, donor registry & requests
12. Emergency module + ambulance dispatch tracking
13. Insurance claim submission & tracking
14. Billing, invoicing & online payment (mock gateway, pluggable)
15. Notifications (in-app + Socket.IO push)
16. Document management (secure upload/download, per-patient)
17. AI decision-support (rule-based vitals/symptom triage flags)
18. Analytics dashboards (Chart.js: occupancy, revenue, appointments, inventory alerts)
19. Audit logs (every create/update/delete tracked)

See `docs/DEVELOPMENT_PLAN.md` for the phased build plan used to construct this project.
