/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/engines/LenderMatchEngine.js
 * Version: 1.0.0 — Full 7-Step Evaluation Pipeline
 * Step 4 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * This is a pure logic module — no React, no Firebase, no UI.
 * It receives a normalized scenario and lender matrices,
 * and returns a fully scored, ranked, packaged result set.
 *
 * THE 7-STEP PIPELINE (ARCHITECTURE.md):
 *   Step 1 — Normalize Scenario
 *   Step 2 — Eligibility Gating       (hard pass/fail)
 *   Step 3 — Fit Scoring              (0–100 pts)
 *   Step 4 — Overlay Risk Assessment  (LOW / MODERATE / HIGH)
 *   Step 5 — Tier Indicator           (from tierBasis — NOT pricing)
 *   Step 6 — Confidence Score         (0.0–1.0)
 *   Step 7 — Rank + Package Results
 *
 * GOVERNANCE:
 *   - Placeholder max score: 90 pts  (real lenders: 100 pts)
 *   - Placeholders excluded from COMBINED_RANKED mode
 *   - useConservativeDefaults: true throughout
 *   - AC2: Zero pricing fields anywhere in this file
 *   - AC3: guidelineVersionRef carried through to result payloads
 *   - AC5: Decision Record payload built in buildDecisionRecord()
 * ============================================================
 */

import {
  DATA_SOURCES,
  PROGRAMS,
  placeholderMeetsControlledException,
  getTierDisplayLabel,
  getEligibilityLabel,
  getEligibilityClass,
} from "../schemas/nonQMLenderSchema";

import {
  getActiveAgencyLenders,
  CONFORMING_LIMIT,
  FHA_FLOOR,
} from "../data/agencyLenderMatrix";

import {
  getActiveNonQMLenders,
  getNonQMLendersForDocType,
  mergeNonQMWithOverrides,
} from "../data/nonQMLenderMatrix";


// ─── Engine Configuration ─────────────────────────────────────────────────────
// From CONFIG.md — these are the locked v1.0 values

export const ENGINE_CONFIG = {
  resultsPresentationMode: "SEPARATE_SECTIONS",  // UI-locked for v1.0
  allowUserOverride:       true,
  maxResultsPerSection:    10,
  useConservativeDefaults: true,
};

// Supported presentation modes — all three built, UI exposes only SEPARATE_SECTIONS
export const PRESENTATION_MODES = {
  SEPARATE_SECTIONS: "SEPARATE_SECTIONS",
  FALLBACK_ONLY:     "FALLBACK_ONLY",
  COMBINED_RANKED:   "COMBINED_RANKED",
};

// Overlay risk levels
export const OVERLAY_RISK = {
  LOW:      "LOW",
  MODERATE: "MODERATE",
  HIGH:     "HIGH",
};

// Eligibility statuses
export const ELIGIBILITY_STATUS = {
  ELIGIBLE:     "ELIGIBLE",
  CONDITIONAL:  "CONDITIONAL",
  INELIGIBLE:   "INELIGIBLE",
};

// Scenario intent flags (Section 6 of Governance doc)
export const SCENARIO_INTENT = {
  AGENCY_FIRST:       "AGENCY_FIRST",
  ALTERNATIVE_FOCUS:  "ALTERNATIVE_FOCUS",
  SPEED_FOCUS:        "SPEED_FOCUS",
};

// Agency program identifiers
export const AGENCY_PROGRAMS = {
  CONVENTIONAL: "Conventional",
  FHA:          "FHA",
  VA:           "VA",
};

// Credit event types
const CREDIT_EVENTS = {
  NONE:          "none",
  BANKRUPTCY:    "BK",
  FORECLOSURE:   "FC",
  SHORT_SALE:    "shortSale",
};


// ─── STEP 1: Normalize Scenario ───────────────────────────────────────────────
/**
 * Takes raw form inputs and returns a clean, validated scenario object.
 * Applies conservative defaults for any missing or ambiguous fields.
 * Calculates derived fields: LTV (if not provided), DTI, DSCR.
 *
 * @param {object} raw  — Raw form inputs from LenderMatchForm.jsx
 * @returns {object}    — Normalized scenario
 */
export function normalizeScenario(raw = {}) {
  const cfg = ENGINE_CONFIG;

  // ── Loan identification ──────────────────────────────────────────────────
  const loanType       = raw.loanType        || null;
  const transactionType = raw.transactionType || "purchase";  // purchase | rateTerm | cashOut
  const loanAmount     = parseFloat(raw.loanAmount) || 0;
  const propertyValue  = parseFloat(raw.propertyValue) || 0;
  const intent         = raw.intent || SCENARIO_INTENT.AGENCY_FIRST;

  // ── LTV calculation ──────────────────────────────────────────────────────
  // If LTV is manually provided, use it. Otherwise calculate from loan/value.
  // Conservative default: if both inputs are missing, assume LTV = 100.
  let ltv = parseFloat(raw.ltv) || null;
  if (!ltv && loanAmount > 0 && propertyValue > 0) {
    ltv = parseFloat(((loanAmount / propertyValue) * 100).toFixed(2));
  }
  if (!ltv && cfg.useConservativeDefaults) {
    ltv = 100;  // Worst case
  }

  // ── Borrower profile ─────────────────────────────────────────────────────
  const creditScore    = parseInt(raw.creditScore) || (cfg.useConservativeDefaults ? 580 : null);
  const propertyType   = raw.propertyType   || "SFR";
  const occupancy      = raw.occupancy      || "Primary";
  const state          = raw.state          || null;
  const selfEmployed   = raw.selfEmployed   === true || raw.selfEmployed === "true";
  const incomeDocType  = raw.incomeDocType  || "fullDoc";

  // ── DTI ──────────────────────────────────────────────────────────────────
  const monthlyIncome  = parseFloat(raw.monthlyIncome) || 0;
  const monthlyDebts   = parseFloat(raw.monthlyDebts)  || 0;
  let dti = parseFloat(raw.dti) || null;
  if (!dti && monthlyIncome > 0) {
    dti = parseFloat(((monthlyDebts / monthlyIncome) * 100).toFixed(2));
  }
  if (!dti && cfg.useConservativeDefaults) {
    dti = 50;  // Conservative default: assume high DTI
  }

  // ── DSCR ─────────────────────────────────────────────────────────────────
  const grossRentalIncome = parseFloat(raw.grossRentalIncome) || 0;
  let dscr = parseFloat(raw.dscr) || null;
  if (!dscr && grossRentalIncome > 0 && loanAmount > 0) {
    // Rough DSCR estimate: gross rent / estimated PITIA
    // PITIA estimation: 0.6% of loan amount per month (conservative)
    const estimatedPITIA = loanAmount * 0.006;
    dscr = parseFloat((grossRentalIncome / estimatedPITIA).toFixed(2));
  }

  // ── Credit events ────────────────────────────────────────────────────────
  const creditEvent        = raw.creditEvent        || CREDIT_EVENTS.NONE;
  const creditEventMonths  = parseInt(raw.creditEventMonths) || 0;

  // ── Reserves ─────────────────────────────────────────────────────────────
  const reservesMonths = parseFloat(raw.reservesMonths) || 0;

  // ── Asset depletion ──────────────────────────────────────────────────────
  const totalAssets = parseFloat(raw.totalAssets) || 0;

  // ── VA-specific ──────────────────────────────────────────────────────────
  const vaEntitlement = raw.vaEntitlement || "Full";  // Full | Reduced | None

  // ── Completeness score (used by confidence calculator in Step 6) ─────────
  const REQUIRED_FIELDS = [
    "creditScore", "ltv", "loanAmount", "propertyType",
    "occupancy", "incomeDocType", "state",
  ];
  const PROGRAM_FIELDS = {
    dscr:           ["dscr"],
    assetDepletion: ["totalAssets"],
    bankStatement12: [],
    bankStatement24: [],
  };
  const programSpecificRequired = PROGRAM_FIELDS[incomeDocType] || [];
  const allRequired = [...REQUIRED_FIELDS, ...programSpecificRequired];

  const providedFields = allRequired.filter((field) => {
    const val = raw[field];
    return val !== null && val !== undefined && val !== "" && val !== 0;
  });
  const completenessScore = allRequired.length > 0
    ? providedFields.length / allRequired.length
    : 1.0;

  return {
    // Identification
    loanType,
    transactionType,
    loanAmount,
    propertyValue,
    intent,

    // Borrower
    creditScore,
    ltv,
    dti,
    dscr,
    propertyType,
    occupancy,
    state,
    selfEmployed,
    incomeDocType,

    // Credit events
    creditEvent,
    creditEventMonths,

    // Reserves & assets
    reservesMonths,
    totalAssets,

    // VA
    vaEntitlement,

    // Computed metadata
    completenessScore,
    isNonQMPath: incomeDocType !== "fullDoc",

    // Flags
    highBalance: loanAmount > CONFORMING_LIMIT,
    pmiRequired: ltv > 80 && (loanType === "Conventional" || !loanType),
  };
}


// ─── STEP 2A: Agency Eligibility Gating ──────────────────────────────────────
/**
 * Runs the 10-gate hard eligibility check for a single Agency lender + program.
 * One failure = INELIGIBLE. Returns { eligible, reasons, failReason }.
 *
 * @param {object} lender   — Agency lender record
 * @param {string} program  — "Conventional" | "FHA" | "VA"
 * @param {object} scenario — Normalized scenario from Step 1
 * @returns {object}        — { eligible: boolean, reasons: string[], failReason: string|null }
 */
export function checkAgencyEligibility(lender, program, scenario) {
  const g = lender.guidelines[program];
  if (!g) {
    return { eligible: false, failReason: `Lender does not offer ${program}`, reasons: [] };
  }

  const {
    loanAmount, creditScore, ltv, dti, propertyType, occupancy,
    state, creditEvent, creditEventMonths, transactionType, incomeDocType,
    vaEntitlement,
  } = scenario;

  const reasons = [];

  // Gate 1 — Program offered
  if (!lender.programs.includes(program)) {
    return { eligible: false, failReason: `${lender.shortName} does not offer ${program}`, reasons };
  }

  // Gate 2 — Loan amount
  if (loanAmount > g.maxLoanAmount) {
    return {
      eligible: false,
      failReason: `Loan amount $${loanAmount.toLocaleString()} exceeds ${lender.shortName} ` +
                  `${program} limit of $${g.maxLoanAmount.toLocaleString()}`,
      reasons,
    };
  }

  // Gate 3 — FICO minimum
  if (creditScore < g.minFICO) {
    return {
      eligible: false,
      failReason: `FICO ${creditScore} is below ${lender.shortName} minimum of ${g.minFICO} for ${program}`,
      reasons,
    };
  }

  // Gate 3b — FHA reduced LTV for FICO 500–579
  if (program === AGENCY_PROGRAMS.FHA && creditScore < g.ficoCutoffForReducedLTV) {
    const reducedMax = g.reducedLTVBelowCutoff || 90;
    if (ltv > reducedMax) {
      return {
        eligible: false,
        failReason: `FHA requires FICO ${g.ficoCutoffForReducedLTV}+ for ${ltv}% LTV. ` +
                    `With FICO ${creditScore}, maximum LTV is ${reducedMax}%.`,
        reasons,
      };
    }
  }

  // Gate 4 — LTV maximum by transaction type
  const ltvMap = { purchase: "purchase", "rate-term": "rateTerm", cashout: "cashOut" };
  const ltvKey = ltvMap[transactionType] || "purchase";
  const maxLTV = g.maxLTV?.[ltvKey] ?? g.maxLTV?.purchase;
  if (maxLTV && ltv > maxLTV) {
    return {
      eligible: false,
      failReason: `LTV ${ltv}% exceeds ${lender.shortName} ${program} ` +
                  `${transactionType} maximum of ${maxLTV}%`,
      reasons,
    };
  }

  // Gate 5 — DTI maximum
  if (dti > g.maxDTI) {
    return {
      eligible: false,
      failReason: `DTI ${dti}% exceeds ${lender.shortName} ${program} maximum of ${g.maxDTI}%`,
      reasons,
    };
  }

  // Gate 6 — Property type
  const propertyFails = checkAgencyPropertyType(g, propertyType, program);
  if (propertyFails) {
    return { eligible: false, failReason: propertyFails, reasons };
  }

  // Gate 7 — Occupancy / investment restrictions
  const occupancyFail = checkAgencyOccupancy(g, lender, occupancy, ltv, transactionType, program);
  if (occupancyFail) {
    return { eligible: false, failReason: occupancyFail, reasons };
  }

  // Gate 8 — State licensing
  if (lender.states && !lender.states.includes("ALL") && state) {
    if (!lender.states.includes(state)) {
      return {
        eligible: false,
        failReason: `${lender.shortName} is not licensed in ${state}`,
        reasons,
      };
    }
  }

  // Gate 9 — Credit event seasoning
  const seasoningFail = checkSeasoning(g, creditEvent, creditEventMonths, lender.shortName, program);
  if (seasoningFail) {
    return { eligible: false, failReason: seasoningFail, reasons };
  }

  // Gate 10 — Income documentation type
  if (g.incomeTypes && !g.incomeTypes.includes(incomeDocType) && incomeDocType !== "fullDoc") {
    return {
      eligible: false,
      failReason: `${lender.shortName} ${program} requires full documentation. ` +
                  `Selected: ${incomeDocType}`,
      reasons,
    };
  }

  // VA-specific: primary residence requirement
  if (program === AGENCY_PROGRAMS.VA && g.requiresPrimaryResidence && occupancy !== "Primary") {
    return {
      eligible: false,
      failReason: "VA loans require primary residence occupancy",
      reasons,
    };
  }

  // All gates passed — build passing reasons
  reasons.push(`FICO ${creditScore} meets ${lender.shortName} minimum (${g.minFICO})`);
  reasons.push(`LTV ${ltv}% within ${lender.shortName} ceiling (${maxLTV}%)`);
  reasons.push(`DTI ${dti}% within ${lender.shortName} limit (${g.maxDTI}%)`);
  if (creditEvent !== CREDIT_EVENTS.NONE) {
    reasons.push(`${creditEvent} seasoning satisfied (${creditEventMonths} mo provided)`);
  }

  return { eligible: true, failReason: null, reasons };
}

// Agency property type check helper
function checkAgencyPropertyType(g, propertyType, program) {
  if (propertyType === "Manufactured" && g.allowsManufactured === false) {
    return `Manufactured housing not accepted for ${program}`;
  }
  if (propertyType === "Condo_NonWarrantable" && !g.allowsNonWarrantableCondo) {
    return `Non-warrantable condos not accepted for ${program}`;
  }
  if (["TwoUnit", "ThreeUnit", "FourUnit"].includes(propertyType) && !g.allows2to4Unit) {
    return `2–4 unit properties not accepted for ${program}`;
  }
  return null;
}

// Agency occupancy check helper
function checkAgencyOccupancy(g, lender, occupancy, ltv, transactionType, program) {
  if (occupancy === "Investment" && !g.allowsInvestment) {
    return `${lender.shortName} ${program} does not allow investment properties`;
  }
  if (occupancy === "Investment" && g.allowsInvestment && g.investmentMaxLTV) {
    const ltvKey = transactionType === "cashOut" ? "cashOut"
                 : transactionType === "rateTerm" ? "rateTerm"
                 : "purchase";
    const invMax = g.investmentMaxLTV[ltvKey];
    if (invMax && ltv > invMax) {
      return `Investment property LTV ${ltv}% exceeds ${lender.shortName} ` +
             `investment ${transactionType} limit of ${invMax}%`;
    }
  }
  return null;
}

// Shared seasoning check helper (used by both Agency and Non-QM)
function checkSeasoning(g, creditEvent, creditEventMonths, lenderName, program) {
  if (!creditEvent || creditEvent === CREDIT_EVENTS.NONE) return null;

  let required = 0;
  let label    = "";

  if (creditEvent === CREDIT_EVENTS.BANKRUPTCY) {
    required = g.bkSeasoning   || 0;
    label    = "BK";
  } else if (creditEvent === CREDIT_EVENTS.FORECLOSURE) {
    required = g.fcSeasoning   || 0;
    label    = "Foreclosure";
  } else if (creditEvent === CREDIT_EVENTS.SHORT_SALE) {
    required = g.shortSaleSeasoning || g.fcSeasoning || 0;
    label    = "Short Sale";
  }

  if (creditEventMonths < required) {
    return `${label} seasoning: ${creditEventMonths} months provided, ` +
           `${required} months required by ${lenderName} for ${program}`;
  }
  return null;
}


// ─── STEP 2B: Non-QM Eligibility Gating ──────────────────────────────────────
/**
 * Runs the 10-gate hard eligibility check for a single Non-QM lender + program.
 *
 * @param {object} lender   — Non-QM lender record
 * @param {string} program  — Program key (BankStatement12, DSCR, AssetDepletion, etc.)
 * @param {object} scenario — Normalized scenario
 * @returns {object}        — { eligible, failReason, reasons, seasoningViolation, conditionalFlags }
 */
export function checkNonQMEligibility(lender, program, scenario) {
  const g = lender.guidelines[program];
  if (!g) {
    return {
      eligible: false,
      failReason: `Lender does not offer ${program}`,
      reasons: [],
      seasoningViolation: false,
      conditionalFlags: [],
    };
  }

  const {
    creditScore, ltv, loanAmount, propertyType, occupancy,
    state, creditEvent, creditEventMonths, transactionType,
    dscr, totalAssets, reservesMonths,
  } = scenario;

  const reasons          = [];
  const conditionalFlags = [];
  let   seasoningViolation = false;

  // Occupancy key mapping for LTV lookup
  const occupancyKey = occupancy === "Primary"    ? "primary"
                     : occupancy === "SecondHome"  ? "secondHome"
                     : "investment";

  const txKey = transactionType === "cashOut" ? "cashOut"
              : transactionType === "rateTerm" ? "rateTerm"
              : "purchase";

  // Gate 1 — Program offered
  if (!lender.programs.includes(program)) {
    return {
      eligible: false,
      failReason: `${lender.shortName} does not offer ${program}`,
      reasons, seasoningViolation, conditionalFlags,
    };
  }

  // Gate 2 — FICO minimum
  if (creditScore < g.minFICO) {
    return {
      eligible: false,
      failReason: `FICO ${creditScore} below ${lender.shortName} ${program} ` +
                  `minimum of ${g.minFICO}`,
      reasons, seasoningViolation, conditionalFlags,
    };
  }

  // Gate 3 — Loan amount
  if (loanAmount > g.maxLoanAmount) {
    return {
      eligible: false,
      failReason: `Loan amount $${loanAmount.toLocaleString()} exceeds ${lender.shortName} ` +
                  `${program} limit of $${g.maxLoanAmount.toLocaleString()}`,
      reasons, seasoningViolation, conditionalFlags,
    };
  }

  // Gate 4 — LTV by occupancy + transaction type
  const ltvBlock = g.maxLTV?.[occupancyKey];
  if (!ltvBlock) {
    return {
      eligible: false,
      failReason: `${lender.shortName} ${program} does not allow ${occupancy} occupancy`,
      reasons, seasoningViolation, conditionalFlags,
    };
  }
  const maxLTV = ltvBlock[txKey] ?? ltvBlock.purchase;
  if (ltv > maxLTV) {
    return {
      eligible: false,
      failReason: `LTV ${ltv}% exceeds ${lender.shortName} ${program} ` +
                  `${occupancy} ${transactionType} limit of ${maxLTV}%`,
      reasons, seasoningViolation, conditionalFlags,
    };
  }

  // Gate 5 — Property type
  if (g.allowedPropertyTypes && !g.allowedPropertyTypes.includes(propertyType)) {
    // Handle "ALL" shorthand
    if (g.allowedPropertyTypes[0] !== "ALL") {
      return {
        eligible: false,
        failReason: `${lender.shortName} ${program} does not allow ${propertyType}`,
        reasons, seasoningViolation, conditionalFlags,
      };
    }
  }

  // Gate 6 — Occupancy restriction (some Non-QM programs investment-only)
  if (program === PROGRAMS.DSCR && occupancy === "Primary") {
    return {
      eligible: false,
      failReason: "DSCR programs are for investment properties only",
      reasons, seasoningViolation, conditionalFlags,
    };
  }

  // Gate 7 — DSCR minimum (DSCR program only)
  if (program === PROGRAMS.DSCR) {
    if (dscr === null || dscr === undefined) {
      return {
        eligible: false,
        failReason: "DSCR ratio is required for DSCR programs. Enter gross rent and property details.",
        reasons, seasoningViolation, conditionalFlags,
      };
    }
    if (dscr < g.minDSCR) {
      return {
        eligible: false,
        failReason: `DSCR ${dscr.toFixed(2)} is below ${lender.shortName} minimum of ${g.minDSCR}`,
        reasons, seasoningViolation, conditionalFlags,
      };
    }
  }

  // Gate 8 — Asset minimum (Asset Depletion program only)
  if (program === PROGRAMS.ASSET_DEPLETION) {
    if (!totalAssets || totalAssets < g.minAssets) {
      return {
        eligible: false,
        failReason: `Documented assets $${(totalAssets || 0).toLocaleString()} below ` +
                    `${lender.shortName} minimum of $${g.minAssets.toLocaleString()}`,
        reasons, seasoningViolation, conditionalFlags,
      };
    }
  }

  // Gate 9 — Credit event seasoning
  const seasoningFail = checkSeasoning(g, creditEvent, creditEventMonths, lender.shortName, program);
  if (seasoningFail) {
    seasoningViolation = true;
    return {
      eligible: false,
      failReason: seasoningFail,
      reasons, seasoningViolation, conditionalFlags,
    };
  }

  // Gate 10 — State licensing
  if (lender.states && !lender.states.includes("ALL") && state) {
    if (!lender.states.includes(state)) {
      return {
        eligible: false,
        failReason: `${lender.shortName} is not licensed in ${state}`,
        reasons, seasoningViolation, conditionalFlags,
      };
    }
  }

  // Short-term rental check (non-blocking — adds conditional flag)
  if (scenario.isShortTermRental && !g.allowsShortTermRental) {
    conditionalFlags.push("SHORT_TERM_RENTAL_NOT_ACCEPTED");
  }

  // Reserve check (non-blocking — adds conditional flag)
  if (g.minReserveMonths && reservesMonths < g.minReserveMonths) {
    conditionalFlags.push(`RESERVES_BELOW_MINIMUM_${g.minReserveMonths}MO`);
  }

  // Cash-out cap check (non-blocking — adds conditional flag for BS programs)
  if (transactionType === "cashOut" && g.cashOutMax) {
    const cashOutAmount = loanAmount - (scenario.propertyValue * (1 - ltv / 100));
    if (cashOutAmount > g.cashOutMax) {
      conditionalFlags.push(`CASH_OUT_MAY_EXCEED_CAP_${g.cashOutMax.toLocaleString()}`);
    }
  }

  // All gates passed
  reasons.push(`FICO ${creditScore} meets minimum (${g.minFICO}) — ${creditScore - g.minFICO}pt cushion`);
  reasons.push(`LTV ${ltv}% within ${occupancy} ${transactionType} limit (${maxLTV}%)`);
  if (program === PROGRAMS.DSCR && dscr) {
    reasons.push(`DSCR ${dscr.toFixed(2)} meets minimum (${g.minDSCR})`);
  }
  if (program === PROGRAMS.ASSET_DEPLETION) {
    const monthlyQualIncome = Math.floor(totalAssets / g.depletionMonths);
    reasons.push(
      `$${totalAssets.toLocaleString()} assets ÷ ${g.depletionMonths}mo = ` +
      `$${monthlyQualIncome.toLocaleString()}/mo qualifying income`
    );
  }

  return {
    eligible: true,
    failReason: null,
    reasons,
    seasoningViolation: false,
    conditionalFlags,
  };
}


// ─── STEP 3A: Agency Fit Scoring (0–100 pts) ─────────────────────────────────
/**
 * Scores an eligible Agency lender on a 100-point scale.
 * Higher score = better fit for this scenario.
 *
 * Scoring weights (from PRD Section 9):
 *   FICO Cushion:    25 pts
 *   LTV Cushion:     20 pts
 *   DTI Cushion:     20 pts
 *   Program Strength: 20 pts
 *   Priority Weight:  15 pts
 *   TOTAL MAX:       100 pts
 */
export function scoreAgencyLender(lender, program, scenario) {
  const g = lender.guidelines[program];
  const { creditScore, ltv, dti, transactionType } = scenario;

  const txKey  = transactionType === "cashOut" ? "cashOut"
               : transactionType === "rateTerm" ? "rateTerm"
               : "purchase";
  const maxLTV = g.maxLTV?.[txKey] ?? g.maxLTV?.purchase ?? 97;

  let score = 0;
  const breakdown = {};

  // ── FICO Cushion (25 pts) ────────────────────────────────────────────────
  // Score increases as borrower FICO rises above lender minimum
  // Max points at 200+ pt cushion; diminishing returns curve
  const ficoCushion = creditScore - g.minFICO;
  const ficoScore   = Math.min(25, Math.round((ficoCushion / 200) * 25));
  score += ficoScore;
  breakdown.ficoScore = ficoScore;
  breakdown.ficoCushion = ficoCushion;

  // ── LTV Cushion (20 pts) ─────────────────────────────────────────────────
  // Score increases as borrower LTV drops below lender maximum
  const ltvCushion = maxLTV - ltv;
  const ltvScore   = Math.min(20, Math.round((ltvCushion / 30) * 20));
  score += Math.max(0, ltvScore);
  breakdown.ltvScore = Math.max(0, ltvScore);
  breakdown.ltvCushion = ltvCushion;

  // ── DTI Cushion (20 pts) ─────────────────────────────────────────────────
  const dtiCushion = g.maxDTI - dti;
  const dtiScore   = Math.min(20, Math.round((dtiCushion / 20) * 20));
  score += Math.max(0, dtiScore);
  breakdown.dtiScore = Math.max(0, dtiScore);
  breakdown.dtiCushion = dtiCushion;

  // ── Program Strength (20 pts) ────────────────────────────────────────────
  // Derived from tier — reflects lender's known strength for this program
  const programStrengthScore = getProgramStrengthScore(lender, program);
  score += programStrengthScore;
  breakdown.programStrengthScore = programStrengthScore;

  // ── Priority Weight (15 pts) ─────────────────────────────────────────────
  const priorityScore = Math.round((lender.priorityWeight / 100) * 15);
  score += priorityScore;
  breakdown.priorityScore = priorityScore;

  return {
    fitScore: Math.min(100, Math.max(0, score)),
    breakdown,
    maxPossible: 100,
  };
}

// Program strength mapping from tier
function getProgramStrengthScore(lender, program) {
  const tierToScore = { "A+": 20, "A": 16, "B+": 12, "B": 8, "C": 4 };
  const base = tierToScore[lender.tier] ?? 10;

  // Bonus for known program specialization (from lender strengths)
  const strengthText = (lender.strengths || []).join(" ").toLowerCase();
  const progLower    = program.toLowerCase();
  const specialBonus = strengthText.includes(progLower) ? 2 : 0;

  return Math.min(20, base + specialBonus);
}


// ─── STEP 3B: Non-QM Fit Scoring (0–90 pts placeholder / 0–100 pts real) ─────
/**
 * Scores an eligible Non-QM lender.
 *
 * Scoring weights (from PRD Section 10 + Governance Section 5.2):
 *   Program Match Quality:  30 pts  (identical placeholder/real)
 *   FICO Cushion:           20 pts  (identical)
 *   LTV Cushion:            25 pts  (identical)
 *   Profile Strength:       10 pts  (placeholder) / 15 pts (real)
 *   Priority Weight:         5 pts  (placeholder) / 10 pts (real)
 *   TOTAL MAX:              90 pts  (placeholder) / 100 pts (real)
 */
export function scoreNonQMLender(lender, program, scenario) {
  const g = lender.guidelines[program];
  const { creditScore, ltv, dscr, totalAssets, occupancy, transactionType } = scenario;
  const isPlaceholder = lender.dataSource === DATA_SOURCES.PLACEHOLDER;

  const occupancyKey = occupancy === "Primary"   ? "primary"
                     : occupancy === "SecondHome" ? "secondHome"
                     : "investment";
  const txKey = transactionType === "cashOut" ? "cashOut"
              : transactionType === "rateTerm" ? "rateTerm"
              : "purchase";
  const ltvBlock  = g.maxLTV?.[occupancyKey] ?? g.maxLTV?.investment ?? {};
  const maxLTV    = ltvBlock[txKey] ?? ltvBlock.purchase ?? 80;

  // Weight caps based on dataSource
  const profileStrengthMax = isPlaceholder ? 10 : 15;
  const priorityWeightMax  = isPlaceholder ?  5 : 10;
  const totalMax           = isPlaceholder ? 90 : 100;

  let score = 0;
  const breakdown = {};

  // ── Program Match Quality (30 pts) ───────────────────────────────────────
  // How well does this lender's specialty align with the exact program needed?
  const pmqScore = scoreNonQMProgramMatch(lender, program);
  score += pmqScore;
  breakdown.programMatchScore = pmqScore;

  // ── FICO Cushion (20 pts) ────────────────────────────────────────────────
  const ficoCushion = creditScore - g.minFICO;
  const ficoScore   = Math.min(20, Math.round((ficoCushion / 150) * 20));
  score += Math.max(0, ficoScore);
  breakdown.ficoScore = Math.max(0, ficoScore);
  breakdown.ficoCushion = ficoCushion;

  // ── LTV Cushion (25 pts) — weighted higher than Agency ───────────────────
  const ltvCushion = maxLTV - ltv;
  const ltvScore   = Math.min(25, Math.round((ltvCushion / 25) * 25));
  score += Math.max(0, ltvScore);
  breakdown.ltvScore = Math.max(0, ltvScore);
  breakdown.ltvCushion = ltvCushion;
  breakdown.applicableMaxLTV = maxLTV;

  // ── Profile Strength (10 pts placeholder / 15 pts real) ──────────────────
  const strengthScore = scoreNonQMProfileStrength(lender, program, isPlaceholder);
  score += strengthScore;
  breakdown.profileStrengthScore = strengthScore;

  // ── Priority Weight (5 pts placeholder / 10 pts real) ────────────────────
  const priorityScore = Math.round((lender.priorityWeight / 100) * priorityWeightMax);
  score += priorityScore;
  breakdown.priorityScore = priorityScore;

  // ── DSCR bonus (if DSCR program, extra cushion above minDSCR) ────────────
  if (program === PROGRAMS.DSCR && dscr && g.minDSCR) {
    const dscrCushion = dscr - g.minDSCR;
    const dscrBonus   = dscrCushion >= 0.25 ? 3 : dscrCushion >= 0.10 ? 1 : 0;
    score = Math.min(totalMax, score + dscrBonus);
    breakdown.dscrBonus = dscrBonus;
  }

  // ── Asset Depletion bonus (if assets significantly exceed minimum) ────────
  if (program === PROGRAMS.ASSET_DEPLETION && totalAssets && g.minAssets) {
    const assetRatio = totalAssets / g.minAssets;
    const assetBonus = assetRatio >= 3 ? 3 : assetRatio >= 2 ? 2 : 0;
    score = Math.min(totalMax, score + assetBonus);
    breakdown.assetBonus = assetBonus;
  }

  return {
    fitScore:     Math.min(totalMax, Math.max(0, score)),
    breakdown,
    maxPossible:  totalMax,
    isPlaceholder,
  };
}

function scoreNonQMProgramMatch(lender, program) {
  // tierBasis tells us how aggressive the profile is — more aggressive = better match
  // for scenarios that need flexibility (which is why they're in Non-QM)
  const tierBasisScore = {
    "Aggressive":   30,
    "Market":       22,
    "Conservative": 15,
  };
  return tierBasisScore[lender.tierBasis] ?? 15;
}

function scoreNonQMProfileStrength(lender, program, isPlaceholder) {
  const max = isPlaceholder ? 10 : 15;
  // Real lenders: full strength from verified reputation
  // Placeholders: reduced strength (unknown real-world performance)
  const tierStrength = {
    "Aggressive":   isPlaceholder ? 10 : 14,
    "Market":       isPlaceholder ?  7 : 10,
    "Conservative": isPlaceholder ?  5 :  7,
  };
  return Math.min(max, tierStrength[lender.tierBasis] ?? 7);
}


// ─── STEP 4: Overlay Risk Assessment ─────────────────────────────────────────
/**
 * Evaluates stacked risk factors across the scenario.
 * Multiple compounding risk signals increase the overlay risk level.
 *
 * Returns: { level: "LOW"|"MODERATE"|"HIGH", signals: string[], signalCount: number }
 */
export function assessOverlayRisk(scenario) {
  const {
    creditScore, ltv, dti, creditEvent, creditEventMonths,
    occupancy, selfEmployed, propertyType, incomeDocType, loanAmount,
  } = scenario;

  const signals = [];

  // ── FICO signals ──────────────────────────────────────────────────────────
  if (creditScore < 620) {
    signals.push({ label: "FICO below 620", weight: 2 });
  } else if (creditScore < 660) {
    signals.push({ label: "FICO below 660", weight: 1 });
  }

  // ── LTV signals ───────────────────────────────────────────────────────────
  if (ltv > 95) {
    signals.push({ label: "LTV above 95%", weight: 2 });
  } else if (ltv > 90) {
    signals.push({ label: "LTV above 90%", weight: 1 });
  }

  // ── DTI signals ───────────────────────────────────────────────────────────
  if (dti > 50) {
    signals.push({ label: "DTI above 50%", weight: 2 });
  } else if (dti > 43) {
    signals.push({ label: "DTI above 43%", weight: 1 });
  }

  // ── Credit event signals ──────────────────────────────────────────────────
  if (creditEvent && creditEvent !== CREDIT_EVENTS.NONE) {
    const recentThreshold = creditEvent === CREDIT_EVENTS.BANKRUPTCY ? 48 : 84;
    if (creditEventMonths < recentThreshold) {
      signals.push({ label: `Recent ${creditEvent} (${creditEventMonths} mo)`, weight: 2 });
    }
  }

  // ── Self-employed signal ──────────────────────────────────────────────────
  if (selfEmployed) {
    signals.push({ label: "Self-employed borrower", weight: 1 });
  }

  // ── Non-QM income signal ─────────────────────────────────────────────────
  if (incomeDocType !== "fullDoc") {
    signals.push({ label: `Non-standard income documentation (${incomeDocType})`, weight: 1 });
  }

  // ── Investment property signal ────────────────────────────────────────────
  if (occupancy === "Investment") {
    signals.push({ label: "Investment property", weight: 1 });
  }

  // ── Loan amount signal ────────────────────────────────────────────────────
  if (loanAmount > CONFORMING_LIMIT) {
    signals.push({ label: "Loan exceeds conforming limit", weight: 1 });
  }

  // ── Compound multiplier: Non-QM + any high-weight signal ─────────────────
  const highWeightCount = signals.filter((s) => s.weight >= 2).length;
  const totalWeight     = signals.reduce((sum, s) => sum + s.weight, 0);

  // Determine risk level
  let level;
  if (totalWeight === 0) {
    level = OVERLAY_RISK.LOW;
  } else if (totalWeight <= 2 && highWeightCount === 0) {
    level = OVERLAY_RISK.LOW;
  } else if (totalWeight <= 4 && highWeightCount <= 1) {
    level = OVERLAY_RISK.MODERATE;
  } else {
    level = OVERLAY_RISK.HIGH;
  }

  return {
    level,
    signals: signals.map((s) => s.label),
    signalCount: signals.length,
    totalWeight,
    highWeightCount,
  };
}


// ─── STEP 5: Tier Indicator ───────────────────────────────────────────────────
/**
 * Returns the UI-safe tier display for a lender result.
 * For Agency: reads lender.tier (A+/A/B/C) mapped to display label.
 * For Non-QM: reads lender.tierBasis (Aggressive/Market/Conservative).
 * NEVER returns pricing language. (AC2)
 *
 * @param {object} lender   — Agency or Non-QM lender record
 * @param {string} universe — "Agency" | "NonQM"
 * @returns {object}        — { display: string, basis: string }
 */
export function getTierIndicator(lender, universe = "Agency") {
  if (universe === "NonQM") {
    return {
      display: getTierDisplayLabel(lender),   // from nonQMLenderSchema
      basis:   lender.tierBasis,
    };
  }

  // Agency tier → display label (no pricing)
  const agencyTierDisplay = {
    "A+": "Premier Platform",
    "A":  "Solid Platform",
    "B+": "Good Platform",
    "B":  "Standard Platform",
    "C":  "Specialty Platform",
  };

  return {
    display: agencyTierDisplay[lender.tier] ?? "Verified Lender",
    basis:   lender.tier,
  };
}


// ─── STEP 6: Confidence Score ─────────────────────────────────────────────────
/**
 * Calculates how confident the engine is in this result set.
 * Based on two factors (50% each):
 *   1. Input data completeness (from normalizeScenario)
 *   2. Guideline currency (how recent is the data)
 *
 * Returns: { score: 0.0–1.0, level: "HIGH"|"MODERATE"|"LOW", message: string }
 */
export function calculateConfidenceScore(scenario, options = {}) {
  const { firestoreAvailable = true, guidelineAgesDays = {} } = options;

  // Factor 1: Data completeness (50% of confidence)
  const completeness = scenario.completenessScore ?? 1.0;
  const completenessWeight = completeness * 0.50;

  // Factor 2: Guideline currency (50% of confidence)
  // guidelineAgesDays: { "UWM-AGENCY-2026-Q1": 45, "PLACEHOLDER-v0": 0 }
  // Guideline ages: 0–30 days = full score, 31–90 days = partial, 90+ = reduced
  let currencyScore = 1.0;

  if (!firestoreAvailable) {
    currencyScore = 0.70;  // Firebase offline — static data only
  } else if (Object.keys(guidelineAgesDays).length > 0) {
    const ages    = Object.values(guidelineAgesDays);
    const maxAge  = Math.max(...ages);
    currencyScore = maxAge <= 30  ? 1.0
                  : maxAge <= 90  ? 0.85
                  : maxAge <= 180 ? 0.70
                  : 0.55;
  }

  // Placeholder penalty: results with any placeholder data get a currency penalty
  if (scenario.hasPlaceholderResults) {
    currencyScore = Math.min(currencyScore, 0.75);
  }

  const currencyWeight = currencyScore * 0.50;
  const total = Math.round((completenessWeight + currencyWeight) * 100) / 100;

  // Level classification
  const level   = total >= 0.85 ? "HIGH"
                : total >= 0.60 ? "MODERATE"
                : "LOW";

  // Human-readable message
  const messages = {
    HIGH:     "All inputs provided. Guidelines current.",
    MODERATE: "Some inputs estimated or guidelines may need verification.",
    LOW:      "Significant inputs missing or guideline data may be outdated. Verify with lender.",
  };

  return { score: total, level, message: messages[level] };
}


// ─── STEP 7: Rank + Package Results ──────────────────────────────────────────
/**
 * Sorts eligible lenders by fitScore (descending), applies intent adjustments,
 * and packages the full result payload for the UI.
 *
 * @param {Array}  agencyResults  — Array of agency eval objects
 * @param {Array}  nonQMResults   — Array of Non-QM eval objects
 * @param {object} scenario       — Normalized scenario
 * @param {object} overlayRisk    — Result from assessOverlayRisk
 * @param {object} confidence     — Result from calculateConfidenceScore
 * @param {string} mode           — Presentation mode
 * @returns {object}              — Complete packaged result for UI
 */
export function rankAndPackageResults(
  agencyResults,
  nonQMResults,
  scenario,
  overlayRisk,
  confidence,
  mode = PRESENTATION_MODES.SEPARATE_SECTIONS
) {
  const { intent = SCENARIO_INTENT.AGENCY_FIRST } = scenario;

  // Split eligible from ineligible
  const agencyEligible   = agencyResults.filter((r) => r.eligible);
  const agencyIneligible = agencyResults.filter((r) => !r.eligible);
  const nonQMEligible    = nonQMResults.filter((r) => r.eligible);
  const nonQMIneligible  = nonQMResults.filter((r) => !r.eligible);

  // Sort eligible lenders — base: fitScore descending
  const sortByScore = (a, b) => b.fitScore - a.fitScore;
  agencyEligible.sort(sortByScore);
  nonQMEligible.sort(sortByScore);

  // Intent: ALTERNATIVE_FOCUS — promote Non-QM section visually
  // Intent: SPEED_FOCUS — boost lenders with strong speed indicators
  if (intent === SCENARIO_INTENT.ALTERNATIVE_FOCUS) {
    // Non-QM section becomes the primary recommendation
    // (handled in UI — engine just flags it)
  }

  // Cap results per section
  const cap = ENGINE_CONFIG.maxResultsPerSection;
  const agencyDisplay   = agencyEligible.slice(0, cap);
  const nonQMDisplay    = nonQMEligible.slice(0, cap);

  // Build section-level summaries
  const agencySection = buildSectionSummary(
    "Agency",
    agencyDisplay,
    agencyIneligible,
    agencyEligible.length,
    scenario,
    overlayRisk
  );

  const nonQMSection = buildNonQMSectionSummary(
    nonQMDisplay,
    nonQMIneligible,
    nonQMEligible.length,
    scenario,
    agencyEligible.length === 0,
    overlayRisk
  );

  // Combined mode: merge Agency + real Non-QM only (placeholders excluded)
  let combinedSection = null;
  if (mode === PRESENTATION_MODES.COMBINED_RANKED) {
    const combinedEligible = [
      ...agencyEligible,
      ...nonQMEligible.filter((r) => r.dataSource !== DATA_SOURCES.PLACEHOLDER),
    ].sort(sortByScore).slice(0, cap);
    combinedSection = { results: combinedEligible };
  }

  // Fallback mode: Non-QM section only if Agency has 0 eligible
  if (mode === PRESENTATION_MODES.FALLBACK_ONLY && agencyEligible.length > 0) {
    nonQMSection.visible = false;
  }

  return {
    mode,
    intent,
    scenarioSummary: buildScenarioSummary(scenario),
    confidence,
    overlayRisk,
    agencySection,
    nonQMSection,
    combinedSection,
    hasPlaceholderResults: nonQMEligible.some(
      (r) => r.dataSource === DATA_SOURCES.PLACEHOLDER
    ),
    totalEligible: agencyEligible.length + nonQMEligible.length,
    timestamp: new Date().toISOString(),
  };
}

function buildSectionSummary(type, eligible, ineligible, totalEligible, scenario, overlayRisk) {
  const noMatch = totalEligible === 0;

  let noMatchMessage = null;
  if (noMatch) {
    noMatchMessage = buildNoAgencyMatchMessage(scenario);
  }

  return {
    type,
    eligible,
    ineligible,
    totalEligible,
    totalIneligible: ineligible.length,
    noMatch,
    noMatchMessage,
    visible: true,
  };
}

function buildNonQMSectionSummary(eligible, ineligible, totalEligible, scenario, isHero, overlayRisk) {
  const noMatch = totalEligible === 0;
  const hasPlaceholders = eligible.some((r) => r.dataSource === DATA_SOURCES.PLACEHOLDER);

  return {
    type:             "NonQM",
    eligible,
    ineligible,
    totalEligible,
    totalIneligible:  ineligible.length,
    noMatch,
    noMatchMessage:   noMatch ? buildNoNonQMMatchMessage(scenario) : null,
    isHero,            // true when Agency has 0 results — Non-QM is the primary path
    hasPlaceholders,
    showPlaceholderWarning: hasPlaceholders,
    visible:           true,
  };
}

function buildScenarioSummary(scenario) {
  const parts = [];
  if (scenario.loanType) parts.push(scenario.loanType);
  if (scenario.transactionType) parts.push(formatTxType(scenario.transactionType));
  if (scenario.loanAmount) parts.push(`$${scenario.loanAmount.toLocaleString()}`);
  if (scenario.creditScore) parts.push(`${scenario.creditScore} FICO`);
  if (scenario.ltv) parts.push(`${scenario.ltv}% LTV`);
  if (scenario.propertyType) parts.push(scenario.propertyType);
  if (scenario.occupancy) parts.push(scenario.occupancy);
  if (scenario.state) parts.push(scenario.state);
  return parts.join(" | ");
}

function formatTxType(tx) {
  return tx === "rateTerm" ? "Rate/Term Refi"
       : tx === "cashOut"  ? "Cash-Out Refi"
       : "Purchase";
}

function buildNoAgencyMatchMessage(scenario) {
  const reasons = [];
  if (scenario.creditScore < 580) {
    reasons.push(`FICO ${scenario.creditScore} is below most Agency minimums`);
  }
  if (scenario.creditEvent && scenario.creditEvent !== CREDIT_EVENTS.NONE) {
    reasons.push(`${scenario.creditEvent} seasoning may not be satisfied`);
  }
  if (scenario.incomeDocType !== "fullDoc") {
    reasons.push(`Income type "${scenario.incomeDocType}" is not accepted by Agency lenders`);
  }
  if (scenario.ltv > 97) {
    reasons.push(`LTV ${scenario.ltv}% exceeds all Agency maximums`);
  }

  const commonReason = reasons.length > 0
    ? reasons.join(" | ")
    : "Review FICO, LTV, DTI, and credit event seasoning";

  return `No Agency lenders matched this scenario. ${commonReason}. See Alternative Path below.`;
}

function buildNoNonQMMatchMessage(scenario) {
  if (scenario.incomeDocType === "fullDoc") {
    return "Non-QM results are not shown for full documentation scenarios.";
  }
  if (scenario.creditScore < 500) {
    return `FICO ${scenario.creditScore} is below all Non-QM minimums. Credit rehabilitation may be needed.`;
  }
  if (scenario.dscr !== null && scenario.dscr < 0.75) {
    return `DSCR ${scenario.dscr} is below all DSCR program minimums. Review rental income or reduce loan amount.`;
  }
  return "No Non-QM profiles matched this scenario. Consider adjusting FICO, LTV, or loan amount.";
}


// ─── Main Entry Point ─────────────────────────────────────────────────────────
/**
 * runLenderMatch — the single public API for the engine.
 *
 * Accepts raw form inputs + lender matrices + Firestore overrides.
 * Returns a complete, packaged result object ready for the UI to render.
 *
 * @param {object} rawInputs          — Raw form values from LenderMatchForm.jsx
 * @param {object} options
 *   @param {Array}  options.agencyOverrides   — Docs from Firestore lenderOverrides
 *   @param {Array}  options.nonQMOverrides     — Docs from Firestore nonQMOverrides
 *   @param {boolean} options.firestoreAvailable
 *   @param {string}  options.mode              — Presentation mode (v1.0: SEPARATE_SECTIONS)
 * @returns {object}  — Full result payload for UI
 */
export function runLenderMatch(rawInputs = {}, options = {}) {
  const {
    agencyOverrides   = [],
    nonQMOverrides    = [],
    firestoreAvailable = true,
    mode              = ENGINE_CONFIG.resultsPresentationMode,
  } = options;

  // ── STEP 1: Normalize scenario ─────────────────────────────────────────
  const scenario = normalizeScenario(rawInputs);

  // ── Build active lender lists with Firestore overrides merged in ───────
  // Agency: merge static matrix with Firestore overrides
  const agencyLenders = applyAgencyOverrides(getActiveAgencyLenders(), agencyOverrides);

  // Non-QM: merge placeholder matrix with Firestore overrides
  const nonQMLenders = mergeNonQMWithOverrides(nonQMOverrides);

  // ── Determine which programs to evaluate ──────────────────────────────
  const agencyProgramsToEval  = resolveAgencyPrograms(scenario);
  const nonQMProgramToEval    = resolveNonQMProgram(scenario);

  // ── STEP 2 + 3 + 4 + 5: Evaluate all Agency lenders ───────────────────
  const agencyResults = [];

  if (!scenario.isNonQMPath) {
    // Only evaluate Agency lenders on full-doc scenarios
    agencyLenders.forEach((lender) => {
      agencyProgramsToEval.forEach((program) => {
        if (!lender.programs.includes(program)) return;

        const eligibility = checkAgencyEligibility(lender, program, scenario);
        const overlayRisk = assessOverlayRisk(scenario);
        const tier        = getTierIndicator(lender, "Agency");

        let fitScore    = 0;
        let breakdown   = {};

        if (eligibility.eligible) {
          const scored = scoreAgencyLender(lender, program, scenario);
          fitScore  = scored.fitScore;
          breakdown = scored.breakdown;
        }

        agencyResults.push({
          lenderId:            lender.id,
          lenderName:          lender.name,
          shortName:           lender.shortName,
          accentColor:         lender.accentColor,
          program,
          eligible:            eligibility.eligible,
          eligibilityStatus:   eligibility.eligible
                                 ? ELIGIBILITY_STATUS.ELIGIBLE
                                 : ELIGIBILITY_STATUS.INELIGIBLE,
          failReason:          eligibility.failReason,
          passReasons:         eligibility.reasons,
          fitScore,
          breakdown,
          overlayRisk:         overlayRisk.level,
          overlaySignals:      overlayRisk.signals,
          tier:                tier.display,
          tierBasis:           tier.basis,
          strengths:           lender.strengths,
          weaknesses:          lender.weaknesses,
          tierNotes:           lender.tierNotes,
          guidelineVersionRef: lender.guidelineVersionRef,
          dataSource:          lender.dataSource,
          notes:               lender.guidelines[program]?.notes || [],
          narrative:           eligibility.eligible
                                 ? buildAgencyNarrative(lender, program, scenario, fitScore, breakdown)
                                 : null,
        });
      });
    });
  } else {
    // Non-QM path: suppress Agency results with explanation
    agencyLenders.forEach((lender) => {
      agencyResults.push({
        lenderId:          lender.id,
        lenderName:        lender.name,
        shortName:         lender.shortName,
        program:           "Agency",
        eligible:          false,
        eligibilityStatus: ELIGIBILITY_STATUS.INELIGIBLE,
        failReason:        `Agency lenders require full income documentation. ` +
                           `Selected: ${scenario.incomeDocType}. See Alternative Path below.`,
        fitScore:          0,
        dataSource:        lender.dataSource,
        guidelineVersionRef: lender.guidelineVersionRef,
      });
    });
  }

  // ── STEP 2 + 3 + 4 + 5: Evaluate all Non-QM lenders ──────────────────
  const nonQMResults = [];

  if (nonQMProgramToEval) {
    const relevantLenders = nonQMLenders.filter(
      (l) => l.active && l.programs.includes(nonQMProgramToEval)
    );

    relevantLenders.forEach((lender) => {
      const eligibility = checkNonQMEligibility(lender, nonQMProgramToEval, scenario);
      const overlayRisk = assessOverlayRisk(scenario);
      const tier        = getTierIndicator(lender, "NonQM");

      let fitScore    = 0;
      let breakdown   = {};
      let eligStatus  = ELIGIBILITY_STATUS.INELIGIBLE;

      if (eligibility.eligible) {
        const scored = scoreNonQMLender(lender, nonQMProgramToEval, scenario);
        fitScore  = scored.fitScore;
        breakdown = scored.breakdown;

        // Determine eligibility status for placeholder
        if (lender.dataSource === DATA_SOURCES.PLACEHOLDER) {
          const meetsException = placeholderMeetsControlledException(
            scenario,
            {
              overlayRisk:        overlayRisk.level,
              confidenceScore:    0.85,  // Will be recalculated in Step 6
              seasoningViolation: eligibility.seasoningViolation || false,
              conditionalFlags:   eligibility.conditionalFlags   || [],
              applicableMaxLTV:   breakdown.applicableMaxLTV,
              matchedProgram:     nonQMProgramToEval,
            },
            lender.guidelines[nonQMProgramToEval]
          );
          eligStatus = meetsException
            ? ELIGIBILITY_STATUS.ELIGIBLE
            : ELIGIBILITY_STATUS.CONDITIONAL;
        } else {
          eligStatus = ELIGIBILITY_STATUS.ELIGIBLE;
        }
      }

      nonQMResults.push({
        lenderId:            lender.id,
        lenderName:          lender.profileName ?? lender.name,
        shortName:           lender.shortName,
        accentColor:         lender.accentColor,
        program:             nonQMProgramToEval,
        eligible:            eligibility.eligible,
        eligibilityStatus:   eligStatus,
        eligibilityLabel:    getEligibilityLabel(eligStatus, lender.dataSource),
        eligibilityClass:    getEligibilityClass(eligStatus, lender.dataSource),
        failReason:          eligibility.failReason,
        passReasons:         eligibility.reasons,
        conditionalFlags:    eligibility.conditionalFlags || [],
        seasoningViolation:  eligibility.seasoningViolation || false,
        fitScore,
        breakdown,
        overlayRisk:         overlayRisk.level,
        overlaySignals:      overlayRisk.signals,
        tier:                tier.display,
        tierBasis:           tier.basis,
        strengths:           lender.strengths,
        weaknesses:          lender.weaknesses,
        tierNotes:           lender.tierNotes,
        typicalUseCase:      lender.typicalUseCase,
        guidelineVersionRef: lender.guidelineVersionRef,
        dataSource:          lender.dataSource,
        isPlaceholder:       lender.dataSource === DATA_SOURCES.PLACEHOLDER,
        disclaimer:          lender.disclaimer,
        excludeFromCombined: lender.dataSource === DATA_SOURCES.PLACEHOLDER,
        narrative:           eligibility.eligible
                               ? buildNonQMNarrative(lender, nonQMProgramToEval, scenario,
                                   fitScore, breakdown, agencyResults.some((r) => r.eligible))
                               : null,
      });
    });
  }

  // ── STEP 4: Scenario-level overlay risk ───────────────────────────────
  const overlayRisk = assessOverlayRisk(scenario);

  // ── STEP 6: Confidence score ──────────────────────────────────────────
  const hasPlaceholderResults = nonQMResults.some(
    (r) => r.eligible && r.dataSource === DATA_SOURCES.PLACEHOLDER
  );
  const confidence = calculateConfidenceScore(
    { ...scenario, hasPlaceholderResults },
    { firestoreAvailable }
  );

  // ── STEP 7: Rank and package ──────────────────────────────────────────
  return rankAndPackageResults(
    agencyResults,
    nonQMResults,
    scenario,
    overlayRisk,
    confidence,
    mode
  );
}


// ─── Agency Override Merge ────────────────────────────────────────────────────
/**
 * Merges Firestore Agency overrides into the static Agency matrix.
 * Same precedence pattern as Non-QM: Firestore > static.
 */
function applyAgencyOverrides(lenders, overrides = []) {
  if (!overrides.length) return lenders;
  const overrideMap = {};
  overrides.forEach((o) => { if (o.id) overrideMap[o.id] = o; });

  return lenders.map((lender) => {
    const override = overrideMap[lender.id];
    if (!override) return lender;
    console.log(`[LenderMatchEngine] Agency override applied: ${lender.id}`);
    return { ...lender, ...override };
  });
}


// ─── Program Resolution ───────────────────────────────────────────────────────

function resolveAgencyPrograms(scenario) {
  // Which Agency programs should we evaluate?
  if (scenario.loanType && scenario.loanType !== "All") {
    return [scenario.loanType];
  }
  // Default: evaluate all three Agency programs
  return [
    AGENCY_PROGRAMS.CONVENTIONAL,
    AGENCY_PROGRAMS.FHA,
    AGENCY_PROGRAMS.VA,
  ];
}

function resolveNonQMProgram(scenario) {
  // Map incomeDocType → Non-QM program key
  const map = {
    bankStatement12: PROGRAMS.BANK_STATEMENT_12,
    bankStatement24: PROGRAMS.BANK_STATEMENT_24,
    dscr:            PROGRAMS.DSCR,
    assetDepletion:  PROGRAMS.ASSET_DEPLETION,
    ninetyNineOnly:  PROGRAMS.NINETY_NINE_ONLY,
    noDoc:           PROGRAMS.NO_DOC,
  };
  return map[scenario.incomeDocType] ?? null;
}


// ─── Narrative Generator ─────────────────────────────────────────────────────
/**
 * Auto-generates "Why this lender?" narrative from score components.
 * Pure template logic — no external API call. (PRD Section 16)
 */
function buildAgencyNarrative(lender, program, scenario, fitScore, breakdown) {
  const parts = [];

  // Opening: lender rank context
  if (fitScore >= 80) {
    parts.push(`${lender.shortName} is an excellent match for this ${program} ${formatTxType(scenario.transactionType).toLowerCase()}.`);
  } else if (fitScore >= 65) {
    parts.push(`${lender.shortName} is a solid match for this ${program} ${formatTxType(scenario.transactionType).toLowerCase()}.`);
  } else {
    parts.push(`${lender.shortName} qualifies for this ${program} scenario but offers less cushion than top-ranked options.`);
  }

  // FICO cushion
  if (breakdown.ficoCushion >= 100) {
    parts.push(`Your ${scenario.creditScore} FICO is ${breakdown.ficoCushion} points above their minimum — strong cushion.`);
  } else if (breakdown.ficoCushion >= 40) {
    parts.push(`Your ${scenario.creditScore} FICO meets their ${scenario.creditScore - breakdown.ficoCushion} minimum with ${breakdown.ficoCushion}-point cushion.`);
  } else {
    parts.push(`Your ${scenario.creditScore} FICO is close to their minimum — expect possible file scrutiny.`);
  }

  // Tier context
  if (lender.tier === "A+") {
    parts.push(`Their premier platform typically delivers competitive execution for this loan type.`);
  } else if (lender.tier === "A") {
    parts.push(`${lender.tierNotes}`);
  }

  // Risk note if moderate/high
  if (breakdown.ltvCushion < 5) {
    parts.push(`Note: LTV is close to their ceiling — strong documentation will be important.`);
  }

  return parts.join(" ");
}

function buildNonQMNarrative(lender, program, scenario, fitScore, breakdown, agencyAlsoWorks) {
  const parts = [];
  const programLabel = formatProgramLabel(program);

  if (agencyAlsoWorks) {
    parts.push(`${lender.shortName}'s ${programLabel} program is available as an alternative to Agency financing.`);
  } else {
    parts.push(`${lender.shortName}'s ${programLabel} program offers a viable path where Agency lending is not available.`);
  }

  // Program-specific detail
  if (program === PROGRAMS.DSCR && scenario.dscr) {
    parts.push(`Your DSCR of ${scenario.dscr.toFixed(2)} meets their minimum of ${lender.guidelines[program]?.minDSCR} — no personal income documentation required.`);
  } else if ((program === PROGRAMS.BANK_STATEMENT_12 || program === PROGRAMS.BANK_STATEMENT_24) && scenario.selfEmployed) {
    parts.push(`Bank statement qualification uses your deposit history rather than tax returns — ideal for self-employed borrowers with strong cash flow.`);
  } else if (program === PROGRAMS.ASSET_DEPLETION && scenario.totalAssets) {
    const monthlyIncome = Math.floor(scenario.totalAssets / (lender.guidelines[program]?.depletionMonths || 60));
    parts.push(`Your $${scenario.totalAssets.toLocaleString()} in assets qualifies as ~$${monthlyIncome.toLocaleString()}/month income using the ${lender.guidelines[program]?.depletionMonths}-month depletion method.`);
  }

  // FICO cushion note
  const ficoCushion = scenario.creditScore - (lender.guidelines[program]?.minFICO || 620);
  if (ficoCushion >= 40) {
    parts.push(`Your ${scenario.creditScore} FICO provides a ${ficoCushion}-point cushion above their minimum.`);
  }

  // Placeholder reminder
  if (lender.dataSource === DATA_SOURCES.PLACEHOLDER) {
    parts.push(`Verify current guidelines directly with this lender type before quoting.`);
  }

  return parts.join(" ");
}

function formatProgramLabel(program) {
  const labels = {
    BankStatement12:  "12-Month Bank Statement",
    BankStatement24:  "24-Month Bank Statement",
    DSCR:             "DSCR",
    AssetDepletion:   "Asset Depletion",
    NinetyNineOnly:   "1099",
    NoDoc:            "No-Doc",
  };
  return labels[program] ?? program;
}


// ─── Decision Record Builder ─────────────────────────────────────────────────
/**
 * Builds a Decision Record™ payload for Firestore storage.
 * Called when the LO selects a lender from results. (AC5)
 *
 * @param {object} selectedResult  — The lender result object from the engine
 * @param {object} scenario        — The normalized scenario
 * @param {object} engineOutput    — The full engine result (for confidence/overlay)
 * @returns {object}               — Firestore-ready Decision Record payload
 */
export function buildDecisionRecord(selectedResult, scenario, engineOutput) {
  const isPlaceholder = selectedResult.dataSource === DATA_SOURCES.PLACEHOLDER;

  const record = {
    recordType:    "LENDER_MATCH_SELECTION",

    // Full scenario snapshot — sealed at selection time
    scenarioSnapshot: { ...scenario },

    // Selection
    selectedLenderId:   selectedResult.lenderId,
    selectedProgramId:  `${selectedResult.lenderId}_${selectedResult.program}`,
    profileName:        selectedResult.lenderName,

    // Data provenance (AC3, AC5)
    dataSource:          selectedResult.dataSource,
    rulesetVersion:      isPlaceholder ? 0 : (selectedResult.version ?? 1),
    guidelineVersionRef: selectedResult.guidelineVersionRef,

    // Scores at time of selection — never retroactively modified
    fitScore:          selectedResult.fitScore,
    eligibilityStatus: selectedResult.eligibilityStatus,
    overlayRisk:       selectedResult.overlayRisk,
    confidenceScore:   engineOutput?.confidence?.score ?? null,
    tierBasis:         selectedResult.tierBasis,
    tier:              selectedResult.tier,

    // Reasons snapshot
    reasonsSnapshot: [
      ...(selectedResult.passReasons || []),
      ...(selectedResult.conditionalFlags?.map((f) => `⚠️ ${f}`) || []),
    ],

    // Narrative at time of selection
    narrativeSnapshot: selectedResult.narrative,

    // Placeholder-specific provenance
    ...(isPlaceholder && {
      placeholderCreatedDate: selectedResult.guidelineVersionRef,
      placeholderDisclaimer:  selectedResult.disclaimer,
    }),

    // Timestamps
    selectedAt: new Date().toISOString(),
  };

  return record;
}


// ─── Engine Version ───────────────────────────────────────────────────────────

export const ENGINE_VERSION      = "1.0.0";
export const ENGINE_RELEASE_DATE = "2026-02-18";

if (process.env.NODE_ENV !== "production") {
  console.log(
    `[LenderMatchEngine] v${ENGINE_VERSION} loaded | ` +
    `7-step pipeline | Agency + Non-QM | ${ENGINE_RELEASE_DATE}`
  );
}
