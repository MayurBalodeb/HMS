const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data || {});
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400 || !json.success) reject(new Error(json.message || body));
          else resolve(json);
        } catch (e) {
          reject(new Error(body));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400 || !json.success) reject(new Error(json.message || body));
          else resolve(json);
        } catch (e) {
          reject(new Error(body));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('--- 1. Testing Doctor Login ---');
  const docLogin = await post('/auth/login', { email: 'doctor@hms.com', password: 'Doctor@123' });
  const docToken = docLogin.data.token;
  const doctor = docLogin.data.user;
  console.log(`✅ Logged in as Dr. ${doctor.name} (Role: ${doctor.role}, Doctor ID: ${doctor.doctorId})`);

  console.log('\n--- 2. Fetching Patient List ---');
  const patientsRes = await get('/patients', docToken);
  const patient = patientsRes.data[0];
  console.log(`✅ Selected patient: ${patient.name} (ID: ${patient.id}, Gender: ${patient.gender})`);

  console.log('\n--- 3. Doctor Consultation & Medicine Prescription ---');
  const consultRes = await post('/medical-records', {
    patient_id: patient.id,
    doctor_id: doctor.doctorId,
    symptoms: 'Acute dry cough, fever for 3 days, body aches',
    diagnosis: 'Acute Upper Respiratory Tract Infection (URTI)',
    notes: 'Patient advised warm saline gargles, adequate hydration, and complete antibiotic course.',
    follow_up_date: '2026-10-25',
    vitals: {
      temperature_c: 38.2,
      systolic_bp: 120,
      diastolic_bp: 80,
      heart_rate: 88,
      spo2: 98
    },
    prescriptions: [
      {
        medicine_name: 'Amoxicillin + Clavulanic Acid 625mg',
        dosage: '625 mg',
        frequency: '1-0-1 (Twice daily)',
        timing: 'After meals',
        duration: '5 Days',
        instructions: 'Take after food with plenty of water'
      },
      {
        medicine_name: 'Paracetamol 650mg',
        dosage: '650 mg',
        frequency: '1-1-1 (Thrice daily)',
        timing: 'After meals',
        duration: '3 Days',
        instructions: 'Take SOS for fever above 100°F'
      },
      {
        medicine_name: 'Levocetirizine 5mg',
        dosage: '5 mg',
        frequency: '0-0-1 (Night only)',
        timing: 'Before bed',
        duration: '5 Days',
        instructions: 'May cause drowsiness'
      }
    ]
  }, docToken);
  console.log(`✅ Consultation recorded! Record ID: ${consultRes.data.recordId}`);

  console.log('\n--- 4. Checking Patient Medical History on Next Visit ---');
  const historyRes = await get(`/patients/${patient.id}/history`, docToken);
  const hist = historyRes.data;
  console.log(`✅ Retrieved medical history for ${hist.patient.name}:`);
  console.log(`   - Total Visits / Records: ${hist.medicalRecords.length}`);
  const latestVisit = hist.medicalRecords[0];
  console.log(`   - Latest Diagnosis: ${latestVisit.diagnosis}`);
  console.log(`   - Prescribed Medicines in History: ${latestVisit.prescriptions.length} items:`);
  latestVisit.prescriptions.forEach(p => {
    console.log(`     * ${p.medicine_name} | Dosage: ${p.dosage} | Frequency: ${p.frequency} | Duration: ${p.duration}`);
  });

  console.log('\n--- 5. Pharmacist Prescriptions Queue ---');
  const pharmaLogin = await post('/auth/login', { email: 'pharmacist@hms.com', password: 'Pharma@123' });
  const pharmaToken = pharmaLogin.data.token;
  const rxQueue = await get('/medical-records/prescriptions/queue', pharmaToken);
  console.log(`✅ Pharmacist received ${rxQueue.data.length} pending prescriptions in queue`);

  console.log('\n--- 6. Unified Billing (Accountant/Cashier) ---');
  const accLogin = await post('/auth/login', { email: 'accountant@hms.com', password: 'Account@123' });
  const accToken = accLogin.data.token;

  // Pull doctor's pending prescriptions for this patient
  const pendingRx = await get(`/billing/patient/${patient.id}/prescriptions`, accToken);
  console.log(`✅ Accountant retrieved ${pendingRx.data.length} doctor prescribed items for billing`);

  // Create unified bill combining Hospital charges AND Pharmacy medicines
  const billRes = await post('/billing/invoices', {
    patient_id: patient.id,
    bill_type: 'unified',
    hospital_items: [
      { description: 'Specialist Doctor OPD Consultation Fee', amount: 500, category: 'consultation' },
      { description: 'Basic Nursing Care & Vitals Triage', amount: 150, category: 'nursing' }
    ],
    pharmacy_items: pendingRx.data.map(rx => ({
      prescription_id: rx.prescription_id,
      medicine_name: `${rx.medicine_name} (${rx.dosage})`,
      unit_price: 18.5,
      quantity: 10,
      amount: 185.0
    })),
    discount: 50.0,
    tax: 45.0,
    paid_amount: 800.0,
    payment_method: 'card',
    notes: 'OPD visit + 5-day antibiotic course dispensed'
  }, accToken);
  console.log(`✅ Unified Invoice Created! Invoice ID: #INV-${billRes.data.id}`);

  // Fetch created invoice details
  const invDetails = await get(`/billing/invoices/${billRes.data.id}`, accToken);
  const inv = invDetails.data;
  console.log(`   - Bill Type: ${inv.bill_type}`);
  console.log(`   - Hospital Subtotal: ₹${inv.hospital_total}`);
  console.log(`   - Pharmacy Subtotal: ₹${inv.pharmacy_total}`);
  console.log(`   - Discount: ₹${inv.discount} | Tax: ₹${inv.tax}`);
  console.log(`   - Grand Total: ₹${inv.total_amount}`);
  console.log(`   - Paid: ₹${inv.paid_amount} (Method: ${inv.payment_method})`);
  console.log(`   - Hospital Items: ${inv.hospitalItems.length}`);
  console.log(`   - Pharmacy Items: ${inv.pharmacyItems.length}`);

  console.log('\n--- 7. Admin Governance & RBAC Check ---');
  const adminLogin = await post('/auth/login', { email: 'admin@hms.com', password: 'Admin@123' });
  const adminToken = adminLogin.data.token;
  const staffRes = await get('/staff', adminToken);
  const docsRes = await get('/doctors', adminToken);
  const auditRes = await get('/audit-logs', adminToken);
  console.log(`✅ Admin access verified:`);
  console.log(`   - Total Staff: ${staffRes.data.length}`);
  console.log(`   - Total Doctors: ${docsRes.data.length}`);
  console.log(`   - Audit Log Events: ${auditRes.data.length}`);

  console.log('\n🎉 ALL SYSTEM WORKFLOWS PASSED WITH 100% SUCCESS!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
