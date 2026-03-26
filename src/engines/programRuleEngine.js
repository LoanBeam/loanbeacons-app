/**
 * LoanBeacons™ — Program Rule Engine
 * AUS Rescue v2.0 — Deterministic Foundation Layer
 *
 * Evaluates a borrower profile against the 11-program seed matrix.
 * Produces structured rule results, blocker analysis, and base approval
 * probability estimates for downstream Sonnet reasoning.
 *
 * ⚠️  NO AI CALLS — Fully deterministic. Compliance-safe.
 *
 * Usage:
 *   import { rankPrograms, identifyPrimaryBlocker, assessFeasibility } from '../engines/programRuleEngine';
 *   const results = rankPrograms(profile);
 *   const primaryBlocker = identifyPrimaryBlocker(results);
 *   const feasibility = assessFeasibility(results);
 *
 * Profile shape: see BORROWER_PROFILE_DEFAULTS below.
 */

// ─── Loan Limits (2026) ───────────────────────────────────────────────────────

export const CONFORMING_LIMIT_2026 = 806_500;
export const HIGH_BALANCE_LIMIT_2026 = 1_209_750; // ~150% conforming

// ─── Program IDs ─────────────────────────────────────────────────────────────

export const PROGRAM_ID = {
  FHA:              'FHA',
  CONVENTIONAL:     'CONVENTIONAL',
  HOMEREADY:        'HOMEREADY',
  HOME_POSSIBLE:    'HOME_POSSIBLE',
  VA:               'VA',
  USDA:             'USDA',
  FHA_203K:         'FHA_203K',
  JUMBO:            'JUMBO',
  NON_QM_BANK_STMT: 'NON_QM_BANK_STMT',
  DSCR:             'DSCR',
  HARD_MONEY:       'HARD_MONEY',
};

// ─── 11-Program Seed Matrix ───────────────────────────────────────────────────

export const PROGRAM_MATRIX = [

  // ── 1. FHA ────────────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.FHA,
    name: 'FHA',
    fullName: 'FHA (Federal Housing Administration)',
    category: 'government',
    path: 'agency',
    icon: '🏛️',
    description: 'Government-backed loan — flexible credit, 3.5% down, high DTI ceiling.',
    rules: {
      minFICO:                    580,   // 500–579 → 10% down required
      reducedLTVFICOThreshold:    580,   // FICO < 580 triggers 90% LTV cap
      maxDTI:                     57,    // with compensating factors
      standardMaxDTI:             50,    // AUS standard gate
      maxLTV:                     96.5,  // 3.5% down (FICO 580+)
      maxLTVLowFICO:              90,    // 10% down (FICO 500–579)
      maxLoanAmount:              CONFORMING_LIMIT_2026,
      requiresPrimaryResidence:   true,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     2,
      foreclosureSeasoningYrs:    3,
    },
    strengths: [
      'Lowest FICO floor (580 standard)',
      'Highest DTI ceiling of agency programs (57% w/ comp factors)',
      'Only 3.5% down payment',
      'Gift funds allowed for entire down payment',
      'Streamlined refinance path (FHA Streamline)',
    ],
    limitations: [
      'MIP required for life of loan (< 10% down)',
      'Condos must be FHA-approved',
      'Property condition standards (habitability)',
      'Cannot own other FHA loans simultaneously',
    ],
    compensatingFactors: [
      { id: 'reserves',               label: '3+ months PITI reserves',          dtiBoost: 5 },
      { id: 'residual_income',        label: 'Residual income > $1,000/mo',       dtiBoost: 3 },
      { id: 'minimal_pmt_increase',   label: 'Payment increase < 5%',             dtiBoost: 2 },
      { id: 'verified_rent',          label: '12 months verified rent (no late)',  dtiBoost: 2 },
    ],
    sortPriority: 70,
  },

  // ── 2. Conventional ───────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.CONVENTIONAL,
    name: 'Conventional',
    fullName: 'Conventional (Fannie Mae / Freddie Mac Standard)',
    category: 'agency',
    path: 'agency',
    icon: '🏦',
    description: 'Standard conforming loan — best rates at high FICO, PMI cancellable.',
    rules: {
      minFICO:                    620,
      maxDTI:                     50,    // DU/LP can approve to 50% with strong profile
      standardMaxDTI:             45,
      maxLTV:                     97,    // 3% down with PMI
      maxLoanAmount:              CONFORMING_LIMIT_2026,
      requiresPrimaryResidence:   false,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     4,
      foreclosureSeasoningYrs:    7,
    },
    strengths: [
      'No MIP — PMI cancellable at 80% LTV',
      'Investment properties eligible',
      'Multiple unit types (1–4)',
      'Best pricing at 740+ FICO',
      'High-balance available in eligible counties',
    ],
    limitations: [
      '620 FICO minimum (lender overlays may require 640)',
      'Stricter DTI than FHA/HomeReady with compensating factors',
      'PMI required below 80% LTV',
      '7-year foreclosure seasoning',
    ],
    compensatingFactors: [
      { id: 'high_fico',   label: 'FICO 720+',             dtiBoost: 3 },
      { id: 'reserves',    label: '6+ months reserves',    dtiBoost: 3 },
      { id: 'low_ltv',     label: 'LTV ≤ 75%',             dtiBoost: 2 },
    ],
    sortPriority: 80,
  },

  // ── 3. HomeReady ──────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.HOMEREADY,
    name: 'HomeReady',
    fullName: 'HomeReady™ (Fannie Mae)',
    category: 'agency',
    path: 'agency',
    icon: '🏡',
    description: 'Fannie Mae affordable program — 80% AMI limit, reduced MI, 50% DTI.',
    rules: {
      minFICO:                    620,
      maxDTI:                     50,    // Hard cap — DU will not approve above 50%
      standardMaxDTI:             50,
      maxLTV:                     97,
      maxLoanAmount:              CONFORMING_LIMIT_2026,
      maxIncomeAMIPct:            80,    // 80% of Area Median Income
      requiresPrimaryResidence:   true,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      counselingRequired:         true,  // if LTV > 95% and first-time buyer
      bankruptcySeasoningYrs:     4,
      foreclosureSeasoningYrs:    7,
    },
    strengths: [
      'Reduced MI vs standard conventional',
      'Boarder income allowed (30% of qualifying income)',
      'Non-occupant co-borrower allowed',
      'Gifts, grants, Community Seconds accepted',
      '50% DTI hard cap — most flexible agency program',
    ],
    limitations: [
      '80% AMI income limit (varies by county)',
      'Primary residence only',
      'Homeownership counseling required (LTV > 95%)',
      'No investment properties',
    ],
    compensatingFactors: [
      { id: 'reserves',             label: '2+ months reserves',             dtiBoost: 3 },
      { id: 'boarder_income',       label: 'Boarder income documented',      dtiBoost: 2 },
      { id: 'non_occ_coborrower',   label: 'Non-occupant co-borrower',       dtiBoost: 5 },
    ],
    sortPriority: 90,
  },

  // ── 4. Home Possible ──────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.HOME_POSSIBLE,
    name: 'Home Possible',
    fullName: 'Home Possible® (Freddie Mac)',
    category: 'agency',
    path: 'agency',
    icon: '🏘️',
    description: 'Freddie Mac affordable program — 80% AMI limit, 3% down, sweat equity.',
    rules: {
      minFICO:                    660,   // LP typically requires 660 for max LTV approval
      maxDTI:                     45,    // LP is more conservative than DU
      standardMaxDTI:             43,
      maxLTV:                     97,
      maxLoanAmount:              CONFORMING_LIMIT_2026,
      maxIncomeAMIPct:            80,
      requiresPrimaryResidence:   true,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     4,
      foreclosureSeasoningYrs:    7,
    },
    strengths: [
      'No income limit in low-income census tracts',
      'Sweat equity allowed for down payment',
      'Non-occupant co-borrower (1-unit)',
      'Reduced MI vs standard conventional',
      '2–4 unit properties allowed',
    ],
    limitations: [
      'Higher FICO floor (660) vs HomeReady (620)',
      'Stricter DTI ceiling (45%) vs HomeReady (50%)',
      '80% AMI income limit applies in most areas',
      'LP system less flexible than DU for edge cases',
    ],
    compensatingFactors: [
      { id: 'reserves',         label: '2+ months reserves',              dtiBoost: 2 },
      { id: 'low_income_tract', label: 'Low-income census tract (no AMI limit)', dtiBoost: 0 },
    ],
    sortPriority: 85,
  },

  // ── 5. VA ─────────────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.VA,
    name: 'VA',
    fullName: 'VA Loan (Department of Veterans Affairs)',
    category: 'government',
    path: 'agency',
    icon: '🎖️',
    description: 'No down payment, no PMI — veterans, active duty, surviving spouses.',
    rules: {
      minFICO:                    580,   // VA has no statutory floor; lender overlay typically 580–620
      lenderOverlayFICO:          620,
      maxDTI:                     60,    // with sufficient residual income; guideline is 41%
      guidelineDTI:               41,
      maxLTV:                     100,   // 0% down with full entitlement
      maxLoanAmount:              null,  // No loan limit with full entitlement
      requiresPrimaryResidence:   true,
      requiresVAEligibility:      true,  // HARD GATE — disqualifying if false
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     2,
      foreclosureSeasoningYrs:    2,
    },
    strengths: [
      'Zero down payment required',
      'No PMI or MIP ever',
      'Competitive interest rates',
      'IRRRL streamline refinance available',
      'Funding fee waived for service-connected disabled vets',
    ],
    limitations: [
      'VA eligibility required (veteran / active duty / surviving spouse)',
      'Funding fee required (unless disabled)',
      'Condos must be VA-approved',
      'Primary residence only',
    ],
    compensatingFactors: [
      { id: 'residual_income',    label: 'Residual income exceeds VA guideline', dtiBoost: 10 },
      { id: 'disability_waiver',  label: 'Service-connected disability',          dtiBoost:  2 },
    ],
    sortPriority: 95,
  },

  // ── 6. USDA ───────────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.USDA,
    name: 'USDA',
    fullName: 'USDA Rural Development (Section 502 Guaranteed)',
    category: 'government',
    path: 'agency',
    icon: '🌾',
    description: 'No down payment in rural/suburban eligible areas — 115% AMI income limit.',
    rules: {
      minFICO:                    640,   // GUS auto-approve; manual UW 580+
      maxDTI:                     41,    // total; separate 34% housing ratio
      maxHousingDTI:              34,
      standardMaxDTI:             41,
      maxLTV:                     102,   // 100% + guarantee fee financed
      maxLoanAmount:              null,  // county-specific
      maxIncomeAMIPct:            115,
      requiresPrimaryResidence:   true,
      requiresVAEligibility:      false,
      requiresRuralArea:          true,  // HARD GATE — disqualifying if false
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     3,
      foreclosureSeasoningYrs:    3,
    },
    strengths: [
      'Zero down payment',
      'Below-market interest rates',
      'Low annual guarantee fee vs FHA MIP',
      'Seller concessions up to 6%',
      '115% AMI — broader income eligibility than HomeReady/HP',
    ],
    limitations: [
      'Property must be in USDA-eligible rural/suburban area',
      'Strictest DTI ceiling (41% total / 34% housing)',
      'SFR and PUD only (no condos)',
      '640 FICO for GUS auto-approval',
    ],
    compensatingFactors: [
      { id: 'stable_employment', label: '2+ years same employer',   dtiBoost: 2 },
      { id: 'reserves',          label: '1+ month reserves',        dtiBoost: 1 },
    ],
    sortPriority: 75,
  },

  // ── 7. FHA 203k ───────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.FHA_203K,
    name: 'FHA 203k',
    fullName: 'FHA 203k Rehabilitation Loan',
    category: 'government',
    path: 'agency',
    icon: '🔨',
    description: 'FHA purchase + renovation in one loan — based on After-Improved Value.',
    rules: {
      minFICO:                    580,
      reducedLTVFICOThreshold:    580,
      maxDTI:                     57,
      standardMaxDTI:             50,
      maxLTV:                     96.5,  // based on AIV (after-improved value)
      maxLTVLowFICO:              90,
      maxLoanAmount:              CONFORMING_LIMIT_2026,
      requiresPrimaryResidence:   true,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      requiresRehab:              true,  // property must need renovation
      minRehabAmount:             5_000, // Streamlined 203k minimum
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     2,
      foreclosureSeasoningYrs:    3,
    },
    strengths: [
      'Finance purchase + renovation in one loan',
      'LTV based on After-Improved Value (AIV)',
      'Only 3.5% down of AIV',
      'Gift funds allowed',
      'Can fix livability issues blocking standard FHA',
    ],
    limitations: [
      'MIP for life of loan (< 10% down)',
      'Standard 203k requires HUD-approved consultant',
      'Longer close timeline (45–60+ days)',
      'Primary residence only',
      'Contractor must be approved / licensed',
    ],
    compensatingFactors: [
      { id: 'reserves',  label: '3+ months PITI reserves',  dtiBoost: 5 },
    ],
    sortPriority: 45,
  },

  // ── 8. Jumbo ──────────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.JUMBO,
    name: 'Jumbo',
    fullName: 'Jumbo / Non-Conforming',
    category: 'jumbo',
    path: 'agency',
    icon: '💎',
    description: 'Loan amounts above conforming limit — lender portfolio guidelines.',
    rules: {
      minFICO:                    700,
      maxDTI:                     43,
      standardMaxDTI:             40,
      maxLTV:                     85,    // varies by lender; 80% most common
      maxLoanAmount:              null,  // no ceiling — deal-by-deal
      minLoanAmount:              CONFORMING_LIMIT_2026 + 1,  // HARD GATE
      requiresPrimaryResidence:   false,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      reservesRequired:           12,    // months of PITIA
      bankruptcySeasoningYrs:     7,
      foreclosureSeasoningYrs:    7,
    },
    strengths: [
      'Loan amounts above conforming limit',
      'Investment properties allowed',
      'No MIP (some products have no PMI either)',
      'Interest-only options available with some lenders',
    ],
    limitations: [
      'Highest FICO floor (700+, often 720+)',
      '12+ months PITIA reserves required',
      'Full doc / thorough underwriting',
      'Fewer lender options',
      '7-year BK / foreclosure seasoning',
    ],
    compensatingFactors: [
      { id: 'large_reserves', label: '24+ months reserves',   dtiBoost: 3 },
      { id: 'high_fico',      label: 'FICO 760+',             dtiBoost: 2 },
    ],
    sortPriority: 30,
  },

  // ── 9. Non-QM Bank Statement ──────────────────────────────────────────────
  {
    id: PROGRAM_ID.NON_QM_BANK_STMT,
    name: 'Non-QM Bank Statement',
    fullName: 'Non-QM — Bank Statement Loan',
    category: 'non_qm',
    path: 'non_qm',
    icon: '📊',
    description: '12–24 month bank statements replace tax returns — self-employed friendly.',
    rules: {
      minFICO:                    580,
      maxDTI:                     55,    // based on bank-statement-derived income
      standardMaxDTI:             50,
      maxLTV:                     90,    // FICO 640+ standard; 85% if FICO < 640
      maxLTVLowFICO:              85,
      lowFICOThreshold:           640,
      maxLoanAmount:              3_000_000,
      requiresPrimaryResidence:   false,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     2,
      foreclosureSeasoningYrs:    2,
    },
    strengths: [
      'No tax return income required',
      'Self-employed / 1099 borrowers qualify more easily',
      'Higher DTI ceiling (55%) vs agency programs',
      'Higher loan amounts available',
      'Faster turnaround vs full-doc jumbo',
    ],
    limitations: [
      'Higher interest rate vs agency programs',
      'Lower LTV ceiling (85–90%)',
      'Larger down payment required',
      'Fewer lender options',
      'Income calculation varies by lender (expense ratio)',
    ],
    compensatingFactors: [
      { id: 'large_down',  label: '20%+ down payment',       dtiBoost: 5 },
      { id: 'reserves',    label: '12+ months reserves',     dtiBoost: 5 },
    ],
    sortPriority: 60,
  },

  // ── 10. DSCR ─────────────────────────────────────────────────────────────
  {
    id: PROGRAM_ID.DSCR,
    name: 'DSCR',
    fullName: 'DSCR — Debt Service Coverage Ratio',
    category: 'non_qm',
    path: 'non_qm',
    icon: '📈',
    description: 'Qualified by rental income, not borrower DTI — investment property only.',
    rules: {
      minFICO:                    620,
      maxDTI:                     null, // Not evaluated — DSCR replaces DTI
      minDSCR:                    1.00, // Rent ≥ PITIA; some lenders allow 0.75
      maxLTV:                     80,
      maxLoanAmount:              3_000_000,
      requiresPrimaryResidence:   false,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: true, // HARD GATE
      minLoanAmount:              null,
      bankruptcySeasoningYrs:     2,
      foreclosureSeasoningYrs:    2,
    },
    strengths: [
      'No personal income documentation required',
      'Unlimited properties / no seasoning on ownership',
      'LLC / entity vesting allowed',
      'Fast close possible',
      'Portfolio / short-term rental qualifies',
    ],
    limitations: [
      'Investment property only — no primary residence',
      '20–25% down payment required',
      'DSCR must meet 1.0x minimum',
      'Higher rates vs agency',
      'Appraisal must include rent schedule (1007)',
    ],
    compensatingFactors: [
      { id: 'high_dscr',   label: 'DSCR > 1.25x',           dtiBoost: 0 },
      { id: 'reserves',    label: '6+ months reserves',     dtiBoost: 0 },
    ],
    sortPriority: 50,
  },

  // ── 11. Hard Money / Bridge ───────────────────────────────────────────────
  {
    id: PROGRAM_ID.HARD_MONEY,
    name: 'Hard Money',
    fullName: 'Hard Money / Bridge Loan',
    category: 'hard_money',
    path: 'rescue',
    icon: '🔑',
    description: 'Asset-based last-resort path — bridge to permanent financing.',
    rules: {
      minFICO:                    500,   // Some lenders have no minimum
      maxDTI:                     null, // Asset-based; DTI not evaluated
      maxLTV:                     70,   // Conservative on purchase/ARV
      maxLTV_ARV:                 65,
      maxLoanAmount:              null,
      requiresPrimaryResidence:   false,
      requiresVAEligibility:      false,
      requiresRuralArea:          false,
      requiresInvestmentProperty: false,
      minLoanAmount:              null,
      shortTermOnly:              true, // 6–24 months
      bankruptcySeasoningYrs:     0,
      foreclosureSeasoningYrs:    0,
    },
    strengths: [
      'Virtually no credit floor',
      'Asset-based — property value matters most',
      'Fast funding (days, not weeks)',
      'Bridge to conventional/agency after stabilization',
      'Flexible deal structures',
    ],
    limitations: [
      'High interest rates (10–15%+)',
      'Short term only (6–24 months)',
      'Low LTV (65–70%)',
      'Requires clear exit strategy',
      'Points / fees significantly higher',
    ],
    compensatingFactors: [
      { id: 'strong_equity',  label: 'Large down / significant equity',  dtiBoost: 0 },
      { id: 'exit_strategy',  label: 'Clear documented exit strategy',   dtiBoost: 0 },
    ],
    sortPriority: 10,
  },

];

// ─── Borrower Profile Defaults ────────────────────────────────────────────────
// All keys that evaluateProgram() reads. Populate from scenario data.

export const BORROWER_PROFILE_DEFAULTS = {
  fico:               null,   // Credit score (number)
  dti:                null,   // Total DTI % (number, e.g. 52.4)
  ltv:                null,   // LTV % (number, e.g. 96.5)
  loanAmount:         null,   // Loan amount in dollars
  occupancy:          null,   // 'PRIMARY' | 'SECOND_HOME' | 'INVESTMENT'
  propertyType:       'SFR',  // 'SFR' | 'CONDO' | 'PUD' | '2UNIT' | '3UNIT' | '4UNIT'
  vaEligible:         false,  // Boolean
  ruralEligible:      false,  // Boolean (USDA area check)
  investmentProperty: false,  // Boolean
  dscrRatio:          null,   // DSCR ratio (number, e.g. 1.15)
  incomeAMIPct:       null,   // Borrower income as % of AMI (number)
  selfEmployed:       false,
  firstTimeBuyer:     false,
  reserves:           null,   // Months of PITI reserves (number)
  bankruptcyYearsAgo: null,   // Number of years since BK discharge (number)
  foreclosureYearsAgo:null,   // Number of years since foreclosure (number)
  propertyNeedsRehab: null,   // true = property needs renovation; false = move-in ready; null = unknown
};

// ─── Rule Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate a single program against the borrower profile.
 * Returns a full RuleResult object consumed by the PME and Sonnet.
 *
 * @param {Object} profile  - Borrower profile (see BORROWER_PROFILE_DEFAULTS)
 * @param {Object} program  - Program definition from PROGRAM_MATRIX
 * @returns {RuleResult}
 */
export function evaluateProgram(profile, program) {
  const { rules } = program;
  const blockers  = [];   // Hard fails — reduce approval probability significantly
  const warnings  = [];   // Near-miss — require compensating factors / AUS
  const passes    = [];   // Rules this borrower satisfies

  // ── Helper: record a blocker ────────────────────────────────────────────
  const addBlocker = (rule, label, borrowerValue, threshold, gap, remediation, severity = 'HIGH') => {
    blockers.push({ rule, label, borrowerValue, threshold, gap, remediation, severity });
  };

  // ── Helper: record a warning ────────────────────────────────────────────
  const addWarning = (rule, label, borrowerValue, threshold, note = '') => {
    warnings.push({ rule, label, borrowerValue, threshold, note });
  };

  // ── Helper: record a pass ───────────────────────────────────────────────
  const addPass = (rule, label, borrowerValue, threshold = null) => {
    passes.push({ rule, label, borrowerValue, threshold });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 1: FICO / Credit Score
  // ══════════════════════════════════════════════════════════════════════════
  if (profile.fico != null) {
    const minFICO = rules.minFICO ?? 0;
    if (profile.fico < minFICO) {
      const gap = minFICO - profile.fico;
      addBlocker(
        'FICO',
        'Credit Score Below Program Minimum',
        profile.fico,
        minFICO,
        gap,
        `FICO must increase by ${gap} points to meet ${program.name} minimum (${minFICO})`,
        gap >= 40 ? 'CRITICAL' : 'HIGH',
      );
    } else if (profile.fico < minFICO + 20) {
      // Within 20 points of minimum — lender overlays may apply
      addWarning(
        'FICO',
        'FICO Near Program Minimum — Lender Overlays May Apply',
        profile.fico,
        minFICO,
        `Score is ${profile.fico - minFICO} points above minimum; many lenders require 620–640 floor`,
      );
    } else {
      addPass('FICO', 'Credit Score', profile.fico, minFICO);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2: DTI — Debt-to-Income Ratio
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.maxDTI != null && profile.dti != null) {
    const maxDTI      = rules.maxDTI;
    const stdDTI      = rules.standardMaxDTI ?? rules.maxDTI;

    if (profile.dti > maxDTI) {
      const gap = +(profile.dti - maxDTI).toFixed(2);
      addBlocker(
        'DTI',
        'Debt-to-Income Ratio Exceeds Maximum',
        profile.dti,
        maxDTI,
        gap,
        `DTI must be reduced by ${gap.toFixed(1)}% — pay down ${_dtiToPayoffEstimate(gap, profile.loanAmount)}`,
        gap >= 8 ? 'CRITICAL' : gap >= 3 ? 'HIGH' : 'MEDIUM',
      );
    } else if (profile.dti > stdDTI) {
      // Between standard and max — needs AUS / compensating factors
      addWarning(
        'DTI',
        `DTI ${profile.dti}% Exceeds Standard ${stdDTI}% — AUS / Compensating Factors Required`,
        profile.dti,
        stdDTI,
        `Within ${program.name} maximum (${maxDTI}%) but above standard ceiling; AUS approval and compensating factors needed`,
      );
    } else {
      addPass('DTI', 'Debt-to-Income Ratio', `${profile.dti}%`, `${maxDTI}% max`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3: LTV — Loan-to-Value
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.maxLTV != null && profile.ltv != null) {
    // FHA / 203k: lower LTV cap if FICO < 580
    let effectiveMaxLTV = rules.maxLTV;
    if (rules.maxLTVLowFICO && rules.reducedLTVFICOThreshold && profile.fico < rules.reducedLTVFICOThreshold) {
      effectiveMaxLTV = rules.maxLTVLowFICO;
    }
    // Non-QM Bank Statement: lower LTV if FICO < 640
    if (program.id === PROGRAM_ID.NON_QM_BANK_STMT && rules.lowFICOThreshold && profile.fico < rules.lowFICOThreshold) {
      effectiveMaxLTV = rules.maxLTVLowFICO;
    }

    if (profile.ltv > effectiveMaxLTV) {
      const gap = +(profile.ltv - effectiveMaxLTV).toFixed(2);
      addBlocker(
        'LTV',
        'Loan-to-Value Exceeds Maximum',
        profile.ltv,
        effectiveMaxLTV,
        gap,
        `LTV must be reduced by ${gap.toFixed(1)}% — requires additional down payment or equity`,
        gap >= 10 ? 'HIGH' : 'MEDIUM',
      );
    } else if (profile.ltv > effectiveMaxLTV - 3) {
      addWarning(
        'LTV',
        'LTV Near Maximum',
        profile.ltv,
        effectiveMaxLTV,
        'Slight value changes could affect eligibility',
      );
    } else {
      addPass('LTV', 'Loan-to-Value', `${profile.ltv}%`, `${effectiveMaxLTV}% max`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 4: Loan Amount (Max)
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.maxLoanAmount && profile.loanAmount != null) {
    if (profile.loanAmount > rules.maxLoanAmount) {
      const gap = profile.loanAmount - rules.maxLoanAmount;
      addBlocker(
        'LOAN_AMOUNT_MAX',
        'Loan Amount Exceeds Program Limit',
        `$${profile.loanAmount.toLocaleString()}`,
        `$${rules.maxLoanAmount.toLocaleString()}`,
        gap,
        `Loan exceeds ${program.name} limit by $${gap.toLocaleString()} — consider Jumbo or Non-QM`,
        'CRITICAL',
      );
    } else {
      addPass('LOAN_AMOUNT_MAX', 'Loan Amount', `$${profile.loanAmount.toLocaleString()}`, `$${rules.maxLoanAmount.toLocaleString()} max`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 5: Loan Amount (Min) — Jumbo
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.minLoanAmount && profile.loanAmount != null) {
    if (profile.loanAmount < rules.minLoanAmount) {
      addBlocker(
        'LOAN_AMOUNT_MIN',
        'Loan Amount Below Jumbo Threshold',
        `$${profile.loanAmount.toLocaleString()}`,
        `$${rules.minLoanAmount.toLocaleString()} min`,
        rules.minLoanAmount - profile.loanAmount,
        `Loan is conforming — consider FHA, Conventional, or HomeReady instead`,
        'DISQUALIFYING',
      );
    } else {
      addPass('LOAN_AMOUNT_MIN', 'Jumbo Loan Amount', `$${profile.loanAmount.toLocaleString()}`, `> $${rules.minLoanAmount.toLocaleString()}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 6: Primary Residence
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.requiresPrimaryResidence && profile.occupancy != null) {
    if (profile.occupancy !== 'PRIMARY') {
      addBlocker(
        'OCCUPANCY',
        'Primary Residence Required',
        profile.occupancy,
        'PRIMARY',
        null,
        `${program.name} requires the property to be the borrower's primary residence`,
        'DISQUALIFYING',
      );
    } else {
      addPass('OCCUPANCY', 'Occupancy — Primary Residence', profile.occupancy);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 7: VA Eligibility (Hard Gate)
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.requiresVAEligibility) {
    if (!profile.vaEligible) {
      addBlocker(
        'VA_ELIGIBILITY',
        'VA Eligibility Required',
        'Not eligible',
        'VA COE required',
        null,
        'Must be veteran, active-duty service member, or surviving spouse with valid COE',
        'DISQUALIFYING',
      );
    } else {
      addPass('VA_ELIGIBILITY', 'VA Eligibility', 'COE Verified');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 8: USDA Rural Area (Hard Gate)
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.requiresRuralArea) {
    if (!profile.ruralEligible) {
      addBlocker(
        'RURAL_AREA',
        'USDA-Eligible Rural Area Required',
        'Not in eligible area',
        'USDA eligible area',
        null,
        'Property must be located in a USDA-designated rural or suburban eligible area',
        'DISQUALIFYING',
      );
    } else {
      addPass('RURAL_AREA', 'USDA Rural Area', 'Eligible area confirmed');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 9: Investment Property (Hard Gate — DSCR)
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.requiresInvestmentProperty) {
    if (!profile.investmentProperty) {
      addBlocker(
        'INVESTMENT_PROPERTY',
        'Investment Property Required',
        profile.occupancy ?? 'Not investment',
        'Investment / rental',
        null,
        'DSCR loans are for non-owner-occupied investment / rental properties only',
        'DISQUALIFYING',
      );
    } else {
      addPass('INVESTMENT_PROPERTY', 'Investment Property', 'Confirmed');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 10: Bankruptcy Seasoning
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.bankruptcySeasoningYrs > 0 && profile.bankruptcyYearsAgo != null) {
    if (profile.bankruptcyYearsAgo < rules.bankruptcySeasoningYrs) {
      const yearsNeeded = rules.bankruptcySeasoningYrs - profile.bankruptcyYearsAgo;
      addBlocker(
        'BANKRUPTCY',
        'Bankruptcy Seasoning Not Met',
        `${profile.bankruptcyYearsAgo} years`,
        `${rules.bankruptcySeasoningYrs} years`,
        yearsNeeded,
        `Bankruptcy discharged too recently — need ${yearsNeeded} more year(s) for ${program.name}`,
        'HIGH',
      );
    } else {
      addPass('BANKRUPTCY', 'Bankruptcy Seasoning', `${profile.bankruptcyYearsAgo} years`, `${rules.bankruptcySeasoningYrs} years required`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 11: Foreclosure Seasoning
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.foreclosureSeasoningYrs > 0 && profile.foreclosureYearsAgo != null) {
    if (profile.foreclosureYearsAgo < rules.foreclosureSeasoningYrs) {
      const yearsNeeded = rules.foreclosureSeasoningYrs - profile.foreclosureYearsAgo;
      addBlocker(
        'FORECLOSURE',
        'Foreclosure Seasoning Not Met',
        `${profile.foreclosureYearsAgo} years`,
        `${rules.foreclosureSeasoningYrs} years`,
        yearsNeeded,
        `Foreclosure too recent — need ${yearsNeeded} more year(s) for ${program.name}`,
        'HIGH',
      );
    } else {
      addPass('FORECLOSURE', 'Foreclosure Seasoning', `${profile.foreclosureYearsAgo} years`, `${rules.foreclosureSeasoningYrs} years required`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 12: Property Rehab Requirement (FHA 203k)
  // ══════════════════════════════════════════════════════════════════════════
  if (rules.requiresRehab) {
    if (profile.propertyNeedsRehab === false) {
      // Explicitly move-in ready — 203k not appropriate
      addBlocker(
        'REHAB_REQUIRED',
        'Property Renovation Required for 203k',
        'Move-in ready / no rehab',
        'Property must need renovation ($5,000+ in repairs)',
        null,
        'FHA 203k is for properties requiring renovation — use standard FHA for move-in ready',
        'DISQUALIFYING',
      );
    } else if (profile.propertyNeedsRehab === true) {
      addPass('REHAB_REQUIRED', 'Rehab Property Confirmed', 'Renovation needed');
    }
    // null = unknown — skip check (benefit of the doubt)
  }



  const disqualifyingBlockers = blockers.filter(b => b.severity === 'DISQUALIFYING');
  const hardBlockers          = blockers.filter(b => b.severity !== 'DISQUALIFYING');

  // Disqualified = has any DISQUALIFYING blocker (hard gate failed)
  const disqualified = disqualifyingBlockers.length > 0;

  // Eligible = no blockers at all (may have warnings)
  const eligible = !disqualified && hardBlockers.length === 0;

  // Conditional = no hard gates failed, but has soft blockers (near-miss)
  const conditional = !disqualified && !eligible;

  // ─── Approval Probability (Deterministic Estimate) ────────────────────────
  //
  // Base estimate used to seed Sonnet's reasoning layer.
  // Sonnet refines this with compensating factors, AUS likelihood,
  // and program-specific nuance. Final UI values come from Sonnet.

  let approvalProbability = 0;

  if (disqualified) {
    approvalProbability = 0;
  } else {
    // Base: eligible programs start high; conditional programs start lower
    approvalProbability = eligible ? 92 : 70;

    // Warning deductions (not blockers — just near misses)
    for (const w of warnings) {
      if (w.rule === 'DTI')  approvalProbability -= 8;
      if (w.rule === 'FICO') approvalProbability -= 5;
      if (w.rule === 'LTV')  approvalProbability -= 3;
    }

    // Blocker deductions (conditional path — program not hard-disqualified)
    for (const b of hardBlockers) {
      const gap = b.gap ?? 0;

      if (b.rule === 'DTI') {
        // Each 1% over the max = -10 pts; sharper penalty past 5%
        const dtiPenalty = gap <= 5
          ? gap * 10
          : 50 + (gap - 5) * 15;
        approvalProbability -= Math.min(70, dtiPenalty);
      }

      if (b.rule === 'FICO') {
        approvalProbability -= Math.min(60, gap * 3);
      }

      if (b.rule === 'LTV') {
        approvalProbability -= Math.min(40, gap * 5);
      }

      if (b.rule === 'LOAN_AMOUNT_MAX') {
        approvalProbability -= 60;
      }

      if (b.rule === 'BANKRUPTCY' || b.rule === 'FORECLOSURE') {
        approvalProbability -= Math.min(50, gap * 15);
      }
    }
  }

  approvalProbability = Math.max(0, Math.min(99, Math.round(approvalProbability)));

  // ─── Composite Rule Score (0–100) ────────────────────────────────────────
  // A normalized score of how well the borrower fits this program's rules.
  // Separate from approvalProbability — used for PME ranking sort.

  const totalRulesChecked = passes.length + warnings.length + hardBlockers.length + disqualifyingBlockers.length;
  const ruleScore = totalRulesChecked === 0
    ? 50
    : Math.round(
        ((passes.length * 1.0) + (warnings.length * 0.5)) / totalRulesChecked * 100
      );

  // ─── Final Result Object ──────────────────────────────────────────────────

  return {
    // Identity
    programId:          program.id,
    programName:        program.name,
    fullName:           program.fullName,
    category:           program.category,
    path:               program.path,
    icon:               program.icon,
    description:        program.description,

    // Eligibility
    eligible,
    conditional,
    disqualified,
    eligibilityLabel:   disqualified ? 'Ineligible' : eligible ? 'Eligible' : 'Conditional',

    // Rule results
    blockers,
    warnings,
    passes,
    disqualifyingBlockers,
    hardBlockers,

    // Scores
    approvalProbability,      // 0–100 (deterministic estimate; Sonnet refines)
    ruleScore,                // 0–100 (rule compliance score)

    // Program info (passed through for UI)
    strengths:          program.strengths,
    limitations:        program.limitations,
    compensatingFactors: program.compensatingFactors,
    sortPriority:       program.sortPriority,
  };
}

// ─── Rank All Programs ────────────────────────────────────────────────────────

/**
 * Evaluate and rank all 11 programs for a borrower profile.
 * Returns sorted array: eligible → conditional → disqualified.
 * Within each tier: sorted by approvalProbability desc, then sortPriority desc.
 *
 * @param {Object} profile  Borrower profile (see BORROWER_PROFILE_DEFAULTS)
 * @returns {RuleResult[]}  Sorted array of 11 program evaluations
 */
export function rankPrograms(profile) {
  const merged = { ...BORROWER_PROFILE_DEFAULTS, ...profile };
  const results = PROGRAM_MATRIX.map(p => evaluateProgram(merged, p));

  // Tier: eligible=2, conditional=1, disqualified=0
  const tier = r => r.eligible ? 2 : r.conditional ? 1 : 0;

  results.sort((a, b) => {
    const tDiff = tier(b) - tier(a);
    if (tDiff !== 0) return tDiff;
    const pDiff = b.approvalProbability - a.approvalProbability;
    if (pDiff !== 0) return pDiff;
    return b.sortPriority - a.sortPriority;
  });

  return results;
}

// ─── Primary Blocker Identification ──────────────────────────────────────────

/**
 * Identifies the dominant blocking rule across all evaluated programs.
 * Used to populate the AUS Rescue "PRIMARY BLOCKER" summary chip.
 *
 * @param {RuleResult[]} rankedResults  Output of rankPrograms()
 * @returns {{ rule: string, label: string, count: number } | null}
 */
export function identifyPrimaryBlocker(rankedResults) {
  const counts = {};
  const labels = {};

  for (const result of rankedResults) {
    for (const blocker of result.blockers) {
      counts[blocker.rule] = (counts[blocker.rule] || 0) + 1;
      labels[blocker.rule] = blocker.label;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;

  const [rule, count] = sorted[0];
  return { rule, label: labels[rule], count };
}

// ─── Feasibility Assessment ───────────────────────────────────────────────────

/**
 * HIGH   — 3+ programs eligible, or 3+ with ≥70% approval probability
 * MEDIUM — 1–2 eligible, or 1+ high-probability, or 2+ conditional
 * LOW    — no eligible programs, few/no conditionals with meaningful probability
 *
 * @param {RuleResult[]} rankedResults  Output of rankPrograms()
 * @returns {'HIGH' | 'MEDIUM' | 'LOW'}
 */
export function assessFeasibility(rankedResults) {
  // Feasibility reflects how difficult it is to resolve the primary blockers
  // and reach approval — not simply how many programs exist.
  //
  // Weight:
  //   CRITICAL/DISQUALIFYING blockers = major negative
  //   DTI/FICO gaps = scaled by magnitude
  //   Programs with zero blockers and prob >= 80 = strong positive signals

  const disqualified       = rankedResults.filter(r => r.disqualified).length;
  const totalPrograms      = rankedResults.length;
  const cleanPaths         = rankedResults.filter(r => r.eligible && r.approvalProbability >= 80 && r.warnings.length === 0);
  const warningOnlyElig    = rankedResults.filter(r => r.eligible && r.approvalProbability >= 65);
  const strongConditionals = rankedResults.filter(r => r.conditional && r.approvalProbability >= 55);

  // Count distinct disqualifying blocker types (hard gates)
  const hardGateCount = rankedResults
    .flatMap(r => r.disqualifyingBlockers)
    .filter(b => ['VA_ELIGIBILITY', 'RURAL_AREA', 'INVESTMENT_PROPERTY', 'LOAN_AMOUNT_MIN'].includes(b.rule))
    .map(b => b.rule)
    .filter((v, i, a) => a.indexOf(v) === i).length;

  // If most programs are disqualified with multiple hard gates, LOW regardless
  if (disqualified >= totalPrograms - 2 && cleanPaths.length === 0) return 'LOW';

  // HIGH: multiple clean paths with no warnings AND high probability
  if (cleanPaths.length >= 2) return 'HIGH';

  // MEDIUM: at least one warning-free eligible + another strong path
  if (warningOnlyElig.length >= 1 && (warningOnlyElig.length + strongConditionals.length) >= 3) return 'MEDIUM';
  if (warningOnlyElig.length >= 2) return 'MEDIUM';

  // LOW: one borderline eligible (with warnings) or only conditionals remain
  return 'LOW';
}

// ─── Utility: Extract Profile from LoanBeacons Scenario ──────────────────────

/**
 * Maps a LoanBeacons Firestore scenario document to a borrower profile.
 * Handles field naming conventions from ScenarioCreator.
 *
 * @param {Object} scenario  Firestore scenario document
 * @returns {Object}         Borrower profile for rankPrograms()
 */
export function extractProfileFromScenario(scenario) {
  const loanAmount    = Number(scenario.loanAmount ?? scenario.loan_amount ?? 0);
  const propertyValue = Number(scenario.propertyValue ?? scenario.purchase_price ?? 0);
  const downPayment   = Number(scenario.downPayment ?? scenario.down_payment ?? 0);
  const ltv           = propertyValue > 0
    ? +((loanAmount / propertyValue) * 100).toFixed(2)
    : null;

  return {
    fico:               Number(scenario.creditScore ?? scenario.fico ?? scenario.credit_score ?? 0) || null,
    dti:                Number(scenario.totalDTI ?? scenario.dti ?? scenario.back_end_dti ?? 0) || null,
    ltv:                ltv,
    loanAmount:         loanAmount || null,
    occupancy:          _normalizeOccupancy(scenario.occupancy ?? scenario.propertyUse),
    propertyType:       scenario.propertyType ?? scenario.property_type ?? 'SFR',
    vaEligible:         !!(scenario.vaEligible ?? scenario.va_eligible),
    ruralEligible:      !!(scenario.ruralEligible ?? scenario.usda_eligible),
    investmentProperty: _isInvestment(scenario.occupancy ?? scenario.propertyUse),
    dscrRatio:          Number(scenario.dscrRatio ?? scenario.dscr_ratio) || null,
    incomeAMIPct:       Number(scenario.incomeAMIPct) || null,
    selfEmployed:       !!(scenario.selfEmployed ?? scenario.self_employed),
    firstTimeBuyer:     !!(scenario.firstTimeBuyer ?? scenario.first_time_buyer),
    reserves:           Number(scenario.reserveMonths ?? scenario.reserves) || null,
    bankruptcyYearsAgo: Number(scenario.bankruptcyYearsAgo) || null,
    foreclosureYearsAgo:Number(scenario.foreclosureYearsAgo) || null,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function _normalizeOccupancy(raw) {
  if (!raw) return null;
  const val = String(raw).toUpperCase();
  if (val.includes('PRIMARY') || val.includes('OWNER') || val === 'OO') return 'PRIMARY';
  if (val.includes('SECOND') || val.includes('VACATION'))               return 'SECOND_HOME';
  if (val.includes('INVEST') || val.includes('RENTAL') || val === 'NOO') return 'INVESTMENT';
  return null;
}

function _isInvestment(raw) {
  if (!raw) return false;
  const val = String(raw).toUpperCase();
  return val.includes('INVEST') || val.includes('RENTAL') || val === 'NOO';
}

/**
 * Rough monthly debt payoff estimate from a DTI gap.
 * Assumes ~$300/mo debt per 1% DTI at average income ($6,500/mo).
 */
function _dtiToPayoffEstimate(dtiGap, loanAmount) {
  const assumedMonthlyIncome = loanAmount ? Math.max(5_000, loanAmount * 0.012) : 6_500;
  const monthlyDebtTarget    = Math.round((dtiGap / 100) * assumedMonthlyIncome);
  return `~$${monthlyDebtTarget.toLocaleString()}/mo debt reduction`;
}

// ─── Default Export (CJS interop compatibility) ───────────────────────────────
// Allows dynamic import() from .cjs test scripts regardless of package.json type field.
export default {
  PROGRAM_MATRIX,
  PROGRAM_ID,
  BORROWER_PROFILE_DEFAULTS,
  CONFORMING_LIMIT_2026,
  HIGH_BALANCE_LIMIT_2026,
  evaluateProgram,
  rankPrograms,
  identifyPrimaryBlocker,
  assessFeasibility,
  extractProfileFromScenario,
};
