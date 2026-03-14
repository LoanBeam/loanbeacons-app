// src/pages/AssetAnalyzer.jsx
// LoanBeacons™ — Module 4 | Stage 1: Pre-Structure
// Asset Analyzer™ — Down payment, reserves, gift funds, large deposits

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

const ASSET_TYPES = [
  { id: 'checking',    label: 'Checking Account',         icon: '🏦', pct: 100, docs: '2 months bank statements', seasoned: true  },
  { id: 'savings',     label: 'Savings Account',           icon: '💰', pct: 100, docs: '2 months bank statements', seasoned: true  },
  { id: 'stocks',      label: 'Stocks / Bonds / Mutual Funds', icon: '📈', pct: 100, docs: '2 months statements (most recent)', seasoned: true },
  { id: 'retirement_401k', label: '401K / IRA / 403b',    icon: '🏛️', pct: 60,  docs: '2 months statements — 60% of vested balance counted (penalty/tax haircut)', seasoned: false },
  { id: 'gift',        label: 'Gift Funds',                icon: '🎁', pct: 100, docs: 'Gift letter + donor bank statement showing withdrawal + transfer evidence', seasoned: false },
  { id: 'sale_of_home',label: 'Net Proceeds from Sale',   icon: '🏠', pct: 100, docs: 'Executed HUD-1 / Closing Disclosure from sale', seasoned: true },
  { id: 'crypto',      label: 'Crypto / Digital Assets',  icon: '₿',  pct: 0,   docs: 'NOT acceptable — must be converted to cash 60+ days prior', seasoned: false },
  { id: 'business',    label: 'Business Assets',           icon: '🏢', pct: 0,   docs: 'Generally not allowed unless business ownership ≥ 25% and CPA letter confirms no impact', seasoned: false },
];

const PROGRAM_RESERVE_REQS = {
  FHA:          { label: 'FHA',           months: 0,  note: 'No reserve requirement for 1-2 unit properties. 3 months for 3-4 unit.' },
  CONVENTIONAL: { label: 'Conventional',  months: 2,  note: '2 months standard. Higher DTI may require 6-12 months.' },
  VA:           { label: 'VA',            months: 0,  note: 'No statutory minimum. Residual income serves as reserve test.' },
  USDA:         { label: 'USDA',          months: 0,  note: 'No minimum. Reserves as compensating factor for borderline DTI.' },
  JUMBO:        { label: 'Jumbo',         months: 12, note: '6-12 months typical. Lender-specific.' },
};

const fmt$ = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt$d = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AssetAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [assets, setAssets] = useState([]);
  const [downPayment, setDownPayment] = useState('');
  const [closingCosts, setClosingCosts] = useState('');
  const [monthlyPITI, setMonthlyPITI] = useState('');
  const [loanProgram, setLoanProgram] = useState('CONVENTIONAL');
  const [largeDeposits, setLargeDeposits] = useState([]);
  const [notes, setNotes] = useState('');
  const [showAddAsset, setShowAddAsset] = useState(false);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.downPayment) setDownPayment(String(d.downPayment));
        if (d.totalHousing) setMonthlyPITI(String(d.totalHousing));
        if (d.loanType) setLoanProgram(d.loanType);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  const addAsset = (typeId) => {
    setAssets(p => [...p, { id: Date.now(), type: typeId, balance: '', seasoned: true, note: '' }]);
    setShowAddAsset(false);
  };

  const updateAsset = (id, field, val) => setAssets(p => p.map(a => a.id === id ? { ...a, [field]: val } : a));
  const removeAsset = (id) => setAssets(p => p.filter(a => a.id !== id));

  const addLargeDeposit = () => setLargeDeposits(p => [...p, { id: Date.now(), amount: '', source: '', documented: false }]);
  const updateDeposit = (id, field, val) => setLargeDeposits(p => p.map(d => d.id === id ? { ...d, [field]: val } : d));
  const removeDeposit = (id) => setLargeDeposits(p => p.filter(d => d.id !== id));

  // Calculations
  const totalAssets = assets.reduce((s, a) => {
    const type = ASSET_TYPES.find(t => t.id === a.type);
    const bal = parseFloat(a.balance) || 0;
    return s + (type ? bal * type.pct / 100 : 0);
  }, 0);

  const downPmt = parseFloat(downPayment) || 0;
  const closing = parseFloat(closingCosts) || 0;
  const cashNeeded = downPmt + closing;
  const piti = parseFloat(monthlyPITI) || 0;
  const postCloseAssets = totalAssets - cashNeeded;
  const reserveMonths = piti > 0 ? postCloseAssets / piti : 0;
  const reqMonths = PROGRAM_RESERVE_REQS[loanProgram]?.months || 0;
  const reservePass = reserveMonths >= reqMonths;
  const sufficientFunds = totalAssets >= cashNeeded;

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('ASSET_ANALYZER', {
        totalVerifiedAssets: Math.round(totalAssets),
        cashNeededToClose: Math.round(cashNeeded),
        postCloseReserves: Math.round(postCloseAssets),
        reserveMonths: parseFloat(reserveMonths.toFixed(1)),
        sufficientFunds,
        reservePass,
        loanProgram,
        assetTypes: assets.map(a => a.type),
        largeDepositCount: largeDeposits.length,
        largeDepositsDocumented: largeDeposits.filter(d => d.documented).length,
        loNotes: notes,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
    </div>
  );

  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <button onClick={() => navigate('/')} className="text-blue-600 mb-4 flex items-center gap-2 text-sm">← Back</button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">04</div>
          <div><h1 className="text-2xl font-bold">Asset Analyzer™</h1><p className="text-sm text-gray-500">Stage 1 — Pre-Structure</p></div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-bold text-gray-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
            <div className="space-y-2">
              {scenarios.map(s => (
                <button key={s.id} onClick={() => navigate(`/asset-analyzer?scenarioId=${s.id}`)}
                  className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
                  <div className="text-xs text-gray-500">${parseFloat(s.loanAmount||0).toLocaleString()} · {s.loanType||'--'}</div>
                </button>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );

  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : null;

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 4</span>
              </div>
              <h1 className="text-2xl font-bold">Asset Analyzer™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}Down Payment · Reserves · Gift Funds · Large Deposits</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Verified Assets</div>
              <div className={`text-3xl font-black ${sufficientFunds ? 'text-emerald-400' : totalAssets > 0 ? 'text-red-400' : 'text-white'}`}>{fmt$(totalAssets)}</div>
              <div className="text-xs text-slate-400">{sufficientFunds ? '✓ Sufficient for closing' : cashNeeded > 0 ? '✗ Shortfall: ' + fmt$(cashNeeded - totalAssets) : 'Enter assets below'}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            {/* Setup */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">💳 Transaction Setup</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Down Payment ($)', val: downPayment, set: setDownPayment, ph: '17250' },
                  { label: 'Est. Closing Costs ($)', val: closingCosts, set: setClosingCosts, ph: '7500' },
                  { label: 'Monthly PITI ($)', val: monthlyPITI, set: setMonthlyPITI, ph: '2100' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Loan Program</label>
                  <select value={loanProgram} onChange={e => setLoanProgram(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                    {Object.entries(PROGRAM_RESERVE_REQS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {cashNeeded > 0 && (
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-6 text-sm">
                  <div><span className="text-slate-400">Down Payment </span><span className="font-bold text-slate-700">{fmt$d(downPmt)}</span></div>
                  <div><span className="text-slate-400">+ Closing Costs </span><span className="font-bold text-slate-700">{fmt$d(closing)}</span></div>
                  <div><span className="text-slate-400">= Total Cash Needed </span><span className="font-black text-slate-900">{fmt$d(cashNeeded)}</span></div>
                </div>
              )}
            </div>

            {/* Asset Accounts */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🏦 Asset Accounts</h2>
              {assets.length === 0 && <p className="text-sm text-slate-400 mb-4">No assets entered yet. Add accounts below.</p>}
              <div className="space-y-3 mb-4">
                {assets.map(asset => {
                  const type = ASSET_TYPES.find(t => t.id === asset.type);
                  const bal = parseFloat(asset.balance) || 0;
                  const counted = type ? bal * type.pct / 100 : 0;
                  return (
                    <div key={asset.id} className={`rounded-xl border p-4 ${type?.pct === 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xl">{type?.icon}</span>
                          <div className="flex-1">
                            <div className="text-sm font-bold text-slate-800">{type?.label}</div>
                            <div className="text-xs text-slate-400 mt-0.5">📎 {type?.docs}</div>
                          </div>
                        </div>
                        <button onClick={() => removeAsset(asset.id)} className="text-slate-300 hover:text-red-400">✕</button>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Balance ($)</label>
                          <input type="number" value={asset.balance} placeholder="0"
                            onChange={e => updateAsset(asset.id, 'balance', e.target.value)}
                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 ${type?.pct === 0 ? 'bg-red-50 border-red-200' : 'border-slate-200'}`} />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Qualifying Amount</label>
                          <div className={`border rounded-lg px-3 py-2 text-sm font-bold ${type?.pct === 0 ? 'bg-red-100 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                            {type?.pct === 0 ? '✗ Not Allowed' : `${fmt$d(counted)} (${type?.pct}%)`}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Note</label>
                          <input type="text" value={asset.note} placeholder="acct last 4, etc."
                            onChange={e => updateAsset(asset.id, 'note', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                        </div>
                      </div>
                      {type?.pct === 0 && <p className="text-xs text-red-600 font-semibold mt-2">⚠️ This asset type is not acceptable for down payment or reserves</p>}
                    </div>
                  );
                })}
              </div>

              {showAddAsset ? (
                <div className="border border-indigo-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Select Asset Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ASSET_TYPES.map(t => (
                      <button key={t.id} onClick={() => addAsset(t.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all
                          ${t.pct === 0 ? 'border-red-200 hover:bg-red-50 opacity-75' : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                        <span className="text-lg">{t.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-slate-700">{t.label}</div>
                          <div className={`text-xs ${t.pct === 0 ? 'text-red-500' : 'text-slate-400'}`}>{t.pct}% counted</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowAddAsset(false)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowAddAsset(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                  + Add Asset Account
                </button>
              )}
            </div>

            {/* Large Deposits */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">🔍 Large Deposit Tracker</h2>
                <button onClick={addLargeDeposit} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">+ Add Deposit</button>
              </div>
              <p className="text-xs text-slate-400 mb-4">Large deposits (typically {'>'} 50% of monthly income) require sourcing documentation. Track them here.</p>
              {largeDeposits.length === 0 ? (
                <p className="text-sm text-slate-300 italic">No large deposits flagged.</p>
              ) : (
                <div className="space-y-2">
                  {largeDeposits.map(d => (
                    <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border ${d.documented ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <input type="number" value={d.amount} placeholder="Amount $"
                        onChange={e => updateDeposit(d.id, 'amount', e.target.value)}
                        className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <input type="text" value={d.source} placeholder="Source (e.g. gift from mother)"
                        onChange={e => updateDeposit(d.id, 'source', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={d.documented}
                          onChange={e => updateDeposit(d.id, 'documented', e.target.checked)}
                          className="accent-emerald-600" />
                        <span className={d.documented ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>Documented</span>
                      </label>
                      <button onClick={() => removeDeposit(d.id)} className="text-slate-300 hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Asset sourcing notes, gift fund details, seasoning explanations..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Asset Analyzer™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Asset Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Total Verified Assets', fmt$(totalAssets), totalAssets > cashNeeded ? 'text-emerald-600' : 'text-red-500'],
                  ['Cash Needed to Close', fmt$(cashNeeded), 'text-slate-700'],
                  ['Post-Close Reserves', fmt$(postCloseAssets), postCloseAssets >= 0 ? 'text-emerald-600' : 'text-red-500'],
                  ['Reserve Months', reserveMonths.toFixed(1) + ' months', reservePass ? 'text-emerald-600' : 'text-amber-600'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className={`font-bold ${c}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Funds check */}
            <div className={`rounded-xl border p-4 text-center ${sufficientFunds ? 'bg-emerald-50 border-emerald-200' : cashNeeded > 0 && totalAssets > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-2xl mb-1">{sufficientFunds ? '✅' : cashNeeded > 0 && totalAssets > 0 ? '❌' : '—'}</div>
              <div className={`text-sm font-bold ${sufficientFunds ? 'text-emerald-700' : 'text-red-600'}`}>
                {sufficientFunds ? 'Sufficient Funds' : cashNeeded > 0 && totalAssets > 0 ? `Shortfall: ${fmt$(cashNeeded - totalAssets)}` : 'Enter assets + transaction details'}
              </div>
            </div>

            {/* Reserve check */}
            {piti > 0 && totalAssets > 0 && (
              <div className={`rounded-xl border p-4 ${reservePass ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Reserve Requirement</h3>
                <div className={`text-2xl font-black ${reservePass ? 'text-emerald-600' : 'text-amber-600'}`}>{reserveMonths.toFixed(1)} mo</div>
                <div className="text-xs text-slate-500 mt-1">
                  {loanProgram}: {reqMonths > 0 ? `${reqMonths} months required` : 'No minimum'}
                </div>
                <div className="text-xs text-slate-400 mt-1">{PROGRAM_RESERVE_REQS[loanProgram]?.note}</div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• 401K/IRA: only 60% counted (tax haircut)</p>
                <p>• Gift funds: need letter + transfer docs</p>
                <p>• Crypto: NOT acceptable until converted {'>'} 60 days</p>
                <p>• Large deposits: must source and document</p>
                <p>• Business assets: need CPA letter</p>
                <p>• Seasoning: 60+ days in account = clean</p>
              </div>
            </div>

            {largeDeposits.length > 0 && (
              <div className={`rounded-xl border p-4 ${largeDeposits.every(d => d.documented) ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
                <h3 className="text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Large Deposits</h3>
                <div className="text-2xl font-black text-amber-600">{largeDeposits.filter(d => !d.documented).length}</div>
                <div className="text-xs text-slate-500">undocumented of {largeDeposits.length} total</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
