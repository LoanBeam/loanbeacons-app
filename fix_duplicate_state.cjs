/**
 * fix_duplicate_state.cjs
 * Removes the second duplicate state block from ScenarioCreator.jsx
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const SC = path.join('src', 'pages', 'ScenarioCreator.jsx');
if (!fs.existsSync(SC)) { console.error('ERROR: Cannot find ' + SC); process.exit(1); }

var src = fs.readFileSync(SC, 'utf8').replace(/\r\n/g, '\n');

// The duplicate block is the SECOND occurrence of "// Housing Expenses (PITI components)"
// through the second "estimatedCashToClose" line, ending just before "const [loading"
var dupBlock = [
  "\n  // Housing Expenses (PITI components)",
  "  const [piPayment, setPiPayment] = useState('');          // auto-calculated",
  "  const [propTaxes, setPropTaxes] = useState('');          // monthly",
  "  const [homeInsurance, setHomeInsurance] = useState('');  // monthly",
  "  const [mortgageInsurance, setMortgageInsurance] = useState(''); // MIP/PMI monthly",
  "  const [miAutoCalc, setMiAutoCalc] = useState(true);     // auto vs manual MI",
  "  const [taxEstimated, setTaxEstimated] = useState(false);  // true = came from state avg",
  "  const [insEstimated, setInsEstimated] = useState(false);  // true = came from state avg",
  "  const [hoaDues, setHoaDues] = useState('');              // monthly",
  "  const [floodInsurance, setFloodInsurance] = useState(''); // monthly",
  "  const [secondMortgage, setSecondMortgage] = useState(''); // monthly P&I",
  "  const [totalHousing, setTotalHousing] = useState('');    // auto-calculated",
  "",
  "  // Qualifying Information",
  "  const [coBorrowerIncome, setCoBorrowerIncome] = useState('');",
  "  const [otherIncome, setOtherIncome] = useState('');      // rental, part-time, etc",
  "  const [totalIncome, setTotalIncome] = useState('');      // auto-calculated",
  "  const [downPayment, setDownPayment] = useState('');",
  "  const [sellerConcessions, setSellerConcessions] = useState('');",
  "  const [postCloseReserves, setPostCloseReserves] = useState(''); // months of PITI",
  "  const [estimatedCashToClose, setEstimatedCashToClose] = useState('');",
].join('\n');

// Find first occurrence position (the one we want to KEEP)
var first = src.indexOf(dupBlock);
if (first === -1) {
  console.error('FAILED: Could not find duplicate block. Has the format changed?');
  process.exit(1);
}

// Find second occurrence (the one we want to REMOVE)
var second = src.indexOf(dupBlock, first + 1);
if (second === -1) {
  console.log('OK: No duplicate found — file is already clean. Nothing to do.');
  process.exit(0);
}

// Remove the second occurrence
src = src.slice(0, second) + src.slice(second + dupBlock.length);

// Verify no third copy
if (src.indexOf(dupBlock, first + 1) !== -1) {
  console.error('FAILED: Still more than one copy after removal');
  process.exit(1);
}
console.log('OK: Removed duplicate state declarations (lines ~148-168)');

// Verify key things intact
var checks = [
  ['piPayment state (once)',     src.indexOf("const [piPayment") === src.lastIndexOf("const [piPayment")],
  ['propTaxes state (once)',     src.indexOf("const [propTaxes") === src.lastIndexOf("const [propTaxes")],
  ['coBorrowerIncome (once)',    src.indexOf("const [coBorrowerIncome") === src.lastIndexOf("const [coBorrowerIncome")],
  ['loading state present',      src.includes("const [loading, setLoading]")],
  ['MISMO state present',        src.includes("const [importedData")],
  ['STATE_TAX_RATES present',    src.includes("STATE_TAX_RATES")],
  ['Housing card JSX present',   src.includes("Monthly Housing Expenses")],
  ['Qualifying card JSX present',src.includes("Qualifying Information")],
];

var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); ok = false; }
});
if (!ok) { console.error('\nFile NOT saved.'); process.exit(1); }

fs.writeFileSync(SC, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: Duplicate state removed. ScenarioCreator.jsx saved.');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R — red error should be gone');
console.log('  2. Open Scenario Creator — Housing Expenses and Qualifying sections visible');
console.log('  3. git add . && git commit -m "fix: remove duplicate state declarations"');
