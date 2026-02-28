/**
 * fix_edit_and_status.cjs
 * Fixes:
 *   1. ScenarioDetail Edit button → uses /scenario-creator/:id (URL param)
 *   2. ScenarioCreator handleSubmit → saves status: 'active'
 *   3. ScenarioCreator loadScenario → removes duplicate setPropTaxes block
 *
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');

const SC = path.join('src', 'pages', 'ScenarioCreator.jsx');
const SD = path.join('src', 'pages', 'ScenarioDetail.jsx');
[SC, SD].forEach(function(f) {
  if (!fs.existsSync(f)) { console.error('ERROR: Cannot find ' + f); process.exit(1); }
});

// ════════════════════════════════════════════════════════════════
// SCENARIO DETAIL — Fix Edit link to use URL param
// ════════════════════════════════════════════════════════════════
var sd = fs.readFileSync(SD, 'utf8').replace(/\r\n/g, '\n');

sd = sd.replace(
  '            <Link\n              to="/scenario-creator"\n              state={{ editScenario: scenario }}\n              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"\n            >\n              Edit\n            </Link>',
  '            <Link\n              to={`/scenario-creator/${s.id}`}\n              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"\n            >\n              Edit\n            </Link>'
);
console.log(sd.includes('`/scenario-creator/${s.id}`') ? 'OK SD: Edit link uses URL param' : 'FAILED SD: Edit link');

// Verify SD
if (!sd.includes('`/scenario-creator/${s.id}`')) { console.error('File NOT saved.'); process.exit(1); }
fs.writeFileSync(SD, sd.replace(/\n/g, '\r\n'), 'utf8');
console.log('SAVED: ScenarioDetail.jsx\n');

// ════════════════════════════════════════════════════════════════
// SCENARIO CREATOR — Fix status + remove duplicate load block
// ════════════════════════════════════════════════════════════════
var sc = fs.readFileSync(SC, 'utf8').replace(/\r\n/g, '\n');

// 1. Add status: 'active' to scenarioData
sc = sc.replace(
  "      loanPurpose,\n      updated_at: new Date()",
  "      loanPurpose,\n      status: 'active',\n      updated_at: new Date()"
);
console.log(sc.includes("status: 'active'") ? 'OK SC: Added status: active to scenarioData' : 'FAILED SC: status');

// 2. Remove the duplicate housing/qualifying load block in loadScenario
// The duplicate starts with the second "// Housing expenses" after setFrontDti/setBackDti
var dupLoad = [
  "        setFrontDti(data.frontDti || '');",
  "        setBackDti(data.backDti || '');",
  "        // Housing expenses",
  "        setPropTaxes(data.propTaxes || '');",
  "        setHomeInsurance(data.homeInsurance || '');",
  "        setMortgageInsurance(data.mortgageInsurance || '');",
  "        setMiAutoCalc(data.miAutoCalc !== false);",
  "        setTaxEstimated(data.taxEstimated || false);",
  "        setInsEstimated(data.insEstimated || false);",
  "        setHoaDues(data.hoaDues || '');",
  "        setFloodInsurance(data.floodInsurance || '');",
  "        setSecondMortgage(data.secondMortgage || '');",
  "        // Qualifying",
  "        setCoBorrowerIncome(data.coBorrowerIncome || '');",
  "        setOtherIncome(data.otherIncome || '');",
  "        setDownPayment(data.downPayment || '');",
  "        setSellerConcessions(data.sellerConcessions || '');",
  "        setPostCloseReserves(data.postCloseReserves || '');",
  "        setEstimatedCashToClose(data.estimatedCashToClose || '');",
].join('\n');

var keepEnd = "        setFrontDti(data.frontDti || '');\n        setBackDti(data.backDti || '');";

// Check if the duplicate exists
if (sc.indexOf(dupLoad) !== -1) {
  sc = sc.replace(dupLoad, keepEnd);
  console.log('OK SC: Removed duplicate load block in loadScenario');
} else {
  console.log('OK SC: No duplicate load block found (already clean)');
}

// 3. Also add loanType to loadScenario if missing
if (!sc.includes('setLoanType(data.loanType')) {
  sc = sc.replace(
    "        setLoanPurpose(data.loanPurpose || 'Purchase');",
    "        setLoanPurpose(data.loanPurpose || 'Purchase');\n        setLoanType(data.loanType || '');"
  );
  console.log(sc.includes('setLoanType(data.loanType') ? 'OK SC: Added loanType to loadScenario' : 'FAILED SC: loanType load');
} else {
  console.log('OK SC: loanType already loaded');
}

// 4. Add loanType to scenarioData save if missing
if (!sc.includes('loanType,\n      // Housing')) {
  sc = sc.replace(
    "      // Housing expenses\n      piPayment:",
    "      loanType,\n      // Housing expenses\n      piPayment:"
  );
  console.log(sc.includes("loanType,\n      // Housing") ? 'OK SC: loanType added to Firestore save' : 'FAILED SC: loanType save');
} else {
  console.log('OK SC: loanType already in Firestore save');
}

// Verify SC
var checks = [
  ["status: 'active'",     sc.includes("status: 'active'")],
  ['Edit routing fix',     sd.includes('`/scenario-creator/${s.id}`')],
  ['frontDti state',       sc.includes("const [frontDti")],
  ['setFrontDti useEffect',sc.includes('setFrontDti(housing > 0')],
  ['Firestore save front', sc.includes('frontDti: parseFloat(frontDti)')],
  ['loadScenario present', sc.includes('const loadScenario')],
  ['Housing card JSX',     sc.includes('Monthly Housing Expenses')],
];

var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK SC: ' + c[0]); }
  else { console.error('FAILED SC: ' + c[0]); ok = false; }
});
if (!ok) { console.error('\nFailed. ScenarioCreator NOT saved.'); process.exit(1); }

fs.writeFileSync(SC, sc.replace(/\n/g, '\r\n'), 'utf8');
console.log('SAVED: ScenarioCreator.jsx\n');

console.log('SUCCESS: Both files fixed!');
console.log('\nFixes applied:');
console.log('  1. Edit button now routes to /scenario-creator/:id (loads correctly)');
console.log('  2. Saved scenarios now get status: "active" (no more Draft badge)');
console.log('  3. Duplicate load block removed from loadScenario');
console.log('  4. loanType saves + loads correctly');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R');
console.log('  2. Click Edit on Mary Cox — form loads with her data');
console.log('  3. Re-save — status changes to active, Draft badge gone');
console.log('  4. git add . && git commit -m "fix: edit routing, active status, clean loadScenario"');
