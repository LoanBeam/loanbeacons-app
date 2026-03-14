// src/pages/CreditIntel.jsx
// LoanBeacons™ — Module 5 | Stage 1: Pre-Structure
// Credit Intelligence™ — Score tiers, tradelines, derogatory events, rapid rescore

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

const SCORE_TIERS = [
  { min: 760, label: 'Excellent', color: 'emerald', badge: 'bg-emerald-100 text-emerald-700', desc: 'Best pricing on all programs. No overlays apply.' },
  { min: 740, label: 'Very Good', color: 'emerald', badge: 'bg-emerald-100 text-emerald-700', desc: 'Top-tier pricing. Minor adjustments on some products.' },
  { min: 720, label: 'Good', color: 'green', badge: 'bg-green-100 text-green-700', desc: 'Standard pricing. All programs available.' },
  { min: 700, label: 'Above Average', color: 'lime', badge: 'bg-lime-100 text-lime-700', desc: 'Good pricing. Review overlays for jumbo/Non-QM.' },
  { min: 680, label: 'Average', color: 'yellow', badge: 'bg-yellow-100 text-yellow-700', desc: 'Standard pricing. Compensating factors help.' },
  { min: 660, label: 'Fair', color: 'amber', badge: 'bg-amber-100 text-amber-700', desc: 'Some programs restricted. Conventional may require higher down.' },
  { min: 640, label: 'Below Average', color: 'orange', badge: 'bg-orange-100 text-orange-700', desc: 'FHA/VA still available. Conventional difficult.' },
  { min: 620, label: 'Poor', color: 'red', badge: 'bg-red-100 text-red-600', desc: 'FHA minimum. Limited options. Focus on rapid rescore.' },
  { min: 580, label: 'Very Poor', color: 'red', badge: 'bg-red-100 text-red-600', desc: 'FHA with manual UW. VA possible. Non-QM bridge loan.' },
  { min: 0,   label: 'Below Minimum', color: 'red', badge: 'bg-red-200 text-red-700', desc: 'Does not qualify for any agency program. Hard money or credit rehab required.' },
];

const PROGRAM_MIN_SCORES = {
  'Conventional (Standard)': { score: 620, note: 'Most lenders require 640-660 overlay' },
  'HomeReady / Home Possible': { score: 620, note: 'Fannie 620 / Freddie 660' },
  'FHA': { score: 580, note: '3.5% down at 580+. 10% down at 500-579.' },
  'VA': { score: 580, note: 'VA has no minimum. Most lenders require 580-620 overlay.' },
  'USDA': { score: 640, note: 'GUS typically requires 640+' },
  'Jumbo': { score: 700, note: 'Most lenders require 720-740 for best pricing' },
  'Non-QM': { score: 580, note: 'Varies by product. Bank Statement often 600+' },
};

const DEROGATORY_TYPES = [
  { id: 'bankruptcy_7',   label: 'Chapter 7 Bankruptcy',       fha: 24, conv: 48, va: 24, usda: 36, note: 'Months from discharge date' },
  { id: 'bankruptcy_13',  label: 'Chapter 13 Bankruptcy',      fha: 12, conv: 24, va: 12, usda: 12, note: 'Months from filing (with trustee approval). 24 mo from discharge for conv.' },
  { id: 'foreclosure',    label: 'Foreclosure',                 fha: 36, conv: 84, va: 24, usda: 36, note: 'Months from completion date. Extenuating circumstances may reduce.' },
  { id: 'short_sale',     label: 'Short Sale / DIL',            fha: 36, conv: 24, va: 24, usda: 36, note: 'Months from completion. FHA: may waive if no late pmts + extenuating circ.' },
  { id: 'late_mortgage',  label: '30-Day Mortgage Late (12mo)', fha: 0,  conv: 0,  va: 0,  usda: 0,  note: 'Most lenders allow max 1×30 in 12 months. 0×30 often required as overlay.' },
  { id: 'collections',    label: 'Open Collections',            fha: 0,  conv: 0,  va: 0,  usda: 0,  note: 'FHA: medical collections ignored. Non-medical may require payoff or LOE.' },
  { id: 'judgments',      label: 'Judgments / Liens',           fha: 0,  conv: 0,  va: 0,  usda: 0,  note: 'Must be paid at or before closing on most programs.' },
];

const RESCORE_STRATEGIES = [
  { title: 'Pay revolving balances to <10% utilization', impact: '20-40 pts', timeframe: '72 hours (rapid rescore)', cost: '$150-300' },
  { title: 'Dispute inaccurate derogatory items', impact: '10-30 pts', timeframe: '30-45 days', cost: 'Free' },
  { title: 'Add as authorized user on seasoned account', impact: '15-30 pts', timeframe: '30-45 days', cost: 'Free' },
  { title: 'Pay off small collection accounts', impact: '5-15 pts', timeframe: '72 hours (rapid rescore)', cost: 'Account balance' },
  { title: 'Remove inaccurate AU accounts', impact: 'Varies', timeframe: '72 hours (rapid rescore)', cost: 'Free' },
  { title: 'Open a secured credit card (thin file)', impact: '20-40 pts', timeframe: '6-12 months', cost: '$200-500 deposit' },
];

const fmt = n => isNaN(n) ? '—' : Number(n).toLocaleString();

function getScoreTier(score) {
  for (const tier of SCORE_TIERS) {
    if (score >= tier.min) return tier;
  }
  return SCORE_TIERS[SCORE_TIERS.length - 1];
}

export default function CreditIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [borrowerScore, setBorrowerScore] = useState('');
  const [coScore, setCoScore] = useState('');
  const [bureau1, setBureau1] = useState('');
  const [bureau2, setBureau2] = useState('');
  const [bureau3, setBureau3] = useState('');
  const [coBureau1, setCoBureau1] = useState('');
  const [coBureau2, setCoBureau2] = useState('');
  const [coBureau3, setCoBureau3] = useState('');
  const [derogatory, setDerogatory] = useState({});
  const [derogatoryDates, setDerogatoryDates] = useState({});
  const [collections, setCollections] = useState([]);
  const [tradelines, setTradelines] = useState({ revolving: '', installment: '', mortgage: '', totalAccounts: '' });
  const [utilization, setUtilization] = useState('');
  const [selectedStrategies, setSelectedStrategies] = useState({});
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
        if (d.creditScore) setBorrowerScore(String(d.creditScore));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  const addCollection = () => setCollections(p => [...p, { id: Date.now(), creditor: '', amount: '', type: 'medical', status: 'open', loe: false }]);
  const updateCollection = (id, field, val) => setCollections(p => p.map(c => c.id === id ? { ...c, [field]: val } : c));
  const removeCollection = (id) => setCollections(p => p.filter(c => c.id !== id));

  const midScore = parseInt(borrowerScore) || 0;
  const tier = midScore > 0 ? getScoreTier(midScore) : null;
  const coMidScore = parseInt(coScore) || 0;
  const qualifyingScore = coMidScore > 0 ? Math.min(midScore, coMidScore) : midScore;
  const util = parseFloat(utilization) || 0;

  const eligiblePrograms = Object.entries(PROGRAM_MIN_SCORES).filter(([, v]) => qualifyingScore >= v.score);

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('CREDIT_INTEL', {
        borrowerMidScore: midScore,
        coBorrowerMidScore: coMidScore,
        qualifyingScore,
        scoreTier: tier?.label || null,
        utilization: util,
        derogatoryEvents: Object.keys(derogatory).filter(k => derogatory[k]),
        collectionCount: collections.length,
        openCollections: collections.filter(c => c.status === 'open').length,
        eligibleProgramCount: eligiblePrograms.length,
        rescoreStrategiesSelected: Object.keys(selectedStrategies).filter(k => selectedStrategies[k]).length,
        tradelines: { revolving: tradelines.revolving, installment: tradelines.installment, mortgage: tradelines.mortgage },
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
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">05</div>
          <div><h1 className="text-2xl font-bold">Credit Intelligence™</h1><p className="text-sm text-gray-500">Stage 1 — Pre-Structure</p></div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-bold text-gray-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
            <div className="space-y-2">
              {scenarios.map(s => (
                <button key={s.id} onClick={() => navigate(`/credit-intel?scenarioId=${s.id}`)}
                  className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
                  <div className="text-xs text-gray-500">${parseFloat(s.loanAmount||0).toLocaleString()} · Credit: {s.creditScore||'--'}</div>
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
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 5</span>
              </div>
              <h1 className="text-2xl font-bold">Credit Intelligence™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}Score Tiers · Derogatory Events · Rapid Rescore</p>
            </div>
            {tier && (
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Qualifying Score</div>
                <div className="text-4xl font-black text-white">{qualifyingScore || '—'}</div>
                <div className={`text-xs font-bold px-3 py-1 rounded-full mt-1 inline-block ${tier.badge}`}>{tier.label}</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Scores */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">📊 Credit Scores</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Borrower */}
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-3">Borrower — Enter all 3 bureau scores</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[['Experian', bureau1, setBureau1], ['TransUnion', bureau2, setBureau2], ['Equifax', bureau3, setBureau3]].map(([l, v, s]) => (
                      <div key={l}>
                        <label className="block text-xs text-slate-400 mb-1">{l}</label>
                        <input type="number" value={v} placeholder="720" onChange={e => { s(e.target.value); const scores = [parseInt(bureau1)||0, parseInt(bureau2)||0, parseInt(bureau3)||0, parseInt(e.target.value)||0].filter(n=>n>0).sort((a,b)=>a-b); setBorrowerScore(String(scores[Math.floor(scores.length/2)]||'')); }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-300" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-slate-400">Mid Score:</span>
                    <input type="number" value={borrowerScore} onChange={e => setBorrowerScore(e.target.value)} placeholder="or enter directly"
                      className="w-32 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
                {/* Co-Borrower */}
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-3">Co-Borrower (if applicable)</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[['Experian', coBureau1, setCoBureau1], ['TransUnion', coBureau2, setCoBureau2], ['Equifax', coBureau3, setCoBureau3]].map(([l, v, s]) => (
                      <div key={l}>
                        <label className="block text-xs text-slate-400 mb-1">{l}</label>
                        <input type="number" value={v} placeholder="720" onChange={e => { s(e.target.value); const scores = [parseInt(coBureau1)||0, parseInt(coBureau2)||0, parseInt(coBureau3)||0, parseInt(e.target.value)||0].filter(n=>n>0).sort((a,b)=>a-b); setCoScore(String(scores[Math.floor(scores.length/2)]||'')); }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-300" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-slate-400">Mid Score:</span>
                    <input type="number" value={coScore} onChange={e => setCoScore(e.target.value)} placeholder="or enter directly"
                      className="w-32 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
              </div>
              {coMidScore > 0 && midScore > 0 && (
                <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
                  <p className="text-xs text-indigo-700">
                    <strong>Qualifying Score:</strong> {qualifyingScore} — lower of the two mid scores
                    {qualifyingScore < midScore && <span className="ml-2 text-amber-700 font-semibold">⚠ Co-borrower score is the limiting factor</span>}
                  </p>
                </div>
              )}
            </div>

            {/* Tradelines & Utilization */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">💳 Tradelines & Utilization</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  ['Revolving Accounts', tradelines.revolving, v => setTradelines(p => ({...p, revolving: v}))],
                  ['Installment Accounts', tradelines.installment, v => setTradelines(p => ({...p, installment: v}))],
                  ['Mortgage Accounts', tradelines.mortgage, v => setTradelines(p => ({...p, mortgage: v}))],
                  ['Total Accounts', tradelines.totalAccounts, v => setTradelines(p => ({...p, totalAccounts: v}))],
                ].map(([l, v, s]) => (
                  <div key={l}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{l}</label>
                    <input type="number" value={v} placeholder="0" onChange={e => s(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Overall Revolving Utilization (%)</label>
                  <input type="number" value={utilization} placeholder="32" onChange={e => setUtilization(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300
                      ${util > 50 ? 'border-red-300 bg-red-50' : util > 30 ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} />
                  {util > 0 && (
                    <p className={`text-xs mt-1 ${util > 50 ? 'text-red-600' : util > 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {util > 50 ? '⚠ High utilization — rapid rescore recommended' : util > 30 ? '⚠ Moderate — paying down can improve score' : '✓ Good utilization'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Derogatory Events */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">⚠️ Derogatory Events</h2>
              <p className="text-xs text-slate-400 mb-4">Check all that apply. Waiting periods are from discharge/completion date.</p>
              <div className="space-y-3">
                {DEROGATORY_TYPES.map(d => (
                  <div key={d.id} className={`rounded-xl border p-4 transition-all ${derogatory[d.id] ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!derogatory[d.id]} onChange={e => setDerogatory(p => ({ ...p, [d.id]: e.target.checked }))}
                        className="w-4 h-4 mt-0.5 accent-red-600 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">{d.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{d.note}</div>
                        {derogatory[d.id] && (
                          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                            <div className="bg-white rounded-lg p-2 border border-red-100 text-center">
                              <div className="font-bold text-red-600">{d.fha > 0 ? `${d.fha} mo` : 'Case-by-case'}</div>
                              <div className="text-slate-400">FHA</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-red-100 text-center">
                              <div className="font-bold text-red-600">{d.conv > 0 ? `${d.conv} mo` : 'Case-by-case'}</div>
                              <div className="text-slate-400">Conv.</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-red-100 text-center">
                              <div className="font-bold text-red-600">{d.va > 0 ? `${d.va} mo` : 'Case-by-case'}</div>
                              <div className="text-slate-400">VA</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-red-100 text-center">
                              <div className="font-bold text-red-600">{d.usda > 0 ? `${d.usda} mo` : 'Case-by-case'}</div>
                              <div className="text-slate-400">USDA</div>
                            </div>
                          </div>
                        )}
                        {derogatory[d.id] && d.fha > 0 && (
                          <div className="mt-2">
                            <label className="block text-xs text-slate-400 mb-1">Date of Event (discharge/completion)</label>
                            <input type="date" value={derogatoryDates[d.id]||''} onChange={e => setDerogatoryDates(p => ({ ...p, [d.id]: e.target.value }))}
                              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300" />
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Collections */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">📋 Collections & Judgments</h2>
                <button onClick={addCollection} className="text-xs text-indigo-600 font-semibold">+ Add</button>
              </div>
              <p className="text-xs text-slate-400 mb-4">FHA ignores medical collections. Non-medical ≥ $2,000 aggregate may require payoff or LOE.</p>
              {collections.length === 0 ? <p className="text-sm text-slate-300 italic">None entered.</p> :
                <div className="space-y-2">
                  {collections.map(c => (
                    <div key={c.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <input type="text" value={c.creditor} placeholder="Creditor name" onChange={e => updateCollection(c.id, 'creditor', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <input type="number" value={c.amount} placeholder="$" onChange={e => updateCollection(c.id, 'amount', e.target.value)}
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <select value={c.type} onChange={e => updateCollection(c.id, 'type', e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                        <option value="medical">Medical</option>
                        <option value="non_medical">Non-Medical</option>
                        <option value="judgment">Judgment</option>
                      </select>
                      <select value={c.status} onChange={e => updateCollection(c.id, 'status', e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                        <option value="open">Open</option>
                        <option value="paid">Paid</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={c.loe} onChange={e => updateCollection(c.id, 'loe', e.target.checked)} className="accent-indigo-600" />
                        <span className="text-slate-500">LOE</span>
                      </label>
                      <button onClick={() => removeCollection(c.id)} className="text-slate-300 hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              }
            </div>

            {/* Rapid Rescore */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">⚡ Rapid Rescore Strategies</h2>
              <p className="text-xs text-slate-400 mb-4">Select strategies to document in the file. Rapid rescore results typically in 72 hours.</p>
              <div className="space-y-2">
                {RESCORE_STRATEGIES.map((s, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                    ${selectedStrategies[i] ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!selectedStrategies[i]} onChange={e => setSelectedStrategies(p => ({ ...p, [i]: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-indigo-600 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">{s.title}</div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-400">
                        <span>📈 {s.impact}</span>
                        <span>⏱ {s.timeframe}</span>
                        <span>💰 {s.cost}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Credit analysis notes, LOE explanations, rescore plan details..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Credit Intelligence™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {tier && (
              <div className={`rounded-xl border p-4 ${tier.badge} border-current`}>
                <h3 className="text-xs font-bold uppercase tracking-wide mb-2 opacity-70">Score Tier</h3>
                <div className="text-4xl font-black">{qualifyingScore}</div>
                <div className="text-sm font-bold mt-1">{tier.label}</div>
                <div className="text-xs mt-2 opacity-80">{tier.desc}</div>
              </div>
            )}

            {/* Utilization gauge */}
            {util > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Utilization</h3>
                <div className={`text-3xl font-black ${util > 50 ? 'text-red-500' : util > 30 ? 'text-amber-500' : 'text-emerald-500'}`}>{util}%</div>
                <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${util > 50 ? 'bg-red-400' : util > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(util, 100)}%` }} />
                </div>
                <div className="text-xs text-slate-400 mt-1">Target: &lt;10% for max score</div>
              </div>
            )}

            {/* Program eligibility */}
            {qualifyingScore > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Program Eligibility</h3>
                <div className="space-y-1.5">
                  {Object.entries(PROGRAM_MIN_SCORES).map(([prog, data]) => {
                    const pass = qualifyingScore >= data.score;
                    return (
                      <div key={prog} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs
                        ${pass ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100 opacity-60'}`}>
                        <span className={`font-semibold ${pass ? 'text-emerald-700' : 'text-slate-400'}`}>{prog}</span>
                        <span className={pass ? 'text-emerald-600 font-bold' : 'text-red-400 font-bold'}>
                          {pass ? `✓` : `✗ Need ${data.score}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• Use <strong>middle score</strong> of lower-scoring borrower</p>
                <p>• Utilization target: &lt;10% per card for max impact</p>
                <p>• Medical collections: FHA ignores them</p>
                <p>• Rapid rescore: 72-hr turnaround via lender</p>
                <p>• AU removal can help OR hurt — verify</p>
                <p>• BK Ch7: 2yr FHA, 4yr conventional</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
