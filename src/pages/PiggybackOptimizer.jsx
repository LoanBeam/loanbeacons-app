// src/pages/PiggybackOptimizer.jsx
// LoanBeacons™ — Module 19 | Stage 1: Pre-Structure
// Piggyback 2nd Optimizer™ — 80/10/10 · 80/15/5 · Single Loan + PMI comparison

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';
// ─── Math Engine ──────────────────────────────────────────────────────────────
function monthlyPayment(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function estimatePMI(loanAmount, ltv) {
  if (ltv <= 80) return 0;
  let annualRate = 0.0085;
  if (ltv > 95)      annualRate = 0.012;
  else if (ltv > 90) annualRate = 0.010;
  else if (ltv > 85) annualRate = 0.0085;
  else               annualRate = 0.006;
  return (loanAmount * annualRate) / 12;
}

function pmiDropOffMonth(principal, annualRate, termMonths, homeValue) {
  const target = homeValue * 0.80;
  const r = annualRate / 100 / 12;
  let balance = principal;
  const pmt = monthlyPayment(principal, annualRate, termMonths);
  for (let m = 1; m <= termMonths; m++) {
    balance = balance - (pmt - balance * r);
    if (balance <= target) return m;
  }
  return termMonths;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt0  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtD  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtPct = (n) => isNaN(n) ? '--' : Number(n).toFixed(3) + '%';

// ─── Glossary ─────────────────────────────────────────────────────────────────
const GLOSSARY = [
  { term: 'Piggyback Loan',  icon: '🏗️', definition: 'A second mortgage taken simultaneously with the first — "piggybacks" on top. Used to avoid PMI by keeping the first lien at 80% LTV.', highlight: true },
  { term: '80/10/10',        icon: '📊', definition: '80% first lien · 10% second lien · 10% down payment. The classic piggyback. First lien is 30yr fixed; second is typically a 10–15yr fixed or HELOC.', highlight: false },
  { term: '80/15/5',         icon: '📈', definition: '80% first lien · 15% second lien · 5% down. Reduces the cash to close vs 80/10/10 but increases the 2nd lien balance and payment.', highlight: true },
  { term: 'PMI',             icon: '⚠️', definition: 'Private Mortgage Insurance. Required when LTV exceeds 80% on conventional loans. Typically 0.5–1.2% of the loan annually. Cancels when balance reaches 80% of original value.', highlight: false },
  { term: 'CLTV',            icon: '📐', definition: 'Combined Loan-to-Value. Sum of first and second lien balances ÷ property value. Most lenders cap CLTV at 89.99% for piggyback structures.', highlight: false },
  { term: 'Break-Even',      icon: '⚖️', definition: 'The point in time when cumulative PMI savings from a piggyback exceed the extra interest paid on the second lien. If moving within this window, single + PMI may be smarter.', highlight: true },
];

const WHEN_TO_USE = [
  { scenario: 'Avoid PMI — 10–15% Down',  icon: '🚫', color: 'blue',   tip: 'Classic use case. Borrower has 10–15% down but wants to avoid PMI. Piggyback keeps 1st lien at 80% and eliminates the insurance cost entirely.' },
  { scenario: 'Maximize Purchasing Power', icon: '💪', color: 'violet', tip: '80/15/5 drops required cash to close to just 5% while still avoiding PMI — gives the borrower more flexibility on a tighter down payment.' },
  { scenario: 'Jumbo Avoidance',           icon: '📉', color: 'emerald', tip: 'Purchase price just above conforming limit? A piggyback can keep the first lien at the conforming limit, avoiding jumbo pricing on the full balance.' },
  { scenario: 'Short Hold Period',         icon: '⏱️', color: 'amber',  tip: 'Planning to sell or refi within 2–3 years? Single + PMI may beat the piggyback — less setup complexity and the PMI cost may not accumulate long enough to matter.' },
];

// ─── Letter Builders ──────────────────────────────────────────────────────────
function buildBorrowerLetter({ borrowerName, purchasePrice, bestScenario, calc, firstRate, secondRate8010, secondRate8015, singleRate, termYears, downPct, loNotes, aiSummary }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bestLabel = bestScenario === 'piggyback_8010' ? '80/10/10 Piggyback' : bestScenario === 'piggyback_8015' ? '80/15/5 Piggyback' : 'Single Loan + PMI';
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('Dear ' + (borrowerName || 'Valued Client') + ',');
  lines.push(''); lines.push('RE: Piggyback Loan Structure Analysis — Financing Options Comparison'); lines.push('');
  lines.push('I have completed a side-by-side analysis of your financing options for a home purchase of ' + fmt0(purchasePrice) + '. Below is a summary of each structure and my recommendation.');
  lines.push(''); lines.push('THE THREE OPTIONS ANALYZED'); lines.push('');
  lines.push('1. 80/10/10 PIGGYBACK');
  lines.push('   Down Payment: ' + fmt0(calc.down_8010) + ' (10%)');
  lines.push('   1st Lien: ' + fmt0(calc.loan1_8010) + ' at ' + firstRate + '% — ' + fmtD(calc.pmt1_8010) + '/mo');
  lines.push('   2nd Lien: ' + fmt0(calc.loan2_8010) + ' at ' + (secondRate8010 || '?') + '% — ' + fmtD(calc.pmt2_8010) + '/mo');
  lines.push('   PMI: None · Total P&I: ' + fmtD(calc.totalPI_8010) + '/mo');
  lines.push('   5-Year Total Cost: ' + fmt0(calc.cost5yr_8010)); lines.push('');
  lines.push('2. 80/15/5 PIGGYBACK');
  lines.push('   Down Payment: ' + fmt0(calc.down_8015) + ' (5%)');
  lines.push('   1st Lien: ' + fmt0(calc.loan1_8015) + ' at ' + firstRate + '% — ' + fmtD(calc.pmt1_8015) + '/mo');
  lines.push('   2nd Lien: ' + fmt0(calc.loan2_8015) + ' at ' + (secondRate8015 || '?') + '% — ' + fmtD(calc.pmt2_8015) + '/mo');
  lines.push('   PMI: None · Total P&I: ' + fmtD(calc.totalPI_8015) + '/mo');
  lines.push('   5-Year Total Cost: ' + fmt0(calc.cost5yr_8015)); lines.push('');
  lines.push('3. SINGLE LOAN + PMI');
  lines.push('   Down Payment: ' + fmt0(calc.downAmount) + ' (' + downPct + '%)');
  lines.push('   Loan: ' + fmt0(calc.loanSingle) + ' at ' + (singleRate || firstRate) + '%');
  lines.push('   PMI: ' + fmtD(calc.pmiMonthly) + '/mo (drops ~month ' + calc.pmiDropMonth + ')');
  lines.push('   Total P&I+PMI: ' + fmtD(calc.totalPI_single) + '/mo');
  lines.push('   Total PMI Cost (est.): ' + fmt0(calc.pmiTotalCost));
  lines.push('   5-Year Total Cost: ' + fmt0(calc.cost5yr_single)); lines.push('');
  lines.push('RECOMMENDATION: ' + bestLabel.toUpperCase());
  lines.push('Based on your scenario, the ' + bestLabel + ' has the lowest 5-year total cost.');
  if (aiSummary) { lines.push(''); lines.push('AI ANALYSIS SUMMARY'); lines.push(aiSummary); }
  lines.push(''); lines.push('IMPORTANT NOTES');
  lines.push('• 2nd lien rates vary by lender and product type. Rates quoted here are estimates.');
  lines.push('• PMI can be tax-deductible for some borrowers — consult your tax advisor.');
  lines.push('• This analysis is based on current rates and your stated down payment. Final numbers will be confirmed at loan application.');
  if (loNotes) { lines.push(''); lines.push('ADDITIONAL NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('Please reach out with any questions. I am happy to walk through each option in detail.');
  lines.push(''); lines.push('Respectfully,');
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions'); lines.push('george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function buildLOLetter({ borrowerName, purchasePrice, bestScenario, calc, firstRate, secondRate8010, secondRate8015, singleRate, termYears, secondTerm, downPct, loNotes }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bestLabel = bestScenario === 'piggyback_8010' ? '80/10/10' : bestScenario === 'piggyback_8015' ? '80/15/5' : 'Single + PMI';
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('To: Mortgage Underwriter / Processor');
  lines.push('From: George Jules Chevalier IV, NMLS #1175947 — Clearview Lending Solutions');
  lines.push('Re: Piggyback Structure Analysis — ' + (borrowerName || 'Borrower'));
  lines.push(''); lines.push('RECOMMENDED STRUCTURE: ' + bestLabel);
  lines.push('Purchase Price: ' + fmt0(purchasePrice));
  lines.push('Down Payment: ' + downPct + '% (' + fmt0(calc.downAmount) + ')');
  lines.push('1st Lien Rate: ' + firstRate + '% · Term: ' + termYears + ' years');
  if (bestScenario !== 'single_pmi') {
    lines.push('2nd Lien Rate (80/10/10): ' + (secondRate8010 || 'TBD') + '% · 2nd Lien Rate (80/15/5): ' + (secondRate8015 || 'TBD') + '%');
    lines.push('2nd Lien Term: ' + secondTerm + ' years');
  }
  lines.push(''); lines.push('COMPARISON SUMMARY');
  lines.push('Structure         | Monthly P&I     | 5-Yr Cost       | PMI');
  lines.push('80/10/10          | ' + fmtD(calc.totalPI_8010) + '     | ' + fmt0(calc.cost5yr_8010) + '    | None');
  lines.push('80/15/5           | ' + fmtD(calc.totalPI_8015) + '     | ' + fmt0(calc.cost5yr_8015) + '    | None');
  lines.push('Single + PMI      | ' + fmtD(calc.totalPI_single) + '     | ' + fmt0(calc.cost5yr_single) + '    | ' + fmtD(calc.pmiMonthly) + '/mo (drops mo.' + calc.pmiDropMonth + ')');
  lines.push(''); lines.push('UNDERWRITING NOTES');
  lines.push('• CLTV for piggyback structures: 90% (1st + 2nd combined)');
  lines.push('• Second lien must be simultaneous close — verify lender allows piggyback');
  lines.push('• Verify 2nd lien product availability with lender (HELOC vs fixed 2nd)');
  lines.push('• CLTV limit for conventional: typically 89.99% — confirm with investor');
  if (loNotes) { lines.push(''); lines.push('LO NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions | george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function LetterCard({ title, icon, body, color = 'violet' }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={'rounded-3xl border-2 overflow-hidden ' + (color === 'violet' ? 'border-violet-200 bg-violet-50' : 'border-blue-200 bg-blue-50')}>
      <ModuleNav moduleNumber={22} />
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="font-bold text-slate-700 flex items-center gap-2">{icon} {title}</div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={'text-xs px-4 py-2 rounded-xl text-white transition-colors ' + (color === 'violet' ? 'bg-violet-700 hover:bg-violet-600' : 'bg-blue-700 hover:bg-blue-600')}>
            {copied ? '✓ Copied' : 'Copy Letter'}
          </button>
          <button onClick={() => window.print()} className="text-xs px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white">Print</button>
        </div>
      </div>
      <pre className="p-6 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">{body}</pre>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PiggybackOptimizer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const [scenario, setScenario]   = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [search,   setSearch]   = useState('');
  const [showAll,  setShowAll]  = useState(false);
  const [loading, setLoading]     = useState(true);
  const [borrowerName, setBorrowerName] = useState('');

  const [activeTab, setActiveTab] = useState(0);

  // Inputs
  const [purchasePrice, setPurchasePrice]     = useState('');
  const [downPct, setDownPct]                 = useState('10');
  const [firstRate, setFirstRate]             = useState('');
  const [secondRate8010, setSecondRate8010]   = useState('');
  const [secondRate8015, setSecondRate8015]   = useState('');
  const [singleRate, setSingleRate]           = useState('');
  const [termYears, setTermYears]             = useState('30');
  const [secondTerm, setSecondTerm]           = useState('15');
  const [taxesMonthly, setTaxesMonthly]       = useState('');
  const [insuranceMonthly, setInsuranceMonthly] = useState('');
  const [bestScenario, setBestScenario]       = useState(null);

  // AI
  const [aiAnalysis, setAiAnalysis]   = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // Notes & letters
  const [loNotes, setLoNotes]               = useState('');
  const [activeLetterTab, setActiveLetterTab] = useState('borrower');

  // Decision Record
  const [recordSaving, setRecordSaving]   = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(scenarioId);

  // ─── localStorage ────────────────────────────────────────────────────────────
  const lsKey = scenarioId ? `lb_piggyback_${scenarioId}` : null;

  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({
      purchasePrice, downPct, firstRate, secondRate8010, secondRate8015, singleRate,
      termYears, secondTerm, taxesMonthly, insuranceMonthly, loNotes, aiAnalysis, savedRecordId,
    }));
  }, [lsKey, purchasePrice, downPct, firstRate, secondRate8010, secondRate8015, singleRate,
      termYears, secondTerm, taxesMonthly, insuranceMonthly, loNotes, aiAnalysis, savedRecordId]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // ─── Load scenario ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error).finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.purchasePrice)   setPurchasePrice(saved.purchasePrice);
          if (saved.downPct)         setDownPct(saved.downPct);
          if (saved.firstRate)       setFirstRate(saved.firstRate);
          if (saved.secondRate8010)  setSecondRate8010(saved.secondRate8010);
          if (saved.secondRate8015)  setSecondRate8015(saved.secondRate8015);
          if (saved.singleRate)      setSingleRate(saved.singleRate);
          if (saved.termYears)       setTermYears(saved.termYears);
          if (saved.secondTerm)      setSecondTerm(saved.secondTerm);
          if (saved.taxesMonthly)    setTaxesMonthly(saved.taxesMonthly);
          if (saved.insuranceMonthly) setInsuranceMonthly(saved.insuranceMonthly);
          if (saved.loNotes)         setLoNotes(saved.loNotes);
          if (saved.aiAnalysis)      setAiAnalysis(saved.aiAnalysis);
          if (saved.savedRecordId)   setSavedRecordId(saved.savedRecordId);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        if (d.propertyValue) setPurchasePrice(prev => prev || String(d.propertyValue));
        if (d.interestRate) {
          const r = parseFloat(d.interestRate).toFixed(3);
          setFirstRate(prev => prev || r);
          setSingleRate(prev => prev || r);
        }
        if (d.monthlyTaxes)     setTaxesMonthly(prev => prev || String(d.monthlyTaxes));
        if (d.monthlyInsurance) setInsuranceMonthly(prev => prev || String(d.monthlyInsurance));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // ─── Core Calculations ────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const pp  = parseFloat(purchasePrice) || 0;
    const dp  = parseFloat(downPct) / 100;
    const taxes = parseFloat(taxesMonthly) || 0;
    const ins   = parseFloat(insuranceMonthly) || 0;
    const term  = parseInt(termYears) * 12;
    const term2 = parseInt(secondTerm) * 12;
    const r1    = parseFloat(firstRate) || 0;
    const r2_8010 = parseFloat(secondRate8010) || 0;
    const r2_8015 = parseFloat(secondRate8015) || 0;
    const rSingle = parseFloat(singleRate) || 0;

    if (!pp || !r1) return null;

    const downAmount = pp * dp;

    // 80/10/10
    const loan1_8010 = pp * 0.80;
    const loan2_8010 = pp * 0.10;
    const down_8010  = pp * 0.10;
    const pmt1_8010  = monthlyPayment(loan1_8010, r1, term);
    const pmt2_8010  = r2_8010 ? monthlyPayment(loan2_8010, r2_8010, term2) : 0;
    const totalPI_8010   = pmt1_8010 + pmt2_8010;
    const totalPITI_8010 = totalPI_8010 + taxes + ins;

    // 80/15/5
    const loan1_8015 = pp * 0.80;
    const loan2_8015 = pp * 0.15;
    const down_8015  = pp * 0.05;
    const pmt1_8015  = monthlyPayment(loan1_8015, r1, term);
    const pmt2_8015  = r2_8015 ? monthlyPayment(loan2_8015, r2_8015, term2) : 0;
    const totalPI_8015   = pmt1_8015 + pmt2_8015;
    const totalPITI_8015 = totalPI_8015 + taxes + ins;

    // Single + PMI
    const ltvSingle   = (1 - dp) * 100;
    const loanSingle  = pp * (1 - dp);
    const pmtSingle   = monthlyPayment(loanSingle, rSingle || r1, term);
    const pmiMonthly  = estimatePMI(loanSingle, ltvSingle);
    const totalPI_single   = pmtSingle + pmiMonthly;
    const totalPITI_single = totalPI_single + taxes + ins;
    const pmiDropMonth = ltvSingle > 80 ? pmiDropOffMonth(loanSingle, rSingle || r1, term, pp) : 0;
    const pmiTotalCost = pmiMonthly * pmiDropMonth;

    // 5-year costs
    const cost5yr_8010   = totalPITI_8010 * 60;
    const cost5yr_8015   = totalPITI_8015 * 60;
    const cost5yr_single = totalPITI_single * 60;

    // Monthly deltas
    const diff_8010_vs_single = totalPITI_8010 - totalPITI_single;
    const diff_8015_vs_single = totalPITI_8015 - totalPITI_single;

    return {
      pp, downAmount,
      loan1_8010, loan2_8010, down_8010, pmt1_8010, pmt2_8010, totalPI_8010, totalPITI_8010, cost5yr_8010,
      loan1_8015, loan2_8015, down_8015, pmt1_8015, pmt2_8015, totalPI_8015, totalPITI_8015, cost5yr_8015,
      ltvSingle, loanSingle, pmtSingle, pmiMonthly, pmiTotalCost, pmiDropMonth,
      totalPI_single, totalPITI_single, cost5yr_single,
      diff_8010_vs_single, diff_8015_vs_single,
    };
  }, [purchasePrice, downPct, firstRate, secondRate8010, secondRate8015, singleRate, termYears, secondTerm, taxesMonthly, insuranceMonthly]);

  // Auto-pick best
  useEffect(() => {
    if (!calc) return;
    const costs = [
      { id: 'piggyback_8010', cost: calc.cost5yr_8010 },
      { id: 'piggyback_8015', cost: calc.cost5yr_8015 },
      { id: 'single_pmi',     cost: calc.cost5yr_single },
    ];
    setBestScenario(costs.sort((a, b) => a.cost - b.cost)[0].id);
  }, [calc]);

  // ─── AI Analysis ─────────────────────────────────────────────────────────────
  const handleAIAnalysis = async () => {
    if (!calc) return;
    setAiAnalyzing(true);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1200,
          messages: [{ role: 'user', content: `You are a senior mortgage loan officer analyzing piggyback loan structures. Provide a recommendation for this borrower.

SCENARIO:
Purchase Price: ${fmt0(calc.pp)}
Down Payment: ${downPct}% (${fmt0(calc.downAmount)})
1st Lien Rate: ${firstRate}% · Term: ${termYears} years
2nd Lien Rate (80/10/10): ${secondRate8010 || 'not provided'}%
2nd Lien Rate (80/15/5): ${secondRate8015 || 'not provided'}%
Single Loan Rate: ${singleRate || firstRate}%
2nd Lien Term: ${secondTerm} years

CALCULATED RESULTS:
80/10/10 → Monthly P&I: ${fmtD(calc.totalPI_8010)} · Down: ${fmt0(calc.down_8010)} · 5yr cost: ${fmt0(calc.cost5yr_8010)}
80/15/5 → Monthly P&I: ${fmtD(calc.totalPI_8015)} · Down: ${fmt0(calc.down_8015)} · 5yr cost: ${fmt0(calc.cost5yr_8015)}
Single+PMI → Monthly P&I+PMI: ${fmtD(calc.totalPI_single)} · PMI: ${fmtD(calc.pmiMonthly)}/mo · PMI drops month ${calc.pmiDropMonth} · 5yr cost: ${fmt0(calc.cost5yr_single)}
Best by 5yr cost: ${bestScenario?.replace('_', ' ')}

Return ONLY valid JSON: {"recommendation":"piggyback_8010|piggyback_8015|single_pmi","summary":"2-3 sentence recommendation explanation","reasonsForPiggyback":["up to 3 reasons piggyback wins in this scenario"],"reasonsAgainst":["up to 2 reasons single+PMI might be better"],"talkingPoints":["2-3 borrower-friendly talking points"],"watchOuts":["1-2 things LO must verify with lender"]}` }],
        }),
      });
      if (!resp.ok) throw new Error('Status ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) setAiAnalysis(JSON.parse(match[0]));
    } catch (err) { console.error('AI analysis failed:', err); }
    setAiAnalyzing(false);
  };

  // ─── Decision Record ──────────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    if (!calc) return;
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings({
        verdict: bestScenario === 'single_pmi' ? 'Single + PMI recommended' : bestScenario === 'piggyback_8010' ? '80/10/10 recommended' : '80/15/5 recommended',
        summary: `Piggyback Optimizer — Purchase ${fmt0(calc.pp)} · ${downPct}% down · Best structure: ${bestScenario?.replace('_', ' ')} · 5yr cost: ${fmt0(bestScenario === 'piggyback_8010' ? calc.cost5yr_8010 : bestScenario === 'piggyback_8015' ? calc.cost5yr_8015 : calc.cost5yr_single)}`,
        riskFlags: [],
        findings: {
          purchasePrice: calc.pp, downPct: parseFloat(downPct), firstRate: parseFloat(firstRate),
          secondRate8010: parseFloat(secondRate8010) || null, secondRate8015: parseFloat(secondRate8015) || null,
          singleRate: parseFloat(singleRate) || null, termYears: parseInt(termYears), secondTerm: parseInt(secondTerm),
          bestScenario, cost5yr_8010: calc.cost5yr_8010, cost5yr_8015: calc.cost5yr_8015, cost5yr_single: calc.cost5yr_single,
          pmiMonthly: calc.pmiMonthly, pmiDropMonth: calc.pmiDropMonth, pmiTotalCost: calc.pmiTotalCost, loNotes,
        },
        completeness: { ratesEntered: !!(firstRate), purchasePriceEntered: !!(purchasePrice), aiRun: !!(aiAnalysis) },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const TABS = [
    { id: 0, label: 'Loan Inputs',      icon: '⚙️' },
    { id: 1, label: 'Comparison',        icon: '📊' },
    { id: 2, label: 'Analysis & Letters', icon: '📝' },
    { id: 3, label: 'Education',         icon: '📚' },
  ];

  const bestLabel   = bestScenario === 'piggyback_8010' ? '80/10/10' : bestScenario === 'piggyback_8015' ? '80/15/5' : 'Single + PMI';
  const bestCost    = bestScenario === 'piggyback_8010' ? calc?.cost5yr_8010 : bestScenario === 'piggyback_8015' ? calc?.cost5yr_8015 : calc?.cost5yr_single;
  const bestMonthly = bestScenario === 'piggyback_8010' ? calc?.totalPI_8010 : bestScenario === 'piggyback_8015' ? calc?.totalPI_8015 : calc?.totalPI_single;

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">🏗️</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">19</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 1 — Pre-Structure</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">Piggyback 2nd Optimizer™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Structure piggyback second mortgages to eliminate MI, reduce LTV, and optimize blended payment. Compares single-loan vs. combined structures side by side.</p>
            <div className="flex flex-wrap gap-2">
              {['80/10/10 Structure', 'MI Elimination', 'Rate Blending', 'Payment Comparison', 'LTV Optimization', 'Second Lien Analysis'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2>
            <p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate('/piggyback-optimizer?scenarioId=' + s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border-indigo-100 border px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 border-indigo-200 hover:bg-indigo-50 py-3 border border-dashed rounded-2xl transition-all">
                  View all {filtered.length} scenarios
                </button>
              )}
              {showAll && filtered.length > 5 && (
                <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 19</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Piggyback 2nd Optimizer™</h1>
              <p className="text-slate-400 text-base max-w-xl">80/10/10 · 80/15/5 · Single Loan + PMI · Side-by-side payment & 5-year cost comparison</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px' }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{purchasePrice ? fmt0(parseFloat(purchasePrice)) : '--'} · {downPct}% down</div>
                  {bestScenario && calc && (
                    <div className={'text-sm font-bold mt-1 ' + (bestScenario === 'single_pmi' ? 'text-orange-300' : 'text-blue-300')}>
                      Best: {bestLabel} · {fmt0(bestMonthly)}/mo
                    </div>
                  )}
                </>
              ) : <div className="text-slate-400 text-sm">No scenario loaded</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Borrower Bar */}
      {scenarioId && borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {scenario?.streetAddress && <span className="text-blue-200 text-xs">{[scenario.streetAddress, scenario.city, scenario.state].filter(Boolean).join(', ')}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {purchasePrice && <span>Price <strong className="text-white">{fmt0(parseFloat(purchasePrice))}</strong></span>}
              {firstRate && <span>1st Rate <strong className="text-white">{firstRate}%</strong></span>}
              {bestScenario && <span>Best <strong className="text-white">{bestLabel}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Piggyback 2nd Optimizer™" moduleNumber="19" scenarioId={scenarioId} />
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2"><DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="PIGGYBACK_OPTIMIZER" /></div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all ' + (activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 1 && calc && bestScenario && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-black">{bestLabel}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* ─── TAB 0: INPUTS ─────────────────────────────────────────────── */}
            {activeTab === 0 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Loan Parameters</h2>
                    <p className="text-slate-400 text-sm mt-1">Enter the purchase price, down payment, and rates for each structure. Results calculate instantly.</p>
                  </div>
                  <div className="p-8 space-y-6">
                    {/* Purchase & Down */}
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Purchase Price ($)</label>
                        <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="450000"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Actual Down Payment</label>
                        <div className="flex gap-2">
                          {['5', '10', '15'].map(p => (
                            <button key={p} onClick={() => setDownPct(p)}
                              className={'flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all ' + (downPct === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                              {p}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 1st Lien */}
                    <div className="border-2 border-blue-100 rounded-2xl p-5 bg-blue-50">
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-4">1st Lien (applies to all three structures)</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Rate (%)</label>
                          <input type="number" step="0.125" value={firstRate} onChange={e => setFirstRate(e.target.value)} placeholder="7.125"
                            className="w-full border-2 border-blue-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-blue-500 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Term</label>
                          <select value={termYears} onChange={e => setTermYears(e.target.value)}
                            className="w-full border-2 border-blue-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-white">
                            {[['30','30 Years'],['20','20 Years'],['15','15 Years']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* 2nd Lien rates */}
                    <div className="grid grid-cols-2 gap-5">
                      <div className="border-2 border-slate-200 rounded-2xl p-5">
                        <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-3">80/10/10 — 2nd Lien Rate</div>
                        <input type="number" step="0.125" value={secondRate8010} onChange={e => setSecondRate8010(e.target.value)} placeholder="8.500"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-blue-400" />
                        {calc && secondRate8010 && <div className="text-xs text-blue-600 mt-2 font-semibold">2nd payment: {fmtD(calc.pmt2_8010)}/mo</div>}
                      </div>
                      <div className="border-2 border-slate-200 rounded-2xl p-5">
                        <div className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-3">80/15/5 — 2nd Lien Rate</div>
                        <input type="number" step="0.125" value={secondRate8015} onChange={e => setSecondRate8015(e.target.value)} placeholder="8.750"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-400" />
                        {calc && secondRate8015 && <div className="text-xs text-violet-600 mt-2 font-semibold">2nd payment: {fmtD(calc.pmt2_8015)}/mo</div>}
                      </div>
                    </div>

                    {/* Single + 2nd term */}
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Single Loan Rate (%) <span className="text-slate-400 normal-case font-normal">optional — defaults to 1st rate</span></label>
                        <input type="number" step="0.125" value={singleRate} onChange={e => setSingleRate(e.target.value)} placeholder={firstRate || '7.125'}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-orange-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">2nd Lien Term</label>
                        <select value={secondTerm} onChange={e => setSecondTerm(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white">
                          {[['10','10 Years'],['15','15 Years'],['20','20 Years'],['30','30 Years']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Taxes & Insurance */}
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Monthly Property Taxes ($) <span className="text-slate-400 normal-case font-normal">optional</span></label>
                        <input type="number" value={taxesMonthly} onChange={e => setTaxesMonthly(e.target.value)} placeholder="500"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Monthly Insurance ($) <span className="text-slate-400 normal-case font-normal">optional</span></label>
                        <input type="number" value={insuranceMonthly} onChange={e => setInsuranceMonthly(e.target.value)} placeholder="150"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-blue-400" />
                      </div>
                    </div>

                    {calc && (
                      <button onClick={() => setActiveTab(1)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-colors">
                        View Comparison →
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 1: COMPARISON ─────────────────────────────────────────── */}
            {activeTab === 1 && (
              <>
                {!calc ? (
                  <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
                    <div className="text-4xl mb-4">⚙️</div>
                    <p className="text-slate-500">Enter purchase price and 1st lien rate in Loan Inputs to run the comparison.</p>
                    <button onClick={() => setActiveTab(0)} className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-sm">Go to Inputs →</button>
                  </div>
                ) : (
                  <>
                    {/* Best recommendation banner */}
                    {bestScenario && (
                      <div className={'rounded-3xl border-2 p-5 flex items-center gap-4 ' + (bestScenario === 'piggyback_8010' ? 'border-blue-300 bg-blue-50' : bestScenario === 'piggyback_8015' ? 'border-violet-300 bg-violet-50' : 'border-orange-300 bg-orange-50')}>
                        <span className="text-4xl">🏆</span>
                        <div>
                          <div className={'text-lg font-black ' + (bestScenario === 'piggyback_8010' ? 'text-blue-700' : bestScenario === 'piggyback_8015' ? 'text-violet-700' : 'text-orange-700')}>
                            Lowest 5-Year Cost: {bestLabel}
                          </div>
                          <div className="text-sm text-slate-500 mt-0.5">{fmt0(bestMonthly)}/mo · {fmt0(bestCost)} over 5 years · Based on current rates and inputs</div>
                          <div className="text-xs text-slate-400 mt-1">Verify 2nd lien availability with lender · CLTV must be ≤ 89.99% for conventional piggyback</div>
                        </div>
                      </div>
                    )}

                    {/* Three comparison cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {[
                        { id: 'piggyback_8010', label: '80/10/10', color: 'blue', icon: '🏗️', sub: '10% 2nd + 10% down',
                          rows: [
                            ['Down Payment', fmt0(calc.down_8010), ''],
                            ['1st Lien', fmt0(calc.loan1_8010), fmtD(calc.pmt1_8010) + '/mo'],
                            ['2nd Lien', fmt0(calc.loan2_8010), secondRate8010 ? fmtD(calc.pmt2_8010) + '/mo' : 'Rate needed'],
                            ['PMI', 'None ✓', ''],
                          ],
                          highlight: { label: 'Total P&I', value: fmtD(calc.totalPI_8010) + '/mo' },
                          bottom: [['5-Year Cost', fmt0(calc.cost5yr_8010)], (taxesMonthly || insuranceMonthly) ? ['Total PITI', fmtD(calc.totalPITI_8010) + '/mo'] : null].filter(Boolean),
                        },
                        { id: 'piggyback_8015', label: '80/15/5', color: 'violet', icon: '🏘️', sub: '15% 2nd + 5% down',
                          rows: [
                            ['Down Payment', fmt0(calc.down_8015), ''],
                            ['1st Lien', fmt0(calc.loan1_8015), fmtD(calc.pmt1_8015) + '/mo'],
                            ['2nd Lien', fmt0(calc.loan2_8015), secondRate8015 ? fmtD(calc.pmt2_8015) + '/mo' : 'Rate needed'],
                            ['PMI', 'None ✓', ''],
                          ],
                          highlight: { label: 'Total P&I', value: fmtD(calc.totalPI_8015) + '/mo' },
                          bottom: [['5-Year Cost', fmt0(calc.cost5yr_8015)], (taxesMonthly || insuranceMonthly) ? ['Total PITI', fmtD(calc.totalPITI_8015) + '/mo'] : null].filter(Boolean),
                        },
                        { id: 'single_pmi', label: 'Single + PMI', color: 'orange', icon: '📋', sub: downPct + '% down, 1 loan',
                          rows: [
                            ['Down Payment', fmt0(calc.downAmount), ''],
                            ['Loan Amount', fmt0(calc.loanSingle), fmtD(calc.pmtSingle) + '/mo'],
                            ['PMI', fmtD(calc.pmiMonthly) + '/mo', 'drops mo. ' + calc.pmiDropMonth],
                            ['Total PMI Cost', fmt0(calc.pmiTotalCost), ''],
                          ],
                          highlight: { label: 'Total P&I+PMI', value: fmtD(calc.totalPI_single) + '/mo' },
                          bottom: [['5-Year Cost', fmt0(calc.cost5yr_single)], ['PMI Drops', 'Month ' + calc.pmiDropMonth + ' (~' + Math.floor(calc.pmiDropMonth / 12) + 'y ' + (calc.pmiDropMonth % 12) + 'm)']],
                        },
                      ].map(card => {
                        const isBest = bestScenario === card.id;
                        const colorBorder = { blue: 'border-blue-500', violet: 'border-violet-500', orange: 'border-orange-500' };
                        const colorBg    = { blue: 'bg-blue-600', violet: 'bg-violet-600', orange: 'bg-orange-600' };
                        const colorText  = { blue: 'text-blue-300', violet: 'text-violet-300', orange: 'text-orange-300' };
                        const colorHL   = { blue: 'bg-blue-900/20 border-blue-500/30', violet: 'bg-violet-900/20 border-violet-500/30', orange: 'bg-orange-900/20 border-orange-500/30' };
                        return (
                          <div key={card.id} className={'bg-white rounded-3xl border-2 overflow-hidden ' + (isBest ? colorBorder[card.color] + ' shadow-lg' : 'border-slate-200')}>
                            <div className={colorBg[card.color] + ' px-5 py-4'}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{card.icon}</span>
                                  <span className="font-black text-white">{card.label}</span>
                                </div>
                                {isBest && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">BEST</span>}
                              </div>
                              <div className="text-xs text-white/70 mt-0.5">{card.sub}</div>
                            </div>
                            <div className="p-5 space-y-2">
                              {card.rows.map(([label, val, sub]) => (
                                <div key={label} className="flex justify-between items-start text-sm border-b border-slate-100 pb-2">
                                  <span className="text-slate-500">{label}</span>
                                  <div className="text-right">
                                    <div className={'font-semibold ' + (label === 'PMI' && val === 'None ✓' ? 'text-emerald-600' : label === 'PMI' ? 'text-red-500' : 'text-slate-800')}>{val}</div>
                                    {sub && <div className="text-xs text-slate-400">{sub}</div>}
                                  </div>
                                </div>
                              ))}
                              <div className={'rounded-2xl border p-3 ' + colorHL[card.color]}>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-bold text-slate-600">{card.highlight.label}</span>
                                  <span className={'text-base font-black ' + colorText[card.color]}>{card.highlight.value}</span>
                                </div>
                              </div>
                              {card.bottom.map(([l, v]) => (
                                <div key={l} className="flex justify-between text-xs text-slate-500">
                                  <span>{l}</span><span className="font-semibold text-slate-700">{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary table */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                        <h2 className="text-xl font-bold text-white">Side-by-Side Summary</h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-left px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Metric</th>
                              <th className="text-right px-4 py-4 text-xs font-bold text-blue-600 uppercase">80/10/10</th>
                              <th className="text-right px-4 py-4 text-xs font-bold text-violet-600 uppercase">80/15/5</th>
                              <th className="text-right px-4 py-4 text-xs font-bold text-orange-600 uppercase">Single + PMI</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[
                              { label: 'Down Payment',    v1: fmt0(calc.down_8010),       v2: fmt0(calc.down_8015),       v3: fmt0(calc.downAmount) },
                              { label: '1st Lien Amount', v1: fmt0(calc.loan1_8010),      v2: fmt0(calc.loan1_8015),      v3: fmt0(calc.loanSingle) },
                              { label: '2nd Lien Amount', v1: fmt0(calc.loan2_8010),      v2: fmt0(calc.loan2_8015),      v3: '—' },
                              { label: 'Monthly P&I',     v1: fmtD(calc.totalPI_8010),    v2: fmtD(calc.totalPI_8015),    v3: fmtD(calc.totalPI_single) },
                              { label: 'Monthly PMI',     v1: 'None', v2: 'None',         v3: fmtD(calc.pmiMonthly), highlight3: true },
                              { label: '5-Year Total',    v1: fmt0(calc.cost5yr_8010),    v2: fmt0(calc.cost5yr_8015),    v3: fmt0(calc.cost5yr_single), isCost: true },
                              { label: 'PMI Duration',    v1: 'N/A', v2: 'N/A',           v3: calc.pmiDropMonth > 0 ? '~' + Math.floor(calc.pmiDropMonth / 12) + 'y ' + (calc.pmiDropMonth % 12) + 'm' : 'N/A' },
                              { label: 'Total PMI Cost',  v1: '—', v2: '—',               v3: fmt0(calc.pmiTotalCost), highlight3: true },
                            ].map(row => {
                              const bestV = row.isCost ? Math.min(calc.cost5yr_8010, calc.cost5yr_8015, calc.cost5yr_single) : null;
                              return (
                                <tr key={row.label} className="hover:bg-slate-50">
                                  <td className="px-6 py-3 text-slate-600 font-medium">{row.label}</td>
                                  <td className={'px-4 py-3 text-right font-semibold ' + (row.isCost && calc.cost5yr_8010 === bestV ? 'text-emerald-600 font-black' : 'text-blue-600')}>{row.v1}</td>
                                  <td className={'px-4 py-3 text-right font-semibold ' + (row.isCost && calc.cost5yr_8015 === bestV ? 'text-emerald-600 font-black' : 'text-violet-600')}>{row.v2}</td>
                                  <td className={'px-4 py-3 text-right font-semibold ' + (row.highlight3 ? 'text-red-500' : row.isCost && calc.cost5yr_single === bestV ? 'text-emerald-600 font-black' : 'text-orange-600')}>{row.v3}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Break-even bar */}
                    {calc.pmiDropMonth > 0 && (
                      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                        <h3 className="text-lg font-bold text-slate-800 mb-2">PMI Drop-Off Timeline</h3>
                        <p className="text-sm text-slate-500 mb-5">When the single loan balance reaches 80% of the original value, PMI cancels automatically.</p>
                        <div className="space-y-3">
                          {[['PMI drops at month', calc.pmiDropMonth, 'mo', 360], ['Years until PMI gone', (calc.pmiDropMonth / 12).toFixed(1), 'years', 30]].map(([label, val, unit, max]) => (
                            <div key={label}>
                              <div className="flex justify-between text-sm mb-1.5">
                                <span className="text-slate-600 font-semibold">{label}</span>
                                <span className="font-bold text-slate-800">{val} {unit}</span>
                              </div>
                              <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: Math.min(100, (val / max) * 100) + '%' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 text-xs text-slate-400">💡 If the borrower plans to sell or refi before month {calc.pmiDropMonth}, the total PMI cost ({fmt0(calc.pmiTotalCost)}) may be less than the extra 2nd lien interest paid.</div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ─── TAB 2: ANALYSIS & LETTERS ─────────────────────────────────── */}
            {activeTab === 2 && (
              <>
                {/* AI Analysis */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Structure Recommendation</h2>
                    <p className="text-slate-400 text-sm mt-1">Sonnet analyzes your specific numbers and explains which structure wins — and why</p>
                  </div>
                  <div className="p-8">
                    {!aiAnalysis ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-slate-500 text-sm mb-4">Run AI analysis to get a recommendation, borrower talking points, and lender watch-outs.</p>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing || !calc}
                          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors">
                          {aiAnalyzing ? 'Analyzing...' : !calc ? 'Enter loan inputs first' : '🤖 Run AI Analysis'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className={'inline-block px-4 py-2 rounded-xl border-2 font-black text-sm ' + (aiAnalysis.recommendation === 'single_pmi' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-blue-100 text-blue-800 border-blue-300')}>
                          Recommended: {aiAnalysis.recommendation === 'piggyback_8010' ? '80/10/10 Piggyback' : aiAnalysis.recommendation === 'piggyback_8015' ? '80/15/5 Piggyback' : 'Single Loan + PMI'}
                        </div>
                        <p className="text-slate-700 leading-relaxed">{aiAnalysis.summary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {[['✅ Why Piggyback Wins', aiAnalysis.reasonsForPiggyback, 'emerald'], ['⚠️ When Single+PMI Might Win', aiAnalysis.reasonsAgainst, 'amber']].map(([label, items, color]) => (
                            <div key={label} className={`rounded-2xl border p-4 bg-${color}-50 border-${color}-200`}>
                              <div className={`text-xs font-bold text-${color}-700 mb-2`}>{label}</div>
                              <ul className="space-y-1">{(items || []).map((item, i) => <li key={i} className={`text-xs text-${color}-800 flex gap-2`}><span className="shrink-0">•</span><span>{item}</span></li>)}</ul>
                            </div>
                          ))}
                        </div>
                        {aiAnalysis.talkingPoints?.length > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                            <div className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">Borrower Talking Points</div>
                            {aiAnalysis.talkingPoints.map((tp, i) => <div key={i} className="flex gap-2 text-sm text-blue-800 mb-2"><span className="shrink-0 font-bold">{i + 1}.</span><span>{tp}</span></div>)}
                          </div>
                        )}
                        {aiAnalysis.watchOuts?.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">⚠️ LO Must Verify with Lender</div>
                            {aiAnalysis.watchOuts.map((w, i) => <div key={i} className="flex gap-2 text-sm text-amber-800 mb-1.5"><span className="shrink-0">•</span><span>{w}</span></div>)}
                          </div>
                        )}
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing} className="text-xs text-blue-600 hover:text-blue-500 font-semibold">{aiAnalyzing ? 'Re-analyzing...' : '↺ Re-run'}</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* LO Notes */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">LO Notes</h2>
                  </div>
                  <div className="p-8">
                    <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={4}
                      placeholder="Structure rationale, lender overlays, borrower cash preference, 2nd lien product source, compensating factors..."
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none" />
                    <div className="mt-4 flex justify-end">
                      <button onClick={handleSaveToRecord} disabled={recordSaving || !calc}
                        className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                        {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Letters */}
                {calc && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Letters</h2></div>
                    <div className="p-8">
                      <div className="flex gap-2 mb-6">
                        {[['borrower','👤 Borrower Letter'],['lo','📋 LO / Processor Summary']].map(([v,l]) => (
                          <button key={v} onClick={() => setActiveLetterTab(v)}
                            className={'px-5 py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ' + (activeLetterTab === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>{l}</button>
                        ))}
                      </div>
                      {activeLetterTab === 'borrower' && <LetterCard title="Borrower Comparison Letter" icon="👤" color="violet" body={buildBorrowerLetter({ borrowerName, purchasePrice: calc.pp, bestScenario, calc, firstRate, secondRate8010, secondRate8015, singleRate, termYears, downPct, loNotes, aiSummary: aiAnalysis?.summary })} />}
                      {activeLetterTab === 'lo' && <LetterCard title="LO / Processor Summary" icon="📋" color="blue" body={buildLOLetter({ borrowerName, purchasePrice: calc.pp, bestScenario, calc, firstRate, secondRate8010, secondRate8015, singleRate, termYears, secondTerm, downPct, loNotes })} />}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─── TAB 3: EDUCATION ──────────────────────────────────────────── */}
            {activeTab === 3 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">When to Use Piggyback Financing</h2>
                    <p className="text-slate-400 text-sm mt-1">Understanding when each structure wins for the borrower</p>
                  </div>
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {WHEN_TO_USE.map(u => {
                      const colorMap = { blue: 'bg-blue-50 border-blue-200', violet: 'bg-violet-50 border-violet-200', emerald: 'bg-emerald-50 border-emerald-200', amber: 'bg-amber-50 border-amber-200' };
                      const textMap  = { blue: 'text-blue-700', violet: 'text-violet-700', emerald: 'text-emerald-700', amber: 'text-amber-700' };
                      return (
                        <div key={u.scenario} className={'rounded-2xl border p-5 ' + colorMap[u.color]}>
                          <div className="text-2xl mb-2">{u.icon}</div>
                          <div className={'text-sm font-bold mb-2 ' + textMap[u.color]}>{u.scenario}</div>
                          <p className="text-xs text-slate-600 leading-relaxed">{u.tip}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Key Terms Glossary</h2>
                  </div>
                  <div className="p-8 space-y-4">
                    {GLOSSARY.map(g => (
                      <div key={g.term} className={'rounded-2xl border p-5 ' + (g.highlight ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200')}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">{g.icon}</span>
                          <span className={'font-bold text-sm ' + (g.highlight ? 'text-blue-800' : 'text-slate-800')}>{g.term}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{g.definition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Comparison Summary</div>
              {calc ? (
                <>
                  <div className="space-y-3">
                    {[
                      ['Purchase Price', fmt0(calc.pp), 'text-white'],
                      ['Down Payment', downPct + '% (' + fmt0(calc.downAmount) + ')', 'text-slate-300'],
                      ['1st Lien Rate', firstRate ? firstRate + '%' : '--', 'text-white'],
                      ['1st Lien Term', termYears + ' years', 'text-slate-300'],
                    ].map(([l, v, c]) => (
                      <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800">
                        <span className="text-slate-400 text-sm">{l}</span><span className={'font-bold text-sm ' + c}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 space-y-2">
                    {[
                      { label: '80/10/10', monthly: calc.totalPI_8010, cost: calc.cost5yr_8010, color: 'blue' },
                      { label: '80/15/5', monthly: calc.totalPI_8015, cost: calc.cost5yr_8015, color: 'violet' },
                      { label: 'Single+PMI', monthly: calc.totalPI_single, cost: calc.cost5yr_single, color: 'orange' },
                    ].map(s => {
                      const isBest = bestScenario === (s.label === '80/10/10' ? 'piggyback_8010' : s.label === '80/15/5' ? 'piggyback_8015' : 'single_pmi');
                      return (
                        <div key={s.label} className={'rounded-2xl border p-3 ' + (isBest ? (s.color === 'blue' ? 'bg-blue-900/30 border-blue-700/50' : s.color === 'violet' ? 'bg-violet-900/30 border-violet-700/50' : 'bg-orange-900/30 border-orange-700/50') : 'bg-slate-800 border-slate-700')}>
                          <div className="flex justify-between items-center">
                            <span className={'text-xs font-bold ' + (s.color === 'blue' ? 'text-blue-300' : s.color === 'violet' ? 'text-violet-300' : 'text-orange-300')}>{s.label}{isBest ? ' 🏆' : ''}</span>
                            <span className="text-xs text-slate-400">{fmt0(s.cost)} / 5yr</span>
                          </div>
                          <div className={'text-sm font-black mt-0.5 ' + (s.color === 'blue' ? 'text-blue-200' : s.color === 'violet' ? 'text-violet-200' : 'text-orange-200')}>{fmtD(s.monthly)}/mo</div>
                        </div>
                      );
                    })}
                  </div>
                  {aiAnalysis?.recommendation && (
                    <div className="mt-3 bg-blue-900/30 border border-blue-700/50 rounded-2xl p-3 text-center">
                      <div className="text-xs font-bold text-slate-400 uppercase mb-0.5">AI Recommendation</div>
                      <div className="font-black text-blue-300 text-sm">{aiAnalysis.recommendation === 'piggyback_8010' ? '80/10/10' : aiAnalysis.recommendation === 'piggyback_8015' ? '80/15/5' : 'Single + PMI'}</div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-500 text-sm text-center py-4">Enter loan inputs to see comparison</div>
              )}
            </div>

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {[
                  'CLTV for piggyback: max 89.99% for conventional — verify with investor',
                  '2nd lien must close simultaneously — not all lenders allow piggyback',
                  'Second lien rates are always higher than 1st — get current pricing from lender',
                  'PMI cancels at 80% LTV by request; auto-cancels at 78%',
                  'FHA/VA/USDA: piggyback not allowed — conventional only',
                  'Short hold period? PMI total may be less than extra 2nd interest paid',
                  'PMI may be tax-deductible — recommend borrower consult tax advisor',
                ].map(rule => <li key={rule} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0">•</span><span>{rule}</span></li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

</div>
  );
}
