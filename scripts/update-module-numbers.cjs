// scripts/update-module-numbers.cjs
// Updates all <ModuleNav moduleNumber={X} /> props to match the
// confirmed Canonical Sequence™ numbering.
// Run: node scripts/update-module-numbers.cjs

const fs   = require('fs')
const path = require('path')

const DRY = process.argv.includes('--dry-run')

// ── Filename → correct module number (George's confirmed sequence) ──
const FILE_TO_NUM = {
  // Stage 1
  'ScenarioCreator.jsx':           1,
  'QualifyingIntel.jsx':           2,
  'IncomeAnalyzer.jsx':            3,
  'AssetAnalyzer.jsx':             4,
  'CreditIntel.jsx':               5,
  'DebtConsolidation.jsx':         6,
  'BankStatementIntel.jsx':        7,
  // Stage 2
  'LenderMatch.jsx':               8,
  'DPAIntelligence.jsx':           9,
  'AUSRescue.jsx':                10,
  'FHAStreamline.jsx':            11,
  'VAIRRRL.jsx':                  12,
  'VAIRRRLIntelligence.jsx':      12,
  'USDAIntelligence.jsx':         13,
  'ConventionalRefiIntel.jsx':    14,
  // Stage 3
  'RateBuydownCalculator.jsx':    15,
  'MIOptimizer.jsx':              16,
  'ARMStructureIntelligence.jsx': 17,
  'RehabIntelligence.jsx':        18,
  'RateIntel.jsx':                19,
  'ClosingCostCalc.jsx':          20,
  'PropertyIntel.jsx':            21,   // now Collateral Intelligence
  'PiggybackOptimizer.jsx':       22,
  // Stage 4
  'TitleIntel.jsx':               23,
  'ComplianceIntel.jsx':          24,
  'DisclosureIntel.jsx':          25,
  'FloodIntel.jsx':               26,
  'DecisionRecordDashboard.jsx':  27,
  'IntelligentChecklist.jsx':     28,
}

const DIRS = [
  path.join(__dirname, '..', 'src', 'pages'),
  path.join(__dirname, '..', 'src', 'modules'),
]

const done = new Set()
let updated = 0

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const file of fs.readdirSync(dir).filter(f => /\.jsx$/.test(f))) {
    const num = FILE_TO_NUM[file]
    if (!num || done.has(file)) continue

    const fullPath = path.join(dir, file)
    let c = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n')

    const match = c.match(/<ModuleNav moduleNumber=\{(\d+)\}/)
    if (!match) {
      console.log(`  — No ModuleNav found: ${file}`)
      continue
    }

    const current = parseInt(match[1])
    if (current === num) {
      console.log(`  ✓ Already correct: ${file} → M${String(num).padStart(2,'0')}`)
      done.add(file)
      continue
    }

    const updated_content = c.replace(
      /<ModuleNav moduleNumber=\{\d+\}/g,
      `<ModuleNav moduleNumber={${num}}`
    )

    if (DRY) {
      console.log(`  [DRY] ${file.padEnd(36)} M${String(current).padStart(2,'0')} → M${String(num).padStart(2,'0')}`)
    } else {
      fs.writeFileSync(fullPath, updated_content, 'utf8')
      console.log(`  ✅ ${file.padEnd(36)} M${String(current).padStart(2,'0')} → M${String(num).padStart(2,'0')}`)
      updated++
    }
    done.add(file)
  }
}

console.log(`\n──────────────────────────────────────────`)
console.log(`  ${DRY ? '[DRY] Would update' : 'Updated'}: ${DRY ? done.size : updated} files`)
console.log(`──────────────────────────────────────────\n`)
