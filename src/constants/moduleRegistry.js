// src/constants/moduleRegistry.js
// LoanBeacons™ — Canonical Sequence™ Module Registry
// Shape: MODULE_GROUPS (for dropdown) + ALL_MODULES (for prev/next nav)
// M02 = Income Analyzer, M03 = Qualifying Intelligence (swapped Apr 2026)

export const MODULE_GROUPS = [
  {
    label: 'Stage 1 — Pre-Structure',
    modules: [
      { num: 1,  name: 'Scenario Creator',               route: '/scenario-creator'      },
      { num: 2,  name: 'Income Analyzer',                route: '/income-analyzer'        },
      { num: 3,  name: 'Qualifying Intelligence',        route: '/qualifying-intel'       },
      { num: 4,  name: 'Asset Analyzer',                 route: '/asset-analyzer'         },
      { num: 5,  name: 'Credit Intelligence',            route: '/credit-intel'           },
      { num: 6,  name: 'Debt Consolidation',             route: '/debt-consolidation'     },
      { num: 7,  name: 'Bank Statement Intelligence',    route: '/bank-statement-intel'   },
    ],
  },
  {
    label: 'Stage 2 — Lender Fit',
    modules: [
      { num: 8,  name: 'Lender Match',                   route: '/lender-match'           },
      { num: 9,  name: 'DPA Intelligence',               route: '/dpa-intelligence'       },
      { num: 10, name: 'AUS Rescue',                     route: '/aus-rescue'             },
      { num: 11, name: 'FHA Streamline Intelligence',    route: '/fha-streamline'         },
      { num: 12, name: 'VA IRRRL Intelligence',          route: '/va-irrrl'               },
      { num: 13, name: 'USDA Intelligence',              route: '/usda-intelligence'      },
      { num: 14, name: 'Conventional Refi Intelligence', route: '/conventional-refi'      },
      { num: 15, name: 'Rate Buydown Calculator',        route: '/rate-buydown'           },
      { num: 16, name: 'MI Optimizer',                   route: '/mi-optimizer'           },
      { num: 17, name: 'ARM Structure Intelligence',     route: '/arm-structure'          },
    ],
  },
  {
    label: 'Stage 3 — Optimization',
    modules: [
      { num: 18, name: 'Rehab Intelligence',             route: '/rehab-intelligence'     },
      { num: 19, name: 'Rate Intelligence',              route: '/rate-intel'             },
      { num: 20, name: 'Closing Cost Calculator',        route: '/closing-cost-calc'      },
      { num: 21, name: 'Collateral Intelligence',        route: '/property-intel'         },
      { num: 22, name: 'Piggyback 2nd Optimizer',        route: '/piggyback-optimizer'    },
      { num: 23, name: 'Title Intelligence',             route: '/title-intel'            },
      { num: 24, name: 'Disclosure Intelligence',        route: '/disclosure-intel'       },
      { num: 25, name: 'Compliance Intelligence',        route: '/compliance-intel'       },
      { num: 26, name: 'Flood Intelligence',             route: '/flood-intel'            },
    ],
  },
  {
    label: 'Stage 4 — Verify & Submit',
    modules: [
      { num: 27, name: 'Decision Record',                route: '/decision-records'       },
      { num: 28, name: 'Intelligent Checklist',          route: '/intelligent-checklist'  },
    ],
  },
];

// Flat array — used by ModuleNav for prev/next arrow navigation
export const ALL_MODULES = MODULE_GROUPS.flatMap(g => g.modules);
