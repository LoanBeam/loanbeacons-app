// scripts/inject-module-nav.cjs  v2
// Run:  node scripts/inject-module-nav.cjs --dry-run
//       node scripts/inject-module-nav.cjs

const fs   = require('fs')
const path = require('path')
const DRY  = process.argv.includes('--dry-run')

// ── Confirmed: M09=RateBuydown  M10=FHA  M11=VA  M21=DecisionRecord ──
const KEY_TO_NUM = {
  SCENARIO_CREATOR:      1,
  QUALIFYING_INTEL:      2,
  INCOME_ANALYZER:       3,
  ASSET_ANALYZER:        4,
  CREDIT_INTEL:          5,
  BANK_STATEMENT:        6,
  BANK_STATEMENT_INTEL:  6,
  DEBT_CONSOLIDATION:    7,
  AUS_RESCUE:            8,
  LENDER_MATCH:          8,
  RATE_BUYDOWN:          9,
  FHA_STREAMLINE:       10,   // confirmed M10
  VA_IRRRL:             11,   // confirmed M11
  USDA_INTELLIGENCE:    13,
  CONVENTIONAL_REFI:    14,
  DPA_INTELLIGENCE:     15,
  PROPERTY_INTEL:       16,
  COLLATERAL_INTEL:     16,
  TITLE_INTEL:          17,
  MI_OPTIMIZER:         18,
  ARM_STRUCTURE:        19,
  REHAB_INTELLIGENCE:   20,
  REHAB_INTEL:          20,
  DECISION_RECORD:      21,   // confirmed M21
  RATE_INTEL:           22,
  CLOSING_COST_CALC:    23,
  PIGGYBACK_OPTIMIZER:  24,
  FLOOD_INTEL:          25,
  DISCLOSURE_INTEL:     26,
  COMPLIANCE_INTEL:     27,
  INTELLIGENT_CHECKLIST:28,
}

// Fallback for files that have CanonicalSequenceBar but no currentModuleKey prop
const FILE_TO_NUM = {
  'ConventionalRefiIntel.jsx': 14,
  'DPAIntelligence.jsx':       15,
  'TitleIntel.jsx':            17,
  'AssetAnalyzer.jsx':          4,
  'CreditIntel.jsx':            5,
}

const DIRS = [
  path.join(__dirname, '..', 'src', 'pages'),
  path.join(__dirname, '..', 'src', 'modules'),
]

const done = new Set()  // prevent double-processing same filename
let updated = 0, errors = 0

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue
  const files = fs.readdirSync(dir).filter(f => /\.(jsx|tsx)$/.test(f))

  for (const file of files) {
    const base     = file
    const fullPath = path.join(dir, file)

    // Skip utility/non-module files
    if (['App.jsx','Navbar.jsx','Footer.jsx','Dashboard.jsx','LoginPage.jsx','SignUpPage.jsx',
         'ProtectedRoute.jsx','AESharePage.jsx','ProcessorSharePage.jsx','LenderIntakeForm.jsx',
         'ScenarioDetail.jsx','Admin.jsx','LoanPathGraph.jsx','DecisionRecordDashboard.jsx',
         'DecisionRecordDetail.jsx','LenderProfileBuilder.jsx','ScenariosPage.jsx',
         'AuthContext.jsx','ModuleNav.jsx','CanonicalSequenceBar.jsx'].includes(base)) continue

    let content
    try { content = fs.readFileSync(fullPath, 'utf8') }
    catch(e) { console.error(`  ✗ Cannot read ${base}: ${e.message}`); errors++; continue }

    const hasCanonical = content.includes('CanonicalSequenceBar')
    const hasFallback  = FILE_TO_NUM[base] !== undefined

    if (!hasCanonical && !hasFallback) continue

    // Already migrated?
    if (content.includes('<ModuleNav moduleNumber={') && !content.includes('moduleNumber={0}')) {
      console.log(`  ✓ Already done: ${base}`)
      continue
    }

    // Deduplicate across pages/ and modules/
    if (done.has(base)) {
      console.log(`  ↩ Skipped duplicate: ${base}`)
      continue
    }

    // Resolve module number
    const keyMatch = content.match(/currentModuleKey\s*=\s*["']([^"']+)["']/)
    const key      = keyMatch ? keyMatch[1].toUpperCase() : null
    const num      = (key && KEY_TO_NUM[key]) || FILE_TO_NUM[base] || 0
    const label    = `M${String(num).padStart(2,'0')} (${key || 'filename fallback'})`

    if (num === 0) {
      console.warn(`  ⚠️  No number found — skipping: ${base}`)
      continue
    }

    if (DRY) {
      console.log(`  [DRY] ${base.padEnd(36)} → ${label}`)
      done.add(base)
      continue
    }

    try {
      let c = content
      // Remove old import
      c = c.replace(/^import\s+CanonicalSequenceBar\s+from\s+['"][^'"]+['"];\s*\n/m, '')
      // Add new import if missing
      if (!c.includes("import ModuleNav from")) {
        c = c.replace(/(^import[^\n]+\n)(?!import)/m,
          `$1import ModuleNav from '../components/ModuleNav';\n`)
      }
      // Remove CanonicalSequenceBar JSX (handles multiline and self-closing)
      c = c.replace(/[ \t]*<CanonicalSequenceBar[^>]*\/>\s*\n?/g, '')
      // Insert ModuleNav as first child of return div
      c = c.replace(
        /(return\s*\(\s*\n\s*<div[^>]*>)/,
        `$1\n      <ModuleNav moduleNumber={${num}} />`
      )
      fs.writeFileSync(fullPath, c, 'utf8')
      console.log(`  ✅ ${base.padEnd(36)} → ${label}`)
      done.add(base)
      updated++
    } catch(e) {
      console.error(`  ✗ Error writing ${base}: ${e.message}`)
      errors++
    }
  }
}

console.log(`\n──────────────────────────────────────────`)
console.log(`  ${DRY ? '[DRY RUN] Would update' : 'Updated'}: ${DRY ? done.size : updated} files`)
if (errors) console.log(`  Errors: ${errors}`)
console.log(`──────────────────────────────────────────\n`)
