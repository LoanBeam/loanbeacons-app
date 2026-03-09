/**
 * LoanBeacons LLC — AUS Rescue™ v2.0
 * Program Rule Engine — Phase 1
 *
 * File: src/utils/programRuleEngine.js
 *
 * PURPOSE:
 *   Deterministic, pre-AI eligibility check for all 11 seed programs.
 *   Sits between Haiku extraction and Sonnet reasoning.
 *   Returns eligible/ineligible lists + primary trigger + fix feasibility.
 *
 * USAGE:
 *   import { evaluatePrograms, computeFixFeasibility } from '../utils/programRuleEngine';
 *
 *   const { eligible, ineligible, primaryTrigger, fixFeasibility } =
 *     evaluatePrograms(extractedFields);
 *
 * EXTRACTED FIELDS SCHEMA (from Haiku extraction step):
 * {
 *   fico:              number,   // e.g. 739
 *   frontDti:          number,   // e.g. 32.5  (front-end DTI %)
 *   backDti:           number,   // e.g. 48.29 (back-end DTI %)
 *   ltv:               number,   // e.g. 76.0  (loan-to-value %)
 *   occupancy:         string,   // 'primary' | 'secondary' | 'investment'
 *   loanPurpose:       string,   // 'purchase' | 'refinance' | 'cash_out'
 *   propertyType:      string,   // 'sfr' | 'condo' | 'multi' | 'manufactured'
 *   isVeteran:         boolean,  // VA eligibility confirmed
 *   isRural:           boolean,  // USDA rural geographic eligibility
 *   isIncomeAMIEligible: boolean, // income ≤ 80% AMI (for HomeReady/Home Possible)
 *   isSelfEmployed:    boolean,  // 12/24 mo bank statement eligible
 *   isFirstTimeBuyer:  boolean,  // first-time homebuyer flag
 *   hasRenovation:     boolean,  // renovation loan detected
 *   renovationAmount:  number,   // renovation cost in dollars
 *   ausDecision:       string,   // 'approve_eligible' | 'approve_ineligible' | 'refer_eligible' | 'refer_ineligible'
 *   // Haiku-added fields (Phase 1 new):
 *   primary_trigger:         string,  // e.g. 'DTI' | 'FICO' | 'LTV'
 *   distance_from_threshold: number,  // e.g. 2.29 (DTI points above max)
 * }
 *
 * RETURNS:
 * {
 *   eligible:        ProgramResult[],
 *   ineligible:      ProgramResult[],
 *   primaryTrigger:  PrimaryTrigger,
 *   fixFeasibility:  'HIGH' | 'MEDIUM' | 'LOW',
 * }
 */

// ─────────────────────────────────────────────
// PROGRAM RULE MATRIX  (Section 4.2 of PRD)
// ─────────────────────────────────────────────

export const PROGRAM_RULES = [
  {
    id: 'fha',
    name: 'FHA',
    agency: 'FHA / HUD',
    minFico: 580,
    maxDti: 57,       // AUS-approved ceiling; most lenders overlay at 46-50
    maxLtv: 96.5,
    notes: 'Primary residence only. MI for life if < 10% down.',
    guidelineRef: 'HUD Handbook 4000.1',
    eligibilityChecks: [
      {
        id: 'fha_occupancy',
        label: 'Primary residence required',
        test: (f) => f.occupancy === 'primary',
        failReason: 'FHA requires primary residence occupancy.',
      },
      {
        id: 'fha_property',
        label: 'FHA-eligible property type',
        test: (f) => ['sfr', 'condo', 'multi'].includes(f.propertyType),
        failReason: 'Manufactured homes require special FHA approval.',
      },
    ],
  },

  {
    id: 'conventional',
    name: 'Conventional',
    agency: 'Fannie Mae / Freddie Mac',
    minFico: 620,
    maxDti: 50,       // Fannie Mae DU max; 45% for manual underwrite
    maxLtv: 97,
    notes: 'No MI above 80% LTV. Cancellable MI. Broad property eligibility.',
    guidelineRef: 'Fannie Mae Selling Guide B3-6-02 / Freddie Mac 5306.1',
    eligibilityChecks: [],
  },

  {
    id: 'homeready',
    name: 'HomeReady',
    agency: 'Fannie Mae',
    minFico: 620,
    maxDti: 50,
    maxLtv: 97,
    notes: 'Income ≤ 80% AMI. First-time buyer benefits. Reduced MI rates.',
    guidelineRef: 'Fannie Mae Selling Guide B5-6-02',
    eligibilityChecks: [
      {
        id: 'homeready_ami',
        label: 'Income ≤ 80% AMI',
        test: (f) => f.isIncomeAMIEligible === true,
        failReason: 'HomeReady requires borrower income ≤ 80% of Area Median Income.',
      },
      {
        id: 'homeready_occupancy',
        label: 'Primary residence',
        test: (f) => f.occupancy === 'primary',
        failReason: 'HomeReady is for primary residence only.',
      },
    ],
  },

  {
    id: 'home_possible',
    name: 'Home Possible',
    agency: 'Freddie Mac',
    minFico: 660,
    maxDti: 45,
    maxLtv: 97,
    notes: 'Income ≤ 80% AMI. Comparable to HomeReady with Freddie Mac guidelines.',
    guidelineRef: 'Freddie Mac Selling Guide 4501.10',
    eligibilityChecks: [
      {
        id: 'hp_ami',
        label: 'Income ≤ 80% AMI',
        test: (f) => f.isIncomeAMIEligible === true,
        failReason: 'Home Possible requires borrower income ≤ 80% of Area Median Income.',
      },
      {
        id: 'hp_occupancy',
        label: 'Primary residence',
        test: (f) => f.occupancy === 'primary',
        failReason: 'Home Possible is for primary residence only.',
      },
    ],
  },

  {
    id: 'va',
    name: 'VA',
    agency: 'VA / Dept. of Veterans Affairs',
    minFico: null,    // No agency minimum; lender overlays typically 580-620
    maxDti: 41,       // Residual income standard; AUS may approve higher
    maxLtv: 100,
    notes: 'Veteran or active-duty only. No MI. Funding fee applies.',
    guidelineRef: 'VA Lenders Handbook Chapter 4',
    eligibilityChecks: [
      {
        id: 'va_veteran',
        label: 'VA eligibility (veteran/active duty)',
        test: (f) => f.isVeteran === true,
        failReason: 'VA loans require verified veteran or active-duty eligibility.',
      },
      {
        id: 'va_occupancy',
        label: 'Primary residence',
        test: (f) => f.occupancy === 'primary',
        failReason: 'VA loans require primary residence occupancy.',
      },
    ],
  },

  {
    id: 'usda',
    name: 'USDA',
    agency: 'USDA Rural Development',
    minFico: 640,
    maxDti: 44,       // GUS typically 41% housing / 44% total; AUS may flex
    maxLtv: 100,
    notes: 'Rural geographic + income eligibility required. No down payment.',
    guidelineRef: 'USDA HB-1-3555 Chapter 11',
    eligibilityChecks: [
      {
        id: 'usda_rural',
        label: 'Rural geographic eligibility',
        test: (f) => f.isRural === true,
        failReason: 'USDA requires the property to be in a USDA-eligible rural area.',
      },
      {
        id: 'usda_ami',
        label: 'Income within USDA limits',
        test: (f) => f.isIncomeAMIEligible !== false, // allow null/unknown = pass pending verification
        failReason: 'USDA requires income within area-specific USDA income limits.',
      },
      {
        id: 'usda_occupancy',
        label: 'Primary residence',
        test: (f) => f.occupancy === 'primary',
        failReason: 'USDA loans require primary residence occupancy.',
      },
      {
        id: 'usda_purchase',
        label: 'Purchase or refinance (no cash-out)',
        test: (f) => f.loanPurpose !== 'cash_out',
        failReason: 'USDA does not allow cash-out refinances.',
      },
    ],
  },

  {
    id: 'fha_203k_limited',
    name: 'FHA 203k Limited',
    agency: 'FHA / HUD',
    minFico: 580,
    maxDti: 57,
    maxLtv: 96.5,
    notes: 'Renovation ≤ $35,000. SFR or FHA-eligible condo. Structural repairs excluded.',
    guidelineRef: 'HUD Handbook 4000.1 Section II.A.8',
    eligibilityChecks: [
      {
        id: 'fha203k_reno',
        label: 'Renovation loan detected',
        test: (f) => f.hasRenovation === true,
        failReason: 'FHA 203k Limited requires a renovation/rehab component.',
      },
      {
        id: 'fha203k_reno_cap',
        label: 'Renovation amount ≤ $35,000',
        test: (f) => !f.renovationAmount || f.renovationAmount <= 35000,
        failReason: 'FHA 203k Limited caps renovation costs at $35,000. Use Standard 203k for larger amounts.',
      },
      {
        id: 'fha203k_occupancy',
        label: 'Primary residence',
        test: (f) => f.occupancy === 'primary',
        failReason: 'FHA 203k requires primary residence occupancy.',
      },
      {
        id: 'fha203k_property',
        label: 'SFR or FHA-eligible condo',
        test: (f) => ['sfr', 'condo'].includes(f.propertyType),
        failReason: 'FHA 203k Limited is limited to SFR or FHA-approved condominiums.',
      },
    ],
  },

  {
    id: 'homestyle_reno',
    name: 'HomeStyle Renovation',
    agency: 'Fannie Mae',
    minFico: 620,
    maxDti: 50,
    maxLtv: 97,
    notes: 'No renovation cost cap. Broader property types than 203k.',
    guidelineRef: 'Fannie Mae Selling Guide B5-3.2-02',
    eligibilityChecks: [
      {
        id: 'homestyle_reno',
        label: 'Renovation loan detected',
        test: (f) => f.hasRenovation === true,
        failReason: 'HomeStyle Renovation requires a renovation/rehab component.',
      },
    ],
  },

  {
    id: 'bank_statement_nonqm',
    name: 'Bank Statement (Non-QM)',
    agency: 'Non-QM / Private',
    minFico: 600,
    maxDti: 50,       // Flexible; varies by lender
    maxLtv: 90,
    notes: 'Self-employed. 12/24 months deposits as qualifying income. No tax return required.',
    guidelineRef: 'Lender-specific Non-QM guidelines',
    eligibilityChecks: [
      {
        id: 'bs_selfemployed',
        label: 'Self-employed borrower',
        test: (f) => f.isSelfEmployed === true,
        failReason: 'Bank Statement Non-QM is for self-employed borrowers using deposit income.',
      },
      {
        id: 'bs_occupancy',
        label: 'Primary or secondary residence',
        test: (f) => ['primary', 'secondary'].includes(f.occupancy),
        failReason: 'Bank Statement Non-QM is not available for investment properties.',
      },
    ],
  },

  {
    id: 'dscr_nonqm',
    name: 'DSCR (Non-QM)',
    agency: 'Non-QM / Private',
    minFico: 620,
    maxDti: null,     // No DTI — DSCR ratio replaces DTI
    maxLtv: 80,
    notes: 'Investment only. Rent ≥ PITIA (DSCR ≥ 1.0). No personal income docs required.',
    guidelineRef: 'Lender-specific Non-QM guidelines',
    eligibilityChecks: [
      {
        id: 'dscr_investment',
        label: 'Investment property',
        test: (f) => f.occupancy === 'investment',
        failReason: 'DSCR Non-QM is for investment properties only.',
      },
    ],
  },

  {
    id: 'asset_depletion_nonqm',
    name: 'Asset Depletion (Non-QM)',
    agency: 'Non-QM / Private',
    minFico: 620,
    maxDti: 50,
    maxLtv: 80,
    notes: 'Liquid assets ÷ 360 months = qualifying income. High-asset borrowers.',
    guidelineRef: 'Lender-specific Non-QM guidelines / Fannie Mae B3-4.3-09 (QM version)',
    eligibilityChecks: [
      {
        id: 'asset_dep_occupancy',
        label: 'Primary or secondary residence',
        test: (f) => ['primary', 'secondary'].includes(f.occupancy),
        failReason: 'Asset Depletion Non-QM is typically for primary or secondary residences.',
      },
    ],
  },
];


// ─────────────────────────────────────────────
// PRIMARY TRIGGER DETECTION
// ─────────────────────────────────────────────

/**
 * Identifies the single biggest blocker across all programs.
 * Returns structured trigger object for use in UI + Sonnet prompt.
 *
 * @param {object} f - extractedFields
 * @returns {PrimaryTrigger}
 */
export function detectPrimaryTrigger(f) {
  const triggers = [];

  // DTI trigger — how many programs does DTI block?
  const dtiBlockedPrograms = PROGRAM_RULES.filter(
    (p) => p.maxDti !== null && f.backDti > p.maxDti
  );
  if (dtiBlockedPrograms.length > 0) {
    const closestProgram = dtiBlockedPrograms.reduce((prev, curr) =>
      f.backDti - curr.maxDti < f.backDti - prev.maxDti ? curr : prev
    );
    triggers.push({
      type: 'DTI',
      label: 'Debt-to-Income Ratio',
      borrowerValue: f.backDti,
      threshold: closestProgram.maxDti,
      distance: parseFloat((f.backDti - closestProgram.maxDti).toFixed(2)),
      programsBlocked: dtiBlockedPrograms.length,
      severity: f.backDti - closestProgram.maxDti,
    });
  }

  // FICO trigger
  const ficoBlockedPrograms = PROGRAM_RULES.filter(
    (p) => p.minFico !== null && f.fico < p.minFico
  );
  if (ficoBlockedPrograms.length > 0) {
    const hardestRequirement = ficoBlockedPrograms.reduce((prev, curr) =>
      curr.minFico > prev.minFico ? curr : prev
    );
    triggers.push({
      type: 'FICO',
      label: 'Credit Score',
      borrowerValue: f.fico,
      threshold: hardestRequirement.minFico,
      distance: parseFloat((hardestRequirement.minFico - f.fico).toFixed(0)),
      programsBlocked: ficoBlockedPrograms.length,
      severity: hardestRequirement.minFico - f.fico,
    });
  }

  // LTV trigger
  const ltvBlockedPrograms = PROGRAM_RULES.filter(
    (p) => p.maxLtv !== null && f.ltv > p.maxLtv
  );
  if (ltvBlockedPrograms.length > 0) {
    const closestProgram = ltvBlockedPrograms.reduce((prev, curr) =>
      f.ltv - curr.maxLtv < f.ltv - prev.maxLtv ? curr : prev
    );
    triggers.push({
      type: 'LTV',
      label: 'Loan-to-Value Ratio',
      borrowerValue: f.ltv,
      threshold: closestProgram.maxLtv,
      distance: parseFloat((f.ltv - closestProgram.maxLtv).toFixed(2)),
      programsBlocked: ltvBlockedPrograms.length,
      severity: f.ltv - closestProgram.maxLtv,
    });
  }

  if (triggers.length === 0) {
    return {
      type: 'NONE',
      label: 'No hard threshold blockers detected',
      borrowerValue: null,
      threshold: null,
      distance: 0,
      programsBlocked: 0,
      severity: 0,
    };
  }

  // Return the trigger that blocks the most programs, tie-break by severity
  triggers.sort((a, b) => {
    if (b.programsBlocked !== a.programsBlocked) return b.programsBlocked - a.programsBlocked;
    return b.severity - a.severity;
  });

  return triggers[0];
}


// ─────────────────────────────────────────────
// FIX FEASIBILITY SCORE
// ─────────────────────────────────────────────

/**
 * Computes Fix Feasibility Score for Layer 1 (Fix In Place).
 * Based on distance between borrower's primary trigger value and
 * the nearest program threshold.
 *
 * HIGH   → within 2 points/units of threshold (small adjustment needed)
 * MEDIUM → 2–5 points/units away (moderate effort)
 * LOW    → >5 points or structural ineligibility (migration recommended)
 *
 * @param {PrimaryTrigger} primaryTrigger
 * @param {object} extractedFields
 * @returns {'HIGH' | 'MEDIUM' | 'LOW'}
 */
export function computeFixFeasibility(primaryTrigger, extractedFields) {
  if (primaryTrigger.type === 'NONE') return 'HIGH';

  const { type, distance } = primaryTrigger;

  if (type === 'DTI') {
    // DTI: distance is % points above max
    if (distance <= 2) return 'HIGH';
    if (distance <= 5) return 'MEDIUM';
    return 'LOW';
  }

  if (type === 'FICO') {
    // FICO: distance is points below minimum
    if (distance <= 20) return 'HIGH';
    if (distance <= 40) return 'MEDIUM';
    return 'LOW';
  }

  if (type === 'LTV') {
    // LTV: distance is % points above max
    if (distance <= 2) return 'HIGH';
    if (distance <= 5) return 'MEDIUM';
    return 'LOW';
  }

  return 'MEDIUM';
}


// ─────────────────────────────────────────────
// CORE ENGINE: evaluatePrograms()
// ─────────────────────────────────────────────

/**
 * Main Rule Engine entry point.
 * Evaluates all 11 programs deterministically against extracted AUS fields.
 *
 * @param {object} extractedFields - Structured fields from Haiku extraction
 * @returns {EvaluationResult}
 */
export function evaluatePrograms(extractedFields) {
  const f = extractedFields;
  const eligible = [];
  const ineligible = [];

  for (const program of PROGRAM_RULES) {
    const failReasons = [];

    // ── 1. Numeric threshold checks ──────────────────────────────────────

    // FICO minimum
    if (program.minFico !== null && f.fico < program.minFico) {
      failReasons.push(
        `Credit score ${f.fico} is below the minimum ${program.minFico} required for ${program.name}.`
      );
    }

    // DTI maximum — skip if program has no DTI limit (DSCR)
    if (program.maxDti !== null && f.backDti > program.maxDti) {
      failReasons.push(
        `Back-end DTI ${f.backDti}% exceeds the ${program.maxDti}% maximum for ${program.name}.`
      );
    }

    // LTV maximum
    if (program.maxLtv !== null && f.ltv > program.maxLtv) {
      failReasons.push(
        `LTV ${f.ltv}% exceeds the ${program.maxLtv}% maximum for ${program.name}.`
      );
    }

    // ── 2. Eligibility condition checks ──────────────────────────────────

    for (const check of program.eligibilityChecks) {
      if (!check.test(f)) {
        failReasons.push(check.failReason);
      }
    }

    // ── 3. Classify ───────────────────────────────────────────────────────

    /** @type {ProgramResult} */
    const result = {
      id: program.id,
      name: program.name,
      agency: program.agency,
      guidelineRef: program.guidelineRef,
      notes: program.notes,
      // Threshold proximity (for Sonnet context and UI hints)
      thresholds: {
        fico:   { min: program.minFico,  borrower: f.fico },
        dti:    { max: program.maxDti,   borrower: f.backDti },
        ltv:    { max: program.maxLtv,   borrower: f.ltv },
      },
    };

    if (failReasons.length === 0) {
      eligible.push({ ...result, eligible: true, failReasons: [] });
    } else {
      ineligible.push({ ...result, eligible: false, failReasons });
    }
  }

  // ── 4. Primary trigger + feasibility ────────────────────────────────────

  const primaryTrigger = detectPrimaryTrigger(f);
  const fixFeasibility = computeFixFeasibility(primaryTrigger, f);

  // ── 5. Sort eligible list by "strength of fit" ──────────────────────────
  // Programs with most DTI headroom first (closest to Sonnet's approval signal)
  eligible.sort((a, b) => {
    const aDtiMargin = a.thresholds.dti.max !== null
      ? a.thresholds.dti.max - f.backDti
      : 100; // no DTI limit = max headroom
    const bDtiMargin = b.thresholds.dti.max !== null
      ? b.thresholds.dti.max - f.backDti
      : 100;
    return bDtiMargin - aDtiMargin;
  });

  return {
    eligible,
    ineligible,
    primaryTrigger,
    fixFeasibility,
    // Convenience summary for Sonnet prompt construction
    summary: {
      totalPrograms: PROGRAM_RULES.length,
      eligibleCount: eligible.length,
      ineligibleCount: ineligible.length,
      eligibleNames: eligible.map((p) => p.name),
      primaryBlocker: primaryTrigger.type,
      feasibility: fixFeasibility,
    },
  };
}


// ─────────────────────────────────────────────
// SONNET CONTEXT BUILDER
// ─────────────────────────────────────────────

/**
 * Builds the structured context string passed to Sonnet as part of the
 * program migration reasoning prompt.
 * Keeps Sonnet from hallucinating thresholds — it only reasons over
 * programs the Rule Engine already cleared.
 *
 * @param {EvaluationResult} engineResult
 * @param {object} extractedFields
 * @returns {string}
 */
export function buildSonnetContext(engineResult, extractedFields) {
  const f = extractedFields;
  const { eligible, ineligible, primaryTrigger, fixFeasibility } = engineResult;

  const eligibleSection = eligible.length > 0
    ? eligible.map((p) => {
        const dtiMargin = p.thresholds.dti.max !== null
          ? `DTI margin: ${(p.thresholds.dti.max - f.backDti).toFixed(1)}% headroom`
          : 'No DTI limit';
        const ficoMargin = p.thresholds.fico.min !== null
          ? `FICO margin: ${f.fico - p.thresholds.fico.min} pts above minimum`
          : 'No FICO minimum';
        return `  • ${p.name} (${p.agency}) — ${dtiMargin} | ${ficoMargin} | Guideline: ${p.guidelineRef}`;
      }).join('\n')
    : '  • No eligible programs found.';

  const ineligibleSection = ineligible
    .map((p) => `  • ${p.name}: ${p.failReasons[0]}`)
    .join('\n');

  return `
=== PROGRAM RULE ENGINE OUTPUT (DETERMINISTIC — DO NOT OVERRIDE) ===

BORROWER PROFILE:
  FICO: ${f.fico} | Back DTI: ${f.backDti}% | LTV: ${f.ltv}%
  Occupancy: ${f.occupancy} | Loan Purpose: ${f.loanPurpose || 'N/A'}
  Veteran: ${f.isVeteran ? 'Yes' : 'No'} | AMI Eligible: ${f.isIncomeAMIEligible ? 'Yes' : 'No/Unknown'}
  Self-Employed: ${f.isSelfEmployed ? 'Yes' : 'No'} | Rural: ${f.isRural ? 'Yes' : 'No'}

PRIMARY BLOCKER: ${primaryTrigger.label} (${primaryTrigger.type})
  Borrower value: ${primaryTrigger.borrowerValue}${primaryTrigger.type === 'DTI' ? '%' : primaryTrigger.type === 'LTV' ? '%' : ''}
  Nearest threshold: ${primaryTrigger.threshold}${primaryTrigger.type === 'DTI' ? '%' : primaryTrigger.type === 'LTV' ? '%' : ''}
  Distance from threshold: ${primaryTrigger.distance} ${primaryTrigger.type === 'FICO' ? 'points below minimum' : '% points above maximum'}
  Programs blocked by this trigger: ${primaryTrigger.programsBlocked} of ${PROGRAM_RULES.length}

FIX FEASIBILITY: ${fixFeasibility}

ELIGIBLE PROGRAMS (${eligible.length}) — Sonnet may only recommend these:
${eligibleSection}

INELIGIBLE PROGRAMS (${ineligible.length}) — Sonnet must NOT recommend these:
${ineligibleSection}

INSTRUCTION: Rank the eligible programs above by approval probability for this specific borrower. 
For each, explain in plain English why it works and what changes (rate impact, MI structure, 
down payment, documentation). Include the guideline citation. When Fix Feasibility is LOW, 
lead with the Program Migration recommendation.
`.trim();
}


// ─────────────────────────────────────────────
// SHANNON SCENARIO TEST FIXTURE
// ─────────────────────────────────────────────

/**
 * Acceptance test: Shanna Arscott scenario from PRD Appendix A.
 * Run in dev console: testShannonScenario()
 * Expected: eligible = [HomeReady, Home Possible], fixFeasibility = 'LOW'
 */
export function testShannonScenario() {
  const shannonFields = {
    fico: 739,
    frontDti: 32.0,         // estimated front-end
    backDti: 48.29,         // HomeReady AUS finding
    ltv: 76.0,
    occupancy: 'primary',
    loanPurpose: 'purchase',
    propertyType: 'sfr',
    isVeteran: false,
    isRural: false,
    isIncomeAMIEligible: true,
    isSelfEmployed: false,
    isFirstTimeBuyer: true,
    hasRenovation: false,
    renovationAmount: 0,
    ausDecision: 'approve_eligible',  // HomeReady run
    primary_trigger: 'DTI',
    distance_from_threshold: 2.29,    // from Haiku extraction
  };

  const result = evaluatePrograms(shannonFields);

  console.group('🏦 Shannon Scenario — AUS Rescue v2 Rule Engine Test');
  console.log('Primary Trigger:', result.primaryTrigger);
  console.log('Fix Feasibility:', result.fixFeasibility);
  console.log('Eligible Programs:', result.eligible.map((p) => p.name));
  console.log('Ineligible Programs:', result.ineligible.map((p) => `${p.name}: ${p.failReasons[0]}`));
  console.log('\nSonnet Context:\n', buildSonnetContext(result, shannonFields));
  console.groupEnd();

  // Assertions
  const eligibleNames = result.eligible.map((p) => p.id);
  console.assert(eligibleNames.includes('homeready'),     '✅ HomeReady should be eligible');
  console.assert(eligibleNames.includes('home_possible'), '✅ Home Possible should be eligible');
  console.assert(!eligibleNames.includes('va'),           '✅ VA should be ineligible (non-veteran)');
  console.assert(!eligibleNames.includes('usda'),         '✅ USDA should be ineligible (non-rural)');
  console.assert(!eligibleNames.includes('dscr_nonqm'),   '✅ DSCR should be ineligible (primary residence)');
  console.assert(result.fixFeasibility === 'LOW',         '✅ Fix Feasibility should be LOW (DTI 48.29, distance ~2.29 from FHA ~46%)');
  console.assert(result.primaryTrigger.type === 'DTI',    '✅ Primary trigger should be DTI');

  return result;
}
