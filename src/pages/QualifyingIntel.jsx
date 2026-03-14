// src/pages/QualifyingIntel.jsx
// LoanBeacons™ — Module 2 | Stage 1: Pre-Structure & Initial Analysis
// Qualifying Intelligence™ — DTI analysis, income qualification, program fit

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

// ─── Program DTI Limits ───────────────────────────────────────────────────────
const PROGRAMS = {
  FHA:          { label: 'FHA',           frontMax: 46.9, backMax: 56.9, minCredit: 580,  notes: 'AUS Accept/Eligible can exceed limits with compensating factors' },
  CONVENTIONAL: { label: 'Conventional',  frontMax: null, backMax: 50.0, minCredit: 620,  notes: 'DU/LPA may approve higher DTI with strong compensating factors' },
  HOMEREADY:    { label: 'HomeReady',      frontMax: null, backMax: 50.0, minCredit: 620,  notes: 'Income limit 80% AMI unless census tract eligible' },
  HOMEPOSSIBLE: { label: 'Home Possible',  frontMax: null, backMax: 45.0, minCredit: 660,  notes: 'Income limit 80% AMI unless census tract eligible' },
  VA:           { label: 'VA',             frontMax: null, backMax: 41.0, minCredit: 580,  notes: 'No hard limit — residual income is primary qualifier' },
  USDA:         { label: 'USDA',           frontMax: 29.0, backMax: 41.0, minCredit: 640,  notes: 'Strictest dual-ratio requirement — both must be met' },
};

// ─── Income Types ─────────────────────────────────────────────────────────────
const INCOME_TYPES = [
  { id: 'w2_salary',    label: 'W-2 Salary / Hourly',      docsNeeded: '2 years W-2s + 30-day paystub',                              stable: true  },
  { id: 'self_employ',  label: 'Self-Employed (1099/K-1)',  docsNeeded: '2 years tax returns (personal + business) + YTD P&L',        stable: false },
  { id: 'social_sec',   label: 'Social Security / SSI',     docsNeeded: 'Award letter + 2 months bank statements',                    stable: true  },
  { id: 'pension',      label: 'Pension / Retirement',      docsNeeded: 'Award letter + 12 months bank statements',                   stable: true  },
  { id: 'rental',       label: 'Rental Income',             docsNeeded: '2 years Schedule E + current leases',                       stable: false },
  { id: 'child_supp',   label: 'Child Support / Alimony',   docsNeeded: 'Court order + 12 months proof of receipt',                   stable: false },
  { id: 'part_time',    label: 'Part-Time / Second Job',    docsNeeded: '2 years history required + paystubs',                       stable: false },
  { id: 'overtime',     label: 'Overtime / Bonus',          docsNeeded: '2 years history required (12–18 mo with employer letter)',   stable: false },
  { id: 'investment',   label: 'Investment / Dividends',    docsNeeded: '2 years 1099-DIV + 2 years average',                        stable: false },
  { id: 'military',     label: 'Military / BAH / BAS',      docsNeeded: 'LES — all military income grossed up 25%',                  stable: true  },
];

// ─── Compensating Factors ─────────────────────────────────────────────────────
const COMP_FACTORS = [
  { id: 'reserves_12',    label: '12+ months PITI reserves',              impact: 'HIGH',   detail: 'Liquid assets covering 12+ months of total housing payment' },
  { id: 'low_payment_sh', label: 'Low payment shock (<20% increase)',     impact: 'HIGH',   detail: 'New PITI is less than 120% of current housing expense' },
  { id: 'stable_employ',  label: '2+ years same employer',                impact: 'MEDIUM', detail: 'Documented 24+ months with current employer, same field' },
  { id: 'credit_680',     label: 'Credit score 680+',                     impact: 'HIGH',   detail: 'Middle score of the lower-scoring borrower ≥ 680' },
  { id: 'min_increase',   label: 'Minimal increase in housing expense',   impact: 'MEDIUM', detail: 'Proposed PITI ≤ 105% of current housing expense' },
  { id: 'additional_inc', label: 'Documented non-qualifying income',      impact: 'MEDIUM', detail: 'Income that exists but cannot be used to qualify (e.g., <2yr history)' },
  { id: 'low_ltv',        label: 'Low LTV (≤75%)',                        impact: 'HIGH',   detail: 'Significant equity position reduces lender risk' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = n => n ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtPct = n => isNaN(n) || !isFinite(n) ? '—' : Number(n).toFixed(1) + '%';

function calcPI(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function dtiColor(dti, max) {
  if (!dti || isNaN(dti)) return 'text-slate-400';
  if (!max) return dti > 50 ? 'text-red-600' : dti > 43 ? 'text-amber-600' : 'text-emerald-600';
  if (dti > max) return 'text-red-600';
  if (dti > max * 0.9) return 'text-amber-600';
  return 'text-emerald-600';
}

function dtiBg(dti, max) {
  if (!dti || isNaN(dti)) return 'bg-slate-50 border-slate-200';
  if (!max) return dti > 50 ? 'bg-red-50 border-red-200' : dti > 43 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';
  if (dti > max) return 'bg-red-50 border-red-200';
  if (dti > max * 0.9) return 'bg-amber-50 border-amber-200';
  return 'bg-emerald-50 border-emerald-200';
}

// ─── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-0.5">
          {icon && <span className="text-lg">{icon}</span>}
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5 ml-7">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Program Fit Row ───────────────────────────────────────────────────────────
function ProgramFitRow({ prog, key: k, frontDTI, backDTI, creditScore }) {
  const frontPass = !prog.frontMax || frontDTI <= prog.frontMax;
  const backPass = backDTI <= prog.backMax;
  const creditPass = !creditScore || creditScore >= prog.minCredit;
  const eligible = frontPass && backPass && creditPass;

  return (
    <tr className={`border-b border-slate-50 ${eligible ? 'hover:bg-emerald-50/30' : 'hover:bg-red-50/20'}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${eligible ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <span className="text-sm font-bold text-slate-800">{prog.label}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {prog.frontMax
          ? <span className={`text-sm font-bold ${frontPass ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmtPct(frontDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.frontMax}%</span>
            </span>
          : <span className="text-xs text-slate-400">No limit</span>
        }
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`text-sm font-bold ${backPass ? 'text-emerald-600' : 'text-red-600'}`}>
          {fmtPct(backDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.backMax}%</span>
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border
          ${eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {eligible ? '✓ Qualifies' : '✗ Fails'}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-400 max-w-xs">{prog.notes}</td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function QualifyingIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  // Income entries
  const [incomes, setIncomes] = useState([
    { id: 1, type: 'w2_salary', gross: '', note: '' }
  ]);
  const [coborrowerIncomes, setCoborrowerIncomes] = useState([]);

  // Debts
  const [debts, setDebt] = useState('');

  // Housing
  const [loanAmount, setLoanAmount] = useState('');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('360');
  const [taxes, setTaxes] = useState('');
  const [insurance, setInsurance] = useState('');
  const [hoa, setHoa] = useState('');
  const [mi, setMi] = useState('');
  const [creditScore, setCreditScore] = useState('');
  const [compFactors, setCompFactors] = useState({});
  const [incomeTypes, setIncomeTypes] = useState({});
  const [notes, setNotes] = useState('');

  // Load scenario
  useEffect(() => {
    if (!scenarioId) {
      // Load all scenarios for selector
      import('firebase/firestore').then(({ collection, getDocs }) => {
        getDocs(collection(db, 'scenarios')).then(snap => {
          setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
      });
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        // Pre-populate
        if (d.loanAmount)     setLoanAmount(String(d.loanAmount));
        if (d.interestRate)   setRate(String(d.interestRate));
        if (d.term)           setTerm(String(d.term));
        if (d.propTaxes)      setTaxes(String(d.propTaxes));
        if (d.homeInsurance)  setInsurance(String(d.homeInsurance));
        if (d.hoaDues)        setHoa(String(d.hoaDues));
        if (d.mortgageInsurance) setMi(String(d.mortgageInsurance));
        if (d.monthlyDebts)   setDebt(String(d.monthlyDebts));
        if (d.creditScore)    setCreditScore(String(d.creditScore));
        if (d.monthlyIncome)  setIncomes([{ id: 1, type: 'w2_salary', gross: String(d.monthlyIncome), note: '' }]);
        if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
          setCoborrowerIncomes([{ id: 1, type: 'w2_salary', gross: String(d.coBorrowerIncome), note: '' }]);
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ── Calculations ─────────────────────────────────────────────────────────
  const totalBorrowerIncome = incomes.reduce((s, i) => s + (parseFloat(i.gross) || 0), 0);
  const totalCoBorrowerIncome = coborrowerIncomes.reduce((s, i) => s + (parseFloat(i.gross) || 0), 0);
  const totalIncome = totalBorrowerIncome + totalCoBorrowerIncome;

  const pi = calcPI(parseFloat(loanAmount), parseFloat(rate), parseInt(term));
  const totalHousing = pi + (parseFloat(taxes) || 0) + (parseFloat(insurance) || 0) + (parseFloat(hoa) || 0) + (parseFloat(mi) || 0);
  const totalDebts = parseFloat(debts) || 0;

  const frontDTI = totalIncome > 0 ? (totalHousing / totalIncome) * 100 : 0;
  const backDTI  = totalIncome > 0 ? ((totalHousing + totalDebts) / totalIncome) * 100 : 0;

  const cfCount = Object.values(compFactors).filter(Boolean).length;

  const programResults = Object.entries(PROGRAMS).map(([key, prog]) => {
    const frontPass = !prog.frontMax || frontDTI <= prog.frontMax;
    const backPass = backDTI <= prog.backMax;
    const creditPass = !creditScore || parseInt(creditScore) >= prog.minCredit;
    return { key, prog, eligible: frontPass && backPass && creditPass };
  });

  const eligiblePrograms = programResults.filter(r => r.eligible);
  const overallPass = eligiblePrograms.length > 0;

  // ── Save to Decision Record ───────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('QUALIFYING_INTEL', {
        totalIncome,
        totalBorrowerIncome,
        totalCoBorrowerIncome,
        totalHousing,
        totalDebts,
        frontDTI: parseFloat(frontDTI.toFixed(2)),
        backDTI: parseFloat(backDTI.toFixed(2)),
        creditScore: parseInt(creditScore) || null,
        piPayment: parseFloat(pi.toFixed(2)),
        eligiblePrograms: eligiblePrograms.map(r => r.key),
        compensatingFactors: Object.keys(compFactors).filter(k => compFactors[k]),
        compensatingFactorCount: cfCount,
        incomeTypes: Object.keys(incomeTypes).filter(k => incomeTypes[k]),
        loNotes: notes,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error('Decision Record save failed:', e); }
    finally { setRecordSaving(false); }
  };

  const addIncome = (setter) => setter(prev => [...prev, { id: Date.now(), type: 'w2_salary', gross: '', note: '' }]);
  const updateIncome = (setter, id, field, val) => setter(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));
  const removeIncome = (setter, id) => setter(prev => prev.filter(i => i.id !== id));

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading scenario…</span>
      </div>
    </div>
  );

  // Scenario selector if no scenarioId
  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <button onClick={() => navigate('/')} className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2 text-sm">← Back to Dashboard</button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">02</div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Qualifying Intelligence™</h1>
            <p className="text-sm text-gray-500">Stage 1 — Pre-Structure & Initial Analysis</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-800 mb-1">Select a Scenario</h2>
          <p className="text-sm text-gray-500 mb-4">Choose a scenario to run qualifying analysis</p>
          {scenarios.length === 0
            ? <p className="text-gray-400 text-sm">No scenarios found. Create one in Scenario Creator first.</p>
            : <div className="space-y-2">
                {scenarios.map(s => (
                  <button key={s.id} onClick={() => navigate(`/qualifying-intel?scenarioId=${s.id}`)}
                    className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                    <div className="font-semibold text-gray-800">{s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ${parseFloat(s.loanAmount || 0).toLocaleString()} · {s.loanType || '--'} · Credit: {s.creditScore || '--'}
                    </div>
                  </button>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );

  const borrower = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || scenario.borrowerName : null;

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 2</span>
              </div>
              <h1 className="text-2xl font-bold">Qualifying Intelligence™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">
                {borrower ? `${borrower} · ` : ''}DTI Analysis · Income Qualification · Program Fit
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              {overallPass
                ? <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">✓ {eligiblePrograms.length} Program{eligiblePrograms.length !== 1 ? 's' : ''} Eligible</span>
                : totalIncome > 0
                  ? <span className="bg-red-500/20 text-red-300 text-xs px-3 py-1 rounded-full border border-red-400/30 font-semibold">✗ No Programs Qualify</span>
                  : null
              }
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Income Section */}
            <Section title="Borrower Income" subtitle="Enter all qualifying income sources. Each type has specific documentation requirements." icon="💼">
              <div className="space-y-3">
                {incomes.map((inc, idx) => (
                  <div key={inc.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-5">
                      <label className="block text-xs text-slate-400 mb-1">{idx === 0 ? 'Income Type' : ''}</label>
                      <select value={inc.type} onChange={e => updateIncome(setIncomes, inc.id, 'type', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                        {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs text-slate-400 mb-1">{idx === 0 ? 'Monthly Gross ($)' : ''}</label>
                      <input type="number" value={inc.gross} placeholder="0"
                        onChange={e => updateIncome(setIncomes, inc.id, 'gross', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">{idx === 0 ? 'Note' : ''}</label>
                      <input type="text" value={inc.note} placeholder="optional"
                        onChange={e => updateIncome(setIncomes, inc.id, 'note', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    </div>
                    <div className="col-span-1 flex items-end pb-2">
                      {incomes.length > 1 && (
                        <button onClick={() => removeIncome(setIncomes, inc.id)} className="text-slate-300 hover:text-red-400 text-lg leading-none">✕</button>
                      )}
                    </div>
                    {/* Docs needed */}
                    <div className="col-span-11 col-start-1">
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                        📎 {INCOME_TYPES.find(t => t.id === inc.type)?.docsNeeded}
                      </p>
                    </div>
                  </div>
                ))}
                <button onClick={() => addIncome(setIncomes)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 mt-1">
                  + Add Income Source
                </button>
              </div>

              {/* Co-borrower */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Co-Borrower Income</p>
                  {coborrowerIncomes.length === 0 && (
                    <button onClick={() => addIncome(setCoborrowerIncomes)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">+ Add Co-Borrower</button>
                  )}
                </div>
                {coborrowerIncomes.map((inc, idx) => (
                  <div key={inc.id} className="grid grid-cols-12 gap-2 items-start mb-3">
                    <div className="col-span-5">
                      <select value={inc.type} onChange={e => updateIncome(setCoborrowerIncomes, inc.id, 'type', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                        {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input type="number" value={inc.gross} placeholder="0"
                        onChange={e => updateIncome(setCoborrowerIncomes, inc.id, 'gross', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                    </div>
                    <div className="col-span-2">
                      <input type="text" value={inc.note} placeholder="optional"
                        onChange={e => updateIncome(setCoborrowerIncomes, inc.id, 'note', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                    </div>
                    <div className="col-span-1 flex items-center pt-2">
                      <button onClick={() => removeIncome(setCoborrowerIncomes, inc.id)} className="text-slate-300 hover:text-red-400 text-lg leading-none">✕</button>
                    </div>
                  </div>
                ))}
                {coborrowerIncomes.length > 0 && (
                  <button onClick={() => addIncome(setCoborrowerIncomes)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1">
                    + Add Co-Borrower Income Source
                  </button>
                )}
              </div>
            </Section>

            {/* Housing + Debts */}
            <Section title="Housing Payment & Debts" subtitle="PITI auto-calculated from loan details. Debts from credit report." icon="🏠">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Loan Amount ($)', val: loanAmount, set: setLoanAmount, ph: '300000' },
                  { label: 'Interest Rate (%)', val: rate, set: setRate, ph: '7.250' },
                  { label: 'Term (months)', val: term, set: setTerm, ph: '360' },
                  { label: 'Property Taxes (mo)', val: taxes, set: setTaxes, ph: '350' },
                  { label: 'Home Insurance (mo)', val: insurance, set: setInsurance, ph: '120' },
                  { label: 'HOA Dues (mo)', val: hoa, set: setHoa, ph: '0' },
                  { label: 'MI / MIP (mo)', val: mi, set: setMi, ph: '0' },
                  { label: 'Monthly Debts ($)', val: debts, set: setDebt, ph: '850' },
                  { label: 'Credit Score (Mid)', val: creditScore, set: setCreditScore, ph: '720' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <input type="number" value={f.val} placeholder={f.ph}
                      onChange={e => f.set(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  </div>
                ))}
              </div>

              {/* Live PITI summary */}
              {totalHousing > 0 && (
                <div className="bg-slate-900 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4 mt-2">
                  <div className="flex gap-6 text-xs">
                    <div><span className="text-slate-400">P&I </span><span className="text-white font-bold font-mono">{fmt$(pi)}</span></div>
                    <div><span className="text-slate-400">Taxes </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(taxes))}</span></div>
                    <div><span className="text-slate-400">Ins </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(insurance))}</span></div>
                    {parseFloat(mi) > 0 && <div><span className="text-slate-400">MI </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(mi))}</span></div>}
                    {parseFloat(hoa) > 0 && <div><span className="text-slate-400">HOA </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(hoa))}</span></div>}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Total PITI</div>
                    <div className="text-xl font-black text-white font-mono">{fmt$(totalHousing)}</div>
                  </div>
                </div>
              )}
            </Section>

            {/* DTI Results */}
            {totalIncome > 0 && totalHousing > 0 && (
              <Section title="DTI Analysis" subtitle="Debt-to-Income ratios calculated across all applicable programs." icon="📊">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Total Qualifying Income', val: fmt$(totalIncome), sub: '/month', color: 'emerald' },
                    { label: 'Total PITI', val: fmt$(totalHousing), sub: '/month', color: 'blue' },
                    { label: 'Front-End DTI', val: fmtPct(frontDTI), sub: 'housing ÷ income', color: frontDTI > 36 ? 'red' : frontDTI > 28 ? 'amber' : 'emerald' },
                    { label: 'Back-End DTI', val: fmtPct(backDTI), sub: 'all debts ÷ income', color: backDTI > 50 ? 'red' : backDTI > 43 ? 'amber' : 'emerald' },
                  ].map(item => (
                    <div key={item.label} className={`rounded-xl p-4 border text-center
                      bg-${item.color}-50 border-${item.color}-200`}>
                      <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                      <div className={`text-2xl font-black font-mono text-${item.color}-700`}>{item.val}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Program fit table */}
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Program</th>
                        <th className="text-center px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Front-End</th>
                        <th className="text-center px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Back-End</th>
                        <th className="text-center px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Result</th>
                        <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(PROGRAMS).map(([key, prog]) => (
                        <ProgramFitRow key={key} prog={prog} frontDTI={frontDTI} backDTI={backDTI} creditScore={parseInt(creditScore)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Compensating Factors */}
            <Section title="Compensating Factors" subtitle="Document all factors that support approval at elevated DTI. Each factor matters in manual underwriting." icon="⚖️">
              <div className="space-y-2">
                {COMP_FACTORS.map(cf => (
                  <label key={cf.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                    ${compFactors[cf.id] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!compFactors[cf.id]}
                      onChange={e => setCompFactors(p => ({ ...p, [cf.id]: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${compFactors[cf.id] ? 'text-emerald-800' : 'text-slate-700'}`}>{cf.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                          ${cf.impact === 'HIGH' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {cf.impact}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{cf.detail}</p>
                    </div>
                  </label>
                ))}
              </div>
              {cfCount > 0 && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <p className="text-sm font-bold text-emerald-700">
                    ✓ {cfCount} compensating factor{cfCount !== 1 ? 's' : ''} documented
                    {cfCount >= 2 ? ' — strong manual underwrite position' : ' — continue documenting additional factors'}
                  </p>
                </div>
              )}
            </Section>

            {/* Income Documentation Checklist */}
            <Section title="Income Documentation Checklist" subtitle="Check off each item as it is obtained and added to the file." icon="📎">
              <div className="space-y-2">
                {INCOME_TYPES.filter(t => incomeTypes[t.id]).map(t => (
                  <div key={t.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${t.stable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{t.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">📎 {t.docsNeeded}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Income Types Present in This File</p>
                <div className="flex flex-wrap gap-2">
                  {INCOME_TYPES.map(t => (
                    <label key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold transition-all
                      ${incomeTypes[t.id] ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                      <input type="checkbox" checked={!!incomeTypes[t.id]}
                        onChange={e => setIncomeTypes(p => ({ ...p, [t.id]: e.target.checked }))}
                        className="hidden" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            </Section>

            {/* LO Notes */}
            <Section title="LO Notes" subtitle="Qualifying notes, compensating factor details, or documentation references." icon="📝">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                placeholder="Document qualifying rationale, compensating factors, unusual income types, or underwriter notes..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none" />
            </Section>

            {/* Decision Record Banner */}
            {scenarioId && (
              <DecisionRecordBanner
                recordId={savedRecordId}
                moduleName="Qualifying Intelligence™"
                onSave={handleSaveToRecord}
                saving={recordSaving}
              />
            )}

          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Income Summary */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Income Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Borrower Income', fmt$(totalBorrowerIncome) + '/mo'],
                  ['Co-Borrower Income', fmt$(totalCoBorrowerIncome) + '/mo'],
                  ['Total Qualifying', fmt$(totalIncome) + '/mo'],
                  ['Annual (×12)', fmt$(totalIncome * 12)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className="font-bold text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* DTI Summary */}
            {totalIncome > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">DTI Summary</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Front-End DTI', val: frontDTI, guideline: 28, max: 46.9 },
                    { label: 'Back-End DTI', val: backDTI, guideline: 43, max: 56.9 },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-500">{item.label}</span>
                        <span className={`text-sm font-black font-mono ${dtiColor(item.val, item.max)}`}>{fmtPct(item.val)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          item.val > item.max ? 'bg-red-500' : item.val > item.guideline ? 'bg-amber-400' : 'bg-emerald-500'
                        }`} style={{ width: `${Math.min(item.val / item.max * 100, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-300 mt-0.5">
                        <span>0%</span><span>Guideline {item.guideline}%</span><span>Max {item.max}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Program Eligibility */}
            {totalIncome > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Program Eligibility</h3>
                <div className="space-y-1.5">
                  {programResults.map(({ key, prog, eligible }) => (
                    <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs
                      ${eligible ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
                      <span className={`font-semibold ${eligible ? 'text-emerald-700' : 'text-slate-400'}`}>{prog.label}</span>
                      <span className={eligible ? 'text-emerald-600 font-bold' : 'text-red-400 font-bold'}>
                        {eligible ? '✓' : '✗'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comp factors summary */}
            {cfCount > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">Compensating Factors</h3>
                <div className="text-2xl font-black text-emerald-600 mb-1">{cfCount}</div>
                <p className="text-xs text-emerald-600">factor{cfCount !== 1 ? 's' : ''} documented</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
