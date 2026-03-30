// VAIRRRL.jsx v3.2 — VA Interest Rate Reduction Refinance Loan (IRRRL)
// LoanBeacons™ Module 11 of 27 | Gen2 Cloud Function pattern | 9-tab layout
// Updated: March 2026

import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { app } from '../firebase/config';
import VAIRRRLPricingCommission from './VAIRRRLPricingCommission';

const functions = getFunctions(app);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── Utilities ────────────────────────────────────────────────────────────────
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

// ─── Canonical Module List ────────────────────────────────────────────────────
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

// ─── Tab Config ───────────────────────────────────────────────────────────────
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
  { id: 'cash-out',      label: 'Cash-Out' },
];

// ─── Doc Items ────────────────────────────────────────────────────────────────
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 20px 110px',
    color: '#1a1a2e',
    minHeight: '100vh',
  },
  header: {
    background: 'linear-gradient(135deg, #0d3b6e 0%, #154a8a 100%)',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 20,
    color: '#fff',
  },
  headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  badge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  badgeGreen: { background: 'rgba(34,197,94,0.25)', color: '#86efac' },
  badgeGold:  { background: 'rgba(249,200,70,0.25)', color: '#f9c846' },
  scenarioRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  headerSelect: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 6,
    color: '#fff',
    padding: '6px 10px',
    fontSize: 13,
    minWidth: 220,
    cursor: 'pointer',
  },
  tabBar: {
    display: 'flex',
    gap: 3,
    flexWrap: 'wrap',
    borderBottom: '2px solid #e0e7ef',
    marginBottom: 20,
  },
  tab: (active) => ({
    padding: '8px 10px',
    borderRadius: '8px 8px 0 0',
    border: 'none',
    background: active ? '#0d3b6e' : 'transparent',
    color: active ? '#fff' : '#6b7a8d',
    fontWeight: active ? 700 : 500,
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    marginBottom: active ? -2 : 0,
    borderBottom: active ? '2px solid #0d3b6e' : 'none',
    transition: 'all 0.15s',
  }),
  card: {
    background: '#fff',
    borderRadius: 10,
    border: '1px solid #e0e7ef',
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0d3b6e',
    marginBottom: 14,
    borderBottom: '1px solid #f0f4f8',
    paddingBottom: 10,
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7a8d', marginBottom: 4, display: 'block' },
  input: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #d0dbe8',
    fontSize: 13,
    color: '#1a1a2e',
    boxSizing: 'border-box',
    outline: 'none',
  },
  inputRO: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #e0e7ef',
    fontSize: 13,
    color: '#1a1a2e',
    boxSizing: 'border-box',
    background: '#f8fafc',
    fontWeight: 700,
  },
  btn: {
    padding: '9px 18px',
    borderRadius: 7,
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.15s',
  },
  btnPrimary:   { background: '#0d3b6e', color: '#fff' },
  btnSecondary: { background: '#e9eef5', color: '#1a1a2e' },
  btnGhost:     { background: 'transparent', color: '#0d3b6e', border: '1px solid #0d3b6e' },
  btnRed:       { background: '#fdf0f0', color: '#8b1a1a', padding: '4px 10px', fontSize: 12 },
  infoBox: {
    background: '#eef4fb',
    border: '1px solid #b8d0e8',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: '#1a4a7e',
    marginBottom: 14,
  },
  warningBox: {
    background: '#fffbeb',
    border: '1px solid #f9c846',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: '#7a5a00',
  },
  errorBox: {
    background: '#fdf0f0',
    border: '1px solid #f5c6c6',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: '#8b1a1a',
  },
  successBox: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: '#166534',
  },
  canonicalBar: {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    zIndex: 1000,
    background: '#0d3b6e',
    boxShadow: '0 -2px 12px rgba(0,0,0,0.18)',
  },
  canonicalMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    maxWidth: 1100,
    margin: '0 auto',
    gap: 10,
  },
  dot: (active) => ({
    width: active ? 22 : 14,
    height: active ? 22 : 14,
    borderRadius: '50%',
    background: active ? '#f9c846' : 'rgba(255,255,255,0.2)',
    border: active ? '2px solid #fff' : 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 8,
    fontWeight: 700,
    color: active ? '#000' : 'transparent',
    transition: 'all 0.15s',
    flexShrink: 0,
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function VAIRRRL() {
  const CURRENT_MODULE = 11;
  const prevMod = MODULES[CURRENT_MODULE - 2];
  const nextMod = MODULES[CURRENT_MODULE];

  // ── UI State
  const [activeTab, setActiveTab]               = useState('snapshot');
  const [canonicalExpanded, setCanonicalExpanded] = useState(false);

  // ── Scenario Loader
  const [scenarios, setScenarios]               = useState([]);
  const [selectedScenId, setSelectedScenId]     = useState('');
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  // ── Loan Snapshot (stored as human-readable percent strings for rates)
  const [veteranName, setVeteranName]           = useState('');
  const [vaLoanNumber, setVaLoanNumber]         = useState('');
  const [currentRatePct, setCurrentRatePct]     = useState(''); // e.g. "6.750"
  const [currentPI, setCurrentPI]               = useState(''); // dollar amount string
  const [remainingBalance, setRemainingBalance] = useState('');
  const [remainingTerm, setRemainingTerm]       = useState('360');
  const [propertyAddress, setPropertyAddress]   = useState('');
  const [fundingFeeExempt, setFundingFeeExempt] = useState(null); // true | false | null

  // ── New Loan
  const [newRatePct, setNewRatePct]       = useState(''); // e.g. "6.000"
  const [newLoanAmount, setNewLoanAmount] = useState('');
  const [newTerm, setNewTerm]             = useState('360');
  const [closingCosts, setClosingCosts]   = useState('');

  // ── IRRRL-to-IRRRL
  const [priorIRRRL, setPriorIRRRL]             = useState(false);
  const [priorIRRRLDate, setPriorIRRRLDate]     = useState('');
  const [priorIRRRLLender, setPriorIRRRLLender] = useState('');

  // ── Rate Shop
  const [rateOptions, setRateOptions] = useState([
    { id: 1, lender: '', rate: '', apr: '', points: '', fees: '' },
    { id: 2, lender: '', rate: '', apr: '', points: '', fees: '' },
    { id: 3, lender: '', rate: '', apr: '', points: '', fees: '' },
  ]);

  // ── Doc Checklist
  const [checkedDocs, setCheckedDocs] = useState({});

  // ── Cash-Out
  const [cashOutType, setCashOutType]                   = useState('typeI');
  const [cashOutAmount, setCashOutAmount]               = useState('');
  const [cashOutAppraisalValue, setCashOutAppraisalValue] = useState('');

  // ── PDF Extraction
  const [pdfFile, setPdfFile]                   = useState(null);
  const [isDragging, setIsDragging]             = useState(false);
  const [isExtracting, setIsExtracting]         = useState(false);
  const [extractionError, setExtractionError]   = useState('');
  const [extractionSuccess, setExtractionSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // ── Load Scenarios + auto-populate from URL params
  useEffect(() => {
    const load = async () => {
      setLoadingScenarios(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('scenarioId');

        // Direct fetch by ID first (works even without Firestore index)
        if (sid) {
          const { getDoc, doc: fsDoc } = await import('firebase/firestore');
          const docSnap = await getDoc(fsDoc(db, 'scenarios', sid));
          if (docSnap.exists()) {
            const match = { id: docSnap.id, ...docSnap.data() };
            setSelectedScenId(sid);
            const name = match.borrowerName || match.borrower_name ||
              ((match.firstName || '') + ' ' + (match.lastName || '')).trim() ||
              match.scenarioName || '';
            if (name) setVeteranName(name);
            const addr = match.propertyAddress || match.subjectPropertyAddress ||
              [match.streetAddress, match.city, match.state].filter(Boolean).join(', ') || '';
            if (addr) setPropertyAddress(addr);
            const bal = match.currentLoanAmount || match.loanAmount || match.baseLoanAmount || '';
            if (bal) setRemainingBalance(String(bal));
            const exempt = match.fundingFeeExempt ?? match.serviceConnectedDisability ?? match.vaFundingFeeExempt ?? null;
            if (exempt != null) setFundingFeeExempt(exempt);
          }
        }

        // Load dropdown list (best-effort)
        try {
          const q = query(collection(db, 'scenarios'), orderBy('created_at', 'desc'), limit(15));
          const snap = await getDocs(q);
          const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setScenarios(loaded);
          if (sid && !loaded.find(x => x.id === sid)) {
            // keep the directly-fetched scenario in the dropdown
            const { getDoc, doc: fsDoc } = await import('firebase/firestore');
            const docSnap = await getDoc(fsDoc(db, 'scenarios', sid));
            if (docSnap.exists()) setScenarios([{ id: docSnap.id, ...docSnap.data() }, ...loaded]);
          }
        } catch (e) {
          console.warn('Scenario list load failed:', e.message);
        }
      } catch (e) {
        console.error('Scenarios load error:', e);
      } finally {
        setLoadingScenarios(false);
      }
    };
    load();
  }, []);

  // ── Populate from Scenario
  const handleScenarioSelect = (id) => {
    setSelectedScenId(id);
    const s = scenarios.find(x => x.id === id);
    if (!s) return;
    if (s.borrowerName || s.borrower_name)
      setVeteranName(s.borrowerName || s.borrower_name || '');
    if (s.propertyAddress)
      setPropertyAddress(s.propertyAddress);
    if (s.currentLoanAmount || s.loanAmount)
      setRemainingBalance(String(s.currentLoanAmount || s.loanAmount || ''));
    const exempt = s.fundingFeeExempt ?? s.serviceConnectedDisability ?? s.vaFundingFeeExempt ?? null;
    if (exempt != null) setFundingFeeExempt(exempt);
  };

  // ── PDF Drop Handlers
  const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') { setPdfFile(file); setExtractionError(''); setExtractionSuccess(false); }
  };
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) { setPdfFile(file); setExtractionError(''); setExtractionSuccess(false); }
  };

  // ── AI Extraction via extractVADocument Cloud Function (Gen2)
  const handleExtract = async () => {
    if (!pdfFile) return;
    setIsExtracting(true);
    setExtractionError('');
    setExtractionSuccess(false);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(pdfFile);
      });
      const extractVADocument = httpsCallable(functions, 'extractVADocument');
      const result = await extractVADocument({ documentBase64: base64, mediaType: 'application/pdf' });
      const d = result.data;
      if (d.veteranName)        setVeteranName(d.veteranName);
      if (d.vaLoanNumber)       setVaLoanNumber(d.vaLoanNumber);
      if (d.currentNoteRate != null)  setCurrentRatePct((d.currentNoteRate * 100).toFixed(3));
      if (d.currentPIPayment != null) setCurrentPI(String(d.currentPIPayment.toFixed(2)));
      if (d.remainingBalance != null) setRemainingBalance(String(d.remainingBalance.toFixed(2)));
      if (d.remainingTermMonths != null) setRemainingTerm(String(d.remainingTermMonths));
      if (d.propertyAddress)    setPropertyAddress(d.propertyAddress);
      if (d.fundingFeeExempt != null) setFundingFeeExempt(d.fundingFeeExempt);
      setExtractionSuccess(true);
    } catch (err) {
      console.error('extractVADocument error:', err);
      setExtractionError(err.message || 'Extraction failed — please enter fields manually.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Derived Calculations
  const curRateDec   = parseFloat(currentRatePct) / 100 || 0;
  const newRateDec   = parseFloat(newRatePct) / 100 || 0;
  const curPIAmt     = parseFloat(currentPI) || 0;
  const remBal       = parseFloat(remainingBalance) || 0;
  const remTermMos   = parseInt(remainingTerm) || 360;
  const newLoanAmt   = parseFloat(newLoanAmount) || remBal;
  const newTermMos   = parseInt(newTerm) || 360;
  const costsAmt     = parseFloat(closingCosts) || 0;

  const rateReduction  = curRateDec - newRateDec;            // decimal
  const newPICalc      = calcPI(newLoanAmt, newRateDec, newTermMos);
  const paymentSavings = curPIAmt - newPICalc;
  const recoupMos      = paymentSavings > 0 ? costsAmt / paymentSavings : Infinity;

  const rateTestPass     = rateReduction >= 0.005;
  const paymentTestPass  = paymentSavings > 0;
  const recoupTestPass   = recoupMos <= 36;
  const benefitTestPass  = rateTestPass && paymentTestPass;

  const fundingFeeAmt   = fundingFeeExempt ? 0 : newLoanAmt * 0.005;
  const totalLoanWFee   = newLoanAmt + fundingFeeAmt;

  const cashOut         = parseFloat(cashOutAmount) || 0;
  const appraisalVal    = parseFloat(cashOutAppraisalValue) || 0;
  const cashOutLoanAmt  = remBal + cashOut;
  const cashOutLTV      = appraisalVal > 0 ? (cashOutLoanAmt / appraisalVal) * 100 : 0;

  // ── Rate Shop Helpers
  const addRateOption = () =>
    setRateOptions(prev => [...prev, { id: Date.now(), lender: '', rate: '', apr: '', points: '', fees: '' }]);
  const updateRO = (id, field, val) =>
    setRateOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: val } : o));
  const removeRO = (id) =>
    setRateOptions(prev => prev.filter(o => o.id !== id));

  const navigate = (path) => { window.location.href = path; };

  // ════════════════════════════════════════════════════════════════════════════
  // TAB RENDERERS
  // ════════════════════════════════════════════════════════════════════════════

  const renderSnapshot = () => (
    <div>
      {/* PDF Upload */}
      <div style={S.card}>
        <div style={S.cardTitle}>🗂️ Upload VA Loan Document</div>
        <div style={S.infoBox}>
          Upload a COE, mortgage statement, or VA Note. Haiku AI will extract loan details automatically.
          Supports COE + mortgage statement in one file or separately.
        </div>

        <div
          style={{
            border: `2px dashed ${isDragging ? '#0d3b6e' : '#b0c4de'}`,
            borderRadius: 10, padding: '28px 20px', textAlign: 'center',
            background: isDragging ? '#eef4fb' : '#f8fafc', cursor: 'pointer',
            transition: 'all 0.2s', marginBottom: 12,
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {pdfFile ? (
            <div>
              <div style={{ fontSize: 32 }}>📄</div>
              <div style={{ fontWeight: 600, marginTop: 6 }}>{pdfFile.name}</div>
              <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 2 }}>{(pdfFile.size / 1024).toFixed(1)} KB</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 36 }}>📁</div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>Drop PDF here or click to browse</div>
              <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 4 }}>COE · Mortgage Statement · VA Note</div>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileSelect} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ ...S.btn, ...S.btnPrimary, opacity: (!pdfFile || isExtracting) ? 0.6 : 1 }}
            onClick={handleExtract}
            disabled={!pdfFile || isExtracting}
          >
            {isExtracting ? '⏳ Extracting...' : '🤖 Extract with AI'}
          </button>
          {pdfFile && (
            <button style={{ ...S.btn, ...S.btnSecondary }} onClick={() => { setPdfFile(null); setExtractionSuccess(false); setExtractionError(''); }}>
              ✕ Clear
            </button>
          )}
        </div>
        {extractionError   && <div style={{ ...S.errorBox,   marginTop: 10 }}>⚠️ {extractionError}</div>}
        {extractionSuccess && <div style={{ ...S.successBox, marginTop: 10 }}>✅ Extraction complete — review fields below and confirm accuracy.</div>}
      </div>

      {/* Manual / Confirmed Fields */}
      <div style={S.card}>
        <div style={S.cardTitle}>📋 Loan Details</div>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>Veteran Name</label>
            <input style={S.input} value={veteranName} onChange={e => setVeteranName(e.target.value)} placeholder="e.g. James Holloway" />
          </div>
          <div>
            <label style={S.label}>VA Loan Number</label>
            <input style={S.input} value={vaLoanNumber} onChange={e => setVaLoanNumber(e.target.value)} placeholder="e.g. 2024-VA-001234" />
          </div>
          <div>
            <label style={S.label}>Current Note Rate (%)</label>
            <input style={S.input} type="number" step="0.001"
              value={currentRatePct}
              onChange={e => setCurrentRatePct(e.target.value)}
              placeholder="e.g. 6.750" />
          </div>
          <div>
            <label style={S.label}>Current P&amp;I Payment ($)</label>
            <input style={S.input} type="number"
              value={currentPI}
              onChange={e => setCurrentPI(e.target.value)}
              placeholder="e.g. 1850.00" />
          </div>
          <div>
            <label style={S.label}>Remaining Principal Balance ($)</label>
            <input style={S.input} type="number"
              value={remainingBalance}
              onChange={e => setRemainingBalance(e.target.value)}
              placeholder="e.g. 285000" />
          </div>
          <div>
            <label style={S.label}>Remaining Term (months)</label>
            <input style={S.input} type="number"
              value={remainingTerm}
              onChange={e => setRemainingTerm(e.target.value)}
              placeholder="e.g. 324" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>Property Address</label>
            <input style={S.input} value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St, City, State 00000" />
          </div>
        </div>

        {/* Funding Fee Exemption Toggle */}
        <div style={{ marginTop: 16 }}>
          <label style={S.label}>VA Funding Fee Exemption Status</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {[
              { val: true,  label: '🎖️ EXEMPT — Service-Connected Disability', activeColor: '#166534', activeBg: '#f0fdf4' },
              { val: false, label: '💰 Not Exempt — 0.5% Applies',              activeColor: '#92400e', activeBg: '#fffbeb' },
              { val: null,  label: '❓ Unknown',                                 activeColor: '#4a5568', activeBg: '#f1f5f9' },
            ].map(opt => (
              <button
                key={String(opt.val)}
                onClick={() => setFundingFeeExempt(opt.val)}
                style={{
                  ...S.btn,
                  fontSize: 12,
                  background: fundingFeeExempt === opt.val ? opt.activeBg : '#f1f5f9',
                  color:      fundingFeeExempt === opt.val ? opt.activeColor : '#6b7a8d',
                  border:     fundingFeeExempt === opt.val ? `2px solid ${opt.activeColor}` : '2px solid transparent',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  const renderBenefitTest = () => {
    const hasData = curRateDec > 0 && newRateDec > 0;
    return (
      <div>
        <div style={S.card}>
          <div style={S.cardTitle}>🎯 New Loan Parameters</div>
          <div style={S.grid3}>
            <div>
              <label style={S.label}>New Note Rate (%)</label>
              <input style={S.input} type="number" step="0.001"
                value={newRatePct} onChange={e => setNewRatePct(e.target.value)} placeholder="e.g. 6.000" />
            </div>
            <div>
              <label style={S.label}>New Loan Amount ($)</label>
              <input style={S.input} type="number"
                value={newLoanAmount} onChange={e => setNewLoanAmount(e.target.value)}
                placeholder={remainingBalance || 'e.g. 285000'} />
            </div>
            <div>
              <label style={S.label}>New Term (months)</label>
              <input style={S.input} type="number" value={newTerm} onChange={e => setNewTerm(e.target.value)} placeholder="360" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Estimated Closing Costs ($) — used for recoupment calculation</label>
              <input style={S.input} type="number"
                value={closingCosts} onChange={e => setClosingCosts(e.target.value)} placeholder="e.g. 3500" />
            </div>
          </div>
        </div>

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
              pass: paymentTestPass,
              detail: curPIAmt > 0 && newPICalc > 0
                ? `${fmtDollar(curPIAmt)} → ${fmtDollar(newPICalc)} — saves ${fmtDollar(paymentSavings)}/mo`
                : 'Enter current P&I on Loan Snapshot tab',
              rule: 'New P&I must be lower than existing P&I.',
            },
            {
              label: 'Recoupment of Costs ≤ 36 Months',
              pass: recoupTestPass,
              detail: costsAmt > 0 && paymentSavings > 0
                ? `${recoupMos === Infinity ? '∞' : recoupMos.toFixed(1)} months to recoup ${fmtDollar(costsAmt)} in closing costs`
                : costsAmt === 0 ? 'Enter closing costs above' : 'Payment must increase to calculate',
              rule: 'VA Circular 26-18-13: lenders must document cost recoupment ≤ 36 months.',
            },
          ].map((test, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              padding: '14px 0', borderBottom: i < 2 ? '1px solid #f0f4f8' : 'none',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: !hasData ? '#f1f5f9' : test.pass ? '#f0fdf4' : '#fdf0f0',
                color:      !hasData ? '#6b7a8d' : test.pass ? '#166534' : '#8b1a1a',
              }}>
                {!hasData ? '—' : test.pass ? '✅ PASS' : '❌ FAIL'}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{test.label}</div>
                <div style={{ fontSize: 13, color: '#6b7a8d', marginTop: 2 }}>{test.detail}</div>
                <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 3, fontStyle: 'italic' }}>{test.rule}</div>
              </div>
            </div>
          ))}

          {/* Overall Verdict */}
          {curRateDec > 0 && newRateDec > 0 && curPIAmt > 0 && (
            <div style={{
              marginTop: 18, padding: '16px 18px', borderRadius: 8,
              background: benefitTestPass ? '#f0fdf4' : '#fdf0f0',
              border: `2px solid ${benefitTestPass ? '#86efac' : '#fca5a5'}`,
            }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: benefitTestPass ? '#166534' : '#8b1a1a' }}>
                {benefitTestPass ? '✅ Net Tangible Benefit — SATISFIED' : '❌ Net Tangible Benefit — NOT MET'}
              </div>
              <div style={{ fontSize: 13, marginTop: 6, color: '#374151', lineHeight: 1.5 }}>
                {benefitTestPass
                  ? `This IRRRL reduces the veteran's rate by ${fmtPct(rateReduction * 100)} and saves ${fmtDollar(paymentSavings)}/month. The loan qualifies for VA IRRRL processing.`
                  : `Rate reduction of ${fmtPct(rateReduction * 100)} does not meet the 0.50% minimum${!paymentTestPass ? ', and the monthly payment does not decrease' : ''}. Restructure the loan terms or select a lower rate.`
                }
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  const renderIRRRLFlag = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>🚩 IRRRL-to-IRRRL Identification</div>
        <div style={S.infoBox}>
          VA permits refinancing a prior IRRRL with a new IRRRL. However, VA Circular 26-19-22 requires lenders to separately document that the veteran has recouped the costs of the prior IRRRL before proceeding with the new one.
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Is the loan being refinanced itself a prior VA IRRRL?</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => setPriorIRRRL(true)}
              style={{ ...S.btn, ...(priorIRRRL ? S.btnPrimary : S.btnSecondary) }}
            >
              🚩 Yes — Prior IRRRL
            </button>
            <button
              onClick={() => setPriorIRRRL(false)}
              style={{ ...S.btn, ...(!priorIRRRL ? S.btnPrimary : S.btnSecondary) }}
            >
              ✅ No — Original VA Loan
            </button>
          </div>
        </div>

        {priorIRRRL && (
          <div>
            <div style={{ ...S.warningBox, marginBottom: 14 }}>
              ⚠️ <strong>IRRRL-to-IRRRL Flag Active.</strong> Per VA Circular 26-19-22, you must document that the veteran has recouped all costs from the prior IRRRL before the new IRRRL can close. Include the prior HUD-1 or Closing Disclosure in the loan file.
            </div>
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Prior IRRRL Closing Date</label>
                <input style={S.input} type="date" value={priorIRRRLDate} onChange={e => setPriorIRRRLDate(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Prior IRRRL Lender Name</label>
                <input style={S.input} value={priorIRRRLLender} onChange={e => setPriorIRRRLLender(e.target.value)} placeholder="Lender name" />
              </div>
            </div>
            {priorIRRRLDate && (
              <div style={{ ...S.infoBox, marginTop: 12 }}>
                📅 Prior IRRRL closed: <strong>{new Date(priorIRRRLDate).toLocaleDateString()}</strong>.
                Confirm cost recoupment was achieved before this date and document in the file.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>📋 VA IRRRL Eligibility Checklist (VA Lender Handbook Ch. 6)</div>
        {[
          { rule: 'Loan being refinanced is an existing VA-guaranteed loan',              pass: true  },
          { rule: 'Veteran certifies prior loan was used for personal occupancy',         pass: true  },
          { rule: 'Rate reduced by ≥ 0.50% (fixed-to-fixed)',                            pass: rateTestPass  },
          { rule: 'No cash-out to veteran (closing costs may be rolled in)',              pass: true  },
          { rule: 'No appraisal required — streamline process',                          pass: true  },
          { rule: 'No income verification required — streamline process',                pass: true  },
          { rule: 'IRRRL-to-IRRRL recoupment documented (if applicable)',                pass: !priorIRRRL || !!priorIRRRLDate },
          { rule: 'Funding fee determined (0.5% or exempt if service-connected)',        pass: fundingFeeExempt !== null },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 0', borderBottom: i < 7 ? '1px solid #f0f4f8' : 'none',
          }}>
            <span style={{ fontSize: 17, flexShrink: 0 }}>{item.pass ? '✅' : '⏳'}</span>
            <span style={{ fontSize: 13, color: item.pass ? '#1a1a2e' : '#6b7a8d' }}>{item.rule}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  const renderFundingFee = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>💰 VA Funding Fee Calculator</div>
        <div style={S.infoBox}>
          VA IRRRL funding fee: <strong>0.50%</strong> of the new loan amount. Veterans with a service-connected disability rating of any percentage are fully exempt per 38 U.S.C. § 3729(c).
        </div>

        {/* Exemption Status Banner */}
        <div style={{
          padding: '16px 18px', borderRadius: 8, marginBottom: 18,
          background: fundingFeeExempt === true ? '#f0fdf4' : fundingFeeExempt === false ? '#fffbeb' : '#f8fafc',
          border: `2px solid ${fundingFeeExempt === true ? '#86efac' : fundingFeeExempt === false ? '#f9c846' : '#e0e7ef'}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {fundingFeeExempt === true  && '🎖️ EXEMPT — Service-Connected Disability — Funding Fee Waived'}
            {fundingFeeExempt === false && '💰 NOT EXEMPT — Standard IRRRL Rate Applies (0.50%)'}
            {fundingFeeExempt === null  && '❓ Exemption status not set — set it on the Loan Snapshot tab'}
          </div>
          {fundingFeeExempt === true && (
            <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
              Per 38 U.S.C. § 3729(c). No funding fee charged. Document disability rating letter in the loan file.
            </div>
          )}
          {fundingFeeExempt === false && (
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
              0.50% of the new loan amount. May be rolled into the loan or paid at closing.
            </div>
          )}
        </div>

        <div style={S.grid3}>
          <div>
            <label style={S.label}>New Loan Amount ($)</label>
            <input style={S.input} type="number"
              value={newLoanAmount || remainingBalance}
              onChange={e => setNewLoanAmount(e.target.value)}
              placeholder="285000" />
          </div>
          <div>
            <label style={S.label}>Funding Fee Rate</label>
            <input style={S.inputRO} value={fundingFeeExempt ? '0.000% (Exempt)' : '0.500%'} readOnly />
          </div>
          <div>
            <label style={S.label}>Funding Fee Amount</label>
            <input
              style={{ ...S.inputRO, color: fundingFeeExempt ? '#166534' : '#92400e' }}
              value={fundingFeeExempt ? '$0.00 (Waived)' : fmtDollar(fundingFeeAmt)}
              readOnly />
          </div>
        </div>

        {!fundingFeeExempt && newLoanAmt > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Funding Fee Disposition</div>
            <div style={S.grid2}>
              <div style={{ ...S.card, background: '#f8fafc', padding: 16, marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7a8d' }}>Option A — Roll Into Loan</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0d3b6e', margin: '6px 0 2px' }}>{fmtDollar(totalLoanWFee)}</div>
                <div style={{ fontSize: 12, color: '#6b7a8d' }}>Total loan amount including fee</div>
                <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 4 }}>
                  New P&I at this amount: <strong>{fmtDollar(calcPI(totalLoanWFee, newRateDec, newTermMos))}</strong>
                </div>
              </div>
              <div style={{ ...S.card, background: '#f8fafc', padding: 16, marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7a8d' }}>Option B — Paid at Closing</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#92400e', margin: '6px 0 2px' }}>{fmtDollar(fundingFeeAmt)}</div>
                <div style={{ fontSize: 12, color: '#6b7a8d' }}>Out-of-pocket cost at closing</div>
                <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 4 }}>
                  Base loan P&I: <strong>{fmtDollar(newPICalc)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VA Funding Fee Reference Table */}
      <div style={S.card}>
        <div style={S.cardTitle}>📖 VA Funding Fee Reference (for VA Cash-Out comparison)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['Loan Type', '1st Use', '2nd+ Use', 'Exempt'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['VA IRRRL', '0.50%', '0.50%', '✅ Service-connected disability'],
              ['VA Purchase — 0% down', '2.15%', '3.30%', '✅ Service-connected disability'],
              ['VA Purchase — 5%+ down', '1.50%', '1.50%', '✅ Service-connected disability'],
              ['VA Cash-Out Refi', '2.15%', '3.30%', '✅ Service-connected disability'],
            ].map(([type, first, repeat, exempt]) => (
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

  // ─────────────────────────────────────────────────────────────────────────
  const renderNTBWorksheet = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print NTB Worksheet</button>
      </div>
      <div style={{ ...S.card, fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 22, borderBottom: '2px solid #0d3b6e', paddingBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0d3b6e', letterSpacing: '0.02em' }}>NET TANGIBLE BENEFIT WORKSHEET</div>
          <div style={{ fontSize: 14, color: '#5a6a7e', marginTop: 4 }}>VA Interest Rate Reduction Refinance Loan (IRRRL)</div>
          <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>Prepared by LoanBeacons™ · For Lender File Documentation</div>
        </div>

        {/* Borrower Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {[
            ['Veteran Name',      veteranName || '___________________________'],
            ['VA Loan Number',    vaLoanNumber || '___________________________'],
            ['Property Address',  propertyAddress || '___________________________'],
            ['Worksheet Date',    new Date().toLocaleDateString()],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 0' }}>
              <span style={{ width: 160, fontSize: 12, fontWeight: 700, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
              <span style={{ fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          {[
            { title: 'EXISTING LOAN', rows: [
              ['Current Note Rate',    curRateDec ? fmtPct(curRateDec * 100) : '________%'],
              ['Current P&I Payment',  curPIAmt   ? fmtDollar(curPIAmt)      : '$__________'],
              ['Remaining Balance',    remBal      ? fmtDollar(remBal)        : '$__________'],
              ['Remaining Term',       remTermMos  ? `${remTermMos} months`   : '________ months'],
            ]},
            { title: 'PROPOSED VA IRRRL', rows: [
              ['New Note Rate',             newRateDec  ? fmtPct(newRateDec * 100)  : '________%'],
              ['New Loan Amount',           newLoanAmt  ? fmtDollar(newLoanAmt)     : '$__________'],
              ['New P&I Payment',           newPICalc   ? fmtDollar(newPICalc)      : '$__________'],
              ['New Term',                  newTermMos  ? `${newTermMos} months`    : '________ months'],
              ['Estimated Closing Costs',   costsAmt    ? fmtDollar(costsAmt)       : '$__________'],
              ['VA Funding Fee',            fundingFeeExempt !== null ? (fundingFeeExempt ? '$0.00 (Service-Connected Exempt)' : fmtDollar(fundingFeeAmt)) : '$__________'],
            ]},
          ].map(section => (
            <div key={section.title} style={{ marginBottom: 16 }}>
              <div style={{ background: '#0d3b6e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 4, marginBottom: 6, letterSpacing: '0.08em' }}>
                {section.title}
              </div>
              {section.rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 4px' }}>
                  <span style={{ width: 220, fontSize: 12, fontWeight: 600, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
                  <span style={{ fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Test Results */}
        <div style={{ background: '#0d3b6e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 4, marginBottom: 6, letterSpacing: '0.08em' }}>
          NET TANGIBLE BENEFIT DETERMINATION
        </div>
        {[
          ['Rate Reduction',           fmtPct(rateReduction * 100),                rateTestPass   ? 'PASS ✅' : 'FAIL ❌'],
          ['Monthly Payment Savings',  paymentSavings ? fmtDollar(paymentSavings) : '—',          paymentTestPass  ? 'PASS ✅' : 'FAIL ❌'],
          ['Recoupment Period',        recoupMos === Infinity ? 'N/A' : `${recoupMos.toFixed(1)} months`, recoupTestPass ? 'PASS ✅' : 'REVIEW ⚠️'],
          ['Net Tangible Benefit',     '',                                          benefitTestPass ? 'SATISFIED ✅' : 'NOT MET ❌'],
        ].map(([k, v, r]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 4px', alignItems: 'center' }}>
            <span style={{ width: 220, fontSize: 12, fontWeight: 600, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
            <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.includes('✅') ? '#166534' : r.includes('❌') ? '#8b1a1a' : '#92400e' }}>{r}</span>
          </div>
        ))}

        {/* Sign-Off */}
        <div style={{ borderTop: '2px solid #0d3b6e', paddingTop: 20, marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Loan Officer Signature', 'NMLS ID', 'Date'].map(label => (
              <div key={label}>
                <div style={{ borderBottom: '1px solid #1a1a2e', height: 32, marginBottom: 5 }} />
                <div style={{ fontSize: 11, color: '#6b7a8d' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  const renderRateShop = () => {
    const bestRateOpt = rateOptions
      .filter(o => o.rate)
      .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];
    const bestAPROpt = rateOptions
      .filter(o => o.apr)
      .sort((a, b) => parseFloat(a.apr) - parseFloat(b.apr))[0];

    return (
      <div>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={S.cardTitle}>🏦 Rate Shopping Comparison</div>
            <button style={{ ...S.btn, ...S.btnGhost, fontSize: 12 }} onClick={addRateOption}>+ Add Lender</button>
          </div>
          <div style={S.infoBox}>
            VA policy requires good faith rate estimates. Compare <strong>APR</strong> — not just rate — to account for points and lender fees.
            Current balance: <strong>{remBal ? fmtDollar(remBal) : '—'}</strong> · Current P&I: <strong>{curPIAmt ? fmtDollar(curPIAmt) : '—'}</strong>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Lender', 'Note Rate %', 'APR %', 'Points', 'Lender Fees', 'Est. P&I', 'vs Current', ''].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rateOptions.map((opt, i) => {
                  const r = parseFloat(opt.rate) / 100 || 0;
                  const piEst = calcPI(newLoanAmt || remBal, r, newTermMos);
                  const savings = curPIAmt > 0 && piEst > 0 ? curPIAmt - piEst : null;
                  const isBestRate = bestRateOpt?.id === opt.id;
                  const isBestAPR  = bestAPROpt?.id === opt.id;
                  return (
                    <tr key={opt.id} style={{ borderBottom: '1px solid #f0f4f8', background: isBestRate ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input style={{ ...S.input, minWidth: 120 }} value={opt.lender}
                            onChange={e => updateRO(opt.id, 'lender', e.target.value)} placeholder={`Lender ${i + 1}`} />
                          {isBestRate && <span style={{ fontSize: 10, background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>★ Best Rate</span>}
                          {isBestAPR && !isBestRate && <span style={{ fontSize: 10, background: '#eef4fb', color: '#1a4a7e', padding: '2px 6px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>★ Best APR</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <input style={{ ...S.input, width: 72 }} type="number" step="0.001" value={opt.rate}
                          onChange={e => updateRO(opt.id, 'rate', e.target.value)} placeholder="6.000" />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <input style={{ ...S.input, width: 72 }} type="number" step="0.001" value={opt.apr}
                          onChange={e => updateRO(opt.id, 'apr', e.target.value)} placeholder="6.125" />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <input style={{ ...S.input, width: 64 }} type="number" step="0.125" value={opt.points}
                          onChange={e => updateRO(opt.id, 'points', e.target.value)} placeholder="0.000" />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <input style={{ ...S.input, width: 80 }} type="number" value={opt.fees}
                          onChange={e => updateRO(opt.id, 'fees', e.target.value)} placeholder="1500" />
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                        {r > 0 && (newLoanAmt > 0 || remBal > 0) ? fmtDollar(piEst) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: savings > 0 ? '#166534' : savings < 0 ? '#8b1a1a' : '#6b7a8d' }}>
                        {savings !== null ? (savings > 0 ? `+${fmtDollar(savings)}` : fmtDollar(savings)) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <button style={{ ...S.btn, ...S.btnRed }} onClick={() => removeRO(opt.id)}>✕</button>
                      </td>
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

  // ─────────────────────────────────────────────────────────────────────────
  const renderUWWorksheet = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print UW Worksheet</button>
      </div>
      <div style={{ ...S.card, fontFamily: 'Georgia, serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #0d3b6e', paddingBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0d3b6e' }}>VA IRRRL UNDERWRITING WORKSHEET</div>
          <div style={{ fontSize: 13, color: '#6b7a8d' }}>For Internal Lender File — LoanBeacons™</div>
          <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>Generated: {new Date().toLocaleDateString()}</div>
        </div>

        {/* Loan Summary Grid */}
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0d3b6e', marginBottom: 8, letterSpacing: '0.05em' }}>LOAN SUMMARY</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            ['Veteran',          veteranName || '—'],
            ['VA Loan #',        vaLoanNumber || '—'],
            ['Property',         propertyAddress?.split(',')[0] || '—'],
            ['Current Rate',     curRateDec ? fmtPct(curRateDec * 100) : '—'],
            ['New Rate',         newRateDec  ? fmtPct(newRateDec * 100) : '—'],
            ['Rate Reduction',   rateReduction ? fmtPct(rateReduction * 100) : '—'],
            ['Current P&I',      fmtDollar(curPIAmt)],
            ['New P&I',          fmtDollar(newPICalc)],
            ['Monthly Savings',  fmtDollar(paymentSavings)],
            ['Funding Fee',      fundingFeeExempt !== null ? (fundingFeeExempt ? 'EXEMPT 🎖️' : fmtDollar(fundingFeeAmt)) : '—'],
            ['New Loan Amt',     fmtDollar(newLoanAmt)],
            ['NTB Status',       benefitTestPass ? 'SATISFIED ✅' : curRateDec > 0 ? 'NOT MET ❌' : 'Pending'],
          ].map(([label, val]) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', border: '1px solid #e0e7ef' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a8d', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* UW Checklist */}
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

        {/* Sign-off */}
        <div style={{ borderTop: '2px solid #0d3b6e', paddingTop: 18, marginTop: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Loan Officer / NMLS ID', 'Underwriter / NMLS ID', 'Date'].map(label => (
              <div key={label}>
                <div style={{ borderBottom: '1px solid #1a1a2e', height: 32, marginBottom: 5 }} />
                <div style={{ fontSize: 10, color: '#6b7a8d' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  const renderCashOut = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>💵 VA Cash-Out Refinance</div>
        <div style={{ ...S.warningBox, marginBottom: 14 }}>
          ⚠️ <strong>VA Cash-Out is NOT an IRRRL.</strong> It requires a full appraisal, income verification, and credit qualification. Use this tab only if the veteran's goal includes cash out — the loan product changes entirely.
        </div>
        <div style={S.infoBox}>
          <strong>Type I:</strong> New loan amount does not exceed the existing payoff — no net cash to borrower. Still requires full underwriting.<br />
          <strong>Type II:</strong> New loan amount exceeds the existing payoff — veteran receives cash at closing. Full underwriting + appraisal + LTV limits apply.
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
          {[
            { val: 'typeI',  label: 'Type I — No Net Cash Out' },
            { val: 'typeII', label: 'Type II — Cash Out to Borrower' },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => setCashOutType(opt.val)}
              style={{ ...S.btn, ...(cashOutType === opt.val ? S.btnPrimary : S.btnSecondary) }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={S.grid3}>
          <div>
            <label style={S.label}>Appraised Value ($)</label>
            <input style={S.input} type="number" value={cashOutAppraisalValue} onChange={e => setCashOutAppraisalValue(e.target.value)} placeholder="350000" />
          </div>
          <div>
            <label style={S.label}>Existing Payoff Balance ($)</label>
            <input style={S.input} type="number" value={remainingBalance} onChange={e => setRemainingBalance(e.target.value)} placeholder="285000" />
          </div>
          {cashOutType === 'typeII' && (
            <div>
              <label style={S.label}>Cash-Out Amount to Borrower ($)</label>
              <input style={S.input} type="number" value={cashOutAmount} onChange={e => setCashOutAmount(e.target.value)} placeholder="20000" />
            </div>
          )}
        </div>

        {appraisalVal > 0 && remBal > 0 && (
          <div style={{ ...S.card, background: '#f8fafc', marginTop: 14, marginBottom: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>LTV Analysis</div>
            <div style={S.grid3}>
              {[
                ['New Loan Amount', fmtDollar(cashOutLoanAmt)],
                ['Appraised Value', fmtDollar(appraisalVal)],
                ['LTV', `${cashOutLTV.toFixed(2)}%`],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7a8d' }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: cashOutLTV > 100 ? '#8b1a1a' : '#0d3b6e', marginTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
            {cashOutLTV > 100 && (
              <div style={{ ...S.errorBox, marginTop: 12 }}>
                ❌ LTV exceeds 100% — VA Cash-Out maximum is 100% LTV. Many investors cap at 90%. Reduce cash-out amount or verify appraised value.
              </div>
            )}
            {cashOutLTV <= 100 && cashOutLTV > 0 && (
              <div style={{ ...S.successBox, marginTop: 12 }}>
                ✅ LTV of {cashOutLTV.toFixed(2)}% is within VA Cash-Out limits (max 100%). Confirm investor overlay.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <div style={S.card}>
        <div style={S.cardTitle}>📊 VA IRRRL vs Cash-Out — Side-by-Side</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['Feature', 'VA IRRRL (Streamline)', 'VA Cash-Out Refi'].map(h => (
                <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Appraisal',            'Not required',         'Required'],
              ['Income verification',  'Not required',         'Required'],
              ['Credit qualifying',    'Not required',         'Required'],
              ['Cash to borrower',     'Not permitted',        'Permitted (Type II)'],
              ['Max LTV',              'N/A (no appraisal)',   '100% (lender overlays may be lower)'],
              ['Funding fee',          '0.5%',                 '2.15% (1st use) / 3.30% (subsequent)'],
              ['Certificate of Occ.', 'Not required',         'Required if new construction'],
              ['Turn time',            'Faster (streamline)',  'Standard full-doc timeline'],
            ].map(([feature, irrrl, cashout]) => (
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

  // ─────────────────────────────────────────────────────────────────────────
  const renderDocChecklist = () => {
    const total   = DOC_ITEMS.length;
    const checked = Object.values(checkedDocs).filter(Boolean).length;
    const pct     = Math.round((checked / total) * 100);

    return (
      <div>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={S.cardTitle}>✔️ VA IRRRL Document Checklist</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0d3b6e' }}>{checked} / {total} collected</div>
          </div>
          <div style={S.infoBox}>
            VA IRRRL is a streamline refinance — no appraisal, no income docs. Lenders may have additional overlays. Always confirm with your investor.
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a8d', marginBottom: 5 }}>
              <span>Collection Progress</span><span>{pct}%</span>
            </div>
            <div style={{ height: 8, background: '#e0e7ef', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#0d3b6e', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
          </div>

          {DOC_ITEMS.map(item => {
            const checked = !!checkedDocs[item.id];
            const showIRRRLTag  = item.tag === 'irrrl'  && priorIRRRL;
            const showExemptTag = item.tag === 'exempt' && fundingFeeExempt === true;
            return (
              <div
                key={item.id}
                onClick={() => setCheckedDocs(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 8, marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s',
                  background: checked ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${checked ? '#86efac' : '#e0e7ef'}`,
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                  background: checked ? '#22c55e' : '#fff',
                  border: `2px solid ${checked ? '#22c55e' : '#d0dbe8'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                }}>
                  {checked ? '✓' : ''}
                </div>
                <span style={{ fontSize: 14, flex: 1, textDecoration: checked ? 'line-through' : 'none', color: checked ? '#5a7a6e' : '#1a1a2e' }}>
                  {item.label}
                </span>
                {showIRRRLTag  && <span style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>Required — IRRRL-to-IRRRL</span>}
                {showExemptTag && <span style={{ fontSize: 11, background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>Required — Fee Exemption</span>}
              </div>
            );
          })}
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
    'pricing': () => (
      <VAIRRRLPricingCommission
        loanAmount={newLoanAmt}
        currentRate={currentRatePct}
        currentPI={currentPI}
        newRate={newRatePct}
        newPI={newPICalc}
        fundingFeeStatus={fundingFeeExempt === true ? 'exempt' : fundingFeeExempt === false ? 'not_exempt' : 'unknown'}
        veteranName={veteranName}
        propertyAddress={propertyAddress}
        remainingTerm={remTermMos}
      />
    ),
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.container}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.headerTop}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3, letterSpacing: '0.08em' }}>MODULE 11 OF 27</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>VA IRRRL</h1>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3 }}>Interest Rate Reduction Refinance Loan</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span style={S.badge}>🎖️ VA STREAMLINE</span>
            {benefitTestPass   && <span style={{ ...S.badge, ...S.badgeGreen }}>✅ NTB SATISFIED</span>}
            {fundingFeeExempt  && <span style={{ ...S.badge, ...S.badgeGold  }}>🎖️ FEE EXEMPT</span>}
            {priorIRRRL        && <span style={{ ...S.badge, background: 'rgba(249,100,70,0.25)', color: '#fda09a' }}>🚩 IRRRL-to-IRRRL</span>}
          </div>
        </div>

        {/* Scenario Selector */}
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
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {tabRenderers[activeTab]?.()}

      {/* ── Canonical Sequence™ Bar ── */}
      <div style={S.canonicalBar}>
        {canonicalExpanded && (
          <div style={{ background: '#0a2d54', padding: '10px 16px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 8, letterSpacing: '0.1em' }}>
              CANONICAL SEQUENCE™ — 27 MODULES
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
              {MODULES.map(m => (
                <button
                  key={m.id}
                  onClick={() => navigate(m.path)}
                  title={m.label}
                  style={{
                    padding: '3px 8px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: m.id === CURRENT_MODULE ? '#f9c846' : 'rgba(255,255,255,0.1)',
                    color:      m.id === CURRENT_MODULE ? '#000'      : 'rgba(255,255,255,0.65)',
                    fontWeight: m.id === CURRENT_MODULE ? 700          : 400,
                  }}
                >
                  {m.id}. {m.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={S.canonicalMain}>
          <button
            style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, padding: '6px 12px', opacity: prevMod ? 1 : 0.4 }}
            onClick={() => prevMod && navigate(prevMod.path)}
            disabled={!prevMod}
          >
            ← {prevMod?.label || ''}
          </button>

          <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {MODULES.map(m => (
              <div
                key={m.id}
                title={m.label}
                style={S.dot(m.id === CURRENT_MODULE)}
                onClick={() => navigate(m.path)}
              >
                {m.id === CURRENT_MODULE ? m.id : ''}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', padding: '4px 8px', fontSize: 11 }}
              onClick={() => setCanonicalExpanded(!canonicalExpanded)}
            >
              {canonicalExpanded ? '▼' : '▲'} Map
            </button>
            <button
              style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, padding: '6px 12px', opacity: nextMod ? 1 : 0.4 }}
              onClick={() => nextMod && navigate(nextMod.path)}
              disabled={!nextMod}
            >
              {nextMod?.label || ''} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
