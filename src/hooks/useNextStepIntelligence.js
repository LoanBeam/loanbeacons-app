// ─────────────────────────────────────────────────────────────────
// useNextStepIntelligence.js
// LoanBeacons™ — Next Step Intelligence™ Hook + Rules Engine
// Layer 1: Deterministic (covers ~85% of scenarios)
// Layer 2: AI Reasoning (Phase 2 — Haiku, deferred)
// Patent Pending: U.S. Application No. 63/739,290
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────
// MODULE REGISTRY — canonical keys, labels, routes, stages
// Order matches Canonical Sequence™ M01–M28 exactly.
// CRA Intel is background infrastructure — intentionally excluded.
// Keys MUST match decisionRecordConstants.js MODULE_KEYS exactly.
// ─────────────────────────────────────────────
export const MODULE_REGISTRY = {
  // ── Stage 1: Pre-Structure (M01–M07) ──────────────────────────────────────
  SCENARIO_CREATOR:     { label: 'Scenario Creator',               route: '/scenario-creator',        stage: 1 },
  QUALIFYING_INTEL:     { label: 'Qualifying Intelligence',         route: '/qualifying-intel',        stage: 1 },
  INCOME_ANALYZER:      { label: 'Income Analyzer',                 route: '/income-analyzer',         stage: 1 },
  ASSET_ANALYZER:       { label: 'Asset Analyzer',                  route: '/asset-analyzer',          stage: 1 },
  CREDIT_INTEL:         { label: 'Credit Intelligence',             route: '/credit-intel',            stage: 1 },
  DEBT_CONSOLIDATION:   { label: 'Debt Consolidation Intelligence', route: '/debt-consolidation',      stage: 1 },
  BANK_STATEMENT_INTEL: { label: 'Bank Statement Intelligence',     route: '/bank-statement-intel',    stage: 1 },

  // ── Stage 2: Lender Fit (M08–M17) ─────────────────────────────────────────
  LENDER_MATCH:         { label: 'Lender Match',                    route: '/lender-match',            stage: 2 },
  DPA_INTEL:            { label: 'DPA Intelligence',                route: '/dpa-intelligence',        stage: 2 },
  AUS_RESCUE:           { label: 'AUS Rescue',                      route: '/aus-rescue',              stage: 2 },
  FHA_STREAMLINE:       { label: 'FHA Streamline Intelligence',     route: '/fha-streamline',          stage: 2 },
  VA_IRRRL:             { label: 'VA IRRRL Intelligence',           route: '/va-irrrl',                stage: 2 },
  USDA_INTEL:           { label: 'USDA Intelligence',               route: '/usda-intelligence',       stage: 2 },
  CONVENTIONAL_REFI:    { label: 'Conventional Refi Intelligence',  route: '/conventional-refi',       stage: 2 },
  RATE_BUYDOWN:         { label: 'Rate Buydown Calculator',         route: '/rate-buydown',            stage: 2 },
  MI_OPTIMIZER:         { label: 'MI Optimizer',                    route: '/mi-optimizer',            stage: 2 },
  ARM_STRUCTURE:        { label: 'ARM Structure Intelligence',      route: '/arm-structure',           stage: 2 },

  // ── Stage 3: Optimization (M18–M26) ───────────────────────────────────────
  REHAB_INTEL:          { label: 'Rehab Intelligence',              route: '/rehab-intelligence',      stage: 3 },
  RATE_INTEL:           { label: 'Rate Intelligence',               route: '/rate-intel',              stage: 3 },
  CLOSING_COST_CALC:    { label: 'Closing Cost Calculator',         route: '/closing-cost-calc',       stage: 3 },
  PROPERTY_INTEL:       { label: 'Collateral Intelligence',         route: '/property-intel',          stage: 3 },
  PIGGYBACK_OPTIMIZER:  { label: 'Piggyback 2nd Optimizer',         route: '/piggyback-optimizer',     stage: 3 },
  TITLE_INTEL:          { label: 'Title Intelligence',              route: '/title-intel',             stage: 3 },
  DISCLOSURE_INTEL:     { label: 'Disclosure Intelligence',         route: '/disclosure-intel',        stage: 3 },
  COMPLIANCE_INTEL:     { label: 'Compliance Intelligence',         route: '/compliance-intel',        stage: 3 },
  FLOOD_INTEL:          { label: 'Flood Intelligence',              route: '/flood-intel',             stage: 3 },

  // ── Stage 4: Verify & Submit (M27–M28) ────────────────────────────────────
  DECISION_RECORD:      { label: 'Decision Record',                 route: '/decision-records',        stage: 4 },
  INTELLIGENT_CHECKLIST:{ label: 'Intelligent Checklist',           route: '/intelligent-checklist',   stage: 4 },
};

// ─────────────────────────────────────────────
// LOAN PURPOSE SUPPRESSION MAP
// Keys in this map are fully suppressed — never shown — for the listed purposes
// ─────────────────────────────────────────────
export const SUPPRESSION_MAP = {
  DPA_INTEL:           ['rate_term_refi', 'cash_out_refi'],
  FHA_STREAMLINE:      ['purchase', 'cash_out_refi'],
  VA_IRRRL:            ['purchase', 'cash_out_refi'],
  USDA_INTEL:          ['rate_term_refi', 'cash_out_refi'],
  RATE_BUYDOWN:        ['cash_out_refi'],
  REHAB_INTEL:         ['rate_term_refi'],
  PIGGYBACK_OPTIMIZER: ['cash_out_refi'],
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function isSuppressed(moduleKey, loanPurpose) {
  const suppressedFor = SUPPRESSION_MAP[moduleKey];
  return suppressedFor ? suppressedFor.includes(loanPurpose) : false;
}

function buildSuggestion(moduleKey, reason, urgency, overrides = {}) {
  const mod = MODULE_REGISTRY[moduleKey];
  if (!mod) return null;
  return {
    moduleKey,
    moduleLabel:         mod.label,
    route:               mod.route,
    reason,
    urgency,             // "HIGH" | "MEDIUM" | "LOW"
    stage:               mod.stage,
    loanPurposeRelevant: true,
    canSkip:             urgency !== 'HIGH',
    ...overrides,
  };
}

function applySuppression(candidates, loanPurpose) {
  return candidates.filter(s => s && !isSuppressed(s.moduleKey, loanPurpose));
}

const URGENCY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// ─────────────────────────────────────────────
// RULES ENGINE — Layer 1 Deterministic
// First-match-wins per stage; all valid matches
// sorted HIGH → MEDIUM → LOW after collection.
// ─────────────────────────────────────────────
function runRulesEngine({ currentModuleKey, loanPurpose, findings, scenarioData, completedModules }) {
  const completed = new Set(completedModules || []);
  const raw = [];

  // Guard: only suggest a module if not already completed and not suppressed
  const suggest = (key, reason, urgency, overrides) => {
    if (completed.has(key)) return null;
    if (isSuppressed(key, loanPurpose)) return null;
    return buildSuggestion(key, reason, urgency, overrides);
  };

  // Merge findings from both the decisionRecord findings object and raw scenarioData
  const f = { ...scenarioData, ...findings };

  // ─── STAGE 1 ────────────────────────────────

  if (currentModuleKey === 'SCENARIO_CREATOR') {
    if (loanPurpose === 'purchase') {
      raw.push(suggest('QUALIFYING_INTEL', 'Every purchase file starts here — confirm DTI, income type, and qualifying ratios before anything else.', 'HIGH'));
    } else if (loanPurpose === 'rate_term_refi') {
      raw.push(suggest('QUALIFYING_INTEL', 'Confirm qualifying ratios before evaluating refi eligibility and seasoning.', 'HIGH'));
      raw.push(suggest('CREDIT_INTEL',     'Refi eligibility is credit-score sensitive — run Credit Intelligence in parallel.', 'MEDIUM'));
    } else if (loanPurpose === 'cash_out_refi') {
      raw.push(suggest('QUALIFYING_INTEL', 'Cash-out refi has strict DTI and LTV thresholds — qualifying analysis is mandatory first.', 'HIGH'));
      raw.push(suggest('INCOME_ANALYZER',  'Cash-out triggers full income documentation review under cash-out guidelines.', 'MEDIUM'));
      raw.push(suggest('CREDIT_INTEL',     'Score requirements vary by LTV tier on cash-out — run Credit Intelligence.', 'MEDIUM'));
    }
  }

  if (currentModuleKey === 'QUALIFYING_INTEL') {
    const dti          = parseFloat(f.dti || f.frontEndDTI || 0);
    const selfEmployed = f.selfEmployed || f.isSelfEmployed || false;
    const incomeType   = (f.incomeType || '').toLowerCase();
    const nonQM        = f.nonQMIncomeType || incomeType === 'bank_statement' || incomeType === '1099' || incomeType === 'asset_depletion';

    if (selfEmployed || nonQM) {
      raw.push(suggest('BANK_STATEMENT_INTEL',
        'Self-employed or non-QM income type detected. Bank Statement Intelligence is required before program qualification.',
        'HIGH'));
    }
    if (dti > 45) {
      raw.push(suggest('DEBT_CONSOLIDATION',
        `DTI at ${dti}% exceeds the conventional 45% threshold. Debt consolidation analysis may recover 4–6 points and unlock approval.`,
        'HIGH'));
    } else if (dti > 43) {
      raw.push(suggest('DEBT_CONSOLIDATION',
        `DTI at ${dti}% exceeds the FHA guideline threshold of 43%. Consolidation analysis is recommended before AUS submission.`,
        'MEDIUM'));
    } else if (dti > 0 && dti <= 43 && !selfEmployed && !nonQM) {
      raw.push(suggest('INCOME_ANALYZER',
        'DTI is within range. Proceed to full income documentation analysis.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'INCOME_ANALYZER') {
    const incomeType       = (f.incomeType || '').toLowerCase();
    const incomeSufficient = f.incomeSufficient !== false;
    const assetsVerified   = f.assetsVerified || completed.has('ASSET_ANALYZER');

    if (incomeType === 'bank_statement' || incomeType === '1099') {
      raw.push(suggest('BANK_STATEMENT_INTEL',
        'Income type flagged as bank statement or 1099. Run Bank Statement Intelligence before lender submission.',
        'HIGH'));
    } else if (!incomeSufficient) {
      raw.push(suggest('SCENARIO_CREATOR',
        'Income is insufficient for this scenario. Return to Scenario Creator to adjust purchase price or loan amount.',
        'HIGH', { canSkip: false }));
    } else if (!assetsVerified) {
      raw.push(suggest('ASSET_ANALYZER',
        'Income confirmed. Verify assets to complete the qualifying picture.',
        'MEDIUM'));
    } else {
      raw.push(suggest('CREDIT_INTEL',
        'Income and assets confirmed. Proceed to Credit Intelligence.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'CREDIT_INTEL') {
    const score         = parseInt(f.creditScore || f.fico || 0);
    const hasCollections = f.hasCollections || f.hasDerogatory || f.derogatoryPresent || false;

    if (score > 0 && score < 580) {
      raw.push({
        moduleKey:           'CREDIT_INTEL',
        moduleLabel:         'Credit Intelligence — Dispute Strategy Required',
        route:               MODULE_REGISTRY.CREDIT_INTEL.route,
        reason:              `Score at ${score} — all program modules are blocked until score reaches 580. Focus on dispute strategy and credit rehabilitation before proceeding.`,
        urgency:             'HIGH',
        stage:               1,
        loanPurposeRelevant: true,
        canSkip:             false,
        isBlocker:           true,
      });
    } else if (score >= 580 && score <= 619) {
      raw.push(suggest('AUS_RESCUE',
        `Score in the 580–619 range — FHA-eligible only. Run AUS Rescue before Lender Match to map the approval path.`,
        'HIGH'));
    } else if (hasCollections) {
      raw.push(suggest('AUS_RESCUE',
        'Collections or derogatory marks present. AUS Rescue recommended before Lender Match to quantify impact on approval.',
        'MEDIUM'));
    } else if (score >= 740) {
      raw.push(suggest('LENDER_MATCH',
        'Strong credit profile. Proceed directly to Lender Match.',
        'LOW'));
    } else if (score > 619) {
      raw.push(suggest('LENDER_MATCH',
        'Credit profile reviewed. Proceed to Lender Match.',
        'LOW'));
    }
  }

  // ─── STAGE 2 ────────────────────────────────

  if (currentModuleKey === 'LENDER_MATCH') {
    const matchFound = f.matchFound !== false;

    if (!matchFound) {
      raw.push(suggest('AUS_RESCUE',
        'No lender match found. AUS Rescue — Program Migration Engine can identify alternative approval paths.',
        'HIGH'));
    } else if (loanPurpose === 'purchase') {
      raw.push(suggest('DPA_INTEL',
        'Lender matched. Check for down payment assistance stacking opportunity before finalizing loan structure.',
        'MEDIUM'));
      raw.push(suggest('AUS_RESCUE',
        'Run AUS Rescue to confirm the approval path before proceeding to optimization modules.',
        'LOW'));
    } else if (loanPurpose === 'rate_term_refi') {
      raw.push(suggest('FHA_STREAMLINE',
        'Lender matched. Evaluate FHA Streamline eligibility — lower thresholds and reduced documentation may benefit this borrower.',
        'LOW'));
      raw.push(suggest('VA_IRRRL',
        'If this is a VA loan, run VA IRRRL to confirm Net Tangible Benefit.',
        'LOW'));
    } else if (loanPurpose === 'cash_out_refi') {
      raw.push(suggest('AUS_RESCUE',
        'Cash-out refinance requires AUS approval path confirmation before proceeding.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'DPA_INTEL') {
    const grantFound   = f.grantFound || f.dpaAvailable || f.dpaProgramsFound || false;
    const nearAmiLimit = f.nearAmiLimit || f.amiWarning || false;

    if (grantFound && nearAmiLimit) {
      raw.push(suggest('INCOME_ANALYZER',
        'Grant found but income is near the AMI limit. Re-run Income Analyzer to confirm AMI eligibility holds before committing to this program.',
        'HIGH'));
    } else if (grantFound) {
      raw.push(suggest('AUS_RESCUE',
        'DPA grant identified. Proceed to AUS Rescue to confirm approval path with assistance applied to structure.',
        'MEDIUM'));
    } else {
      raw.push(suggest('AUS_RESCUE',
        'No DPA available for this scenario. Proceed to AUS Rescue for approval path analysis.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'AUS_RESCUE') {
    const blocker     = (f.primaryBlocker || f.PRIMARY_BLOCKER || '').toUpperCase();
    const feasibility = (f.feasibility || f.FEASIBILITY || '').toUpperCase();
    const recommended = (f.recommendedProgram || '').toUpperCase();

    if (blocker === 'DTI') {
      raw.push(suggest('DEBT_CONSOLIDATION',
        'PRIMARY_BLOCKER is DTI. Debt Consolidation Intelligence may resolve the approval block — run before re-submitting to AUS.',
        'HIGH'));
    }
    if (blocker === 'COLLECTIONS') {
      raw.push(suggest('CREDIT_INTEL',
        'PRIMARY_BLOCKER is collections. Return to Credit Intelligence to map a dispute path and quantify timeline to resolution.',
        'HIGH'));
    }
    if (blocker === 'LTV') {
      raw.push(suggest('PROPERTY_INTEL',
        'PRIMARY_BLOCKER is LTV. Run Collateral Intelligence to assess property value defensibility before restructuring.',
        'HIGH'));
      raw.push(suggest('RATE_BUYDOWN',
        'Rate Buydown with seller concessions may offset LTV constraint. Evaluate alongside Collateral Intelligence.',
        'MEDIUM'));
    }

    // Program migration
    if (recommended === 'FHA_STREAMLINE') {
      raw.push(suggest('FHA_STREAMLINE', 'AUS Rescue identifies FHA Streamline as the recommended migration path.', 'HIGH'));
    }
    if (recommended === 'VA_IRRRL') {
      raw.push(suggest('VA_IRRRL', 'AUS Rescue identifies VA IRRRL as the recommended migration path.', 'HIGH'));
    }
    if (recommended === 'USDA') {
      raw.push(suggest('USDA_INTEL', 'AUS Rescue identifies USDA as the recommended migration path.', 'HIGH'));
    }

    // Clean path
    if (!blocker && (feasibility === 'HIGH' || feasibility === 'MEDIUM')) {
      raw.push(suggest('PROPERTY_INTEL',
        `Feasibility ${feasibility}. Proceed to Collateral Intelligence for property condition review.`,
        feasibility === 'HIGH' ? 'LOW' : 'MEDIUM'));
    }
  }

  if (currentModuleKey === 'ASSET_ANALYZER') {
    const sufficient  = f.sufficientFunds !== false;
    const reservePass = f.reservePass    !== false;
    const hasBlocking = (f.blockingIssues || []).length > 0;

    if (hasBlocking) {
      raw.push(suggest('SCENARIO_CREATOR',
        'Blocking asset issues identified. Return to Scenario Creator to adjust loan amount or verify additional asset sources.',
        'HIGH', { canSkip: false }));
    } else if (!sufficient) {
      raw.push(suggest('SCENARIO_CREATOR',
        'Verified assets are insufficient for cash to close. Return to Scenario Creator to adjust structure or explore DPA.',
        'HIGH'));
    } else {
      raw.push(suggest('CREDIT_INTEL',
        'Assets verified. Proceed to Credit Intelligence to complete the Stage 1 qualifying picture.',
        'LOW'));
    }
    if (sufficient && !reservePass) {
      raw.push(suggest('DEBT_CONSOLIDATION',
        'Assets cover cash to close but reserve requirement not met. Debt consolidation may free up liquid reserves.',
        'MEDIUM'));
    }
  }

  if (currentModuleKey === 'BANK_STATEMENT_INTEL') {
    const incomeConfirmed = f.incomeConfirmed !== false;
    if (incomeConfirmed) {
      raw.push(suggest('LENDER_MATCH',
        'Bank statement income confirmed. Proceed to Lender Match with Non-QM / bank statement lenders.',
        'LOW'));
    } else {
      raw.push(suggest('QUALIFYING_INTEL',
        'Bank statement income analysis incomplete or insufficient. Re-run Qualifying Intelligence with updated income figures.',
        'HIGH'));
    }
  }

  if (currentModuleKey === 'DEBT_CONSOLIDATION') {
    const dtiAfter = parseFloat(f.dtiAfterConsolidation || f.projectedDTI || 0);
    if (dtiAfter > 0 && dtiAfter <= 43) {
      raw.push(suggest('AUS_RESCUE',
        `Consolidation brings DTI to ${dtiAfter}%. Re-submit to AUS Rescue with updated debt profile.`,
        'MEDIUM'));
    } else if (dtiAfter > 43) {
      raw.push(suggest('QUALIFYING_INTEL',
        `Consolidation projects DTI at ${dtiAfter}% — still above threshold. Return to Qualifying Intelligence to reassess.`,
        'HIGH'));
    } else {
      raw.push(suggest('AUS_RESCUE',
        'Consolidation analysis complete. Re-run AUS Rescue with updated debt figures.',
        'LOW'));
    }
  }

  // ─── STAGE 3 ────────────────────────────────

  if (currentModuleKey === 'RATE_BUYDOWN') {
    const breakEven = parseInt(f.breakEvenMonths || f.breakeven || 0);
    const hasMI     = f.hasMI || f.requiresMI || false;

    if (breakEven > 48) {
      raw.push(suggest('ARM_STRUCTURE',
        `Break-even at ${breakEven} months exceeds 4 years. ARM Structure Intelligence may offer a better-fit alternative for this borrower's timeline.`,
        'MEDIUM'));
    } else if (breakEven > 0 && breakEven <= 24) {
      if (hasMI) {
        raw.push(suggest('MI_OPTIMIZER',
          `Strong buydown case — break-even at ${breakEven} months. Optimize MI to further reduce total payment burden.`,
          'LOW'));
      } else {
        raw.push(suggest('PROPERTY_INTEL',
          'Buydown structure confirmed. Proceed to Collateral Intelligence.',
          'LOW'));
      }
    }
  }

  if (currentModuleKey === 'PROPERTY_INTEL') {
    const flipDays      = parseInt(f.flipDays || f.daysSincePriorSale || f.flipAgeDays || -1);
    const wellSeptic    = f.wellSeptic || f.wellSepticPresent || f.hasWellSeptic || false;
    const appraisalRisk = (f.appraisalRisk || f.overallRisk || '').toUpperCase();
    const structural    = f.structuralConcerns || f.structuralIssues || false;

    if (flipDays >= 0 && flipDays < 91) {
      raw.push(suggest('LENDER_MATCH',
        `Flip at ${flipDays} days — FHA and USDA eligibility is blocked. Re-run Lender Match filtered to Conventional only. Flag logged in Decision Record.`,
        'HIGH', { canSkip: false }));
    }
    if (wellSeptic) {
      raw.push(suggest('COMPLIANCE_INTEL',
        'Well/Septic present. Flag for FHA/VA compliance review before AUS submission — appraiser must certify functionality.',
        'HIGH'));
    }
    if (appraisalRisk === 'HIGH') {
      if (structural) {
        raw.push(suggest('REHAB_INTEL',
          'HIGH appraisal risk with structural concerns identified. Rehab Intelligence required to assess renovation path and eligibility.',
          'HIGH'));
      } else {
        raw.push(suggest('RATE_BUYDOWN',
          'HIGH appraisal risk — value gap identified. Rate Buydown with seller concessions may bridge the gap and protect the deal.',
          'HIGH'));
      }
    }
    if ((flipDays < 0 || flipDays >= 91) && appraisalRisk !== 'HIGH' && !wellSeptic) {
      raw.push(suggest('CLOSING_COST_CALC',
        'Property report clean. Proceed to Closing Cost Calculator.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'CLOSING_COST_CALC') {
    const cashToClose    = parseFloat(f.cashToClose || f.totalCashToClose || 0);
    const borrowerAssets = parseFloat(f.borrowerAssets || f.verifiedAssets || scenarioData?.assets || 0);
    const shortfall      = cashToClose > 0 && borrowerAssets > 0 && cashToClose > borrowerAssets;

    if (shortfall) {
      raw.push(suggest('RATE_BUYDOWN',
        `Cash to close of $${cashToClose.toLocaleString()} exceeds verified assets of $${borrowerAssets.toLocaleString()}. Seller concession buydown strategy may offset the gap.`,
        'HIGH'));
      raw.push(suggest('DPA_INTEL',
        'Re-check DPA availability — a stacked grant may cover the cash-to-close shortfall.',
        'HIGH'));
    } else {
      raw.push(suggest('TITLE_INTEL',
        'Cash to close is within acceptable range. Proceed to Title Intelligence.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'REHAB_INTEL') {
    raw.push(suggest('AUS_RESCUE',
      'Rehab scope and program path identified. Run AUS Rescue to confirm approval path under renovation loan guidelines (203k / HomeStyle).',
      'MEDIUM'));
  }

  if (currentModuleKey === 'MI_OPTIMIZER') {
    raw.push(suggest('PROPERTY_INTEL',
      'MI structure optimized. Proceed to Collateral Intelligence for property condition review.',
      'LOW'));
  }

  if (currentModuleKey === 'ARM_STRUCTURE') {
    raw.push(suggest('LENDER_MATCH',
      'ARM structure analyzed. Proceed to Lender Match with ARM product availability in mind.',
      'LOW'));
  }

  // ─── STAGE 4 ────────────────────────────────

  if (currentModuleKey === 'TITLE_INTEL') {
    const lienFound    = f.lienFound || f.lienDetected || false;
    const vestingIssue = f.vestingIssue || f.vestingConcern || false;

    if (lienFound) {
      raw.push(suggest('DISCLOSURE_INTEL',
        'Lien found — submission is blocked. Flag to Disclosure Intelligence immediately and document in Decision Record.',
        'HIGH', { canSkip: false }));
    } else if (vestingIssue) {
      raw.push(suggest('COMPLIANCE_INTEL',
        'Vesting issue identified. Flag to Compliance Intelligence for review before proceeding.',
        'HIGH'));
    } else {
      raw.push(suggest('DISCLOSURE_INTEL',
        'Title is clean. Proceed to Disclosure Intelligence.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'DISCLOSURE_INTEL') {
    raw.push(suggest('COMPLIANCE_INTEL',
      'Disclosures reviewed. Proceed to Compliance Intelligence before final submission.',
      'LOW'));
  }

  if (currentModuleKey === 'COMPLIANCE_INTEL') {
    const aprSpread = f.aprSpreadFlag || f.aprFlag || false;
    const hpml      = f.hpmlFlag || f.isHPML || false;

    if (aprSpread) {
      raw.push(suggest('RATE_BUYDOWN',
        'APR spread flag detected — submission is blocked. Return to Rate Buydown to restructure rate and points.',
        'HIGH', { canSkip: false }));
    } else if (hpml) {
      raw.push(suggest('DISCLOSURE_INTEL',
        'HPML flag present. Return to Disclosure Intelligence — a revised Closing Disclosure is required.',
        'HIGH', { canSkip: false }));
    } else {
      raw.push(suggest('FLOOD_INTEL',
        'Compliance clear. Proceed to Flood Intelligence.',
        'LOW'));
    }
  }

  if (currentModuleKey === 'FLOOD_INTEL') {
    raw.push(suggest('INTELLIGENT_CHECKLIST',
      'All intelligence modules complete. Proceed to Intelligent Checklist for final submission verification.',
      'LOW'));
  }

  // ─────────────────────────────────────────────
  // Finalize: filter nulls, apply suppression, sort
  // ─────────────────────────────────────────────
  const valid = applySuppression(raw.filter(Boolean), loanPurpose);

  if (valid.length === 0) {
    return {
      primarySuggestion:    null,
      secondarySuggestions: [],
      skipReason:           'No next step identified for this module and loan purpose combination.',
      suggestedBy:          'RULES_ENGINE',
    };
  }

  valid.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);

  return {
    primarySuggestion:    valid[0],
    secondarySuggestions: valid.slice(1, 3),
    skipReason:           null,
    suggestedBy:          'RULES_ENGINE',
  };
}

// ─────────────────────────────────────────────
// HOOK — useNextStepIntelligence
// ─────────────────────────────────────────────
export function useNextStepIntelligence({
  currentModuleKey,
  loanPurpose,
  decisionRecordFindings = {},
  scenarioData = {},
  completedModules = [],
  scenarioId,
  onWriteToDecisionRecord,   // (payload) => void  — provided by useDecisionRecord integration
}) {
  const [primarySuggestion,    setPrimarySuggestion]    = useState(null);
  const [secondarySuggestions, setSecondarySuggestions] = useState([]);
  const [skipReason,           setSkipReason]           = useState(null);
  const [suggestedBy,          setSuggestedBy]          = useState('RULES_ENGINE');
  const [actionLogged,         setActionLogged]         = useState(false);
  const [actionType,           setActionType]           = useState(null); // "followed" | "overridden"

  // Stringify deps to avoid infinite loops on object identity changes
  const findingsDep  = JSON.stringify(decisionRecordFindings);
  const scenarioDep  = JSON.stringify(scenarioData);
  const completedDep = JSON.stringify(completedModules);

  useEffect(() => {
    if (!currentModuleKey || !loanPurpose) return;

    // Merge module-specific findings from the Decision Record
    const modulefindings = decisionRecordFindings?.[currentModuleKey] || {};

    const result = runRulesEngine({
      currentModuleKey,
      loanPurpose,
      findings:        modulefindings,
      scenarioData,
      completedModules,
    });

    setPrimarySuggestion(result.primarySuggestion);
    setSecondarySuggestions(result.secondarySuggestions);
    setSkipReason(result.skipReason);
    setSuggestedBy(result.suggestedBy);
    setActionLogged(false);
    setActionType(null);

    // Write suggestion event to Decision Record
    if (result.primarySuggestion && onWriteToDecisionRecord) {
      onWriteToDecisionRecord({
        type:      'nextStepSuggested',
        moduleKey: currentModuleKey,
        payload: {
          moduleKey:   result.primarySuggestion.moduleKey,
          moduleLabel: result.primarySuggestion.moduleLabel,
          reason:      result.primarySuggestion.reason,
          urgency:     result.primarySuggestion.urgency,
          loanPurpose,
          generatedAt: new Date().toISOString(),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModuleKey, loanPurpose, findingsDep, scenarioDep, completedDep]);

  // ── LO follows the suggestion ──
  const logFollow = useCallback((moduleKey) => {
    if (onWriteToDecisionRecord) {
      onWriteToDecisionRecord({
        type:      'nextStepAction',
        moduleKey: currentModuleKey,
        payload: {
          action:          'followed',
          followedModule:  moduleKey,
          overrideNote:    null,
          actionTimestamp: new Date().toISOString(),
        },
      });
    }
    setActionLogged(true);
    setActionType('followed');
  }, [currentModuleKey, onWriteToDecisionRecord]);

  // ── LO overrides the suggestion ──
  const logOverride = useCallback((moduleKey, note = null) => {
    if (onWriteToDecisionRecord) {
      onWriteToDecisionRecord({
        type:      'nextStepAction',
        moduleKey: currentModuleKey,
        payload: {
          action:          'overridden',
          overrideNote:    note || null,
          actionTimestamp: new Date().toISOString(),
        },
      });
    }
    setActionLogged(true);
    setActionType('overridden');
  }, [currentModuleKey, onWriteToDecisionRecord]);

  return {
    primarySuggestion,
    secondarySuggestions,
    skipReason,
    suggestedBy,
    actionLogged,
    actionType,
    logFollow,
    logOverride,
    MODULE_REGISTRY,
    SUPPRESSION_MAP,
  };
}
