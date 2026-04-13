import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { collection, query, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import ModuleNav from '../components/ModuleNav';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtD = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

// ─── Glossary terms ───────────────────────────────────────────────────────────
const GLOSSARY = [
  {
    term: 'Baseline Rate',
    icon: '📊',
    definition: 'The interest rate on your current rate sheet with zero points — no buydown, no credit. This is your starting point for comparison.',
    example: 'If your lender quotes 7.000% with 0 points, that is your baseline.',
  },
  {
    term: 'Price (%)',
    icon: '💲',
    definition: 'The cost or credit expressed as a percentage of the loan amount. Negative price = lender credit to borrower. Positive price = borrower pays to buy the rate down.',
    example: 'Price of -1.500 means the lender pays 1.5% of the loan amount ($4,500 on a $300K loan) toward closing costs. Price of +2.000 means the borrower pays 2 points ($6,000) to get a lower rate.',
    highlight: true,
  },
  {
    term: 'Points',
    icon: '🎯',
    definition: 'Discount points paid upfront to permanently reduce the interest rate. 1 point = 1% of the loan amount. Each point typically buys the rate down by 0.125% to 0.25%.',
    example: '2 points on a $300,000 loan = $6,000 paid at closing. In exchange, the rate might drop from 7.000% to 6.500%.',
    highlight: true,
  },
  {
    term: 'Break-Even',
    icon: '⚖️',
    definition: 'The number of months until your monthly savings equal the upfront cost you paid. After break-even, every month is pure savings.',
    example: 'If you paid $4,000 upfront and save $80/month, break-even is 50 months. Stay in the loan past 50 months and you come out ahead.',
  },
  {
    term: 'Planning Horizon',
    icon: '🗓️',
    definition: 'How long you expect to keep this loan before selling or refinancing. This is the most important variable — the right choice depends entirely on how long the borrower plans to stay.',
    example: 'A borrower who plans to sell in 3 years has a 36-month horizon. A buydown that breaks even in 48 months is a bad deal for them.',
  },
  {
    term: 'Net Savings',
    icon: '📈',
    definition: 'Total monthly savings over your planning horizon, minus the upfront cost. This is the real bottom line number.',
    example: 'Saving $95/month for 60 months = $5,700 total savings. Minus $3,800 upfront = $1,900 net benefit.',
  },
];

const WHEN_TO_USE = [
  {
    scenario: 'Seller Concession Negotiation',
    icon: '🏠',
    color: 'emerald',
    description: "Instead of asking for a price reduction, use seller concessions to permanently buy down the rate. Often more valuable than a price cut.",
    tip: 'A $5,000 seller concession toward rate buydown can save more over 5 years than a $5,000 price reduction.',
  },
  {
    scenario: 'Rate Sheet Comparison',
    icon: '📋',
    color: 'blue',
    description: "Compare multiple rate/price combinations from your pricing engine to find the optimal tradeoff for the borrower's specific situation.",
    tip: 'Run 3-4 options at once to show the borrower exactly where the best value is on the rate sheet.',
  },
  {
    scenario: 'Payment Reduction Goal',
    icon: '💰',
    color: 'violet',
    description: 'Borrower needs a lower monthly payment to qualify or feel comfortable. Show the exact cost to reach their target payment.',
    tip: 'Work backwards from the target payment to determine exactly how many points are needed.',
  },
  {
    scenario: 'Lender Credit Analysis',
    icon: '🏦',
    color: 'amber',
    description: 'When the borrower is short on closing costs, evaluate lender credits (negative price) and show the true monthly cost of taking a higher rate.',
    tip: 'A lender credit of -1.5 might only cost $40/month more — worth it if the borrower needs cash to close.',
  },
];

// ─── Letter builder ───────────────────────────────────────────────────────────
function buildLetter(type, borrowerName, scenarioName, loanAmount, baselineRate, planningHorizon, computedOptions) {
  const best = computedOptions.find((o) => o.badge === 'Best Long-Term');
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(today);
  lines.push('');
  if (type === 'borrower') {
    lines.push('Dear ' + (borrowerName || 'Valued Client') + ',');
    lines.push('');
    lines.push('RE: Rate Buydown Analysis - ' + (scenarioName || 'Your Home Purchase'));
    lines.push('');
    lines.push('I have completed a rate buydown analysis for your loan. This analysis compares multiple interest rate options to help you make the most informed decision about your mortgage.');
    lines.push('');
    lines.push('WHAT IS A RATE BUYDOWN?');
    lines.push('A rate buydown allows you to pay an upfront fee at closing (called "points") in exchange for a permanently lower interest rate. Alternatively, you can accept a slightly higher rate and receive a lender credit that reduces your closing costs. This analysis shows you exactly which option makes the most financial sense given how long you plan to keep the loan.');
    lines.push('');
    lines.push('YOUR LOAN DETAILS');
    lines.push('Loan Amount: ' + fmt(loanAmount));
    lines.push('Baseline Rate (no points): ' + baselineRate + '%');
    lines.push('Planning Horizon: ' + planningHorizon + ' months (' + Math.round(planningHorizon / 12) + ' years)');
    lines.push('');
    if (best) {
      lines.push('MY RECOMMENDATION - BEST LONG-TERM VALUE');
      lines.push('Rate: ' + best.rate.toFixed(3) + '%');
      lines.push('Upfront Cost: ' + fmtD(best.upfrontCostUsd));
      lines.push('Monthly Savings vs Baseline: ' + fmtD(best.monthlySavings) + '/month');
      lines.push('Break-Even Point: ' + best.breakEvenMonths + ' months');
      lines.push('Net Benefit Over ' + planningHorizon + ' Months: ' + fmtD(best.netSavingsHorizon));
      lines.push('');
      lines.push('In simple terms: By paying ' + fmtD(best.upfrontCostUsd) + ' at closing, your monthly payment drops by ' + fmtD(best.monthlySavings) + '. You recover the upfront cost in ' + best.breakEvenMonths + ' months. After that, every month is profit. Over ' + planningHorizon + ' months, you come out ahead by ' + fmtD(best.netSavingsHorizon) + '.');
      lines.push('');
    }
    lines.push('ALL OPTIONS ANALYZED');
    computedOptions.forEach((o, i) => {
      const badge = o.badge ? ' [' + o.badge + ']' : '';
      const be = o.breakEvenMonths < 999 ? (o.breakEvenMonths + ' months') : 'N/A';
      lines.push((i + 1) + '. Rate ' + o.rate.toFixed(3) + '% | Upfront: ' + fmtD(o.upfrontCostUsd) + ' | Saves ' + fmtD(o.monthlySavings) + '/mo | Break-Even: ' + be + ' | Net: ' + fmtD(o.netSavingsHorizon) + badge);
    });
    lines.push('');
    lines.push('IMPORTANT REMINDERS');
    lines.push('* These figures reflect principal and interest only. Your full payment includes taxes, insurance, and any mortgage insurance.');
    lines.push('* Break-even assumes no refinancing or sale before the planning horizon.');
    lines.push('* Discount points paid may be tax-deductible. Please consult your tax advisor.');
    lines.push('');
    lines.push('I am here to answer any questions and help you make the best decision for your family.');
    lines.push('');
    lines.push('Warm regards,');
  } else {
    lines.push('Dear Realtor Partner,');
    lines.push('');
    lines.push('RE: Rate Buydown Strategy for ' + (borrowerName || 'Your Buyer') + ' - ' + (scenarioName || 'Active Transaction'));
    lines.push('');
    lines.push('I have completed a rate buydown analysis for your buyer that could be a powerful negotiating tool in your current transaction. I wanted to share this with you so we can use it strategically in any seller concession discussions.');
    lines.push('');
    lines.push('WHY A RATE BUYDOWN BEATS A PRICE REDUCTION');
    lines.push('When a seller offers concessions, most buyers instinctively ask for a price reduction. But a seller-funded rate buydown often delivers significantly more value:');
    lines.push('* A price reduction lowers the loan amount by a small amount, reducing P&I by only a fraction of the reduction.');
    lines.push('* A rate buydown directly reduces the monthly payment dollar-for-dollar based on the rate change.');
    lines.push('* A price reduction affects the appraisal and neighborhood comparables. A concession does not.');
    lines.push('');
    lines.push("YOUR BUYER'S NUMBERS");
    lines.push('Loan Amount: ' + fmt(loanAmount));
    lines.push('Baseline Rate: ' + baselineRate + '%');
    if (best) {
      lines.push('Best Buydown Option: ' + best.rate.toFixed(3) + '% rate');
      lines.push('Cost of Buydown: ' + fmtD(best.upfrontCostUsd) + ' (seller concession)');
      lines.push('Monthly Savings for Buyer: ' + fmtD(best.monthlySavings) + '/month (' + fmtD(best.monthlySavings * 12) + '/year)');
      lines.push('Net Benefit to Buyer Over ' + planningHorizon + ' Months: ' + fmtD(best.netSavingsHorizon));
    }
    lines.push('');
    lines.push('CONCESSION LIMITS BY LOAN TYPE');
    lines.push('FHA: Up to 6% of purchase price');
    lines.push('VA: Up to 4% of purchase price');
    lines.push('USDA: Up to 6% of purchase price');
    lines.push('Conventional: 3-9% depending on LTV and occupancy');
    lines.push('');
    lines.push('I can model any offer scenario instantly -- just send me the proposed concession amount and I will show you exactly what rate and payment your buyer would receive.');
    lines.push('');
    lines.push("Let's win this deal together.");
    lines.push('');
    lines.push('Best regards,');
  }
  lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions');
  lines.push('george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function GlossaryCard({ term, icon, definition, example, highlight }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen((v) => !v)}
      className={'rounded-2xl border cursor-pointer transition-all duration-200 overflow-hidden ' + (highlight ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300')}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl">{icon}</span>
        <span className={'text-sm font-bold ' + (highlight ? 'text-amber-800' : 'text-slate-700')}>{term}</span>
        {highlight && <span className="ml-auto text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Key Term</span>}
        <span className={'text-slate-400 text-xs ml-auto ' + (highlight ? 'ml-0' : '')}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-600 leading-relaxed">{definition}</p>
          <div className="bg-slate-50 rounded-xl px-3 py-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Example: </span>
            <span className="text-xs text-slate-600">{example}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakEvenBar({ breakEvenMonths, planningHorizon }) {
  if (breakEvenMonths >= 999) return <div className="text-xs text-red-500 font-semibold">Never breaks even</div>;
  const pct = Math.min((breakEvenMonths / planningHorizon) * 100, 100);
  const color = pct <= 50 ? 'bg-emerald-500' : pct <= 75 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Month 0</span>
        <span className="font-bold text-slate-700">Break-even: mo {breakEvenMonths}</span>
        <span>Month {planningHorizon}</span>
      </div>
      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={'absolute inset-y-0 left-0 rounded-full transition-all ' + color} style={{ width: pct + '%' }} />
        <div className="absolute inset-y-0 left-0 right-0 bg-emerald-100/60" style={{ left: pct + '%' }} />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className={'font-semibold ' + color.replace('bg-', 'text-')}>Payback period</span>
        <span className="text-emerald-600 font-semibold">Savings zone</span>
      </div>
    </div>
  );
}

function BuydownLetter({ borrowerName, scenarioName, loanAmount, baselineRate, planningHorizon, computedOptions }) {
  const [letterType, setLetterType] = useState('borrower');
  const [copied, setCopied] = useState(false);
  const letterText = buildLetter(letterType, borrowerName, scenarioName, loanAmount, baselineRate, planningHorizon, computedOptions);
  const handleCopy = () => {
    navigator.clipboard.writeText(letterText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Communication Tools</div>
          <h3 className="text-white font-bold text-lg">Borrower &amp; Realtor Letters</h3>
          <p className="text-slate-400 text-xs mt-0.5">Auto-generated from your analysis. Review before sending.</p>
        </div>
        <span className="text-3xl">✉️</span>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          {[['borrower', '👤 Borrower Letter'], ['realtor', '🏠 Realtor Letter']].map(([val, label]) => (
            <button key={val} onClick={() => setLetterType(val)}
              className={'px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ' + (letterType === val ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400')}>
              {label}
            </button>
          ))}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{letterText}</pre>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCopy}
            className={'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ' + (copied ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white')}>
            {copied ? '✓ Copied to Clipboard' : '📋 Copy Letter'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl">
            🖨 Print
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RateBuydownCalculator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scenarioIdFromUrl = searchParams.get('scenarioId');

  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [scenarioId, setScenarioId] = useState(scenarioIdFromUrl || '');
  const [borrowerName, setBorrowerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  const { reportFindings, savedRecordId, setSavedRecordId } = useDecisionRecord('RATE_BUYDOWN', scenarioId);
  const [recordSaving, setRecordSaving] = useState(false);

  const [loanAmount, setLoanAmount] = useState(0);
  const [loanTerm, setLoanTerm] = useState(360);
  const [baselineRate, setBaselineRate] = useState(0);
  const [rateOptions, setRateOptions] = useState([
    { rate: '6.750', points: '1', price: '1.0' },
    { rate: '6.500', points: '2', price: '2.0' },
  ]);
  const [planningHorizon, setPlanningHorizon] = useState(60);
  const [computedOptions, setComputedOptions] = useState([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => { loadScenarios(); }, []);
  useEffect(() => { if (scenarioIdFromUrl) loadScenarioData(scenarioIdFromUrl); }, [scenarioIdFromUrl]);

  const loadScenarios = async () => {
    try {
      const qs = await getDocs(query(collection(db, 'scenarios')));
      setScenarios(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadScenarioData = async (id) => {
    try {
      const snap = await getDoc(doc(db, 'scenarios', id));
      if (!snap.exists()) return;
      const data = snap.data();
      setSelectedScenario({ id: snap.id, ...data });
      setScenarioId(id);
      const name = [data.firstName, data.lastName].filter(Boolean).join(' ');
      if (name) setBorrowerName(name.trim());
      setLoanAmount(data.loanAmount || 0);
      setLoanTerm(data.term || 360);
      setBaselineRate(data.interestRate || 0);
      if (data.rate_buydown_analysis) {
        setRateOptions(data.rate_buydown_analysis.rate_options || rateOptions);
        setPlanningHorizon(data.rate_buydown_analysis.planning_horizon || 60);
      }
    } catch (e) { console.error(e); }
  };

  const addRateOption = () => setRateOptions([...rateOptions, { rate: '', points: '', price: '' }]);
  const removeRateOption = (i) => setRateOptions(rateOptions.filter((_, idx) => idx !== i));
  const updateRateOption = (i, field, value) => {
    const n = [...rateOptions];
    n[i][field] = value;
    setRateOptions(n);
  };

  const calculateResults = () => {
    if (!loanAmount || !baselineRate) { alert('Please load a scenario first'); return; }
    const bRate = baselineRate / 100 / 12;
    const basePmt = loanAmount * (bRate * Math.pow(1 + bRate, loanTerm)) / (Math.pow(1 + bRate, loanTerm) - 1);

    const computed = rateOptions.map((opt, idx) => {
      const rate = parseFloat(opt.rate);
      const price = parseFloat(opt.price);
      if (!rate || isNaN(rate)) return null;
      const upfrontCostUsd = loanAmount * (price / 100);
      const mr = rate / 100 / 12;
      const payment = loanAmount * (mr * Math.pow(1 + mr, loanTerm)) / (Math.pow(1 + mr, loanTerm) - 1);
      const monthlySavings = basePmt - payment;
      const breakEvenMonths = monthlySavings > 0 && upfrontCostUsd > 0 ? Math.ceil(upfrontCostUsd / monthlySavings) : monthlySavings > 0 ? 0 : 999;
      const netSavingsHorizon = (monthlySavings * planningHorizon) - upfrontCostUsd;
      let benefitScore = 50;
      if (monthlySavings > 0 && breakEvenMonths <= planningHorizon) benefitScore = Math.min(100, 50 + (netSavingsHorizon / 1000));
      else if (monthlySavings <= 0 && upfrontCostUsd > 0) benefitScore = 0;
      return { index: idx, rate, price, upfrontCostUsd, payment, monthlySavings, breakEvenMonths, netSavingsHorizon, benefitScore };
    }).filter(Boolean);

    const valid = computed.filter((o) => o.monthlySavings > 0);
    if (valid.length > 0) {
      const bestLT = valid.reduce((a, b) => b.netSavingsHorizon > a.netSavingsHorizon ? b : a);
      bestLT.badge = 'Best Long-Term';
      const bestST = valid.reduce((a, b) => b.breakEvenMonths < a.breakEvenMonths ? b : a);
      if (bestST.index !== bestLT.index) bestST.badge = 'Best Short-Term';
      const lowCash = computed.reduce((a, b) => b.upfrontCostUsd < a.upfrontCostUsd ? b : a);
      if (!lowCash.badge) lowCash.badge = 'Lowest Cash';
    }
    computed.forEach((o) => { if (o.monthlySavings <= 0 && o.upfrontCostUsd > 0) o.badge = 'Avoid'; });
    setComputedOptions(computed);
    setShowResults(true);
    setShowGuide(false);
    setTimeout(() => { const el = document.getElementById('results-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const best = computedOptions.find((o) => o.badge === 'Best Long-Term');
      const riskFlags = [];
      computedOptions.forEach((o) => {
        if (o.badge === 'Avoid') riskFlags.push({ field: 'option_' + (o.index + 1), message: 'Rate ' + o.rate.toFixed(3) + '% has negative savings with upfront cost', severity: 'MEDIUM' });
        if (o.breakEvenMonths > planningHorizon && o.breakEvenMonths < 999) riskFlags.push({ field: 'option_' + (o.index + 1), message: 'Break-even (' + o.breakEvenMonths + ' mo) exceeds planning horizon (' + planningHorizon + ' mo)', severity: 'LOW' });
      });
      const writtenId = await reportFindings({
        verdict: best ? ('Best Long-Term: ' + best.rate.toFixed(3) + '%') : 'No beneficial buydown found',
        summary: 'Rate Buydown Analysis — ' + computedOptions.length + ' options. Baseline: ' + baselineRate + '%. Horizon: ' + planningHorizon + ' months.' + (best ? ' Best: ' + best.rate.toFixed(3) + '% saves ' + fmtD(best.netSavingsHorizon) + ' net.' : ''),
        riskFlags,
        findings: {
          baselineRate, loanAmount, loanTerm, planningHorizon,
          optionsAnalyzed: computedOptions.length,
          bestLongTerm: best ? { rate: best.rate, netSavings: best.netSavingsHorizon, breakEven: best.breakEvenMonths } : null,
          allOptions: computedOptions.map((o) => ({ rate: o.rate, upfront: o.upfrontCostUsd, monthlySavings: o.monthlySavings, breakEven: o.breakEvenMonths, netSavings: o.netSavingsHorizon, badge: o.badge || null })),
        },
        completeness: { scenarioLoaded: !!selectedScenario, rateOptionsEntered: rateOptions.some((o) => o.rate), resultsCalculated: showResults },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const saveResults = async () => {
    if (!scenarioId) return;
    try {
      await updateDoc(doc(db, 'scenarios', scenarioId), {
        rate_buydown_analysis: { baseline_rate: baselineRate, rate_options: rateOptions, planning_horizon: planningHorizon, computed_options: computedOptions, analyzed_at: new Date() },
        updated_at: new Date(),
      });
      alert('Analysis saved to scenario.');
    } catch (e) { alert('Save failed.'); }
  };

  const getBadgeStyle = (badge) => {
    if (badge === 'Best Long-Term') return 'bg-blue-600 text-white';
    if (badge === 'Best Short-Term') return 'bg-emerald-600 text-white';
    if (badge === 'Lowest Cash') return 'bg-violet-600 text-white';
    if (badge === 'Avoid') return 'bg-red-500 text-white';
    return 'bg-slate-400 text-white';
  };

  const best = computedOptions.find((o) => o.badge === 'Best Long-Term');
  const baselinePmt = loanAmount && baselineRate ? (() => {
    const r = baselineRate / 100 / 12;
    return loanAmount * (r * Math.pow(1 + r, loanTerm)) / (Math.pow(1 + r, loanTerm) - 1);
  })() : 0;

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-pulse">💰</div>
        <div className="text-slate-500 font-medium">Loading LoanBeacons...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* ── Module Navigation Bar ── */}
      <ModuleNav moduleNumber={9} />

      {/* ── Hero Header ── */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors">
            ← Dashboard
          </button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 09</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">
                Rate Buydown Calculator™
              </h1>
              <p className="text-slate-400 text-base max-w-xl leading-relaxed">
                Compare every rate option on your pricing sheet. Find the break-even, score the tradeoff, and generate a client-ready explanation in seconds.
              </p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4 backdrop-blur-sm" style={{ minWidth: '220px' }}>
              {selectedScenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || selectedScenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{fmt(loanAmount)} · {baselineRate}% baseline · {loanTerm === 360 ? '30yr' : '15yr'}</div>
                  <button onClick={() => { setSelectedScenario(null); setScenarioId(''); setBorrowerName(''); setShowResults(false); }}
                    className="text-xs text-blue-400 hover:text-blue-300 mt-2 block">
                    Change scenario →
                  </button>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">No Scenario Loaded</div>
                  <div className="text-slate-400 text-sm">Select a scenario below to begin</div>
                  <div className="text-slate-600 text-xs mt-2">↓ Choose from your pipeline</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Borrower bar */}
      {scenarioId && borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {selectedScenario?.streetAddress && (
              <span className="text-blue-200 text-xs">{[selectedScenario.streetAddress, selectedScenario.city, selectedScenario.state].filter(Boolean).join(', ')}</span>
            )}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {loanAmount > 0 && <span>Loan <strong className="text-white">{fmt(loanAmount)}</strong></span>}
              {baselineRate > 0 && <span>Baseline <strong className="text-white">{baselineRate}%</strong></span>}
              {baselinePmt > 0 && <span>Baseline P&amp;I <strong className="text-white">{fmtD(baselinePmt)}/mo</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Rate Buydown Calculator™" moduleNumber="09" scenarioId={scenarioId} />

      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2">
        <DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="RATE_BUYDOWN" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">

        {/* ── Education Panel ── */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <button onClick={() => setShowGuide((v) => !v)}
            className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-lg font-bold">?</div>
              <div className="text-left">
                <div className="font-bold text-slate-800 text-base">LO Confidence Guide — What Is a Rate Buydown?</div>
                <div className="text-slate-500 text-sm">Learn when to use this tool, what every field means, and how to talk to borrowers about it</div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              ▼
            </div>
          </button>

          {showGuide && (
            <div className="border-t border-slate-100">
              <div className="px-8 pt-6 pb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">When Should You Use This Module?</div>
                <div className="grid grid-cols-2 gap-4">
                  {WHEN_TO_USE.map((w) => {
                    const colors = {
                      emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                      blue: 'bg-blue-50 border-blue-200 text-blue-700',
                      violet: 'bg-violet-50 border-violet-200 text-violet-700',
                      amber: 'bg-amber-50 border-amber-200 text-amber-700',
                    };
                    const tipColors = {
                      emerald: 'bg-emerald-100 text-emerald-800',
                      blue: 'bg-blue-100 text-blue-800',
                      violet: 'bg-violet-100 text-violet-800',
                      amber: 'bg-amber-100 text-amber-800',
                    };
                    return (
                      <div key={w.scenario} className={'rounded-2xl border p-4 ' + colors[w.color]}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{w.icon}</span>
                          <span className="font-bold text-sm">{w.scenario}</span>
                        </div>
                        <p className="text-xs leading-relaxed mb-3 opacity-80">{w.description}</p>
                        <div className={'text-xs rounded-xl px-3 py-2 font-medium ' + tipColors[w.color]}>
                          💡 {w.tip}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-8 pb-8">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Field-by-Field Glossary — Click to Expand</div>
                <div className="grid grid-cols-2 gap-3">
                  {GLOSSARY.map((g) => <GlossaryCard key={g.term} {...g} />)}
                </div>
                <div className="mt-4 bg-slate-800 rounded-2xl px-5 py-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">💬 What to Tell Your Borrower</div>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    "I'm going to run a few rate options side by side. For each one, I'll show you exactly what you pay upfront, how much you save every month, and how long it takes to get your money back. Then I'll tell you which option makes the most sense for how long you plan to stay in the home."
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Scenario Selector ── */}
        {!selectedScenario && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 1</div>
              <h2 className="text-xl font-bold text-white">Select a Borrower Scenario</h2>
              <p className="text-slate-400 text-sm mt-1">Loan amount and baseline rate will auto-populate from the scenario.</p>
            </div>
            <div className="p-6">
              {scenarios.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📂</div>
                  <div className="text-slate-500 mb-4">No scenarios found</div>
                  <button onClick={() => navigate('/scenario-creator')} className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-semibold">Create New Scenario</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {scenarios.map((s) => (
                    <button key={s.id} onClick={() => loadScenarioData(s.id)}
                      className="w-full text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-all group">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-800 group-hover:text-blue-700">{s.scenarioName || 'Unnamed Scenario'}</div>
                          <div className="text-sm text-slate-500 mt-0.5">{fmt(s.loanAmount)} · {s.interestRate}% · {s.term === 360 ? '30yr' : '15yr'}</div>
                        </div>
                        <span className="text-blue-400 text-xl">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedScenario && (
          <>
            {/* ── Rate Options Input ── */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-6">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 2</div>
                <h2 className="text-xl font-bold text-white">Enter Rate Options from Your Pricing Sheet</h2>
                <p className="text-slate-400 text-sm mt-1">Add each rate option. Positive price = borrower pays. Negative price = lender credit.</p>
              </div>

              <div className="p-8 space-y-6">
                {/* Planning Horizon */}
                <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 flex items-center gap-6 flex-wrap">
                  <div>
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Planning Horizon</div>
                    <div className="text-xs text-blue-700">How long does the borrower expect to keep this loan?</div>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    {[24, 36, 48, 60, 84, 120].map((mo) => (
                      <button key={mo} onClick={() => setPlanningHorizon(mo)}
                        className={'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ' + (planningHorizon === mo ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-300 hover:border-blue-500')}>
                        {mo}mo
                      </button>
                    ))}
                    <div className="flex items-center gap-2">
                      <input type="number" value={planningHorizon} onChange={(e) => setPlanningHorizon(parseInt(e.target.value) || 60)}
                        className="w-20 px-3 py-1.5 border border-blue-300 rounded-xl text-sm font-bold text-center text-blue-700" />
                      <span className="text-xs text-blue-600">months</span>
                    </div>
                  </div>
                </div>

                {/* Baseline display */}
                <div className="bg-slate-800 rounded-2xl px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Baseline — Your Starting Point</div>
                    <div className="text-2xl font-black text-white">{baselineRate}%</div>
                    <div className="text-slate-400 text-sm">{fmtD(baselinePmt)}/mo · No points · No credit</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-xs mb-1">Loan Amount</div>
                    <div className="text-white font-bold text-lg">{fmt(loanAmount)}</div>
                    <div className="text-slate-400 text-xs">{loanTerm === 360 ? '30-Year Fixed' : '15-Year Fixed'}</div>
                  </div>
                </div>

                {/* Rate option rows */}
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-3 px-2">
                    <div className="col-span-1" />
                    <div className="col-span-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Interest Rate (%)</div>
                    <div className="col-span-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Points <span className="font-normal normal-case text-slate-400">(optional label)</span></div>
                    <div className="col-span-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                      Price (%) <span className="font-normal normal-case text-slate-400">negative = lender credit</span>
                    </div>
                    <div className="col-span-1" />
                  </div>

                  {rateOptions.map((opt, i) => {
                    const rate = parseFloat(opt.rate);
                    const price = parseFloat(opt.price);
                    const isBelow = rate < baselineRate;
                    const isAbove = rate > baselineRate;
                    const upfront = loanAmount && price ? loanAmount * (price / 100) : 0;
                    return (
                      <div key={i} className={'rounded-2xl border-2 p-4 transition-all ' + (isBelow ? 'border-emerald-200 bg-emerald-50/50' : isAbove ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50')}>
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-1 text-center">
                            <span className={'text-xs font-black w-6 h-6 rounded-full flex items-center justify-center mx-auto ' + (isBelow ? 'bg-emerald-200 text-emerald-800' : isAbove ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600')}>
                              {i + 1}
                            </span>
                          </div>
                          <div className="col-span-3">
                            <input type="number" step="0.001" value={opt.rate}
                              onChange={(e) => updateRateOption(i, 'rate', e.target.value)}
                              className={'w-full px-4 py-2.5 border-2 rounded-xl font-bold text-lg text-center focus:outline-none transition-all ' + (isBelow ? 'border-emerald-400 bg-white text-emerald-700 focus:border-emerald-500' : isAbove ? 'border-amber-400 bg-white text-amber-700' : 'border-slate-300 bg-white text-slate-700')}
                              placeholder={baselineRate ? (baselineRate - 0.25).toFixed(3) : '6.750'} />
                            <div className="text-center text-xs mt-1" style={{ minHeight: '16px' }}>
                              {isBelow && <span className="text-emerald-600 font-semibold">▼ {(baselineRate - rate).toFixed(3)}% below baseline</span>}
                              {isAbove && <span className="text-amber-600 font-semibold">▲ {(rate - baselineRate).toFixed(3)}% above baseline</span>}
                              {!isBelow && !isAbove && rate === baselineRate && <span className="text-slate-400">= baseline</span>}
                            </div>
                          </div>
                          <div className="col-span-3">
                            <input type="number" step="0.001" value={opt.points}
                              onChange={(e) => updateRateOption(i, 'points', e.target.value)}
                              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-600 focus:outline-none focus:border-slate-400 bg-white"
                              placeholder="1.000" />
                          </div>
                          <div className="col-span-4">
                            <input type="number" step="0.001" value={opt.price}
                              onChange={(e) => updateRateOption(i, 'price', e.target.value)}
                              className={'w-full px-4 py-2.5 border-2 rounded-xl font-semibold focus:outline-none transition-all ' + (price < 0 ? 'border-violet-300 bg-violet-50 text-violet-700 focus:border-violet-500' : price > 0 ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600')}
                              placeholder="1.500" />
                            <div className={'text-xs mt-1 font-semibold ' + (upfront < 0 ? 'text-violet-600' : 'text-orange-600')} style={{ minHeight: '16px' }}>
                              {upfront !== 0 && (upfront < 0 ? '🏷 Lender pays ' + fmtD(Math.abs(upfront)) : '💳 Borrower pays ' + fmtD(upfront))}
                            </div>
                          </div>
                          <div className="col-span-1">
                            {rateOptions.length > 1 && (
                              <button onClick={() => removeRateOption(i)} className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-lg transition-colors">
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button onClick={addRateOption}
                    className="w-full border-2 border-dashed border-slate-300 rounded-2xl py-3 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-all text-sm font-semibold">
                    + Add Rate Option
                  </button>
                </div>

                <button onClick={calculateResults}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg">
                  Calculate &amp; Compare →
                </button>
              </div>
            </div>

            {/* ── Results ── */}
            {showResults && computedOptions.length > 0 && (
              <div id="results-section" className="space-y-6">

                {best && (
                  <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 border border-slate-700 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-32 translate-x-32" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full translate-y-24 -translate-x-24" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="bg-blue-600 text-white text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-wider">Best Long-Term Value</div>
                        <div className="bg-emerald-600/20 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-600/30">Recommended</div>
                      </div>
                      <div className="grid grid-cols-4 gap-6 mb-8">
                        <div>
                          <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Interest Rate</div>
                          <div className="text-5xl font-black text-white">{best.rate.toFixed(3)}<span className="text-2xl text-slate-400">%</span></div>
                          <div className="text-emerald-400 text-sm font-semibold mt-1">▼ {(baselineRate - best.rate).toFixed(3)}% vs baseline</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Monthly Savings</div>
                          <div className="text-4xl font-black text-emerald-400">{fmtD(best.monthlySavings)}</div>
                          <div className="text-slate-400 text-sm mt-1">per month forever</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Upfront Cost</div>
                          <div className="text-4xl font-black text-white">{fmtD(best.upfrontCostUsd)}</div>
                          <div className="text-slate-400 text-sm mt-1">paid at closing</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Net Benefit @ {planningHorizon}mo</div>
                          <div className={'text-4xl font-black ' + (best.netSavingsHorizon > 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtD(best.netSavingsHorizon)}</div>
                          <div className="text-slate-400 text-sm mt-1">total advantage</div>
                        </div>
                      </div>
                      <div className="bg-slate-800/60 rounded-2xl px-6 py-4 mb-4">
                        <BreakEvenBar breakEvenMonths={best.breakEvenMonths} planningHorizon={planningHorizon} />
                      </div>
                      <div className="bg-blue-900/30 border border-blue-700/40 rounded-2xl px-5 py-4">
                        <div className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-2">💬 What to Tell Your Borrower</div>
                        <p className="text-slate-300 text-sm leading-relaxed">
                          "By paying {fmtD(best.upfrontCostUsd)} today, your monthly payment drops {fmtD(best.monthlySavings)}. You get that money back in {best.breakEvenMonths} months. After that, every single month puts {fmtD(best.monthlySavings)} back in your pocket. Over {planningHorizon} months, you come out {fmtD(best.netSavingsHorizon)} ahead."
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">All Options Compared</h3>
                      <p className="text-slate-500 text-sm">{computedOptions.length} rate options · {planningHorizon}-month planning horizon</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={handleSaveToRecord} disabled={recordSaving}
                        className={'px-5 py-2.5 rounded-xl text-sm font-bold transition-all ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                        {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record'}
                      </button>
                      <button onClick={saveResults} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl">
                        Save to Scenario
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['#', 'Rate', 'Upfront Cost', 'Monthly P&I', 'vs Baseline', 'Break-Even', `Net @ ${planningHorizon}mo`, 'Score', 'Verdict'].map((h) => (
                            <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td className="px-5 py-4 text-sm text-slate-400">—</td>
                          <td className="px-5 py-4 font-bold text-slate-500">{baselineRate}% <span className="text-xs font-normal text-slate-400">(baseline)</span></td>
                          <td className="px-5 py-4 text-slate-400 text-sm">$0.00</td>
                          <td className="px-5 py-4 font-semibold text-slate-500">{fmtD(baselinePmt)}</td>
                          <td className="px-5 py-4 text-slate-400 text-sm">—</td>
                          <td className="px-5 py-4 text-slate-400 text-sm">—</td>
                          <td className="px-5 py-4 text-slate-400 text-sm">—</td>
                          <td className="px-5 py-4"><span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg">—</span></td>
                          <td className="px-5 py-4"><span className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-xl">Starting Point</span></td>
                        </tr>
                        {computedOptions.map((o) => (
                          <tr key={o.index} className={'border-b border-slate-100 transition-colors ' + (o.badge === 'Best Long-Term' ? 'bg-blue-50/40' : 'hover:bg-slate-50')}>
                            <td className="px-5 py-4 text-sm text-slate-500">{o.index + 1}</td>
                            <td className="px-5 py-4 font-black text-slate-800 text-base">{o.rate.toFixed(3)}%</td>
                            <td className="px-5 py-4 text-sm text-slate-700">{fmtD(o.upfrontCostUsd)}</td>
                            <td className="px-5 py-4 font-semibold text-slate-700">{fmtD(o.payment)}</td>
                            <td className={'px-5 py-4 font-bold ' + (o.monthlySavings > 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {o.monthlySavings > 0 ? '-' : '+'}{fmtD(Math.abs(o.monthlySavings))}/mo
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700">
                              {o.breakEvenMonths < 999 ? (o.breakEvenMonths + ' mo') : 'Never'}
                            </td>
                            <td className={'px-5 py-4 font-bold ' + (o.netSavingsHorizon > 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {fmtD(o.netSavingsHorizon)}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={'h-full rounded-full ' + (o.benefitScore >= 70 ? 'bg-emerald-500' : o.benefitScore >= 40 ? 'bg-amber-500' : 'bg-red-400')} style={{ width: Math.max(o.benefitScore, 0) + '%' }} />
                                </div>
                                <span className={'text-xs font-black ' + (o.benefitScore >= 70 ? 'text-emerald-600' : o.benefitScore >= 40 ? 'text-amber-600' : 'text-red-500')}>
                                  {Math.round(o.benefitScore)}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {o.badge && (
                                <span className={'px-3 py-1.5 text-xs font-bold rounded-xl ' + getBadgeStyle(o.badge)}>{o.badge}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-8 py-6 border-t border-slate-100 space-y-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Break-Even Timeline by Option</div>
                    {computedOptions.filter((o) => o.breakEvenMonths < 999).map((o) => (
                      <div key={o.index}>
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span className="font-bold">Option {o.index + 1} — {o.rate.toFixed(3)}%</span>
                          <span>{o.breakEvenMonths < planningHorizon ? 'Breaks even in ' + o.breakEvenMonths + ' months' : 'Does not break even in ' + planningHorizon + ' months'}</span>
                        </div>
                        <BreakEvenBar breakEvenMonths={o.breakEvenMonths} planningHorizon={planningHorizon} />
                      </div>
                    ))}
                  </div>

                  <div className="mx-6 mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Important — Results Vary by Loan Product</div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                      {[
                        ['FHA', 'Seller concessions capped at 6%. MIP is unaffected by rate buydown.'],
                        ['VA', 'Seller concessions capped at 4%. No PMI — pure rate savings, very efficient.'],
                        ['USDA', 'Seller concessions up to 6%. Annual guarantee fee (0.35%) unaffected.'],
                        ['Conventional', 'Concessions 3-9% based on LTV. PMI threshold unaffected by buydown.'],
                        ['2-1 Buydown', 'Temporary buydown (2% year 1, 1% year 2) — not modeled here. Use Rate Intel.'],
                        ['Lender Credit', 'Negative price = lender pays costs. Borrower accepts higher rate permanently.'],
                      ].map(([label, note]) => (
                        <div key={label} className="flex gap-2 text-xs text-amber-800">
                          <span className="font-black shrink-0">{label}:</span>
                          <span className="opacity-80">{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <BuydownLetter
                  borrowerName={borrowerName}
                  scenarioName={selectedScenario?.scenarioName}
                  loanAmount={loanAmount}
                  baselineRate={baselineRate}
                  planningHorizon={planningHorizon}
                  computedOptions={computedOptions}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
