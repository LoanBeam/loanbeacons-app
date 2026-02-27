/**
 * fix_duplicate_jsx.cjs
 * Removes the duplicate Housing Expenses + Qualifying Information JSX cards
 * from ScenarioCreator.jsx (lines 1082-1335 in the broken file)
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const SC = path.join('src', 'pages', 'ScenarioCreator.jsx');
if (!fs.existsSync(SC)) { console.error('ERROR: Cannot find ' + SC); process.exit(1); }

var src = fs.readFileSync(SC, 'utf8').replace(/\r\n/g, '\n');

// The duplicate block is the SECOND occurrence of the Housing card opening.
// We identify it by finding both occurrences of the housing card header.
var housingHeader = '          <div className="bg-white rounded-lg shadow p-6">\n            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">\n              <span>\uD83C\uDFE0</span>\n              Monthly Housing Expenses (PITI)';

var first = src.indexOf(housingHeader);
if (first === -1) {
  console.error('FAILED: Cannot find Housing Expenses card. Check emoji encoding.');
  // Try without emoji
  var altHeader = 'Monthly Housing Expenses (PITI)';
  var positions = [];
  var pos = src.indexOf(altHeader);
  while (pos !== -1) { positions.push(pos); pos = src.indexOf(altHeader, pos + 1); }
  console.log('Found "Monthly Housing Expenses" at positions: ' + positions.join(', '));
  process.exit(1);
}

var second = src.indexOf(housingHeader, first + 1);
if (second === -1) {
  console.log('OK: Only one Housing card found — no JSX duplicate. Checking for other issues...');
} else {
  // Find the closing </div> of the second Qualifying card
  // The second block ends just before the Borrower Financials card
  var borrowerFinancials = '          <div className="bg-white rounded-lg shadow p-6">\n            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">';
  var bfPos = src.indexOf(borrowerFinancials, second);
  
  if (bfPos === -1) {
    console.error('FAILED: Cannot find Borrower Financials section after second housing card');
    process.exit(1);
  }

  // Remove from start of second housing card to start of Borrower Financials
  src = src.slice(0, second) + src.slice(bfPos);
  console.log('OK: Removed duplicate Housing Expenses + Qualifying Information JSX cards');
}

// Verify single copies remain
var housingCount = 0;
var pos2 = 0;
var searchStr = 'Monthly Housing Expenses (PITI)';
while ((pos2 = src.indexOf(searchStr, pos2)) !== -1) { housingCount++; pos2++; }

var qualCount = 0;
var pos3 = 0;
var searchStr2 = '<h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">';
while ((pos3 = src.indexOf(searchStr2, pos3)) !== -1) { qualCount++; pos3++; }

console.log('Housing cards: ' + housingCount + ' (expected 1)');
console.log('Qualifying cards: ' + qualCount + ' (expected 1)');

// Verify all critical sections present
var checks = [
  ['Housing card (1 copy)',     housingCount === 1],
  ['Borrower Financials',       src.includes('Borrower Financials')],
  ['Loan Purpose section',      src.includes('Loan Purpose')],
  ['LoanTypeSection component', src.includes('<LoanTypeSection')],
  ['Save buttons',              src.includes('flex gap-4 pb-24')],
  ['MISMO import',              src.includes('Import from LOS')],
  ['STATE_TAX_RATES',           src.includes('STATE_TAX_RATES')],
  ['piPayment state (1 copy)',  src.indexOf('const [piPayment') === src.lastIndexOf('const [piPayment')],
];

var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); ok = false; }
});

if (!ok) { console.error('\nFile NOT saved.'); process.exit(1); }

fs.writeFileSync(SC, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: ScenarioCreator.jsx fixed!');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R — page should load cleanly');
console.log('  2. Scroll through Scenario Creator — ONE Housing + ONE Qualifying section');
console.log('  3. Import Mary Cox MISMO file — debts auto-populate as before');
console.log('  4. git add . && git commit -m "fix: remove duplicate JSX sections"');
