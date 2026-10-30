const BASE_URL = 'http://localhost:5000/api';

async function req(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

async function run() {
  console.log('--- RUNNING PATIENT READ-ONLY BILLING & ADVANCED CAREBOT TESTS ---');

  // 1. Authenticate users
  console.log('1. Authenticating test users...');
  const patientLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'patient@hms.com', password: 'Patient@123' })
  });
  const patientToken = patientLogin.data.token;
  console.log(`  ✅ Patient authenticated: ${patientLogin.data.user.name} (Patient ID: ${patientLogin.data.user.patientId})`);

  const recLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reception@hms.com', password: 'Reception@123' })
  });
  const recToken = recLogin.data.token;
  console.log(`  ✅ Receptionist authenticated: ${recLogin.data.user.name}`);

  // 2. Patient can view their bills
  console.log('\n2. Verifying Patient can view their invoices...');
  const patientInvoices = await req(`${BASE_URL}/billing/invoices`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  console.log(`  Patient has ${patientInvoices.data.length} visible invoices.`);
  if (!Array.isArray(patientInvoices.data)) throw new Error('Patient invoices request failed');
  console.log('  ✅ Patient bill viewing verified!');

  // 3. Security check: Patient CANNOT record payments directly (read-only view)
  console.log('\n3. Security Verification: Patient attempting self-payment recording...');
  const targetInvoiceId = patientInvoices.data[0]?.id || 1;
  try {
    await req(`${BASE_URL}/billing/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ invoice_id: targetInvoiceId, amount: 100, method: 'cash' })
    });
    throw new Error('SECURITY BREACH: Patient was allowed to record payment!');
  } catch (err) {
    if (err.status === 403) {
      console.log(`  🔒 Security verified: Payment blocked with HTTP 403: "${err.message}"`);
    } else {
      throw err;
    }
  }

  // 4. Verification: Receptionist CAN record payment
  console.log('\n4. Verifying Receptionist can record payment at front desk counter...');
  const recPayRes = await req(`${BASE_URL}/billing/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recToken}` },
    body: JSON.stringify({ invoice_id: targetInvoiceId, amount: 50, method: 'cash' })
  });
  console.log(`  ✅ Receptionist recorded payment successfully! New status: ${recPayRes.data.status}`);

  // 5. Test CareBot Guest Mode (on Landing Page)
  console.log('\n5. Testing CareBot AI in Public Guest Mode (Homepage)...');
  const guestRes = await req(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What are the charges for CBC and Lipid profile?' })
  });
  console.log(`  Guest Query Reply: ${guestRes.data.reply.split('\n')[0]}`);
  if (!guestRes.data.reply.includes('CBC') && !guestRes.data.reply.includes('Diagnostic')) {
    throw new Error('CareBot guest mode failed to return test information');
  }
  console.log('  ✅ CareBot Guest Mode verified on homepage!');

  // 6. Test CareBot Personalized Patient Mode (Logged-in Patient)
  console.log('\n6. Testing CareBot Personalized Patient Intelligence...');
  
  // A. Patient asks about their bill
  const myBillRes = await req(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ message: 'What is my current bill balance and what do I owe?' })
  });
  console.log(`  Personalized Bill Statement:\n    ${myBillRes.data.reply.split('\n').slice(0, 3).join('\n    ')}`);
  if (!myBillRes.data.reply.includes('Billing') && !myBillRes.data.reply.includes('Balance')) {
    throw new Error('CareBot failed to return personalized billing data for patient');
  }
  console.log('  ✅ Personalized patient billing query verified!');

  // B. Patient asks clinical triage question
  const triageRes = await req(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ message: 'I have severe chest pain and high blood pressure' })
  });
  console.log(`  Clinical Triage Match:\n    ${triageRes.data.reply.split('\n').slice(0, 4).join('\n    ')}`);
  if (!triageRes.data.reply.includes('Cardio') && !triageRes.data.reply.includes('Dr. Alice Rao')) {
    throw new Error('CareBot failed to recommend Cardiology specialist for chest pain');
  }
  console.log('  ✅ Clinical specialty triage & doctor matching verified!');

  // C. Orthopedic symptom test
  const orthoRes = await req(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ message: 'I have severe knee joint pain and back pain' })
  });
  console.log(`  Orthopedic Match:\n    ${orthoRes.data.reply.split('\n').slice(0, 3).join('\n    ')}`);
  if (!orthoRes.data.reply.includes('Orthopedics')) {
    throw new Error('CareBot failed to match Orthopedics specialist');
  }
  console.log('  ✅ Orthopedics matching verified!');

  console.log('\n======================================================');
  console.log('🎉 ALL PATIENT VIEW-ONLY & ADVANCED CAREBOT TESTS PASSED!');
  console.log('======================================================');
}

run().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err.data || err.message);
  process.exit(1);
});
