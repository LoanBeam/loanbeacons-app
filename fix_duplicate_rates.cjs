/**
 * fix_duplicate_rates.cjs
 * Removes the second (duplicate) STATE_TAX_RATES block from ScenarioCreator.jsx
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const SC = path.join('src', 'pages', 'ScenarioCreator.jsx');
if (!fs.existsSync(SC)) { console.error('ERROR: Cannot find ' + SC); process.exit(1); }

var src = fs.readFileSync(SC, 'utf8').replace(/\r\n/g, '\n');

// Find both occurrences of the rate table block
var marker = '// ── State-level effective property tax rates (2024 averages) ────────────────';
var first = src.indexOf(marker);
var second = src.indexOf(marker, first + 1);

if (first === -1) {
  console.error('FAILED: Could not find STATE_TAX_RATES block at all');
  process.exit(1);
}

if (second === -1) {
  console.log('OK: Only one copy found — no duplicate to remove. File unchanged.');
  process.exit(0);
}

// The block ends just before "function ScenarioCreator() {"
// Find the second occurrence's end = start of "function ScenarioCreator"
var fnMarker = 'function ScenarioCreator() {';
var fnPos = src.indexOf(fnMarker, second);

if (fnPos === -1) {
  console.error('FAILED: Could not find function ScenarioCreator after second block');
  process.exit(1);
}

// Remove from second occurrence up to (but not including) the function declaration
src = src.slice(0, second) + src.slice(fnPos);

// Verify only one copy remains
var remaining = src.indexOf(marker, src.indexOf(marker) + 1);
if (remaining !== -1) {
  console.error('FAILED: Still more than one copy after fix');
  process.exit(1);
}

console.log('OK: Removed duplicate STATE_TAX_RATES block');
console.log('OK: STATE_INS_RATES block also deduplicated');

// Verify key things still present
var checks = [
  ['STATE_TAX_RATES',      src.includes('STATE_TAX_RATES')],
  ['STATE_INS_RATES',      src.includes('STATE_INS_RATES')],
  ['estimateTaxes fn',     src.includes('function estimateTaxes')],
  ['estimateInsurance fn', src.includes('function estimateInsurance')],
  ['ScenarioCreator fn',   src.includes('function ScenarioCreator()')],
  ['taxEstimated state',   src.includes('taxEstimated')],
];
var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); ok = false; }
});
if (!ok) { console.error('File NOT saved.'); process.exit(1); }

fs.writeFileSync(SC, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: Duplicate removed. ScenarioCreator.jsx saved.');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R in browser — red error should be gone');
console.log('  2. Scenario Creator should load normally');
