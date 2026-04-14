// src/constants/moduleRegistry.js
// LoanBeacons™ — Canonical Sequence™ Module Registry
// Official order: M01–M28. Must match CanonicalSequenceBar, decisionRecordConstants,
// and useNextStepIntelligence exactly.
// CRA Intel is background infrastructure — intentionally excluded.

export const MODULE_GROUPS = [
  {
    label: 'Stage 1 — Pre-Structure',
    modules: [
      { num: 1,  name: 'Scenario Creator',      route: '/scenario-creator'     },
      { num: 2,  name: 'Qualifying Intel',       route: '/qualifying-intel'     },
      { num: 3,  name: 'Income Analyzer',        route: '/income-analyzer'      },
      { num: 4,  name: 'Asset Intel',            route: '/asset-analyzer'       },
      { num: 5,  name: 'Credit Intel',           route: '/credit-intel'         },
      { num: 6,  name: 'Debt Consolidation',     route: '/debt-consolidation'   },
      { num: 7,  name: 'Bank Statement Intel',   route: '/bank-statement-intel' },
    ],
  },
  {
    label: 'Stage 2 — Lender Fit',
    modules: [
      { num: 8,  name: 'Lender Match',           route: '/lender-match'         },
      { num: 9,  name: 'DPA Intelligence',       route: '/dpa-intelligence'     },
      { num: 10, name: 'AUS Rescue',             route: '/aus-rescue'           },
      { num: 11, name: 'FHA Streamline',         route: '/fha-streamline'       },
      { num: 12, name: 'VA IRRRL',               route: '/va-irrrl'             },
      { num: 13, name: 'USDA Intelligence',      route: '/usda-intelligence'    },
      { num: 14, name: 'Conventional Refi',      route: '/conventional-refi'    },
      { num: 15, name: 'Rate Buydown',           route: '/rate-buydown'         },
      { num: 16, name: 'MI Optimizer',           route: '/mi-optimizer'         },
      { num: 17, name: 'ARM Structure',          route: '/arm-structure'        },
    ],
  },
  {
    label: 'Stage 3 — Optimization',
    modules: [
      { num: 18, name: 'Rehab Intelligence',     route: '/rehab-intelligence'   },
      { num: 19, name: 'Rate Intel',             route: '/rate-intel'           },
      { num: 20, name: 'Closing Cost Calc',      route: '/closing-cost-calc'    },
      { num: 21, name: 'Property Intel',         route: '/property-intel'       },
      { num: 22, name: 'Piggyback Optimizer',    route: '/piggyback-optimizer'  },
      { num: 23, name: 'Title Intel',            route: '/title-intel'          },
      { num: 24, name: 'Disclosure Intel',       route: '/disclosure-intel'     },
      { num: 25, name: 'Compliance Intel',       route: '/compliance-intel'     },
      { num: 26, name: 'Flood Intel',            route: '/flood-intel'          },
    ],
  },
  {
    label: 'Stage 4 — Verify & Submit',
    modules: [
      { num: 27, name: 'Decision Record',        route: '/decision-records'     },
      { num: 28, name: 'Intelligent Checklist',  route: '/intelligent-checklist'},
    ],
  },
];

// Flat array — used by ModuleNav for prev/next navigation
export const ALL_MODULES = MODULE_GROUPS.flatMap(g => g.modules);
