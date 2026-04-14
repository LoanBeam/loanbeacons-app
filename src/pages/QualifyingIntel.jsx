// src/pages/QualifyingIntel.jsx
// LoanBeacons™ — Module 2 | Stage 1: Pre-Structure & Initial Analysis
// Qualifying Intelligence™ — DTI analysis, income qualification, program fit
// Enhanced: Student Loan Payment Factor (Option C) — program-aware qualifying payment wired into DTI
// Fix: verticalAlign: 'middle' on all ProgramFitRow <td> elements (Tailwind preflight override)

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ModuleNav from '../components/ModuleNav';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';
// ─── Program DTI Limits ───────────────────────────────────────────────────────
const PROGRAMS = {
  FHA:          { label: 'FHA',          frontMax: 46.9, backMax: 56.9, minCredit: 580, notes: 'AUS Accept/Eligible can exceed limits with compensating factors' },
  CONVENTIONAL: { label: 'Conventional', frontMax: null,  backMax: 50.0, minCredit: 620, notes: 'DU/LPA may approve higher DTI with strong compensating factors' },
  HOMEREADY:    { label: 'HomeReady',    frontMax: null,  backMax: 50.0, minCredit: 620, notes: 'Income limit 80% AMI unless census tract eligible' },
  HOMEPOSSIBLE: { label: 'Home Possible',frontMax: null,  backMax: 45.0, minCredit: 660, notes: 'Income limit 80% AMI unless census tract eligible' },
  VA:           { label: 'VA',           frontMax: null,  backMax: 41.0, minCredit: 580, notes: 'No hard limit — residual income is primary qualifier' },
  USDA:         { label: 'USDA',         frontMax: 29.0,  backMax: 41.0, minCredit: 640, notes: 'Strictest dual-ratio requirement — both must be met' },
};

// ─── Student Loan Payment Engine ─────────────────────────────────────────────
function calcSLPayment(balance, actualPayment, deferred, deferMonths, loanType) {
  const bal    = parseFloat(balance)       || 0;
  const actual = parseFloat(actualPayment) || 0;
  const defer  = parseInt(deferMonths)     || 0;
  if (bal === 0) return { payment: 0, rule: '', label: '' };

  const lt = (loanType || '').toUpperCase();
  const isFannie   = ['CONVENTIONAL', 'HOMEREADY', 'JUMBO'].includes(lt);
  const isFreddie  = lt === 'HOMEPOSSIBLE';
  const isFHA      = lt === 'FHA' || lt === 'FHA_203K';
  const isVA       = lt === 'VA';
  const isUSDA     = lt === 'USDA';

  if (isVA) {
    if (deferred && defer >= 12) return { payment: 0,             rule: 'Deferred 12+ months from closing — excluded from DTI',      label: 'Excluded' };
    if (actual > 0)              return { payment: actual,        rule: 'Use actual monthly payment',                                 label: 'Actual'   };
    return                              { payment: bal * 0.05/12, rule: '5% of balance ÷ 12 (no payment on file)',                    label: '5%/12'    };
  }
  if (isFHA) {
    const p = Math.max(actual, bal * 0.01);
    return { payment: p, rule: actual >= bal * 0.01 ? 'Actual payment (meets 1% floor)' : '1% of balance — actual payment below floor', label: '1% Floor' };
  }
  if (isFreddie || isUSDA) {
    const p = actual > 0 ? actual : bal * 0.005;
    return { payment: p, rule: actual > 0 ? 'Actual payment' : '0.5% of balance (IBR/deferred)', label: actual > 0 ? 'Actual' : '0.5%' };
  }
  // Fannie Mae / default
  const p = actual > 0 ? actual : bal * 0.01;
  return { payment: p, rule: actual > 0 ? 'Actual payment' : '1% of balance (IBR/deferred)', label: actual > 0 ? 'Actual' : '1%' };
}

const SL_PROGRAM_COMPARISON = [
  { key: 'CONVENTIONAL', label: 'Conventional (Fannie Mae)' },
  { key: 'HOMEPOSSIBLE',  label: 'Home Possible (Freddie)'  },
  { key: 'FHA',           label: 'FHA'                      },
  { key: 'VA',            label: 'VA'                        },
  { key: 'USDA',          label: 'USDA'                      },
];

// ─── Income Types ─────────────────────────────────────────────────────────────
const INCOME_TYPES = [
  { id: 'w2_salary',       label: 'W-2 Salary / Hourly',        stable: true,  grossUp: false, continuance: false,
    docsNeeded: '2 years W-2s + 30-day paystub',
    calcRule:   'Use YTD gross ÷ months elapsed. If declining income, use lower year.',
    docs: ['Most recent 30-day paystub', 'W-2 for prior year', 'W-2 for year before that', 'VOE if < 2 years at employer'] },
  { id: 'fulltime_second', label: 'Full-Time Second Job',        stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years uninterrupted history required + paystubs from both jobs',
    calcRule:   '2-year history required with no gaps. Cannot be used if < 24 months. Average last 2 years.',
    docs: ['2 years W-2s from second employer', '30-day paystubs from second job', 'Employer letter confirming current status'],
    warning: 'FHA and conventional both require full 24-month history. No exceptions for recent second jobs.' },
  { id: 'part_time',       label: 'Part-Time / Seasonal Job',    stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years history required + paystubs',
    calcRule:   'Average income over 24 months including gaps. Cannot use if < 24 months consistent history.',
    docs: ['2 years W-2s', '30-day paystubs', 'Employer letter if seasonal'] },
  { id: 'self_employ',     label: 'Self-Employed (1099/K-1)',     stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years personal + business tax returns + YTD P&L + business license',
    calcRule:   'Use 24-month average of net income after add-backs. Declining income = use lower year.',
    docs: ['2 years personal tax returns (1040)', '2 years business tax returns (1120/1120S/1065)', 'YTD Profit & Loss (CPA-prepared or borrower-signed)', 'Business license or CPA letter confirming 2+ years', 'Business bank statements (12-24 months)'],
    warning: 'Declining income between years requires use of lower year. Business losses must be applied against personal income.' },
  { id: 'commission',      label: 'Commission / Variable Pay',   stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years W-2s + YTD paystub + employer letter confirming base + commission structure',
    calcRule:   'If commission > 25% of total income: 24-month average required.',
    docs: ['2 years W-2s', 'YTD paystub showing commission breakdown', 'Employer letter confirming commission structure', '2 years 1099 if independent contractor'],
    warning: 'If commission income has declined year over year, use the lower figure.' },
  { id: 'overtime',        label: 'Overtime / Bonus',            stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years history required (12-18 months with strong employer letter)',
    calcRule:   'Average over 24 months. If declining, use lower period or exclude.',
    docs: ['2 years W-2s showing overtime/bonus', 'YTD paystub', 'Employer letter confirming likely continuance'] },
  { id: 'social_sec',      label: 'Social Security / SSI',       stable: true,  grossUp: true,  continuance: true,
    docsNeeded: 'Award letter + 2 months bank statements showing direct deposit',
    calcRule:   'Non-taxable SSI/disability can be grossed up 25% for qualifying.',
    docs: ['SSA award letter (within 12 months)', '2 months bank statements confirming deposits', 'Tax returns to confirm non-taxable status (if grossing up)'],
    grossUpNote: 'Non-taxable SSI can be grossed up 25% — divide monthly amount by 0.75 for qualifying income.' },
  { id: 'pension',         label: 'Pension / Retirement',        stable: true,  grossUp: false, continuance: true,
    docsNeeded: 'Award letter + 12 months bank statements',
    calcRule:   'Use current monthly benefit. If non-taxable (Roth/disability pension), gross up 25%.',
    docs: ['Pension award/benefit letter', '12 months bank statements', '1099-R if applicable'],
    grossUpNote: 'Non-taxable pension distributions may be grossed up 25% — verify tax status.' },
  { id: 'rental',          label: 'Rental Income',               stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years Schedule E + current signed leases + property management agreements',
    calcRule:   'Use 75% of gross rent (vacancy factor) OR Schedule E net + depreciation add-back.',
    docs: ['2 years personal tax returns with Schedule E', 'Current signed leases', 'Mortgage statement for rental property', 'Property management agreement (if applicable)'],
    warning: 'Cannot use rental income if property has < 2-year rental history on taxes.' },
  { id: 'child_supp',      label: 'Child Support / Alimony',     stable: false, grossUp: false, continuance: true,
    docsNeeded: 'Court order + 12 months proof of receipt + divorce decree',
    calcRule:   'Must document consistent receipt for 12 months. Must have 3+ years continuance remaining.',
    docs: ['Divorce decree or separation agreement', 'Court order showing amount and duration', '12 months bank statements confirming receipt', 'Copy of any modification orders'],
    warning: 'Must have at least 3 years of documented continuance remaining. Voluntary payments without court order cannot be used.' },
  { id: 'military',        label: 'Military / BAH / BAS',        stable: true,  grossUp: true,  continuance: false,
    docsNeeded: 'Most recent LES (Leave and Earnings Statement)',
    calcRule:   'All military income including BAH and BAS is grossed up 25% for qualifying.',
    docs: ['Most recent LES showing all pay components', 'Orders if recently reassigned', 'VA award letter if receiving disability pay'],
    grossUpNote: 'BAH and BAS are non-taxable — gross up 25% — divide by 0.75 for qualifying income.' },
  { id: 'disability',      label: 'Disability Income',           stable: true,  grossUp: true,  continuance: true,
    docsNeeded: 'Award letter + bank statements confirming deposits',
    calcRule:   'Non-taxable disability income can be grossed up 25%. VA disability is always non-taxable.',
    docs: ['Disability award letter (SSA, VA, or private insurer)', '12 months bank statements', 'Tax returns to confirm non-taxable status'],
    grossUpNote: 'VA disability and SSA disability are non-taxable — gross up 25% for qualifying.' },
  { id: 'investment',      label: 'Investment / Dividends',      stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years 1099-DIV/1099-INT + 2 years tax returns + asset statements confirming assets still held',
    calcRule:   'Average 24-month history. Must confirm assets generating income are still held.',
    docs: ['2 years 1099-DIV or 1099-INT', '2 years tax returns', '2 months most recent asset statements', 'Evidence assets are still held'] },
  { id: 'rsu_stock',       label: 'RSU / Stock Compensation',    stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years W-2s showing RSU/stock income + vesting schedule + employer letter',
    calcRule:   '24-month average required. Must document vesting schedule confirms continuance for 3+ years.',
    docs: ['2 years W-2s with RSU/stock income broken out', 'Vesting schedule from employer', 'Employer letter confirming future vesting', 'Grant agreements'],
    warning: 'Cannot use RSU income if vesting schedule ends within 3 years of closing.' },
  { id: 'foster_care',     label: 'Foster Care Income',          stable: true,  grossUp: true,  continuance: true,
    docsNeeded: 'Agency documentation + 2 years history of receipt',
    calcRule:   'Non-taxable foster care payments can be grossed up 25%. Must have 2-year documented history.',
    docs: ['Foster care agency agreement', '2 years documentation of receipt', 'Bank statements confirming deposits'],
    grossUpNote: 'Foster care payments are non-taxable — gross up 25% for qualifying.' },
  { id: 'notes_receivable',label: 'Notes Receivable',            stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years tax returns showing interest income + copy of executed note + evidence of payment history',
    calcRule:   'Must have 3+ years of documented continuance remaining. Use 24-month average from tax returns.',
    docs: ['Executed promissory note', '2 years tax returns showing interest income', '12 months bank statements confirming receipt', 'Evidence of borrower ability to continue payments'] },
];

// ─── Compensating Factors ─────────────────────────────────────────────────────
const COMP_FACTORS = [
  { id: 'reserves_12',    label: '12+ months PITI reserves',            impact: 'HIGH',   detail: 'Liquid assets covering 12+ months of total housing payment' },
  { id: 'low_payment_sh', label: 'Low payment shock (<20% increase)',   impact: 'HIGH',   detail: 'New PITI is less than 120% of current housing expense' },
  { id: 'stable_employ',  label: '2+ years same employer',              impact: 'MEDIUM', detail: 'Documented 24+ months with current employer, same field' },
  { id: 'credit_680',     label: 'Credit score 680+',                   impact: 'HIGH',   detail: 'Middle score of the lower-scoring borrower >= 680' },
  { id: 'min_increase',   label: 'Minimal increase in housing expense', impact: 'MEDIUM', detail: 'Proposed PITI <= 105% of current housing expense' },
  { id: 'additional_inc', label: 'Documented non-qualifying income',    impact: 'MEDIUM', detail: 'Income that exists but cannot be used to qualify (e.g., <2yr history)' },
  { id: 'low_ltv',        label: 'Low LTV (<=75%)',                     impact: 'HIGH',   detail: 'Significant equity position reduces lender risk' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$   = n => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = n => isNaN(n) || !isFinite(n) ? '—' : Number(n).toFixed(1) + '%';
const fmt$0  = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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

// ─── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
      <ModuleNav moduleNumber={2} />
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
// Fix: valign="middle" HTML attribute on every <td> — bypasses Tailwind preflight
// CSS resets entirely. style/className vertical-align is overridden by Tailwind base.
function ProgramFitRow({ prog, progKey, frontDTI, backDTI, creditScore, totalIncome }) {
  const frontPass  = !prog.frontMax || frontDTI <= prog.frontMax;
  const backPass   = progKey === 'VA' ? true : backDTI <= prog.backMax;
  const creditPass = !creditScore || creditScore >= prog.minCredit;
  const eligible   = frontPass && backPass && creditPass;
  const isVA       = progKey === 'VA';
  const vaOverDTI  = isVA && backDTI > prog.backMax;
  const usdaFrontGap = prog.frontMax && !frontPass && totalIncome > 0 ? (totalIncome * prog.frontMax / 100) : null;

  return (
    <tr className={`border-b border-slate-50 ${eligible ? 'hover:bg-emerald-50/30' : 'hover:bg-red-50/20'}`}>
      <td valign="middle" className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${eligible || isVA ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <span className="text-sm font-bold text-slate-800">{prog.label}</span>
        </div>
      </td>
      <td valign="middle" className="px-4 py-3 text-center">
        {prog.frontMax
          ? <div>
              <span className={`text-sm font-bold ${frontPass ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmtPct(frontDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.frontMax}%</span>
              </span>
              {!frontPass && usdaFrontGap && <p className="text-xs text-red-500 mt-0.5">Need {fmt$(usdaFrontGap)}/mo income to meet limit</p>}
            </div>
          : <span className="text-xs text-slate-400">No limit</span>}
      </td>
      <td valign="middle" className="px-4 py-3 text-center">
        <span className={`text-sm font-bold ${isVA && vaOverDTI ? 'text-amber-600' : backPass ? 'text-emerald-600' : 'text-red-600'}`}>
          {fmtPct(backDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.backMax}%</span>
        </span>
        {isVA && vaOverDTI && <p className="text-xs text-amber-600 mt-0.5">Review residual income</p>}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center h-full min-h-[44px]">
          {isVA
            ? <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${vaOverDTI ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {vaOverDTI ? '⚠ Check Residual' : '✓ Qualifies'}
              </span>
            : <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                {eligible ? '✓ Qualifies' : '✗ Fails'}
              </span>}
        </div>
      </td>
      <td valign="middle" className="px-4 py-3 text-xs text-slate-400 max-w-xs">{prog.notes}</td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function QualifyingIntel() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const scenarioId     = searchParams.get('scenarioId');

  const { reportFindings }                = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);
  const [findingsReported, setFindingsReported] = useState(false);

  const [scenario,  setScenario]  = useState(null);
  const [loading,   setLoading]   = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);
  const [search,    setSearch]    = useState('');
  const [showAll,   setShowAll]   = useState(false);

  // Income
  const [incomes,            setIncomes]            = useState([{ id: 1, type: 'w2_salary', gross: '', note: '', nonTaxableConfirmed: false }]);
  const [coborrowerIncomes,  setCoborrowerIncomes]  = useState([]);

  // Housing
  const [loanAmount, setLoanAmount] = useState('');
  const [rate,       setRate]       = useState('');
  const [term,       setTerm]       = useState('360');
  const [taxes,      setTaxes]      = useState('');
  const [insurance,  setInsurance]  = useState('');
  const [hoa,        setHoa]        = useState('');
  const [mi,         setMi]         = useState('');
  const [debts,      setDebt]       = useState('');
  const [creditScore,setCreditScore]= useState('');

  // Student Loan Payment Factor
  const [slBalance,       setSlBalance]       = useState('');
  const [slActualPayment, setSlActualPayment] = useState('');
  const [slDeferred,      setSlDeferred]      = useState(false);
  const [slDeferMonths,   setSlDeferMonths]   = useState('');

  // Other
  const [compFactors, setCompFactors] = useState({});
  const [incomeTypes, setIncomeTypes] = useState({});
  const [notes,       setNotes]       = useState('');

  // ─── Load Scenario ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      import('firebase/firestore').then(({ collection, getDocs }) => {
        getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      });
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.loanAmount)       setLoanAmount(String(d.loanAmount));
        if (d.interestRate)     setRate(String(d.interestRate));
        if (d.term)             setTerm(String(d.term));
        if (d.propTaxes)        setTaxes(String(d.propTaxes));
        if (d.homeInsurance)    setInsurance(String(d.homeInsurance));
        if (d.hoaDues)          setHoa(String(d.hoaDues));
        if (d.mortgageInsurance)setMi(String(d.mortgageInsurance));
        if (d.monthlyDebts)     setDebt(String(d.monthlyDebts));
        if (d.creditScore) {
          const allScores = [parseInt(d.creditScore) || null, ...(d.coBorrowers || []).map(cb => parseInt(cb.creditScore) || null)].filter(s => s && s > 300 && s <= 850);
          setCreditScore(String(allScores.length > 0 ? Math.min(...allScores) : parseInt(d.creditScore)));
        }
        if (d.monthlyIncome) setIncomes([{ id: 1, type: 'w2_salary', gross: String(d.monthlyIncome), note: '', nonTaxableConfirmed: false }]);
        const coBorrowersWithIncome = (d.coBorrowers || []).filter(cb => parseFloat(cb.monthlyIncome) > 0);
        if (coBorrowersWithIncome.length > 0) {
          setCoborrowerIncomes(coBorrowersWithIncome.map((cb, i) => ({
            id: i + 1, type: 'w2_salary', gross: String(cb.monthlyIncome),
            note: `${cb.firstName || ''} ${cb.lastName || ''}`.trim(), nonTaxableConfirmed: false,
          })));
        } else if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
          setCoborrowerIncomes([{ id: 1, type: 'w2_salary', gross: String(d.coBorrowerIncome), note: '', nonTaxableConfirmed: false }]);
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ─── Calculations ─────────────────────────────────────────────────────────
  const getQualifyingIncome = (inc) => {
    const raw     = parseFloat(inc.gross) || 0;
    const incType = INCOME_TYPES.find(t => t.id === inc.type);
    if (incType?.grossUp && inc.nonTaxableConfirmed) return raw / 0.75;
    return raw;
  };

  const totalBorrowerIncome   = incomes.reduce((s, i) => s + getQualifyingIncome(i), 0);
  const totalCoBorrowerIncome = coborrowerIncomes.reduce((s, i) => s + getQualifyingIncome(i), 0);
  const totalIncome           = totalBorrowerIncome + totalCoBorrowerIncome;

  const pi           = calcPI(parseFloat(loanAmount), parseFloat(rate), parseInt(term));
  const totalHousing = pi + (parseFloat(taxes) || 0) + (parseFloat(insurance) || 0) + (parseFloat(hoa) || 0) + (parseFloat(mi) || 0);

  // Student loan qualifying payment — wired into DTI
  const slResult       = calcSLPayment(slBalance, slActualPayment, slDeferred, slDeferMonths, scenario?.loanType || '');
  const slQualPayment  = slResult.payment;

  const totalDebts   = (parseFloat(debts) || 0) + slQualPayment;
  const frontDTI     = totalIncome > 0 ? (totalHousing / totalIncome) * 100 : 0;
  const backDTI      = totalIncome > 0 ? ((totalHousing + totalDebts) / totalIncome) * 100 : 0;
  const cfCount      = Object.values(compFactors).filter(Boolean).length;
  const requiredIncome43 = totalHousing + totalDebts > 0 ? (totalHousing + totalDebts) / 0.43 : 0;
  const incomeGap    = requiredIncome43 - totalIncome;

  const programResults   = Object.entries(PROGRAMS).map(([key, prog]) => {
    const frontPass  = !prog.frontMax || frontDTI <= prog.frontMax;
    const backPass   = key === 'VA' ? true : backDTI <= prog.backMax;
    const creditPass = !creditScore || parseInt(creditScore) >= prog.minCredit;
    return { key, prog, eligible: frontPass && backPass && creditPass };
  });
  const eligiblePrograms = programResults.filter(r => r.eligible);
  const overallPass      = eligiblePrograms.length > 0;

  // ─── Next Step Intelligence™ ──────────────────────────────────────────────
  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash')
    ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('term') || rawPurpose.includes('refi')
      ? 'rate_term_refi'
      : 'purchase';

  const nsiFindings = {
    dti:          parseFloat(backDTI?.toFixed(2))  || 0,
    frontEndDTI:  parseFloat(frontDTI?.toFixed(2)) || 0,
    creditScore:  parseInt(creditScore) || 0,
    selfEmployed: incomes.some(i => i.type === 'self_employ'),
    incomeType:   incomes[0]?.type || '',
  };

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'QUALIFYING_INTEL',
      loanPurpose,
      decisionRecordFindings:  { QUALIFYING_INTEL: nsiFindings },
      scenarioData:            scenario || {},
      completedModules:        [],
      scenarioId,
      onWriteToDecisionRecord: null, // Phase 2: wire to useDecisionRecord.writeNextStepEvent
    });

  // ─── Decision Record ──────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('QUALIFYING_INTEL', {
        totalIncome, totalBorrowerIncome, totalCoBorrowerIncome,
        totalHousing, totalDebts,
        frontDTI:  parseFloat(frontDTI.toFixed(2)),
        backDTI:   parseFloat(backDTI.toFixed(2)),
        creditScore: parseInt(creditScore) || null,
        piPayment: parseFloat(pi.toFixed(2)),
        eligiblePrograms: eligiblePrograms.map(r => r.key),
        compensatingFactors:      Object.keys(compFactors).filter(k => compFactors[k]),
        compensatingFactorCount:  cfCount,
        incomeTypes:              Object.keys(incomeTypes).filter(k => incomeTypes[k]),
        studentLoanBalance:       parseFloat(slBalance)       || 0,
        studentLoanActualPayment: parseFloat(slActualPayment) || 0,
        studentLoanQualifyingPayment: parseFloat(slQualPayment.toFixed(2)),
        studentLoanRule:          slResult.rule,
        loNotes:                  notes,
        timestamp:                new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
      setFindingsReported(true);
    } catch (e) { console.error('Decision Record save failed:', e); }
    finally { setRecordSaving(false); }
  };

  const addIncome    = (setter)            => setter(prev => [...prev, { id: Date.now(), type: 'w2_salary', gross: '', note: '', nonTaxableConfirmed: false }]);
  const updateIncome = (setter, id, f, v)  => setter(prev => prev.map(i => i.id === id ? { ...i, [f]: v } : i));
  const removeIncome = (setter, id)        => setter(prev => prev.filter(i => i.id !== id));

  // ─── Loading / Picker ─────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading scenario…</span>
      </div>
    </div>
  );

  if (!scenarioId) {
    const query = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => {
      const tA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const tB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return tB - tA;
    });
    const filtered = query
      ? sorted.filter(s => {
          const name = (s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim()).toLowerCase();
          return name.includes(query);
        })
      : sorted;
    const displayed = query ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore   = !query && !showAll && filtered.length > 5;

    return (
      <div className="min-h-screen bg-slate-50">
        {/* ── Hero Banner ── */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">
              ← Back to Dashboard
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">02</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 1 — Pre-Structure & Initial Analysis</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">Qualifying Intelligence™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">
              Analyze borrower DTI, income qualification, and program eligibility across FHA, Conventional, VA, USDA, HomeReady, and Home Possible — with built-in student loan payment engine and compensating factor documentation.
            </p>
            <div className="flex flex-wrap gap-2">
              {['DTI Analysis', 'Income Gross-Up', 'Student Loan Engine', 'Program Fit Matrix', 'Compensating Factors', 'Doc Checklist'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Scenario Selector ── */}
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2>
            <p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowAll(false); }}
              placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>
            )}
          </div>

          {/* Scenario Cards */}
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')}
                className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">
                → Go to Scenario Creator
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!query && !showAll && (
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">
                  Recently Updated
                </p>
              )}
              {displayed.map(s => {
                const name    = s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario';
                const amount  = parseFloat(s.loanAmount || 0);
                const program = s.loanType || null;
                const credit  = s.creditScore || null;
                const stage   = s.stage || null;
                return (
                  <button key={s.id}
                    onClick={() => navigate(`/qualifying-intel?scenarioId=${s.id}`)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{name}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && (
                            <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>
                          )}
                          {program && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{program}</span>
                          )}
                          {credit && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {credit}</span>
                          )}
                          {stage && (
                            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{stage}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}

              {hasMore && (
                <button onClick={() => setShowAll(true)}
                  className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">
                  View all {filtered.length} scenarios
                </button>
              )}
              {showAll && filtered.length > 5 && (
                <button onClick={() => setShowAll(false)}
                  className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">
                  ↑ Show less
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const borrower        = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || scenario.borrowerName : null;
  const coBorrowerNames = scenario?.coBorrowers?.filter(cb => cb.firstName || cb.lastName).map(cb => `${cb.firstName || ''} ${cb.lastName || ''}`.trim()) || [];
  const propertyAddress = scenario ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-gray-50 py-6 pb-24">
      <div className="max-w-5xl mx-auto px-4">

        {/* ── Header ── */}
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
                  : null}
            </div>
          </div>

          {scenario && (
            <div className="border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">Borrower(s)</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{borrower || 'Unknown Borrower'}</span>
                  <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">Primary</span>
                  {scenario.creditScore && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">FICO {creditScore}</span>}
                </div>
                {coBorrowerNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-indigo-200">{name}</span>
                    <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10">Co-Borrower {i + 1}</span>
                    {scenario.coBorrowers[i]?.creditScore && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">FICO {scenario.coBorrowers[i].creditScore}</span>}
                  </div>
                ))}
                {propertyAddress && <p className="text-xs text-indigo-300 mt-1">📍 {propertyAddress}</p>}
                {scenario.loanType && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.loanType}</span>
                    {scenario.loanPurpose  && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.loanPurpose}</span>}
                    {scenario.loanAmount   && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">${Number(scenario.loanAmount).toLocaleString()}</span>}
                    {scenario.propertyType && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.propertyType}</span>}
                    {scenario.occupancy    && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.occupancy}</span>}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">File Reference IDs</p>
                <div className="space-y-1.5">
                  {scenario.loanBeaconsRef && <div className="flex items-center gap-2"><span className="text-xs text-indigo-400 w-20 shrink-0">LB Ref</span><span className="text-xs font-mono font-bold text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded">{scenario.loanBeaconsRef}</span></div>}
                  {scenario.losLoanNumber  && <div className="flex items-center gap-2"><span className="text-xs text-indigo-400 w-20 shrink-0">LOS Loan #</span><span className="text-xs font-mono text-white/80 bg-white/10 px-2 py-0.5 rounded">{scenario.losLoanNumber}</span></div>}
                  {scenario.ausCaseNumber  && <div className="flex items-center gap-2"><span className="text-xs text-indigo-400 w-20 shrink-0">AUS Case #</span><span className="text-xs font-mono text-purple-300 bg-purple-500/20 border border-purple-400/30 px-2 py-0.5 rounded">{scenario.ausCaseNumber}</span></div>}
                  {!scenario.loanBeaconsRef && !scenario.losLoanNumber && !scenario.ausCaseNumber && <p className="text-xs text-white/40 italic">No reference IDs on file — add them in Scenario Creator</p>}
                  {scenario.scenarioName && <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10"><span className="text-xs text-indigo-400 w-20 shrink-0">Scenario</span><span className="text-xs text-white/70">{scenario.scenarioName}</span></div>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">

            {/* Borrower Name Mismatch Warning */}
            {scenario && borrower && scenario.scenarioName &&
              !scenario.scenarioName.toLowerCase().includes((scenario.firstName || '').toLowerCase()) &&
              !scenario.scenarioName.toLowerCase().includes((scenario.lastName || '').toLowerCase()) && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-xl px-5 py-4 flex items-start gap-3 mb-5">
                <span className="text-red-500 text-xl shrink-0">⚠</span>
                <div>
                  <p className="text-sm font-bold text-red-800">Borrower Name Mismatch Detected</p>
                  <p className="text-sm text-red-700 mt-1">The scenario is named <strong>"{scenario.scenarioName}"</strong> but the borrower on file is <strong>{borrower}</strong>.</p>
                  <button onClick={() => navigate(`/scenario-creator/${scenarioId}`)} className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 underline">→ Go to Scenario Creator to fix</button>
                </div>
              </div>
            )}

            {/* ── Borrower Income ── */}
            <Section title="Borrower Income" subtitle="Enter all qualifying income sources. Each type has specific documentation requirements." icon="💼">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs font-bold text-blue-800">📄 Always enter the raw amount from the award letter or document</p>
                <p className="text-xs text-blue-700 mt-1">Enter exactly what the document says — do not pre-calculate gross-ups. LoanBeacons handles the math. For non-taxable income, check the confirmation box and the grossed-up qualifying amount is calculated automatically.</p>
              </div>
              <div className="space-y-3">
                {incomes.map((inc, idx) => {
                  const incType       = INCOME_TYPES.find(t => t.id === inc.type);
                  const rawAmt        = parseFloat(inc.gross) || 0;
                  const grossedUp     = incType?.grossUp && inc.nonTaxableConfirmed && rawAmt > 0;
                  const qualifyingAmt = grossedUp ? rawAmt / 0.75 : rawAmt;
                  return (
                    <div key={inc.id} className={`rounded-xl border p-3 ${grossedUp ? 'border-purple-200 bg-purple-50/30' : 'border-slate-100 bg-white'}`}>
                      <div className="grid grid-cols-12 gap-2 items-start">
                        <div className="col-span-5">
                          {idx === 0 && <label className="block text-xs text-slate-400 mb-1">Income Type</label>}
                          <select value={inc.type} onChange={e => updateIncome(setIncomes, inc.id, 'type', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300">
                            {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}{t.grossUp ? ' (↑25% eligible)' : ''}</option>)}
                          </select>
                        </div>
                        <div className="col-span-4">
                          {idx === 0 && <label className="block text-xs text-slate-400 mb-1">Raw Monthly Amount ($)</label>}
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                            <input type="number" value={inc.gross} placeholder="From award letter"
                              onChange={e => updateIncome(setIncomes, inc.id, 'gross', e.target.value)}
                              className="w-full pl-7 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                          </div>
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <label className="block text-xs text-slate-400 mb-1">Note</label>}
                          <input type="text" value={inc.note} placeholder="optional"
                            onChange={e => updateIncome(setIncomes, inc.id, 'note', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="col-span-1 flex items-end pb-2">
                          {incomes.length > 1 && <button onClick={() => removeIncome(setIncomes, inc.id)} className="text-slate-300 hover:text-red-400 text-lg leading-none">✕</button>}
                        </div>
                        <div className="col-span-12">
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">📎 {incType?.docsNeeded}</p>
                        </div>
                        {incType?.grossUp && rawAmt > 0 && (
                          <div className="col-span-12">
                            <label className="flex items-start gap-2 cursor-pointer bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                              <input type="checkbox" checked={!!inc.nonTaxableConfirmed}
                                onChange={e => updateIncome(setIncomes, inc.id, 'nonTaxableConfirmed', e.target.checked)}
                                className="w-4 h-4 mt-0.5 accent-purple-600 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-purple-800">Confirm non-taxable income (required for gross-up)</p>
                                <p className="text-xs text-purple-600 mt-0.5">I have verified this income is non-taxable. LoanBeacons will gross up by 25% (÷ 0.75) for qualifying.</p>
                              </div>
                            </label>
                            {inc.nonTaxableConfirmed && (
                              <div className="mt-2 flex items-center justify-between bg-purple-100 border border-purple-200 rounded-lg px-3 py-2">
                                <div>
                                  <p className="text-xs text-purple-700">Raw amount: <span className="font-bold font-mono">{fmt$(rawAmt)}/mo</span></p>
                                  <p className="text-xs text-purple-700 mt-0.5">Grossed-up qualifying: <span className="font-bold font-mono text-purple-900">{fmt$(qualifyingAmt)}/mo</span></p>
                                </div>
                                <span className="text-xs font-bold text-purple-700 bg-white border border-purple-300 px-2 py-1 rounded">÷ 0.75 = ↑25%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => addIncome(setIncomes)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 mt-1">+ Add Income Source</button>
              </div>

              {/* Co-borrower income */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Co-Borrower Income</p>
                  {coborrowerIncomes.length === 0 && (
                    <button onClick={() => addIncome(setCoborrowerIncomes)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">+ Add Co-Borrower</button>
                  )}
                </div>
                {coborrowerIncomes.map(inc => (
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
                  <button onClick={() => addIncome(setCoborrowerIncomes)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1">+ Add Co-Borrower Income Source</button>
                )}
              </div>
            </Section>

            {/* ── Housing + Debts ── */}
            <Section title="Housing Payment & Debts" subtitle="PITI auto-calculated from loan details. Debts from credit report." icon="🏠">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Loan Amount',         val: loanAmount, set: setLoanAmount, ph: '300000' },
                  { label: 'Property Taxes (mo)', val: taxes,      set: setTaxes,      ph: '350'    },
                  { label: 'Home Insurance (mo)', val: insurance,  set: setInsurance,  ph: '120'    },
                  { label: 'HOA Dues (mo)',        val: hoa,        set: setHoa,        ph: '0'      },
                  { label: 'MI / MIP (mo)',        val: mi,         set: setMi,         ph: '0'      },
                  { label: 'Monthly Debts',        val: debts,      set: setDebt,       ph: '850'    },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                      <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                        className="w-full pl-7 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                    </div>
                    {f.val && parseFloat(f.val) > 0 && <p className="text-xs text-slate-400 mt-0.5 font-mono">{fmt$(parseFloat(f.val))}</p>}
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Interest Rate (%)</label>
                  <div className="relative">
                    <input type="number" step="0.001" value={rate} placeholder="7.250" onChange={e => setRate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Loan Term</label>
                  <select value={term} onChange={e => setTerm(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                    <option value="360">30 Years (360 mo)</option>
                    <option value="300">25 Years (300 mo)</option>
                    <option value="240">20 Years (240 mo)</option>
                    <option value="180">15 Years (180 mo)</option>
                    <option value="120">10 Years (120 mo)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Credit Score (Mid)</label>
                  <input type="number" value={creditScore} placeholder="720" onChange={e => setCreditScore(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  {creditScore && (
                    <p className={`text-xs mt-0.5 font-semibold ${parseInt(creditScore) >= 740 ? 'text-emerald-600' : parseInt(creditScore) >= 680 ? 'text-blue-600' : parseInt(creditScore) >= 620 ? 'text-amber-600' : 'text-red-600'}`}>
                      {parseInt(creditScore) >= 740 ? '✅ Excellent' : parseInt(creditScore) >= 720 ? '✅ Very Good' : parseInt(creditScore) >= 680 ? '✓ Good' : parseInt(creditScore) >= 640 ? '⚠ Fair' : parseInt(creditScore) >= 620 ? '⚠ Minimum Range' : '❌ Below Minimums'}
                    </p>
                  )}
                </div>
              </div>

              {totalHousing > 0 && (
                <div className="bg-slate-900 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4 mt-2">
                  <div className="flex gap-6 text-xs flex-wrap">
                    <div><span className="text-slate-400">P&I </span><span className="text-white font-bold font-mono">{fmt$(pi)}</span></div>
                    <div><span className="text-slate-400">Taxes </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(taxes))}</span></div>
                    <div><span className="text-slate-400">Ins </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(insurance))}</span></div>
                    {parseFloat(mi)  > 0 && <div><span className="text-slate-400">MI </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(mi))}</span></div>}
                    {parseFloat(hoa) > 0 && <div><span className="text-slate-400">HOA </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(hoa))}</span></div>}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Total PITI</div>
                    <div className="text-xl font-black text-white font-mono">{fmt$(totalHousing)}</div>
                  </div>
                </div>
              )}
            </Section>

            {/* ── Student Loan Payment Factor ── */}
            <Section title="Student Loan Payment Factor" subtitle="Program-aware qualifying payment — automatically wired into back-end DTI based on the scenario's loan program." icon="🎓">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Total Student Loan Balance</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={slBalance} onChange={e => setSlBalance(e.target.value)} placeholder="e.g. 48000"
                      className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Actual Monthly Payment (IBR/IDR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={slActualPayment} onChange={e => setSlActualPayment(e.target.value)} placeholder="0 if deferred"
                      className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer mt-5">
                    <input type="checkbox" checked={slDeferred} onChange={e => setSlDeferred(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                    <span className="text-xs font-semibold text-slate-600">Currently Deferred / IBR / $0 payment</span>
                  </label>
                  {slDeferred && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Months remaining on deferment</label>
                      <input type="number" value={slDeferMonths} onChange={e => setSlDeferMonths(e.target.value)} placeholder="e.g. 18"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                    </div>
                  )}
                </div>
              </div>

              {parseFloat(slBalance) > 0 ? (
                <>
                  <div className={`rounded-xl border p-4 mb-4 ${slQualPayment === 0 ? 'bg-emerald-50 border-emerald-200' : slQualPayment > 400 ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                          Qualifying Payment — {scenario?.loanType || 'No program on scenario'}
                        </p>
                        <p className="text-xs text-slate-400">{slResult.rule}</p>
                        <p className="text-xs text-slate-400 mt-1 italic">This amount is included in your back-end DTI calculation above.</p>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-black ${slQualPayment === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {fmt$0(slQualPayment)}/mo
                        </div>
                        <div className="text-xs text-slate-400">Added to DTI</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Program-by-Program Comparison</p>
                      <p className="text-xs text-slate-400 italic">Lower payment = better DTI position</p>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="px-4 py-2 text-left text-slate-400 font-semibold">Program</th>
                          <th className="px-4 py-2 text-right text-slate-400 font-semibold">Qualifying Pmt</th>
                          <th className="px-4 py-2 text-right text-slate-400 font-semibold">DTI Impact</th>
                          <th className="px-4 py-2 text-left text-slate-400 font-semibold">Rule Applied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SL_PROGRAM_COMPARISON.map(p => {
                          const res      = calcSLPayment(slBalance, slActualPayment, slDeferred, slDeferMonths, p.key);
                          const impact   = totalIncome > 0 ? (res.payment / totalIncome * 100).toFixed(1) : '—';
                          const isCur    = (scenario?.loanType || '').toUpperCase() === p.key;
                          const allPmts  = SL_PROGRAM_COMPARISON.map(pp => calcSLPayment(slBalance, slActualPayment, slDeferred, slDeferMonths, pp.key).payment);
                          const isLowest = res.payment === Math.min(...allPmts);
                          return (
                            <tr key={p.key} className={`border-b border-slate-50 ${isCur ? 'bg-indigo-50' : isLowest ? 'bg-emerald-50/50' : ''}`}>
                              <td className="px-4 py-2.5 font-semibold text-slate-700">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {p.label}
                                  {isCur    && <span className="text-xs bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded">Current</span>}
                                  {isLowest && <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">Best</span>}
                                </div>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-black text-base ${res.payment === 0 ? 'text-emerald-600' : res.payment > parseFloat(slBalance) * 0.008 ? 'text-amber-600' : 'text-slate-700'}`}>
                                {fmt$0(res.payment)}/mo
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-500 font-semibold">
                                {impact !== '—' ? `+${impact}%` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-slate-400">{res.rule}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
                      <p className="text-xs text-amber-700 font-semibold">
                        ⚠ The program with the lowest qualifying payment reduces back-end DTI the most.
                        Consider this when evaluating the best program path for this borrower.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-300 italic">Enter student loan balance above to see program comparison.</p>
              )}
            </Section>

            {/* ── DTI Results ── */}
            {totalIncome > 0 && totalHousing > 0 && (
              <Section title="DTI Analysis" subtitle="Debt-to-Income ratios calculated across all applicable programs." icon="📊">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Total Qualifying Income', val: fmt$(totalIncome),  sub: '/month',             color: 'emerald' },
                    { label: 'Total PITI',               val: fmt$(totalHousing), sub: '/month',             color: 'blue'    },
                    { label: 'Front-End DTI',            val: fmtPct(frontDTI),   sub: 'housing ÷ income',   color: frontDTI > 36 ? 'red' : frontDTI > 28 ? 'amber' : 'emerald' },
                    { label: 'Back-End DTI',             val: fmtPct(backDTI),    sub: 'all debts ÷ income', color: backDTI > 50 ? 'red' : backDTI > 43 ? 'amber' : 'emerald' },
                  ].map(item => (
                    <div key={item.label} className={`rounded-xl p-4 border text-center bg-${item.color}-50 border-${item.color}-200`}>
                      <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                      <div className={`text-2xl font-black font-mono text-${item.color}-700`}>{item.val}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.sub}</div>
                    </div>
                  ))}
                </div>

                {slQualPayment > 0 && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between">
                    <p className="text-xs text-indigo-700 font-semibold">🎓 Student loan qualifying payment ({scenario?.loanType || 'current program'}) included in back-end DTI</p>
                    <span className="text-xs font-black text-indigo-700">{fmt$0(slQualPayment)}/mo</span>
                  </div>
                )}

                {totalHousing > 0 && totalIncome > 0 && (
                  <div className={`mt-2 mb-4 rounded-xl px-4 py-3 border flex items-center justify-between ${incomeGap <= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Qualifying Income Threshold (43% Back-End)</p>
                      <p className="text-sm text-slate-600">Required: <span className="font-bold font-mono">{fmt$(requiredIncome43)}/mo</span> · Current: <span className="font-bold font-mono">{fmt$(totalIncome)}/mo</span></p>
                    </div>
                    <div className="text-right">
                      {incomeGap <= 0
                        ? <p className="text-sm font-bold text-emerald-700">{fmt$(Math.abs(incomeGap))}/mo above threshold</p>
                        : <p className="text-sm font-bold text-red-700">{fmt$(incomeGap)}/mo short of threshold</p>}
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

            {/* ── Compensating Factors ── */}
            <Section title="Compensating Factors" subtitle="Document all factors that support approval at elevated DTI. Each factor matters in manual underwriting." icon="⚖️">
              <div className="space-y-2">
                {COMP_FACTORS.map(cf => (
                  <label key={cf.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${compFactors[cf.id] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!compFactors[cf.id]}
                      onChange={e => setCompFactors(p => ({ ...p, [cf.id]: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${compFactors[cf.id] ? 'text-emerald-800' : 'text-slate-700'}`}>{cf.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cf.impact === 'HIGH' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{cf.impact}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{cf.detail}</p>
                    </div>
                  </label>
                ))}
              </div>
              {cfCount > 0 && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <p className="text-sm font-bold text-emerald-700">✓ {cfCount} compensating factor{cfCount !== 1 ? 's' : ''} documented{cfCount >= 2 ? ' — strong manual underwrite position' : ' — continue documenting additional factors'}</p>
                </div>
              )}
            </Section>

            {/* ── Income Documentation Checklist ── */}
            <Section title="Income Documentation Checklist" subtitle="Check off each item as it is obtained and added to the file." icon="📎">
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Income Types Present in This File</p>
                <p className="text-xs text-slate-400 mb-3">Select all that apply — documentation requirements and calculation rules will appear for each.</p>
                <div className="flex flex-wrap gap-2">
                  {INCOME_TYPES.map(t => (
                    <label key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold transition-all ${incomeTypes[t.id] ? t.grossUp ? 'bg-purple-600 text-white border-purple-600' : 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                      <input type="checkbox" checked={!!incomeTypes[t.id]} onChange={e => setIncomeTypes(p => ({ ...p, [t.id]: e.target.checked }))} className="hidden" />
                      {t.label}{t.grossUp && <span className="ml-1 text-xs opacity-80">↑25%</span>}
                    </label>
                  ))}
                </div>
              </div>

              {INCOME_TYPES.filter(t => incomeTypes[t.id]).length === 0 && (
                <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-xl">
                  <p className="text-sm text-slate-400">Select income types above to see documentation requirements.</p>
                </div>
              )}

              <div className="space-y-4">
                {INCOME_TYPES.filter(t => incomeTypes[t.id]).map(t => {
                  const checkedKey  = `docs_${t.id}`;
                  const checkedDocs = incomeTypes[checkedKey] || {};
                  const allChecked  = t.docs.every((_, i) => checkedDocs[i]);
                  return (
                    <div key={t.id} className={`rounded-xl border overflow-hidden ${t.grossUp ? 'border-purple-200' : t.stable ? 'border-emerald-200' : 'border-amber-200'}`}>
                      <div className={`flex items-center justify-between px-4 py-3 ${t.grossUp ? 'bg-purple-50' : t.stable ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${t.grossUp ? 'bg-purple-500' : t.stable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="text-sm font-bold text-slate-800">{t.label}</span>
                          {t.grossUp     && <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">Non-Taxable — Gross Up 25%</span>}
                          {t.continuance && <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">Continuance Required</span>}
                          {!t.stable && !t.grossUp && <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">History Required</span>}
                        </div>
                        {allChecked && <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-full font-bold shrink-0">✓ Docs Complete</span>}
                      </div>
                      <div className="px-4 py-3 bg-white space-y-3">
                        {t.grossUpNote && <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2"><p className="text-xs font-semibold text-purple-700">💡 Gross-Up Calculation</p><p className="text-xs text-purple-600 mt-0.5">{t.grossUpNote}</p></div>}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"><p className="text-xs font-semibold text-blue-700">📐 How to Calculate</p><p className="text-xs text-blue-600 mt-0.5">{t.calcRule}</p></div>
                        {t.warning   && <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2"><p className="text-xs font-semibold text-red-700">⚠ Important</p><p className="text-xs text-red-600 mt-0.5">{t.warning}</p></div>}
                        {t.continuance && <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"><p className="text-xs font-semibold text-blue-700">📅 Continuance</p><p className="text-xs text-blue-600 mt-0.5">Must document that this income will continue for at least 3 years beyond closing.</p></div>}
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Required Documents</p>
                          <div className="space-y-1.5">
                            {t.docs.map((docItem, i) => {
                              const isChecked = !!checkedDocs[i];
                              return (
                                <label key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${isChecked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                  <input type="checkbox" checked={isChecked}
                                    onChange={e => setIncomeTypes(p => ({ ...p, [checkedKey]: { ...(p[checkedKey] || {}), [i]: e.target.checked } }))}
                                    className="w-3.5 h-3.5 accent-emerald-600 shrink-0" />
                                  <span className={isChecked ? 'text-emerald-700 font-medium line-through opacity-60' : 'text-slate-600'}>{docItem}</span>
                                </label>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(Object.values(checkedDocs).filter(Boolean).length / t.docs.length) * 100}%` }} />
                            </div>
                            <span className="text-xs text-slate-400">{Object.values(checkedDocs).filter(Boolean).length}/{t.docs.length} obtained</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ── LO Notes ── */}
            <Section title="LO Notes" subtitle="Qualifying notes, compensating factor details, or documentation references." icon="📝">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                placeholder="Document qualifying rationale, compensating factors, unusual income types, or underwriter notes..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 resize-none" />
            </Section>

            {scenarioId && findingsReported && (
              <NextStepCard
                suggestion={primarySuggestion}
                secondarySuggestions={secondarySuggestions}
                onFollow={logFollow}
                onOverride={logOverride}
                loanPurpose={loanPurpose}
                scenarioId={scenarioId}
              />
            )}

            {scenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Qualifying Intelligence™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* ── Right Panel ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Income Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Borrower Income',    fmt$(totalBorrowerIncome)   + '/mo'],
                  ['Co-Borrower Income', totalCoBorrowerIncome > 0 ? fmt$(totalCoBorrowerIncome) + '/mo' : '—'],
                  ['Total Qualifying',   fmt$(totalIncome)           + '/mo'],
                  ['Annual (×12)',       fmt$(totalIncome * 12)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className="font-bold text-slate-700">{v}</span>
                  </div>
                ))}
                {[...incomes, ...coborrowerIncomes].some(i => { const t = INCOME_TYPES.find(t => t.id === i.type); return t?.grossUp && i.nonTaxableConfirmed; }) && (
                  <div className="pt-2 mt-1 border-t border-slate-100">
                    <p className="text-purple-600 font-semibold">↑ Includes non-taxable gross-up</p>
                    <p className="text-slate-400 mt-0.5">Qualifying income is higher than raw award letter amounts</p>
                  </div>
                )}
              </div>
            </div>

            {parseFloat(slBalance) > 0 && (
              <div className={`rounded-xl border p-4 ${slQualPayment === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">🎓 Student Loan</h3>
                <div className="text-2xl font-black text-amber-600">{fmt$0(slQualPayment)}<span className="text-sm font-normal text-slate-400">/mo</span></div>
                <p className="text-xs text-slate-500 mt-1">{slResult.label} — {scenario?.loanType || 'no program'}</p>
                <p className="text-xs text-slate-400 mt-0.5 italic">Included in back-end DTI</p>
              </div>
            )}

            {totalIncome > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">DTI Summary</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Front-End DTI', val: frontDTI, guideline: 28, max: 46.9 },
                    { label: 'Back-End DTI',  val: backDTI,  guideline: 43, max: 56.9 },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-500">{item.label}</span>
                        <span className={`text-sm font-black font-mono ${dtiColor(item.val, item.max)}`}>{fmtPct(item.val)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${item.val > item.max ? 'bg-red-500' : item.val > item.guideline ? 'bg-amber-400' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(item.val / item.max * 100, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-300 mt-0.5">
                        <span>0%</span><span>Guideline {item.guideline}%</span><span>Max {item.max}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalIncome > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Program Eligibility</h3>
                <div className="space-y-1.5">
                  {programResults.map(({ key, prog, eligible }) => (
                    <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${eligible ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
                      <span className={`font-semibold ${eligible ? 'text-emerald-700' : 'text-slate-400'}`}>{prog.label}</span>
                      <span className={eligible ? 'text-emerald-600 font-bold' : 'text-red-400 font-bold'}>{eligible ? '✓' : '✗'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
