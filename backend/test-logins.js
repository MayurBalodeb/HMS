async function run() {
  const pageRes = await fetch('http://localhost:5000/login.html');
  console.log('CSP Header:', pageRes.headers.get('content-security-policy') || 'NONE (Disabled - Scripts allowed!)');

  const roles = [
    { role: 'admin', email: 'admin@hms.com', pass: 'Admin@123' },
    { role: 'doctor', email: 'doctor@hms.com', pass: 'Doctor@123' },
    { role: 'receptionist', email: 'reception@hms.com', pass: 'Reception@123' },
    { role: 'pharmacist', email: 'pharmacist@hms.com', pass: 'Pharma@123' },
    { role: 'accountant', email: 'accountant@hms.com', pass: 'Account@123' },
    { role: 'nurse', email: 'nurse@hms.com', pass: 'Nurse@123' },
    { role: 'patient', email: 'patient@hms.com', pass: 'Patient@123' }
  ];

  let allPassed = true;
  for (const r of roles) {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5000' },
      body: JSON.stringify({ email: r.email, password: r.pass })
    });
    const data = await res.json();
    const ok = res.status === 200 && data.success && data.data?.token;
    console.log(`[${r.role.toUpperCase()}] -> HTTP ${res.status} | Success: ${data.success} | Name: ${data.data?.user?.name} | OK? ${ok}`);
    if (!ok) allPassed = false;
  }

  if (allPassed) {
    console.log('\n🎉 ALL 7 ROLES CAN SUCCESSFULLY LOG IN!');
  } else {
    console.error('\n❌ SOME ROLES FAILED TO LOG IN!');
    process.exit(1);
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
