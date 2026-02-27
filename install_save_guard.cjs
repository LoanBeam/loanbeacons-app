/**
 * install_save_guard.cjs
 * LoanBeacons - Adds unsaved changes warning + sticky save bar
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */

const fs = require('fs');
const path = require('path');

const SCENARIO_CREATOR = path.join('src', 'pages', 'ScenarioCreator.jsx');

if (!fs.existsSync(SCENARIO_CREATOR)) {
  console.error('ERROR: Cannot find src/pages/ScenarioCreator.jsx');
  process.exit(1);
}

// Read file and normalise to LF so all replacements work regardless of OS
var src = fs.readFileSync(SCENARIO_CREATOR, 'utf8').replace(/\r\n/g, '\n');

// ── FIX 1: Add isDirty state + markDirty after mismoFileRef ──────────────────
src = src.replace(
  '  const mismoFileRef = useRef(null);\n  const { craSnapshot: craData',
  '  const mismoFileRef = useRef(null);\n  const [isDirty, setIsDirty] = useState(false);\n  const markDirty = () => setIsDirty(true);\n  const { craSnapshot: craData'
);
console.log(src.includes('const [isDirty') ? 'OK: Added isDirty + markDirty' : 'FAILED: isDirty state');

// ── FIX 2: Add beforeunload useEffect after the [id] useEffect ───────────────
src = src.replace(
  '  }, [id]);\n\n  const handleAddressSelect',
  '  }, [id]);\n\n  useEffect(() => {\n    const handleBeforeUnload = (e) => {\n      if (isDirty) { e.preventDefault(); e.returnValue = \'\'; }\n    };\n    window.addEventListener(\'beforeunload\', handleBeforeUnload);\n    return () => window.removeEventListener(\'beforeunload\', handleBeforeUnload);\n  }, [isDirty]);\n\n  const handleAddressSelect'
);
console.log(src.includes('handleBeforeUnload') ? 'OK: Added beforeunload warning' : 'FAILED: beforeunload');

// ── FIX 3: Mark dirty when MISMO import completes ────────────────────────────
src = src.replace(
  '        setImportedData(parsed);\n        setImportFileName(file.name);\n        setImportSummary(getImportSummary(parsed));',
  '        setImportedData(parsed);\n        setImportFileName(file.name);\n        setImportSummary(getImportSummary(parsed));\n        setIsDirty(true);'
);
console.log(src.includes('setIsDirty(true)') ? 'OK: Import marks form dirty' : 'FAILED: import dirty');

// ── FIX 4: Clear dirty on successful save ────────────────────────────────────
src = src.replace(
  "        await updateDoc(docRef, scenarioData);\n        alert('Scenario updated successfully!');",
  "        await updateDoc(docRef, scenarioData);\n        setIsDirty(false);\n        alert('Scenario updated successfully!');"
);
src = src.replace(
  "        await addDoc(collection(db, 'scenarios'), scenarioData);\n        alert('Scenario created successfully!');",
  "        await addDoc(collection(db, 'scenarios'), scenarioData);\n        setIsDirty(false);\n        alert('Scenario created successfully!');"
);
console.log(src.includes('setIsDirty(false)') ? 'OK: Save clears dirty flag' : 'FAILED: save clears dirty');

// ── FIX 5: Back to Dashboard warns if dirty ──────────────────────────────────
src = src.replace(
  "            onClick={() => navigate('/')}\n            className=\"text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2\"",
  "            onClick={() => { if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return; navigate('/'); }}\n            className=\"text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2\""
);
console.log(src.includes("navigate('/')") ? 'OK: Back to Dashboard warns if dirty' : 'FAILED: back warn');

// ── FIX 6: Add markDirty to all key inputs ───────────────────────────────────
var replacements = [
  ["onChange={(e) => setScenarioName(e.target.value)}",  "onChange={(e) => { setScenarioName(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setFirstName(e.target.value)}",     "onChange={(e) => { setFirstName(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setLastName(e.target.value)}",      "onChange={(e) => { setLastName(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setLoanAmount(e.target.value)}",    "onChange={(e) => { setLoanAmount(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setPropertyValue(e.target.value)}", "onChange={(e) => { setPropertyValue(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setInterestRate(e.target.value)}",  "onChange={(e) => { setInterestRate(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setTerm(e.target.value)}",          "onChange={(e) => { setTerm(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setCreditScore(e.target.value)}",   "onChange={(e) => { setCreditScore(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setMonthlyIncome(e.target.value)}", "onChange={(e) => { setMonthlyIncome(e.target.value); markDirty(); }}"],
  ["onChange={(e) => setMonthlyDebts(e.target.value)}",  "onChange={(e) => { setMonthlyDebts(e.target.value); markDirty(); }}"],
];
replacements.forEach(function(r) { src = src.replace(r[0], r[1]); });
console.log(src.includes('markDirty()') ? 'OK: All inputs call markDirty' : 'FAILED: markDirty on inputs');

// ── FIX 7: Replace bottom buttons with sticky bar + static buttons ────────────
var oldButtons = [
  '          <div className="flex gap-4">',
  '            <button',
  '              type="submit"',
  '              disabled={loading}',
  '              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400"',
  '            >',
  "              {loading ? 'Saving...' : isEditMode ? 'Update Scenario' : 'Create Scenario'}",
  '            </button>',
  '            <button',
  '              type="button"',
  "              onClick={() => navigate('/scenarios')}",
  '              className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-300 font-semibold"',
  '            >',
  '              Cancel',
  '            </button>',
  '          </div>',
].join('\n');

var newButtons = [
  '          {/* Sticky Save Bar */}',
  '          <div',
  "            style={{ transform: isDirty ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 0.3s ease' }}",
  '            className="fixed bottom-0 left-0 right-0 z-50"',
  '          >',
  '            <div className="bg-white border-t-2 border-blue-500 shadow-2xl">',
  '              <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">',
  '                <div className="flex items-center gap-3">',
  '                  <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />',
  '                  <div>',
  '                    <p className="text-sm font-bold text-gray-800">Unsaved changes</p>',
  '                    <p className="text-xs text-gray-500">Click Save to keep your work</p>',
  '                  </div>',
  '                </div>',
  '                <div className="flex items-center gap-3">',
  '                  <button',
  '                    type="button"',
  "                    onClick={() => { if (window.confirm('Discard all changes?')) { setIsDirty(false); navigate('/scenarios'); } }}",
  '                    className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200"',
  '                  >',
  '                    Discard',
  '                  </button>',
  '                  <button',
  '                    type="submit"',
  '                    disabled={loading}',
  '                    className="px-8 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:bg-gray-400"',
  '                  >',
  "                    {loading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Scenario'}",
  '                  </button>',
  '                </div>',
  '              </div>',
  '            </div>',
  '          </div>',
  '          {/* END Sticky Save Bar */}',
  '',
  '          {/* Static bottom buttons */}',
  '          <div className="flex gap-4 pb-24">',
  '            <button',
  '              type="submit"',
  '              disabled={loading}',
  '              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400"',
  '            >',
  "              {loading ? 'Saving...' : isEditMode ? 'Update Scenario' : 'Create Scenario'}",
  '            </button>',
  '            <button',
  '              type="button"',
  "              onClick={() => { if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return; navigate('/scenarios'); }}",
  '              className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-300 font-semibold"',
  '            >',
  '              Cancel',
  '            </button>',
  '          </div>',
].join('\n');

src = src.replace(oldButtons, newButtons);
console.log(src.includes('Unsaved changes') ? 'OK: Sticky save bar added' : 'FAILED: sticky save bar');

// ── Final verification ────────────────────────────────────────────────────────
var checks = [
  ['isDirty state',     src.includes('const [isDirty, setIsDirty]')],
  ['markDirty helper',  src.includes('const markDirty')],
  ['beforeunload',      src.includes('handleBeforeUnload')],
  ['import sets dirty', src.includes('setIsDirty(true)')],
  ['save clears dirty', src.includes('setIsDirty(false)')],
  ['sticky save bar',   src.includes('Unsaved changes')],
  ['discard confirm',   src.includes('Discard all changes')],
  ['inputs markDirty',  src.includes('markDirty()')],
];

var allPassed = true;
checks.forEach(function(check) {
  if (check[1]) { console.log('OK: ' + check[0]); }
  else { console.error('FAILED: ' + check[0]); allPassed = false; }
});

if (!allPassed) {
  console.error('\nSome checks failed. ScenarioCreator.jsx was NOT saved.');
  process.exit(1);
}

// Write back with original Windows line endings
fs.writeFileSync(SCENARIO_CREATOR, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: Save guard installed!');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R in browser to hard refresh');
console.log('  2. Type anything in a form field');
console.log('  3. Sticky bar slides up from the bottom');
console.log('  4. git add . && git commit -m "feat: unsaved changes save guard"');
