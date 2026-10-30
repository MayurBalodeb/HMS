-- ============================================================
-- Hospital Management System - MySQL Schema
-- Run: mysql -u root -p < schema.sql
-- ============================================================
DROP DATABASE IF EXISTS hms_db;
CREATE DATABASE hms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hms_db;

-- ---------------- Core Identity ----------------
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role_id INT NOT NULL,
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  dob DATE,
  gender ENUM('male','female','other'),
  blood_group VARCHAR(5),
  address VARCHAR(255),
  emergency_contact VARCHAR(100),
  emergency_phone VARCHAR(20),
  qr_code_path VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  department_id INT,
  specialization VARCHAR(120),
  qualification VARCHAR(150),
  consultation_fee DECIMAL(10,2) DEFAULT 0,
  available_days VARCHAR(100) DEFAULT 'Mon-Fri',
  available_time VARCHAR(50) DEFAULT '09:00-17:00',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  role_id INT NOT NULL,
  department_id INT,
  shift VARCHAR(30) DEFAULT 'Day',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- ---------------- Rooms & Beds ----------------
CREATE TABLE rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_no VARCHAR(20) NOT NULL UNIQUE,
  type ENUM('general','private','icu','operation_theatre') DEFAULT 'general',
  department_id INT,
  floor VARCHAR(10),
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE beds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  bed_no VARCHAR(20) NOT NULL,
  status ENUM('available','occupied','maintenance') DEFAULT 'available',
  daily_rate DECIMAL(10,2) DEFAULT 0,
  UNIQUE KEY uniq_room_bed (room_id, bed_no),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------- Appointments ----------------
CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  status ENUM('pending','confirmed','completed','cancelled') DEFAULT 'pending',
  reason VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_doctor_slot (doctor_id, appointment_date, time_slot),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------- Admissions ----------------
CREATE TABLE admissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  bed_id INT NOT NULL,
  doctor_id INT,
  admit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  discharge_date DATETIME NULL,
  reason VARCHAR(255),
  status ENUM('admitted','discharged') DEFAULT 'admitted',
  discharge_summary TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (bed_id) REFERENCES beds(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
) ENGINE=InnoDB;

-- ---------------- Medical Records / EMR ----------------
CREATE TABLE medical_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  visit_date DATE DEFAULT (CURRENT_DATE),
  diagnosis TEXT,
  notes TEXT,
  vitals_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
) ENGINE=InnoDB;

CREATE TABLE prescriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medical_record_id INT NOT NULL,
  medicine_name VARCHAR(150) NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(50),
  timing VARCHAR(50),
  duration VARCHAR(50),
  instructions VARCHAR(255),
  status ENUM('pending','dispensed','cancelled') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ---------------- Tasks (Staff Communication) ----------------
CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assigned_by INT NOT NULL,
  assigned_to INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(500),
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  status ENUM('pending','in_progress','completed') DEFAULT 'pending',
  due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------- Pharmacy ----------------
CREATE TABLE pharmacy_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_name VARCHAR(150) NOT NULL,
  category VARCHAR(80),
  batch_no VARCHAR(50),
  expiry_date DATE,
  quantity INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level INT DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE pharmacy_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT,
  pharmacist_id INT NOT NULL,
  sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_amount DECIMAL(10,2) DEFAULT 0,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (pharmacist_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE pharmacy_sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  inventory_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES pharmacy_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_id) REFERENCES pharmacy_inventory(id)
) ENGINE=InnoDB;

-- ---------------- Lab ----------------
CREATE TABLE lab_tests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80),
  price DECIMAL(10,2) DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE lab_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT,
  test_id INT NOT NULL,
  status ENUM('requested','sample_collected','in_progress','completed','cancelled') DEFAULT 'requested',
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  FOREIGN KEY (test_id) REFERENCES lab_tests(id)
) ENGINE=InnoDB;

CREATE TABLE lab_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL UNIQUE,
  lab_staff_id INT NOT NULL,
  result_summary TEXT,
  report_file VARCHAR(255),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES lab_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (lab_staff_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------- Blood Bank ----------------
CREATE TABLE blood_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blood_group VARCHAR(5) NOT NULL UNIQUE,
  units_available INT DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE blood_donors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  phone VARCHAR(20),
  last_donation_date DATE
) ENGINE=InnoDB;

CREATE TABLE blood_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT,
  blood_group VARCHAR(5) NOT NULL,
  units_required INT NOT NULL,
  status ENUM('pending','approved','fulfilled','rejected') DEFAULT 'pending',
  requested_by INT,
  request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------- Emergency & Ambulance ----------------
CREATE TABLE ambulances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_no VARCHAR(30) NOT NULL UNIQUE,
  driver_name VARCHAR(100),
  driver_phone VARCHAR(20),
  status ENUM('available','on_call','maintenance') DEFAULT 'available'
) ENGINE=InnoDB;

CREATE TABLE emergency_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT,
  ambulance_id INT,
  case_type VARCHAR(100),
  severity ENUM('low','medium','high','critical') DEFAULT 'medium',
  status ENUM('reported','dispatched','arrived','admitted','closed') DEFAULT 'reported',
  arrival_time DATETIME,
  assigned_doctor_id INT,
  notes VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (ambulance_id) REFERENCES ambulances(id),
  FOREIGN KEY (assigned_doctor_id) REFERENCES doctors(id)
) ENGINE=InnoDB;

-- ---------------- Insurance ----------------
CREATE TABLE insurance_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  contact VARCHAR(100)
) ENGINE=InnoDB;

CREATE TABLE insurance_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  provider_id INT NOT NULL,
  admission_id INT,
  claim_amount DECIMAL(10,2) NOT NULL,
  status ENUM('submitted','under_review','approved','rejected','settled') DEFAULT 'submitted',
  submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(255),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (provider_id) REFERENCES insurance_providers(id),
  FOREIGN KEY (admission_id) REFERENCES admissions(id)
) ENGINE=InnoDB;

-- ---------------- Billing ----------------
CREATE TABLE invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  admission_id INT,
  bill_type VARCHAR(50) DEFAULT 'unified',
  hospital_total DECIMAL(10,2) DEFAULT 0,
  pharmacy_total DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'cash',
  notes TEXT,
  status ENUM('unpaid','partial','paid') DEFAULT 'unpaid',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (admission_id) REFERENCES admissions(id)
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(50) DEFAULT 'hospital',
  quantity INT DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('cash','card','online','insurance') DEFAULT 'cash',
  transaction_id VARCHAR(100),
  status ENUM('success','pending','failed') DEFAULT 'success',
  payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------- Notifications / Documents / Audit / AI ----------------
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500),
  type VARCHAR(50) DEFAULT 'general',
  is_read TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  doc_type VARCHAR(80),
  original_name VARCHAR(255),
  file_path VARCHAR(255) NOT NULL,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(50),
  entity VARCHAR(80),
  entity_id INT,
  details VARCHAR(500),
  ip_address VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE ai_suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT,
  created_by INT,
  input_json JSON,
  suggestion TEXT,
  risk_level ENUM('low','medium','high','critical') DEFAULT 'low',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------- Indexes for common lookups ----------------
CREATE INDEX idx_appt_date ON appointments(appointment_date);
CREATE INDEX idx_admission_status ON admissions(status);
CREATE INDEX idx_bed_status ON beds(status);
CREATE INDEX idx_invoice_status ON invoices(status);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX idx_lab_status ON lab_requests(status);
