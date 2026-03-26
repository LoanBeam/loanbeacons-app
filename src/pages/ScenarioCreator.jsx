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
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ── Loan Types grouped by Loan Purpose ────────────────────────────────────────
const LOAN_TYPES_BY_PURPOSE = {
  PURCHASE: [
    { group: 'Government', options: [
      { value: 'FHA', label: 'FHA' },
      { value: 'VA', label: 'VA' },
      { value: 'USDA', label: 'USDA' },
      { value: 'FHA_203K', label: 'FHA 203k (Renovation)' },
    ]},
    { group: 'Conventional', options: [
      { value: 'CONVENTIONAL', label: 'Conventional (Conforming)' },
      { value: 'JUMBO', label: 'Jumbo' },
      { value: 'HOMEREADY', label: 'HomeReady (Fannie Mae)' },
      { value: 'HOME_POSSIBLE', label: 'Home Possible (Freddie Mac)' },
      { value: 'HOMESTYLE', label: 'HomeStyle Renovation' },
    ]},
    { group: 'Non-QM', options: [
      { value: 'BANK_STMT_PERSONAL', label: 'Bank Statement (Personal)' },
      { value: 'BANK_STMT_BUSINESS', label: 'Bank Statement (Business)' },
      { value: 'DSCR', label: 'DSCR' },
      { value: 'ASSET_DEPLETION', label: 'Asset Depletion' },
      { value: 'NON_QM_1099', label: '1099 Only' },
      { value: 'NON_QM_PNL', label: 'P&L Only' },
      { value: 'FOREIGN_NATIONAL', label: 'Foreign National' },
      { value: 'ITIN', label: 'ITIN' },
    ]},
  ],
  RATE_TERM_REFI: [
    { group: 'Government', options: [
      { value: 'FHA', label: 'FHA' },
      { value: 'VA', label: 'VA' },
      { value: 'USDA', label: 'USDA' },
    ]},
    { group: 'Conventional', options: [
      { value: 'CONVENTIONAL', label: 'Conventional (Conforming)' },
      { value: 'JUMBO', label: 'Jumbo' },
      { value: 'HOMEREADY', label: 'HomeReady (Fannie Mae)' },
      { value: 'HOME_POSSIBLE', label: 'Home Possible (Freddie Mac)' },
    ]},
    { group: 'Non-QM', options: [
      { value: 'BANK_STMT_PERSONAL', label: 'Bank Statement (Personal)' },
      { value: 'BANK_STMT_BUSINESS', label: 'Bank Statement (Business)' },
      { value: 'DSCR', label: 'DSCR' },
      { value: 'ASSET_DEPLETION', label: 'Asset Depletion' },
      { value: 'NON_QM_1099', label: '1099 Only' },
      { value: 'NON_QM_PNL', label: 'P&L Only' },
      { value: 'FOREIGN_NATIONAL', label: 'Foreign National' },
      { value: 'ITIN', label: 'ITIN' },
    ]},
  ],
  CASH_OUT: [
    { group: 'Government', options: [
      { value: 'FHA', label: 'FHA' },
      { value: 'VA', label: 'VA' },
    ]},
    { group: 'Conventional', options: [
      { value: 'CONVENTIONAL', label: 'Conventional (Conforming)' },
      { value: 'JUMBO', label: 'Jumbo' },
    ]},
    { group: 'Non-QM', options: [
      { value: 'BANK_STMT_PERSONAL', label: 'Bank Statement (Personal)' },
      { value: 'BANK_STMT_BUSINESS', label: 'Bank Statement (Business)' },
      { value: 'DSCR', label: 'DSCR' },
      { value: 'ASSET_DEPLETION', label: 'Asset Depletion' },
      { value: 'NON_QM_1099', label: '1099 Only' },
      { value: 'NON_QM_PNL', label: 'P&L Only' },
    ]},
  ],
  STREAMLINE: [
    { group: 'Government', options: [
      { value: 'FHA', label: 'FHA Streamline' },
      { value: 'VA', label: 'VA IRRRL' },
      { value: 'USDA', label: 'USDA Streamline' },
    ]},
  ],
  FIX_FLIP: [
    { group: 'Investment / Alternative', options: [
      { value: 'HARD_MONEY', label: 'Hard Money' },
      { value: 'PRIVATE_MONEY', label: 'Private Money' },
      { value: 'FIX_FLIP_CONV', label: 'Fix & Flip Conventional' },
    ]},
  ],
  CONSTRUCTION: [
    { group: 'Construction', options: [
      { value: 'CONSTRUCTION_TO_PERM', label: 'Construction-to-Permanent' },
      { value: 'CONSTRUCTION_ONLY', label: 'Construction Only' },
      { value: 'PRIVATE_MONEY_CONSTRUCTION', label: 'Private Money Construction' },
    ]},
  ],
  BRIDGE: [
    { group: 'Investment / Alternative', options: [
      { value: 'BRIDGE_LOAN', label: 'Bridge Loan' },
      { value: 'HARD_MONEY', label: 'Hard Money' },
      { value: 'PRIVATE_MONEY', label: 'Private Money' },
    ]},
  ],
  INVESTMENT_PURCHASE: [
    { group: 'Investment', options: [
      { value: 'DSCR', label: 'DSCR' },
      { value: 'CONVENTIONAL_INVESTMENT', label: 'Conventional Investment' },
      { value: 'HARD_MONEY', label: 'Hard Money' },
      { value: 'PRIVATE_MONEY', label: 'Private Money' },
    ]},
  ],
  COMMERCIAL: [
    { group: 'Commercial', options: [
      { value: 'COMMERCIAL_1_4', label: 'Commercial (1–4 Unit)' },
      { value: 'DSCR', label: 'DSCR' },
      { value: 'PRIVATE_MONEY', label: 'Private Money' },
    ]},
  ],
  OTHER: [
    { group: 'All Types', options: [
      { value: 'FHA', label: 'FHA' },
      { value: 'VA', label: 'VA' },
      { value: 'USDA', label: 'USDA' },
      { value: 'FHA_203K', label: 'FHA 203k' },
      { value: 'CONVENTIONAL', label: 'Conventional' },
      { value: 'JUMBO', label: 'Jumbo' },
      { value: 'HOMEREADY', label: 'HomeReady' },
      { value: 'HOME_POSSIBLE', label: 'Home Possible' },
      { value: 'HOMESTYLE', label: 'HomeStyle' },
      { value: 'BANK_STMT_PERSONAL', label: 'Bank Statement (Personal)' },
      { value: 'BANK_STMT_BUSINESS', label: 'Bank Statement (Business)' },
      { value: 'DSCR', label: 'DSCR' },
      { value: 'ASSET_DEPLETION', label: 'Asset Depletion' },
      { value: 'NON_QM_1099', label: '1099 Only' },
      { value: 'NON_QM_PNL', label: 'P&L Only' },
      { value: 'FOREIGN_NATIONAL', label: 'Foreign National' },
      { value: 'ITIN', label: 'ITIN' },
      { value: 'HARD_MONEY', label: 'Hard Money' },
      { value: 'PRIVATE_MONEY', label: 'Private Money' },
      { value: 'BRIDGE_LOAN', label: 'Bridge Loan' },
      { value: 'CONVENTIONAL_INVESTMENT', label: 'Conventional Investment' },
      { value: 'OTHER', label: 'Other' },
    ]},
  ],
};

// Normalize old loanPurpose string values from Firestore to new uppercase keys
const normalizePurpose = (v) => {
  if (!v) return 'PURCHASE';
  const map = {
    'Purchase': 'PURCHASE', 'PURCHASE': 'PURCHASE',
    'Refi': 'RATE_TERM_REFI', 'REFINANCE': 'RATE_TERM_REFI', 'Rate/Term Refinance': 'RATE_TERM_REFI',
    'Cash-Out': 'CASH_OUT', 'CASH_OUT': 'CASH_OUT',
    'Streamline': 'STREAMLINE', 'STREAMLINE': 'STREAMLINE',
  };
  return map[v] || v;
};

// ── State-level effective property tax rates (2024 averages) ─────────────────
const STATE_TAX_RATES = {
  AL:0.0040, AK:0.0098, AZ:0.0063, AR:0.0062, CA:0.0074, CO:0.0050,
  CT:0.0194, DE:0.0057, FL:0.0089, GA:0.0092, HI:0.0027, ID:0.0063,
  IL:0.0205, IN:0.0085, IA:0.0147, KS:0.0130, KY:0.0083, LA:0.0056,
  ME:0.0109, MD:0.0099, MA:0.0114, MI:0.0142, MN:0.0108, MS:0.0065,
  MO:0.0099, MT:0.0073, NE:0.0153, NV:0.0059, NH:0.0186, NJ:0.0213,
  NM:0.0067, NY:0.0158, NC:0.0082, ND:0.0094, OH:0.0153, OK:0.0090,
  OR:0.0093, PA:0.0153, RI:0.0139, SC:0.0056, SD:0.0115, TN:0.0064,
  TX:0.0166, UT:0.0057, VT:0.0181, VA:0.0082, WA:0.0092, WV:0.0059,
  WI:0.0162, WY:0.0055, DC:0.0056,
};

// ── State-level annual homeowners insurance rates (% of home value, 2024) ────
const STATE_INS_RATES = {
  AL:0.0125, AK:0.0060, AZ:0.0057, AR:0.0130, CA:0.0070, CO:0.0110,
  CT:0.0068, DE:0.0063, FL:0.0200, GA:0.0100, HI:0.0035, ID:0.0065,
  IL:0.0090, IN:0.0090, IA:0.0095, KS:0.0175, KY:0.0095, LA:0.0195,
  ME:0.0065, MD:0.0068, MA:0.0075, MI:0.0090, MN:0.0110, MS:0.0155,
  MO:0.0120, MT:0.0085, NE:0.0140, NV:0.0055, NH:0.0062, NJ:0.0075,
  NM:0.0075, NY:0.0073, NC:0.0090, ND:0.0100, OH:0.0085, OK:0.0195,
  OR:0.0055, PA:0.0073, RI:0.0085, SC:0.0100, SD:0.0105, TN:0.0100,
  TX:0.0180, UT:0.0060, VT:0.0062, VA:0.0075, WA:0.0060, WV:0.0070,
  WI:0.0075, WY:0.0075, DC:0.0060,
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

// ── Empty co-borrower template ────────────────────────────────────────────────
const emptyCoBorrower = () => ({
  firstName: '', lastName: '', citizenship: 'US_CITIZEN',
  monthlyIncome: '', creditScore: '',
});

function ScenarioCreator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  // ── Primary Borrower ────────────────────────────────────────────────────────
  const [scenarioName, setScenarioName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [citizenship, setCitizenship] = useState('US_CITIZEN');

  // ── Reference IDs ───────────────────────────────────────────────────────────
  const [loanBeaconsRef, setLoanBeaconsRef] = useState('');
  const [losLoanNumber, setLosLoanNumber] = useState('');
  const [ausCaseNumber, setAusCaseNumber] = useState('');

  // ── Co-Borrowers (up to 3) ──────────────────────────────────────────────────
  const [coBorrowers, setCoBorrowers] = useState([]);
  const addCoBorrower = () => {
    if (coBorrowers.length < 3) { setCoBorrowers(prev => [...prev, emptyCoBorrower()]); markDirty(); }
  };
  const removeCoBorrower = (i) => { setCoBorrowers(prev => prev.filter((_, idx) => idx !== i)); markDirty(); };
  const updateCoBorrower = (i, field, value) => {
    setCoBorrowers(prev => prev.map((cb, idx) => idx === i ? { ...cb, [field]: value } : cb));
    markDirty();
  };

  // ── Loan Purpose & Type ─────────────────────────────────────────────────────
  const [loanPurpose, setLoanPurpose] = useState('PURCHASE');
  const [loanType, setLoanType] = useState('');
  const [conventionalInvestor, setConventionalInvestor] = useState('');

  // ── Dynamic Loan Type Fields ────────────────────────────────────────────────
  // Renovation / Fix & Flip / Bridge / Hard Money
  const [asIsValue, setAsIsValue] = useState('');
  const [rehabBudget, setRehabBudget] = useState('');
  const [arvValue, setArvValue] = useState('');
  const [holdPeriod, setHoldPeriod] = useState('');
  const [exitStrategy, setExitStrategy] = useState('');
  const [ltcRatio, setLtcRatio] = useState('');
  // DSCR
  const [monthlyRent, setMonthlyRent] = useState('');
  const [annualNOI, setAnnualNOI] = useState('');
  const [dscrRatio, setDscrRatio] = useState('');
  // Bank Statement
  const [bankStmtPeriod, setBankStmtPeriod] = useState('24');
  const [avgMonthlyDeposits, setAvgMonthlyDeposits] = useState('');
  const [expenseRatio, setExpenseRatio] = useState('50');
  // Asset Depletion
  const [totalQualifyingAssets, setTotalQualifyingAssets] = useState('');
  const [depletionPeriod, setDepletionPeriod] = useState('360');
  // VA
  const [vaEntitlement, setVaEntitlement] = useState('FULL');
  const [vaFundingFeeExempt, setVaFundingFeeExempt] = useState(false);
  // USDA
  const [householdSize, setHouseholdSize] = useState('');
  const [annualHouseholdIncome, setAnnualHouseholdIncome] = useState('');
  // Construction
  const [lotValue, setLotValue] = useState('');
  const [landAcquisitionCost, setLandAcquisitionCost] = useState('');
  const [constructionBudget, setConstructionBudget] = useState('');
  const [drawScheduleType, setDrawScheduleType] = useState('');

  // ── Loan Details ────────────────────────────────────────────────────────────
  const [loanAmount, setLoanAmount] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [ltv, setLtv] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [term, setTerm] = useState('360');

  // ── Property Information ────────────────────────────────────────────────────
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [county, setCounty] = useState('');
  const [unit, setUnit] = useState('');
  const [censusTract, setCensusTract] = useState(null);
  const [usdaEligibility, setUsdaEligibility] = useState(null);
  const [addrValidation, setAddrValidation] = useState(null);
  const [propertyType, setPropertyType] = useState('Single Family');
  const [occupancy, setOccupancy] = useState('Primary Residence');

  // ── Housing Expenses (PITI) ─────────────────────────────────────────────────
  const [piPayment, setPiPayment] = useState('');
  const [propTaxes, setPropTaxes] = useState('');
  const [homeInsurance, setHomeInsurance] = useState('');
  const [mortgageInsurance, setMortgageInsurance] = useState('');
  const [miAutoCalc, setMiAutoCalc] = useState(true);
  const [taxEstimated, setTaxEstimated] = useState(false);
  const [insEstimated, setInsEstimated] = useState(false);
  const [hoaDues, setHoaDues] = useState('');
  const [floodInsurance, setFloodInsurance] = useState('');
  const [secondMortgage, setSecondMortgage] = useState('');
  const [totalHousing, setTotalHousing] = useState('');
  const [frontDti, setFrontDti] = useState('');
  const [backDti, setBackDti] = useState('');

  // ── Qualifying Information ──────────────────────────────────────────────────
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [coBorrowerIncome, setCoBorrowerIncome] = useState(''); // legacy field, derived from array
  const [otherIncome, setOtherIncome] = useState('');
  const [totalIncome, setTotalIncome] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [sellerConcessions, setSellerConcessions] = useState('');
  const [postCloseReserves, setPostCloseReserves] = useState('');
  const [estimatedCashToClose, setEstimatedCashToClose] = useState('');

  // ── Borrower Financials ─────────────────────────────────────────────────────
  const [creditScore, setCreditScore] = useState('');
  const [monthlyDebts, setMonthlyDebts] = useState('');
  const [dtiRatio, setDtiRatio] = useState('');

  // ── UI State ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => setIsDirty(true);

  // ── MISMO Import State ──────────────────────────────────────────────────────
  const [importedData, setImportedData] = useState(null);
  const [importSummary, setImportSummary] = useState([]);
  const [importError, setImportError] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const mismoFileRef = useRef(null);

  const { craSnapshot: craData, craLoading, craError, runCRA, updateIncomeFlags } = useCRAEligibility();

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => { if (isEditMode) loadScenario(); }, [id]);

  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Auto-calculate LTV
  useEffect(() => {
    if (loanAmount && propertyValue) {
      setLtv(((parseFloat(loanAmount) / parseFloat(propertyValue)) * 100).toFixed(2));
    }
  }, [loanAmount, propertyValue]);

  // Auto-calculate LTC (hard money / fix & flip)
  useEffect(() => {
    const totalCost = (parseFloat(asIsValue) || 0) + (parseFloat(rehabBudget) || 0);
    if (loanAmount && totalCost > 0) {
      setLtcRatio(((parseFloat(loanAmount) / totalCost) * 100).toFixed(2));
    }
  }, [loanAmount, asIsValue, rehabBudget]);

  // Auto-calculate DSCR
  useEffect(() => {
    const rent = parseFloat(monthlyRent) || 0;
    const pi = parseFloat(piPayment) || 0;
    if (rent > 0 && pi > 0) setDscrRatio((rent / pi).toFixed(2));
    else setDscrRatio('');
  }, [monthlyRent, piPayment]);

  // Full PITI + DTI recalculation
  useEffect(() => {
    const borIncome = parseFloat(monthlyIncome) || 0;
    const coIncome  = coBorrowers.length > 0
      ? coBorrowers.reduce((sum, cb) => sum + (parseFloat(cb.monthlyIncome) || 0), 0)
      : parseFloat(coBorrowerIncome) || 0;
    const othIncome = parseFloat(otherIncome) || 0;
    const total     = borIncome + coIncome + othIncome;
    if (total > 0) setTotalIncome(total.toFixed(2));
    else setTotalIncome('');

    const debts  = parseFloat(monthlyDebts) || 0;
    const amt    = parseFloat(loanAmount) || 0;
    const rate   = parseFloat(interestRate) || 0;
    const months = parseInt(term) || 360;

    let pi = 0;
    if (amt > 0 && rate > 0) {
      const mr = rate / 100 / 12;
      pi = amt * (mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1);
    }
    setPiPayment(pi > 0 ? pi.toFixed(2) : '');

    let mi = parseFloat(mortgageInsurance) || 0;
    if (miAutoCalc && amt > 0) {
      if (loanType === 'FHA')  mi = (amt * 0.0055) / 12;
      else if (loanType === 'USDA') mi = (amt * 0.0035) / 12;
      else if (loanType === 'VA')   mi = 0;
      else if (loanType === 'CONVENTIONAL' || loanType === 'HOMEREADY' || loanType === 'HOME_POSSIBLE') {
        const ltvNum = parseFloat(ltv) || 0;
        mi = ltvNum > 80 ? (amt * 0.007) / 12 : 0;
      }
      setMortgageInsurance(mi > 0 ? mi.toFixed(2) : '');
    }

    const taxes   = parseFloat(propTaxes) || 0;
    const ins     = parseFloat(homeInsurance) || 0;
    const hoa     = parseFloat(hoaDues) || 0;
    const flood   = parseFloat(floodInsurance) || 0;
    const second  = parseFloat(secondMortgage) || 0;
    const housing = pi + taxes + ins + mi + hoa + flood + second;
    setTotalHousing(housing > 0 ? housing.toFixed(2) : '');

    if (total <= 0) return;
    setDtiRatio(((debts / total) * 100).toFixed(2));
    setFrontDti(housing > 0 ? ((housing / total) * 100).toFixed(2) : '');
    setBackDti(housing > 0 ? (((housing + debts) / total) * 100).toFixed(2) : '');
  }, [
    monthlyDebts, monthlyIncome, coBorrowerIncome, coBorrowers, otherIncome,
    loanAmount, interestRate, term, loanType, ltv,
    propTaxes, homeInsurance, mortgageInsurance, miAutoCalc,
    hoaDues, floodInsurance, secondMortgage,
  ]);

  // Auto-estimate taxes + insurance from state averages
  useEffect(() => {
    if (!state || !propertyValue) return;
    const val = parseFloat(propertyValue);
    if (!val || val <= 0) return;
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
    if (craData && monthlyIncome) updateIncomeFlags(parseFloat(monthlyIncome));
  }, [monthlyIncome]);

  // Fire address lookups after MISMO import — AddressAutocomplete only fires
  // these on user selection; MISMO sets fields directly so we trigger manually
  useEffect(() => {
    if (!importedData) return;
    if (!streetAddress || !city || !state || !zipCode) return;
    const addressData = { streetAddress, city, state, zipCode };
    lookupCensusTract(addressData).then(tractData => {
      setCensusTract(tractData);
      if (tractData?.lat && tractData?.lng) {
        checkUsdaEligibility({ lat: tractData.lat, lng: tractData.lng }).then(setUsdaEligibility);
      }
    });
    runCRA(addressData, parseFloat(monthlyIncome) || null);
    setAddrValidation({ status: 'PENDING' });
    validateAddress({ address: streetAddress, city, state, zip: zipCode })
      .then(r => setAddrValidation(r))
      .catch(() => setAddrValidation({ status: 'API_ERROR' }));
  }, [importedData]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddressSelect = async (addressData) => {
    setStreetAddress(addressData.streetAddress || '');
    setCity(addressData.city || '');
    setState(addressData.state || '');
    setZipCode(addressData.zipCode || '');
    setUnit(addressData.unit || '');
    // Strip " County" suffix — Google Places returns "Gwinnett County" but we store "Gwinnett"
    setCounty((addressData.county || '').replace(/\s+County$/i, '').trim());
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
        // Reference IDs — pull LOS number from MISMO, generate LB ref if new
        if (parsed._importMeta?.loanNumber) setLosLoanNumber(parsed._importMeta.loanNumber);
        if (!loanBeaconsRef) {
          const yr  = new Date().getFullYear();
          const rnd = Math.random().toString(36).substring(2, 7).toUpperCase();
          setLoanBeaconsRef(`LB-${yr}-${rnd}`);
        }
        if (parsed.loanAmount)    setLoanAmount(parsed.loanAmount);
        if (parsed.purchasePrice || parsed.propertyValue)
          setPropertyValue(parsed.purchasePrice || parsed.propertyValue);
        if (parsed.interestRate)  setInterestRate(parsed.interestRate);
        if (parsed.term)          setTerm(parsed.term);
        if (parsed.loanPurpose)   setLoanPurpose(normalizePurpose(parsed.loanPurpose));
        if (parsed.loanType)      setLoanType(parsed.loanType);
        if (parsed.monthlyIncome) setMonthlyIncome(parsed.monthlyIncome);
        // Monthly debts — always set if liabilities were parsed, including $0
        if (parsed.liabilities.length > 0 || parsed.monthlyDebts) {
          setMonthlyDebts(parsed.monthlyDebts || '0');
        }
        if (parsed.occupancy)     setOccupancy(parsed.occupancy);
        if (parsed.propertyType)  setPropertyType(parsed.propertyType);
        if (parsed.streetAddress) setStreetAddress(parsed.streetAddress);
        if (parsed.city)          setCity(parsed.city);
        if (parsed.state)         setState(parsed.state);
        if (parsed.zipCode)       setZipCode(parsed.zipCode);
        // Housing expenses
        if (parsed.proposedTaxes)     { setPropTaxes(Math.round(parseFloat(parsed.proposedTaxes)).toString()); setTaxEstimated(false); }
        if (parsed.proposedInsurance) { setHomeInsurance(Math.round(parseFloat(parsed.proposedInsurance)).toString()); setInsEstimated(false); }
        if (parsed.proposedMIP)       { setMortgageInsurance(Math.round(parseFloat(parsed.proposedMIP)).toString()); setMiAutoCalc(false); }
        if (parsed.proposedHOA)       setHoaDues(Math.round(parseFloat(parsed.proposedHOA)).toString());
        if (parsed.proposedFlood)     setFloodInsurance(Math.round(parseFloat(parsed.proposedFlood)).toString());
        if (parsed.proposedSecond)    setSecondMortgage(Math.round(parseFloat(parsed.proposedSecond)).toString());
        if (parsed.cashToClose)       setEstimatedCashToClose(parsed.cashToClose);
        if (parsed.sellerConcessions) setSellerConcessions(parsed.sellerConcessions);
        // Down payment — from file or calculated
        if (parsed.downPayment) {
          setDownPayment(parsed.downPayment);
        } else if (parsed.purchasePrice && parsed.loanAmount) {
          const dp = parseFloat(parsed.purchasePrice) - parseFloat(parsed.loanAmount);
          if (dp > 0) setDownPayment(String(Math.round(dp)));
        }
        // GSE Investor — auto-set conventionalInvestor from AUS tracking
        if (parsed.gseInvestor === 'FANNIE') setConventionalInvestor('FANNIE');
        else if (parsed.gseInvestor === 'FREDDIE') setConventionalInvestor('FREDDIE');
        // Co-borrowers from MISMO — use full array (all co-borrowers)
        if (parsed.coBorrowers && parsed.coBorrowers.length > 0) {
          setCoBorrowers(parsed.coBorrowers.map(cb => ({
            firstName:    cb.firstName     || '',
            lastName:     cb.lastName      || '',
            citizenship:  cb.citizenship   || 'US_CITIZEN',
            monthlyIncome: cb.monthlyIncome || '',
            creditScore:  '',
            dateOfBirth:  cb.dateOfBirth   || '',
            employerName: cb.employerName  || '',
            phone:        cb.phone         || '',
            email:        cb.email         || '',
            sharesJointCreditWith: cb.sharesJointCreditWith || null,
          })));
        } else if (parsed.coBorrower) {
          setCoBorrowers([{
            firstName:    parsed.coBorrower.firstName    || '',
            lastName:     parsed.coBorrower.lastName     || '',
            citizenship:  'US_CITIZEN',
            monthlyIncome: parsed.coBorrower.monthlyIncome || '',
            creditScore: '', dateOfBirth: '', employerName: '',
            phone: '', email: '', sharesJointCreditWith: null,
          }]);
        }
        const name = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ');
        const purpMap = { PURCHASE: 'Purchase', RATE_TERM_REFI: 'Refi', CASH_OUT: 'Cash-Out', STREAMLINE: 'Streamline' };
        const purpPart = purpMap[normalizePurpose(parsed.loanPurpose)] || parsed.loanPurpose || '';
        if (name) setScenarioName((name + ' - ' + (parsed.loanType || '') + ' ' + purpPart).trim());
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
      const docSnap = await getDoc(doc(db, 'scenarios', id));
      if (docSnap.exists()) {
        const d = docSnap.data();
        setScenarioName(d.scenarioName || '');
        setFirstName(d.firstName || '');
        setLastName(d.lastName || '');
        setCitizenship(d.citizenship || 'US_CITIZEN');
        // Reference IDs
        setLoanBeaconsRef(d.loanBeaconsRef || '');
        setLosLoanNumber(d.losLoanNumber || '');
        setAusCaseNumber(d.ausCaseNumber || '');
        setCoBorrowers(d.coBorrowers || []);
        setLoanPurpose(normalizePurpose(d.loanPurpose));
        setLoanType(d.loanType || '');
        setConventionalInvestor(d.conventionalInvestor || '');
        // Dynamic fields
        setAsIsValue(d.asIsValue || '');
        setRehabBudget(d.rehabBudget || '');
        setArvValue(d.arvValue || '');
        setHoldPeriod(d.holdPeriod || '');
        setExitStrategy(d.exitStrategy || '');
        setMonthlyRent(d.monthlyRent || '');
        setAnnualNOI(d.annualNOI || '');
        setBankStmtPeriod(d.bankStmtPeriod || '24');
        setAvgMonthlyDeposits(d.avgMonthlyDeposits || '');
        setExpenseRatio(d.expenseRatio || '50');
        setTotalQualifyingAssets(d.totalQualifyingAssets || '');
        setDepletionPeriod(d.depletionPeriod || '360');
        setVaEntitlement(d.vaEntitlement || 'FULL');
        setVaFundingFeeExempt(d.vaFundingFeeExempt || false);
        setHouseholdSize(d.householdSize || '');
        setAnnualHouseholdIncome(d.annualHouseholdIncome || '');
        setLotValue(d.lotValue || '');
        setLandAcquisitionCost(d.landAcquisitionCost || '');
        setConstructionBudget(d.constructionBudget || '');
        setDrawScheduleType(d.drawScheduleType || '');
        // Loan details
        setLoanAmount(d.loanAmount || '');
        setPropertyValue(d.propertyValue || '');
        setLtv(d.ltv || '');
        setInterestRate(d.interestRate || '');
        setTerm(d.term || '360');
        // Property
        setStreetAddress(d.streetAddress || '');
        setCity(d.city || '');
        setState(d.state || '');
        setZipCode(d.zipCode || '');
        setUnit(d.unit || '');
        setCounty((d.county || '').replace(/\s+County$/i, '').trim());
        setCensusTract(d.censusTract || null);
        setPropertyType(d.propertyType || 'Single Family');
        setOccupancy(d.occupancy || 'Primary Residence');
        // PITI
        setPropTaxes(d.propTaxes || '');
        setHomeInsurance(d.homeInsurance || '');
        setMortgageInsurance(d.mortgageInsurance || '');
        setMiAutoCalc(d.miAutoCalc !== false);
        setTaxEstimated(d.taxEstimated || false);
        setInsEstimated(d.insEstimated || false);
        setHoaDues(d.hoaDues || '');
        setFloodInsurance(d.floodInsurance || '');
        setSecondMortgage(d.secondMortgage || '');
        // Qualifying
        setMonthlyIncome(d.monthlyIncome || '');
        setCoBorrowerIncome(d.coBorrowerIncome || '');
        setOtherIncome(d.otherIncome || '');
        setDownPayment(d.downPayment || '');
        setSellerConcessions(d.sellerConcessions || '');
        setPostCloseReserves(d.postCloseReserves || '');
        setEstimatedCashToClose(d.estimatedCashToClose || '');
        setFrontDti(d.frontDti || '');
        setBackDti(d.backDti || '');
        // Financials
        setCreditScore(d.creditScore || '');
        setMonthlyDebts(d.monthlyDebts || '');
        setDtiRatio(d.dtiRatio || '');
      }
    } catch (err) {
      console.error('Error loading scenario:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const derivedCoBorrowerIncome = coBorrowers.length > 0
      ? coBorrowers.reduce((sum, cb) => sum + (parseFloat(cb.monthlyIncome) || 0), 0)
      : parseFloat(coBorrowerIncome) || 0;

    const yr  = new Date().getFullYear();
    const rnd = Math.random().toString(36).substring(2, 7).toUpperCase();
    const finalLBRef = loanBeaconsRef || `LB-${yr}-${rnd}`;

    // ── Borrower name guard ──────────────────────────────────────────────────
    // Prevent saving if first/last name fields are blank — the most common
    // cause of wrong borrower name appearing in downstream modules
    if (!firstName.trim() || !lastName.trim()) {
      alert('Please enter the borrower\'s first and last name before saving.');
      setLoading(false);
      return;
    }

    // Auto-correct scenario name — if it was left blank or only contains
    // the LO's name (common mistake), rebuild it from borrower + address
    const borrowerFullName = `${firstName.trim()} ${lastName.trim()}`;
    const purposeLabel = { PURCHASE: 'Purchase', RATE_TERM_REFI: 'Refi', CASH_OUT: 'Cash-Out', STREAMLINE: 'Streamline', FIX_FLIP: 'Fix & Flip', CONSTRUCTION: 'Construction', BRIDGE: 'Bridge', INVESTMENT_PURCHASE: 'Investment', COMMERCIAL: 'Commercial', OTHER: '' }[loanPurpose] || '';
    const autoName = `${borrowerFullName}${loanType ? ' - ' + loanType : ''}${purposeLabel ? ' ' + purposeLabel : ''}${streetAddress ? ' - ' + streetAddress : ''}`.trim();
    const finalScenarioName = scenarioName.trim() || autoName;

    const scenarioData = {
      scenarioName: finalScenarioName,
      // Reference IDs
      loanBeaconsRef: finalLBRef,
      losLoanNumber:  losLoanNumber || '',
      ausCaseNumber:  ausCaseNumber || '',
      // Borrowers
      firstName, lastName, citizenship,
      coBorrowers: coBorrowers.map(cb => ({
        firstName: cb.firstName || '',
        lastName: cb.lastName || '',
        citizenship: cb.citizenship || 'US_CITIZEN',
        monthlyIncome: parseFloat(cb.monthlyIncome) || 0,
        creditScore: parseInt(cb.creditScore) || null,
      })),
      // Loan purpose & type
      loanPurpose, loanType, conventionalInvestor,
      // Dynamic fields
      asIsValue: parseFloat(asIsValue) || 0,
      rehabBudget: parseFloat(rehabBudget) || 0,
      arvValue: parseFloat(arvValue) || 0,
      holdPeriod: holdPeriod || '',
      exitStrategy: exitStrategy || '',
      ltcRatio: parseFloat(ltcRatio) || 0,
      monthlyRent: parseFloat(monthlyRent) || 0,
      annualNOI: parseFloat(annualNOI) || 0,
      dscrRatio: parseFloat(dscrRatio) || 0,
      bankStmtPeriod: bankStmtPeriod || '24',
      avgMonthlyDeposits: parseFloat(avgMonthlyDeposits) || 0,
      expenseRatio: parseFloat(expenseRatio) || 0,
      totalQualifyingAssets: parseFloat(totalQualifyingAssets) || 0,
      depletionPeriod: parseInt(depletionPeriod) || 360,
      vaEntitlement, vaFundingFeeExempt,
      householdSize: parseInt(householdSize) || 0,
      annualHouseholdIncome: parseFloat(annualHouseholdIncome) || 0,
      lotValue: parseFloat(lotValue) || 0,
      landAcquisitionCost: parseFloat(landAcquisitionCost) || 0,
      constructionBudget: parseFloat(constructionBudget) || 0,
      drawScheduleType: drawScheduleType || '',
      // Loan details
      loanAmount: parseFloat(loanAmount),
      propertyValue: parseFloat(propertyValue),
      ltv: parseFloat(ltv),
      interestRate: parseFloat(interestRate),
      term: parseInt(term),
      // Property
      streetAddress, city, state, zipCode, county, unit, censusTract,
      addressVerified: true,
      propertyType, occupancy,
      // PITI
      piPayment: parseFloat(piPayment) || 0,
      propTaxes: parseFloat(propTaxes) || 0,
      homeInsurance: parseFloat(homeInsurance) || 0,
      mortgageInsurance: parseFloat(mortgageInsurance) || 0,
      miAutoCalc, taxEstimated, insEstimated,
      hoaDues: parseFloat(hoaDues) || 0,
      floodInsurance: parseFloat(floodInsurance) || 0,
      secondMortgage: parseFloat(secondMortgage) || 0,
      totalHousing: parseFloat(totalHousing) || 0,
      frontDti: parseFloat(frontDti) || 0,
      backDti: parseFloat(backDti) || 0,
      // Qualifying
      monthlyIncome: parseFloat(monthlyIncome),
      coBorrowerIncome: derivedCoBorrowerIncome,
      otherIncome: parseFloat(otherIncome) || 0,
      totalIncome: parseFloat(totalIncome) || 0,
      downPayment: parseFloat(downPayment) || 0,
      sellerConcessions: parseFloat(sellerConcessions) || 0,
      postCloseReserves: parseFloat(postCloseReserves) || 0,
      estimatedCashToClose: parseFloat(estimatedCashToClose) || 0,
      // Financials
      creditScore: parseInt(creditScore),
      monthlyDebts: parseFloat(monthlyDebts),
      dtiRatio: parseFloat(dtiRatio),
      status: 'active',
      updated_at: new Date(),
    };

    try {
      if (isEditMode) {
        await updateDoc(doc(db, 'scenarios', id), scenarioData);
        setIsDirty(false);
        alert('Scenario updated successfully!');
      } else {
        scenarioData.created_at = new Date();
        await addDoc(collection(db, 'scenarios'), scenarioData);
        setIsDirty(false);
        alert('Scenario created successfully!');
      }
      navigate('/scenarios');
    } catch (err) {
      console.error('Error saving scenario:', err);
      alert('Error saving scenario');
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers for dynamic field visibility ────────────────────────────────────
  const isRenovation     = ['FHA_203K', 'HOMESTYLE'].includes(loanType);
  const isHardMoney      = ['HARD_MONEY', 'PRIVATE_MONEY', 'FIX_FLIP_CONV', 'BRIDGE_LOAN'].includes(loanType);
  const isConstruction   = ['CONSTRUCTION_TO_PERM', 'CONSTRUCTION_ONLY', 'PRIVATE_MONEY_CONSTRUCTION'].includes(loanType);
  const isDSCR           = ['DSCR', 'COMMERCIAL_1_4', 'CONVENTIONAL_INVESTMENT'].includes(loanType);
  const isBankStmt       = ['BANK_STMT_PERSONAL', 'BANK_STMT_BUSINESS'].includes(loanType);
  const isAssetDepletion = loanType === 'ASSET_DEPLETION';
  const isVA             = loanType === 'VA';
  const isUSDA           = loanType === 'USDA';
  const hasDynamicFields = isRenovation || isHardMoney || isConstruction || isDSCR || isBankStmt || isAssetDepletion || isVA || isUSDA;

  const purposeLabels = {
    PURCHASE: 'Purchase', RATE_TERM_REFI: 'Rate/Term Refi', CASH_OUT: 'Cash-Out Refi',
    STREAMLINE: 'Streamline', FIX_FLIP: 'Fix & Flip', CONSTRUCTION: 'Construction',
    BRIDGE: 'Bridge', INVESTMENT_PURCHASE: 'Investment Purchase', COMMERCIAL: 'Commercial', OTHER: 'Other',
  };

  // ── Qualifying Credit Score (lowest middle score across all borrowers) ───────
  const allCreditScores = [
    creditScore ? parseInt(creditScore) : null,
    ...coBorrowers.map(cb => cb.creditScore ? parseInt(cb.creditScore) : null),
  ].filter(s => s && s > 300 && s <= 850);
  const qualifyingCreditScore = allCreditScores.length > 0 ? Math.min(...allCreditScores) : null;
  const qualifyingScoreBorrower = (() => {
    if (!qualifyingCreditScore) return null;
    if (creditScore && parseInt(creditScore) === qualifyingCreditScore) return firstName || 'Primary Borrower';
    const idx = coBorrowers.findIndex(cb => cb.creditScore && parseInt(cb.creditScore) === qualifyingCreditScore);
    return idx >= 0 ? (coBorrowers[idx].firstName || `Co-Borrower ${idx + 1}`) : null;
  })();

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">

        {/* Page Header */}
        <div className="mb-8">
          <button
            onClick={() => { if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return; navigate('/'); }}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2 text-sm"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Scenario' : 'Create New Scenario'}
          </h1>
          <p className="text-gray-500 mt-2 text-sm leading-relaxed">
            The scenario is the foundation of your entire analysis. Every module in LoanBeacons — from income qualification to lender matching — reads from this record.
            {' '}<span className="text-gray-400">Accurate inputs produce accurate results.</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── 1. MISMO Import ── */}
          <input ref={mismoFileRef} type="file" accept=".xml" onChange={handleMismoImport} className="hidden" />
          {!importedData && !importError && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-700 mb-2 font-semibold">⚡ Have a file from your LOS?</p>
              <p className="text-xs text-blue-600 mb-3">Upload a MISMO 3.4 XML file to auto-populate borrower, loan, property, income, and liability fields. You can edit any field after import.</p>
              <button type="button" onClick={() => mismoFileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-blue-400 bg-white text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import from LOS (MISMO XML) — auto-fill all fields
              </button>
            </div>
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
                    <p className="text-xs text-amber-600 mt-1.5 font-medium">⚠ $0/mo accounts may be deferred (IBR student loans). Apply 0.5–1% rule for FHA qualifying.</p>
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

          {/* ── 2. Scenario Name ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Scenario Name</h2>
            <p className="text-xs text-gray-400 mb-3">Give this scenario a clear name so you can find it later. Auto-generated from borrower + address if left blank.</p>
            <input type="text" value={scenarioName}
              onChange={(e) => { setScenarioName(e.target.value); markDirty(); }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="e.g., Smith Purchase – 123 Main St" />
            {/* Mismatch warning — fires when scenario name doesn't contain borrower's name */}
            {scenarioName && firstName && lastName &&
              !scenarioName.toLowerCase().includes(firstName.toLowerCase()) &&
              !scenarioName.toLowerCase().includes(lastName.toLowerCase()) && (
              <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="text-red-500 text-sm shrink-0">⚠</span>
                <div>
                  <p className="text-xs font-bold text-red-700">Borrower name mismatch</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    The scenario name doesn't appear to contain the borrower's name (<strong>{firstName} {lastName}</strong>).
                    Make sure the scenario name reflects the borrower — not the LO or another person.
                  </p>
                  <button type="button"
                    onClick={() => {
                      const purposeLabel = { PURCHASE: 'Purchase', RATE_TERM_REFI: 'Refi', CASH_OUT: 'Cash-Out', STREAMLINE: 'Streamline', FIX_FLIP: 'Fix & Flip', CONSTRUCTION: 'Construction', BRIDGE: 'Bridge', INVESTMENT_PURCHASE: 'Investment', COMMERCIAL: 'Commercial' }[loanPurpose] || '';
                      setScenarioName(`${firstName} ${lastName}${loanType ? ' - ' + loanType : ''}${purposeLabel ? ' ' + purposeLabel : ''}${streetAddress ? ' - ' + streetAddress : ''}`.trim());
                      markDirty();
                    }}
                    className="mt-1.5 text-xs font-semibold text-red-700 hover:text-red-900 underline">
                    Auto-fix: use borrower name
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── 2b. Reference IDs ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>🔖</span> File Reference IDs
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              These IDs link this LoanBeacons scenario to your LOS file and AUS findings report. They are stored in the Decision Record and make it easy to locate this file post-closing during QC audits, repurchase requests, or regulatory exams.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  LoanBeacons Ref <span className="text-blue-500">(auto)</span>
                </label>
                <input type="text" value={loanBeaconsRef}
                  readOnly
                  placeholder="Generated on save"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-blue-50 text-blue-700 font-mono font-semibold" />
                <p className="text-xs text-gray-400 mt-1">Your stable LoanBeacons file number — never changes</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  LOS Loan Number
                  {losLoanNumber && <span className="ml-2 text-xs bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full font-semibold">From MISMO</span>}
                </label>
                <input type="text" value={losLoanNumber}
                  onChange={(e) => { setLosLoanNumber(e.target.value); markDirty(); }}
                  placeholder="e.g. 2026-00123"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                <p className="text-xs text-gray-400 mt-1">From your LOS — auto-populated from MISMO import</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">AUS Case Number</label>
                <input type="text" value={ausCaseNumber}
                  onChange={(e) => { setAusCaseNumber(e.target.value); markDirty(); }}
                  placeholder="DU Case # or LP Key #"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                <p className="text-xs text-gray-400 mt-1">From DU findings or LP feedback — enter after AUS run</p>
              </div>
            </div>
            {(loanBeaconsRef || losLoanNumber || ausCaseNumber) && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Search Keys:</span>
                {loanBeaconsRef && <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded">LB: {loanBeaconsRef}</span>}
                {losLoanNumber  && <span className="text-xs font-mono font-semibold text-gray-700 bg-white border border-gray-300 px-2 py-1 rounded">LOS: {losLoanNumber}</span>}
                {ausCaseNumber  && <span className="text-xs font-mono font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded">AUS: {ausCaseNumber}</span>}
              </div>
            )}
          </div>

          {/* ── 3. Primary Borrower ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>👤</span> Primary Borrower
            </h2>
            <p className="text-xs text-gray-400 mb-4">The borrower whose credit, income, and liabilities drive qualification. Citizenship status affects eligible loan programs.</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input type="text" value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input type="text" value={lastName}
                  onChange={(e) => { setLastName(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Citizenship Status</label>
              <select value={citizenship} onChange={(e) => { setCitizenship(e.target.value); markDirty(); }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="US_CITIZEN">U.S. Citizen</option>
                <option value="PERMANENT_RESIDENT">Permanent Resident (Green Card)</option>
                <option value="NON_PERMANENT_RESIDENT">Non-Permanent Resident</option>
                <option value="FOREIGN_NATIONAL">Foreign National</option>
                <option value="ITIN">ITIN Borrower</option>
              </select>
              {(citizenship === 'FOREIGN_NATIONAL' || citizenship === 'ITIN') && (
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  ⚠ {citizenship === 'FOREIGN_NATIONAL' ? 'Foreign National programs available under Non-QM. Government loan types are not available.' : 'ITIN programs available under Non-QM.'}
                </p>
              )}
            </div>
          </div>

          {/* ── 4. Co-Borrowers ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>👥</span> Co-Borrowers
                {coBorrowers.length > 0 && (
                  <span className="ml-2 text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{coBorrowers.length} added</span>
                )}
              </h2>
              {coBorrowers.length < 3 && (
                <button type="button" onClick={addCoBorrower}
                  className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all">
                  + Add Co-Borrower
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Adding a co-borrower combines their income with the primary borrower's for qualification purposes. Co-borrower income is automatically included in DTI calculations. Up to 3 co-borrowers.
            </p>
            {coBorrowers.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-sm text-gray-400">No co-borrowers added.</p>
                <button type="button" onClick={addCoBorrower}
                  className="mt-2 text-sm font-semibold text-blue-600 hover:underline">+ Add Co-Borrower</button>
              </div>
            ) : (
              <div className="space-y-4">
                {coBorrowers.map((cb, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-700">Co-Borrower {i + 1}</span>
                      <button type="button" onClick={() => removeCoBorrower(i)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                        <input type="text" value={cb.firstName}
                          onChange={(e) => updateCoBorrower(i, 'firstName', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                        <input type="text" value={cb.lastName}
                          onChange={(e) => updateCoBorrower(i, 'lastName', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Citizenship</label>
                        <select value={cb.citizenship}
                          onChange={(e) => updateCoBorrower(i, 'citizenship', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                          <option value="US_CITIZEN">U.S. Citizen</option>
                          <option value="PERMANENT_RESIDENT">Permanent Resident</option>
                          <option value="NON_PERMANENT_RESIDENT">Non-Permanent Resident</option>
                          <option value="FOREIGN_NATIONAL">Foreign National</option>
                          <option value="ITIN">ITIN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Gross Income</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                          <input type="number" value={cb.monthlyIncome}
                            onChange={(e) => updateCoBorrower(i, 'monthlyIncome', e.target.value)}
                            placeholder="0"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Credit Score (FICO)</label>
                        <input type="number" value={cb.creditScore}
                          onChange={(e) => updateCoBorrower(i, 'creditScore', e.target.value)}
                          placeholder="e.g. 720"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    {cb.monthlyIncome && parseFloat(cb.monthlyIncome) > 0 && (
                      <p className="text-xs text-green-600 mt-2 font-medium">
                        ✓ ${parseFloat(cb.monthlyIncome).toLocaleString()}/mo will be added to qualifying income
                      </p>
                    )}
                  </div>
                ))}
                {coBorrowers.length < 3 && (
                  <button type="button" onClick={addCoBorrower}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all">
                    + Add Another Co-Borrower ({coBorrowers.length}/3)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── 5. Loan Purpose ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>🎯</span> Loan Purpose
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              What is the borrower trying to accomplish? Your selection here filters the available loan types and determines which additional fields you'll need to complete.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { value: 'PURCHASE', label: 'Purchase', icon: '🏠', desc: 'Buying a new property' },
                { value: 'RATE_TERM_REFI', label: 'Rate/Term Refi', icon: '🔄', desc: 'Better rate or term' },
                { value: 'CASH_OUT', label: 'Cash-Out Refi', icon: '💵', desc: 'Access home equity' },
                { value: 'STREAMLINE', label: 'Streamline Refi', icon: '⚡', desc: 'FHA / VA / USDA' },
                { value: 'FIX_FLIP', label: 'Fix & Flip', icon: '🔨', desc: 'Renovate and sell' },
                { value: 'CONSTRUCTION', label: 'Construction', icon: '🏗️', desc: 'Ground-up build' },
                { value: 'BRIDGE', label: 'Bridge / Short-Term', icon: '🌉', desc: 'Transitional financing' },
                { value: 'INVESTMENT_PURCHASE', label: 'Investment Purchase', icon: '📈', desc: 'Buy & hold rental' },
                { value: 'COMMERCIAL', label: 'Commercial (1–4)', icon: '🏢', desc: '1–4 unit commercial' },
                { value: 'OTHER', label: 'Other', icon: '📋', desc: 'All loan types shown' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => { setLoanPurpose(opt.value); setLoanType(''); setConventionalInvestor(''); markDirty(); }}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    loanPurpose === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <span className="text-lg flex-shrink-0 mt-0.5">{opt.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${loanPurpose === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── 6. Loan Type ── */}
          {loanPurpose && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                <span>🏦</span> Loan Type
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Select the loan program you're targeting. Not sure? Pick your best guess — you can always run AUS Rescue later to explore alternatives and find the best program fit.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loan Type <span className="text-gray-400 font-normal">({purposeLabels[loanPurpose]})</span>
                </label>
                <select value={loanType}
                  onChange={(e) => { setLoanType(e.target.value); setConventionalInvestor(''); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Select Loan Type</option>
                  {(LOAN_TYPES_BY_PURPOSE[loanPurpose] || LOAN_TYPES_BY_PURPOSE.OTHER).map(group => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {/* Conventional Investor sub-select */}
              {loanType === 'CONVENTIONAL' && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GSE Investor <span className="text-gray-400 text-xs font-normal">(optional — auto-detected from MISMO when available)</span>
                  </label>
                  <select value={conventionalInvestor}
                    onChange={(e) => { setConventionalInvestor(e.target.value); markDirty(); }}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm">
                    <option value="">Not specified — I'll determine later</option>
                    <option value="FANNIE">Fannie Mae (DU — Desktop Underwriter)</option>
                    <option value="FREDDIE">Freddie Mac (LP — Loan Product Advisor)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Fannie and Freddie have different overlays on DTI, reserves, and property types. Knowing the investor helps Lender Match identify the right lenders. If you're not sure, leave blank — you can always specify when you run AUS.
                  </p>
                </div>
              )}
              {/* FHA Streamline detection */}
              {loanType === 'FHA' && loanPurpose === 'STREAMLINE' && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-blue-800 text-sm">FHA Streamline Detected</div>
                    <div className="text-xs text-blue-600 mt-0.5">Use FHA Streamline Intelligence for full eligibility analysis</div>
                  </div>
                  <a href="/fha-streamline" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg">Open Module</a>
                </div>
              )}
              {/* VA IRRRL detection */}
              {loanType === 'VA' && loanPurpose === 'STREAMLINE' && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-red-800 text-sm">VA IRRRL Detected</div>
                    <div className="text-xs text-red-600 mt-0.5">Use VA IRRRL Intelligence for seasoning, NTB & recoupment analysis</div>
                  </div>
                  <span className="bg-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg">Coming Soon</span>
                </div>
              )}
              {/* Non-QM guidance for new LOs */}
              {(isBankStmt || isAssetDepletion || loanType === 'NON_QM_1099' || loanType === 'NON_QM_PNL') && (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <p className="text-xs text-purple-700 font-semibold">📌 Non-QM Loan Selected</p>
                  <p className="text-xs text-purple-600 mt-0.5">Non-QM loans are not run through AUS (DU/LP). Qualification is based on lender overlays. Lender Match will identify the best Non-QM lenders for this scenario.</p>
                </div>
              )}
              {(isHardMoney || loanType === 'BRIDGE_LOAN') && (
                <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-xs text-orange-700 font-semibold">🔨 Asset-Based Lending Selected</p>
                  <p className="text-xs text-orange-600 mt-0.5">Hard money and private money loans qualify based on the asset (property) rather than borrower income and credit. LTV, ARV, and exit strategy are the primary underwriting factors.</p>
                </div>
              )}
            </div>
          )}

          {/* ── 7. Loan-Type-Specific Fields ── */}
          {hasDynamicFields && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                <span>⚡</span> {loanType} — Additional Details
              </h2>
              <p className="text-xs text-gray-400 mb-5">These fields are specific to the selected loan type and feed directly into Lender Match and AUS Rescue.</p>

              {/* Renovation: FHA 203k / HomeStyle */}
              {isRenovation && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Renovation Details</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    {loanType === 'FHA_203K'
                      ? 'FHA 203k loans finance both the purchase and rehabilitation costs into one loan. The ARV determines your maximum loan amount.'
                      : 'HomeStyle Renovation allows purchase + renovation on conventional terms. Lender holds renovation funds in escrow and releases them as work is completed.'}
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">As-Is Property Value <span className="text-gray-400 font-normal">(current)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={asIsValue} onChange={(e) => { setAsIsValue(e.target.value); markDirty(); }}
                          placeholder="e.g. 180000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Renovation Budget</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={rehabBudget} onChange={(e) => { setRehabBudget(e.target.value); markDirty(); }}
                          placeholder="e.g. 45000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">After Renovation Value (ARV)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={arvValue} onChange={(e) => { setArvValue(e.target.value); markDirty(); }}
                          placeholder="e.g. 250000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Max loan amount based on ARV × program LTV</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Hard Money / Fix & Flip / Bridge */}
              {isHardMoney && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Asset & Deal Details</h3>
                  <p className="text-xs text-gray-400 mb-3">Hard money and private money lenders underwrite based on the property value and exit strategy — not income. ARV and LTC are the primary qualification factors.</p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">As-Is Value <span className="text-gray-400 font-normal">(current)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={asIsValue} onChange={(e) => { setAsIsValue(e.target.value); markDirty(); }}
                          placeholder="e.g. 120000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Rehab Budget</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={rehabBudget} onChange={(e) => { setRehabBudget(e.target.value); markDirty(); }}
                          placeholder="e.g. 35000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">After Repair Value (ARV)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={arvValue} onChange={(e) => { setArvValue(e.target.value); markDirty(); }}
                          placeholder="e.g. 210000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">LTC <span className="text-blue-500">(auto)</span></label>
                      <input type="text" value={ltcRatio ? ltcRatio + '%' : '—'} readOnly
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-blue-50 text-blue-700 font-semibold text-sm" />
                      <p className="text-xs text-gray-400 mt-1">Loan ÷ (As-Is + Rehab)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Estimated Hold Period</label>
                      <select value={holdPeriod} onChange={(e) => { setHoldPeriod(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">Select</option>
                        <option value="3">3 months</option>
                        <option value="6">6 months</option>
                        <option value="9">9 months</option>
                        <option value="12">12 months</option>
                        <option value="18">18+ months</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Exit Strategy</label>
                      <select value={exitStrategy} onChange={(e) => { setExitStrategy(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">Select</option>
                        <option value="SELL">Sell (flip)</option>
                        <option value="REFI_CONVENTIONAL">Refinance to Conventional</option>
                        <option value="REFI_DSCR">Refinance to DSCR</option>
                        <option value="RENT">Rent & Hold</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Construction */}
              {isConstruction && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Construction Details</h3>
                  <p className="text-xs text-gray-400 mb-3">Construction loans are disbursed in draws as milestones are completed. The lender will require a detailed construction budget and timeline before approval.</p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Lot / Land Value</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={lotValue} onChange={(e) => { setLotValue(e.target.value); markDirty(); }}
                          placeholder="e.g. 75000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Land Acquisition Cost</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={landAcquisitionCost} onChange={(e) => { setLandAcquisitionCost(e.target.value); markDirty(); }}
                          placeholder="If different from lot value" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Total Construction Budget</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={constructionBudget} onChange={(e) => { setConstructionBudget(e.target.value); markDirty(); }}
                          placeholder="e.g. 280000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Draw Schedule Type</label>
                      <select value={drawScheduleType} onChange={(e) => { setDrawScheduleType(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">Select</option>
                        <option value="MILESTONE">Milestone-Based</option>
                        <option value="PERCENTAGE">Percentage of Completion</option>
                        <option value="MONTHLY">Monthly Draws</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* DSCR */}
              {isDSCR && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">DSCR / Rental Income Details</h3>
                  <p className="text-xs text-gray-400 mb-3">DSCR loans qualify based on the property's rental income — not the borrower's personal income. A DSCR of 1.0 means rent exactly covers the mortgage payment. Most lenders require 1.1–1.25+.</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Monthly Gross Rent</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={monthlyRent} onChange={(e) => { setMonthlyRent(e.target.value); markDirty(); }}
                          placeholder="e.g. 2400" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Annual NOI <span className="text-gray-400 font-normal">(optional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={annualNOI} onChange={(e) => { setAnnualNOI(e.target.value); markDirty(); }}
                          placeholder="Net operating income" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">DSCR Ratio <span className="text-blue-500">(auto)</span></label>
                      <input type="text" value={dscrRatio || '—'} readOnly
                        className={`w-full px-4 py-2 border rounded-lg font-bold text-sm ${
                          dscrRatio
                            ? parseFloat(dscrRatio) >= 1.25 ? 'bg-green-50 border-green-300 text-green-700'
                              : parseFloat(dscrRatio) >= 1.0 ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                              : 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-gray-50 border-gray-200 text-gray-400'
                        }`} />
                      {dscrRatio && (
                        <p className="text-xs mt-1 font-medium">
                          {parseFloat(dscrRatio) >= 1.25 ? '✅ Strong — most lenders qualify' :
                           parseFloat(dscrRatio) >= 1.0 ? '⚠ Marginal — limited lender options' :
                           '❌ Below 1.0 — may not qualify'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Bank Statement */}
              {isBankStmt && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Bank Statement Income Details</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Bank statement loans qualify self-employed borrowers using average monthly deposits instead of tax returns.
                    {loanType === 'BANK_STMT_BUSINESS' ? ' Business bank statements use an expense ratio to calculate qualifying income.' : ' Personal bank statements typically use 100% of deposits as income.'}
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Statement Period</label>
                      <select value={bankStmtPeriod} onChange={(e) => { setBankStmtPeriod(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="12">12 Months</option>
                        <option value="24">24 Months</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Avg Monthly Deposits</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={avgMonthlyDeposits} onChange={(e) => { setAvgMonthlyDeposits(e.target.value); markDirty(); }}
                          placeholder="e.g. 18500" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    {loanType === 'BANK_STMT_BUSINESS' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Expense Ratio (%)</label>
                        <input type="number" value={expenseRatio} onChange={(e) => { setExpenseRatio(e.target.value); markDirty(); }}
                          placeholder="e.g. 50" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
                        {avgMonthlyDeposits && expenseRatio && (
                          <p className="text-xs text-green-600 mt-1 font-medium">
                            Qualifying income: ${(parseFloat(avgMonthlyDeposits) * (1 - parseFloat(expenseRatio) / 100)).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
                          </p>
                        )}
                      </div>
                    )}
                    {loanType === 'BANK_STMT_PERSONAL' && avgMonthlyDeposits && (
                      <div className="flex items-end pb-2">
                        <div>
                          <p className="text-xs text-gray-500 font-semibold">Qualifying Income</p>
                          <p className="text-lg font-bold text-green-700">${parseFloat(avgMonthlyDeposits).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo</p>
                          <p className="text-xs text-gray-400">100% of personal deposits</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Asset Depletion */}
              {isAssetDepletion && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Asset Depletion Details</h3>
                  <p className="text-xs text-gray-400 mb-3">Asset depletion divides eligible liquid assets by the loan term in months to create a qualifying monthly income. Ideal for high-net-worth borrowers with minimal documented income (retirees, investors).</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Total Qualifying Assets</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={totalQualifyingAssets} onChange={(e) => { setTotalQualifyingAssets(e.target.value); markDirty(); }}
                          placeholder="e.g. 1200000" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Checking, savings, investment accounts (after 30% haircut on non-liquid)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Depletion Period (months)</label>
                      <select value={depletionPeriod} onChange={(e) => { setDepletionPeriod(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="360">360 months (30 yr)</option>
                        <option value="240">240 months (20 yr)</option>
                        <option value="180">180 months (15 yr)</option>
                        <option value="120">120 months (10 yr)</option>
                      </select>
                    </div>
                    {totalQualifyingAssets && depletionPeriod && (
                      <div className="flex items-end pb-2">
                        <div>
                          <p className="text-xs text-gray-500 font-semibold">Qualifying Income</p>
                          <p className="text-lg font-bold text-green-700">
                            ${(parseFloat(totalQualifyingAssets) / parseInt(depletionPeriod)).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
                          </p>
                          <p className="text-xs text-gray-400">Assets ÷ {depletionPeriod} months</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VA */}
              {isVA && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">VA Loan Details</h3>
                  <p className="text-xs text-gray-400 mb-3">VA loans require a Certificate of Eligibility (COE). Entitlement status determines whether a funding fee applies. Surviving spouses and service-connected disabled veterans may be exempt from the funding fee.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Entitlement Status</label>
                      <select value={vaEntitlement} onChange={(e) => { setVaEntitlement(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="FULL">Full Entitlement</option>
                        <option value="PARTIAL">Partial Entitlement (prior VA loan outstanding)</option>
                        <option value="RESTORED">Restored Entitlement</option>
                        <option value="NONE">No Entitlement / Ineligible</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3 pt-5">
                      <input type="checkbox" id="vaExempt" checked={vaFundingFeeExempt}
                        onChange={(e) => { setVaFundingFeeExempt(e.target.checked); markDirty(); }}
                        className="w-4 h-4 rounded text-blue-600" />
                      <label htmlFor="vaExempt" className="text-sm font-medium text-gray-700 cursor-pointer">
                        Funding Fee Exempt
                        <span className="block text-xs text-gray-400 font-normal">Disabled veterans, surviving spouses</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* USDA */}
              {isUSDA && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">USDA Loan Details</h3>
                  <p className="text-xs text-gray-400 mb-3">USDA loans have two eligibility requirements: (1) the property must be in an eligible rural area, and (2) the household's total income must be at or below the area income limit. Property eligibility is auto-checked when you enter the address below.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Household Size</label>
                      <select value={householdSize} onChange={(e) => { setHouseholdSize(e.target.value); markDirty(); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">Select</option>
                        {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Annual Household Income</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input type="number" value={annualHouseholdIncome} onChange={(e) => { setAnnualHouseholdIncome(e.target.value); markDirty(); }}
                          placeholder="All household members' gross income" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Includes all adult household members, not just borrowers on the loan</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 8. Loan Details ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>💲</span> Loan Details
            </h2>
            <p className="text-xs text-gray-400 mb-4">Core loan numbers. LTV is auto-calculated. Interest rate and term drive the P&I calculation in the PITI section below.</p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input type="number" value={loanAmount}
                    onChange={(e) => { setLoanAmount(e.target.value); markDirty(); }}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {['FIX_FLIP', 'BRIDGE', 'INVESTMENT_PURCHASE'].includes(loanPurpose) ? 'Purchase Price' : 'Property Value / Purchase Price'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input type="number" value={propertyValue}
                    onChange={(e) => { setPropertyValue(e.target.value); markDirty(); }}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LTV <span className="text-blue-500 text-xs">(auto)</span></label>
                <input type="text" value={ltv ? ltv + '%' : ''} readOnly
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-blue-50 text-blue-700 font-semibold text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (%)</label>
                <input type="number" step="0.001" value={interestRate}
                  onChange={(e) => { setInterestRate(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g. 6.500" required />
                <p className="text-xs text-gray-400 mt-1">Baseline rate for this scenario — drives P&I and DTI calculations</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Term</label>
                <select value={term} onChange={(e) => { setTerm(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" required>
                  <option value="360">30 Years (360 months)</option>
                  <option value="300">25 Years (300 months)</option>
                  <option value="240">20 Years (240 months)</option>
                  <option value="180">15 Years (180 months)</option>
                  <option value="120">10 Years (120 months)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── 9. Property Information ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>🏠</span> Property Information
            </h2>
            <p className="text-xs text-gray-400 mb-4">Property address drives USDA rural eligibility, CRA census tract analysis, and state tax/insurance estimates. Property type and occupancy affect program eligibility and LTV limits.</p>

            {/* MISMO imported address display */}
            {importedData && streetAddress && (
              <div className="mb-3 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 text-sm">📍</span>
                  <span className="text-sm font-semibold text-green-800">
                    {streetAddress}{unit ? `, ${unit}` : ''}, {city}, {state} {zipCode}
                  </span>
                  <span className="text-xs bg-green-200 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">From MISMO</span>
                </div>
                <button type="button"
                  onClick={() => { setStreetAddress(''); setCity(''); setState(''); setZipCode(''); setUnit(''); setCounty(''); setAddrValidation(null); setUsdaEligibility(null); markDirty(); }}
                  className="text-xs text-gray-400 hover:text-red-500 font-medium">Change</button>
              </div>
            )}

            <AddressAutocomplete
              key={importedData ? 'mismo-loaded' : 'manual'}
              value={{ streetAddress, city, state, zipCode, unit }}
              onAddressSelect={(addr) => {
                handleAddressSelect(addr);
                if (addr?.streetAddress) {
                  setAddrValidation({ status: 'PENDING' });
                  validateAddress({
                    address: addr.streetAddress,
                    city: addr.city || '',
                    state: addr.state || '',
                    zip: addr.zipCode || '',
                  })
                    .then(r => setAddrValidation(r))
                    .catch(() => setAddrValidation({ status: 'API_ERROR' }));
                }
              }}
            />

            {/* County — auto-populated from Google Places */}
            {(city || county) && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">City</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">{city || '—'}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">State</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">{state || '—'}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    County
                    {county && <span className="ml-1 text-[10px] text-emerald-600 font-normal">auto-filled</span>}
                  </label>
                  <input
                    type="text"
                    value={county}
                    onChange={e => { setCounty(e.target.value); markDirty(); }}
                    placeholder="e.g. Gwinnett"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
            )}
            {addrValidation && <div className="mt-3"><AddressValidationBadge validation={addrValidation} /></div>}

            {/* USDA result */}
            {usdaEligibility && (
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${usdaEligibility.eligible ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                {usdaEligibility.eligible ? '✅ USDA Rural Eligible' : '❌ Not USDA Rural Eligible'}
                {usdaEligibility.eligible && <span className="font-normal text-green-600">— property is in an eligible rural area</span>}
              </div>
            )}

            <CRASnapshotCard craData={craData} loading={craLoading} error={craError} borrowerIncome={parseFloat(monthlyIncome) || null} />

            {/* Property Type + Occupancy — visible fields */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                <select value={propertyType}
                  onChange={(e) => { setPropertyType(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="Single Family">Single Family (SFR)</option>
                  <option value="Condo">Condo</option>
                  <option value="Townhouse">Townhouse / PUD</option>
                  <option value="2-Unit">2-Unit (Duplex)</option>
                  <option value="3-Unit">3-Unit (Triplex)</option>
                  <option value="4-Unit">4-Unit (Fourplex)</option>
                  <option value="Manufactured">Manufactured / Mobile Home</option>
                  <option value="Mixed-Use">Mixed-Use</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Occupancy</label>
                <select value={occupancy}
                  onChange={(e) => { setOccupancy(e.target.value); markDirty(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="Primary Residence">Primary Residence</option>
                  <option value="Second Home">Second Home</option>
                  <option value="Investment Property">Investment Property</option>
                </select>
                {occupancy === 'Investment Property' && loanType === 'FHA' && (
                  <p className="text-xs text-red-500 mt-1 font-medium">⚠ FHA requires primary occupancy — investment properties are not eligible.</p>
                )}
                {occupancy === 'Investment Property' && loanType === 'USDA' && (
                  <p className="text-xs text-red-500 mt-1 font-medium">⚠ USDA requires primary occupancy — investment properties are not eligible.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── 10. Monthly Housing Expenses (PITI) ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>🏡</span> Monthly Housing Expenses (PITI)
            </h2>
            <p className="text-xs text-gray-400 mb-1">
              PITI = Principal + Interest + Taxes + Insurance. This total is used to calculate your front-end DTI. P&I is auto-calculated from loan details. Taxes and insurance are estimated from state averages if not entered.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {loanType === 'FHA' && <span className="text-blue-600 font-semibold">FHA MIP auto-calculated at 0.55% annual.</span>}
              {loanType === 'USDA' && <span className="text-green-600 font-semibold">USDA annual guarantee fee auto-calculated at 0.35%.</span>}
              {loanType === 'VA' && <span className="text-red-600 font-semibold">VA loans have no monthly mortgage insurance.</span>}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Principal & Interest <span className="text-blue-500">(auto)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="text" value={piPayment ? parseFloat(piPayment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''} readOnly
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
                    onChange={(e) => { setPropTaxes(e.target.value); setTaxEstimated(false); markDirty(); }}
                    placeholder="e.g. 350"
                    className={'w-full pl-7 pr-4 py-2 border rounded-lg text-sm ' + (taxEstimated ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-gray-300')} />
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
                    onChange={(e) => { setHomeInsurance(e.target.value); setInsEstimated(false); markDirty(); }}
                    placeholder="e.g. 120"
                    className={'w-full pl-7 pr-4 py-2 border rounded-lg text-sm ' + (insEstimated ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-gray-300')} />
                </div>
                {insEstimated && <p className="text-xs text-amber-600 mt-1">Based on {state} avg rate — edit to override</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center justify-between">
                  <span>
                    {loanType === 'FHA' ? 'FHA MIP' : loanType === 'USDA' ? 'USDA Annual Fee' : loanType === 'VA' ? 'VA MI (none)' : 'PMI / Mortgage Insurance'}
                    {' '}<span className="text-gray-400 font-normal">(monthly)</span>
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={miAutoCalc} onChange={(e) => setMiAutoCalc(e.target.checked)} className="w-3 h-3 rounded" />
                    <span className="text-xs text-blue-500">Auto</span>
                  </label>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={mortgageInsurance}
                    onChange={(e) => { setMortgageInsurance(e.target.value); setMiAutoCalc(false); markDirty(); }}
                    readOnly={miAutoCalc && loanType === 'VA'}
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
                  <input type="number" value={hoaDues} onChange={(e) => { setHoaDues(e.target.value); markDirty(); }}
                    placeholder="0" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Flood Insurance <span className="text-gray-400 font-normal">(monthly)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={floodInsurance} onChange={(e) => { setFloodInsurance(e.target.value); markDirty(); }}
                    placeholder="0" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">2nd Mortgage P&I <span className="text-gray-400 font-normal">(monthly)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={secondMortgage} onChange={(e) => { setSecondMortgage(e.target.value); markDirty(); }}
                    placeholder="0" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            {totalHousing && (
              <div className="mt-4 bg-gray-900 rounded-xl px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-300">Total Monthly Housing (PITI)</span>
                <span className="text-2xl font-bold text-white">${parseFloat(totalHousing).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          {/* ── 11. Qualifying Information ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>💰</span> Qualifying Information
            </h2>
            <p className="text-xs text-gray-400 mb-5">Income from all borrowers is combined to determine total qualifying income. DTI ratios are calculated automatically as you fill in the form.</p>

            {/* Income */}
            <div className="mb-5">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Income</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {firstName ? firstName + "'s" : 'Borrower'} Monthly Gross Income
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={monthlyIncome} onChange={(e) => { setMonthlyIncome(e.target.value); markDirty(); }}
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Other Income <span className="text-gray-400 font-normal">(rental, part-time, etc.)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={otherIncome} onChange={(e) => { setOtherIncome(e.target.value); markDirty(); }}
                      placeholder="0" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              </div>
              {/* Co-borrower income breakdown (if co-borrowers have income) */}
              {coBorrowers.length > 0 && coBorrowers.some(cb => parseFloat(cb.monthlyIncome) > 0) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">Co-Borrower Income (from above)</p>
                  {coBorrowers.map((cb, i) => (
                    parseFloat(cb.monthlyIncome) > 0 && (
                      <div key={i} className="flex justify-between text-xs text-blue-600 mb-1">
                        <span>{cb.firstName || `Co-Borrower ${i + 1}`} {cb.lastName}</span>
                        <span className="font-semibold">${parseFloat(cb.monthlyIncome).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo</span>
                      </div>
                    )
                  ))}
                  <p className="text-xs text-gray-400 mt-1">Edit co-borrower income in the Co-Borrowers section above.</p>
                </div>
              )}
              {/* Legacy single co-borrower income field (shows only if no co-borrowers in array) */}
              {coBorrowers.length === 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Co-Borrower Monthly Income</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={coBorrowerIncome} onChange={(e) => { setCoBorrowerIncome(e.target.value); markDirty(); }}
                      placeholder="0 — or add co-borrowers above for detailed tracking"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">For detailed co-borrower tracking, use the Co-Borrowers section above.</p>
                </div>
              )}
              {totalIncome && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Total Qualifying Income:</span>
                  <span className="text-sm font-bold text-green-700">${parseFloat(totalIncome).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
                </div>
              )}
            </div>

            {/* DTI Display */}
            {totalHousing && totalIncome && (
              <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">DTI Ratios</h3>
                <p className="text-xs text-gray-400 mb-3">Front-end = housing only. Back-end = housing + all monthly debts. These are real-time — they update as you fill in the form.</p>
                <div className="flex gap-3 flex-wrap">
                  {[
                    {
                      label: 'FRONT-END', sub: 'PITI ÷ Income', guide: 'Guideline: ≤28%',
                      val: parseFloat(totalHousing) / parseFloat(totalIncome) * 100,
                      warn: 36, caution: 28,
                    },
                    {
                      label: 'BACK-END', sub: 'PITI+Debts ÷ Income', guide: 'Guideline: ≤43%',
                      val: (parseFloat(totalHousing) + (parseFloat(monthlyDebts) || 0)) / parseFloat(totalIncome) * 100,
                      warn: 50, caution: 43,
                    },
                  ].map(r => (
                    <div key={r.label} className={`flex-1 min-w-[120px] rounded-xl p-3 text-center border ${
                      r.val > r.warn ? 'bg-red-50 border-red-200' : r.val > r.caution ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                      <p className="text-xs font-bold text-gray-500 mb-1">{r.label}</p>
                      <p className={`text-2xl font-bold ${r.val > r.warn ? 'text-red-700' : r.val > r.caution ? 'text-yellow-700' : 'text-green-700'}`}>
                        {r.val.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.sub}</p>
                      <p className="text-xs text-gray-400">{r.guide}</p>
                    </div>
                  ))}
                  <div className="flex-1 min-w-[120px] rounded-xl p-3 text-center border bg-blue-50 border-blue-200">
                    <p className="text-xs font-bold text-gray-500 mb-1">RESERVES</p>
                    <p className="text-2xl font-bold text-blue-700">{postCloseReserves ? postCloseReserves + ' mo' : '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Post-close PITI</p>
                    <p className="text-xs text-gray-400">Min 2 mo typical</p>
                  </div>
                </div>
              </div>
            )}

            {/* Funds & Reserves */}
            <div>
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Funds & Reserves</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Down Payment ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={downPayment} onChange={(e) => { setDownPayment(e.target.value); markDirty(); }}
                      placeholder="e.g. 17250" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  {downPayment && propertyValue && (
                    <p className="text-xs text-gray-400 mt-1">
                      {(parseFloat(downPayment) / parseFloat(propertyValue) * 100).toFixed(1)}% of purchase price
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Seller Concessions ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={sellerConcessions} onChange={(e) => { setSellerConcessions(e.target.value); markDirty(); }}
                      placeholder="0" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Est. Cash to Close ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={estimatedCashToClose} onChange={(e) => { setEstimatedCashToClose(e.target.value); markDirty(); }}
                      placeholder="From LOS or manual" className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Post-Close Reserves <span className="text-gray-400 font-normal">(months of PITI)</span></label>
                  <input type="number" value={postCloseReserves} onChange={(e) => { setPostCloseReserves(e.target.value); markDirty(); }}
                    placeholder="e.g. 3" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
                  {postCloseReserves && totalHousing && (
                    <p className="text-xs text-gray-400 mt-1">
                      = ${(parseFloat(postCloseReserves) * parseFloat(totalHousing)).toLocaleString('en-US', { maximumFractionDigits: 0 })} needed in reserves
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 12. Borrower Financials ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <span>📊</span> Borrower Financials
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Enter the middle credit score for each borrower (from their tri-merge credit report). For conventional and government loans, FICO drives program eligibility, rate tier, and LTV limits.
              {coBorrowers.length > 0
                ? ' When multiple borrowers are on the loan, the lowest middle score across all borrowers is the qualifying score used by lenders and AUS.'
                : ' If you add co-borrowers above, their scores will be compared and the lowest middle score will be used as the qualifying score.'}
            </p>

            {/* Credit Score Inputs */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Credit Scores (FICO Middle Score)</h3>
              <div className={`grid gap-4 ${coBorrowers.length > 0 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {/* Primary Borrower */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {firstName || 'Primary Borrower'}
                    {qualifyingCreditScore && parseInt(creditScore) === qualifyingCreditScore && (
                      <span className="ml-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Qualifying Score</span>
                    )}
                  </label>
                  <input type="number" value={creditScore}
                    onChange={(e) => { setCreditScore(e.target.value); markDirty(); }}
                    placeholder="e.g. 720"
                    className={`w-full px-4 py-2 border rounded-lg text-sm ${
                      qualifyingCreditScore && parseInt(creditScore) === qualifyingCreditScore
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-300'
                    }`} required />
                </div>
                {/* Co-borrower scores (read display from array, editable inline) */}
                {coBorrowers.map((cb, i) => (
                  <div key={i}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      {cb.firstName || `Co-Borrower ${i + 1}`} {cb.lastName}
                      {qualifyingCreditScore && cb.creditScore && parseInt(cb.creditScore) === qualifyingCreditScore && (
                        <span className="ml-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Qualifying Score</span>
                      )}
                    </label>
                    <input type="number" value={cb.creditScore}
                      onChange={(e) => updateCoBorrower(i, 'creditScore', e.target.value)}
                      placeholder="e.g. 680"
                      className={`w-full px-4 py-2 border rounded-lg text-sm ${
                        qualifyingCreditScore && cb.creditScore && parseInt(cb.creditScore) === qualifyingCreditScore
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-gray-300'
                      }`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Qualifying Score Banner */}
            {qualifyingCreditScore && (
              <div className={`mb-4 rounded-xl p-4 border flex items-center justify-between ${
                qualifyingCreditScore >= 740 ? 'bg-green-50 border-green-200' :
                qualifyingCreditScore >= 680 ? 'bg-blue-50 border-blue-200' :
                qualifyingCreditScore >= 620 ? 'bg-yellow-50 border-yellow-200' :
                'bg-red-50 border-red-200'
              }`}>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">Qualifying Credit Score</p>
                  <p className={`text-3xl font-bold ${
                    qualifyingCreditScore >= 740 ? 'text-green-700' :
                    qualifyingCreditScore >= 680 ? 'text-blue-700' :
                    qualifyingCreditScore >= 620 ? 'text-yellow-700' :
                    'text-red-700'
                  }`}>{qualifyingCreditScore}</p>
                  {qualifyingScoreBorrower && allCreditScores.length > 1 && (
                    <p className="text-xs text-gray-500 mt-0.5">Lowest middle score — {qualifyingScoreBorrower}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${
                    qualifyingCreditScore >= 740 ? 'text-green-700' :
                    qualifyingCreditScore >= 680 ? 'text-blue-700' :
                    qualifyingCreditScore >= 620 ? 'text-yellow-700' :
                    'text-red-700'
                  }`}>
                    {qualifyingCreditScore >= 740 ? '✅ Excellent' :
                     qualifyingCreditScore >= 720 ? '✅ Very Good' :
                     qualifyingCreditScore >= 680 ? '✓ Good' :
                     qualifyingCreditScore >= 640 ? '⚠ Fair' :
                     qualifyingCreditScore >= 620 ? '⚠ Minimum Range' :
                     '❌ Below Standard Minimums'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {qualifyingCreditScore >= 740 ? 'Best rate tiers, all programs available' :
                     qualifyingCreditScore >= 720 ? 'Strong — excellent program access' :
                     qualifyingCreditScore >= 680 ? 'Most programs available' :
                     qualifyingCreditScore >= 640 ? 'FHA/VA eligible, conventional limited' :
                     qualifyingCreditScore >= 620 ? 'FHA minimum — rate adjustments apply' :
                     'Run AUS Rescue to explore options'}
                  </p>
                  {allCreditScores.length > 1 && (
                    <p className="text-xs text-gray-400 mt-1 italic">All scores: {allCreditScores.sort((a,b) => b-a).join(' / ')}</p>
                  )}
                </div>
              </div>
            )}

            {/* Monthly Debts */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Debts <span className="text-gray-400 text-xs font-normal">(all recurring obligations)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input type="number" value={monthlyDebts}
                  onChange={(e) => { setMonthlyDebts(e.target.value); markDirty(); }}
                  className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <p className="text-xs text-gray-400 mt-1">Car payments, student loans, credit cards (minimum payment), personal loans — pulled from credit report</p>
              {importedData && monthlyDebts === '0' && importedData.liabilities?.length > 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  ✓ Confirmed $0 in qualifying debts from LOS — all {importedData.liabilities.length} liabilities are either excluded or paid off
                </p>
              )}
              {importedData && monthlyDebts === '0' && (!importedData.liabilities || importedData.liabilities.length === 0) && (
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  ℹ No liabilities found in MISMO file — verify with credit report before finalizing
                </p>
              )}
              {!importedData && !monthlyDebts && (
                <p className="text-xs text-amber-600 mt-1">Enter 0 if the borrower has no monthly obligations — do not leave blank</p>
              )}
            </div>
            {dtiRatio && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-400">Consumer Debt Ratio (debts only):</span>
                <span className="text-sm font-bold text-gray-600">{dtiRatio}%</span>
                <span className="text-xs text-gray-400">— full DTI shown in Qualifying section above</span>
              </div>
            )}
          </div>

          {/* ── Sticky Save Bar ── */}
          <div style={{ transform: isDirty ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 0.3s ease' }}
            className="fixed bottom-14 left-0 right-0 z-50">
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
                  <button type="button"
                    onClick={() => { if (window.confirm('Discard all changes?')) { setIsDirty(false); navigate('/scenarios'); } }}
                    className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200">
                    Discard
                  </button>
                  <button type="submit" disabled={loading}
                    className="px-8 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:bg-gray-400">
                    {loading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Scenario'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom Buttons ── */}
          <div className="flex gap-4 pb-24">
            <button type="submit" disabled={loading}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400 text-sm">
              {loading ? 'Saving...' : isEditMode ? 'Update Scenario' : 'Create Scenario'}
            </button>
            <button type="button"
              onClick={() => { if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return; navigate('/scenarios'); }}
              className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-300 font-semibold text-sm">
              Cancel
            </button>
          </div>

        </form>
      </div>
    <CanonicalSequenceBar currentModuleKey="SCENARIO_CREATOR" scenarioId={id} recordId={null} />
</div>
  );
}

export default ScenarioCreator;
