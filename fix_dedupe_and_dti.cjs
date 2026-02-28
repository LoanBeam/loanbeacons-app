/**
 * fix_dedupe_and_dti.cjs
 * 1. Strips ScenarioCreator.jsx back to a single clean copy (was run 4x)
 * 2. Adds frontDti + backDti state variables
 * 3. Calculates + sets them in the PITI useEffect
 * 4. Saves them to Firestore
 * 5. Loads them from Firestore
 *
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const SC = path.join('src', 'pages', 'ScenarioCreator.jsx');
if (!fs.existsSync(SC)) { console.error('ERROR: Cannot find ' + SC); process.exit(1); }

var src = fs.readFileSync(SC, 'utf8').replace(/\r\n/g, '\n');

// ── STEP 1: Extract only the FIRST complete copy ──────────────────────────────
// First copy ends at "export default ScenarioCreator;" followed by "import {"
var cutMarker = '\nexport default ScenarioCreator;';
var firstEnd = src.indexOf(cutMarker);
if (firstEnd === -1) {
  console.error('FAILED: Cannot find export default ScenarioCreator');
  process.exit(1);
}
var clean = src.slice(0, firstEnd + cutMarker.length).trimEnd() + '\n';
var copyCount = (src.match(/export default ScenarioCreator/g) || []).length;
console.log('Found ' + copyCount + ' copies — keeping only the first (' + clean.split('\n').length + ' lines)');

// ── STEP 2: Add frontDti + backDti state after totalHousing ──────────────────
clean = clean.replace(
  "  const [totalHousing, setTotalHousing] = useState('');    // auto-calculated",
  "  const [totalHousing, setTotalHousing] = useState('');    // auto-calculated\n  const [frontDti, setFrontDti] = useState('');\n  const [backDti, setBackDti] = useState('');"
);
console.log(clean.includes("const [frontDti") ? 'OK: Added frontDti/backDti state' : 'FAILED: state');

// ── STEP 3: Add setFrontDti/setBackDti calls in useEffect ────────────────────
// Replace the comment placeholder with actual calculations
clean = clean.replace(
  "    if (total <= 0) return;\n    setDtiRatio(((debts / total) * 100).toFixed(2));\n    setPiPayment(pi > 0 ? pi.toFixed(2) : '');\n    // front = full housing / income, back = housing + debts / income\n  }, [monthlyDebts, monthlyIncome, coBorrowerIncome, otherIncome,",
  "    if (total <= 0) return;\n    setDtiRatio(((debts / total) * 100).toFixed(2));\n    setPiPayment(pi > 0 ? pi.toFixed(2) : '');\n    setFrontDti(housing > 0 ? ((housing / total) * 100).toFixed(2) : '');\n    setBackDti(housing > 0 ? (((housing + debts) / total) * 100).toFixed(2) : '');\n  }, [monthlyDebts, monthlyIncome, coBorrowerIncome, otherIncome,"
);
console.log(clean.includes('setFrontDti(housing > 0') ? 'OK: Added setFrontDti/setBackDti to useEffect' : 'FAILED: useEffect');

// ── STEP 4: Save frontDti + backDti to Firestore ─────────────────────────────
clean = clean.replace(
  "      totalHousing: parseFloat(totalHousing) || 0,",
  "      totalHousing: parseFloat(totalHousing) || 0,\n      frontDti: parseFloat(frontDti) || 0,\n      backDti: parseFloat(backDti) || 0,"
);
console.log(clean.includes('frontDti: parseFloat(frontDti)') ? 'OK: Saving frontDti/backDti to Firestore' : 'FAILED: Firestore save');

// ── STEP 5: Load frontDti + backDti from Firestore ───────────────────────────
clean = clean.replace(
  "        setEstimatedCashToClose(data.estimatedCashToClose || '');",
  "        setEstimatedCashToClose(data.estimatedCashToClose || '');\n        setFrontDti(data.frontDti || '');\n        setBackDti(data.backDti || '');"
);
console.log(clean.includes('setFrontDti(data.frontDti') ? 'OK: Loading frontDti/backDti from Firestore' : 'FAILED: Firestore load');

// ── VERIFY ────────────────────────────────────────────────────────────────────
var checks = [
  ['Single copy',              (clean.match(/export default ScenarioCreator/g)||[]).length === 1],
  ['frontDti state',           clean.includes("const [frontDti")],
  ['backDti state',            clean.includes("const [backDti")],
  ['setFrontDti in useEffect', clean.includes('setFrontDti(housing > 0')],
  ['setBackDti in useEffect',  clean.includes('setBackDti(housing > 0')],
  ['Firestore save',           clean.includes('frontDti: parseFloat(frontDti)')],
  ['Firestore load',           clean.includes('setFrontDti(data.frontDti')],
  ['totalHousing present',     clean.includes('totalHousing')],
  ['Housing card JSX',         clean.includes('Monthly Housing Expenses')],
  ['STATE_TAX_RATES',          clean.includes('STATE_TAX_RATES')],
  ['LoanTypeSection',          clean.includes('<LoanTypeSection')],
  ['Save buttons',             clean.includes('pb-24')],
];

var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); ok = false; }
});
if (!ok) { console.error('\nFile NOT saved.'); process.exit(1); }

fs.writeFileSync(SC, clean.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: ScenarioCreator.jsx cleaned and fixed!');
console.log('File reduced from ' + src.split('\n').length + ' lines to ' + clean.split('\n').length + ' lines');
console.log('\nFrontDTI = full PITI ÷ total income');
console.log('BackDTI  = (PITI + consumer debts) ÷ total income');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R');
console.log('  2. Edit Mary Cox → fill income + housing fields → Save');
console.log('  3. My Scenarios card will show correct Front + Back DTI');
console.log('  4. git add . && git commit -m "fix: dedupe ScenarioCreator + wire frontDti/backDti"');
