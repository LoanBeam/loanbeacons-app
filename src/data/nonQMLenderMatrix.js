/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/data/nonQMLenderMatrix.js
 * Version: 1.0.0 — Non-QM Placeholder Lender Matrix
 * Step 3 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Contains 6 Non-QM placeholder profiles covering:
 *   Profile 1 — Aggressive Bank Statement  (nonqm_placeholder_001)
 *   Profile 2 — Conservative Bank Statement (nonqm_placeholder_002)
 *   Profile 3 — Aggressive DSCR            (nonqm_placeholder_003)
 *   Profile 4 — Conservative DSCR          (nonqm_placeholder_004)
 *   Profile 5 — Aggressive Asset Depletion (nonqm_placeholder_005)
 *   Profile 6 — Conservative Asset Depletion (nonqm_placeholder_006)
 *
 * GOVERNANCE — PLACEHOLDER_GOVERNANCE.md v1.1 applies in full:
 *   ✔ All records: dataSource = "PLACEHOLDER", version = 0
 *   ✔ All records: guidelineVersionRef = "PLACEHOLDER-v0"
 *   ✔ No banned pricing fields (rate/apr/price/spread/points/etc.)
 *   ✔ tierBasis only — no A/B/C grades exposed to UI
 *   ✔ Conservative defaults applied throughout (useConservativeDefaults: true)
 *   ✔ Placeholder records never impersonate real lenders
 *   ✔ All records validated against nonQMLenderSchema.js at initialization
 *
 * REAL LENDER REPLACEMENT:
 *   When verified lender data is ready, add a Firestore document to
 *   the `nonQMOverrides` collection with:
 *     { dataSource: "REAL", version: 1, ...realGuidelineData }
 *   The engine will automatically supersede this placeholder.
 *   This file does NOT need to be modified.
 *
 * THRESHOLDS NOTE:
 *   All thresholds represent baseline market profiles only.
 *   They may be stricter or looser than any specific lender.
 *   Source: PLACEHOLDER_GOVERNANCE.md Section 7.1
 * ============================================================
 */

import { validateNonQMLenderBatch, PROGRAMS, TIER_BASIS, DATA_SOURCES }
  from "../schemas/nonQMLenderSchema";


// ─── Shared Placeholder Metadata ─────────────────────────────────────────────

const PLACEHOLDER_VERSION_REF = "PLACEHOLDER-v0";
const PLACEHOLDER_CREATED     = "2026-02-18";
const PLACEHOLDER_ACCENT      = "#b45309";  // Amber — governance-mandated for placeholders

// Disclaimer embedded in every placeholder record
// Matches PLACEHOLDER_GOVERNANCE.md Section 7.4 exactly
const PLACEHOLDER_DISCLAIMER =
  "This profile uses estimated Non-QM guidelines and is provided for " +
  "directional purposes only. It does not represent the guidelines of any " +
  "specific lender. All terms, eligibility requirements, and program " +
  "availability must be independently verified with the lender before " +
  "quoting or submitting a loan. LoanBeacons makes no representation that " +
  "a specific lender will approve this scenario.";

// Amber banner copy — matches PLACEHOLDER_GOVERNANCE.md Section 7.1 exactly
export const PLACEHOLDER_BANNER_COPY =
  "⚠️ GENERIC NON-QM PROFILE — This result uses estimated guidelines, not " +
  "verified lender data. Thresholds represent baseline market profiles and " +
  "may be stricter or looser than any specific lender. Confirm all terms " +
  "directly with lender before quoting to borrower.";

// Section-level warning — shown once above Alternative Path section
export const PLACEHOLDER_SECTION_WARNING =
  "⚠️ One or more Non-QM results use placeholder profile data. " +
  "Results are directional only. Verify all terms with lender.";


// ─── Raw Placeholder Records ──────────────────────────────────────────────────

const rawNonQMLenderMatrix = [

  // ══════════════════════════════════════════════════════════════════
  // PROFILE 1 — Aggressive Bank Statement Profile
  // Programs: BankStatement12, BankStatement24
  // tierBasis: Aggressive | Designed for: flexible self-employed borrowers
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "nonqm_placeholder_001",
    profileName:         "Aggressive Bank Statement Profile",
    shortName:           "Aggressive BS Profile",
    dataSource:          DATA_SOURCES.PLACEHOLDER,
    accentColor:         PLACEHOLDER_ACCENT,
    priorityWeight:      70,
    active:              true,
    version:             0,
    guidelineVersionRef: PLACEHOLDER_VERSION_REF,
    effectiveDate:       PLACEHOLDER_CREATED,
    endDate:             null,
    disclaimer:          PLACEHOLDER_DISCLAIMER,

    programs: [
      PROGRAMS.BANK_STATEMENT_12,
      PROGRAMS.BANK_STATEMENT_24,
    ],

    guidelines: {

      // 12-Month Bank Statement Program
      BankStatement12: {
        minFICO:             600,
        expenseFactor:       0.50,     // 50% of business deposits count as income
        maxLTV: {
          primary: {
            purchase:        85,
            rateTerm:        80,
            cashOut:         70,
          },
          secondHome: {
            purchase:        80,
            rateTerm:        75,
            cashOut:         65,
          },
          investment: {
            purchase:        75,
            rateTerm:        70,
            cashOut:         65,
          },
        },
        maxDTI:              50,
        maxLoanAmount:       2500000,
        minReserveMonths:    3,
        allowedPropertyTypes: ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
        allowsShortTermRental: true,
        bkSeasoning:         12,       // Non-QM aggressive: 12 months post-discharge
        fcSeasoning:         24,
        shortSaleSeasoning:  24,
        states:              ["ALL"],
        cashOutMax:          null,     // No cash-out dollar cap
      },

      // 24-Month Bank Statement Program
      // Slightly more flexible LTV in exchange for longer history
      BankStatement24: {
        minFICO:             580,      // 24-month history → lower FICO floor
        expenseFactor:       0.50,
        maxLTV: {
          primary: {
            purchase:        90,      // More LTV available with longer statement history
            rateTerm:        85,
            cashOut:         75,
          },
          secondHome: {
            purchase:        85,
            rateTerm:        80,
            cashOut:         70,
          },
          investment: {
            purchase:        80,
            rateTerm:        75,
            cashOut:         70,
          },
        },
        maxDTI:              50,
        maxLoanAmount:       2500000,
        minReserveMonths:    3,
        allowedPropertyTypes: ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
        allowsShortTermRental: true,
        bkSeasoning:         12,
        fcSeasoning:         24,
        shortSaleSeasoning:  24,
        states:              ["ALL"],
        cashOutMax:          null,
      },
    },

    tierBasis:       TIER_BASIS.AGGRESSIVE,
    tierNotes:       "Most flexible bank statement profile. Best for self-employed borrowers with strong deposits and shorter credit event history.",
    strengths: [
      "600 FICO minimum — lowest in bank statement category",
      "12-month BK seasoning accepted",
      "24-month program extends to 90% LTV primary",
    ],
    weaknesses: [
      "Higher rate environment than Agency",
      "50% expense factor may limit qualifying income",
    ],
    typicalUseCase: "Self-employed borrower with strong bank deposits, lower reported taxable income, and a recent credit event.",
  },


  // ══════════════════════════════════════════════════════════════════
  // PROFILE 2 — Conservative Bank Statement Profile
  // Programs: BankStatement12, BankStatement24
  // tierBasis: Conservative | Designed for: clean file, stricter overlays
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "nonqm_placeholder_002",
    profileName:         "Conservative Bank Statement Profile",
    shortName:           "Conservative BS Profile",
    dataSource:          DATA_SOURCES.PLACEHOLDER,
    accentColor:         PLACEHOLDER_ACCENT,
    priorityWeight:      55,
    active:              true,
    version:             0,
    guidelineVersionRef: PLACEHOLDER_VERSION_REF,
    effectiveDate:       PLACEHOLDER_CREATED,
    endDate:             null,
    disclaimer:          PLACEHOLDER_DISCLAIMER,

    programs: [
      PROGRAMS.BANK_STATEMENT_12,
      PROGRAMS.BANK_STATEMENT_24,
    ],

    guidelines: {

      BankStatement12: {
        minFICO:             660,
        expenseFactor:       0.50,
        maxLTV: {
          primary: {
            purchase:        80,
            rateTerm:        75,
            cashOut:         65,
          },
          secondHome: {
            purchase:        75,
            rateTerm:        70,
            cashOut:         60,
          },
          investment: {
            purchase:        70,
            rateTerm:        65,
            cashOut:         60,
          },
        },
        maxDTI:              43,       // Conservative: aligns closer to QM standards
        maxLoanAmount:       1500000,
        minReserveMonths:    6,
        allowedPropertyTypes: ["SFR", "Condo", "TwoUnit"],
        allowsShortTermRental: false,
        bkSeasoning:         24,
        fcSeasoning:         36,
        shortSaleSeasoning:  36,
        states:              ["ALL"],
        cashOutMax:          500000,  // Dollar cap on cash-out
      },

      BankStatement24: {
        minFICO:             640,
        expenseFactor:       0.50,
        maxLTV: {
          primary: {
            purchase:        85,      // Modest improvement for longer history
            rateTerm:        80,
            cashOut:         70,
          },
          secondHome: {
            purchase:        80,
            rateTerm:        75,
            cashOut:         65,
          },
          investment: {
            purchase:        75,
            rateTerm:        70,
            cashOut:         65,
          },
        },
        maxDTI:              43,
        maxLoanAmount:       1500000,
        minReserveMonths:    6,
        allowedPropertyTypes: ["SFR", "Condo", "TwoUnit"],
        allowsShortTermRental: false,
        bkSeasoning:         24,
        fcSeasoning:         36,
        shortSaleSeasoning:  36,
        states:              ["ALL"],
        cashOutMax:          500000,
      },
    },

    tierBasis:       TIER_BASIS.CONSERVATIVE,
    tierNotes:       "Stricter overlays and lower loan amounts. Better fit for cleaner files where a lender wants more cushion.",
    strengths: [
      "Better suited for borderline Agency scenarios",
      "Tighter DTI cap closer to QM standards",
    ],
    weaknesses: [
      "Lower max loan amount ($1.5M)",
      "No short-term rental allowance",
      "Longer BK/FC seasoning requirements",
    ],
    typicalUseCase: "Self-employed borrower with clean credit history, moderate loan amount, who just misses Agency income documentation requirements.",
  },


  // ══════════════════════════════════════════════════════════════════
  // PROFILE 3 — Aggressive DSCR Profile
  // Programs: DSCR
  // tierBasis: Aggressive | Designed for: cashflow investors, STR operators
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "nonqm_placeholder_003",
    profileName:         "Aggressive DSCR Profile",
    shortName:           "Aggressive DSCR",
    dataSource:          DATA_SOURCES.PLACEHOLDER,
    accentColor:         PLACEHOLDER_ACCENT,
    priorityWeight:      72,
    active:              true,
    version:             0,
    guidelineVersionRef: PLACEHOLDER_VERSION_REF,
    effectiveDate:       PLACEHOLDER_CREATED,
    endDate:             null,
    disclaimer:          PLACEHOLDER_DISCLAIMER,

    programs: [PROGRAMS.DSCR],

    guidelines: {

      DSCR: {
        minFICO:             620,
        minDSCR:             1.00,    // Break-even DSCR accepted
        maxLTV: {
          investment: {
            purchase:        80,
            rateTerm:        75,
            cashOut:         70,
          },
        },
        maxLoanAmount:       2000000,
        minReserveMonths:    3,       // 3 months PITIA post-close
        allowedPropertyTypes: [
          "SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit",
        ],
        allowsShortTermRental: true,  // Airbnb/VRBO income permitted
        bkSeasoning:         12,
        fcSeasoning:         24,
        shortSaleSeasoning:  24,
        states:              ["ALL"],
      },
    },

    tierBasis:       TIER_BASIS.AGGRESSIVE,
    tierNotes:       "Break-even DSCR accepted. Strong for cashflow-positive properties and short-term rental operators.",
    strengths: [
      "Break-even DSCR (1.0) accepted",
      "Short-term rental / Airbnb income permitted",
      "No personal income documentation required",
    ],
    weaknesses: [
      "Investment property only",
      "20–25% down payment typically required",
    ],
    typicalUseCase: "Real estate investor purchasing a rental or Airbnb property who prefers not to document personal income or employment.",
  },


  // ══════════════════════════════════════════════════════════════════
  // PROFILE 4 — Conservative DSCR Profile
  // Programs: DSCR
  // tierBasis: Conservative | Designed for: stronger cashflow requirements
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "nonqm_placeholder_004",
    profileName:         "Conservative DSCR Profile",
    shortName:           "Conservative DSCR",
    dataSource:          DATA_SOURCES.PLACEHOLDER,
    accentColor:         PLACEHOLDER_ACCENT,
    priorityWeight:      55,
    active:              true,
    version:             0,
    guidelineVersionRef: PLACEHOLDER_VERSION_REF,
    effectiveDate:       PLACEHOLDER_CREATED,
    endDate:             null,
    disclaimer:          PLACEHOLDER_DISCLAIMER,

    programs: [PROGRAMS.DSCR],

    guidelines: {

      DSCR: {
        minFICO:             660,
        minDSCR:             1.10,    // Positive cashflow required above break-even
        maxLTV: {
          investment: {
            purchase:        75,
            rateTerm:        70,
            cashOut:         65,
          },
        },
        maxLoanAmount:       1500000,
        minReserveMonths:    6,
        allowedPropertyTypes: ["SFR", "Condo", "TwoUnit"],
        allowsShortTermRental: false, // Long-term lease income only
        bkSeasoning:         24,
        fcSeasoning:         36,
        shortSaleSeasoning:  36,
        states:              ["ALL"],
      },
    },

    tierBasis:       TIER_BASIS.CONSERVATIVE,
    tierNotes:       "Requires demonstrated cashflow above break-even. Best for seasoned landlords with stable long-term tenants.",
    strengths: [
      "Long-term lease income is highly stable for qualifying",
      "No personal income documentation required",
    ],
    weaknesses: [
      "1.10 DSCR minimum — break-even properties do not qualify",
      "No short-term rental income accepted",
      "Lower max loan amount ($1.5M)",
    ],
    typicalUseCase: "Established landlord with long-term tenant leases, positive cashflow, and good credit — who wants clean, income-free documentation.",
  },


  // ══════════════════════════════════════════════════════════════════
  // PROFILE 5 — Aggressive Asset Depletion Profile
  // Programs: AssetDepletion
  // tierBasis: Aggressive | Designed for: asset-rich, income-light borrowers
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "nonqm_placeholder_005",
    profileName:         "Aggressive Asset Depletion Profile",
    shortName:           "Aggressive Asset Depletion",
    dataSource:          DATA_SOURCES.PLACEHOLDER,
    accentColor:         PLACEHOLDER_ACCENT,
    priorityWeight:      65,
    active:              true,
    version:             0,
    guidelineVersionRef: PLACEHOLDER_VERSION_REF,
    effectiveDate:       PLACEHOLDER_CREATED,
    endDate:             null,
    disclaimer:          PLACEHOLDER_DISCLAIMER,

    programs: [PROGRAMS.ASSET_DEPLETION],

    guidelines: {

      AssetDepletion: {
        minFICO:             660,
        minAssets:           500000,   // $500K minimum qualifying assets
        depletionMonths:     60,       // Assets ÷ 60 = monthly qualifying income
        // e.g. $900,000 assets ÷ 60 = $15,000/month qualifying income
        maxLTV: {
          primary: {
            purchase:        80,
            rateTerm:        75,
            cashOut:         65,
          },
          secondHome: {
            purchase:        75,
            rateTerm:        70,
            cashOut:         60,
          },
          investment: {
            purchase:        70,
            rateTerm:        65,
            cashOut:         60,
          },
        },
        maxLoanAmount:       3000000,
        minReserveMonths:    6,        // Post-close — separate from qualifying assets
        allowedPropertyTypes: ["SFR", "Condo", "TwoUnit"],
        bkSeasoning:         24,
        fcSeasoning:         36,
        shortSaleSeasoning:  36,
        states:              ["ALL"],
      },
    },

    tierBasis:       TIER_BASIS.AGGRESSIVE,
    tierNotes:       "Lower asset threshold with 60-month depletion. Best for retirees or semi-retired borrowers with significant investable assets.",
    strengths: [
      "$500K asset minimum — accessible entry point",
      "60-month depletion method maximizes qualifying income",
      "Up to $3M loan amount",
    ],
    weaknesses: [
      "Post-close reserves required separately from qualifying assets",
      "660 FICO minimum",
    ],
    typicalUseCase: "Recently retired borrower with significant investment accounts or savings who has limited W2 income but strong liquid assets.",
  },


  // ══════════════════════════════════════════════════════════════════
  // PROFILE 6 — Conservative Asset Depletion Profile
  // Programs: AssetDepletion
  // tierBasis: Conservative | Designed for: high-net-worth, ultra-clean files
  // ══════════════════════════════════════════════════════════════════
  {
    id:                  "nonqm_placeholder_006",
    profileName:         "Conservative Asset Depletion Profile",
    shortName:           "Conservative Asset Depletion",
    dataSource:          DATA_SOURCES.PLACEHOLDER,
    accentColor:         PLACEHOLDER_ACCENT,
    priorityWeight:      50,
    active:              true,
    version:             0,
    guidelineVersionRef: PLACEHOLDER_VERSION_REF,
    effectiveDate:       PLACEHOLDER_CREATED,
    endDate:             null,
    disclaimer:          PLACEHOLDER_DISCLAIMER,

    programs: [PROGRAMS.ASSET_DEPLETION],

    guidelines: {

      AssetDepletion: {
        minFICO:             700,
        minAssets:           1000000,  // $1M minimum qualifying assets
        depletionMonths:     72,       // Assets ÷ 72 = monthly qualifying income
        // e.g. $1,800,000 assets ÷ 72 = $25,000/month qualifying income
        // Stricter depletion method = lower monthly income from same asset base
        maxLTV: {
          primary: {
            purchase:        75,
            rateTerm:        70,
            cashOut:         60,
          },
          secondHome: {
            purchase:        70,
            rateTerm:        65,
            cashOut:         55,
          },
          investment: {
            purchase:        65,
            rateTerm:        60,
            cashOut:         55,
          },
        },
        maxLoanAmount:       3000000,
        minReserveMonths:    12,       // Stricter post-close reserve requirement
        allowedPropertyTypes: ["SFR", "Condo"],
        bkSeasoning:         36,
        fcSeasoning:         48,
        shortSaleSeasoning:  48,
        states:              ["ALL"],
      },
    },

    tierBasis:       TIER_BASIS.CONSERVATIVE,
    tierNotes:       "Highest asset threshold with stricter depletion method. Designed for high-net-worth borrowers with pristine credit profiles.",
    strengths: [
      "No income documentation whatsoever required",
      "Up to $3M loan amount",
      "Designed for high-net-worth borrowers",
    ],
    weaknesses: [
      "$1M asset minimum — limits accessibility",
      "72-month depletion reduces monthly qualifying income",
      "700 FICO required",
      "12-month post-close reserves required",
    ],
    typicalUseCase: "High-net-worth retiree or executive with $1M+ in documented liquid assets, 700+ FICO, and no need to document employment income.",
  },

]; // end rawNonQMLenderMatrix


// ─── Validate All Records Against Schema ─────────────────────────────────────
// validateNonQMLenderBatch rejects malformed records at initialization.
// The engine never receives an unvalidated placeholder record.

export const nonQMLenderMatrix = validateNonQMLenderBatch(
  rawNonQMLenderMatrix,
  "nonQMLenderMatrix.js"
);


// ─── Quick-Access Lookups ─────────────────────────────────────────────────────

/** Map of lender ID → record for O(1) engine lookup */
export const nonQMLenderById = Object.fromEntries(
  nonQMLenderMatrix.map((l) => [l.id, l])
);

/** All active Non-QM lenders offering a specific program */
export function getNonQMLendersByProgram(program) {
  return nonQMLenderMatrix.filter(
    (l) => l.active && l.programs.includes(program)
  );
}

/** All active Non-QM lenders */
export function getActiveNonQMLenders() {
  return nonQMLenderMatrix.filter((l) => l.active);
}

/**
 * Returns the matching Non-QM programs for a given income documentation type.
 * This is the primary routing function called by the engine form handler.
 *
 * incomeDocType values (from LenderMatchForm):
 *   "fullDoc"           → No Non-QM programs (Agency path only)
 *   "bankStatement12"   → BankStatement12
 *   "bankStatement24"   → BankStatement24
 *   "dscr"              → DSCR
 *   "assetDepletion"    → AssetDepletion
 *   "ninetyNineOnly"    → NinetyNineOnly
 *   "noDoc"             → NoDoc
 */
export function getNonQMProgramsForDocType(incomeDocType) {
  const docTypeToProgram = {
    bankStatement12: PROGRAMS.BANK_STATEMENT_12,
    bankStatement24: PROGRAMS.BANK_STATEMENT_24,
    dscr:            PROGRAMS.DSCR,
    assetDepletion:  PROGRAMS.ASSET_DEPLETION,
    ninetyNineOnly:  PROGRAMS.NINETY_NINE_ONLY,
    noDoc:           PROGRAMS.NO_DOC,
  };
  return docTypeToProgram[incomeDocType] ?? null;
}

/**
 * Returns all Non-QM lenders eligible to be evaluated for a given doc type.
 * Returns empty array for fullDoc (Agency-only path).
 */
export function getNonQMLendersForDocType(incomeDocType) {
  if (incomeDocType === "fullDoc") return [];
  const targetProgram = getNonQMProgramsForDocType(incomeDocType);
  if (!targetProgram) return [];
  return getNonQMLendersByProgram(targetProgram);
}

/**
 * Returns the Firestore-merged matrix:
 * Real lender records from Firestore supersede matching placeholders.
 * Called by the engine after Firestore overrides are fetched.
 *
 * @param {Array} firestoreOverrides  — Array of docs from nonQMOverrides collection
 * @returns {Array}                   — Final merged lender list for engine use
 */
export function mergeNonQMWithOverrides(firestoreOverrides = []) {
  if (!firestoreOverrides.length) return nonQMLenderMatrix;

  // Index overrides by lender id for fast lookup
  const overrideMap = {};
  firestoreOverrides.forEach((override) => {
    if (override.id) overrideMap[override.id] = override;
  });

  // For each placeholder, check if a real override exists
  return nonQMLenderMatrix.map((lender) => {
    const override = overrideMap[lender.id];

    if (!override) return lender; // No override — use placeholder as-is

    // Override exists — real lender supersedes placeholder
    if (override.dataSource === "REAL" && override.version >= 1) {
      console.log(
        `[NonQMLenderMatrix] 🔄 Placeholder "${lender.id}" superseded by ` +
        `real lender record (v${override.version}, ref: ${override.guidelineVersionRef})`
      );
      return { ...lender, ...override }; // Real data wins on all fields
    }

    // Placeholder override (partial update, still version 0)
    if (override.dataSource === "PLACEHOLDER") {
      return { ...lender, ...override };
    }

    return lender; // Unrecognized override format — keep original
  });
}


// ─── Matrix Summary (logged at import time in dev) ───────────────────────────

if (process.env.NODE_ENV !== "production") {
  const bsProfiles  = getNonQMLendersByProgram(PROGRAMS.BANK_STATEMENT_12).length +
                      getNonQMLendersByProgram(PROGRAMS.BANK_STATEMENT_24).length;
  const dscrProfiles       = getNonQMLendersByProgram(PROGRAMS.DSCR).length;
  const assetDepProfiles   = getNonQMLendersByProgram(PROGRAMS.ASSET_DEPLETION).length;

  console.log(
    `[NonQMLenderMatrix] ✅ Loaded ${nonQMLenderMatrix.length} Non-QM placeholder profiles | ` +
    `Bank Statement: 2 profiles (12+24mo) | ` +
    `DSCR: ${dscrProfiles} | Asset Depletion: ${assetDepProfiles}`
  );
  console.log(
    `[NonQMLenderMatrix] ℹ️  All records are PLACEHOLDER (version: 0). ` +
    `Add real lender data via Firestore nonQMOverrides collection.`
  );
}

export default nonQMLenderMatrix;
