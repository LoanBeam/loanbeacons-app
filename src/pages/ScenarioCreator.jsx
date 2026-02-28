import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { lookupCensusTract } from '../utils/censusLookup';
import { checkUsdaEligibility } from '../utils/usdaLookup';
import { validateAddress } from '../utils/addressValidation';
import AddressValidationBadge from '../components/AddressValidationBadge';
import CRASnapshotCard from '../components/CRASnapshotCard';
import { useCRAEligibility } from '../hooks/useCRAEligibility';
import { parseURLA, getImportSummary } from '../utils/parseURLA';

const LoanTypeSection = ({ loanType, setLoanType, conventionalInvestor, setConventionalInvestor, loanPurpose, setLoanPurpose }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
    <h3 className="font-bold text-gray-800 mb-4">Loan Program Details</h3>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Loan Purpose *</label>
        <select value={loanPurpose} onChange={e=>setLoanPurpose(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Select Purpose</option>
          <option value="PURCHASE">Purchase</option>
          <option value="REFINANCE">Rate/Term Refinance</option>
          <option value="CASH_OUT">Cash-Out Refinance</option>
          <option value="STREAMLINE">Streamline Refinance</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Loan Type *</label>
        <select value={loanType} onChange={e=>{setLoanType(e.target.value);setConventionalInvestor('');}} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Select Type</option>
          <option value="FHA">FHA</option>
          <option value="VA">VA</option>
          <option value="CONVENTIONAL">Conventional</option>
          <option value="USDA">USDA</option>
          <option value="JUMBO">Jumbo</option>
          <option value="NON_QM">Non-QM</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      {loanType==='CONVENTIONAL'&&<div>
        <label className="block text-xs text-gray-500 mb-1">Conventional Investor * <span className="ml-1 text-red-500">(Required)</span></label>
        <select value={conventionalInvestor} onChange={e=>setConventionalInvestor(e.target.value)} className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Select Investor</option>
          <option value="FANNIE">Fannie Mae</option>
          <option value="FREDDIE">Freddie Mac</option>
        </select>
      </div>}
      {loanType==='FHA'&&loanPurpose==='STREAMLINE'&&<div className="col-span-2 mt-2 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between"><div><div className="font-semibold text-blue-800 text-sm">FHA Streamline Detected</div><div className="text-xs text-blue-600 mt-0.5">Use FHA Streamline Intelligence for full eligibility</div></div><a href="/fha-streamline" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg">Open Module</a></div>}
      {loanType==='VA'&&loanPurpose==='STREAMLINE'&&<div className="col-span-2 mt-2 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between"><div><div className="font-semibold text-red-800 text-sm">VA IRRRL Detected</div><div className="text-xs text-red-600 mt-0.5">Use VA IRRRL Intelligence for seasoning, NTB & recoupment</div></div><span className="bg-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg">Coming Soon</span></div>}
    </div>
  </div>
);

// ── State-level effective property tax rates (2024 averages) ────────────────
// Source: Tax Foundation / Census ACS — effective rate on assessed value
const STATE_TAX_RATES = {
  AL:0.0040, AK:0.0098, AZ:0.0063, AR:0.0062, CA:0.0074, CO:0.0050,
  CT:0.0194, DE:0.0057, FL:0.0089, GA:0.0092, HI:0.0027, ID:0.0063,
  IL:0.0205, IN:0.0085, IA:0.0147, KS:0.0130, KY:0.0083, LA:0.0056,
  ME:0.0109, MD:0.0099, MA:0.0114, MI:0.0142, MN:0.0108, MS:0.0065,
  MO:0.0099, MT:0.0073, NE:0.0153, NV:0.0059, NH:0.0186, NJ:0.0213,
  NM:0.0067, NY:0.0158, NC:0.0082, ND:0.0094, OH:0.0153, OK:0.0090,
  OR:0.0093, PA:0.0153, RI:0.0139, SC:0.0056, SD:0.0115, TN:0.0064,
  TX:0.0166, UT:0.0057, VT:0.0181, VA:0.0082, WA:0.0092, WV:0.0059,
  WI:0.0162, WY:0.0055, DC:0.0056
};

// ── State-level annual homeowners insurance rates (% of home value, 2024) ───
// Higher in storm/hurricane/hail belt: FL TX LA OK KS MS AL
const STATE_INS_RATES = {
  AL:0.0125, AK:0.0060, AZ:0.0057, AR:0.0130, CA:0.0070, CO:0.0110,
  CT:0.0068, DE:0.0063, FL:0.0200, GA:0.0100, HI:0.0035, ID:0.0065,
  IL:0.0090, IN:0.0090, IA:0.0095, KS:0.0175, KY:0.0095, LA:0.0195,
  ME:0.0065, MD:0.0068, MA:0.0075, MI:0.0090, MN:0.0110, MS:0.0155,
  MO:0.0120, MT:0.0085, NE:0.0140, NV:0.0055, NH:0.0062, NJ:0.0075,
  NM:0.0075, NY:0.0073, NC:0.0090, ND:0.0100, OH:0.0085, OK:0.0195,
  OR:0.0055, PA:0.0073, RI:0.0085, SC:0.0100, SD:0.0105, TN:0.0100,
  TX:0.0180, UT:0.0060, VT:0.0062, VA:0.0075, WA:0.0060, WV:0.0070,
  WI:0.0075, WY:0.0075, DC:0.0060
};

function estimateTaxes(stateCode, propertyVal) {
  const rate = STATE_TAX_RATES[stateCode?.toUpperCase()];
  if (!rate || !propertyVal) return null;
  return Math.round((propertyVal * rate) / 12);
}

function estimateInsurance(stateCode, propertyVal) {
  const rate = STATE_INS_RATES[stateCode?.toUpperCase()];
  if (!rate || !propertyVal) return null;
  return Math.round((propertyVal * rate) / 12);
}
function ScenarioCreator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  // Form state
  const [scenarioName, setScenarioName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [ltv, setLtv] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [term, setTerm] = useState('360');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [unit, setUnit] = useState('');
  const [censusTract, setCensusTract] = useState(null);
  const [usdaEligibility, setUsdaEligibility] = useState(null);
  const [addrValidation, setAddrValidation] = useState(null);
  const [propertyType, setPropertyType] = useState('Single Family');
  const [occupancy, setOccupancy] = useState('Primary Residence');
  const [creditScore, setCreditScore] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyDebts, setMonthlyDebts] = useState('');
  const [dtiRatio, setDtiRatio] = useState('');
  const [loanPurpose, setLoanPurpose] = useState('Purchase');
  const [loanType, setLoanType] = useState('');
  const [conventionalInvestor, setConventionalInvestor] = useState('');

  // Housing Expenses (PITI components)
  const [piPayment, setPiPayment] = useState('');          // auto-calculated
  const [propTaxes, setPropTaxes] = useState('');          // monthly
  const [homeInsurance, setHomeInsurance] = useState('');  // monthly
  const [mortgageInsurance, setMortgageInsurance] = useState(''); // MIP/PMI monthly
  const [miAutoCalc, setMiAutoCalc] = useState(true);     // auto vs manual MI
  const [taxEstimated, setTaxEstimated] = useState(false);  // true = came from state avg
  const [insEstimated, setInsEstimated] = useState(false);  // true = came from state avg
  const [hoaDues, setHoaDues] = useState('');              // monthly
  const [floodInsurance, setFloodInsurance] = useState(''); // monthly
  const [secondMortgage, setSecondMortgage] = useState(''); // monthly P&I
  const [totalHousing, setTotalHousing] = useState('');    // auto-calculated
  const [frontDti, setFrontDti] = useState('');
  const [backDti, setBackDti] = useState('');

  // Qualifying Information
  const [coBorrowerIncome, setCoBorrowerIncome] = useState('');
  const [otherIncome, setOtherIncome] = useState('');      // rental, part-time, etc
  const [totalIncome, setTotalIncome] = useState('');      // auto-calculated
  const [downPayment, setDownPayment] = useState('');
  const [sellerConcessions, setSellerConcessions] = useState('');
  const [postCloseReserves, setPostCloseReserves] = useState(''); // months of PITI
  const [estimatedCashToClose, setEstimatedCashToClose] = useState('');

  const [loading, setLoading] = useState(false);

  // MISMO Import State
  const [importedData, setImportedData] = useState(null);
  const [importSummary, setImportSummary] = useState([]);
  const [importError, setImportError] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const mismoFileRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => setIsDirty(true);
  const { craSnapshot: craData, craLoading, craError, runCRA, updateIncomeFlags } = useCRAEligibility();

  useEffect(() => {
    if (isEditMode) {
      loadScenario();
    }
  }, [id]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleAddressSelect = async (addressData) => {
    setStreetAddress(addressData.streetAddress || '');
    setCity(addressData.city || '');
    setState(addressData.state || '');
    setZipCode(addressData.zipCode || '');
    setUnit(addressData.unit || '');

    if (addressData.streetAddress && addressData.city && addressData.state && addressData.zipCode) {
      const tractData = await lookupCensusTract(addressData);
      setCensusTract(tractData);
      if (tractData?.lat && tractData?.lng) {
        const usda = await checkUsdaEligibility({ lat: tractData.lat, lng: tractData.lng });
        setUsdaEligibility(usda);
      }
      await runCRA(addressData, parseFloat(monthlyIncome) || null);
    }
  };

  // MISMO Import Handlers
  const handleMismoImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportedData(null);
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setImportError('Please upload a valid MISMO XML file (.xml)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseURLA(event.target.result);
        if (parsed.firstName)     setFirstName(parsed.firstName);
        if (parsed.lastName)      setLastName(parsed.lastName);
        if (parsed.loanAmount)    setLoanAmount(parsed.loanAmount);
        if (parsed.purchasePrice || parsed.propertyValue)
          setPropertyValue(parsed.purchasePrice || parsed.propertyValue);
        if (parsed.interestRate)  setInterestRate(parsed.interestRate);
        if (parsed.term)          setTerm(parsed.term);
        if (parsed.loanPurpose)   setLoanPurpose(parsed.loanPurpose);
        if (parsed.loanType)      setLoanType(parsed.loanType);
        if (parsed.monthlyIncome) setMonthlyIncome(parsed.monthlyIncome);
        if (parsed.monthlyDebts)  setMonthlyDebts(parsed.monthlyDebts);
        if (parsed.occupancy)     setOccupancy(parsed.occupancy);
        if (parsed.propertyType)  setPropertyType(parsed.propertyType);
        if (parsed.streetAddress) setStreetAddress(parsed.streetAddress);
        if (parsed.city)          setCity(parsed.city);
        if (parsed.state)         setState(parsed.state);
        if (parsed.zipCode)       setZipCode(parsed.zipCode);
        // Housing expenses from MISMO
        if (parsed.proposedTaxes)     { setPropTaxes(Math.round(parseFloat(parsed.proposedTaxes)).toString()); setTaxEstimated(false); }
        if (parsed.proposedInsurance) { setHomeInsurance(Math.round(parseFloat(parsed.proposedInsurance)).toString()); setInsEstimated(false); }
        if (parsed.proposedMIP)       { setMortgageInsurance(Math.round(parseFloat(parsed.proposedMIP)).toString()); setMiAutoCalc(false); }
        // Qualifying info from MISMO
        if (parsed.cashToClose)       setEstimatedCashToClose(parsed.cashToClose);
        // Housing expenses from MISMO
        if (parsed.proposedTaxes)     { setPropTaxes(Math.round(parseFloat(parsed.proposedTaxes)).toString()); setTaxEstimated(false); }
        if (parsed.proposedInsurance) { setHomeInsurance(Math.round(parseFloat(parsed.proposedInsurance)).toString()); setInsEstimated(false); }
        if (parsed.proposedMIP)       { setMortgageInsurance(Math.round(parseFloat(parsed.proposedMIP)).toString()); setMiAutoCalc(false); }
        // Qualifying info from MISMO
        if (parsed.cashToClose)       setEstimatedCashToClose(parsed.cashToClose);
        const name = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ');
        const purpMap = { PURCHASE: 'Purchase', REFINANCE: 'Refi', CASH_OUT: 'Cash-Out', STREAMLINE: 'Streamline' };
        const purpPart = purpMap[parsed.loanPurpose] || parsed.loanPurpose || '';
        if (name) setScenarioName((name + ' - ' + parsed.loanType + ' ' + purpPart).trim());
        setImportedData(parsed);
        setImportFileName(file.name);
        setImportSummary(getImportSummary(parsed));
        setIsDirty(true);
      } catch (err) {
        console.error('MISMO parse error:', err);
        setImportError(err.message || 'Failed to parse file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearImport = () => {
    setImportedData(null);
    setImportSummary([]);
    setImportError('');
    setImportFileName('');
  };

  const loadScenario = async () => {
    try {
      const docRef = doc(db, 'scenarios', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setScenarioName(data.scenarioName || '');
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setLoanAmount(data.loanAmount || '');
        setPropertyValue(data.propertyValue || '');
        setLtv(data.ltv || '');
        setInterestRate(data.interestRate || '');
        setTerm(data.term || '360');
        setStreetAddress(data.streetAddress || '');
        setCity(data.city || '');
        setState(data.state || '');
        setZipCode(data.zipCode || '');
        setPropertyType(data.propertyType || 'Single Family');
        setOccupancy(data.occupancy || 'Primary Residence');
        setCreditScore(data.creditScore || '');
        setMonthlyIncome(data.monthlyIncome || '');
        setMonthlyDebts(data.monthlyDebts || '');
        setDtiRatio(data.dtiRatio || '');
        setLoanPurpose(data.loanPurpose || 'Purchase');
        setLoanType(data.loanType || '');
        setUnit(data.unit || '');
        setCensusTract(data.censusTract || null);
        // Housing expenses
        setPropTaxes(data.propTaxes || '');
        setHomeInsurance(data.homeInsurance || '');
        setMortgageInsurance(data.mortgageInsurance || '');
        setMiAutoCalc(data.miAutoCalc !== false);
        setTaxEstimated(data.taxEstimated || false);
        setInsEstimated(data.insEstimated || false);
        setHoaDues(data.hoaDues || '');
        setFloodInsurance(data.floodInsurance || '');
        setSecondMortgage(data.secondMortgage || '');
        // Qualifying
        setCoBorrowerIncome(data.coBorrowerIncome || '');
        setOtherIncome(data.otherIncome || '');
        setDownPayment(data.downPayment || '');
        setSellerConcessions(data.sellerConcessions || '');
        setPostCloseReserves(data.postCloseReserves || '');
        setEstimatedCashToClose(data.estimatedCashToClose || '');
        setFrontDti(data.frontDti || '');
        setBackDti(data.backDti || '');
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
    }
  };

  useEffect(() => {
    if (loanAmount && propertyValue) {
      const calculatedLtv = ((parseFloat(loanAmount) / parseFloat(propertyValue)) * 100).toFixed(2);
      setLtv(calculatedLtv);
    }
  }, [loanAmount, propertyValue]);

  // Full PITI + DTI recalculation
  useEffect(() => {
    const borIncome = parseFloat(monthlyIncome) || 0;
    const coIncome  = parseFloat(coBorrowerIncome) || 0;
    const othIncome = parseFloat(otherIncome) || 0;
    const total     = borIncome + coIncome + othIncome;
    if (total > 0) setTotalIncome(total.toFixed(2));

    const debts  = parseFloat(monthlyDebts) || 0;
    const amt    = parseFloat(loanAmount) || 0;
    const rate   = parseFloat(interestRate) || 0;
    const months = parseInt(term) || 360;

    // Calculate P&I
    let pi = 0;
    if (amt > 0 && rate > 0) {
      const mr = rate / 100 / 12;
      pi = amt * (mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1);
    }
    setPiPayment(pi > 0 ? pi.toFixed(2) : '');

    // Auto-calculate MI if enabled
    let mi = parseFloat(mortgageInsurance) || 0;
    if (miAutoCalc && amt > 0) {
      if (loanType === 'FHA')  mi = (amt * 0.0055) / 12;
      else if (loanType === 'USDA') mi = (amt * 0.0035) / 12;
      else if (loanType === 'VA')   mi = 0;
      else if (loanType === 'CONVENTIONAL') {
        const ltvNum = parseFloat(ltv) || 0;
        mi = ltvNum > 80 ? (amt * 0.007) / 12 : 0; // rough PMI estimate
      }
      if (miAutoCalc) setMortgageInsurance(mi > 0 ? mi.toFixed(2) : '');
    }

    // Sum all housing components
    const taxes   = parseFloat(propTaxes) || 0;
    const ins     = parseFloat(homeInsurance) || 0;
    const hoa     = parseFloat(hoaDues) || 0;
    const flood   = parseFloat(floodInsurance) || 0;
    const second  = parseFloat(secondMortgage) || 0;
    const housing = pi + taxes + ins + mi + hoa + flood + second;
    setTotalHousing(housing > 0 ? housing.toFixed(2) : '');

    if (total <= 0) return;
    setDtiRatio(((debts / total) * 100).toFixed(2));
    setPiPayment(pi > 0 ? pi.toFixed(2) : '');
    setFrontDti(housing > 0 ? ((housing / total) * 100).toFixed(2) : '');
    setBackDti(housing > 0 ? (((housing + debts) / total) * 100).toFixed(2) : '');
  }, [monthlyDebts, monthlyIncome, coBorrowerIncome, otherIncome,
      loanAmount, interestRate, term, loanType, ltv,
      propTaxes, homeInsurance, mortgageInsurance, miAutoCalc,
      hoaDues, floodInsurance, secondMortgage]);

  // Auto-estimate taxes + insurance from state averages when fields are empty
  useEffect(() => {
    if (!state || !propertyValue) return;
    const val = parseFloat(propertyValue);
    if (!val || val <= 0) return;
    // Only fill if field is empty OR currently showing an estimate
    if (!propTaxes || taxEstimated) {
      const est = estimateTaxes(state, val);
      if (est) { setPropTaxes(est.toString()); setTaxEstimated(true); }
    }
    if (!homeInsurance || insEstimated) {
      const est = estimateInsurance(state, val);
      if (est) { setHomeInsurance(est.toString()); setInsEstimated(true); }
    }
  }, [state, propertyValue]);

  useEffect(() => {
    if (craData && monthlyIncome) {
      updateIncomeFlags(parseFloat(monthlyIncome));
    }
  }, [monthlyIncome]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const scenarioData = {
      scenarioName: scenarioName || `${firstName} ${lastName} - ${streetAddress}`,
      firstName,
      lastName,
      loanAmount: parseFloat(loanAmount),
      propertyValue: parseFloat(propertyValue),
      ltv: parseFloat(ltv),
      interestRate: parseFloat(interestRate),
      term: parseInt(term),
      streetAddress,
      city,
      state,
      zipCode,
      unit,
      censusTract,
      addressVerified: true,
      propertyType,
      occupancy,
      creditScore: parseInt(creditScore),
      monthlyIncome: parseFloat(monthlyIncome),
      monthlyDebts: parseFloat(monthlyDebts),
      dtiRatio: parseFloat(dtiRatio),
      loanType,
      // Housing expenses
      piPayment: parseFloat(piPayment) || 0,
      propTaxes: parseFloat(propTaxes) || 0,
      homeInsurance: parseFloat(homeInsurance) || 0,
      mortgageInsurance: parseFloat(mortgageInsurance) || 0,
      miAutoCalc,
      taxEstimated,
      insEstimated,
      taxEstimated,
      insEstimated,
      hoaDues: parseFloat(hoaDues) || 0,
      floodInsurance: parseFloat(floodInsurance) || 0,
      secondMortgage: parseFloat(secondMortgage) || 0,
      totalHousing: parseFloat(totalHousing) || 0,
      frontDti: parseFloat(frontDti) || 0,
      backDti: parseFloat(backDti) || 0,
      // Qualifying
      coBorrowerIncome: parseFloat(coBorrowerIncome) || 0,
      otherIncome: parseFloat(otherIncome) || 0,
      totalIncome: parseFloat(totalIncome) || 0,
      downPayment: parseFloat(downPayment) || 0,
      sellerConcessions: parseFloat(sellerConcessions) || 0,
      postCloseReserves: parseFloat(postCloseReserves) || 0,
      estimatedCashToClose: parseFloat(estimatedCashToClose) || 0,
      loanPurpose,
      status: 'active',
      updated_at: new Date()
    };

    try {
      if (isEditMode) {
        const docRef = doc(db, 'scenarios', id);
        await updateDoc(docRef, scenarioData);
        setIsDirty(false);
        alert('Scenario updated successfully!');
      } else {
        scenarioData.created_at = new Date();
        await addDoc(collection(db, 'scenarios'), scenarioData);
        setIsDirty(false);
        alert('Scenario created successfully!');
      }
      navigate('/scenarios');
    } catch (error) {
      console.error('Error saving scenario:', error);
      alert('Error saving scenario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        
        <div className="mb-8">
          <button
            onClick={() => { if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return; navigate('/'); }}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Scenario' : 'Create New Scenario'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isEditMode ? 'Update the loan scenario details below.' : 'Build and compare multiple loan scenarios side by side.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* MISMO Import Bar */}
          <input ref={mismoFileRef} type="file" accept=".xml" onChange={handleMismoImport} className="hidden" />

          {!importedData && !importError && (
            <button
              type="button"
              onClick={() => mismoFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 hover:border-blue-400 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import from LOS (MISMO XML) — auto-fill all fields
            </button>
          )}

          {importError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-300">
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Import Failed</p>
                <p className="text-xs text-red-500 mt-0.5">{importError}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => mismoFileRef.current?.click()} className="text-xs text-blue-600 hover:underline">Try Again</button>
                <button type="button" onClick={() => setImportError('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              </div>
            </div>
          )}

          {importedData && (
            <div className="rounded-xl border border-green-300 bg-green-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-green-100 border-b border-green-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-green-800">✅ LOS Import Successful</span>
                  {importedData._importMeta?.losName && (
                    <span className="text-xs text-green-600 bg-green-200 px-2 py-0.5 rounded-full">{importedData._importMeta.losName}</span>
                  )}
                  {importedData._importMeta?.loanNumber && (
                    <span className="text-xs text-gray-500">#{importedData._importMeta.loanNumber}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => mismoFileRef.current?.click()} className="text-xs text-blue-600 hover:underline">Replace File</button>
                  <button type="button" onClick={handleClearImport} className="text-xs text-red-500 hover:text-red-700 font-medium">✕ Clear Import</button>
                </div>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-gray-500 mb-2">Fields populated — all are fully editable below:</p>
                <div className="flex flex-wrap gap-1.5">
                  {importSummary.map((field, i) => (
                    <span key={i} className="text-xs bg-green-100 text-green-700 border border-green-300 px-2 py-0.5 rounded-full">{field}</span>
                  ))}
                </div>
              </div>
              <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200">
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">⚠️ Credit score not included in MISMO files</span>
                  {importedData.ssnPresent ? ' — SSN detected in file (not stored).' : '.'} Enter credit score manually below.
                </p>
              </div>
              {importedData.liabilities?.length > 0 && (
                <div className="px-4 py-3 border-t border-green-200">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Liabilities from LOS ({importedData.liabilities.length} accounts):</p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {importedData.liabilities.map((liab, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-green-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className={'w-2 h-2 rounded-full ' + (liab.excluded ? 'bg-gray-400' : liab.payoff ? 'bg-yellow-400' : 'bg-green-500')} />
                          <span className="text-gray-700 font-medium">{liab.creditor}</span>
                          <span className="text-gray-400">({liab.type})</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="text-gray-500">${liab.balance.toLocaleString()}</span>
                          <span className={liab.monthlyPayment === 0 ? 'text-amber-600 font-semibold' : 'text-gray-700 font-semibold'}>
                            ${liab.monthlyPayment}/mo{liab.monthlyPayment === 0 ? ' ⚠' : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {importedData.liabilities.some(l => l.monthlyPayment === 0) && (
                    <p className="text-xs text-amber-600 mt-1.5 font-medium">⚠ $0/mo accounts may be deferred (IBR student loans). Apply 0.5-1% rule for FHA qualifying.</p>
                  )}
                </div>
              )}
              {importedData.assets?.length > 0 && (
                <div className="px-4 py-3 border-t border-green-200">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Assets — Total: ${Number(importedData.totalAssets || 0).toLocaleString()}</p>
                  <div className="flex flex-wrap gap-2">
                    {importedData.assets.map((asset, i) => (
                      <div key={i} className="text-xs bg-white border border-green-200 rounded-lg px-2.5 py-1">
                        <span className="text-gray-600">{asset.institution}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-green-600 font-semibold">${asset.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-4 py-2 border-t border-green-200">
                <p className="text-xs text-gray-400">📎 {importFileName}</p>
              </div>
            </div>
          )}
          {/* END MISMO Import Bar */}
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Scenario Name</h2>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => { setScenarioName(e.target.value); markDirty(); }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g., Smith Purchase - 123 Main St (auto-generated if left blank)"
            />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>👤</span>
              Borrower Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🏦</span>
              Loan Details
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Loan Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => { setLoanAmount(e.target.value); markDirty(); }}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Property Value</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={propertyValue}
                    onChange={(e) => { setPropertyValue(e.target.value); markDirty(); }}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">LTV</label>
                <input
                  type="text"
                  value={ltv}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={interestRate}
                  onChange={(e) => { setInterestRate(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="6.500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Enter the baseline interest rate for this scenario</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Loan Term</label>
                <select
                  value={term}
                  onChange={(e) => { setTerm(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="360">30 Years (360 months)</option>
                  <option value="300">25 Years (300 months)</option>
                  <option value="240">20 Years (240 months)</option>
                  <option value="180">15 Years (180 months)</option>
                  <option value="120">10 Years (120 months)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🏠</span>
              Property Information
            </h2>
            <AddressAutocomplete
              value={{ streetAddress, city, state, zipCode, unit }}
              onAddressSelect={(addr) => {
                handleAddressSelect(addr);
                if (addr?.streetAddress) {
                  setAddrValidation({ status: 'PENDING' });
                  validateAddress({
                    address: addr.streetAddress,
                    city: addr.city || '',
                    state: addr.state || '',
                    zip: addr.zipCode || ''
                  })
                    .then(r => setAddrValidation(r))
                    .catch(() => setAddrValidation({ status: 'API_ERROR' }));
                }
              }}
            />
            {addrValidation && (
              <div className="mt-3">
                <AddressValidationBadge validation={addrValidation} />
              </div>
            )}
            <CRASnapshotCard
              craData={craData}
              loading={craLoading}
              error={craError}
              borrowerIncome={parseFloat(monthlyIncome) || null}
            />
            <div className="space-y-4" style={{display:'none'}}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                <input
                  type="text"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    maxLength="2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    maxLength="5"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Property Type</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option>Single Family</option>
                    <option>Condo</option>
                    <option>Townhouse</option>
                    <option>Multi-Family (2-4 units)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Occupancy</label>
                  <select
                    value={occupancy}
                    onChange={(e) => setOccupancy(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option>Primary Residence</option>
                    <option>Second Home</option>
                    <option>Investment Property</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>🏠</span>
              Monthly Housing Expenses (PITI)
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              Used for front-end DTI. Auto-populated from MISMO import where available.
              {loanType==='FHA'&&<span className="ml-2 text-blue-600 font-semibold">FHA MIP auto-calculated (0.55% annual)</span>}
              {loanType==='USDA'&&<span className="ml-2 text-green-600 font-semibold">USDA annual fee auto-calculated (0.35%)</span>}
              {loanType==='VA'&&<span className="ml-2 text-red-600 font-semibold">VA — no monthly MI</span>}
            </p>

            {/* P&I — auto-calculated, read-only */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Principal &amp; Interest <span className="text-blue-500">(auto)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="text" value={piPayment ? parseFloat(piPayment).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''} readOnly
                    placeholder="Fill in Loan Details above"
                    className="w-full pl-7 pr-4 py-2 border border-gray-200 rounded-lg bg-blue-50 text-blue-700 font-semibold text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-2">
                  Property Taxes <span className="text-gray-400 font-normal">(monthly)</span>
                  {taxEstimated && <span className="bg-amber-100 text-amber-700 border border-amber-300 text-xs px-1.5 py-0.5 rounded-full font-semibold">Est. — {state} avg</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={propTaxes}
                    onChange={e=>{ setPropTaxes(e.target.value); setTaxEstimated(false); markDirty(); }}
                    placeholder="e.g. 350"
                    className={"w-full pl-7 pr-4 py-2 border rounded-lg text-sm " + (taxEstimated ? "bg-amber-50 border-amber-300 text-amber-800" : "border-gray-300")} />
                </div>
                {taxEstimated && <p className="text-xs text-amber-600 mt-1">Based on {state} avg rate — edit to override</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-2">
                  Homeowners Insurance <span className="text-gray-400 font-normal">(monthly)</span>
                  {insEstimated && <span className="bg-amber-100 text-amber-700 border border-amber-300 text-xs px-1.5 py-0.5 rounded-full font-semibold">Est. — {state} avg</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={homeInsurance}
                    onChange={e=>{ setHomeInsurance(e.target.value); setInsEstimated(false); markDirty(); }}
                    placeholder="e.g. 120"
                    className={"w-full pl-7 pr-4 py-2 border rounded-lg text-sm " + (insEstimated ? "bg-amber-50 border-amber-300 text-amber-800" : "border-gray-300")} />
                </div>
                {insEstimated && <p className="text-xs text-amber-600 mt-1">Based on {state} avg rate — edit to override</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center justify-between">
                  <span>
                    {loanType==='FHA'?'FHA MIP':loanType==='USDA'?'USDA Annual Fee':loanType==='VA'?'VA MI (none)':'PMI / Mortgage Insurance'}
                    {' '}<span className="text-gray-400 font-normal">(monthly)</span>
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={miAutoCalc} onChange={e=>setMiAutoCalc(e.target.checked)}
                      className="w-3 h-3 rounded" />
                    <span className="text-xs text-blue-500">Auto</span>
                  </label>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={mortgageInsurance}
                    onChange={e=>{setMortgageInsurance(e.target.value);setMiAutoCalc(false);markDirty();}}
                    readOnly={miAutoCalc && loanType==='VA'}
                    placeholder={miAutoCalc ? 'Auto-calculated' : 'e.g. 150'}
                    className={'w-full pl-7 pr-4 py-2 border rounded-lg text-sm ' + (miAutoCalc ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-gray-300')} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">HOA Dues <span className="text-gray-400 font-normal">(monthly)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={hoaDues} onChange={e=>{setHoaDues(e.target.value);markDirty();}}
                    placeholder="0"
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Flood Insurance <span className="text-gray-400 font-normal">(monthly)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={floodInsurance} onChange={e=>{setFloodInsurance(e.target.value);markDirty();}}
                    placeholder="0"
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">2nd Mortgage P&amp;I <span className="text-gray-400 font-normal">(monthly)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={secondMortgage} onChange={e=>{setSecondMortgage(e.target.value);markDirty();}}
                    placeholder="0"
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            {/* Total Housing Payment */}
            {totalHousing && (
              <div className="mt-4 bg-gray-900 rounded-xl px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-300">Total Monthly Housing (PITI)</span>
                <span className="text-2xl font-bold text-white">${parseFloat(totalHousing).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              </div>
            )}
          </div>

          {/* Qualifying Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
              <span>💰</span>
              Qualifying Information
            </h2>

            {/* Income */}
            <div className="mb-5">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Income</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Borrower Monthly Income</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={monthlyIncome} onChange={e=>{setMonthlyIncome(e.target.value);markDirty();}}
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Co-Borrower Monthly Income</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={coBorrowerIncome} onChange={e=>{setCoBorrowerIncome(e.target.value);markDirty();}}
                      placeholder="0"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Other Income <span className="text-gray-400 font-normal">(rental, part-time)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={otherIncome} onChange={e=>{setOtherIncome(e.target.value);markDirty();}}
                      placeholder="0"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              </div>
              {totalIncome && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Total Qualifying Income:</span>
                  <span className="text-sm font-bold text-green-700">${parseFloat(totalIncome).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}/mo</span>
                </div>
              )}
            </div>

            {/* DTI Display */}
            {totalHousing && totalIncome && (
              <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">DTI Ratios</h3>
                <div className="flex gap-3 flex-wrap">
                  <div className={`flex-1 min-w-[120px] rounded-xl p-3 text-center border                     ${parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 36 ? 'bg-red-50 border-red-200' :
                      parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 28 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                    <p className="text-xs font-bold text-gray-500 mb-1">FRONT-END</p>
                    <p className={`text-2xl font-bold                       ${parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 36 ? 'text-red-700' :
                        parseFloat(totalHousing)/parseFloat(totalIncome)*100 > 28 ? 'text-yellow-700' : 'text-green-700'}`}>
                      {(parseFloat(totalHousing)/parseFloat(totalIncome)*100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">PITI ÷ Income</p>
                    <p className="text-xs text-gray-400">Guideline: ≤28%</p>
                  </div>
                  <div className={`flex-1 min-w-[120px] rounded-xl p-3 text-center border                     ${(parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 50 ? 'bg-red-50 border-red-200' :
                      (parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 43 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                    <p className="text-xs font-bold text-gray-500 mb-1">BACK-END</p>
                    <p className={`text-2xl font-bold                       ${(parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 50 ? 'text-red-700' :
                        (parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100 > 43 ? 'text-yellow-700' : 'text-green-700'}`}>
                      {((parseFloat(totalHousing)+(parseFloat(monthlyDebts)||0))/parseFloat(totalIncome)*100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">PITI+Debts ÷ Income</p>
                    <p className="text-xs text-gray-400">Guideline: ≤43%</p>
                  </div>
                  <div className="flex-1 min-w-[120px] rounded-xl p-3 text-center border bg-blue-50 border-blue-200">
                    <p className="text-xs font-bold text-gray-500 mb-1">RESERVES</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {postCloseReserves ? postCloseReserves + ' mo' : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Post-close PITI</p>
                    <p className="text-xs text-gray-400">Min 2 mo typical</p>
                  </div>
                </div>
              </div>
            )}

            {/* Funds + Reserves */}
            <div className="mb-2">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Funds &amp; Reserves</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Down Payment ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={downPayment} onChange={e=>{setDownPayment(e.target.value);markDirty();}}
                      placeholder="e.g. 17250"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  {downPayment && propertyValue && (
                    <p className="text-xs text-gray-400 mt-1">
                      {(parseFloat(downPayment)/parseFloat(propertyValue)*100).toFixed(1)}% of purchase price
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Seller Concessions ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={sellerConcessions} onChange={e=>{setSellerConcessions(e.target.value);markDirty();}}
                      placeholder="0"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Est. Cash to Close ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={estimatedCashToClose} onChange={e=>{setEstimatedCashToClose(e.target.value);markDirty();}}
                      placeholder="From LOS or manual"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Post-Close Reserves <span className="text-gray-400 font-normal">(months of PITI)</span></label>
                  <input type="number" value={postCloseReserves} onChange={e=>{setPostCloseReserves(e.target.value);markDirty();}}
                    placeholder="e.g. 3"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  {postCloseReserves && totalHousing && (
                    <p className="text-xs text-gray-400 mt-1">
                      = ${(parseFloat(postCloseReserves) * parseFloat(totalHousing)).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})} needed in reserves
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>📊</span>
              Borrower Financials
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Credit Score (FICO)</label>
                <input
                  type="number"
                  value={creditScore}
                  onChange={(e) => { setCreditScore(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Gross Income</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={monthlyIncome}
                    onChange={(e) => { setMonthlyIncome(e.target.value); markDirty(); }}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Debts</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={monthlyDebts}
                    onChange={(e) => { setMonthlyDebts(e.target.value); markDirty(); }}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-400">Consumer Debt Ratio:</span>
              <span className="text-sm font-bold text-gray-600">{dtiRatio ? dtiRatio + '%' : '—'}</span>
              <span className="text-xs text-gray-400">(debts only — full DTI shown in Qualifying section above)</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🎯</span>
              Loan Purpose
            </h2>
          </div>

          <LoanTypeSection
            loanType={loanType}
            setLoanType={setLoanType}
            conventionalInvestor={conventionalInvestor}
            setConventionalInvestor={setConventionalInvestor}
            loanPurpose={loanPurpose}
            setLoanPurpose={setLoanPurpose}
          />

          {/* Sticky Save Bar */}
          <div
            style={{ transform: isDirty ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 0.3s ease' }}
            className="fixed bottom-0 left-0 right-0 z-50"
          >
            <div className="bg-white border-t-2 border-blue-500 shadow-2xl">
              <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-gray-800">Unsaved changes</p>
                    <p className="text-xs text-gray-500">Click Save to keep your work</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { if (window.confirm('Discard all changes?')) { setIsDirty(false); navigate('/scenarios'); } }}
                    className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Scenario'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* END Sticky Save Bar */}

          {/* Static bottom buttons */}
          <div className="flex gap-4 pb-24">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400"
            >
              {loading ? 'Saving...' : isEditMode ? 'Update Scenario' : 'Create Scenario'}
            </button>
            <button
              type="button"
              onClick={() => { if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return; navigate('/scenarios'); }}
              className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Cancel
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default ScenarioCreator;
