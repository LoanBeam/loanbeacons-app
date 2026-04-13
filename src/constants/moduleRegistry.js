// src/constants/moduleRegistry.js
// ─────────────────────────────────────────────────────────────────
//  SINGLE SOURCE OF TRUTH for all LoanBeacons modules.
//  ModuleNav, prev/next arrows, and the dropdown all derive from here.
//
//  ⚠️  Module numbers are assigned based on known anchors:
//       M10 = FHA Streamline  (confirmed)
//       M11 = VA IRRRL        (confirmed)
//       M21 = Decision Record (confirmed)
//       M12 = CRA Eligibility (confirmed — shared service, no standalone route)
//  All others follow logical workflow order. Update nums here if they differ
//  from your canonical sequence — no other file needs touching.
// ─────────────────────────────────────────────────────────────────

export const MODULE_GROUPS = [
  {
    label: 'Scenario & borrower',
    modules: [
      { num: 1,  name: 'Scenario Creator',      short: 'Scenario',     route: '/scenario-creator' },
      { num: 2,  name: 'Qualifying Intel',       short: 'Qualifying',   route: '/qualifying-intel' },
      { num: 3,  name: 'Income Analyzer',        short: 'Income',       route: '/income-analyzer' },
      { num: 4,  name: 'Asset Analyzer',         short: 'Assets',       route: '/asset-analyzer' },
      { num: 5,  name: 'Credit Intel',           short: 'Credit',       route: '/credit-intel' },
      { num: 6,  name: 'Bank Statement Intel',   short: 'Bank Stmt',    route: '/bank-statement-intel' },
      { num: 7,  name: 'Debt Consolidation',     short: 'Debt Consol',  route: '/debt-consolidation' },
    ]
  },
  {
    label: 'Strategy',
    modules: [
      { num: 8,  name: 'AUS Rescue',             short: 'AUS Rescue',   route: '/aus-rescue' },
      { num: 9,  name: 'Lender Match',           short: 'Lender Match', route: '/lender-match' },
      { num: 10, name: 'DPA Intelligence',        short: 'DPA',          route: '/dpa-intelligence' }, // ⚠️ VERIFY num — may be earlier
    ]
  },
  {
    label: 'Programs',
    modules: [
      { num: 11, name: 'FHA Streamline',          short: 'FHA',          route: '/fha-streamline' },   // ⚠️ VERIFY — known to be M10
      { num: 12, name: 'VA IRRRL',                short: 'VA IRRRL',     route: '/va-irrrl' },          // ⚠️ VERIFY — known to be M11
      { num: 13, name: 'USDA Intelligence',       short: 'USDA',         route: '/usda-intelligence' },
      { num: 14, name: 'Conventional Refi',       short: 'Conv Refi',    route: '/conventional-refi' },
    ]
  },
  {
    label: 'Property & closing',
    modules: [
      { num: 15, name: 'Collateral Intel',        short: 'Collateral',   route: '/property-intel' },
      { num: 16, name: 'Title Intel',             short: 'Title',        route: '/title-intel' },
      { num: 17, name: 'Rate Buydown',            short: 'Rate Buydown', route: '/rate-buydown' },
      { num: 18, name: 'MI Optimizer',            short: 'MI Opt',       route: '/mi-optimizer' },
      { num: 19, name: 'ARM Structure',           short: 'ARM',          route: '/arm-structure' },
      { num: 20, name: 'Rehab Intelligence',      short: 'Rehab',        route: '/rehab-intelligence' },
      { num: 22, name: 'Closing Cost Calc',       short: 'Closing Costs',route: '/closing-cost-calc' },
      { num: 23, name: 'Rate Intel',              short: 'Rate Intel',   route: '/rate-intel' },
      { num: 24, name: 'Piggyback Optimizer',     short: 'Piggyback',    route: '/piggyback-optimizer' },
      { num: 25, name: 'Flood Intel',             short: 'Flood',        route: '/flood-intel' },
      { num: 26, name: 'Rehab Intel',             short: 'Rehab',        route: '/rehab-intelligence' }, // ⚠️ dup — remove if rehab already above
    ]
  },
  {
    label: 'Compliance & intelligence',
    modules: [
      { num: 21, name: 'Decision Record',         short: 'Decision Rec', route: '/decision-records' },  // confirmed M21
      { num: 27, name: 'Disclosure Intel',        short: 'Disclosure',   route: '/disclosure-intel' },
      { num: 28, name: 'Compliance Intel',        short: 'Compliance',   route: '/compliance-intel' },
      { num: 29, name: 'Intelligent Checklist',   short: 'Checklist',    route: '/intelligent-checklist' },
    ]
  },
]

// ─────────────────────────────────────────────────────────────────
//  Flat list — used for prev/next arrow navigation.
//  Order here = the order the arrows traverse. Adjust to match
//  your canonical sequence if needed.
// ─────────────────────────────────────────────────────────────────
export const ALL_MODULES = MODULE_GROUPS.flatMap(g => g.modules)

// ─────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────
export const getModuleByNum = (num) => ALL_MODULES.find(m => m.num === num)
export const getModuleByRoute = (route) => ALL_MODULES.find(m => m.route === route)
