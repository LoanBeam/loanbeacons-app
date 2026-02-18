/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/data/nonQMLenderMatrix.test.js
 * Non-QM Matrix Integrity, Governance & Routing Tests
 * ============================================================
 *
 * Covers:
 *   — Matrix integrity (all 6 profiles present, valid)
 *   — Governance compliance (placeholder rules)
 *   — Program routing (docType → program → lenders)
 *   — Firestore override merge logic
 *   — Scoring structure (priorityWeight, tierBasis)
 *   — Threshold spot-checks (aggressive vs conservative)
 */

import {
  nonQMLenderMatrix,
  nonQMLenderById,
  getNonQMLendersByProgram,
  getActiveNonQMLenders,
  getNonQMProgramsForDocType,
  getNonQMLendersForDocType,
  mergeNonQMWithOverrides,
  PLACEHOLDER_BANNER_COPY,
  PLACEHOLDER_SECTION_WARNING,
} from "./nonQMLenderMatrix";

import {
  DATA_SOURCES,
  TIER_BASIS,
  PROGRAMS,
  BANNED_FIELDS,
} from "@/schemas/nonQMLenderSchema";


// ─── Matrix Integrity ─────────────────────────────────────────────────────────

describe("Non-QM Matrix Integrity", () => {

  test("Matrix contains exactly 6 placeholder profiles", () => {
    expect(nonQMLenderMatrix).toHaveLength(6);
  });

  test("All 6 expected profile IDs are present", () => {
    const ids = nonQMLenderMatrix.map((l) => l.id);
    expect(ids).toContain("nonqm_placeholder_001");
    expect(ids).toContain("nonqm_placeholder_002");
    expect(ids).toContain("nonqm_placeholder_003");
    expect(ids).toContain("nonqm_placeholder_004");
    expect(ids).toContain("nonqm_placeholder_005");
    expect(ids).toContain("nonqm_placeholder_006");
  });

  test("All lender IDs are unique", () => {
    const ids = nonQMLenderMatrix.map((l) => l.id);
    expect(new Set(ids).size).toBe(6);
  });

  test("All profiles are active", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.active).toBe(true);
    });
  });

  test("All profiles have guidelineVersionRef (AC3)", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.guidelineVersionRef).toBe("PLACEHOLDER-v0");
    });
  });

  test("All profiles have version = 0 (placeholder governance)", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.version).toBe(0);
    });
  });

  test("All profiles have dataSource = PLACEHOLDER", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
    });
  });

  test("All profiles have amber accentColor (#b45309)", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.accentColor).toBe("#b45309");
    });
  });

  test("Every program listed has a corresponding guideline block", () => {
    nonQMLenderMatrix.forEach((lender) => {
      lender.programs.forEach((prog) => {
        expect(lender.guidelines[prog]).toBeDefined();
        expect(typeof lender.guidelines[prog]).toBe("object");
      });
    });
  });

  test("All profiles have disclaimer text present", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.disclaimer).toBeTruthy();
      expect(l.disclaimer.length).toBeGreaterThan(50);
    });
  });

  test("Placeholder banner copy is exported and non-empty", () => {
    expect(PLACEHOLDER_BANNER_COPY).toBeTruthy();
    expect(PLACEHOLDER_BANNER_COPY).toContain("GENERIC NON-QM PROFILE");
    expect(PLACEHOLDER_BANNER_COPY).toContain("baseline market profiles");
  });

  test("Placeholder section warning is exported and non-empty", () => {
    expect(PLACEHOLDER_SECTION_WARNING).toBeTruthy();
    expect(PLACEHOLDER_SECTION_WARNING).toContain("placeholder profile data");
  });

});


// ─── Governance Compliance ────────────────────────────────────────────────────

describe("Governance Compliance — PLACEHOLDER_GOVERNANCE.md v1.1", () => {

  test("No profile contains any banned pricing fields", () => {
    nonQMLenderMatrix.forEach((lender) => {
      const json = JSON.stringify(lender).toLowerCase();
      BANNED_FIELDS.forEach((field) => {
        // Wrapped in quotes to avoid partial matches in string values
        expect(json).not.toMatch(new RegExp(`"${field}":`));
      });
    });
  });

  test("No profile uses a real lender name in profileName or shortName", () => {
    const realLenderNames = [
      "angel oak", "acra", "verus", "a&d mortgage",
      "deephaven", "griffin funding",
    ];
    nonQMLenderMatrix.forEach((lender) => {
      const name = (lender.profileName + " " + lender.shortName).toLowerCase();
      realLenderNames.forEach((realName) => {
        expect(name).not.toContain(realName);
      });
    });
  });

  test("All tierBasis values are valid (Aggressive, Market, Conservative)", () => {
    const validBasis = Object.values(TIER_BASIS);
    nonQMLenderMatrix.forEach((l) => {
      expect(validBasis).toContain(l.tierBasis);
    });
  });

  test("Placeholder profiles never have tierBasis-as-grade — no A/B/C in tierBasis", () => {
    nonQMLenderMatrix.forEach((l) => {
      expect(l.tierBasis).not.toMatch(/^A\+?$|^B\+?$|^C$/);
    });
  });

  test("Placeholder max LTV is conservative (no primary LTV > 90%)", () => {
    // useConservativeDefaults: true — no profile should allow > 90% LTV primary
    nonQMLenderMatrix.forEach((lender) => {
      lender.programs.forEach((prog) => {
        const g = lender.guidelines[prog];
        if (g.maxLTV?.primary?.purchase) {
          expect(g.maxLTV.primary.purchase).toBeLessThanOrEqual(90);
        }
      });
    });
  });

  test("All profiles: priorityWeight <= 75 (real lenders can exceed this)", () => {
    // Governance: real lenders have full 0-100 range; placeholders capped effectively
    // by scoring weight reduction — this test confirms no placeholder appears
    // with an artificially inflated priority
    nonQMLenderMatrix.forEach((l) => {
      expect(l.priorityWeight).toBeLessThanOrEqual(75);
    });
  });

  test("nonQMLenderById lookup works for all 6 profiles", () => {
    expect(nonQMLenderById["nonqm_placeholder_001"]).toBeDefined();
    expect(nonQMLenderById["nonqm_placeholder_006"]).toBeDefined();
  });

});


// ─── Program Routing ──────────────────────────────────────────────────────────

describe("Program Routing — docType → program → lenders", () => {

  test("getNonQMLendersByProgram returns 2 bank statement profiles (BS12)", () => {
    const bs12 = getNonQMLendersByProgram(PROGRAMS.BANK_STATEMENT_12);
    expect(bs12).toHaveLength(2);
  });

  test("getNonQMLendersByProgram returns 2 bank statement profiles (BS24)", () => {
    const bs24 = getNonQMLendersByProgram(PROGRAMS.BANK_STATEMENT_24);
    expect(bs24).toHaveLength(2);
  });

  test("getNonQMLendersByProgram returns 2 DSCR profiles", () => {
    const dscr = getNonQMLendersByProgram(PROGRAMS.DSCR);
    expect(dscr).toHaveLength(2);
  });

  test("getNonQMLendersByProgram returns 2 asset depletion profiles", () => {
    const ad = getNonQMLendersByProgram(PROGRAMS.ASSET_DEPLETION);
    expect(ad).toHaveLength(2);
  });

  test("getActiveNonQMLenders returns all 6 profiles", () => {
    expect(getActiveNonQMLenders()).toHaveLength(6);
  });

  test("getNonQMProgramsForDocType maps bankStatement12 correctly", () => {
    expect(getNonQMProgramsForDocType("bankStatement12")).toBe(PROGRAMS.BANK_STATEMENT_12);
  });

  test("getNonQMProgramsForDocType maps bankStatement24 correctly", () => {
    expect(getNonQMProgramsForDocType("bankStatement24")).toBe(PROGRAMS.BANK_STATEMENT_24);
  });

  test("getNonQMProgramsForDocType maps dscr correctly", () => {
    expect(getNonQMProgramsForDocType("dscr")).toBe(PROGRAMS.DSCR);
  });

  test("getNonQMProgramsForDocType maps assetDepletion correctly", () => {
    expect(getNonQMProgramsForDocType("assetDepletion")).toBe(PROGRAMS.ASSET_DEPLETION);
  });

  test("getNonQMProgramsForDocType returns null for unknown type", () => {
    expect(getNonQMProgramsForDocType("unknownType")).toBeNull();
  });

  test("getNonQMLendersForDocType returns empty array for fullDoc", () => {
    // fullDoc = Agency path only. Non-QM engine should not run.
    expect(getNonQMLendersForDocType("fullDoc")).toHaveLength(0);
  });

  test("getNonQMLendersForDocType returns 2 lenders for dscr", () => {
    expect(getNonQMLendersForDocType("dscr")).toHaveLength(2);
  });

  test("getNonQMLendersForDocType returns 2 lenders for assetDepletion", () => {
    expect(getNonQMLendersForDocType("assetDepletion")).toHaveLength(2);
  });

});


// ─── Threshold Spot Checks — Aggressive vs Conservative ──────────────────────

describe("Threshold Spot Checks", () => {

  // Bank Statement pair
  test("Aggressive BS FICO (600) < Conservative BS FICO (660)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_001"];
    const cons = nonQMLenderById["nonqm_placeholder_002"];
    expect(agg.guidelines.BankStatement12.minFICO)
      .toBeLessThan(cons.guidelines.BankStatement12.minFICO);
  });

  test("Aggressive BS primary purchase LTV (85%) > Conservative (80%)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_001"];
    const cons = nonQMLenderById["nonqm_placeholder_002"];
    expect(agg.guidelines.BankStatement12.maxLTV.primary.purchase)
      .toBeGreaterThan(cons.guidelines.BankStatement12.maxLTV.primary.purchase);
  });

  test("Aggressive BS BK seasoning (12mo) < Conservative (24mo)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_001"];
    const cons = nonQMLenderById["nonqm_placeholder_002"];
    expect(agg.guidelines.BankStatement12.bkSeasoning)
      .toBeLessThan(cons.guidelines.BankStatement12.bkSeasoning);
  });

  test("Aggressive BS max loan ($2.5M) > Conservative ($1.5M)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_001"];
    const cons = nonQMLenderById["nonqm_placeholder_002"];
    expect(agg.guidelines.BankStatement12.maxLoanAmount)
      .toBeGreaterThan(cons.guidelines.BankStatement12.maxLoanAmount);
  });

  test("Conservative BS has cashOutMax cap ($500K), Aggressive has none (null)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_001"];
    const cons = nonQMLenderById["nonqm_placeholder_002"];
    expect(agg.guidelines.BankStatement12.cashOutMax).toBeNull();
    expect(cons.guidelines.BankStatement12.cashOutMax).toBe(500000);
  });

  // DSCR pair
  test("Aggressive DSCR minimum (1.00) < Conservative (1.10)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_003"];
    const cons = nonQMLenderById["nonqm_placeholder_004"];
    expect(agg.guidelines.DSCR.minDSCR).toBeLessThan(cons.guidelines.DSCR.minDSCR);
  });

  test("Aggressive DSCR allows short-term rental; Conservative does not", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_003"];
    const cons = nonQMLenderById["nonqm_placeholder_004"];
    expect(agg.guidelines.DSCR.allowsShortTermRental).toBe(true);
    expect(cons.guidelines.DSCR.allowsShortTermRental).toBe(false);
  });

  test("Aggressive DSCR FICO (620) < Conservative (660)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_003"];
    const cons = nonQMLenderById["nonqm_placeholder_004"];
    expect(agg.guidelines.DSCR.minFICO).toBeLessThan(cons.guidelines.DSCR.minFICO);
  });

  // Asset Depletion pair
  test("Aggressive AD min assets ($500K) < Conservative ($1M)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_005"];
    const cons = nonQMLenderById["nonqm_placeholder_006"];
    expect(agg.guidelines.AssetDepletion.minAssets)
      .toBeLessThan(cons.guidelines.AssetDepletion.minAssets);
  });

  test("Aggressive AD depletion months (60) < Conservative (72) — more income from same assets", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_005"];
    const cons = nonQMLenderById["nonqm_placeholder_006"];
    expect(agg.guidelines.AssetDepletion.depletionMonths)
      .toBeLessThan(cons.guidelines.AssetDepletion.depletionMonths);
  });

  test("Aggressive AD reserves (6mo) < Conservative (12mo)", () => {
    const agg  = nonQMLenderById["nonqm_placeholder_005"];
    const cons = nonQMLenderById["nonqm_placeholder_006"];
    expect(agg.guidelines.AssetDepletion.minReserveMonths)
      .toBeLessThan(cons.guidelines.AssetDepletion.minReserveMonths);
  });

  // Aggressive always has higher priorityWeight than conservative counterpart
  test("Aggressive profiles have higher priorityWeight than Conservative counterparts", () => {
    const pairs = [
      ["nonqm_placeholder_001", "nonqm_placeholder_002"],  // BS pair
      ["nonqm_placeholder_003", "nonqm_placeholder_004"],  // DSCR pair
      ["nonqm_placeholder_005", "nonqm_placeholder_006"],  // AD pair
    ];
    pairs.forEach(([aggId, consId]) => {
      const agg  = nonQMLenderById[aggId];
      const cons = nonQMLenderById[consId];
      expect(agg.priorityWeight).toBeGreaterThan(cons.priorityWeight);
    });
  });

});


// ─── Firestore Override Merge Logic ──────────────────────────────────────────

describe("Firestore Override Merge — mergeNonQMWithOverrides()", () => {

  test("No overrides: returns original matrix unchanged", () => {
    const merged = mergeNonQMWithOverrides([]);
    expect(merged).toHaveLength(6);
    expect(merged[0].dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
  });

  test("Real lender override supersedes matching placeholder", () => {
    const realOverride = {
      id:                  "nonqm_placeholder_001",
      profileName:         "Angel Oak Bank Statement — Real",
      shortName:           "Angel Oak",
      dataSource:          DATA_SOURCES.REAL,
      version:             1,
      guidelineVersionRef: "ANGELOAK-BKSTMT-2026-Q1",
      effectiveDate:       "2026-01-01",
    };
    const merged = mergeNonQMWithOverrides([realOverride]);
    const updated = merged.find((l) => l.id === "nonqm_placeholder_001");
    expect(updated.dataSource).toBe(DATA_SOURCES.REAL);
    expect(updated.version).toBe(1);
    expect(updated.shortName).toBe("Angel Oak");
  });

  test("Override for unknown ID does not affect other lenders", () => {
    const strangeOverride = {
      id: "nonqm_real_999", // ID not in matrix
      dataSource: DATA_SOURCES.REAL,
      version: 1,
      guidelineVersionRef: "UNKNOWN-2026",
    };
    const merged = mergeNonQMWithOverrides([strangeOverride]);
    expect(merged).toHaveLength(6);
    // All original profiles unchanged
    merged.forEach((l) => {
      expect(l.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
    });
  });

  test("Placeholder override (version 0) merges partial update", () => {
    const partialOverride = {
      id:         "nonqm_placeholder_003",
      dataSource: DATA_SOURCES.PLACEHOLDER,
      version:    0,
      priorityWeight: 99,  // Partial update: just change priorityWeight
    };
    const merged = mergeNonQMWithOverrides([partialOverride]);
    const updated = merged.find((l) => l.id === "nonqm_placeholder_003");
    expect(updated.priorityWeight).toBe(99);
    expect(updated.dataSource).toBe(DATA_SOURCES.PLACEHOLDER); // Still placeholder
  });

  test("Old Decision Records: original placeholder records unmodified after merge", () => {
    // mergeNonQMWithOverrides returns new array — source nonQMLenderMatrix unchanged
    mergeNonQMWithOverrides([{
      id: "nonqm_placeholder_001",
      dataSource: DATA_SOURCES.REAL,
      version: 1,
      guidelineVersionRef: "REAL-2026",
    }]);
    // Original matrix should still have placeholder data
    const original = nonQMLenderById["nonqm_placeholder_001"];
    expect(original.dataSource).toBe(DATA_SOURCES.PLACEHOLDER);
    expect(original.version).toBe(0);
  });

});


// ─── 24-Month Bank Statement Superiority ─────────────────────────────────────

describe("BankStatement24 vs BankStatement12 LTV Advantage", () => {

  test("Profile 1 BankStatement24 primary purchase LTV (90%) > BankStatement12 (85%)", () => {
    const p1 = nonQMLenderById["nonqm_placeholder_001"];
    const ltv12 = p1.guidelines.BankStatement12.maxLTV.primary.purchase;
    const ltv24 = p1.guidelines.BankStatement24.maxLTV.primary.purchase;
    expect(ltv24).toBeGreaterThan(ltv12);
  });

  test("Profile 2 BankStatement24 FICO minimum (640) lower than BankStatement12 (660)", () => {
    // Conservative profile: 24-month history allows slightly lower FICO
    const p2 = nonQMLenderById["nonqm_placeholder_002"];
    expect(p2.guidelines.BankStatement24.minFICO)
      .toBeLessThan(p2.guidelines.BankStatement12.minFICO);
  });

});
