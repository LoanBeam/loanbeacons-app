/**
 * install_housing_expenses.cjs
 * LoanBeacons - Full PITI Housing Expenses card + Qualifying fields
 *
 * Adds:
 *   - Housing Expenses card: P&I (auto), taxes, insurance, MIP/PMI (auto-calc),
 *     HOA, flood insurance, 2nd mortgage
 *   - Qualifying Info card: co-borrower income, other income, down payment,
 *     seller concessions, post-close reserves, rental income
 *   - Front DTI = full PITI / total income
 *   - Back DTI  = full PITI + consumer debts / total income
 *   - MIP auto-calc: FHA 0.55%, VA $0, USDA 0.35%, Conv estimated PMI
 *   - All MISMO-imported housing fields populated automatically
 *   - All fields saved/loaded from Firestore
 *
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */

const fs = require('fs');
const path = require('path');
const SC = path.join('src', 'pages', 'ScenarioCreator.jsx');
if (!fs.existsSync(SC)) { console.error('ERROR: Cannot find ' + SC); process.exit(1); }

var src = fs.readFileSync(SC, 'utf8').replace(/\r\n/g, '\n');

// ══════════════════════════════════════════════════════════════
// 1. ADD STATE VARIABLES
// ══════════════════════════════════════════════════════════════
src = src.replace(
  "  const [conventionalInvestor, setConventionalInvestor] = useState('');",
  [
    "  const [conventionalInvestor, setConventionalInvestor] = useState('');",
    "",
    "  // Housing Expenses (PITI components)",
    "  const [piPayment, setPiPayment] = useState('');          // auto-calculated",
    "  const [propTaxes, setPropTaxes] = useState('');          // monthly",
    "  const [homeInsurance, setHomeInsurance] = useState('');  // monthly",
    "  const [mortgageInsurance, setMortgageInsurance] = useState(''); // MIP/PMI monthly",
    "  const [miAutoCalc, setMiAutoCalc] = useState(true);     // auto vs manual MI",
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
  ].join('\n')
);
console.log(src.includes('const [piPayment') ? 'OK: Added housing + qualifying state' : 'FAILED: state');

// ══════════════════════════════════════════════════════════════
// 2. POPULATE FROM MISMO IMPORT
// ══════════════════════════════════════════════════════════════
src = src.replace(
  "        if (parsed.zipCode)       setZipCode(parsed.zipCode);",
  [
    "        if (parsed.zipCode)       setZipCode(parsed.zipCode);",
    "        // Housing expenses from MISMO",
    "        if (parsed.proposedTaxes)     setPropTaxes(Math.round(parseFloat(parsed.proposedTaxes)).toString());",
    "        if (parsed.proposedInsurance) setHomeInsurance(Math.round(parseFloat(parsed.proposedInsurance)).toString());",
    "        if (parsed.proposedMIP)       { setMortgageInsurance(Math.round(parseFloat(parsed.proposedMIP)).toString()); setMiAutoCalc(false); }",
    "        // Qualifying info from MISMO",
    "        if (parsed.cashToClose)       setEstimatedCashToClose(parsed.cashToClose);",
  ].join('\n')
);
console.log(src.includes('setPropTaxes(') ? 'OK: MISMO populates housing fields' : 'FAILED: MISMO housing');

// ══════════════════════════════════════════════════════════════
// 3. LOAD FROM FIRESTORE
// ══════════════════════════════════════════════════════════════
src = src.replace(
  "        setCensusTract(data.censusTract || null);",
  [
    "        setCensusTract(data.censusTract || null);",
    "        // Housing expenses",
    "        setPropTaxes(data.propTaxes || '');",
    "        setHomeInsurance(data.homeInsurance || '');",
    "        setMortgageInsurance(data.mortgageInsurance || '');",
    "        setMiAutoCalc(data.miAutoCalc !== false);",
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
  ].join('\n')
);
console.log(src.includes('setPropTaxes(data.propTaxes') ? 'OK: Firestore load housing fields' : 'FAILED: load');

// ══════════════════════════════════════════════════════════════
// 4. REPLACE DTI useEffect WITH FULL PITI CALCULATION
// ══════════════════════════════════════════════════════════════
src = src.replace(
  "  useEffect(() => {\n    if (monthlyDebts && monthlyIncome) {\n      const calculatedDti = ((parseFloat(monthlyDebts) / parseFloat(monthlyIncome)) * 100).toFixed(2);\n      setDtiRatio(calculatedDti);\n    }\n  }, [monthlyDebts, monthlyIncome]);",
  [
    "  // Full PITI + DTI recalculation",
    "  useEffect(() => {",
    "    const borIncome = parseFloat(monthlyIncome) || 0;",
    "    const coIncome  = parseFloat(coBorrowerIncome) || 0;",
    "    const othIncome = parseFloat(otherIncome) || 0;",
    "    const total     = borIncome + coIncome + othIncome;",
    "    if (total > 0) setTotalIncome(total.toFixed(2));",
    "",
    "    const debts  = parseFloat(monthlyDebts) || 0;",
    "    const amt    = parseFloat(loanAmount) || 0;",
    "    const rate   = parseFloat(interestRate) || 0;",
    "    const months = parseInt(term) || 360;",
    "",
    "    // Calculate P&I",
    "    let pi = 0;",
    "    if (amt > 0 && rate > 0) {",
    "      const mr = rate / 100 / 12;",
    "      pi = amt * (mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1);",
    "    }",
    "    setPiPayment(pi > 0 ? pi.toFixed(2) : '');",
    "",
    "    // Auto-calculate MI if enabled",
    "    let mi = parseFloat(mortgageInsurance) || 0;",
    "    if (miAutoCalc && amt > 0) {",
    "      if (loanType === 'FHA')  mi = (amt * 0.0055) / 12;",
    "      else if (loanType === 'USDA') mi = (amt * 0.0035) / 12;",
    "      else if (loanType === 'VA')   mi = 0;",
    "      else if (loanType === 'CONVENTIONAL') {",
    "        const ltvNum = parseFloat(ltv) || 0;",
    "        mi = ltvNum > 80 ? (amt * 0.007) / 12 : 0; // rough PMI estimate",
    "      }",
    "      if (miAutoCalc) setMortgageInsurance(mi > 0 ? mi.toFixed(2) : '');",
    "    }",
    "",
    "    // Sum all housing components",
    "    const taxes   = parseFloat(propTaxes) || 0;",
    "    const ins     = parseFloat(homeInsurance) || 0;",
    "    const hoa     = parseFloat(hoaDues) || 0;",
    "    const flood   = parseFloat(floodInsurance) || 0;",
    "    const second  = parseFloat(secondMortgage) || 0;",
    "    const housing = pi + taxes + ins + mi + hoa + flood + second;",
    "    setTotalHousing(housing > 0 ? housing.toFixed(2) : '');",
    "",
    "    if (total <= 0) return;",
    "    setDtiRatio(((debts / total) * 100).toFixed(2));",
    "    setPiPayment(pi > 0 ? pi.toFixed(2) : '');",
    "    // front = full housing / income, back = housing + debts / income",
    "  }, [monthlyDebts, monthlyIncome, coBorrowerIncome, otherIncome,",
    "      loanAmount, interestRate, term, loanType, ltv,",
    "      propTaxes, homeInsurance, mortgageInsurance, miAutoCalc,",
    "      hoaDues, floodInsurance, secondMortgage]);",
  ].join('\n')
);
console.log(src.includes('setPiPayment(pi > 0') ? 'OK: Replaced DTI useEffect with full PITI calc' : 'FAILED: DTI useEffect');

// ══════════════════════════════════════════════════════════════
// 5. SAVE ALL NEW FIELDS TO FIRESTORE
// ══════════════════════════════════════════════════════════════
src = src.replace(
  "      dtiRatio: parseFloat(dtiRatio),\n      loanPurpose,",
  [
    "      dtiRatio: parseFloat(dtiRatio),",
    "      loanType,",
    "      // Housing expenses",
    "      piPayment: parseFloat(piPayment) || 0,",
    "      propTaxes: parseFloat(propTaxes) || 0,",
    "      homeInsurance: parseFloat(homeInsurance) || 0,",
    "      mortgageInsurance: parseFloat(mortgageInsurance) || 0,",
    "      miAutoCalc,",
    "      hoaDues: parseFloat(hoaDues) || 0,",
    "      floodInsurance: parseFloat(floodInsurance) || 0,",
    "      secondMortgage: parseFloat(secondMortgage) || 0,",
    "      totalHousing: parseFloat(totalHousing) || 0,",
    "      // Qualifying",
    "      coBorrowerIncome: parseFloat(coBorrowerIncome) || 0,",
    "      otherIncome: parseFloat(otherIncome) || 0,",
    "      totalIncome: parseFloat(totalIncome) || 0,",
    "      downPayment: parseFloat(downPayment) || 0,",
    "      sellerConcessions: parseFloat(sellerConcessions) || 0,",
    "      postCloseReserves: parseFloat(postCloseReserves) || 0,",
    "      estimatedCashToClose: parseFloat(estimatedCashToClose) || 0,",
    "      loanPurpose,",
  ].join('\n')
);
console.log(src.includes('piPayment: parseFloat(piPayment)') ? 'OK: Firestore save includes all new fields' : 'FAILED: Firestore save');

// ══════════════════════════════════════════════════════════════
// 6. INSERT HOUSING EXPENSES CARD (before Borrower Financials)
// ══════════════════════════════════════════════════════════════
var housingCard = [
  "          <div className=\"bg-white rounded-lg shadow p-6\">",
  "            <h2 className=\"text-xl font-bold text-gray-900 mb-1 flex items-center gap-2\">",
  "              <span>🏠</span>",
  "              Monthly Housing Expenses (PITI)",
  "            </h2>",
  "            <p className=\"text-xs text-gray-400 mb-5\">",
  "              Used for front-end DTI. Auto-populated from MISMO import where available.",
  "              {loanType==='FHA'&&<span className=\"ml-2 text-blue-600 font-semibold\">FHA MIP auto-calculated (0.55% annual)</span>}",
  "              {loanType==='USDA'&&<span className=\"ml-2 text-green-600 font-semibold\">USDA annual fee auto-calculated (0.35%)</span>}",
  "              {loanType==='VA'&&<span className=\"ml-2 text-red-600 font-semibold\">VA — no monthly MI</span>}",
  "            </p>",
  "",
  "            {/* P&I — auto-calculated, read-only */}",
  "            <div className=\"grid grid-cols-2 gap-4 mb-4\">",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1\">",
  "                  Principal &amp; Interest <span className=\"text-blue-500\">(auto)</span>",
  "                </label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"text\" value={piPayment ? parseFloat(piPayment).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''} readOnly",
  "                    placeholder=\"Fill in Loan Details above\"",
  "                    className=\"w-full pl-7 pr-4 py-2 border border-gray-200 rounded-lg bg-blue-50 text-blue-700 font-semibold text-sm\" />",
  "                </div>",
  "              </div>",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1\">",
  "                  Property Taxes <span className=\"text-gray-400 font-normal\">(monthly)</span>",
  "                </label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"number\" value={propTaxes} onChange={e=>{setPropTaxes(e.target.value);markDirty();}}",
  "                    placeholder=\"e.g. 350\"",
  "                    className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                </div>",
  "              </div>",
  "            </div>",
  "",
  "            <div className=\"grid grid-cols-2 gap-4 mb-4\">",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1\">",
  "                  Homeowners Insurance <span className=\"text-gray-400 font-normal\">(monthly)</span>",
  "                </label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"number\" value={homeInsurance} onChange={e=>{setHomeInsurance(e.target.value);markDirty();}}",
  "                    placeholder=\"e.g. 120\"",
  "                    className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                </div>",
  "              </div>",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1 flex items-center justify-between\">",
  "                  <span>",
  "                    {loanType==='FHA'?'FHA MIP':loanType==='USDA'?'USDA Annual Fee':loanType==='VA'?'VA MI (none)':'PMI / Mortgage Insurance'}",
  "                    {' '}<span className=\"text-gray-400 font-normal\">(monthly)</span>",
  "                  </span>",
  "                  <label className=\"flex items-center gap-1 cursor-pointer\">",
  "                    <input type=\"checkbox\" checked={miAutoCalc} onChange={e=>setMiAutoCalc(e.target.checked)}",
  "                      className=\"w-3 h-3 rounded\" />",
  "                    <span className=\"text-xs text-blue-500\">Auto</span>",
  "                  </label>",
  "                </label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"number\" value={mortgageInsurance}",
  "                    onChange={e=>{setMortgageInsurance(e.target.value);setMiAutoCalc(false);markDirty();}}",
  "                    readOnly={miAutoCalc && loanType==='VA'}",
  "                    placeholder={miAutoCalc ? 'Auto-calculated' : 'e.g. 150'}",
  "                    className={'w-full pl-7 pr-4 py-2 border rounded-lg text-sm ' + (miAutoCalc ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-gray-300')} />",
  "                </div>",
  "              </div>",
  "            </div>",
  "",
  "            <div className=\"grid grid-cols-3 gap-4 mb-4\">",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1\">HOA Dues <span className=\"text-gray-400 font-normal\">(monthly)</span></label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"number\" value={hoaDues} onChange={e=>{setHoaDues(e.target.value);markDirty();}}",
  "                    placeholder=\"0\"",
  "                    className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                </div>",
  "              </div>",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Flood Insurance <span className=\"text-gray-400 font-normal\">(monthly)</span></label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"number\" value={floodInsurance} onChange={e=>{setFloodInsurance(e.target.value);markDirty();}}",
  "                    placeholder=\"0\"",
  "                    className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                </div>",
  "              </div>",
  "              <div>",
  "                <label className=\"block text-xs font-semibold text-gray-500 mb-1\">2nd Mortgage P&amp;I <span className=\"text-gray-400 font-normal\">(monthly)</span></label>",
  "                <div className=\"relative\">",
  "                  <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                  <input type=\"number\" value={secondMortgage} onChange={e=>{setSecondMortgage(e.target.value);markDirty();}}",
  "                    placeholder=\"0\"",
  "                    className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                </div>",
  "              </div>",
  "            </div>",
  "",
  "            {/* Total Housing Payment */}",
  "            {totalHousing && (",
  "              <div className=\"mt-4 bg-gray-900 rounded-xl px-5 py-3 flex items-center justify-between\">",
  "                <span className=\"text-sm font-bold text-gray-300\">Total Monthly Housing (PITI)</span>",
  "                <span className=\"text-2xl font-bold text-white\">${parseFloat(totalHousing).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>",
  "              </div>",
  "            )}",
  "          </div>",
  "",
  "          {/* Qualifying Information */}",
  "          <div className=\"bg-white rounded-lg shadow p-6\">",
  "            <h2 className=\"text-xl font-bold text-gray-900 mb-5 flex items-center gap-2\">",
  "              <span>💰</span>",
  "              Qualifying Information",
  "            </h2>",
  "",
  "            {/* Income */}",
  "            <div className=\"mb-5\">",
  "              <h3 className=\"text-sm font-bold text-gray-600 uppercase tracking-wide mb-3\">Income</h3>",
  "              <div className=\"grid grid-cols-3 gap-4\">",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Borrower Monthly Income</label>",
  "                  <div className=\"relative\">",
  "                    <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                    <input type=\"number\" value={monthlyIncome} onChange={e=>{setMonthlyIncome(e.target.value);markDirty();}}",
  "                      className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  </div>",
  "                </div>",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Co-Borrower Monthly Income</label>",
  "                  <div className=\"relative\">",
  "                    <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                    <input type=\"number\" value={coBorrowerIncome} onChange={e=>{setCoBorrowerIncome(e.target.value);markDirty();}}",
  "                      placeholder=\"0\"",
  "                      className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  </div>",
  "                </div>",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Other Income <span className=\"text-gray-400 font-normal\">(rental, part-time)</span></label>",
  "                  <div className=\"relative\">",
  "                    <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                    <input type=\"number\" value={otherIncome} onChange={e=>{setOtherIncome(e.target.value);markDirty();}}",
  "                      placeholder=\"0\"",
  "                      className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  </div>",
  "                </div>",
  "              </div>",
  "              {totalIncome && (",
  "                <div className=\"mt-3 flex items-center gap-2\">",
  "                  <span className=\"text-xs text-gray-500\">Total Qualifying Income:</span>",
  "                  <span className=\"text-sm font-bold text-green-700\">${parseFloat(totalIncome).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}/mo</span>",
  "                </div>",
  "              )}",
  "            </div>",
  "",
  "            {/* DTI Display */}",
  "            {totalHousing && totalIncome && (",
  "              <div className=\"mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200\">",
  "                <h3 className=\"text-xs font-bold text-gray-500 uppercase tracking-wide mb-3\">DTI Ratios</h3>",
  "                <div className=\"flex gap-3 flex-wrap\">",
  "                  <div className={`flex-1 min-w-[120px] rounded-xl p-3 text-center border " +
  "                    ${parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 36 ? 'bg-red-50 border-red-200' :",
  "                      parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 28 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>",
  "                    <p className=\"text-xs font-bold text-gray-500 mb-1\">FRONT-END</p>",
  "                    <p className={`text-2xl font-bold " +
  "                      ${parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 36 ? 'text-red-700' :",
  "                        parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 28 ? 'text-yellow-700' : 'text-green-700'}`}>",
  "                      {(parseFloat(totalHousing)/parseFloat(totalIncome)*100).toFixed(1)}%",
  "                    </p>",
  "                    <p className=\"text-xs text-gray-400 mt-0.5\">PITI \xf7 Income</p>",
  "                    <p className=\"text-xs text-gray-400\">Guideline: \u226428%</p>",
  "                  </div>",
  "                  <div className={`flex-1 min-w-[120px] rounded-xl p-3 text-center border " +
  "                    ${(parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 50 ? 'bg-red-50 border-red-200' :",
  "                      (parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 43 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>",
  "                    <p className=\"text-xs font-bold text-gray-500 mb-1\">BACK-END</p>",
  "                    <p className={`text-2xl font-bold " +
  "                      ${(parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 50 ? 'text-red-700' :",
  "                        (parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 43 ? 'text-yellow-700' : 'text-green-700'}`}>",
  "                      {((parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100).toFixed(1)}%",
  "                    </p>",
  "                    <p className=\"text-xs text-gray-400 mt-0.5\">PITI+Debts \xf7 Income</p>",
  "                    <p className=\"text-xs text-gray-400\">Guideline: \u226443%</p>",
  "                  </div>",
  "                  <div className=\"flex-1 min-w-[120px] rounded-xl p-3 text-center border bg-blue-50 border-blue-200\">",
  "                    <p className=\"text-xs font-bold text-gray-500 mb-1\">RESERVES</p>",
  "                    <p className=\"text-2xl font-bold text-blue-700\">",
  "                      {postCloseReserves ? postCloseReserves + ' mo' : '\u2014'}",
  "                    </p>",
  "                    <p className=\"text-xs text-gray-400 mt-0.5\">Post-close PITI</p>",
  "                    <p className=\"text-xs text-gray-400\">Min 2 mo typical</p>",
  "                  </div>",
  "                </div>",
  "              </div>",
  "            )}",
  "",
  "            {/* Funds + Reserves */}",
  "            <div className=\"mb-2\">",
  "              <h3 className=\"text-sm font-bold text-gray-600 uppercase tracking-wide mb-3\">Funds &amp; Reserves</h3>",
  "              <div className=\"grid grid-cols-2 gap-4\">",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Down Payment ($)</label>",
  "                  <div className=\"relative\">",
  "                    <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                    <input type=\"number\" value={downPayment} onChange={e=>{setDownPayment(e.target.value);markDirty();}}",
  "                      placeholder=\"e.g. 17250\"",
  "                      className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  </div>",
  "                  {downPayment && propertyValue && (",
  "                    <p className=\"text-xs text-gray-400 mt-1\">",
  "                      {(parseFloat(downPayment)/parseFloat(propertyValue)*100).toFixed(1)}% of purchase price",
  "                    </p>",
  "                  )}",
  "                </div>",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Seller Concessions ($)</label>",
  "                  <div className=\"relative\">",
  "                    <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                    <input type=\"number\" value={sellerConcessions} onChange={e=>{setSellerConcessions(e.target.value);markDirty();}}",
  "                      placeholder=\"0\"",
  "                      className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  </div>",
  "                </div>",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Est. Cash to Close ($)</label>",
  "                  <div className=\"relative\">",
  "                    <span className=\"absolute left-3 top-2 text-gray-400 text-sm\">$</span>",
  "                    <input type=\"number\" value={estimatedCashToClose} onChange={e=>{setEstimatedCashToClose(e.target.value);markDirty();}}",
  "                      placeholder=\"From LOS or manual\"",
  "                      className=\"w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  </div>",
  "                </div>",
  "                <div>",
  "                  <label className=\"block text-xs font-semibold text-gray-500 mb-1\">Post-Close Reserves <span className=\"text-gray-400 font-normal\">(months of PITI)</span></label>",
  "                  <input type=\"number\" value={postCloseReserves} onChange={e=>{setPostCloseReserves(e.target.value);markDirty();}}",
  "                    placeholder=\"e.g. 3\"",
  "                    className=\"w-full px-4 py-2 border border-gray-300 rounded-lg text-sm\" />",
  "                  {postCloseReserves && totalHousing && (",
  "                    <p className=\"text-xs text-gray-400 mt-1\">",
  "                      = ${(parseFloat(postCloseReserves) * parseFloat(totalHousing)).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})} needed in reserves",
  "                    </p>",
  "                  )}",
  "                </div>",
  "              </div>",
  "            </div>",
  "          </div>",
  "",
].join('\n');

// Insert Housing + Qualifying cards before Borrower Financials
src = src.replace(
  '          <div className="bg-white rounded-lg shadow p-6">\n            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">\n              <span>📊</span>\n              Borrower Financials',
  housingCard + '          <div className="bg-white rounded-lg shadow p-6">\n            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">\n              <span>📊</span>\n              Borrower Financials'
);
console.log(src.includes('Monthly Housing Expenses') ? 'OK: Inserted Housing Expenses card' : 'FAILED: housing card JSX');
console.log(src.includes('Qualifying Information') ? 'OK: Inserted Qualifying Information card' : 'FAILED: qualifying card JSX');

// ══════════════════════════════════════════════════════════════
// 7. SIMPLIFY OLD BORROWER FINANCIALS DTI BOX
//    (keep credit score, income, debts — remove old DTI display)
// ══════════════════════════════════════════════════════════════
src = src.replace(
  '            <div className="mt-4">\n              <label className="block text-sm font-medium text-gray-700 mb-2">DTI Ratio</label>\n              <input\n                type="text"\n                value={`${dtiRatio}%`}\n                readOnly\n                className="w-48 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"\n              />\n            </div>',
  '            <div className="mt-3 flex items-center gap-2">\n              <span className="text-xs text-gray-400">Consumer Debt Ratio:</span>\n              <span className="text-sm font-bold text-gray-600">{dtiRatio ? dtiRatio + \'%\' : \'—\'}</span>\n              <span className="text-xs text-gray-400">(debts only — full DTI shown in Qualifying section above)</span>\n            </div>'
);
console.log(src.includes('Consumer Debt Ratio') ? 'OK: Simplified old DTI box' : 'FAILED: old DTI');

// ══════════════════════════════════════════════════════════════
// VERIFY
// ══════════════════════════════════════════════════════════════
var checks = [
  ['piPayment state',        src.includes("const [piPayment")],
  ['propTaxes state',        src.includes("const [propTaxes")],
  ['coBorrowerIncome state', src.includes("const [coBorrowerIncome")],
  ['downPayment state',      src.includes("const [downPayment")],
  ['MISMO populates taxes',  src.includes("setPropTaxes(")],
  ['Firestore load',         src.includes("setPropTaxes(data.propTaxes")],
  ['DTI useEffect',          src.includes("setPiPayment(pi > 0")],
  ['Firestore save',         src.includes("piPayment: parseFloat(piPayment)")],
  ['Housing card JSX',       src.includes("Monthly Housing Expenses")],
  ['Qualifying card JSX',    src.includes("Qualifying Information")],
  ['DTI display in qual',    src.includes("FRONT-END")],
  ['Reserves pill',          src.includes("RESERVES")],
  ['Down payment %',         src.includes("of purchase price")],
  ['Reserves $ calc',        src.includes("needed in reserves")],
];

var allPassed = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); allPassed = false; }
});

if (!allPassed) { console.error('\nFailed checks above. File NOT saved.'); process.exit(1); }


// ══════════════════════════════════════════════════════════════════════
//  PART 2 — STATE-AVERAGE TAX + INSURANCE ESTIMATES
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// 1. INSERT RATE TABLES + HELPER just before ScenarioCreator function
//    (after LoanTypeSection component, before "function ScenarioCreator")
// ══════════════════════════════════════════════════════════════════════
var rateTables = [
  "// ── State-level effective property tax rates (2024 averages) ────────────────",
  "// Source: Tax Foundation / Census ACS — effective rate on assessed value",
  "const STATE_TAX_RATES = {",
  "  AL:0.0040, AK:0.0098, AZ:0.0063, AR:0.0062, CA:0.0074, CO:0.0050,",
  "  CT:0.0194, DE:0.0057, FL:0.0089, GA:0.0092, HI:0.0027, ID:0.0063,",
  "  IL:0.0205, IN:0.0085, IA:0.0147, KS:0.0130, KY:0.0083, LA:0.0056,",
  "  ME:0.0109, MD:0.0099, MA:0.0114, MI:0.0142, MN:0.0108, MS:0.0065,",
  "  MO:0.0099, MT:0.0073, NE:0.0153, NV:0.0059, NH:0.0186, NJ:0.0213,",
  "  NM:0.0067, NY:0.0158, NC:0.0082, ND:0.0094, OH:0.0153, OK:0.0090,",
  "  OR:0.0093, PA:0.0153, RI:0.0139, SC:0.0056, SD:0.0115, TN:0.0064,",
  "  TX:0.0166, UT:0.0057, VT:0.0181, VA:0.0082, WA:0.0092, WV:0.0059,",
  "  WI:0.0162, WY:0.0055, DC:0.0056",
  "};",
  "",
  "// ── State-level annual homeowners insurance rates (% of home value, 2024) ───",
  "// Higher in storm/hurricane/hail belt: FL TX LA OK KS MS AL",
  "const STATE_INS_RATES = {",
  "  AL:0.0125, AK:0.0060, AZ:0.0057, AR:0.0130, CA:0.0070, CO:0.0110,",
  "  CT:0.0068, DE:0.0063, FL:0.0200, GA:0.0100, HI:0.0035, ID:0.0065,",
  "  IL:0.0090, IN:0.0090, IA:0.0095, KS:0.0175, KY:0.0095, LA:0.0195,",
  "  ME:0.0065, MD:0.0068, MA:0.0075, MI:0.0090, MN:0.0110, MS:0.0155,",
  "  MO:0.0120, MT:0.0085, NE:0.0140, NV:0.0055, NH:0.0062, NJ:0.0075,",
  "  NM:0.0075, NY:0.0073, NC:0.0090, ND:0.0100, OH:0.0085, OK:0.0195,",
  "  OR:0.0055, PA:0.0073, RI:0.0085, SC:0.0100, SD:0.0105, TN:0.0100,",
  "  TX:0.0180, UT:0.0060, VT:0.0062, VA:0.0075, WA:0.0060, WV:0.0070,",
  "  WI:0.0075, WY:0.0075, DC:0.0060",
  "};",
  "",
  "function estimateTaxes(stateCode, propertyVal) {",
  "  const rate = STATE_TAX_RATES[stateCode?.toUpperCase()];",
  "  if (!rate || !propertyVal) return null;",
  "  return Math.round((propertyVal * rate) / 12);",
  "}",
  "",
  "function estimateInsurance(stateCode, propertyVal) {",
  "  const rate = STATE_INS_RATES[stateCode?.toUpperCase()];",
  "  if (!rate || !propertyVal) return null;",
  "  return Math.round((propertyVal * rate) / 12);",
  "}",
  "",
].join('\n');

src = src.replace(
  'function ScenarioCreator() {',
  rateTables + 'function ScenarioCreator() {'
);
console.log(src.includes('STATE_TAX_RATES') ? 'OK: Rate tables inserted' : 'FAILED: rate tables');

// ══════════════════════════════════════════════════════════════════════
// 2. ADD taxEstimated + insEstimated STATE FLAGS
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  "  const [miAutoCalc, setMiAutoCalc] = useState(true);     // auto vs manual MI",
  "  const [miAutoCalc, setMiAutoCalc] = useState(true);     // auto vs manual MI\n  const [taxEstimated, setTaxEstimated] = useState(false);  // true = came from state avg\n  const [insEstimated, setInsEstimated] = useState(false);  // true = came from state avg"
);
console.log(src.includes('taxEstimated') ? 'OK: Added estimated flags' : 'FAILED: estimated flags');

// ══════════════════════════════════════════════════════════════════════
// 3. LOAD estimated flags from Firestore
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  "        setMiAutoCalc(data.miAutoCalc !== false);",
  "        setMiAutoCalc(data.miAutoCalc !== false);\n        setTaxEstimated(data.taxEstimated || false);\n        setInsEstimated(data.insEstimated || false);"
);
console.log(src.includes('setTaxEstimated(data.taxEstimated') ? 'OK: Load estimated flags from Firestore' : 'FAILED: load flags');

// ══════════════════════════════════════════════════════════════════════
// 4. SAVE estimated flags to Firestore
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  "      miAutoCalc,",
  "      miAutoCalc,\n      taxEstimated,\n      insEstimated,"
);
console.log(src.includes('taxEstimated,\n      insEstimated,') ? 'OK: Save estimated flags to Firestore' : 'FAILED: save flags');

// ══════════════════════════════════════════════════════════════════════
// 5. ADD useEffect to auto-estimate when address + value known
//    Insert just after the LTV useEffect
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  "      hoaDues, floodInsurance, secondMortgage]);\n\n  useEffect(() => {\n    if (craData && monthlyIncome) {",
  [
    "      hoaDues, floodInsurance, secondMortgage]);",
    "",
    "  // Auto-estimate taxes + insurance from state averages when fields are empty",
    "  useEffect(() => {",
    "    if (!state || !propertyValue) return;",
    "    const val = parseFloat(propertyValue);",
    "    if (!val || val <= 0) return;",
    "    // Only fill if field is empty OR currently showing an estimate",
    "    if (!propTaxes || taxEstimated) {",
    "      const est = estimateTaxes(state, val);",
    "      if (est) { setPropTaxes(est.toString()); setTaxEstimated(true); }",
    "    }",
    "    if (!homeInsurance || insEstimated) {",
    "      const est = estimateInsurance(state, val);",
    "      if (est) { setHomeInsurance(est.toString()); setInsEstimated(true); }",
    "    }",
    "  }, [state, propertyValue]);",
    "",
    "  useEffect(() => {\n    if (craData && monthlyIncome) {",
  ].join('\n')
);
console.log(src.includes('estimateTaxes(state, val)') ? 'OK: Added auto-estimate useEffect' : 'FAILED: estimate useEffect');

// ══════════════════════════════════════════════════════════════════════
// 6. CLEAR estimated flag when MISMO provides real values
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  "        if (parsed.proposedTaxes)     setPropTaxes(Math.round(parseFloat(parsed.proposedTaxes)).toString());\n        if (parsed.proposedInsurance) setHomeInsurance(Math.round(parseFloat(parsed.proposedInsurance)).toString());",
  "        if (parsed.proposedTaxes)     { setPropTaxes(Math.round(parseFloat(parsed.proposedTaxes)).toString()); setTaxEstimated(false); }\n        if (parsed.proposedInsurance) { setHomeInsurance(Math.round(parseFloat(parsed.proposedInsurance)).toString()); setInsEstimated(false); }"
);
console.log(src.includes('setTaxEstimated(false)') ? 'OK: MISMO clears estimated flag' : 'FAILED: MISMO clears flag');

// ══════════════════════════════════════════════════════════════════════
// 7. UPDATE TAXES INPUT JSX — amber badge + manual override clears flag
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  '                <label className="block text-xs font-semibold text-gray-500 mb-1">\n                  Property Taxes <span className="text-gray-400 font-normal">(monthly)</span>\n                </label>\n                <div className="relative">\n                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>\n                  <input type="number" value={propTaxes} onChange={e=>{setPropTaxes(e.target.value);markDirty();}}\n                    placeholder="e.g. 350"\n                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />\n                </div>',
  [
    '                <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-2">',
    '                  Property Taxes <span className="text-gray-400 font-normal">(monthly)</span>',
    '                  {taxEstimated && <span className="bg-amber-100 text-amber-700 border border-amber-300 text-xs px-1.5 py-0.5 rounded-full font-semibold">Est. — {state} avg</span>}',
    '                </label>',
    '                <div className="relative">',
    '                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>',
    '                  <input type="number" value={propTaxes}',
    '                    onChange={e=>{ setPropTaxes(e.target.value); setTaxEstimated(false); markDirty(); }}',
    '                    placeholder="e.g. 350"',
    '                    className={"w-full pl-7 pr-4 py-2 border rounded-lg text-sm " + (taxEstimated ? "bg-amber-50 border-amber-300 text-amber-800" : "border-gray-300")} />',
    '                </div>',
    '                {taxEstimated && <p className="text-xs text-amber-600 mt-1">Based on {state} avg rate — edit to override</p>}',
  ].join('\n')
);
console.log(src.includes('Est. \u2014 {state} avg') ? 'OK: Taxes input has amber badge' : 'FAILED: taxes JSX');

// ══════════════════════════════════════════════════════════════════════
// 8. UPDATE INSURANCE INPUT JSX — amber badge + manual override
// ══════════════════════════════════════════════════════════════════════
src = src.replace(
  '                <label className="block text-xs font-semibold text-gray-500 mb-1">\n                  Homeowners Insurance <span className="text-gray-400 font-normal">(monthly)</span>\n                </label>\n                <div className="relative">\n                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>\n                  <input type="number" value={homeInsurance} onChange={e=>{setHomeInsurance(e.target.value);markDirty();}}\n                    placeholder="e.g. 120"\n                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />\n                </div>',
  [
    '                <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-2">',
    '                  Homeowners Insurance <span className="text-gray-400 font-normal">(monthly)</span>',
    '                  {insEstimated && <span className="bg-amber-100 text-amber-700 border border-amber-300 text-xs px-1.5 py-0.5 rounded-full font-semibold">Est. — {state} avg</span>}',
    '                </label>',
    '                <div className="relative">',
    '                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>',
    '                  <input type="number" value={homeInsurance}',
    '                    onChange={e=>{ setHomeInsurance(e.target.value); setInsEstimated(false); markDirty(); }}',
    '                    placeholder="e.g. 120"',
    '                    className={"w-full pl-7 pr-4 py-2 border rounded-lg text-sm " + (insEstimated ? "bg-amber-50 border-amber-300 text-amber-800" : "border-gray-300")} />',
    '                </div>',
    '                {insEstimated && <p className="text-xs text-amber-600 mt-1">Based on {state} avg rate — edit to override</p>}',
  ].join('\n')
);
console.log(src.includes('insEstimated && <span') ? 'OK: Insurance input has amber badge' : 'FAILED: insurance JSX');

// ══════════════════════════════════════════════════════════════════════
// VERIFY
// ══════════════════════════════════════════════════════════════════════
var checks = [
  ['STATE_TAX_RATES table',    src.includes('STATE_TAX_RATES')],
  ['STATE_INS_RATES table',    src.includes('STATE_INS_RATES')],
  ['estimateTaxes fn',         src.includes('function estimateTaxes')],
  ['estimateInsurance fn',     src.includes('function estimateInsurance')],
  ['taxEstimated state',       src.includes('const [taxEstimated')],
  ['insEstimated state',       src.includes('const [insEstimated')],
  ['auto-estimate useEffect',  src.includes('estimateTaxes(state, val)')],
  ['MISMO clears flag',        src.includes('setTaxEstimated(false)')],
  ['Firestore save flags',     src.includes('taxEstimated,\n      insEstimated,')],
  ['Firestore load flags',     src.includes('setTaxEstimated(data.taxEstimated')],
  ['Taxes amber badge JSX',    src.includes('Est. \u2014 {state} avg')],
  ['Insurance amber badge JSX',src.includes('insEstimated && <span')],
  ['Taxes override clears flag',  src.includes("setTaxEstimated(false); markDirty()")],
  ['Insurance override clears flag', src.includes("setInsEstimated(false); markDirty()")],
];

var allPassed = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); allPassed = false; }
});

if (!allPassed) { console.error('\nFailed. File NOT saved.'); process.exit(1); }



// ── Final combined verification ──────────────────────────────────────────
var checks = [
  ['STATE_TAX_RATES table',    src.includes('STATE_TAX_RATES')],
  ['STATE_INS_RATES table',    src.includes('STATE_INS_RATES')],
  ['estimateTaxes fn',         src.includes('function estimateTaxes')],
  ['estimateInsurance fn',     src.includes('function estimateInsurance')],
  ['taxEstimated state',       src.includes('const [taxEstimated')],
  ['insEstimated state',       src.includes('const [insEstimated')],
  ['auto-estimate useEffect',  src.includes('estimateTaxes(state, val)')],
  ['MISMO clears flag',        src.includes('setTaxEstimated(false)')],
  ['Firestore save flags',     src.includes('taxEstimated,\n      insEstimated,')],
  ['Firestore load flags',     src.includes('setTaxEstimated(data.taxEstimated')],
  ['Taxes amber badge JSX',    src.includes('Est. \u2014 {state} avg')],
  ['Insurance amber badge JSX',src.includes('insEstimated && <span')],
  ['Taxes override clears flag',  src.includes("setTaxEstimated(false); markDirty()")],
  ['Insurance override clears flag', src.includes("setInsEstimated(false); markDirty()")],
];

var allPassed = true;
checks.forEach(function(c) {
  if (c[1]) { console.log('OK: ' + c[0]); }
  else { console.error('FAILED: ' + c[0]); allPassed = false; }
});

if (!allPassed) { console.error('\nFailed checks. File NOT saved.'); process.exit(1); }

fs.writeFileSync(SC, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('\nSUCCESS: ScenarioCreator.jsx fully updated!');
console.log('\nInstalled:');
console.log('  Part 1 - Full PITI Housing Expenses card');
console.log('  Part 2 - State-average tax + insurance estimates');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R in browser');
console.log('  2. Enter address + property value -> taxes/insurance auto-fill amber');
console.log('  3. Import MISMO file -> real values replace estimates, badge clears');
console.log('  4. git add . && git commit -m \"feat: PITI housing + tax/insurance estimates\"');
