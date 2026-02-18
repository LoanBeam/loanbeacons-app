/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/data/agencyLenderMatrix.test.js
 * Agency Matrix Integrity & Spot-Check Tests
 * ============================================================
 */

import {
  agencyLenderMatrix,
  agencyLenderById,
  getLendersByProgram,
  getActiveAgencyLenders,
  CONFORMING_LIMIT,
  FHA_FLOOR,
} from "./agencyLenderMatrix";

// ─── Matrix Integrity ─────────────────────────────────────────────────────────

describe("Agency Matrix Integrity", () => {

  test("Matrix contains exactly 8 lenders", () => {
    expect(agencyLenderMatrix).toHaveLength(8);
  });

  test("All lender IDs are unique", () => {
    const ids = agencyLenderMatrix.map((l) => l.id);
    expect(new Set(ids).size).toBe(8);
  });

  test("All lenders are active", () => {
    agencyLenderMatrix.forEach((l) => {
      expect(l.active).toBe(true);
    });
  });

  test("All lenders have guidelineVersionRef (AC3)", () => {
    agencyLenderMatrix.forEach((l) => {
      expect(l.guidelineVersionRef).toBeTruthy();
      expect(typeof l.guidelineVersionRef).toBe("string");
    });
  });

  test("All lenders have dataSource = REAL", () => {
    agencyLenderMatrix.forEach((l) => {
      expect(l.dataSource).toBe("REAL");
    });
  });

  test("All lenders have version >= 1", () => {
    agencyLenderMatrix.forEach((l) => {
      expect(l.version).toBeGreaterThanOrEqual(1);
    });
  });

  test("Every program listed has a matching guideline block", () => {
    agencyLenderMatrix.forEach((lender) => {
      lender.programs.forEach((prog) => {
        expect(lender.guidelines[prog]).toBeDefined();
        expect(typeof lender.guidelines[prog]).toBe("object");
      });
    });
  });

  test("No lender contains banned pricing fields", () => {
    const BANNED = ["rate", "apr", "price", "spread", "points", "interestRate", "margin"];
    agencyLenderMatrix.forEach((lender) => {
      const json = JSON.stringify(lender).toLowerCase();
      BANNED.forEach((field) => {
        // Check as a key (surrounded by quotes) to avoid false positives in strings
        expect(json).not.toMatch(new RegExp(`"${field}":`));
      });
    });
  });

  test("agencyLenderById lookup returns correct lender", () => {
    expect(agencyLenderById["agency_001"].shortName).toBe("UWM");
    expect(agencyLenderById["agency_007"].shortName).toBe("Freedom");
    expect(agencyLenderById["agency_008"].shortName).toBe("Cardinal");
  });

  test("getLendersByProgram returns correct counts", () => {
    const conventional = getLendersByProgram("Conventional");
    const fha          = getLendersByProgram("FHA");
    const va           = getLendersByProgram("VA");

    // UWM, Rocket, loanDepot, Planet, NewRez, Pennymac, Cardinal = 7 Conventional
    expect(conventional).toHaveLength(7);

    // All 8 offer FHA
    expect(fha).toHaveLength(8);

    // UWM, Rocket, Planet, NewRez, Freedom, Cardinal = 6 VA
    expect(va).toHaveLength(6);
  });

  test("getActiveAgencyLenders returns all 8", () => {
    expect(getActiveAgencyLenders()).toHaveLength(8);
  });

});

// ─── Program Limit Spot Checks ────────────────────────────────────────────────

describe("Program Limits", () => {

  test("Conforming limit is $806,500", () => {
    expect(CONFORMING_LIMIT).toBe(806500);
  });

  test("FHA floor is $524,225", () => {
    expect(FHA_FLOOR).toBe(524225);
  });

  test("All Conventional lenders respect conforming limit", () => {
    getLendersByProgram("Conventional").forEach((lender) => {
      expect(lender.guidelines.Conventional.maxLoanAmount).toBeLessThanOrEqual(CONFORMING_LIMIT);
    });
  });

  test("All FHA lenders do not allow investment property", () => {
    getLendersByProgram("FHA").forEach((lender) => {
      expect(lender.guidelines.FHA.allowsInvestment).toBe(false);
    });
  });

  test("All VA lenders do not allow investment property", () => {
    getLendersByProgram("VA").forEach((lender) => {
      expect(lender.guidelines.VA.allowsInvestment).toBe(false);
    });
  });

  test("All VA lenders allow 100% LTV on purchase", () => {
    getLendersByProgram("VA").forEach((lender) => {
      expect(lender.guidelines.VA.maxLTV.purchase).toBe(100);
    });
  });

  test("All Conventional lenders allow 97% LTV on purchase", () => {
    getLendersByProgram("Conventional").forEach((lender) => {
      expect(lender.guidelines.Conventional.maxLTV.purchase).toBeGreaterThanOrEqual(97);
    });
  });

});

// ─── Differentiator Spot Checks ───────────────────────────────────────────────

describe("Lender Differentiators", () => {

  test("Freedom Mortgage has lowest VA FICO minimum (550)", () => {
    const freedom = agencyLenderById["agency_007"];
    expect(freedom.guidelines.VA.minFICO).toBe(550);
  });

  test("Freedom Mortgage allows 100% LTV on VA cash-out", () => {
    const freedom = agencyLenderById["agency_007"];
    expect(freedom.guidelines.VA.maxLTV.cashOut).toBe(100);
  });

  test("Freedom Mortgage has 12-month BK seasoning on VA", () => {
    const freedom = agencyLenderById["agency_007"];
    expect(freedom.guidelines.VA.bkSeasoning).toBe(12);
  });

  test("NewRez accepts non-warrantable condos on Conventional", () => {
    const newrez = agencyLenderById["agency_005"];
    expect(newrez.guidelines.Conventional.allowsNonWarrantableCondo).toBe(true);
  });

  test("Planet Home Lending accepts manufactured housing", () => {
    const planet = agencyLenderById["agency_004"];
    expect(planet.guidelines.Conventional.allowsManufactured).toBe(true);
    expect(planet.guidelines.FHA.allowsManufactured).toBe(true);
    expect(planet.guidelines.VA.allowsManufactured).toBe(true);
  });

  test("UWM has highest priorityWeight (top-ranked conventional)", () => {
    const uwm = agencyLenderById["agency_001"];
    const maxWeight = Math.max(...agencyLenderMatrix.map((l) => l.priorityWeight));
    expect(uwm.priorityWeight).toBe(maxWeight);
  });

  test("loanDepot does NOT offer VA", () => {
    const loandepot = agencyLenderById["agency_003"];
    expect(loandepot.programs).not.toContain("VA");
  });

  test("Pennymac does NOT offer VA", () => {
    const pennymac = agencyLenderById["agency_006"];
    expect(pennymac.programs).not.toContain("VA");
  });

});
