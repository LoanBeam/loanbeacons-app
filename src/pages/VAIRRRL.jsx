// VAIRRRL.jsx v3.4 — VA Interest Rate Reduction Refinance Loan (IRRRL)
// LoanBeacons™ Module 11 of 27 | Gen2 Cloud Function pattern | 10-tab layout
// Updated: March 2026 — v3.4: Net Commission Calculator tab added

import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { app } from '../firebase/config';
import VAIRRRLPricingCommission from './VAIRRRLPricingCommission';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { MODULE_KEYS } from '../constants/decisionRecordConstants';

const functions = getFunctions(app);
const auth = getAuth(app);
const db = getFirestore(app);

const fmt = (n, d = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDollar = (n) => (n == null || isNaN(n) ? '—' : `$${fmt(n)}`);
const fmtPct = (n) => (n == null || isNaN(n) ? '—' : `${Number(n).toFixed(3)}%`);

const calcPI = (principal, annualRateDecimal, termMonths) => {
  if (!principal || !annualRateDecimal || !termMonths || principal <= 0 || termMonths <= 0) return 0;
  const r = annualRateDecimal / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
};

const GA_COUNTIES = {
  'Bibb':     { millage: 34.49, due: 'Dec 20', note: 'City of Macon adds ~12 mills' },
  'Cherokee': { millage: 23.24, due: 'Nov 15', note: 'Low rate county' },
  'Clayton':  { millage: 33.55, due: 'Oct 20', note: 'City of Jonesboro adds additional mills' },
  'Cobb':     { millage: 22.55, due: 'Oct 1',  note: 'One of lowest rates in metro Atlanta' },
  'DeKalb':   { millage: 38.98, due: 'Oct 20', note: 'Unincorporated DeKalb — cities vary' },
  'Douglas':  { millage: 28.76, due: 'Oct 20', note: 'City of Douglasville adds ~7 mills' },
  'Fayette':  { millage: 22.19, due: 'Dec 1',  note: 'Peachtree City ~28 mills total' },
  'Forsyth':  { millage: 21.07, due: 'Nov 15', note: 'Rapidly growing — rate stable' },
  'Fulton':   { millage: 41.64, due: 'Oct 20', note: 'City of Atlanta adds ~12 mills' },
  'Gwinnett': { millage: 27.76, due: 'Oct 20', note: 'City of Lawrenceville ~35 mills' },
  'Hall':     { millage: 28.04, due: 'Nov 15', note: 'City of Gainesville adds ~4 mills' },
  'Henry':    { millage: 31.40, due: 'Oct 20', note: 'McDonough city adds additional mills' },
  'Houston':  { millage: 21.58, due: 'Oct 15', note: 'Warner Robins city ~26 mills total' },
  'Newton':   { millage: 31.12, due: 'Nov 15', note: 'City of Covington adds additional mills' },
  'Paulding': { millage: 26.57, due: 'Oct 20', note: 'Dallas city rate higher' },
  'Rockdale': { millage: 32.90, due: 'Oct 20', note: 'City of Conyers adds additional mills' },
  'Walton':   { millage: 28.97, due: 'Nov 15', note: 'City of Monroe adds additional mills' },
};

const MODULES = [
  { id: 1,  label: 'Scenario Creator',       path: '/scenario-creator' },
  { id: 2,  label: 'Qualifying Intel',        path: '/qualifying-intel' },
  { id: 3,  label: 'Income Analyzer',         path: '/income-analyzer' },
  { id: 4,  label: 'Credit Intel',            path: '/credit-intel' },
  { id: 5,  label: 'Lender Match',            path: '/lender-match' },
  { id: 6,  label: 'Debt Resolution',         path: '/debt-resolution' },
  { id: 7,  label: 'DPA Intelligence',        path: '/dpa-intelligence' },
  { id: 8,  label: 'ARM Structure',           path: '/arm-structure' },
  { id: 9,  label: 'Piggyback Optimizer',     path: '/piggyback-optimizer' },
  { id: 10, label: 'FHA Streamline',          path: '/fha-streamline' },
  { id: 11, label: 'VA IRRRL',                path: '/va-irrrl' },
  { id: 12, label: 'CRA Eligibility',         path: '/cra-eligibility' },
  { id: 13, label: 'USDA Intelligence',       path: '/usda-intelligence' },
  { id: 14, label: 'Disclosure Intel',        path: '/disclosure-intel' },
  { id: 15, label: 'Compliance Intel',        path: '/compliance-intel' },
  { id: 16, label: 'Flood Intel',             path: '/flood-intel' },
  { id: 17, label: 'Rehab Intelligence',      path: '/rehab-intelligence' },
  { id: 18, label: 'Intelligent Checklist',   path: '/intelligent-checklist' },
  { id: 19, label: 'Bank Statement Intel',    path: '/bank-statement-intel' },
  { id: 20, label: 'AUS Rescue',              path: '/aus-rescue' },
  { id: 21, label: 'Decision Record',         path: '/decision-record' },
  { id: 22, label: 'Loan Path Graph',         path: '/loan-path-graph' },
  { id: 23, label: 'Lender Profile',          path: '/lender-profile' },
  { id: 24, label: 'AE Share',                path: '/ae-share' },
  { id: 25, label: 'Rate Sensitivity',        path: '/rate-sensitivity' },
  { id: 26, label: 'Scenarios',               path: '/scenarios' },
  { id: 27, label: 'Admin Center',            path: '/admin' },
];

const TABS = [
  { id: 'snapshot',      label: 'Loan Snapshot' },
  { id: 'irrrl-flag',    label: 'IRRRL-to-IRRRL' },
  { id: 'benefit-test',  label: 'Benefit Test' },
  { id: 'funding-fee',   label: 'Funding Fee' },
  { id: 'rate-shop',     label: 'Rate Shop' },
  { id: 'pricing',       label: 'Pricing & Comp' },
  { id: 'ntb-worksheet', label: 'NTB Worksheet' },
  { id: 'uw-worksheet',  label: 'UW Worksheet' },
  { id: 'doc-checklist', label: 'Doc Checklist' },
  { id: 'cash-out',          label: 'Cash-Out' },
  { id: 'net-commission',    label: 'Net Commission' },
];

const DOC_ITEMS = [
  { id: 'coe',              label: 'Certificate of Eligibility (COE)', tag: null },
  { id: 'mortgage_stmt',    label: 'Most Recent Mortgage Statement', tag: null },
  { id: 'note',             label: 'Original Note / Prior IRRRL Note (if applicable)', tag: null },
  { id: 'hud',              label: 'Prior HUD-1 or Closing Disclosure (if IRRRL-to-IRRRL)', tag: 'irrrl' },
  { id: 'id',               label: 'Government-Issued Photo ID', tag: null },
  { id: 'dd214',            label: 'DD-214 (if COE not already on file)', tag: null },
  { id: 'disability_letter',label: 'VA Disability Rating Letter (if claiming fee exemption)', tag: 'exempt' },
  { id: 'homeowners_ins',   label: 'Current Homeowners Insurance Declaration Page', tag: null },
  { id: 'title',            label: 'Preliminary Title Report / Title Commitment', tag: null },
  { id: 'payoff',           label: 'Payoff Statement from Current Lender', tag: null },
];

const S = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '24px 20px 160px', color: '#1a1a2e', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0d3b6e 0%, #154a8a 100%)', borderRadius: 12, padding: '20px 24px', marginBottom: 20, color: '#fff' },
  headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  badge: { display: 'inline-block', background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' },
  badgeGreen: { background: 'rgba(34,197,94,0.25)', color: '#86efac' },
  badgeGold:  { background: 'rgba(249,200,70,0.25)', color: '#f9c846' },
  scenarioRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  headerSelect: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13, minWidth: 220, cursor: 'pointer' },
  tabBar: { display: 'flex', gap: 3, flexWrap: 'wrap', borderBottom: '2px solid #e0e7ef', marginBottom: 20 },
  tab: (active) => ({ padding: '8px 10px', borderRadius: '8px 8px 0 0', border: 'none', background: active ? '#0d3b6e' : 'transparent', color: active ? '#fff' : '#6b7a8d', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: active ? -2 : 0, borderBottom: active ? '2px solid #0d3b6e' : 'none', transition: 'all 0.15s' }),
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e0e7ef', padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#0d3b6e', marginBottom: 14, borderBottom: '1px solid #f0f4f8', paddingBottom: 10 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7a8d', marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d0dbe8', fontSize: 13, color: '#1a1a2e', boxSizing: 'border-box', outline: 'none' },
  inputRO: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e0e7ef', fontSize: 13, color: '#1a1a2e', boxSizing: 'border-box', background: '#f8fafc', fontWeight: 700 },
  btn: { padding: '9px 18px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s' },
  btnPrimary:   { background: '#0d3b6e', color: '#fff' },
  btnSecondary: { background: '#e9eef5', color: '#1a1a2e' },
  btnGhost:     { background: 'transparent', color: '#0d3b6e', border: '1px solid #0d3b6e' },
  btnRed:       { background: '#fdf0f0', color: '#8b1a1a', padding: '4px 10px', fontSize: 12 },
  infoBox:    { background: '#eef4fb', border: '1px solid #b8d0e8', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#1a4a7e', marginBottom: 14 },
  warningBox: { background: '#fffbeb', border: '1px solid #f9c846', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#7a5a00' },
  errorBox:   { background: '#fdf0f0', border: '1px solid #f5c6c6', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#8b1a1a' },
  successBox: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#166534' },
  canonicalBar: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: '#0d3b6e', boxShadow: '0 -2px 12px rgba(0,0,0,0.18)' },
  canonicalMain: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', maxWidth: 1100, margin: '0 auto', gap: 10 },
  dot: (active) => ({ width: active ? 22 : 14, height: active ? 22 : 14, borderRadius: '50%', background: active ? '#f9c846' : 'rgba(255,255,255,0.2)', border: active ? '2px solid #fff' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: active ? '#000' : 'transparent', transition: 'all 0.15s', flexShrink: 0 }),
};

export default function VAIRRRL() {
  const CURRENT_MODULE = 11;
  const prevMod = MODULES[CURRENT_MODULE - 2];
  const nextMod = MODULES[CURRENT_MODULE];

  const [activeTab, setActiveTab]                 = useState('snapshot');
  const [canonicalExpanded, setCanonicalExpanded] = useState(false);
  const [scenarios, setScenarios]                 = useState([]);
  const [selectedScenId, setSelectedScenId]       = useState('');
  const [loadingScenarios, setLoadingScenarios]   = useState(false);
  const [veteranName, setVeteranName]             = useState('');
  const [vaLoanNumber, setVaLoanNumber]           = useState('');
  const [currentRatePct, setCurrentRatePct]       = useState('');
  const [currentPI, setCurrentPI]                 = useState('');
  const [remainingBalance, setRemainingBalance]   = useState('');
  const [remainingTerm, setRemainingTerm]         = useState('360');
  const [propertyAddress, setPropertyAddress]     = useState('');
  const [fundingFeeExempt, setFundingFeeExempt]   = useState(null);
  const [newRatePct, setNewRatePct]               = useState('');
  const [newLoanAmount, setNewLoanAmount]         = useState('');
  const [newTerm, setNewTerm]                     = useState('360');
  const [closingCosts, setClosingCosts]           = useState('');
  const [priorIRRRL, setPriorIRRRL]               = useState(false);
  const [priorIRRRLDate, setPriorIRRRLDate]       = useState('');
  const [priorIRRRLLender, setPriorIRRRLLender]   = useState('');
  const [rateOptions, setRateOptions]             = useState([
    { id: 1, lender: '', rate: '', apr: '', points: '', fees: '' },
    { id: 2, lender: '', rate: '', apr: '', points: '', fees: '' },
    { id: 3, lender: '', rate: '', apr: '', points: '', fees: '' },
  ]);
  const [checkedDocs, setCheckedDocs]                     = useState({});
  const [cashOutType, setCashOutType]                     = useState('typeI');
  const [cashOutAmount, setCashOutAmount]                 = useState('');
  const [cashOutAppraisalValue, setCashOutAppraisalValue] = useState('');
  const [veteranCashToClose, setVeteranCashToClose]       = useState('');

  // ── Closing Cost Estimator (single source of truth)
  const [ccMode, setCcMode]           = useState('itemized'); // 'itemized' | 'lump'
  const [ccTitle, setCcTitle]         = useState('850');
  const [ccTitleIns, setCcTitleIns]   = useState('650');
  const [ccRecording, setCcRecording] = useState('125');
  const [ccOrigination, setCcOrigination] = useState('0');
  const [ccProcessing, setCcProcessing]   = useState('895');
  const [ccUnderwriting, setCcUnderwriting] = useState('0');
  const [ccOther, setCcOther]         = useState('0');

  // ── Required Services (Section C)
  const [ccCreditReport,     setCcCreditReport]     = useState('45');
  const [ccFloodDet,         setCcFloodDet]         = useState('20');
  const [ccTaxMonitor,       setCcTaxMonitor]       = useState('85');
  const [ccMERS,             setCcMERS]             = useState('15');
  const [ccPayoffFee,        setCcPayoffFee]        = useState('30');
  const [ccPerDiemDays,      setCcPerDiemDays]      = useState('15');
  const [ccHOIPremiumAnnual, setCcHOIPremiumAnnual] = useState('');
  const [ccHOIMonthly,       setCcHOIMonthly]       = useState('');
  const [ccTaxMonthsRes,     setCcTaxMonthsRes]     = useState('3');
  const [ccHOIMonthsRes,     setCcHOIMonthsRes]     = useState('3');
  const [taxState,      setTaxState]      = useState('GA');
  const [taxCounty,     setTaxCounty]     = useState('');
  const [taxCityMills,  setTaxCityMills]  = useState('');
  const [taxFMV,        setTaxFMV]        = useState('');
  const [taxResult,     setTaxResult]     = useState(null);


  // ── Net Commission Calculator
  const [commissionPct, setCommissionPct]         = useState('');
  const [commissionBps, setCommissionBps]         = useState('');
  const [brokerSplitPct, setBrokerSplitPct]       = useState('');
  const [processingFee, setProcessingFee]         = useState('');
  const [originationCosts, setOriginationCosts]   = useState('');
  const [compScenarios, setCompScenarios]         = useState([
    { id: 1, label: 'Scenario A', rate: '', bps: '', loanAmt: '' },
    { id: 2, label: 'Scenario B', rate: '', bps: '', loanAmt: '' },
    { id: 3, label: 'Scenario C', rate: '', bps: '', loanAmt: '' },
  ]);

  // ── Pricing & Comp Tab State (passed as props to VAIRRRLPricingCommission)
  const [pcPricingRate, setPcPricingRate]           = useState('');
  const [pcLenderCreditPct, setPcLenderCreditPct]   = useState('');
  const [pcCompType, setPcCompType]                 = useState('BPC');
  const [pcCompBps, setPcCompBps]                   = useState('150');
  const [pcSplitMode, setPcSplitMode]               = useState('pct');
  const [pcCompanySplitPct, setPcCompanySplitPct]   = useState('30');
  const [pcCompanyFlatFee, setPcCompanyFlatFee]     = useState('0');
  const [pcPurchaseLoanAmt, setPcPurchaseLoanAmt]   = useState('');
  const [pcPurchaseCompBps, setPcPurchaseCompBps]   = useState('150');
  const [pdfFiles, setPdfFiles]                   = useState({ coe: null, mortgage: null, note: null });
  const [isDragging, setIsDragging]               = useState({ coe: false, mortgage: false, note: false });
  const [isExtracting, setIsExtracting]           = useState(false);
  const [extractionError, setExtractionError]     = useState('');
  const [extractionSuccess, setExtractionSuccess] = useState(false);
  const coeRef      = useRef(null);
  const mortgageRef = useRef(null);
  const noteRef     = useRef(null);

  // ── Save / Restore State ─────────────────────────────────────────────────
  const [savedAt, setSavedAt] = useState(null);
  const [saveFlash, setSaveFlash] = useState(false);

  // ── Decision Record (Option B — auto-log on Save) ────────────────────────
  const [drRecordId, setDrRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(selectedScenId);

  const getSaveKey = () => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('scenarioId') || selectedScenId || 'default';
    return `lb_va_irrrl_${sid}`;
  };

  const getStateSnapshot = () => ({
    veteranName, vaLoanNumber, currentRatePct, currentPI, remainingBalance, remainingTerm,
    propertyAddress, fundingFeeExempt, newRatePct, newLoanAmount, newTerm, closingCosts,
    priorIRRRL, priorIRRRLDate, priorIRRRLLender, rateOptions, checkedDocs,
    cashOutType, cashOutAmount, cashOutAppraisalValue, veteranCashToClose,
    ccMode, ccTitle, ccTitleIns, ccRecording, ccOrigination, ccProcessing, ccUnderwriting, ccOther,
    commissionPct, commissionBps, brokerSplitPct, processingFee, originationCosts, compScenarios,
    pcPricingRate, pcLenderCreditPct, pcCompType, pcCompBps, pcSplitMode,
    pcCompanySplitPct, pcCompanyFlatFee, pcPurchaseLoanAmt, pcPurchaseCompBps,
    ccCreditReport, ccFloodDet, ccTaxMonitor, ccMERS, ccPayoffFee,
    ccPerDiemDays, ccHOIPremiumAnnual, ccHOIMonthly,
    ccTaxMonthsRes, ccHOIMonthsRes,
    taxState, taxCounty, taxCityMills, taxFMV,
  });

  const handleSave = async () => {
    // ── 1. localStorage save (unchanged)
    try {
      const key = getSaveKey();
      const snapshot = { ...getStateSnapshot(), savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(snapshot));
      setSavedAt(new Date());
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
    } catch (e) { console.warn('Save failed:', e); }

    // ── 2. Decision Record auto-log (Option B)
    if (selectedScenId) {
      try {
        const findings = {
          veteranName:           veteranName || null,
          vaLoanNumber:          vaLoanNumber || null,
          propertyAddress:       propertyAddress || null,
          currentNotePct:        parseFloat(currentRatePct) || null,
          currentPIPayment:      parseFloat(currentPI) || null,
          remainingBalance:      remBal || null,
          remainingTermMonths:   remTermMos || null,
          newNotePct:            parseFloat(newRatePct) || null,
          newLoanAmount:         newLoanAmt || null,
          newTermMonths:         newTermMos || null,
          newPIPayment:          newPICalc > 0 ? +newPICalc.toFixed(2) : null,
          rateReduction:         rateReduction > 0 ? +rateReduction.toFixed(5) : null,
          paymentSavingsMonthly: paymentSavings > 0 ? +paymentSavings.toFixed(2) : null,
          recoupmentMonths:      isFinite(recoupMos) ? +recoupMos.toFixed(1) : null,
          rateTestPass,
          paymentTestPass,
          ntbSatisfied:          benefitTestPass,
          fundingFeeExempt:      fundingFeeExempt,
          fundingFeeAmount:      +fundingFeeAmt.toFixed(2),
          totalClosingCosts:     +costsAmt.toFixed(2),
          priorIRRRL,
          priorIRRRLDate:        priorIRRRL ? priorIRRRLDate : null,
          docsChecked:           Object.values(checkedDocs).filter(Boolean).length,
          totalDocs:             DOC_ITEMS.length,
          savedAt:               new Date().toISOString(),
        };
        const rid = await reportFindings(MODULE_KEYS.VA_IRRRL, findings, [], [], '3.4.0');
        if (rid) setDrRecordId(rid);
      } catch (e) { console.warn('[DR] reportFindings failed:', e); }
    }
  };

  const restoreFromStorage = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.veteranName       !== undefined) setVeteranName(d.veteranName);
      if (d.vaLoanNumber      !== undefined) setVaLoanNumber(d.vaLoanNumber);
      if (d.currentRatePct    !== undefined) setCurrentRatePct(d.currentRatePct);
      if (d.currentPI         !== undefined) setCurrentPI(d.currentPI);
      if (d.remainingBalance  !== undefined) setRemainingBalance(d.remainingBalance);
      if (d.remainingTerm     !== undefined) setRemainingTerm(d.remainingTerm);
      if (d.propertyAddress   !== undefined) setPropertyAddress(d.propertyAddress);
      if (d.fundingFeeExempt  !== undefined) setFundingFeeExempt(d.fundingFeeExempt);
      if (d.newRatePct        !== undefined) setNewRatePct(d.newRatePct);
      if (d.newLoanAmount     !== undefined) setNewLoanAmount(d.newLoanAmount);
      if (d.newTerm           !== undefined) setNewTerm(d.newTerm);
      if (d.closingCosts      !== undefined) setClosingCosts(d.closingCosts);
      if (d.priorIRRRL        !== undefined) setPriorIRRRL(d.priorIRRRL);
      if (d.priorIRRRLDate    !== undefined) setPriorIRRRLDate(d.priorIRRRLDate);
      if (d.priorIRRRLLender  !== undefined) setPriorIRRRLLender(d.priorIRRRLLender);
      if (d.rateOptions       !== undefined) setRateOptions(d.rateOptions);
      if (d.checkedDocs       !== undefined) setCheckedDocs(d.checkedDocs);
      if (d.cashOutType       !== undefined) setCashOutType(d.cashOutType);
      if (d.cashOutAmount     !== undefined) setCashOutAmount(d.cashOutAmount);
      if (d.cashOutAppraisalValue !== undefined) setCashOutAppraisalValue(d.cashOutAppraisalValue);
      if (d.veteranCashToClose    !== undefined) setVeteranCashToClose(d.veteranCashToClose);
      if (d.ccMode            !== undefined) setCcMode(d.ccMode);
      if (d.ccTitle           !== undefined) setCcTitle(d.ccTitle);
      if (d.ccTitleIns        !== undefined) setCcTitleIns(d.ccTitleIns);
      if (d.ccRecording       !== undefined) setCcRecording(d.ccRecording);
      if (d.ccOrigination     !== undefined) setCcOrigination(d.ccOrigination);
      if (d.ccProcessing      !== undefined) setCcProcessing(d.ccProcessing);
      if (d.ccUnderwriting    !== undefined) setCcUnderwriting(d.ccUnderwriting);
      if (d.ccOther           !== undefined) setCcOther(d.ccOther);
      if (d.ccCreditReport !== undefined) setCcCreditReport(d.ccCreditReport);
      if (d.ccFloodDet !== undefined) setCcFloodDet(d.ccFloodDet);
      if (d.ccTaxMonitor !== undefined) setCcTaxMonitor(d.ccTaxMonitor);
      if (d.ccMERS !== undefined) setCcMERS(d.ccMERS);
      if (d.ccPayoffFee !== undefined) setCcPayoffFee(d.ccPayoffFee);
      if (d.ccPerDiemDays !== undefined) setCcPerDiemDays(d.ccPerDiemDays);
      if (d.ccHOIPremiumAnnual !== undefined) setCcHOIPremiumAnnual(d.ccHOIPremiumAnnual);
      if (d.ccHOIMonthly !== undefined) setCcHOIMonthly(d.ccHOIMonthly);
      if (d.ccTaxMonthsRes !== undefined) setCcTaxMonthsRes(d.ccTaxMonthsRes);
      if (d.ccHOIMonthsRes !== undefined) setCcHOIMonthsRes(d.ccHOIMonthsRes);
      if (d.taxState !== undefined) setTaxState(d.taxState);
      if (d.taxCounty !== undefined) setTaxCounty(d.taxCounty);
      if (d.taxCityMills !== undefined) setTaxCityMills(d.taxCityMills);
      if (d.taxFMV !== undefined) setTaxFMV(d.taxFMV);
      if (d.commissionPct     !== undefined) setCommissionPct(d.commissionPct);
      if (d.commissionBps     !== undefined) setCommissionBps(d.commissionBps);
      if (d.brokerSplitPct    !== undefined) setBrokerSplitPct(d.brokerSplitPct);
      if (d.processingFee     !== undefined) setProcessingFee(d.processingFee);
      if (d.originationCosts  !== undefined) setOriginationCosts(d.originationCosts);
      if (d.compScenarios     !== undefined) setCompScenarios(d.compScenarios);
      if (d.pcPricingRate     !== undefined) setPcPricingRate(d.pcPricingRate);
      if (d.pcLenderCreditPct !== undefined) setPcLenderCreditPct(d.pcLenderCreditPct);
      if (d.pcCompType        !== undefined) setPcCompType(d.pcCompType);
      if (d.pcCompBps         !== undefined) setPcCompBps(d.pcCompBps);
      if (d.pcSplitMode       !== undefined) setPcSplitMode(d.pcSplitMode);
      if (d.pcCompanySplitPct !== undefined) setPcCompanySplitPct(d.pcCompanySplitPct);
      if (d.pcCompanyFlatFee  !== undefined) setPcCompanyFlatFee(d.pcCompanyFlatFee);
      if (d.pcPurchaseLoanAmt !== undefined) setPcPurchaseLoanAmt(d.pcPurchaseLoanAmt);
      if (d.pcPurchaseCompBps !== undefined) setPcPurchaseCompBps(d.pcPurchaseCompBps);
      if (d.savedAt) setSavedAt(new Date(d.savedAt));
      return true;
    } catch (e) { return false; }
  };

  useEffect(() => {
    const load = async () => {
      setLoadingScenarios(true);

      // ── Restore saved state first ──
      const params0 = new URLSearchParams(window.location.search);
      const sid0 = params0.get('scenarioId') || 'default';
      restoreFromStorage(`lb_va_irrrl_${sid0}`);

      try {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('scenarioId');
        if (sid) {
          const { getDoc, doc: fsDoc } = await import('firebase/firestore');
          const docSnap = await getDoc(fsDoc(db, 'scenarios', sid));
          if (docSnap.exists()) {
            const match = { id: docSnap.id, ...docSnap.data() };
            setSelectedScenId(sid);
            const name = match.borrowerName || match.borrower_name || ((match.firstName || '') + ' ' + (match.lastName || '')).trim() || match.scenarioName || '';
            if (name) setVeteranName(name);
            const addr = match.propertyAddress || match.subjectPropertyAddress || [match.streetAddress, match.city, match.state].filter(Boolean).join(', ') || '';
            if (addr) setPropertyAddress(addr);
            const bal = match.currentLoanAmount || match.loanAmount || match.baseLoanAmount || '';
            if (bal) setRemainingBalance(String(bal));
            const exempt = match.fundingFeeExempt ?? match.serviceConnectedDisability ?? match.vaFundingFeeExempt ?? null;
            if (exempt != null) setFundingFeeExempt(exempt);
          }
        }
        try {
          const q = query(collection(db, 'scenarios'), orderBy('created_at', 'desc'), limit(15));
          const snap = await getDocs(q);
          const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setScenarios(loaded);
          if (sid && !loaded.find(x => x.id === sid)) {
            const { getDoc, doc: fsDoc } = await import('firebase/firestore');
            const docSnap = await getDoc(fsDoc(db, 'scenarios', sid));
            if (docSnap.exists()) setScenarios([{ id: docSnap.id, ...docSnap.data() }, ...loaded]);
          }
        } catch (e) { console.warn('Scenario list load failed:', e.message); }
      } catch (e) { console.error('Scenarios load error:', e); }
      finally { setLoadingScenarios(false); }
    };
    load();
  }, []);

  const handleScenarioSelect = (id) => {
    setSelectedScenId(id);
    const s = scenarios.find(x => x.id === id);
    if (!s) return;
    if (s.borrowerName || s.borrower_name) setVeteranName(s.borrowerName || s.borrower_name || '');
    if (s.propertyAddress) setPropertyAddress(s.propertyAddress);
    if (s.currentLoanAmount || s.loanAmount) setRemainingBalance(String(s.currentLoanAmount || s.loanAmount || ''));
    const exempt = s.fundingFeeExempt ?? s.serviceConnectedDisability ?? s.vaFundingFeeExempt ?? null;
    if (exempt != null) setFundingFeeExempt(exempt);
  };

  // ── Per-zone drag/drop handlers
  const handleDragOver  = (zone) => (e) => { e.preventDefault(); setIsDragging(prev => ({ ...prev, [zone]: true })); };
  const handleDragLeave = (zone) => ()  => setIsDragging(prev => ({ ...prev, [zone]: false }));
  const handleDrop = (zone) => (e) => {
    e.preventDefault();
    setIsDragging(prev => ({ ...prev, [zone]: false }));
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') { setPdfFiles(prev => ({ ...prev, [zone]: file })); setExtractionError(''); setExtractionSuccess(false); }
  };
  const handleFileSelect = (zone) => (e) => {
    const file = e.target.files[0];
    if (file) { setPdfFiles(prev => ({ ...prev, [zone]: file })); setExtractionError(''); setExtractionSuccess(false); }
  };
  const clearZone = (zone) => { setPdfFiles(prev => ({ ...prev, [zone]: null })); setExtractionSuccess(false); setExtractionError(''); };

  // ── Multi-doc extraction
  const handleExtract = async () => {
    const uploaded = Object.entries(pdfFiles).filter(([, f]) => f !== null);
    if (uploaded.length === 0) return;
    setIsExtracting(true); setExtractionError(''); setExtractionSuccess(false);
    try {
      const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const documents = await Promise.all(uploaded.map(async ([label, file]) => ({ label, base64: await toBase64(file), mediaType: 'application/pdf' })));
      const extractVADocument = httpsCallable(functions, 'extractVADocument');
      const result = await extractVADocument({ documents });
      const d = result.data;
      if (d.veteranName)               setVeteranName(d.veteranName);
      if (d.vaLoanNumber)              setVaLoanNumber(d.vaLoanNumber);
      if (d.currentNoteRate != null)   setCurrentRatePct((d.currentNoteRate * 100).toFixed(3));
      if (d.currentPIPayment != null)  setCurrentPI(String(d.currentPIPayment.toFixed(2)));
      if (d.remainingBalance != null)  setRemainingBalance(String(d.remainingBalance.toFixed(2)));
      if (d.remainingTermMonths != null) setRemainingTerm(String(d.remainingTermMonths));
      if (d.propertyAddress)           setPropertyAddress(d.propertyAddress);
      if (d.fundingFeeExempt != null)  setFundingFeeExempt(d.fundingFeeExempt);
      setExtractionSuccess(true);
    } catch (err) {
      console.error('extractVADocument error:', err);
      setExtractionError(err.message || 'Extraction failed — please enter fields manually.');
    } finally { setIsExtracting(false); }
  };

  // ── New CC computed (use state vars to avoid ordering dependency)
  const _loanForCalc       = parseFloat(newLoanAmount) || parseFloat(remainingBalance) || 0;
  const _rateDecForCalc    = parseFloat(newRatePct) / 100 || 0;
  const perDiemDailyRate   = _loanForCalc > 0 && _rateDecForCalc > 0 ? (_loanForCalc * _rateDecForCalc) / 365 : 0;
  const ccPerDiemTotal     = perDiemDailyRate * (parseInt(ccPerDiemDays) || 15);
  const ccReqServicesTotal = [ccCreditReport, ccFloodDet, ccTaxMonitor, ccMERS, ccPayoffFee]
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const ccPrepaidsTotal    = ccPerDiemTotal + (parseFloat(ccHOIPremiumAnnual) || 0);
  const taxMonthlyEst      = taxResult?.monthly || 0;
  const hoiMonthlyEst      = parseFloat(ccHOIMonthly) || 0;
  const ccTaxReserve       = taxMonthlyEst * (parseInt(ccTaxMonthsRes) || 3);
  const ccHOIReserve       = hoiMonthlyEst * (parseInt(ccHOIMonthsRes) || 3);
  const ccEscrowTotal      = ccTaxReserve + ccHOIReserve;

  // ── Closing Cost Total (single source of truth)
  const ccItemizedTotal = [ccTitle, ccTitleIns, ccRecording, ccOrigination, ccProcessing, ccUnderwriting, ccOther]
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
    + (fundingFeeExempt ? 0 : (parseFloat(newLoanAmount || remainingBalance) || 0) * 0.005)
    + ccReqServicesTotal + ccPrepaidsTotal + ccEscrowTotal;
  const effectiveClosingCosts = ccMode === 'itemized' ? ccItemizedTotal : (parseFloat(closingCosts) || 0);

  const curRateDec   = parseFloat(currentRatePct) / 100 || 0;
  const newRateDec   = parseFloat(newRatePct) / 100 || 0;
  const curPIAmt     = parseFloat(currentPI) || 0;
  const remBal       = parseFloat(remainingBalance) || 0;
  const remTermMos   = parseInt(remainingTerm) || 360;
  const newLoanAmt   = parseFloat(newLoanAmount) || remBal;
  const newTermMos   = parseInt(newTerm) || 360;
  const costsAmt     = effectiveClosingCosts;

  // ── Adjusted recoupment (accounts for veteran cash to close) ─────────────
  const _vtCash      = parseFloat(veteranCashToClose) || 0;
  const _rolledIn    = Math.max(0, costsAmt - _vtCash);
  const _adjLoan     = remBal + _rolledIn;
  const _adjNewPI    = newRateDec > 0 && _adjLoan > 0 ? calcPI(_adjLoan, newRateDec, parseInt(newTerm) || 360) : 0;
  const _adjSavings  = parseFloat(currentPI) > 0 ? parseFloat(currentPI) - _adjNewPI : 0;
  const _adjRecoup   = _adjSavings > 0 ? (_rolledIn > 0 ? _rolledIn / _adjSavings : 0) : (_rolledIn === 0 ? 0 : Infinity);
  const rateReduction  = curRateDec - newRateDec;
  const newPICalc      = calcPI(newLoanAmt, newRateDec, newTermMos);
  const paymentSavings = curPIAmt - newPICalc;
  const recoupMos      = paymentSavings > 0 ? costsAmt / paymentSavings : Infinity;
  const rateTestPass     = rateReduction >= 0.005;
  const paymentTestPass  = paymentSavings > 0;
  const recoupTestPass   = recoupMos <= 36;
  const benefitTestPass  = rateTestPass && paymentTestPass;
  const fundingFeeAmt    = fundingFeeExempt ? 0 : newLoanAmt * 0.005;
  const totalLoanWFee    = newLoanAmt + fundingFeeAmt;
  const cashOut          = parseFloat(cashOutAmount) || 0;
  const appraisalVal     = parseFloat(cashOutAppraisalValue) || 0;
  const cashOutLoanAmt   = remBal + cashOut;
  const cashOutLTV       = appraisalVal > 0 ? (cashOutLoanAmt / appraisalVal) * 100 : 0;

  const addRateOption = () => setRateOptions(prev => [...prev, { id: Date.now(), lender: '', rate: '', apr: '', points: '', fees: '' }]);
  const updateRO = (id, field, val) => setRateOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: val } : o));
  const removeRO = (id) => setRateOptions(prev => prev.filter(o => o.id !== id));
  const navigate = (path) => { window.location.href = path; };

  const runTaxCalc = () => {
    const fmv = parseFloat(taxFMV) || 0;
    if (!fmv) return;
    if (taxState === 'GA' && GA_COUNTIES[taxCounty]) {
      const data = GA_COUNTIES[taxCounty];
      const totalMill = data.millage + (parseFloat(taxCityMills) || 0);
      const assessed = fmv * 0.40;
      const annual = assessed * (totalMill / 1000);
      setTaxResult({ fmv, assessed, totalMill, annual, monthly: annual / 12, due: data.due, note: data.note });
    } else {
      const annual = fmv * 0.011;
      setTaxResult({ fmv, assessed: null, annual, monthly: annual / 12, due: 'Check county', note: 'National avg (~1.1%)' });
    }
  };

  // ── SNAPSHOT TAB with THREE UPLOAD ZONES
  const renderSnapshot = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>🗂️ Upload VA Loan Documents</div>
        <div style={S.infoBox}>
          Upload up to three documents. Haiku AI extracts loan details from whichever files you provide. Each zone accepts one PDF — upload any combination.
        </div>

        {[
          { zone: 'coe',      ref: coeRef,      icon: '🎖️', label: 'VA Certificate of Eligibility (COE)',  sub: 'Veteran info · funding fee exemption status' },
          { zone: 'mortgage', ref: mortgageRef,  icon: '🏦', label: 'Mortgage Statement',                    sub: 'Current rate · P&I payment · remaining balance' },
          { zone: 'note',     ref: noteRef,      icon: '📄', label: 'VA Note',                               sub: 'Original loan number · loan terms' },
        ].map(({ zone, ref, icon, label, sub }) => {
          const file     = pdfFiles[zone];
          const dragging = isDragging[zone];
          return (
            <div key={zone} style={{ marginBottom: 10 }}>
              <div
                style={{
                  border: `2px dashed ${dragging ? '#0d3b6e' : file ? '#22c55e' : '#b0c4de'}`,
                  borderRadius: 10, padding: '14px 18px',
                  background: dragging ? '#eef4fb' : file ? '#f0fdf4' : '#f8fafc',
                  cursor: file ? 'default' : 'pointer',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 14,
                }}
                onDragOver={handleDragOver(zone)}
                onDragLeave={handleDragLeave(zone)}
                onDrop={handleDrop(zone)}
                onClick={() => { if (!file) ref.current?.click(); }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{file ? '✅' : icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: file ? '#166534' : '#1a1a2e' }}>{label}</div>
                  {file
                    ? <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>{file.name} · {(file.size / 1024).toFixed(1)} KB</div>
                    : <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 2 }}>{sub} · Drop here or click to browse</div>
                  }
                </div>
                {file && (
                  <button style={{ ...S.btn, ...S.btnRed, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); clearZone(zone); }}>
                    ✕ Remove
                  </button>
                )}
              </div>
              <input ref={ref} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileSelect(zone)} />
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            style={{ ...S.btn, ...S.btnPrimary, opacity: (Object.values(pdfFiles).every(f => !f) || isExtracting) ? 0.6 : 1 }}
            onClick={handleExtract}
            disabled={Object.values(pdfFiles).every(f => !f) || isExtracting}
          >
            {isExtracting ? '⏳ Extracting...' : '🤖 Extract with AI'}
          </button>
          {Object.values(pdfFiles).some(f => f) && (
            <button style={{ ...S.btn, ...S.btnSecondary }} onClick={() => { setPdfFiles({ coe: null, mortgage: null, note: null }); setExtractionSuccess(false); setExtractionError(''); }}>
              ✕ Clear All
            </button>
          )}
        </div>
        {extractionError   && <div style={{ ...S.errorBox,   marginTop: 10 }}>⚠️ {extractionError}</div>}
        {extractionSuccess && <div style={{ ...S.successBox, marginTop: 10 }}>✅ Extraction complete — review fields below and confirm accuracy.</div>}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>📋 Loan Details</div>
        <div style={S.grid2}>
          <div><label style={S.label}>Veteran Name</label><input style={S.input} value={veteranName} onChange={e => setVeteranName(e.target.value)} placeholder="e.g. James Holloway" /></div>
          <div><label style={S.label}>VA Loan Number</label><input style={S.input} value={vaLoanNumber} onChange={e => setVaLoanNumber(e.target.value)} placeholder="e.g. 2024-VA-001234" /></div>
          <div><label style={S.label}>Current Note Rate (%)</label><input style={S.input} type="number" step="0.001" value={currentRatePct} onChange={e => setCurrentRatePct(e.target.value)} placeholder="e.g. 6.750" /></div>
          <div><label style={S.label}>Current P&amp;I Payment ($)</label><input style={S.input} type="number" value={currentPI} onChange={e => setCurrentPI(e.target.value)} placeholder="e.g. 1850.00" /></div>
          <div><label style={S.label}>Remaining Principal Balance ($)</label><input style={S.input} type="number" value={remainingBalance} onChange={e => setRemainingBalance(e.target.value)} placeholder="e.g. 285000" /></div>
          <div><label style={S.label}>Remaining Term (months)</label><input style={S.input} type="number" value={remainingTerm} onChange={e => setRemainingTerm(e.target.value)} placeholder="e.g. 324" /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>Property Address</label><input style={S.input} value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St, City, State 00000" /></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={S.label}>VA Funding Fee Exemption Status</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {[
              { val: true,  label: '🎖️ EXEMPT — Service-Connected Disability', activeColor: '#166534', activeBg: '#f0fdf4' },
              { val: false, label: '💰 Not Exempt — 0.5% Applies',              activeColor: '#92400e', activeBg: '#fffbeb' },
              { val: null,  label: '❓ Unknown',                                 activeColor: '#4a5568', activeBg: '#f1f5f9' },
            ].map(opt => (
              <button key={String(opt.val)} onClick={() => setFundingFeeExempt(opt.val)} style={{ ...S.btn, fontSize: 12, background: fundingFeeExempt === opt.val ? opt.activeBg : '#f1f5f9', color: fundingFeeExempt === opt.val ? opt.activeColor : '#6b7a8d', border: fundingFeeExempt === opt.val ? `2px solid ${opt.activeColor}` : '2px solid transparent' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Closing Cost Estimator — single source of truth ── */}
      <div style={{ ...S.card, border: '2px solid #0d3b6e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>
          <div>
            <div style={S.cardTitle}>💵 Closing Cost Estimator</div>
            <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: -10 }}>
              This total flows into the Benefit Test, Pricing &amp; Comp, NTB Worksheet, and Net Commission automatically.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['itemized', 'lump'].map(mode => (
              <button key={mode} onClick={() => setCcMode(mode)} style={{ ...S.btn, fontSize: 12, padding: '6px 14px', background: ccMode === mode ? '#0d3b6e' : '#e9eef5', color: ccMode === mode ? '#fff' : '#1a1a2e' }}>
                {mode === 'itemized' ? '📋 Itemized' : '🔢 Lump Sum'}
              </button>
            ))}
          </div>
        </div>

        {ccMode === 'itemized' ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              {/* Title & Settlement */}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6 }}>TITLE &amp; SETTLEMENT</div>
              <div>
                <label style={S.label}>Title/Settlement Fee ($)</label>
                <input style={S.input} type="number" value={ccTitle} onChange={e => setCcTitle(e.target.value)} placeholder="850" />
              </div>
              <div>
                <label style={S.label}>Lender's Title Insurance ($)</label>
                <input style={S.input} type="number" value={ccTitleIns} onChange={e => setCcTitleIns(e.target.value)} placeholder="650" />
              </div>
              <div>
                <label style={S.label}>Recording Fees ($)</label>
                <input style={S.input} type="number" value={ccRecording} onChange={e => setCcRecording(e.target.value)} placeholder="125" />
              </div>

              {/* Lender Fees */}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6, marginTop: 4 }}>LENDER FEES</div>
              <div>
                <label style={S.label}>Origination Fee ($)</label>
                <input style={S.input} type="number" value={ccOrigination} onChange={e => setCcOrigination(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={S.label}>Processing Fee ($)</label>
                <input style={S.input} type="number" value={ccProcessing} onChange={e => setCcProcessing(e.target.value)} placeholder="895" />
              </div>
              <div>
                <label style={S.label}>Underwriting / Admin Fee ($)</label>
                <input style={S.input} type="number" value={ccUnderwriting} onChange={e => setCcUnderwriting(e.target.value)} placeholder="0" />
              </div>

              {/* VA & Other */}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6, marginTop: 4 }}>VA &amp; OTHER</div>
              <div>
                <label style={S.label}>VA Funding Fee ($)</label>
                <input style={{ ...S.inputRO, color: fundingFeeExempt ? '#166534' : '#92400e' }}
                  value={fundingFeeExempt === true ? '$0.00 — EXEMPT' : fundingFeeExempt === false ? fmtDollar((parseFloat(newLoanAmount || remainingBalance) || 0) * 0.005) : 'Set exemption status above'}
                  readOnly />
                <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 3 }}>Auto-calculated from exemption status</div>
              </div>
              <div>
                <label style={S.label}>Other Costs ($) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>prepaid, escrow, etc.</span></label>
                <input style={S.input} type="number" value={ccOther} onChange={e => setCcOther(e.target.value)} placeholder="0" />
              </div>

              {/* Required Services */}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6, marginTop: 4 }}>REQUIRED SERVICES (Section C)</div>
              <div><label style={S.label}>Credit Report ($)</label><input style={S.input} type="number" value={ccCreditReport} onChange={e => setCcCreditReport(e.target.value)} placeholder="45" /></div>
              <div><label style={S.label}>Flood Determination ($)</label><input style={S.input} type="number" value={ccFloodDet} onChange={e => setCcFloodDet(e.target.value)} placeholder="20" /></div>
              <div><label style={S.label}>Tax Monitoring ($)</label><input style={S.input} type="number" value={ccTaxMonitor} onChange={e => setCcTaxMonitor(e.target.value)} placeholder="85" /></div>
              <div><label style={S.label}>MERS Registration ($)</label><input style={S.input} type="number" value={ccMERS} onChange={e => setCcMERS(e.target.value)} placeholder="15" /></div>
              <div><label style={S.label}>Payoff Statement Fee ($)</label><input style={S.input} type="number" value={ccPayoffFee} onChange={e => setCcPayoffFee(e.target.value)} placeholder="30" /></div>
              {/* Prepaids */}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6, marginTop: 4 }}>PREPAIDS (Section F)</div>
              <div><label style={S.label}>Per Diem Days</label><input style={S.input} type="number" value={ccPerDiemDays} onChange={e => setCcPerDiemDays(e.target.value)} placeholder="15" /></div>
              <div><label style={S.label}>Per Diem Interest ($)</label><input style={S.inputRO} value={ccPerDiemTotal > 0 ? fmtDollar(ccPerDiemTotal) : '—'} readOnly /></div>
              <div><label style={S.label}>HOI Annual Premium ($)</label><input style={S.input} type="number" value={ccHOIPremiumAnnual} onChange={e => setCcHOIPremiumAnnual(e.target.value)} placeholder="e.g. 1200" /></div>
              {/* Escrow Setup */}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6, marginTop: 4 }}>INITIAL ESCROW SETUP (Section G)</div>
              <div><label style={S.label}>Property Tax Monthly ($)</label><input style={S.inputRO} value={taxMonthlyEst > 0 ? fmtDollar(taxMonthlyEst) : ''} readOnly placeholder="Run tax calc below" /></div>
              <div><label style={S.label}>Tax Reserve Months</label><input style={S.input} type="number" value={ccTaxMonthsRes} onChange={e => setCcTaxMonthsRes(e.target.value)} placeholder="3" /></div>
              <div><label style={S.label}>Tax Reserve Total ($)</label><input style={S.inputRO} value={ccTaxReserve > 0 ? fmtDollar(ccTaxReserve) : '—'} readOnly /></div>
              <div><label style={S.label}>HOI Monthly ($)</label><input style={S.input} type="number" value={ccHOIMonthly} onChange={e => setCcHOIMonthly(e.target.value)} placeholder="e.g. 100" /></div>
              <div><label style={S.label}>HOI Reserve Months</label><input style={S.input} type="number" value={ccHOIMonthsRes} onChange={e => setCcHOIMonthsRes(e.target.value)} placeholder="3" /></div>
              <div><label style={S.label}>HOI Reserve Total ($)</label><input style={S.inputRO} value={ccHOIReserve > 0 ? fmtDollar(ccHOIReserve) : '—'} readOnly /></div>
            </div>
            {/* Section subtotals */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Title+Lender+VA', value: [ccTitle,ccTitleIns,ccRecording,ccOrigination,ccProcessing,ccUnderwriting,ccOther].reduce((s,v)=>s+(parseFloat(v)||0),0)+(fundingFeeExempt?0:(_loanForCalc||0)*0.005) },
                { label: 'Required Svcs',   value: ccReqServicesTotal },
                { label: 'Prepaids',        value: ccPrepaidsTotal },
                { label: 'Escrow Setup',    value: ccEscrowTotal },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#eef4fb', borderRadius: 6, padding: '10px 12px', textAlign: 'center', border: '1px solid #b8d0e8' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a8d', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0d3b6e' }}>{fmtDollar(value)}</div>
                </div>
              ))}
            </div>
            {/* Itemized Total */}
            <div style={{ background: '#0d3b6e', borderRadius: 8, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 2 }}>TOTAL CLOSING COSTS (Cash to Close)</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Title + Lender + VA + Services + Prepaids + Escrow</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f9c846' }}>{fmtDollar(ccItemizedTotal)}</div>
            </div>
            {/* Property Tax Escrow Estimate */}
            <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e0e7ef', padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0d3b6e', marginBottom: 10 }}>🏠 Property Tax — Escrow Estimate</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label style={S.label}>State</label><select style={S.input} value={taxState} onChange={e => setTaxState(e.target.value)}><option value="GA">Georgia</option><option value="FL">Florida</option><option value="NC">North Carolina</option><option value="SC">South Carolina</option><option value="TN">Tennessee</option><option value="TX">Texas</option><option value="AL">Alabama</option></select></div>
                {taxState === 'GA' && <div><label style={S.label}>GA County</label><select style={S.input} value={taxCounty} onChange={e => setTaxCounty(e.target.value)}><option value="">— Select —</option>{Object.keys(GA_COUNTIES).sort().map(c => <option key={c} value={c}>{c} ({GA_COUNTIES[c].millage}m)</option>)}</select></div>}
                {taxState === 'GA' && <div><label style={S.label}>City Millage</label><input style={S.input} type="number" value={taxCityMills} onChange={e => setTaxCityMills(e.target.value)} placeholder="e.g. 12" /></div>}
                <div><label style={S.label}>FMV ($)</label><input style={S.input} type="number" value={taxFMV} onChange={e => setTaxFMV(e.target.value)} placeholder="e.g. 295000" /></div>
              </div>
              <button style={{ ...S.btn, ...S.btnPrimary, fontSize: 12 }} onClick={runTaxCalc}>📊 Calculate → Auto-fills Escrow</button>
              {taxResult && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {[
                    { label: 'Annual', value: fmtDollar(taxResult.annual) },
                    { label: 'Monthly', value: fmtDollar(taxResult.monthly) },
                    { label: (parseInt(ccTaxMonthsRes)||3)+'-Mo Reserve', value: fmtDollar(ccTaxReserve) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#eef4fb', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#6b7a8d', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0d3b6e' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ ...S.infoBox, marginBottom: 14 }}>
              Enter your total closing costs as a single number. Switch to Itemized mode for a line-by-line breakdown.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
              <div>
                <label style={S.label}>Total Closing Costs ($)</label>
                <input style={{ ...S.input, fontSize: 16, fontWeight: 700 }} type="number"
                  value={closingCosts} onChange={e => setClosingCosts(e.target.value)} placeholder="e.g. 3500" />
              </div>
              <div style={{ background: '#0d3b6e', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>TOTAL</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f9c846' }}>{fmtDollar(parseFloat(closingCosts) || 0)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBenefitTest = () => {
    const hasData  = curRateDec > 0 && newRateDec > 0;
    const vtCash   = parseFloat(veteranCashToClose) || 0;
    const rolledIn = Math.max(0, costsAmt - vtCash);
    const adjLoan  = remBal + rolledIn;
    const adjNewPI = newRateDec > 0 && adjLoan > 0 ? calcPI(adjLoan, newRateDec, newTermMos) : newPICalc;
    const adjSavings = curPIAmt > 0 ? curPIAmt - adjNewPI : 0;
    const adjRecoup  = adjSavings > 0 ? (rolledIn > 0 ? rolledIn / adjSavings : 0) : (rolledIn === 0 ? 0 : Infinity);
    const adjRecoupPass = adjRecoup <= 36;
    const ntbOk     = rateTestPass && adjSavings > 0;

    // ── Quick-Apply Presets ──────────────────────────────────────────────────
    // Preset A: Roll All In
    const presetA_cash    = 0;
    const presetA_loan    = remBal + costsAmt;
    const presetA_PI      = newRateDec > 0 ? calcPI(presetA_loan, newRateDec, newTermMos) : 0;
    const presetA_savings = curPIAmt > 0 ? curPIAmt - presetA_PI : 0;
    const presetA_recoup  = presetA_savings > 0 ? costsAmt / presetA_savings : Infinity;

    // Preset B: Min Cash for NTB Compliance (36-month recoup)
    const presetB_maxRoll  = presetA_savings > 0 ? Math.min(presetA_savings * 36, costsAmt) : 0;
    const presetB_cash     = Math.max(0, costsAmt - presetB_maxRoll);
    const presetB_loan     = remBal + presetB_maxRoll;
    const presetB_PI       = newRateDec > 0 ? calcPI(presetB_loan, newRateDec, newTermMos) : 0;
    const presetB_savings  = curPIAmt > 0 ? curPIAmt - presetB_PI : 0;
    const presetB_recoup   = presetB_savings > 0 && presetB_maxRoll > 0 ? presetB_maxRoll / presetB_savings : 0;

    // Preset C: Pay All Costs (zero rolled in)
    const presetC_cash     = costsAmt;
    const presetC_loan     = remBal;
    const presetC_PI       = newRateDec > 0 ? calcPI(presetC_loan, newRateDec, newTermMos) : 0;
    const presetC_savings  = curPIAmt > 0 ? curPIAmt - presetC_PI : 0;
    const presetC_recoup   = 0;

    // ── Same-Payment Preset — only meaningful if different from Roll All In
    const maxLoanSamePayment = curPIAmt > 0 && newRateDec > 0
      ? curPIAmt / (newRateDec / 12) * (1 - Math.pow(1 + newRateDec / 12, -newTermMos))
      : 0;
    const samePayMaxRoll  = Math.max(0, Math.min(costsAmt, maxLoanSamePayment - remBal));
    const samePayCash     = Math.max(0, costsAmt - samePayMaxRoll);
    const samePayDifferent = samePayCash > 50; // only show if meaningfully different from roll-all-in

    // ── Rate needed for 36-month recoup at current costs ────────────────────
    const minSavingsNeeded = costsAmt > 0 ? costsAmt / 36 : 0;
    const findRateForSavings = (targetSavings) => {
      if (!curPIAmt || !remBal || !newTermMos) return null;
      let lo = 0.001, hi = curRateDec * 100;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        const pi  = calcPI(remBal + costsAmt, mid / 100, newTermMos);
        if (curPIAmt - pi > targetSavings) lo = mid;
        else hi = mid;
      }
      return Math.min((lo + hi) / 2, curRateDec * 100 - 0.5);
    };
    const rateForCompliance = minSavingsNeeded > 0 ? findRateForSavings(minSavingsNeeded) : null;

    return (
      <div>

        {/* ══ SECTION 1 — New Loan Parameters ══════════════════════════════ */}
        <div style={S.card}>
          <div style={S.cardTitle}>🎯 New Loan Parameters</div>
          <div style={S.grid3}>
            <div>
              <label style={S.label}>New Note Rate (%)</label>
              <input style={S.input} type="number" step="0.001" value={newRatePct}
                onChange={e => setNewRatePct(e.target.value)} placeholder="e.g. 6.000" />
              {curRateDec > 0 && newRateDec > 0 && (
                <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: rateReduction >= 0.005 ? '#166534' : '#8b1a1a' }}>
                  {rateReduction > 0 ? `↓ ${fmtPct(rateReduction * 100)} reduction` : '↑ Rate increased — NTB will fail'}
                </div>
              )}
            </div>
            <div>
              <label style={S.label}>New Term (months)</label>
              <input style={S.input} type="number" value={newTerm}
                onChange={e => setNewTerm(e.target.value)} placeholder="360" />
            </div>
            <div>
              <label style={S.label}>Total Closing Costs ($) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— from Loan Snapshot</span></label>
              <input style={{ ...S.inputRO, color: costsAmt > 0 ? '#0d3b6e' : '#6b7a8d' }}
                value={costsAmt > 0 ? fmtDollar(costsAmt) : 'Enter costs on Loan Snapshot tab'} readOnly />
            </div>
          </div>
        </div>

        {/* ══ SECTION 2 — Benefit Test Results ═════════════════════════════ */}
        <div style={S.card}>
          <div style={S.cardTitle}>📊 Benefit Test Results</div>
          {[
            {
              label: 'Rate Reduction ≥ 0.50%',
              pass: rateTestPass,
              detail: hasData
                ? `${fmtPct(curRateDec * 100)} → ${fmtPct(newRateDec * 100)} = ${fmtPct(rateReduction * 100)} reduction`
                : 'Enter current and new rates above',
              rule: 'VA requires minimum 0.50% (50 bps) rate reduction for fixed-to-fixed IRRRL.',
            },
            {
              label: 'Lower Monthly P&I Payment',
              pass: adjSavings > 0,
              detail: curPIAmt > 0 && adjNewPI > 0
                ? `${fmtDollar(curPIAmt)} → ${fmtDollar(adjNewPI)} — saves ${fmtDollar(adjSavings)}/mo`
                : 'Enter current P&I on Loan Snapshot tab',
              rule: 'New P&I must be lower than existing P&I.',
            },
            {
              label: 'Recoupment of Costs ≤ 36 Months',
              pass: adjRecoupPass,
              detail: rolledIn === 0
                ? '✅ No costs rolled into loan — recoupment is instant'
                : adjSavings > 0
                  ? `${adjRecoup === Infinity ? '∞' : adjRecoup.toFixed(1)} months to recoup ${fmtDollar(rolledIn)} rolled in`
                  : 'Payment must decrease to calculate',
              rule: 'VA Circular 26-18-13: recoupment applies only to costs rolled into the loan.',
            },
          ].map((test, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: i < 2 ? '1px solid #f0f4f8' : 'none' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, flexShrink: 0, background: !hasData ? '#f1f5f9' : test.pass ? '#f0fdf4' : i === 2 ? '#fffbeb' : '#fdf0f0', color: !hasData ? '#6b7a8d' : test.pass ? '#166534' : i === 2 ? '#92400e' : '#8b1a1a' }}>
                {!hasData ? '—' : test.pass ? '✅ PASS' : i === 2 ? '⚠️ REVIEW' : '❌ FAIL'}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{test.label}</div>
                <div style={{ fontSize: 13, color: '#6b7a8d', marginTop: 2 }}>{test.detail}</div>
                <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 3, fontStyle: 'italic' }}>{test.rule}</div>
              </div>
            </div>
          ))}
          {hasData && curPIAmt > 0 && (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 8, background: ntbOk ? '#f0fdf4' : '#fdf0f0', border: `2px solid ${ntbOk ? '#86efac' : '#fca5a5'}` }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: ntbOk ? '#166534' : '#8b1a1a' }}>
                {ntbOk ? '✅ Net Tangible Benefit — SATISFIED' : '❌ Net Tangible Benefit — NOT MET'}
              </div>
              <div style={{ fontSize: 13, marginTop: 4, color: '#374151', lineHeight: 1.5 }}>
                {ntbOk
                  ? `Rate drops ${fmtPct(rateReduction * 100)} · saves ${fmtDollar(adjSavings)}/mo · ${adjRecoupPass ? `recouped in ${adjRecoup === 0 ? 'closing' : adjRecoup.toFixed(0) + ' months'}` : `recoupment ${adjRecoup.toFixed(0)} months — see structure builder below`}`
                  : `Rate reduction of ${fmtPct(rateReduction * 100)} does not meet the 0.50% minimum. Lower the rate or restructure.`}
              </div>
            </div>
          )}
        </div>

        {/* ══ SECTION 3 — Loan Structure Builder ═══════════════════════════ */}
        {hasData && curPIAmt > 0 && costsAmt > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>🏗️ Loan Structure Builder</div>
            <div style={S.infoBox}>
              Choose how much the veteran pays at closing. The more they bring, the less rolls into the loan — improving both payment savings and recoupment. Use the quick-apply buttons or enter a custom amount.
            </div>

            {/* Quick-Apply Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: samePayDifferent ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                {
                  label: 'Roll All In',
                  sub: 'Veteran pays $0',
                  cash: presetA_cash,
                  recoup: presetA_recoup,
                  ok: presetA_recoup <= 36,
                },
                ...(samePayDifferent ? [{
                  label: 'Same Payment',
                  sub: `Veteran pays ${fmtDollar(samePayCash)}`,
                  cash: samePayCash,
                  recoup: presetB_recoup,
                  ok: true,
                }] : []),
                {
                  label: 'NTB Compliant',
                  sub: `Veteran pays ${fmtDollar(presetB_cash)}`,
                  cash: presetB_cash,
                  recoup: presetB_recoup,
                  ok: true,
                },
                {
                  label: 'Pay All Costs',
                  sub: `Veteran pays ${fmtDollar(presetC_cash)}`,
                  cash: presetC_cash,
                  recoup: 0,
                  ok: true,
                },
              ].map((preset) => {
                const isActive = Math.abs(vtCash - preset.cash) < 1;
                return (
                  <button
                    key={preset.label}
                    onClick={() => setVeteranCashToClose(String(preset.cash.toFixed(2)))}
                    style={{
                      border: `2px solid ${isActive ? '#0d3b6e' : preset.ok ? '#86efac' : '#f9c846'}`,
                      borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                      background: isActive ? '#0d3b6e' : preset.ok ? '#f0fdf4' : '#fffbeb',
                      color: isActive ? '#fff' : '#1a1a2e', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{preset.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{preset.sub}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: isActive ? '#f9c846' : preset.ok ? '#166534' : '#92400e' }}>
                      {preset.recoup === 0 ? 'Instant recoup ✅' : preset.ok ? `${preset.recoup.toFixed(0)} mo recoup ✅` : `${preset.recoup.toFixed(0)} mo ⚠️`}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Cash Input */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={S.label}>Veteran Cash to Close ($) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— or enter custom</span></label>
                <input style={S.input} type="number" value={veteranCashToClose}
                  onChange={e => setVeteranCashToClose(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={S.label}>Costs Rolled into Loan ($)</label>
                <input style={{ ...S.inputRO, color: rolledIn > 0 ? '#92400e' : '#166534' }}
                  value={fmtDollar(rolledIn)} readOnly />
              </div>
              <div>
                <label style={S.label}>New Loan Amount ($)</label>
                <input style={S.inputRO} value={fmtDollar(adjLoan)} readOnly />
              </div>
            </div>

            {/* Live Results Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'New P&I', value: adjNewPI > 0 ? fmtDollar(adjNewPI) : '—', color: '#0d3b6e', bg: '#eef4fb' },
                { label: 'Monthly Savings', value: adjSavings > 0 ? fmtDollar(adjSavings) : '—', color: adjSavings > 0 ? '#166534' : '#6b7a8d', bg: '#f0fdf4' },
                { label: 'Recoupment', value: adjRecoup === 0 ? 'Instant' : adjRecoup === Infinity ? '∞' : `${adjRecoup.toFixed(1)} mo`, color: adjRecoupPass ? '#166534' : '#92400e', bg: adjRecoupPass ? '#f0fdf4' : '#fffbeb' },
                { label: 'NTB Status', value: ntbOk ? '✅ PASS' : '❌ FAIL', color: ntbOk ? '#166534' : '#8b1a1a', bg: ntbOk ? '#f0fdf4' : '#fdf0f0' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6b7a8d', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Recoupment Bar */}
            {rolledIn > 0 && adjSavings > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a8d', marginBottom: 6 }}>
                  <span>Recoupment Period</span>
                  <span style={{ fontWeight: 700, color: adjRecoupPass ? '#166534' : '#92400e' }}>
                    {adjRecoup.toFixed(1)} months {adjRecoupPass ? '✅' : `— ${(adjRecoup - 36).toFixed(1)} over limit`}
                  </span>
                </div>
                <div style={{ height: 12, background: '#e0e7ef', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', width: `${Math.min((adjRecoup / 48) * 100, 100)}%`, background: adjRecoupPass ? '#22c55e' : '#ef4444', borderRadius: 6, transition: 'width 0.3s' }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(36 / 48) * 100}%`, width: 2, background: '#0d3b6e' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9aa5b4', marginTop: 4 }}>
                  <span>0 mo</span>
                  <span style={{ color: '#0d3b6e', fontWeight: 700 }}>36 mo VA limit</span>
                  <span>48 mo</span>
                </div>
              </div>
            )}

            {/* Rate Fix Tip — only when recoup fails and all costs rolled in */}
            {!adjRecoupPass && rolledIn > 0 && rateForCompliance && rateForCompliance > 0 && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: '#eef4fb', borderRadius: 8, border: '1px solid #b8d0e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#1a4a7e' }}>
                  💡 To pass recoupment without veteran cash, you need a rate of <strong>≤ {rateForCompliance.toFixed(3)}%</strong> — a {fmtPct(curRateDec * 100 - rateForCompliance)}% reduction from today's rate.
                </div>
                <button style={{ ...S.btn, ...S.btnPrimary, fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap' }}
                  onClick={() => setNewRatePct(rateForCompliance.toFixed(3))}>
                  Apply {rateForCompliance.toFixed(3)}%
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ SECTION 4 — Veteran Summary Card ════════════════════════════ */}
        {hasData && curPIAmt > 0 && adjNewPI > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #0d3b6e 0%, #154a8a 100%)', borderRadius: 10, padding: '20px 24px', color: '#fff' }}>
            <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.1em', marginBottom: 4 }}>FOR THE VETERAN — PLAIN ENGLISH</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
              Here's what this refinance means for you{veteranName ? `, ${veteranName.split(',')[0]}` : ''}:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Current payment', value: fmtDollar(curPIAmt), sub: 'P&I per month today' },
                { label: 'New payment', value: fmtDollar(adjNewPI), sub: adjSavings > 0 ? `saves ${fmtDollar(adjSavings)}/mo` : 'same as current' },
                { label: 'Cash at closing', value: vtCash > 0 ? fmtDollar(vtCash) : '$0.00', sub: vtCash > 0 ? 'one-time payment' : 'nothing out of pocket' },
                { label: 'Break-even', value: adjRecoup === 0 ? 'Immediate' : adjRecoup === Infinity ? 'N/A' : `${adjRecoup.toFixed(0)} months`, sub: adjRecoup > 0 && adjRecoup !== Infinity ? `~${(adjRecoup / 12).toFixed(1)} years` : '' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#f9c846' }}>{value}</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 16px', fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.9)' }}>
              {adjSavings > 0
                ? `Your rate drops from ${fmtPct(curRateDec * 100)} to ${fmtPct(newRateDec * 100)} — saving you ${fmtDollar(adjSavings)} every month.${vtCash > 0 ? ` You bring ${fmtDollar(vtCash)} to closing.` : ' You bring nothing to closing.'}${adjRecoup > 0 && adjRecoup !== Infinity ? ` Your break-even point is ${adjRecoup.toFixed(0)} months — after that, every month is pure savings.` : adjRecoup === 0 ? ' Since you are paying your closing costs out of pocket, you start saving immediately.' : ''}`
                : `Your rate drops from ${fmtPct(curRateDec * 100)} to ${fmtPct(newRateDec * 100)}. Adjust the structure above to find the right balance for your situation.`
              }
            </div>
          </div>
        )}
      </div>
    );
  };


  const renderIRRRLFlag = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>🚩 IRRRL-to-IRRRL Identification</div>
        <div style={S.infoBox}>VA permits refinancing a prior IRRRL with a new IRRRL. However, VA Circular 26-19-22 requires lenders to separately document that the veteran has recouped the costs of the prior IRRRL before proceeding with the new one.</div>
        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Is the loan being refinanced itself a prior VA IRRRL?</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={() => setPriorIRRRL(true)}  style={{ ...S.btn, ...(priorIRRRL ? S.btnPrimary : S.btnSecondary) }}>🚩 Yes — Prior IRRRL</button>
            <button onClick={() => setPriorIRRRL(false)} style={{ ...S.btn, ...(!priorIRRRL ? S.btnPrimary : S.btnSecondary) }}>✅ No — Original VA Loan</button>
          </div>
        </div>
        {priorIRRRL && (
          <div>
            <div style={{ ...S.warningBox, marginBottom: 14 }}>⚠️ <strong>IRRRL-to-IRRRL Flag Active.</strong> Per VA Circular 26-19-22, you must document that the veteran has recouped all costs from the prior IRRRL before the new IRRRL can close. Include the prior HUD-1 or Closing Disclosure in the loan file.</div>
            <div style={S.grid2}>
              <div><label style={S.label}>Prior IRRRL Closing Date</label><input style={S.input} type="date" value={priorIRRRLDate} onChange={e => setPriorIRRRLDate(e.target.value)} /></div>
              <div><label style={S.label}>Prior IRRRL Lender Name</label><input style={S.input} value={priorIRRRLLender} onChange={e => setPriorIRRRLLender(e.target.value)} placeholder="Lender name" /></div>
            </div>
            {priorIRRRLDate && <div style={{ ...S.infoBox, marginTop: 12 }}>📅 Prior IRRRL closed: <strong>{new Date(priorIRRRLDate).toLocaleDateString()}</strong>. Confirm cost recoupment was achieved before this date and document in the file.</div>}
          </div>
        )}
      </div>
      <div style={S.card}>
        <div style={S.cardTitle}>📋 VA IRRRL Eligibility Checklist (VA Lender Handbook Ch. 6)</div>
        {[
          { rule: 'Loan being refinanced is an existing VA-guaranteed loan',              pass: true },
          { rule: 'Veteran certifies prior loan was used for personal occupancy',         pass: true },
          { rule: 'Rate reduced by ≥ 0.50% (fixed-to-fixed)',                            pass: rateTestPass },
          { rule: 'No cash-out to veteran (closing costs may be rolled in)',              pass: true },
          { rule: 'No appraisal required — streamline process',                          pass: true },
          { rule: 'No income verification required — streamline process',                pass: true },
          { rule: 'IRRRL-to-IRRRL recoupment documented (if applicable)',                pass: !priorIRRRL || !!priorIRRRLDate },
          { rule: 'Funding fee determined (0.5% or exempt if service-connected)',        pass: fundingFeeExempt !== null },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 7 ? '1px solid #f0f4f8' : 'none' }}>
            <span style={{ fontSize: 17, flexShrink: 0 }}>{item.pass ? '✅' : '⏳'}</span>
            <span style={{ fontSize: 13, color: item.pass ? '#1a1a2e' : '#6b7a8d' }}>{item.rule}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderFundingFee = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>💰 VA Funding Fee Calculator</div>
        <div style={S.infoBox}>VA IRRRL funding fee: <strong>0.50%</strong> of the new loan amount. Veterans with a service-connected disability rating of any percentage are fully exempt per 38 U.S.C. § 3729(c).</div>
        <div style={{ padding: '16px 18px', borderRadius: 8, marginBottom: 18, background: fundingFeeExempt === true ? '#f0fdf4' : fundingFeeExempt === false ? '#fffbeb' : '#f8fafc', border: `2px solid ${fundingFeeExempt === true ? '#86efac' : fundingFeeExempt === false ? '#f9c846' : '#e0e7ef'}` }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {fundingFeeExempt === true  && '🎖️ EXEMPT — Service-Connected Disability — Funding Fee Waived'}
            {fundingFeeExempt === false && '💰 NOT EXEMPT — Standard IRRRL Rate Applies (0.50%)'}
            {fundingFeeExempt === null  && '❓ Exemption status not set — set it on the Loan Snapshot tab'}
          </div>
          {fundingFeeExempt === true  && <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>Per 38 U.S.C. § 3729(c). No funding fee charged. Document disability rating letter in the loan file.</div>}
          {fundingFeeExempt === false && <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>0.50% of the new loan amount. May be rolled into the loan or paid at closing.</div>}
        </div>
        <div style={S.grid3}>
          <div><label style={S.label}>New Loan Amount ($)</label><input style={S.input} type="number" value={newLoanAmount || remainingBalance} onChange={e => setNewLoanAmount(e.target.value)} placeholder="285000" /></div>
          <div><label style={S.label}>Funding Fee Rate</label><input style={S.inputRO} value={fundingFeeExempt ? '0.000% (Exempt)' : '0.500%'} readOnly /></div>
          <div><label style={S.label}>Funding Fee Amount</label><input style={{ ...S.inputRO, color: fundingFeeExempt ? '#166534' : '#92400e' }} value={fundingFeeExempt ? '$0.00 (Waived)' : fmtDollar(fundingFeeAmt)} readOnly /></div>
        </div>
        {!fundingFeeExempt && newLoanAmt > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Funding Fee Disposition</div>
            <div style={S.grid2}>
              <div style={{ ...S.card, background: '#f8fafc', padding: 16, marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7a8d' }}>Option A — Roll Into Loan</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0d3b6e', margin: '6px 0 2px' }}>{fmtDollar(totalLoanWFee)}</div>
                <div style={{ fontSize: 12, color: '#6b7a8d' }}>Total loan amount including fee</div>
                <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 4 }}>New P&I at this amount: <strong>{fmtDollar(calcPI(totalLoanWFee, newRateDec, newTermMos))}</strong></div>
              </div>
              <div style={{ ...S.card, background: '#f8fafc', padding: 16, marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7a8d' }}>Option B — Paid at Closing</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#92400e', margin: '6px 0 2px' }}>{fmtDollar(fundingFeeAmt)}</div>
                <div style={{ fontSize: 12, color: '#6b7a8d' }}>Out-of-pocket cost at closing</div>
                <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 4 }}>Base loan P&I: <strong>{fmtDollar(newPICalc)}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={S.card}>
        <div style={S.cardTitle}>📖 VA Funding Fee Reference (for VA Cash-Out comparison)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f1f5f9' }}>{['Loan Type', '1st Use', '2nd+ Use', 'Exempt'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d' }}>{h}</th>)}</tr></thead>
          <tbody>
            {[['VA IRRRL', '0.50%', '0.50%', '✅ Service-connected disability'], ['VA Purchase — 0% down', '2.15%', '3.30%', '✅ Service-connected disability'], ['VA Purchase — 5%+ down', '1.50%', '1.50%', '✅ Service-connected disability'], ['VA Cash-Out Refi', '2.15%', '3.30%', '✅ Service-connected disability']].map(([type, first, repeat, exempt]) => (
              <tr key={type} style={{ borderBottom: '1px solid #f0f4f8' }}>
                <td style={{ padding: '8px 10px', fontWeight: type === 'VA IRRRL' ? 700 : 400, color: type === 'VA IRRRL' ? '#0d3b6e' : '#1a1a2e' }}>{type}</td>
                <td style={{ padding: '8px 10px' }}>{first}</td>
                <td style={{ padding: '8px 10px' }}>{repeat}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: '#166534' }}>{exempt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderNTBWorksheet = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print NTB Worksheet</button></div>
      <div style={{ ...S.card, fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 22, borderBottom: '2px solid #0d3b6e', paddingBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.02em' }}>NET TANGIBLE BENEFIT WORKSHEET</div>
          <div style={{ fontSize: 14, color: '#5a6a7e', marginTop: 4 }}>VA Interest Rate Reduction Refinance Loan (IRRRL)</div>
          <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>Prepared by LoanBeacons™ · For Lender File Documentation</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {[['Veteran Name', veteranName || '___________________________'], ['VA Loan Number', vaLoanNumber || '___________________________'], ['Property Address', propertyAddress || '___________________________'], ['Worksheet Date', new Date().toLocaleDateString()]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 0' }}>
              <span style={{ width: 160, fontSize: 12, fontWeight: 700, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
              <span style={{ fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          {[
            { title: 'EXISTING LOAN', rows: [['Current Note Rate', curRateDec ? fmtPct(curRateDec * 100) : '________%'], ['Current P&I Payment', curPIAmt ? fmtDollar(curPIAmt) : '$__________'], ['Remaining Balance', remBal ? fmtDollar(remBal) : '$__________'], ['Remaining Term', remTermMos ? `${remTermMos} months` : '________ months']] },
            { title: 'PROPOSED VA IRRRL', rows: [
              ['New Note Rate',           newRateDec ? fmtPct(newRateDec * 100) : '________%'],
              ['New Loan Amount',         _adjLoan > 0 ? fmtDollar(_adjLoan) : '$__________'],
              ['New P&I Payment',         _adjNewPI > 0 ? fmtDollar(_adjNewPI) : '$__________'],
              ['New Term',                newTermMos ? `${newTermMos} months` : '________ months'],
              ['Veteran Cash to Close',   _vtCash > 0 ? fmtDollar(_vtCash) : '$0.00 (all costs rolled in)'],
              ['Costs Rolled into Loan',  fmtDollar(_rolledIn)],
              ['VA Funding Fee',          fundingFeeExempt !== null ? (fundingFeeExempt ? '$0.00 (Service-Connected Exempt)' : fmtDollar(fundingFeeAmt)) : '$__________'],
            ]},
          ].map(section => (
            <div key={section.title} style={{ marginBottom: 16 }}>
              <div style={{ background: '#0d3b6e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 4, marginBottom: 6, letterSpacing: '0.08em' }}>{section.title}</div>
              {section.rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 4px' }}>
                  <span style={{ width: 220, fontSize: 12, fontWeight: 600, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
                  <span style={{ fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ background: '#0d3b6e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 4, marginBottom: 6, letterSpacing: '0.08em' }}>NET TANGIBLE BENEFIT DETERMINATION</div>
        {[['Rate Reduction', fmtPct(rateReduction * 100), rateTestPass ? 'PASS ✅' : 'FAIL ❌'], ['Monthly Payment Savings', _adjSavings ? fmtDollar(_adjSavings) : '—', _adjSavings > 0 ? 'PASS ✅' : 'FAIL ❌'], ['Recoupment Period', _adjRecoup === Infinity ? 'N/A' : `${_adjRecoup.toFixed(1)} months`, _adjRecoup <= 36 ? 'PASS ✅' : 'REVIEW ⚠️'], ['Net Tangible Benefit', '', (rateTestPass && _adjSavings > 0) ? 'SATISFIED ✅' : 'NOT MET ❌']].map(([k, v, r]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 4px', alignItems: 'center' }}>
            <span style={{ width: 220, fontSize: 12, fontWeight: 600, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
            <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.includes('✅') ? '#166534' : r.includes('❌') ? '#8b1a1a' : '#92400e' }}>{r}</span>
          </div>
        ))}
        <div style={{ borderTop: '2px solid #0d3b6e', paddingTop: 20, marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Loan Officer Signature', 'NMLS ID', 'Date'].map(label => (<div key={label}><div style={{ borderBottom: '1px solid #1a1a2e', height: 32, marginBottom: 5 }} /><div style={{ fontSize: 11, color: '#6b7a8d' }}>{label}</div></div>))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRateShop = () => {
    const bestRateOpt = rateOptions.filter(o => o.rate).sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];
    const bestAPROpt  = rateOptions.filter(o => o.apr).sort((a, b) => parseFloat(a.apr) - parseFloat(b.apr))[0];
    return (
      <div>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={S.cardTitle}>🏦 Rate Shopping Comparison</div>
            <button style={{ ...S.btn, ...S.btnGhost, fontSize: 12 }} onClick={addRateOption}>+ Add Lender</button>
          </div>
          <div style={S.infoBox}>VA policy requires good faith rate estimates. Compare <strong>APR</strong> — not just rate — to account for points and lender fees. Current balance: <strong>{remBal ? fmtDollar(remBal) : '—'}</strong> · Current P&I: <strong>{curPIAmt ? fmtDollar(curPIAmt) : '—'}</strong></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f1f5f9' }}>{['Lender', 'Note Rate %', 'APR %', 'Points', 'Lender Fees', 'Est. P&I', 'vs Current', ''].map(h => <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rateOptions.map((opt, i) => {
                  const r = parseFloat(opt.rate) / 100 || 0;
                  const piEst = calcPI(newLoanAmt || remBal, r, newTermMos);
                  const savings = curPIAmt > 0 && piEst > 0 ? curPIAmt - piEst : null;
                  const isBestRate = bestRateOpt?.id === opt.id;
                  const isBestAPR  = bestAPROpt?.id === opt.id;
                  return (
                    <tr key={opt.id} style={{ borderBottom: '1px solid #f0f4f8', background: isBestRate ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '8px 10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input style={{ ...S.input, minWidth: 120 }} value={opt.lender} onChange={e => updateRO(opt.id, 'lender', e.target.value)} placeholder={`Lender ${i + 1}`} />{isBestRate && <span style={{ fontSize: 10, background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>★ Best Rate</span>}{isBestAPR && !isBestRate && <span style={{ fontSize: 10, background: '#eef4fb', color: '#1a4a7e', padding: '2px 6px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>★ Best APR</span>}</div></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...S.input, width: 72 }} type="number" step="0.001" value={opt.rate} onChange={e => updateRO(opt.id, 'rate', e.target.value)} placeholder="6.000" /></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...S.input, width: 72 }} type="number" step="0.001" value={opt.apr}  onChange={e => updateRO(opt.id, 'apr',  e.target.value)} placeholder="6.125" /></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...S.input, width: 64 }} type="number" step="0.125" value={opt.points} onChange={e => updateRO(opt.id, 'points', e.target.value)} placeholder="0.000" /></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...S.input, width: 80 }} type="number" value={opt.fees} onChange={e => updateRO(opt.id, 'fees', e.target.value)} placeholder="1500" /></td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r > 0 && (newLoanAmt > 0 || remBal > 0) ? fmtDollar(piEst) : '—'}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: savings > 0 ? '#166534' : savings < 0 ? '#8b1a1a' : '#6b7a8d' }}>{savings !== null ? (savings > 0 ? `+${fmtDollar(savings)}` : fmtDollar(savings)) : '—'}</td>
                      <td style={{ padding: '8px 10px' }}><button style={{ ...S.btn, ...S.btnRed }} onClick={() => removeRO(opt.id)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderUWWorksheet = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print UW Worksheet</button></div>
      <div style={{ ...S.card, fontFamily: 'Georgia, serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #0d3b6e', paddingBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0d3b6e' }}>VA IRRRL UNDERWRITING WORKSHEET</div>
          <div style={{ fontSize: 13, color: '#6b7a8d' }}>For Internal Lender File — LoanBeacons™</div>
          <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>Generated: {new Date().toLocaleDateString()}</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0d3b6e', marginBottom: 8, letterSpacing: '0.05em' }}>LOAN SUMMARY</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {[['Veteran', veteranName || '—'], ['VA Loan #', vaLoanNumber || '—'], ['Property', propertyAddress?.split(',')[0] || '—'], ['Current Rate', curRateDec ? fmtPct(curRateDec * 100) : '—'], ['New Rate', newRateDec ? fmtPct(newRateDec * 100) : '—'], ['Rate Reduction', rateReduction ? fmtPct(rateReduction * 100) : '—'], ['Current P&I', fmtDollar(curPIAmt)], ['New P&I', fmtDollar(_adjNewPI || newPICalc)], ['Monthly Savings', fmtDollar(_adjSavings)], ['Funding Fee', fundingFeeExempt !== null ? (fundingFeeExempt ? 'EXEMPT 🎖️' : fmtDollar(fundingFeeAmt)) : '—'], ['New Loan Amt', fmtDollar(_adjLoan || newLoanAmt)], ['NTB Status', benefitTestPass ? 'SATISFIED ✅' : curRateDec > 0 ? 'NOT MET ❌' : 'Pending']].map(([label, val]) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', border: '1px solid #e0e7ef' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a8d', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0d3b6e', marginBottom: 8, letterSpacing: '0.05em' }}>UNDERWRITING CHECKLIST</div>
        {[
          { item: 'Existing VA-guaranteed loan confirmed',                              done: !!vaLoanNumber },
          { item: 'NTB test passed — rate reduced ≥ 0.50%',                           done: rateTestPass },
          { item: 'Monthly payment confirmed lower',                                   done: paymentTestPass },
          { item: 'VA Funding fee determined (exempt or 0.5%)',                        done: fundingFeeExempt !== null },
          { item: 'IRRRL-to-IRRRL reviewed and documented',                            done: !priorIRRRL || !!priorIRRRLDate },
          { item: 'No appraisal required — VA IRRRL streamline confirmed',             done: true },
          { item: 'No income/employment verification required — streamline confirmed', done: true },
          { item: 'COE in file or entitlement confirmed',                              done: false },
          { item: 'Title search completed / title insurance ordered',                  done: false },
          { item: 'Homeowners insurance verified current',                             done: false },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 4px', borderBottom: '1px solid #f0f4f8', alignItems: 'center' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{row.done ? '✅' : '⏳'}</span>
            <span style={{ fontSize: 12 }}>{row.item}</span>
          </div>
        ))}
        <div style={{ borderTop: '2px solid #0d3b6e', paddingTop: 18, marginTop: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Loan Officer / NMLS ID', 'Underwriter / NMLS ID', 'Date'].map(label => (<div key={label}><div style={{ borderBottom: '1px solid #1a1a2e', height: 32, marginBottom: 5 }} /><div style={{ fontSize: 10, color: '#6b7a8d' }}>{label}</div></div>))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderCashOut = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>💵 VA Cash-Out Refinance</div>
        <div style={{ ...S.warningBox, marginBottom: 14 }}>⚠️ <strong>VA Cash-Out is NOT an IRRRL.</strong> It requires a full appraisal, income verification, and credit qualification. Use this tab only if the veteran's goal includes cash out — the loan product changes entirely.</div>
        <div style={S.infoBox}><strong>Type I:</strong> New loan amount does not exceed the existing payoff — no net cash to borrower. Still requires full underwriting.<br /><strong>Type II:</strong> New loan amount exceeds the existing payoff — veteran receives cash at closing. Full underwriting + appraisal + LTV limits apply.</div>
        <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
          {[{ val: 'typeI', label: 'Type I — No Net Cash Out' }, { val: 'typeII', label: 'Type II — Cash Out to Borrower' }].map(opt => (
            <button key={opt.val} onClick={() => setCashOutType(opt.val)} style={{ ...S.btn, ...(cashOutType === opt.val ? S.btnPrimary : S.btnSecondary) }}>{opt.label}</button>
          ))}
        </div>
        <div style={S.grid3}>
          <div><label style={S.label}>Appraised Value ($)</label><input style={S.input} type="number" value={cashOutAppraisalValue} onChange={e => setCashOutAppraisalValue(e.target.value)} placeholder="350000" /></div>
          <div><label style={S.label}>Existing Payoff Balance ($)</label><input style={S.input} type="number" value={remainingBalance} onChange={e => setRemainingBalance(e.target.value)} placeholder="285000" /></div>
          {cashOutType === 'typeII' && <div><label style={S.label}>Cash-Out Amount to Borrower ($)</label><input style={S.input} type="number" value={cashOutAmount} onChange={e => setCashOutAmount(e.target.value)} placeholder="20000" /></div>}
        </div>
        {appraisalVal > 0 && remBal > 0 && (
          <div style={{ ...S.card, background: '#f8fafc', marginTop: 14, marginBottom: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>LTV Analysis</div>
            <div style={S.grid3}>
              {[['New Loan Amount', fmtDollar(cashOutLoanAmt)], ['Appraised Value', fmtDollar(appraisalVal)], ['LTV', `${cashOutLTV.toFixed(2)}%`]].map(([label, val]) => (
                <div key={label}><div style={{ fontSize: 12, fontWeight: 600, color: '#6b7a8d' }}>{label}</div><div style={{ fontSize: 20, fontWeight: 800, color: cashOutLTV > 100 ? '#8b1a1a' : '#0d3b6e', marginTop: 4 }}>{val}</div></div>
              ))}
            </div>
            {cashOutLTV > 100 && <div style={{ ...S.errorBox, marginTop: 12 }}>❌ LTV exceeds 100% — VA Cash-Out maximum is 100% LTV. Many investors cap at 90%. Reduce cash-out amount or verify appraised value.</div>}
            {cashOutLTV <= 100 && cashOutLTV > 0 && <div style={{ ...S.successBox, marginTop: 12 }}>✅ LTV of {cashOutLTV.toFixed(2)}% is within VA Cash-Out limits (max 100%). Confirm investor overlay.</div>}
          </div>
        )}
      </div>
      <div style={S.card}>
        <div style={S.cardTitle}>📊 VA IRRRL vs Cash-Out — Side-by-Side</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f1f5f9' }}>{['Feature', 'VA IRRRL (Streamline)', 'VA Cash-Out Refi'].map(h => <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d' }}>{h}</th>)}</tr></thead>
          <tbody>
            {[['Appraisal', 'Not required', 'Required'], ['Income verification', 'Not required', 'Required'], ['Credit qualifying', 'Not required', 'Required'], ['Cash to borrower', 'Not permitted', 'Permitted (Type II)'], ['Max LTV', 'N/A (no appraisal)', '100% (lender overlays may be lower)'], ['Funding fee', '0.5%', '2.15% (1st use) / 3.30% (subsequent)'], ['Certificate of Occ.', 'Not required', 'Required if new construction'], ['Turn time', 'Faster (streamline)', 'Standard full-doc timeline']].map(([feature, irrrl, cashout]) => (
              <tr key={feature} style={{ borderBottom: '1px solid #f0f4f8' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#6b7a8d' }}>{feature}</td>
                <td style={{ padding: '8px 10px', color: '#166534' }}>{irrrl}</td>
                <td style={{ padding: '8px 10px', color: '#92400e' }}>{cashout}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDocChecklist = () => {
    const total    = DOC_ITEMS.length;
    const checked  = Object.values(checkedDocs).filter(Boolean).length;
    const pct      = Math.round((checked / total) * 100);
    return (
      <div>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={S.cardTitle}>✔️ VA IRRRL Document Checklist</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0d3b6e' }}>{checked} / {total} collected</div>
          </div>
          <div style={S.infoBox}>VA IRRRL is a streamline refinance — no appraisal, no income docs. Lenders may have additional overlays. Always confirm with your investor.</div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a8d', marginBottom: 5 }}><span>Collection Progress</span><span>{pct}%</span></div>
            <div style={{ height: 8, background: '#e0e7ef', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#0d3b6e', borderRadius: 4, transition: 'width 0.3s' }} /></div>
          </div>
          {DOC_ITEMS.map(item => {
            const isChecked     = !!checkedDocs[item.id];
            const showIRRRLTag  = item.tag === 'irrrl'  && priorIRRRL;
            const showExemptTag = item.tag === 'exempt' && fundingFeeExempt === true;
            return (
              <div key={item.id} onClick={() => setCheckedDocs(prev => ({ ...prev, [item.id]: !prev[item.id] }))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s', background: isChecked ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isChecked ? '#86efac' : '#e0e7ef'}` }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: isChecked ? '#22c55e' : '#fff', border: `2px solid ${isChecked ? '#22c55e' : '#d0dbe8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{isChecked ? '✓' : ''}</div>
                <span style={{ fontSize: 14, flex: 1, textDecoration: isChecked ? 'line-through' : 'none', color: isChecked ? '#5a7a6e' : '#1a1a2e' }}>{item.label}</span>
                {showIRRRLTag  && <span style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>Required — IRRRL-to-IRRRL</span>}
                {showExemptTag && <span style={{ fontSize: 11, background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>Required — Fee Exemption</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  const renderNetCommission = () => {
    const baseLoan    = newLoanAmt || remBal || 0;
    const currentRate = curRateDec ? (curRateDec * 100).toFixed(3) : null;
    const proposedRate = newRateDec ? (newRateDec * 100).toFixed(3) : null;
    const ntbPass     = benefitTestPass;

    // Sync % ↔ bps
    const handlePctChange = (val) => {
      setCommissionPct(val);
      if (val !== '' && !isNaN(val)) setCommissionBps(String((parseFloat(val) * 100).toFixed(1)));
      else setCommissionBps('');
    };
    const handleBpsChange = (val) => {
      setCommissionBps(val);
      if (val !== '' && !isNaN(val)) setCommissionPct(String((parseFloat(val) / 100).toFixed(3)));
      else setCommissionPct('');
    };

    const pct            = parseFloat(commissionPct) / 100 || 0;
    const grossComm      = baseLoan * pct;
    const brokerCut      = grossComm * (parseFloat(brokerSplitPct) / 100 || 0);
    const loGross        = grossComm - brokerCut; // what LO gets before flat fees
    const procFee        = parseFloat(processingFee) || 0;
    const origCosts      = parseFloat(originationCosts) || 0;
    const totalDeduct    = brokerCut + procFee + origCosts;
    const netComm        = grossComm - totalDeduct;
    const effectiveYield = baseLoan > 0 ? (netComm / baseLoan) * 100 : 0;
    const hasData        = baseLoan > 0 && pct > 0;

    // Recoupment impact — if comp rolled into loan
    const recoupImpact = paymentSavings > 0 ? grossComm / paymentSavings : null;
    const recoupWithComp = recoupMos === Infinity ? null : recoupMos;
    const recoupTotal = recoupWithComp !== null && recoupImpact !== null ? recoupWithComp + recoupImpact : null;
    const recoupOk = recoupTotal !== null ? recoupTotal <= 36 : null;

    const updateScenario = (id, field, val) =>
      setCompScenarios(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));

    const scenarioCalc = (s) => {
      const loan    = parseFloat(s.loanAmt) || baseLoan;
      const bpsVal  = parseFloat(s.bps) || 0;
      const ratePct = parseFloat(s.rate) || 0;
      const gross   = loan * (bpsVal / 10000);
      const broker  = gross * (parseFloat(brokerSplitPct) / 100 || 0);
      const net     = gross - broker - procFee - origCosts;
      const yld     = loan > 0 ? (net / loan) * 100 : 0;
      // NTB check per scenario
      const scenRateReduction = currentRate ? (parseFloat(currentRate) - ratePct) / 100 : null;
      const scenNewPI = ratePct > 0 && loan > 0 ? calcPI(loan, ratePct / 100, newTermMos) : null;
      const scenSavings = curPIAmt > 0 && scenNewPI ? curPIAmt - scenNewPI : null;
      const scenNTB = scenRateReduction !== null && scenSavings !== null
        ? scenRateReduction >= 0.005 && scenSavings > 0
        : null;
      return { loan, gross, net, yld, ratePct, scenNTB, scenNewPI, scenSavings };
    };

    return (
      <div>

        {/* ── Loan Context Banner ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0d3b6e 0%, #154a8a 100%)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 16, color: '#fff',
          display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 2 }}>LOAN AMOUNT</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{baseLoan ? fmtDollar(baseLoan) : '—'}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Pull from Loan Snapshot / Benefit Test</div>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 2 }}>CURRENT RATE</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{currentRate ? `${currentRate}%` : '—'}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Veteran's existing rate</div>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 2 }}>PROPOSED RATE</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{proposedRate ? `${proposedRate}%` : '—'}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>From Benefit Test tab</div>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 2 }}>NTB STATUS</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {curRateDec > 0 && newRateDec > 0
                ? ntbPass ? '✅ SATISFIED' : '❌ NOT MET'
                : '⏳ Pending'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Net Tangible Benefit test</div>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 2 }}>MONTHLY SAVINGS</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{_adjSavings > 0 ? fmtDollar(_adjSavings) : '—'}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Veteran's P&I reduction</div>
          </div>
        </div>

        {/* ── Compensation Structure ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>💰 Lender-Paid Compensation (YSP)</div>
          <div style={S.infoBox}>
            <strong>How this works:</strong> Your compensation is paid by the lender as Yield Spread Premium (YSP) — the higher the rate you lock for the veteran, the more bps the lender pays you. Enter your comp as either % or basis points (bps) — both fields sync automatically. 1% = 100 bps.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={S.label}>New Loan Amount ($) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— auto-pulled from Benefit Test</span></label>
              <input style={{ ...S.inputRO, fontSize: 16, fontWeight: 800, color: '#0d3b6e' }}
                value={baseLoan ? `$${baseLoan.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Enter loan amount on Benefit Test tab'} readOnly />
            </div>
            <div>
              <label style={S.label}>My Comp Rate (%) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— type either field</span></label>
              <input style={{ ...S.input, fontSize: 15, fontWeight: 700 }} type="number" step="0.001" min="0" max="5"
                value={commissionPct} onChange={e => handlePctChange(e.target.value)} placeholder="e.g. 1.500" />
              <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 4 }}>Percentage of loan amount I earn</div>
            </div>
            <div>
              <label style={S.label}>My Comp (Basis Points)</label>
              <input style={{ ...S.input, fontSize: 15, fontWeight: 700 }} type="number" step="1" min="0" max="500"
                value={commissionBps} onChange={e => handleBpsChange(e.target.value)} placeholder="e.g. 150" />
              <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 4 }}>100 bps = 1% of loan amount</div>
            </div>
          </div>
          {commissionBps && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#eef4fb', borderRadius: 8, fontSize: 13, color: '#1a4a7e' }}>
              💡 At <strong>{commissionBps} bps</strong> on a <strong>{fmtDollar(baseLoan)}</strong> loan, your gross compensation is <strong>{fmtDollar(grossComm)}</strong> — before your broker's portion and flat fees.
            </div>
          )}
        </div>

        {/* ── Deductions ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>📉 Cost Deductions</div>
          <div style={S.grid3}>
            <div>
              <label style={S.label}>Company Portion (% of gross) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— what your broker keeps</span></label>
              <input style={S.input} type="number" step="0.1" min="0" max="100"
                value={brokerSplitPct} onChange={e => setBrokerSplitPct(e.target.value)} placeholder="e.g. 30" />
              <div style={{ fontSize: 11, marginTop: 4, color: brokerCut > 0 ? '#8b1a1a' : '#6b7a8d', fontWeight: brokerCut > 0 ? 600 : 400 }}>
                {brokerCut > 0 ? `= ${fmtDollar(brokerCut)} goes to company · You keep ${fmtDollar(loGross)} before flat fees` : 'e.g. enter 30 if broker takes 30% of your gross comp'}
              </div>
            </div>
            <div>
              <label style={S.label}>Processing Fee ($) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— flat deduction</span></label>
              <input style={S.input} type="number" min="0"
                value={processingFee} onChange={e => setProcessingFee(e.target.value)} placeholder="e.g. 595" />
              <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 4 }}>Charged per file by processor</div>
            </div>
            <div>
              <label style={S.label}>Origination Costs ($) <span style={{ fontWeight: 400, color: '#9aa5b4' }}>— flat deduction</span></label>
              <input style={S.input} type="number" min="0"
                value={originationCosts} onChange={e => setOriginationCosts(e.target.value)} placeholder="e.g. 250" />
              <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 4 }}>E&O, compliance, other origination costs</div>
            </div>
          </div>
        </div>

        {/* ── Commission Summary ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>📊 My Commission Summary</div>
          {!hasData ? (
            <div style={S.infoBox}>Enter your compensation rate above to see your full commission breakdown.</div>
          ) : (
            <div>
              {/* 4 Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Gross Commission', sub: `${commissionPct}% of ${fmtDollar(baseLoan)}`, value: fmtDollar(grossComm), color: '#0d3b6e', bg: '#eef4fb' },
                  { label: 'Company Portion', sub: `${brokerSplitPct || 0}% — goes to broker`, value: fmtDollar(brokerCut), color: '#8b1a1a', bg: '#fdf0f0' },
                  { label: 'My Net Commission', sub: 'After all deductions', value: fmtDollar(netComm), color: netComm > 0 ? '#166534' : '#8b1a1a', bg: netComm > 0 ? '#f0fdf4' : '#fdf0f0' },
                  { label: 'Effective Yield', sub: 'Net as % of loan', value: `${effectiveYield.toFixed(3)}%`, color: '#92400e', bg: '#fffbeb' },
                ].map(({ label, sub, value, color, bg }) => (
                  <div key={label} style={{ background: bg, borderRadius: 8, padding: '14px 16px', border: `1px solid ${color}22` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7a8d', letterSpacing: '0.04em', marginBottom: 2 }}>{label.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: '#9aa5b4', marginBottom: 6 }}>{sub}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Waterfall */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', border: '1px solid #e0e7ef', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#0d3b6e' }}>Commission Waterfall</div>
                {[
                  { label: 'Gross Commission (YSP)',      detail: `${commissionBps} bps × ${fmtDollar(baseLoan)}`,            amt: grossComm,  deduct: false },
                  { label: 'Company Portion',             detail: `${brokerSplitPct || 0}% of gross — what broker keeps`,     amt: brokerCut,  deduct: true  },
                  { label: 'Processing Fee',              detail: 'Flat fee per file',                                         amt: procFee,    deduct: true  },
                  { label: 'Origination Costs',           detail: 'E&O, compliance, other',                                   amt: origCosts,  deduct: true  },
                ].map(({ label, detail, amt, deduct }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e0e7ef' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#6b7a8d' }}>{detail}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: deduct ? '#8b1a1a' : '#0d3b6e' }}>
                      {deduct ? '−' : '+'}{fmtDollar(amt)}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 0', marginTop: 4 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0d3b6e' }}>My Net Commission</div>
                    <div style={{ fontSize: 11, color: '#6b7a8d' }}>What I take home on this loan</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: netComm > 0 ? '#166534' : '#8b1a1a' }}>{fmtDollar(netComm)}</div>
                </div>
              </div>

              {/* Recoupment Impact Warning */}
              {paymentSavings > 0 && grossComm > 0 && (
                <div style={{
                  padding: '14px 16px', borderRadius: 8, marginBottom: 0,
                  background: recoupOk === false ? '#fdf0f0' : recoupOk === true ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${recoupOk === false ? '#fca5a5' : recoupOk === true ? '#86efac' : '#f9c846'}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    {recoupOk === false ? '⚠️ Recoupment Impact — Check NTB' : recoupOk === true ? '✅ Recoupment OK with Comp Rolled In' : '📐 Recoupment Impact'}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                    If your compensation is rolled into the loan, it adds approximately <strong>{recoupImpact !== null ? `${recoupImpact.toFixed(1)} months`  : '—'}</strong> to the veteran's recoupment period.
                    Combined with closing costs, total recoupment would be approximately <strong>{recoupTotal !== null ? `${recoupTotal.toFixed(1)} months` : '—'}</strong>.
                    {recoupOk === false && ' This exceeds the 36-month VA limit — consider a lower comp rate or ensure costs are minimal.'}
                    {recoupOk === true  && ' Still within the 36-month VA recoupment requirement.'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Scenario Comparison ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>🔄 Rate vs. Comp Scenario Comparison</div>
          <div style={S.infoBox}>
            <strong>The core IRRRL tradeoff:</strong> A higher rate means more bps from the lender — but it risks failing the veteran's NTB test. Use this table to find the pricing that maximizes your net commission while keeping the veteran's NTB satisfied. Flat deductions above apply to all scenarios.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['', 'Label', 'Veteran Rate (%)', 'My Comp (bps)', 'Loan Amt ($)', 'Veteran New P&I', 'Veteran Savings', 'NTB', 'My Gross', 'My Net', 'Eff. Yield'].map(h => (
                    <th key={h} style={{ padding: '9px 8px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compScenarios.map((s) => {
                  const calc   = scenarioCalc(s);
                  const filledScenarios = compScenarios.filter(x => parseFloat(x.bps) > 0);
                  const isBest = filledScenarios.length > 1 && calc.net > 0 && calc.scenNTB !== false &&
                    filledScenarios.every(other => {
                      if (other.id === s.id) return true;
                      const oc = scenarioCalc(other);
                      return oc.net <= calc.net || oc.scenNTB === false;
                    });
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f0f4f8', background: isBest ? '#f0fdf4' : calc.scenNTB === false ? '#fff8f8' : 'transparent' }}>
                      <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                        {isBest && <span style={{ fontSize: 10, background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>★ Best</span>}
                        {calc.scenNTB === false && !isBest && <span style={{ fontSize: 10, background: '#fdf0f0', color: '#8b1a1a', padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>NTB ❌</span>}
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...S.input, width: 90 }} value={s.label}
                          onChange={e => updateScenario(s.id, 'label', e.target.value)} placeholder={`Option ${s.id}`} />
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...S.input, width: 72, borderColor: calc.scenNTB === false ? '#fca5a5' : '#d0dbe8' }}
                          type="number" step="0.001" value={s.rate}
                          onChange={e => updateScenario(s.id, 'rate', e.target.value)} placeholder={proposedRate || '6.000'} />
                        {currentRate && s.rate && (
                          <div style={{ fontSize: 10, color: parseFloat(currentRate) - parseFloat(s.rate) >= 0.5 ? '#166534' : '#8b1a1a', marginTop: 2 }}>
                            {(parseFloat(currentRate) - parseFloat(s.rate)).toFixed(3)}% reduction
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...S.input, width: 64 }} type="number" step="1" value={s.bps}
                          onChange={e => updateScenario(s.id, 'bps', e.target.value)} placeholder="150" />
                        {s.bps && <div style={{ fontSize: 10, color: '#6b7a8d', marginTop: 2 }}>{(parseFloat(s.bps) / 100).toFixed(2)}%</div>}
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...S.input, width: 90 }} type="number" value={s.loanAmt}
                          onChange={e => updateScenario(s.id, 'loanAmt', e.target.value)}
                          placeholder={baseLoan ? String(Math.round(baseLoan)) : '285000'} />
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: 600, color: '#1a1a2e' }}>
                        {calc.scenNewPI ? fmtDollar(calc.scenNewPI) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: 600, color: calc.scenSavings > 0 ? '#166534' : '#8b1a1a' }}>
                        {calc.scenSavings !== null ? (calc.scenSavings > 0 ? `+${fmtDollar(calc.scenSavings)}` : fmtDollar(calc.scenSavings)) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: 700 }}>
                        {calc.scenNTB === null ? '—' : calc.scenNTB ? '✅' : '❌'}
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: 600, color: '#0d3b6e' }}>
                        {calc.gross > 0 ? fmtDollar(calc.gross) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: 700, color: calc.net > 0 ? '#166534' : '#6b7a8d' }}>
                        {calc.net > 0 ? fmtDollar(calc.net) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', color: '#92400e', fontWeight: 600 }}>
                        {calc.yld > 0 ? `${calc.yld.toFixed(3)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 10, fontStyle: 'italic' }}>
            ★ Best = highest net commission with NTB satisfied · NTB ❌ = rate reduction insufficient — do not price the veteran at this rate
          </div>
        </div>
      </div>
    );
  };

  const tabRenderers = {
    'snapshot':      renderSnapshot,
    'benefit-test':  renderBenefitTest,
    'irrrl-flag':    renderIRRRLFlag,
    'funding-fee':   renderFundingFee,
    'ntb-worksheet': renderNTBWorksheet,
    'rate-shop':     renderRateShop,
    'uw-worksheet':  renderUWWorksheet,
    'cash-out':      renderCashOut,
    'doc-checklist': renderDocChecklist,
    'net-commission': renderNetCommission,
    'pricing': () => (
      <VAIRRRLPricingCommission
        loanAmount={newLoanAmt} currentRate={currentRatePct} currentPI={currentPI}
        newRate={newRatePct} newPI={newPICalc}
        fundingFeeStatus={fundingFeeExempt === true ? 'exempt' : fundingFeeExempt === false ? 'not_exempt' : 'unknown'}
        veteranName={veteranName} propertyAddress={propertyAddress} remainingTerm={remTermMos}
        initTitleSettlement={ccTitle}
        initTitleInsurance={ccTitleIns}
        initRecordingFees={ccRecording}
        initOrigFee={ccOrigination}
        initProcFee={ccProcessing}
        initAdminFee={ccUnderwriting}
        initOtherCosts={ccOther}
        snapshotTotal={ccItemizedTotal}
        ntbRecoupMos={_adjRecoup}
        ntbPaymentSavings={_adjSavings}
        ntbCostsAmt={_rolledIn}
        pricingRate={pcPricingRate}          onPricingRateChange={setPcPricingRate}
        lenderCreditPct={pcLenderCreditPct}  onLenderCreditPctChange={setPcLenderCreditPct}
        compType={pcCompType}                onCompTypeChange={setPcCompType}
        compBps={pcCompBps}                  onCompBpsChange={setPcCompBps}
        splitMode={pcSplitMode}              onSplitModeChange={setPcSplitMode}
        companySplitPct={pcCompanySplitPct}  onCompanySplitPctChange={setPcCompanySplitPct}
        companyFlatFee={pcCompanyFlatFee}    onCompanyFlatFeeChange={setPcCompanyFlatFee}
        purchaseLoanAmt={pcPurchaseLoanAmt}  onPurchaseLoanAmtChange={setPcPurchaseLoanAmt}
        purchaseCompBps={pcPurchaseCompBps}  onPurchaseCompBpsChange={setPcPurchaseCompBps}
      />
    ),
  };

  return (
    <div style={S.container}>
      <div style={S.header}>
        <div style={S.headerTop}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3, letterSpacing: '0.08em' }}>MODULE 11 OF 27</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>VA IRRRL</h1>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3 }}>Interest Rate Reduction Refinance Loan</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span style={S.badge}>🎖️ VA STREAMLINE</span>
            {benefitTestPass  && <span style={{ ...S.badge, ...S.badgeGreen }}>✅ NTB SATISFIED</span>}
            {fundingFeeExempt && <span style={{ ...S.badge, ...S.badgeGold  }}>🎖️ FEE EXEMPT</span>}
            {priorIRRRL       && <span style={{ ...S.badge, background: 'rgba(249,100,70,0.25)', color: '#fda09a' }}>🚩 IRRRL-to-IRRRL</span>}
          </div>
        </div>
        <div style={S.scenarioRow}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Load Scenario:</span>
          <select style={S.headerSelect} value={selectedScenId} onChange={e => handleScenarioSelect(e.target.value)}>
            <option value="">— Select a scenario —</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>
                {s.borrowerName || s.borrower_name || ((s.firstName||'') + ' ' + (s.lastName||'')).trim() || s.scenarioName || 'Unnamed'} · {s.propertyAddress?.split(',')[0] || s.streetAddress || 'No address'}
              </option>
            ))}
          </select>
          {loadingScenarios && <span style={{ fontSize: 12, opacity: 0.65 }}>Loading...</span>}
          {veteranName && <span style={{ fontSize: 12, opacity: 0.85 }}>🎖️ {veteranName}</span>}
          <button
            onClick={handleSave}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: saveFlash ? '#22c55e' : 'rgba(255,255,255,0.2)',
              color: saveFlash ? '#fff' : 'rgba(255,255,255,0.9)',
              transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {saveFlash ? '✅ Saved!' : '💾 Save'}
          </button>
          {savedAt && !saveFlash && (
            <span style={{ fontSize: 11, opacity: 0.55 }}>
              Last saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div style={S.tabBar}>
        {TABS.map(t => <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => { handleSave(); setActiveTab(t.id); }}>{t.label}</button>)}
      </div>

      {tabRenderers[activeTab]?.()}

      <DecisionRecordBanner
        recordId={drRecordId}
        moduleName="VA IRRRL"
        onSave={handleSave}
      />

      <div style={S.canonicalBar}>
        {canonicalExpanded && (
          <div style={{ background: '#0a2d54', padding: '10px 16px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 8, letterSpacing: '0.1em' }}>CANONICAL SEQUENCE™ — 27 MODULES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
              {MODULES.map(m => (
                <button key={m.id} onClick={() => navigate(m.path)} title={m.label} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', background: m.id === CURRENT_MODULE ? '#f9c846' : 'rgba(255,255,255,0.1)', color: m.id === CURRENT_MODULE ? '#000' : 'rgba(255,255,255,0.65)', fontWeight: m.id === CURRENT_MODULE ? 700 : 400 }}>
                  {m.id}. {m.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={S.canonicalMain}>
          <button style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, padding: '6px 12px', opacity: prevMod ? 1 : 0.4 }} onClick={() => prevMod && navigate(prevMod.path)} disabled={!prevMod}>← {prevMod?.label || ''}</button>
          <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {MODULES.map(m => <div key={m.id} title={m.label} style={S.dot(m.id === CURRENT_MODULE)} onClick={() => navigate(m.path)}>{m.id === CURRENT_MODULE ? m.id : ''}</div>)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', padding: '4px 8px', fontSize: 11 }} onClick={() => setCanonicalExpanded(!canonicalExpanded)}>{canonicalExpanded ? '▼' : '▲'} Map</button>
            <button style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, padding: '6px 12px', opacity: nextMod ? 1 : 0.4 }} onClick={() => nextMod && navigate(nextMod.path)} disabled={!nextMod}>{nextMod?.label || ''} →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
