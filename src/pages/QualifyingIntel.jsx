// src/pages/QualifyingIntel.jsx
// LoanBeacons™ — Module 2 | Stage 1: Pre-Structure & Initial Analysis
// Qualifying Intelligence™ — DTI analysis, income qualification, program fit

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

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
  {
    id: 'w2_salary', label: 'W-2 Salary / Hourly', stable: true, grossUp: false,
    docsNeeded: '2 years W-2s + 30-day paystub',
    calcRule: 'Use YTD gross ÷ months elapsed. If declining income, use lower year.',
    docs: ['Most recent 30-day paystub', 'W-2 for prior year', 'W-2 for year before that', 'VOE if < 2 years at employer'],
    continuance: false,
  },
  {
    id: 'fulltime_second', label: 'Full-Time Second Job', stable: false, grossUp: false,
    docsNeeded: '2 years uninterrupted history required + paystubs from both jobs',
    calcRule: '2-year history required with no gaps. Cannot be used if < 24 months. Average last 2 years.',
    docs: ['2 years W-2s from second employer', '30-day paystubs from second job', 'Employer letter confirming current status'],
    continuance: false,
    warning: 'FHA and conventional both require full 24-month history. No exceptions for recent second jobs.',
  },
  {
    id: 'part_time', label: 'Part-Time / Seasonal Job', stable: false, grossUp: false,
    docsNeeded: '2 years history required + paystubs',
    calcRule: 'Average income over 24 months including gaps. Cannot use if < 24 months consistent history.',
    docs: ['2 years W-2s', '30-day paystubs', 'Employer letter if seasonal'],
    continuance: false,
  },
  {
    id: 'self_employ', label: 'Self-Employed (1099/K-1)', stable: false, grossUp: false,
    docsNeeded: '2 years personal + business tax returns + YTD P&L + business license',
    calcRule: 'Use 24-month average of net income after add-backs (depreciation, depletion, mileage). Declining income = use lower year.',
    docs: ['2 years personal tax returns (1040)', '2 years business tax returns (1120/1120S/1065)', 'YTD Profit & Loss (CPA-prepared or borrower-signed)', 'Business license or CPA letter confirming 2+ years', 'Business bank statements (12–24 months)'],
    continuance: false,
    warning: 'Declining income between years requires use of lower year. Business losses must be applied against personal income.',
  },
  {
    id: 'commission', label: 'Commission / Variable Pay', stable: false, grossUp: false,
    docsNeeded: '2 years W-2s + YTD paystub + employer letter confirming base + commission structure',
    calcRule: 'If commission > 25% of total income: 24-month average required. Use YTD if higher and trending up.',
    docs: ['2 years W-2s', 'YTD paystub showing commission breakdown', 'Employer letter confirming commission structure', '2 years 1099 if independent contractor'],
    continuance: false,
    warning: 'If commission income has declined year over year, use the lower figure. Volatile commission income may require additional compensating factors.',
  },
  {
    id: 'overtime', label: 'Overtime / Bonus', stable: false, grossUp: false,
    docsNeeded: '2 years history required (12–18 months with strong employer letter)',
    calcRule: 'Average over 24 months. If declining, use lower period or exclude. Employer must confirm likelihood of continuance.',
    docs: ['2 years W-2s showing overtime/bonus', 'YTD paystub', 'Employer letter confirming likely continuance'],
    continuance: true,
  },
  {
    id: 'social_sec', label: 'Social Security / SSI', stable: true, grossUp: true,
    docsNeeded: 'Award letter + 2 months bank statements showing direct deposit',
    calcRule: 'Non-taxable SSI/disability can be grossed up 25% for qualifying. Verify with tax returns whether currently taxed.',
    docs: ['SSA award letter (within 12 months)', '2 months bank statements confirming deposits', 'Tax returns to confirm non-taxable status (if grossing up)'],
    continuance: true,
    grossUpNote: 'Non-taxable SSI can be grossed up 25% → divide monthly amount by 0.75 for qualifying income.',
  },
  {
    id: 'pension', label: 'Pension / Retirement', stable: true, grossUp: false,
    docsNeeded: 'Award letter + 12 months bank statements',
    calcRule: 'Use current monthly benefit. If non-taxable (Roth/disability pension), gross up 25%.',
    docs: ['Pension award/benefit letter', '12 months bank statements', '1099-R if applicable'],
    continuance: true,
    grossUpNote: 'Non-taxable pension distributions may be grossed up 25% — verify tax status.',
  },
  {
    id: 'rental', label: 'Rental Income', stable: false, grossUp: false,
    docsNeeded: '2 years Schedule E + current signed leases + property management agreements',
    calcRule: 'Use 75% of gross rent (vacancy factor) OR Schedule E net + depreciation add-back — whichever applies per program guidelines.',
    docs: ['2 years personal tax returns with Schedule E', 'Current signed leases', 'Mortgage statement for rental property', 'Property management agreement (if applicable)'],
    continuance: false,
    warning: 'Cannot use rental income if property has < 2-year rental history on taxes. New rental income requires current lease + 30% equity in rental property.',
  },
  {
    id: 'child_supp', label: 'Child Support / Alimony', stable: false, grossUp: false,
    docsNeeded: 'Court order + 12 months proof of receipt + divorce decree',
    calcRule: 'Must document consistent receipt for 12 months. Must have 3+ years continuance remaining from closing date.',
    docs: ['Divorce decree or separation agreement', 'Court order showing amount and duration', '12 months bank statements confirming receipt', 'Copy of any modification orders'],
    continuance: true,
    warning: 'Must have at least 3 years of documented continuance remaining. Voluntary payments without court order cannot be used.',
  },
  {
    id: 'military', label: 'Military / BAH / BAS', stable: true, grossUp: true,
    docsNeeded: 'Most recent LES (Leave and Earnings Statement)',
    calcRule: 'All military income including BAH and BAS is grossed up 25% for qualifying (non-taxable allowances).',
    docs: ['Most recent LES showing all pay components', 'Orders if recently reassigned', 'VA award letter if receiving disability pay'],
    continuance: false,
    grossUpNote: 'BAH and BAS are non-taxable — gross up 25% → divide by 0.75 for qualifying income.',
  },
  {
    id: 'disability', label: 'Disability Income', stable: true, grossUp: true,
    docsNeeded: 'Award letter + bank statements confirming deposits',
    calcRule: 'Non-taxable disability income can be grossed up 25%. VA disability is always non-taxable.',
    docs: ['Disability award letter (SSA, VA, or private insurer)', '12 months bank statements', 'Tax returns to confirm non-taxable status'],
    continuance: true,
    grossUpNote: 'VA disability and SSA disability are non-taxable — gross up 25% for qualifying.',
  },
  {
    id: 'investment', label: 'Investment / Dividends', stable: false, grossUp: false,
    docsNeeded: '2 years 1099-DIV/1099-INT + 2 years tax returns + asset statements confirming assets still held',
    calcRule: 'Average 24-month history. Must confirm assets generating income are still held and sufficient.',
    docs: ['2 years 1099-DIV or 1099-INT', '2 years tax returns', '2 months most recent asset statements', 'Evidence assets are still held'],
    continuance: true,
  },
  {
    id: 'rsu_stock', label: 'RSU / Stock Compensation', stable: false, grossUp: false,
    docsNeeded: '2 years W-2s showing RSU/stock income + vesting schedule + employer letter',
    calcRule: '24-month average required. Must document vesting schedule confirms continuance for 3+ years.',
    docs: ['2 years W-2s with RSU/stock income broken out', 'Vesting schedule from employer', 'Employer letter confirming future vesting', 'Grant agreements'],
    continuance: true,
    warning: 'Cannot use RSU income if vesting schedule ends within 3 years of closing. Highly variable — most underwriters require strong compensating factors.',
  },
  {
    id: 'foster_care', label: 'Foster Care Income', stable: true, grossUp: true,
    docsNeeded: 'Agency documentation + 2 years history of receipt',
    calcRule: 'Non-taxable foster care payments can be grossed up 25%. Must have 2-year documented history.',
    docs: ['Foster care agency agreement', '2 years documentation of receipt', 'Bank statements confirming deposits'],
    continuance: true,
    grossUpNote: 'Foster care payments are non-taxable — gross up 25% for qualifying.',
  },
  {
    id: 'notes_receivable', label: 'Notes Receivable', stable: false, grossUp: false,
    docsNeeded: '2 years tax returns showing interest income + copy of executed note + evidence of payment history',
    calcRule: 'Must have 3+ years of documented continuance remaining. Use 24-month average from tax returns.',
    docs: ['Executed promissory note', '2 years tax returns showing interest income', '12 months bank statements confirming receipt', 'Evidence of borrower ability to continue payments'],
    continuance: true,
  },
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
const fmt$ = n => {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
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
function ProgramFitRow({ prog, progKey, frontDTI, backDTI, creditScore, totalIncome }) {
  const frontPass = !prog.frontMax || frontDTI <= prog.frontMax;
  const backPass = progKey === 'VA' ? true : backDTI <= prog.backMax; // VA: no hard DTI limit
  const creditPass = !creditScore || creditScore >= prog.minCredit;
  const eligible = frontPass && backPass && creditPass;
  const isVA = progKey === 'VA';
  const vaOverDTI = isVA && backDTI > prog.backMax;

  // USDA gap calculation
  const usdaFrontGap = prog.frontMax && !frontPass && totalIncome > 0
    ? (totalIncome * prog.frontMax / 100) : null;

  return (
    <tr className={`border-b border-slate-50 ${eligible ? 'hover:bg-emerald-50/30' : 'hover:bg-red-50/20'}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${eligible || isVA ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <span className="text-sm font-bold text-slate-800">{prog.label}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {prog.frontMax
          ? <div>
              <span className={`text-sm font-bold ${frontPass ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmtPct(frontDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.frontMax}%</span>
              </span>
              {!frontPass && usdaFrontGap && (
                <p className="text-xs text-red-500 mt-0.5">
                  Need {fmt$(usdaFrontGap)}/mo income to meet limit
                </p>
              )}
            </div>
          : <span className="text-xs text-slate-400">No limit</span>
        }
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`text-sm font-bold ${isVA && vaOverDTI ? 'text-amber-600' : backPass ? 'text-emerald-600' : 'text-red-600'}`}>
          {fmtPct(backDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.backMax}%</span>
        </span>
        {isVA && vaOverDTI && (
          <p className="text-xs text-amber-600 mt-0.5">Review residual income</p>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {isVA
          ? <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              vaOverDTI
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {vaOverDTI ? '⚠ Check Residual' : '✓ Qualifies'}
            </span>
          : <span className={`text-xs font-bold px-2.5 py-1 rounded-full border
              ${eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              {eligible ? '✓ Qualifies' : '✗ Fails'}
            </span>
        }
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
        if (d.creditScore)    {
          // Use lowest middle score across all borrowers — same logic as ScenarioCreator
          const allScores = [
            parseInt(d.creditScore) || null,
            ...(d.coBorrowers || []).map(cb => parseInt(cb.creditScore) || null),
          ].filter(s => s && s > 300 && s <= 850);
          const qualifyingScore = allScores.length > 0 ? Math.min(...allScores) : parseInt(d.creditScore);
          setCreditScore(String(qualifyingScore));
        }
        if (d.monthlyIncome)  setIncomes([{ id: 1, type: 'w2_salary', gross: String(d.monthlyIncome), note: '', nonTaxableConfirmed: false }]);
        // Fix: use coBorrowers array income if available, fall back to legacy field
        const coBorrowersWithIncome = (d.coBorrowers || []).filter(cb => parseFloat(cb.monthlyIncome) > 0);
        if (coBorrowersWithIncome.length > 0) {
          setCoborrowerIncomes(coBorrowersWithIncome.map((cb, i) => ({
            id: i + 1,
            type: 'w2_salary',
            gross: String(cb.monthlyIncome),
            note: `${cb.firstName || ''} ${cb.lastName || ''}`.trim(),
            nonTaxableConfirmed: false,
          })));
        } else if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
          setCoborrowerIncomes([{ id: 1, type: 'w2_salary', gross: String(d.coBorrowerIncome), note: '', nonTaxableConfirmed: false }]);
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ── Calculations ─────────────────────────────────────────────────────────
  // Grossed-up income: non-taxable types confirmed by LO are divided by 0.75
  const getQualifyingIncome = (inc) => {
    const raw = parseFloat(inc.gross) || 0;
    const incType = INCOME_TYPES.find(t => t.id === inc.type);
    if (incType?.grossUp && inc.nonTaxableConfirmed) return raw / 0.75;
    return raw;
  };

  const totalBorrowerIncome = incomes.reduce((s, i) => s + getQualifyingIncome(i), 0);
  const totalCoBorrowerIncome = coborrowerIncomes.reduce((s, i) => s + getQualifyingIncome(i), 0);
  const totalIncome = totalBorrowerIncome + totalCoBorrowerIncome;

  const pi = calcPI(parseFloat(loanAmount), parseFloat(rate), parseInt(term));
  const totalHousing = pi + (parseFloat(taxes) || 0) + (parseFloat(insurance) || 0) + (parseFloat(hoa) || 0) + (parseFloat(mi) || 0);
  const totalDebts = parseFloat(debts) || 0;

  const frontDTI = totalIncome > 0 ? (totalHousing / totalIncome) * 100 : 0;
  const backDTI  = totalIncome > 0 ? ((totalHousing + totalDebts) / totalIncome) * 100 : 0;

  const cfCount = Object.values(compFactors).filter(Boolean).length;

  // Required income gap — at 43% back-end
  const requiredIncome43 = totalHousing + totalDebts > 0 ? (totalHousing + totalDebts) / 0.43 : 0;
  const incomeGap = requiredIncome43 - totalIncome;

  const programResults = Object.entries(PROGRAMS).map(([key, prog]) => {
    const frontPass = !prog.frontMax || frontDTI <= prog.frontMax;
    const backPass = key === 'VA' ? true : backDTI <= prog.backMax;
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

  const addIncome = (setter) => setter(prev => [...prev, { id: Date.now(), type: 'w2_salary', gross: '', note: '', nonTaxableConfirmed: false }]);
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
  const coBorrowerNames = scenario?.coBorrowers?.filter(cb => cb.firstName || cb.lastName)
    .map(cb => `${cb.firstName || ''} ${cb.lastName || ''}`.trim()) || [];
  const propertyAddress = scenario ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 2</span>
              </div>
              <h1 className="text-2xl font-bold">Qualifying Intelligence™</h1>
              <p className="text-indigo-300 text-sm mt-0.5">DTI Analysis · Income Qualification · Program Fit</p>
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

          {/* Borrower identity card */}
          {scenario && (
            <div className="border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Left — Borrower info */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">Borrower(s)</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{borrower || 'Unknown Borrower'}</span>
                  <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">Primary</span>
                  {scenario.creditScore && (
                    <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">FICO {creditScore}</span>
                  )}
                </div>
                {coBorrowerNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-indigo-200">{name}</span>
                    <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10">Co-Borrower {i + 1}</span>
                    {scenario.coBorrowers[i]?.creditScore && (
                      <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">FICO {scenario.coBorrowers[i].creditScore}</span>
                    )}
                  </div>
                ))}
                {propertyAddress && (
                  <p className="text-xs text-indigo-300 mt-1">📍 {propertyAddress}</p>
                )}
                {scenario.loanType && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.loanType}</span>
                    {scenario.loanPurpose && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.loanPurpose}</span>}
                    {scenario.loanAmount && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">${Number(scenario.loanAmount).toLocaleString()}</span>}
                    {scenario.propertyType && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.propertyType}</span>}
                    {scenario.occupancy && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.occupancy}</span>}
                  </div>
                )}
              </div>

              {/* Right — Reference IDs */}
              <div>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">File Reference IDs</p>
                <div className="space-y-1.5">
                  {scenario.loanBeaconsRef && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-indigo-400 w-20 shrink-0">LB Ref</span>
                      <span className="text-xs font-mono font-bold text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded">{scenario.loanBeaconsRef}</span>
                    </div>
                  )}
                  {scenario.losLoanNumber && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-indigo-400 w-20 shrink-0">LOS Loan #</span>
                      <span className="text-xs font-mono text-white/80 bg-white/10 px-2 py-0.5 rounded">{scenario.losLoanNumber}</span>
                    </div>
                  )}
                  {scenario.ausCaseNumber && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-indigo-400 w-20 shrink-0">AUS Case #</span>
                      <span className="text-xs font-mono text-purple-300 bg-purple-500/20 border border-purple-400/30 px-2 py-0.5 rounded">{scenario.ausCaseNumber}</span>
                    </div>
                  )}
                  {!scenario.loanBeaconsRef && !scenario.losLoanNumber && !scenario.ausCaseNumber && (
                    <p className="text-xs text-white/40 italic">No reference IDs on file — add them in Scenario Creator</p>
                  )}
                  {scenario.scenarioName && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
                      <span className="text-xs text-indigo-400 w-20 shrink-0">Scenario</span>
                      <span className="text-xs text-white/70">{scenario.scenarioName}</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Borrower name mismatch warning */}
            {scenario && borrower && scenario.scenarioName &&
              !scenario.scenarioName.toLowerCase().includes((scenario.firstName || '').toLowerCase()) &&
              !scenario.scenarioName.toLowerCase().includes((scenario.lastName || '').toLowerCase()) && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-xl px-5 py-4 flex items-start gap-3">
                <span className="text-red-500 text-xl shrink-0">⚠</span>
                <div>
                  <p className="text-sm font-bold text-red-800">Borrower Name Mismatch Detected</p>
                  <p className="text-sm text-red-700 mt-1">
                    The scenario is named <strong>"{scenario.scenarioName}"</strong> but the borrower on file is <strong>{borrower}</strong>.
                    This analysis belongs to <strong>{borrower}</strong> — not whoever is named in the scenario title.
                  </p>
                  <p className="text-xs text-red-600 mt-2">
                    To fix this permanently: go back to Scenario Creator, open this scenario, correct the borrower name fields, and save. The scenario name will auto-update.
                  </p>
                  <button onClick={() => navigate(`/scenario-creator/${scenarioId}`)}
                    className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 underline">
                    → Go to Scenario Creator to fix
                  </button>
                </div>
              </div>
            )}
            <Section title="Borrower Income" subtitle="Enter all qualifying income sources. Each type has specific documentation requirements." icon="💼">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs font-bold text-blue-800">📄 Always enter the raw amount from the award letter or document</p>
                <p className="text-xs text-blue-700 mt-1">Enter exactly what the document says — do not pre-calculate gross-ups or averages. LoanBeacons handles the math. For non-taxable income (SSI, VA disability, military BAH/BAS, foster care), check the confirmation box and the grossed-up qualifying amount will be calculated automatically.</p>
              </div>
              <div className="space-y-3">
                {incomes.map((inc, idx) => {
                  const incType = INCOME_TYPES.find(t => t.id === inc.type);
                  const rawAmt = parseFloat(inc.gross) || 0;
                  const grossedUp = incType?.grossUp && inc.nonTaxableConfirmed && rawAmt > 0;
                  const qualifyingAmt = grossedUp ? rawAmt / 0.75 : rawAmt;
                  return (
                  <div key={inc.id} className={`rounded-xl border p-3 ${grossedUp ? 'border-purple-200 bg-purple-50/30' : 'border-slate-100 bg-white'}`}>
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <label className="block text-xs text-slate-400 mb-1">{idx === 0 ? 'Income Type' : ''}</label>
                        <select value={inc.type} onChange={e => updateIncome(setIncomes, inc.id, 'type', e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                          {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}{t.grossUp ? ' (↑25% eligible)' : ''}</option>)}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <label className="block text-xs text-slate-400 mb-1">{idx === 0 ? 'Raw Monthly Amount ($)' : ''}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                          <input type="number" value={inc.gross} placeholder="From award letter"
                            onChange={e => updateIncome(setIncomes, inc.id, 'gross', e.target.value)}
                            className="w-full pl-7 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                        </div>
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
                      <div className="col-span-12">
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                          📎 {incType?.docsNeeded}
                        </p>
                      </div>
                      {/* Non-taxable gross-up confirmation */}
                      {incType?.grossUp && rawAmt > 0 && (
                        <div className="col-span-12">
                          <label className="flex items-start gap-2 cursor-pointer bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                            <input type="checkbox" checked={!!inc.nonTaxableConfirmed}
                              onChange={e => updateIncome(setIncomes, inc.id, 'nonTaxableConfirmed', e.target.checked)}
                              className="w-4 h-4 mt-0.5 accent-purple-600 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-purple-800">Confirm non-taxable income (required for gross-up)</p>
                              <p className="text-xs text-purple-600 mt-0.5">I have verified with the award letter and/or tax returns that this income is non-taxable. LoanBeacons will automatically gross up by 25% (÷ 0.75) for qualifying.</p>
                            </div>
                          </label>
                          {inc.nonTaxableConfirmed && (
                            <div className="mt-2 flex items-center justify-between bg-purple-100 border border-purple-200 rounded-lg px-3 py-2">
                              <div>
                                <p className="text-xs text-purple-700">Raw amount (from award letter): <span className="font-bold font-mono">{fmt$(rawAmt)}/mo</span></p>
                                <p className="text-xs text-purple-700 mt-0.5">Grossed-up qualifying income: <span className="font-bold font-mono text-purple-900">{fmt$(qualifyingAmt)}/mo</span></p>
                              </div>
                              <span className="text-xs font-bold text-purple-700 bg-white border border-purple-300 px-2 py-1 rounded">÷ 0.75 = ↑25%</span>
                            </div>
                          )}
                          {!inc.nonTaxableConfirmed && (
                            <p className="text-xs text-purple-600 mt-1 px-1">⚠ Check the box above to apply the 25% gross-up — currently using raw amount only</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
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
                {/* Dollar fields with $ prefix */}
                {[
                  { label: 'Loan Amount', val: loanAmount, set: setLoanAmount, ph: '300,000', isCurrency: true },
                  { label: 'Property Taxes (mo)', val: taxes, set: setTaxes, ph: '350', isCurrency: true },
                  { label: 'Home Insurance (mo)', val: insurance, set: setInsurance, ph: '120', isCurrency: true },
                  { label: 'HOA Dues (mo)', val: hoa, set: setHoa, ph: '0', isCurrency: true },
                  { label: 'MI / MIP (mo)', val: mi, set: setMi, ph: '0', isCurrency: true },
                  { label: 'Monthly Debts', val: debts, set: setDebt, ph: '850', isCurrency: true },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                      <input type="number" value={f.val} placeholder={f.ph}
                        onChange={e => f.set(e.target.value)}
                        className="w-full pl-7 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    </div>
                    {f.val && parseFloat(f.val) > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{fmt$(parseFloat(f.val))}</p>
                    )}
                  </div>
                ))}
                {/* Non-dollar fields */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Interest Rate (%)</label>
                  <div className="relative">
                    <input type="number" step="0.001" value={rate} placeholder="7.250"
                      onChange={e => setRate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Loan Term</label>
                  <select value={term} onChange={e => setTerm(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                    <option value="360">30 Years (360 mo)</option>
                    <option value="300">25 Years (300 mo)</option>
                    <option value="240">20 Years (240 mo)</option>
                    <option value="180">15 Years (180 mo)</option>
                    <option value="120">10 Years (120 mo)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Credit Score (Mid)</label>
                  <input type="number" value={creditScore} placeholder="720"
                    onChange={e => setCreditScore(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  {creditScore && (
                    <p className={`text-xs mt-0.5 font-semibold ${
                      parseInt(creditScore) >= 740 ? 'text-emerald-600' :
                      parseInt(creditScore) >= 680 ? 'text-blue-600' :
                      parseInt(creditScore) >= 620 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {parseInt(creditScore) >= 740 ? '✅ Excellent' :
                       parseInt(creditScore) >= 720 ? '✅ Very Good' :
                       parseInt(creditScore) >= 680 ? '✓ Good' :
                       parseInt(creditScore) >= 640 ? '⚠ Fair' :
                       parseInt(creditScore) >= 620 ? '⚠ Minimum Range' : '❌ Below Minimums'}
                    </p>
                  )}
                </div>
              </div>
              {scenario?.coBorrowers?.length > 0 && creditScore && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                  ⚠ Qualifying score reflects the lowest middle score across all borrowers on this file. Adjust manually if needed.
                </p>
              )}

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

              {/* Required income gap */}
              {totalHousing > 0 && totalIncome > 0 && (
                <div className={`mt-4 rounded-xl px-4 py-3 border flex items-center justify-between ${
                  incomeGap <= 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Qualifying Income Threshold (43% Back-End)</p>
                    <p className="text-sm text-slate-600">
                      Required: <span className="font-bold font-mono">{fmt$(requiredIncome43)}/mo</span>
                      {' '}· Current: <span className="font-bold font-mono">{fmt$(totalIncome)}/mo</span>
                    </p>
                  </div>
                  <div className="text-right">
                    {incomeGap <= 0
                      ? <p className="text-sm font-bold text-emerald-700">{fmt$(Math.abs(incomeGap))}/mo above threshold</p>
                      : <p className="text-sm font-bold text-red-700">{fmt$(incomeGap)}/mo short of threshold</p>
                    }
                  </div>
                </div>
              )}
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
                        <ProgramFitRow key={key} progKey={key} prog={prog} frontDTI={frontDTI} backDTI={backDTI} creditScore={parseInt(creditScore)} totalIncome={totalIncome} />
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

              {/* Income type selector buttons */}
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Income Types Present in This File</p>
                <p className="text-xs text-slate-400 mb-3">Select all that apply — documentation requirements and calculation rules will appear for each.</p>
                <div className="flex flex-wrap gap-2">
                  {INCOME_TYPES.map(t => (
                    <label key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold transition-all
                      ${incomeTypes[t.id]
                        ? t.grossUp
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                      <input type="checkbox" checked={!!incomeTypes[t.id]}
                        onChange={e => setIncomeTypes(p => ({ ...p, [t.id]: e.target.checked }))}
                        className="hidden" />
                      {t.label}
                      {t.grossUp && <span className="ml-1 text-xs opacity-80">↑25%</span>}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-purple-600 mt-2 font-medium">↑25% = Non-taxable income eligible for 25% gross-up</p>
              </div>

              {/* Per-type expanded detail cards */}
              {INCOME_TYPES.filter(t => incomeTypes[t.id]).length === 0 && (
                <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-xl">
                  <p className="text-sm text-slate-400">Select income types above to see documentation requirements.</p>
                </div>
              )}

              <div className="space-y-4">
                {INCOME_TYPES.filter(t => incomeTypes[t.id]).map(t => {
                  const checkedKey = `docs_${t.id}`;
                  const checkedDocs = incomeTypes[checkedKey] || {};
                  const allChecked = t.docs.every((_, i) => checkedDocs[i]);
                  return (
                    <div key={t.id} className={`rounded-xl border overflow-hidden ${
                      t.grossUp ? 'border-purple-200' : t.stable ? 'border-emerald-200' : 'border-amber-200'
                    }`}>
                      {/* Card header */}
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        t.grossUp ? 'bg-purple-50' : t.stable ? 'bg-emerald-50' : 'bg-amber-50'
                      }`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${t.grossUp ? 'bg-purple-500' : t.stable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="text-sm font-bold text-slate-800">{t.label}</span>
                          {t.grossUp && (
                            <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">
                              Non-Taxable — Gross Up 25%
                            </span>
                          )}
                          {t.continuance && (
                            <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">
                              Continuance Required
                            </span>
                          )}
                          {!t.stable && !t.grossUp && (
                            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                              History Required
                            </span>
                          )}
                        </div>
                        {allChecked && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-full font-bold shrink-0">
                            ✓ Docs Complete
                          </span>
                        )}
                      </div>

                      <div className="px-4 py-3 bg-white space-y-3">
                        {/* Gross-up note */}
                        {t.grossUpNote && (
                          <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                            <p className="text-xs font-semibold text-purple-700">💡 Gross-Up Calculation</p>
                            <p className="text-xs text-purple-600 mt-0.5">{t.grossUpNote}</p>
                          </div>
                        )}

                        {/* Calc rule */}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-blue-700">📐 How to Calculate</p>
                          <p className="text-xs text-blue-600 mt-0.5">{t.calcRule}</p>
                        </div>

                        {/* Warning if present */}
                        {t.warning && (
                          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <p className="text-xs font-semibold text-red-700">⚠ Important</p>
                            <p className="text-xs text-red-600 mt-0.5">{t.warning}</p>
                          </div>
                        )}

                        {/* Continuance flag */}
                        {t.continuance && (
                          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                            <p className="text-xs font-semibold text-blue-700">📅 Continuance</p>
                            <p className="text-xs text-blue-600 mt-0.5">Must document that this income will continue for at least 3 years beyond closing. Obtain written verification of continuance.</p>
                          </div>
                        )}

                        {/* Doc checklist */}
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Required Documents</p>
                          <div className="space-y-1.5">
                            {t.docs.map((doc, i) => {
                              const isChecked = !!checkedDocs[i];
                              return (
                                <label key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                                  isChecked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}>
                                  <input type="checkbox" checked={isChecked}
                                    onChange={e => setIncomeTypes(p => ({
                                      ...p,
                                      [checkedKey]: { ...(p[checkedKey] || {}), [i]: e.target.checked }
                                    }))}
                                    className="w-3.5 h-3.5 accent-emerald-600 shrink-0" />
                                  <span className={isChecked ? 'text-emerald-700 font-medium line-through opacity-60' : 'text-slate-600'}>{doc}</span>
                                </label>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${(Object.values(checkedDocs).filter(Boolean).length / t.docs.length) * 100}%` }} />
                            </div>
                            <span className="text-xs text-slate-400">
                              {Object.values(checkedDocs).filter(Boolean).length}/{t.docs.length} obtained
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                  ['Co-Borrower Income', totalCoBorrowerIncome > 0 ? fmt$(totalCoBorrowerIncome) + '/mo' : '—'],
                  ['Total Qualifying', fmt$(totalIncome) + '/mo'],
                  ['Annual (×12)', fmt$(totalIncome * 12)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className="font-bold text-slate-700">{v}</span>
                  </div>
                ))}
                {/* Gross-up indicator */}
                {[...incomes, ...coborrowerIncomes].some(i => {
                  const t = INCOME_TYPES.find(t => t.id === i.type);
                  return t?.grossUp && i.nonTaxableConfirmed;
                }) && (
                  <div className="pt-2 mt-1 border-t border-slate-100">
                    <p className="text-purple-600 font-semibold">↑ Includes non-taxable gross-up</p>
                    <p className="text-slate-400 mt-0.5">Qualifying income is higher than raw award letter amounts</p>
                  </div>
                )}
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
      <CanonicalSequenceBar currentModuleKey="QUALIFYING_INTEL" scenarioId={scenarioId} recordId={savedRecordId} />
    </div>
  );
}
