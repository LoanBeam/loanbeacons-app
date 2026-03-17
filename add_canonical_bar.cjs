// add_canonical_bar.cjs
// Adds CanonicalSequenceBar to all live LoanBeacons modules
// Run from project root: node add_canonical_bar.cjs

const fs = require('fs');
const path = require('path');

const BASE = "C:/Users/Sherae's Computer/loanbeacons-app/src";

// Each module: [filePath, moduleKey, scenarioIdVar, recordIdVar]
const MODULES = [
  // Pages - already done
  // ['pages/IncomeAnalyzer.jsx', 'INCOME_ANALYZER', 'scenarioId', 'savedRecordId'],

  // Pages
  ['pages/QualifyingIntel.jsx',        'QUALIFYING_INTEL',    'scenarioId', 'savedRecordId'],
  ['pages/FHAStreamline.jsx',          'FHA_STREAMLINE',      'scenarioId', 'savedRecordId'],
  ['pages/DebtConsolidation.jsx',      'DEBT_CONSOLIDATION',  'scenarioId', 'savedRecordId'],
  ['pages/RateBuydownCalculator.jsx',  'RATE_BUYDOWN',        'scenarioId', 'savedRecordId'],
  ['pages/MIOptimizer.jsx',            'MI_OPTIMIZER',        'scenarioId', 'savedRecordId'],
  ['pages/IntelligentChecklist.jsx',   'INTELLIGENT_CHECKLIST','scenarioId','savedRecordId'],
  ['pages/PiggybackOptimizer.jsx',     'PIGGYBACK_OPTIMIZER', 'scenarioId', 'savedRecordId'],
  ['pages/DisclosureIntel.jsx',        'DISCLOSURE_INTEL',    'scenarioId', 'savedRecordId'],
  ['pages/ComplianceIntel.jsx',        'COMPLIANCE_INTEL',    'scenarioId', 'savedRecordId'],
  ['pages/FloodIntel.jsx',             'FLOOD_INTEL',         'scenarioId', 'savedRecordId'],
  ['pages/AUSRescue.jsx',              'AUS_RESCUE',          'scenarioId', 'savedRecordId'],
  ['pages/ScenarioCreator.jsx',        'SCENARIO_CREATOR',    'scenarioId', 'savedRecordId'],

  // Modules
  ['modules/RehabIntelligence.jsx',           'REHAB_INTEL',      'scenarioId', 'savedRecordId'],
  ['modules/VAIRRRLIntelligence.jsx',         'VA_IRRRL',         'scenarioId', 'savedRecordId'],
  ['modules/ARMStructureIntelligence.jsx',    'ARM_STRUCTURE',    'scenarioId', 'savedRecordId'],
  ['modules/dpa-intelligence/DPAIntelligence.jsx', 'DPA_INTEL',  'scenarioId', 'savedRecordId'],
];

// Import line templates based on depth
const getImport = (filePath) => {
  const depth = filePath.split('/').length - 1;
  const prefix = depth === 1 ? '..' : depth === 2 ? '../..' : '../../..';
  return `import CanonicalSequenceBar from '${prefix}/components/CanonicalSequenceBar';`;
};

// Component line
const getComponent = (moduleKey, scenarioVar, recordVar) =>
  `      <CanonicalSequenceBar currentModuleKey="${moduleKey}" scenarioId={${scenarioVar}} recordId={${recordVar}} />`;

let added = 0;
let skipped = 0;
let missing = 0;

MODULES.forEach(([relPath, moduleKey, scenarioVar, recordVar]) => {
  const fullPath = path.join(BASE, relPath).replace(/\//g, path.sep);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠ MISSING: ${relPath}`);
    missing++;
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');

  // Skip if already added
  if (content.includes('CanonicalSequenceBar')) {
    console.log(`✓ SKIP (already has bar): ${relPath}`);
    skipped++;
    return;
  }

  const importLine = getImport(relPath);
  const componentLine = getComponent(moduleKey, scenarioVar, recordVar);

  // 1. Add import after the first import block
  // Find last import line and insert after it
  const importMatches = [...content.matchAll(/^import .+$/gm)];
  if (importMatches.length === 0) {
    console.log(`⚠ NO IMPORTS FOUND: ${relPath}`);
    missing++;
    return;
  }
  const lastImport = importMatches[importMatches.length - 1];
  const insertPos = lastImport.index + lastImport[0].length;
  content = content.slice(0, insertPos) + '\n' + importLine + content.slice(insertPos);

  // 2. Add component before the last closing </div> before ); }
  // Pattern: find the last    </div>\n  );\n} at end of file
  const patterns = [
    /(\s+<\/div>\n\s+\);\n\}[\s]*$)/,
    /(\s+<\/div>\n  \);\n\}[\s]*$)/,
    /(\n    <\/div>\n  \);\n\}[\s]*$)/,
  ];

  let patternFound = false;
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const idx = content.lastIndexOf(match[0]);
      content = content.slice(0, idx) + '\n' + componentLine + content.slice(idx);
      patternFound = true;
      break;
    }
  }

  if (!patternFound) {
    // Fallback: insert before last </div>
    const lastDiv = content.lastIndexOf('</div>');
    if (lastDiv !== -1) {
      content = content.slice(0, lastDiv) + componentLine + '\n' + content.slice(lastDiv);
      patternFound = true;
    }
  }

  if (!patternFound) {
    console.log(`⚠ COULD NOT FIND INSERTION POINT: ${relPath}`);
    missing++;
    return;
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✅ ADDED: ${relPath} → ${moduleKey}`);
  added++;
});

console.log(`\n=============================`);
console.log(`✅ Added:   ${added}`);
console.log(`⏭ Skipped: ${skipped}`);
console.log(`⚠ Issues:  ${missing}`);
console.log(`=============================`);
console.log('\nDone! Run Ctrl+Shift+R in browser to see changes.');
