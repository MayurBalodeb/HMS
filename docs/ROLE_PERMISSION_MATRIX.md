# Role–Permission Matrix

Legend: **C**reate, **R**ead, **U**pdate, **D**elete, **-** none. Enforced server-side in `middleware/role.js` on every route (frontend hides UI accordingly, but backend is the source of truth).

| Module | Admin | Doctor | Nurse | Receptionist | Pharmacist | Lab Staff | Blood Bank | Emergency Staff | Accountant | Patient |
|---|---|---|---|---|---|---|---|---|---|---|
| User & role management | CRUD | - | - | - | - | - | - | - | - | - |
| Patient registration/profile | CRUD | R | R/U(vitals) | CRUD | R | R | R | CRUD(emergency) | R | R/U(own) |
| Doctor/staff directory | CRUD | R/U(own) | R | R | R | R | R | R | R | R |
| Appointments | CRUD | R/U(own) | R | CRUD | - | - | - | - | - | CRU(own) |
| Medical history / EMR | R | CRUD(own patients) | R/U(vitals) | - | R(prescriptions) | R(test refs) | - | R | - | R(own) |
| Prescriptions | R | CRUD | R | - | R/U(dispense) | - | - | - | - | R(own) |
| Bed & room management | CRUD | R | R/U(status) | R/U(assign) | - | - | - | R/U(assign) | - | R(own) |
| Admission & discharge | CRUD | CRU | R/U | CRU | - | - | - | CR(emergency admit) | R | R(own) |
| Nurse/staff tasks | CRUD | CR(assign) | CRU(own) | CR(assign) | R(own) | R(own) | R(own) | R(own) | - | - |
| Pharmacy inventory | CRUD | R | R | R | CRUD | - | - | R | R | - |
| Pharmacy billing/sales | R | - | - | R | CRUD | - | - | - | R | R(own) |
| Lab test requests | R | CR | R | CR | - | R/U | - | CR | - | R(own) |
| Lab reports | R | R | R | R | - | CRUD | - | R | - | R(own) |
| Blood bank inventory | CRUD | R | R | R | - | - | CRUD | R | - | - |
| Blood requests | R | CR | R | CR | - | - | CRU | CR | - | - |
| Emergency cases | CRUD | R/U(assigned) | R/U | CR | - | - | - | CRUD | - | - |
| Ambulance dispatch | CRUD | R | R | R | - | - | - | CRUD | - | - |
| Insurance claims | R | R(supporting docs) | - | CR | - | - | - | - | CRUD | CR(own) |
| Billing / invoices | CRUD | R | - | CR | R(pharmacy part) | - | - | - | CRUD | R(own) |
| Payments | R | - | - | R | - | - | - | - | CRUD | CR(own) |
| Notifications | CRUD(broadcast) | R | R | R | R | R | R | R | R | R(own) |
| Documents | CRUD(all) | CR(own patients) | R | CR | - | CR(reports) | - | CR | R | CR(own) |
| AI decision-support flags | R | CR | R | - | - | R(lab flags) | - | R | - | - |
| Analytics dashboards | Full | Clinical KPIs | Ward KPIs | Front-desk KPIs | Inventory KPIs | Lab KPIs | Stock KPIs | Case KPIs | Financial KPIs | - |
| Audit logs | R (full) | - | - | - | - | - | - | - | R(billing-related) | - |

**Notes**
- "own" = scoped to records the user created/owns/is assigned to (enforced with `WHERE` clauses tied to `req.user.id`, not just UI hiding).
- Admin can impersonate/reset any account but all such actions are themselves audit-logged.
- Patients only ever see their own data — every patient-facing query is filtered by `patient_id = req.user.patientId`.
