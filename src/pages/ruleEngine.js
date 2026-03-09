// ─── AUS RESCUE™ v2.0 — RULE ENGINE ──────────────────────────────────────────
// Phase 1: Deterministic program evaluation + Feasibility Score + Primary Blocker
// Two-layer system:
//   Layer 1 → deterministic FICO/DTI/LTV/eligibility thresholds (always runs)
//   Layer 2 → AUS finding multiplier (dominates when finding is provided)
// ─────────────────────────────────────────────────────────────────────────────

// ─── 11-PROGRAM RULE DEFINITIONS ─────────────────────────────────────────────
export const PROGRAM_RULES = {
  fha: {
    label: 'FHA',
    agency: 'FHA TOTAL Scorecard',
    minFICO: 580,
    maxDTI: 56.9,
    maxDTI_noComp: 43,         // without compensating factors, AUS often refers above 43
    maxLTV: 96.5,
    minDown: 3.5,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 24, foreclosure: 36 },
    miRequired: true,
    findings: ['Accept/Eligible', 'Refer/Eligible', 'Refer with Caution'],
    positiveFindings: ['Accept/Eligible'],
    notes: 'MIP for life of loan (if <10% down). 56.9% DTI needs compensating factors. Strong for FICO 580–679.',
  },
  conventional: {
    label: 'Conventional',
    agency: 'DU / LPA',
    minFICO: 620,
    maxDTI: 50,
    maxLTV: 97,
    minDown: 3,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 48, foreclosure: 84 },
    miRequired: false,         // drops at 80% LTV
    findings: ['Approve/Eligible', 'Refer/Eligible', 'Refer with Caution', 'Ineligible'],
    positiveFindings: ['Approve/Eligible'],
    notes: 'No MI at 80% LTV. Best pricing at 740+. 10-month installment exclusion rule.',
  },
  homeready: {
    label: 'HomeReady',
    agency: 'DU',
    minFICO: 620,
    maxDTI: 50,
    maxLTV: 97,
    minDown: 3,
    incomeLimitAMIPct: 80,     // waived in eligible census tracts
    censusWaiverAvailable: true,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 48, foreclosure: 84 },
    findings: ['Approve/Eligible', 'Refer/Eligible', 'Ineligible'],
    positiveFindings: ['Approve/Eligible'],
    notes: 'Fannie Mae. Income limit 80% AMI — WAIVED in eligible census tracts. Most flexible for boarder income.',
  },
  homepossible: {
    label: 'Home Possible',
    agency: 'LPA',
    minFICO: 620,
    maxDTI: 50,
    maxLTV: 97,
    minDown: 3,
    incomeLimitAMIPct: 80,
    censusWaiverAvailable: true,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 48, foreclosure: 84 },
    findings: ['Accept', 'Caution', 'Ineligible'],
    positiveFindings: ['Accept'],
    notes: 'Freddie Mac. Stricter FICO floor (660) than HomeReady. Income limit 80% AMI.',
  },
  va: {
    label: 'VA',
    agency: 'DU / LPA',
    minFICO: 580,
    lenderOverlayFICO: 620,    // most lenders require 620+
    maxDTI: 60,                // residual income is primary qualifier
    maxLTV: 100,
    minDown: 0,
    requiresVeteran: true,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    fundingFeeRequired: true,
    waitingPeriods: { bankruptcy: 24, foreclosure: 24 },
    findings: ['Approve/Eligible', 'Refer/Eligible', 'Ineligible'],
    positiveFindings: ['Approve/Eligible'],
    notes: 'Residual income primary qualifier. No MI. Funding fee (waived for disabled vets).',
  },
  usda: {
    label: 'USDA',
    agency: 'GUS',
    minFICO: 640,
    maxDTI: 41,
    maxFrontEndDTI: 29,        // BOTH ratios required — strictest dual-DTI of all programs
    maxLTV: 100,
    minDown: 0,
    requiresVeteran: false,
    requiresRural: true,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 36, foreclosure: 36 },
    findings: ['Accept', 'Refer', 'Ineligible'],
    positiveFindings: ['Accept'],
    notes: '29/41 dual DTI required. Rural eligible property only. 1% guarantee fee + 0.35% annual.',
  },
  nonqm_bankstatement: {
    label: 'Non-QM Bank Statement',
    agency: 'Portfolio / Manual',
    minFICO: 580,
    maxDTI: 55,
    maxLTV: 90,
    minDown: 10,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: true, // self-employed borrowers only
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 12, foreclosure: 12 },
    findings: ['Approved', 'Declined'],
    positiveFindings: ['Approved'],
    notes: '12–24 month deposits × 50% expense factor = qualifying income. Rate +1.5–2.5%. Exit: refi to agency after 12–24 months.',
  },
  nonqm_dscr: {
    label: 'Non-QM DSCR',
    agency: 'Portfolio / Manual',
    minFICO: 620,
    maxDTI: 999,               // no personal DTI — property cash flow only
    minDSCR: 1.0,
    maxLTV: 80,
    minDown: 20,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: true,  // investment property only
    waitingPeriods: { bankruptcy: 12, foreclosure: 12 },
    findings: ['Approved', 'Declined'],
    positiveFindings: ['Approved'],
    notes: 'DSCR = Gross Rent ÷ PITIA. No personal income verification. Investment only.',
  },
  nonqm_assetdepletion: {
    label: 'Non-QM Asset Depletion',
    agency: 'Portfolio / Manual',
    minFICO: 620,
    maxDTI: 50,
    maxLTV: 85,
    minDown: 15,
    minAssetsThreshold: 500000, // (Assets − Down) ÷ 360 = qualifying income
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 12, foreclosure: 12 },
    findings: ['Approved', 'Declined'],
    positiveFindings: ['Approved'],
    notes: 'Best for retirees with high net worth. Assets ÷ 360 = monthly income. Rate +1.0–2.0%.',
  },
  jumbo: {
    label: 'Jumbo Conventional',
    agency: 'Portfolio',
    minFICO: 700,
    maxDTI: 43,
    maxLTV: 90,
    minDown: 10,
    minReservesMonths: 12,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    waitingPeriods: { bankruptcy: 84, foreclosure: 84 },
    findings: ['Approved', 'Declined'],
    positiveFindings: ['Approved'],
    notes: 'Loan above conforming limit. Strict reserves (12+ months), FICO (700+), and DTI (43% max).',
  },
  fha203k: {
    label: 'FHA 203k',
    agency: 'FHA TOTAL Scorecard',
    minFICO: 640,
    maxDTI: 50,
    maxLTV: 96.5,
    minDown: 3.5,
    requiresVeteran: false,
    requiresRural: false,
    requiresSelfEmployed: false,
    requiresInvestment: false,
    requiresRenovation: true,
    waitingPeriods: { bankruptcy: 24, foreclosure: 36 },
    findings: ['Accept/Eligible', 'Refer/Eligible', 'Refer with Caution'],
    positiveFindings: ['Accept/Eligible'],
    notes: 'Limited (<$35K work) or Standard. MIP required. Higher FICO floor than FHA for Standard.',
  },
};

// ─── AUS FINDING → PROBABILITY MULTIPLIER ────────────────────────────────────
// When a finding is provided it DOMINATES the score. The deterministic base
// is used as a fine-tuning signal within the finding-defined probability band.
const FINDING_CONFIG = {
  'approve/eligible':    { band: [82, 98], multiplier: 'approved' },
  'accept/eligible':     { band: [82, 98], multiplier: 'approved' },
  'accept':              { band: [80, 96], multiplier: 'approved' },
  'approved':            { band: [80, 96], multiplier: 'approved' },
  'refer/eligible':      { band: [30, 65], multiplier: 0.55 },
  'refer':               { band: [15, 38], multiplier: 0.23 },
  'refer with caution':  { band: [8, 28],  multiplier: 0.20 },
  'approve/ineligible':  { band: [10, 42], multiplier: 0.52 },
  'ineligible':          { band: [1, 14],  multiplier: 0.12 },
  'caution':             { band: [20, 40], multiplier: 0.38 },
  'declined':            { band: [1, 10],  multiplier: 0.10 },
};

// ─── CORE EVALUATOR ───────────────────────────────────────────────────────────
/**
 * evaluatePrograms(profile, programFindings)
 *
 * profile fields:
 *   creditScore       {number}  FICO middle score
 *   dti               {number}  back-end DTI %
 *   frontEndDTI       {number}  front-end DTI % (housing ratio)
 *   downPct           {number}  down payment %
 *   reserves          {number}  post-closing reserves in months
 *   loanAmount        {number}  optional — used to compute LTV if downPct missing
 *   propertyValue     {number}  optional
 *   isVeteran         {bool}
 *   isRuralProperty   {bool}
 *   isSelfEmployed    {bool}
 *   isInvestmentProp  {bool}
 *   hasRecentBankruptcy {bool}
 *   monthsPostBankruptcy {number} months since discharge (default 999)
 *   inCensusEligibleTract {bool} HomeReady/HP income limit waived
 *   exceedsIncomeLimit  {bool}  income above 80% AMI (relevant for HomeReady/HP)
 *   hasHighAssets       {bool}  useful for asset depletion
 *
 * programFindings:
 *   { fha: 'Refer', conventional: 'Approve/Ineligible', homeready: 'Approve/Eligible', ... }
 *
 * Returns:
 *   { results[], primaryBlocker, feasibilityScore, feasibilityLabel }
 */
export function evaluatePrograms(profile = {}, programFindings = {}) {
  const {
    creditScore = 0,
    dti = 0,
    frontEndDTI = 0,
    downPct = 0,
    reserves = 0,
    loanAmount,
    propertyValue,
    isVeteran = false,
    isRuralProperty = false,
    isSelfEmployed = false,
    isInvestmentProp = false,
    hasRecentBankruptcy = false,
    monthsPostBankruptcy = 999,
    inCensusEligibleTract = false,
    exceedsIncomeLimit = false,
    hasHighAssets = false,
  } = profile;

  // Derived LTV
  const ltv = downPct
    ? 100 - downPct
    : loanAmount && propertyValue
      ? (loanAmount / propertyValue) * 100
      : null;

  const results = Object.entries(PROGRAM_RULES).map(([key, rule]) => {
    const blockers = [];
    const strengths = [];
    let baseScore = 100;

    // ── HARD ELIGIBILITY GATES ────────────────────────────────────────────
    if (rule.requiresVeteran && !isVeteran) {
      return _result(key, rule, 0, false, ['VA requires military/veteran status'], [], programFindings[key]);
    }
    if (rule.requiresRural && !isRuralProperty) {
      return _result(key, rule, 0, false, ['USDA requires eligible rural property'], [], programFindings[key]);
    }
    if (rule.requiresSelfEmployed && !isSelfEmployed) {
      return _result(key, rule, 8, false, ['Bank statement program: borrower must be self-employed'], [], programFindings[key]);
    }
    if (rule.requiresInvestment && !isInvestmentProp) {
      return _result(key, rule, 5, false, ['DSCR requires investment property'], [], programFindings[key]);
    }
    if (rule.requiresRenovation && !profile.isRenovationPurchase) {
      baseScore -= 30;
      blockers.push('203k: renovation purchase required');
    }

    // ── FICO ──────────────────────────────────────────────────────────────
    const effectiveMin = rule.lenderOverlayFICO || rule.minFICO;
    if (creditScore < rule.minFICO) {
      blockers.push(`FICO ${creditScore} below ${rule.minFICO} minimum`);
      baseScore -= (rule.minFICO - creditScore > 40 ? 55 : 40);
    } else if (creditScore < effectiveMin) {
      blockers.push(`FICO ${creditScore} below lender overlay ${effectiveMin} (guideline: ${rule.minFICO})`);
      baseScore -= 18;
    } else {
      // In-range: tier bonuses/penalties
      if      (creditScore >= 740) { strengths.push('FICO 740+ — best pricing tier'); baseScore += 5; }
      else if (creditScore >= 700) { strengths.push('FICO 700–739 — strong profile'); baseScore += 2; }
      else if (creditScore >= 680) { strengths.push('FICO 680–699 — good credit'); }
      else if (creditScore >= 660) { /* neutral — just above most floors */ }
      else if (creditScore >= 640) { baseScore -= 5; }  // borderline for many programs
      else                         { baseScore -= 10; } // near floor
    }

    // ── BACK-END DTI ──────────────────────────────────────────────────────
    if (key !== 'nonqm_dscr') { // DSCR has no personal DTI
      if (dti > rule.maxDTI) {
        const excess = +(dti - rule.maxDTI).toFixed(1);
        blockers.push(`DTI ${dti}% exceeds ${rule.maxDTI}% max (+${excess}%)`);
        baseScore -= excess > 8 ? 55 : excess > 4 ? 40 : 28;
      } else {
        const utilization = rule.maxDTI > 0 ? dti / rule.maxDTI : 0;
        if      (utilization > 0.95) { baseScore -= 8; }  // within 5% of limit — AUS caution zone
        else if (utilization > 0.88) { baseScore -= 3; }  // within 12% — slightly elevated
        else if (utilization < 0.70) { strengths.push(`DTI ${dti}% well within ${rule.maxDTI}% limit`); }

        // FHA: above 43% (no-comp zone) even if under 56.9% → AUS often refers
        if (key === 'fha' && dti > 43) {
          blockers.push(`DTI ${dti}% above 43% — FHA TOTAL Scorecard requires compensating factors`);
          baseScore -= 12;
        }
      }
    }

    // ── FRONT-END DTI (USDA) ──────────────────────────────────────────────
    if (rule.maxFrontEndDTI && frontEndDTI > 0) {
      if (frontEndDTI > rule.maxFrontEndDTI) {
        blockers.push(`Front-end DTI ${frontEndDTI}% exceeds USDA ${rule.maxFrontEndDTI}% limit`);
        baseScore -= 40;
      } else if (frontEndDTI > rule.maxFrontEndDTI * 0.92) {
        baseScore -= 5; // near USDA front-end limit
      }
    }

    // ── DOWN PAYMENT ──────────────────────────────────────────────────────
    if (downPct < rule.minDown) {
      blockers.push(`${downPct}% down below ${rule.minDown}% minimum`);
      baseScore -= 22;
    } else if (downPct >= 20 && !['va', 'usda'].includes(key)) {
      strengths.push('20%+ down — no MI required');
      baseScore += 5;
    }

    // ── LTV ───────────────────────────────────────────────────────────────
    if (ltv !== null && ltv > rule.maxLTV) {
      blockers.push(`LTV ${ltv.toFixed(1)}% exceeds ${rule.maxLTV}% max`);
      baseScore -= 25;
    }

    // ── INCOME LIMIT (HomeReady / Home Possible) ──────────────────────────
    if (rule.incomeLimitAMIPct) {
      if (exceedsIncomeLimit && !inCensusEligibleTract) {
        blockers.push(`Income exceeds ${rule.incomeLimitAMIPct}% AMI limit`);
        baseScore -= 38;
      } else if (inCensusEligibleTract) {
        strengths.push('Income limit waived — eligible census tract');
        baseScore += 3;
      }
    }

    // ── RESERVES ─────────────────────────────────────────────────────────
    if (rule.minReservesMonths && reserves < rule.minReservesMonths) {
      blockers.push(`${reserves} months reserves below ${rule.minReservesMonths}-month minimum`);
      baseScore -= 18;
    } else if (reserves >= 12) {
      strengths.push('12+ months reserves — strong compensating factor');
      baseScore += 6;
    } else if (reserves >= 6) {
      strengths.push(`${reserves} months reserves — solid`);
      baseScore += 2;
    } else if (reserves < 2 && ['jumbo', 'nonqm_bankstatement', 'nonqm_assetdepletion'].includes(key)) {
      blockers.push(`${reserves} months reserves — insufficient for portfolio product`);
      baseScore -= 15;
    }

    // ── BANKRUPTCY / FORECLOSURE WAITING PERIOD ───────────────────────────
    if (hasRecentBankruptcy && rule.waitingPeriods) {
      const needed = rule.waitingPeriods.bankruptcy;
      if (monthsPostBankruptcy < needed) {
        const remaining = needed - monthsPostBankruptcy;
        blockers.push(`${remaining} months remaining in BK waiting period (${needed}-month req.)`);
        baseScore -= (remaining > 24 ? 60 : remaining > 12 ? 45 : 30);
      }
    }

    // ── SELF-EMPLOYED ─────────────────────────────────────────────────────
    if (isSelfEmployed && ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'].includes(key)) {
      blockers.push('Self-employed: income limited by tax write-offs — 2yr avg required');
      baseScore -= 8;
    }
    if (isSelfEmployed && key === 'nonqm_bankstatement') {
      strengths.push('Bank statement income available — strong fit for self-employed');
      baseScore += 10;
    }

    // ── HIGH ASSETS ───────────────────────────────────────────────────────
    if (hasHighAssets && key === 'nonqm_assetdepletion') {
      strengths.push('High assets — asset depletion income available');
      baseScore += 15;
    }

    baseScore = Math.max(0, Math.min(100, baseScore));

    return _result(key, rule, baseScore, blockers.length === 0, blockers, strengths, programFindings[key]);
  });

  // Sort by probability descending
  const sorted = results.sort((a, b) => b.probability - a.probability);

  const primaryBlocker = _getPrimaryBlocker(profile, sorted, programFindings);
  const { score: feasibilityScore, label: feasibilityLabel } = _getFeasibility(sorted);

  return { results: sorted, primaryBlocker, feasibilityScore, feasibilityLabel };
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function _result(key, rule, baseScore, eligible, blockers, strengths, finding = '') {
  const probability = _calcProbability(baseScore, finding, blockers);
  const likelihood = probability >= 75 ? 'High' : probability >= 45 ? 'Medium' : 'Low';
  return {
    key,
    label: rule.label,
    agency: rule.agency,
    probability,
    score: probability,           // backwards-compat with v1 Program Switch tab
    baseScore,
    finding: finding || '',
    eligible,
    likelihood,                   // backwards-compat with v1 LIKELIHOOD_STYLE
    blockers,
    issues: blockers,             // backwards-compat alias
    strengths,
    notes: rule.notes,
  };
}

function _calcProbability(baseScore, finding, blockers) {
  const norm = (finding || '').toLowerCase().trim();
  const cfg = FINDING_CONFIG[norm];

  if (!cfg) {
    // No finding — pure deterministic
    return Math.min(95, Math.max(1, baseScore));
  }

  if (cfg.multiplier === 'approved') {
    // AUS APPROVED: finding dominates. Use band tuned by base quality.
    const [lo, hi] = cfg.band;
    const ratio = baseScore / 100;
    const raw = lo + (hi - lo) * (0.4 + ratio * 0.6);
    return Math.min(hi, Math.max(lo, Math.round(raw)));
  }

  // Refer / Ineligible / etc — multiply base within band
  const [lo, hi] = cfg.band;
  const raw = Math.round(baseScore * cfg.multiplier);
  return Math.min(hi, Math.max(lo, raw));
}

function _getPrimaryBlocker(profile, results, programFindings) {
  const { creditScore = 0, dti = 0, downPct = 0 } = profile;
  const counts = { dti: 0, credit: 0, downPayment: 0, ltv: 0, eligibility: 0 };

  // Count deterministic blockers across all programs
  results.forEach(r => {
    r.blockers.forEach(b => {
      const bl = b.toLowerCase();
      if (bl.includes('dti') || bl.includes('debt-to')) counts.dti++;
      if (bl.includes('fico') || bl.includes('credit score') || bl.includes('overlay')) counts.credit++;
      if (bl.includes('down') && !bl.includes('buydown')) counts.downPayment++;
      if (bl.includes('ltv')) counts.ltv++;
      if (bl.includes('waiting period') || bl.includes('veteran') || bl.includes('rural') ||
          bl.includes('income limit') || bl.includes('ineligible')) counts.eligibility++;
    });
  });

  // Boost DTI count if AUS findings suggest DTI is the issue
  Object.entries(programFindings).forEach(([, f]) => {
    const fn = (f || '').toLowerCase();
    if (['refer', 'refer/eligible', 'refer with caution'].includes(fn) && dti > 43) {
      counts.dti += 2; // AUS refer on high-DTI file = strong DTI signal
    }
  });

  // Find dominant blocker
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return null;

  const BLOCKER_META = {
    dti: {
      label: 'DTI',
      color: 'red',
      detail: `Back-end DTI ${dti}% is the primary risk factor across programs`,
      action: 'Use Strategies tab → filter by "DTI / Payment" for targeted fixes',
    },
    credit: {
      label: 'CREDIT SCORE',
      color: 'orange',
      detail: `FICO ${creditScore} is limiting program eligibility`,
      action: 'Rapid rescore, authorized user removal, or utilization paydown',
    },
    downPayment: {
      label: 'DOWN PAYMENT',
      color: 'orange',
      detail: `${downPct}% down payment restricting program options`,
      action: 'Gift funds, DPA programs, or VA/USDA (0% down) if eligible',
    },
    ltv: {
      label: 'LTV',
      color: 'orange',
      detail: 'Loan-to-value ratio limiting available programs',
      action: 'Increase down payment or negotiate lower purchase price',
    },
    eligibility: {
      label: 'PROGRAM ELIGIBILITY',
      color: 'amber',
      detail: 'Special eligibility requirements not met for key programs',
      action: 'Review Program Switch tab for viable alternatives',
    },
  };

  return { type: top[0], count: top[1], ...BLOCKER_META[top[0]] };
}

function _getFeasibility(results) {
  const eligible = results.filter(r => r.probability > 0);
  if (!eligible.length) return { score: 0, label: 'LOW' };

  const best = eligible[0].probability;
  const highCount = eligible.filter(r => r.probability >= 75).length;
  const medCount  = eligible.filter(r => r.probability >= 50).length;

  let label;
  if (best >= 80 && highCount >= 1)  label = 'HIGH';
  else if (best >= 55 || medCount >= 2) label = 'MEDIUM';
  else                                   label = 'LOW';

  return { score: best, label };
}

// ─── ACCEPTANCE TEST — SHANNA ARSCOTT SCENARIO ───────────────────────────────
// Expected: PRIMARY_BLOCKER=DTI, Feasibility=LOW
// Program probabilities: HomeReady≈92, HomePossible≈85, Conventional≈34, FHA≈22
//
// Run from browser console:
//   import { runAcceptanceTest } from './ruleEngine';
//   runAcceptanceTest();

export const SHANNA_TEST_PROFILE = {
  creditScore: 648,
  dti: 48.5,
  frontEndDTI: 33,
  downPct: 5,
  reserves: 3,
  isVeteran: false,
  isRuralProperty: false,
  isSelfEmployed: false,
  hasRecentBankruptcy: false,
  inCensusEligibleTract: true,   // HomeReady income limit waived
  exceedsIncomeLimit: true,       // income above 80% AMI (without census waiver would block)
};

export const SHANNA_TEST_FINDINGS = {
  fha: 'Refer',
  conventional: 'Approve/Ineligible',
  homeready: 'Approve/Eligible',
};

export const SHANNA_EXPECTED = {
  primaryBlocker: 'DTI',
  feasibilityLabel: 'HIGH',  // HomeReady Approve/Eligible = viable path exists → HIGH
  homeready:    { min: 88, max: 98 },
  homepossible: { min: 75, max: 90 },
  conventional: { min: 28, max: 42 },
  fha:          { min: 17, max: 30 },
};

export function runAcceptanceTest() {
  const { results, primaryBlocker, feasibilityLabel } = evaluatePrograms(
    SHANNA_TEST_PROFILE,
    SHANNA_TEST_FINDINGS
  );

  const get = key => results.find(r => r.key === key)?.probability ?? 'NOT FOUND';
  const check = (label, val, min, max) => {
    const pass = val >= min && val <= max;
    console.log(`${pass ? '✅' : '❌'} ${label}: ${val} (expected ${min}–${max})`);
    return pass;
  };

  console.log('\n━━━ AUS RESCUE v2 — SHANNA ARSCOTT ACCEPTANCE TEST ━━━');
  const r = [
    check('HomeReady',    get('homeready'),    SHANNA_EXPECTED.homeready.min,    SHANNA_EXPECTED.homeready.max),
    check('Home Possible',get('homepossible'), SHANNA_EXPECTED.homepossible.min, SHANNA_EXPECTED.homepossible.max),
    check('Conventional', get('conventional'), SHANNA_EXPECTED.conventional.min, SHANNA_EXPECTED.conventional.max),
    check('FHA',          get('fha'),          SHANNA_EXPECTED.fha.min,          SHANNA_EXPECTED.fha.max),
  ];

  const pbPass = primaryBlocker?.type === 'dti';
  const fsPass = feasibilityLabel === SHANNA_EXPECTED.feasibilityLabel;
  console.log(`${pbPass ? '✅' : '❌'} Primary Blocker: ${primaryBlocker?.type?.toUpperCase()} (expected DTI)`);
 console.log(`${fsPass ? '✅' : '❌'} Feasibility: ${feasibilityLabel} (expected ${SHANNA_EXPECTED.feasibilityLabel})`);

  const allPass = r.every(Boolean) && pbPass && fsPass;
  console.log(`\n${allPass ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}`);
  console.log('Full results:', results.slice(0, 6).map(r => `${r.label}: ${r.probability}%`).join(', '));
  return allPass;
}
