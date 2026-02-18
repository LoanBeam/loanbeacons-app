/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/schemas/nonQMLenderSchema.js
 * Version: 1.1 — Canonical Non-QM Lender Schema & Validator
 * Governance: PLACEHOLDER_GOVERNANCE.md v1.1
 * ============================================================
 *
 * This file is the single source of truth for the shape of every
 * Non-QM lender record used by the Lender Match™ engine.
 *
 * Rules (from PLACEHOLDER_GOVERNANCE.md Section 3.1):
 *   - Top-level fields:    REQUIRED for every record (placeholder or real)
 *   - Guideline blocks:    REQUIRED only for programs listed in programs[]
 *   - Banned fields:       rate, apr, price, spread, points, interestRate,
 *                          margin, cap, estimatedRate, rateRange, rateSpread,
 *                          pricingTier — engine rejects any record containing these
 *   - Malformed records:   rejected at initialization, never silently accepted
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const DATA_SOURCES = {
  PLACEHOLDER: "PLACEHOLDER",
  REAL: "REAL",
};

export const TIER_BASIS = {
  AGGRESSIVE:   "Aggressive",
  MARKET:       "Market",
  CONSERVATIVE: "Conservative",
};

export const PROGRAMS = {
  BANK_STATEMENT_12: "BankStatement12",
  BANK_STATEMENT_24: "BankStatement24",
  DSCR:              "DSCR",
  ASSET_DEPLETION:   "AssetDepletion",
  NINETY_NINE_ONLY:  "NinetyNineOnly",
  NO_DOC:            "NoDoc",
};

export const PROPERTY_TYPES = {
  SFR:                  "SFR",
  CONDO:                "Condo",
  CONDO_NON_WARRANTABLE:"Condo_NonWarrantable",
  TWO_UNIT:             "TwoUnit",
  THREE_UNIT:           "ThreeUnit",
  FOUR_UNIT:            "FourUnit",
  MANUFACTURED:         "Manufactured",
  MIXED_USE:            "MixedUse",
};

// Pricing fields are BANNED from this schema entirely.
// Any record containing these keys will be rejected.
export const BANNED_FIELDS = [
  "rate", "apr", "price", "spread", "points", "interestRate",
  "margin", "cap", "estimatedRate", "rateRange", "rateSpread", "pricingTier",
];

// Valid programs list for array membership checks
const VALID_PROGRAMS    = Object.values(PROGRAMS);
const VALID_PROPERTY_TYPES = Object.values(PROPERTY_TYPES);
const VALID_DATA_SOURCES   = Object.values(DATA_SOURCES);
const VALID_TIER_BASIS     = Object.values(TIER_BASIS);


// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Collects validation errors into an array.
 * Returns { valid: boolean, errors: string[] }
 */
function createResult() {
  const errors = [];
  return {
    errors,
    require: (condition, message) => {
      if (!condition) errors.push(message);
    },
    get valid() { return errors.length === 0; },
  };
}

/** True if value is a finite number */
const isNum  = (v) => typeof v === "number" && isFinite(v);

/** True if value is a non-empty string */
const isStr  = (v) => typeof v === "string" && v.trim().length > 0;

/** True if value is a boolean */
const isBool = (v) => typeof v === "boolean";

/** True if value is a non-empty array */
const isArr  = (v) => Array.isArray(v) && v.length > 0;

/**
 * Validates an LTV block of shape:
 *   { purchase: Number, rateTerm: Number, cashOut: Number }
 */
function validateLTVBlock(ltv, path, r) {
  if (!ltv || typeof ltv !== "object") {
    r.require(false, `${path} must be an object with purchase/rateTerm/cashOut`);
    return;
  }
  r.require(isNum(ltv.purchase) && ltv.purchase > 0 && ltv.purchase <= 100,
    `${path}.purchase must be a number 1–100`);
  r.require(isNum(ltv.rateTerm) && ltv.rateTerm > 0 && ltv.rateTerm <= 100,
    `${path}.rateTerm must be a number 1–100`);
  r.require(isNum(ltv.cashOut)  && ltv.cashOut  > 0 && ltv.cashOut  <= 100,
    `${path}.cashOut must be a number 1–100`);
}

/**
 * Validates property types array — must contain only known values.
 * Accepts ["ALL"] as a special case.
 */
function validatePropertyTypes(arr, path, r) {
  if (!isArr(arr)) {
    r.require(false, `${path} must be a non-empty array`);
    return;
  }
  if (arr[0] === "ALL") return; // "ALL" shorthand is valid
  arr.forEach((pt) => {
    r.require(
      VALID_PROPERTY_TYPES.includes(pt),
      `${path} contains unknown property type "${pt}". Valid: ${VALID_PROPERTY_TYPES.join(", ")}`
    );
  });
}

/**
 * Validates the states field — must be ["ALL"] or an array of 2-letter codes.
 */
function validateStates(states, path, r) {
  if (!isArr(states)) {
    r.require(false, `${path} must be a non-empty array (use ["ALL"] for all states)`);
    return;
  }
  if (states.length === 1 && states[0] === "ALL") return;
  states.forEach((s) => {
    r.require(
      typeof s === "string" && s.length === 2,
      `${path} contains invalid state code "${s}" — use 2-letter codes or ["ALL"]`
    );
  });
}


// ─── Program-Level Validators ─────────────────────────────────────────────────

/**
 * Validates a BankStatement12 or BankStatement24 guideline block.
 */
function validateBankStatementGuidelines(g, programKey, r) {
  const p = `guidelines.${programKey}`;

  r.require(isNum(g.minFICO) && g.minFICO >= 300 && g.minFICO <= 850,
    `${p}.minFICO must be 300–850`);
  r.require(isNum(g.expenseFactor) && g.expenseFactor > 0 && g.expenseFactor <= 1,
    `${p}.expenseFactor must be 0.01–1.0 (e.g., 0.50 = 50% of deposits)`);
  r.require(isNum(g.maxDTI) && g.maxDTI > 0 && g.maxDTI <= 100,
    `${p}.maxDTI must be 1–100`);
  r.require(isNum(g.maxLoanAmount) && g.maxLoanAmount > 0,
    `${p}.maxLoanAmount must be a positive number`);
  r.require(isNum(g.minReserveMonths) && g.minReserveMonths >= 0,
    `${p}.minReserveMonths must be >= 0`);
  r.require(isBool(g.allowsShortTermRental),
    `${p}.allowsShortTermRental must be a boolean`);
  r.require(isNum(g.bkSeasoning) && g.bkSeasoning >= 0,
    `${p}.bkSeasoning must be >= 0 (months)`);
  r.require(isNum(g.fcSeasoning) && g.fcSeasoning >= 0,
    `${p}.fcSeasoning must be >= 0 (months)`);
  r.require(isNum(g.shortSaleSeasoning) && g.shortSaleSeasoning >= 0,
    `${p}.shortSaleSeasoning must be >= 0 (months)`);

  // maxLTV — requires primary and investment blocks
  if (!g.maxLTV || typeof g.maxLTV !== "object") {
    r.require(false, `${p}.maxLTV must be an object`);
  } else {
    validateLTVBlock(g.maxLTV.primary,    `${p}.maxLTV.primary`,    r);
    validateLTVBlock(g.maxLTV.investment, `${p}.maxLTV.investment`, r);
    // secondHome is optional but if present must be valid
    if (g.maxLTV.secondHome !== undefined) {
      validateLTVBlock(g.maxLTV.secondHome, `${p}.maxLTV.secondHome`, r);
    }
  }

  validatePropertyTypes(g.allowedPropertyTypes, `${p}.allowedPropertyTypes`, r);
  validateStates(g.states, `${p}.states`, r);

  // cashOutMax: null is valid (no limit), or must be a positive number
  r.require(
    g.cashOutMax === null || (isNum(g.cashOutMax) && g.cashOutMax > 0),
    `${p}.cashOutMax must be null (no limit) or a positive number`
  );
}

/**
 * Validates a DSCR guideline block.
 */
function validateDSCRGuidelines(g, r) {
  const p = "guidelines.DSCR";

  r.require(isNum(g.minFICO) && g.minFICO >= 300 && g.minFICO <= 850,
    `${p}.minFICO must be 300–850`);
  r.require(isNum(g.minDSCR) && g.minDSCR >= 0,
    `${p}.minDSCR must be >= 0 (e.g., 1.0 for break-even, 1.25 for conservative)`);
  r.require(isNum(g.maxLoanAmount) && g.maxLoanAmount > 0,
    `${p}.maxLoanAmount must be a positive number`);
  r.require(isNum(g.minReserveMonths) && g.minReserveMonths >= 0,
    `${p}.minReserveMonths must be >= 0`);
  r.require(isBool(g.allowsShortTermRental),
    `${p}.allowsShortTermRental must be a boolean`);
  r.require(isNum(g.bkSeasoning) && g.bkSeasoning >= 0,
    `${p}.bkSeasoning must be >= 0 (months)`);
  r.require(isNum(g.fcSeasoning) && g.fcSeasoning >= 0,
    `${p}.fcSeasoning must be >= 0 (months)`);
  r.require(isNum(g.shortSaleSeasoning) && g.shortSaleSeasoning >= 0,
    `${p}.shortSaleSeasoning must be >= 0 (months)`);

  // DSCR — investment LTV only (DSCR is investment program by definition)
  if (!g.maxLTV || typeof g.maxLTV !== "object") {
    r.require(false, `${p}.maxLTV must be an object`);
  } else {
    validateLTVBlock(g.maxLTV.investment, `${p}.maxLTV.investment`, r);
  }

  validatePropertyTypes(g.allowedPropertyTypes, `${p}.allowedPropertyTypes`, r);
  validateStates(g.states, `${p}.states`, r);
}

/**
 * Validates an AssetDepletion guideline block.
 */
function validateAssetDepletionGuidelines(g, r) {
  const p = "guidelines.AssetDepletion";

  r.require(isNum(g.minFICO) && g.minFICO >= 300 && g.minFICO <= 850,
    `${p}.minFICO must be 300–850`);
  r.require(isNum(g.minAssets) && g.minAssets > 0,
    `${p}.minAssets must be a positive number (minimum qualifying assets in USD)`);
  r.require(isNum(g.depletionMonths) && g.depletionMonths > 0,
    `${p}.depletionMonths must be > 0 (assets ÷ depletionMonths = monthly income)`);
  r.require(isNum(g.maxLoanAmount) && g.maxLoanAmount > 0,
    `${p}.maxLoanAmount must be a positive number`);
  r.require(isNum(g.minReserveMonths) && g.minReserveMonths >= 0,
    `${p}.minReserveMonths must be >= 0 (post-close, separate from qualifying assets)`);
  r.require(isNum(g.bkSeasoning) && g.bkSeasoning >= 0,
    `${p}.bkSeasoning must be >= 0 (months)`);
  r.require(isNum(g.fcSeasoning) && g.fcSeasoning >= 0,
    `${p}.fcSeasoning must be >= 0 (months)`);
  r.require(isNum(g.shortSaleSeasoning) && g.shortSaleSeasoning >= 0,
    `${p}.shortSaleSeasoning must be >= 0 (months)`);

  // maxLTV — requires primary and investment blocks
  if (!g.maxLTV || typeof g.maxLTV !== "object") {
    r.require(false, `${p}.maxLTV must be an object`);
  } else {
    validateLTVBlock(g.maxLTV.primary,    `${p}.maxLTV.primary`,    r);
    validateLTVBlock(g.maxLTV.investment, `${p}.maxLTV.investment`, r);
    if (g.maxLTV.secondHome !== undefined) {
      validateLTVBlock(g.maxLTV.secondHome, `${p}.maxLTV.secondHome`, r);
    }
  }

  validatePropertyTypes(g.allowedPropertyTypes, `${p}.allowedPropertyTypes`, r);
  validateStates(g.states, `${p}.states`, r);
}

/**
 * Validates a NinetyNineOnly guideline block.
 * Same shape as BankStatement — uses the same validator.
 */
function validateNinetyNineOnlyGuidelines(g, r) {
  validateBankStatementGuidelines(g, "NinetyNineOnly", r);
}

/**
 * Validates a NoDoc guideline block.
 * Simplified — no DTI, no income validation.
 */
function validateNoDocGuidelines(g, r) {
  const p = "guidelines.NoDoc";

  r.require(isNum(g.minFICO) && g.minFICO >= 300 && g.minFICO <= 850,
    `${p}.minFICO must be 300–850`);
  r.require(isNum(g.maxLoanAmount) && g.maxLoanAmount > 0,
    `${p}.maxLoanAmount must be a positive number`);
  r.require(isNum(g.minReserveMonths) && g.minReserveMonths >= 0,
    `${p}.minReserveMonths must be >= 0`);

  if (!g.maxLTV || typeof g.maxLTV !== "object") {
    r.require(false, `${p}.maxLTV must be an object`);
  } else {
    // NoDoc — primary is optional, investment is common
    if (g.maxLTV.primary !== undefined) {
      validateLTVBlock(g.maxLTV.primary, `${p}.maxLTV.primary`, r);
    }
    if (g.maxLTV.investment !== undefined) {
      validateLTVBlock(g.maxLTV.investment, `${p}.maxLTV.investment`, r);
    }
    r.require(
      g.maxLTV.primary !== undefined || g.maxLTV.investment !== undefined,
      `${p}.maxLTV must contain at least one of: primary, investment`
    );
  }

  validatePropertyTypes(g.allowedPropertyTypes, `${p}.allowedPropertyTypes`, r);
  validateStates(g.states, `${p}.states`, r);
}


// ─── Banned Field Scanner ─────────────────────────────────────────────────────

/**
 * Recursively scans a record object for any banned pricing field names.
 * Returns array of banned field paths found.
 */
function scanForBannedFields(obj, path = "") {
  const found = [];
  if (!obj || typeof obj !== "object") return found;

  for (const key of Object.keys(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (BANNED_FIELDS.includes(key.toLowerCase())) {
      found.push(fullPath);
    }
    if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
      found.push(...scanForBannedFields(obj[key], fullPath));
    }
  }
  return found;
}


// ─── Top-Level Validator ──────────────────────────────────────────────────────

/**
 * Validates a complete Non-QM lender record.
 *
 * Returns: { valid: boolean, errors: string[], lenderId: string }
 *
 * Usage:
 *   import { validateNonQMLender } from '@/schemas/nonQMLenderSchema';
 *   const result = validateNonQMLender(lenderRecord);
 *   if (!result.valid) { console.error(result.errors); }
 */
export function validateNonQMLender(lender) {
  const r = createResult();
  const id = lender?.id ?? "UNKNOWN";

  if (!lender || typeof lender !== "object") {
    return { valid: false, errors: ["Lender record is null or not an object"], lenderId: id };
  }

  // ── AC2: Scan for banned pricing fields first ──────────────────────────────
  const bannedFound = scanForBannedFields(lender);
  if (bannedFound.length > 0) {
    r.require(false,
      `AC2 VIOLATION — Banned pricing fields found: ${bannedFound.join(", ")}. ` +
      `Lender Match™ is a decision intelligence engine, not a pricing engine. ` +
      `Remove these fields to comply with PLACEHOLDER_GOVERNANCE.md Section 3.3.`
    );
    // Return immediately — pricing field presence is a hard rejection
    return { valid: false, errors: r.errors, lenderId: id };
  }

  // ── Identity fields (all required) ────────────────────────────────────────
  r.require(isStr(lender.id),          "id must be a non-empty string");
  r.require(isStr(lender.profileName), "profileName must be a non-empty string");
  r.require(isStr(lender.shortName),   "shortName must be a non-empty string");
  r.require(
    VALID_DATA_SOURCES.includes(lender.dataSource),
    `dataSource must be one of: ${VALID_DATA_SOURCES.join(", ")}`
  );
  r.require(isStr(lender.accentColor) && lender.accentColor.startsWith("#"),
    "accentColor must be a hex color string (e.g., '#b45309')");
  r.require(
    isNum(lender.priorityWeight) && lender.priorityWeight >= 0 && lender.priorityWeight <= 100,
    "priorityWeight must be a number 0–100"
  );
  r.require(isBool(lender.active), "active must be a boolean");

  // ── Versioning fields (all required) ──────────────────────────────────────
  r.require(
    isNum(lender.version) && lender.version >= 0,
    "version must be >= 0 (0 = placeholder, 1+ = real verified data)"
  );
  r.require(isStr(lender.guidelineVersionRef),
    "guidelineVersionRef must be a non-empty string (e.g., 'PLACEHOLDER-v0' or 'ANGELOAK-2026-Q1')");
  r.require(isStr(lender.effectiveDate),
    "effectiveDate must be an ISO date string (e.g., '2026-02-18')");
  r.require(
    lender.endDate === null || isStr(lender.endDate),
    "endDate must be null (active) or an ISO date string"
  );

  // ── Placeholder-specific version rule ─────────────────────────────────────
  if (lender.dataSource === DATA_SOURCES.PLACEHOLDER) {
    r.require(lender.version === 0,
      "Placeholder records must have version: 0");
    r.require(lender.guidelineVersionRef === "PLACEHOLDER-v0",
      "Placeholder records must have guidelineVersionRef: 'PLACEHOLDER-v0'");
  }
  if (lender.dataSource === DATA_SOURCES.REAL) {
    r.require(lender.version >= 1,
      "Real lender records must have version >= 1");
  }

  // ── Programs array ─────────────────────────────────────────────────────────
  r.require(isArr(lender.programs), "programs must be a non-empty array");
  if (isArr(lender.programs)) {
    lender.programs.forEach((prog) => {
      r.require(
        VALID_PROGRAMS.includes(prog),
        `programs contains unknown program "${prog}". Valid: ${VALID_PROGRAMS.join(", ")}`
      );
    });
  }

  // ── Guideline blocks — required for each program listed ───────────────────
  // This is the schema contradiction fix from PLACEHOLDER_GOVERNANCE.md Section 3.1
  if (isArr(lender.programs) && lender.guidelines && typeof lender.guidelines === "object") {
    lender.programs.forEach((prog) => {
      const block = lender.guidelines[prog];
      if (!block || typeof block !== "object") {
        r.require(false,
          `guidelines.${prog} is required because "${prog}" is listed in programs[], ` +
          `but it is missing or not an object.`
        );
        return; // Skip further validation for this block
      }

      // Route to program-specific validator
      switch (prog) {
        case PROGRAMS.BANK_STATEMENT_12:
          validateBankStatementGuidelines(block, "BankStatement12", r);
          break;
        case PROGRAMS.BANK_STATEMENT_24:
          validateBankStatementGuidelines(block, "BankStatement24", r);
          break;
        case PROGRAMS.DSCR:
          validateDSCRGuidelines(block, r);
          break;
        case PROGRAMS.ASSET_DEPLETION:
          validateAssetDepletionGuidelines(block, r);
          break;
        case PROGRAMS.NINETY_NINE_ONLY:
          validateNinetyNineOnlyGuidelines(block, r);
          break;
        case PROGRAMS.NO_DOC:
          validateNoDocGuidelines(block, r);
          break;
        default:
          r.require(false, `No validator defined for program "${prog}"`);
      }
    });
  } else if (!lender.guidelines || typeof lender.guidelines !== "object") {
    r.require(false, "guidelines must be an object");
  }

  // ── Display & scoring fields (all required) ────────────────────────────────
  r.require(
    VALID_TIER_BASIS.includes(lender.tierBasis),
    `tierBasis must be one of: ${VALID_TIER_BASIS.join(", ")}`
  );
  r.require(isStr(lender.tierNotes),      "tierNotes must be a non-empty string");
  r.require(isStr(lender.typicalUseCase), "typicalUseCase must be a non-empty string");

  r.require(
    isArr(lender.strengths) && lender.strengths.length <= 3,
    "strengths must be a non-empty array of up to 3 strings"
  );
  r.require(
    isArr(lender.weaknesses) && lender.weaknesses.length <= 3,
    "weaknesses must be a non-empty array of up to 3 strings"
  );
  if (isArr(lender.strengths)) {
    lender.strengths.forEach((s, i) =>
      r.require(isStr(s), `strengths[${i}] must be a non-empty string`)
    );
  }
  if (isArr(lender.weaknesses)) {
    lender.weaknesses.forEach((w, i) =>
      r.require(isStr(w), `weaknesses[${i}] must be a non-empty string`)
    );
  }

  return { valid: r.valid, errors: r.errors, lenderId: id };
}


// ─── Batch Validator ──────────────────────────────────────────────────────────

/**
 * Validates an array of Non-QM lender records.
 * Returns only the valid records. Logs errors for invalid ones.
 * Invalid records are EXCLUDED — never silently accepted.
 *
 * Usage (in LenderMatchEngine.js):
 *   import { validateNonQMLenderBatch } from '@/schemas/nonQMLenderSchema';
 *   const validLenders = validateNonQMLenderBatch(rawLenderArray, "nonQMLenderMatrix");
 */
export function validateNonQMLenderBatch(lenders, source = "unknown") {
  if (!Array.isArray(lenders)) {
    console.error(`[NonQMLenderSchema] validateNonQMLenderBatch: expected array, got ${typeof lenders}`);
    return [];
  }

  const valid   = [];
  const invalid = [];

  lenders.forEach((lender, index) => {
    const result = validateNonQMLender(lender);
    if (result.valid) {
      valid.push(lender);
    } else {
      invalid.push({ index, lenderId: result.lenderId, errors: result.errors });
      console.error(
        `[NonQMLenderSchema] ❌ REJECTED lender at index ${index} ` +
        `(id: "${result.lenderId}") from source "${source}":\n` +
        result.errors.map((e) => `  • ${e}`).join("\n")
      );
    }
  });

  if (invalid.length > 0) {
    console.warn(
      `[NonQMLenderSchema] ⚠️  ${invalid.length} of ${lenders.length} lender records ` +
      `from "${source}" were REJECTED due to schema violations. ` +
      `These lenders will NOT appear in match results.`
    );
  } else {
    console.log(
      `[NonQMLenderSchema] ✅ All ${valid.length} lender records from "${source}" passed validation.`
    );
  }

  return valid;
}


// ─── Controlled Exception Checker ────────────────────────────────────────────

/**
 * Determines whether a placeholder result may be elevated to ELIGIBLE
 * under the Controlled Exception Rule (PLACEHOLDER_GOVERNANCE.md Section 2.3).
 *
 * ALL seven criteria must be true. If any fails, returns false.
 *
 * @param {object} scenario   - Normalized scenario inputs
 * @param {object} evalResult - Result from the scoring engine for this lender
 * @returns {boolean}
 */
export function placeholderMeetsControlledException(scenario, evalResult, guidelines) {
  const {
    creditScore,
    ltv,
    loanAmount,
    propertyType,
    occupancy,
    incomeDocType,
    reservesMonths,
    dscr,
  } = scenario;

  const { overlayRisk, confidenceScore, seasoningViolation, conditionalFlags } = evalResult;

  // Criterion 1: Overlay risk must be LOW
  if (overlayRisk !== "LOW") return false;

  // Criterion 2: Confidence score >= 80%
  if (!isNum(confidenceScore) || confidenceScore < 0.80) return false;

  // Criterion 3: All required scenario fields present and non-null
  const requiredFields = { creditScore, ltv, loanAmount, propertyType, occupancy, incomeDocType, reservesMonths };
  for (const [field, value] of Object.entries(requiredFields)) {
    if (value === null || value === undefined || value === "") return false;
  }
  // dscr required for DSCR program
  const isDSCRProgram = incomeDocType === "DSCR" ||
    (evalResult.matchedProgram && evalResult.matchedProgram.includes("DSCR"));
  if (isDSCRProgram && (dscr === null || dscr === undefined)) return false;

  // Criterion 4: No seasoning violations triggered
  if (seasoningViolation === true) return false;

  // Criterion 5: No conditional flags from overlay risk engine
  if (conditionalFlags && conditionalFlags.length > 0) return false;

  // Criterion 6: LTV cushion >= 5% below program maximum
  const maxLTV = evalResult.applicableMaxLTV;
  if (!isNum(maxLTV) || !isNum(ltv)) return false;
  if ((maxLTV - ltv) < 5) return false;

  // Criterion 7: FICO cushion >= 20 points above program minimum
  const minFICO = guidelines?.minFICO;
  if (!isNum(minFICO) || !isNum(creditScore)) return false;
  if ((creditScore - minFICO) < 20) return false;

  // All 7 criteria met
  return true;
}


// ─── Eligibility Status Labels ────────────────────────────────────────────────

/**
 * Returns the UI-safe eligibility status label for a lender result.
 * Placeholders that meet the controlled exception get the modified label.
 *
 * This is the ONLY function that should produce eligibility status strings
 * for display — centralizes label logic for consistency.
 */
export function getEligibilityLabel(status, dataSource) {
  if (status === "INELIGIBLE") return "Ineligible";
  if (status === "CONDITIONAL") return "Conditional";
  if (status === "ELIGIBLE") {
    // Placeholders that qualified under controlled exception
    if (dataSource === DATA_SOURCES.PLACEHOLDER) {
      return "Eligible (Profile-Based Estimate)";
    }
    return "Eligible";
  }
  return "Unknown";
}

/**
 * Returns the CSS class suffix for a given eligibility status + dataSource.
 * Used by AlternativeLenderCard.jsx for badge styling.
 */
export function getEligibilityClass(status, dataSource) {
  if (status === "INELIGIBLE")  return "ineligible";
  if (status === "CONDITIONAL") return "conditional";
  if (status === "ELIGIBLE") {
    return dataSource === DATA_SOURCES.PLACEHOLDER
      ? "eligible-placeholder"
      : "eligible";
  }
  return "unknown";
}


// ─── Tier Display ─────────────────────────────────────────────────────────────

/**
 * Returns the UI-safe tier display string.
 * ALWAYS uses tierBasis — never exposes A/B/C letter grades in UI.
 * (PLACEHOLDER_GOVERNANCE.md Section 4.1)
 */
export function getTierDisplayLabel(lender) {
  if (lender.dataSource === DATA_SOURCES.REAL) {
    return `Verified — ${lender.shortName}`;
  }
  // Placeholder: show tierBasis + "Profile"
  return `${lender.tierBasis} Profile`;
}


// ─── Schema Version ───────────────────────────────────────────────────────────

export const SCHEMA_VERSION = "1.1.0";
export const SCHEMA_EFFECTIVE_DATE = "2026-02-18";

console.log(`[NonQMLenderSchema] Loaded v${SCHEMA_VERSION} — ${SCHEMA_EFFECTIVE_DATE}`);
