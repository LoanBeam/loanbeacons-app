// ============================================================
//  src/utils/moduleRegistry.js
//  LoanBeacons™ — Canonical Sequence™ Module Registry
//  Drives: ModuleNav dropdown, CanonicalSequenceBar dots,
//          FILE_PROGRESS tracker (28 dots), NSI routing
//
//  Canonical Sequence™ M01–M28 — April 2026
//  CRA_INTEL is background infrastructure — no route, no dot.
// ============================================================

export const MODULE_REGISTRY = [
  // ── Stage 1: Pre-Structure (M01–M07) ──────────────────────
  { id: 1,  key: 'SCENARIO_CREATOR',     label: 'Scenario Creator',               shortLabel: 'Scenario Creator',    path: '/scenario-creator',       stage: 1, live: true  },
  { id: 2,  key: 'INCOME_ANALYZER',      label: 'Income Analyzer',                shortLabel: 'Income Analyzer',     path: '/income-analyzer',        stage: 1, live: true  },
  { id: 3,  key: 'QUALIFYING_INTEL',     label: 'Qualifying Intelligence',        shortLabel: 'Qualifying Intel',    path: '/qualifying-intel',       stage: 1, live: true  },
  { id: 4,  key: 'ASSET_ANALYZER',       label: 'Asset Analyzer',                 shortLabel: 'Asset Analyzer',      path: '/asset-analyzer',         stage: 1, live: true  },
  { id: 5,  key: 'CREDIT_INTEL',         label: 'Credit Intelligence',            shortLabel: 'Credit Intel',        path: '/credit-intel',           stage: 1, live: true  },
  { id: 6,  key: 'DEBT_CONSOLIDATION',   label: 'Debt Consolidation Intelligence',shortLabel: 'Debt Consolidation',  path: '/debt-consolidation',     stage: 1, live: true  },
  { id: 7,  key: 'BANK_STATEMENT_INTEL', label: 'Bank Statement Intelligence',    shortLabel: 'Bank Statement Intel',path: '/bank-statement-intel',   stage: 1, live: true  },

  // ── Stage 2: Lender Fit (M08–M17) ─────────────────────────
  { id: 8,  key: 'LENDER_MATCH',         label: 'Lender Match',                   shortLabel: 'Lender Match',        path: '/lender-match',           stage: 2, live: true  },
  { id: 9,  key: 'DPA_INTEL',            label: 'DPA Intelligence',               shortLabel: 'DPA Intelligence',    path: '/dpa-intelligence',       stage: 2, live: true  },
  { id: 10, key: 'AUS_RESCUE',           label: 'AUS Rescue',                     shortLabel: 'AUS Rescue',          path: '/aus-rescue',             stage: 2, live: true  },
  { id: 11, key: 'FHA_STREAMLINE',       label: 'FHA Streamline Intelligence',    shortLabel: 'FHA Streamline',      path: '/fha-streamline',         stage: 2, live: true  },
  { id: 12, key: 'VA_IRRRL',             label: 'VA IRRRL Intelligence',          shortLabel: 'VA IRRRL',            path: '/va-irrrl',               stage: 2, live: true  },
  { id: 13, key: 'USDA_INTEL',           label: 'USDA Intelligence',              shortLabel: 'USDA Intel',          path: '/usda-intelligence',      stage: 2, live: true  },
  { id: 14, key: 'CONVENTIONAL_REFI',    label: 'Conventional Refi Intelligence', shortLabel: 'Conventional Refi',   path: '/conventional-refi',      stage: 2, live: true  },
  { id: 15, key: 'RATE_BUYDOWN',         label: 'Rate Buydown Calculator',        shortLabel: 'Rate Buydown',        path: '/rate-buydown',           stage: 2, live: true  },
  { id: 16, key: 'MI_OPTIMIZER',         label: 'MI Optimizer',                   shortLabel: 'MI Optimizer',        path: '/mi-optimizer',           stage: 2, live: true  },
  { id: 17, key: 'ARM_STRUCTURE',        label: 'ARM Structure Intelligence',     shortLabel: 'ARM Structure',       path: '/arm-structure',          stage: 2, live: true  },

  // ── Stage 3: Optimization (M18–M26) ───────────────────────
  { id: 18, key: 'REHAB_INTEL',          label: 'Rehab Intelligence',             shortLabel: 'Rehab Intel',         path: '/rehab-intelligence',     stage: 3, live: true  },
  { id: 19, key: 'RATE_INTEL',           label: 'Rate Intelligence',              shortLabel: 'Rate Intel',          path: '/rate-intel',             stage: 3, live: true  },
  { id: 20, key: 'CLOSING_COST_CALC',    label: 'Closing Cost Calculator',        shortLabel: 'Closing Cost Calc',   path: '/closing-cost-calc',      stage: 3, live: true  },
  { id: 21, key: 'PROPERTY_INTEL',       label: 'Collateral Intelligence',        shortLabel: 'Collateral Intel',    path: '/property-intel',         stage: 3, live: true  },
  { id: 22, key: 'PIGGYBACK_OPTIMIZER',  label: 'Piggyback 2nd Optimizer',        shortLabel: 'Piggyback Optimizer', path: '/piggyback-optimizer',    stage: 3, live: true  },
  { id: 23, key: 'TITLE_INTEL',          label: 'Title Intelligence',             shortLabel: 'Title Intel',         path: '/title-intel',            stage: 3, live: true  },
  { id: 24, key: 'DISCLOSURE_INTEL',     label: 'Disclosure Intelligence',        shortLabel: 'Disclosure Intel',    path: '/disclosure-intel',       stage: 3, live: true  },
  { id: 25, key: 'COMPLIANCE_INTEL',     label: 'Compliance Intelligence',        shortLabel: 'Compliance Intel',    path: '/compliance-intel',       stage: 3, live: true  },
  { id: 26, key: 'FLOOD_INTEL',          label: 'Flood Intelligence',             shortLabel: 'Flood Intel',         path: '/flood-intel',            stage: 3, live: true  },

  // ── Stage 4: Verify & Submit (M27–M28) ────────────────────
  { id: 27, key: 'DECISION_RECORD',      label: 'Decision Record',                shortLabel: 'Decision Record',     path: '/decision-records',       stage: 4, live: true  },
  { id: 28, key: 'INTELLIGENT_CHECKLIST',label: 'Intelligent Checklist',          shortLabel: 'Intelligent Checklist',path: '/intelligent-checklist', stage: 4, live: true  },
];

// ── Lookup helpers ────────────────────────────────────────────
export const getModuleByKey  = (key)  => MODULE_REGISTRY.find(m => m.key  === key);
export const getModuleById   = (id)   => MODULE_REGISTRY.find(m => m.id   === id);
export const getModuleByPath = (path) => MODULE_REGISTRY.find(m => m.path === path);

export const getPrevModule = (id) => MODULE_REGISTRY.find(m => m.id === id - 1) || null;
export const getNextModule = (id) => MODULE_REGISTRY.find(m => m.id === id + 1) || null;

// Flat arrays used by CanonicalSequenceBar and FILE_PROGRESS tracker
export const LIVE_MODULES    = MODULE_REGISTRY.filter(m => m.live);
export const ALL_MODULE_IDS  = MODULE_REGISTRY.map(m => m.id);
export const ALL_MODULE_KEYS = MODULE_REGISTRY.map(m => m.key);
