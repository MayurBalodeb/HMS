/* ==========================================================================
   HMS Frontend App — role-aware dashboard shell + module views.
   Hash-based router: #patients, #appointments, etc.
   ========================================================================== */

const user = requireAuth();
let socket = null;

const MENUS = {
  admin: [
    ['overview', '📊 Hospital Overview'],
    ['staff', '👥 Staff Management'],
    ['doctors', '🩺 Doctors & Rosters'],
    ['departments', '🏢 Departments'],
    ['beds', '🛏️ Rooms & Beds Setup'],
    ['analytics', '📈 Hospital Analytics'],
    ['audit-logs', '📜 Security & Audit Logs'],
    ['system-settings', '⚙️ Hospital Settings'],
    ['profile', '👤 My Profile']
  ],
  doctor: [
    ['overview', '📊 Doctor Dashboard'],
    ['appointments', '📅 OPD Appointments & Consult'],
    ['consultation', '🩺 Clinical Workbench & Prescribe'],
    ['patients', '🧑‍🤝‍🧑 Patients & Medical History'],
    ['admissions', '🏨 IPD Inpatient Rounds'],
    ['lab-requests', '🔬 Order / View Lab Tests'],
    ['ai-triage', '🤖 AI Decision Support'],
    ['profile', '⚙️ My Account']
  ],
  nurse: [
    ['overview', '📊 Ward Overview'],
    ['beds', '🛏️ Live Bed Occupancy'],
    ['admissions', '🏨 Inpatient Care & Vitals'],
    ['tasks', '✅ Nursing Tasks'],
    ['patients', '🧑‍🤝‍🧑 Patients List'],
    ['ai-triage', '🤖 AI Decision Support'],
    ['profile', '⚙️ My Account']
  ],
  receptionist: [
    ['overview', '📊 Front Desk Overview'],
    ['patients', '🧑‍🤝‍🧑 Patient Registration & Cards'],
    ['appointments', '📅 Book & Check-in Appointments'],
    ['admissions', '🏨 Admission Desk & Bed Allotment'],
    ['hospital-billing', '🏥 Hospital Services & Lab Billing'],
    ['profile', '⚙️ My Account']
  ],
  pharmacist: [
    ['overview', '📊 Pharmacy Dashboard'],
    ['pharmacy-prescriptions', '📋 Doctor Prescriptions Queue'],
    ['pharmacy-inventory', '💊 Medicine Stock & Inventory'],
    ['pharmacy-billing', '💊 Pharmacy Medicine Billing'],
    ['profile', '⚙️ My Account']
  ],
  lab_staff: [
    ['overview', '📊 Lab Overview'],
    ['lab-requests', '🔬 Test Queue & Upload Reports'],
    ['lab-tests', '🧪 Test Catalog & Pricing'],
    ['profile', '⚙️ My Account']
  ],
  accountant: [
    ['overview', '📊 Finance Overview'],
    ['master-billing', '💳 Master Financial Ledger (Totals)'],
    ['insurance', '📋 Insurance Claims'],
    ['analytics', '📈 Revenue & Financial Analytics'],
    ['profile', '⚙️ My Account']
  ],
  patient: [
    ['overview', '📊 My Health Dashboard'],
    ['appointments', '📅 Book & View Appointments'],
    ['history', '📖 My Complete Medical History & Prescriptions'],
    ['billing', '💳 My Bills & Receipts'],
    ['lab-requests', '🔬 My Lab Reports'],
    ['documents', '📁 My Health Documents'],
    ['qrcode', '🪪 My Digital Hospital QR Card'],
    ['profile', '⚙️ My Account']
  ]
};

const ROLE_CREDENTIALS = {
  admin: ['admin@hms.com', 'Admin@123'],
  doctor: ['doctor@hms.com', 'Doctor@123'],
  nurse: ['nurse@hms.com', 'Nurse@123'],
  receptionist: ['reception@hms.com', 'Reception@123'],
  pharmacist: ['pharmacist@hms.com', 'Pharma@123'],
  accountant: ['accountant@hms.com', 'Account@123'],
  lab_staff: ['lab@hms.com', 'Lab@123'],
  patient: ['patient@hms.com', 'Patient@123']
};

async function switchRole(role) {
  const creds = ROLE_CREDENTIALS[role];
  if (!creds) return;
  try {
    const res = await Api.post('/auth/login', { email: creds[0], password: creds[1] });
    Api.setToken(res.data.token);
    Api.setUser(res.data.user);
    location.hash = 'overview';
    location.reload();
  } catch (err) {
    showToast('Failed to switch role: ' + err.message, 'error');
  }
}

function initShell() {
  document.getElementById('roleLabel').textContent = user.role.replace('_', ' ');
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userEmail').textContent = user.email;

  const roleBadge = document.getElementById('userRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = user.role.replace('_', ' ');
  }

  const roleSelect = document.getElementById('roleSwitch');
  if (roleSelect) {
    roleSelect.value = user.role;
  }

  const avatarEl = document.getElementById('userAvatarCircle');
  if (avatarEl) {
    avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
  }
  const shortNameEl = document.getElementById('userShortName');
  if (shortNameEl) {
    shortNameEl.textContent = (user.name || 'User').split(' ')[0];
  }

  startLiveClock();
  resetChatBot();

  const nav = document.getElementById('navMenu');
  const menu = MENUS[user.role] || MENUS.patient;
  nav.innerHTML = menu.map(([key, label]) =>
    `<div class="nav-item" data-view="${key}" onclick="location.hash='${key}'">${label}</div>`
  ).join('');

  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = 'overview';
  route();
  connectSocket();
  loadNotifications();
  setInterval(loadNotifications, 20000);
}

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
}

function connectSocket() {
  try {
    socket = io(Api.base.replace('/api', ''), { auth: { token: Api.token() } });
    socket.on('notification:new', () => loadNotifications());
    socket.on('bed:update', () => { if (location.hash === '#beds') renderBeds(); });
  } catch (e) { console.warn('Socket connection unavailable', e); }
}

function loadNotifications() {
  Api.get('/notifications').then(res => {
    const unread = res.data.filter((n) => !n.is_read);
    const countEl = document.getElementById('notifCount');
    if (countEl) {
      if (unread.length) { countEl.style.display = 'inline-block'; countEl.textContent = unread.length; }
      else countEl.style.display = 'none';
    }
    const notifListEl = document.getElementById('notifList');
    if (notifListEl) {
      notifListEl.innerHTML = res.data.length
        ? res.data.slice(0, 15).map((n) => `
          <div style="padding:10px 0; border-bottom:1px solid var(--color-border); ${n.is_read ? 'opacity:0.6;' : ''}">
            <div style="font-weight:600; font-size:13px;">${escapeHtml(n.title)}</div>
            <div style="font-size:13px; color:#64748b;">${escapeHtml(n.message)}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${fmtDateTime(n.created_at)}</div>
          </div>`).join('')
        : '<p class="text-muted">No notifications yet.</p>';
    }
  }).catch(() => {});
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  const show = panel.style.display === 'none';
  panel.style.display = show ? 'flex' : 'none';
}

async function renderBilling(param) {
  if (user.role === 'pharmacist') return renderPharmacyBilling(param);
  if (user.role === 'receptionist') return renderHospitalBilling(param);
  if (user.role === 'accountant') return renderMasterBilling(param);
  if (user.role === 'patient') return renderPatientBilling(param);
  return renderAdminBillingNotice();
}

// ---------------- Router ----------------
const ROUTES = {
  overview: renderOverview,
  patients: renderPatients,
  doctors: renderDoctors,
  staff: renderStaff,
  departments: renderDepartments,
  appointments: renderAppointments,
  beds: renderBeds,
  admissions: renderAdmissions,
  tasks: renderTasks,
  'pharmacy-inventory': renderPharmacyInventory,
  'pharmacy-prescriptions': renderPharmacyPrescriptions,
  'pharmacy-sales': renderPharmacyBilling,
  'lab-tests': renderLabTests,
  'lab-requests': renderLabRequests,
  insurance: renderInsurance,
  billing: renderBilling,
  'hospital-billing': renderHospitalBilling,
  'pharmacy-billing': renderPharmacyBilling,
  'master-billing': renderMasterBilling,
  consultation: renderConsultation,
  'ai-triage': renderAiTriage,
  analytics: renderAnalytics,
  'audit-logs': renderAuditLogs,
  'system-settings': renderSystemSettings,
  profile: renderProfile,
  history: renderHistory,
  documents: renderDocuments,
  qrcode: renderQrCode
};

function route() {
  const hash = location.hash.replace('#', '') || 'overview';
  const [view, param] = hash.split(':');
  setActiveNav(view);
  const titles = {}; MENUS[user.role]?.forEach(([k, l]) => titles[k] = l);
  document.getElementById('pageTitle').textContent = (titles[view] || view).replace(/^[^\s]+\s/, '');
  const fn = ROUTES[view] || renderNotFound;
  document.getElementById('content').innerHTML = '<p class="text-muted">Loading...</p>';
  try {
    const res = fn(param);
    if (res && typeof res.catch === 'function') {
      res.catch((err) => {
        document.getElementById('content').innerHTML = `<div class="card"><p style="color:#dc2626;">${escapeHtml(err.message)}</p></div>`;
      });
    }
  } catch (err) {
    document.getElementById('content').innerHTML = `<div class="card"><p style="color:#dc2626;">${escapeHtml(err.message)}</p></div>`;
  }
}

async function renderNotFound() {
  document.getElementById('content').innerHTML = '<div class="empty-state">Page not available for your role.</div>';
}


// ---------------- Shared UI helpers ----------------
function renderTable(columns, rows, rowRenderer) {
  if (!rows.length) return '<div class="empty-state">No records found.</div>';
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(rowRenderer).join('')}</tbody>
  </table></div>`;
}

function openModal(innerHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dynamicModal';
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  overlay.innerHTML = `<div class="modal">${innerHtml}</div>`;
  document.body.appendChild(overlay);
}
function closeModal() {
  const el = document.getElementById('dynamicModal');
  if (el) el.remove();
}

function toolbar(title, sub, buttonHtml) {
  return `<div class="toolbar">
    <div><div class="section-title">${title}</div><div class="section-sub">${sub || ''}</div></div>
    <div>${buttonHtml || ''}</div>
  </div>`;
}

/* ==========================================================================
   OVERVIEW / ANALYTICS
   ========================================================================== */
async function renderOverview() {
  const content = document.getElementById('content');
  if (['admin'].includes(user.role)) {
    const res = await Api.get('/analytics/overview');
    const d = res.data;
    content.innerHTML = `
      ${toolbar('Hospital Overview', 'Live snapshot across all departments')}
      <div class="kpi-grid">
        ${kpi('Total Patients', d.totalPatients)}
        ${kpi('Total Doctors', d.totalDoctors)}
        ${kpi("Today's Appointments", d.appointmentsToday)}
        ${kpi('Currently Admitted', d.currentlyAdmitted)}
        ${kpi('Bed Occupancy', d.bedOccupancyRate + '%')}
        ${kpi('Total Revenue', fmtMoney(d.totalRevenue))}
        ${kpi('Pending Lab Requests', d.pendingLabRequests)}
        ${kpi('Clinical Departments', 6)}
      </div>
      <div class="chart-wrap"><canvas id="trendChart" height="90"></canvas></div>
    `;
    try {
      const trend = await Api.get('/analytics/appointments-trend');
      new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: { labels: trend.data.map((r) => fmtDate(r.date)), datasets: [{ label: 'Appointments', data: trend.data.map((r) => r.count), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.3 }] },
        options: { plugins: { legend: { display: false } } }
      });
    } catch (e) {}
  } else if (user.role === 'patient') {
    const [apptRes, invRes] = await Promise.all([Api.get('/appointments'), Api.get('/billing/invoices')]);
    const outstanding = Math.max(0, invRes.data.reduce((s, i) => s + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0));
    const upcoming = apptRes.data.filter((a) => ['pending', 'confirmed'].includes(a.status)).length;
    content.innerHTML = `
      ${toolbar(`Welcome, ${user.name.split(' ')[0]}`, 'Your appointments, records and bills at a glance')}
      <div class="kpi-grid">
        ${kpi('Upcoming Appointments', upcoming)}
        ${kpi('Outstanding Balance', fmtMoney(outstanding))}
        ${kpi('Total Invoices', invRes.data.length)}
      </div>
      ${outstanding > 0 ? `
        <div class="card" style="border-left:4px solid var(--color-danger); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div><strong>You have an outstanding balance of ${fmtMoney(outstanding)}.</strong><div class="text-muted" style="font-size:13px;">Please visit the Hospital Reception or Accounts counter to settle your dues.</div></div>
          <button class="secondary" onclick="location.hash='billing'">👁️ View Bills</button>
        </div>` : `<div class="card" style="border-left:4px solid var(--color-success);">✅ No outstanding balance. You're all paid up!</div>`}
    `;
  } else {
    content.innerHTML = `
      ${toolbar(`Welcome, ${user.name.split(' ')[0]}`, `Role: ${user.role.replace('_', ' ')}`)}
      <div class="card">Use the sidebar to navigate your modules. Your recent notifications appear via the 🔔 bell above.</div>
    `;
  }
}

function kpi(label, value) {
  return `<div class="card kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`;
}

async function renderAnalytics() {
  const [rev, inv] = await Promise.all([Api.get('/analytics/revenue'), Api.get('/analytics/inventory-alerts')]);
  document.getElementById('content').innerHTML = `
    ${toolbar('Analytics', 'Revenue trend & pharmacy inventory alerts')}
    <div class="chart-wrap" style="margin-bottom:20px;"><canvas id="revChart" height="90"></canvas></div>
    <div class="card">
      <h3 class="mt-0" style="color:#d97706;">💊 Low Stock Medicines (Pharmacy Inventory Alert)</h3>
      ${renderTable(['Medicine', 'Current Stock Qty', 'Reorder Threshold'], inv.data.lowStockMedicines, (r) => `<tr><td><strong>${escapeHtml(r.medicine_name)}</strong></td><td><span class="badge badge-yellow">${r.quantity}</span></td><td>${r.reorder_level}</td></tr>`)}
    </div>
  `;
  new Chart(document.getElementById('revChart'), {
    type: 'bar',
    data: { labels: rev.data.map((r) => fmtDate(r.date)), datasets: [{ label: 'Revenue', data: rev.data.map((r) => r.total), backgroundColor: '#2563eb' }] },
    options: { plugins: { legend: { display: false } } }
  });
}

/* ==========================================================================
   PATIENTS & COMPREHENSIVE MEDICAL HISTORY (EHR)
   ========================================================================== */
async function renderPatients() {
  const res = await Api.get('/patients');
  const canManage = ['admin', 'receptionist'].includes(user.role);
  const isDoctor = user.role === 'doctor';
  const isPharmacist = user.role === 'pharmacist';
  const canBill = ['accountant', 'receptionist', 'admin', 'pharmacist'].includes(user.role);

  document.getElementById('content').innerHTML = `
    ${toolbar('Patients Directory', `${res.data.length} registered patients`, canManage ? '<button onclick="openPatientForm()">+ Register Patient</button>' : '')}
    ${renderTable(['MRN / ID', 'Name', 'Phone', 'Blood Group', 'Gender', 'Registered', 'Clinical Actions'], res.data, (p) => {
      let actions = '';
      if (isDoctor) {
        actions += `<button onclick="openConsultationModal(${p.id})">🩺 Consult & Prescribe</button> `;
      }
      if (canBill) {
        actions += `<button class="secondary" onclick="openUnifiedBillModal({ patient_id: ${p.id} })">💳 Bill</button> `;
      }
      actions += `<button class="secondary" onclick="viewPatientHistory(${p.id})">📖 Medical History</button> `;
      actions += `<button class="secondary" onclick="viewPatientQr(${p.id}, '${escapeHtml(p.name)}')">🪪 QR ID</button>`;
      return `<tr>
        <td><strong>#${p.id}</strong></td>
        <td><strong>${escapeHtml(p.name)}</strong><br><small class="text-muted">${escapeHtml(p.email)}</small></td>
        <td>${escapeHtml(p.phone || '-')}</td>
        <td><span class="badge badge-red">${p.blood_group || '-'}</span></td>
        <td>${escapeHtml(p.gender || '-')}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td style="white-space:nowrap;">${actions}</td>
      </tr>`;
    })}
  `;
}

function openPatientForm() {
  openModal(`
    <h3>Register New Patient</h3>
    <p class="section-sub">Create patient record and generate Digital Health QR card</p>
    <form id="patientForm">
      <div class="form-row"><div><label>Full Name *</label><input id="pf_name" required placeholder="e.g. Rahul Sharma"></div><div><label>Phone Number</label><input id="pf_phone" placeholder="e.g. 9876543210"></div></div>
      <div class="form-row"><div><label>Email Address *</label><input type="email" id="pf_email" required placeholder="patient@example.com"></div><div><label>Temporary Password *</label><input type="password" id="pf_password" required value="Patient@123"></div></div>
      <div class="form-row"><div><label>Date of Birth</label><input type="date" id="pf_dob"></div><div><label>Gender</label><select id="pf_gender"><option value="">Select Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div></div>
      <div class="form-row"><div><label>Blood Group</label><select id="pf_blood"><option value="">Select</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div><div><label>Emergency Contact Phone</label><input id="pf_emerphone"></div></div>
      <label>Permanent Residential Address</label><input id="pf_address" placeholder="Street, City, Pin Code">
      <div class="flex-between" style="margin-top:16px;"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Complete Registration</button></div>
    </form>
  `);
  document.getElementById('patientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/patients', {
        name: pf_name.value, phone: pf_phone.value, email: pf_email.value, password: pf_password.value,
        dob: pf_dob.value || null, gender: pf_gender.value || null, blood_group: pf_blood.value || null,
        address: pf_address.value || null, emergency_phone: pf_emerphone.value || null
      });
      showToast('Patient registered successfully.');
      closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// Generate HTML representation of patient complete medical history
function generateHistoryHtml(data, isModal = false) {
  const p = data.patient || {};
  const records = data.medicalRecords || [];
  const admissions = data.admissions || [];
  const labReports = data.labReports || [];

  return `
    <div style="background:#f1f5f9; border-radius:10px; padding:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="font-size:18px; font-weight:700; color:#0f172a;">${escapeHtml(p.name || 'Patient')} <small style="color:#64748b; font-weight:400;">(MRN: #${p.id})</small></div>
        <div style="font-size:13px; color:#475569; margin-top:4px;">
          <strong>Gender:</strong> ${escapeHtml(p.gender || '-')} &nbsp;|&nbsp; 
          <strong>DOB:</strong> ${fmtDate(p.dob) || '-'} &nbsp;|&nbsp; 
          <strong>Blood Group:</strong> <span class="badge badge-red">${p.blood_group || 'Unknown'}</span> &nbsp;|&nbsp; 
          <strong>Phone:</strong> ${escapeHtml(p.phone || '-')}
        </div>
      </div>
      <div>
        ${user.role === 'doctor' ? `<button onclick="openConsultationModal(${p.id})">🩺 New Consultation</button>` : ''}
      </div>
    </div>

    <div class="tab-group" id="historyTabGroup">
      <button class="tab-btn active" onclick="switchHistoryTab('consultations')">🩺 Consultations & Prescriptions (${records.length})</button>
      <button class="tab-btn" onclick="switchHistoryTab('admissions')">🏨 Inpatient Admissions (${admissions.length})</button>
      <button class="tab-btn" onclick="switchHistoryTab('lab')">🔬 Lab Diagnostic Reports (${labReports.length})</button>
    </div>

    <!-- Consultations & Prescriptions Tab -->
    <div id="tab_consultations" class="history-tab-pane">
      ${records.length ? `
        <div class="history-timeline">
          ${records.map((r, idx) => {
            let vitalsHtml = '';
            if (r.vitals_json) {
              try {
                const v = typeof r.vitals_json === 'string' ? JSON.parse(r.vitals_json) : r.vitals_json;
                vitalsHtml = `
                  <div class="vitals-pill-grid">
                    ${v.bp ? `<span class="vitals-pill">🩸 BP: ${escapeHtml(v.bp)} mmHg</span>` : ''}
                    ${v.pulse ? `<span class="vitals-pill">❤️ Pulse: ${escapeHtml(v.pulse)} bpm</span>` : ''}
                    ${v.temp ? `<span class="vitals-pill">🌡️ Temp: ${escapeHtml(v.temp)} °F</span>` : ''}
                    ${v.spo2 ? `<span class="vitals-pill">🫁 SpO2: ${escapeHtml(v.spo2)}%</span>` : ''}
                    ${v.weight ? `<span class="vitals-pill">⚖️ Weight: ${escapeHtml(v.weight)} kg</span>` : ''}
                  </div>`;
              } catch (e) {}
            }

            const rxRows = (r.prescriptions || []).map((rx) => `
              <tr>
                <td><strong>${escapeHtml(rx.medicine_name)}</strong></td>
                <td>${escapeHtml(rx.dosage || '-')}</td>
                <td><span class="badge badge-blue">${escapeHtml(rx.frequency || '1-0-1')}</span></td>
                <td>${escapeHtml(rx.timing || 'After Food')}</td>
                <td>${escapeHtml(rx.duration || '-')}</td>
                <td>${escapeHtml(rx.instructions || '-')}</td>
                <td>${badge(rx.status || 'pending', rx.status === 'dispensed' ? 'green' : 'yellow')}</td>
              </tr>
            `).join('');

            return `
              <div class="history-card">
                <div class="history-header">
                  <div>
                    <div style="font-weight:700; font-size:16px; color:#1e293b;">
                      Visit Date: ${fmtDate(r.visit_date)}
                    </div>
                    <div style="font-size:13px; color:#64748b; margin-top:2px;">
                      Attending Doctor: <strong>Dr. ${escapeHtml(r.doctor_name || 'Staff')}</strong> 
                      ${r.specialization ? `(${escapeHtml(r.specialization)})` : ''}
                      ${r.department_name ? `• ${escapeHtml(r.department_name)}` : ''}
                    </div>
                  </div>
                  <div>
                    ${user.role === 'doctor' ? `
                      <button class="secondary" style="font-size:12px; padding:4px 10px;" onclick='repeatPrescription(${JSON.stringify(r.prescriptions || []).replace(/'/g, "&apos;")}, ${p.id})'>
                        📋 Re-prescribe Meds
                      </button>` : ''}
                  </div>
                </div>

                <div style="margin: 10px 0;">
                  <div style="font-weight:600; font-size:14px; color:#0f172a;">Clinical Diagnosis:</div>
                  <div style="background:#f8fafc; padding:8px 12px; border-radius:6px; margin-top:4px; font-size:14px;">
                    ${escapeHtml(r.diagnosis || 'General Clinical Review')}
                  </div>
                </div>

                ${r.notes ? `
                  <div style="margin: 10px 0;">
                    <div style="font-weight:600; font-size:13px; color:#475569;">Doctor's Notes & Advice:</div>
                    <div style="font-size:13px; color:#334155; margin-top:2px;">${escapeHtml(r.notes)}</div>
                  </div>` : ''}

                ${vitalsHtml}

                <div style="margin-top:14px;">
                  <div style="font-weight:700; font-size:13px; text-transform:uppercase; color:#2563eb; letter-spacing:0.04em;">
                    💊 Prescribed Medicines (${r.prescriptions ? r.prescriptions.length : 0})
                  </div>
                  ${r.prescriptions && r.prescriptions.length ? `
                    <div class="table-wrap" style="margin-top:6px;">
                      <table class="rx-table">
                        <thead>
                          <tr>
                            <th>Medicine</th>
                            <th>Dosage</th>
                            <th>Frequency</th>
                            <th>Timing</th>
                            <th>Duration</th>
                            <th>Instructions</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>${rxRows}</tbody>
                      </table>
                    </div>` : '<p class="text-muted" style="font-size:13px; margin-top:4px;">No medicines prescribed for this visit.</p>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>` : '<div class="empty-state">No previous clinical consultations on record.</div>'}
    </div>

    <!-- Admissions Tab -->
    <div id="tab_admissions" class="history-tab-pane" style="display:none;">
      ${admissions.length ? `
        <div class="history-timeline">
          ${admissions.map(a => `
            <div class="history-card card-admission">
              <div class="flex-between">
                <strong>Room ${escapeHtml(a.room_no || '-')} / Bed ${escapeHtml(a.bed_no || '-')}</strong>
                ${badge(a.status, a.status === 'admitted' ? 'yellow' : 'green')}
              </div>
              <p style="font-size:13px; margin: 6px 0;">
                <strong>Admitted:</strong> ${fmtDateTime(a.admit_date)} &nbsp;|&nbsp; 
                <strong>Discharged:</strong> ${a.discharge_date ? fmtDateTime(a.discharge_date) : 'Still Inpatient'}
              </p>
              <p style="font-size:13px;"><strong>Reason:</strong> ${escapeHtml(a.reason || '-')}</p>
              ${a.doctor_name ? `<p style="font-size:13px;"><strong>Admitting Doctor:</strong> Dr. ${escapeHtml(a.doctor_name)}</p>` : ''}
              ${a.discharge_summary ? `<div style="background:#f8fafc; padding:10px; border-radius:6px; margin-top:8px; font-size:13px;"><strong>Discharge Summary:</strong> ${escapeHtml(a.discharge_summary)}</div>` : ''}
            </div>
          `).join('')}
        </div>` : '<div class="empty-state">No inpatient admissions recorded.</div>'}
    </div>

    <!-- Lab Reports Tab -->
    <div id="tab_lab" class="history-tab-pane" style="display:none;">
      ${labReports.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Category</th>
                <th>Requested Date</th>
                <th>Ordering Doctor</th>
                <th>Status</th>
                <th>Results & Reports</th>
              </tr>
            </thead>
            <tbody>
              ${labReports.map(l => `
                <tr>
                  <td><strong>${escapeHtml(l.test_name)}</strong></td>
                  <td>${escapeHtml(l.category || '-')}</td>
                  <td>${fmtDate(l.requested_at)}</td>
                  <td>${l.doctor_name ? 'Dr. ' + escapeHtml(l.doctor_name) : '-'}</td>
                  <td>${badge(l.status, statusColor(l.status))}</td>
                  <td>
                    ${l.result_summary ? `<div>${escapeHtml(l.result_summary)}</div>` : ''}
                    ${l.report_file ? `<a href="${Api.base}/lab/reports/${l.request_id}/download" target="_blank" style="font-size:12px; font-weight:600;">📥 Download Report</a>` : (!l.result_summary ? '-' : '')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : '<div class="empty-state">No lab diagnostic tests on record.</div>'}
    </div>
  `;
}

function switchHistoryTab(tabName) {
  document.querySelectorAll('#historyTabGroup .tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tabName));
  });
  document.querySelectorAll('.history-tab-pane').forEach(el => el.style.display = 'none');
  const target = document.getElementById('tab_' + tabName);
  if (target) target.style.display = 'block';
}

// Open modal to view patient medical history
async function viewPatientHistory(id) {
  try {
    const res = await Api.get(`/patients/${id}/history`);
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">📖 Electronic Health Record (EHR)</h3>
        <button class="secondary" onclick="closeModal()">✕ Close</button>
      </div>
      <div style="max-height:75vh; overflow-y:auto; padding-right:6px;">
        ${generateHistoryHtml(res.data, true)}
      </div>
    `);
    const modalEl = document.getElementById('dynamicModal')?.querySelector('.modal');
    if (modalEl) modalEl.classList.add('modal-xl');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Inline page render for patient history (#history or #history:patientId)
async function renderHistory(patientId) {
  let targetId = patientId || user.patientId;
  let selectorHtml = '';

  if (!targetId && ['admin', 'doctor', 'nurse', 'receptionist'].includes(user.role)) {
    const patients = await Api.get('/patients');
    if (patients.data.length > 0) targetId = patients.data[0].id;
    selectorHtml = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <label style="margin:0; font-weight:600;">Select Patient:</label>
        <select style="max-width:300px; margin:0;" onchange="renderHistory(this.value)">
          ${patients.data.map(p => `<option value="${p.id}" ${p.id == targetId ? 'selected' : ''}>${escapeHtml(p.name)} (#${p.id})</option>`).join('')}
        </select>
      </div>`;
  }

  if (!targetId) {
    document.getElementById('content').innerHTML = '<div class="empty-state">No patient selected.</div>';
    return;
  }

  const res = await Api.get(`/patients/${targetId}/history`);
  document.getElementById('content').innerHTML = `
    ${toolbar(user.role === 'patient' ? 'My Medical History' : 'Patient Health Record & Prescriptions', 'Complete clinical record, vitals timeline & prescription history')}
    ${selectorHtml}
    ${generateHistoryHtml(res.data, false)}
  `;
}

/* ==========================================================================
   DOCTOR CLINICAL WORKBENCH & PRESCRIPTION BUILDER
   ========================================================================== */
let rxDraftItems = [];

async function renderConsultation(param) {
  const [patientId, appointmentId] = (param || '').split('-');
  openConsultationModal(patientId ? parseInt(patientId, 10) : null, appointmentId ? parseInt(appointmentId, 10) : null, true);
}

async function openConsultationModal(patientId = null, appointmentId = null, renderInline = false) {
  const [patientsRes, invRes, labTestsRes] = await Promise.all([
    Api.get('/patients'),
    Api.get('/pharmacy/inventory'),
    Api.get('/lab/tests')
  ]);

  rxDraftItems = [];
  const selectedPatientId = patientId || (patientsRes.data[0] ? patientsRes.data[0].id : null);

  const containerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <div>
        <h3 style="margin:0; color:#0f172a;">🩺 Doctor Clinical Workbench & Prescribe</h3>
        <p class="section-sub" style="margin:0;">Record clinical diagnosis, enter vitals, and issue prescription with auto-history lookup</p>
      </div>
      ${!renderInline ? '<button class="secondary" onclick="closeModal()">✕ Close</button>' : ''}
    </div>

    <form id="consultationForm">
      <div style="display:grid; grid-template-columns: 1fr 1.3fr; gap:20px;">
        <!-- Left Column: Patient Details & Past History Preview -->
        <div>
          <label>Select Patient *</label>
          <select id="cs_patient" required onchange="loadPatientHistoryInWorkbench(this.value)" style="font-weight:600;">
            ${patientsRes.data.map(p => `<option value="${p.id}" ${p.id == selectedPatientId ? 'selected' : ''}>${escapeHtml(p.name)} (#${p.id}) - ${p.blood_group || 'No BG'} - ${p.gender || ''}</option>`).join('')}
          </select>
          <input type="hidden" id="cs_appointment_id" value="${appointmentId || ''}">

          <div style="margin-top:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:700; font-size:13px; color:#2563eb; text-transform:uppercase;">📖 Patient Past Medical History</span>
              <span id="cs_history_count" class="badge badge-gray">Loading...</span>
            </div>
            <div id="workbenchHistoryArea" style="max-height:480px; overflow-y:auto; border:1px solid var(--color-border); border-radius:8px; padding:12px; background:#f8fafc;">
              <p class="text-muted">Loading history...</p>
            </div>
          </div>
        </div>

        <!-- Right Column: Consultation Form & Prescription Builder -->
        <div>
          <div class="card" style="margin-bottom:14px; background:#ffffff;">
            <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:#0f172a;">1. Vitals & Examination</div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
              <div><label>BP (mmHg)</label><input id="cs_bp" placeholder="e.g. 120/80"></div>
              <div><label>Pulse (bpm)</label><input id="cs_pulse" placeholder="e.g. 76"></div>
              <div><label>Temp (°F)</label><input id="cs_temp" placeholder="e.g. 98.6"></div>
              <div><label>SpO2 (%)</label><input id="cs_spo2" placeholder="e.g. 99"></div>
              <div><label>Weight (kg)</label><input id="cs_weight" placeholder="e.g. 70"></div>
              <div><label>Resp Rate</label><input id="cs_rr" placeholder="e.g. 18"></div>
            </div>

            <div style="font-weight:700; font-size:14px; margin: 12px 0 8px; color:#0f172a;">2. Clinical Assessment</div>
            <label>Clinical Diagnosis *</label>
            <input id="cs_diagnosis" required placeholder="e.g. Acute Pharyngitis, Type 2 Diabetes, Hypertension">
            
            <label>Chief Complaints & Doctor Notes</label>
            <textarea id="cs_notes" rows="2" placeholder="Patient complaints, examination findings, dietary/lifestyle advice..."></textarea>
          </div>

          <!-- Prescription Builder -->
          <div class="card" style="background:#ffffff; margin-bottom:14px;">
            <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:#0f172a; display:flex; justify-content:space-between; align-items:center;">
              <span>3. Prescription Builder</span>
              <span style="font-size:12px; color:#16a34a; font-weight:600;">Linked with Pharmacy Inventory</span>
            </div>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:10px;">
              <div class="form-row">
                <div style="grid-column: span 2;">
                  <label>Select Medicine from Pharmacy Stock (or type custom)</label>
                  <select id="rx_med_select" onchange="autoFillMedicineDetails(this)">
                    <option value="">-- Choose Medicine from Stock --</option>
                    ${invRes.data.map(i => `<option value="${escapeHtml(i.medicine_name)}" data-price="${i.unit_price}" data-stock="${i.quantity}">${escapeHtml(i.medicine_name)} (Available: ${i.quantity} | ₹${i.unit_price})</option>`).join('')}
                  </select>
                  <input id="rx_custom_med" placeholder="Or type medicine name manually..." style="margin-top:-6px;">
                </div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                <div>
                  <label>Dosage</label>
                  <input id="rx_dosage" placeholder="e.g. 500 mg / 1 Tab" value="1 Tab">
                </div>
                <div>
                  <label>Frequency</label>
                  <select id="rx_freq">
                    <option value="1-0-1">1-0-1 (Twice daily)</option>
                    <option value="1-1-1">1-1-1 (Thrice daily)</option>
                    <option value="1-0-0">1-0-0 (Morning only)</option>
                    <option value="0-0-1">0-0-1 (Night only)</option>
                    <option value="SOS">SOS (As needed)</option>
                  </select>
                </div>
                <div>
                  <label>Timing</label>
                  <select id="rx_timing">
                    <option value="After Food">After Food</option>
                    <option value="Before Food">Before Food</option>
                    <option value="With Food">With Food</option>
                  </select>
                </div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1.5fr auto; gap:10px; align-items:flex-end;">
                <div>
                  <label>Duration</label>
                  <select id="rx_duration">
                    <option value="3 Days">3 Days</option>
                    <option value="5 Days" selected>5 Days</option>
                    <option value="7 Days">7 Days</option>
                    <option value="10 Days">10 Days</option>
                    <option value="14 Days">14 Days</option>
                    <option value="1 Month">1 Month</option>
                  </select>
                </div>
                <div>
                  <label>Special Instructions</label>
                  <input id="rx_instructions" placeholder="e.g. With warm water, plenty of fluids" value="Take with warm water">
                </div>
                <div>
                  <button type="button" onclick="addMedicineToPrescription()" style="height:38px;">+ Add Medicine</button>
                </div>
              </div>
            </div>

            <!-- Prescription Items Table -->
            <div id="rxDraftTableArea">
              <p class="text-muted" style="font-size:13px;">No medicines added to this prescription yet.</p>
            </div>
          </div>

          <!-- Order Lab Tests -->
          <div class="card" style="background:#ffffff; margin-bottom:16px;">
            <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:#0f172a;">4. Order Diagnostic Lab Tests (Optional)</div>
            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; max-height:140px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
              ${labTestsRes.data.map(lt => `
                <label style="display:flex; align-items:center; gap:8px; font-weight:normal; margin:0; cursor:pointer;">
                  <input type="checkbox" name="cs_lab_tests" value="${lt.id}" style="width:auto; margin:0;">
                  <span>${escapeHtml(lt.name)} <small class="text-muted">(₹${lt.price})</small></span>
                </label>
              `).join('')}
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px;">
            ${!renderInline ? '<button type="button" class="secondary" onclick="closeModal()">Cancel</button>' : ''}
            <button type="submit" style="padding:10px 24px; font-size:15px; background:var(--color-success);">
              💾 Save Consultation & Issue Prescription
            </button>
          </div>
        </div>
      </div>
    </form>
  `;

  if (renderInline) {
    document.getElementById('content').innerHTML = containerHtml;
  } else {
    openModal(containerHtml);
    const modalEl = document.getElementById('dynamicModal')?.querySelector('.modal');
    if (modalEl) modalEl.classList.add('modal-xl');
  }

  // Load initial history for selected patient
  if (selectedPatientId) {
    loadPatientHistoryInWorkbench(selectedPatientId);
  }

  document.getElementById('consultationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = document.getElementById('cs_patient').value;
    const apptId = document.getElementById('cs_appointment_id').value;
    const diagnosis = document.getElementById('cs_diagnosis').value.trim();
    const notes = document.getElementById('cs_notes').value.trim();

    const vitals = {
      bp: document.getElementById('cs_bp').value.trim(),
      pulse: document.getElementById('cs_pulse').value.trim(),
      temp: document.getElementById('cs_temp').value.trim(),
      spo2: document.getElementById('cs_spo2').value.trim(),
      weight: document.getElementById('cs_weight').value.trim(),
      rr: document.getElementById('cs_rr').value.trim()
    };

    const selectedLabTests = Array.from(document.querySelectorAll('input[name="cs_lab_tests"]:checked')).map(cb => parseInt(cb.value, 10));

    try {
      await Api.post('/medical-records', {
        patient_id: pid,
        appointment_id: apptId ? parseInt(apptId, 10) : undefined,
        diagnosis,
        notes,
        vitals,
        prescriptions: rxDraftItems,
        lab_tests: selectedLabTests
      });

      showToast('✅ Consultation saved and prescription permanently added to patient history!');
      if (!renderInline) closeModal();
      // Reload history view so the doctor/user sees it right away
      if (renderInline) {
        loadPatientHistoryInWorkbench(pid);
        document.getElementById('cs_diagnosis').value = '';
        document.getElementById('cs_notes').value = '';
        rxDraftItems = [];
        renderRxDraftTable();
      } else {
        route();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function autoFillMedicineDetails(selectEl) {
  const customInput = document.getElementById('rx_custom_med');
  if (selectEl.value) {
    customInput.value = selectEl.value;
  }
}

function addMedicineToPrescription() {
  const selectVal = document.getElementById('rx_med_select').value;
  const customVal = document.getElementById('rx_custom_med').value.trim();
  const medName = customVal || selectVal;

  if (!medName) {
    return showToast('Select or enter a medicine name.', 'error');
  }

  rxDraftItems.push({
    medicine_name: medName,
    dosage: document.getElementById('rx_dosage').value.trim() || '1 Tab',
    frequency: document.getElementById('rx_freq').value,
    timing: document.getElementById('rx_timing').value,
    duration: document.getElementById('rx_duration').value,
    instructions: document.getElementById('rx_instructions').value.trim()
  });

  document.getElementById('rx_custom_med').value = '';
  document.getElementById('rx_med_select').value = '';
  renderRxDraftTable();
}

function removeDraftRx(idx) {
  rxDraftItems.splice(idx, 1);
  renderRxDraftTable();
}

function renderRxDraftTable() {
  const area = document.getElementById('rxDraftTableArea');
  if (!area) return;

  if (!rxDraftItems.length) {
    area.innerHTML = '<p class="text-muted" style="font-size:13px;">No medicines added to this prescription yet.</p>';
    return;
  }

  area.innerHTML = `
    <div class="table-wrap">
      <table class="rx-table">
        <thead>
          <tr>
            <th>Medicine</th>
            <th>Dosage</th>
            <th>Frequency</th>
            <th>Timing</th>
            <th>Duration</th>
            <th>Instructions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rxDraftItems.map((rx, idx) => `
            <tr>
              <td><strong>${escapeHtml(rx.medicine_name)}</strong></td>
              <td>${escapeHtml(rx.dosage)}</td>
              <td><span class="badge badge-blue">${escapeHtml(rx.frequency)}</span></td>
              <td>${escapeHtml(rx.timing)}</td>
              <td>${escapeHtml(rx.duration)}</td>
              <td><small>${escapeHtml(rx.instructions)}</small></td>
              <td><button type="button" class="danger" style="padding:2px 8px; font-size:12px;" onclick="removeDraftRx(${idx})">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Loads previous history into the side panel of the doctor workbench
async function loadPatientHistoryInWorkbench(patientId) {
  const area = document.getElementById('workbenchHistoryArea');
  const countEl = document.getElementById('cs_history_count');
  if (!area) return;

  area.innerHTML = '<p class="text-muted">Loading past medical history...</p>';

  try {
    const res = await Api.get(`/patients/${patientId}/history`);
    const records = res.data.medicalRecords || [];
    if (countEl) countEl.textContent = `${records.length} prior visits`;

    if (!records.length) {
      area.innerHTML = '<p class="text-muted" style="font-size:13px; margin:10px 0;">First-time visitor: No previous consultations on record.</p>';
      return;
    }

    area.innerHTML = records.map((r, i) => `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:6px; padding:10px; margin-bottom:10px; font-size:13px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>📅 ${fmtDate(r.visit_date)}</strong>
          <span style="font-size:11px; color:#64748b;">Dr. ${escapeHtml(r.doctor_name || 'Staff')}</span>
        </div>
        <div style="margin-top:4px;"><strong>Diagnosis:</strong> ${escapeHtml(r.diagnosis || '-')}</div>
        ${r.notes ? `<div style="color:#64748b; font-size:12px;">Notes: ${escapeHtml(r.notes)}</div>` : ''}
        
        <div style="margin-top:6px; padding-top:6px; border-top:1px dashed #e2e8f0;">
          <div style="font-weight:600; font-size:11px; text-transform:uppercase; color:#0f172a; margin-bottom:4px;">Prescribed Meds:</div>
          ${(r.prescriptions || []).length ? `
            <ul style="margin:0; padding-left:16px; font-size:12px;">
              ${r.prescriptions.map(rx => `
                <li><strong>${escapeHtml(rx.medicine_name)}</strong> - ${escapeHtml(rx.dosage || '')} (${escapeHtml(rx.frequency || '')})</li>
              `).join('')}
            </ul>
            <button type="button" class="secondary" style="font-size:11px; padding:2px 8px; margin-top:6px;" onclick='repeatPrescription(${JSON.stringify(r.prescriptions || []).replace(/'/g, "&apos;")}, ${patientId})'>
              ⚡ Re-prescribe these
            </button>
          ` : '<span class="text-muted" style="font-size:11px;">None</span>'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    area.innerHTML = `<p style="color:#dc2626; font-size:13px;">Could not load history: ${escapeHtml(err.message)}</p>`;
  }
}

function repeatPrescription(prescriptions, patientId) {
  if (!Array.isArray(prescriptions)) return;
  prescriptions.forEach(p => {
    rxDraftItems.push({
      medicine_name: p.medicine_name,
      dosage: p.dosage || '1 Tab',
      frequency: p.frequency || '1-0-1',
      timing: p.timing || 'After Food',
      duration: p.duration || '5 Days',
      instructions: p.instructions || 'As prescribed'
    });
  });
  renderRxDraftTable();
  showToast(`Added ${prescriptions.length} medicines to prescription draft.`);
}


/* ==========================================================================
   DOCTORS / STAFF / DEPARTMENTS
   ========================================================================== */
async function renderDoctors() {
  const res = await Api.get('/doctors');
  const canCreate = user.role === 'admin';
  document.getElementById('content').innerHTML = `
    ${toolbar('Doctors', `${res.data.length} on staff`, canCreate ? '<button onclick="openStaffForm(\'doctor\')">+ Add Doctor</button>' : '')}
    ${renderTable(['Name', 'Department', 'Specialization', 'Fee', 'Availability'], res.data, (d) => `
      <tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.department || '-')}</td><td>${escapeHtml(d.specialization || '-')}</td>
      <td>${fmtMoney(d.consultation_fee)}</td><td>${escapeHtml(d.available_days)} ${escapeHtml(d.available_time)}</td></tr>
    `)}
  `;
}

async function renderStaff() {
  const res = await Api.get('/staff');
  const roles = ['nurse', 'receptionist', 'pharmacist', 'lab_staff', 'accountant'];
  document.getElementById('content').innerHTML = `
    ${toolbar('Staff Directory', `${res.data.length} staff members`, `
      <select id="newStaffRole" style="width:auto; display:inline-block; margin-right:8px; margin-bottom:0;">
        ${roles.map((r) => `<option value="${r}">${r.replace('_', ' ')}</option>`).join('')}
      </select>
      <button onclick="openStaffForm(document.getElementById('newStaffRole').value)">+ Add Staff</button>`)}
    ${renderTable(['Name', 'Email', 'Role', 'Department', 'Shift', 'Status'], res.data, (s) => `
      <tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.email)}</td><td>${badge(s.role.replace('_', ' '), 'blue')}</td>
      <td>${escapeHtml(s.department || '-')}</td><td>${escapeHtml(s.shift)}</td><td>${badge(s.status, statusColor(s.status))}</td></tr>
    `)}
  `;
}

function openStaffForm(role) {
  openModal(`
    <h3>Add ${role.replace('_', ' ')}</h3>
    <form id="staffForm">
      <div class="form-row"><div><label>Name *</label><input id="sf_name" required></div><div><label>Phone</label><input id="sf_phone"></div></div>
      <div class="form-row"><div><label>Email *</label><input type="email" id="sf_email" required></div><div><label>Password *</label><input type="password" id="sf_password" required></div></div>
      ${role === 'doctor' ? `
      <div class="form-row"><div><label>Specialization</label><input id="sf_spec"></div><div><label>Qualification</label><input id="sf_qual"></div></div>
      <label>Consultation Fee</label><input type="number" id="sf_fee" value="0">` : `<label>Shift</label><input id="sf_shift" value="Day">`}
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div>
    </form>
  `);
  document.getElementById('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/auth/staff/create', {
        name: sf_name.value, phone: sf_phone.value, email: sf_email.value, password: sf_password.value, role,
        specialization: document.getElementById('sf_spec')?.value, qualification: document.getElementById('sf_qual')?.value,
        consultation_fee: document.getElementById('sf_fee')?.value, shift: document.getElementById('sf_shift')?.value
      });
      showToast(`${role} account created.`);
      closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function renderDepartments() {
  const res = await Api.get('/staff/departments/all');
  document.getElementById('content').innerHTML = `
    ${toolbar('Departments', `${res.data.length} departments`, '<button onclick="openDeptForm()">+ Add Department</button>')}
    ${renderTable(['Name', 'Description'], res.data, (d) => `<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.description || '-')}</td></tr>`)}
  `;
}
function openDeptForm() {
  openModal(`<h3>Add Department</h3><form id="deptForm"><label>Name *</label><input id="d_name" required><label>Description</label><input id="d_desc">
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div></form>`);
  document.getElementById('deptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/staff/departments', { name: d_name.value, description: d_desc.value }); showToast('Department added.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   APPOINTMENTS
   ========================================================================== */
async function renderAppointments() {
  const res = await Api.get('/appointments');
  const canBook = ['patient', 'receptionist', 'admin'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Appointments', `${res.data.length} total`, canBook ? '<button onclick="openAppointmentForm()">+ Book Appointment</button>' : '')}
    ${renderTable(['Patient', 'Doctor', 'Date', 'Time', 'Status', 'Reason', 'Actions'], res.data, (a) => `
      <tr><td>${escapeHtml(a.patient_name)}</td><td>Dr. ${escapeHtml(a.doctor_name)}</td><td>${fmtDate(a.appointment_date)}</td>
      <td>${a.time_slot}</td><td>${badge(a.status, statusColor(a.status))}</td><td>${escapeHtml(a.reason || '-')}</td>
      <td>${appointmentActions(a)}</td></tr>
    `)}
  `;
}
function appointmentActions(a) {
  if (a.status === 'cancelled') return badge('cancelled', 'red');
  if (a.status === 'completed') {
    return `<span class="badge badge-green">Completed</span> <button class="secondary" style="font-size:12px; padding:3px 8px;" onclick="viewPatientHistory(${a.patient_id})">📖 EHR Record</button>`;
  }
  let html = '';
  if (user.role === 'doctor') {
    html += `<button onclick="openConsultationModal(${a.patient_id}, ${a.id})" style="background:var(--color-success); font-size:12px; padding:4px 10px;">🩺 Consult & Prescribe</button> `;
    html += `<button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="viewPatientHistory(${a.patient_id})">📖 EHR History</button> `;
  }
  if (['receptionist', 'admin'].includes(user.role) && a.status === 'pending') {
    html += `<button class="secondary" onclick="updateAppointment(${a.id}, {status:'confirmed'})">Confirm</button> `;
  }
  if (['receptionist', 'accountant', 'admin'].includes(user.role)) {
    html += `<button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="openUnifiedBillModal({ patient_id: ${a.patient_id} })">💳 Bill</button> `;
  }
  html += `<button class="danger" onclick="updateAppointment(${a.id}, {status:'cancelled'})">Cancel</button>`;
  return html;
}
async function updateAppointment(id, body) {
  try { await Api.put(`/appointments/${id}`, body); showToast('Appointment updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}


async function openAppointmentForm() {
  const doctors = await Api.get('/doctors');
  let patientField = '';
  if (user.role !== 'patient') {
    const patients = await Api.get('/patients');
    patientField = `<label>Patient *</label><select id="ap_patient" required>${patients.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>`;
  }
  openModal(`
    <h3>Book Appointment</h3>
    <form id="apForm">
      ${patientField}
      <label>Doctor *</label><select id="ap_doctor" required onchange="loadSlots()">${doctors.data.map((d) => `<option value="${d.id}">Dr. ${escapeHtml(d.name)} (${escapeHtml(d.specialization || 'General')})</option>`).join('')}</select>
      <label>Date *</label><input type="date" id="ap_date" required onchange="loadSlots()">
      <label>Time Slot *</label><select id="ap_slot" required><option>Select date & doctor first</option></select>
      <label>Reason</label><input id="ap_reason">
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Book</button></div>
    </form>
  `);
  document.getElementById('apForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/appointments', {
        patient_id: document.getElementById('ap_patient')?.value,
        doctor_id: ap_doctor.value, appointment_date: ap_date.value, time_slot: ap_slot.value, reason: ap_reason.value
      });
      showToast('Appointment booked.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}
async function loadSlots() {
  const doctorId = document.getElementById('ap_doctor').value;
  const date = document.getElementById('ap_date').value;
  if (!doctorId || !date) return;
  const res = await Api.get(`/appointments/slots?doctorId=${doctorId}&date=${date}`);
  const slotEl = document.getElementById('ap_slot');
  slotEl.innerHTML = res.data.length ? res.data.map((s) => `<option value="${s}">${s}</option>`).join('') : '<option value="">No slots available</option>';
}

/* ==========================================================================
   BEDS / ROOMS / ADMISSIONS
   ========================================================================== */
async function renderBeds() {
  const [beds, rooms] = await Promise.all([Api.get('/beds'), Api.get('/beds/rooms')]);
  const canManage = ['admin', 'nurse', 'receptionist'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Beds & Rooms', `${beds.data.length} beds across ${rooms.data.length} rooms`, user.role === 'admin' ? '<button onclick="openRoomBedForm()">+ Add Room/Bed</button>' : '')}
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;">
      ${beds.data.map((b) => `
        <div class="card" style="text-align:center;">
          <div style="font-weight:700;">${escapeHtml(b.room_no)}-${escapeHtml(b.bed_no)}</div>
          <div class="text-muted" style="font-size:12px; text-transform:capitalize;">${b.room_type}</div>
          <div style="margin:8px 0;">${badge(b.status, statusColor(b.status))}</div>
          ${b.current_patient ? `<div style="font-size:12px;">${escapeHtml(b.current_patient)}</div>` : ''}
          ${canManage && b.status !== 'occupied' ? `
            <select onchange="setBedStatus(${b.id}, this.value)" style="margin-top:8px; margin-bottom:0; font-size:12px;">
              <option value="">Change status</option>
              <option value="available">Available</option>
              <option value="maintenance">Maintenance</option>
            </select>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}
async function setBedStatus(id, status) {
  if (!status) return;
  try { await Api.put(`/beds/${id}/status`, { status }); showToast('Bed status updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function openRoomBedForm() {
  const depts = await Api.get('/staff/departments/all');
  openModal(`
    <h3>Add Room & Bed</h3>
    <form id="roomBedForm">
      <div class="form-row"><div><label>Room No *</label><input id="rb_room" required></div><div><label>Floor</label><input id="rb_floor"></div></div>
      <div class="form-row">
        <div><label>Room Type</label><select id="rb_type"><option value="general">General</option><option value="private">Private</option><option value="icu">ICU</option><option value="operation_theatre">Operation Theatre</option></select></div>
        <div><label>Department</label><select id="rb_dept"><option value="">-</option>${depts.data.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}</select></div>
      </div>
      <div class="form-row"><div><label>Bed No *</label><input id="rb_bedno" required value="A"></div><div><label>Daily Rate</label><input type="number" id="rb_rate" value="800"></div></div>
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div>
    </form>
  `);
  document.getElementById('roomBedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const room = await Api.post('/beds/rooms', { room_no: rb_room.value, type: rb_type.value, department_id: rb_dept.value || null, floor: rb_floor.value });
      await Api.post('/beds', { room_id: room.data.id, bed_no: rb_bedno.value, daily_rate: rb_rate.value });
      showToast('Room & bed created.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function renderAdmissions() {
  const res = await Api.get('/beds/admissions/all');
  const canAdmit = ['admin', 'receptionist', 'emergency_staff'].includes(user.role);
  const canDischarge = ['admin', 'doctor'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Admissions', `${res.data.length} records`, canAdmit ? '<button onclick="openAdmitForm()">+ Admit Patient</button>' : '')}
    ${renderTable(['Patient', 'Bed', 'Doctor', 'Admitted', 'Discharged', 'Status', 'Actions'], res.data, (a) => `
      <tr><td>${escapeHtml(a.patient_name)}</td><td>${escapeHtml(a.room_no)}-${escapeHtml(a.bed_no)}</td>
      <td>${a.doctor_name ? 'Dr. ' + escapeHtml(a.doctor_name) : '-'}</td><td>${fmtDateTime(a.admit_date)}</td>
      <td>${a.discharge_date ? fmtDateTime(a.discharge_date) : '-'}</td><td>${badge(a.status, statusColor(a.status))}</td>
      <td>${canDischarge && a.status === 'admitted' ? `<button class="secondary" onclick="dischargePatient(${a.id})">Discharge</button>` : '-'}</td></tr>
    `)}
  `;
}
async function openAdmitForm() {
  const [patients, beds, doctors] = await Promise.all([Api.get('/patients'), Api.get('/beds'), Api.get('/doctors')]);
  const availableBeds = beds.data.filter((b) => b.status === 'available');
  openModal(`
    <h3>Admit Patient</h3>
    <form id="admitForm">
      <label>Patient *</label><select id="ad_patient" required>${patients.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
      <label>Bed *</label><select id="ad_bed" required>${availableBeds.map((b) => `<option value="${b.id}">${escapeHtml(b.room_no)}-${escapeHtml(b.bed_no)} (${b.room_type})</option>`).join('')}</select>
      <label>Attending Doctor</label><select id="ad_doctor"><option value="">-</option>${doctors.data.map((d) => `<option value="${d.id}">Dr. ${escapeHtml(d.name)}</option>`).join('')}</select>
      <label>Reason</label><input id="ad_reason">
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Admit</button></div>
    </form>
  `);
  document.getElementById('admitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/beds/admissions', { patient_id: ad_patient.value, bed_id: ad_bed.value, doctor_id: ad_doctor.value || null, reason: ad_reason.value });
      showToast('Patient admitted.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}
async function dischargePatient(id) {
  const summary = prompt('Discharge summary (optional):') || '';
  try {
    const res = await Api.put(`/beds/admissions/${id}/discharge`, { discharge_summary: summary });
    showToast(`Patient discharged. Invoice #${res.data.invoiceId} generated.`); route();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ==========================================================================
   TASKS (staff communication)
   ========================================================================== */
async function renderTasks() {
  const res = await Api.get('/tasks');
  document.getElementById('content').innerHTML = `
    ${toolbar('Tasks', `${res.data.length} tasks`, '<button onclick="openTaskForm()">+ Assign Task</button>')}
    ${renderTable(['Title', 'Assigned To', 'Assigned By', 'Priority', 'Status', 'Due', 'Actions'], res.data, (t) => `
      <tr><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.assigned_to_name)}</td><td>${escapeHtml(t.assigned_by_name)}</td>
      <td>${badge(t.priority, t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'yellow' : 'gray')}</td>
      <td>${badge(t.status, statusColor(t.status))}</td><td>${t.due_date ? fmtDateTime(t.due_date) : '-'}</td>
      <td>${t.status !== 'completed' ? `<select onchange="updateTaskStatus(${t.id}, this.value)"><option value="">Update</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select>` : '-'}</td></tr>
    `)}
  `;
}
async function updateTaskStatus(id, status) {
  if (!status) return;
  try { await Api.put(`/tasks/${id}`, { status }); showToast('Task updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function openTaskForm() {
  const staff = await Api.get('/staff');
  openModal(`
    <h3>Assign Task</h3>
    <form id="taskForm">
      <label>Assign To *</label><select id="tk_to" required>${staff.data.map((s) => `<option value="${s.user_id}">${escapeHtml(s.name)} (${s.role})</option>`).join('')}</select>
      <label>Title *</label><input id="tk_title" required>
      <label>Description</label><textarea id="tk_desc" rows="3"></textarea>
      <div class="form-row">
        <div><label>Priority</label><select id="tk_priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
        <div><label>Due Date</label><input type="datetime-local" id="tk_due"></div>
      </div>
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Assign</button></div>
    </form>
  `);
  document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/tasks', {
        assigned_to: tk_to.value, title: tk_title.value, description: tk_desc.value,
        priority: tk_priority.value, due_date: tk_due.value || null
      });
      showToast('Task assigned.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   PHARMACY
   ========================================================================== */
async function renderPharmacyInventory() {
  const res = await Api.get('/pharmacy/inventory');
  const canManage = ['pharmacist', 'admin'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Pharmacy Inventory', `${res.data.length} items`, canManage ? '<button onclick="openInventoryForm()">+ Add Medicine</button>' : '')}
    ${renderTable(['Medicine', 'Category', 'Batch', 'Expiry', 'Qty', 'Unit Price', 'Reorder Level'], res.data, (i) => `
      <tr><td>${escapeHtml(i.medicine_name)}</td><td>${escapeHtml(i.category || '-')}</td><td>${escapeHtml(i.batch_no || '-')}</td>
      <td>${fmtDate(i.expiry_date)}</td><td>${i.quantity <= i.reorder_level ? badge(i.quantity, 'red') : i.quantity}</td>
      <td>${fmtMoney(i.unit_price)}</td><td>${i.reorder_level}</td></tr>
    `)}
  `;
}
function openInventoryForm() {
  openModal(`
    <h3>Add Medicine</h3>
    <form id="invForm">
      <label>Medicine Name *</label><input id="inv_name" required>
      <div class="form-row"><div><label>Category</label><input id="inv_cat"></div><div><label>Batch No</label><input id="inv_batch"></div></div>
      <div class="form-row"><div><label>Expiry Date</label><input type="date" id="inv_exp"></div><div><label>Quantity *</label><input type="number" id="inv_qty" required></div></div>
      <div class="form-row"><div><label>Unit Price *</label><input type="number" step="0.01" id="inv_price" required></div><div><label>Reorder Level</label><input type="number" id="inv_reorder" value="10"></div></div>
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div>
    </form>
  `);
  document.getElementById('invForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/pharmacy/inventory', { medicine_name: inv_name.value, category: inv_cat.value, batch_no: inv_batch.value, expiry_date: inv_exp.value || null, quantity: inv_qty.value, unit_price: inv_price.value, reorder_level: inv_reorder.value });
      showToast('Medicine added.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

let posCart = [];
async function renderPharmacySales() {
  const canSell = user.role === 'pharmacist';
  const res = await Api.get('/pharmacy/sales');
  let posSection = '';
  if (canSell) {
    const inv = await Api.get('/pharmacy/inventory');
    window._invCache = inv.data;
    posSection = `
      <div class="card" style="margin-bottom:20px;">
        <h3 class="mt-0">New Sale (POS)</h3>
        <div class="form-row">
          <div><label>Patient (optional)</label><input id="pos_patient_id" placeholder="Patient ID (numeric, optional)"></div>
          <div><label>Medicine</label><select id="pos_medicine">${inv.data.map((i) => `<option value="${i.id}" data-price="${i.unit_price}" data-stock="${i.quantity}">${escapeHtml(i.medicine_name)} (Stock: ${i.quantity})</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div><label>Quantity</label><input type="number" id="pos_qty" value="1" min="1"></div>
          <div style="display:flex; align-items:flex-end;"><button type="button" onclick="addToCart()" style="width:100%; justify-content:center;">Add to Cart</button></div>
        </div>
        <div id="cartArea"></div>
      </div>`;
  }
  document.getElementById('content').innerHTML = `
    ${toolbar('Pharmacy Sales', `${res.data.length} sales recorded`)}
    ${posSection}
    ${renderTable(['#', 'Patient', 'Pharmacist', 'Date', 'Total'], res.data, (s) => `
      <tr><td>${s.id}</td><td>${escapeHtml(s.patient_name || 'Walk-in')}</td><td>${escapeHtml(s.pharmacist_name)}</td><td>${fmtDateTime(s.sale_date)}</td><td>${fmtMoney(s.total_amount)}</td></tr>
    `)}
  `;
  if (canSell) renderCart();
}
function addToCart() {
  const sel = document.getElementById('pos_medicine');
  const opt = sel.selectedOptions[0];
  const qty = parseInt(document.getElementById('pos_qty').value || '1', 10);
  const stock = parseInt(opt.dataset.stock, 10);
  if (qty > stock) return showToast('Not enough stock.', 'error');
  posCart.push({ inventory_id: parseInt(sel.value, 10), name: opt.textContent, price: parseFloat(opt.dataset.price), quantity: qty });
  renderCart();
}
function renderCart() {
  const area = document.getElementById('cartArea');
  if (!area) return;
  const total = posCart.reduce((s, i) => s + i.price * i.quantity, 0);
  const rowsHtml = posCart.map((i, idx) => `
      <tr><td>${escapeHtml(i.name)}</td><td>${i.quantity}</td><td>${fmtMoney(i.price)}</td><td>${fmtMoney(i.price * i.quantity)}</td>
      <td><button class="danger" onclick="removeFromCart(${idx})">✕</button></td></tr>`).join('');
  area.innerHTML = `
    ${posCart.length ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>` : '<p class="text-muted">Cart is empty.</p>'}
    ${posCart.length ? `<div class="flex-between" style="margin-top:10px;"><strong>Total: ${fmtMoney(total)}</strong><button onclick="checkoutSale()">Complete Sale</button></div>` : ''}
  `;
}
function removeFromCart(idx) { posCart.splice(idx, 1); renderCart(); }
async function checkoutSale() {
  try {
    const patientId = document.getElementById('pos_patient_id').value || null;
    await Api.post('/pharmacy/sales', { patient_id: patientId, items: posCart.map((i) => ({ inventory_id: i.inventory_id, quantity: i.quantity })) });
    showToast('Sale completed.');
    posCart = [];
    route();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ==========================================================================
   LAB
   ========================================================================== */
async function renderLabTests() {
  const res = await Api.get('/lab/tests');
  const canAdd = ['admin', 'lab_staff'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Lab Test Catalog', `${res.data.length} tests`, canAdd ? '<button onclick="openLabTestForm()">+ Add Test</button>' : '')}
    ${renderTable(['Name', 'Category', 'Price'], res.data, (t) => `<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.category || '-')}</td><td>${fmtMoney(t.price)}</td></tr>`)}
  `;
}
function openLabTestForm() {
  openModal(`<h3>Add Lab Test</h3><form id="ltForm"><label>Name *</label><input id="lt_name" required>
    <div class="form-row"><div><label>Category</label><input id="lt_cat"></div><div><label>Price</label><input type="number" id="lt_price" value="0"></div></div>
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div></form>`);
  document.getElementById('ltForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/lab/tests', { name: lt_name.value, category: lt_cat.value, price: lt_price.value }); showToast('Test added.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

async function renderLabRequests() {
  if (user.role === 'patient') return renderMyLabReports();
  const res = await Api.get('/lab/requests');
  const canRequest = ['doctor', 'receptionist', 'admin', 'emergency_staff'].includes(user.role);
  const isLab = user.role === 'lab_staff' || user.role === 'admin';
  document.getElementById('content').innerHTML = `
    ${toolbar('Lab Requests', `${res.data.length} requests`, canRequest ? '<button onclick="openLabRequestForm()">+ New Request</button>' : '')}
    ${renderTable(['Patient', 'Test', 'Doctor', 'Status', 'Requested', 'Actions'], res.data, (r) => `
      <tr><td>${escapeHtml(r.patient_name)}</td><td>${escapeHtml(r.test_name)}</td><td>${r.doctor_name ? 'Dr. ' + escapeHtml(r.doctor_name) : '-'}</td>
      <td>${badge(r.status, statusColor(r.status))}</td><td>${fmtDateTime(r.requested_at)}</td>
      <td>${isLab ? labRequestActions(r) : '-'}</td></tr>
    `)}
  `;
}
function labRequestActions(r) {
  if (r.status === 'completed' || r.status === 'cancelled') return '-';
  const nextMap = { requested: 'sample_collected', sample_collected: 'in_progress', in_progress: 'completed' };
  const next = nextMap[r.status];
  let html = next ? `<button class="secondary" onclick="advanceLabRequest(${r.id}, '${next}')">Mark ${next.replace('_', ' ')}</button> ` : '';
  if (r.status === 'in_progress' || r.status === 'sample_collected') {
    html += `<button onclick="openReportUpload(${r.id})">Upload Report</button>`;
  }
  return html;
}
async function advanceLabRequest(id, status) {
  try { await Api.put(`/lab/requests/${id}`, { status }); showToast('Status updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function openLabRequestForm() {
  const [patients, tests] = await Promise.all([Api.get('/patients'), Api.get('/lab/tests')]);
  openModal(`
    <h3>New Lab Request</h3>
    <form id="lrForm">
      <label>Patient *</label><select id="lr_patient" required>${patients.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
      <label>Test *</label><select id="lr_test" required>${tests.data.map((t) => `<option value="${t.id}">${escapeHtml(t.name)} (${fmtMoney(t.price)})</option>`).join('')}</select>
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Request</button></div>
    </form>
  `);
  document.getElementById('lrForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/lab/requests', { patient_id: lr_patient.value, test_id: lr_test.value }); showToast('Lab test requested.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}
function openReportUpload(requestId) {
  openModal(`
    <h3>Upload Lab Report</h3>
    <form id="repForm">
      <label>Result Summary</label><textarea id="rep_summary" rows="3"></textarea>
      <label>Report File (PDF/Image)</label><input type="file" id="rep_file">
      <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Upload</button></div>
    </form>
  `);
  document.getElementById('repForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('result_summary', document.getElementById('rep_summary').value);
      const file = document.getElementById('rep_file').files[0];
      if (file) fd.append('file', file);
      await Api.postForm(`/lab/requests/${requestId}/report`, fd);
      showToast('Report uploaded.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}
async function renderMyLabReports() {
  const res = await Api.get(`/lab/reports/patient/${user.patientId}`);
  document.getElementById('content').innerHTML = `
    ${toolbar('My Lab Reports', `${res.data.length} test(s)`)}
    ${renderTable(['Test', 'Status', 'Summary', 'Uploaded', 'Report'], res.data, (r) => `
      <tr><td>${escapeHtml(r.test_name)}</td><td>${badge(r.status, statusColor(r.status))}</td><td>${escapeHtml(r.result_summary || '-')}</td>
      <td>${r.uploaded_at ? fmtDateTime(r.uploaded_at) : '-'}</td>
      <td>${r.report_file ? `<a href="${Api.base}/lab/requests/${r.request_id}/report/file" target="_blank">View</a>` : '-'}</td></tr>
    `)}
  `;
}

/* ==========================================================================
   BLOOD BANK
   ========================================================================== */
async function renderBloodBank() {
  const res = await Api.get('/bloodbank/inventory');
  const canEdit = ['blood_bank', 'admin'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Blood Bank Inventory', 'Units available by group')}
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px;">
      ${res.data.map((b) => `
        <div class="card" style="text-align:center;">
          <div style="font-size:22px; font-weight:700; color:#dc2626;">${b.blood_group}</div>
          <div style="font-size:24px; font-weight:700; margin:6px 0;">${b.units_available}</div>
          <div class="text-muted" style="font-size:12px;">units</div>
          ${canEdit ? `<button class="secondary" style="margin-top:8px; font-size:12px;" onclick="editBloodUnits(${b.id}, ${b.units_available})">Update</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}
async function editBloodUnits(id, current) {
  const val = prompt('Set units available:', current);
  if (val === null) return;
  try { await Api.put(`/bloodbank/inventory/${id}`, { units_available: parseInt(val, 10) }); showToast('Inventory updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function renderDonors() {
  const res = await Api.get('/bloodbank/donors');
  document.getElementById('content').innerHTML = `
    ${toolbar('Blood Donors', `${res.data.length} registered`, '<button onclick="openDonorForm()">+ Register Donor</button>')}
    ${renderTable(['Name', 'Blood Group', 'Phone', 'Last Donation'], res.data, (d) => `<tr><td>${escapeHtml(d.name)}</td><td>${d.blood_group}</td><td>${escapeHtml(d.phone || '-')}</td><td>${fmtDate(d.last_donation_date)}</td></tr>`)}
  `;
}
function openDonorForm() {
  openModal(`<h3>Register Donor</h3><form id="donorForm">
    <label>Name *</label><input id="dn_name" required>
    <div class="form-row"><div><label>Blood Group *</label><input id="dn_group" required placeholder="O+"></div><div><label>Phone</label><input id="dn_phone"></div></div>
    <label>Last Donation Date</label><input type="date" id="dn_date">
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div></form>`);
  document.getElementById('donorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/bloodbank/donors', { name: dn_name.value, blood_group: dn_group.value, phone: dn_phone.value, last_donation_date: dn_date.value || null }); showToast('Donor registered.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}
async function renderBloodRequests() {
  const res = await Api.get('/bloodbank/requests');
  const canRequest = ['doctor', 'receptionist', 'admin', 'emergency_staff'].includes(user.role);
  const canFulfill = ['blood_bank', 'admin'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Blood Requests', `${res.data.length} requests`, canRequest ? '<button onclick="openBloodRequestForm()">+ New Request</button>' : '')}
    ${renderTable(['Patient', 'Group', 'Units', 'Requested By', 'Status', 'Actions'], res.data, (r) => `
      <tr><td>${escapeHtml(r.patient_name || '-')}</td><td>${r.blood_group}</td><td>${r.units_required}</td><td>${escapeHtml(r.requested_by_name || '-')}</td>
      <td>${badge(r.status, statusColor(r.status))}</td>
      <td>${canFulfill && r.status === 'pending' ? `<button class="secondary" onclick="updateBloodRequest(${r.id}, 'approved')">Approve</button> <button onclick="updateBloodRequest(${r.id}, 'fulfilled')">Fulfil</button> <button class="danger" onclick="updateBloodRequest(${r.id}, 'rejected')">Reject</button>` : '-'}</td></tr>
    `)}
  `;
}
async function updateBloodRequest(id, status) {
  try { await Api.put(`/bloodbank/requests/${id}`, { status }); showToast('Request updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function openBloodRequestForm() {
  const patients = await Api.get('/patients');
  openModal(`<h3>New Blood Request</h3><form id="brForm">
    <label>Patient</label><select id="br_patient"><option value="">-</option>${patients.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
    <div class="form-row"><div><label>Blood Group *</label><input id="br_group" required placeholder="O+"></div><div><label>Units Required *</label><input type="number" id="br_units" required min="1"></div></div>
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Submit</button></div></form>`);
  document.getElementById('brForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/bloodbank/requests', { patient_id: br_patient.value || null, blood_group: br_group.value, units_required: br_units.value }); showToast('Blood request submitted.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   EMERGENCY & AMBULANCES
   ========================================================================== */
async function renderEmergency() {
  const res = await Api.get('/emergency/cases');
  const canCreate = ['emergency_staff', 'receptionist', 'admin'].includes(user.role);
  const canUpdate = ['emergency_staff', 'doctor', 'admin'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Emergency Cases', `${res.data.length} logged`, canCreate ? '<button onclick="openEmergencyForm()">+ Log Case</button>' : '')}
    ${renderTable(['Patient', 'Type', 'Severity', 'Ambulance', 'Doctor', 'Status', 'Actions'], res.data, (c) => `
      <tr><td>${escapeHtml(c.patient_name || 'Unregistered')}</td><td>${escapeHtml(c.case_type || '-')}</td>
      <td>${badge(c.severity, c.severity === 'critical' ? 'red' : c.severity === 'high' ? 'yellow' : 'gray')}</td>
      <td>${escapeHtml(c.vehicle_no || '-')}</td><td>${c.doctor_name ? 'Dr. ' + escapeHtml(c.doctor_name) : '-'}</td>
      <td>${badge(c.status, statusColor(c.status))}</td>
      <td>${canUpdate && c.status !== 'closed' ? `<select onchange="updateEmergencyCase(${c.id}, this.value)"><option value="">Update</option><option value="dispatched">Dispatched</option><option value="arrived">Arrived</option><option value="admitted">Admitted</option><option value="closed">Closed</option></select>` : '-'}</td></tr>
    `)}
  `;
}
async function updateEmergencyCase(id, status) {
  if (!status) return;
  try { await Api.put(`/emergency/cases/${id}`, { status }); showToast('Case updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function openEmergencyForm() {
  const [patients, ambulances] = await Promise.all([Api.get('/patients'), Api.get('/emergency/ambulances')]);
  const availableAmb = ambulances.data.filter((a) => a.status === 'available');
  openModal(`<h3>Log Emergency Case</h3><form id="emForm">
    <label>Patient (if known)</label><select id="em_patient"><option value="">Unregistered</option>${patients.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
    <div class="form-row"><div><label>Case Type</label><input id="em_type" placeholder="e.g. Road accident"></div><div><label>Severity</label><select id="em_severity"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div></div>
    <label>Ambulance</label><select id="em_amb"><option value="">-</option>${availableAmb.map((a) => `<option value="${a.id}">${escapeHtml(a.vehicle_no)}</option>`).join('')}</select>
    <label>Notes</label><textarea id="em_notes" rows="2"></textarea>
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Log Case</button></div></form>`);
  document.getElementById('emForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/emergency/cases', { patient_id: em_patient.value || null, case_type: em_type.value, severity: em_severity.value, ambulance_id: em_amb.value || null, notes: em_notes.value }); showToast('Case logged.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}
async function renderAmbulances() {
  const res = await Api.get('/emergency/ambulances');
  document.getElementById('content').innerHTML = `
    ${toolbar('Ambulance Fleet', `${res.data.length} vehicles`, '<button onclick="openAmbulanceForm()">+ Add Ambulance</button>')}
    ${renderTable(['Vehicle No', 'Driver', 'Phone', 'Status', 'Actions'], res.data, (a) => `
      <tr><td>${escapeHtml(a.vehicle_no)}</td><td>${escapeHtml(a.driver_name || '-')}</td><td>${escapeHtml(a.driver_phone || '-')}</td>
      <td>${badge(a.status, statusColor(a.status))}</td>
      <td><select onchange="updateAmbulanceStatus(${a.id}, this.value)"><option value="">Update</option><option value="available">Available</option><option value="on_call">On Call</option><option value="maintenance">Maintenance</option></select></td></tr>
    `)}
  `;
}
async function updateAmbulanceStatus(id, status) {
  if (!status) return;
  try { await Api.put(`/emergency/ambulances/${id}`, { status }); showToast('Ambulance updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
function openAmbulanceForm() {
  openModal(`<h3>Add Ambulance</h3><form id="ambForm">
    <label>Vehicle No *</label><input id="am_no" required>
    <div class="form-row"><div><label>Driver Name</label><input id="am_driver"></div><div><label>Driver Phone</label><input id="am_phone"></div></div>
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Save</button></div></form>`);
  document.getElementById('ambForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/emergency/ambulances', { vehicle_no: am_no.value, driver_name: am_driver.value, driver_phone: am_phone.value }); showToast('Ambulance added.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   INSURANCE
   ========================================================================== */
async function renderInsurance() {
  const res = await Api.get('/insurance/claims');
  const canCreate = ['receptionist', 'accountant', 'admin'].includes(user.role);
  const canUpdate = ['accountant', 'admin'].includes(user.role);
  document.getElementById('content').innerHTML = `
    ${toolbar('Insurance Claims', `${res.data.length} claims`, canCreate ? '<button onclick="openClaimForm()">+ New Claim</button>' : '')}
    ${renderTable(['Patient', 'Provider', 'Amount', 'Status', 'Submitted', 'Actions'], res.data, (c) => `
      <tr><td>${escapeHtml(c.patient_name)}</td><td>${escapeHtml(c.provider_name)}</td><td>${fmtMoney(c.claim_amount)}</td>
      <td>${badge(c.status, statusColor(c.status))}</td><td>${fmtDate(c.submitted_date)}</td>
      <td>${canUpdate ? `<select onchange="updateClaim(${c.id}, this.value)"><option value="">Update</option><option value="under_review">Under Review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="settled">Settled</option></select>` : '-'}</td></tr>
    `)}
  `;
}
async function updateClaim(id, status) {
  if (!status) return;
  try { await Api.put(`/insurance/claims/${id}`, { status }); showToast('Claim updated.'); route(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function openClaimForm() {
  const [patients, providersRes] = await Promise.all([Api.get('/patients'), Api.get('/insurance/providers')]);
  openModal(`<h3>New Insurance Claim</h3><form id="claimForm">
    <label>Patient *</label><select id="cl_patient" required>${patients.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
    <label>Provider *</label><select id="cl_provider" required>${providersRes.data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
    <label>Claim Amount *</label><input type="number" id="cl_amount" required>
    <label>Notes</label><textarea id="cl_notes" rows="2"></textarea>
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Submit</button></div></form>`);
  document.getElementById('claimForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await Api.post('/insurance/claims', { patient_id: cl_patient.value, provider_id: cl_provider.value, claim_amount: cl_amount.value, notes: cl_notes.value }); showToast('Claim submitted.'); closeModal(); route(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   ROLE-SEPARATED BILLING ARCHITECTURE:
   1. Pharmacy Billing (Pharmacist): Pharmacy sales & prescription dispensing only
   2. Hospital Billing (Receptionist): Healthcare services, OPD & IPD charges only
   3. Master Financial Ledger (Accountant ONLY): Total hospital + pharmacy totals
   4. Admin Notice: Direct cashiering restricted from administrative role
   ========================================================================== */

function renderAdminBillingNotice() {
  document.getElementById('content').innerHTML = `
    ${toolbar('Administrative Governance Desk', 'Role-Based Access Control Notice')}
    <div class="card" style="max-width:700px; padding:24px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
        <span style="font-size:32px;">🔒</span>
        <div>
          <h3 style="margin:0; color:#0f172a;">Direct Billing & Cashiering Operations are Segregated</h3>
          <p style="margin:4px 0 0; color:#64748b; font-size:13px;">Enterprise Hospital Governance & Audit Policy Enforcement</p>
        </div>
      </div>
      <p style="font-size:14px; color:#334155; line-height:1.6;">
        To maintain strict financial integrity and internal control, 
        <strong>direct billing registers, invoice creation, and counter collections are segregated to operational desks:</strong>
      </p>
      <ul style="font-size:13px; color:#475569; line-height:1.9; margin-left:18px;">
        <li><strong>💊 Pharmacy Division (Pharmacist):</strong> Medicine sales, prescription dispensing, and pharmacy cash receipts.</li>
        <li><strong>🏥 Front Desk (Receptionist):</strong> OPD doctor consultation fees, ward/room stay, nursing charges, and hospital procedures.</li>
        <li><strong>💳 Finance & Accounting (Accountant ONLY):</strong> Master Financial Ledger, reconciliation of both hospital and pharmacy totals, insurance claims, and settlements.</li>
      </ul>
      <div style="margin-top:20px; padding-top:14px; border-top:1px solid #e2e8f0; display:flex; gap:12px;">
        <button onclick="location.hash='analytics'">📈 View Hospital Analytics</button>
        <button class="secondary" onclick="location.hash='audit-logs'">📜 Security Audit Logs</button>
      </div>
    </div>
  `;
}

// ---------------- 1. PHARMACY BILLING (Pharmacist ONLY) ----------------
let currentPharmaItems = [];

async function renderPharmacyBilling() {
  const res = await Api.get('/billing/invoices?bill_type=pharmacy');
  const invoices = res.data || [];

  let totalSales = 0;
  let totalPaid = 0;
  let totalPending = 0;
  invoices.forEach(inv => {
    totalSales += Number(inv.total_amount || 0);
    totalPaid += Number(inv.paid_amount || 0);
    totalPending += Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
  });

  document.getElementById('content').innerHTML = `
    ${toolbar(
      '💊 Pharmacy & Medicine Sales Billing Desk',
      'Prescription medicine dispensing, OTC drug sales, and pharmacy cash receipts',
      '<button onclick="openPharmacyBillModal()" style="background:#16a34a;">+ New Pharmacy Medicine Bill</button>'
    )}

    <div class="kpi-grid">
      ${kpi('Total Pharmacy Bills', invoices.length)}
      ${kpi('Total Pharmacy Sales', fmtMoney(totalSales))}
      ${kpi('Amount Collected', fmtMoney(totalPaid))}
      ${kpi('Pending Prescription Dues', fmtMoney(totalPending))}
    </div>

    <div class="card" style="margin-bottom:16px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center;">
      <div style="font-size:14px; font-weight:600; color:#334155;">
        <span>Pharmacy Dispensing Invoices</span>
      </div>
      <button class="secondary" onclick="location.hash='pharmacy-prescriptions'">📋 Doctor Prescriptions Queue</button>
    </div>

    <div id="pharmaTableArea">
      ${renderPharmacyInvoiceTable(invoices)}
    </div>
  `;
}

function renderPharmacyInvoiceTable(rows) {
  return renderTable(
    ['Invoice #', 'Patient Name & Phone', 'Medicine Items', 'Pharmacy Total', 'Paid', 'Balance', 'Status', 'Date', 'Actions'],
    rows,
    (i) => {
      const balance = Math.max(0, Number(i.total_amount) - Number(i.paid_amount));
      return `
        <tr>
          <td><strong>#PHARM-${String(i.id).padStart(4, '0')}</strong></td>
          <td><strong>${escapeHtml(i.patient_name)}</strong><br><small class="text-muted">${escapeHtml(i.patient_phone || '')}</small></td>
          <td><span class="badge badge-yellow">💊 PHARMACY</span></td>
          <td><strong>${fmtMoney(i.total_amount)}</strong></td>
          <td style="color:#16a34a;">${fmtMoney(i.paid_amount)}</td>
          <td style="color:${balance > 0 ? '#dc2626' : '#16a34a'}; font-weight:700;">${fmtMoney(balance)}</td>
          <td>${badge(i.status, statusColor(i.status))}</td>
          <td>${fmtDate(i.created_at)}</td>
          <td style="white-space:nowrap;">
            <button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="viewInvoice(${i.id})">👁️ View</button>
            <button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="printInvoiceById(${i.id})">🖨️ Receipt</button>
          </td>
        </tr>
      `;
    }
  );
}

async function openPharmacyBillModal(opts = {}) {
  const [patientsRes, invRes] = await Promise.all([
    Api.get('/patients'),
    Api.get('/pharmacy/inventory')
  ]);

  currentPharmaItems = [];
  const defaultPatientId = opts.patient_id || (patientsRes.data[0] ? patientsRes.data[0].id : null);

  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <h3 style="margin:0; color:#0f172a;">💊 New Pharmacy Medicine Bill</h3>
        <p class="section-sub" style="margin:0;">Dispense doctor prescribed medicines or OTC pharmacy retail items</p>
      </div>
      <button class="secondary" onclick="closeModal()">✕ Cancel</button>
    </div>

    <form id="pharmaBillForm">
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px;">
        <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:16px; align-items:flex-end;">
          <div>
            <label style="font-weight:700;">Select Patient *</label>
            <select id="pb_patient" required style="margin-bottom:0;">
              ${patientsRes.data.map(p => `<option value="${p.id}" ${p.id == defaultPatientId ? 'selected' : ''}>${escapeHtml(p.name)} (#${p.id}) - Phone: ${escapeHtml(p.phone || 'N/A')}</option>`).join('')}
            </select>
          </div>
          <div>
            <button type="button" onclick="loadDoctorPrescriptionsForPharmacy()" style="background:#16a34a; width:100%; justify-content:center; height:38px;">
              ⚡ Auto-Load Doctor's Prescriptions
            </button>
          </div>
        </div>
      </div>

      <div class="card" style="background:#fff; border:1px solid #e2e8f0; padding:14px; margin-bottom:14px;">
        <h4 class="mt-0" style="color:#d97706;">Add Medicine from Pharmacy Stock</h4>
        <div style="display:grid; grid-template-columns: 1.5fr 100px 80px auto; gap:8px; align-items:flex-end;">
          <div>
            <label>Select In-Stock Medicine</label>
            <select id="pb_med_select" onchange="onPbMedSelect(this)" style="margin:0;">
              <option value="">-- Choose Stock Medicine --</option>
              ${invRes.data.map(i => `<option value="${i.id}" data-name="${escapeHtml(i.medicine_name)}" data-price="${i.unit_price}" data-stock="${i.quantity}">
                ${escapeHtml(i.medicine_name)} (Stock: ${i.quantity} | ₹${i.unit_price})
              </option>`).join('')}
            </select>
          </div>
          <div>
            <label>Unit Rate (₹)</label>
            <input type="number" step="0.01" id="pb_rate" placeholder="Rate" style="margin:0;">
          </div>
          <div>
            <label>Qty</label>
            <input type="number" min="1" id="pb_qty" value="1" style="margin:0;">
          </div>
          <div>
            <button type="button" class="secondary" onclick="addPbMedicineItem()" style="height:38px;">+ Add</button>
          </div>
        </div>

        <div id="pbItemsArea" style="margin-top:14px; max-height:200px; overflow-y:auto;">
          <p class="text-muted" style="font-size:13px;">No medicines added yet.</p>
        </div>
      </div>

      <div class="billing-summary-card">
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:14px; margin-bottom:10px;">
          <div>
            <div style="font-size:12px; color:#94a3b8;">Pharmacy Subtotal</div>
            <div style="font-size:18px; font-weight:700;" id="pbSubtotalDisplay">₹0.00</div>
          </div>
          <div>
            <label style="color:#94a3b8; margin:0 0 2px;">Discount (₹)</label>
            <input type="number" id="pb_discount" value="0" min="0" oninput="updatePbCalculations()" style="margin:0; background:#1e293b; color:#fff; border-color:#334155; padding:4px 8px;">
          </div>
          <div>
            <label style="color:#94a3b8; margin:0 0 2px;">Tax / GST (₹)</label>
            <input type="number" id="pb_tax" value="0" min="0" oninput="updatePbCalculations()" style="margin:0; background:#1e293b; color:#fff; border-color:#334155; padding:4px 8px;">
          </div>
        </div>

        <div class="billing-summary-row total-row">
          <span>NET AMOUNT PAYABLE:</span>
          <span id="pbGrandTotalDisplay">₹0.00</span>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:12px; padding-top:12px; border-top:1px dashed #334155;">
          <div>
            <label style="color:#94a3b8;">Amount Collected (₹)</label>
            <input type="number" step="0.01" id="pb_paid" style="background:#1e293b; color:#fff; border-color:#334155; margin:0;">
          </div>
          <div>
            <label style="color:#94a3b8;">Payment Method</label>
            <select id="pb_method" style="background:#1e293b; color:#fff; border-color:#334155; margin:0;">
              <option value="cash">Cash (Counter)</option>
              <option value="card">Card</option>
              <option value="online">Online / UPI QR</option>
            </select>
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button type="button" class="secondary" onclick="closeModal()">Close</button>
        <button type="submit" style="padding:10px 24px; font-size:14px; background:#16a34a;">
          🧾 Issue Pharmacy Bill & Dispense
        </button>
      </div>
    </form>
  `);

  const modalEl = document.getElementById('dynamicModal')?.querySelector('.modal');
  if (modalEl) modalEl.classList.add('modal-lg');

  if (opts.patient_id) {
    loadDoctorPrescriptionsForPharmacy();
  }

  document.getElementById('pharmaBillForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentPharmaItems.length) return showToast('Add at least one medicine item.', 'error');

    const pid = document.getElementById('pb_patient').value;
    const discount = parseFloat(document.getElementById('pb_discount').value) || 0;
    const tax = parseFloat(document.getElementById('pb_tax').value) || 0;
    const paid = parseFloat(document.getElementById('pb_paid').value) || 0;
    const method = document.getElementById('pb_method').value;

    try {
      const res = await Api.post('/billing/invoices', {
        patient_id: pid,
        bill_type: 'pharmacy',
        pharmacy_items: currentPharmaItems,
        discount,
        tax,
        paid_amount: paid,
        payment_method: method,
        notes: 'Dispensed by Pharmacy Department'
      });

      showToast('✅ Pharmacy bill issued successfully!');
      closeModal();
      route();
      setTimeout(() => printInvoiceById(res.data.id), 300);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function onPbMedSelect(sel) {
  const opt = sel.selectedOptions[0];
  if (!opt || !sel.value) return;
  document.getElementById('pb_rate').value = opt.dataset.price;
}

function addPbMedicineItem() {
  const sel = document.getElementById('pb_med_select');
  const opt = sel.selectedOptions[0];
  const rate = parseFloat(document.getElementById('pb_rate').value) || 0;
  const qty = parseInt(document.getElementById('pb_qty').value, 10) || 1;

  if (!sel.value || rate <= 0) return showToast('Select a medicine and specify valid rate.', 'error');

  currentPharmaItems.push({
    inventory_id: parseInt(sel.value, 10),
    medicine_name: opt.dataset.name,
    unit_price: rate,
    quantity: qty,
    amount: rate * qty
  });

  sel.value = '';
  document.getElementById('pb_rate').value = '';
  document.getElementById('pb_qty').value = '1';

  renderPbItemsList();
  updatePbCalculations();
}

function removePbItem(idx) {
  currentPharmaItems.splice(idx, 1);
  renderPbItemsList();
  updatePbCalculations();
}

function renderPbItemsList() {
  const area = document.getElementById('pbItemsArea');
  if (!area) return;
  if (!currentPharmaItems.length) {
    area.innerHTML = '<p class="text-muted" style="font-size:13px;">No medicines added yet.</p>';
    return;
  }
  area.innerHTML = `
    <table style="width:100%; font-size:13px;">
      <thead><tr><th>Medicine</th><th>Qty</th><th>Rate</th><th style="text-align:right;">Total</th><th></th></tr></thead>
      <tbody>
        ${currentPharmaItems.map((it, idx) => `
          <tr>
            <td><strong>${escapeHtml(it.medicine_name)}</strong> ${it.prescription_id ? '<span class="badge badge-green" style="font-size:10px;">Prescription</span>' : ''}</td>
            <td>${it.quantity}</td>
            <td>${fmtMoney(it.unit_price)}</td>
            <td style="text-align:right;">${fmtMoney(it.amount)}</td>
            <td style="text-align:right;"><button type="button" class="danger" style="padding:2px 6px; font-size:11px;" onclick="removePbItem(${idx})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadDoctorPrescriptionsForPharmacy() {
  const pid = document.getElementById('pb_patient').value;
  try {
    showToast('Checking pending prescriptions for patient...');
    const res = await Api.get(`/billing/patient/${pid}/prescriptions`);
    const list = res.data || [];
    if (!list.length) return showToast('No pending doctor prescriptions found for this patient.');

    let count = 0;
    list.forEach(rx => {
      const already = currentPharmaItems.some(i => i.prescription_id === rx.prescription_id);
      if (!already) {
        const rate = Number(rx.unit_price) || 20;
        const qty = rx.duration?.includes('10') ? 20 : 10;
        currentPharmaItems.push({
          prescription_id: rx.prescription_id,
          inventory_id: rx.inventory_id || null,
          medicine_name: `${rx.medicine_name} (${rx.dosage || ''})`,
          unit_price: rate,
          quantity: qty,
          amount: rate * qty
        });
        count++;
      }
    });

    renderPbItemsList();
    updatePbCalculations();
    showToast(`✅ Loaded ${count} prescribed medicines into pharmacy bill!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updatePbCalculations() {
  const sub = currentPharmaItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const discount = parseFloat(document.getElementById('pb_discount')?.value) || 0;
  const tax = parseFloat(document.getElementById('pb_tax')?.value) || 0;
  const grand = Math.max(0, sub - discount + tax);

  const subDisplay = document.getElementById('pbSubtotalDisplay');
  const grandDisplay = document.getElementById('pbGrandTotalDisplay');
  const paidInput = document.getElementById('pb_paid');

  if (subDisplay) subDisplay.textContent = fmtMoney(sub);
  if (grandDisplay) grandDisplay.textContent = fmtMoney(grand);
  if (paidInput && (!paidInput.value || parseFloat(paidInput.value) === 0)) {
    paidInput.value = grand.toFixed(2);
  }
}


// ---------------- 2. HOSPITAL HEALTHCARE BILLING (Receptionist ONLY) ----------------
let currentHospItems = [];

async function renderHospitalBilling() {
  const res = await Api.get('/billing/invoices?bill_type=hospital');
  const invoices = res.data || [];

  let totalBilled = 0;
  let totalPaid = 0;
  let totalPending = 0;
  invoices.forEach(inv => {
    totalBilled += Number(inv.total_amount || 0);
    totalPaid += Number(inv.paid_amount || 0);
    totalPending += Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
  });

  document.getElementById('content').innerHTML = `
    ${toolbar(
      '🏥 Hospital Healthcare Services Billing',
      'OPD doctor consultations, diagnostic pathology tests, room/bed admissions, nursing, and clinical procedures',
      '<button onclick="openHospitalBillModal()" style="background:var(--color-primary);">+ New Hospital Service Bill</button>'
    )}

    <div class="kpi-grid">
      ${kpi('Total Hospital Invoices', invoices.length)}
      ${kpi('Healthcare Revenue', fmtMoney(totalBilled))}
      ${kpi('Collected at Front Desk', fmtMoney(totalPaid))}
      ${kpi('Outstanding Patient Dues', fmtMoney(totalPending))}
    </div>

    <div class="card" style="margin-bottom:16px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center;">
      <div style="font-size:14px; font-weight:600; color:#334155;">
        <span>Hospital Healthcare Service Invoices</span>
      </div>
      <button class="secondary" onclick="location.hash='appointments'">📅 Appointments Desk</button>
    </div>

    <div id="hospTableArea">
      ${renderHospitalInvoiceTable(invoices)}
    </div>
  `;
}

function renderHospitalInvoiceTable(rows) {
  return renderTable(
    ['Invoice #', 'Patient Name & Phone', 'Service Type', 'Hospital Charges', 'Paid', 'Balance', 'Status', 'Date', 'Actions'],
    rows,
    (i) => {
      const balance = Math.max(0, Number(i.total_amount) - Number(i.paid_amount));
      return `
        <tr>
          <td><strong>#HOSP-${String(i.id).padStart(4, '0')}</strong></td>
          <td><strong>${escapeHtml(i.patient_name)}</strong><br><small class="text-muted">${escapeHtml(i.patient_phone || '')}</small></td>
          <td><span class="badge badge-blue">🏥 HOSPITAL</span></td>
          <td><strong>${fmtMoney(i.total_amount)}</strong></td>
          <td style="color:#16a34a;">${fmtMoney(i.paid_amount)}</td>
          <td style="color:${balance > 0 ? '#dc2626' : '#16a34a'}; font-weight:700;">${fmtMoney(balance)}</td>
          <td>${badge(i.status, statusColor(i.status))}</td>
          <td>${fmtDate(i.created_at)}</td>
          <td style="white-space:nowrap;">
            <button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="viewInvoice(${i.id})">👁️ View</button>
            <button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="printInvoiceById(${i.id})">🖨️ Invoice</button>
          </td>
        </tr>
      `;
    }
  );
}

let allLabTests = [];

async function openHospitalBillModal(opts = {}) {
  const [patientsRes, labTestsRes] = await Promise.all([
    Api.get('/patients'),
    Api.get('/lab/tests').catch(() => ({ data: [] }))
  ]);

  allLabTests = labTestsRes.data || [];
  currentHospItems = [];
  const defaultPatientId = opts.patient_id || (patientsRes.data[0] ? patientsRes.data[0].id : null);

  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <h3 style="margin:0; color:#0f172a;">🏥 New Hospital Services & Lab Investigation Bill</h3>
        <p class="section-sub" style="margin:0;">Bill doctor consultations, bed stays, nursing, procedures, and diagnostic pathology lab tests</p>
      </div>
      <button class="secondary" onclick="closeModal()">✕ Cancel</button>
    </div>

    <form id="hospBillForm">
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px;">
        <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:14px; align-items:flex-end;">
          <div>
            <label style="font-weight:700;">Select Patient *</label>
            <select id="hb_patient" required onchange="onHbPatientChanged(this.value)" style="margin-bottom:0;">
              ${patientsRes.data.map(p => `<option value="${p.id}" ${p.id == defaultPatientId ? 'selected' : ''}>${escapeHtml(p.name)} (#${p.id}) - Phone: ${escapeHtml(p.phone || 'N/A')}</option>`).join('')}
            </select>
          </div>
          <div>
            <button type="button" onclick="loadDoctorLabTestsForHospitalBill()" style="background:#7c3aed; color:#fff; width:100%; justify-content:center; height:38px;">
              ⚡ Auto-Load Doctor's Lab Tests
            </button>
          </div>
        </div>
        <div id="hbAdmissionStatus" style="font-size:12px; color:#64748b; margin-top:6px;"></div>
      </div>

      <!-- Section 1: Hospital Healthcare Services -->
      <div class="card" style="background:#fff; border:1px solid #e2e8f0; padding:14px; margin-bottom:14px;">
        <h4 class="mt-0" style="color:#0369a1; display:flex; align-items:center; gap:6px;">
          <span>🏥 Hospital Healthcare Services</span>
        </h4>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px;" onclick="addQuickHbService('Specialist Doctor OPD Consultation', 500, 'consultation')">+ OPD Consult (₹500)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px;" onclick="addQuickHbService('General Ward Bed Stay (Per Day)', 800, 'room')">+ Bed Stay (₹800/d)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px;" onclick="addQuickHbService('Nursing & Monitoring Charges', 350, 'nursing')">+ Nursing (₹350)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px;" onclick="addQuickHbService('Clinical Dressing & Minor Procedure', 400, 'procedure')">+ Minor Dressing (₹400)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px;" onclick="addQuickHbService('ECG & Vital Assessment', 300, 'procedure')">+ ECG (₹300)</button>
        </div>

        <div style="display:grid; grid-template-columns: 1.5fr 120px auto; gap:8px; align-items:flex-end;">
          <div>
            <label>Custom Healthcare Service Description</label>
            <input id="hb_custom_desc" placeholder="e.g. Nebulization, OT Procedure Fee" style="margin:0;">
          </div>
          <div>
            <label>Amount (₹)</label>
            <input type="number" step="0.01" id="hb_custom_amt" placeholder="Amount" style="margin:0;">
          </div>
          <div>
            <button type="button" class="secondary" onclick="addCustomHbService()" style="height:38px;">+ Add Service</button>
          </div>
        </div>
      </div>

      <!-- Section 2: Integrated Diagnostic Lab & Pathology Billing -->
      <div class="card" style="background:#fff; border:1px solid #e9d5ff; padding:14px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 class="mt-0" style="color:#7c3aed; margin-bottom:0; display:flex; align-items:center; gap:6px;">
            <span>🔬 Diagnostic Pathology & Lab Tests</span>
            <span class="badge badge-purple" style="font-size:10px;">INTEGRATED BILLING</span>
          </h4>
          <span style="font-size:12px; color:#6b21a8;">Added to Hospital Invoice</span>
        </div>

        <!-- Quick Lab Tests -->
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Complete Blood Count (CBC)', 350)">+ CBC (₹350)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Lipid Profile', 700)">+ Lipid Profile (₹700)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Liver Function Test (LFT)', 800)">+ LFT (₹800)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Thyroid Profile (TSH)', 450)">+ Thyroid TSH (₹450)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Urine Routine & Microscopic', 200)">+ Urine Routine (₹200)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Chest X-Ray Digital', 600)">+ Chest X-Ray (₹600)</button>
          <button type="button" class="secondary" style="font-size:12px; padding:4px 10px; border-color:#d8b4fe;" onclick="addQuickHbLabTest('Blood Glucose Fasting / PP', 150)">+ Blood Glucose (₹150)</button>
        </div>

        <!-- Catalog Selector -->
        <div style="display:grid; grid-template-columns: 1.5fr 120px auto; gap:8px; align-items:flex-end;">
          <div>
            <label>Select Test from Pathology Catalog</label>
            <select id="hb_lab_select" onchange="onHbLabSelect(this)" style="margin:0;">
              <option value="">-- Choose Diagnostic Test --</option>
              ${allLabTests.map(t => `<option value="${t.id}" data-name="${escapeHtml(t.name)}" data-price="${t.price}">${escapeHtml(t.name)} (₹${t.price}) - [${t.category || 'Lab'}]</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Test Fee (₹)</label>
            <input type="number" step="0.01" id="hb_lab_price" placeholder="Price" style="margin:0;">
          </div>
          <div>
            <button type="button" class="secondary" onclick="addHbLabTestItem()" style="height:38px; border-color:#7c3aed; color:#7c3aed;">+ Add Lab Test</button>
          </div>
        </div>
      </div>

      <!-- Current Bill Line Items -->
      <div class="card" style="background:#fff; border:1px solid #e2e8f0; padding:14px; margin-bottom:14px;">
        <h4 class="mt-0" style="color:#0f172a; margin-bottom:8px;">Billed Hospital & Diagnostic Items</h4>
        <div id="hbItemsArea" style="max-height:220px; overflow-y:auto;">
          <p class="text-muted" style="font-size:13px;">No hospital or lab charges added yet.</p>
        </div>
      </div>

      <!-- Financial Calculations & Segregation Breakdown -->
      <div class="billing-summary-card">
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:12px;">
          <div>
            <div style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Hospital Services</div>
            <div style="font-size:16px; font-weight:700; color:#38bdf8;" id="hbHospitalSubtotalDisplay">₹0.00</div>
          </div>
          <div>
            <div style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Diagnostic Lab Total</div>
            <div style="font-size:16px; font-weight:700; color:#c084fc;" id="hbLabSubtotalDisplay">₹0.00</div>
          </div>
          <div>
            <label style="color:#94a3b8; margin:0 0 2px; font-size:11px;">Discount (₹)</label>
            <input type="number" id="hb_discount" value="0" min="0" oninput="updateHbCalculations()" style="margin:0; background:#1e293b; color:#fff; border-color:#334155; padding:4px 8px;">
          </div>
          <div>
            <label style="color:#94a3b8; margin:0 0 2px; font-size:11px;">Tax / GST (₹)</label>
            <input type="number" id="hb_tax" value="0" min="0" oninput="updateHbCalculations()" style="margin:0; background:#1e293b; color:#fff; border-color:#334155; padding:4px 8px;">
          </div>
        </div>

        <div class="billing-summary-row total-row">
          <span>NET HOSPITAL & LAB TOTAL:</span>
          <span id="hbGrandTotalDisplay">₹0.00</span>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:12px; padding-top:12px; border-top:1px dashed #334155;">
          <div>
            <label style="color:#94a3b8;">Amount Paid Now (₹)</label>
            <input type="number" step="0.01" id="hb_paid" style="background:#1e293b; color:#fff; border-color:#334155; margin:0;">
          </div>
          <div>
            <label style="color:#94a3b8;">Payment Mode</label>
            <select id="hb_method" style="background:#1e293b; color:#fff; border-color:#334155; margin:0;">
              <option value="cash">Cash (Counter)</option>
              <option value="card">Debit / Credit Card</option>
              <option value="online">Online / UPI QR</option>
            </select>
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button type="button" class="secondary" onclick="closeModal()">Close</button>
        <button type="submit" style="padding:10px 24px; font-size:14px; background:var(--color-primary);">
          🧾 Generate & Print Hospital Invoice
        </button>
      </div>
    </form>
  `);

  const modalEl = document.getElementById('dynamicModal')?.querySelector('.modal');
  if (modalEl) modalEl.classList.add('modal-lg');

  if (defaultPatientId) onHbPatientChanged(defaultPatientId);

  document.getElementById('hospBillForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentHospItems.length) return showToast('Add at least one hospital or lab service charge.', 'error');

    const pid = document.getElementById('hb_patient').value;
    const discount = parseFloat(document.getElementById('hb_discount').value) || 0;
    const tax = parseFloat(document.getElementById('hb_tax').value) || 0;
    const paid = parseFloat(document.getElementById('hb_paid').value) || 0;
    const method = document.getElementById('hb_method').value;

    try {
      const res = await Api.post('/billing/invoices', {
        patient_id: pid,
        bill_type: 'hospital',
        hospital_items: currentHospItems,
        discount,
        tax,
        paid_amount: paid,
        payment_method: method,
        notes: 'Hospital Healthcare & Diagnostic Lab Services'
      });

      showToast('✅ Hospital service invoice generated with lab items!');
      closeModal();
      route();
      setTimeout(() => printInvoiceById(res.data.id), 300);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function addQuickHbService(description, amount, category = 'hospital') {
  currentHospItems.push({ description, amount: Number(amount), quantity: 1, category });
  renderHbItemsList();
  updateHbCalculations();
}

function addCustomHbService() {
  const desc = document.getElementById('hb_custom_desc').value.trim();
  const amt = parseFloat(document.getElementById('hb_custom_amt').value);
  if (!desc || isNaN(amt) || amt <= 0) return showToast('Enter valid service description and amount.', 'error');

  currentHospItems.push({ description: desc, amount: amt, quantity: 1, category: 'hospital' });
  document.getElementById('hb_custom_desc').value = '';
  document.getElementById('hb_custom_amt').value = '';
  renderHbItemsList();
  updateHbCalculations();
}

function onHbLabSelect(sel) {
  const opt = sel.selectedOptions[0];
  if (!opt || !sel.value) return;
  document.getElementById('hb_lab_price').value = opt.dataset.price;
}

function addQuickHbLabTest(name, price) {
  currentHospItems.push({
    description: name,
    amount: Number(price),
    quantity: 1,
    unit_price: Number(price),
    category: 'lab'
  });
  renderHbItemsList();
  updateHbCalculations();
  showToast(`Added ${name} to bill`);
}

function addHbLabTestItem() {
  const sel = document.getElementById('hb_lab_select');
  const opt = sel.selectedOptions[0];
  const price = parseFloat(document.getElementById('hb_lab_price').value);

  if (!sel.value || isNaN(price) || price <= 0) {
    return showToast('Select a diagnostic lab test and specify valid price.', 'error');
  }

  currentHospItems.push({
    description: opt.dataset.name,
    amount: price,
    quantity: 1,
    unit_price: price,
    category: 'lab'
  });

  sel.value = '';
  document.getElementById('hb_lab_price').value = '';
  renderHbItemsList();
  updateHbCalculations();
}

async function loadDoctorLabTestsForHospitalBill() {
  const pid = document.getElementById('hb_patient').value;
  try {
    showToast('Checking pending doctor-ordered lab tests...');
    const res = await Api.get(`/billing/patient/${pid}/lab-tests`);
    const list = res.data || [];
    if (!list.length) return showToast('No pending lab requests found for this patient.');

    let count = 0;
    list.forEach(lr => {
      const already = currentHospItems.some(i => i.lab_request_id === lr.request_id || i.description === lr.test_name);
      if (!already) {
        const rate = Number(lr.price) || 400;
        currentHospItems.push({
          lab_request_id: lr.request_id,
          description: lr.test_name,
          amount: rate,
          quantity: 1,
          unit_price: rate,
          category: 'lab'
        });
        count++;
      }
    });

    renderHbItemsList();
    updateHbCalculations();
    showToast(`✅ Loaded ${count} doctor-ordered lab tests into Hospital Bill!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function removeHbItem(idx) {
  currentHospItems.splice(idx, 1);
  renderHbItemsList();
  updateHbCalculations();
}

function renderHbItemsList() {
  const area = document.getElementById('hbItemsArea');
  if (!area) return;
  if (!currentHospItems.length) {
    area.innerHTML = '<p class="text-muted" style="font-size:13px;">No hospital or lab charges added yet.</p>';
    return;
  }
  area.innerHTML = `
    <table style="width:100%; font-size:13px;">
      <thead><tr><th>Description</th><th>Type</th><th style="text-align:right;">Amount</th><th></th></tr></thead>
      <tbody>
        ${currentHospItems.map((it, idx) => `
          <tr>
            <td>
              <strong>${escapeHtml(it.description)}</strong>
              ${it.lab_request_id ? '<span style="font-size:11px; color:#7c3aed; margin-left:6px;">(Doctor Rx)</span>' : ''}
            </td>
            <td>
              ${it.category === 'lab' 
                ? '<span class="badge badge-purple" style="font-size:10px;">🔬 LAB TEST</span>' 
                : '<span class="badge badge-blue" style="font-size:10px;">🏥 HOSPITAL</span>'}
            </td>
            <td style="text-align:right;">${fmtMoney(it.amount)}</td>
            <td style="text-align:right;"><button type="button" class="danger" style="padding:2px 6px; font-size:11px;" onclick="removeHbItem(${idx})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function onHbPatientChanged(pid) {
  const statusEl = document.getElementById('hbAdmissionStatus');
  if (!statusEl) return;
  try {
    const res = await Api.get(`/patients/${pid}/history`);
    const active = (res.data.admissions || []).find(a => a.status === 'admitted');
    if (active) {
      statusEl.innerHTML = `<span class="badge badge-yellow">🏨 Admitted Inpatient: Room ${escapeHtml(active.room_no)} / Bed ${escapeHtml(active.bed_no)}</span>`;
    } else {
      statusEl.innerHTML = `<span class="badge badge-blue">🧑 Outpatient Status</span>`;
    }
  } catch (e) {
    statusEl.innerHTML = '';
  }
}

function updateHbCalculations() {
  let hospSub = 0;
  let labSub = 0;

  currentHospItems.forEach(i => {
    const amt = Number(i.amount) || 0;
    if (i.category === 'lab') labSub += amt;
    else hospSub += amt;
  });

  const totalSub = hospSub + labSub;
  const discount = parseFloat(document.getElementById('hb_discount')?.value) || 0;
  const tax = parseFloat(document.getElementById('hb_tax')?.value) || 0;
  const grand = Math.max(0, totalSub - discount + tax);

  const hospSubEl = document.getElementById('hbHospitalSubtotalDisplay');
  const labSubEl = document.getElementById('hbLabSubtotalDisplay');
  const grandDisplay = document.getElementById('hbGrandTotalDisplay');
  const paidInput = document.getElementById('hb_paid');

  if (hospSubEl) hospSubEl.textContent = fmtMoney(hospSub);
  if (labSubEl) labSubEl.textContent = fmtMoney(labSub);
  if (grandDisplay) grandDisplay.textContent = fmtMoney(grand);
  if (paidInput && (!paidInput.value || parseFloat(paidInput.value) === 0)) {
    paidInput.value = grand.toFixed(2);
  }
}


// ---------------- 3. MASTER FINANCIAL LEDGER (Accountant ONLY) ----------------
async function renderMasterBilling() {
  const res = await Api.get('/billing/invoices');
  const invoices = res.data || [];

  let totalGross = 0;
  let totalHospital = 0;
  let totalPharmacy = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  invoices.forEach(inv => {
    const h = Number(inv.hospital_total || (inv.bill_type === 'hospital' ? inv.total_amount : 0));
    const p = Number(inv.pharmacy_total || (inv.bill_type === 'pharmacy' ? inv.total_amount : 0));
    totalHospital += h;
    totalPharmacy += p;
    totalGross += Number(inv.total_amount || 0);
    totalPaid += Number(inv.paid_amount || 0);
    totalOutstanding += Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
  });

  document.getElementById('content').innerHTML = `
    ${toolbar(
      '💳 Master Financial Ledger & Accounting Center',
      'Consolidated hospital-wide financial administration: Hospital Services + Pharmacy Division totals, reconciliations, and settlements',
      '<button onclick="openMasterBillModal()" style="background:var(--color-primary);">+ Create Master Invoice</button>'
    )}

    <!-- Master Totals (Seen by Accountant ONLY) -->
    <div class="kpi-grid">
      ${kpi('Total Invoices', invoices.length)}
      ${kpi('Total Net Revenue', fmtMoney(totalGross))}
      ${kpi('🏥 Hospital Healthcare Total', fmtMoney(totalHospital))}
      ${kpi('💊 Pharmacy Sales Total', fmtMoney(totalPharmacy))}
      ${kpi('Total Collections', fmtMoney(totalPaid))}
      ${kpi('Total Outstanding Dues', fmtMoney(totalOutstanding))}
    </div>

    <div class="card" style="margin-bottom:16px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:13px; font-weight:700; color:#475569;">Division Filter:</span>
        <button class="secondary" style="font-size:12px; padding:4px 10px;" onclick="filterMasterInvoices('')">All Divisions</button>
        <button class="secondary" style="font-size:12px; padding:4px 10px;" onclick="filterMasterInvoices('hospital')">🏥 Hospital Only</button>
        <button class="secondary" style="font-size:12px; padding:4px 10px;" onclick="filterMasterInvoices('pharmacy')">💊 Pharmacy Only</button>
        <button class="secondary" style="font-size:12px; padding:4px 10px;" onclick="filterMasterInvoices('', 'unpaid')">⚠️ Unpaid Only</button>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="secondary" style="font-size:12px;" onclick="location.hash='insurance'">📋 Insurance Claims</button>
        <button class="secondary" style="font-size:12px;" onclick="location.hash='analytics'">📈 Revenue Analytics</button>
      </div>
    </div>

    <div id="masterInvoiceTableArea">
      ${renderMasterInvoiceTable(invoices)}
    </div>
  `;
}

function renderMasterInvoiceTable(rows) {
  return renderTable(
    ['Invoice #', 'Patient Name & Phone', 'Division', 'Hospital Subtotal', 'Pharmacy Subtotal', 'Grand Total', 'Paid', 'Balance', 'Status', 'Date', 'Actions'],
    rows,
    (i) => {
      const balance = Math.max(0, Number(i.total_amount) - Number(i.paid_amount));
      return `
        <tr>
          <td><strong>#INV-${String(i.id).padStart(4, '0')}</strong></td>
          <td><strong>${escapeHtml(i.patient_name)}</strong><br><small class="text-muted">${escapeHtml(i.patient_phone || '')}</small></td>
          <td><span class="badge ${i.bill_type === 'pharmacy' ? 'badge-yellow' : i.bill_type === 'hospital' ? 'badge-blue' : 'badge-green'}">${(i.bill_type || 'unified').toUpperCase()}</span></td>
          <td>${fmtMoney(i.hospital_total || (i.bill_type === 'hospital' ? i.total_amount : 0))}</td>
          <td>${fmtMoney(i.pharmacy_total || (i.bill_type === 'pharmacy' ? i.total_amount : 0))}</td>
          <td><strong>${fmtMoney(i.total_amount)}</strong></td>
          <td style="color:#16a34a;">${fmtMoney(i.paid_amount)}</td>
          <td style="color:${balance > 0 ? '#dc2626' : '#16a34a'}; font-weight:700;">${fmtMoney(balance)}</td>
          <td>${badge(i.status, statusColor(i.status))}</td>
          <td>${fmtDate(i.created_at)}</td>
          <td style="white-space:nowrap;">
            <button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="viewInvoice(${i.id})">👁️ Settle / View</button>
            <button class="secondary" style="font-size:12px; padding:4px 8px;" onclick="printInvoiceById(${i.id})">🖨️ Tax Invoice</button>
          </td>
        </tr>
      `;
    }
  );
}

async function filterMasterInvoices(billType, status) {
  let url = '/billing/invoices';
  const q = [];
  if (billType) q.push(`bill_type=${billType}`);
  if (status) q.push(`status=${status}`);
  if (q.length) url += '?' + q.join('&');

  const res = await Api.get(url);
  const area = document.getElementById('masterInvoiceTableArea');
  if (area) area.innerHTML = renderMasterInvoiceTable(res.data);
}

function openMasterBillModal(opts = {}) {
  const pidParam = opts.patient_id ? `{ patient_id: ${opts.patient_id} }` : '{}';
  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0;">💳 Master Financial Invoicing Desk</h3>
      <button class="secondary" onclick="closeModal()">✕ Close</button>
    </div>
    <p style="font-size:13px; color:#475569;">Select invoice type to generate from Accounting Desk:</p>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:16px;">
      <div class="card" style="cursor:pointer; text-align:center; padding:20px;" onclick="closeModal(); openHospitalBillModal(${pidParam});">
        <div style="font-size:32px;">🏥</div>
        <h4 style="margin:10px 0 4px;">Hospital Healthcare Bill</h4>
        <p class="text-muted" style="font-size:12px; margin:0;">Consultation, Bed stay, Nursing, Procedures</p>
      </div>
      <div class="card" style="cursor:pointer; text-align:center; padding:20px;" onclick="closeModal(); openPharmacyBillModal(${pidParam});">
        <div style="font-size:32px;">💊</div>
        <h4 style="margin:10px 0 4px;">Pharmacy Medicine Bill</h4>
        <p class="text-muted" style="font-size:12px; margin:0;">Prescription dispensing and pharmacy inventory sales</p>
      </div>
    </div>
  `);
}

function openUnifiedBillModal(opts = {}) {
  if (user.role === 'pharmacist' || opts.defaultType === 'pharmacy') {
    return openPharmacyBillModal(opts);
  }
  if (user.role === 'receptionist' || opts.defaultType === 'hospital') {
    return openHospitalBillModal(opts);
  }
  return openMasterBillModal(opts);
}


// ---------------- 4. PATIENT BILLING VIEW ----------------
async function renderPatientBilling() {
  const res = await Api.get('/billing/invoices');
  const invoices = res.data || [];

  let totalDue = 0;
  invoices.forEach(inv => {
    totalDue += Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
  });

  document.getElementById('content').innerHTML = `
    ${toolbar('My Invoices & Medical Receipts', 'View all hospital healthcare and pharmacy receipts, and download official tax receipts')}
    <div class="kpi-grid">
      ${kpi('Total Invoices', invoices.length)}
      ${kpi('Outstanding Due', fmtMoney(totalDue))}
    </div>
    <div id="patientInvoiceArea">
      ${renderTable(
        ['Invoice #', 'Division', 'Total Amount', 'Paid', 'Balance Due', 'Status', 'Date', 'Action'],
        invoices,
        (inv) => {
          const balance = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));
          return `
            <tr>
              <td><strong>#INV-${String(inv.id).padStart(4, '0')}</strong></td>
              <td><span class="badge ${inv.bill_type === 'pharmacy' ? 'badge-yellow' : 'badge-blue'}">${(inv.bill_type || 'hospital').toUpperCase()}</span></td>
              <td><strong>${fmtMoney(inv.total_amount)}</strong></td>
              <td style="color:#16a34a;">${fmtMoney(inv.paid_amount)}</td>
              <td style="color:${balance > 0 ? '#dc2626' : '#16a34a'}; font-weight:700;">${fmtMoney(balance)}</td>
              <td>${badge(inv.status, statusColor(inv.status))}</td>
              <td>${fmtDate(inv.created_at)}</td>
              <td>
                <button class="secondary" style="font-size:12px; padding:3px 8px;" onclick="viewInvoice(${inv.id})">👁️ View Bill</button>
                <button class="secondary" style="font-size:12px; padding:3px 8px;" onclick="printInvoiceById(${inv.id})">🖨️ Receipt</button>
              </td>
            </tr>
          `;
        }
      )}
    </div>
  `;
}

// View existing invoice modal
async function viewInvoice(id) {
  try {
    const res = await Api.get(`/billing/invoices/${id}`);
    const inv = res.data;
    // Direct cashiering & payment recording is restricted to Receptionist and Accountant desks ONLY
    const canPay = ['accountant', 'receptionist'].includes(user.role) && inv.status !== 'paid';
    const balance = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));

    const hospItems = inv.hospitalItems || [];
    const pharmaItems = inv.pharmacyItems || [];

    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">Invoice #INV-${String(inv.id).padStart(4, '0')}</h3>
        <button class="secondary" onclick="closeModal()">✕ Close</button>
      </div>

      <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-bottom:14px; font-size:13px;">
        <div style="display:flex; justify-content:space-between;">
          <div>
            <strong>Patient:</strong> ${escapeHtml(inv.patient_name)} &nbsp;|&nbsp; 
            <strong>Phone:</strong> ${escapeHtml(inv.patient_phone || '-')} &nbsp;|&nbsp; 
            <strong>Blood Group:</strong> ${escapeHtml(inv.blood_group || '-')}
          </div>
          <div>${badge(inv.status, statusColor(inv.status))}</div>
        </div>
        <div style="margin-top:4px; color:#64748b;">
          <strong>Date:</strong> ${fmtDate(inv.created_at)} &nbsp;|&nbsp; 
          <strong>Bill Type:</strong> ${(inv.bill_type || 'unified').toUpperCase()} &nbsp;|&nbsp; 
          <strong>Payment Mode:</strong> ${(inv.payment_method || 'cash').toUpperCase()}
        </div>
      </div>

      <!-- Itemized Sections -->
      ${hospItems.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700; font-size:13px; color:#2563eb; text-transform:uppercase;">🏥 Hospital Healthcare Services & Diagnostic Lab Tests</div>
          <table style="width:100%; font-size:13px; margin-top:4px;">
            <thead><tr><th>Description</th><th>Type</th><th>Qty</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
              ${hospItems.map(it => `
                <tr>
                  <td><strong>${escapeHtml(it.description)}</strong></td>
                  <td>${it.category === 'lab' ? '<span class="badge badge-purple" style="font-size:10px;">🔬 LAB TEST</span>' : '<span class="badge badge-blue" style="font-size:10px;">🏥 HOSPITAL</span>'}</td>
                  <td>${it.quantity || 1}</td>
                  <td style="text-align:right;">${fmtMoney(it.amount)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

      ${pharmaItems.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700; font-size:13px; color:#d97706; text-transform:uppercase;">💊 Medical Store / Pharmacy Items</div>
          <table style="width:100%; font-size:13px; margin-top:4px;">
            <thead><tr><th>Medicine Name</th><th>Qty</th><th>Rate</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
              ${pharmaItems.map(it => `<tr><td>${escapeHtml(it.description)}</td><td>${it.quantity || 1}</td><td>${fmtMoney(it.unit_price || 0)}</td><td style="text-align:right;">${fmtMoney(it.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

      <div style="background:#f1f5f9; border-radius:8px; padding:12px; margin-top:14px; font-size:14px;">
        <div class="flex-between"><span>Hospital & Lab Subtotal:</span><strong>${fmtMoney(inv.hospital_total || 0)}</strong></div>
        <div class="flex-between" style="margin-top:4px;"><span>Medical Store Subtotal:</span><strong>${fmtMoney(inv.pharmacy_total || 0)}</strong></div>
        ${inv.discount > 0 ? `<div class="flex-between" style="margin-top:4px; color:#16a34a;"><span>Discount:</span><strong>-${fmtMoney(inv.discount)}</strong></div>` : ''}
        ${inv.tax > 0 ? `<div class="flex-between" style="margin-top:4px;"><span>Tax / GST:</span><strong>+${fmtMoney(inv.tax)}</strong></div>` : ''}
        <div class="flex-between" style="border-top:1px solid #cbd5e1; margin-top:6px; padding-top:6px; font-size:16px;">
          <span><strong>Total Amount:</strong></span><strong>${fmtMoney(inv.total_amount)}</strong>
        </div>
        <div class="flex-between" style="color:#16a34a; margin-top:4px;"><span>Amount Paid:</span><strong>${fmtMoney(inv.paid_amount)}</strong></div>
        <div class="flex-between" style="color:${balance > 0 ? '#dc2626' : '#16a34a'}; margin-top:4px;">
          <span><strong>Balance Remaining:</strong></span><strong>${fmtMoney(balance)}</strong>
        </div>
      </div>

      ${user.role === 'patient' && balance > 0 ? `
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; margin-top:14px; display:flex; align-items:center; gap:10px;">
          <span style="font-size:22px;">ℹ️</span>
          <div style="font-size:12px; color:#1e40af; line-height:1.5;">
            <strong>Payment Settlement Notice:</strong> Counter payments are recorded and receipted directly at the <strong>Hospital Reception Desk</strong> or <strong>Central Accounts Desk</strong>. Please present invoice reference <strong>#INV-${String(inv.id).padStart(4, '0')}</strong> to cashier staff.
          </div>
        </div>` : ''}

      ${canPay && balance > 0 ? `
        <div class="card" style="margin-top:14px; background:#fff; border:1px solid #cbd5e1;">
          <h4 class="mt-0" style="color:#0f172a;">Counter Payment Collection (Staff Cashier Desk)</h4>
          <div class="form-row">
            <div><label>Payment Amount (₹)</label><input type="number" id="pay_amount" value="${balance.toFixed(2)}"></div>
            <div><label>Payment Mode</label><select id="pay_method"><option value="cash">Cash (Counter)</option><option value="card">Debit / Credit Card</option><option value="online">Online / UPI QR</option><option value="insurance">Insurance / TPA</option></select></div>
          </div>
          <button onclick="makePayment(${inv.id})" style="width:100%; justify-content:center; background:var(--color-success);">
            💳 Record Payment of ₹${balance.toFixed(2)}
          </button>
        </div>` : ''}

      <div class="flex-between" style="margin-top:16px;">
        <button class="secondary" onclick="closeModal()">Close</button>
        <button onclick="printInvoiceById(${inv.id})" style="background:var(--color-primary);">
          🖨️ Print Official Tax Invoice
        </button>
      </div>
    `);

    const modalEl = document.getElementById('dynamicModal')?.querySelector('.modal');
    if (modalEl) modalEl.classList.add('modal-lg');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function printInvoiceById(id) {
  try {
    const res = await Api.get(`/billing/invoices/${id}`);
    printInvoice(res.data);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Professional Official Hospital & Medical Store Tax Invoice Generator
function printInvoice(inv) {
  const hospItems = inv.hospitalItems || (inv.items ? inv.items.filter(it => it.category !== 'pharmacy') : []);
  const pharmaItems = inv.pharmacyItems || (inv.items ? inv.items.filter(it => it.category === 'pharmacy') : []);

  const hospRows = hospItems.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <strong>${escapeHtml(it.description)}</strong>
        ${it.category === 'lab' ? ' <span style="font-size:10px; background:#f3e8ff; color:#6b21a8; padding:2px 6px; border-radius:4px; font-weight:700;">[LAB INVESTIGATION]</span>' : ''}
      </td>
      <td style="text-align:center;">${it.quantity || 1}</td>
      <td style="text-align:right;">${fmtMoney(it.unit_price || it.amount)}</td>
      <td style="text-align:right;">${fmtMoney(it.amount)}</td>
    </tr>
  `).join('');

  const pharmaRows = pharmaItems.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(it.description)}</strong></td>
      <td style="text-align:center;">${it.quantity || 1}</td>
      <td style="text-align:right;">${fmtMoney(it.unit_price || 0)}</td>
      <td style="text-align:right;">${fmtMoney(it.amount)}</td>
    </tr>
  `).join('');

  const balance = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));

  const w = window.open('', '_blank', 'width=800,height=900');
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tax Invoice #INV-${String(inv.id).padStart(4, '0')}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #0f172a; margin: 0; }
        .invoice-box { max-width: 760px; margin: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 24px; }
        .header-table { width: 100%; border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 14px; }
        .hosp-title { font-size: 24px; font-weight: 800; color: #0369a1; text-transform: uppercase; margin: 0; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
        .section-badge { display: inline-block; padding: 4px 10px; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 12px; border-radius: 4px; margin: 12px 0 6px; text-transform: uppercase; }
        table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px; }
        table.items-table th { background: #f1f5f9; padding: 8px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 11px; text-transform: uppercase; }
        table.items-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
        .totals-box { width: 320px; margin-left: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; }
        .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .grand-total-row { border-top: 2px solid #0f172a; font-size: 16px; font-weight: 800; color: #0369a1; margin-top: 6px; padding-top: 6px; }
        .footer-note { text-align: center; margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; }
        .signature-grid { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; font-size: 12px; color: #334155; }
        @media print {
          body { padding: 0; }
          .invoice-box { border: none; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <table class="header-table">
          <tr>
            <td>
              <h1 class="hosp-title">🏥 CITY CARE MULTISPECIALITY HOSPITAL</h1>
              <div style="font-size:12px; color:#475569; margin-top:4px;">
                Central Healthcare & Diagnostic Center | ISO 9001:2015 Certified<br>
                123 Healthcare Boulevard, Metro City • Hospital Desk Helpline: +91 98765 43210<br>
                GSTIN: 27AABCH1234F1Z5 • Email: billing@citycarehospital.com
              </div>
            </td>
            <td style="text-align:right; vertical-align:top;">
              <div style="font-size:20px; font-weight:800; color:#0f172a;">TAX INVOICE</div>
              <div style="font-size:13px; font-weight:700; color:#2563eb;">#INV-${String(inv.id).padStart(4, '0')}</div>
              <div style="font-size:12px; color:#64748b; margin-top:2px;">Date: ${fmtDate(inv.created_at)}</div>
              <div style="margin-top:6px;"><span style="display:inline-block; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700; background:${inv.status === 'paid' ? '#dcfce7; color:#166534;' : '#fee2e2; color:#991b1b;'}">${inv.status.toUpperCase()}</span></div>
            </td>
          </tr>
        </table>

        <div class="meta-grid">
          <div>
            <strong>Patient Name:</strong> ${escapeHtml(inv.patient_name)}<br>
            <strong>Patient MRN:</strong> #${inv.patient_id} &nbsp;|&nbsp; <strong>Gender:</strong> ${escapeHtml(inv.gender || '-')}<br>
            <strong>Blood Group:</strong> ${escapeHtml(inv.blood_group || '-')}<br>
            <strong>Phone:</strong> ${escapeHtml(inv.patient_phone || '-')}
          </div>
          <div>
            <strong>Billing Type:</strong> ${(inv.bill_type || 'unified').toUpperCase()}<br>
            <strong>Admitted Ward/Room:</strong> ${inv.room_no ? `Room ${escapeHtml(inv.room_no)} / Bed ${escapeHtml(inv.bed_no)}` : 'Outpatient (OPD)'}<br>
            <strong>Payment Method:</strong> ${(inv.payment_method || 'cash').toUpperCase()}<br>
            <strong>Print Timestamp:</strong> ${new Date().toLocaleString()}
          </div>
        </div>

        ${hospRows ? `
          <div class="section-badge">Section A: Hospital Healthcare & Facility Services</div>
          <table class="items-table">
            <thead>
              <tr><th style="width:30px;">#</th><th>Description</th><th style="text-align:center; width:50px;">Qty</th><th style="text-align:right; width:90px;">Rate</th><th style="text-align:right; width:100px;">Amount</th></tr>
            </thead>
            <tbody>${hospRows}</tbody>
          </table>
        ` : ''}

        ${pharmaRows ? `
          <div class="section-badge" style="background:#fef3c7; color:#92400e;">Section B: Medical Store & Pharmacy Dispensary</div>
          <table class="items-table">
            <thead>
              <tr><th style="width:30px;">#</th><th>Prescribed Medicine / Item</th><th style="text-align:center; width:50px;">Qty</th><th style="text-align:right; width:90px;">Unit Rate</th><th style="text-align:right; width:100px;">Amount</th></tr>
            </thead>
            <tbody>${pharmaRows}</tbody>
          </table>
        ` : ''}

        <div class="totals-box">
          <div class="totals-row"><span>Hospital Subtotal:</span><strong>${fmtMoney(inv.hospital_total || 0)}</strong></div>
          <div class="totals-row"><span>Medical Store Subtotal:</span><strong>${fmtMoney(inv.pharmacy_total || 0)}</strong></div>
          ${inv.discount > 0 ? `<div class="totals-row" style="color:#16a34a;"><span>Discount:</span><strong>-${fmtMoney(inv.discount)}</strong></div>` : ''}
          ${inv.tax > 0 ? `<div class="totals-row"><span>Tax / GST:</span><strong>+${fmtMoney(inv.tax)}</strong></div>` : ''}
          <div class="totals-row grand-total-row">
            <span>Net Payable Total:</span><strong>${fmtMoney(inv.total_amount)}</strong>
          </div>
          <div class="totals-row" style="color:#16a34a; margin-top:4px;"><span>Amount Received:</span><strong>${fmtMoney(inv.paid_amount)}</strong></div>
          <div class="totals-row" style="color:${balance > 0 ? '#dc2626' : '#16a34a'}; font-weight:700;">
            <span>Balance Due:</span><strong>${fmtMoney(balance)}</strong>
          </div>
        </div>

        <div class="signature-grid">
          <div>
            Prepared By: <strong>${escapeHtml(user.name)}</strong> (${user.role.toUpperCase()})<br>
            <small style="color:#64748b;">Computer generated tax invoice. No signature required.</small>
          </div>
          <div style="text-align:right;">
            ____________________________<br>
            <strong>Authorized Hospital Signatory / Cashier</strong>
          </div>
        </div>

        <div class="footer-note">
          Thank you for choosing Apex Multispeciality Hospital. Wishing you a speedy recovery! • Helpline: +91 98765 43210
        </div>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      <\/script>
    </body>
    </html>
  `);
  w.document.close();
}

async function makePayment(invoiceId) {
  try {
    const amount = parseFloat(document.getElementById('pay_amount').value);
    const method = document.getElementById('pay_method').value;
    if (!amount || amount <= 0) return showToast('Enter a valid payment amount.', 'error');

    await Api.post('/billing/payments', { invoice_id: invoiceId, amount, method });
    showToast('✅ Payment recorded successfully.');
    closeModal();
    route();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ==========================================================================
   PHARMACIST PRESCRIPTION QUEUE (Doctor Prescriptions Fulfillment)
   ========================================================================== */
async function renderPharmacyPrescriptions() {
  const res = await Api.get('/medical-records/prescriptions/queue');
  document.getElementById('content').innerHTML = `
    ${toolbar(
      'Doctor Prescriptions Queue',
      `${res.data.length} recent prescriptions issued by doctors for dispensing`,
      '<button onclick="openUnifiedBillModal({ defaultType: \'pharmacy\' })">+ Direct Medical Store Sale</button>'
    )}
    ${renderTable(
      ['Prescribed Date', 'Patient Name & Phone', 'Attending Doctor', 'Medicine Name', 'Dosage & Freq', 'Stock Status', 'Dispense Status', 'Action'],
      res.data,
      (rx) => `
        <tr>
          <td>${fmtDateTime(rx.created_at)}</td>
          <td><strong>${escapeHtml(rx.patient_name)}</strong><br><small class="text-muted">${escapeHtml(rx.patient_phone || '')}</small></td>
          <td>Dr. ${escapeHtml(rx.doctor_name)}</td>
          <td><strong>${escapeHtml(rx.medicine_name)}</strong></td>
          <td>${escapeHtml(rx.dosage || '-')} (${escapeHtml(rx.frequency || '1-0-1')})</td>
          <td>
            ${rx.inventory_id
              ? (rx.stock_available > 10 ? `<span class="badge badge-green">${rx.stock_available} in stock</span>` : `<span class="badge badge-yellow">Low: ${rx.stock_available} left</span>`)
              : `<span class="badge badge-gray">Not in inventory</span>`}
          </td>
          <td>${badge(rx.status || 'pending', rx.status === 'dispensed' ? 'green' : 'yellow')}</td>
          <td>
            ${rx.status !== 'dispensed'
              ? `<button onclick="openUnifiedBillModal({ patient_id: ${rx.patient_id}, defaultType: 'pharmacy' })" style="background:var(--color-success); font-size:12px; padding:4px 10px;">
                   ⚡ Dispense & Bill
                 </button>`
              : '<span class="text-muted" style="font-size:12px;">✅ Dispensed</span>'}
          </td>
        </tr>
      `
    )}
  `;
}

/* ==========================================================================
   ADMIN HOSPITAL SETTINGS & GOVERNANCE
   ========================================================================== */
async function renderSystemSettings() {
  const [deptRes, staffRes, doctorsRes, bedsRes] = await Promise.all([
    Api.get('/staff/departments/all'),
    Api.get('/staff'),
    Api.get('/doctors'),
    Api.get('/beds')
  ]);

  document.getElementById('content').innerHTML = `
    ${toolbar('Hospital Information & Governance Settings', 'System configuration, hospital profile and facility controls')}
    <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:20px;">
      <div class="card">
        <h3 class="mt-0">🏥 Hospital Profile & Configuration</h3>
        <form id="settingsForm">
          <label>Hospital Legal Name</label>
          <input id="set_name" value="City Care Multispeciality Hospital & Diagnostic Center">
          <div class="form-row">
            <div><label>Hospital Desk Helpline Phone</label><input id="set_phone" value="+91 98765 43210"></div>
            <div><label>Patient Support Desk Phone</label><input id="set_amb" value="+91 98765 43211"></div>
          </div>
          <div class="form-row">
            <div><label>Official GSTIN / Registration No</label><input id="set_gst" value="27AABCH1234F1Z5"></div>
            <div><label>Hospital Currency</label><input id="set_curr" value="INR (₹)" readonly></div>
          </div>
          <label>Hospital Address</label>
          <input id="set_addr" value="123 Healthcare Boulevard, Metro Health City, 400001">
          <button type="submit" style="background:var(--color-primary);">Save System Settings</button>
        </form>
      </div>

      <div>
        <div class="card" style="margin-bottom:16px;">
          <h3 class="mt-0">🏢 Infrastructure Summary</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px;">
            <div style="background:#f8fafc; padding:12px; border-radius:6px;">
              <div class="text-muted" style="font-size:12px;">Active Departments</div>
              <div style="font-size:22px; font-weight:700;">${deptRes.data.length}</div>
            </div>
            <div style="background:#f8fafc; padding:12px; border-radius:6px;">
              <div class="text-muted" style="font-size:12px;">Registered Doctors</div>
              <div style="font-size:22px; font-weight:700;">${doctorsRes.data.length}</div>
            </div>
            <div style="background:#f8fafc; padding:12px; border-radius:6px;">
              <div class="text-muted" style="font-size:12px;">Clinical & Ops Staff</div>
              <div style="font-size:22px; font-weight:700;">${staffRes.data.length}</div>
            </div>
            <div style="background:#f8fafc; padding:12px; border-radius:6px;">
              <div class="text-muted" style="font-size:12px;">Total Beds Configured</div>
              <div style="font-size:22px; font-weight:700;">${bedsRes.data.length}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 class="mt-0">🔒 Compliance & RBAC Policy</h3>
          <p style="font-size:13px; color:#475569;">
            Role-Based Access Control (RBAC) is enforced centrally at the API middleware level. 
            Administrators manage users, audit logs, and infrastructure. 
            Clinical records and prescription issuing are restricted exclusively to verified medical practitioners.
          </p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('✅ Hospital configuration settings updated.');
  });
}


/* ==========================================================================
   AI DECISION SUPPORT (Triage)
   ========================================================================== */
async function renderAiTriage() {
  document.getElementById('content').innerHTML = `
    ${toolbar('AI Decision Support — Triage', 'Rule-based vitals/symptom flagging. Not a diagnosis.')}
    <div class="card" style="max-width:560px;">
      <form id="aiForm">
        <div class="form-row"><div><label>Temperature (°C)</label><input type="number" step="0.1" id="ai_temp"></div><div><label>Heart Rate (bpm)</label><input type="number" id="ai_hr"></div></div>
        <div class="form-row"><div><label>SpO2 (%)</label><input type="number" id="ai_spo2"></div><div><label>Respiratory Rate</label><input type="number" id="ai_rr"></div></div>
        <div class="form-row"><div><label>Systolic BP</label><input type="number" id="ai_sbp"></div><div><label>Diastolic BP</label><input type="number" id="ai_dbp"></div></div>
        <label>Symptoms (comma separated)</label><input id="ai_symptoms" placeholder="e.g. chest pain, dizziness">
        <button type="submit" style="width:100%; justify-content:center;">Get Decision-Support Suggestion</button>
      </form>
      <div id="aiResult"></div>
    </div>
  `;
  document.getElementById('aiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await Api.post('/ai/triage-suggestion', {
        temperature_c: parseFloat(ai_temp.value) || undefined, heart_rate: parseFloat(ai_hr.value) || undefined,
        spo2: parseFloat(ai_spo2.value) || undefined, respiratory_rate: parseFloat(ai_rr.value) || undefined,
        systolic_bp: parseFloat(ai_sbp.value) || undefined, diastolic_bp: parseFloat(ai_dbp.value) || undefined,
        symptoms: ai_symptoms.value ? ai_symptoms.value.split(',').map((s) => s.trim()) : []
      });
      const r = res.data;
      document.getElementById('aiResult').innerHTML = `
        <div class="card" style="margin-top:16px;">
          <p><strong>Risk Level:</strong> ${badge(r.riskLevel, r.riskLevel === 'critical' || r.riskLevel === 'high' ? 'red' : r.riskLevel === 'medium' ? 'yellow' : 'green')}</p>
          <p><strong>Recommendation:</strong> ${escapeHtml(r.recommendation)}</p>
          ${r.flags.length ? `<p><strong>Flags:</strong></p><ul>${r.flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : '<p class="text-muted">No risk flags triggered.</p>'}
          <div class="disclaimer-box">${escapeHtml(r.disclaimer)}</div>
        </div>`;
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   AUDIT LOGS
   ========================================================================== */
async function renderAuditLogs() {
  const res = await Api.get('/audit-logs');
  document.getElementById('content').innerHTML = `
    ${toolbar('Audit Logs', `${res.data.length} recent entries (max 500 shown)`)}
    ${renderTable(['User', 'Action', 'Entity', 'Entity ID', 'Details', 'IP', 'When'], res.data, (l) => `
      <tr><td>${escapeHtml(l.user_name || 'System')}</td><td>${badge(l.action, 'blue')}</td><td>${escapeHtml(l.entity || '-')}</td>
      <td>${l.entity_id || '-'}</td><td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(l.details || '-')}</td>
      <td>${escapeHtml(l.ip_address || '-')}</td><td>${fmtDateTime(l.created_at)}</td></tr>
    `)}
  `;
}

/* ==========================================================================
   DOCUMENTS
   ========================================================================== */
async function renderDocuments() {
  const patientId = user.patientId;
  const res = await Api.get(`/documents/patient/${patientId}`);
  document.getElementById('content').innerHTML = `
    ${toolbar('My Documents', `${res.data.length} files`, '<button onclick="openDocUploadForm()">+ Upload Document</button>')}
    ${renderTable(['Name', 'Type', 'Uploaded By', 'Date', 'Actions'], res.data, (d) => `
      <tr><td>${escapeHtml(d.original_name)}</td><td>${escapeHtml(d.doc_type)}</td><td>${escapeHtml(d.uploaded_by_name)}</td><td>${fmtDateTime(d.uploaded_at)}</td>
      <td><a href="#" onclick="downloadDoc(${d.id}); return false;">Download</a></td></tr>
    `)}
  `;
}
function openDocUploadForm() {
  openModal(`<h3>Upload Document</h3><form id="docForm">
    <label>Document Type</label><input id="doc_type" placeholder="e.g. ID proof, previous prescription">
    <label>File *</label><input type="file" id="doc_file" required>
    <div class="flex-between"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit">Upload</button></div></form>`);
  document.getElementById('docForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('patient_id', user.patientId);
      fd.append('doc_type', document.getElementById('doc_type').value);
      fd.append('file', document.getElementById('doc_file').files[0]);
      await Api.postForm('/documents', fd);
      showToast('Document uploaded.'); closeModal(); route();
    } catch (err) { showToast(err.message, 'error'); }
  });
}
async function downloadDoc(id) {
  const res = await fetch(`${Api.base}/documents/${id}/download`, { headers: { Authorization: `Bearer ${Api.token()}` } });
  if (!res.ok) return showToast('Download failed.', 'error');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = ''; a.click();
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   QR CODE (patient identification)
   ========================================================================== */
async function viewPatientQr(id, name) {
  const imgUrl = `${Api.base}/patients/${id}/qrcode`;
  // Fetch as a blob so the authenticated request (Bearer token) actually works
  // inside the <img> tag, which can't send custom headers on its own.
  let objectUrl;
  try {
    const res = await fetch(imgUrl, { headers: { Authorization: `Bearer ${Api.token()}` } });
    if (!res.ok) throw new Error('QR code not found for this patient.');
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
  } catch (err) {
    return showToast(err.message, 'error');
  }
  openModal(`
    <h3>Patient QR ID — ${escapeHtml(name)}</h3>
    <div style="text-align:center;">
      <img id="qrModalImg" src="${objectUrl}" style="max-width:260px; border:1px solid var(--color-border); border-radius:8px; padding:10px;">
      <p class="text-muted" style="margin-top:8px;">Patient ID: ${id}</p>
      <div class="flex-between" style="margin-top:14px;">
        <button class="secondary" onclick="closeModal()">Close</button>
        <button onclick="printPatientQr('${escapeHtml(name)}', ${id})">🖨️ Print ID Card</button>
      </div>
    </div>
  `);
}

function printPatientQr(name, id) {
  const imgSrc = document.getElementById('qrModalImg').src;
  const w = window.open('', '_blank', 'width=400,height=500');
  w.document.write(`
    <html><head><title>Patient ID Card</title>
    <style>body{font-family:sans-serif; text-align:center; padding:30px;} img{width:220px;}</style>
    </head><body>
      <h2>🏥 HMS Patient ID</h2>
      <p><strong>${escapeHtml(name)}</strong></p>
      <img src="${imgSrc}">
      <p>Patient ID: ${id}</p>
      <script>window.onload = () => { window.print(); }<\/script>
    </body></html>
  `);
  w.document.close();
}

async function renderQrCode() {
  document.getElementById('content').innerHTML = `
    ${toolbar('My QR Identification', 'Show this at reception/pharmacy/lab for quick lookup')}
    <div class="card" style="max-width:320px; text-align:center;">
      <img id="myQrImg" style="max-width:100%; border-radius:8px; display:none;">
      <p id="qrErr" style="display:none; color:#dc2626;">QR code not available. Contact reception.</p>
      <p class="text-muted" style="margin-top:10px;">Patient ID: ${user.patientId}</p>
    </div>
  `;
  try {
    const res = await fetch(`${Api.base}/patients/${user.patientId}/qrcode`, { headers: { Authorization: `Bearer ${Api.token()}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const img = document.getElementById('myQrImg');
    img.src = URL.createObjectURL(blob);
    img.style.display = 'inline-block';
  } catch {
    document.getElementById('qrErr').style.display = 'block';
  }
}

/* ==========================================================================
   PROFILE / ACCOUNT
   ========================================================================== */
async function renderProfile() {
  document.getElementById('content').innerHTML = `
    ${toolbar('My Account', 'Profile & security settings')}
    <div class="form-row">
      <div class="card">
        <h3 class="mt-0">Profile</h3>
        <p><strong>Name:</strong> ${escapeHtml(user.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
        <p><strong>Role:</strong> ${escapeHtml(user.role.replace('_', ' '))}</p>
      </div>
      <div class="card">
        <h3 class="mt-0">Change Password</h3>
        <form id="pwForm">
          <label>Current Password</label><input type="password" id="pw_current" required>
          <label>New Password</label><input type="password" id="pw_new" required minlength="6">
          <button type="submit" style="width:100%; justify-content:center;">Update Password</button>
        </form>
      </div>
    </div>
  `;
  document.getElementById('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.put('/auth/change-password', { currentPassword: pw_current.value, newPassword: pw_new.value });
      showToast('Password updated.'); pwForm.reset();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ==========================================================================
   AESTHETIC DASHBOARD ENHANCEMENTS & CAREBOT AI CONCIERGE
   ========================================================================== */
function startLiveClock() {
  const clockEl = document.getElementById('liveClockDisplay');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString([], { day: 'numeric', month: 'short' });
    clockEl.textContent = `${timeStr} • ${dateStr}`;
  };
  update();
  setInterval(update, 1000);
}

function handleQuickSearch(e) {
  const val = (e.target.value || '').trim().toLowerCase();
  if (e.key === 'Enter' && val) {
    if (val.includes('doc') || val.includes('dr')) {
      location.hash = 'doctors';
    } else if (val.includes('bill') || val.includes('inv')) {
      location.hash = 'hospital-billing';
    } else if (val.includes('lab') || val.includes('test')) {
      location.hash = 'lab-requests';
    } else {
      location.hash = 'patients';
    }
  }
}

// CareBot AI Chatbot client state & methods
let chatHistory = [];
let isChatOpen = false;

function toggleChatBot() {
  const modal = document.getElementById('carebotModal');
  if (!modal) return;
  isChatOpen = !isChatOpen;
  modal.style.display = isChatOpen ? 'flex' : 'none';
  if (isChatOpen) {
    const body = document.getElementById('carebotBody');
    if (body) body.scrollTop = body.scrollHeight;
    const inp = document.getElementById('carebotInput');
    if (inp) inp.focus();
  }
}

function resetChatBot() {
  chatHistory = [];
  const body = document.getElementById('carebotBody');
  if (!body) return;
  body.innerHTML = `
    <div class="chat-msg bot">
      <div class="chat-msg-avatar">🤖</div>
      <div class="chat-msg-bubble">
        Hello! 👋 I am <strong>CareBot</strong>, your City Care Hospital AI Concierge.<br><br>
        Ask me anything about:
        <ul style="margin:4px 0 6px 16px; padding:0;">
          <li>🩺 <strong>Available Doctors & Appointments</strong></li>
          <li>🏥 <strong>Hospital & Diagnostic Lab Billing</strong></li>
          <li>🔬 <strong>Pathology Tests Catalog & Pricing</strong></li>
          <li>💊 <strong>Pharmacy Medicines & Prescriptions</strong></li>
          <li>🛏️ <strong>Wards & Bed Availability</strong></li>
        </ul>
        What would you like to know?
      </div>
    </div>
    <div class="chat-suggestions" id="chatSuggestions">
      ${user && user.role === 'patient' ? `
        <div class="chat-chip" onclick="askQuickPrompt('My billing statement')">💳 My Bills & Due</div>
        <div class="chat-chip" onclick="askQuickPrompt('My scheduled appointments')">📅 My Appointments</div>
        <div class="chat-chip" onclick="askQuickPrompt('My lab reports')">🔬 My Lab Reports</div>
        <div class="chat-chip" onclick="askQuickPrompt('Available Doctors')">🩺 Available Doctors</div>
        <div class="chat-chip" onclick="askQuickPrompt('Lab tests & pricing')">🔬 Diagnostic Tests</div>
        <div class="chat-chip" onclick="askQuickPrompt('Hospital timings')">🕒 Working Hours</div>
      ` : `
        <div class="chat-chip" onclick="askQuickPrompt('Available Doctors')">🩺 Available Doctors</div>
        <div class="chat-chip" onclick="askQuickPrompt('Hospital & Lab Billing')">🏥 Hospital & Lab Billing</div>
        <div class="chat-chip" onclick="askQuickPrompt('Lab tests & pricing')">🔬 Diagnostic Tests</div>
        <div class="chat-chip" onclick="askQuickPrompt('Pharmacy & Prescriptions')">💊 Pharmacy & Rx</div>
        <div class="chat-chip" onclick="askQuickPrompt('Bed availability')">🛏️ Inpatient Wards</div>
        <div class="chat-chip" onclick="askQuickPrompt('Hospital timings')">🕒 Working Hours</div>
      `}
    </div>
  `;
}

function askQuickPrompt(text) {
  const inp = document.getElementById('carebotInput');
  if (inp) {
    inp.value = text;
    handleChatSubmit(new Event('submit'));
  }
}

function formatBotText(rawText) {
  let text = escapeHtml(rawText);
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/^• (.*?)$/gm, '<li style="margin-left:14px;">$1</li>');
  text = text.replace(/^- (.*?)$/gm, '<li style="margin-left:14px;">$1</li>');
  text = text.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return text;
}

async function handleChatSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const inp = document.getElementById('carebotInput');
  const msg = (inp.value || '').trim();
  if (!msg) return;

  inp.value = '';
  appendUserMessage(msg);

  const typingId = showTypingIndicator();

  try {
    const res = await Api.post('/ai/chat', { message: msg, history: chatHistory.slice(-6) });
    removeTypingIndicator(typingId);

    const reply = res.data.reply;
    const suggestions = res.data.suggestions || [];
    chatHistory.push({ role: 'user', content: msg });
    chatHistory.push({ role: 'assistant', content: reply });

    appendBotMessage(reply, suggestions);
  } catch (err) {
    removeTypingIndicator(typingId);
    appendBotMessage(`I apologize, but I could not connect to the hospital AI service. Please try again or visit our Front Desk. (${escapeHtml(err.message)})`);
  }
}

function appendUserMessage(text) {
  const body = document.getElementById('carebotBody');
  if (!body) return;
  const userInitial = (user.name || 'U').charAt(0).toUpperCase();
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.innerHTML = `
    <div class="chat-msg-bubble">${escapeHtml(text)}</div>
    <div class="chat-msg-avatar" style="background:#2563eb; color:#fff;">${userInitial}</div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function showTypingIndicator() {
  const body = document.getElementById('carebotBody');
  if (!body) return null;
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.id = id;
  div.innerHTML = `
    <div class="chat-msg-avatar">🤖</div>
    <div class="chat-msg-bubble" style="color:#64748b; font-style:italic;">
      Thinking...
    </div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendBotMessage(rawText, suggestions = []) {
  const body = document.getElementById('carebotBody');
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = `
    <div class="chat-msg-avatar">🤖</div>
    <div class="chat-msg-bubble">${formatBotText(rawText)}</div>
  `;
  body.appendChild(div);

  const oldChips = document.getElementById('chatSuggestions');
  if (oldChips) oldChips.remove();

  if (suggestions && suggestions.length) {
    const sugDiv = document.createElement('div');
    sugDiv.className = 'chat-suggestions';
    sugDiv.id = 'chatSuggestions';
    sugDiv.innerHTML = suggestions.map(s => `<div class="chat-chip" onclick="askQuickPrompt('${escapeHtml(s)}')">${escapeHtml(s)}</div>`).join('');
    body.appendChild(sugDiv);
  }

  body.scrollTop = body.scrollHeight;
}

// ---------------- Boot ----------------
initShell();
