// src/pages/ClosingCostCalc.jsx
// LoanBeacons™ — Module 11 | Stage 2: Lender Fit
// Closing Cost Calculator™ — GFE/LE itemized costs, seller credits, cash to close

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

const FEE_CATEGORIES = [
  {
    id: 'origination', label: 'A. Origination Charges', icon: '🏦',
    items: [
      { id: 'orig_points', label: 'Discount Points', pct: true, defaultPct: 0, note: '1 point = 1% of loan amount' },
      { id: 'orig_fee', label: 'Origination Fee', pct: false, default: 0, note: 'Lender fee. VA cap: 1%.' },
      { id: 'appraisal_fee', label: 'Appraisal Fee', pct: false, default: 650, note: '' },
      { id: 'credit_report', label: 'Credit Report Fee', pct: false, default: 55, note: '' },
      { id: 'underwriting', label: 'Underwriting Fee', pct: false, default: 995, note: '' },
    ]
  },
  {
    id: 'services', label: 'B. Services You Cannot Shop For', icon: '📋',
    items: [
      { id: 'flood_cert', label: 'Flood Certification', pct: false, default: 18, note: '' },
      { id: 'tax_service', label: 'Tax Service Fee', pct: false, default: 75, note: '' },
      { id: 'wire_fee', label: 'Wire Transfer Fee', pct: false, default: 35, note: '' },
    ]
  },
  {
    id: 'title', label: 'C. Title Services & Insurance', icon: '📜',
    items: [
      { id: 'title_search', label: 'Title Search & Exam', pct: false, default: 300, note: '' },
      { id: 'lenders_title', label: "Lender's Title Insurance", pct: false, default: 0, note: 'Required. Varies by loan amount.' },
      { id: 'owners_title', label: "Owner's Title Insurance", pct: false, default: 0, note: 'Optional but recommended.' },
      { id: 'settlement_fee', label: 'Settlement / Closing Fee', pct: false, default: 650, note: '' },
      { id: 'attorney_fee', label: 'Attorney Fee', pct: false, default: 0, note: 'Required in some states.' },
      { id: 'recording_fee', label: 'Recording Fees', pct: false, default: 125, note: '' },
      { id: 'transfer_tax', label: 'Transfer Tax / Stamps', pct: false, default: 0, note: 'State/county specific.' },
    ]
  },
  {
    id: 'prepaids', label: 'D. Prepaids', icon: '📅',
    items: [
      { id: 'prepaid_interest', label: 'Prepaid Interest (15 days avg)', pct: false, default: 0, note: 'Rate × loan ÷ 365 × days' },
      { id: 'prepaid_hoi', label: 'Homeowners Insurance Premium (1yr)', pct: false, default: 0, note: '' },
      { id: 'prepaid_mip', label: 'Upfront MIP/FF (FHA/VA/USDA)', pct: false, default: 0, note: 'FHA: 1.75%, VA: 0.5-3.6%, USDA: 1%' },
    ]
  },
  {
    id: 'escrow', label: 'E. Initial Escrow / Impounds', icon: '🏛️',
    items: [
      { id: 'escrow_taxes', label: 'Property Tax Escrow (3-6 months)', pct: false, default: 0, note: '' },
      { id: 'escrow_hoi', label: 'Homeowners Insurance Escrow (2 months)', pct: false, default: 0, note: '' },
      { id: 'escrow_mip', label: 'MIP Escrow (2 months)', pct: false, default: 0, note: 'FHA/USDA only' },
    ]
  },
];

const fmt$ = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt$0 = n => '$' + Number(n||0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function ClosingCostCalc() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [loanAmount, setLoanAmount] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [loanType, setLoanType] = useState('CONVENTIONAL');
  const [downPayment, setDownPayment] = useState('');
  const [sellerCredits, setSellerCredits] = useState('');
  const [lenderCredits, setLenderCredits] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [fees, setFees] = useState({});
  const [notes, setNotes] = useState('');

  // Initialize fees with defaults
  useEffect(() => {
    const defaults = {};
    FEE_CATEGORIES.forEach(cat => {
      cat.items.forEach(item => {
        defaults[item.id] = item.default !== undefined ? String(item.default) : '0';
      });
    });
    setFees(defaults);
  }, []);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.loanAmount) setLoanAmount(String(d.loanAmount));
        if (d.propertyValue) setPurchasePrice(String(d.propertyValue));
        if (d.loanType) setLoanType(d.loanType);
        if (d.downPayment) setDownPayment(String(d.downPayment));
        if (d.sellerConcessions) setSellerCredits(String(d.sellerConcessions));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  const loan = parseFloat(loanAmount) || 0;
  const getFeeValue = (item) => {
    const raw = fees[item.id];
    if (item.pct) return loan * (parseFloat(raw)||0) / 100;
    return parseFloat(raw) || 0;
  };

  const categoryTotals = FEE_CATEGORIES.map(cat => ({
    ...cat,
    total: cat.items.reduce((s, item) => s + getFeeValue(item), 0)
  }));

  const totalClosingCosts = categoryTotals.reduce((s, cat) => s + cat.total, 0);
  const totalCredits = (parseFloat(sellerCredits)||0) + (parseFloat(lenderCredits)||0) + (parseFloat(earnestMoney)||0);
  const downPmt = parseFloat(downPayment) || 0;
  const cashToClose = Math.max(0, downPmt + totalClosingCosts - totalCredits);
  const netClosingCosts = Math.max(0, totalClosingCosts - (parseFloat(sellerCredits)||0) - (parseFloat(lenderCredits)||0));

  // Seller credit max limits
  const ltv = purchasePrice && loanAmount ? (loan / parseFloat(purchasePrice)) * 100 : 0;
  const sellerMax = loanType === 'FHA' ? parseFloat(purchasePrice) * 0.06 :
    loanType === 'VA' ? parseFloat(purchasePrice) * 0.04 :
    loanType === 'USDA' ? parseFloat(purchasePrice) * 0.06 :
    ltv > 90 ? parseFloat(purchasePrice) * 0.03 :
    ltv > 75 ? parseFloat(purchasePrice) * 0.06 : parseFloat(purchasePrice) * 0.09;

  const sellerCreditAmt = parseFloat(sellerCredits) || 0;
  const sellerCreditOk = !sellerMax || sellerCreditAmt <= sellerMax;

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const feeBreakdown = {};
      FEE_CATEGORIES.forEach(cat => {
        feeBreakdown[cat.id] = Math.round(cat.items.reduce((s, item) => s + getFeeValue(item), 0));
      });
      const writtenId = await reportFindings('CLOSING_COST_CALC', {
        loanAmount: loan, purchasePrice: parseFloat(purchasePrice)||null, loanType,
        totalClosingCosts: Math.round(totalClosingCosts),
        sellerCredits: Math.round(sellerCreditAmt),
        lenderCredits: Math.round(parseFloat(lenderCredits)||0),
        earnestMoney: Math.round(parseFloat(earnestMoney)||0),
        downPayment: Math.round(downPmt),
        cashToClose: Math.round(cashToClose),
        netClosingCosts: Math.round(netClosingCosts),
        feeBreakdown, sellerCreditOk,
        loNotes: notes, timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" /></div>;

  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8"><div className="max-w-2xl mx-auto px-4">
      <button onClick={() => navigate('/')} className="text-blue-600 mb-4 text-sm">← Back</button>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">11</div>
        <div><h1 className="text-2xl font-bold">Closing Cost Calculator™</h1><p className="text-sm text-gray-500">Stage 2 — Lender Fit</p></div>
      </div>
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-bold mb-4">Select a Scenario</h2>
        {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
          <div className="space-y-2">{scenarios.map(s => (
            <button key={s.id} onClick={() => navigate(`/closing-cost-calc?scenarioId=${s.id}`)}
              className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
              <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
              <div className="text-xs text-gray-500">${parseFloat(s.loanAmount||0).toLocaleString()} · {s.loanType||'--'}</div>
            </button>
          ))}</div>}
      </div>
    </div></div>
  );

  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : null;

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 2 — Lender Fit</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 11</span>
              </div>
              <h1 className="text-2xl font-bold">Closing Cost Calculator™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}LE Itemization · Seller Credits · Cash to Close</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Cash to Close</div>
              <div className="text-3xl font-black text-white">{fmt$0(cashToClose)}</div>
              <div className="text-xs text-slate-400">Total costs: {fmt$0(totalClosingCosts)}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Loan Setup */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">💼 Loan Setup</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Loan Amount ($)', val: loanAmount, set: setLoanAmount, ph: '310500' },
                  { label: 'Purchase Price ($)', val: purchasePrice, set: setPurchasePrice, ph: '345000' },
                  { label: 'Down Payment ($)', val: downPayment, set: setDownPayment, ph: '34500' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Loan Type</label>
                  <select value={loanType} onChange={e => setLoanType(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                    {['CONVENTIONAL','FHA','VA','USDA','JUMBO','NON_QM'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Fee Categories */}
            {FEE_CATEGORIES.map(cat => (
              <div key={cat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">{cat.icon} {cat.label}</h2>
                  <span className="text-sm font-black text-indigo-600">{fmt$(categoryTotals.find(c => c.id === cat.id)?.total || 0)}</span>
                </div>
                <div className="space-y-2">
                  {cat.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                      <label className="flex-1 text-sm text-slate-600">{item.label}</label>
                      {item.note && <span className="text-xs text-slate-300 hidden md:block">{item.note}</span>}
                      <div className="flex items-center gap-1 w-36">
                        {item.pct && <span className="text-xs text-slate-400">%</span>}
                        {!item.pct && <span className="text-xs text-slate-400">$</span>}
                        <input type="number" value={fees[item.id]||''} placeholder="0"
                          onChange={e => setFees(p => ({ ...p, [item.id]: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 text-right" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-20 text-right">{fmt$(getFeeValue(item))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Credits */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🤝 Credits & Reductions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Seller Credits ($)</label>
                  <input type="number" value={sellerCredits} placeholder="0" onChange={e => setSellerCredits(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 ${!sellerCreditOk ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} />
                  {sellerMax > 0 && <p className={`text-xs mt-1 ${!sellerCreditOk ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>Max: {fmt$0(sellerMax)} ({loanType})</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Lender Credits ($)</label>
                  <input type="number" value={lenderCredits} placeholder="0" onChange={e => setLenderCredits(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  <p className="text-xs text-slate-400 mt-1">From above-par pricing</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Earnest Money Deposit ($)</label>
                  <input type="number" value={earnestMoney} placeholder="0" onChange={e => setEarnestMoney(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  <p className="text-xs text-slate-400 mt-1">Applied at closing</p>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Fee explanations, negotiation notes, lender credit strategy..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && <DecisionRecordBanner recordId={savedRecordId} moduleName="Closing Cost Calculator™" onSave={handleSaveToRecord} saving={recordSaving} />}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Cash to Close Summary */}
            <div className="bg-slate-900 rounded-xl p-5 text-white">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Cash to Close Summary</h3>
              <div className="space-y-2 text-sm mb-4">
                {[
                  ['Down Payment', fmt$(downPmt), 'text-white'],
                  ['+ Total Closing Costs', fmt$(totalClosingCosts), 'text-white'],
                  ['− Seller Credits', sellerCreditAmt > 0 ? `(${fmt$(sellerCreditAmt)})` : '—', 'text-emerald-400'],
                  ['− Lender Credits', parseFloat(lenderCredits) > 0 ? `(${fmt$(parseFloat(lenderCredits))})` : '—', 'text-emerald-400'],
                  ['− Earnest Money', parseFloat(earnestMoney) > 0 ? `(${fmt$(parseFloat(earnestMoney))})` : '—', 'text-emerald-400'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className={`font-bold ${c}`}>{v}</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-3 flex justify-between">
                  <span className="font-bold text-white">= Cash to Close</span>
                  <span className="text-2xl font-black text-amber-400">{fmt$0(cashToClose)}</span>
                </div>
              </div>
              {!sellerCreditOk && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-xs text-red-300">
                  ⚠️ Seller credit exceeds {loanType} maximum of {fmt$0(sellerMax)}
                </div>
              )}
            </div>

            {/* Category breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Cost Breakdown</h3>
              <div className="space-y-2">
                {categoryTotals.map(cat => (
                  <div key={cat.id} className="flex justify-between text-xs">
                    <span className="text-slate-500">{cat.icon} {cat.label.split('.')[1]?.trim() || cat.label}</span>
                    <span className="font-bold text-slate-700">{fmt$(cat.total)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-2 flex justify-between text-sm font-bold">
                  <span className="text-slate-600">Total</span>
                  <span className="text-indigo-600">{fmt$(totalClosingCosts)}</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Seller Credit Limits</h3>
              <div className="text-xs text-amber-700 space-y-1">
                <p>• FHA: 6% of sales price</p>
                <p>• VA: 4% (+ closing costs)</p>
                <p>• USDA: 6% of sales price</p>
                <p>• Conv. {'>'} 90% LTV: 3%</p>
                <p>• Conv. 75-90% LTV: 6%</p>
                <p>• Conv. {'<'} 75% LTV: 9%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
