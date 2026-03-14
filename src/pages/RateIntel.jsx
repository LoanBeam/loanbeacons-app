// src/pages/RateIntel.jsx
// LoanBeacons™ — Module 13 | Stage 3: Final Structure Optimization
// Rate Intelligence™ — Rate locks, pricing, buydown analysis, float vs lock

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

const LOCK_PERIODS = [
  { days: 15, label: '15-Day Lock', adj: -0.125, note: 'Best price. Tight closing timeline. Use only if ready to close.' },
  { days: 30, label: '30-Day Lock', adj: 0, note: 'Standard. Most common. Par pricing.' },
  { days: 45, label: '45-Day Lock', adj: 0.125, note: 'Slight cost. Good for purchase with some uncertainty.' },
  { days: 60, label: '60-Day Lock', adj: 0.25, note: 'Higher cost. New construction or complex files.' },
  { days: 90, label: '90-Day Lock', adj: 0.375, note: 'Significant cost. Extended new construction only.' },
];

const MARKET_TRENDS = [
  { id: 'rising', label: '📈 Rising — Lock Now', color: 'red', advice: 'Rates trending up. Lock immediately to capture current pricing before further increases.' },
  { id: 'falling', label: '📉 Falling — Float', color: 'green', advice: 'Rates trending down. Consider floating to capture lower rates, but only if timeline allows.' },
  { id: 'sideways', label: '↔️ Sideways — Lock at Milestone', color: 'amber', advice: 'Rates stable. Lock when appraisal is in and file is complete.' },
  { id: 'volatile', label: '⚡ Volatile — Lock ASAP', color: 'orange', advice: 'High volatility. Risk of sharp moves in either direction. Lock to eliminate uncertainty.' },
];

const BUYDOWN_OPTIONS = [
  { id: '2_1', label: '2-1 Buydown', yr1Reduction: 2, yr2Reduction: 1, yr3Reduction: 0, note: 'Rate is 2% below note in Year 1, 1% below in Year 2, then at note rate from Year 3+.' },
  { id: '1_0', label: '1-0 Buydown', yr1Reduction: 1, yr2Reduction: 0, yr3Reduction: 0, note: 'Rate is 1% below note in Year 1, then at note rate from Year 2+.' },
  { id: 'permanent', label: 'Permanent Buydown (Points)', yr1Reduction: null, yr2Reduction: null, yr3Reduction: null, note: 'Pay discount points to permanently reduce the interest rate for the life of the loan.' },
];

function calcPI(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

const fmt$ = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt$0 = n => '$' + Number(n||0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtPct = n => isNaN(n) ? '—' : Number(n).toFixed(3) + '%';

export default function RateIntel() {
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
  const [noteRate, setNoteRate] = useState('');
  const [termMonths, setTermMonths] = useState('360');
  const [lockPeriod, setLockPeriod] = useState(30);
  const [marketTrend, setMarketTrend] = useState('');
  const [parRate, setParRate] = useState('');
  const [creditPerBump, setCreditPerBump] = useState('');
  const [selectedBuydown, setSelectedBuydown] = useState('');
  const [buydownCost, setBuydownCost] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [floatDownOption, setFloatDownOption] = useState(false);
  const [rateLockDate, setRateLockDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [notes, setNotes] = useState('');

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
        if (d.interestRate) setNoteRate(String(d.interestRate));
        if (d.term) setTermMonths(String(d.term));
        if (d.monthlyIncome) setMonthlyIncome(String(d.monthlyIncome));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  const loan = parseFloat(loanAmount) || 0;
  const rate = parseFloat(noteRate) || 0;
  const term = parseInt(termMonths) || 360;
  const income = parseFloat(monthlyIncome) || 0;

  const currentPI = calcPI(loan, rate, term);
  const lockAdj = LOCK_PERIODS.find(l => l.days === lockPeriod)?.adj || 0;
  const adjustedRate = rate + lockAdj;
  const adjustedPI = calcPI(loan, adjustedRate, term);

  // Above-par credit calc
  const parRateNum = parseFloat(parRate) || 0;
  const creditPerBumpNum = parseFloat(creditPerBump) || 0;
  const bumpsAbovePar = parRateNum > 0 && rate > parRateNum ? (rate - parRateNum) / 0.125 : 0;
  const lenderCreditPct = bumpsAbovePar * creditPerBumpNum;
  const lenderCreditAmt = loan > 0 ? (lenderCreditPct / 100) * loan : 0;

  // Buydown
  const buydown = BUYDOWN_OPTIONS.find(b => b.id === selectedBuydown);
  const buydownCostNum = parseFloat(buydownCost) || 0;
  let yr1PI = 0, yr2PI = 0;
  if (buydown && buydown.yr1Reduction !== null && rate > 0) {
    yr1PI = calcPI(loan, rate - buydown.yr1Reduction, term);
    yr2PI = buydown.yr2Reduction > 0 ? calcPI(loan, rate - buydown.yr2Reduction, term) : currentPI;
  }
  const yr1Savings = yr1PI > 0 ? (currentPI - yr1PI) * 12 : 0;
  const yr2Savings = yr2PI > 0 && buydown?.yr2Reduction > 0 ? (currentPI - yr2PI) * 12 : 0;
  const totalBuydownSavings = yr1Savings + yr2Savings;
  const buydownBreakeven = buydownCostNum > 0 && totalBuydownSavings > 0 ? (buydownCostNum / (totalBuydownSavings / 24)).toFixed(1) : null;

  // DTI impact
  const dti = income > 0 && currentPI > 0 ? ((currentPI / income) * 100).toFixed(1) : null;

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('RATE_INTEL', {
        noteRate: rate, adjustedRate: parseFloat(adjustedRate.toFixed(3)),
        lockPeriod, lockAdj,
        monthlyPI: parseFloat(currentPI.toFixed(2)),
        loanAmount: loan, termMonths: term,
        marketTrend: marketTrend || null,
        parRate: parRateNum || null,
        lenderCreditAmt: Math.round(lenderCreditAmt),
        selectedBuydown: selectedBuydown || null,
        buydownCost: buydownCostNum || null,
        floatDownOption, rateLockDate: rateLockDate || null,
        expirationDate: expirationDate || null,
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
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">13</div>
        <div><h1 className="text-2xl font-bold">Rate Intelligence™</h1><p className="text-sm text-gray-500">Stage 3 — Final Structure</p></div>
      </div>
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-bold mb-4">Select a Scenario</h2>
        {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
          <div className="space-y-2">{scenarios.map(s => (
            <button key={s.id} onClick={() => navigate(`/rate-intel?scenarioId=${s.id}`)}
              className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
              <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
              <div className="text-xs text-gray-500">${parseFloat(s.loanAmount||0).toLocaleString()} · Rate: {s.interestRate||'--'}%</div>
            </button>
          ))}</div>}
      </div>
    </div></div>
  );

  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : null;
  const trend = MARKET_TRENDS.find(t => t.id === marketTrend);

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 3 — Final Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 13</span>
              </div>
              <h1 className="text-2xl font-bold">Rate Intelligence™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}Lock Strategy · Buydown Analysis · Float vs Lock</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Note Rate</div>
              <div className="text-3xl font-black text-white">{rate > 0 ? fmtPct(rate) : '—'}</div>
              {currentPI > 0 && <div className="text-xs text-slate-400">{fmt$(currentPI)}/mo P&I</div>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Loan Details */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">💼 Loan Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Loan Amount ($)', val: loanAmount, set: setLoanAmount, ph: '310500' },
                  { label: 'Note Rate (%)', val: noteRate, set: setNoteRate, ph: '7.125' },
                  { label: 'Term (months)', val: termMonths, set: setTermMonths, ph: '360' },
                  { label: 'Monthly Income ($)', val: monthlyIncome, set: setMonthlyIncome, ph: '8500' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
              {currentPI > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-slate-400 mb-1">Monthly P&I</div>
                    <div className="text-lg font-black text-slate-800">{fmt$(currentPI)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-slate-400 mb-1">Annual P&I</div>
                    <div className="text-lg font-black text-slate-800">{fmt$0(currentPI * 12)}</div>
                  </div>
                  {dti && (
                    <div className={`rounded-xl p-3 text-center border ${parseFloat(dti) > 43 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <div className="text-xs text-slate-400 mb-1">P&I-Only DTI</div>
                      <div className={`text-lg font-black ${parseFloat(dti) > 43 ? 'text-red-600' : 'text-emerald-600'}`}>{dti}%</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Market Trend */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">📊 Market Trend & Lock Strategy</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {MARKET_TRENDS.map(t => (
                  <button key={t.id} onClick={() => setMarketTrend(t.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all
                      ${marketTrend === t.id
                        ? `${t.color === 'red' ? 'border-red-400 bg-red-50' : t.color === 'green' ? 'border-emerald-400 bg-emerald-50' : t.color === 'amber' ? 'border-amber-400 bg-amber-50' : 'border-orange-400 bg-orange-50'}`
                        : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-sm font-bold text-slate-800 mb-1">{t.label}</div>
                    {marketTrend === t.id && <p className="text-xs text-slate-600">{t.advice}</p>}
                  </button>
                ))}
              </div>
            </div>

            {/* Rate Lock Period */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🔒 Rate Lock Period</h2>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {LOCK_PERIODS.map(lp => (
                  <button key={lp.days} onClick={() => setLockPeriod(lp.days)}
                    className={`p-3 rounded-xl border-2 text-center transition-all
                      ${lockPeriod === lp.days ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className={`text-sm font-black ${lockPeriod === lp.days ? 'text-indigo-700' : 'text-slate-700'}`}>{lp.days}d</div>
                    <div className={`text-xs ${lp.adj > 0 ? 'text-red-500' : lp.adj < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {lp.adj > 0 ? `+${lp.adj}%` : lp.adj < 0 ? `${lp.adj}%` : 'Par'}
                    </div>
                  </button>
                ))}
              </div>
              {lockAdj !== 0 && rate > 0 && (
                <div className={`rounded-xl p-3 border ${lockAdj > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <p className="text-xs font-semibold text-slate-700">
                    {lockPeriod}-day lock: Rate adjusts from {fmtPct(rate)} to <strong>{fmtPct(adjustedRate)}</strong> · P&I: {fmt$(adjustedPI)}/mo
                    {lockAdj > 0 ? ` (+${fmt$(adjustedPI - currentPI)}/mo)` : ` (saves ${fmt$(currentPI - adjustedPI)}/mo)`}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Lock Date</label>
                  <input type="date" value={rateLockDate} onChange={e => setRateLockDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Expiration Date</label>
                  <input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={floatDownOption} onChange={e => setFloatDownOption(e.target.checked)} className="accent-indigo-600" />
                <span className="text-sm text-slate-600">Float-down option requested (allows rate to drop if market improves)</span>
              </label>
            </div>

            {/* Lender Credit Analysis */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">💹 Above-Par Pricing / Lender Credit</h2>
              <p className="text-xs text-slate-400 mb-4">Price the loan above par to generate a lender credit that offsets closing costs.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Par Rate (%)</label>
                  <input type="number" value={parRate} placeholder="6.875" onChange={e => setParRate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Credit % per 0.125% bump</label>
                  <input type="number" value={creditPerBump} placeholder="0.500" onChange={e => setCreditPerBump(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
              {lenderCreditAmt > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div><div className="text-xs text-slate-400 mb-1">Above Par</div><div className="font-black text-slate-800">+{fmtPct(rate - parRateNum)}</div></div>
                    <div><div className="text-xs text-slate-400 mb-1">Credit %</div><div className="font-black text-slate-800">{lenderCreditPct.toFixed(3)}%</div></div>
                    <div><div className="text-xs text-slate-400 mb-1">Lender Credit</div><div className="font-black text-emerald-700 text-lg">{fmt$0(lenderCreditAmt)}</div></div>
                  </div>
                </div>
              )}
            </div>

            {/* Buydown */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">📉 Rate Buydown Analysis</h2>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {BUYDOWN_OPTIONS.map(b => (
                  <button key={b.id} onClick={() => setSelectedBuydown(selectedBuydown === b.id ? '' : b.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${selectedBuydown === b.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className={`text-sm font-bold ${selectedBuydown === b.id ? 'text-indigo-700' : 'text-slate-700'}`}>{b.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{b.note.substring(0, 60)}...</div>
                  </button>
                ))}
              </div>
              {selectedBuydown && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Buydown Cost ($)</label>
                    <input type="number" value={buydownCost} placeholder="e.g. 6500 (seller-funded)"
                      onChange={e => setBuydownCost(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  {buydown?.yr1Reduction && rate > 0 && loan > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3">Payment Schedule</p>
                      <div className="grid grid-cols-3 gap-3 text-center text-sm">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Year 1 ({fmtPct(rate - buydown.yr1Reduction)})</div>
                          <div className="font-black text-indigo-700">{fmt$(yr1PI)}/mo</div>
                          <div className="text-xs text-emerald-600">Save {fmt$(currentPI - yr1PI)}/mo</div>
                        </div>
                        {buydown.yr2Reduction > 0 ? (
                          <div>
                            <div className="text-xs text-slate-400 mb-1">Year 2 ({fmtPct(rate - buydown.yr2Reduction)})</div>
                            <div className="font-black text-indigo-700">{fmt$(yr2PI)}/mo</div>
                            <div className="text-xs text-emerald-600">Save {fmt$(currentPI - yr2PI)}/mo</div>
                          </div>
                        ) : <div />}
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Year 3+ ({fmtPct(rate)})</div>
                          <div className="font-black text-slate-700">{fmt$(currentPI)}/mo</div>
                          <div className="text-xs text-slate-400">Note rate</div>
                        </div>
                      </div>
                      {buydownBreakeven && (
                        <div className="mt-3 text-xs text-center text-indigo-600 font-semibold">
                          Breakeven: ~{buydownBreakeven} months · Total subsidy value: {fmt$0(totalBuydownSavings)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Rate lock strategy, pricing decisions, market commentary, buydown justification..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && <DecisionRecordBanner recordId={savedRecordId} moduleName="Rate Intelligence™" onSave={handleSaveToRecord} saving={recordSaving} />}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Rate Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Note Rate', rate > 0 ? fmtPct(rate) : '—', 'text-white'],
                  ['Lock Period', `${lockPeriod} days`, 'text-white'],
                  ['Lock Adj', lockAdj !== 0 ? `${lockAdj > 0 ? '+' : ''}${lockAdj}%` : 'Par', lockAdj > 0 ? 'text-amber-400' : 'text-emerald-400'],
                  ['Adjusted Rate', rate > 0 ? fmtPct(adjustedRate) : '—', 'text-blue-300'],
                  ['Monthly P&I', currentPI > 0 ? fmt$(currentPI) : '—', 'text-white'],
                  ['Lender Credit', lenderCreditAmt > 0 ? fmt$0(lenderCreditAmt) : '—', 'text-emerald-400'],
                  ['Float-Down', floatDownOption ? '✓ Requested' : 'No', 'text-white'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className={`font-bold ${c}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {trend && (
              <div className={`rounded-xl border p-4 ${trend.color === 'red' ? 'bg-red-50 border-red-200' : trend.color === 'green' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <h3 className={`text-xs font-bold uppercase tracking-wide mb-2 ${trend.color === 'red' ? 'text-red-700' : trend.color === 'green' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Market Recommendation
                </h3>
                <p className={`text-xs ${trend.color === 'red' ? 'text-red-600' : trend.color === 'green' ? 'text-emerald-600' : 'text-amber-600'}`}>{trend.advice}</p>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• Lock before rate quote expires</p>
                <p>• Float-down has a one-time trigger window</p>
                <p>• 2-1 buydown: subsidy held in escrow by servicer</p>
                <p>• Points: each 0.25% rate ≈ 1 point cost</p>
                <p>• Seller-funded buydown counts against seller credit limits</p>
                <p>• VA: lender credit cannot exceed closing costs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
