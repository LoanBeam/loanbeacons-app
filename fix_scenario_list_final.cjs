/**
 * fix_scenario_list_final.cjs
 * LoanBeacons - Fixes ScenarioList to match ScenarioCreator field names
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const SL = path.join('src', 'pages', 'ScenarioList.jsx');
if (!fs.existsSync(SL)) { console.error('ERROR: Cannot find ' + SL); process.exit(1); }

var sl = fs.readFileSync(SL, 'utf8').replace(/\r\n/g, '\n');

// 1. Fix destructure field names
sl = sl.replace(
  '  const {\n    id,\n    borrower1FirstName,\n    borrower1LastName,\n    city,\n    state,\n    loanAmount,\n    ltv,\n    dti,\n    status,\n    loanPurpose,\n    propertyType,\n    createdAt,\n  } = scenario',
  '  const {\n    id,\n    firstName,\n    lastName,\n    scenarioName,\n    city,\n    state,\n    loanAmount,\n    ltv,\n    frontDti,\n    backDti,\n    dtiRatio,\n    status,\n    loanPurpose,\n    loanType,\n    propertyType,\n    created_at,\n    updated_at,\n  } = scenario'
);
console.log(sl.includes('firstName,') ? 'OK: Fixed field names' : 'FAILED: field names');

// 2. Fix borrower name
sl = sl.replace(
  "  const borrowerName = `${borrower1FirstName || ''} ${borrower1LastName || ''}`.trim() || 'Unnamed'",
  "  const borrowerName = [firstName || '', lastName || ''].join(' ').trim() || scenarioName || 'Unnamed'"
);
console.log(sl.includes("firstName || ''") ? 'OK: Fixed borrower name' : 'FAILED: borrower name');

// 3. Fix date
sl = sl.replace(
  "  const createdDate = createdAt?.toDate\n    ? createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })\n    : 'Unknown'",
  "  const _ds = created_at || updated_at;\n  const createdDate = _ds?.toDate\n    ? _ds.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })\n    : _ds instanceof Date\n    ? _ds.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })\n    : ''"
);
console.log(sl.includes('created_at || updated_at') ? 'OK: Fixed date field' : 'FAILED: date field');

// 4. Add scenarioName subtitle
sl = sl.replace(
  '            <h3 className="text-lg font-bold text-gray-900 truncate">{borrowerName}</h3>\n            <p className="text-sm text-gray-500 truncate">{location}</p>',
  '            <h3 className="text-lg font-bold text-gray-900 truncate">{borrowerName}</h3>\n            {scenarioName && (\n              <p className="text-xs text-blue-600 truncate font-medium mt-0.5">{scenarioName}</p>\n            )}\n            <p className="text-sm text-gray-500 truncate">{location}</p>'
);
console.log(sl.includes('{scenarioName && (') ? 'OK: Added scenarioName subtitle' : 'FAILED: scenarioName');

// 5. Replace single DTI pill with Front + Back
sl = sl.replace(
  '          <MetricPill label="DTI" value={dti} thresholds={[43, 50]} />',
  '          <MetricPill label="Front DTI" value={frontDti || 0} thresholds={[28, 36]} />\n          <MetricPill label="Back DTI"  value={backDti || dtiRatio || 0} thresholds={[43, 50]} />'
);
console.log(sl.includes('Front DTI') ? 'OK: Added Front/Back DTI pills' : 'FAILED: DTI pills');

// 6. Add loanType badge in details row
sl = sl.replace(
  '        {/* Details Row */}\n        <div className="flex items-center gap-2 flex-wrap text-xs">\n          {loanPurpose && (\n            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">{loanPurpose}</span>\n          )}\n          {propertyType && (\n            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">{propertyType}</span>\n          )}\n        </div>',
  '        {/* Details Row */}\n        <div className="flex items-center gap-2 flex-wrap text-xs">\n          {loanPurpose && (\n            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium capitalize">{loanPurpose.replace(/_/g, " ").toLowerCase()}</span>\n          )}\n          {loanType && (\n            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-bold">{loanType}</span>\n          )}\n          {propertyType && (\n            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">{propertyType}</span>\n          )}\n        </div>'
);
console.log(sl.includes('{loanType && (') ? 'OK: Added loanType badge' : 'FAILED: loanType badge');

// Verify all
var checks = [
  ['firstName field',   sl.includes('firstName,')],
  ['borrower name',     sl.includes("firstName || ''")],
  ['date field',        sl.includes('created_at || updated_at')],
  ['scenarioName',      sl.includes('{scenarioName && (')],
  ['Front DTI pill',    sl.includes('Front DTI')],
  ['Back DTI pill',     sl.includes('Back DTI')],
  ['loanType badge',    sl.includes('{loanType && (')],
];
var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); ok = false; }
});
if (!ok) { console.error('\nFailed. File NOT saved.'); process.exit(1); }

fs.writeFileSync(SL, sl.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: ScenarioList.jsx fixed!');
console.log('Cards now show: borrower name, scenario name, Front DTI, Back DTI, loan type badge');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R in browser');
console.log('  2. Go to My Scenarios - Mary Cox should appear');
console.log('  3. git add . && git commit -m "fix: ScenarioList field alignment + DTI pills"');
