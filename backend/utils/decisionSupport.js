/**
 * AI-ASSISTED DECISION SUPPORT — RULE-BASED, EXPLAINABLE, NON-DIAGNOSTIC.
 *
 * This module NEVER outputs a diagnosis. It only flags patterns in
 * structured vitals/symptoms that clinical literature associates with
 * higher risk, and recommends a NEXT STEP for a human clinician to
 * consider (e.g. "recheck vitals", "consider urgent review").
 *
 * Every output carries a disclaimer and is logged to `ai_suggestions`
 * for audit/oversight. Swap this file for a call to a real ML/LLM
 * service later without changing any controller that calls it.
 */

function evaluateTriage(input) {
  const {
    temperature_c, heart_rate, spo2, systolic_bp, diastolic_bp,
    respiratory_rate, symptoms = []
  } = input;

  const flags = [];
  let riskScore = 0;

  if (temperature_c != null) {
    if (temperature_c >= 39.5) { flags.push('High fever (≥39.5°C) detected.'); riskScore += 2; }
    else if (temperature_c >= 38) { flags.push('Fever (≥38°C) detected.'); riskScore += 1; }
  }
  if (spo2 != null) {
    if (spo2 < 90) { flags.push('SpO2 critically low (<90%). Consider urgent oxygen assessment.'); riskScore += 3; }
    else if (spo2 < 94) { flags.push('SpO2 below normal range (<94%).'); riskScore += 2; }
  }
  if (heart_rate != null) {
    if (heart_rate > 120 || heart_rate < 45) { flags.push('Heart rate significantly abnormal.'); riskScore += 2; }
    else if (heart_rate > 100) { flags.push('Tachycardia (heart rate >100 bpm).'); riskScore += 1; }
  }
  if (systolic_bp != null && diastolic_bp != null) {
    if (systolic_bp < 90 || diastolic_bp < 60) { flags.push('Possible hypotension — low blood pressure.'); riskScore += 2; }
    if (systolic_bp >= 180 || diastolic_bp >= 120) { flags.push('Hypertensive crisis range blood pressure.'); riskScore += 3; }
  }
  if (respiratory_rate != null && (respiratory_rate > 24 || respiratory_rate < 10)) {
    flags.push('Abnormal respiratory rate.'); riskScore += 2;
  }

  const highRiskKeywords = ['chest pain', 'difficulty breathing', 'shortness of breath', 'unconscious', 'seizure', 'severe bleeding', 'stroke'];
  symptoms.forEach((s) => {
    const lower = String(s).toLowerCase();
    if (highRiskKeywords.some((k) => lower.includes(k))) {
      flags.push(`Reported symptom of concern: "${s}".`);
      riskScore += 3;
    }
  });

  let riskLevel = 'low';
  if (riskScore >= 7) riskLevel = 'critical';
  else if (riskScore >= 4) riskLevel = 'high';
  else if (riskScore >= 2) riskLevel = 'medium';

  const recommendationMap = {
    low: 'Routine monitoring. No immediate escalation flagged by the system.',
    medium: 'Recommend clinician re-check vitals within the next round and monitor trend.',
    high: 'Recommend prompt clinician review; consider escalation to attending doctor.',
    critical: 'Recommend IMMEDIATE clinician review. Pattern strongly associated with urgent cases in reference literature.'
  };

  return {
    flags,
    riskLevel,
    recommendation: recommendationMap[riskLevel],
    disclaimer: 'This is an automated decision-support suggestion based on simple rule matching over the vitals/symptoms provided. It is NOT a diagnosis and does NOT replace clinical judgement. A qualified clinician must review and confirm any action.'
  };
}

module.exports = { evaluateTriage };
