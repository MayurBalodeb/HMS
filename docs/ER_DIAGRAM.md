# Entity–Relationship Diagram

Paste this into https://mermaid.live to view visually, or open in VS Code with the "Markdown Preview Mermaid Support" extension.

```mermaid
erDiagram
    ROLES ||--o{ USERS : has
    USERS ||--o| PATIENTS : "is a"
    USERS ||--o| DOCTORS : "is a"
    USERS ||--o| STAFF : "is a"

    DEPARTMENTS ||--o{ DOCTORS : employs
    DEPARTMENTS ||--o{ ROOMS : contains
    ROOMS ||--o{ BEDS : contains

    PATIENTS ||--o{ APPOINTMENTS : books
    DOCTORS ||--o{ APPOINTMENTS : attends

    PATIENTS ||--o{ ADMISSIONS : has
    BEDS ||--o{ ADMISSIONS : assigned
    DOCTORS ||--o{ ADMISSIONS : supervises

    PATIENTS ||--o{ MEDICAL_RECORDS : has
    DOCTORS ||--o{ MEDICAL_RECORDS : writes
    MEDICAL_RECORDS ||--o{ PRESCRIPTIONS : contains

    PHARMACY_INVENTORY ||--o{ PHARMACY_SALE_ITEMS : "sold as"
    PHARMACY_SALES ||--o{ PHARMACY_SALE_ITEMS : contains
    PATIENTS ||--o{ PHARMACY_SALES : purchases
    STAFF ||--o{ PHARMACY_SALES : processes

    LAB_TESTS ||--o{ LAB_REQUESTS : "requested as"
    PATIENTS ||--o{ LAB_REQUESTS : undergoes
    DOCTORS ||--o{ LAB_REQUESTS : orders
    LAB_REQUESTS ||--o| LAB_REPORTS : produces
    STAFF ||--o{ LAB_REPORTS : uploads

    BLOOD_INVENTORY ||--o{ BLOOD_REQUESTS : fulfills
    PATIENTS ||--o{ BLOOD_REQUESTS : needs
    BLOOD_DONORS ||--o{ BLOOD_INVENTORY : donates

    AMBULANCES ||--o{ EMERGENCY_CASES : dispatched
    PATIENTS ||--o{ EMERGENCY_CASES : involved
    DOCTORS ||--o{ EMERGENCY_CASES : assigned

    INSURANCE_PROVIDERS ||--o{ INSURANCE_CLAIMS : processes
    PATIENTS ||--o{ INSURANCE_CLAIMS : files
    ADMISSIONS ||--o{ INSURANCE_CLAIMS : "relates to"

    PATIENTS ||--o{ INVOICES : billed
    ADMISSIONS ||--o| INVOICES : generates
    INVOICES ||--o{ INVOICE_ITEMS : lists
    INVOICES ||--o{ PAYMENTS : "paid via"

    USERS ||--o{ TASKS : "assigned to"
    USERS ||--o{ TASKS : "assigned by"

    USERS ||--o{ NOTIFICATIONS : receives
    PATIENTS ||--o{ DOCUMENTS : owns
    USERS ||--o{ DOCUMENTS : uploads
    USERS ||--o{ AUDIT_LOGS : performs
    PATIENTS ||--o{ AI_SUGGESTIONS : "flagged for"

    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string phone
        int role_id FK
        enum status
        datetime created_at
    }
    PATIENTS {
        int id PK
        int user_id FK
        date dob
        enum gender
        string blood_group
        string address
        string emergency_contact
        string qr_code_path
    }
    DOCTORS {
        int id PK
        int user_id FK
        int department_id FK
        string specialization
        string qualification
    }
    STAFF {
        int id PK
        int user_id FK
        int role_id FK
        int department_id FK
        string shift
    }
    APPOINTMENTS {
        int id PK
        int patient_id FK
        int doctor_id FK
        date appointment_date
        string time_slot
        enum status
        string reason
    }
    BEDS {
        int id PK
        int room_id FK
        string bed_no
        enum status
    }
    ADMISSIONS {
        int id PK
        int patient_id FK
        int bed_id FK
        int doctor_id FK
        datetime admit_date
        datetime discharge_date
        enum status
    }
    MEDICAL_RECORDS {
        int id PK
        int patient_id FK
        int doctor_id FK
        date visit_date
        text diagnosis
        text notes
    }
    INVOICES {
        int id PK
        int patient_id FK
        int admission_id FK
        decimal total_amount
        decimal paid_amount
        enum status
    }
```

Full column-level DDL with constraints, indexes and foreign keys is in `backend/database/schema.sql` (30 tables, 3rd normal form: no repeating groups, all non-key attributes fully functionally dependent on primary keys, junction tables used for many-to-many relations such as invoice items and sale items).
