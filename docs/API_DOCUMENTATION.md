# REST API Documentation

Base URL: `http://localhost:5000/api`
Auth: `Authorization: Bearer <JWT>` header on all routes except `/auth/*`.
All responses: `{ success: boolean, data | error, message }`.

## Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | /auth/register | Public | Register patient account |
| POST | /auth/login | Public | Login, returns JWT + role |
| POST | /auth/staff/create | Admin | Create staff/doctor/etc. account |
| GET | /auth/me | Any | Current user profile |
| PUT | /auth/change-password | Any | Change own password |

## Patients
| Method | Endpoint | Access |
|---|---|---|
| GET | /patients | Admin, Doctor, Nurse, Reception, Lab, Pharmacist, Emergency |
| GET | /patients/:id | Above + Patient(own) |
| GET | /patients/:id/qrcode | Above |
| POST | /patients | Reception, Admin |
| PUT | /patients/:id | Admin, Reception, Patient(own) |
| DELETE | /patients/:id | Admin |
| GET | /patients/:id/history | Doctor, Nurse, Admin, Patient(own) |

## Doctors / Staff Directory
| GET | /doctors | Any authenticated |
| GET/POST/PUT/DELETE | /doctors(/:id) | Admin |
| GET/POST/PUT/DELETE | /staff(/:id) | Admin |

## Appointments
| GET | /appointments | role-scoped |
| POST | /appointments | Patient, Reception |
| PUT | /appointments/:id | Doctor, Reception, Patient(own, cancel) |
| DELETE | /appointments/:id | Admin, Reception |
| GET | /appointments/slots?doctorId&date | Any |

## Medical Records / EMR
| GET | /medical-records/patient/:id | Doctor, Nurse, Admin, Patient(own) |
| POST | /medical-records | Doctor |
| PUT | /medical-records/:id | Doctor(own) |
| POST | /medical-records/:id/prescriptions | Doctor |

## Beds & Rooms
| GET | /beds | Admin, Nurse, Reception, Doctor, Emergency |
| GET | /rooms | same |
| POST/PUT/DELETE | /beds(/:id) | Admin |
| PUT | /beds/:id/status | Nurse, Reception, Admin (emits Socket.IO `bed:update`) |

## Admissions & Discharge
| GET | /admissions | Admin, Doctor, Nurse, Reception |
| POST | /admissions | Reception, Emergency, Admin |
| PUT | /admissions/:id/discharge | Doctor, Admin |

## Tasks (Staff Communication)
| GET | /tasks | scoped to assigned/created |
| POST | /tasks | Admin, Doctor, Reception |
| PUT | /tasks/:id | assignee (status), assigner (edit) |

## Pharmacy
| GET/POST/PUT/DELETE | /pharmacy/inventory(/:id) | Pharmacist, Admin (GET wider) |
| POST | /pharmacy/sales | Pharmacist |
| GET | /pharmacy/sales | Pharmacist, Accountant, Admin |

## Lab
| GET/POST | /lab/tests | catalog — Admin manages, all can read |
| GET/POST | /lab/requests | Doctor creates, Lab views/updates |
| PUT | /lab/requests/:id | Lab Staff (status, upload result) |
| POST | /lab/requests/:id/report | Lab Staff (file upload) |
| GET | /lab/reports/patient/:id | Doctor, Patient(own), Admin |

## Blood Bank
| GET/POST/PUT | /bloodbank/inventory(/:id) | Blood Bank, Admin |
| GET/POST | /bloodbank/donors | Blood Bank |
| GET/POST/PUT | /bloodbank/requests(/:id) | Doctor/Reception create, Blood Bank fulfills |

## Emergency & Ambulance
| GET/POST/PUT | /emergency/cases(/:id) | Emergency Staff, Admin, Doctor(assigned) |
| GET/POST/PUT | /emergency/ambulances(/:id) | Emergency Staff, Admin |

## Insurance
| GET/POST/PUT | /insurance/claims(/:id) | Accountant manages, Reception creates, Patient(own) reads |
| GET/POST | /insurance/providers | Admin |

## Billing & Payments
| GET/POST | /billing/invoices | Accountant, Reception create; role-scoped read |
| GET | /billing/invoices/:id | + Patient(own) |
| POST | /billing/payments | Accountant, Patient (online payment) |
| GET | /billing/payments/:invoiceId | scoped |

## Notifications
| GET | /notifications | own user (Socket.IO `notification:new` pushed live) |
| PUT | /notifications/:id/read | own user |
| POST | /notifications/broadcast | Admin |

## Documents
| GET | /documents/patient/:id | Doctor, Admin, Patient(own) |
| POST | /documents | Doctor, Reception, Lab, Patient(own upload) — multer secured (type/size limits, stored outside web-root, served via authenticated download route) |
| GET | /documents/:id/download | scoped, streamed with auth check |

## AI Decision Support
| POST | /ai/triage-suggestion | Doctor, Nurse, Emergency — body: vitals/symptoms → returns rule-based flags + recommended next steps. Always includes `"disclaimer": "Decision support only. Not a diagnosis. Clinician judgement required."` |

## Analytics
| GET | /analytics/overview | Admin |
| GET | /analytics/occupancy | Admin, Nurse, Reception |
| GET | /analytics/revenue | Admin, Accountant |
| GET | /analytics/inventory-alerts | Admin, Pharmacist, Blood Bank |

## Audit Logs
| GET | /audit-logs | Admin only, filterable by user/module/date |

---
### Standard error codes
`400` validation, `401` no/invalid token, `403` role forbidden, `404` not found, `409` conflict (e.g. double-booked slot / bed already occupied), `500` server error (logged, generic message returned to client).
