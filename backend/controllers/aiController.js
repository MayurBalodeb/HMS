const pool = require('../config/db');
const { evaluateTriage } = require('../utils/decisionSupport');
const { logAction } = require('../middleware/auditLogger');
const { notifyUser } = require('../utils/notifier');

exports.triageSuggestion = async (req, res, next) => {
  try {
    const { patient_id } = req.body;
    const result = evaluateTriage(req.body);

    await pool.query(
      `INSERT INTO ai_suggestions (patient_id, created_by, input_json, suggestion, risk_level) VALUES (?, ?, ?, ?, ?)`,
      [patient_id || null, req.user.id, JSON.stringify(req.body), result.recommendation, result.riskLevel]
    );

    if (['high', 'critical'].includes(result.riskLevel)) {
      const [doctors] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'doctor'`);
      for (const d of doctors) {
        await notifyUser(d.id, { title: `${result.riskLevel.toUpperCase()} risk flag`, message: result.recommendation, type: 'ai_alert' });
      }
    }

    await logAction(req, { action: 'AI_TRIAGE', entity: 'ai_suggestions', details: `risk=${result.riskLevel}` });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.getHistory = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, u.name AS created_by_name FROM ai_suggestions a JOIN users u ON a.created_by = u.id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.chatAssistant = async (req, res, next) => {
  try {
    const message = (req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message is required.' });

    const lower = message.toLowerCase();
    const u = req.user;
    let reply = '';
    let suggestions = [];

    // Helper regex checkers using word boundaries to prevent substring collisions (e.g. 'available' matching 'lab')
    const hasWord = (...patterns) => patterns.some(p => new RegExp(`\\b${p}\\b`, 'i').test(lower));

    // 1. Personalized queries if logged in as patient
    if (u && u.patientId && (hasWord('bill', 'bills', 'due', 'dues', 'invoice', 'invoices', 'balance') || lower.includes('my bill') || lower.includes('my due') || lower.includes('what do i owe') || lower.includes('how much to pay'))) {
      try {
        const [invoices] = await pool.query(
          `SELECT id, bill_type, total_amount, paid_amount, status, created_at 
           FROM invoices WHERE patient_id = ? ORDER BY created_at DESC LIMIT 5`,
          [u.patientId]
        );
        if (!invoices.length) {
          reply = `📋 **Billing Status for ${u.name}**:\n\nYou currently have no issued invoices on record. All hospital visits and pharmacy orders are completely clear!`;
          suggestions = ['Book an appointment', 'Available Doctors', 'Diagnostic Tests'];
        } else {
          let totalBilled = 0;
          let totalPaid = 0;
          const invLines = invoices.map(i => {
            const t = Number(i.total_amount || 0);
            const p = Number(i.paid_amount || 0);
            totalBilled += t;
            totalPaid += p;
            const bal = Math.max(0, t - p);
            return `• **#INV-${String(i.id).padStart(4, '0')}** (${(i.bill_type || 'hospital').toUpperCase()}): Total ₹${t.toFixed(2)} | Balance: **₹${bal.toFixed(2)}** [${i.status.toUpperCase()}]`;
          }).join('\n');
          const grandDue = Math.max(0, totalBilled - totalPaid);

          reply = `💳 **Personal Billing Statement for ${u.name}**:\n\n${invLines}\n\n📊 **Total Outstanding Balance**: **₹${grandDue.toFixed(2)}**\n\n📌 **Payment Counter Policy**: Direct payments are received at the **Hospital Front Desk** or **Central Accounts Desk**. Patients can view bills and download tax receipts from the **My Bills & Receipts** tab.`;
          suggestions = ['My appointments', 'My lab reports', 'Working Hours'];
        }
      } catch (err) {
        reply = `💳 **Billing Desk Notice**: You can view your complete itemized invoices and payment receipts anytime under the **My Bills & Receipts** tab in your patient portal.`;
        suggestions = ['Available Doctors', 'Working Hours'];
      }
    } else if (u && u.patientId && (hasWord('appointment', 'appointments', 'visit', 'visits') || lower.includes('when is my') || lower.includes('next appointment'))) {
      try {
        const [appts] = await pool.query(
          `SELECT a.id, a.appointment_date, a.time_slot, a.status, du.name AS doctor_name, dep.name AS department_name
           FROM appointments a
           JOIN doctors d ON a.doctor_id = d.id
           JOIN users du ON d.user_id = du.id
           LEFT JOIN departments dep ON d.department_id = dep.id
           WHERE a.patient_id = ? AND a.appointment_date >= CURDATE()
           ORDER BY a.appointment_date, a.time_slot LIMIT 3`,
          [u.patientId]
        );
        if (!appts.length) {
          reply = `📅 **Upcoming Appointments for ${u.name}**:\n\nYou have no upcoming OPD appointments scheduled. You can book an appointment anytime from the **Book & View Appointments** tab!`;
          suggestions = ['Available Doctors', 'Working Hours', 'Diagnostic Tests'];
        } else {
          const apptList = appts.map(a => {
            const docName = 'Dr. ' + (a.doctor_name || '').replace(/^Dr\.?\s*/i, '');
            return `• **${a.appointment_date} (${a.time_slot || 'OPD Slot'})** with **${docName}** (${a.department_name || 'General'}) — Status: **${a.status.toUpperCase()}**`;
          }).join('\n');
          reply = `📅 **Your Scheduled Appointments, ${u.name}**:\n\n${apptList}\n\n💡 Please check-in at the Front Desk 15 minutes before your scheduled consultation time.`;
          suggestions = ['My bills & due', 'Diagnostic Tests', 'Available Doctors'];
        }
      } catch (err) {
        reply = `📅 You can manage and schedule your doctor consultations directly from the **Book & View Appointments** tab in your portal.`;
        suggestions = ['Available Doctors', 'Working Hours'];
      }
    } else if (u && u.patientId && (lower.includes('my lab') || lower.includes('my report') || lower.includes('my test') || lower.includes('report status'))) {
      try {
        const [reports] = await pool.query(
          `SELECT lr.id, lr.status, lr.requested_at, lt.name AS test_name, lrep.result_summary
           FROM lab_requests lr
           JOIN lab_tests lt ON lr.test_id = lt.id
           LEFT JOIN lab_reports lrep ON lr.id = lrep.request_id
           WHERE lr.patient_id = ?
           ORDER BY lr.requested_at DESC LIMIT 4`,
          [u.patientId]
        );
        if (!reports.length) {
          reply = `🔬 **Diagnostic Reports for ${u.name}**:\n\nNo pathology lab investigations are currently on record for your account.`;
          suggestions = ['Diagnostic Tests', 'Available Doctors', 'Book an appointment'];
        } else {
          const repList = reports.map(r => `• **${r.test_name}**: Status **${r.status.toUpperCase()}** ${r.result_summary ? `— Result: *${r.result_summary}*` : ''}`).join('\n');
          reply = `🔬 **Your Diagnostic Lab Tests, ${u.name}**:\n\n${repList}\n\n📄 Completed diagnostic reports can be viewed and downloaded directly in the **My Lab Reports** tab.`;
          suggestions = ['My bills & due', 'My appointments', 'Available Doctors'];
        }
      } catch (err) {
        reply = `🔬 Your lab reports are processed round-the-clock and can be downloaded from the **My Lab Reports** tab once verified.`;
        suggestions = ['Diagnostic Tests', 'Available Doctors'];
      }
    } else if (u && u.patientId && (lower.includes('my prescription') || lower.includes('my medicine') || lower.includes('what medicine'))) {
      try {
        const [prescriptions] = await pool.query(
          `SELECT pr.medicine_name, pr.dosage, pr.duration, pr.instructions, mr.visit_date
           FROM prescriptions pr
           JOIN medical_records mr ON pr.medical_record_id = mr.id
           WHERE mr.patient_id = ?
           ORDER BY mr.visit_date DESC, pr.id DESC LIMIT 5`,
          [u.patientId]
        );
        if (!prescriptions.length) {
          reply = `📋 **Prescription Records for ${u.name}**:\n\nNo clinical prescriptions recorded yet. Any medicines prescribed by doctors during consultations appear automatically in your **Complete Medical History** tab.`;
          suggestions = ['Available Doctors', 'Book an appointment', 'My bills & due'];
        } else {
          const medList = prescriptions.map(m => `• **${m.medicine_name}** — ${m.dosage || ''} (${m.duration || ''}) [${m.instructions || 'As advised'}]`).join('\n');
          reply = `💊 **Your Doctor Prescribed Medications, ${u.name}**:\n\n${medList}\n\n🏥 Genuine medications are dispensed at our Central Pharmacy Counter.`;
          suggestions = ['My appointments', 'My bills & due', 'Working Hours'];
        }
      } catch (err) {
        reply = `💊 Your doctor-prescribed medications and dosage history are archived under **Complete Medical History & Prescriptions**.`;
        suggestions = ['Available Doctors', 'Working Hours'];
      }
    }
    // 2. Doctor Directory & Available Specialists (Checked BEFORE lab so 'available doctors' matches here!)
    else if (hasWord('doctor', 'doctors', 'dr', 'specialist', 'specialists', 'physician', 'physicians', 'opd', 'roster') || lower.includes('who is doctor') || lower.includes('available doctor')) {
      try {
        const [doctors] = await pool.query(
          `SELECT u.name, d.specialization, d.consultation_fee, dep.name AS department_name
           FROM doctors d
           JOIN users u ON d.user_id = u.id
           LEFT JOIN departments dep ON d.department_id = dep.id
           LIMIT 8`
        );
        const docList = doctors.map(d => {
          const name = 'Dr. ' + (d.name || '').replace(/^Dr\.?\s*/i, '');
          return `• **${name}** — ${d.specialization || d.department_name || 'General Medicine'} (OPD Fee: ₹${d.consultation_fee || 500})`;
        }).join('\n');
        reply = `🩺 **Distinguished Specialists & OPD Doctors**:\n\n${docList}\n\n💡 You can book an appointment directly from the **Book OPD Consultation** section or at the Front Desk!`;
        suggestions = ['Hospital & Lab Billing', 'Diagnostic Tests', 'Working Hours'];
      } catch (err) {
        reply = `🩺 **Medical Faculty at City Care Hospital**:\n\n• **Dr. Alice Rao** — Cardiology Specialist (MD, DM) - ₹500\n• **Dr. Rajesh Kulkarni** — Orthopedic Surgeon (MS Ortho) - ₹600\n• **Dr. Priya Mehta** — Consultant Pediatrician (MD) - ₹500\n• **Dr. Aditya Nainav** — Internal & General Medicine (MD) - ₹500\n\nOPD consultations operate Monday – Saturday, 09:00 AM – 05:00 PM.`;
        suggestions = ['Hospital & Lab Billing', 'Diagnostic Tests', 'Working Hours'];
      }
    }
    // 3. Wards & Inpatient Beds (Checked BEFORE lab so 'bed availability' matches here!)
    else if (hasWord('bed', 'beds', 'ward', 'wards', 'icu', 'room', 'rooms', 'admit', 'admission', 'inpatient') || lower.includes('bed avail')) {
      try {
        const [[stats]] = await pool.query(
          `SELECT COUNT(*) AS total_beds, 
                  SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available_beds,
                  SUM(CASE WHEN status='occupied' THEN 1 ELSE 0 END) AS occupied_beds
           FROM beds`
        );
        reply = `🛏️ **Inpatient Wards & Room Facilities**:\n\n- **Available Beds**: **${stats.available_beds || 0}**\n- **Occupied Beds**: ${stats.occupied_beds || 0}\n- **Total Bed Capacity**: ${stats.total_beds || 0} beds\n\nFacilities include **General Ward (₹800/day)**, **Semi-Private Rooms**, and **Intensive Care Unit (ICU)** equipped with 24/7 nursing and vital monitoring.`;
        suggestions = ['Available Doctors', 'Hospital & Lab Billing', 'Working Hours'];
      } catch (err) {
        reply = `🛏️ **Inpatient Wards & Beds**:\n\nCity Care Hospital houses 120 inpatient beds across General Medical Wards (₹800/day), Semi-Private Rooms, and Intensive Care Units (ICU) with round-the-clock nursing care.`;
        suggestions = ['Available Doctors', 'Working Hours'];
      }
    }
    // 4. Lab Tests Catalog & Pricing
    else if (hasWord('lab', 'labs', 'pathology', 'cbc', 'xray', 'x-ray', 'lipid', 'lft', 'thyroid', 'biochemistry') || lower.includes('lab test') || lower.includes('diagnostic test') || lower.includes('blood test') || lower.includes('test price') || lower.includes('test pricing')) {
      try {
        const [tests] = await pool.query(`SELECT name, category, price FROM lab_tests ORDER BY category, name LIMIT 10`);
        const testList = tests.map(t => `• **${t.name}** (${t.category || 'Diagnostic'}): ₹${t.price}`).join('\n');
        reply = `🔬 **City Care Diagnostic Pathology Catalog**:\n\n${testList}\n\n📌 **Integrated Hospital Billing:** All diagnostic lab investigations ordered by your doctor are billed under **Hospital Billing** at the Front Desk, and test reports appear in **My Lab Reports** as soon as verified by the laboratory!`;
        suggestions = ['Available Doctors', 'Hospital & Lab Billing', 'Working Hours'];
      } catch (err) {
        reply = `🔬 **Diagnostic Pathology Services**:\n\n• Complete Blood Count (CBC): ₹350\n• Lipid Profile Assessment: ₹700\n• Liver Function Test (LFT): ₹600\n• Thyroid Profile (TSH): ₹450\n• Digital Chest X-Ray: ₹500\n• Fasting Blood Sugar: ₹150\n\nAll diagnostic lab investigations are directly billed under Hospital Billing at the Front Desk.`;
        suggestions = ['Available Doctors', 'Hospital & Lab Billing'];
      }
    }
    // 5. Clinical Symptom & Specialty Triage
    else if (lower.includes('chest pain') || lower.includes('heart') || lower.includes('palpitation') || lower.includes('cardio') || lower.includes('bp') || lower.includes('hypertension')) {
      reply = `🫀 **Cardiovascular Care & Specialist Consultation**:\n\nChest pain, palpitations, or blood pressure irregularities should be examined by our Cardiology specialist:\n\n• **Recommended Doctor**: **Dr. Alice Rao** (Cardiology)\n• **Consultation Fee**: ₹500\n• **Relevant Lab Investigations**: ECG, Lipid Profile (₹700)\n• **Action**: Book an appointment with Dr. Alice Rao or visit the hospital reception for prompt examination.`;
      suggestions = ['Available Doctors', 'Diagnostic Tests', 'Working Hours'];
    } else if (lower.includes('bone') || lower.includes('fracture') || lower.includes('joint') || lower.includes('knee') || lower.includes('back pain') || lower.includes('ortho') || lower.includes('spine')) {
      reply = `🦴 **Orthopedics & Joint Care**:\n\nFor joint pain, mobility issues, spine discomfort, or suspected sprains/fractures:\n\n• **Recommended Doctor**: **Dr. Rajesh Kulkarni** (Orthopedics)\n• **Consultation Fee**: ₹600\n• **Diagnostic Services**: Digital Skeletal X-Ray (₹500), Serum Calcium\n• **OPD Hours**: Monday – Saturday, 09:00 AM – 05:00 PM`;
      suggestions = ['Available Doctors', 'Diagnostic Tests', 'Working Hours'];
    } else if (lower.includes('child') || lower.includes('baby') || lower.includes('pediatric') || lower.includes('infant') || lower.includes('kid')) {
      reply = `🧒 **Pediatrics & Child Wellness**:\n\nFor child healthcare, growth monitoring, pediatric fevers, or immunizations:\n\n• **Recommended Specialist**: **Dr. Priya Mehta** (Pediatrics)\n• **Consultation Fee**: ₹500\n• **Specialized Pediatric Clinic**: Daily child wellness check-ups and immunization schedules.`;
      suggestions = ['Available Doctors', 'Working Hours'];
    } else if (lower.includes('stomach') || lower.includes('acidity') || lower.includes('vomit') || lower.includes('gastric') || lower.includes('abdomen') || lower.includes('digestion')) {
      reply = `🩺 **Gastroenterology & Internal Medicine**:\n\nFor abdominal discomfort, nausea, acidity, or digestive issues:\n\n• **Recommended Doctor**: **Dr. Aditya Nainav** (General Medicine)\n• **Consultation Fee**: ₹500\n• **Recommended Tests**: Liver Function Test (LFT: ₹600), Ultrasound Abdomen, Fasting Blood Sugar (₹150).\n• Stay well hydrated with electrolytes and avoid heavy or spicy meals.`;
      suggestions = ['Available Doctors', 'Diagnostic Tests'];
    } else if (lower.includes('fever') || lower.includes('cough') || lower.includes('headache') || lower.includes('cold') || lower.includes('flu') || lower.includes('symptom')) {
      reply = `⚠️ **General Clinical Advice & Triage**:\n\nFor fever, cough, or headaches:\n1. Keep well hydrated and monitor body temperature with a thermometer.\n2. Avoid self-medicating with unprescribed antibiotics.\n3. **Recommended Specialist**: **Dr. Aditya Nainav** (General Medicine - ₹500).\n4. **Recommended Diagnostics**: Complete Blood Count (CBC: ₹350) to evaluate infection markers.\n\n*Note: CareBot provides informative triage guidance and does not replace in-person physician diagnosis.*`;
      suggestions = ['Available Doctors', 'Diagnostic Tests'];
    }
    // 6. Billing, Fees, Payment Counter Policy
    else if (hasWord('bill', 'bills', 'billing', 'payment', 'payments', 'invoice', 'invoices', 'fee', 'fees', 'cost', 'charge', 'charges', 'pay', 'paid')) {
      reply = `💳 **Hospital & Diagnostic Billing Policy**:\n\n1. **🏥 Hospital Services & Lab Billing (Reception Desk)**:\n   - OPD Doctor Consultation: ₹500 – ₹600\n   - General Ward Bed Stay: ₹800/day\n   - **🔬 Diagnostic Lab & Pathology Tests** (CBC, Lipid, LFT, X-Ray) are directly billed under Hospital Billing!\n   - Nursing & clinical care: ₹350\n\n2. **💊 Pharmacy Medical Store (Pharmacy Desk)**:\n   - Doctor prescription dispensing and pharmacy items are billed separately at the Pharmacy Counter.\n\n3. **🔒 Payment Collection Policy**:\n   - Patients can view itemized bills and receipts digitally.\n   - **Fee collection is processed at the Hospital Reception or Central Accounts Desk** via Cash, Debit/Credit Card, or UPI QR.`;
      suggestions = ['Available Doctors', 'Diagnostic Tests', 'Working Hours'];
    }
    // 7. Pharmacy & Medicines
    else if (hasWord('pharmacy', 'medicine', 'medicines', 'tablet', 'tablets', 'drug', 'drugs', 'dispensary', 'prescription', 'prescriptions')) {
      reply = `💊 **Central Pharmacy Dispensary**:\n\n- Whenever a doctor prescribes medication during your consultation, it is automatically routed to our Central Pharmacy.\n- The Pharmacist dispenses genuine batch-tested medications with exact dosage schedules.\n- Your complete prescription history is archived in your **Medical History** tab for all future doctor consultations!`;
      suggestions = ['Available Doctors', 'Working Hours'];
    }
    // 8. Timings & Contact
    else if (hasWord('timing', 'timings', 'time', 'hours', 'open', 'close', 'contact', 'phone', 'helpline', 'location', 'address', 'where')) {
      reply = `🕒 **City Care Hospital Working Hours & Contact**:\n\n- **OPD Consultations**: Monday – Saturday: 09:00 AM – 05:00 PM\n- **Diagnostic Pathology Lab**: 24/7 round-the-clock sample processing\n- **Pharmacy Counter**: 24/7 medicine dispensing\n- **Patient Visiting Hours**: 10:00 AM – 12:00 PM & 05:00 PM – 07:00 PM\n- **Hospital Desk Helpline**: **+91-98765-43210**\n- **Address**: 123 Healthcare Boulevard, Metro City`;
      suggestions = ['Available Doctors', 'Diagnostic Tests', 'Hospital & Lab Billing'];
    }
    // 9. Greeting / General fallback
    else {
      reply = `Hello! 👋 I am **CareBot**, your City Care Hospital AI Concierge.\n\nI can assist you with:\n- 🩺 **Doctor Consultations & OPD Schedules**\n- 🔬 **Diagnostic Pathology Tests & Pricing**\n- 🏥 **Hospital Billing Information**\n- 💊 **Pharmacy & Medicine Dispensing**\n- 🛏️ **Inpatient Wards & Bed Availability**\n- 🕒 **Hospital Timings & Contact Details**\n\nHow can I help you today?`;
      suggestions = [
        u && u.patientId ? 'My bills & due' : 'Available Doctors',
        'Hospital & Lab Billing',
        'Diagnostic Tests',
        'Inpatient Wards',
        'Working Hours'
      ];
    }

    res.json({
      success: true,
      data: {
        reply,
        suggestions,
        timestamp: new Date()
      }
    });
  } catch (err) {
    // Never crash the chat assistant with an unhandled exception
    res.json({
      success: true,
      data: {
        reply: "Hello! I am CareBot, your City Care Hospital Assistant. I am here to help you with doctor OPD timings, diagnostic lab tests, hospital billing, and department information. What would you like to know?",
        suggestions: ['Available Doctors', 'Diagnostic Tests', 'Working Hours'],
        timestamp: new Date()
      }
    });
  }
};
