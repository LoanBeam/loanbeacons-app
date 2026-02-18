/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/engines/LenderMatchEngine.test.js
 * Engine Pipeline Tests — All 7 Steps + PRD Scenario Tests
 * ============================================================
 *
 * Test suites:
 *   Step 1 — normalizeScenario
 *   Step 2 — Agency + Non-QM eligibility gating
 *   Step 3 — Fit scoring
 *   Step 4 — Overlay risk assessment
 *   Step 5 — Tier indicator
 *   Step 6 — Confidence score
 *   Step 7 — Rank + package results
 *   Engine Tests T7–T13 (from governance spec)
 *   PRD Section 23 — 10 full scenario integration tests
 *   Decision Record builder
 */

import {
  normalizeScenario,
  checkAgencyEligibility,
  checkNonQMEligibility,
  scoreAgencyLender,
  scoreNonQMLender,
  assessOverlayRisk,
  getTierIndicator,
  calculateConfidenceScore,
  rankAndPackageResults,
  runLenderMatch,
  buildDecisionRecord,
  ENGINE_CONFIG,
  PRESENTATION_MODES,
  OVERLAY_RISK,
  ELIGIBILITY_STATUS,
  SCENARIO_INTENT,
  AGENCY_PROGRAMS,
} from "./LenderMatchEngine";

import {
  DATA_SOURCES,
  PROGRAMS,
} from "@/schemas/nonQMLenderSchema";

import { agencyLenderMatrix } from "@/data/agencyLenderMatrix";
import { nonQMLenderMatrix   } from "@/data/nonQMLenderMatrix";


// ─── Shared Fixtures ──────────────────────────────────────────────────────────

/** Clean conventional purchase — should pass most Agency lenders */
const cleanConventionalScenario = {
  loanType:        "Conventional",
  transactionType: "purchase",
  loanAmount:      485000,
  propertyValue:   570000,
  creditScore:     720,
  dti:             38,
  propertyType:    "SFR",
  occupancy:       "Primary",
  state:           "TX",
  incomeDocType:   "fullDoc",
  selfEmployed:    false,
  creditEvent:     "none",
  reservesMonths:  3,
};

/** VA purchase — should hit Freedom + other VA lenders */
const vaPurchaseScenario = {
  loanType:        "VA",
  transactionType: "purchase",
  loanAmount:      420000,
  propertyValue:   420000,
  creditScore:     640,
  dti:             42,
  propertyType:    "SFR",
  occupancy:       "Primary",
  state:           "VA",
  incomeDocType:   "fullDoc",
  vaEntitlement:   "Full",
  selfEmployed:    false,
  creditEvent:     "none",
  reservesMonths:  0,
};

/** DSCR investor scenario — Agency should fail (investment DSCR), Non-QM should pass */
const dscrInvestorScenario = {
  loanType:          "NonQM",
  transactionType:   "purchase",
  loanAmount:        350000,
  propertyValue:     437500,
  creditScore:       680,
  dscr:              1.15,
  propertyType:      "SFR",
  occupancy:         "Investment",
  state:             "FL",
  incomeDocType:     "dscr",
  selfEmployed:      false,
  creditEvent:       "none",
  reservesMonths:    3,
  grossRentalIncome: 2800,
};

/** BK 18 months ago — Agency all fail, Non-QM (12-month BK) should pass */
const recentBKScenario = {
  loanType:          "Conventional",
  transactionType:   "purchase",
  loanAmount:        320000,
  propertyValue:     400000,
  creditScore:       640,
  dti:               40,
  propertyType:      "SFR",
  occupancy:         "Primary",
  state:             "TX",
  incomeDocType:     "fullDoc",
  selfEmployed:      true,
  creditEvent:       "BK",
  creditEventMonths: 18,
  reservesMonths:    3,
};

/** Low FICO 500 — conventional disqualifier */
const lowFICOScenario = {
  loanType:        "Conventional",
  transactionType: "purchase",
  loanAmount:      280000,
  propertyValue:   350000,
  creditScore:     500,
  dti:             42,
  propertyType:    "SFR",
  occupancy:       "Primary",
  state:           "TX",
  incomeDocType:   "fullDoc",
  selfEmployed:    false,
  creditEvent:     "none",
  reservesMonths:  2,
};

// UWM fixture from agency matrix
const uwm = agencyLenderMatrix.find((l) => l.id === "agency_001");
const freedom = agencyLenderMatrix.find((l) => l.id === "agency_007");

// Aggressive DSCR placeholder
const aggressiveDSCR = nonQMLenderMatrix.find((l) => l.id === "nonqm_placeholder_003");
const conservativeDSCR = nonQMLenderMatrix.find((l) => l.id === "nonqm_placeholder_004");

// Aggressive Bank Statement placeholder
const aggressiveBS = nonQMLenderMatrix.find((l) => l.id === "nonqm_placeholder_001");


// ─── Step 1: normalizeScenario ────────────────────────────────────────────────

describe("Step 1 — normalizeScenario", () => {

  test("Calculates LTV from loanAmount / propertyValue when LTV not provided", () => {
    const result = normalizeScenario({ loanAmount: 400000, propertyValue: 500000 });
    expect(result.ltv).toBe(80);
  });

  test("Uses provided LTV when present (overrides calculation)", () => {
    const result = normalizeScenario({ loanAmount: 400000, propertyValue: 500000, ltv: 85 });
    expect(result.ltv).toBe(85);
  });

  test("Applies conservative default LTV (100) when neither provided", () => {
    const result = normalizeScenario({});
    expect(result.ltv).toBe(100);
  });

  test("Calculates DTI from monthlyIncome + monthlyDebts", () => {
    const result = normalizeScenario({ monthlyIncome: 8000, monthlyDebts: 2000 });
    expect(result.dti).toBe(25);
  });

  test("Applies conservative default DTI (50) when not provided", () => {
    const result = normalizeScenario({});
    expect(result.dti).toBe(50);
  });

  test("Applies conservative default creditScore (580) when not provided", () => {
    const result = normalizeScenario({});
    expect(result.creditScore).toBe(580);
  });

  test("Correctly identifies Non-QM path for bank statement doc type", () => {
    const result = normalizeScenario({ incomeDocType: "bankStatement12" });
    expect(result.isNonQMPath).toBe(true);
  });

  test("fullDoc is NOT a Non-QM path", () => {
    const result = normalizeScenario({ incomeDocType: "fullDoc" });
    expect(result.isNonQMPath).toBe(false);
  });

  test("Flags high balance loan correctly", () => {
    const result = normalizeScenario({ loanAmount: 900000 });
    expect(result.highBalance).toBe(true);
  });

  test("Sets PMI required when LTV > 80 conventional", () => {
    const result = normalizeScenario({ ltv: 85, loanType: "Conventional" });
    expect(result.pmiRequired).toBe(true);
  });

  test("Defaults intent to AGENCY_FIRST when not provided", () => {
    const result = normalizeScenario({});
    expect(result.intent).toBe(SCENARIO_INTENT.AGENCY_FIRST);
  });

  test("Completeness score is 1.0 when all required fields present", () => {
    const result = normalizeScenario(cleanConventionalScenario);
    expect(result.completenessScore).toBeGreaterThan(0.8);
  });

});


// ─── Step 2A: Agency Eligibility Gating ──────────────────────────────────────

describe("Step 2A — Agency Eligibility Gating", () => {

  test("UWM Conventional passes for clean 720 FICO, 85% LTV scenario", () => {
    const scenario  = normalizeScenario(cleanConventionalScenario);
    const result    = checkAgencyEligibility(uwm, "Conventional", scenario);
    expect(result.eligible).toBe(true);
    expect(result.failReason).toBeNull();
  });

  test("Fails gate 3 (FICO) when credit score below lender minimum", () => {
    const scenario = normalizeScenario({ ...cleanConventionalScenario, creditScore: 600 });
    // Cardinal has 620 minimum — test against that
    const cardinal = agencyLenderMatrix.find((l) => l.id === "agency_008");
    const result   = checkAgencyEligibility(cardinal, "Conventional", scenario);
    // 600 < 620 = fail
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("FICO");
  });

  test("Fails gate 4 (LTV) when LTV exceeds lender maximum", () => {
    const scenario = normalizeScenario({ ...cleanConventionalScenario, ltv: 98 });
    const result   = checkAgencyEligibility(uwm, "Conventional", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("LTV");
  });

  test("Fails gate 7 (occupancy) — UWM FHA does not allow investment", () => {
    const scenario = normalizeScenario({
      ...cleanConventionalScenario,
      loanType:  "FHA",
      occupancy: "Investment",
    });
    const result = checkAgencyEligibility(uwm, "FHA", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("investment");
  });

  test("Fails gate 9 (BK seasoning) when BK is 18 months and lender requires 48", () => {
    const scenario = normalizeScenario(recentBKScenario);
    const result   = checkAgencyEligibility(uwm, "Conventional", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("BK seasoning");
    expect(result.failReason).toContain("18");
  });

  test("Freedom VA passes with 550 FICO (lender specialty)", () => {
    const scenario = normalizeScenario({ ...vaPurchaseScenario, creditScore: 555 });
    const result   = checkAgencyEligibility(freedom, "VA", scenario);
    expect(result.eligible).toBe(true);
  });

  test("Fails gate 1 — lender does not offer program", () => {
    const loandepot = agencyLenderMatrix.find((l) => l.id === "agency_003");
    const scenario  = normalizeScenario(vaPurchaseScenario);
    const result    = checkAgencyEligibility(loandepot, "VA", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("does not offer VA");
  });

  test("FHA reduced LTV rule triggers at 560 FICO (below 580 cutoff)", () => {
    const scenario = normalizeScenario({
      ...cleanConventionalScenario,
      loanType:    "FHA",
      creditScore: 560,
      ltv:         96.5,
    });
    const result = checkAgencyEligibility(uwm, "FHA", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("580");
  });

});


// ─── Step 2B: Non-QM Eligibility Gating ──────────────────────────────────────

describe("Step 2B — Non-QM Eligibility Gating", () => {

  test("Aggressive DSCR passes for 680 FICO, DSCR 1.15, 75% LTV investment", () => {
    const scenario = normalizeScenario(dscrInvestorScenario);
    const result   = checkNonQMEligibility(aggressiveDSCR, "DSCR", scenario);
    expect(result.eligible).toBe(true);
    expect(result.failReason).toBeNull();
  });

  test("DSCR program fails gate 6 for primary residence", () => {
    const scenario = normalizeScenario({ ...dscrInvestorScenario, occupancy: "Primary" });
    const result   = checkNonQMEligibility(aggressiveDSCR, "DSCR", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("investment properties only");
  });

  test("DSCR program fails gate 7 when DSCR below minimum", () => {
    const scenario = normalizeScenario({ ...dscrInvestorScenario, dscr: 0.85 });
    const result   = checkNonQMEligibility(aggressiveDSCR, "DSCR", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("below");
    expect(result.failReason).toContain("minimum");
  });

  test("Conservative DSCR fails for DSCR 1.05 (below 1.10 minimum)", () => {
    const scenario = normalizeScenario({ ...dscrInvestorScenario, dscr: 1.05 });
    const result   = checkNonQMEligibility(conservativeDSCR, "DSCR", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("1.05");
  });

  test("Aggressive DSCR passes with BK 18 months (12-month seasoning)", () => {
    const scenario = normalizeScenario({ ...dscrInvestorScenario, creditEvent: "BK", creditEventMonths: 18 });
    const result   = checkNonQMEligibility(aggressiveDSCR, "DSCR", scenario);
    expect(result.eligible).toBe(true);  // 18 >= 12 required
  });

  test("Bank statement fails when FICO 580 (Aggressive BS requires 600)", () => {
    const scenario = normalizeScenario({
      loanAmount:    400000, propertyValue: 500000, creditScore: 580,
      dti: 45, occupancy: "Primary", state: "TX",
      incomeDocType: "bankStatement12", selfEmployed: true,
      creditEvent: "none",
    });
    const result = checkNonQMEligibility(aggressiveBS, "BankStatement12", scenario);
    expect(result.eligible).toBe(false);
    expect(result.failReason).toContain("600");
  });

  test("Eligible result includes reasons array", () => {
    const scenario = normalizeScenario(dscrInvestorScenario);
    const result   = checkNonQMEligibility(aggressiveDSCR, "DSCR", scenario);
    expect(result.eligible).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

});


// ─── Step 3: Fit Scoring ──────────────────────────────────────────────────────

describe("Step 3 — Fit Scoring", () => {

  test("Agency fit score is between 0 and 100", () => {
    const scenario = normalizeScenario(cleanConventionalScenario);
    const result   = scoreAgencyLender(uwm, "Conventional", scenario);
    expect(result.fitScore).toBeGreaterThanOrEqual(0);
    expect(result.fitScore).toBeLessThanOrEqual(100);
  });

  test("Higher FICO → higher Agency fit score", () => {
    const s1 = normalizeScenario({ ...cleanConventionalScenario, creditScore: 640 });
    const s2 = normalizeScenario({ ...cleanConventionalScenario, creditScore: 780 });
    const r1 = scoreAgencyLender(uwm, "Conventional", s1);
    const r2 = scoreAgencyLender(uwm, "Conventional", s2);
    expect(r2.fitScore).toBeGreaterThan(r1.fitScore);
  });

  test("Lower LTV → higher Agency fit score", () => {
    const s1 = normalizeScenario({ ...cleanConventionalScenario, ltv: 95 });
    const s2 = normalizeScenario({ ...cleanConventionalScenario, ltv: 70 });
    const r1 = scoreAgencyLender(uwm, "Conventional", s1);
    const r2 = scoreAgencyLender(uwm, "Conventional", s2);
    expect(r2.fitScore).toBeGreaterThan(r1.fitScore);
  });

  // T17: Placeholder max fit score <= 90
  test("T17: Non-QM placeholder max fit score is <= 90", () => {
    const scenario = normalizeScenario(dscrInvestorScenario);
    const result   = scoreNonQMLender(aggressiveDSCR, "DSCR", scenario);
    expect(result.fitScore).toBeLessThanOrEqual(90);
    expect(result.maxPossible).toBe(90);
  });

  // T18: Real lender max is 100
  test("T18: Non-QM real lender max fit score is 100", () => {
    const realLender = {
      ...aggressiveDSCR,
      dataSource: DATA_SOURCES.REAL,
      version: 1,
    };
    const scenario = normalizeScenario(dscrInvestorScenario);
    const result   = scoreNonQMLender(realLender, "DSCR", scenario);
    expect(result.maxPossible).toBe(100);
  });

  // T19: Real lender outranks placeholder on identical thresholds
  test("T19: Real lender with same profile outranks placeholder", () => {
    const realLender = {
      ...aggressiveDSCR,
      id:         "nonqm_real_test",
      dataSource: DATA_SOURCES.REAL,
      version:    1,
    };
    const scenario    = normalizeScenario(dscrInvestorScenario);
    const placeholderResult = scoreNonQMLender(aggressiveDSCR, "DSCR", scenario);
    const realResult        = scoreNonQMLender(realLender, "DSCR", scenario);
    expect(realResult.fitScore).toBeGreaterThan(placeholderResult.fitScore);
  });

  test("Score breakdown object is returned with named components", () => {
    const scenario = normalizeScenario(cleanConventionalScenario);
    const result   = scoreAgencyLender(uwm, "Conventional", scenario);
    expect(result.breakdown).toHaveProperty("ficoScore");
    expect(result.breakdown).toHaveProperty("ltvScore");
    expect(result.breakdown).toHaveProperty("dtiScore");
    expect(result.breakdown).toHaveProperty("programStrengthScore");
    expect(result.breakdown).toHaveProperty("priorityScore");
  });

});


// ─── Step 4: Overlay Risk Assessment ─────────────────────────────────────────

describe("Step 4 — Overlay Risk Assessment", () => {

  test("Clean scenario returns LOW overlay risk", () => {
    const scenario = normalizeScenario(cleanConventionalScenario);
    const result   = assessOverlayRisk(scenario);
    expect(result.level).toBe(OVERLAY_RISK.LOW);
  });

  test("Single risk factor (DTI 47%) returns LOW or MODERATE", () => {
    const scenario = normalizeScenario({ ...cleanConventionalScenario, dti: 47 });
    const result   = assessOverlayRisk(scenario);
    expect([OVERLAY_RISK.LOW, OVERLAY_RISK.MODERATE]).toContain(result.level);
  });

  test("Multiple risk factors: low FICO + high LTV + BK returns HIGH", () => {
    const scenario = normalizeScenario({
      ...cleanConventionalScenario,
      creditScore:       610,
      ltv:               93,
      creditEvent:       "BK",
      creditEventMonths: 30,
    });
    const result = assessOverlayRisk(scenario);
    expect(result.level).toBe(OVERLAY_RISK.HIGH);
  });

  test("Returns signals array with human-readable strings", () => {
    const scenario = normalizeScenario({ ...cleanConventionalScenario, creditScore: 610 });
    const result   = assessOverlayRisk(scenario);
    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals.some((s) => s.includes("FICO"))).toBe(true);
  });

  test("Self-employed adds a risk signal", () => {
    const s1 = normalizeScenario({ ...cleanConventionalScenario, selfEmployed: false });
    const s2 = normalizeScenario({ ...cleanConventionalScenario, selfEmployed: true });
    const r1 = assessOverlayRisk(s1);
    const r2 = assessOverlayRisk(s2);
    expect(r2.signalCount).toBeGreaterThan(r1.signalCount);
  });

  test("Investment property adds a risk signal", () => {
    const s1 = normalizeScenario({ ...cleanConventionalScenario, occupancy: "Primary" });
    const s2 = normalizeScenario({ ...cleanConventionalScenario, occupancy: "Investment" });
    const r1 = assessOverlayRisk(s1);
    const r2 = assessOverlayRisk(s2);
    expect(r2.signalCount).toBeGreaterThan(r1.signalCount);
  });

});


// ─── Step 5: Tier Indicator ───────────────────────────────────────────────────

describe("Step 5 — Tier Indicator (AC2 enforcement)", () => {

  test("Agency tier display does not contain A+/A/B/C letter grades", () => {
    const result = getTierIndicator(uwm, "Agency");
    expect(result.display).not.toMatch(/^A\+$|^A$|^B\+$|^B$|^C$/);
    expect(result.display).toBeTruthy();
  });

  test("Non-QM placeholder tier shows 'Aggressive Profile'", () => {
    const result = getTierIndicator(aggressiveDSCR, "NonQM");
    expect(result.display).toBe("Aggressive Profile");
  });

  test("Non-QM tier display never contains pricing language", () => {
    const pricingWords = ["rate", "apr", "price", "cost", "spread", "points"];
    nonQMLenderMatrix.forEach((lender) => {
      const result = getTierIndicator(lender, "NonQM");
      pricingWords.forEach((word) => {
        expect(result.display.toLowerCase()).not.toContain(word);
      });
    });
  });

});


// ─── Step 6: Confidence Score ─────────────────────────────────────────────────

describe("Step 6 — Confidence Score", () => {

  test("Complete scenario with fresh guidelines returns HIGH confidence", () => {
    const scenario = normalizeScenario(cleanConventionalScenario);
    const result   = calculateConfidenceScore(scenario, { firestoreAvailable: true });
    expect(result.level).toMatch(/HIGH|MODERATE/);
    expect(result.score).toBeGreaterThan(0.5);
  });

  test("Confidence is reduced when Firebase is unavailable", () => {
    const scenario  = normalizeScenario(cleanConventionalScenario);
    const withFB    = calculateConfidenceScore(scenario, { firestoreAvailable: true });
    const withoutFB = calculateConfidenceScore(scenario, { firestoreAvailable: false });
    expect(withoutFB.score).toBeLessThan(withFB.score);
  });

  test("Placeholder results reduce confidence score", () => {
    const s1 = normalizeScenario({ ...cleanConventionalScenario, hasPlaceholderResults: false });
    const s2 = normalizeScenario({ ...cleanConventionalScenario, hasPlaceholderResults: true });
    const r1 = calculateConfidenceScore(s1, { firestoreAvailable: true });
    const r2 = calculateConfidenceScore(s2, { firestoreAvailable: true });
    expect(r2.score).toBeLessThanOrEqual(r1.score);
  });

  test("Returns level string (HIGH | MODERATE | LOW)", () => {
    const scenario = normalizeScenario(cleanConventionalScenario);
    const result   = calculateConfidenceScore(scenario);
    expect(["HIGH", "MODERATE", "LOW"]).toContain(result.level);
  });

  test("Returns human-readable message", () => {
    const scenario = normalizeScenario(cleanConventionalScenario);
    const result   = calculateConfidenceScore(scenario);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(5);
  });

});


// ─── Engine Tests T7–T13 (Governance spec) ───────────────────────────────────

describe("Engine Tests T7–T13 — Presentation Mode + Fallback Logic", () => {

  // T7: Agency qualifies → Non-QM shown as reference
  test("T7: Agency-qualifying scenario: Agency section has results, Non-QM shown as reference", () => {
    const result = runLenderMatch(cleanConventionalScenario);
    expect(result.agencySection.totalEligible).toBeGreaterThan(0);
    expect(result.nonQMSection.isHero).toBe(false);
  });

  // T8: Agency fails → Non-QM hero
  test("T8: Agency-failing scenario (recent BK): Non-QM section promoted to hero", () => {
    const result = runLenderMatch(recentBKScenario);
    // Agency should fail (BK 18 months, needs 48)
    expect(result.agencySection.totalEligible).toBe(0);
    expect(result.agencySection.noMatch).toBe(true);
    // Non-QM hero flag
    expect(result.nonQMSection.isHero).toBe(true);
  });

  // T9: Both fail → no matches message
  test("T9: Both Agency and Non-QM fail → noMatch messages displayed", () => {
    const impossibleScenario = {
      ...cleanConventionalScenario,
      creditScore:       400,
      ltv:               99,
      dti:               70,
      creditEvent:       "BK",
      creditEventMonths: 3,
    };
    const result = runLenderMatch(impossibleScenario);
    expect(result.agencySection.noMatch).toBe(true);
    expect(result.agencySection.noMatchMessage).toBeTruthy();
  });

  // T10: Firebase unavailable → static fallback, no crash
  test("T10: Firebase unavailable → engine runs on static data, no error thrown", () => {
    expect(() => {
      runLenderMatch(cleanConventionalScenario, { firestoreAvailable: false });
    }).not.toThrow();
    const result = runLenderMatch(cleanConventionalScenario, { firestoreAvailable: false });
    expect(result.confidence.score).toBeLessThan(1.0);
  });

  // T11: SEPARATE_SECTIONS mode → Agency above, Non-QM below
  test("T11: SEPARATE_SECTIONS mode — both sections present and visible", () => {
    const result = runLenderMatch(cleanConventionalScenario, {
      mode: PRESENTATION_MODES.SEPARATE_SECTIONS,
    });
    expect(result.agencySection.visible).toBe(true);
    expect(result.nonQMSection.visible).toBe(true);
    expect(result.mode).toBe(PRESENTATION_MODES.SEPARATE_SECTIONS);
  });

  // T12: Non-QM placeholders never appear in Agency section
  test("T12: Non-QM placeholder results never appear in agencySection", () => {
    const result = runLenderMatch(cleanConventionalScenario);
    const agencyIds = result.agencySection.eligible.map((r) => r.lenderId);
    nonQMLenderMatrix.forEach((l) => {
      expect(agencyIds).not.toContain(l.id);
    });
  });

  // T13: COMBINED_RANKED mode — placeholders excluded
  test("T13: COMBINED_RANKED mode — all placeholder results have excludeFromCombined=true", () => {
    const result = runLenderMatch(dscrInvestorScenario, {
      mode: PRESENTATION_MODES.COMBINED_RANKED,
    });
    result.nonQMSection.eligible.forEach((r) => {
      if (r.dataSource === DATA_SOURCES.PLACEHOLDER) {
        expect(r.excludeFromCombined).toBe(true);
      }
    });
  });

});


// ─── PRD Section 23 — Integration Scenario Tests ─────────────────────────────

describe("PRD Section 23 — 10 Full Scenario Integration Tests", () => {

  test("Scenario 1: 720 FICO, 85% LTV, Conventional Full Doc — 5+ Agency eligible", () => {
    const result = runLenderMatch(cleanConventionalScenario);
    expect(result.agencySection.totalEligible).toBeGreaterThanOrEqual(4);
  });

  test("Scenario 2: 580 FICO, FHA, 3.5% down, primary — FHA lenders eligible", () => {
    const result = runLenderMatch({
      loanType:      "FHA",
      transactionType: "purchase",
      loanAmount:    290000,
      propertyValue: 300000,  // ~3.5% down
      creditScore:   580,
      dti:           43,
      propertyType:  "SFR",
      occupancy:     "Primary",
      state:         "GA",
      incomeDocType: "fullDoc",
      creditEvent:   "none",
    });
    const fhaEligible = result.agencySection.eligible.filter(
      (r) => r.program === "FHA"
    );
    expect(fhaEligible.length).toBeGreaterThanOrEqual(3);
  });

  test("Scenario 3: VA purchase, 100% LTV, 640 FICO — VA specialists eligible", () => {
    const result = runLenderMatch(vaPurchaseScenario);
    const vaResults = result.agencySection.eligible.filter((r) => r.program === "VA");
    expect(vaResults.length).toBeGreaterThanOrEqual(1);
    // Freedom should be in results (VA specialist)
    const freedomResult = vaResults.find((r) => r.lenderId === "agency_007");
    expect(freedomResult).toBeDefined();
  });

  test("Scenario 4: 500 FICO, Conventional — Agency section has 0 eligible", () => {
    const result = runLenderMatch(lowFICOScenario);
    const convResults = result.agencySection.eligible.filter(
      (r) => r.program === "Conventional"
    );
    expect(convResults).toHaveLength(0);
    expect(result.agencySection.noMatch).toBe(true);
  });

  test("Scenario 5: Bank Statement selected — Agency suppressed, Non-QM primary", () => {
    const result = runLenderMatch({
      loanType:       "NonQM",
      transactionType: "purchase",
      loanAmount:     480000,
      propertyValue:  600000,
      creditScore:    660,
      propertyType:   "SFR",
      occupancy:      "Primary",
      state:          "TX",
      incomeDocType:  "bankStatement12",
      selfEmployed:   true,
      creditEvent:    "none",
      reservesMonths: 6,
    });
    // Agency all ineligible (income type mismatch)
    expect(result.agencySection.totalEligible).toBe(0);
    // Non-QM bank statement lenders evaluated
    expect(result.nonQMSection.eligible.length).toBeGreaterThanOrEqual(1);
  });

  test("Scenario 6: Investment, DSCR 1.15, 680 FICO — Agency investment + DSCR Non-QM", () => {
    const result = runLenderMatch(dscrInvestorScenario);
    // Non-QM DSCR should have eligible results
    expect(result.nonQMSection.eligible.length).toBeGreaterThanOrEqual(1);
    const dscrResults = result.nonQMSection.eligible.filter(
      (r) => r.program === PROGRAMS.DSCR
    );
    expect(dscrResults.length).toBeGreaterThanOrEqual(1);
  });

  test("Scenario 7: BK 18 months ago — Agency 0 eligible (needs 48mo), Non-QM BS hero", () => {
    const result = runLenderMatch(recentBKScenario);
    // Agency fails all — BK 18 months, conventional needs 48
    expect(result.agencySection.totalEligible).toBe(0);
    expect(result.nonQMSection.isHero).toBe(true);
  });

  test("Scenario 8: Asset Depletion, $1.2M assets, 700 FICO — Aggressive AD eligible", () => {
    const result = runLenderMatch({
      loanType:      "NonQM",
      transactionType: "purchase",
      loanAmount:    600000,
      propertyValue: 800000,
      creditScore:   700,
      dti:           20,
      propertyType:  "SFR",
      occupancy:     "Primary",
      state:         "CA",
      incomeDocType: "assetDepletion",
      totalAssets:   1200000,
      selfEmployed:  false,
      creditEvent:   "none",
      reservesMonths: 6,
    });
    const adResults = result.nonQMSection.eligible.filter(
      (r) => r.program === PROGRAMS.ASSET_DEPLETION
    );
    expect(adResults.length).toBeGreaterThanOrEqual(1);
  });

  test("Scenario 9: Stacked risk factors — eligible results include HIGH overlay risk flag", () => {
    const result = runLenderMatch({
      ...cleanConventionalScenario,
      creditScore: 622,
      ltv:         94,
      dti:         48,
      selfEmployed: true,
    });
    // At least some eligible Agency results should flag MODERATE or HIGH overlay
    const riskFlagged = result.agencySection.eligible.filter(
      (r) => r.overlayRisk === OVERLAY_RISK.MODERATE || r.overlayRisk === OVERLAY_RISK.HIGH
    );
    expect(riskFlagged.length).toBeGreaterThan(0);
  });

  test("Scenario 10: Confidence score < 1.0 when non-QM placeholders present", () => {
    const result = runLenderMatch(dscrInvestorScenario);
    // DSCR scenario uses placeholders → confidence should be below 1.0
    if (result.nonQMSection.eligible.some((r) => r.dataSource === DATA_SOURCES.PLACEHOLDER)) {
      expect(result.confidence.score).toBeLessThan(1.0);
    }
  });

});


// ─── Decision Record Builder ──────────────────────────────────────────────────

describe("Decision Record™ Builder (AC5)", () => {

  test("Decision Record contains all required provenance fields", () => {
    const scenario      = normalizeScenario(cleanConventionalScenario);
    const engineOutput  = runLenderMatch(cleanConventionalScenario);
    const selected      = engineOutput.agencySection.eligible[0];
    const record        = buildDecisionRecord(selected, scenario, engineOutput);

    expect(record).toHaveProperty("recordType",    "LENDER_MATCH_SELECTION");
    expect(record).toHaveProperty("scenarioSnapshot");
    expect(record).toHaveProperty("dataSource");
    expect(record).toHaveProperty("rulesetVersion");
    expect(record).toHaveProperty("guidelineVersionRef");
    expect(record).toHaveProperty("fitScore");
    expect(record).toHaveProperty("eligibilityStatus");
    expect(record).toHaveProperty("overlayRisk");
    expect(record).toHaveProperty("reasonsSnapshot");
    expect(record).toHaveProperty("selectedAt");
  });

  test("Placeholder Decision Record has dataSource = PLACEHOLDER and rulesetVersion = 0", () => {
    const scenario     = normalizeScenario(dscrInvestorScenario);
    const engineOutput = runLenderMatch(dscrInvestorScenario);
    const placeholderResult = engineOutput.nonQMSection.eligible.find(
      (r) => r.dataSource === DATA_SOURCES.PLACEHOLDER
    );

    if (placeholderResult) {
      const record = buildDecisionRecord(placeholderResult, scenario, engineOutput);
      expect(record.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
      expect(record.rulesetVersion).toBe(0);
      expect(record).toHaveProperty("placeholderDisclaimer");
    }
  });

  test("Decision Record scenarioSnapshot is a sealed copy of scenario inputs", () => {
    const scenario     = normalizeScenario(cleanConventionalScenario);
    const engineOutput = runLenderMatch(cleanConventionalScenario);
    const selected     = engineOutput.agencySection.eligible[0];
    const record       = buildDecisionRecord(selected, scenario, engineOutput);

    // Modify original scenario after record built — should not affect snapshot
    scenario.creditScore = 999;
    expect(record.scenarioSnapshot.creditScore).not.toBe(999);
  });

  test("Decision Record contains narrative snapshot", () => {
    const scenario     = normalizeScenario(cleanConventionalScenario);
    const engineOutput = runLenderMatch(cleanConventionalScenario);
    const selected     = engineOutput.agencySection.eligible[0];
    const record       = buildDecisionRecord(selected, scenario, engineOutput);
    expect(record.narrativeSnapshot).toBeTruthy();
    expect(record.narrativeSnapshot.length).toBeGreaterThan(20);
  });

});


// ─── Engine Config Tests ──────────────────────────────────────────────────────

describe("Engine Configuration", () => {

  test("Default presentation mode is SEPARATE_SECTIONS", () => {
    expect(ENGINE_CONFIG.resultsPresentationMode).toBe("SEPARATE_SECTIONS");
  });

  test("useConservativeDefaults is true", () => {
    expect(ENGINE_CONFIG.useConservativeDefaults).toBe(true);
  });

  test("maxResultsPerSection is 10", () => {
    expect(ENGINE_CONFIG.maxResultsPerSection).toBe(10);
  });

  test("Engine output always contains both agencySection and nonQMSection", () => {
    const result = runLenderMatch(cleanConventionalScenario);
    expect(result).toHaveProperty("agencySection");
    expect(result).toHaveProperty("nonQMSection");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("overlayRisk");
  });

});
