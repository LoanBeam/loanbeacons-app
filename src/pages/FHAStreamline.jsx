// src/pages/FHAStreamline.jsx
// LoanBeacons™ — FHA Streamline Intelligence™
// v7: split fix + MIP/UFMIP/case# auto-fill + NTB Worksheet + Rate Shopping + UW Worksheet

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase/config';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

const FHA_RULES = {
  NTB_COMBINED_RATE_REDUCTION: 0.50,
  NEW_UFMIP_RATE: 0.0175,
  CASH_BACK_LIMIT: 500,
  ANNUAL_MIP_FACTOR: 0.55,
};

const UFMIP_REFUND = (months) => {
  if (months <= 0)  return 1.00;
  if (months <= 12) return Math.max(0, 0.80 - ((months - 1) * 0.0667));
  if (months <= 36) return Math.max(0, 0.50 - ((months - 13) * 0.0208));
  return 0;
};

function computeMonthlyPI(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0;
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

const GA_COUNTIES = {
  'Bibb':     { millage: 34.49, due: 'Dec 20', note: 'City of Macon adds ~12 mills for city services' },
  'Chatham':  { millage: 14.54, due: 'Nov 15', note: 'City of Savannah adds ~13 mills' },
  'Cherokee': { millage: 23.24, due: 'Nov 15', note: 'Low rate county — unincorporated areas' },
  'Clayton':  { millage: 33.55, due: 'Oct 20', note: 'City of Jonesboro adds additional mills' },
  'Cobb':     { millage: 22.55, due: 'Oct 1',  note: 'One of lowest rates in metro Atlanta' },
  'Columbia': { millage: 18.80, due: 'Nov 15', note: 'Augusta-Richmond MSA — low county rate' },
  'DeKalb':   { millage: 38.98, due: 'Oct 20', note: 'Unincorporated DeKalb — cities vary significantly' },
  'Douglas':  { millage: 28.76, due: 'Oct 20', note: 'City of Douglasville adds ~7 mills' },
  'Fayette':  { millage: 22.19, due: 'Dec 1',  note: 'Low rate — Peachtree City ~28 mills total' },
  'Forsyth':  { millage: 21.07, due: 'Nov 15', note: 'Rapidly growing — rate relatively stable' },
  'Fulton':   { millage: 41.64, due: 'Oct 20', note: 'City of Atlanta adds ~12 mills. Highest in metro.' },
  'Gwinnett': { millage: 27.76, due: 'Oct 20', note: 'City of Lawrenceville ~35 mills total' },
  'Hall':     { millage: 28.04, due: 'Nov 15', note: 'City of Gainesville adds ~4 mills' },
  'Henry':    { millage: 31.40, due: 'Oct 20', note: 'McDonough city adds additional mills' },
  'Houston':  { millage: 21.58, due: 'Oct 15', note: 'Warner Robins city ~26 mills total' },
  'Lowndes':  { millage: 20.26, due: 'Dec 20', note: 'City of Valdosta ~30 mills total' },
  'Muscogee': { millage: 38.92, due: 'Oct 20', note: 'Consolidated Columbus city-county government' },
  'Newton':   { millage: 31.12, due: 'Nov 15', note: 'City of Covington adds additional mills' },
  'Paulding': { millage: 26.57, due: 'Oct 20', note: 'Growing county — Dallas city rate higher' },
  'Richmond': { millage: 39.46, due: 'Oct 20', note: 'Augusta-Richmond consolidated government' },
  'Rockdale': { millage: 32.90, due: 'Oct 20', note: 'City of Conyers adds additional mills' },
  'Spalding': { millage: 32.04, due: 'Nov 15', note: 'City of Griffin ~38 mills total' },
  'Walton':   { millage: 28.97, due: 'Nov 15', note: 'City of Monroe adds additional mills' },
};

const OTHER_STATE_RATES = {
  'AL': { rate: 0.0040, note: 'Alabama — very low property tax state (~0.40% effective)' },
  'FL': { rate: 0.0098, note: 'Florida — ~0.98% effective rate; homestead exemption available' },
  'NC': { rate: 0.0077, note: 'North Carolina — ~0.77% effective rate' },
  'SC': { rate: 0.0056, note: 'South Carolina — ~0.56% effective rate; owner-occ lower' },
  'TN': { rate: 0.0064, note: 'Tennessee — ~0.64% effective rate' },
  'TX': { rate: 0.0180, note: 'Texas — high property tax (~1.80% effective rate)' },
};

function calcPropertyTax(fmv, county, state, cityMillage) {
  if (!fmv || fmv <= 0) return null;
  if (state === 'GA' && GA_COUNTIES[county]) {
    const data = GA_COUNTIES[county];
    const totalMillage = data.millage + (parseFloat(cityMillage) || 0);
    const assessedValue = fmv * 0.40;
    const annualTax = assessedValue * (totalMillage / 1000);
    return { fmv, assessedValue, totalMillage, annualTax, monthlyTax: annualTax / 12,
      dueDate: data.due, note: data.note, source: `GA — 40% assessment ratio × ${totalMillage.toFixed(2)} mills` };
  }
  if (OTHER_STATE_RATES[state]) {
    const d = OTHER_STATE_RATES[state];
    const annualTax = fmv * d.rate;
    return { fmv, assessedValue: null, annualTax, monthlyTax: annualTax / 12,
      dueDate: 'Varies by county', note: d.note, source: `${state} — estimated effective rate` };
  }
  return { fmv, assessedValue: null, annualTax: fmv * 0.011, monthlyTax: (fmv * 0.011) / 12,
    dueDate: 'Check county', note: 'Estimated — verify with county tax assessor', source: 'National average estimate' };
}

function runEligibilityRules(inputs) {
  const results = []; let finalDecision = 'ELIGIBLE';
  const check = (id, label, pass, passMsg, failMsg, type = 'HARD') => {
    const status = pass ? 'PASS' : (type === 'WARN' ? 'WARN' : 'FAIL');
    results.push({ id, label, status, message: pass ? passMsg : failMsg });
    if (!pass) {
      if (type === 'HARD' && finalDecision !== 'INELIGIBLE') finalDecision = 'INELIGIBLE';
      if (type === 'WARN' && finalDecision === 'ELIGIBLE') finalDecision = 'NEEDS_INFO';
    }
  };
  check('R001','FHA Insured Loan',       inputs.is_fha_insured,       'Confirmed FHA-insured.','Must be FHA-insured for streamline.');
  check('R002','Payment Status',         !inputs.is_delinquent,       'Loan is current.','Loan is delinquent — not eligible.');
  check('R003','Lates (Last 6 Months)',  inputs.lates_last_6 === 0,   'No late payments in last 6 months.',`${inputs.lates_last_6} late(s) — must be 0.`);
  check('R004','Lates (Months 7-12)',    inputs.lates_months_7_12 <= 1,'Payment history months 7-12 acceptable.',`${inputs.lates_months_7_12} lates — max 1 allowed.`,'WARN');
  check('R005','Occupancy',              inputs.occupancy_current==='OWNER','Owner-occupied — streamline eligible.','Non-owner occupied requires manual review.','WARN');
  check('R006','Forbearance',            !inputs.in_forbearance,      'Not in forbearance.','In forbearance — not eligible.');
  check('R007','Borrower / Title',       !inputs.borrower_removed && !inputs.title_changed,'No borrower or title changes.','Changes require credit qualifying streamline.','WARN');
  return { rules: results, finalDecision };
}

function computeNTB(inputs, options) {
  return options.map((opt, idx) => {
    const existingRate      = parseFloat(inputs.existing_note_rate || 0);
    const existingMIPFactor = parseFloat(inputs.existing_mip_factor || 0.55);
    const newRate           = parseFloat(opt.note_rate || 0);
    const existingCombined  = existingRate + existingMIPFactor;
    const newCombined       = newRate + FHA_RULES.ANNUAL_MIP_FACTOR;
    const combinedReduction = existingCombined - newCombined;
    const ntbPass           = combinedReduction >= FHA_RULES.NTB_COMBINED_RATE_REDUCTION;
    const upb               = parseFloat(inputs.existing_upb || 0);
    const existingPI        = parseFloat(inputs.existing_monthly_pi || 0);
    const existingMIP       = parseFloat(inputs.existing_monthly_mip || 0);
    const newPI             = computeMonthlyPI(upb, newRate, parseInt(inputs.new_term_months || 360));
    const newMIP            = (upb * FHA_RULES.ANNUAL_MIP_FACTOR) / 100 / 12;
    const monthlySavings    = (existingPI + existingMIP) - (newPI + newMIP);
    const endorsementDate   = inputs.endorsement_date ? new Date(inputs.endorsement_date) : null;
    const monthsElapsed     = endorsementDate ? Math.max(0, Math.floor((Date.now() - endorsementDate.getTime()) / (1000*60*60*24*30))) : 0;
    const refundPct         = UFMIP_REFUND(monthsElapsed);
    const origUFMIP         = parseFloat(inputs.original_ufmip || 0);
    const ufmipRefund       = origUFMIP * refundPct;
    const newUFMIP          = upb * FHA_RULES.NEW_UFMIP_RATE;
    const netUFMIP          = newUFMIP - ufmipRefund;
    const breakevenMonths   = monthlySavings > 0 ? Math.ceil(netUFMIP / monthlySavings) : 999;
    return {
      option_id: idx+1, label:`Option ${String.fromCharCode(65+idx)}`,
      note_rate: newRate, price: parseFloat(opt.price||100),
      lenderCredit: parseFloat(opt.lender_credit||0), origination: parseFloat(opt.origination||0),
      existingCombined: existingCombined.toFixed(3), newCombined: newCombined.toFixed(3),
      combinedReduction: combinedReduction.toFixed(3), ntbPass, existingPI, existingMIP,
      existingTotal: existingPI + existingMIP, newPI, newMIP, newTotal: newPI + newMIP,
      monthlySavings, ufmipRefund, newUFMIP, netUFMIP, monthsElapsed,
      refundPct: (refundPct*100).toFixed(1), breakevenMonths, upb,
    };
  });
}

function computeCommission(loanAmount, comp) {
  const loan = parseFloat(loanAmount) || 0; if (!loan) return null;
  const deductions = (parseFloat(comp.processing_fee)||0) + (parseFloat(comp.admin_fee)||0) + (parseFloat(comp.other_deductions)||0);
  const results = {};
  if (comp.lpc_rate > 0) {
    const gross = loan * (comp.lpc_rate / 100);
    const split = gross * (comp.lo_split / 100);
    results.lpc = { type:'LPC', gross, split, deductions, net: split - deductions, effective_rate:(split-deductions)/loan*100 };
  }
  if (comp.bpc_points > 0 || comp.bpc_flat > 0) {
    const gross = loan * (comp.bpc_points / 100) + (parseFloat(comp.bpc_flat)||0);
    const split = gross * (comp.lo_split / 100);
    results.bpc = { type:'BPC', gross, split, deductions, net: split - deductions, effective_rate:(split-deductions)/loan*100 };
  }
  if (results.lpc && results.bpc) {
    results.recommendation = results.lpc.net >= results.bpc.net ? 'lpc' : 'bpc';
    results.difference = Math.abs(results.lpc.net - results.bpc.net);
  }
  return results;
}

function computeMaxCashToClose(ntbResults, comp, closingCostEstimate) {
  if (!ntbResults || ntbResults.length === 0) return null;
  const cc = parseFloat(closingCostEstimate) || 3500;
  return ntbResults.filter(r => r.ntbPass).map(r => {
    const upb = r.upb; const price = r.price;
    const lenderCreditPct = price > 100 ? (price - 100) / 100 : 0;
    const lenderCredit = upb * lenderCreditPct;
    const netCC = Math.max(0, cc - lenderCredit);
    const lpcGross = comp.lpc_rate > 0 ? upb * (comp.lpc_rate / 100) : 0;
    const lpcNet = lpcGross * (comp.lo_split / 100) - ((parseFloat(comp.processing_fee)||0) + (parseFloat(comp.admin_fee)||0));
    const bpcGross = comp.bpc_points > 0 ? upb * (comp.bpc_points / 100) : 0;
    const bpcNet = bpcGross * (comp.lo_split / 100) - ((parseFloat(comp.processing_fee)||0) + (parseFloat(comp.admin_fee)||0));
    return { label: r.label, rate: r.rate || r.note_rate, price, lenderCredit, netCC,
      maxBorrowerCash: netCC, lpcNet, bpcNet, bestNet: Math.max(lpcNet, bpcNet), monthlySavings: r.monthlySavings };
  });
}

function buildDocChecklist(inp, extractionResult, selected) {
  const docs = [];
  const add = (id, label, category, required, obtained, tip) =>
    docs.push({ id, label, category, required, obtained: obtained || false, tip });
  const hasUpb   = !!(inp.existing_upb && parseFloat(inp.existing_upb) > 0);
  const hasRate  = !!(inp.existing_note_rate && parseFloat(inp.existing_note_rate) > 0);
  const hasPI    = !!(inp.existing_monthly_pi && parseFloat(inp.existing_monthly_pi) > 0);
  const hasMIP   = !!(inp.existing_monthly_mip && parseFloat(inp.existing_monthly_mip) > 0);
  const hasUFMIP = !!(inp.original_ufmip && parseFloat(inp.original_ufmip) > 0);
  const hasDate  = !!inp.endorsement_date;
  const hasCase  = !!inp.existing_case_number;
  add('D001','Original Closing Disclosure or HUD-1','Existing Loan',true, hasUpb && hasRate && hasUFMIP,
    'Shows original loan amount, rate, UFMIP paid, and origination date. Required for UFMIP refund calc.');
  add('D002','Current Mortgage Statement','Existing Loan',true, hasUpb && hasPI && hasMIP,
    'Confirms current balance, monthly payment, and MIP. Must be most recent statement.');
  add('D003','12-Month Payment History from Servicer','Existing Loan',true,
    inp.lates_last_6 !== undefined && inp.lates_months_7_12 !== undefined,
    '0x30 in last 12 months required. Request directly from servicer.');
  add('D004','FHA Case Number Confirmation','Existing Loan',true, hasCase,
    'Pull from FHA Connection to confirm active insurance and endorsement date.');
  add('D005','Endorsement / Closing Date','Existing Loan',true, hasDate,
    'Needed to calculate 210-day seasoning and UFMIP refund percentage.');
  add('D006','Government-Issued Photo ID','Borrower',true, false, "Driver's license, passport, or state ID — must not be expired.");
  add('D007','Social Security Card or SSN Documentation','Borrower',true, false, 'Required for all borrowers listed on the existing note.');
  add('D008','Homeowners Insurance Declaration Page','Borrower',true, !!(inp.estimated_property_value),
    'Must show property address, coverage amounts, and premium. Current policy year.');
  add('D009','Property Tax Statement or County Tax Record','Property',true, false,
    'Needed for escrow calculation. LoanBeacons tax calculator provides estimate — verify with county.');
  add('D010','Flood Zone Determination','Property',true, false, 'Required even without appraisal. If SFHA zone — flood insurance required at closing.');
  add('D011','Title Commitment / Title Search','Property',true, false, 'Appraisal is waived but title search is still required. Confirm no new liens since origination.');
  add('D012','Payoff Statement from Current Servicer','Closing',true, hasUpb,
    'Good for 30 days. Request early — allow 5-7 business days. Per diem must be calculated.');
  add('D013','New Loan Application (1003)','Closing',true, !!selected, 'Updated 1003 required. Income fields optional for non-credit-qualifying streamline.');
  add('D014','FHA Streamline Net Tangible Benefit Worksheet','Closing',true, false, 'Must be in file documenting NTB calculation. LoanBeacons generates this automatically.');
  add('D015','HOA Master Insurance (if condo)','Closing',false, false, 'Only if property is a condo — must meet FHA condo project approval requirements.');
  add('D016','Subordination Agreement (if 2nd lien exists)','Closing',false, false, 'Only if there is a subordinate lien. Second lienholder must agree to remain subordinate.');
  return docs;
}

const DECISION_STYLE = {
  ELIGIBLE:   {bg:'bg-green-50', border:'border-green-400', text:'text-green-800', icon:'✅',label:'ELIGIBLE — Ready to Proceed'},
  INELIGIBLE: {bg:'bg-red-50',   border:'border-red-400',   text:'text-red-800',   icon:'❌',label:'INELIGIBLE — Does Not Qualify'},
  NEEDS_INFO: {bg:'bg-yellow-50',border:'border-yellow-400',text:'text-yellow-800',icon:'⚠️',label:'NEEDS INFO — Manual Review Required'},
  INELIGIBLE_OR_NEEDS_INFO:{bg:'bg-orange-50',border:'border-orange-400',text:'text-orange-800',icon:'🔍',label:'REVIEW — Issues Found'},
};
const fmt$  = n => isNaN(n)||n===''||n===null?'—':'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtP  = n => isNaN(n)||n===''||n===null?'—':Number(n).toFixed(3)+'%';

export default function FHAStreamline() {
  const navigate   = useNavigate();
  const [sp]       = useSearchParams();
  const scenarioId = sp.get('scenarioId');
  const fileRef    = useRef(null);
  const fileRef2   = useRef(null);
  const fileRef3   = useRef(null);

  const [scenarios,      setScenarios]      = useState([]);
  const [selected,       setSelected]       = useState(null);
  const [tab,            setTab]            = useState('eligibility');
  const [saving,         setSaving]         = useState(false);
  const [eligibility,    setEligibility]    = useState(null);
  const [ntb,            setNtb]            = useState(null);
  const [checkedDocs,    setCheckedDocs]    = useState({});
  const [extractedNoteRate, setExtractedNoteRate] = useState(null);

  const { reportFindings }               = useDecisionRecord(scenarioId);
  const [savedRecordId,  setSavedRecordId]  = useState(null);
  const [recordSaving,   setRecordSaving]   = useState(false);

  const [uploadedDocs,    setUploadedDocs]    = useState([null, null, null]);
  const [extracting,      setExtracting]      = useState(false);
  const [extractionResult,setExtractionResult]= useState(null);
  const [extractionError, setExtractionError] = useState(null);
  const [extractionLog,   setExtractionLog]   = useState([]);

  const [comp, setComp] = useState({
    lo_split:70, lpc_rate:2.75, bpc_points:1.0, bpc_flat:0, processing_fee:395, admin_fee:0, other_deductions:0,
  });
  const [commissionResult, setCommissionResult] = useState(null);

  const [taxCalc, setTaxCalc] = useState({ state:'GA', county:'', city_millage:'', use_scenario_value:true, manual_fmv:'' });
  const [taxResult, setTaxResult] = useState(null);

  const [closingCostEst, setClosingCostEst] = useState('3500');
  const [maxCTCResults,  setMaxCTCResults]  = useState(null);

  const [inp, setInp] = useState({
    is_fha_insured:true, existing_case_number:'', endorsement_date:'',
    occupancy_current:'OWNER', is_delinquent:false,
    lates_last_6:0, lates_months_7_12:0, in_forbearance:false,
    borrower_removed:false, title_changed:false,
    existing_upb:'', existing_note_rate:'', existing_mip_factor:'0.55',
    existing_monthly_pi:'', existing_monthly_mip:'', original_ufmip:'',
    new_term_months:'360', new_amort_type:'FIXED', estimated_property_value:'',
    property_state:'GA', property_county:'',
  });

  const [pricing, setPricing] = useState([
    {note_rate:'',price:'',lender_credit:'',origination:''},
    {note_rate:'',price:'',lender_credit:'',origination:''},
  ]);

  useEffect(() => {
    getDocs(collection(db,'scenarios')).then(snap => {
      const list = snap.docs.map(d => ({id:d.id,...d.data()}));
      setScenarios(list);
      if (scenarioId) { const match = list.find(s => s.id === scenarioId); if (match) pick(match); }
    }).catch(console.error);
  }, [scenarioId]);

  const docChecklist = useMemo(() => buildDocChecklist(inp, extractionResult, selected), [inp, extractionResult, selected]);
  const docsObtained = docChecklist.filter(d => d.obtained || checkedDocs[d.id]).length;
  const docsPct      = Math.round((docsObtained / docChecklist.length) * 100);

  const pick = (s) => {
    setSelected(s);
    const county = (s.county || '').replace(' County','').replace(' county','');
    const state  = s.state || 'GA';
    setInp(p => ({...p,
      existing_upb: s.loanAmount || s.loan_amount || '',
      existing_note_rate: s.interestRate || s.interest_rate || '',
      estimated_property_value: s.propertyValue || s.property_value || '',
      property_state: state, property_county: county,
    }));
    setTaxCalc(p => ({...p, state, county}));
    setEligibility(null); setNtb(null); setExtractionResult(null);
    setUploadedDocs([null,null,null]); setExtractionLog([]); setExtractionError(null);
    setMaxCTCResults(null); setCheckedDocs({}); setExtractedNoteRate(null);
    const amt = s.loanAmount || s.loan_amount || 0;
    if (amt) setCommissionResult(computeCommission(amt, comp));
    const fmv = parseFloat(s.propertyValue || s.property_value || 0);
    if (fmv && county && GA_COUNTIES[county]) setTaxResult(calcPropertyTax(fmv, county, state, 0));
  };

  const si  = (k,v) => setInp(p => ({...p,[k]:v}));
  const spr = (i,k,v) => setPricing(p => p.map((o,j) => j===i ? {...o,[k]:v} : o));
  const sc  = (k,v) => {
    const c = {...comp,[k]:v}; setComp(c);
    const amt = inp.existing_upb || (selected?.loanAmount) || 0;
    if (amt) setCommissionResult(computeCommission(amt, c));
  };

  const setDoc = (idx, file) => {
    setUploadedDocs(prev => { const n=[...prev]; n[idx]=file; return n; });
    setExtractionResult(null); setExtractionError(null);
  };
  const removeDoc = (idx) => setUploadedDocs(prev => { const n=[...prev]; n[idx]=null; return n; });
  const toBase64 = (file) => new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });

  const applyParsed = (parsed) => {
    const upb     = parsed.existing_upb        || parsed.currentBalance                        || null;
    const rateRaw = parsed.existing_note_rate  || parsed.originalRate  || parsed.currentRate   || null;
    const rate    = rateRaw ? parseFloat((parseFloat(rateRaw) < 1 ? parseFloat(rateRaw) * 100 : parseFloat(rateRaw)).toFixed(3)) : null;
    const pi      = parsed.existing_monthly_pi || parsed.originalPayment                       || null;
    const mip     = parsed.existing_monthly_mip|| parsed.monthlyMIP                            || null;
    const ufmip   = parsed.original_ufmip      || parsed.ufmipPaid     || parsed.ufmipFinanced || null;
    const endDate = parsed.endorsement_date    || parsed.closingDate                           || null;
    const caseNum = parsed.existing_case_number|| parsed.fhaCaseNumber                        || null;
    const propVal = parsed.property_value      || parsed.salePrice                            || null;
    const state   = parsed.state                                                               || null;
    const county  = parsed.county                                                              || null;

    if (rate) setExtractedNoteRate(rate);

    setInp(p => ({...p,
      existing_upb:             upb     ? String(upb)     : p.existing_upb,
      existing_note_rate:       rate    ? String(rate)    : p.existing_note_rate,
      existing_monthly_pi:      pi      ? String(pi)      : p.existing_monthly_pi,
      existing_monthly_mip:     mip     ? String(mip)     : p.existing_monthly_mip,
      original_ufmip:           ufmip   ? String(ufmip)   : p.original_ufmip,
      endorsement_date:         endDate || p.endorsement_date,
      existing_case_number:     caseNum || p.existing_case_number,
      lates_last_6:             parsed.lates_last_6     ?? p.lates_last_6,
      lates_months_7_12:        parsed.lates_months_7_12 ?? p.lates_months_7_12,
      in_forbearance:           parsed.in_forbearance   ?? p.in_forbearance,
      is_delinquent:            parsed.is_delinquent    ?? p.is_delinquent,
      estimated_property_value: propVal ? String(propVal) : p.estimated_property_value,
      property_state:           state  || p.property_state,
      property_county:          county || p.property_county,
    }));
    if (county && state) {
      setTaxCalc(t => ({...t, county, state}));
      const fmv = parseFloat(propVal || inp.estimated_property_value || 0);
      if (fmv) setTaxResult(calcPropertyTax(fmv, county, state, 0));
    }
  };

  const handleExtractAll = async () => {
    const docs = uploadedDocs.filter(Boolean);
    if (docs.length === 0) return;
    setExtracting(true); setExtractionError(null); setExtractionLog([]);
    const fns = getFunctions();
    const extractFn = httpsCallable(fns, 'extractFHADocument', { timeout: 120000 });
    const log = []; let merged = {};
    for (let i = 0; i < docs.length; i++) {
      const file = docs[i];
      log.push({ name: file.name, status: 'extracting', data: null });
      setExtractionLog([...log]);
      try {
        const base64Data = await toBase64(file);
        if (!base64Data) throw new Error('Could not read file');
        const mediaType = file.type === 'application/pdf' ? 'application/pdf' : file.type.startsWith('image/') ? file.type : 'application/pdf';
        console.log(`Extracting doc ${i+1}: ${file.name} (${base64Data.length} chars base64, type: ${mediaType})`);
        const result = await extractFn({
          base64Data, mediaType,
          documentType: i === 0 ? 'closing_disclosure' : 'mortgage_statement',
        });
        console.log(`Doc ${i+1} result:`, result.data);
        const parsed = result.data?.data || {};
        merged = { ...merged, ...Object.fromEntries(Object.entries(parsed).filter(([,v]) => v !== null && v !== undefined && v !== '')) };
        log[i] = { name: file.name, status: 'done', data: parsed };
        setExtractionLog([...log]);
      } catch (err) {
        console.error(`Doc ${i+1} extraction error:`, err);
        log[i] = { name: file.name, status: 'error', error: err.message };
        setExtractionLog([...log]);
      }
    }
    if (Object.keys(merged).length > 0) { setExtractionResult(merged); applyParsed(merged); }
    else setExtractionError('No data could be extracted. Check console for details. Fill in fields manually.');
    setExtracting(false);
  };

  const runTaxCalc = () => {
    const fmv = taxCalc.use_scenario_value ? parseFloat(inp.estimated_property_value || 0) : parseFloat(taxCalc.manual_fmv || 0);
    const result = calcPropertyTax(fmv, taxCalc.county, taxCalc.state, taxCalc.city_millage);
    setTaxResult(result);
    if (result) si('monthly_tax_estimate', String(result.monthlyTax.toFixed(2)));
  };

  const run = () => {
    const el     = runEligibilityRules(inp);
    const filled = pricing.filter(o => o.note_rate && o.price);
    const ntbRes = filled.length > 0 ? computeNTB(inp, filled) : [];
    setEligibility(el); setNtb(ntbRes); setTab('eligibility');
    const amt = inp.existing_upb || (selected?.loanAmount) || 0;
    if (amt) setCommissionResult(computeCommission(amt, comp));
    if (ntbRes.length > 0) setMaxCTCResults(computeMaxCashToClose(ntbRes, comp, closingCostEst));
  };

  const save = async () => {
    if (!selected || !eligibility) return; setSaving(true);
    try {
      await updateDoc(doc(db,'scenarios',selected.id),{
        fha_streamline_analysis: { completed_at: new Date().toISOString(), final_decision: eligibility.finalDecision, rules: eligibility.rules, ntb_results: ntb, inputs: inp }
      });
    } catch(e) { alert('Error: '+e.message); } finally { setSaving(false); }
  };

  const handleSaveToRecord = async () => {
    if (!eligibility) return; setRecordSaving(true);
    try {
      const id = await reportFindings('FHA_STREAMLINE',{ finalDecision: eligibility.finalDecision, existingRate: inp.existing_note_rate, ntbResults: ntb, commissionResult, taxResult, timestamp: new Date().toISOString() });
      if (id) setSavedRecordId(id);
    } catch(e) { console.error(e); } finally { setRecordSaving(false); }
  };

  const getBadge = (r,all) => {
    if (!r.ntbPass) return {label:'Does Not Meet NTB',color:'bg-red-100 text-red-700'};
    const passing = all.filter(x=>x.ntbPass);
    const bestSave = Math.max(...passing.map(x=>x.monthlySavings));
    const bestBE   = Math.min(...passing.map(x=>x.breakevenMonths));
    if (r.monthlySavings===bestSave) return {label:'⭐ Best Overall',color:'bg-blue-600 text-white'};
    if (r.breakevenMonths===bestBE)  return {label:'⚡ Fastest BE',color:'bg-green-600 text-white'};
    return {label:'✓ Meets NTB',color:'bg-gray-100 text-gray-700'};
  };

  // ── Print Worksheet Generators ─────────────────────────────────────────────
  const generateNTBWorksheetHTML = () => {
    const borrowerName = selected ? `${selected.firstName||''} ${selected.lastName||''}`.trim() : 'N/A';
    const existingCombined = (parseFloat(inp.existing_note_rate||0)+parseFloat(inp.existing_mip_factor||0.55)).toFixed(3);
    const existingTotal = (Number(inp.existing_monthly_pi||0)+Number(inp.existing_monthly_mip||0)).toFixed(2);
    const days = inp.endorsement_date ? Math.floor((Date.now()-new Date(inp.endorsement_date).getTime())/(1000*60*60*24)) : 0;
    return `<!DOCTYPE html><html><head><title>FHA Streamline NTB Worksheet</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:40px;color:#333}h1{font-size:16px;border-bottom:2px solid #1e40af;padding-bottom:8px;color:#1e40af;text-align:center}h2{font-size:13px;margin-top:20px;color:#374151;border-bottom:1px solid #d1d5db;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#eff6ff;text-align:left;padding:6px 8px;font-weight:bold;border:1px solid #bfdbfe}td{padding:6px 8px;border:1px solid #e5e7eb}.pass{color:#166534;font-weight:bold}.fail{color:#991b1b;font-weight:bold}.result-box{border:2px solid #1e40af;padding:12px;margin:16px 0;background:#eff6ff}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}.info-block{border:1px solid #e5e7eb;padding:10px;border-radius:4px}@media print{body{margin:20px}}</style>
</head><body>
<h1>LoanBeacons™ — FHA Streamline Net Tangible Benefit Worksheet</h1>
<p style="text-align:center;color:#6b7280;font-size:11px;margin-bottom:16px">HUD Handbook 4000.1 §III.A.2.a — Required Documentation for All FHA Streamline Files</p>
<div class="info-grid">
  <div class="info-block"><strong>Borrower:</strong> ${borrowerName}<br><strong>Property:</strong> ${selected?.streetAddress||'—'}, ${selected?.city||'—'}, ${selected?.state||'GA'}<br><strong>FHA Case #:</strong> ${inp.existing_case_number||'—'}<br><strong>Loan Number:</strong> ${selected?.id||'—'}</div>
  <div class="info-block"><strong>Loan Officer:</strong> George Chevalier IV<br><strong>LO NMLS:</strong> 1175947<br><strong>Lender:</strong> Clearview Lending Solutions NMLS #1175947<br><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
</div>
<h2>Part 1 — Existing FHA Loan Data</h2>
<table><tr><th>Field</th><th>Value</th><th>Source</th></tr>
<tr><td>Current Unpaid Principal Balance</td><td>$${Number(inp.existing_upb||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td><td>Current Mortgage Statement</td></tr>
<tr><td>Existing Interest Rate</td><td>${parseFloat(inp.existing_note_rate||0).toFixed(3)}%</td><td>Mortgage Statement / Closing Disclosure</td></tr>
<tr><td>Annual MIP Factor</td><td>${parseFloat(inp.existing_mip_factor||0.55).toFixed(3)}%</td><td>MIP Schedule / HUD Guidelines</td></tr>
<tr><td><strong>Existing Combined Rate (Rate + MIP)</strong></td><td><strong>${existingCombined}%</strong></td><td>Calculated: ${inp.existing_note_rate}% + ${inp.existing_mip_factor}%</td></tr>
<tr><td>Monthly P&I Payment</td><td>$${Number(inp.existing_monthly_pi||0).toFixed(2)}</td><td>Current Mortgage Statement</td></tr>
<tr><td>Monthly MIP Payment</td><td>$${Number(inp.existing_monthly_mip||0).toFixed(2)}</td><td>Current Mortgage Statement</td></tr>
<tr><td><strong>Total Monthly P&I + MIP</strong></td><td><strong>$${existingTotal}</strong></td><td>Calculated</td></tr>
<tr><td>FHA Case Number</td><td>${inp.existing_case_number||'—'}</td><td>FHA Connection</td></tr>
<tr><td>Endorsement / Closing Date</td><td>${inp.endorsement_date||'—'}</td><td>HUD-1 / Closing Disclosure</td></tr>
<tr><td>Days Since Closing</td><td>${days} days (${Math.floor(days/30)} payments)</td><td>Calculated</td></tr>
<tr><td>210-Day Seasoning Requirement</td><td class="${days>=210?'pass':'fail'}">${days>=210?'✓ SATISFIED — '+days+' days elapsed':'✗ NOT MET — need '+(210-days)+' more days'}</td><td>HUD 4000.1 §III.A.2.a</td></tr>
<tr><td>Original UFMIP Paid</td><td>$${Number(inp.original_ufmip||0).toFixed(2)}</td><td>HUD-1 / Closing Disclosure</td></tr>
</table>
${ntb ? ntb.map(r => `
<h2>Part 2 — Proposed Loan: ${r.label} at ${r.note_rate}%</h2>
<table><tr><th>Field</th><th>Value</th><th>Notes</th></tr>
<tr><td>Proposed Interest Rate</td><td>${r.note_rate}%</td><td>Rate sheet / lock confirmation</td></tr>
<tr><td>New Annual MIP Factor</td><td>0.550%</td><td>FHA Standard — LTV > 90%, term > 15 years</td></tr>
<tr><td><strong>New Combined Rate (Rate + MIP)</strong></td><td><strong>${r.newCombined}%</strong></td><td>Calculated: ${r.note_rate}% + 0.550%</td></tr>
<tr><td>New Monthly P&I</td><td>$${r.newPI.toFixed(2)}</td><td>Amortization: $${Number(inp.existing_upb||0).toLocaleString()} @ ${r.note_rate}% / ${inp.new_term_months} months</td></tr>
<tr><td>New Monthly MIP</td><td>$${r.newMIP.toFixed(2)}</td><td>$${Number(inp.existing_upb||0).toLocaleString()} × 0.55% ÷ 12</td></tr>
<tr><td><strong>New Total Monthly P&I + MIP</strong></td><td><strong>$${r.newTotal.toFixed(2)}</strong></td><td>Calculated</td></tr>
</table>
<h2>Part 3 — NTB Calculation: ${r.label}</h2>
<table><tr><th>Step</th><th>Calculation</th><th>Result</th></tr>
<tr><td>1. Existing Combined Rate</td><td>${inp.existing_note_rate}% (rate) + ${inp.existing_mip_factor}% (MIP)</td><td>${r.existingCombined}%</td></tr>
<tr><td>2. New Combined Rate</td><td>${r.note_rate}% (rate) + 0.550% (MIP)</td><td>${r.newCombined}%</td></tr>
<tr><td>3. Combined Rate Reduction</td><td>${r.existingCombined}% − ${r.newCombined}%</td><td>${r.combinedReduction}%</td></tr>
<tr><td>4. NTB Threshold Required</td><td>Minimum 0.500% reduction per HUD 4000.1</td><td>0.500%</td></tr>
<tr><td><strong>5. NTB Determination</strong></td><td></td><td class="${r.ntbPass?'pass':'fail'}">${r.ntbPass?'✓ MEETS NTB — '+r.combinedReduction+'% ≥ 0.500%':'✗ FAILS NTB — '+r.combinedReduction+'% < 0.500%'}</td></tr>
<tr><td>6. Monthly Payment Reduction</td><td>$${(r.existingPI+r.existingMIP).toFixed(2)} (existing) − $${r.newTotal.toFixed(2)} (new)</td><td>$${r.monthlySavings.toFixed(2)}/month savings</td></tr>
<tr><td>7. UFMIP Refund (${r.refundPct}% at ${r.monthsElapsed} months)</td><td>$${Number(inp.original_ufmip||0).toFixed(2)} × ${r.refundPct}%</td><td>$${r.ufmipRefund.toFixed(2)} credit</td></tr>
<tr><td>8. New UFMIP (1.75%)</td><td>$${Number(inp.existing_upb||0).toFixed(2)} × 1.75%</td><td>$${r.newUFMIP.toFixed(2)}</td></tr>
<tr><td>9. Net UFMIP Cost</td><td>$${r.newUFMIP.toFixed(2)} − $${r.ufmipRefund.toFixed(2)}</td><td>$${r.netUFMIP.toFixed(2)}</td></tr>
<tr><td>10. Breakeven Period</td><td>$${r.netUFMIP.toFixed(2)} ÷ $${r.monthlySavings.toFixed(2)}/month</td><td>${r.breakevenMonths<999?r.breakevenMonths+' months':'N/A (no savings)'}</td></tr>
</table>`).join('') : '<p>Run analysis to generate NTB data.</p>'}
<div class="result-box">
<h2 style="margin-top:0;border:none;color:#1e40af">Part 4 — Final NTB Determination</h2>
${ntb && ntb.length > 0 ? `<p>Based on the FHA Streamline Net Tangible Benefit analysis:</p><ul>${ntb.map(r=>`<li><strong>${r.label} (${r.note_rate}%):</strong> <span class="${r.ntbPass?'pass':'fail'}">${r.ntbPass?'✓ MEETS':'✗ DOES NOT MEET'}</span> the Net Tangible Benefit requirement. Combined rate reduction: ${r.combinedReduction}% (threshold: 0.500%)</li>`).join('')}</ul>` : '<p>Run analysis first.</p>'}
</div>
<h2>Certifications</h2>
<p>I certify that the information in this worksheet is accurate and complete, and that the proposed FHA Streamline Refinance has been analyzed in accordance with HUD Handbook 4000.1 requirements.</p>
<table style="margin-top:40px"><tr>
<td style="border:none;padding-top:40px;border-top:1px solid #333;width:33%">Loan Officer Signature / Date</td>
<td style="border:none;width:5%"></td>
<td style="border:none;padding-top:40px;border-top:1px solid #333;width:33%">Borrower Signature / Date</td>
<td style="border:none;width:5%"></td>
<td style="border:none;padding-top:40px;border-top:1px solid #333;width:24%">Co-Borrower / Date</td>
</tr></table>
<p style="color:#9ca3af;font-size:10px;margin-top:40px;text-align:center">Generated by LoanBeacons™ FHA Streamline Intelligence™ | Clearview Lending Solutions NMLS #1175947 | ${new Date().toLocaleString()} | Patent Pending</p>
<script>window.print();</script></body></html>`;
  };

  const generateUWWorksheetHTML = () => {
    const borrowerName = selected ? `${selected.firstName||''} ${selected.lastName||''}`.trim() : 'N/A';
    const days = inp.endorsement_date ? Math.floor((Date.now()-new Date(inp.endorsement_date).getTime())/(1000*60*60*24)) : 0;
    const pmts = Math.floor(days/30);
    return `<!DOCTYPE html><html><head><title>FHA Streamline UW Summary</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:30px;color:#333}h1{font-size:14px;border-bottom:2px solid #1e40af;padding-bottom:6px;color:#1e40af}h2{font-size:11px;margin-top:14px;color:#fff;background:#374151;padding:4px 8px}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px}th{background:#dbeafe;text-align:left;padding:5px 6px;font-weight:bold;border:1px solid #93c5fd}td{padding:5px 6px;border:1px solid #e5e7eb}.pass{color:#166534;font-weight:bold}.fail{color:#991b1b;font-weight:bold}.warn{color:#92400e;font-weight:bold}.det{border:2px solid #1e40af;padding:10px;margin:12px 0;background:#eff6ff}@media print{body{margin:15px}}</style>
</head><body>
<h1>🏦 LoanBeacons™ — FHA Streamline Underwriting Summary</h1>
<p style="color:#6b7280;font-size:10px">File #: ${inp.existing_case_number||'PENDING'} | Generated: ${new Date().toLocaleString()} | LoanBeacons™ v7</p>
<h2>1. FILE IDENTIFICATION</h2>
<table><tr><td width="150"><strong>Borrower</strong></td><td>${borrowerName}</td><td width="150"><strong>FHA Case #</strong></td><td>${inp.existing_case_number||'—'}</td></tr>
<tr><td><strong>Property</strong></td><td>${selected?.streetAddress||'—'}, ${selected?.city||'—'}, ${selected?.state||'GA'} ${selected?.zipCode||''}</td><td><strong>County</strong></td><td>${selected?.county||inp.property_county||'—'}</td></tr>
<tr><td><strong>Loan Officer</strong></td><td>George Chevalier IV</td><td><strong>LO NMLS</strong></td><td>1175947</td></tr>
<tr><td><strong>Lender</strong></td><td>Clearview Lending Solutions</td><td><strong>Lender NMLS</strong></td><td>1175947</td></tr>
<tr><td><strong>Analysis Date</strong></td><td>${new Date().toLocaleDateString()}</td><td><strong>System</strong></td><td>LoanBeacons™ FHA Streamline Intelligence™ v7</td></tr></table>
<h2>2. SEASONING VERIFICATION (HUD 4000.1 §III.A.2.a)</h2>
<table><tr><th>Requirement</th><th>Required</th><th>Actual</th><th>Status</th></tr>
<tr><td>Days Since Closing</td><td>≥ 210 days</td><td>${days} days</td><td class="${days>=210?'pass':'fail'}">${days>=210?'✓ PASS':'✗ FAIL'}</td></tr>
<tr><td>Payments Made</td><td>≥ 6 payments</td><td>~${pmts} payments</td><td class="${pmts>=6?'pass':'fail'}">${pmts>=6?'✓ PASS':'✗ FAIL'}</td></tr>
<tr><td>Endorsement Date</td><td>—</td><td>${inp.endorsement_date||'—'}</td><td>—</td></tr></table>
<h2>3. ELIGIBILITY RULES CHECKLIST</h2>
<table><tr><th>Rule</th><th>Label</th><th>Criteria</th><th>Finding</th><th>Status</th></tr>
${eligibility ? eligibility.rules.map(r=>`<tr><td>${r.id}</td><td>${r.label}</td><td>${r.id==='R001'?'FHA-insured loan required':r.id==='R002'?'Must be current — no delinquency':r.id==='R003'?'0×30-day late in last 6 months':r.id==='R004'?'Max 1×30-day late in months 7-12':r.id==='R005'?'Owner-occupied property':r.id==='R006'?'Not in forbearance/loss mitigation':'No borrower or title changes'}</td><td>${r.message}</td><td class="${r.status==='PASS'?'pass':r.status==='FAIL'?'fail':'warn'}">${r.status}</td></tr>`).join(''):'<tr><td colspan="5">Run analysis first</td></tr>'}
${eligibility?`<tr style="background:#f9fafb"><td colspan="4"><strong>OVERALL ELIGIBILITY DETERMINATION</strong></td><td class="${eligibility.finalDecision==='ELIGIBLE'?'pass':eligibility.finalDecision==='INELIGIBLE'?'fail':'warn'}"><strong>${eligibility.finalDecision}</strong></td></tr>`:''}
</table>
<h2>4. NTB CALCULATION DETAIL</h2>
<table><tr><th>Component</th><th>Existing</th>${ntb?ntb.map(r=>`<th>${r.label} (${r.note_rate}%)</th>`).join(''):'<th>—</th>'}</tr>
<tr><td>Interest Rate</td><td>${parseFloat(inp.existing_note_rate||0).toFixed(3)}%</td>${ntb?ntb.map(r=>`<td>${r.note_rate}%</td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Annual MIP Factor</td><td>${parseFloat(inp.existing_mip_factor||0.55).toFixed(3)}%</td>${ntb?ntb.map(()=>'<td>0.550%</td>').join(''):'<td>—</td>'}</tr>
<tr><td><strong>Combined Rate</strong></td><td><strong>${(parseFloat(inp.existing_note_rate||0)+parseFloat(inp.existing_mip_factor||0.55)).toFixed(3)}%</strong></td>${ntb?ntb.map(r=>`<td><strong>${r.newCombined}%</strong></td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Rate Reduction</td><td>—</td>${ntb?ntb.map(r=>`<td>${r.combinedReduction}%</td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Meets 0.50% NTB?</td><td>—</td>${ntb?ntb.map(r=>`<td class="${r.ntbPass?'pass':'fail'}">${r.ntbPass?'✓ YES — PASS':'✗ NO — FAIL'}</td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Monthly P&I</td><td>$${Number(inp.existing_monthly_pi||0).toFixed(2)}</td>${ntb?ntb.map(r=>`<td>$${r.newPI.toFixed(2)}</td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Monthly MIP</td><td>$${Number(inp.existing_monthly_mip||0).toFixed(2)}</td>${ntb?ntb.map(r=>`<td>$${r.newMIP.toFixed(2)}</td>`).join(''):'<td>—</td>'}</tr>
<tr><td><strong>Total P&I+MIP</strong></td><td><strong>$${(Number(inp.existing_monthly_pi||0)+Number(inp.existing_monthly_mip||0)).toFixed(2)}</strong></td>${ntb?ntb.map(r=>`<td><strong>$${r.newTotal.toFixed(2)}</strong></td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Monthly Savings</td><td>—</td>${ntb?ntb.map(r=>`<td>$${r.monthlySavings.toFixed(2)}/mo</td>`).join(''):'<td>—</td>'}</tr>
<tr><td>Breakeven</td><td>—</td>${ntb?ntb.map(r=>`<td>${r.breakevenMonths<999?r.breakevenMonths+' months':'N/A'}</td>`).join(''):'<td>—</td>'}</tr>
</table>
<h2>5. UFMIP REFUND CALCULATION</h2>
<table><tr><th>Item</th><th>Value</th><th>Notes</th></tr>
<tr><td>Original UFMIP Paid at Closing</td><td>$${Number(inp.original_ufmip||0).toFixed(2)}</td><td>From HUD-1 / Closing Disclosure</td></tr>
${ntb&&ntb[0]?`<tr><td>Months Since Endorsement</td><td>${ntb[0].monthsElapsed} months</td><td>Calculated from ${inp.endorsement_date||'—'}</td></tr>
<tr><td>UFMIP Refund Percentage</td><td>${ntb[0].refundPct}%</td><td>Per FHA UFMIP refund schedule</td></tr>
<tr><td>UFMIP Refund Amount</td><td>$${ntb[0].ufmipRefund.toFixed(2)}</td><td>Applied as credit against new UFMIP</td></tr>
<tr><td>New UFMIP (1.75%)</td><td>$${ntb[0].newUFMIP.toFixed(2)}</td><td>1.75% × $${Number(inp.existing_upb||0).toLocaleString()}</td></tr>
<tr><td><strong>Net UFMIP Cost</strong></td><td><strong>$${ntb[0].netUFMIP.toFixed(2)}</strong></td><td>New UFMIP less refund credit</td></tr>`
:'<tr><td colspan="3">Run analysis first</td></tr>'}
</table>
<h2>6. PROPERTY TAX VERIFICATION</h2>
<table><tr><th>Item</th><th>Value</th><th>Source / Notes</th></tr>
<tr><td>State</td><td>${inp.property_state||'GA'}</td><td>Scenario</td></tr>
<tr><td>County</td><td>${inp.property_county||taxCalc.county||'—'}</td><td>Scenario / Property records</td></tr>
${taxResult?`<tr><td>Fair Market Value</td><td>$${Number(taxResult.fmv).toLocaleString()}</td><td>Scenario / Appraisal</td></tr>
<tr><td>Assessed Value</td><td>${taxResult.assessedValue?'$'+Number(taxResult.assessedValue).toLocaleString():'N/A'}</td><td>${inp.property_state==='GA'?'GA 40% assessment ratio':'Estimated'}</td></tr>
<tr><td>Annual Property Tax (Est.)</td><td>$${Number(taxResult.annualTax).toFixed(2)}</td><td>${taxResult.source}</td></tr>
<tr><td><strong>Monthly Tax Escrow (Est.)</strong></td><td><strong>$${taxResult.monthlyTax.toFixed(2)}</strong></td><td>Annual ÷ 12</td></tr>
<tr><td>Tax Due Date</td><td>${taxResult.dueDate}</td><td>County records</td></tr>`
:'<tr><td colspan="3">Run property tax calculator first</td></tr>'}
</table>
<p style="color:#dc2626;font-size:10px">⚠️ Property tax estimates must be verified with county tax assessor before closing. Rates change annually.</p>
<h2>7. LO COMPENSATION DISCLOSURE (RESPA/TILA)</h2>
<table><tr><th>Item</th><th>LPC (Lender Paid)</th><th>BPC (Borrower Paid)</th></tr>
${commissionResult?`<tr><td>Gross Commission</td><td>$${commissionResult.lpc?commissionResult.lpc.gross.toFixed(2):'—'}</td><td>$${commissionResult.bpc?commissionResult.bpc.gross.toFixed(2):'—'}</td></tr>
<tr><td>LO Split (${comp.lo_split}%)</td><td>$${commissionResult.lpc?commissionResult.lpc.split.toFixed(2):'—'}</td><td>$${commissionResult.bpc?commissionResult.bpc.split.toFixed(2):'—'}</td></tr>
<tr><td>Deductions</td><td>($${commissionResult.lpc?commissionResult.lpc.deductions.toFixed(2):'—'})</td><td>($${commissionResult.bpc?commissionResult.bpc.deductions.toFixed(2):'—'})</td></tr>
<tr><td><strong>Net to LO</strong></td><td><strong>$${commissionResult.lpc?commissionResult.lpc.net.toFixed(2):'—'}</strong></td><td><strong>$${commissionResult.bpc?commissionResult.bpc.net.toFixed(2):'—'}</strong></td></tr>
<tr><td>Comp Selected</td><td colspan="2">${commissionResult.recommendation?commissionResult.recommendation.toUpperCase()+' — '+(commissionResult.recommendation==='lpc'?'Lender Paid Compensation':'Borrower Paid Compensation'):'—'}</td></tr>`
:'<tr><td colspan="3">Select scenario with loan amount</td></tr>'}
</table>
<p style="color:#92400e;font-size:10px">RESPA: LO may receive LPC or BPC — not both on the same file.</p>
<div class="det">
<h2 style="margin-top:0;background:none;color:#1e40af;border:none">8. FINAL UNDERWRITING DETERMINATION</h2>
<p><strong>Eligibility:</strong> <span class="${eligibility?.finalDecision==='ELIGIBLE'?'pass':eligibility?.finalDecision==='INELIGIBLE'?'fail':'warn'}">${eligibility?.finalDecision||'PENDING — Run analysis first'}</span></p>
<p><strong>NTB:</strong> ${ntb&&ntb.some(r=>r.ntbPass)?`<span class="pass">PASS — ${ntb.filter(r=>r.ntbPass).map(r=>r.label+' ('+r.note_rate+'%)').join(', ')} meet(s) NTB requirement</span>`:'<span class="fail">No options currently meet NTB threshold</span>'}</p>
<p><strong>Recommendation:</strong> ${eligibility?.finalDecision==='ELIGIBLE'&&ntb?.some(r=>r.ntbPass)?'<span class="pass">✓ PROCEED — File meets all FHA Streamline requirements. File may be submitted.</span>':'<span class="fail">✗ HOLD — Review issues noted above before submission.</span>'}</p>
</div>
<table style="margin-top:30px"><tr>
<td style="border:none;padding-top:35px;border-top:1px solid #333;width:32%">Underwriter Signature / Date</td>
<td style="border:none;width:2%"></td>
<td style="border:none;padding-top:35px;border-top:1px solid #333;width:32%">Loan Officer / Date</td>
<td style="border:none;width:2%"></td>
<td style="border:none;padding-top:35px;border-top:1px solid #333;width:32%">Supervisor / Date (if required)</td>
</tr></table>
<p style="color:#9ca3af;font-size:10px;margin-top:20px;text-align:center">LoanBeacons™ FHA Streamline Intelligence™ v7 | Clearview Lending Solutions NMLS #1175947 | ${new Date().toLocaleString()} | Patent Pending</p>
<script>window.print();</script></body></html>`;
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 text-white px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={()=>navigate('/')} className="text-blue-200 text-sm mb-1 hover:text-white block">← Back to Dashboard</button>
            <div className="flex items-center gap-3">
              <span className="text-3xl">📋</span>
              <div>
                <h1 className="text-xl font-bold">FHA Streamline Intelligence™</h1>
                <p className="text-blue-100 text-sm">Eligibility · NTB · MIP · Property Tax · LO Commission · Cash-to-Close Optimizer</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {selected && (
              <div className="bg-white/10 rounded-xl px-3 py-2 text-xs">
                <div className="text-blue-200">Doc Checklist</div>
                <div className="font-bold">{docsObtained}/{docChecklist.length} ready</div>
                <div className="w-24 h-1.5 bg-white/20 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full" style={{width:`${docsPct}%`}}/>
                </div>
              </div>
            )}
            {eligibility && (
              <div className={`rounded-xl px-4 py-2 border-2 ${DECISION_STYLE[eligibility.finalDecision].border} ${DECISION_STYLE[eligibility.finalDecision].bg}`}>
                <div className={`font-bold text-sm ${DECISION_STYLE[eligibility.finalDecision].text}`}>
                  {DECISION_STYLE[eligibility.finalDecision].icon} {DECISION_STYLE[eligibility.finalDecision].label}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {!selected ? (
          <div className="bg-white rounded-xl border-2 border-blue-200 p-6">
            <h2 className="font-bold text-gray-800 mb-1">Select a Scenario</h2>
            <p className="text-gray-500 text-sm mb-4">Choose an FHA loan scenario to analyze streamline eligibility</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {scenarios.map(s => (
                <button key={s.id} onClick={()=>pick(s)}
                  className="w-full text-left bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all">
                  <div className="font-semibold text-gray-800">{s.scenarioName||`${s.firstName||''} ${s.lastName||''}`.trim()||'Unnamed'}</div>
                  <div className="text-sm text-gray-500">${Number(s.loanAmount||0).toLocaleString()} · Rate: {s.interestRate||'—'}% · {s.loanType||'—'} · {s.county||s.city||'—'}</div>
                </button>
              ))}
              {scenarios.length===0&&<p className="text-gray-400 text-sm text-center py-6">No scenarios found.</p>}
            </div>
          </div>
        ) : (
          <>
            {/* Working banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-green-600 font-bold">✓ Working on:</span>
                <span className="font-semibold text-gray-800 ml-2">{selected.scenarioName||`${selected.firstName||''} ${selected.lastName||''}`.trim()}</span>
                <span className="text-gray-500 text-sm ml-3">
                  ${Number(selected.loanAmount||0).toLocaleString()} ·
                  {extractedNoteRate ? (
                    <span> <span className="line-through text-gray-400">{selected.interestRate||'—'}%</span> <span className="text-blue-600 font-semibold">{extractedNoteRate}%</span> <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">from PDF</span></span>
                  ) : ` ${selected.interestRate||'—'}%`} · {selected.county||''}
                </span>
              </div>
              <button onClick={()=>{setSelected(null);setEligibility(null);setNtb(null);setExtractionResult(null);setUploadedDocs([null,null,null]);setExtractionLog([]);setMaxCTCResults(null);setTaxResult(null);setCheckedDocs({});setExtractedNoteRate(null);}}
                className="text-blue-600 text-sm hover:underline">Change Scenario</button>
            </div>

            {/* AI PDF Auto-Fill */}
            <div className="bg-white rounded-xl border-2 border-blue-200 p-5">
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-600 text-white rounded px-2 py-1 text-xs font-bold">AI</span>
                  <div>
                    <p className="font-bold text-gray-800">PDF Auto-Fill — Upload Up to 3 Documents</p>
                    <p className="text-xs text-gray-500">Closing Disclosure + Mortgage Statement + Payment History — Haiku extracts and merges all fields</p>
                  </div>
                </div>
                {uploadedDocs.some(Boolean) && !extractionResult && (
                  <button onClick={handleExtractAll} disabled={extracting}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${extracting?'bg-blue-300 text-white cursor-not-allowed':'bg-blue-600 hover:bg-blue-700 text-white shadow-md'}`}>
                    {extracting ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                        Extracting {uploadedDocs.filter(Boolean).length} doc{uploadedDocs.filter(Boolean).length>1?'s':''}…
                      </span>
                    ) : `🤖 Extract ${uploadedDocs.filter(Boolean).length} Doc${uploadedDocs.filter(Boolean).length>1?'s':''} with Haiku AI`}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                {[
                  {idx:0, label:'Doc 1 — Closing Disclosure / HUD-1', ref:fileRef,  tip:'Original CD shows rate, UFMIP, origination date'},
                  {idx:1, label:'Doc 2 — Current Mortgage Statement',  ref:fileRef2, tip:'Shows current balance, monthly payment, MIP'},
                  {idx:2, label:'Doc 3 — Payment History (12-24 months)', ref:fileRef3, tip:'Shows 30-day lates for eligibility check'},
                ].map(({idx, label, ref, tip}) => {
                  const file = uploadedDocs[idx]; const logEntry = extractionLog[idx];
                  return (
                    <div key={idx} onClick={() => !file && ref.current?.click()}
                      onDragOver={e=>e.preventDefault()}
                      onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)setDoc(idx,f);}}
                      className={`border-2 border-dashed rounded-xl p-3 transition-all
                        ${file?'border-blue-400 bg-blue-50':logEntry?.status==='done'?'border-green-400 bg-green-50':logEntry?.status==='error'?'border-red-300 bg-red-50':'border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'}`}>
                      <input ref={ref} type="file" accept=".pdf,image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)setDoc(idx,f);}}/>
                      <p className="text-xs font-bold text-gray-600 mb-1.5">{label}</p>
                      {file ? (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{logEntry?.status==='done'?'✅':logEntry?.status==='error'?'❌':'📄'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-blue-700 text-xs truncate">{file.name}</p>
                            <p className="text-xs text-gray-400">{(file.size/1024).toFixed(1)} KB
                              {logEntry?.status==='done' && <span className="text-green-600 ml-1">· Extracted ✓</span>}
                              {logEntry?.status==='error' && <span className="text-red-500 ml-1">· Failed</span>}
                              {logEntry?.status==='extracting' && <span className="text-blue-500 ml-1">· Extracting…</span>}
                            </p>
                          </div>
                          <button onClick={e=>{e.stopPropagation();removeDoc(idx);}} className="text-gray-400 hover:text-red-500 text-sm shrink-0">✕</button>
                        </div>
                      ) : (
                        <div className="text-center py-1"><div className="text-xl mb-0.5">📎</div><p className="text-xs text-gray-400">{tip}</p></div>
                      )}
                    </div>
                  );
                })}
              </div>

              {extractionLog.length > 0 && (
                <div className="space-y-1 mb-3">
                  {extractionLog.map((entry, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${entry.status==='done'?'bg-green-50 text-green-700':entry.status==='error'?'bg-red-50 text-red-600':'bg-blue-50 text-blue-600'}`}>
                      <span>{entry.status==='done'?'✅':entry.status==='error'?'❌':'⏳'}</span>
                      <span className="font-semibold truncate">{entry.name}</span>
                      <span>—</span>
                      <span>{entry.status==='done'?`${Object.keys(entry.data||{}).length} fields extracted`:entry.status==='error'?`Error: ${entry.error}`:'Extracting…'}</span>
                    </div>
                  ))}
                </div>
              )}

              {extractionResult && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="font-bold text-green-800 mb-2">✅ Extraction Complete — All Fields Merged & Auto-Populated</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {[
                      ['Balance',      extractionResult.currentBalance       ? '$'+Number(extractionResult.currentBalance).toLocaleString()         : null],
                      ['Rate',         extractionResult.originalRate||extractionResult.currentRate ? ((parseFloat(extractionResult.originalRate||extractionResult.currentRate)<1?(parseFloat(extractionResult.originalRate||extractionResult.currentRate)*100):parseFloat(extractionResult.originalRate||extractionResult.currentRate)).toFixed(3))+'%' : null],
                      ['P&I',          extractionResult.originalPayment      ? '$'+Number(extractionResult.originalPayment).toFixed(2)              : null],
                      ['MIP/mo',       extractionResult.monthlyMIP           ? '$'+Number(extractionResult.monthlyMIP).toFixed(2)                   : null],
                      ['UFMIP',        extractionResult.ufmipPaid||extractionResult.ufmipFinanced ? '$'+Number(extractionResult.ufmipPaid||extractionResult.ufmipFinanced).toLocaleString() : null],
                      ['FHA Case #',   extractionResult.fhaCaseNumber                                                                                || null],
                      ['Closing Date', extractionResult.closingDate                                                                                  || null],
                      ['Pmts Made',    extractionResult.paymentsMade !== undefined ? `${extractionResult.paymentsMade} payments`                    : null],
                    ].filter(([,v])=>v).map(([label,value])=>(
                      <div key={label} className="bg-white rounded-lg px-2.5 py-1.5 border border-green-200">
                        <div className="text-gray-500">{label}</div>
                        <div className="font-semibold text-gray-800 truncate">{value}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-green-600 mt-2">Review fields below and adjust if needed before running analysis.</p>
                </div>
              )}

              {extractionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠️ {extractionError}</div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

              {/* LEFT col */}
              <div className="xl:col-span-3 space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-800 text-sm">📋 Document Checklist</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${docsPct===100?'bg-green-100 text-green-700':docsPct>=60?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{docsObtained}/{docChecklist.length}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${docsPct===100?'bg-green-500':docsPct>=60?'bg-amber-400':'bg-red-400'}`} style={{width:`${docsPct}%`}}/>
                  </div>
                  {['Existing Loan','Borrower','Property','Closing'].map(cat => {
                    const catDocs = docChecklist.filter(d => d.category === cat);
                    const catDone = catDocs.filter(d => d.obtained || checkedDocs[d.id]).length;
                    return (
                      <div key={cat} className="mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{cat}</span>
                          <span className="text-xs text-gray-400">{catDone}/{catDocs.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {catDocs.map(d => {
                            const done = d.obtained || checkedDocs[d.id];
                            return (
                              <label key={d.id} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-all text-xs ${done?'bg-green-50 border border-green-200':'bg-gray-50 border border-gray-200 hover:border-blue-300'}`}>
                                <input type="checkbox" checked={!!done} onChange={e => setCheckedDocs(p=>({...p,[d.id]:e.target.checked}))} className="w-3.5 h-3.5 mt-0.5 accent-green-600 shrink-0"/>
                                <div className="flex-1 min-w-0">
                                  <div className={`font-semibold leading-tight ${done?'text-green-700 line-through opacity-70':'text-gray-700'}`}>
                                    {d.label}{!d.required && <span className="ml-1 text-gray-400 font-normal no-underline">(opt)</span>}
                                  </div>
                                  {!done && <div className="text-gray-400 mt-0.5 leading-tight">{d.tip}</div>}
                                </div>
                                {d.obtained && !checkedDocs[d.id] && <span className="text-xs text-blue-600 font-bold shrink-0">AI ✓</span>}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {docsObtained === docChecklist.length && (
                    <div className="bg-green-100 border border-green-300 rounded-xl p-3 text-center">
                      <div className="text-lg mb-1">✅</div>
                      <div className="font-bold text-green-800 text-sm">All Documents Ready</div>
                      <div className="text-xs text-green-600 mt-0.5">File is complete — ready to run analysis</div>
                    </div>
                  )}
                </div>
              </div>

              {/* CENTER col */}
              <div className="xl:col-span-5 space-y-4">

                {/* Existing Loan */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                    Existing FHA Loan
                  </h3>
                  <div className="flex flex-wrap gap-4 mb-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={inp.is_fha_insured} onChange={e=>si('is_fha_insured',e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                      <span className="font-semibold text-gray-700">Confirmed FHA-Insured</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={inp.is_delinquent} onChange={e=>si('is_delinquent',e.target.checked)} className="w-4 h-4 accent-red-600"/>
                      <span className="text-gray-700">Loan is Delinquent</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {label:'Current Balance ($)',       key:'existing_upb',          ph:'e.g. 172840'},
                      {label:'Note Rate (%)',              key:'existing_note_rate',    ph:'e.g. 7.250'},
                      {label:'Monthly P&I ($)',            key:'existing_monthly_pi',   ph:'e.g. 1207.58'},
                      {label:'Monthly MIP ($)',            key:'existing_monthly_mip',  ph:'e.g. 96.25'},
                      {label:'Original UFMIP Paid ($)',    key:'original_ufmip',        ph:'e.g. 3097.50'},
                      {label:'Annual MIP Factor (%)',      key:'existing_mip_factor',   ph:'0.55'},
                      {label:'FHA Case Number',            key:'existing_case_number',  ph:'105-XXXXXXX-XXX', type:'text'},
                      {label:'Closing / Endorsement Date', key:'endorsement_date',      ph:'', type:'date'},
                    ].map(f=>(
                      <div key={f.key}>
                        <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                        <input type={f.type||'number'} step="any" value={inp[f.key]} placeholder={f.ph}
                          onChange={e=>si(f.key,e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                      </div>
                    ))}
                  </div>
                  {inp.endorsement_date && (() => {
                    const days = Math.floor((Date.now()-new Date(inp.endorsement_date).getTime())/(1000*60*60*24));
                    const ok = days >= 210; const pmts = Math.floor(days/30);
                    return (
                      <div className={`mt-3 rounded-lg px-4 py-2.5 border text-sm flex items-center gap-3 ${ok?'bg-green-50 border-green-300':'bg-red-50 border-red-300'}`}>
                        <span className="text-lg">{ok?'✅':'❌'}</span>
                        <div>
                          <p className={`font-bold text-sm ${ok?'text-green-800':'text-red-800'}`}>210-Day Seasoning: {ok?'PASSED':'NOT MET'} — {days} days / {pmts} payments</p>
                          {!ok && <p className="text-xs text-gray-500">Need {210-days} more days.</p>}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Payment History */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                    Payment History
                    <span className="text-xs font-normal text-blue-500 ml-auto">Auto-filled from PDF upload</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[{label:'30-Day Lates — Last 6 Months',key:'lates_last_6'},{label:'30-Day Lates — Months 7-12',key:'lates_months_7_12'}].map(f=>(
                      <div key={f.key}>
                        <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                        <select value={inp[f.key]} onChange={e=>si(f.key,parseInt(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                          {[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {[
                    {label:'In Forbearance or Loss Mitigation',key:'in_forbearance'},
                    {label:'Borrower Being Removed from Loan', key:'borrower_removed'},
                    {label:'Title Holders Changed',            key:'title_changed'},
                  ].map(c=>(
                    <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                      <input type="checkbox" checked={inp[c.key]} onChange={e=>si(c.key,e.target.checked)} className="w-4 h-4 accent-red-600"/>
                      <span className="text-gray-700">{c.label}</span>
                    </label>
                  ))}
                </div>

                {/* Property Tax Calculator */}
                <div className="bg-white rounded-xl border-2 border-amber-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
                    <span className="text-xl">🏛️</span> Property Tax Calculator
                    {taxResult && <span className="ml-auto text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{fmt$(taxResult.monthlyTax)}/mo</span>}
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">Auto-calculates based on county millage rate and assessment ratio. Critical for accurate PITI and escrow.</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">State</label>
                      <select value={taxCalc.state} onChange={e=>setTaxCalc(p=>({...p,state:e.target.value}))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                        <option value="GA">Georgia</option><option value="AL">Alabama</option><option value="FL">Florida</option>
                        <option value="NC">North Carolina</option><option value="SC">South Carolina</option>
                        <option value="TN">Tennessee</option><option value="TX">Texas</option><option value="OTHER">Other State</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{taxCalc.state==='GA'?'GA County':'County / Area'}</label>
                      {taxCalc.state==='GA' ? (
                        <select value={taxCalc.county} onChange={e=>setTaxCalc(p=>({...p,county:e.target.value}))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                          <option value="">— Select County —</option>
                          {Object.keys(GA_COUNTIES).sort().map(c=>(<option key={c} value={c}>{c} ({GA_COUNTIES[c].millage} mills)</option>))}
                        </select>
                      ) : (
                        <input type="text" value={taxCalc.county} placeholder="County name"
                          onChange={e=>setTaxCalc(p=>({...p,county:e.target.value}))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                      )}
                    </div>
                    {taxCalc.state==='GA' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">City Millage (add if incorporated)</label>
                        <input type="number" step="0.01" value={taxCalc.city_millage} placeholder="e.g. 0 or 12.5"
                          onChange={e=>setTaxCalc(p=>({...p,city_millage:e.target.value}))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                        <p className="text-xs text-gray-400 mt-0.5">Add city mills if property is inside city limits</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Property Value (FMV)</label>
                      <label className="flex items-center gap-1 text-xs cursor-pointer mb-1">
                        <input type="checkbox" checked={taxCalc.use_scenario_value} onChange={e=>setTaxCalc(p=>({...p,use_scenario_value:e.target.checked}))} className="w-3.5 h-3.5 accent-amber-600"/>
                        <span className="text-gray-500">Use scenario value</span>
                      </label>
                      {!taxCalc.use_scenario_value && (
                        <input type="number" value={taxCalc.manual_fmv} placeholder="e.g. 195000"
                          onChange={e=>setTaxCalc(p=>({...p,manual_fmv:e.target.value}))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                      )}
                      {taxCalc.use_scenario_value && inp.estimated_property_value && (
                        <p className="text-xs text-gray-500">Using: {fmt$(parseFloat(inp.estimated_property_value))}</p>
                      )}
                    </div>
                  </div>
                  <button onClick={runTaxCalc} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all mb-3">
                    🏛️ Calculate Property Tax
                  </button>
                  {taxResult && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {label:'Fair Market Value',       val: fmt$(taxResult.fmv)},
                          {label:'Assessed Value (GA 40%)', val: taxResult.assessedValue ? fmt$(taxResult.assessedValue) : 'See note'},
                          {label:'Annual Property Tax',     val: fmt$(taxResult.annualTax)},
                          {label:'Monthly Escrow Needed',   val: fmt$(taxResult.monthlyTax), highlight:true},
                          {label:'Tax Due Date',            val: taxResult.dueDate},
                          {label:'Calculation Source',      val: taxResult.source},
                        ].map(item=>(
                          <div key={item.label} className={`rounded-lg p-2.5 ${item.highlight?'bg-amber-200 border border-amber-400 col-span-2':'bg-white border border-amber-200'}`}>
                            <div className="text-xs text-gray-500">{item.label}</div>
                            <div className={`font-bold ${item.highlight?'text-amber-900 text-lg':'text-gray-800'}`}>{item.val}</div>
                          </div>
                        ))}
                      </div>
                      {taxResult.note && <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2"><p className="text-xs text-blue-700">💡 {taxResult.note}</p></div>}
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <p className="text-xs text-red-700 font-semibold">⚠️ Always verify with county tax assessor before closing. Rates change annually.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* New Loan Params */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                    New Loan Parameters
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">New Loan Term</label>
                      <select value={inp.new_term_months} onChange={e=>si('new_term_months',e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="360">30 Years</option><option value="300">25 Years</option>
                        <option value="240">20 Years</option><option value="180">15 Years</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Occupancy</label>
                      <select value={inp.occupancy_current} onChange={e=>si('occupancy_current',e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="OWNER">Owner Occupied</option>
                        <option value="SECOND">Second Home</option>
                        <option value="INVESTMENT">Investment</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Est. Property Value ($)</label>
                      <input type="number" value={inp.estimated_property_value} onChange={e=>{si('estimated_property_value',e.target.value);}}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Est. Closing Costs ($)</label>
                      <input type="number" value={closingCostEst} onChange={e=>setClosingCostEst(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                      <p className="text-xs text-gray-400 mt-0.5">Used for cash-to-close optimizer</p>
                    </div>
                  </div>
                </div>

                <button onClick={run} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-base transition-all shadow-md">
                  🔍 Run Eligibility &amp; NTB Analysis
                </button>

                {/* Results tabs */}
                {eligibility && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex border-b border-gray-200 overflow-x-auto">
                      {[
                        {id:'eligibility', label:'🔍 Eligibility'},
                        {id:'mip',         label:'💰 MIP'},
                        {id:'ntb',         label:'📊 NTB'},
                        {id:'ctc',         label:'💵 Cash-to-Close'},
                        {id:'rate_shop',   label:'📈 Rate Shop'},
                        {id:'ntb_ws',      label:'📋 NTB Worksheet'},
                        {id:'uw_ws',       label:'🏦 UW Worksheet'},
                      ].map(t=>(
                        <button key={t.id} onClick={()=>setTab(t.id)}
                          className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all ${tab===t.id?'border-b-2 border-blue-600 text-blue-700 bg-blue-50':'text-gray-500 hover:text-gray-800'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="p-4">

                      {tab==='eligibility' && (
                        <div className="space-y-2">
                          {eligibility.rules.map(rule=>(
                            <div key={rule.id} className={`flex items-start gap-3 p-3 rounded-lg ${rule.status==='PASS'?'bg-green-50':rule.status==='FAIL'?'bg-red-50':'bg-yellow-50'}`}>
                              <span className="text-lg mt-0.5">{rule.status==='PASS'?'✅':rule.status==='FAIL'?'❌':'⚠️'}</span>
                              <div className="flex-1">
                                <div className={`font-semibold text-sm ${rule.status==='PASS'?'text-green-800':rule.status==='FAIL'?'text-red-800':'text-yellow-800'}`}>{rule.label}</div>
                                <div className="text-xs text-gray-600 mt-0.5">{rule.message}</div>
                              </div>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rule.status==='PASS'?'bg-green-200 text-green-800':rule.status==='FAIL'?'bg-red-200 text-red-800':'bg-yellow-200 text-yellow-800'}`}>{rule.id}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {tab==='mip' && (ntb&&ntb.length>0 ? (
                        <div className="space-y-4">
                          {ntb.map(r=>(
                            <div key={r.option_id} className="border border-gray-200 rounded-xl overflow-hidden">
                              <div className="bg-gray-50 px-4 py-2 font-semibold text-sm text-gray-700 border-b">{r.label} — {r.note_rate}% Rate</div>
                              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                  {l:'Months Since Endorse.',v:`${r.monthsElapsed} mo`},
                                  {l:`UFMIP Refund (${r.refundPct}%)`,v:fmt$(r.ufmipRefund)},
                                  {l:'New UFMIP (1.75%)',v:fmt$(r.newUFMIP)},
                                  {l:'Net UFMIP Cost',v:fmt$(r.netUFMIP),hi:true},
                                  {l:'Existing MIP/mo',v:`${fmt$(r.existingMIP)}/mo`},
                                  {l:'New MIP/mo',v:`${fmt$(r.newMIP)}/mo`},
                                  {l:'MIP Savings/mo',v:`${fmt$(r.existingMIP-r.newMIP)}/mo`},
                                  {l:'Breakeven',v:r.breakevenMonths<999?`${r.breakevenMonths} mo`:'N/A'},
                                ].map(item=>(
                                  <div key={item.l} className={`rounded-lg p-2.5 text-center ${item.hi?'bg-blue-50 border border-blue-200':'bg-gray-50'}`}>
                                    <div className="font-bold text-gray-800 text-sm">{item.v}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{item.l}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-gray-400 text-sm text-center py-6">Enter pricing options and run analysis.</p>)}

                      {tab==='ntb' && (ntb&&ntb.length>0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="bg-gray-50 border-b border-gray-200">
                              {['Option','Rate','Exist. Comb.','New Comb.','Reduction','NTB','New P&I','New Total','Saves/mo','Badge'].map(h=>(
                                <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {ntb.map(r=>{ const badge=getBadge(r,ntb); return (
                                <tr key={r.option_id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="px-2 py-2 font-bold">{r.label}</td>
                                  <td className="px-2 py-2">{fmtP(r.note_rate)}</td>
                                  <td className="px-2 py-2">{fmtP(r.existingCombined)}</td>
                                  <td className="px-2 py-2">{fmtP(r.newCombined)}</td>
                                  <td className="px-2 py-2 font-semibold text-blue-700">{fmtP(r.combinedReduction)}</td>
                                  <td className="px-2 py-2"><span className={r.ntbPass?'text-green-600 font-bold':'text-red-600 font-bold'}>{r.ntbPass?'PASS ✓':'FAIL ✗'}</span></td>
                                  <td className="px-2 py-2">{fmt$(r.newPI)}</td>
                                  <td className="px-2 py-2">{fmt$(r.newTotal)}</td>
                                  <td className="px-2 py-2 font-semibold text-green-700">{fmt$(r.monthlySavings)}</td>
                                  <td className="px-2 py-2"><span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span></td>
                                </tr>
                              );})}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-gray-400 text-sm text-center py-6">Enter pricing options and run analysis.</p>)}

                      {tab==='ctc' && (
                        <div>
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                            <p className="font-bold text-blue-800 text-sm mb-1">💵 Max Cash-to-Close &amp; LO Income Optimizer</p>
                            <p className="text-xs text-blue-700">Higher rate = more lender credit = lower borrower cash-to-close. This optimizer shows the tradeoff between borrower cost and your net income.</p>
                          </div>
                          {maxCTCResults && maxCTCResults.length > 0 ? (
                            <div className="space-y-3">
                              {maxCTCResults.map((r,i) => (
                                <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                                    <span className="font-bold text-sm text-gray-700">{r.label} — {r.rate}%</span>
                                    <span className="text-xs text-green-600 font-bold">Saves {fmt$(r.monthlySavings)}/mo for borrower</span>
                                  </div>
                                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <div className="rounded-lg p-3 bg-gray-50 border border-gray-200 text-center">
                                      <div className="text-xs text-gray-500">Price</div>
                                      <div className="font-bold text-gray-800">{r.price.toFixed(3)}</div>
                                    </div>
                                    <div className="rounded-lg p-3 bg-green-50 border border-green-200 text-center">
                                      <div className="text-xs text-gray-500">Lender Credit</div>
                                      <div className="font-bold text-green-700">{fmt$(r.lenderCredit)}</div>
                                    </div>
                                    <div className="rounded-lg p-3 bg-blue-50 border border-blue-200 text-center">
                                      <div className="text-xs text-gray-500">Est. Closing Costs</div>
                                      <div className="font-bold text-blue-700">{fmt$(parseFloat(closingCostEst))}</div>
                                    </div>
                                    <div className={`rounded-lg p-3 border-2 text-center col-span-2 md:col-span-1 ${r.netCC<=0?'bg-green-100 border-green-400':'bg-amber-50 border-amber-300'}`}>
                                      <div className="text-xs text-gray-500">Max Borrower Cash-to-Close</div>
                                      <div className={`font-black text-lg ${r.netCC<=0?'text-green-700':'text-amber-700'}`}>{r.netCC<=0?'$0 — Lender Credit Covers All':fmt$(r.netCC)}</div>
                                      <div className="text-xs text-gray-400 mt-0.5">{r.netCC<=0?'No cash needed — zero cost refi!':'Borrower brings this to closing'}</div>
                                    </div>
                                    <div className="rounded-lg p-3 bg-emerald-50 border border-emerald-200 text-center">
                                      <div className="text-xs text-gray-500">Your Net (LPC)</div>
                                      <div className="font-bold text-emerald-700 text-lg">{fmt$(r.lpcNet)}</div>
                                    </div>
                                    <div className="rounded-lg p-3 bg-indigo-50 border border-indigo-200 text-center">
                                      <div className="text-xs text-gray-500">Your Net (BPC)</div>
                                      <div className="font-bold text-indigo-700 text-lg">{fmt$(r.bpcNet)}</div>
                                    </div>
                                  </div>
                                  <div className={`px-4 py-2.5 border-t text-xs font-semibold ${r.lpcNet>=r.bpcNet?'bg-emerald-50 text-emerald-800':'bg-indigo-50 text-indigo-800'}`}>
                                    💡 {r.lpcNet>=r.bpcNet?'LPC':'BPC'} puts {fmt$(Math.abs(r.lpcNet-r.bpcNet))} more in your pocket on this option.
                                    {r.netCC<=0?' Zero cost to borrower makes this easy to sell.':' Consider offering a higher rate to reduce borrower cash-to-close.'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-gray-400 text-sm text-center py-6">Run eligibility analysis with at least one passing NTB option to see optimizer.</p>}
                        </div>
                      )}

                      {tab==='rate_shop' && (
                        <div>
                          {!inp.existing_note_rate || !parseFloat(inp.existing_note_rate) ? (
                            <p className="text-gray-400 text-sm text-center py-6">Enter existing note rate in Section 1 to see rate shopping analysis.</p>
                          ) : (() => {
                            const existingRate     = parseFloat(inp.existing_note_rate);
                            const existingMIPFac   = parseFloat(inp.existing_mip_factor || 0.55);
                            const existingCombined = existingRate + existingMIPFac;
                            const maxNewRate       = parseFloat((existingCombined - 0.50 - 0.55).toFixed(3));
                            const upb              = parseFloat(inp.existing_upb || 0);
                            const existingPI       = parseFloat(inp.existing_monthly_pi || 0);
                            const existingMIPmo    = parseFloat(inp.existing_monthly_mip || 0);
                            const termMonths       = parseInt(inp.new_term_months || 360);
                            const rates = [];
                            for (let r = maxNewRate + 0.125; r >= maxNewRate - 1.25; r -= 0.125) {
                              const rate       = parseFloat(r.toFixed(3));
                              const newComb    = parseFloat((rate + 0.55).toFixed(3));
                              const reduction  = parseFloat((existingCombined - newComb).toFixed(3));
                              const newPI      = upb ? computeMonthlyPI(upb, rate, termMonths) : 0;
                              const newMIPmo   = upb ? (upb * 0.55 / 100 / 12) : 0;
                              const savings    = (existingPI + existingMIPmo) - (newPI + newMIPmo);
                              const passes     = reduction >= 0.50;
                              rates.push({ rate, newComb, reduction, newPI, newMIPmo, savings, passes });
                            }
                            return (
                              <div>
                                <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-center">
                                    <div className="text-gray-500">Existing Combined</div>
                                    <div className="font-black text-gray-800 text-lg">{existingCombined.toFixed(3)}%</div>
                                    <div className="text-gray-400">{existingRate}% + {existingMIPFac}% MIP</div>
                                  </div>
                                  <div className="bg-red-50 rounded-xl p-3 border border-red-200 text-center">
                                    <div className="text-gray-500">NTB Threshold</div>
                                    <div className="font-black text-red-700 text-lg">−0.500%</div>
                                    <div className="text-gray-400">Minimum required</div>
                                  </div>
                                  <div className="bg-green-50 rounded-xl p-3 border border-green-300 text-center">
                                    <div className="text-gray-500">Max Rate to Pass</div>
                                    <div className="font-black text-green-700 text-lg">{maxNewRate.toFixed(3)}%</div>
                                    <div className="text-gray-400">At or below passes NTB</div>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                                      {['New Rate','New Comb.','Reduction','New P&I','New MIP','Saves/mo','NTB'].map(h=>(
                                        <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">{h}</th>
                                      ))}
                                    </tr></thead>
                                    <tbody>
                                      {rates.map((r,idx)=>(
                                        <tr key={idx} className={`border-b border-gray-100 ${r.rate === maxNewRate?'bg-yellow-50 font-semibold':''}`}>
                                          <td className="px-2 py-2 font-bold text-blue-700">{r.rate.toFixed(3)}%
                                            {r.rate===maxNewRate && <span className="ml-1 text-yellow-600 text-xs">← threshold</span>}
                                          </td>
                                          <td className="px-2 py-2">{r.newComb.toFixed(3)}%</td>
                                          <td className={`px-2 py-2 font-semibold ${r.reduction>=0.75?'text-green-700':r.reduction>=0.50?'text-blue-700':'text-red-600'}`}>{r.reduction.toFixed(3)}%</td>
                                          <td className="px-2 py-2">{upb?fmt$(r.newPI):'—'}</td>
                                          <td className="px-2 py-2">{upb?fmt$(r.newMIPmo):'—'}</td>
                                          <td className={`px-2 py-2 font-semibold ${r.savings>0?'text-green-700':'text-red-600'}`}>{upb?fmt$(r.savings):'—'}</td>
                                          <td className="px-2 py-2">
                                            <span className={`font-bold px-1.5 py-0.5 rounded-full ${r.passes?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{r.passes?'PASS ✓':'FAIL ✗'}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <p className="text-xs text-gray-400 mt-2">Rate ladder in 0.125% increments. Yellow row = NTB threshold. Enter loan balance in Section 1 to see payment columns.</p>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {tab==='ntb_ws' && (
                        <div>
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                            <p className="font-bold text-blue-800 text-sm">📋 NTB Worksheet — HUD 4000.1 Required Documentation</p>
                            <p className="text-xs text-blue-700 mt-1">This worksheet documents the Net Tangible Benefit calculation. Must be present in every FHA Streamline file.</p>
                          </div>
                          {ntb && ntb.length > 0 ? (
                            <>
                              {ntb.map(r=>(
                                <div key={r.option_id} className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                                  <div className={`px-4 py-2.5 font-bold text-sm border-b flex items-center justify-between ${r.ntbPass?'bg-green-50 text-green-800':'bg-red-50 text-red-800'}`}>
                                    <span>{r.label} — {r.note_rate}% Rate</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${r.ntbPass?'bg-green-200 text-green-800':'bg-red-200 text-red-800'}`}>{r.ntbPass?'✓ MEETS NTB':'✗ FAILS NTB'}</span>
                                  </div>
                                  <div className="p-4">
                                    <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
                                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                        <div className="text-gray-500 mb-1">Existing Combined</div>
                                        <div className="font-black text-gray-800 text-base">{r.existingCombined}%</div>
                                        <div className="text-gray-400">{inp.existing_note_rate}% + {inp.existing_mip_factor}%</div>
                                      </div>
                                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                        <div className="text-gray-500 mb-1">New Combined</div>
                                        <div className="font-black text-blue-800 text-base">{r.newCombined}%</div>
                                        <div className="text-gray-400">{r.note_rate}% + 0.55%</div>
                                      </div>
                                      <div className={`rounded-lg p-3 border ${r.ntbPass?'bg-green-50 border-green-300':'bg-red-50 border-red-300'}`}>
                                        <div className="text-gray-500 mb-1">Reduction (need ≥ 0.50%)</div>
                                        <div className={`font-black text-base ${r.ntbPass?'text-green-700':'text-red-700'}`}>{r.combinedReduction}%</div>
                                        <div className={`text-xs ${r.ntbPass?'text-green-600':'text-red-600'}`}>{r.ntbPass?'✓ Passes':'✗ Below threshold'}</div>
                                      </div>
                                    </div>
                                    <table className="w-full text-xs">
                                      <thead><tr className="bg-gray-50 border-b">
                                        <th className="text-left px-2 py-1.5 text-gray-600">Item</th>
                                        <th className="text-right px-2 py-1.5 text-gray-600">Existing</th>
                                        <th className="text-right px-2 py-1.5 text-gray-600">Proposed</th>
                                        <th className="text-right px-2 py-1.5 text-gray-600">Change</th>
                                      </tr></thead>
                                      <tbody>
                                        {[
                                          ['P&I Payment',      fmt$(r.existingPI),        fmt$(r.newPI),       fmt$(r.newPI-r.existingPI)],
                                          ['MIP Payment',      fmt$(r.existingMIP),       fmt$(r.newMIP),      fmt$(r.newMIP-r.existingMIP)],
                                          ['Total P&I+MIP',    fmt$(r.existingTotal),     fmt$(r.newTotal),    fmt$(r.newTotal-r.existingTotal)],
                                          ['Monthly Savings',  '—',                       '—',                 fmt$(r.monthlySavings)],
                                          ['UFMIP Refund',     '—',                       '—',                 fmt$(r.ufmipRefund)],
                                          ['New UFMIP (1.75%)','—',                       fmt$(r.newUFMIP),    '—'],
                                          ['Net UFMIP Cost',   '—',                       '—',                 fmt$(r.netUFMIP)],
                                          ['Breakeven',        '—',                       '—',                 r.breakevenMonths<999?`${r.breakevenMonths} months`:'N/A'],
                                        ].map(([label,existing,proposed,change])=>(
                                          <tr key={label} className="border-b border-gray-100">
                                            <td className="px-2 py-1.5 text-gray-700">{label}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-600">{existing}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-600">{proposed}</td>
                                            <td className={`px-2 py-1.5 text-right font-semibold ${label==='Monthly Savings'?'text-green-700':label==='Net UFMIP Cost'?'text-orange-700':'text-gray-800'}`}>{change}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                              <button onClick={()=>{const w=window.open('','_blank');w.document.write(generateNTBWorksheetHTML());w.document.close();}}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all">
                                🖨️ Print / Save NTB Worksheet as PDF
                              </button>
                            </>
                          ) : <p className="text-gray-400 text-sm text-center py-6">Run eligibility & NTB analysis first.</p>}
                        </div>
                      )}

                      {tab==='uw_ws' && (
                        <div>
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                            <p className="font-bold text-gray-800 text-sm">🏦 Underwriter Summary Worksheet</p>
                            <p className="text-xs text-gray-600 mt-1">Complete file documentation showing all calculations, sources, and determinations for underwriter review.</p>
                          </div>
                          {eligibility ? (
                            <>
                              <button onClick={()=>{const w=window.open('','_blank');w.document.write(generateUWWorksheetHTML());w.document.close();}}
                                className="w-full bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-sm transition-all mb-4">
                                🖨️ Print / Save Full UW Worksheet as PDF
                              </button>
                              <div className="space-y-3 text-xs">
                                <div className="bg-white border border-gray-200 rounded-xl p-4">
                                  <h4 className="font-bold text-gray-700 mb-2 text-sm">Eligibility Quick View</h4>
                                  <div className="space-y-1">
                                    {eligibility.rules.map(r=>(
                                      <div key={r.id} className="flex items-center gap-2">
                                        <span className={r.status==='PASS'?'text-green-600':r.status==='FAIL'?'text-red-600':'text-yellow-600'}>{r.status==='PASS'?'✓':r.status==='FAIL'?'✗':'⚠'}</span>
                                        <span className="font-semibold text-gray-500 w-10">{r.id}</span>
                                        <span className="text-gray-700 flex-1">{r.label}</span>
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${r.status==='PASS'?'bg-green-100 text-green-700':r.status==='FAIL'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>{r.status}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                                  <p className="text-xs text-blue-800 font-semibold">Click "Print / Save Full UW Worksheet" above for complete PDF with all calculations, UFMIP refund, property tax, LO comp disclosure, and signature blocks.</p>
                                </div>
                              </div>
                            </>
                          ) : <p className="text-gray-400 text-sm text-center py-6">Run eligibility analysis first to generate UW worksheet.</p>}
                        </div>
                      )}

                    </div>

                    <div className="border-t border-gray-200 p-4 flex items-center justify-between bg-gray-50 flex-wrap gap-3">
                      {scenarioId && (
                        <DecisionRecordBanner recordId={savedRecordId} moduleName="FHA Streamline Intelligence™" onSave={handleSaveToRecord} saving={recordSaving}/>
                      )}
                      <div className="flex gap-3 ml-auto">
                        <button onClick={save} disabled={saving||!eligibility}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-all">
                          {saving?'Saving…':'💾 Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT col */}
              <div className="xl:col-span-4 space-y-4">

                {/* Pricing Options */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</span>
                    Pricing Options (up to 2)
                  </h3>
                  {pricing.map((opt,idx)=>(
                    <div key={idx} className={`rounded-xl border-2 p-4 mb-3 ${idx===0?'border-blue-200 bg-blue-50':'border-gray-200 bg-gray-50'}`}>
                      <div className="text-sm font-bold text-gray-700 mb-3">Option {String.fromCharCode(65+idx)}</div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {label:'New Note Rate (%)',  key:'note_rate'},
                          {label:'Price (e.g. 101.25)',key:'price'},
                          {label:'Lender Credit ($)',  key:'lender_credit'},
                          {label:'Origination ($)',    key:'origination'},
                        ].map(f=>(
                          <div key={f.key}>
                            <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                            <input type="number" step="any" value={opt[f.key]} onChange={e=>spr(idx,f.key,e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"/>
                          </div>
                        ))}
                        {/* Lender credit validation */}
                        {opt.lender_credit && parseFloat(opt.lender_credit) > (parseFloat(inp.existing_upb||0) * 0.03) && parseFloat(inp.existing_upb||0) > 0 && (
                          <div className="col-span-2 bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-1.5">
                            <p className="text-xs text-yellow-700">⚠️ Lender credit exceeds 3% of loan — verify pricing is correct</p>
                          </div>
                        )}
                        {/* Suggest zero-cost price */}
                        {opt.note_rate && parseFloat(closingCostEst) > 0 && (() => {
                          const neededCredit = parseFloat(closingCostEst) || 3500;
                          const upb = parseFloat(inp.existing_upb || selected?.loanAmount || 0);
                          if (!upb) return null;
                          const neededCreditPct = neededCredit / upb * 100;
                          const suggestedPrice = (100 + neededCreditPct).toFixed(3);
                          const currentCredit = parseFloat(opt.lender_credit || 0);
                          const shortfall = neededCredit - currentCredit;
                          if (shortfall <= 50) return null;
                          return (
                            <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              <p className="text-xs text-amber-700">💡 For zero borrower cost: price needs to be <strong>{suggestedPrice}</strong> (need {fmt$(neededCredit)} lender credit — currently {fmt$(shortfall)} short)</p>
                              <button onClick={() => spr(idx, 'price', suggestedPrice)} className="text-xs font-bold text-amber-800 hover:text-amber-900 underline mt-0.5">Apply suggested price →</button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* NTB Quick Summary */}
                {ntb && ntb.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-bold text-gray-800 mb-3 text-sm">NTB Quick Summary</h3>
                    {ntb.map(r => {
                      const badge = getBadge(r,ntb);
                      return (
                        <div key={r.option_id} className="flex items-center justify-between py-2 border-b last:border-0 border-gray-100">
                          <div>
                            <span className="font-semibold text-sm">{r.label}</span>
                            <span className="text-gray-500 text-xs ml-2">{r.note_rate}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">{r.ntbPass?`Saves ${fmt$(r.monthlySavings)}/mo`:'Fails NTB'}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* LO Commission Calculator */}
                <div className="bg-white rounded-xl border-2 border-emerald-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
                    <span className="text-xl">💰</span> LO Commission Calculator
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">LPC vs BPC — gross and net on this file. Updates live as you adjust comp settings.</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      {label:'LO Split %',       key:'lo_split',         suffix:'%',   color:'gray'},
                      {label:'Processing Fee',    key:'processing_fee',   prefix:'$',  color:'gray'},
                      {label:'LPC Rate %',        key:'lpc_rate',         suffix:'%',   color:'emerald', tip:'Lender pays you this % of loan'},
                      {label:'BPC Points',        key:'bpc_points',       suffix:'pts', color:'blue',    tip:'Borrower pays origination points'},
                      {label:'Admin Fee',         key:'admin_fee',        prefix:'$',  color:'gray'},
                      {label:'Other Deductions',  key:'other_deductions', prefix:'$',  color:'gray'},
                    ].map(f=>(
                      <div key={f.key}>
                        <label className={`block text-xs font-semibold mb-1 ${f.color==='emerald'?'text-emerald-700':f.color==='blue'?'text-blue-700':'text-gray-500'}`}>
                          {f.label}{f.tip&&<span className="text-gray-400 font-normal ml-1">({f.tip})</span>}
                        </label>
                        <div className="relative">
                          {f.prefix&&<span className="absolute left-3 top-2.5 text-gray-400 text-xs">{f.prefix}</span>}
                          <input type="number" step="0.01" value={comp[f.key]} onChange={e=>sc(f.key,parseFloat(e.target.value)||0)}
                            className={`w-full border rounded-lg py-2 text-sm focus:outline-none ${f.color==='emerald'?'border-emerald-300 bg-emerald-50 focus:ring-2 focus:ring-emerald-400':f.color==='blue'?'border-blue-300 bg-blue-50 focus:ring-2 focus:ring-blue-400':'border-gray-300 focus:ring-2 focus:ring-gray-300'} ${f.prefix?'pl-6 pr-3':'px-3'} ${f.suffix?'pr-8':'pr-3'}`}/>
                          {f.suffix&&<span className="absolute right-3 top-2.5 text-gray-400 text-xs">{f.suffix}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {commissionResult ? (
                    <div className="space-y-3">
                      {commissionResult.lpc && (
                        <div className={`rounded-xl border-2 p-4 ${commissionResult.recommendation==='lpc'?'border-emerald-500 bg-emerald-50':'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-bold text-emerald-800 text-sm">Lender Paid (LPC)</p>
                            {commissionResult.recommendation==='lpc'&&<span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">⭐ Better for You</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              {l:'Gross Commission',              v:fmt$(commissionResult.lpc.gross),  sub:`${comp.lpc_rate}% of loan`},
                              {l:`After ${comp.lo_split}% Split`, v:fmt$(commissionResult.lpc.split),  sub:'Your share'},
                              {l:'Deductions',                    v:`- ${fmt$(commissionResult.lpc.deductions)}`, sub:'Fees', red:true},
                              {l:'NET TO YOU',                    v:fmt$(commissionResult.lpc.net),    sub:`${commissionResult.lpc.effective_rate.toFixed(3)}% eff.`, big:true, green:commissionResult.recommendation==='lpc'},
                            ].map(item=>(
                              <div key={item.l} className={`rounded-lg p-2.5 border text-center ${item.big&&item.green?'bg-emerald-100 border-emerald-400':item.big?'bg-white border-gray-300':'bg-white border-emerald-200'}`}>
                                <div className="text-gray-500">{item.l}</div>
                                <div className={`font-black ${item.big?'text-lg':'text-sm'} ${item.red?'text-red-600':item.big&&item.green?'text-emerald-700':'text-gray-800'}`}>{item.v}</div>
                                <div className="text-gray-400 text-xs">{item.sub}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {commissionResult.bpc && (
                        <div className={`rounded-xl border-2 p-4 ${commissionResult.recommendation==='bpc'?'border-blue-500 bg-blue-50':'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-bold text-blue-800 text-sm">Borrower Paid (BPC)</p>
                            {commissionResult.recommendation==='bpc'&&<span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">⭐ Better for You</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              {l:'Gross Commission',              v:fmt$(commissionResult.bpc.gross),  sub:`${comp.bpc_points} pt(s) origination`},
                              {l:`After ${comp.lo_split}% Split`, v:fmt$(commissionResult.bpc.split),  sub:'Your share'},
                              {l:'Deductions',                    v:`- ${fmt$(commissionResult.bpc.deductions)}`, sub:'Fees', red:true},
                              {l:'NET TO YOU',                    v:fmt$(commissionResult.bpc.net),    sub:`${commissionResult.bpc.effective_rate.toFixed(3)}% eff.`, big:true, blue:commissionResult.recommendation==='bpc'},
                            ].map(item=>(
                              <div key={item.l} className={`rounded-lg p-2.5 border text-center ${item.big&&item.blue?'bg-blue-100 border-blue-400':item.big?'bg-white border-gray-300':'bg-white border-blue-200'}`}>
                                <div className="text-gray-500">{item.l}</div>
                                <div className={`font-black ${item.big?'text-lg':'text-sm'} ${item.red?'text-red-600':item.big&&item.blue?'text-blue-700':'text-gray-800'}`}>{item.v}</div>
                                <div className="text-gray-400 text-xs">{item.sub}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {commissionResult.recommendation && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                          <p className="font-bold">{commissionResult.recommendation==='lpc'?'LPC':'BPC'} puts {fmt$(commissionResult.difference)} more in your pocket.</p>
                          <p className="mt-1 text-amber-700">RESPA: you cannot receive both LPC and BPC on the same file.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                      Select a scenario with a loan amount to see commission.
                    </div>
                  )}
                </div>

                {/* FHA Rules Reference */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="font-semibold text-yellow-800 text-sm mb-2">📐 FHA Streamline Quick Rules</div>
                  <div className="text-xs text-yellow-700 space-y-1">
                    <div>• <strong>NTB:</strong> Combined rate reduction ≥ 0.50%</div>
                    <div>• <strong>Seasoning:</strong> 210 days from closing + 6 payments</div>
                    <div>• <strong>Payment history:</strong> 0x30 in last 12 months</div>
                    <div>• <strong>UFMIP refund:</strong> Applied to new UFMIP (36-month window)</div>
                    <div>• <strong>Max cash back:</strong> $500 at closing</div>
                    <div>• <strong>No appraisal</strong> required</div>
                    <div>• <strong>GA Assessment:</strong> 40% of FMV × millage</div>
                    <div>• <strong>LPC vs BPC:</strong> Cannot do both on same file</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <CanonicalSequenceBar currentModuleKey="FHA_STREAMLINE" scenarioId={scenarioId} recordId={savedRecordId} />
    </div>
  );
}
