// dpaStackOptimizer.js
// LoanBeacons™ — DPA Stack Optimizer™
// 8-step deterministic eligibility engine. AI (Haiku) summarizes output — does NOT make decisions.

import { getAMIForCounty } from '../../data/dpa/dpaData';

// ── AGENCY CLTV CEILINGS ────────────────────────────────────────────────────
const AGENCY_CLTV = {
  FHA:          1.00,   // 96.5% base; DPA can bring CLTV to 100% via subordinate
  Conventional: 0.97,
  VA:           1.00,
  USDA:         1.00,
};

// ── MAIN EVALUATOR ──────────────────────────────────────────────────────────
export const evaluateProgram = (program, scenario) => {
  const steps = [];
  let finalStatus = 'PASS';
  const warnings = [];

  const {
    state,
    county,
    city,
    loanType,
    purchasePrice,
    loanAmount,
    creditScore,
    annualIncome,
    householdSize,
    firstTimeBuyer,
    backendDTI,
    occupancy,
  } = scenario;

  const { rules, stacking_rules, assistance_amount, assistance_pct, is_active } = program;

  // ── STEP 1: Geography Match ────────────────────────────────────────────────
  const geoResult = (() => {
    if (program.geography_scope === 'national' || !program.state) {
      return { pass: true, reason: 'National program — no geography restriction.' };
    }
    if (program.state && program.state !== state) {
      return { pass: false, reason: `Program limited to ${program.state}. Borrower is in ${state}.` };
    }
    if (program.county && county && program.county.toLowerCase() !== county.toLowerCase()) {
      return { pass: false, reason: `Program limited to ${program.county} County. Property is in ${county} County.` };
    }
    if (program.city && city && program.city.toLowerCase() !== city.toLowerCase()) {
      return { pass: false, reason: `Program limited to ${program.city}. Property is in ${city}.` };
    }
    const scope = program.county ? `${program.county} County, ${program.state}` : program.state;
    return { pass: true, reason: `Geography match confirmed — ${scope}.` };
  })();

  steps.push({ step: 1, name: 'Geography Match', ...geoResult });
  if (!geoResult.pass) return buildResult('FAIL', steps, warnings, program, scenario);

  // ── STEP 2: Loan Type Compatibility ──────────────────────────────────────
  // Normalize loanType: "CONVENTIONAL" → "Conventional", "FHA" → "FHA" etc.
  const normalizeLoanType = (lt) => {
    if (!lt) return '';
    const u = lt.toUpperCase();
    if (u === 'FHA') return 'FHA';
    if (u.includes('CONV')) return 'Conventional';
    if (u === 'VA') return 'VA';
    if (u === 'USDA') return 'USDA';
    return lt;
  };
  const normalizedLoanType = normalizeLoanType(loanType);

  // Map to stacking_rules key: Conventional → conv, FHA → fha, VA → va, USDA → usda
  const loanKeyMap = { 'FHA': 'fha', 'Conventional': 'conv', 'VA': 'va', 'USDA': 'usda' };
  const loanKey = `allowed_with_${loanKeyMap[normalizedLoanType] || normalizedLoanType.toLowerCase()}`;
  const stackingAllowed = stacking_rules?.[loanKey] !== false;
  const rulesAllowed = rules.loan_types_allowed
    ? rules.loan_types_allowed.some(t => normalizeLoanType(t) === normalizedLoanType)
    : true;
  const loanAllowed = stackingAllowed && rulesAllowed;

  const loanResult = loanAllowed
    ? { pass: true, reason: `${normalizedLoanType} loan type is approved for this program.` }
    : { pass: false, reason: `Program does not allow ${normalizedLoanType} loans. Eligible: ${rules.loan_types_allowed?.join(', ') || 'check program'}.` };

  steps.push({ step: 2, name: 'Loan Type Compatibility', ...loanResult });
  if (!loanResult.pass) return buildResult('FAIL', steps, warnings, program, scenario);

  // ── STEP 3: Income Eligibility ────────────────────────────────────────────
  const incomeResult = (() => {
    if (!rules.income_limit) return { pass: true, reason: 'No income limit for this program.' };

    const income = annualIncome || 0;

    // If no county available and income_limit_type is AMI%, we can't verify — CONDITIONAL
    if (rules.income_limit_type === 'AMI%' && !county) {
      return {
        pass: 'conditional',
        reason: `Income limit is ${Math.round(rules.income_limit * 100)}% AMI — county not available to verify. Confirm with program administrator. Borrower income: $${income.toLocaleString()}.`,
      };
    }

    let limit;
    let limitLabel;

    if (rules.income_limit_type === 'AMI%') {
      const amiBase = getAMIForCounty(county, householdSize || 1);
      limit = Math.round(amiBase * rules.income_limit);
      limitLabel = `${Math.round(rules.income_limit * 100)}% AMI for ${county} County (HH size ${householdSize || 1}) = $${limit.toLocaleString()}`;
    } else {
      limit = rules.income_limit;
      limitLabel = `$${limit.toLocaleString()} (absolute limit)`;
    }

    const overBy = income - limit;
    const overPct = limit > 0 ? (overBy / limit) : 0;

    if (income <= limit) {
      return { pass: true, reason: `Income $${income.toLocaleString()} is within limit of ${limitLabel}.` };
    } else if (overPct <= 0.05) {
      return {
        pass: 'conditional',
        reason: `Income $${income.toLocaleString()} is ${(overPct * 100).toFixed(1)}% over limit of ${limitLabel}. Verify with program administrator — may qualify with deductions.`,
      };
    } else {
      return { pass: false, reason: `Income $${income.toLocaleString()} exceeds limit of ${limitLabel} by ${(overPct * 100).toFixed(1)}%.` };
    }
  })();

  steps.push({ step: 3, name: 'Income Eligibility', ...incomeResult });
  if (incomeResult.pass === false) return buildResult('FAIL', steps, warnings, program, scenario);
  if (incomeResult.pass === 'conditional') finalStatus = 'CONDITIONAL';

  // ── STEP 4: First-Time Buyer ──────────────────────────────────────────────
  const fthbResult = (() => {
    if (!rules.fthb_required) return { pass: true, reason: 'First-time buyer status not required.' };
    if (firstTimeBuyer) return { pass: true, reason: 'Borrower confirmed as first-time buyer.' };
    return { pass: false, reason: 'Program requires first-time buyer status. Borrower has owned property previously.' };
  })();

  steps.push({ step: 4, name: 'First-Time Buyer Requirement', ...fthbResult });
  if (!fthbResult.pass) return buildResult('FAIL', steps, warnings, program, scenario);

  // ── STEP 5: Credit + DTI ──────────────────────────────────────────────────
  const creditResult = (() => {
    const fico = creditScore || 0;
    const dti = backendDTI || 0;
    const minFico = rules.min_fico || 0;
    const maxDti = rules.max_dti || 1;

    if (fico < minFico) {
      return { pass: false, reason: `FICO ${fico} is below program minimum of ${minFico}.` };
    }
    if (dti > maxDti) {
      return { pass: false, reason: `DTI ${(dti * 100).toFixed(1)}% exceeds program maximum of ${(maxDti * 100).toFixed(0)}%.` };
    }
    return { pass: true, reason: `FICO ${fico} ≥ ${minFico} ✓  DTI ${(dti * 100).toFixed(1)}% ≤ ${(maxDti * 100).toFixed(0)}% ✓` };
  })();

  steps.push({ step: 5, name: 'Credit & DTI Check', ...creditResult });
  if (!creditResult.pass) return buildResult('FAIL', steps, warnings, program, scenario);

  // ── STEP 6: CLTV Calculation ──────────────────────────────────────────────
  const cltvResult = (() => {
    const price = purchasePrice || 1;
    const loan = loanAmount || (price * 0.965);

    const dpaAmt = assistance_amount
      ? assistance_amount
      : assistance_pct
        ? Math.round(price * assistance_pct)
        : 0;

    const cltvWithDpa = (loan + dpaAmt) / price;
    const programMax = stacking_rules?.max_combined_cltv || rules.max_cltv || 1.05;
    const agencyMax = AGENCY_CLTV[loanType] || 1.00;
    const effectiveMax = Math.min(programMax, agencyMax + 0.05); // allow subordinate room

    const atCeiling = Math.abs(cltvWithDpa - effectiveMax) < 0.002;

    if (cltvWithDpa > effectiveMax) {
      return {
        pass: false,
        reason: `CLTV ${(cltvWithDpa * 100).toFixed(1)}% exceeds effective ceiling of ${(effectiveMax * 100).toFixed(1)}% (program max ${(programMax * 100).toFixed(1)}% / agency max ${(agencyMax * 100).toFixed(1)}%).`,
        details: { base_ltv: (loan / price), cltv_with_dpa: cltvWithDpa, program_max: programMax, agency_max: agencyMax, dpa_amount: dpaAmt },
      };
    }

    if (atCeiling) {
      warnings.push('CLTV is at the program ceiling — no tolerance for seller concessions or closing cost credits.');
    }

    return {
      pass: true,
      reason: `CLTV ${(cltvWithDpa * 100).toFixed(1)}% is within ${(effectiveMax * 100).toFixed(1)}% ceiling. DPA amount: $${dpaAmt.toLocaleString()}.`,
      details: { base_ltv: (loan / price), cltv_with_dpa: cltvWithDpa, program_max: programMax, agency_max: agencyMax, dpa_amount: dpaAmt },
    };
  })();

  steps.push({ step: 6, name: 'CLTV Calculation', ...cltvResult });
  if (!cltvResult.pass) return buildResult('FAIL', steps, warnings, program, scenario);

  // ── STEP 7: Layering Rules ────────────────────────────────────────────────
  const layeringResult = (() => {
    const notes = stacking_rules?.subordinate_financing_rules;
    const miNotes = stacking_rules?.mi_impact_rules;
    if (miNotes) warnings.push(`MI note: ${miNotes}`);
    return {
      pass: true,
      reason: notes || 'No subordinate financing conflicts identified.',
    };
  })();

  steps.push({ step: 7, name: 'Layering Rules', ...layeringResult });

  // ── STEP 8: Funding Availability ─────────────────────────────────────────
  const fundingResult = (() => {
    if (!is_active) {
      warnings.push('Program is currently flagged as paused or inactive. Confirm availability before presenting to borrower.');
      return { pass: 'conditional', reason: 'Program funding status is inactive — verify before use.' };
    }

    const lastVerified = new Date(program.last_verified_date);
    const daysSince = Math.floor((new Date() - lastVerified) / (1000 * 60 * 60 * 24));

    if (daysSince > 180) {
      warnings.push(`Program data is ${daysSince} days old — verify program is still active before proceeding.`);
      return { pass: 'conditional', reason: `Data last verified ${daysSince} days ago. Confirm program funding availability.` };
    }
    if (daysSince > 90) {
      warnings.push(`Program data is ${daysSince} days old — confirm availability.`);
    }

    return { pass: true, reason: `Program is active. Data verified ${daysSince} days ago (${program.last_verified_date}).` };
  })();

  steps.push({ step: 8, name: 'Funding Availability', ...fundingResult });
  if (fundingResult.pass === 'conditional') finalStatus = 'CONDITIONAL';

  return buildResult(finalStatus, steps, warnings, program, scenario);
};

// ── RESULT BUILDER ───────────────────────────────────────────────────────────
const buildResult = (status, steps, warnings, program, scenario) => {
  const passSteps = steps.filter(s => s.pass === true).map(s => s.reason);
  const failSteps = steps.filter(s => s.pass === false).map(s => s.reason);
  const condSteps = steps.filter(s => s.pass === 'conditional').map(s => s.reason);
  const cltvStep  = steps.find(s => s.step === 6);

  const dpaAmt = program.assistance_amount
    ? program.assistance_amount
    : program.assistance_pct && scenario.purchasePrice
      ? Math.round(scenario.purchasePrice * program.assistance_pct)
      : null;

  return {
    program_id: program.id,
    status,                               // PASS | CONDITIONAL | FAIL
    reasons: passSteps,
    fail_reasons: failSteps,
    conditional_reasons: condSteps,
    warnings,
    cltv_details: cltvStep?.details || null,
    dpa_amount_calculated: dpaAmt,
    steps,                                // Full step trace for detail drawer
    evaluated_at: new Date().toISOString(),
  };
};

// ── BATCH EVALUATOR ──────────────────────────────────────────────────────────
export const evaluateAllPrograms = (programs, scenario) => {
  const results = programs.map(prog => ({
    program: prog,
    evaluation: evaluateProgram(prog, scenario),
  }));

  // Sort: PASS → CONDITIONAL → FAIL, then by confidence score
  return results.sort((a, b) => {
    const order = { PASS: 0, CONDITIONAL: 1, FAIL: 2 };
    const statusDiff = order[a.evaluation.status] - order[b.evaluation.status];
    if (statusDiff !== 0) return statusDiff;
    return (b.program.confidence_score || 0) - (a.program.confidence_score || 0);
  });
};

// ── CONFIDENCE DISPLAY HELPERS ────────────────────────────────────────────────
export const getFreshnessLabel = (lastVerifiedDate) => {
  const days = Math.floor((new Date() - new Date(lastVerifiedDate)) / (1000 * 60 * 60 * 24));
  if (days <= 30)  return { label: `Verified ${days}d ago`, color: 'green',  urgent: false };
  if (days <= 90)  return { label: `Verified ${days}d ago`, color: 'green',  urgent: false };
  if (days <= 180) return { label: `Verify before use — ${days}d old`, color: 'amber', urgent: true  };
  return               { label: `Stale data — ${days}d old`, color: 'red',   urgent: true  };
};

export const getConfidenceLabel = (score) => {
  if (score >= 0.90) return { label: 'High confidence', color: 'green' };
  if (score >= 0.75) return { label: 'Moderate confidence', color: 'amber' };
  return                    { label: 'Low confidence — verify', color: 'red' };
};
