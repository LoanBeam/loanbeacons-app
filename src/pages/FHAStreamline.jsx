// src/pages/FHAStreamline.jsx
// LoanBeacons™ — FHA Streamline Intelligence™
// v7.0 — Full rebuild matching VA IRRRL v3.4 architecture
// UFMIP refund correctly wired | Real-time calculations | localStorage | DR Option B

import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { app } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { MODULE_KEYS } from '../constants/decisionRecordConstants';

const functions = getFunctions(app);
const db        = getFirestore(app);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt       = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDollar = (n) => (n == null || isNaN(n) ? '—' : `$${fmt(n)}`);
const fmtPct    = (n, d = 3) => (n == null || isNaN(n) ? '—' : `${Number(n).toFixed(d)}%`);

const calcPI = (principal, annualRatePct, termMonths) => {
  if (!principal || !annualRatePct || !termMonths || principal <= 0 || termMonths <= 0) return 0;
  const r = (annualRatePct / 100) / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
};

// ─── FHA Rules ────────────────────────────────────────────────────────────────
const NEW_UFMIP_RATE    = 0.0175;   // 1.75% of new loan amount
const NEW_ANNUAL_MIP    = 0.0055;   // 0.55% — current FHA annual MIP for streamline
const NTB_MIN_REDUCTION = 0.50;     // combined rate+MIP reduction required (%)

// HUD UFMIP Refund Schedule — linear decline from 80% at month 0 to 0% at month 36
// Per HUD Handbook 4000.1. No refund after 36 months.
const UFMIP_REFUND = (months) => {
  if (months <= 0)  return 0.80;
  if (months >= 36) return 0;
  return Math.max(0, 0.80 * (1 - months / 36));
};

// ─── GA County Tax Data ───────────────────────────────────────────────────────
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

// ─── Canonical Sequence ───────────────────────────────────────────────────────
const MODULES = [
  { id: 1,  label: 'Scenario Creator',      path: '/scenario-creator' },
  { id: 2,  label: 'Qualifying Intel',      path: '/qualifying-intel' },
  { id: 3,  label: 'Income Analyzer',       path: '/income-analyzer' },
  { id: 4,  label: 'Credit Intel',          path: '/credit-intel' },
  { id: 5,  label: 'Lender Match',          path: '/lender-match' },
  { id: 6,  label: 'Debt Resolution',       path: '/debt-resolution' },
  { id: 7,  label: 'DPA Intelligence',      path: '/dpa-intelligence' },
  { id: 8,  label: 'ARM Structure',         path: '/arm-structure' },
  { id: 9,  label: 'Piggyback Optimizer',   path: '/piggyback-optimizer' },
  { id: 10, label: 'FHA Streamline',        path: '/fha-streamline' },
  { id: 11, label: 'VA IRRRL',              path: '/va-irrrl' },
  { id: 12, label: 'CRA Eligibility',       path: '/cra-eligibility' },
  { id: 13, label: 'USDA Intelligence',     path: '/usda-intelligence' },
  { id: 14, label: 'Disclosure Intel',      path: '/disclosure-intel' },
  { id: 15, label: 'Compliance Intel',      path: '/compliance-intel' },
  { id: 16, label: 'Flood Intel',           path: '/flood-intel' },
  { id: 17, label: 'Rehab Intelligence',    path: '/rehab-intelligence' },
  { id: 18, label: 'Intelligent Checklist', path: '/intelligent-checklist' },
  { id: 19, label: 'Bank Statement Intel',  path: '/bank-statement-intel' },
  { id: 20, label: 'AUS Rescue',            path: '/aus-rescue' },
  { id: 21, label: 'Decision Record',       path: '/decision-record' },
  { id: 22, label: 'Loan Path Graph',       path: '/loan-path-graph' },
  { id: 23, label: 'Lender Profile',        path: '/lender-profile' },
  { id: 24, label: 'AE Share',              path: '/ae-share' },
  { id: 25, label: 'Rate Sensitivity',      path: '/rate-sensitivity' },
  { id: 26, label: 'Scenarios',             path: '/scenarios' },
  { id: 27, label: 'Admin Center',          path: '/admin' },
];

const TABS = [
  { id: 'snapshot',      label: 'Loan Snapshot' },
  { id: 'eligibility',   label: 'Eligibility' },
  { id: 'ntb',           label: 'NTB Test' },
  { id: 'ufmip',         label: 'UFMIP Calculator' },
  { id: 'rate-options',  label: 'Rate Options' },
  { id: 'pricing',       label: 'Pricing & Comp' },
  { id: 'ntb-worksheet', label: 'NTB Worksheet' },
  { id: 'uw-worksheet',  label: 'UW Worksheet' },
  { id: 'doc-checklist', label: 'Doc Checklist' },
  { id: 'property-tax',  label: 'Property Tax' },
];

const DOC_ITEMS = [
  { id: 'cd',            label: 'Original Closing Disclosure or HUD-1' },
  { id: 'statement',     label: 'Current Mortgage Statement' },
  { id: 'payment_hist',  label: '12-Month Payment History from Servicer' },
  { id: 'case_confirm',  label: 'FHA Case Number Confirmation (FHA Connection)' },
  { id: 'photo_id',      label: 'Government-Issued Photo ID' },
  { id: 'ssn_doc',       label: 'Social Security Card or SSN Documentation' },
  { id: 'hoi',           label: 'Homeowners Insurance Declaration Page' },
  { id: 'tax_stmt',      label: 'Property Tax Statement or County Tax Record' },
  { id: 'flood',         label: 'Flood Zone Determination' },
  { id: 'title',         label: 'Title Commitment / Title Search' },
  { id: 'payoff',        label: 'Payoff Statement from Current Servicer' },
  { id: 'app1003',       label: 'Updated Loan Application (1003)' },
  { id: 'ntb_worksheet', label: 'FHA Streamline NTB Worksheet' },
  { id: 'hoa_ins',       label: 'HOA Master Insurance (if condo — optional)' },
  { id: 'subordination', label: 'Subordination Agreement (if 2nd lien — optional)' },
];

// ─── Styles (matching VA IRRRL v3.4) ─────────────────────────────────────────
const S = {
  container:    { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '24px 20px 160px', color: '#1a1a2e', minHeight: '100vh' },
  header:       { background: 'linear-gradient(135deg, #0f4c81 0%, #1565c0 100%)', borderRadius: 12, padding: '20px 24px', marginBottom: 20, color: '#fff' },
  headerTop:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  badge:        { display: 'inline-block', background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' },
  badgeGreen:   { background: 'rgba(34,197,94,0.25)', color: '#86efac' },
  badgeRed:     { background: 'rgba(239,68,68,0.25)',  color: '#fca5a5' },
  badgeAmber:   { background: 'rgba(245,158,11,0.25)', color: '#fcd34d' },
  scenarioRow:  { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  headerSelect: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13, minWidth: 220, cursor: 'pointer' },
  tabBar:       { display: 'flex', gap: 3, flexWrap: 'wrap', borderBottom: '2px solid #e0e7ef', marginBottom: 20 },
  tab: (a) =>   ({ padding: '8px 10px', borderRadius: '8px 8px 0 0', border: 'none', background: a ? '#0f4c81' : 'transparent', color: a ? '#fff' : '#6b7a8d', fontWeight: a ? 700 : 500, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: a ? -2 : 0, borderBottom: a ? '2px solid #0f4c81' : 'none', transition: 'all 0.15s' }),
  card:         { background: '#fff', borderRadius: 10, border: '1px solid #e0e7ef', padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  cardTitle:    { fontSize: 15, fontWeight: 700, color: '#0f4c81', marginBottom: 14, borderBottom: '1px solid #f0f4f8', paddingBottom: 10 },
  grid2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  grid3:        { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  grid4:        { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 },
  label:        { fontSize: 12, fontWeight: 600, color: '#6b7a8d', marginBottom: 4, display: 'block' },
  input:        { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d0dbe8', fontSize: 13, color: '#1a1a2e', boxSizing: 'border-box', outline: 'none' },
  inputRO:      { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e0e7ef', fontSize: 13, color: '#1a1a2e', boxSizing: 'border-box', background: '#f8fafc', fontWeight: 700 },
  btn:          { padding: '9px 18px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s' },
  btnPrimary:   { background: '#0f4c81', color: '#fff' },
  btnSecondary: { background: '#e9eef5', color: '#1a1a2e' },
  btnGhost:     { background: 'transparent', color: '#0f4c81', border: '1px solid #0f4c81' },
  btnRed:       { background: '#fdf0f0', color: '#8b1a1a', padding: '4px 10px', fontSize: 12 },
  infoBox:      { background: '#eef4fb', border: '1px solid #b8d0e8', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#1a4a7e', marginBottom: 14 },
  warningBox:   { background: '#fffbeb', border: '1px solid #f9c846', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#7a5a00' },
  errorBox:     { background: '#fdf0f0', border: '1px solid #f5c6c6', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#8b1a1a' },
  successBox:   { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#166534' },
  canonicalBar: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: '#0f4c81', boxShadow: '0 -2px 12px rgba(0,0,0,0.18)' },
  canonicalMain:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', maxWidth: 1100, margin: '0 auto', gap: 10 },
  dot: (a) =>   ({ width: a ? 22 : 14, height: a ? 22 : 14, borderRadius: '50%', background: a ? '#f9c846' : 'rgba(255,255,255,0.2)', border: a ? '2px solid #fff' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: a ? '#000' : 'transparent', transition: 'all 0.15s', flexShrink: 0 }),
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FHAStreamline() {
  const CURRENT_MODULE = 10;
  const prevMod = MODULES[CURRENT_MODULE - 2];
  const nextMod = MODULES[CURRENT_MODULE];
  const navigate = (path) => { window.location.href = path; };

  // ── Scenario
  const [scenarios,        setScenarios]        = useState([]);
  const [selectedScenId,   setSelectedScenId]   = useState('');
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  // ── Decision Record (Option B — auto-log on Save)
  const [drRecordId, setDrRecordId] = useState(null);
  const { reportFindings }          = useDecisionRecord(selectedScenId);

  // ── UI
  const [activeTab,         setActiveTab]         = useState('snapshot');
  const [canonicalExpanded, setCanonicalExpanded] = useState(false);
  const [savedAt,           setSavedAt]           = useState(null);
  const [saveFlash,         setSaveFlash]         = useState(false);

  // ── Existing Loan Details
  const [borrowerName,     setBorrowerName]     = useState('');
  const [propertyAddress,  setPropertyAddress]  = useState('');
  const [caseNumber,       setCaseNumber]       = useState('');
  const [endorsementDate,  setEndorsementDate]  = useState('');
  const [existingUPB,      setExistingUPB]      = useState('');
  const [existingRate,     setExistingRate]     = useState('');
  const [existingPI,       setExistingPI]       = useState('');
  const [existingMIP,      setExistingMIP]      = useState('');  // monthly MIP ($)
  const [existingMIPFactor,setExistingMIPFactor]= useState('0.55'); // annual MIP (%)
  const [originalUFMIP,    setOriginalUFMIP]    = useState('');  // original UFMIP paid ($)
  const [isFHAInsured,     setIsFHAInsured]     = useState(true);
  const [estimatedValue,   setEstimatedValue]   = useState('');

  // ── New Loan
  const [newRate, setNewRate] = useState('');
  const [newTerm, setNewTerm] = useState('360');

  // ── Eligibility Inputs
  const [isDelinquent,    setIsDelinquent]    = useState(false);
  const [latesLast6,      setLatesLast6]      = useState(0);
  const [latesMo7to12,    setLatesMo7to12]    = useState(0);
  const [occupancy,       setOccupancy]       = useState('OWNER');
  const [inForbearance,   setInForbearance]   = useState(false);
  const [borrowerRemoved, setBorrowerRemoved] = useState(false);
  const [titleChanged,    setTitleChanged]    = useState(false);

  // ── Rate Options (up to 3 lender quotes)
  const [rateOptions, setRateOptions] = useState([
    { id: 1, lender: '', rate: '', price: '', lenderCredit: '' },
    { id: 2, lender: '', rate: '', price: '', lenderCredit: '' },
    { id: 3, lender: '', rate: '', price: '', lenderCredit: '' },
  ]);

  // ── Closing Cost Estimator (single source of truth — flows to NTB, Pricing, UW)
  const [ccMode,        setCcMode]        = useState('itemized');
  const [ccTitle,       setCcTitle]       = useState('850');
  const [ccTitleIns,    setCcTitleIns]    = useState('650');
  const [ccRecording,   setCcRecording]   = useState('125');
  const [ccOrigination, setCcOrigination] = useState('0');
  const [ccProcessing,  setCcProcessing]  = useState('895');
  const [ccUnderwriting,setCcUnderwriting]= useState('0');
  const [ccOther,       setCcOther]       = useState('0');
  const [ccLumpSum,     setCcLumpSum]     = useState('');

  // ── Pricing & Comp
  const [compLOSplit,        setCompLOSplit]        = useState('70');
  const [compLPCRate,        setCompLPCRate]        = useState('2.75');
  const [compBPCPoints,      setCompBPCPoints]      = useState('1.0');
  const [compProcessingFee,  setCompProcessingFee]  = useState('395');
  const [compAdminFee,       setCompAdminFee]       = useState('0');
  const [compOtherDeductions,setCompOtherDeductions]= useState('0');

  // ── Property Tax
  const [taxState,      setTaxState]      = useState('GA');
  const [taxCounty,     setTaxCounty]     = useState('');
  const [taxCityMills,  setTaxCityMills]  = useState('');
  const [taxFMV,        setTaxFMV]        = useState('');
  const [taxResult,     setTaxResult]     = useState(null);

  // ── PDF Upload
  const [pdfFiles,          setPdfFiles]          = useState({ cd: null, statement: null, payment: null });
  const [isDragging,        setIsDragging]        = useState({ cd: false, statement: false, payment: false });
  const [isExtracting,      setIsExtracting]      = useState(false);
  const [extractionError,   setExtractionError]   = useState('');
  const [extractionSuccess, setExtractionSuccess] = useState(false);
  const cdRef        = useRef(null);
  const statementRef = useRef(null);
  const paymentRef   = useRef(null);

  // ── Doc Checklist
  const [checkedDocs, setCheckedDocs] = useState({});

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPUTED VALUES (real-time, no "Run" button)
  // ─────────────────────────────────────────────────────────────────────────────
  const upb            = parseFloat(existingUPB)      || 0;
  const existingRateN  = parseFloat(existingRate)     || 0;
  const newRateN       = parseFloat(newRate)          || 0;
  const termMos        = parseInt(newTerm)            || 360;
  const mipFactorN     = parseFloat(existingMIPFactor)|| 0.55;
  const origUFMIPAmt   = parseFloat(originalUFMIP)   || 0;
  const existingPIAmt  = parseFloat(existingPI)       || 0;
  const existingMIPAmt = parseFloat(existingMIP)      || 0;

  // ── UFMIP refund (FIXED: floor at 0, PI on correct loan amount)
  const monthsElapsed  = endorsementDate
    ? Math.max(0, Math.floor((Date.now() - new Date(endorsementDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    : 0;
  const ufmipRefundPct = UFMIP_REFUND(monthsElapsed);
  const ufmipRefundAmt = origUFMIPAmt * ufmipRefundPct;
  const newUFMIPGross  = upb * NEW_UFMIP_RATE;
  const netUFMIP       = Math.max(0, newUFMIPGross - ufmipRefundAmt); // FIXED: floor at 0
  const newLoanAmt     = upb + netUFMIP;                               // FIXED: was just upb

  // ── Closing costs
  const ccItemizedTotal = [ccTitle, ccTitleIns, ccRecording, ccOrigination, ccProcessing, ccUnderwriting, ccOther]
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const effectiveCC = ccMode === 'itemized' ? ccItemizedTotal : (parseFloat(ccLumpSum) || 0);

  // ── New payment (FIXED: calcPI on newLoanAmt, not raw upb)
  const newPIAmt      = newRateN > 0 && newLoanAmt > 0 ? calcPI(newLoanAmt, newRateN, termMos) : 0;
  const newMIPMonthly = (newLoanAmt * NEW_ANNUAL_MIP) / 12;

  // ── NTB combined rate test
  const existingCombined  = existingRateN + mipFactorN;
  const newCombined       = newRateN + (NEW_ANNUAL_MIP * 100); // 0.0055 → 0.55%
  const combinedReduction = existingCombined - newCombined;
  const ntbCombinedPass   = combinedReduction >= NTB_MIN_REDUCTION;

  // ── NTB payment test
  const existingTotalPmt = existingPIAmt + existingMIPAmt;
  const newTotalPmt      = newPIAmt + newMIPMonthly;
  const paymentSavings   = existingTotalPmt - newTotalPmt;
  const ntbPaymentPass   = paymentSavings > 0;
  const ntbPass          = ntbCombinedPass; // FHA NTB is the combined rate test per HUD

  // ── Recoupment (uses netUFMIP per HUD — not closing costs alone)
  const recoupMos = paymentSavings > 0 ? Math.ceil((netUFMIP + effectiveCC) / paymentSavings) : Infinity;

  // ── Seasoning
  const seasoningDays = endorsementDate
    ? Math.floor((Date.now() - new Date(endorsementDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const seasoningPass = seasoningDays >= 210;

  // ── Eligibility rules (real-time)
  const eligRules = [
    { id: 'R001', rule: 'FHA-insured loan confirmed',            pass: isFHAInsured,                        hard: true  },
    { id: 'R002', rule: 'Loan is current (not delinquent)',       pass: !isDelinquent,                       hard: true  },
    { id: 'R003', rule: 'No late payments — last 6 months',      pass: latesLast6 === 0,                    hard: true  },
    { id: 'R004', rule: 'Max 1 late payment — months 7–12',      pass: latesMo7to12 <= 1,                   hard: false },
    { id: 'R005', rule: 'Owner-occupied property',                pass: occupancy === 'OWNER',               hard: false },
    { id: 'R006', rule: 'Not in forbearance or loss mitigation', pass: !inForbearance,                      hard: true  },
    { id: 'R007', rule: 'No borrower / title changes',           pass: !borrowerRemoved && !titleChanged,   hard: false },
    { id: 'R008', rule: '210-day seasoning satisfied',           pass: seasoningPass,                       hard: true  },
  ];
  const hardFails  = eligRules.filter(r => !r.pass && r.hard).length;
  const warns      = eligRules.filter(r => !r.pass && !r.hard).length;
  const eligStatus = hardFails > 0 ? 'INELIGIBLE' : warns > 0 ? 'NEEDS_INFO' : 'ELIGIBLE';

  // ── Commission
  const loSplit     = parseFloat(compLOSplit) / 100 || 0.70;
  const lpcRateN    = parseFloat(compLPCRate) / 100 || 0;
  const bpcPointsN  = parseFloat(compBPCPoints) / 100 || 0;
  const compDeduct  = (parseFloat(compProcessingFee) || 0) + (parseFloat(compAdminFee) || 0) + (parseFloat(compOtherDeductions) || 0);
  const lpcGross    = upb * lpcRateN;
  const lpcNet      = lpcGross * loSplit - compDeduct;
  const bpcGross    = upb * bpcPointsN;
  const bpcNet      = bpcGross * loSplit - compDeduct;
  const lpcEffRate  = upb > 0 ? (lpcNet / upb) * 100 : 0;
  const bpcEffRate  = upb > 0 ? (bpcNet / upb) * 100 : 0;
  const compRec     = lpcNet >= bpcNet ? 'LPC' : 'BPC';

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE / RESTORE (localStorage)
  // ─────────────────────────────────────────────────────────────────────────────
  const getSaveKey = () => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('scenarioId') || selectedScenId || 'default';
    return `lb_fha_streamline_${sid}`;
  };

  const getStateSnapshot = () => ({
    borrowerName, propertyAddress, caseNumber, endorsementDate,
    existingUPB, existingRate, existingPI, existingMIP, existingMIPFactor, originalUFMIP,
    isFHAInsured, estimatedValue, newRate, newTerm,
    isDelinquent, latesLast6, latesMo7to12, occupancy, inForbearance, borrowerRemoved, titleChanged,
    rateOptions, checkedDocs,
    ccMode, ccTitle, ccTitleIns, ccRecording, ccOrigination, ccProcessing, ccUnderwriting, ccOther, ccLumpSum,
    compLOSplit, compLPCRate, compBPCPoints, compProcessingFee, compAdminFee, compOtherDeductions,
    taxState, taxCounty, taxCityMills, taxFMV,
  });

  const restoreFromStorage = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.borrowerName     !== undefined) setBorrowerName(d.borrowerName);
      if (d.propertyAddress  !== undefined) setPropertyAddress(d.propertyAddress);
      if (d.caseNumber       !== undefined) setCaseNumber(d.caseNumber);
      if (d.endorsementDate  !== undefined) setEndorsementDate(d.endorsementDate);
      if (d.existingUPB      !== undefined) setExistingUPB(d.existingUPB);
      if (d.existingRate     !== undefined) setExistingRate(d.existingRate);
      if (d.existingPI       !== undefined) setExistingPI(d.existingPI);
      if (d.existingMIP      !== undefined) setExistingMIP(d.existingMIP);
      if (d.existingMIPFactor!== undefined) setExistingMIPFactor(d.existingMIPFactor);
      if (d.originalUFMIP    !== undefined) setOriginalUFMIP(d.originalUFMIP);
      if (d.isFHAInsured     !== undefined) setIsFHAInsured(d.isFHAInsured);
      if (d.estimatedValue   !== undefined) setEstimatedValue(d.estimatedValue);
      if (d.newRate          !== undefined) setNewRate(d.newRate);
      if (d.newTerm          !== undefined) setNewTerm(d.newTerm);
      if (d.isDelinquent     !== undefined) setIsDelinquent(d.isDelinquent);
      if (d.latesLast6       !== undefined) setLatesLast6(d.latesLast6);
      if (d.latesMo7to12     !== undefined) setLatesMo7to12(d.latesMo7to12);
      if (d.occupancy        !== undefined) setOccupancy(d.occupancy);
      if (d.inForbearance    !== undefined) setInForbearance(d.inForbearance);
      if (d.borrowerRemoved  !== undefined) setBorrowerRemoved(d.borrowerRemoved);
      if (d.titleChanged     !== undefined) setTitleChanged(d.titleChanged);
      if (d.rateOptions      !== undefined) setRateOptions(d.rateOptions);
      if (d.checkedDocs      !== undefined) setCheckedDocs(d.checkedDocs);
      if (d.ccMode           !== undefined) setCcMode(d.ccMode);
      if (d.ccTitle          !== undefined) setCcTitle(d.ccTitle);
      if (d.ccTitleIns       !== undefined) setCcTitleIns(d.ccTitleIns);
      if (d.ccRecording      !== undefined) setCcRecording(d.ccRecording);
      if (d.ccOrigination    !== undefined) setCcOrigination(d.ccOrigination);
      if (d.ccProcessing     !== undefined) setCcProcessing(d.ccProcessing);
      if (d.ccUnderwriting   !== undefined) setCcUnderwriting(d.ccUnderwriting);
      if (d.ccOther          !== undefined) setCcOther(d.ccOther);
      if (d.ccLumpSum        !== undefined) setCcLumpSum(d.ccLumpSum);
      if (d.compLOSplit      !== undefined) setCompLOSplit(d.compLOSplit);
      if (d.compLPCRate      !== undefined) setCompLPCRate(d.compLPCRate);
      if (d.compBPCPoints    !== undefined) setCompBPCPoints(d.compBPCPoints);
      if (d.compProcessingFee!== undefined) setCompProcessingFee(d.compProcessingFee);
      if (d.compAdminFee     !== undefined) setCompAdminFee(d.compAdminFee);
      if (d.compOtherDeductions!==undefined)setCompOtherDeductions(d.compOtherDeductions);
      if (d.taxState         !== undefined) setTaxState(d.taxState);
      if (d.taxCounty        !== undefined) setTaxCounty(d.taxCounty);
      if (d.taxCityMills     !== undefined) setTaxCityMills(d.taxCityMills);
      if (d.taxFMV           !== undefined) setTaxFMV(d.taxFMV);
      if (d.savedAt) setSavedAt(new Date(d.savedAt));
      return true;
    } catch { return false; }
  };

  // ── handleSave: localStorage + DR Option B auto-log ──────────────────────
  const handleSave = async () => {
    // 1. localStorage
    try {
      const key      = getSaveKey();
      const snapshot = { ...getStateSnapshot(), savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(snapshot));
      setSavedAt(new Date());
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
    } catch (e) { console.warn('FHA Save failed:', e); }

    // 2. Decision Record auto-log (Option B)
    if (selectedScenId) {
      try {
        const findings = {
          borrowerName:         borrowerName || null,
          propertyAddress:      propertyAddress || null,
          caseNumber:           caseNumber || null,
          endorsementDate:      endorsementDate || null,
          monthsElapsed:        monthsElapsed || null,
          seasoningDays:        seasoningDays || null,
          seasoningPass,
          existingUPB:          upb || null,
          existingRatePct:      existingRateN || null,
          existingPI:           existingPIAmt || null,
          existingMIP:          existingMIPAmt || null,
          existingMIPFactor:    mipFactorN,
          originalUFMIP:        origUFMIPAmt || null,
          isFHAInsured,
          newRatePct:           newRateN || null,
          newTermMonths:        termMos,
          ufmipRefundPct:       +(ufmipRefundPct * 100).toFixed(1),
          ufmipRefundAmt:       +ufmipRefundAmt.toFixed(2),
          newUFMIPGross:        +newUFMIPGross.toFixed(2),
          netUFMIP:             +netUFMIP.toFixed(2),
          newLoanAmount:        +newLoanAmt.toFixed(2),
          newPI:                newPIAmt > 0 ? +newPIAmt.toFixed(2) : null,
          newMIPMonthly:        +newMIPMonthly.toFixed(2),
          existingCombinedRate: +existingCombined.toFixed(3),
          newCombinedRate:      +newCombined.toFixed(3),
          combinedReduction:    +combinedReduction.toFixed(3),
          ntbCombinedPass,
          paymentSavings:       paymentSavings > 0 ? +paymentSavings.toFixed(2) : null,
          ntbPaymentPass,
          ntbSatisfied:         ntbPass,
          recoupmentMonths:     isFinite(recoupMos) ? recoupMos : null,
          totalClosingCosts:    +effectiveCC.toFixed(2),
          eligibilityStatus:    eligStatus,
          docsChecked:          Object.values(checkedDocs).filter(Boolean).length,
          totalDocs:            DOC_ITEMS.length,
          savedAt:              new Date().toISOString(),
        };
        const rid = await reportFindings(MODULE_KEYS.FHA_STREAMLINE, findings, [], [], '7.0.0');
        if (rid) setDrRecordId(rid);
      } catch (e) { console.warn('[DR] FHA reportFindings failed:', e); }
    }
  };

  // ── Scenario loading ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingScenarios(true);
      const params0 = new URLSearchParams(window.location.search);
      const sid0    = params0.get('scenarioId') || 'default';
      restoreFromStorage(`lb_fha_streamline_${sid0}`);
      try {
        const params = new URLSearchParams(window.location.search);
        const sid    = params.get('scenarioId');
        if (sid) {
          const snap = await getDoc(doc(db, 'scenarios', sid));
          if (snap.exists()) {
            const m = { id: snap.id, ...snap.data() };
            setSelectedScenId(sid);
            const name = m.borrowerName || m.borrower_name || ((m.firstName || '') + ' ' + (m.lastName || '')).trim() || '';
            if (name) setBorrowerName(name);
            const addr = m.propertyAddress || m.subjectPropertyAddress || [m.streetAddress, m.city, m.state].filter(Boolean).join(', ') || '';
            if (addr) setPropertyAddress(addr);
            if (m.loanAmount || m.currentLoanAmount) setExistingUPB(String(m.loanAmount || m.currentLoanAmount));
            if (m.interestRate) setExistingRate(String(m.interestRate));
            if (m.propertyValue || m.estimatedValue) setEstimatedValue(String(m.propertyValue || m.estimatedValue));
          }
        }
        try {
          const q    = query(collection(db, 'scenarios'), orderBy('created_at', 'desc'), limit(15));
          const snp  = await getDocs(q);
          const list = snp.docs.map(d => ({ id: d.id, ...d.data() }));
          setScenarios(list);
          if (sid && !list.find(x => x.id === sid)) {
            const snap2 = await getDoc(doc(db, 'scenarios', sid));
            if (snap2.exists()) setScenarios([{ id: snap2.id, ...snap2.data() }, ...list]);
          }
        } catch (e) { console.warn('Scenario list load failed:', e.message); }
      } catch (e) { console.error('FHA load error:', e); }
      finally { setLoadingScenarios(false); }
    };
    load();
  }, []);

  const handleScenarioSelect = (id) => {
    setSelectedScenId(id);
    const s = scenarios.find(x => x.id === id);
    if (!s) return;
    const name = s.borrowerName || s.borrower_name || ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || '';
    if (name) setBorrowerName(name);
    if (s.propertyAddress) setPropertyAddress(s.propertyAddress);
    if (s.loanAmount || s.currentLoanAmount) setExistingUPB(String(s.loanAmount || s.currentLoanAmount));
    if (s.interestRate) setExistingRate(String(s.interestRate));
    if (s.propertyValue) setEstimatedValue(String(s.propertyValue));
  };

  // ── PDF handlers ─────────────────────────────────────────────────────────
  const handleDragOver  = (zone) => (e) => { e.preventDefault(); setIsDragging(p => ({ ...p, [zone]: true })); };
  const handleDragLeave = (zone) => ()  => setIsDragging(p => ({ ...p, [zone]: false }));
  const handleDrop = (zone) => (e) => {
    e.preventDefault();
    setIsDragging(p => ({ ...p, [zone]: false }));
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') { setPdfFiles(p => ({ ...p, [zone]: file })); setExtractionError(''); setExtractionSuccess(false); }
  };
  const handleFileSelect = (zone) => (e) => {
    const file = e.target.files[0];
    if (file) { setPdfFiles(p => ({ ...p, [zone]: file })); setExtractionError(''); setExtractionSuccess(false); }
  };
  const clearZone = (zone) => { setPdfFiles(p => ({ ...p, [zone]: null })); setExtractionSuccess(false); setExtractionError(''); };

  const handleExtract = async () => {
    const uploaded = Object.entries(pdfFiles).filter(([, f]) => f !== null);
    if (uploaded.length === 0) return;
    setIsExtracting(true); setExtractionError(''); setExtractionSuccess(false);
    try {
      const toBase64 = (file) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('File read failed'));
        r.readAsDataURL(file);
      });
      const documents = await Promise.all(
        uploaded.map(async ([label, file]) => ({ label, base64: await toBase64(file), mediaType: 'application/pdf' }))
      );
      const extractFn = httpsCallable(functions, 'extractFHADocument');
      const result    = await extractFn({ documents });
      const d = result.data || {};
      if (d.borrowerName || d.borrower_name) setBorrowerName(d.borrowerName || d.borrower_name);
      if (d.existingUPB || d.existing_upb)   setExistingUPB(String(d.existingUPB || d.existing_upb));
      if (d.existingRate || d.existing_note_rate) setExistingRate(String(d.existingRate || d.existing_note_rate));
      if (d.existingPI || d.existing_monthly_pi)  setExistingPI(String(d.existingPI || d.existing_monthly_pi));
      if (d.existingMIP || d.existing_monthly_mip) setExistingMIP(String(d.existingMIP || d.existing_monthly_mip));
      if (d.originalUFMIP || d.original_ufmip)     setOriginalUFMIP(String(d.originalUFMIP || d.original_ufmip));
      if (d.endorsementDate || d.endorsement_date) setEndorsementDate(d.endorsementDate || d.endorsement_date);
      if (d.caseNumber || d.existing_case_number)  setCaseNumber(d.caseNumber || d.existing_case_number);
      if (d.propertyAddress) setPropertyAddress(d.propertyAddress);
      setExtractionSuccess(true);
    } catch (err) {
      setExtractionError(err.message || 'Extraction failed — enter fields manually.');
    } finally { setIsExtracting(false); }
  };

  // ── Property Tax ─────────────────────────────────────────────────────────
  const runTaxCalc = () => {
    const fmv = parseFloat(taxFMV) || parseFloat(estimatedValue) || 0;
    if (!fmv) return;
    if (taxState === 'GA' && GA_COUNTIES[taxCounty]) {
      const data      = GA_COUNTIES[taxCounty];
      const totalMill = data.millage + (parseFloat(taxCityMills) || 0);
      const assessed  = fmv * 0.40;
      const annual    = assessed * (totalMill / 1000);
      setTaxResult({ fmv, assessed, totalMill, annual, monthly: annual / 12, due: data.due, note: data.note });
    } else {
      const rate   = 0.011;
      const annual = fmv * rate;
      setTaxResult({ fmv, assessed: null, annual, monthly: annual / 12, due: 'Check county', note: 'National avg estimate (~1.1%)' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB RENDERERS
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSnapshot = () => (
    <div>
      {/* ── PDF Upload ── */}
      <div style={S.card}>
        <div style={S.cardTitle}>🗂️ Upload FHA Loan Documents</div>
        <div style={S.infoBox}>
          Upload up to three documents. Haiku AI extracts loan details from whichever files you provide.
          Closing Disclosure → UFMIP + rate. Mortgage Statement → UPB + payments. Payment History → lates.
        </div>
        {[
          { zone: 'cd',        ref: cdRef,        icon: '📄', label: 'Closing Disclosure / HUD-1',    sub: 'Original UFMIP · rate · origination date' },
          { zone: 'statement', ref: statementRef, icon: '🏦', label: 'Current Mortgage Statement',     sub: 'Current balance · P&I · monthly MIP' },
          { zone: 'payment',   ref: paymentRef,   icon: '📊', label: 'Payment History (12–24 months)', sub: '30-day lates for eligibility check' },
        ].map(({ zone, ref, icon, label, sub }) => {
          const file = pdfFiles[zone];
          const drag = isDragging[zone];
          return (
            <div key={zone} style={{ marginBottom: 10 }}>
              <div
                style={{ border: `2px dashed ${drag ? '#0f4c81' : file ? '#22c55e' : '#b0c4de'}`, borderRadius: 10, padding: '14px 18px', background: drag ? '#eef4fb' : file ? '#f0fdf4' : '#f8fafc', cursor: file ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 14 }}
                onDragOver={handleDragOver(zone)} onDragLeave={handleDragLeave(zone)} onDrop={handleDrop(zone)}
                onClick={() => { if (!file) ref.current?.click(); }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{file ? '✅' : icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: file ? '#166534' : '#1a1a2e' }}>{label}</div>
                  {file
                    ? <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>{file.name} · {(file.size / 1024).toFixed(1)} KB</div>
                    : <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 2 }}>{sub} · Drop here or click to browse</div>}
                </div>
                {file && <button style={{ ...S.btn, ...S.btnRed, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); clearZone(zone); }}>✕ Remove</button>}
              </div>
              <input ref={ref} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileSelect(zone)} />
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button style={{ ...S.btn, ...S.btnPrimary, opacity: (Object.values(pdfFiles).every(f => !f) || isExtracting) ? 0.6 : 1 }}
            onClick={handleExtract} disabled={Object.values(pdfFiles).every(f => !f) || isExtracting}>
            {isExtracting ? '⏳ Extracting...' : '🤖 Extract with AI'}
          </button>
          {Object.values(pdfFiles).some(f => f) && (
            <button style={{ ...S.btn, ...S.btnSecondary }} onClick={() => { setPdfFiles({ cd: null, statement: null, payment: null }); setExtractionSuccess(false); setExtractionError(''); }}>
              ✕ Clear All
            </button>
          )}
        </div>
        {extractionError   && <div style={{ ...S.errorBox,   marginTop: 10 }}>⚠️ {extractionError}</div>}
        {extractionSuccess && <div style={{ ...S.successBox, marginTop: 10 }}>✅ Extraction complete — review fields below and confirm accuracy.</div>}
      </div>

      {/* ── Loan Details ── */}
      <div style={S.card}>
        <div style={S.cardTitle}>📋 Existing FHA Loan Details</div>
        <div style={S.grid2}>
          <div><label style={S.label}>Borrower Name</label><input style={S.input} value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="e.g. Patricia Moore" /></div>
          <div><label style={S.label}>FHA Case Number</label><input style={S.input} value={caseNumber} onChange={e => setCaseNumber(e.target.value)} placeholder="105-XXXXXXX-XXX" /></div>
          <div><label style={S.label}>Closing / Endorsement Date</label><input style={S.input} type="date" value={endorsementDate} onChange={e => setEndorsementDate(e.target.value)} /></div>
          <div><label style={S.label}>Current UPB ($)</label><input style={S.input} type="number" value={existingUPB} onChange={e => setExistingUPB(e.target.value)} placeholder="e.g. 301080" /></div>
          <div><label style={S.label}>Current Note Rate (%)</label><input style={S.input} type="number" step="0.001" value={existingRate} onChange={e => setExistingRate(e.target.value)} placeholder="e.g. 7.125" /></div>
          <div><label style={S.label}>Current P&amp;I Payment ($)</label><input style={S.input} type="number" value={existingPI} onChange={e => setExistingPI(e.target.value)} placeholder="e.g. 1207.58" /></div>
          <div><label style={S.label}>Current Monthly MIP ($)</label><input style={S.input} type="number" value={existingMIP} onChange={e => setExistingMIP(e.target.value)} placeholder="e.g. 96.25" /></div>
          <div><label style={S.label}>Annual MIP Factor (%)</label><input style={S.input} type="number" step="0.01" value={existingMIPFactor} onChange={e => setExistingMIPFactor(e.target.value)} placeholder="0.55" /></div>
          <div><label style={S.label}>Original UFMIP Paid ($)</label><input style={S.input} type="number" value={originalUFMIP} onChange={e => setOriginalUFMIP(e.target.value)} placeholder="e.g. 3097.50" /></div>
          <div><label style={S.label}>Estimated Property Value ($)</label><input style={S.input} type="number" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="e.g. 312000" /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>Property Address</label><input style={S.input} value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St, City, State 00000" /></div>
        </div>

        {/* FHA Insured Status */}
        <div style={{ marginTop: 16 }}>
          <label style={S.label}>FHA Insurance Status</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {[
              { val: true,  label: '✅ FHA-Insured Confirmed',     activeColor: '#166534', activeBg: '#f0fdf4' },
              { val: false, label: '❌ Not FHA-Insured / Unknown', activeColor: '#8b1a1a', activeBg: '#fdf0f0' },
            ].map(opt => (
              <button key={String(opt.val)} onClick={() => setIsFHAInsured(opt.val)}
                style={{ ...S.btn, fontSize: 12, background: isFHAInsured === opt.val ? opt.activeBg : '#f1f5f9', color: isFHAInsured === opt.val ? opt.activeColor : '#6b7a8d', border: isFHAInsured === opt.val ? `2px solid ${opt.activeColor}` : '2px solid transparent' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seasoning live badge */}
        {endorsementDate && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: seasoningPass ? '#f0fdf4' : '#fffbeb', border: `1px solid ${seasoningPass ? '#86efac' : '#f9c846'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: seasoningPass ? '#166534' : '#92400e' }}>
                {seasoningPass ? '✅ 210-Day Seasoning Met' : '⏳ Seasoning Pending'}
              </div>
              <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 2 }}>
                {seasoningDays} days since endorsement · {monthsElapsed} months elapsed
                {!seasoningPass && ` · ${210 - seasoningDays} days remaining`}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: seasoningPass ? '#166534' : '#92400e' }}>{seasoningDays}d</div>
          </div>
        )}
      </div>

      {/* ── Closing Cost Estimator (single source of truth) ── */}
      <div style={{ ...S.card, border: '2px solid #0f4c81' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>
          <div>
            <div style={S.cardTitle}>💵 Closing Cost Estimator</div>
            <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: -10 }}>This total flows into NTB Test, Pricing &amp; Comp, and UW Worksheet automatically.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['itemized', 'lump'].map(mode => (
              <button key={mode} onClick={() => setCcMode(mode)}
                style={{ ...S.btn, fontSize: 12, padding: '6px 14px', background: ccMode === mode ? '#0f4c81' : '#e9eef5', color: ccMode === mode ? '#fff' : '#1a1a2e' }}>
                {mode === 'itemized' ? '📋 Itemized' : '🔢 Lump Sum'}
              </button>
            ))}
          </div>
        </div>
        {ccMode === 'itemized' ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0f4c81', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6 }}>TITLE &amp; SETTLEMENT</div>
              <div><label style={S.label}>Title/Settlement Fee ($)</label><input style={S.input} type="number" value={ccTitle} onChange={e => setCcTitle(e.target.value)} placeholder="850" /></div>
              <div><label style={S.label}>Lender's Title Insurance ($)</label><input style={S.input} type="number" value={ccTitleIns} onChange={e => setCcTitleIns(e.target.value)} placeholder="650" /></div>
              <div><label style={S.label}>Recording Fees ($)</label><input style={S.input} type="number" value={ccRecording} onChange={e => setCcRecording(e.target.value)} placeholder="125" /></div>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#0f4c81', letterSpacing: '0.05em', borderBottom: '1px solid #f0f4f8', paddingBottom: 6, marginTop: 4 }}>LENDER FEES</div>
              <div><label style={S.label}>Origination Fee ($)</label><input style={S.input} type="number" value={ccOrigination} onChange={e => setCcOrigination(e.target.value)} placeholder="0" /></div>
              <div><label style={S.label}>Processing Fee ($)</label><input style={S.input} type="number" value={ccProcessing} onChange={e => setCcProcessing(e.target.value)} placeholder="895" /></div>
              <div><label style={S.label}>Underwriting / Admin Fee ($)</label><input style={S.input} type="number" value={ccUnderwriting} onChange={e => setCcUnderwriting(e.target.value)} placeholder="0" /></div>
              <div><label style={S.label}>Other Costs ($)</label><input style={S.input} type="number" value={ccOther} onChange={e => setCcOther(e.target.value)} placeholder="0" /></div>
            </div>
            <div style={{ background: '#0f4c81', borderRadius: 8, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 2 }}>TOTAL CLOSING COSTS</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Used by all tabs automatically</div></div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f9c846' }}>{fmtDollar(ccItemizedTotal)}</div>
            </div>
          </div>
        ) : (
          <div>
            <div style={S.infoBox}>Enter total closing costs as a single number.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
              <div><label style={S.label}>Total Closing Costs ($)</label><input style={{ ...S.input, fontSize: 16, fontWeight: 700 }} type="number" value={ccLumpSum} onChange={e => setCcLumpSum(e.target.value)} placeholder="e.g. 3500" /></div>
              <div style={{ background: '#0f4c81', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>TOTAL</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f9c846' }}>{fmtDollar(parseFloat(ccLumpSum) || 0)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderEligibility = () => {
    const statusConfig = {
      ELIGIBLE:   { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: '✅', label: 'ELIGIBLE — Ready to Proceed' },
      NEEDS_INFO: { bg: '#fffbeb', border: '#f9c846', color: '#92400e', icon: '⚠️', label: 'NEEDS INFO — Manual Review Required' },
      INELIGIBLE: { bg: '#fdf0f0', border: '#fca5a5', color: '#8b1a1a', icon: '❌', label: 'INELIGIBLE — Does Not Qualify' },
    };
    const sc = statusConfig[eligStatus];
    return (
      <div>
        {/* Overall Status */}
        <div style={{ ...S.card, background: sc.bg, border: `2px solid ${sc.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: sc.color }}>{sc.icon} {sc.label}</div>
          <div style={{ fontSize: 13, color: sc.color, marginTop: 6, opacity: 0.8 }}>
            {hardFails} hard fail{hardFails !== 1 ? 's' : ''} · {warns} warning{warns !== 1 ? 's' : ''} · {eligRules.filter(r => r.pass).length}/{eligRules.length} rules passed
          </div>
        </div>

        {/* Eligibility Rules */}
        <div style={S.card}>
          <div style={S.cardTitle}>📋 FHA Streamline Eligibility Rules (Real-Time)</div>
          {eligRules.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < eligRules.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{r.pass ? '✅' : r.hard ? '❌' : '⚠️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: r.pass ? '#1a1a2e' : r.hard ? '#8b1a1a' : '#92400e' }}>{r.rule}</div>
                {!r.pass && <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>{r.hard ? 'HARD STOP — loan does not qualify' : 'WARNING — manual review required'}</div>}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#9aa5b4', fontFamily: 'monospace' }}>{r.id}</span>
            </div>
          ))}
        </div>

        {/* Eligibility Inputs Card */}
        <div style={S.card}>
          <div style={S.cardTitle}>⚙️ Eligibility Inputs</div>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>Late Payments — Last 6 Months</label>
              <select style={S.input} value={latesLast6} onChange={e => setLatesLast6(parseInt(e.target.value))}>
                {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 0 ? '0 — None (Required)' : n}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Late Payments — Months 7–12</label>
              <select style={S.input} value={latesMo7to12} onChange={e => setLatesMo7to12(parseInt(e.target.value))}>
                {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 0 ? '0' : n === 1 ? '1 — Max Allowed' : `${n} — Exceeds Limit`}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Occupancy</label>
              <select style={S.input} value={occupancy} onChange={e => setOccupancy(e.target.value)}>
                <option value="OWNER">Owner-Occupied</option>
                <option value="INVESTMENT">Investment Property</option>
                <option value="SECOND">Second Home</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            {[
              { label: '🚫 Loan is Delinquent',    val: isDelinquent,    set: setIsDelinquent,    danger: true },
              { label: '🚫 In Forbearance',         val: inForbearance,   set: setInForbearance,   danger: true },
              { label: '⚠️ Borrower Removed',      val: borrowerRemoved, set: setBorrowerRemoved, danger: false },
              { label: '⚠️ Title Change Occurred', val: titleChanged,    set: setTitleChanged,    danger: false },
            ].map(({ label, val, set, danger }) => (
              <button key={label} onClick={() => set(!val)}
                style={{ ...S.btn, fontSize: 12, background: val ? (danger ? '#fdf0f0' : '#fffbeb') : '#f1f5f9', color: val ? (danger ? '#8b1a1a' : '#92400e') : '#6b7a8d', border: val ? `2px solid ${danger ? '#fca5a5' : '#f9c846'}` : '2px solid transparent' }}>
                {val ? '☑ ' : '☐ '}{label}
              </button>
            ))}
          </div>
        </div>

        {/* FHA Eligibility Reference */}
        <div style={{ ...S.card, background: '#fffbeb', border: '1px solid #f9c846' }}>
          <div style={S.cardTitle}>📐 FHA Streamline Quick Rules</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            {[
              ['NTB:', 'Combined rate reduction ≥ 0.50%'],
              ['Seasoning:', '210 days from closing + 6 payments made'],
              ['Payment history:', '0x30 in last 6 months, max 1x30 in months 7–12'],
              ['UFMIP refund:', 'Applied as credit against new UFMIP (declines monthly)'],
              ['Max cash back:', '$500 at closing'],
              ['No appraisal:', 'Required — streamline process'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontWeight: 700, color: '#0f4c81', minWidth: 130, flexShrink: 0 }}>{k}</span>
                <span style={{ color: '#4a5568' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderNTBTest = () => {
    const hasData = existingRateN > 0 && newRateN > 0;
    return (
      <div>
        {/* New Loan Parameters */}
        <div style={S.card}>
          <div style={S.cardTitle}>🎯 New Loan Parameters</div>
          <div style={S.grid3}>
            <div><label style={S.label}>New Note Rate (%)</label><input style={S.input} type="number" step="0.001" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="e.g. 6.500" /></div>
            <div><label style={S.label}>New Term (months)</label><input style={S.input} type="number" value={newTerm} onChange={e => setNewTerm(e.target.value)} placeholder="360" /></div>
            <div><label style={S.label}>New Loan Amount (with UFMIP)</label><input style={S.inputRO} value={newLoanAmt > 0 ? fmtDollar(newLoanAmt) : '—'} readOnly /></div>
          </div>
          {!hasData && <div style={{ ...S.infoBox, marginTop: 10 }}>Enter existing rate on Loan Snapshot and new rate above to see real-time NTB results.</div>}
        </div>

        {/* Combined Rate Test */}
        {hasData && (
          <>
            <div style={S.card}>
              <div style={S.cardTitle}>📉 Combined Rate + MIP Test (FHA NTB Requirement)</div>
              <div style={S.infoBox}>FHA NTB requires the combined rate (note rate + annual MIP factor) to decrease by ≥ 0.50%. This is the primary test. Payment reduction is a secondary check.</div>
              <div style={S.grid3}>
                {[
                  { label: 'Existing Combined', value: fmtPct(existingCombined), sub: `${fmtPct(existingRateN)} rate + ${fmtPct(mipFactorN)} MIP`, color: '#6b7a8d', bg: '#f8fafc' },
                  { label: 'New Combined',      value: fmtPct(newCombined),      sub: `${fmtPct(newRateN)} rate + 0.550% MIP`, color: '#0f4c81', bg: '#eef4fb' },
                  { label: 'Reduction',         value: fmtPct(combinedReduction), sub: `Need ≥ ${NTB_MIN_REDUCTION.toFixed(2)}%`, color: ntbCombinedPass ? '#166534' : '#8b1a1a', bg: ntbCombinedPass ? '#f0fdf4' : '#fdf0f0' },
                ].map(({ label, value, sub, color, bg }) => (
                  <div key={label} style={{ background: bg, borderRadius: 8, padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#6b7a8d', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 4 }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, textAlign: 'center', padding: '12px', borderRadius: 8, background: ntbCombinedPass ? '#f0fdf4' : '#fdf0f0', border: `2px solid ${ntbCombinedPass ? '#86efac' : '#fca5a5'}` }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: ntbCombinedPass ? '#166534' : '#8b1a1a' }}>
                  {ntbCombinedPass ? '✅ NTB SATISFIED' : '❌ NTB NOT MET — Rate reduction insufficient'}
                </div>
              </div>
            </div>

            {/* Payment Comparison */}
            <div style={S.card}>
              <div style={S.cardTitle}>💰 Payment Comparison (Secondary Check)</div>
              <div style={S.grid2}>
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e0e7ef' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7a8d', marginBottom: 10, letterSpacing: '0.05em' }}>CURRENT PAYMENT</div>
                  {[['P&I', fmtDollar(existingPIAmt)], ['Monthly MIP', fmtDollar(existingMIPAmt)], ['Total', fmtDollar(existingTotalPmt)]].map(([k, v], i) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 2 ? '1px solid #e0e7ef' : 'none', fontWeight: i === 2 ? 800 : 400, fontSize: i === 2 ? 16 : 13 }}>
                      <span style={{ color: '#6b7a8d' }}>{k}</span><span>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: newRateN > 0 ? '#eef4fb' : '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #b8d0e8' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f4c81', marginBottom: 10, letterSpacing: '0.05em' }}>NEW PAYMENT</div>
                  {[['P&I (on {newLoanAmt})', fmtDollar(newPIAmt)], ['New Monthly MIP', fmtDollar(newMIPMonthly)], ['Total', fmtDollar(newTotalPmt)]].map(([k, v], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 2 ? '1px solid #e0e7ef' : 'none', fontWeight: i === 2 ? 800 : 400, fontSize: i === 2 ? 16 : 13 }}>
                      <span style={{ color: '#6b7a8d' }}>{i === 0 ? `P&I (on ${fmtDollar(newLoanAmt)})` : i === 1 ? 'New Monthly MIP' : 'Total'}</span><span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                {[
                  { label: 'Monthly Savings', value: paymentSavings > 0 ? fmtDollar(paymentSavings) : '—', color: ntbPaymentPass ? '#166534' : '#8b1a1a', bg: ntbPaymentPass ? '#f0fdf4' : '#fdf0f0' },
                  { label: 'Recoupment', value: isFinite(recoupMos) ? `${recoupMos} months` : '∞', color: recoupMos <= 60 ? '#166534' : '#8b1a1a', bg: recoupMos <= 60 ? '#f0fdf4' : '#fdf0f0' },
                  { label: 'Payment Test', value: ntbPaymentPass ? '✅ PASS' : '❌ FAIL', color: ntbPaymentPass ? '#166534' : '#8b1a1a', bg: ntbPaymentPass ? '#f0fdf4' : '#fdf0f0' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} style={{ flex: 1, background: bg, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#6b7a8d', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Borrower Summary */}
            {existingPIAmt > 0 && newPIAmt > 0 && (
              <div style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1565c0 100%)', borderRadius: 10, padding: '20px 24px', color: '#fff' }}>
                <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.1em', marginBottom: 4 }}>FOR THE BORROWER — PLAIN ENGLISH</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Here's what this refinance means{borrowerName ? ` for ${borrowerName.split(' ')[0]}` : ''}:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Current payment', value: fmtDollar(existingTotalPmt), sub: 'P&I + MIP today' },
                    { label: 'New payment',      value: fmtDollar(newTotalPmt),      sub: paymentSavings > 0 ? `saves ${fmtDollar(paymentSavings)}/mo` : 'check rate' },
                    { label: 'Rate drops',       value: `${fmtPct(existingRateN)} → ${fmtPct(newRateN)}`, sub: `${fmtPct(combinedReduction, 3)} combined reduction` },
                  ].map(({ label, value, sub }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#f9c846' }}>{value}</div>
                      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderUFMIPCalculator = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>🔢 UFMIP Refund — How It Works</div>
        <div style={S.infoBox}>
          <strong>FHA refunds a portion of the original UFMIP</strong> when refinancing within 36 months of endorsement.
          The refund is applied as a credit against the new UFMIP — reducing the net amount added to the loan.
          After 36 months: no refund. This calculation directly impacts your new loan amount, payment, and NTB test.
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>📊 UFMIP Refund Calculation</div>
        {!endorsementDate && <div style={S.warningBox}>⚠️ Enter the Closing / Endorsement Date on Loan Snapshot to calculate the refund.</div>}
        {endorsementDate && (
          <>
            <div style={S.grid3}>
              {[
                { label: 'Months Since Endorsement', value: `${monthsElapsed} months`, color: '#0f4c81' },
                { label: 'UFMIP Refund Percentage',  value: `${(ufmipRefundPct * 100).toFixed(1)}%`, color: monthsElapsed < 36 ? '#166534' : '#8b1a1a' },
                { label: 'Refund Eligible?',          value: monthsElapsed < 36 ? '✅ Yes' : '❌ No (>36 months)', color: monthsElapsed < 36 ? '#166534' : '#8b1a1a' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '14px', textAlign: 'center', border: '1px solid #e0e7ef' }}>
                  <div style={{ fontSize: 11, color: '#6b7a8d', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Refund timeline bar */}
            {monthsElapsed < 36 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a8d', marginBottom: 6 }}>
                  <span>Refund Eligibility Window</span>
                  <span style={{ fontWeight: 700 }}>{monthsElapsed} of 36 months used</span>
                </div>
                <div style={{ height: 10, background: '#e0e7ef', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min((monthsElapsed / 36) * 100, 100)}%`, background: monthsElapsed < 18 ? '#22c55e' : monthsElapsed < 30 ? '#f9c846' : '#ef4444', borderRadius: 5, transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9aa5b4', marginTop: 4 }}>
                  <span>Month 0 (80% refund)</span><span style={{ color: '#8b1a1a', fontWeight: 700 }}>Month 36 (0% refund)</span>
                </div>
              </div>
            )}

            {/* The math breakdown */}
            <div style={{ marginTop: 20, background: '#0f4c81', borderRadius: 10, padding: 20, color: '#fff' }}>
              <div style={{ fontSize: 12, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 14 }}>UFMIP REFUND MATH</div>
              {[
                ['Original UFMIP Paid',   fmtDollar(origUFMIPAmt),   origUFMIPAmt > 0 ? '✓' : '⚠️ Enter on Snapshot'],
                ['× Refund Percentage',   `${(ufmipRefundPct * 100).toFixed(1)}%`, ''],
                ['= UFMIP Refund Credit', fmtDollar(ufmipRefundAmt), '← applied to new UFMIP'],
                ['New Gross UFMIP (1.75% × UPB)', fmtDollar(newUFMIPGross), `1.75% × ${fmtDollar(upb)}`],
                ['− Refund Credit',        fmtDollar(ufmipRefundAmt), ''],
              ].map(([label, value, note]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <span style={{ fontSize: 13 }}>{label}</span>
                    {note && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>{note}</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 0' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>= Net UFMIP (rolled into loan)</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>This is what actually gets added to your loan balance</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#f9c846' }}>{fmtDollar(netUFMIP)}</div>
              </div>
            </div>

            {/* New loan amount breakdown */}
            <div style={{ marginTop: 16, background: '#eef4fb', borderRadius: 8, padding: 16, border: '1px solid #b8d0e8' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f4c81', marginBottom: 12 }}>New Loan Amount Breakdown</div>
              {[
                ['Existing UPB', fmtDollar(upb)],
                ['+ Net UFMIP (rolled in)', fmtDollar(netUFMIP)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #d0dbe8', fontSize: 13 }}>
                  <span style={{ color: '#6b7a8d' }}>{label}</span><span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 16, fontWeight: 800 }}>
                <span>= New Loan Amount</span><span style={{ color: '#0f4c81' }}>{fmtDollar(newLoanAmt)}</span>
              </div>
              {newRateN > 0 && <div style={{ fontSize: 12, color: '#6b7a8d', marginTop: 8 }}>New P&I at {fmtPct(newRateN)} for {newTerm} months: <strong>{fmtDollar(newPIAmt)}/month</strong></div>}
            </div>
          </>
        )}
      </div>

      {/* Refund schedule table */}
      <div style={S.card}>
        <div style={S.cardTitle}>📅 HUD UFMIP Refund Schedule Reference</div>
        <div style={S.infoBox}>Approximate refund percentages. Actual amounts per HUD Connection. No refund after month 36.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#f1f5f9' }}>
              {['Month', 'Refund %', 'Month', 'Refund %', 'Month', 'Refund %'].map((h, i) => (
                <th key={i} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7a8d' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[1, 7, 13, 19, 25, 31].map((start, row) => (
                <tr key={row} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  {[start, start + 3, start + 6].map(mo => {
                    const pct = UFMIP_REFUND(mo) * 100;
                    const isCurrentMo = monthsElapsed === mo;
                    return mo <= 36 ? (
                      <React.Fragment key={mo}>
                        <td style={{ padding: '8px 10px', fontWeight: isCurrentMo ? 700 : 400, color: isCurrentMo ? '#0f4c81' : '#1a1a2e' }}>
                          {mo}{isCurrentMo ? ' ← you' : ''}
                        </td>
                        <td style={{ padding: '8px 10px', color: pct > 40 ? '#166534' : pct > 15 ? '#92400e' : '#8b1a1a', fontWeight: 600 }}>
                          {pct.toFixed(1)}%
                        </td>
                      </React.Fragment>
                    ) : (
                      <React.Fragment key={mo}><td style={{ padding: '8px 10px', color: '#9aa5b4' }}>—</td><td style={{ padding: '8px 10px', color: '#9aa5b4' }}>0.0%</td></React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderRateOptions = () => {
    const updateRO = (id, field, val) => setRateOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: val } : o));
    return (
      <div>
        <div style={S.card}>
          <div style={S.cardTitle}>🏦 Rate Options — NTB Check Per Lender</div>
          <div style={S.infoBox}>Compare up to 3 lender quotes. The combined rate reduction (rate + MIP) must be ≥ 0.50% vs your existing combined rate of <strong>{existingRateN > 0 ? fmtPct(existingCombined) : '—'}</strong>.</div>
          {rateOptions.map((opt, i) => {
            const rateN = parseFloat(opt.rate) || 0;
            const optNewCombined = rateN + (NEW_ANNUAL_MIP * 100);
            const optReduction   = existingCombined - optNewCombined;
            const optNTBPass     = optReduction >= NTB_MIN_REDUCTION;
            const optNewLoan     = upb + Math.max(0, upb * NEW_UFMIP_RATE - ufmipRefundAmt);
            const optNewPI       = rateN > 0 && optNewLoan > 0 ? calcPI(optNewLoan, rateN, termMos) : 0;
            const optSavings     = existingTotalPmt > 0 && optNewPI > 0 ? existingTotalPmt - (optNewPI + newMIPMonthly) : null;
            return (
              <div key={opt.id} style={{ border: `2px solid ${optNTBPass ? '#86efac' : rateN > 0 ? '#fca5a5' : '#e0e7ef'}`, borderRadius: 10, padding: 16, marginBottom: 14, background: optNTBPass ? '#f0fdf4' : rateN > 0 ? '#fdf0f0' : '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0f4c81', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Option {String.fromCharCode(65 + i)}</div>
                  {rateN > 0 && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: optNTBPass ? '#f0fdf4' : '#fdf0f0', color: optNTBPass ? '#166534' : '#8b1a1a', border: `1px solid ${optNTBPass ? '#86efac' : '#fca5a5'}` }}>{optNTBPass ? '✅ Meets NTB' : '❌ Fails NTB'}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={S.label}>Lender Name</label><input style={S.input} value={opt.lender} onChange={e => updateRO(opt.id, 'lender', e.target.value)} placeholder={`Lender ${i + 1}`} /></div>
                  <div><label style={S.label}>New Note Rate (%)</label><input style={S.input} type="number" step="0.001" value={opt.rate} onChange={e => updateRO(opt.id, 'rate', e.target.value)} placeholder="e.g. 6.500" /></div>
                  <div><label style={S.label}>Price (par = 100)</label><input style={S.input} type="number" step="0.125" value={opt.price} onChange={e => updateRO(opt.id, 'price', e.target.value)} placeholder="e.g. 101.25" /></div>
                  <div><label style={S.label}>Lender Credit ($)</label><input style={S.input} type="number" value={opt.lenderCredit} onChange={e => updateRO(opt.id, 'lenderCredit', e.target.value)} placeholder="e.g. 1500" /></div>
                </div>
                {rateN > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[
                      { label: 'New Combined', value: fmtPct(optNewCombined), color: '#0f4c81' },
                      { label: 'Combined Reduction', value: fmtPct(optReduction), color: optNTBPass ? '#166534' : '#8b1a1a' },
                      { label: 'New P&I', value: optNewPI > 0 ? fmtDollar(optNewPI) : '—', color: '#0f4c81' },
                      { label: 'Monthly Savings', value: optSavings !== null ? fmtDollar(optSavings) : '—', color: optSavings > 0 ? '#166534' : '#8b1a1a' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#6b7a8d', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPricing = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>💰 LO Commission Calculator — LPC vs BPC</div>
        <div style={S.infoBox}>RESPA: You cannot receive both LPC and BPC on the same file. Loan amount used: <strong>{fmtDollar(upb)}</strong> (existing UPB).</div>
        <div style={S.grid3}>
          <div><label style={S.label}>LO Split (%)</label><input style={S.input} type="number" value={compLOSplit} onChange={e => setCompLOSplit(e.target.value)} placeholder="70" /></div>
          <div><label style={S.label}>Processing Fee ($)</label><input style={S.input} type="number" value={compProcessingFee} onChange={e => setCompProcessingFee(e.target.value)} placeholder="395" /></div>
          <div><label style={S.label}>Admin Fee ($)</label><input style={S.input} type="number" value={compAdminFee} onChange={e => setCompAdminFee(e.target.value)} placeholder="0" /></div>
          <div><label style={S.label}>LPC Rate % (Lender Paid)</label><input style={{ ...S.input, borderColor: '#86efac', background: '#f0fdf4' }} type="number" step="0.01" value={compLPCRate} onChange={e => setCompLPCRate(e.target.value)} placeholder="2.75" /></div>
          <div><label style={S.label}>BPC Points (Borrower Paid)</label><input style={{ ...S.input, borderColor: '#b8d0e8', background: '#eef4fb' }} type="number" step="0.25" value={compBPCPoints} onChange={e => setCompBPCPoints(e.target.value)} placeholder="1.0" /></div>
          <div><label style={S.label}>Other Deductions ($)</label><input style={S.input} type="number" value={compOtherDeductions} onChange={e => setCompOtherDeductions(e.target.value)} placeholder="0" /></div>
        </div>

        {upb > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
            {/* LPC */}
            <div style={{ border: `2px solid ${compRec === 'LPC' ? '#22c55e' : '#e0e7ef'}`, borderRadius: 10, padding: 16, background: compRec === 'LPC' ? '#f0fdf4' : '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>Lender Paid (LPC)</div>
                {compRec === 'LPC' && <span style={{ fontSize: 11, background: '#22c55e', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>⭐ Better for You</span>}
              </div>
              {[['Gross Commission', fmtDollar(lpcGross), `${compLPCRate}% of ${fmtDollar(upb)}`], [`After ${compLOSplit}% Split`, fmtDollar(lpcGross * parseFloat(compLOSplit) / 100), 'Your share'], ['Deductions', `− ${fmtDollar(compDeduct)}`, 'Fees'], ['NET TO YOU', fmtDollar(lpcNet), `${lpcEffRate.toFixed(3)}% eff`]].map(([k, v, s], i) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 3 ? '1px solid #e0e7ef' : 'none', fontWeight: i === 3 ? 800 : 400, fontSize: i === 3 ? 16 : 13 }}>
                  <div><div>{k}</div><div style={{ fontSize: 10, color: '#9aa5b4' }}>{s}</div></div>
                  <span style={{ color: i === 2 ? '#8b1a1a' : i === 3 ? '#166534' : '#1a1a2e' }}>{v}</span>
                </div>
              ))}
            </div>
            {/* BPC */}
            <div style={{ border: `2px solid ${compRec === 'BPC' ? '#3b82f6' : '#e0e7ef'}`, borderRadius: 10, padding: 16, background: compRec === 'BPC' ? '#eef4fb' : '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1a4a7e' }}>Borrower Paid (BPC)</div>
                {compRec === 'BPC' && <span style={{ fontSize: 11, background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>⭐ Better for You</span>}
              </div>
              {[['Gross Commission', fmtDollar(bpcGross), `${compBPCPoints} pt(s) origination`], [`After ${compLOSplit}% Split`, fmtDollar(bpcGross * parseFloat(compLOSplit) / 100), 'Your share'], ['Deductions', `− ${fmtDollar(compDeduct)}`, 'Fees'], ['NET TO YOU', fmtDollar(bpcNet), `${bpcEffRate.toFixed(3)}% eff`]].map(([k, v, s], i) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 3 ? '1px solid #e0e7ef' : 'none', fontWeight: i === 3 ? 800 : 400, fontSize: i === 3 ? 16 : 13 }}>
                  <div><div>{k}</div><div style={{ fontSize: 10, color: '#9aa5b4' }}>{s}</div></div>
                  <span style={{ color: i === 2 ? '#8b1a1a' : i === 3 ? '#1a4a7e' : '#1a1a2e' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {upb > 0 && (
          <div style={{ ...S.warningBox, marginTop: 14 }}>
            <strong>{compRec} puts {fmtDollar(Math.abs(lpcNet - bpcNet))} more in your pocket.</strong>{' '}
            RESPA: you cannot receive both LPC and BPC on the same file.
          </div>
        )}
      </div>
    </div>
  );

  const renderNTBWorksheet = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print NTB Worksheet</button>
      </div>
      <div style={{ ...S.card, fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 22, borderBottom: '2px solid #0f4c81', paddingBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f4c81' }}>NET TANGIBLE BENEFIT WORKSHEET</div>
          <div style={{ fontSize: 14, color: '#5a6a7e', marginTop: 4 }}>FHA Streamline Refinance</div>
          <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>Prepared by LoanBeacons™ · For Lender File Documentation · Generated: {new Date().toLocaleDateString()}</div>
        </div>
        {[['Borrower Name', borrowerName || '___________________________'], ['FHA Case Number', caseNumber || '___________________________'], ['Property Address', propertyAddress || '___________________________'], ['Endorsement Date', endorsementDate || '___________________________']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 0' }}>
            <span style={{ width: 180, fontSize: 12, fontWeight: 700, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
            <span style={{ fontSize: 13 }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 20 }}>
          {[
            { title: 'EXISTING LOAN', rows: [['Note Rate', fmtPct(existingRateN)], ['Annual MIP Factor', fmtPct(mipFactorN)], ['Combined Rate', fmtPct(existingCombined)], ['P&I Payment', fmtDollar(existingPIAmt)], ['Monthly MIP', fmtDollar(existingMIPAmt)], ['Total Payment', fmtDollar(existingTotalPmt)], ['Outstanding Balance', fmtDollar(upb)], ['Original UFMIP Paid', fmtDollar(origUFMIPAmt)]] },
            { title: 'PROPOSED FHA STREAMLINE', rows: [['New Note Rate', fmtPct(newRateN)], ['New Annual MIP Factor', fmtPct(NEW_ANNUAL_MIP * 100)], ['New Combined Rate', fmtPct(newCombined)], ['UFMIP Refund Credit', `${(ufmipRefundPct * 100).toFixed(1)}% = ${fmtDollar(ufmipRefundAmt)}`], ['Net UFMIP (rolled in)', fmtDollar(netUFMIP)], ['New Loan Amount', fmtDollar(newLoanAmt)], ['New P&I Payment', fmtDollar(newPIAmt)], ['New Monthly MIP', fmtDollar(newMIPMonthly)], ['New Total Payment', fmtDollar(newTotalPmt)]] },
          ].map(section => (
            <div key={section.title} style={{ marginBottom: 16 }}>
              <div style={{ background: '#0f4c81', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 4, marginBottom: 6, letterSpacing: '0.08em' }}>{section.title}</div>
              {section.rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 4px' }}>
                  <span style={{ width: 220, fontSize: 12, fontWeight: 600, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
                  <span style={{ fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ background: '#0f4c81', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 4, marginBottom: 6, letterSpacing: '0.08em' }}>NET TANGIBLE BENEFIT DETERMINATION</div>
        {[
          ['Combined Rate Reduction', fmtPct(combinedReduction), ntbCombinedPass ? 'PASS ✅' : 'FAIL ❌', `Need ≥ ${NTB_MIN_REDUCTION}%`],
          ['Monthly Payment Reduction', fmtDollar(paymentSavings), ntbPaymentPass ? 'PASS ✅' : 'REVIEW ⚠️', ''],
          ['Recoupment Period', isFinite(recoupMos) ? `${recoupMos} months` : 'N/A', '', ''],
          ['Net Tangible Benefit', '', ntbPass ? 'SATISFIED ✅' : 'NOT MET ❌', ''],
        ].map(([k, v, r, note]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e0e7ef', padding: '7px 4px', alignItems: 'center' }}>
            <span style={{ width: 220, fontSize: 12, fontWeight: 600, color: '#5a6a7e', flexShrink: 0 }}>{k}:</span>
            <span style={{ flex: 1, fontSize: 13 }}>{v}{note && <span style={{ fontSize: 11, color: '#9aa5b4', marginLeft: 6 }}>{note}</span>}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.includes('✅') ? '#166534' : r.includes('❌') ? '#8b1a1a' : '#92400e' }}>{r}</span>
          </div>
        ))}
        <div style={{ borderTop: '2px solid #0f4c81', paddingTop: 20, marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Loan Officer Signature', 'NMLS ID', 'Date'].map(label => (
              <div key={label}><div style={{ borderBottom: '1px solid #1a1a2e', height: 32, marginBottom: 5 }} /><div style={{ fontSize: 11, color: '#6b7a8d' }}>{label}</div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderUWWorksheet = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print UW Worksheet</button>
      </div>
      <div style={{ ...S.card, fontFamily: 'Georgia, serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #0f4c81', paddingBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f4c81' }}>FHA STREAMLINE UNDERWRITING WORKSHEET</div>
          <div style={{ fontSize: 13, color: '#6b7a8d' }}>For Internal Lender File — LoanBeacons™</div>
          <div style={{ fontSize: 11, color: '#9aa5b4', marginTop: 2 }}>Generated: {new Date().toLocaleDateString()}</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f4c81', marginBottom: 8, letterSpacing: '0.05em' }}>LOAN SUMMARY</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {[['Borrower', borrowerName || '—'], ['FHA Case #', caseNumber || '—'], ['Property', propertyAddress?.split(',')[0] || '—'], ['Existing Rate', fmtPct(existingRateN)], ['New Rate', fmtPct(newRateN)], ['Combined Reduction', fmtPct(combinedReduction)], ['Current P&I+MIP', fmtDollar(existingTotalPmt)], ['New P&I+MIP', fmtDollar(newTotalPmt)], ['Monthly Savings', fmtDollar(paymentSavings)], ['Net UFMIP', fmtDollar(netUFMIP)], ['New Loan Amt', fmtDollar(newLoanAmt)], ['NTB Status', ntbPass ? 'SATISFIED ✅' : existingRateN > 0 ? 'REVIEW ❌' : 'Pending']].map(([label, val]) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', border: '1px solid #e0e7ef' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a8d', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f4c81', marginBottom: 8, letterSpacing: '0.05em' }}>UNDERWRITING CHECKLIST</div>
        {[
          { item: 'FHA-insured loan confirmed',                             done: isFHAInsured },
          { item: 'NTB satisfied — combined rate reduction ≥ 0.50%',       done: ntbCombinedPass },
          { item: 'Monthly payment confirmed lower',                        done: ntbPaymentPass },
          { item: '210-day seasoning satisfied',                            done: seasoningPass },
          { item: 'Payment history verified — 0x30 last 6 months',         done: latesLast6 === 0 },
          { item: 'UFMIP refund calculated and applied to new loan',        done: origUFMIPAmt > 0 && endorsementDate !== '' },
          { item: 'No appraisal required — streamline confirmed',           done: true },
          { item: 'No income verification required — streamline confirmed', done: true },
          { item: 'Not in forbearance or loss mitigation',                  done: !inForbearance },
          { item: 'FHA case number confirmed in FHA Connection',            done: !!caseNumber },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 4px', borderBottom: '1px solid #f0f4f8', alignItems: 'center' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{row.done ? '✅' : '⏳'}</span>
            <span style={{ fontSize: 12 }}>{row.item}</span>
          </div>
        ))}
        <div style={{ borderTop: '2px solid #0f4c81', paddingTop: 18, marginTop: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Loan Officer / NMLS ID', 'Underwriter / NMLS ID', 'Date'].map(label => (
              <div key={label}><div style={{ borderBottom: '1px solid #1a1a2e', height: 32, marginBottom: 5 }} /><div style={{ fontSize: 10, color: '#6b7a8d' }}>{label}</div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderDocChecklist = () => {
    const total   = DOC_ITEMS.length;
    const checked = Object.values(checkedDocs).filter(Boolean).length;
    const pct     = Math.round((checked / total) * 100);
    return (
      <div>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={S.cardTitle}>✔️ FHA Streamline Document Checklist</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f4c81' }}>{checked} / {total} collected</div>
          </div>
          <div style={S.infoBox}>FHA Streamline is credit non-qualifying — no income docs, no appraisal. Payment history and UFMIP docs are critical.</div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a8d', marginBottom: 5 }}><span>Collection Progress</span><span>{pct}%</span></div>
            <div style={{ height: 8, background: '#e0e7ef', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#0f4c81', borderRadius: 4, transition: 'width 0.3s' }} /></div>
          </div>
          {DOC_ITEMS.map((item, i) => {
            const isChecked = !!checkedDocs[item.id];
            return (
              <div key={item.id} onClick={() => setCheckedDocs(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s', background: isChecked ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isChecked ? '#86efac' : '#e0e7ef'}` }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: isChecked ? '#22c55e' : '#fff', border: `2px solid ${isChecked ? '#22c55e' : '#d0dbe8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{isChecked ? '✓' : ''}</div>
                <span style={{ fontSize: 14, flex: 1, textDecoration: isChecked ? 'line-through' : 'none', color: isChecked ? '#5a7a6e' : '#1a1a2e' }}>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPropertyTax = () => (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>🏠 Property Tax Calculator</div>
        <div style={S.infoBox}>Georgia assessment = 40% of FMV × millage rate. Always verify with county tax assessor before closing.</div>
        <div style={S.grid3}>
          <div>
            <label style={S.label}>State</label>
            <select style={S.input} value={taxState} onChange={e => setTaxState(e.target.value)}>
              <option value="GA">Georgia</option>
              <option value="FL">Florida</option>
              <option value="NC">North Carolina</option>
              <option value="SC">South Carolina</option>
              <option value="TN">Tennessee</option>
              <option value="TX">Texas</option>
              <option value="AL">Alabama</option>
            </select>
          </div>
          {taxState === 'GA' && (
            <div>
              <label style={S.label}>GA County</label>
              <select style={S.input} value={taxCounty} onChange={e => setTaxCounty(e.target.value)}>
                <option value="">— Select County —</option>
                {Object.keys(GA_COUNTIES).sort().map(c => <option key={c} value={c}>{c} ({GA_COUNTIES[c].millage} mills)</option>)}
              </select>
            </div>
          )}
          {taxState === 'GA' && (
            <div>
              <label style={S.label}>City Millage (if inside city limits)</label>
              <input style={S.input} type="number" value={taxCityMills} onChange={e => setTaxCityMills(e.target.value)} placeholder="e.g. 10 or 12" />
            </div>
          )}
          <div>
            <label style={S.label}>Fair Market Value ($)</label>
            <input style={S.input} type="number" value={taxFMV} onChange={e => setTaxFMV(e.target.value)} placeholder={estimatedValue || 'e.g. 312000'} />
          </div>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }} onClick={runTaxCalc}>📊 Calculate Property Tax</button>
        {taxResult && (
          <div style={{ marginTop: 20, background: '#0f4c81', borderRadius: 10, padding: 20, color: '#fff' }}>
            <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: '0.08em', marginBottom: 14 }}>PROPERTY TAX RESULT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { label: 'Annual Tax', value: fmtDollar(taxResult.annual), sub: `Due: ${taxResult.due}` },
                { label: 'Monthly Tax', value: fmtDollar(taxResult.monthly), sub: 'For escrow estimate' },
                { label: taxResult.assessed ? 'Assessed Value (40%)' : 'FMV Used', value: fmtDollar(taxResult.assessed || taxResult.fmv), sub: taxResult.totalMill ? `${taxResult.totalMill.toFixed(2)} total mills` : taxResult.note },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f9c846' }}>{value}</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{sub}</div>
                </div>
              ))}
            </div>
            {taxResult.note && <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75, background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 12px' }}>ℹ️ {taxResult.note}</div>}
          </div>
        )}
      </div>
    </div>
  );

  const tabRenderers = {
    'snapshot':      renderSnapshot,
    'eligibility':   renderEligibility,
    'ntb':           renderNTBTest,
    'ufmip':         renderUFMIPCalculator,
    'rate-options':  renderRateOptions,
    'pricing':       renderPricing,
    'ntb-worksheet': renderNTBWorksheet,
    'uw-worksheet':  renderUWWorksheet,
    'doc-checklist': renderDocChecklist,
    'property-tax':  renderPropertyTax,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.container}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.headerTop}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3, letterSpacing: '0.08em' }}>MODULE 10 OF 27</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>FHA Streamline</h1>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3 }}>FHA Streamline Refinance Intelligence</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span style={S.badge}>📋 FHA STREAMLINE</span>
            {ntbPass          && <span style={{ ...S.badge, ...S.badgeGreen }}>✅ NTB SATISFIED</span>}
            {eligStatus === 'INELIGIBLE' && <span style={{ ...S.badge, ...S.badgeRed }}>❌ INELIGIBLE</span>}
            {eligStatus === 'NEEDS_INFO' && <span style={{ ...S.badge, ...S.badgeAmber }}>⚠️ NEEDS REVIEW</span>}
            {monthsElapsed > 0 && monthsElapsed < 36 && <span style={{ ...S.badge, ...S.badgeAmber }}>🔄 {(ufmipRefundPct * 100).toFixed(0)}% UFMIP REFUND</span>}
          </div>
        </div>
        <div style={S.scenarioRow}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Load Scenario:</span>
          <select style={S.headerSelect} value={selectedScenId} onChange={e => handleScenarioSelect(e.target.value)}>
            <option value="">— Select a scenario —</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>
                {s.borrowerName || s.borrower_name || ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || 'Unnamed'} · {s.propertyAddress?.split(',')[0] || s.streetAddress || 'No address'}
              </option>
            ))}
          </select>
          {loadingScenarios && <span style={{ fontSize: 12, opacity: 0.65 }}>Loading...</span>}
          {borrowerName && <span style={{ fontSize: 12, opacity: 0.85 }}>📋 {borrowerName}</span>}
          <button
            onClick={handleSave}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: saveFlash ? '#22c55e' : 'rgba(255,255,255,0.2)', color: saveFlash ? '#fff' : 'rgba(255,255,255,0.9)', transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: 5 }}>
            {saveFlash ? '✅ Saved!' : '💾 Save'}
          </button>
          {savedAt && !saveFlash && (
            <span style={{ fontSize: 11, opacity: 0.55 }}>Last saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => { handleSave(); setActiveTab(t.id); }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {tabRenderers[activeTab]?.()}

      {/* ── Decision Record Banner ── */}
      <DecisionRecordBanner
        recordId={drRecordId}
        moduleName="FHA Streamline"
        onSave={handleSave}
      />

      {/* ── Canonical Bar ── */}
      <div style={S.canonicalBar}>
        {canonicalExpanded && (
          <div style={{ background: '#0a2d54', padding: '10px 16px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 8, letterSpacing: '0.1em' }}>CANONICAL SEQUENCE™ — 27 MODULES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
              {MODULES.map(m => (
                <button key={m.id} onClick={() => navigate(m.path)} title={m.label}
                  style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', background: m.id === CURRENT_MODULE ? '#f9c846' : 'rgba(255,255,255,0.1)', color: m.id === CURRENT_MODULE ? '#000' : 'rgba(255,255,255,0.65)', fontWeight: m.id === CURRENT_MODULE ? 700 : 400 }}>
                  {m.id}. {m.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={S.canonicalMain}>
          <button style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, padding: '6px 12px', opacity: prevMod ? 1 : 0.4 }} onClick={() => prevMod && navigate(prevMod.path)} disabled={!prevMod}>
            ← {prevMod?.label || ''}
          </button>
          <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {MODULES.map(m => <div key={m.id} title={m.label} style={S.dot(m.id === CURRENT_MODULE)} onClick={() => navigate(m.path)}>{m.id === CURRENT_MODULE ? m.id : ''}</div>)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', padding: '4px 8px', fontSize: 11 }} onClick={() => setCanonicalExpanded(!canonicalExpanded)}>
              {canonicalExpanded ? '▼' : '▲'} Map
            </button>
            <button style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, padding: '6px 12px', opacity: nextMod ? 1 : 0.4 }} onClick={() => nextMod && navigate(nextMod.path)} disabled={!nextMod}>
              {nextMod?.label || ''} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
