/**
 * fix_scenario_detail.cjs
 * Fixes all field name mismatches in ScenarioDetail.jsx:
 *   - borrower1FirstName/LastName → firstName/lastName
 *   - s.street/s.zip → s.streetAddress/s.zipCode
 *   - s.createdAt → s.created_at || s.updated_at
 *   - s.dti → s.dtiRatio
 *   - Adds frontDti + backDti to metrics bar
 *   - Adds loanType to display
 *   - Adds Housing Expenses section to detail view
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const SD = path.join('src', 'pages', 'ScenarioDetail.jsx');
if (!fs.existsSync(SD)) { console.error('ERROR: Cannot find ' + SD); process.exit(1); }

var src = fs.readFileSync(SD, 'utf8').replace(/\r\n/g, '\n');

// 1. Fix borrower name fields
src = src.replace(
  "  const borrower1 = `${s.borrower1FirstName || ''} ${s.borrower1LastName || ''}`.trim()\n  const borrower2 = `${s.borrower2FirstName || ''} ${s.borrower2LastName || ''}`.trim()",
  "  const borrower1 = [s.firstName || '', s.lastName || ''].join(' ').trim() || s.scenarioName || ''\n  const borrower2 = [s.coBorrowerFirstName || '', s.coBorrowerLastName || ''].join(' ').trim()"
);
console.log(src.includes("s.firstName || ''") ? 'OK: Fixed borrower name fields' : 'FAILED: borrower name');

// 2. Fix address fields
src = src.replace(
  "  const fullAddress = [s.street, s.city, s.state, s.zip].filter(Boolean).join(', ')",
  "  const fullAddress = [s.streetAddress, s.city, s.state, s.zipCode].filter(Boolean).join(', ')"
);
console.log(src.includes('s.streetAddress') ? 'OK: Fixed address fields' : 'FAILED: address fields');

// 3. Fix date fields
src = src.replace(
  "  const createdDate = s.createdAt?.toDate\n    ? s.createdAt.toDate().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })\n    : 'Unknown'\n  const createdTime = s.createdAt?.toDate\n    ? s.createdAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })\n    : ''",
  "  const _ds = s.created_at || s.updated_at\n  const _dateObj = _ds?.toDate ? _ds.toDate() : _ds instanceof Date ? _ds : null\n  const createdDate = _dateObj\n    ? _dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })\n    : 'Not recorded'\n  const createdTime = _dateObj\n    ? _dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })\n    : ''"
);
console.log(src.includes('s.created_at || s.updated_at') ? 'OK: Fixed date fields' : 'FAILED: date fields');

// 4. Fix DTI metric card (s.dti → s.dtiRatio) and add Front/Back DTI
src = src.replace(
  "          <MetricCard\n            label=\"DTI\"\n            value={`${(typeof s.dti === 'number' ? s.dti : 0).toFixed(2)}%`}\n            color={metricColor(s.dti, 43, 50)}\n          />",
  "          <MetricCard\n            label=\"Front DTI\"\n            value={`${(typeof s.frontDti === 'number' ? s.frontDti : 0).toFixed(2)}%`}\n            color={metricColor(s.frontDti, 28, 36)}\n          />\n          <MetricCard\n            label=\"Back DTI\"\n            value={`${(typeof s.backDti === 'number' ? s.backDti : s.dtiRatio || 0).toFixed(2)}%`}\n            color={metricColor(s.backDti || s.dtiRatio, 43, 50)}\n          />"
);
console.log(src.includes('Front DTI') ? 'OK: Added Front/Back DTI metric cards' : 'FAILED: DTI cards');

// 5. Fix grid to accommodate 5 metric cards
src = src.replace(
  '        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">',
  '        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">'
);
console.log(src.includes('lg:grid-cols-5') ? 'OK: Fixed metric grid columns' : 'FAILED: grid');

// 6. Fix DTI in Borrower Financials section (s.dti → s.dtiRatio)
src = src.replace(
  '              <Field label="Debt-to-Income (DTI)">\n                <ColoredValue value={s.dti} suffix="%" thresholds={[43, 50]} />\n              </Field>',
  '              <Field label="Consumer DTI">\n                <ColoredValue value={s.dtiRatio} suffix="%" thresholds={[43, 50]} />\n              </Field>'
);
console.log(src.includes('s.dtiRatio') ? 'OK: Fixed DTI in Borrower Financials' : 'FAILED: DTI financials');

// 7. Add loanType to Loan Purpose section
src = src.replace(
  '          <Section title="Loan Purpose" icon="🎯">\n            <div className="inline-flex items-center gap-2">\n              <span className="bg-blue-100 text-blue-800 font-bold text-sm px-4 py-2 rounded-full">\n                {s.loanPurpose || \'—\'}\n              </span>\n            </div>\n          </Section>',
  '          <Section title="Loan Purpose" icon="🎯">\n            <div className="flex flex-wrap items-center gap-3">\n              {s.loanPurpose && (\n                <span className="bg-blue-100 text-blue-800 font-bold text-sm px-4 py-2 rounded-full capitalize">\n                  {s.loanPurpose.replace(/_/g, \' \').toLowerCase()}\n                </span>\n              )}\n              {s.loanType && (\n                <span className="bg-indigo-100 text-indigo-800 font-bold text-sm px-4 py-2 rounded-full">\n                  {s.loanType}\n                </span>\n              )}\n              {s.interestRate && (\n                <span className="bg-gray-100 text-gray-700 font-semibold text-sm px-4 py-2 rounded-full">\n                  {s.interestRate}% / {s.term ? Math.round(s.term/12) + \' yr\' : \'30 yr\'}\n                </span>\n              )}\n            </div>\n          </Section>'
);
console.log(src.includes('s.loanType') ? 'OK: Added loanType + rate/term to Loan Purpose' : 'FAILED: loanType');

// 8. Add Housing Expenses section before Metadata
var housingSection = [
  "          {/* Housing Expenses */}",
  "          {s.totalHousing > 0 && (",
  "          <Section title=\"Monthly Housing Expenses (PITI)\" icon=\"🏠\">",
  "            <div className=\"grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4 mb-4\">",
  "              <Field label=\"P&I Payment\" value={s.piPayment ? formatCurrency(s.piPayment) : '—'} />",
  "              <Field label=\"Property Taxes\" value={s.propTaxes ? formatCurrency(s.propTaxes) + (s.taxEstimated ? ' (est.)' : '') : '—'} />",
  "              <Field label=\"Homeowners Ins.\" value={s.homeInsurance ? formatCurrency(s.homeInsurance) + (s.insEstimated ? ' (est.)' : '') : '—'} />",
  "              <Field label=\"MIP / PMI\" value={s.mortgageInsurance ? formatCurrency(s.mortgageInsurance) : '$0'} />",
  "              {s.hoaDues > 0 && <Field label=\"HOA Dues\" value={formatCurrency(s.hoaDues)} />}",
  "              {s.floodInsurance > 0 && <Field label=\"Flood Insurance\" value={formatCurrency(s.floodInsurance)} />}",
  "              {s.secondMortgage > 0 && <Field label=\"2nd Mortgage P&I\" value={formatCurrency(s.secondMortgage)} />}",
  "            </div>",
  "            <div className=\"bg-gray-900 rounded-xl px-5 py-3 flex items-center justify-between mt-2\">",
  "              <span className=\"text-sm font-bold text-gray-300\">Total Monthly Housing (PITI)</span>",
  "              <span className=\"text-2xl font-bold text-white\">{formatCurrency(s.totalHousing)}</span>",
  "            </div>",
  "            {s.totalIncome > 0 && (",
  "              <div className=\"grid grid-cols-2 gap-4 mt-4\">",
  "                <div className=\"bg-blue-50 border border-blue-200 rounded-xl p-3 text-center\">",
  "                  <p className=\"text-xs font-bold text-blue-500 mb-1\">FRONT-END DTI</p>",
  "                  <p className={`text-2xl font-bold ${s.frontDti > 36 ? 'text-red-700' : s.frontDti > 28 ? 'text-yellow-700' : 'text-green-700'}`}>",
  "                    {s.frontDti ? s.frontDti.toFixed(1) + '%' : '—'}",
  "                  </p>",
  "                  <p className=\"text-xs text-blue-400 mt-0.5\">PITI ÷ {formatCurrency(s.totalIncome)}/mo</p>",
  "                </div>",
  "                <div className=\"bg-purple-50 border border-purple-200 rounded-xl p-3 text-center\">",
  "                  <p className=\"text-xs font-bold text-purple-500 mb-1\">BACK-END DTI</p>",
  "                  <p className={`text-2xl font-bold ${(s.backDti||s.dtiRatio||0) > 50 ? 'text-red-700' : (s.backDti||s.dtiRatio||0) > 43 ? 'text-yellow-700' : 'text-green-700'}`}>",
  "                    {(s.backDti || s.dtiRatio) ? (s.backDti || s.dtiRatio).toFixed(1) + '%' : '—'}",
  "                  </p>",
  "                  <p className=\"text-xs text-purple-400 mt-0.5\">PITI+Debts ÷ Income</p>",
  "                </div>",
  "              </div>",
  "            )}",
  "          </Section>",
  "          )}",
  "",
].join('\n');

src = src.replace(
  "          {/* Metadata */}\n          <Section title=\"Scenario Metadata\" icon=\"📋\">",
  housingSection + "          {/* Metadata */}\n          <Section title=\"Scenario Metadata\" icon=\"📋\">"
);
console.log(src.includes('Monthly Housing Expenses (PITI)') ? 'OK: Added Housing Expenses section' : 'FAILED: housing section');

// Verify all
var checks = [
  ['borrower firstName',    src.includes("s.firstName || ''")],
  ['streetAddress',         src.includes('s.streetAddress')],
  ['created_at date',       src.includes('s.created_at || s.updated_at')],
  ['Front DTI card',        src.includes('Front DTI')],
  ['Back DTI card',         src.includes('Back DTI')],
  ['s.dtiRatio used',       src.includes('s.dtiRatio')],
  ['loanType badge',        src.includes('s.loanType')],
  ['Housing section',       src.includes('Monthly Housing Expenses (PITI)')],
  ['PITI total bar',        src.includes('Total Monthly Housing')],
];

var ok = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); ok = false; }
});
if (!ok) { console.error('\nFile NOT saved.'); process.exit(1); }

fs.writeFileSync(SD, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: ScenarioDetail.jsx fixed!');
console.log('\nFixes applied:');
console.log('  - Borrower name: firstName + lastName');
console.log('  - Address: streetAddress + zipCode');
console.log('  - Date: created_at (Firestore Timestamp aware)');
console.log('  - Metrics: Front DTI + Back DTI pills');
console.log('  - Loan Purpose: shows loanType + rate/term badges');
console.log('  - New section: Housing Expenses (PITI) with DTI breakdown');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R');
console.log('  2. View Mary Cox scenario — name, date, DTI all correct');
console.log('  3. Re-save scenario to populate Housing section');
console.log('  4. git add . && git commit -m "fix: ScenarioDetail field names + PITI section"');
