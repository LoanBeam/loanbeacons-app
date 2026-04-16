// src/pages/BankStatementIntel.jsx
// LoanBeacons™ — Module 6 | Stage 1: Pre-Structure
// Bank Statement Intelligence™ — Non-QM income qualification for self-employed borrowers

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';
// ─── Constants ────────────────────────────────────────────────────────────────
const EXPENSE_RATIOS = {
  consulting:     0.10,
  technology:     0.20,
  real_estate:    0.30,
  healthcare:     0.35,
  other:          0.35,
  construction:   0.40,
  retail:         0.50,
  restaurant:     0.55,
  manufacturing:  0.55,
  transportation: 0.60,
};

const BUSINESS_TYPES = [
  { value: 'consulting',     label: 'Consulting / Professional',  pct: '10%', icon: '💼' },
  { value: 'technology',     label: 'Technology / Software',       pct: '20%', icon: '💻' },
  { value: 'real_estate',    label: 'Real Estate',                 pct: '30%', icon: '🏠' },
  { value: 'healthcare',     label: 'Healthcare / Medical',        pct: '35%', icon: '🏥' },
  { value: 'other',          label: 'Other / General Business',   pct: '35%', icon: '🏢' },
  { value: 'construction',   label: 'Construction / Trades',       pct: '40%', icon: '🔨' },
  { value: 'retail',         label: 'Retail / E-Commerce',         pct: '50%', icon: '🛍️' },
  { value: 'restaurant',     label: 'Restaurant / Food Service',   pct: '55%', icon: '🍽️' },
  { value: 'manufacturing',  label: 'Manufacturing',               pct: '55%', icon: '🏭' },
  { value: 'transportation', label: 'Transportation / Logistics',  pct: '60%', icon: '🚛' },
];

const GLOSSARY = [
  { term: 'Bank Statement Loan', icon: '🏦', definition: 'A Non-QM loan product that uses 12 or 24 months of personal or business bank statements to calculate qualifying income — instead of tax returns. Designed for self-employed borrowers whose tax returns understate actual income.', highlight: true },
  { term: 'Expense Ratio',       icon: '📊', definition: 'An IRS-based standard deduction applied to gross business bank statement deposits to estimate business expenses. The remaining percentage is treated as income available for qualifying.', highlight: false },
  { term: 'Add-Backs',           icon: '➕', definition: 'Non-cash expenses documented on tax returns that are added back to business income. Common add-backs: depreciation, depletion, mileage, amortization. Must be documented on Schedule C or partnership returns.', highlight: true },
  { term: 'NSF / OD',           icon: '⚠️', definition: 'Non-Sufficient Funds or Overdraft events. Lenders view NSFs as a sign of financial instability. 1-2 may be explainable; 3+ in any 12-month period often triggers denial or requires written explanation.', highlight: false },
  { term: 'Income Trend',        icon: '📈', definition: 'Comparison of the first half vs second half of the analysis period. Rising trend (2nd half higher) = positive indicator. Declining trend (2nd half lower by >15%) = underwriter concern requiring explanation.', highlight: true },
  { term: 'Qualifying Income',   icon: '✅', definition: 'The final monthly income figure used to calculate DTI. For bank statement loans: (Avg Gross Deposits × (1 − Expense Ratio) × Ownership%) ÷ Analysis Months + Monthly Add-Backs.', highlight: false },
];

const WHEN_TO_USE = [
  { scenario: 'Self-Employed Business Owner', icon: '💼', color: 'violet', description: 'Client writes off significant expenses, reducing taxable income below what is needed to qualify on tax returns. Bank statements show the true cash flow available for housing.', tip: 'Compare tax return income to bank statement income — the difference shows the opportunity.' },
  { scenario: 'Gig Economy / 1099 Workers',   icon: '📱', color: 'blue',   description: 'Freelancers, ride-share drivers, delivery workers, and contractors often have variable income that is difficult to document with traditional W-2 methods.', tip: 'Personal account OK for 1099 workers. Look for consistent monthly deposits and positive trend.' },
  { scenario: 'Cash-Intensive Business',       icon: '💵', color: 'emerald', description: 'Restaurants, salons, retail shops, and similar businesses may have large cash deposits. These must be sourced and documented. Watch for large irregular deposits.', tip: 'Flag large one-time deposits — lenders will exclude any non-business or gift funds.' },
  { scenario: 'Commission / Variable Income',  icon: '📈', color: 'amber',  description: 'Sales professionals with high income variability benefit from 24-month analysis to average out seasonal peaks. Rising trend over 24 months is a strong compensating factor.', tip: '24-month analysis averages the highs and lows. A 12-month period might catch a peak — use whichever is more accurate.' },
];

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getMonthLabels(count) {
  const now = new Date();
  const labels = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(`${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`);
  }
  return labels;
}

const fmtD  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmt0  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n) => isNaN(n) ? '--' : Number(n).toFixed(1) + '%';
const MILEAGE_RATE = 0.67; // 2024 IRS rate

// ─── Letter Builders ──────────────────────────────────────────────────────────
function buildBorrowerLetter({ borrowerName, accountType, analysisPeriod, businessType, qualifyingMonthly, qualifyingAnnual, avgDeposits, expenseRatio, ownershipPct, trendPct, nsfCount, addbacks, aiSummary, loNotes }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bt = BUSINESS_TYPES.find(b => b.value === businessType);
  const lines = [];
  lines.push(today);
  lines.push('');
  lines.push('Dear ' + (borrowerName || 'Valued Client') + ',');
  lines.push('');
  lines.push('RE: Bank Statement Income Analysis — Qualification Summary');
  lines.push('');
  lines.push('I have completed a ' + analysisPeriod + '-month ' + (accountType === 'business' ? 'business' : 'personal') + ' bank statement income analysis for your mortgage application. This letter summarizes how your income has been calculated and what it means for your qualification.');
  lines.push('');
  lines.push('YOUR INCOME SUMMARY');
  lines.push('Analysis Period: ' + analysisPeriod + ' months');
  lines.push('Account Type: ' + (accountType === 'business' ? 'Business' : 'Personal'));
  if (accountType === 'business') {
    lines.push('Business Type: ' + (bt?.label || 'General Business'));
    lines.push('Expense Ratio Applied: ' + Math.round(expenseRatio * 100) + '% (IRS industry standard)');
  }
  if (parseFloat(ownershipPct) < 100) lines.push('Business Ownership: ' + ownershipPct + '%');
  lines.push('Average Monthly Gross Deposits: ' + fmt0(avgDeposits));
  lines.push('Monthly Qualifying Income: ' + fmt0(qualifyingMonthly));
  lines.push('Annual Qualifying Income: ' + fmt0(qualifyingAnnual));
  lines.push('');
  lines.push('HOW YOUR INCOME WAS CALCULATED');
  lines.push('Your qualifying income is calculated by averaging your gross deposits over ' + analysisPeriod + ' months' + (accountType === 'business' ? ', then applying the standard ' + Math.round(expenseRatio * 100) + '% expense deduction to account for business operating costs' : '') + '.' + (addbacks > 0 ? ' We also added back $' + fmt0(addbacks) + '/month in documented non-cash expenses.' : ''));
  lines.push('');
  lines.push('INCOME TREND');
  lines.push(trendPct >= 5 ? 'Your income shows a positive rising trend of ' + fmtPct(trendPct) + ' over the analysis period — a strong indicator of business health.' : trendPct >= -5 ? 'Your income is stable with minimal variance (' + fmtPct(trendPct) + '%) between periods.' : 'Your income shows a declining trend of ' + fmtPct(Math.abs(trendPct)) + '% between the first and second half of the analysis period. We will provide documentation to explain this to the underwriter.');
  if (nsfCount > 0) { lines.push(''); lines.push('NOTE: Your statements show ' + nsfCount + ' NSF/overdraft event(s). Please be prepared to provide written explanation if requested by the underwriter.'); }
  if (aiSummary) { lines.push(''); lines.push('UNDERWRITER ASSESSMENT'); lines.push(aiSummary); }
  if (loNotes) { lines.push(''); lines.push('ADDITIONAL NOTES'); lines.push(loNotes); }
  lines.push('');
  lines.push('Please review this summary and let me know if you have any questions. I am happy to walk through the calculation in detail.');
  lines.push('');
  lines.push('Respectfully submitted,');
  lines.push('');
  lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions');
  lines.push('george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function buildUnderwriterLetter({ borrowerName, accountType, analysisPeriod, businessType, qualifyingMonthly, qualifyingAnnual, avgDeposits, expenseRatio, ownershipPct, trendPct, nsfCount, depreciation, depletion, mileage, amortization, otherAddback, otherAddbackLabel, addbacks, aiSummary, aiFlags, loNotes }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bt = BUSINESS_TYPES.find(b => b.value === businessType);
  const lines = [];
  lines.push(today);
  lines.push('');
  lines.push('To: Mortgage Underwriter / Processor');
  lines.push('From: George Jules Chevalier IV, NMLS #1175947 — Clearview Lending Solutions');
  lines.push('Re: Bank Statement Income Analysis — ' + (borrowerName || 'Borrower'));
  lines.push('Date: ' + today);
  lines.push('');
  lines.push('INCOME CALCULATION METHODOLOGY');
  lines.push('Analysis Period: ' + analysisPeriod + ' months | Account Type: ' + (accountType === 'business' ? 'Business' : 'Personal'));
  if (accountType === 'business') lines.push('Business Classification: ' + (bt?.label || 'General') + ' | Expense Ratio: ' + Math.round(expenseRatio * 100) + '%');
  if (parseFloat(ownershipPct) < 100) lines.push('Ownership Percentage: ' + ownershipPct + '% (income pro-rated accordingly)');
  lines.push('');
  lines.push('INCOME WATERFALL');
  lines.push('Average Monthly Gross Deposits (' + analysisPeriod + ' mo avg): ' + fmt0(avgDeposits));
  if (accountType === 'business') lines.push('Less: Business Expense Ratio (' + Math.round(expenseRatio * 100) + '%): -' + fmt0(avgDeposits * expenseRatio));
  if (parseFloat(ownershipPct) < 100) lines.push('Ownership Adjustment (' + ownershipPct + '%): adjusted accordingly');
  if (parseFloat(depreciation) > 0) lines.push('Add-back: Depreciation (monthly): +' + fmt0(parseFloat(depreciation) / 12));
  if (parseFloat(depletion) > 0) lines.push('Add-back: Depletion (monthly): +' + fmt0(parseFloat(depletion) / 12));
  if (parseFloat(mileage) > 0) lines.push('Add-back: Mileage (' + mileage + ' mi × $' + MILEAGE_RATE + '): +' + fmt0((parseFloat(mileage) * MILEAGE_RATE) / 12));
  if (parseFloat(amortization) > 0) lines.push('Add-back: Amortization (monthly): +' + fmt0(parseFloat(amortization) / 12));
  if (parseFloat(otherAddback) > 0) lines.push('Add-back: ' + (otherAddbackLabel || 'Other') + ' (monthly): +' + fmt0(parseFloat(otherAddback) / 12));
  lines.push('─────────────────────────────');
  lines.push('MONTHLY QUALIFYING INCOME: ' + fmt0(qualifyingMonthly));
  lines.push('ANNUAL QUALIFYING INCOME: ' + fmt0(qualifyingAnnual));
  lines.push('');
  lines.push('INCOME TREND ANALYSIS');
  lines.push('Period-over-period trend: ' + (trendPct >= 0 ? '+' : '') + fmtPct(trendPct));
  lines.push(trendPct >= 5 ? 'Assessment: Rising income trend — favorable indicator for sustained qualifying income.' : trendPct >= -5 ? 'Assessment: Stable income — minimal variance between periods.' : trendPct >= -15 ? 'Assessment: Slight decline — documentation of business conditions provided.' : 'Assessment: Declining trend — compensating factors documented below.');
  lines.push('');
  lines.push('NSF / OVERDRAFT EVENTS');
  lines.push('Total NSF/OD events: ' + nsfCount + (nsfCount === 0 ? ' — No derogatory account events.' : nsfCount <= 2 ? ' — Minor. Written explanation attached.' : ' — Significant. Compensating factors required.'));
  if (aiSummary) { lines.push(''); lines.push('AI UNDERWRITING ASSESSMENT'); lines.push(aiSummary); }
  if (aiFlags && aiFlags.length > 0) { lines.push(''); lines.push('FLAGS FOR UNDERWRITER REVIEW'); aiFlags.forEach((f, i) => lines.push((i + 1) + '. ' + f)); }
  if (loNotes) { lines.push(''); lines.push('LO NOTES / COMPENSATING FACTORS'); lines.push(loNotes); }
  lines.push('');
  lines.push('All documentation available in file. Please contact me with any questions.');
  lines.push('');
  lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions | george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

// ─── Letter Component ─────────────────────────────────────────────────────────
function LetterCard({ title, icon, body, color = 'violet' }) {
  const [copied, setCopied] = useState(false);
  const colorMap = { violet: 'border-violet-200 bg-violet-50', blue: 'border-blue-200 bg-blue-50', emerald: 'border-emerald-200 bg-emerald-50' };
  const btnMap   = { violet: 'bg-violet-700 hover:bg-violet-600', blue: 'bg-blue-700 hover:bg-blue-600', emerald: 'bg-emerald-700 hover:bg-emerald-600' };
  return (
    <div className={'rounded-3xl border-2 overflow-hidden ' + colorMap[color]}>
      <ModuleNav moduleNumber={7} />
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="font-bold text-slate-700 flex items-center gap-2">{icon} {title}</div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={'text-xs px-4 py-2 rounded-xl text-white transition-colors ' + btnMap[color]}>
            {copied ? '✓ Copied' : 'Copy Letter'}
          </button>
          <button onClick={() => window.print()} className="text-xs px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors">Print</button>
        </div>
      </div>
      <pre className="p-6 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">{body}</pre>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BankStatementIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  // Scenario
  const [scenario, setScenario]     = useState(null);
  const [scenarios, setScenarios]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [borrowerName, setBorrowerName] = useState('');
  const [loanType, setLoanType]     = useState('');
  const [loanAmount, setLoanAmount] = useState('');

  // Tabs
  const [activeTab, setActiveTab] = useState(0);

  // Config
  const [analysisPeriod, setAnalysisPeriod] = useState('24');
  const [accountType, setAccountType]       = useState('business');
  const [businessType, setBusinessType]     = useState('other');
  const [useCustomRatio, setUseCustomRatio] = useState(false);
  const [customExpenseRatio, setCustomExpenseRatio] = useState('');
  const [ownershipPct, setOwnershipPct]     = useState('100');

  // Monthly data
  const monthCount  = parseInt(analysisPeriod);
  const monthLabels = useMemo(() => getMonthLabels(monthCount), [monthCount]);
  const [monthlyData, setMonthlyData] = useState(() =>
    Array(24).fill(null).map(() => ({ deposits: '', transfers: '', nsf: false, notes: '' }))
  );

  // Add-backs
  const [depreciation, setDepreciation]           = useState('');
  const [depletion, setDepletion]                 = useState('');
  const [mileage, setMileage]                     = useState('');
  const [amortization, setAmortization]           = useState('');
  const [otherAddback, setOtherAddback]           = useState('');
  const [otherAddbackLabel, setOtherAddbackLabel] = useState('');

  // Flags
  const [nsfCount, setNsfCount]                       = useState(0);
  const [largeDepositsExplained, setLargeDepositsExplained] = useState(null);
  const [businessAccountVerified, setBusinessAccountVerified] = useState(null);

  // PDF / AI
  const [uploading, setUploading]     = useState(false);
  const [aiResult, setAiResult]       = useState(null);
  const [aiError, setAiError]         = useState('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis]   = useState(null);

  // Notes & letters
  const [loNotes, setLoNotes] = useState('');
  const [activeLetterTab, setActiveLetterTab] = useState('borrower');

  // Decision Record
  const [recordSaving, setRecordSaving]   = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(scenarioId);

  // ─── localStorage key ────────────────────────────────────────────────────────
  const lsKey = scenarioId ? `lb_bank_stmt_${scenarioId}` : null;

  // ─── Save to localStorage ─────────────────────────────────────────────────────
  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({
      analysisPeriod, accountType, businessType, useCustomRatio, customExpenseRatio, ownershipPct,
      monthlyData, depreciation, depletion, mileage, amortization, otherAddback, otherAddbackLabel,
      nsfCount, largeDepositsExplained, businessAccountVerified, loNotes,
      aiResult, aiAnalysis, savedRecordId,
    }));
  }, [lsKey, analysisPeriod, accountType, businessType, useCustomRatio, customExpenseRatio, ownershipPct,
      monthlyData, depreciation, depletion, mileage, amortization, otherAddback, otherAddbackLabel,
      nsfCount, largeDepositsExplained, businessAccountVerified, loNotes, aiResult, aiAnalysis, savedRecordId]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // ─── Load scenario + localStorage ────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios'))
        .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(console.error)
        .finally(() => setLoading(false));
      return;
    }
    // Restore localStorage first
    if (lsKey) {
      try {
        const saved = localStorage.getItem(lsKey);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.analysisPeriod)    setAnalysisPeriod(s.analysisPeriod);
          if (s.accountType)       setAccountType(s.accountType);
          if (s.businessType)      setBusinessType(s.businessType);
          if (s.useCustomRatio !== undefined) setUseCustomRatio(s.useCustomRatio);
          if (s.customExpenseRatio) setCustomExpenseRatio(s.customExpenseRatio);
          if (s.ownershipPct)      setOwnershipPct(s.ownershipPct);
          if (s.monthlyData)       setMonthlyData(s.monthlyData);
          if (s.depreciation)      setDepreciation(s.depreciation);
          if (s.depletion)         setDepletion(s.depletion);
          if (s.mileage)           setMileage(s.mileage);
          if (s.amortization)      setAmortization(s.amortization);
          if (s.otherAddback)      setOtherAddback(s.otherAddback);
          if (s.otherAddbackLabel) setOtherAddbackLabel(s.otherAddbackLabel);
          if (s.nsfCount !== undefined) setNsfCount(s.nsfCount);
          if (s.largeDepositsExplained !== undefined) setLargeDepositsExplained(s.largeDepositsExplained);
          if (s.businessAccountVerified !== undefined) setBusinessAccountVerified(s.businessAccountVerified);
          if (s.loNotes)           setLoNotes(s.loNotes);
          if (s.aiResult)          setAiResult(s.aiResult);
          if (s.aiAnalysis)        setAiAnalysis(s.aiAnalysis);
          if (s.savedRecordId)     setSavedRecordId(s.savedRecordId);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        if (d.loanType) setLoanType(d.loanType);
        if (d.loanAmount) setLoanAmount(String(d.loanAmount));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // ─── Calculations ─────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const slice = monthlyData.slice(0, monthCount);
    const depositArr = slice.map(m => parseFloat(m.deposits) || 0);
    const transferArr = slice.map(m => parseFloat(m.transfers) || 0);
    const netArr = depositArr.map((d, i) => Math.max(0, d - transferArr[i]));
    const totalDeposits = netArr.reduce((a, b) => a + b, 0);
    const avgMonthlyDeposits = monthCount > 0 ? totalDeposits / monthCount : 0;

    const expenseRatio = useCustomRatio && customExpenseRatio !== ''
      ? Math.min(1, Math.max(0, parseFloat(customExpenseRatio) / 100))
      : (EXPENSE_RATIOS[businessType] || 0.35);

    const incomeAfterExpenses = accountType === 'business'
      ? avgMonthlyDeposits * (1 - expenseRatio)
      : avgMonthlyDeposits;

    const ownershipFactor = Math.min(1, Math.max(0, parseFloat(ownershipPct) / 100)) || 1;
    const incomeAfterOwnership = incomeAfterExpenses * ownershipFactor;

    const deprMonthly  = parseFloat(depreciation) > 0 ? parseFloat(depreciation) / 12 : 0;
    const deplMonthly  = parseFloat(depletion) > 0 ? parseFloat(depletion) / 12 : 0;
    const mileageAmt   = parseFloat(mileage) > 0 ? (parseFloat(mileage) * MILEAGE_RATE) / 12 : 0;
    const amorMonthly  = parseFloat(amortization) > 0 ? parseFloat(amortization) / 12 : 0;
    const otherMonthly = parseFloat(otherAddback) > 0 ? parseFloat(otherAddback) / 12 : 0;
    const totalAddbacks = deprMonthly + deplMonthly + mileageAmt + amorMonthly + otherMonthly;

    const qualifyingMonthly = incomeAfterOwnership + totalAddbacks;
    const qualifyingAnnual  = qualifyingMonthly * 12;

    // Trend: compare 1st half vs 2nd half
    const half = Math.floor(monthCount / 2);
    const firstArr  = netArr.slice(0, half);
    const secondArr = netArr.slice(half);
    const firstAvg  = firstArr.length  ? firstArr.reduce((a, b) => a + b, 0) / firstArr.length : 0;
    const secondAvg = secondArr.length ? secondArr.reduce((a, b) => a + b, 0) / secondArr.length : 0;
    const trendPct  = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

    // Income score (1-100)
    let score = 60;
    if (trendPct >= 10)        score += 20;
    else if (trendPct >= 0)    score += 10;
    else if (trendPct >= -10)  score -= 5;
    else                       score -= 20;
    if (nsfCount === 0)        score += 15;
    else if (nsfCount <= 2)    score += 5;
    else if (nsfCount <= 5)    score -= 10;
    else                       score -= 20;
    if (largeDepositsExplained === true)  score += 5;
    if (largeDepositsExplained === false) score -= 10;
    if (businessAccountVerified === true) score += 5;
    score = Math.min(100, Math.max(1, score));

    return {
      avgMonthlyDeposits, expenseRatio, incomeAfterExpenses, incomeAfterOwnership,
      deprMonthly, deplMonthly, mileageAmt, amorMonthly, otherMonthly, totalAddbacks,
      qualifyingMonthly, qualifyingAnnual, firstAvg, secondAvg, trendPct, score, netArr,
    };
  }, [monthlyData, monthCount, accountType, businessType, useCustomRatio, customExpenseRatio,
      ownershipPct, depreciation, depletion, mileage, amortization, otherAddback, nsfCount,
      largeDepositsExplained, businessAccountVerified]);

  // ─── Update monthly data helper ───────────────────────────────────────────────
  const updateMonth = (idx, field, value) => {
    setMonthlyData(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // ─── AI PDF Extraction (Haiku) ────────────────────────────────────────────────
  const handlePDFUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setAiError('');
    setAiResult(null);
    try {
      const fileArray = Array.from(files);
      const allExtracted = [];
      for (const file of fileArray) {
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = () => rej(new Error('Read failed'));
          reader.readAsDataURL(file);
        });
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: 'Extract monthly bank statement data. Return ONLY valid JSON, no markdown: {"accountType":"personal|business","accountHolder":"name","bankName":"string","months":[{"period":"Mon YYYY","grossDeposits":number,"transfersExcluded":number,"nsfCount":number,"largeDeposits":[{"amount":number,"description":"string"}],"notes":"any flags or unusual items"}],"overallNotes":"summary of account patterns observed"}' },
              ],
            }],
          }),
        });
        if (!resp.ok) throw new Error('Extraction failed ' + resp.status);
        const data = await resp.json();
        const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const match = text.match(/\{[\s\S]*\}/);
        if (match) allExtracted.push(JSON.parse(match[0]));
      }
      // Merge all extracted months
      const merged = { accountType: allExtracted[0]?.accountType || 'business', bankName: allExtracted[0]?.bankName || '', months: [], overallNotes: allExtracted.map(e => e.overallNotes).filter(Boolean).join(' ') };
      allExtracted.forEach(e => { if (e.months) merged.months.push(...e.months); });
      // Remove duplicate periods
      const seen = new Set();
      merged.months = merged.months.filter(m => { if (seen.has(m.period)) return false; seen.add(m.period); return true; });
      merged.months.sort((a, b) => new Date('01 ' + a.period) - new Date('01 ' + b.period));
      setAiResult(merged);
      // Pre-fill monthly data grid
      if (merged.accountType) setAccountType(merged.accountType);
      merged.months.slice(0, 24).forEach((m, i) => {
        setMonthlyData(prev => {
          const next = [...prev];
          next[i] = {
            deposits: String(m.grossDeposits || ''),
            transfers: String(m.transfersExcluded || ''),
            nsf: (m.nsfCount || 0) > 0,
            notes: m.notes || '',
          };
          return next;
        });
      });
      // NSF count
      const totalNSF = merged.months.reduce((a, m) => a + (m.nsfCount || 0), 0);
      setNsfCount(totalNSF <= 2 ? 0 : totalNSF <= 5 ? 1 : 2);
      // Switch to deposit tab
      setActiveTab(1);
    } catch (err) {
      setAiError('Extraction failed: ' + err.message + '. Please enter deposit data manually.');
    }
    setUploading(false);
  };

  // ─── AI Sonnet Analysis ───────────────────────────────────────────────────────
  const handleAIAnalysis = async () => {
    if (calc.qualifyingMonthly === 0) return;
    setAiAnalyzing(true);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          messages: [{
            role: 'user',
            content: `You are a senior Non-QM mortgage underwriter specializing in bank statement income analysis. Evaluate this file and provide underwriting guidance.

INCOME DATA:
- Analysis Period: ${analysisPeriod} months
- Account Type: ${accountType === 'business' ? 'Business' : 'Personal'}
- Business Type: ${BUSINESS_TYPES.find(b => b.value === businessType)?.label || 'General'}
- Avg Monthly Gross Deposits: $${Math.round(calc.avgMonthlyDeposits).toLocaleString()}
- Expense Ratio Applied: ${Math.round(calc.expenseRatio * 100)}%
- Ownership Percentage: ${ownershipPct}%
- Monthly Add-backs: $${Math.round(calc.totalAddbacks).toLocaleString()}
- Monthly Qualifying Income: $${Math.round(calc.qualifyingMonthly).toLocaleString()}
- Annual Qualifying Income: $${Math.round(calc.qualifyingAnnual).toLocaleString()}
- Income Trend: ${fmtPct(calc.trendPct)} (1st half avg $${Math.round(calc.firstAvg).toLocaleString()} vs 2nd half avg $${Math.round(calc.secondAvg).toLocaleString()})
- NSF Count: ${nsfCount === 0 ? 'None' : nsfCount === 1 ? '1-2' : nsfCount === 2 ? '3-5' : '6+'}
- Large Deposits Explained: ${largeDepositsExplained === true ? 'Yes' : largeDepositsExplained === false ? 'No' : 'Not applicable'}
- Business Account Verified: ${businessAccountVerified === true ? 'Yes' : businessAccountVerified === false ? 'No' : 'N/A'}
- Loan Type: ${loanType || 'Non-QM Bank Statement'}

Return ONLY valid JSON, no markdown: {"verdict":"STRONG|ACCEPTABLE|MARGINAL|WEAK","summary":"2-3 sentence underwriter assessment","strengths":["list up to 3 strengths"],"concerns":["list up to 4 concerns or flags"],"compensatingFactors":["suggest 2-3 compensating factors"],"lenderNote":"one-sentence note for lender/processor"}`,
          }],
        }),
      });
      if (!resp.ok) throw new Error('Analysis API error ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) setAiAnalysis(JSON.parse(match[0]));
    } catch (err) {
      console.error('AI analysis failed:', err);
    }
    setAiAnalyzing(false);
  };

  // ─── Decision Record ──────────────────────────────────────────────────────────
  // ─── Next Step Intelligence™ ──────────────────────────────────────────────
  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash')
    ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('term') || rawPurpose.includes('refi')
      ? 'rate_term_refi'
      : 'purchase';

  const nsiFindings = {
    incomeConfirmed: calc?.qualifyingMonthly > 0 && (calc?.score >= 70),
  };

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'BANK_STATEMENT_INTEL',
      loanPurpose,
      decisionRecordFindings:  { BANK_STATEMENT_INTEL: nsiFindings },
      scenarioData:            scenario || {},
      completedModules:        [],
      scenarioId,
      onWriteToDecisionRecord: null,
    });

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const riskFlags = [];
      if (nsfCount >= 2) riskFlags.push({ field: 'nsfCount', message: 'NSF events present — ' + (nsfCount === 2 ? '3-5' : '6+') + ' — underwriter review required', severity: nsfCount >= 3 ? 'HIGH' : 'MEDIUM' });
      if (calc.trendPct < -15) riskFlags.push({ field: 'incomeTrend', message: 'Declining income trend: ' + fmtPct(calc.trendPct), severity: 'HIGH' });
      if (largeDepositsExplained === false) riskFlags.push({ field: 'largeDeposits', message: 'Large/irregular deposits not yet explained', severity: 'MEDIUM' });
      if (aiAnalysis?.verdict === 'WEAK' || aiAnalysis?.verdict === 'MARGINAL') riskFlags.push({ field: 'aiAssessment', message: 'AI assessment: ' + aiAnalysis.verdict, severity: aiAnalysis.verdict === 'WEAK' ? 'HIGH' : 'MEDIUM' });
      const writtenId = await reportFindings({
        verdict: aiAnalysis?.verdict || (calc.score >= 70 ? 'ACCEPTABLE' : 'MARGINAL'),
        summary: `Bank Statement Income Analysis — ${analysisPeriod}-month ${accountType} account. Avg gross deposits: ${fmt0(calc.avgMonthlyDeposits)}/mo. Monthly qualifying income: ${fmt0(calc.qualifyingMonthly)}. Income trend: ${fmtPct(calc.trendPct)}. NSF events: ${nsfCount === 0 ? 'None' : nsfCount === 1 ? '1-2' : nsfCount === 2 ? '3-5' : '6+'}. ${aiAnalysis?.summary || ''}`,
        riskFlags,
        findings: {
          analysisPeriod: parseInt(analysisPeriod), accountType, businessType,
          expenseRatio: calc.expenseRatio, ownershipPct: parseFloat(ownershipPct),
          avgMonthlyDeposits: calc.avgMonthlyDeposits, qualifyingMonthly: calc.qualifyingMonthly,
          qualifyingAnnual: calc.qualifyingAnnual, trendPct: calc.trendPct, nsfCount,
          totalAddbacks: calc.totalAddbacks, incomeScore: calc.score, loNotes,
        },
        completeness: {
          depositsEntered: calc.avgMonthlyDeposits > 0,
          nsfDocumented: nsfCount !== undefined,
          aiAnalysisRun: !!aiAnalysis,
          loNotesAdded: loNotes.trim().length > 0,
        },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────────
  const trendColor = calc.trendPct >= 5 ? 'text-emerald-600' : calc.trendPct >= -5 ? 'text-slate-600' : calc.trendPct >= -15 ? 'text-amber-600' : 'text-red-600';
  const scoreColor = calc.score >= 75 ? 'text-emerald-600' : calc.score >= 55 ? 'text-amber-600' : 'text-red-600';
  const verdictColor = { STRONG: 'bg-emerald-100 text-emerald-800 border-emerald-300', ACCEPTABLE: 'bg-blue-100 text-blue-800 border-blue-300', MARGINAL: 'bg-amber-100 text-amber-800 border-amber-300', WEAK: 'bg-red-100 text-red-800 border-red-300' };

  const borrowerLetter = buildBorrowerLetter({
    borrowerName, accountType, analysisPeriod, businessType,
    qualifyingMonthly: calc.qualifyingMonthly, qualifyingAnnual: calc.qualifyingAnnual,
    avgDeposits: calc.avgMonthlyDeposits, expenseRatio: calc.expenseRatio,
    ownershipPct, trendPct: calc.trendPct, nsfCount, addbacks: calc.totalAddbacks,
    aiSummary: aiAnalysis?.summary, loNotes,
  });

  const underwriterLetter = buildUnderwriterLetter({
    borrowerName, accountType, analysisPeriod, businessType,
    qualifyingMonthly: calc.qualifyingMonthly, qualifyingAnnual: calc.qualifyingAnnual,
    avgDeposits: calc.avgMonthlyDeposits, expenseRatio: calc.expenseRatio,
    ownershipPct, trendPct: calc.trendPct, nsfCount,
    depreciation, depletion, mileage, amortization, otherAddback, otherAddbackLabel,
    addbacks: calc.totalAddbacks, aiSummary: aiAnalysis?.summary,
    aiFlags: aiAnalysis?.concerns, loNotes,
  });

  const TABS = [
    { id: 0, label: 'Statement Upload', icon: '📤' },
    { id: 1, label: 'Deposit Analysis', icon: '📊' },
    { id: 2, label: 'Income Engine', icon: '🧮' },
    { id: 3, label: 'Summary & Letters', icon: '📝' },
  ];

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">🏦</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  // ─── No scenario picker ───────────────────────────────────────────────────────
  if (!scenarioId) return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <div className="bg-slate-900 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 6</div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Bank Statement Intelligence™</h1>
          <p className="text-slate-400">Non-QM income qualification · AI extraction · Expense ratio engine · Underwriter letters</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-slate-400 text-sm">No scenarios found. Create a scenario first.</p> :
            <div className="space-y-2">{scenarios.map(s => (
              <button key={s.id} onClick={() => navigate('/bank-statement-intel?scenarioId=' + s.id)}
                className="w-full text-left p-4 border border-slate-200 rounded-2xl hover:border-violet-400 hover:bg-violet-50 transition-all">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-slate-800">{s.scenarioName || ([s.firstName, s.lastName].filter(Boolean).join(' ')) || 'Unnamed'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{fmt0(s.loanAmount)} · {s.loanType}</div>
                  </div>
                  <span className="text-violet-400 text-xl">→</span>
                </div>
              </button>
            ))}</div>
          }
        </div>
      </div>
    </div>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #7c3aed 0%, transparent 50%), radial-gradient(circle at 80% 20%, #06b6d4 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 6</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Bank Statement Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl leading-relaxed">Non-QM income qualification · AI extraction · Expense ratio engine · Underwriter letters</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '260px' }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{loanAmount ? fmt0(parseFloat(loanAmount)) : ''} · {loanType || 'Non-QM'} · {scenario.state || ''}</div>
                  {calc.qualifyingMonthly > 0 && (
                    <div className="text-violet-300 text-sm font-bold mt-1">{fmt0(calc.qualifyingMonthly)}/mo qualifying</div>
                  )}
                  <button onClick={() => navigate('/bank-statement-intel')} className="text-xs text-blue-400 hover:text-blue-300 mt-2 block">Change scenario →</button>
                </>
              ) : (
                <div className="text-slate-400 text-sm">No scenario loaded</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Borrower Bar ─────────────────────────────────────────────────────── */}
      {scenarioId && borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {scenario?.streetAddress && <span className="text-blue-200 text-xs">{[scenario.streetAddress, scenario.city, scenario.state].filter(Boolean).join(', ')}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {loanAmount && <span>Loan <strong className="text-white">{fmt0(parseFloat(loanAmount))}</strong></span>}
              {loanType && <span>Type <strong className="text-white">{loanType}</strong></span>}
              {analysisPeriod && <span>Period <strong className="text-white">{analysisPeriod} mo</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Bank Statement Intelligence™" moduleNumber="7" scenarioId={scenarioId} />
      <div className="max-w-7xl mx-auto px-6 pt-2">
        <ModuleNav moduleNumber={7} />
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2">
        <DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="BANK_STATEMENT_INTEL" />
        {savedRecordId && primarySuggestion && (
          <NextStepCard
            suggestion={primarySuggestion}
            secondarySuggestions={secondarySuggestions}
            onFollow={logFollow}
            onOverride={logOverride}
            loanPurpose={loanPurpose}
            scenarioId={scenarioId}
          />
        )}
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all ' + (activeTab === tab.id ? 'border-violet-500 text-violet-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 2 && calc.qualifyingMonthly > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-black">{fmt0(calc.qualifyingMonthly)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

          {/* ══ Main Content ═══════════════════════════════════════════════════ */}
          <div className="xl:col-span-2 space-y-8">

            {/* ─── TAB 0: STATEMENT UPLOAD ───────────────────────────────────── */}
            {activeTab === 0 && (
              <>
                {/* How it works */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Bank Statement Upload</h2>
                    <p className="text-slate-400 text-sm mt-1">Upload 12 or 24 months of bank statements. AI extracts deposit data automatically.</p>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      {[
                        { step: '1', icon: '📤', title: 'Upload PDFs', desc: 'Upload one or multiple bank statement PDFs — personal or business' },
                        { step: '2', icon: '🤖', title: 'Haiku Extracts', desc: 'AI reads each statement and extracts monthly deposits, transfers, and NSF events' },
                        { step: '3', icon: '🧮', title: 'Income Engine', desc: 'Apply expense ratio, add-backs, and ownership % to calculate qualifying income' },
                      ].map(s => (
                        <div key={s.step} className="text-center p-5 bg-slate-50 rounded-2xl border border-slate-200">
                          <div className="text-2xl mb-2">{s.icon}</div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Step {s.step}</div>
                          <div className="text-sm font-bold text-slate-800 mb-1">{s.title}</div>
                          <div className="text-xs text-slate-500">{s.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* Analysis config */}
                    <div className="grid grid-cols-2 gap-5 mb-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Analysis Period</label>
                        <div className="flex gap-2">
                          {['12', '24'].map(p => (
                            <button key={p} onClick={() => setAnalysisPeriod(p)}
                              className={'flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all ' + (analysisPeriod === p ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                              {p} Months
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Account Type</label>
                        <div className="flex gap-2">
                          {[['personal', '👤 Personal'], ['business', '🏢 Business']].map(([v, l]) => (
                            <button key={v} onClick={() => setAccountType(v)}
                              className={'flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all ' + (accountType === v ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Upload zone */}
                    <label className={'block border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ' + (uploading ? 'border-violet-300 bg-violet-50' : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50')}>
                      <input type="file" accept=".pdf" multiple className="hidden"
                        onChange={e => handlePDFUpload(e.target.files)} disabled={uploading} />
                      {uploading ? (
                        <div>
                          <div className="text-3xl mb-3 animate-pulse">⏳</div>
                          <div className="font-bold text-violet-700">Extracting deposit data...</div>
                          <div className="text-sm text-violet-500 mt-1">AI is reading your bank statements</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-3xl mb-3">📂</div>
                          <div className="font-bold text-slate-700">Click to select bank statement PDFs</div>
                          <div className="text-sm text-slate-500 mt-1">Select multiple files for a full 12 or 24-month period</div>
                          <div className="text-xs text-slate-400 mt-2">Personal or business checking/savings · PDF format</div>
                        </div>
                      )}
                    </label>

                    {aiError && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{aiError}</div>
                    )}

                    {aiResult && (
                      <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-xl">✅</span>
                          <div>
                            <div className="font-bold text-emerald-800">Extraction Complete</div>
                            <div className="text-sm text-emerald-700">{aiResult.bankName || 'Bank statements'} · {aiResult.months?.length || 0} months extracted · {aiResult.accountType} account</div>
                          </div>
                        </div>
                        {aiResult.overallNotes && (
                          <div className="text-xs text-emerald-700 bg-emerald-100 rounded-xl p-3">{aiResult.overallNotes}</div>
                        )}
                        <button onClick={() => setActiveTab(1)} className="mt-3 text-sm font-bold text-emerald-700 hover:text-emerald-600">Review extracted data in Deposit Analysis →</button>
                      </div>
                    )}

                    <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <p className="text-xs font-bold text-amber-800 mb-2">No PDF? Enter manually</p>
                      <p className="text-xs text-amber-700">Go to the <strong>Deposit Analysis</strong> tab to enter monthly deposit amounts directly. All calculations work the same whether data comes from PDF extraction or manual entry.</p>
                    </div>
                  </div>
                </div>

                {/* When to use */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">When to Use This Module</h2>
                    <p className="text-slate-400 text-sm mt-1">Bank statement loans serve borrowers who can't qualify with traditional income documentation.</p>
                  </div>
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {WHEN_TO_USE.map(u => {
                      const colorMap = { violet: 'bg-violet-50 border-violet-200', blue: 'bg-blue-50 border-blue-200', emerald: 'bg-emerald-50 border-emerald-200', amber: 'bg-amber-50 border-amber-200' };
                      const labelMap = { violet: 'text-violet-700', blue: 'text-blue-700', emerald: 'text-emerald-700', amber: 'text-amber-700' };
                      return (
                        <div key={u.scenario} className={'rounded-2xl border p-5 ' + colorMap[u.color]}>
                          <div className="text-2xl mb-2">{u.icon}</div>
                          <div className={'text-sm font-bold mb-2 ' + labelMap[u.color]}>{u.scenario}</div>
                          <p className="text-xs text-slate-600 mb-3">{u.description}</p>
                          <div className="bg-white/60 rounded-xl p-3 text-xs text-slate-500 italic">💡 {u.tip}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Glossary */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Key Terms Glossary</h2>
                    <p className="text-slate-400 text-sm mt-1">Explain these concepts clearly to every self-employed borrower.</p>
                  </div>
                  <div className="p-8 space-y-4">
                    {GLOSSARY.map(g => (
                      <div key={g.term} className={'rounded-2xl border p-5 ' + (g.highlight ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200')}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">{g.icon}</span>
                          <span className={'font-bold text-sm ' + (g.highlight ? 'text-violet-800' : 'text-slate-800')}>{g.term}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{g.definition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 1: DEPOSIT ANALYSIS ───────────────────────────────────── */}
            {activeTab === 1 && (
              <>
                {/* Month grid */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Monthly Deposit Entry</h2>
                    <p className="text-slate-400 text-sm mt-1">{analysisPeriod}-month analysis · Gross deposits minus excluded transfers = net qualifying deposits</p>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-5 gap-2 mb-3 px-2">
                      <div className="text-xs font-bold text-slate-400 uppercase">Month</div>
                      <div className="text-xs font-bold text-slate-400 uppercase">Gross Deposits ($)</div>
                      <div className="text-xs font-bold text-slate-400 uppercase">Transfers Excl. ($)</div>
                      <div className="text-xs font-bold text-slate-400 uppercase text-center">NSF</div>
                      <div className="text-xs font-bold text-slate-400 uppercase text-right">Net</div>
                    </div>
                    <div className="space-y-2">
                      {monthLabels.map((label, i) => {
                        const net = (parseFloat(monthlyData[i]?.deposits) || 0) - (parseFloat(monthlyData[i]?.transfers) || 0);
                        const isHigh = net > calc.avgMonthlyDeposits * 1.5 && calc.avgMonthlyDeposits > 0;
                        const isLow  = net < calc.avgMonthlyDeposits * 0.5 && calc.avgMonthlyDeposits > 0 && net > 0;
                        return (
                          <div key={i} className={'grid grid-cols-5 gap-2 items-center px-2 py-2 rounded-xl ' + (monthlyData[i]?.nsf ? 'bg-red-50' : i % 2 === 0 ? 'bg-slate-50' : 'bg-white')}>
                            <div className="text-xs font-semibold text-slate-600">{label}</div>
                            <input type="number" value={monthlyData[i]?.deposits || ''} placeholder="0"
                              onChange={e => updateMonth(i, 'deposits', e.target.value)}
                              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white" />
                            <input type="number" value={monthlyData[i]?.transfers || ''} placeholder="0"
                              onChange={e => updateMonth(i, 'transfers', e.target.value)}
                              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white" />
                            <div className="flex justify-center">
                              <button onClick={() => updateMonth(i, 'nsf', !monthlyData[i]?.nsf)}
                                className={'w-7 h-7 rounded-full border-2 text-xs font-bold transition-all ' + (monthlyData[i]?.nsf ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300 text-slate-300 hover:border-red-400')}>
                                {monthlyData[i]?.nsf ? '!' : ''}
                              </button>
                            </div>
                            <div className={'text-sm font-bold text-right ' + (isHigh ? 'text-amber-600' : isLow ? 'text-red-500' : 'text-slate-700')}>
                              {net > 0 ? fmt0(net) : net < 0 ? <span className="text-red-500">{fmt0(net)}</span> : '—'}
                              {isHigh && <span className="text-xs ml-1">↑</span>}
                              {isLow  && <span className="text-xs ml-1">↓</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Totals bar */}
                    <div className="mt-4 grid grid-cols-3 gap-4 bg-slate-900 rounded-2xl p-4">
                      {[
                        ['Total Gross', calc.avgMonthlyDeposits * monthCount, 'text-white'],
                        ['Avg / Month',  calc.avgMonthlyDeposits, 'text-violet-300'],
                        ['NSF Events', null, 'text-red-300'],
                      ].map(([label, val, cls]) => (
                        <div key={label} className="text-center">
                          <div className={'text-lg font-black ' + cls}>{val !== null ? fmt0(val) : monthlyData.slice(0, monthCount).filter(m => m.nsf).length}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Trend visualization */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Income Trend</h2>
                    <p className="text-slate-400 text-sm mt-1">Visual comparison of first half vs second half of the analysis period</p>
                  </div>
                  <div className="p-8">
                    <div className={'rounded-2xl border-2 p-5 mb-6 ' + (calc.trendPct >= 5 ? 'bg-emerald-50 border-emerald-200' : calc.trendPct >= -5 ? 'bg-slate-50 border-slate-200' : calc.trendPct >= -15 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200')}>
                      <div className={'text-2xl font-black ' + trendColor}>
                        {calc.trendPct >= 5 ? '📈' : calc.trendPct >= -5 ? '➡️' : calc.trendPct >= -15 ? '⚠️' : '🚨'} {(calc.trendPct >= 0 ? '+' : '') + fmtPct(calc.trendPct)}
                      </div>
                      <div className={'text-sm font-semibold mt-1 ' + trendColor}>
                        {calc.trendPct >= 5 ? 'Rising income — favorable trend for underwriting' : calc.trendPct >= -5 ? 'Stable income — consistent across the period' : calc.trendPct >= -15 ? 'Slight decline — written explanation recommended' : 'Declining income — compensating factors required'}
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        1st half avg: {fmt0(calc.firstAvg)}/mo → 2nd half avg: {fmt0(calc.secondAvg)}/mo
                      </div>
                    </div>
                    {/* Bar chart */}
                    <div className="space-y-2">
                      {calc.netArr.slice(0, monthCount).map((val, i) => {
                        const max = Math.max(...calc.netArr.slice(0, monthCount), 1);
                        const pct = Math.min(100, (val / max) * 100);
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="text-xs text-slate-400 w-14 text-right shrink-0">{monthLabels[i]?.split(' ')[0]}</div>
                            <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                              <div className={'h-full rounded-full transition-all ' + (monthlyData[i]?.nsf ? 'bg-red-400' : val > calc.avgMonthlyDeposits * 1.4 ? 'bg-amber-400' : 'bg-violet-500')}
                                style={{ width: pct + '%' }} />
                            </div>
                            <div className="text-xs font-semibold text-slate-600 w-20 text-right shrink-0">{val > 0 ? fmt0(val) : '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-4">
                      {[['bg-violet-500','Normal'], ['bg-amber-400','Large (>140% avg)'], ['bg-red-400','NSF month']].map(([c, l]) => (
                        <div key={l} className="flex items-center gap-2"><div className={'w-3 h-3 rounded-full ' + c} /><span className="text-xs text-slate-500">{l}</span></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Flags */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Underwriting Flags</h2>
                    <p className="text-slate-400 text-sm mt-1">Document these items before submitting to the lender</p>
                  </div>
                  <div className="p-8 space-y-5">
                    {/* NSF */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">NSF / Overdraft Events (12-month period)</label>
                      <div className="flex flex-wrap gap-2">
                        {[{v: 0, l: '0 — None', c: 'emerald'}, {v: 1, l: '1–2 — Minor', c: 'amber'}, {v: 2, l: '3–5 — Moderate', c: 'orange'}, {v: 3, l: '6+ — Significant', c: 'red'}].map(opt => (
                          <button key={opt.v} onClick={() => setNsfCount(opt.v)}
                            className={'px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ' + (nsfCount === opt.v ? `border-${opt.c}-400 bg-${opt.c}-50 text-${opt.c}-700` : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Large deposits */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Large / Irregular Deposits Explained</label>
                      <div className="flex gap-2">
                        {[{v: true, l: '✓ Yes — Documented', c: 'emerald'}, {v: false, l: '✗ No — Needs explanation', c: 'red'}, {v: null, l: '— N/A', c: 'slate'}].map(opt => (
                          <button key={String(opt.v)} onClick={() => setLargeDepositsExplained(opt.v)}
                            className={'px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ' + (largeDepositsExplained === opt.v ? `border-${opt.c}-400 bg-${opt.c}-50 text-${opt.c}-700` : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Business account verified */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Business Account Verified (CPA letter or business license)</label>
                      <div className="flex gap-2">
                        {[{v: true, l: '✓ Verified', c: 'emerald'}, {v: false, l: '✗ Not yet', c: 'amber'}, {v: null, l: '— Personal account', c: 'slate'}].map(opt => (
                          <button key={String(opt.v)} onClick={() => setBusinessAccountVerified(opt.v)}
                            className={'px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ' + (businessAccountVerified === opt.v ? `border-${opt.c}-400 bg-${opt.c}-50 text-${opt.c}-700` : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 2: INCOME ENGINE ──────────────────────────────────────── */}
            {activeTab === 2 && (
              <>
                {/* Business type & expense ratio */}
                {accountType === 'business' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                      <h2 className="text-xl font-bold text-white">Business Classification & Expense Ratio</h2>
                      <p className="text-slate-400 text-sm mt-1">IRS industry-standard expense ratios. Select the closest match to the borrower's business.</p>
                    </div>
                    <div className="p-8">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                        {BUSINESS_TYPES.map(bt => (
                          <button key={bt.value} onClick={() => { setBusinessType(bt.value); setUseCustomRatio(false); }}
                            className={'rounded-2xl border-2 p-4 text-left transition-all ' + (businessType === bt.value && !useCustomRatio ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                            <div className="text-xl mb-1">{bt.icon}</div>
                            <div className={'text-xs font-bold ' + (businessType === bt.value && !useCustomRatio ? 'text-violet-700' : 'text-slate-700')}>{bt.label}</div>
                            <div className={'text-xs mt-1 font-black ' + (businessType === bt.value && !useCustomRatio ? 'text-violet-500' : 'text-slate-400')}>{bt.pct} expense ratio</div>
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-slate-200 pt-5">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input type="checkbox" checked={useCustomRatio} onChange={e => setUseCustomRatio(e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm font-semibold text-slate-700">Use custom expense ratio (lender-specified)</span>
                        </label>
                        {useCustomRatio && (
                          <div className="flex items-center gap-3">
                            <input type="number" value={customExpenseRatio} placeholder="35"
                              onChange={e => setCustomExpenseRatio(e.target.value)} min="0" max="100"
                              className="w-32 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-400" />
                            <span className="text-slate-500 text-sm">%</span>
                            <span className="text-xs text-slate-400">Applied as: {customExpenseRatio ? Math.round(parseFloat(customExpenseRatio)) : 0}% expense deduction on gross deposits</span>
                          </div>
                        )}
                      </div>
                      {/* Ownership */}
                      <div className="mt-5 pt-5 border-t border-slate-200">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Business Ownership Percentage</label>
                        <div className="flex items-center gap-3">
                          <input type="number" value={ownershipPct} onChange={e => setOwnershipPct(e.target.value)} min="0" max="100"
                            className="w-28 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-400" />
                          <span className="text-slate-500 text-sm">%</span>
                          {parseFloat(ownershipPct) < 100 && (
                            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">Income pro-rated to {ownershipPct}% of net deposits</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Add-backs */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Add-Backs (from Tax Returns)</h2>
                    <p className="text-slate-400 text-sm mt-1">Non-cash expenses documented on Schedule C or partnership returns. Enter annual amounts.</p>
                  </div>
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {[
                      { label: 'Depreciation', val: depreciation, set: setDepreciation, note: 'Line 13 Schedule C or Form 4562. Most common add-back.' },
                      { label: 'Depletion', val: depletion, set: setDepletion, note: 'Natural resources businesses. Schedule C Line 12.' },
                      { label: 'Business Mileage (miles/yr)', val: mileage, set: setMileage, note: '2024 IRS rate: $0.67/mile. Enter total miles, not dollar amount.', isMileage: true },
                      { label: 'Amortization', val: amortization, set: setAmortization, note: 'Loan costs, organizational costs. Schedule C Line 27a.' },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{f.label} (annual $)</label>
                        <input type="number" value={f.val} placeholder="0" onChange={e => f.set(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-400" />
                        <div className="text-xs text-slate-400 mt-1.5">{f.note}</div>
                        {f.val && !f.isMileage && (
                          <div className="text-xs text-violet-600 font-bold mt-1">Monthly add-back: {fmt0(parseFloat(f.val) / 12)}</div>
                        )}
                        {f.isMileage && f.val && (
                          <div className="text-xs text-violet-600 font-bold mt-1">Annual: {fmt0(parseFloat(f.val) * MILEAGE_RATE)} → Monthly: {fmt0((parseFloat(f.val) * MILEAGE_RATE) / 12)}</div>
                        )}
                      </div>
                    ))}
                    <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Other Add-Back Label</label>
                        <input type="text" value={otherAddbackLabel} placeholder="e.g. Home Office" onChange={e => setOtherAddbackLabel(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-violet-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Other Add-Back (annual $)</label>
                        <input type="number" value={otherAddback} placeholder="0" onChange={e => setOtherAddback(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Income waterfall */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-800 to-violet-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Qualifying Income Waterfall</h2>
                    <p className="text-violet-200 text-sm mt-1">Step-by-step calculation — exactly what the underwriter will review</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      { label: `Avg Monthly Gross Deposits (${analysisPeriod} mo)`, value: calc.avgMonthlyDeposits, color: 'text-slate-800', sign: '' },
                      ...(accountType === 'business' ? [{ label: `Less: Expense Ratio (${Math.round(calc.expenseRatio * 100)}% — ${useCustomRatio ? 'Custom' : BUSINESS_TYPES.find(b => b.value === businessType)?.label || ''})`, value: calc.avgMonthlyDeposits * calc.expenseRatio, color: 'text-red-600', sign: '−' }] : []),
                      ...(parseFloat(ownershipPct) < 100 ? [{ label: `Ownership Adjustment (${ownershipPct}%)`, value: calc.incomeAfterExpenses - calc.incomeAfterOwnership, color: 'text-red-600', sign: '−' }] : []),
                      ...(calc.deprMonthly > 0 ? [{ label: 'Add-back: Depreciation', value: calc.deprMonthly, color: 'text-emerald-700', sign: '+' }] : []),
                      ...(calc.deplMonthly > 0 ? [{ label: 'Add-back: Depletion', value: calc.deplMonthly, color: 'text-emerald-700', sign: '+' }] : []),
                      ...(calc.mileageAmt > 0 ? [{ label: `Add-back: Mileage (${mileage} mi × $${MILEAGE_RATE})`, value: calc.mileageAmt, color: 'text-emerald-700', sign: '+' }] : []),
                      ...(calc.amorMonthly > 0 ? [{ label: 'Add-back: Amortization', value: calc.amorMonthly, color: 'text-emerald-700', sign: '+' }] : []),
                      ...(calc.otherMonthly > 0 ? [{ label: `Add-back: ${otherAddbackLabel || 'Other'}`, value: calc.otherMonthly, color: 'text-emerald-700', sign: '+' }] : []),
                    ].map((row, i) => (
                      <div key={i} className="flex justify-between items-center px-8 py-4">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className={'text-sm font-bold ' + row.color}>{row.sign} {fmt0(row.value)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-8 py-5 bg-violet-50">
                      <span className="text-base font-black text-violet-800">= Monthly Qualifying Income</span>
                      <span className="text-2xl font-black text-violet-700">{fmt0(calc.qualifyingMonthly)}</span>
                    </div>
                    <div className="flex justify-between items-center px-8 py-4 bg-violet-100">
                      <span className="text-sm font-bold text-violet-700">Annual Qualifying Income</span>
                      <span className="text-lg font-black text-violet-700">{fmt0(calc.qualifyingAnnual)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 3: SUMMARY & LETTERS ──────────────────────────────────── */}
            {activeTab === 3 && (
              <>
                {/* AI Analysis */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Underwriting Assessment</h2>
                    <p className="text-slate-400 text-sm mt-1">Sonnet evaluates the full income picture and flags issues for underwriter review</p>
                  </div>
                  <div className="p-8">
                    {!aiAnalysis ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-slate-500 text-sm mb-4">Run AI analysis to get an underwriting assessment, identify concerns, and generate compensating factors.</p>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing || calc.qualifyingMonthly === 0}
                          className="px-8 py-3 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors">
                          {aiAnalyzing ? 'Analyzing...' : calc.qualifyingMonthly === 0 ? 'Enter deposit data first' : '🤖 Run AI Analysis'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className={'inline-block px-4 py-2 rounded-xl border-2 font-black text-sm ' + (verdictColor[aiAnalysis.verdict] || verdictColor.ACCEPTABLE)}>
                          {aiAnalysis.verdict}
                        </div>
                        <p className="text-slate-700 leading-relaxed">{aiAnalysis.summary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            { label: '✅ Strengths', items: aiAnalysis.strengths, color: 'emerald' },
                            { label: '⚠️ Concerns', items: aiAnalysis.concerns, color: 'red' },
                            { label: '💡 Compensating Factors', items: aiAnalysis.compensatingFactors, color: 'blue' },
                          ].map(sec => (
                            <div key={sec.label} className={`rounded-2xl border p-4 bg-${sec.color}-50 border-${sec.color}-200`}>
                              <div className={`text-xs font-bold text-${sec.color}-700 mb-2`}>{sec.label}</div>
                              <ul className="space-y-1">{(sec.items || []).map((item, i) => (
                                <li key={i} className={`text-xs text-${sec.color}-700 flex gap-2`}><span className="shrink-0">•</span><span>{item}</span></li>
                              ))}</ul>
                            </div>
                          ))}
                        </div>
                        {aiAnalysis.lenderNote && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-1">Lender Note</div>
                            <p className="text-sm text-slate-700">{aiAnalysis.lenderNote}</p>
                          </div>
                        )}
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing}
                          className="text-xs text-violet-600 hover:text-violet-500 font-semibold">
                          {aiAnalyzing ? 'Re-analyzing...' : '↺ Re-run analysis'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* LO Notes */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">LO Notes & Compensating Factors</h2>
                    <p className="text-slate-400 text-sm mt-1">Documented in both letters and Decision Record</p>
                  </div>
                  <div className="p-8">
                    <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={4}
                      placeholder="Document explanations for NSF events, income decline, large deposits, business type, compensating factors, lender-specific notes..."
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-violet-400 resize-none" />
                    <div className="mt-4 flex justify-end">
                      <button onClick={handleSaveToRecord} disabled={recordSaving}
                        className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                        {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Letters */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Letters</h2>
                    <p className="text-slate-400 text-sm mt-1">Professional letters ready to copy and send</p>
                  </div>
                  <div className="p-8">
                    <div className="flex gap-2 mb-6">
                      {[['borrower', '👤 Borrower Letter'], ['underwriter', '📋 Underwriter Summary']].map(([v, l]) => (
                        <button key={v} onClick={() => setActiveLetterTab(v)}
                          className={'px-5 py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ' + (activeLetterTab === v ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {activeLetterTab === 'borrower' && <LetterCard title="Borrower Explanation Letter" icon="👤" body={borrowerLetter} color="violet" />}
                    {activeLetterTab === 'underwriter' && <LetterCard title="Underwriter / Processor Summary" icon="📋" body={underwriterLetter} color="blue" />}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ══ Sidebar ════════════════════════════════════════════════════════ */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Income Summary</div>
              <div className="text-center mb-5">
                <div className="text-4xl font-black text-white">{calc.qualifyingMonthly > 0 ? fmt0(calc.qualifyingMonthly) : '--'}</div>
                <div className="text-slate-400 text-sm mt-1">Monthly Qualifying</div>
                {calc.qualifyingAnnual > 0 && <div className="text-violet-300 text-sm font-bold mt-1">{fmt0(calc.qualifyingAnnual)} / year</div>}
              </div>
              <div className="space-y-3">
                {[
                  ['Analysis Period', analysisPeriod + ' months', 'text-white'],
                  ['Account Type', accountType === 'business' ? 'Business' : 'Personal', 'text-white'],
                  ...(accountType === 'business' ? [['Expense Ratio', Math.round(calc.expenseRatio * 100) + '%', 'text-amber-400']] : []),
                  ['Avg Gross/Month', calc.avgMonthlyDeposits > 0 ? fmt0(calc.avgMonthlyDeposits) : '--', 'text-slate-300'],
                  ['Add-backs/Month', calc.totalAddbacks > 0 ? fmt0(calc.totalAddbacks) : 'None', calc.totalAddbacks > 0 ? 'text-emerald-400' : 'text-slate-500'],
                  ['Income Trend', (calc.trendPct >= 0 ? '+' : '') + fmtPct(calc.trendPct), trendColor.replace('text-', 'text-')],
                  ['Income Score', calc.qualifyingMonthly > 0 ? calc.score + '/100' : '--', scoreColor],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800">
                    <span className="text-slate-400 text-sm">{l}</span>
                    <span className={'font-bold text-sm ' + c}>{v}</span>
                  </div>
                ))}
              </div>
              {calc.qualifyingMonthly > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2">Income Score</div>
                  <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div className={'h-full rounded-full transition-all ' + (calc.score >= 75 ? 'bg-emerald-400' : calc.score >= 55 ? 'bg-amber-400' : 'bg-red-400')}
                      style={{ width: calc.score + '%' }} />
                  </div>
                  <div className={'text-xs font-bold mt-1 ' + scoreColor}>
                    {calc.score >= 75 ? 'Strong file' : calc.score >= 55 ? 'Acceptable — document flags' : 'Marginal — compensating factors needed'}
                  </div>
                </div>
              )}
              {aiAnalysis?.verdict && (
                <div className={'mt-4 rounded-2xl p-3 border text-center ' + (verdictColor[aiAnalysis.verdict] || 'bg-slate-700 border-slate-600 text-white')}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-0.5">AI Assessment</div>
                  <div className="font-black">{aiAnalysis.verdict}</div>
                </div>
              )}
            </div>

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {[
                  '12-month: simple avg. 24-month: avg of both years (or lower year if declining)',
                  'Business account requires CPA letter or 2 months business statements + license',
                  'Personal account: must document % of deposits used for personal vs business',
                  'NSF 3+: written LOE required; 6+: many lenders auto-decline',
                  'Large deposits (>50% of avg): must be sourced and documented',
                  'Declining income: 2nd year avg used if >25% lower than 1st year',
                  'Add-backs must be documented on tax returns — not just claimed',
                ].map(rule => (
                  <li key={rule} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0">•</span><span>{rule}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

</div>
  );
}
