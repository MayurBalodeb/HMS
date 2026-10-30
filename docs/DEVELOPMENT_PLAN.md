# Step-by-Step Development Plan (used to build this capstone)

**Phase 0 — Planning (this doc set)**
Architecture, tech stack, ER diagram, role-permission matrix, API contract, folder structure — all fixed *before* coding to avoid rework.

**Phase 1 — Foundation**
1. Init backend (`npm init`, Express, mysql2, dotenv).
2. Write normalized MySQL schema (`schema.sql`) + seed data.
3. DB connection pool (`config/db.js`).
4. JWT auth: register/login, bcrypt hashing, role table.
5. Role middleware (`requireRole([...])`) + audit-log middleware.

**Phase 2 — Core Clinical Flow**
6. Patient registration & profile CRUD + QR code generation on create.
7. Doctor/staff directory.
8. Appointment booking (slot-conflict checked at DB level with unique constraint) + status lifecycle (pending → confirmed → completed/cancelled).
9. Medical records (EMR) + prescriptions linked to a visit.

**Phase 3 — Inpatient Operations**
10. Rooms & beds with live status (Socket.IO broadcast on change).
11. Admissions (link patient ↔ bed ↔ doctor) and discharge workflow (auto-frees bed, triggers final invoice draft).
12. Nurse/staff task board (assign/track/complete, priority levels).

**Phase 4 — Support Departments**
13. Pharmacy: inventory CRUD + low-stock threshold, point-of-sale billing that decrements stock transactionally.
14. Lab: test catalog, request lifecycle (ordered → sample collected → in-progress → completed), report upload (secure file storage).
15. Blood bank: inventory by blood group, donor registry, request/fulfil workflow with unit-count validation.
16. Emergency: case intake, ambulance fleet status, doctor assignment.

**Phase 5 — Money & Compliance**
17. Insurance claim submission/tracking tied to admissions.
18. Billing: invoice generation (auto-aggregates room charges + pharmacy + lab + consultation), invoice items, payments (mock gateway interface — pluggable for Razorpay/Stripe later), partial-payment support.
19. Audit logs wired into every mutating controller.

**Phase 6 — Cross-cutting Features**
20. Notifications (DB table + Socket.IO push) — appointment reminders, low stock, task assigned, discharge ready.
21. Document management — secure multer upload (type + size limits, filename sanitization, stored outside web root, auth-checked download).
22. AI decision-support module — explainable rule engine over vitals/symptoms → warning flags only, never a diagnosis; logged to `ai_suggestions` for clinician review.

**Phase 7 — Analytics & Polish**
23. Analytics dashboards (Chart.js): bed occupancy %, revenue trend, appointments/day, low-stock alerts, department load.
24. Frontend: shared shell (`dashboard.html`) with role-driven sidebar, generic list/create/edit table renderer to cover all CRUD modules consistently, light/clean CSS (no heavy framework — fast to theme for a hospital's branding).
25. Security pass: helmet, CORS allow-list, rate limiting on `/auth`, input validation everywhere, parameterized queries only, JWT expiry + refresh flow, file-type/size guards.
26. Manual QA pass against the role-permission matrix (each role tested for allowed/forbidden actions).

**Phase 8 — Handover**
27. README with local run instructions (no Docker), seed logins, and a "Next Steps for Production" checklist (HTTPS, managed MySQL, real SMS/email/payment provider keys, log aggregation, backups).
