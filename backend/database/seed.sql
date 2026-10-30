-- ============================================================
-- Seed data. Run AFTER schema.sql:
--   mysql -u root -p hms_db < seed.sql
-- Passwords below are bcrypt hashes (rounds=10) of the plaintext
-- shown in README.md (e.g. Admin@123, Doctor@123 ...).
-- ============================================================
USE hms_db;

INSERT INTO roles (name) VALUES
('admin'),('doctor'),('nurse'),('receptionist'),('pharmacist'),
('lab_staff'),('blood_bank'),('emergency_staff'),('accountant'),('patient');

INSERT INTO departments (name, description) VALUES
('General Medicine','Primary care'),
('Cardiology','Heart & vascular'),
('Orthopedics','Bones & joints'),
('Pediatrics','Child care'),
('Emergency','Trauma & urgent care'),
('Radiology','Imaging'),
('Pathology','Lab diagnostics');

-- NOTE: hashes below are generated with backend/utils/password.js (Node's
-- built-in scrypt, format "salt:hash"). Regenerate with:
--   node backend/utils/hashSeedPasswords.js
-- if you change any default password.
INSERT INTO users (name, email, password_hash, phone, role_id, status) VALUES
('System Admin','admin@hms.com','b9a93dec99e7c01c0a4ee488c7f0794a:eaa232a64b4dedd5f299fbb30dbec4aa38be1ae5fddaede798d7153bc132a4df9597ee1b2289fea15c05f1700b0a8345ca81ba41eb204124907903379e6ac9ce',NULL,1,'active'),
('Dr. Alice Rao','doctor@hms.com','0eff25454d2ecef7cb330a5af2434c77:debd7f3a469e0e32dd5892170190e3be2e20ba8c7caf8581ec778d7924aabace22262baaba85cdbe9c9356ab82489bec6ff41bb5ed389c017e206ece10113700','9000000001',2,'active'),
('Nina Nurse','nurse@hms.com','01acfb4b40624fe5ef2779b5ec040057:b7566be7a37dbc09fd6084cf0aa4becca28eed8fe6449b922a8309172c8943e67741b414c7e92c3816dd5b2ffcfa54d241496f12687b97c9d70e6c850f33aa98','9000000002',3,'active'),
('Rita Reception','reception@hms.com','2f367d5ef95d9e73ad0281c05e3584ea:45b3cab96081b395c62e99b3837e3d34796f92f2655ef79ce9885ff90b18b54da903d9018a7068ca4536a4c32c1b7f0dd9c862c4b137b2db77817d5b4697d7dc','9000000003',4,'active'),
('Paul Pharmacist','pharmacist@hms.com','699d646b929901395d1118d55d49af42:72dec73302649725958b242b7e10d14e49652fa615431f7abc30f5bd4d68f5a46feb28cb9e109c0cb4fabb7c7f4df92a34eaf7ad08fd49a4c8d56b5ee11b9396','9000000004',5,'active'),
('Leo Lab','lab@hms.com','12802e379a6c8325b94cf41f5235c4c3:6050b4a9d5686778edda0103d06a3adc13c7929baf23ffd3285cba2b416f1a18fb47783204ec8ed67551965cf9cdfb2cb0a0ce36476899ee02485ea2634a90be','9000000005',6,'active'),
('Ben BloodBank','bloodbank@hms.com','9825203c40ab3a5bac5756a8c97710cf:1bd3712c2bab177c02c8c60f0b97021280201004fd032701fe7e2da75131f443863d7efdbf065c997b17baa114599ec565b8cca17ea90c6e55db2a1cdfdf956a','9000000006',7,'active'),
('Eva Emergency','emergency@hms.com','3d96caf65c7c1be4c42446f9ea77960a:c85cbe48daf8aa87a9a4fd56c4ba017b928abb682040f095ee62af66c658d43ba392488d08a35ee9b3bb3641e0e0216abc75f7162c492b81b0c512f01e098cc1','9000000007',8,'active'),
('Amy Accountant','accountant@hms.com','aa9a97cbb5a5ce0bf0bdd44033e1610e:2765cf28b0ad74f0def31d5c47bf245253b3fec002473e551cecc54d7d90d83e7fca70c7e68db1a9a5b6638d09776c268d1801da17ce678009aba97ddf8717a5','9000000008',9,'active'),
('John Patient','patient@hms.com','d07fcd3b31879b413a2ceb8770c1256c:e92c5b47ce55cca2cfa86964f0a2a7d4d65e119925eccc28d986574947db8188a558a7ea337b0e4cce19a6fdd411e8ac256848444ef7cac00eac917537f3239e','9000000009',10,'active');

INSERT INTO doctors (user_id, department_id, specialization, qualification, consultation_fee) VALUES
(2, 2, 'Cardiologist', 'MD Cardiology', 500);

INSERT INTO staff (user_id, role_id, department_id, shift) VALUES
(3, 3, 1, 'Day'),
(4, 4, 1, 'Day'),
(5, 5, 1, 'Day'),
(6, 6, 7, 'Day'),
(7, 7, 5, 'Day'),
(8, 8, 5, 'Day'),
(9, 9, 1, 'Day');

INSERT INTO patients (user_id, dob, gender, blood_group, address, emergency_contact, emergency_phone) VALUES
(10, '1990-05-14', 'male', 'O+', '123 Main St, Pune', 'Jane Patient', '9111111111');

INSERT INTO rooms (room_no, type, department_id, floor) VALUES
('101','general',1,'1'),('102','general',1,'1'),
('201','private',2,'2'),('ICU-1','icu',5,'G');

INSERT INTO beds (room_id, bed_no, status, daily_rate) VALUES
(1,'A', 'available', 800),(1,'B','available',800),
(2,'A','available',800),
(3,'A','available',2500),
(4,'A','available',5000);

INSERT INTO lab_tests (name, category, price) VALUES
('Complete Blood Count','Hematology',300),
('Blood Sugar (Fasting)','Biochemistry',150),
('Chest X-Ray','Radiology',600),
('Lipid Profile','Biochemistry',450);

INSERT INTO pharmacy_inventory (medicine_name, category, batch_no, expiry_date, quantity, unit_price, reorder_level) VALUES
('Paracetamol 500mg','Analgesic','B001','2027-01-01',500,2.5,50),
('Amoxicillin 250mg','Antibiotic','B002','2026-12-01',200,5.0,30),
('ORS Sachet','Electrolyte','B003','2027-06-01',300,10.0,40);

INSERT INTO blood_inventory (blood_group, units_available) VALUES
('A+',20),('A-',5),('B+',18),('B-',4),('AB+',6),('AB-',2),('O+',25),('O-',8);

INSERT INTO ambulances (vehicle_no, driver_name, driver_phone, status) VALUES
('MH-12-AB-1234','Sam Driver','9222222222','available');

INSERT INTO insurance_providers (name, contact) VALUES
('StarHealth Insurance','support@starhealth.example'),
('National Health Cover','contact@nhc.example');
