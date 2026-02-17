import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

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

function runEligibilityRules(inputs) {
  const results = [];
  let finalDecision = 'ELIGIBLE';

  const check = (id, label, pass, passMsg, failMsg, type = 'HARD') => {
    const status = pass ? 'PASS' : (type === 'WARN' ? 'WARN' : 'FAIL');
    results.push({ id, label, status, message: pass ? passMsg : failMsg });
    if (!pass) {
      if (type === 'HARD' && finalDecision !== 'INELIGIBLE') finalDecision = 'INELIGIBLE';
      if (type === 'WARN' && finalDecision === 'ELIGIBLE') finalDecision = 'NEEDS_INFO';
    }
  };

  check('R001','FHA Insured Loan', inputs.is_fha_insured,
    'Confirmed FHA-insured.', 'Must be FHA-insured for streamline.');
  check('R002','Payment Status', !inputs.is_delinquent,
    'Loan is current.', 'Loan is delinquent — not eligible.');
  check('R003','Lates (Last 6 Months)', inputs.lates_last_6 === 0,
    'No late payments in last 6 months.', `${inputs.lates_last_6} late(s) — must be 0.`);
  check('R004','Lates (Months 7-12)', inputs.lates_months_7_12 <= 1,
    'Payment history months 7-12 acceptable.', `${inputs.lates_months_7_12} lates — max 1 allowed.`, 'WARN');
  check('R005','Occupancy', inputs.occupancy_current === 'OWNER',
    'Owner-occupied — streamline eligible.', 'Non-owner occupied requires manual review.', 'WARN');
  check('R006','Forbearance / Loss Mitigation', !inputs.in_forbearance,
    'Not in forbearance.', 'In forbearance — not eligible.');
  check('R007','Borrower / Title Changes', !inputs.borrower_removed && !inputs.title_changed,
    'No borrower or title changes.', 'Changes require credit qualifying streamline.', 'WARN');

  return { rules: results, finalDecision };
}

function computeNTB(inputs, options) {
  return options.map((opt, idx) => {
    const existingRate = parseFloat(inputs.existing_note_rate || 0);
    const existingMIPFactor = parseFloat(inputs.existing_mip_factor || 0.55);
    const newRate = parseFloat(opt.note_rate || 0);
    const existingCombined = existingRate + existingMIPFactor;
    const newCombined = newRate + FHA_RULES.ANNUAL_MIP_FACTOR;
    const combinedReduction = existingCombined - newCombined;
    const ntbPass = combinedReduction >= FHA_RULES.NTB_COMBINED_RATE_REDUCTION;

    const upb = parseFloat(inputs.existing_upb || 0);
    const existingPI = parseFloat(inputs.existing_monthly_pi || 0);
    const existingMIP = parseFloat(inputs.existing_monthly_mip || 0);
    const newPI = computeMonthlyPI(upb, newRate, parseInt(inputs.new_term_months || 360));
    const newMIP = (upb * FHA_RULES.ANNUAL_MIP_FACTOR) / 100 / 12;
    const existingTotal = existingPI + existingMIP;
    const newTotal = newPI + newMIP;
    const monthlySavings = existingTotal - newTotal;

    const endorsementDate = inputs.endorsement_date ? new Date(inputs.endorsement_date) : null;
    const monthsElapsed = endorsementDate
      ? Math.max(0, Math.floor((Date.now() - endorsementDate.getTime()) / (1000*60*60*24*30)))
      : 0;
    const refundPct = UFMIP_REFUND(monthsElapsed);
    const origUFMIP = parseFloat(inputs.original_ufmip || 0);
    const ufmipRefund = origUFMIP * refundPct;
    const newUFMIP = upb * FHA_RULES.NEW_UFMIP_RATE;
    const netUFMIP = newUFMIP - ufmipRefund;
    const breakevenMonths = monthlySavings > 0 ? Math.ceil(netUFMIP / monthlySavings) : 999;

    return {
      option_id: idx+1, label: `Option ${String.fromCharCode(65+idx)}`,
      note_rate: newRate, price: opt.price,
      existingCombined: existingCombined.toFixed(3),
      newCombined: newCombined.toFixed(3),
      combinedReduction: combinedReduction.toFixed(3),
      ntbPass, existingPI, existingMIP, existingTotal,
      newPI, newMIP, newTotal, monthlySavings,
      ufmipRefund, newUFMIP, netUFMIP, monthsElapsed,
      refundPct: (refundPct*100).toFixed(1), breakevenMonths,
    };
  });
}

const DECISION_STYLE = {
  ELIGIBLE:                { bg:'bg-green-50', border:'border-green-400', text:'text-green-800', icon:'✅', label:'ELIGIBLE — Ready to Proceed' },
  INELIGIBLE:              { bg:'bg-red-50',   border:'border-red-400',   text:'text-red-800',  icon:'❌', label:'INELIGIBLE — Does Not Qualify' },
  NEEDS_INFO:              { bg:'bg-yellow-50',border:'border-yellow-400',text:'text-yellow-800',icon:'⚠️',label:'NEEDS INFO — Manual Review Required' },
  INELIGIBLE_OR_NEEDS_INFO:{ bg:'bg-orange-50',border:'border-orange-400',text:'text-orange-800',icon:'🔍',label:'REVIEW — Issues Found' },
};

const fmt  = n => isNaN(n)||n===''||n===null ? '—' : Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtP = n => isNaN(n)||n===''||n===null ? '—' : Number(n).toFixed(3)+'%';

export default function FHAStreamline() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [tab, setTab]             = useState('eligibility');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [ntb, setNtb]             = useState(null);

  const [inp, setInp] = useState({
    is_fha_insured:true, existing_case_number:'', endorsement_date:'',
    occupancy_current:'OWNER', is_delinquent:false,
    lates_last_6:0, lates_months_7_12:0, in_forbearance:false,
    borrower_removed:false, title_changed:false,
    existing_upb:'', existing_note_rate:'', existing_mip_factor:'0.55',
    existing_monthly_pi:'', existing_monthly_mip:'', original_ufmip:'',
    new_term_months:'360', new_amort_type:'FIXED', estimated_property_value:'',
  });

  const [pricing, setPricing] = useState([
    {note_rate:'',price:'',lender_credit:'',origination:''},
    {note_rate:'',price:'',lender_credit:'',origination:''},
  ]);

  useEffect(()=>{
    getDocs(collection(db,'scenarios')).then(snap=>{
      setScenarios(snap.docs.map(d=>({id:d.id,...d.data()})));
    }).catch(console.error);
  },[]);

  const pick = (s) => {
    setSelected(s);
    setInp(p=>({...p,
      existing_upb: s.loan_amount||'',
      existing_note_rate: s.interest_rate||'',
      estimated_property_value: s.property_value||'',
    }));
    setEligibility(null); setNtb(null); setSaved(false);
  };

  const si = (k,v) => setInp(p=>({...p,[k]:v}));
  const sp = (i,k,v) => setPricing(p=>p.map((o,j)=>j===i?{...o,[k]:v}:o));

  const run = () => {
    const el = runEligibilityRules(inp);
    const filled = pricing.filter(o=>o.note_rate&&o.price);
    setEligibility(el);
    setNtb(filled.length>0 ? computeNTB(inp,filled) : []);
    setTab('eligibility'); setSaved(false);
  };

  const save = async () => {
    if(!selected||!eligibility) return;
    setSaving(true);
    try {
      await updateDoc(doc(db,'scenarios',selected.id),{
        fha_streamline_analysis:{
          completed_at:new Date().toISOString(),
          final_decision:eligibility.finalDecision,
          rules:eligibility.rules,
          ntb_results:ntb,
          inputs:inp,
        }
      });
      setSaved(true);
      alert('FHA Streamline analysis saved!');
    } catch(e){ alert('Error: '+e.message); }
    finally{ setSaving(false); }
  };

  const getBadge = (r,all) => {
    if(!r.ntbPass) return {label:'Does Not Meet NTB',color:'bg-red-100 text-red-700'};
    const passing = all.filter(x=>x.ntbPass);
    const bestSave = Math.max(...passing.map(x=>x.monthlySavings));
    const bestBE   = Math.min(...passing.map(x=>x.breakevenMonths));
    if(r.monthlySavings===bestSave) return {label:'⭐ Best Overall',color:'bg-blue-600 text-white'};
    if(r.breakevenMonths===bestBE)  return {label:'⚡ Fastest Breakeven',color:'bg-green-600 text-white'};
    return {label:'✓ Meets NTB',color:'bg-gray-100 text-gray-700'};
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 text-white px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={()=>navigate('/')} className="text-blue-200 text-sm mb-1 hover:text-white block">← Back to Dashboard</button>
            <div className="flex items-center gap-3">
              <span className="text-3xl">📋</span>
              <div>
                <h1 className="text-xl font-bold">FHA Streamline Intelligence™</h1>
                <p className="text-blue-100 text-sm">Eligibility • NTB Analysis • MIP • Borrower Disclosure</p>
              </div>
            </div>
          </div>
          {eligibility && (
            <div className={`rounded-xl px-4 py-2 border-2 ${DECISION_STYLE[eligibility.finalDecision].border} ${DECISION_STYLE[eligibility.finalDecision].bg}`}>
              <div className={`font-bold text-sm ${DECISION_STYLE[eligibility.finalDecision].text}`}>
                {DECISION_STYLE[eligibility.finalDecision].icon} {DECISION_STYLE[eligibility.finalDecision].label}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Scenario Selector */}
        {!selected ? (
          <div className="bg-white rounded-xl border-2 border-blue-200 p-6">
            <h2 className="font-bold text-gray-800 mb-1">Select a Scenario</h2>
            <p className="text-gray-500 text-sm mb-4">Choose an FHA loan scenario to analyze streamline eligibility</p>
            <div className="space-y-2">
              {scenarios.map(s=>(
                <button key={s.id} onClick={()=>pick(s)}
                  className="w-full text-left bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all">
                  <div className="font-semibold text-gray-800">{s.scenario_name||`${s.borrower_first_name||''} ${s.borrower_last_name||''}`}</div>
                  <div className="text-sm text-gray-500">${Number(s.loan_amount||0).toLocaleString()} • LTV: {s.ltv||'—'}% • Rate: {s.interest_rate||'—'}%</div>
                </button>
              ))}
              {scenarios.length===0&&<p className="text-gray-400 text-sm text-center py-6">No scenarios found. Create one first.</p>}
            </div>
          </div>
        ):(
          <>
            {/* Working Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-green-600 font-bold">✓ Working on:</span>
                <span className="font-semibold text-gray-800 ml-2">
                  {selected.scenario_name||`${selected.borrower_first_name||''} ${selected.borrower_last_name||''}`}
                </span>
                <span className="text-gray-500 text-sm ml-3">${Number(selected.loan_amount||0).toLocaleString()} loan • Rate: {selected.interest_rate||'—'}%</span>
              </div>
              <button onClick={()=>{setSelected(null);setEligibility(null);setNtb(null);}} className="text-blue-600 text-sm hover:underline">Change Scenario</button>
            </div>

            {/* 2-column input area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* LEFT */}
              <div className="space-y-4">
                {/* Existing Loan */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                    Existing FHA Loan
                  </h3>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-4">
                      {[
                        {label:'Confirmed FHA-Insured',key:'is_fha_insured'},
                        {label:'Currently Delinquent',key:'is_delinquent',danger:true},
                      ].map(c=>(
                        <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={inp[c.key]} onChange={e=>si(c.key,e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                          <span className={c.danger?'text-red-600':'text-gray-700'}>{c.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {label:'Existing UPB ($)',key:'existing_upb'},
                        {label:'Current Note Rate (%)',key:'existing_note_rate',step:'0.001'},
                        {label:'Monthly P&I ($)',key:'existing_monthly_pi'},
                        {label:'Monthly MIP ($)',key:'existing_monthly_mip'},
                        {label:'Annual MIP Factor (%)',key:'existing_mip_factor',step:'0.001'},
                        {label:'Original UFMIP Paid ($)',key:'original_ufmip'},
                      ].map(f=>(
                        <div key={f.key}>
                          <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                          <input type="number" step={f.step||'any'} value={inp[f.key]} onChange={e=>si(f.key,e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">FHA Case Number</label>
                        <input value={inp.existing_case_number} onChange={e=>si('existing_case_number',e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Endorsement Date</label>
                        <input type="date" value={inp.endorsement_date} onChange={e=>si('endorsement_date',e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment History */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                    Payment History
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[{label:'Lates — Last 6 Months',key:'lates_last_6'},{label:'Lates — Months 7-12',key:'lates_months_7_12'}].map(f=>(
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
                    {label:'Borrower Being Removed',key:'borrower_removed'},
                    {label:'Title Holders Changed',key:'title_changed'},
                  ].map(c=>(
                    <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                      <input type="checkbox" checked={inp[c.key]} onChange={e=>si(c.key,e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                      <span className="text-gray-700">{c.label}</span>
                    </label>
                  ))}
                </div>

                {/* New Loan */}
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
                        <option value="360">30 Years (360)</option>
                        <option value="300">25 Years (300)</option>
                        <option value="240">20 Years (240)</option>
                        <option value="180">15 Years (180)</option>
                        <option value="120">10 Years (120)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Occupancy (Current)</label>
                      <select value={inp.occupancy_current} onChange={e=>si('occupancy_current',e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="OWNER">Owner Occupied</option>
                        <option value="SECOND">Second Home</option>
                        <option value="INVESTMENT">Investment</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Est. Property Value ($)</label>
                      <input type="number" value={inp.estimated_property_value} onChange={e=>si('estimated_property_value',e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amortization Type</label>
                      <select value={inp.new_amort_type} onChange={e=>si('new_amort_type',e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="FIXED">Fixed</option>
                        <option value="ARM">ARM</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-4">
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
                          {label:'New Note Rate (%)',key:'note_rate'},
                          {label:'Price (e.g. 101.25)',key:'price'},
                          {label:'Lender Credit ($)',key:'lender_credit'},
                          {label:'Origination ($)',key:'origination'},
                        ].map(f=>(
                          <div key={f.key}>
                            <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                            <input type="number" step="any" value={opt[f.key]} onChange={e=>sp(idx,f.key,e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"/>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={run}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-base transition-all shadow-md">
                  🔍 Run Eligibility &amp; NTB Analysis
                </button>

                {ntb && ntb.length>0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-800 mb-3">NTB Quick Summary</h3>
                    {ntb.map(r=>{
                      const badge=getBadge(r,ntb);
                      return (
                        <div key={r.option_id} className="flex items-center justify-between py-2 border-b last:border-0 border-gray-100">
                          <div>
                            <span className="font-semibold text-sm">{r.label}</span>
                            <span className="text-gray-500 text-xs ml-2">{r.note_rate}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">{r.ntbPass?`Saves $${fmt(r.monthlySavings)}/mo`:'Fails NTB'}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* FHA Rules Reference Card */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="font-semibold text-yellow-800 text-sm mb-2">📐 FHA Streamline Rules (RULES_V1)</div>
                  <div className="text-xs text-yellow-700 space-y-1">
                    <div>• NTB: Combined rate reduction ≥ <strong>0.50%</strong></div>
                    <div>• Combined Rate = Note Rate + Annual MIP Factor</div>
                    <div>• New UFMIP: <strong>1.75%</strong> of new loan amount</div>
                    <div>• UFMIP refund reduces net upfront cost</div>
                    <div>• Max cash back at closing: <strong>$500</strong></div>
                    <div>• New annual MIP: <strong>0.55%</strong> (standard)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Results */}
            {eligibility && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {[
                    {id:'eligibility',label:'🔍 Eligibility Check'},
                    {id:'mip',label:'💰 MIP Analysis'},
                    {id:'ntb',label:'📊 NTB Comparison'},
                  ].map(t=>(
                    <button key={t.id} onClick={()=>setTab(t.id)}
                      className={`px-5 py-3 text-sm font-semibold transition-all ${tab===t.id?'border-b-2 border-blue-600 text-blue-700 bg-blue-50':'text-gray-500 hover:text-gray-800'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="p-5">
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
                          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                              {label:'Months Since Endorsement',value:`${r.monthsElapsed} months`},
                              {label:`UFMIP Refund (${r.refundPct}%)`,value:`$${fmt(r.ufmipRefund)}`},
                              {label:'New UFMIP (1.75%)',value:`$${fmt(r.newUFMIP)}`},
                              {label:'Net UFMIP Cost',value:`$${fmt(r.netUFMIP)}`,highlight:true},
                              {label:'Existing Monthly MIP',value:`$${fmt(r.existingMIP)}/mo`},
                              {label:'New Monthly MIP',value:`$${fmt(r.newMIP)}/mo`},
                              {label:'MIP Savings/Month',value:`$${fmt(r.existingMIP-r.newMIP)}/mo`},
                              {label:'Breakeven Months',value:r.breakevenMonths<999?`${r.breakevenMonths} mo`:'N/A'},
                            ].map(item=>(
                              <div key={item.label} className={`rounded-lg p-3 text-center ${item.highlight?'bg-blue-50 border border-blue-200':'bg-gray-50'}`}>
                                <div className="text-base font-bold text-gray-800">{item.value}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-gray-400 text-sm text-center py-6">Enter pricing options and run analysis to see MIP details.</p>)}

                  {tab==='ntb' && (ntb&&ntb.length>0 ? (
                    <div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              {['Option','Rate','Existing Combined','New Combined','Reduction','NTB','New P&I','New Total','Savings/mo','Badge'].map(h=>(
                                <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ntb.map(r=>{
                              const badge=getBadge(r,ntb);
                              return (
                                <tr key={r.option_id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="px-3 py-3 font-bold">{r.label}</td>
                                  <td className="px-3 py-3">{fmtP(r.note_rate)}</td>
                                  <td className="px-3 py-3">{fmtP(r.existingCombined)}</td>
                                  <td className="px-3 py-3">{fmtP(r.newCombined)}</td>
                                  <td className="px-3 py-3 font-semibold text-blue-700">{fmtP(r.combinedReduction)}</td>
                                  <td className="px-3 py-3"><span className={r.ntbPass?'text-green-600 font-bold':'text-red-600 font-bold'}>{r.ntbPass?'PASS ✓':'FAIL ✗'}</span></td>
                                  <td className="px-3 py-3">${fmt(r.newPI)}</td>
                                  <td className="px-3 py-3">${fmt(r.newTotal)}</td>
                                  <td className="px-3 py-3 font-semibold text-green-700">${fmt(r.monthlySavings)}</td>
                                  <td className="px-3 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                        <div className="font-semibold text-yellow-800 mb-1">💡 Key Insights</div>
                        <ul className="text-xs text-yellow-700 space-y-1">
                          <li>• NTB threshold: combined rate reduction ≥ 0.500% (note rate + annual MIP factor)</li>
                          <li>• UFMIP refund is credited against new UFMIP — reducing net upfront cost</li>
                          <li>• Breakeven = Net UFMIP ÷ Monthly savings</li>
                        </ul>
                      </div>
                    </div>
                  ) : <p className="text-gray-400 text-sm text-center py-6">Enter pricing options and run analysis to see NTB comparison.</p>)}
                </div>

                <div className="border-t border-gray-200 p-4 flex items-center justify-between bg-gray-50">
                  <span className="text-sm text-gray-500">{saved?'✅ Saved to scenario':'Results not yet saved'}</span>
                  <div className="flex gap-3">
                    <button onClick={save} disabled={saving||!eligibility}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-all">
                      {saving?'Saving...':'💾 Save to Scenario'}
                    </button>
                    <button className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-all">
                      📄 Export PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
