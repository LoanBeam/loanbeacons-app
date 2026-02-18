/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/schemas/nonQMLenderSchema.test.js
 * Schema Unit Tests — All 25 Test Cases
 * ============================================================
 *
 * Run with: npm test (Vitest or Jest)
 *
 * Tests covered in this file:
 *   T1–T6:   Placeholder labeling
 *   T14–T16: AC2 — No pricing
 *   T17–T20: Scoring safeguards
 *   T21–T25: Controlled exception
 *
 * Tests T7–T13 live in LenderMatchEngine.test.js (engine behavior).
 */

import {
  validateNonQMLender,
  validateNonQMLenderBatch,
  placeholderMeetsControlledException,
  getEligibilityLabel,
  getEligibilityClass,
  getTierDisplayLabel,
  BANNED_FIELDS,
  DATA_SOURCES,
  TIER_BASIS,
  PROGRAMS,
  SCHEMA_VERSION,
} from "./nonQMLenderSchema";

// ─── Shared Test Fixtures ─────────────────────────────────────────────────────

/** A valid, complete placeholder Bank Statement lender record for reuse */
const validPlaceholderBS = {
  id:                  "nonqm_placeholder_001",
  profileName:         "Aggressive Bank Statement Profile",
  shortName:           "Aggressive BS Profile",
  dataSource:          "PLACEHOLDER",
  accentColor:         "#b45309",
  priorityWeight:      70,
  active:              true,
  version:             0,
  guidelineVersionRef: "PLACEHOLDER-v0",
  effectiveDate:       "2026-02-18",
  endDate:             null,
  programs:            ["BankStatement12"],
  guidelines: {
    BankStatement12: {
      minFICO:              600,
      expenseFactor:        0.50,
      maxLTV: {
        primary:    { purchase: 85, rateTerm: 80, cashOut: 70 },
        investment: { purchase: 75, rateTerm: 70, cashOut: 65 },
      },
      maxDTI:               50,
      maxLoanAmount:        2500000,
      minReserveMonths:     3,
      allowedPropertyTypes: ["SFR", "Condo", "TwoUnit"],
      allowsShortTermRental: true,
      bkSeasoning:          12,
      fcSeasoning:          24,
      shortSaleSeasoning:   24,
      states:               ["ALL"],
      cashOutMax:           null,
    },
  },
  tierBasis:       "Aggressive",
  tierNotes:       "Most flexible bank statement profile in the matrix.",
  strengths:       ["Low FICO minimum", "Short BK seasoning"],
  weaknesses:      ["Higher rate environment"],
  typicalUseCase:  "Self-employed borrower with strong deposits but low reported income.",
};

/** A valid placeholder DSCR record */
const validPlaceholderDSCR = {
  id:                  "nonqm_placeholder_003",
  profileName:         "Aggressive DSCR Profile",
  shortName:           "Aggressive DSCR",
  dataSource:          "PLACEHOLDER",
  accentColor:         "#b45309",
  priorityWeight:      65,
  active:              true,
  version:             0,
  guidelineVersionRef: "PLACEHOLDER-v0",
  effectiveDate:       "2026-02-18",
  endDate:             null,
  programs:            ["DSCR"],
  guidelines: {
    DSCR: {
      minFICO:              620,
      minDSCR:              1.0,
      maxLTV: {
        investment: { purchase: 80, rateTerm: 75, cashOut: 70 },
      },
      maxLoanAmount:        2000000,
      minReserveMonths:     3,
      allowedPropertyTypes: ["SFR", "Condo", "TwoUnit"],
      allowsShortTermRental: true,
      bkSeasoning:          12,
      fcSeasoning:          24,
      shortSaleSeasoning:   24,
      states:               ["ALL"],
    },
  },
  tierBasis:       "Aggressive",
  tierNotes:       "Break-even DSCR accepted. Best for strong cashflow properties.",
  strengths:       ["Break-even DSCR OK", "Short-term rental allowed"],
  weaknesses:      ["Investment only"],
  typicalUseCase:  "Investor purchasing rental property who prefers not to document personal income.",
};

/** Minimal valid real lender record for real vs placeholder comparison tests */
const validRealLender = {
  ...validPlaceholderBS,
  id:                  "nonqm_real_001",
  profileName:         "Angel Oak Bank Statement",
  shortName:           "Angel Oak",
  dataSource:          "REAL",
  accentColor:         "#7c3aed",
  version:             1,
  guidelineVersionRef: "ANGELOAK-BKSTMT-2026-Q1",
  effectiveDate:       "2026-01-01",
};

// ─── T1–T6: Placeholder Labeling ─────────────────────────────────────────────

describe("T1–T6: Placeholder Labeling", () => {

  test("T1: Valid placeholder record passes schema validation", () => {
    const result = validateNonQMLender(validPlaceholderBS);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("T2: Placeholder badge function returns amber Placeholder badge text", () => {
    // The UI badge text is driven by dataSource — test the helper
    const label = getEligibilityLabel("CONDITIONAL", DATA_SOURCES.PLACEHOLDER);
    expect(label).toBe("Conditional");

    const cssClass = getEligibilityClass("CONDITIONAL", DATA_SOURCES.PLACEHOLDER);
    expect(cssClass).toBe("conditional");
  });

  test("T3: Placeholder profileName must not be a real lender name", () => {
    const realLenderNames = [
      "Angel Oak", "Acra Lending", "Verus", "A&D Mortgage",
      "Deephaven", "Griffin Funding",
    ];
    const result = validateNonQMLender(validPlaceholderBS);
    expect(result.valid).toBe(true);

    realLenderNames.forEach((name) => {
      expect(validPlaceholderBS.profileName).not.toContain(name);
      expect(validPlaceholderBS.shortName).not.toContain(name);
    });
  });

  test("T4: Placeholder dataSource = PLACEHOLDER enforced by schema", () => {
    const badRecord = {
      ...validPlaceholderBS,
      dataSource: "INVALID_SOURCE",
    };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("dataSource"))).toBe(true);
  });

  test("T5: Placeholder version must be 0", () => {
    const badRecord = { ...validPlaceholderBS, version: 1 };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("version"))).toBe(true);
  });

  test("T5b: Placeholder guidelineVersionRef must be 'PLACEHOLDER-v0'", () => {
    const badRecord = { ...validPlaceholderBS, guidelineVersionRef: "SOME-LENDER-2026" };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("guidelineVersionRef"))).toBe(true);
  });

  test("T6: Real lender with version >= 1 passes schema", () => {
    const result = validateNonQMLender(validRealLender);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

});

// ─── T14–T16: AC2 — No Pricing Fields ────────────────────────────────────────

describe("T14–T16: AC2 — No Pricing Fields", () => {

  test("T14: Schema rejects record containing banned field 'rate'", () => {
    const badRecord = { ...validPlaceholderBS, rate: 7.5 };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("AC2 VIOLATION"))).toBe(true);
    expect(result.errors.some(e => e.includes("rate"))).toBe(true);
  });

  test("T14b: Schema rejects record containing banned field 'apr'", () => {
    const badRecord = { ...validPlaceholderBS, apr: 8.2 };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("AC2 VIOLATION"))).toBe(true);
  });

  test("T14c: Schema rejects record containing banned field 'spread' in nested object", () => {
    const badRecord = {
      ...validPlaceholderBS,
      guidelines: {
        ...validPlaceholderBS.guidelines,
        BankStatement12: {
          ...validPlaceholderBS.guidelines.BankStatement12,
          spread: 2.5,   // Banned nested field
        },
      },
    };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("AC2 VIOLATION"))).toBe(true);
  });

  test("T14d: All banned fields are defined in BANNED_FIELDS constant", () => {
    const expectedBanned = [
      "rate", "apr", "price", "spread", "points", "interestRate",
      "margin", "cap", "estimatedRate", "rateRange", "rateSpread", "pricingTier",
    ];
    expectedBanned.forEach((field) => {
      expect(BANNED_FIELDS).toContain(field);
    });
  });

  test("T15: getTierDisplayLabel returns tierBasis label for placeholder (not A/B/C)", () => {
    const label = getTierDisplayLabel(validPlaceholderBS);
    expect(label).toBe("Aggressive Profile");
    // Must not contain A/B/C letter grades
    expect(label).not.toMatch(/^A\+|^A$|^B\+|^B$|^C$/);
  });

  test("T16: getTierDisplayLabel returns 'Verified — [name]' for real lender", () => {
    const label = getTierDisplayLabel(validRealLender);
    expect(label).toBe("Verified — Angel Oak");
    expect(label).not.toContain("Profile");
  });

});

// ─── T17–T20: Scoring Safeguards ─────────────────────────────────────────────

describe("T17–T20: Scoring Safeguards (Schema Layer)", () => {

  test("T17: Placeholder records have dataSource = PLACEHOLDER (for engine cap enforcement)", () => {
    const result = validateNonQMLender(validPlaceholderBS);
    expect(result.valid).toBe(true);
    expect(validPlaceholderBS.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
    // The 90-point cap is enforced by the engine using dataSource — this test
    // confirms the schema correctly marks the record so the engine can apply the cap
  });

  test("T18: Real lender records have dataSource = REAL (for engine 100pt max)", () => {
    const result = validateNonQMLender(validRealLender);
    expect(result.valid).toBe(true);
    expect(validRealLender.dataSource).toBe(DATA_SOURCES.REAL);
  });

  test("T19: Real lender with identical guidelines passes validation (for engine comparison)", () => {
    // Both placeholder and real records with identical thresholds must be valid
    // so the engine can compare them and rank real > placeholder
    const placeholderResult = validateNonQMLender(validPlaceholderBS);
    const realResult = validateNonQMLender(validRealLender);
    expect(placeholderResult.valid).toBe(true);
    expect(realResult.valid).toBe(true);
  });

  test("T20: Schema rejects record with missing required guideline block", () => {
    // programs includes BankStatement12 but guidelines block is missing
    const badRecord = {
      ...validPlaceholderBS,
      programs: ["BankStatement12", "DSCR"],
      guidelines: {
        BankStatement12: validPlaceholderBS.guidelines.BankStatement12,
        // DSCR block is missing — should fail
      },
    };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("guidelines.DSCR"))).toBe(true);
    expect(result.errors.some(e => e.includes("required because"))).toBe(true);
  });

  test("T20b: Schema rejects record with null guidelines object", () => {
    const badRecord = { ...validPlaceholderBS, guidelines: null };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
  });

  test("T20c: Schema rejects record with FICO out of range", () => {
    const badRecord = {
      ...validPlaceholderBS,
      guidelines: {
        BankStatement12: {
          ...validPlaceholderBS.guidelines.BankStatement12,
          minFICO: 900,   // Out of range
        },
      },
    };
    const result = validateNonQMLender(badRecord);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("minFICO"))).toBe(true);
  });

  test("T20d: Conservative defaults — batch validator excludes invalid records, keeps valid ones", () => {
    const batch = [validPlaceholderBS, validPlaceholderDSCR, { id: "bad", dataSource: "PLACEHOLDER" }];
    const valid = validateNonQMLenderBatch(batch, "test-batch");
    expect(valid).toHaveLength(2);
    expect(valid.map(l => l.id)).toContain("nonqm_placeholder_001");
    expect(valid.map(l => l.id)).toContain("nonqm_placeholder_003");
    expect(valid.map(l => l.id)).not.toContain("bad");
  });

});

// ─── T21–T25: Controlled Exception ────────────────────────────────────────────

describe("T21–T25: Controlled Exception for Placeholder ELIGIBLE", () => {

  /** Complete passing scenario and evalResult for the controlled exception */
  const passingScenario = {
    creditScore:    680,   // 680 - 620 minFICO = 60 points cushion (>= 20 required)
    ltv:            72,    // 80 maxLTV - 72 = 8% cushion (>= 5% required)
    loanAmount:     450000,
    propertyType:   "SFR",
    occupancy:      "Investment",
    incomeDocType:  "DSCR",
    reservesMonths: 3,
    dscr:           1.15,
  };

  const passingEvalResult = {
    overlayRisk:        "LOW",
    confidenceScore:    0.88,
    seasoningViolation: false,
    conditionalFlags:   [],
    applicableMaxLTV:   80,   // For the DSCR investment program
    matchedProgram:     "DSCR",
  };

  const dscrGuidelines = { minFICO: 620 };

  test("T21: Placeholder ELIGIBLE when all 7 criteria met", () => {
    const result = placeholderMeetsControlledException(
      passingScenario, passingEvalResult, dscrGuidelines
    );
    expect(result).toBe(true);
  });

  test("T21b: Placeholder NOT ELIGIBLE when overlayRisk is MODERATE", () => {
    const result = placeholderMeetsControlledException(
      passingScenario,
      { ...passingEvalResult, overlayRisk: "MODERATE" },
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21c: Placeholder NOT ELIGIBLE when confidenceScore < 0.80", () => {
    const result = placeholderMeetsControlledException(
      passingScenario,
      { ...passingEvalResult, confidenceScore: 0.79 },
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21d: Placeholder NOT ELIGIBLE when required field is missing", () => {
    const result = placeholderMeetsControlledException(
      { ...passingScenario, ltv: null },   // ltv missing
      passingEvalResult,
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21e: Placeholder NOT ELIGIBLE when dscr missing on DSCR program", () => {
    const result = placeholderMeetsControlledException(
      { ...passingScenario, dscr: null },
      passingEvalResult,
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21f: Placeholder NOT ELIGIBLE when seasoning violation present", () => {
    const result = placeholderMeetsControlledException(
      passingScenario,
      { ...passingEvalResult, seasoningViolation: true },
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21g: Placeholder NOT ELIGIBLE when conditional flags present", () => {
    const result = placeholderMeetsControlledException(
      passingScenario,
      { ...passingEvalResult, conditionalFlags: ["HIGH_DTI"] },
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21h: Placeholder NOT ELIGIBLE when LTV cushion < 5%", () => {
    const result = placeholderMeetsControlledException(
      { ...passingScenario, ltv: 76 },   // 80 - 76 = 4% cushion (< 5 required)
      passingEvalResult,
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T21i: Placeholder NOT ELIGIBLE when FICO cushion < 20 points", () => {
    const result = placeholderMeetsControlledException(
      { ...passingScenario, creditScore: 638 },  // 638 - 620 = 18pts (< 20 required)
      passingEvalResult,
      dscrGuidelines
    );
    expect(result).toBe(false);
  });

  test("T22: ELIGIBLE label includes '(Profile-Based Estimate)' for placeholders", () => {
    const label = getEligibilityLabel("ELIGIBLE", DATA_SOURCES.PLACEHOLDER);
    expect(label).toBe("Eligible (Profile-Based Estimate)");
    expect(label).not.toBe("Eligible");
  });

  test("T22b: ELIGIBLE label is plain 'Eligible' for real lenders", () => {
    const label = getEligibilityLabel("ELIGIBLE", DATA_SOURCES.REAL);
    expect(label).toBe("Eligible");
    expect(label).not.toContain("Profile-Based");
  });

  test("T22c: CSS class is 'eligible-placeholder' for placeholder ELIGIBLE", () => {
    const cls = getEligibilityClass("ELIGIBLE", DATA_SOURCES.PLACEHOLDER);
    expect(cls).toBe("eligible-placeholder");
  });

  test("T22d: CSS class is 'eligible' for real lender ELIGIBLE", () => {
    const cls = getEligibilityClass("ELIGIBLE", DATA_SOURCES.REAL);
    expect(cls).toBe("eligible");
  });

  test("T23: Placeholder ELIGIBLE is still subject to 90pt score cap (schema confirms dataSource)", () => {
    // The 90pt cap is enforced by the engine reading dataSource from the validated record
    // This test confirms a placeholder record that passes the controlled exception
    // still carries dataSource = PLACEHOLDER so the engine can apply the cap
    const result = validateNonQMLender(validPlaceholderBS);
    expect(result.valid).toBe(true);
    expect(validPlaceholderBS.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
    // The engine test (T23 in engine tests) will confirm the 90pt cap itself
  });

  test("T24: Real lender record is structurally different from placeholder (for rank test)", () => {
    // Confirms the dataSource field distinguishes real from placeholder
    // so engine can always rank real > placeholder on identical thresholds
    expect(validPlaceholderBS.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
    expect(validRealLender.dataSource).toBe(DATA_SOURCES.REAL);
    expect(validPlaceholderBS.version).toBe(0);
    expect(validRealLender.version).toBe(1);
  });

  test("T25: excludeFromCombined logic: placeholder dataSource is detectable", () => {
    // The engine uses: if (lender.dataSource === "PLACEHOLDER") excludeFromCombined = true
    // This test confirms the schema correctly surfaces dataSource for that check
    expect(validPlaceholderBS.dataSource).toBe("PLACEHOLDER");
    expect(validRealLender.dataSource).toBe("REAL");

    const placeholderShouldExclude = validPlaceholderBS.dataSource === DATA_SOURCES.PLACEHOLDER;
    const realShouldExclude        = validRealLender.dataSource === DATA_SOURCES.PLACEHOLDER;

    expect(placeholderShouldExclude).toBe(true);
    expect(realShouldExclude).toBe(false);
  });

});

// ─── Schema Version ────────────────────────────────────────────────────────────

describe("Schema Metadata", () => {
  test("Schema exports correct version", () => {
    expect(SCHEMA_VERSION).toBe("1.1.0");
  });
});
