/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/data/agencyLenderMatrix.js
 * Version: 1.0.0 — Agency Lender Static Matrix
 * Step 2 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Contains 8 Agency lenders with full guideline sets for:
 *   - Conventional (Fannie/Freddie)
 *   - FHA
 *   - VA
 *
 * Data represents publicly known wholesale/correspondent guidelines
 * as of Q1 2026. Update via Firestore lenderOverrides collection
 * without touching this file.
 *
 * Schema notes:
 *   - bkSeasoning / fcSeasoning / shortSaleSeasoning: months required
 *   - maxLTV values: percentage integers (e.g., 97 = 97%)
 *   - maxLoanAmount: conforming limit $806,500 (2025/2026)
 *   - FHA floor: $524,225 (national minimum)
 *   - priorityWeight: 0–100, influences ranking via engine weight
 *   - guidelineVersionRef: bump this string when guidelines change
 *
 * AC3 Compliance: every lender includes guidelineVersionRef
 * ============================================================
 */

// ─── Conforming & Program Limits (2025/2026) ──────────────────────────────────

export const CONFORMING_LIMIT      = 806500;   // Standard conforming loan limit
export const FHA_FLOOR             = 524225;   // National FHA loan limit floor
export const HIGH_BALANCE_THRESHOLD = 806500;  // Flag loans above this for high-balance review

// ─── Shared Guideline Notes ────────────────────────────────────────────────────
// These surface in the engine's "Why This Lender?" narrative and card displays

const NOTES = {
  PMI_REQUIRED:        "PMI required when LTV > 80%.",
  FHA_MIP:             "FHA MIP required: 1.75% upfront + annual MIP for life of loan.",
  VA_FUNDING_FEE:      "VA funding fee applies. Amount varies by down payment and usage.",
  HIGH_BALANCE_FLAG:   "Loan amount may require high-balance approval. Verify county limits.",
  INVESTMENT_OVERLAY:  "Investment properties subject to additional reserve requirements.",
  CONDO_REVIEW:        "Condo projects require lender spot approval or project approval.",
};

// ─── Agency Lender Matrix ─────────────────────────────────────────────────────

export const agencyLenderMatrix = [

  // ══════════════════════════════════════════════════════════════════
  // LENDER 1 — United Wholesale Mortgage (UWM)
  // Conventional, FHA, VA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_001",
    name:                "United Wholesale Mortgage",
    shortName:           "UWM",
    accentColor:         "#003087",
    dataSource:          "REAL",
    priorityWeight:      90,
    active:              true,
    version:             1,
    guidelineVersionRef: "UWM-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA", "VA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,    // 97% LTV available (HomeReady/Home Possible)
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           50,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 85, rateTerm: 85, cashOut: 75 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED, NOTES.INVESTMENT_OVERLAY],
      },

      FHA: {
        minFICO:          580,   // 580 = 96.5% LTV; 500–579 = 90% max LTV
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           57,    // FHA allows higher DTI with AUS approval
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,  // FHA primary residence only
        allowsSelfEmployed: true,
        bkSeasoning:      24,    // Ch.7 = 24mo; Ch.13 = 12mo with trustee approval
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },

      VA: {
        minFICO:          580,   // Lender overlay — VA has no official minimum
        maxLTV: {
          purchase:       100,   // 100% financing for full entitlement
          rateTerm:       100,
          cashOut:        90,
        },
        maxDTI:           55,    // VA is flexible; AUS-driven
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,  // VA primary residence only
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      24,
        shortSaleSeasoning: 24,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        requiresPrimaryResidence: true,
        notes:            [NOTES.VA_FUNDING_FEE],
      },
    },

    tier:         "A+",
    tierNotes:    "Industry-leading wholesale platform. Consistently best-in-class conventional pricing and turn times.",
    strengths:    ["Top conventional pricing", "Fast UW turn times", "Strong VA platform"],
    weaknesses:   ["Non-warrantable condos not accepted", "No manufactured housing"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 2 — Rocket Mortgage (Wholesale / Partner Network)
  // Conventional, FHA, VA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_002",
    name:                "Rocket Mortgage",
    shortName:           "Rocket",
    accentColor:         "#cc0000",
    dataSource:          "REAL",
    priorityWeight:      82,
    active:              true,
    version:             1,
    guidelineVersionRef: "ROCKET-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA", "VA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           50,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 85, rateTerm: 85, cashOut: 75 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED],
      },

      FHA: {
        minFICO:          580,
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           55,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },

      VA: {
        minFICO:          580,
        maxLTV: {
          purchase:       100,
          rateTerm:       100,
          cashOut:        90,
        },
        maxDTI:           55,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      24,
        shortSaleSeasoning: 24,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        requiresPrimaryResidence: true,
        notes:            [NOTES.VA_FUNDING_FEE],
      },
    },

    tier:         "A+",
    tierNotes:    "High-volume platform with strong technology and broker support. Competitive across all three programs.",
    strengths:    ["Strong technology / portal", "Competitive FHA pricing", "High approval rates"],
    weaknesses:   ["Slightly slower turn times vs UWM on conventional", "No non-warrantable condo"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 3 — loanDepot Wholesale
  // Conventional, FHA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_003",
    name:                "loanDepot Wholesale",
    shortName:           "loanDepot",
    accentColor:         "#f97316",
    dataSource:          "REAL",
    priorityWeight:      72,
    active:              true,
    version:             1,
    guidelineVersionRef: "LOANDEPOT-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           50,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 80, rateTerm: 80, cashOut: 75 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED],
      },

      FHA: {
        minFICO:          580,
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           55,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },
    },

    tier:         "A",
    tierNotes:    "Solid conventional and FHA platform. Strong on purchase transactions.",
    strengths:    ["Strong purchase focus", "Good FHA turn times", "Broker-friendly"],
    weaknesses:   ["No VA program", "Conservative investment LTV vs competitors"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 4 — Planet Home Lending
  // Conventional, FHA, VA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_004",
    name:                "Planet Home Lending",
    shortName:           "Planet Home",
    accentColor:         "#0d9488",
    dataSource:          "REAL",
    priorityWeight:      74,
    active:              true,
    version:             1,
    guidelineVersionRef: "PLANET-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA", "VA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           50,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: true,   // Planet accepts manufactured — differentiator
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 85, rateTerm: 85, cashOut: 75 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED],
      },

      FHA: {
        minFICO:          580,
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           57,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: true,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },

      VA: {
        minFICO:          580,
        maxLTV: {
          purchase:       100,
          rateTerm:       100,
          cashOut:        90,
        },
        maxDTI:           55,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: true,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      24,
        shortSaleSeasoning: 24,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        requiresPrimaryResidence: true,
        notes:            [NOTES.VA_FUNDING_FEE],
      },
    },

    tier:         "A",
    tierNotes:    "Well-rounded correspondent lender with manufactured housing acceptance — a meaningful differentiator.",
    strengths:    ["Manufactured housing accepted", "Competitive VA", "Good 2–4 unit program"],
    weaknesses:   ["Slightly higher pricing vs top tier", "No non-warrantable condo"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 5 — NewRez / Shellpoint Mortgage
  // Conventional, FHA, VA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_005",
    name:                "NewRez / Shellpoint",
    shortName:           "NewRez",
    accentColor:         "#1e3a5f",
    dataSource:          "REAL",
    priorityWeight:      71,
    active:              true,
    version:             1,
    guidelineVersionRef: "NEWREZ-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA", "VA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           50,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: true,   // NewRez accepts non-warrantable — differentiator
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 85, rateTerm: 85, cashOut: 75 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED, NOTES.CONDO_REVIEW],
      },

      FHA: {
        minFICO:          580,
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           57,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },

      VA: {
        minFICO:          580,
        maxLTV: {
          purchase:       100,
          rateTerm:       100,
          cashOut:        90,
        },
        maxDTI:           55,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      24,
        shortSaleSeasoning: 24,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        requiresPrimaryResidence: true,
        notes:            [NOTES.VA_FUNDING_FEE],
      },
    },

    tier:         "A",
    tierNotes:    "Strong niche: non-warrantable condo acceptance sets NewRez apart from most competitors.",
    strengths:    ["Non-warrantable condo acceptance", "Good conventional investment program", "Solid FHA"],
    weaknesses:   ["No manufactured housing", "Slightly longer UW turn times"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 6 — Pennymac Correspondent
  // Conventional, FHA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_006",
    name:                "Pennymac Correspondent",
    shortName:           "Pennymac",
    accentColor:         "#005f9e",
    dataSource:          "REAL",
    priorityWeight:      68,
    active:              true,
    version:             1,
    guidelineVersionRef: "PENNYMAC-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           50,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 85, rateTerm: 85, cashOut: 75 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED],
      },

      FHA: {
        minFICO:          580,
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           57,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },
    },

    tier:         "A",
    tierNotes:    "Large correspondent platform with reliable execution and consistent guideline adherence.",
    strengths:    ["Consistent execution", "Reliable FHA platform", "Strong pricing on conforming"],
    weaknesses:   ["No VA program", "No non-warrantable condo"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 7 — Freedom Mortgage
  // VA Specialist (also offers FHA)
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_007",
    name:                "Freedom Mortgage",
    shortName:           "Freedom",
    accentColor:         "#b91c1c",
    dataSource:          "REAL",
    priorityWeight:      78,
    active:              true,
    version:             1,
    guidelineVersionRef: "FREEDOM-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["FHA", "VA"],

    guidelines: {

      FHA: {
        minFICO:          550,   // Freedom more aggressive on FHA FICO — differentiator
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           57,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: true,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },

      VA: {
        minFICO:          550,   // One of the most aggressive VA FICO overlays in market
        maxLTV: {
          purchase:       100,
          rateTerm:       100,
          cashOut:        100,  // Freedom allows 100% VA cash-out — rare differentiator
        },
        maxDTI:           60,   // VA specialist — higher DTI tolerance
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: true,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      12,   // VA-specific: more aggressive BK seasoning
        fcSeasoning:      24,
        shortSaleSeasoning: 24,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        requiresPrimaryResidence: true,
        notes:            [NOTES.VA_FUNDING_FEE],
      },
    },

    tier:         "A+",
    tierNotes:    "The VA specialist. Lowest FICO overlays, highest DTI tolerance, and 100% VA cash-out — best-in-class for veteran borrowers.",
    strengths:    [
      "550 FICO minimum for VA (market-leading)",
      "100% VA cash-out refi available",
      "12-month BK seasoning on VA",
    ],
    weaknesses:   ["No conventional program", "Primarily VA/FHA focus"],
    states:       ["ALL"],
  },


  // ══════════════════════════════════════════════════════════════════
  // LENDER 8 — Cardinal Financial
  // Conventional, FHA, VA
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "agency_008",
    name:                "Cardinal Financial",
    shortName:           "Cardinal",
    accentColor:         "#9f1239",
    dataSource:          "REAL",
    priorityWeight:      69,
    active:              true,
    version:             1,
    guidelineVersionRef: "CARDINAL-AGENCY-2026-Q1",
    effectiveDate:       "2026-01-01",
    endDate:             null,
    programs:            ["Conventional", "FHA", "VA"],

    guidelines: {

      Conventional: {
        minFICO:          620,
        maxLTV: {
          purchase:       97,
          rateTerm:       97,
          cashOut:        80,
        },
        maxDTI:           49,   // Slightly conservative DTI vs competitors
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: true,
        investmentMaxLTV: { purchase: 80, rateTerm: 80, cashOut: 70 },
        allowsSelfEmployed: true,
        bkSeasoning:      48,
        fcSeasoning:      84,
        shortSaleSeasoning: 84,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: 2, investment: 6 },
        notes:            [NOTES.PMI_REQUIRED],
      },

      FHA: {
        minFICO:          580,
        ficoCutoffForReducedLTV: 580,
        reducedLTVBelowCutoff: 90,
        maxLTV: {
          purchase:       96.5,
          rateTerm:       97.75,
          cashOut:        80,
        },
        maxDTI:           55,
        maxLoanAmount:    FHA_FLOOR,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      36,
        shortSaleSeasoning: 36,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        notes:            [NOTES.FHA_MIP],
      },

      VA: {
        minFICO:          580,
        maxLTV: {
          purchase:       100,
          rateTerm:       100,
          cashOut:        90,
        },
        maxDTI:           55,
        maxLoanAmount:    CONFORMING_LIMIT,
        allowsCondos:     true,
        allowsNonWarrantableCondo: false,
        allowsManufactured: false,
        allows2to4Unit:   true,
        allowsInvestment: false,
        allowsSelfEmployed: true,
        bkSeasoning:      24,
        fcSeasoning:      24,
        shortSaleSeasoning: 24,
        incomeTypes:      ["fullDoc"],
        reservesMonths:   { primary: 0, secondHome: null, investment: null },
        requiresPrimaryResidence: true,
        notes:            [NOTES.VA_FUNDING_FEE],
      },
    },

    tier:         "A",
    tierNotes:    "Full-spectrum Agency lender with solid execution across all three programs.",
    strengths:    ["Conventional + FHA + VA under one roof", "Good condo program", "Reliable pricing"],
    weaknesses:   ["Conservative investment LTV", "Slightly lower DTI ceiling on conventional"],
    states:       ["ALL"],
  },

]; // end agencyLenderMatrix


// ─── Quick-Access Lookups ─────────────────────────────────────────────────────

/** Map of lender ID → lender record for O(1) engine lookup */
export const agencyLenderById = Object.fromEntries(
  agencyLenderMatrix.map((l) => [l.id, l])
);

/** All lenders that offer a specific program */
export function getLendersByProgram(program) {
  return agencyLenderMatrix.filter(
    (l) => l.active && l.programs.includes(program)
  );
}

/** All active Agency lenders */
export function getActiveAgencyLenders() {
  return agencyLenderMatrix.filter((l) => l.active);
}


// ─── Matrix Integrity Check (runs at import time in dev) ─────────────────────

if (process.env.NODE_ENV !== "production") {
  const ids = agencyLenderMatrix.map((l) => l.id);
  const uniqueIds = new Set(ids);

  if (uniqueIds.size !== agencyLenderMatrix.length) {
    console.error("[AgencyLenderMatrix] ❌ Duplicate lender IDs detected! Check matrix for conflicts.");
  }

  agencyLenderMatrix.forEach((lender) => {
    lender.programs.forEach((prog) => {
      if (!lender.guidelines[prog]) {
        console.error(
          `[AgencyLenderMatrix] ❌ ${lender.id} lists program "${prog}" ` +
          `but guidelines.${prog} is missing.`
        );
      }
    });
  });

  console.log(
    `[AgencyLenderMatrix] ✅ Loaded ${agencyLenderMatrix.length} Agency lenders | ` +
    `${agencyLenderMatrix.filter(l => l.programs.includes("Conventional")).length} Conventional | ` +
    `${agencyLenderMatrix.filter(l => l.programs.includes("FHA")).length} FHA | ` +
    `${agencyLenderMatrix.filter(l => l.programs.includes("VA")).length} VA`
  );
}

export default agencyLenderMatrix;
