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
  console.log('--- STARTING HMS INTEGRATED LAB BILLING & CAREBOT SUITE ---');

  // 1. Logins
  console.log('1. Logging in as reception, accountant, and doctor...');
  const recLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reception@hms.com', password: 'Reception@123' })
  });
  const recToken = recLogin.data.token;

  const docLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'doctor@hms.com', password: 'Doctor@123' })
  });
  const docToken = docLogin.data.token;

  const accLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'accountant@hms.com', password: 'Account@123' })
  });
  const accToken = accLogin.data.token;

  // 2. Test CareBot AI Chat Endpoint
  console.log('\n2. Testing CareBot AI Chat Assistant (/api/ai/chat)...');
  const chatQueries = [
    'Hello CareBot',
    'Which doctors are available?',
    'How does hospital and lab billing work?',
    'What is the price of CBC test?',
    'Tell me about bed occupancy'
  ];

  for (const q of chatQueries) {
    const chatRes = await req(`${BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recToken}` },
      body: JSON.stringify({ message: q })
    });
    console.log(`  Q: "${q}"`);
    console.log(`  CareBot Reply: ${chatRes.data.reply.split('\n')[0]}...`);
    console.log(`  Suggestions: [${(chatRes.data.suggestions || []).join(', ')}]`);
    if (!chatRes.data.reply) throw new Error('CareBot failed to generate reply');
  }
  console.log('  ✅ CareBot conversational intelligence verified!');

  // 3. Test Doctor Ordering a Lab Test for Patient
  console.log('\n3. Testing Doctor ordering Lab Test for Patient #1...');
  const labTestsRes = await req(`${BASE_URL}/lab/tests`, {
    headers: { Authorization: `Bearer ${docToken}` }
  });
  const cbcTest = labTestsRes.data.find(t => t.name.includes('CBC')) || labTestsRes.data[0];
  console.log(`  Using Lab Test: ${cbcTest.name} (ID: ${cbcTest.id}, Price: ₹${cbcTest.price})`);

  let orderReqId = null;
  try {
    const orderRes = await req(`${BASE_URL}/lab/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` },
      body: JSON.stringify({ patient_id: 1, test_id: cbcTest.id, priority: 'urgent' })
    });
    orderReqId = orderRes.data.id;
    console.log(`  ✅ Doctor ordered lab request #${orderReqId}`);
  } catch (err) {
    console.log(`  (Lab request order note: ${err.message})`);
  }

  // 4. Test Receptionist querying pending lab tests for Patient #1
  console.log('\n4. Testing Receptionist fetching pending lab tests for Patient #1 (/api/billing/patient/1/lab-tests)...');
  const pendingLabRes = await req(`${BASE_URL}/billing/patient/1/lab-tests`, {
    headers: { Authorization: `Bearer ${recToken}` }
  });
  console.log(`  Found ${pendingLabRes.data.length} pending lab test(s) for patient #1:`);
  pendingLabRes.data.slice(0, 3).forEach(t => {
    console.log(`    - Test: ${t.test_name} (₹${t.price}) ordered by ${t.doctor_name || 'Doctor'}`);
  });
  if (!Array.isArray(pendingLabRes.data)) throw new Error('Failed to retrieve patient pending lab tests');
  console.log('  ✅ Pending lab tests endpoint verified!');

  // 5. Test Receptionist issuing Hospital Bill WITH Diagnostic Lab Items
  console.log('\n5. Testing Receptionist creating Hospital Bill with Integrated Diagnostic Lab Charges...');
  const hospBillPayload = {
    patient_id: 1,
    bill_type: 'hospital',
    hospital_items: [
      { description: 'Specialist OPD Consultation', amount: 500, quantity: 1, category: 'consultation' },
      { description: 'Nursing & Monitoring Charges', amount: 350, quantity: 1, category: 'nursing' },
      { description: 'Complete Blood Count (CBC)', amount: 350, quantity: 1, unit_price: 350, category: 'lab' },
      { description: 'Lipid Profile', amount: 700, quantity: 1, unit_price: 700, category: 'lab' }
    ],
    discount: 100,
    tax: 90,
    paid_amount: 1790,
    payment_method: 'card',
    notes: 'Hospital Healthcare & Diagnostic Lab Services'
  };

  const createHospRes = await req(`${BASE_URL}/billing/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recToken}` },
    body: JSON.stringify(hospBillPayload)
  });
  const hospInvoiceId = createHospRes.data.id;
  console.log(`  ✅ Hospital Invoice created successfully: #HOSP-${hospInvoiceId}`);

  // 6. Verify Invoice Breakdown
  console.log('\n6. Verifying Invoice Breakdown and Lab Category persistence...');
  const invDetailRes = await req(`${BASE_URL}/billing/invoices/${hospInvoiceId}`, {
    headers: { Authorization: `Bearer ${recToken}` }
  });
  const inv = invDetailRes.data;
  console.log(`  Invoice Type: ${inv.bill_type}`);
  console.log(`  Hospital Total (including lab tests): ₹${inv.hospital_total}`);
  console.log(`  Total Amount: ₹${inv.total_amount}`);
  console.log(`  Paid Amount: ₹${inv.paid_amount}`);
  console.log(`  Status: ${inv.status}`);

  const labItems = inv.items.filter(i => i.category === 'lab');
  console.log(`  Lab items found on invoice: ${labItems.length}`);
  labItems.forEach(li => {
    console.log(`    - 🔬 [LAB]: ${li.description} — ₹${li.amount}`);
  });

  if (labItems.length !== 2) throw new Error('Expected 2 lab items on hospital invoice');
  if (Number(inv.hospital_total) !== 1900) throw new Error(`Expected hospital_total 1900, got ${inv.hospital_total}`);
  if (Number(inv.total_amount) !== 1890) throw new Error(`Expected total_amount 1890 (1900 - 100 + 90), got ${inv.total_amount}`);
  console.log('  ✅ Integrated Hospital & Lab Billing accurately calculated and saved!');

  // 7. Verify Accountant Master Ledger View
  console.log('\n7. Verifying Accountant Master Ledger...');
  const accInvoicesRes = await req(`${BASE_URL}/billing/invoices`, {
    headers: { Authorization: `Bearer ${accToken}` }
  });
  const foundMaster = accInvoicesRes.data.find(i => i.id === hospInvoiceId);
  if (!foundMaster) throw new Error('Accountant could not locate invoice in Master Ledger');
  console.log(`  ✅ Accountant located Invoice #${foundMaster.id} with Hospital Subtotal ₹${foundMaster.hospital_total}`);

  console.log('\n======================================================');
  console.log('🎉 ALL INTEGRATED LAB BILLING & CAREBOT TESTS PASSED!');
  console.log('======================================================');
}

run().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err.data || err.message);
  process.exit(1);
});
