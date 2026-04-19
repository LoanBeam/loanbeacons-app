// src/pages/RateIntel.jsx
// LoanBeacons™ — Module 19 | Stage 3: Optimization
// Rate Intelligence™ — Rate locks, pricing, buydown analysis, float vs lock
// v2.0 — ModulePageShell layout standard applied (Apr 2026)

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import ModuleNav from '../components/ModuleNav';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';

const LOCK_PERIODS = [
  { days: 15, adj: -0.125, note: 'Best price. Tight closing timeline. Use only if ready to close within days.' },
  { days: 30, adj: 0,      note: 'Standard lock. Par pricing. Most common choice for purchase transactions.' },
  { days: 45, adj: 0.125,  note: 'Slight cost. Good for purchases with appraisal or inspection uncertainty.' },
  { days: 60, adj: 0.25,   note: 'Higher cost. Use for new construction or complex income documentation.' },
  { days: 90, adj: 0.375,  note: 'Significant premium. Extended new construction or delayed closing only.' },
];

const MARKET_TRENDS = [
  { id: 'rising',   label: 'Rising',   icon: 'up',   color: 'red',     rec: 'Lock Now',          advice: 'Rates trending higher. Lock immediately to capture current pricing before further increases. Every day of delay risks a higher payment.' },
  { id: 'falling',  label: 'Falling',  icon: 'down', color: 'emerald', rec: 'Consider Float',    advice: 'Rates trending down. Consider floating to capture lower rates. Only viable if your timeline allows and you can tolerate risk of a reversal.' },
  { id: 'sideways', label: 'Sideways', icon: 'flat', color: 'blue',    rec: 'Lock at Milestone', advice: 'Rates stable. Lock when appraisal is in and file is ready to submit. No benefit to waiting; no urgency either.' },
  { id: 'volatile', label: 'Volatile', icon: 'bolt', color: 'amber',   rec: 'Lock ASAP',         advice: 'High volatility. Rates can move sharply in either direction within hours. Lock to eliminate uncertainty and protect the borrower.' },
];

const BUYDOWN_OPTIONS = [
  { id: '2_1',       label: '2-1 Buydown',                yr1: 2, yr2: 1, note: 'Rate 2% below note in Year 1, 1% below in Year 2, then note rate from Year 3+. Seller-funded; counts against concession limits.' },
  { id: '1_0',       label: '1-0 Buydown',                yr1: 1, yr2: 0, note: 'Rate 1% below note in Year 1, then note rate from Year 2+. Lower subsidy cost than 2-1.' },
  { id: 'permanent', label: 'Permanent (Discount Points)', yr1: null, yr2: null, note: 'Pay points upfront to permanently reduce the rate for the life of the loan. Best for long-term hold.' },
];

const GLOSSARY = [
  { term: 'Note Rate',        icon: '📊', definition: 'The actual interest rate on the loan — what the borrower agreed to pay. This is distinct from the APR, which includes fees.', example: 'If the loan is at 7.000%, that is the note rate. The monthly P&I is calculated from this number.', highlight: false },
  { term: 'Lock Period',      icon: '🔒', definition: 'The number of days the lender guarantees your interest rate. After expiration, the rate must be re-locked, often at a worse price.', example: 'A 30-day lock means the rate is guaranteed for 30 days from today. If closing takes 35 days, the lock must be extended at additional cost.', highlight: true },
  { term: 'Lock Adjustment',  icon: '⚙️', definition: 'A pricing adjustment applied based on lock period length. Shorter locks = better pricing. Longer locks = worse pricing.', example: 'A 15-day lock might be -0.125% (cheaper). A 60-day lock might be +0.250% (more expensive).', highlight: false },
  { term: 'Par Rate',         icon: '⚖️', definition: 'The interest rate at which the lender neither charges points nor pays a credit. Below par = borrower pays points. Above par = lender pays a credit.', example: 'If par rate is 6.875%, pricing at 7.000% is 0.125% above par and generates a lender credit toward closing costs.', highlight: true },
  { term: 'Lender Credit',    icon: '💰', definition: 'Cash the lender pays toward closing costs in exchange for the borrower accepting a higher-than-par interest rate. Reduces cash to close but increases the monthly payment permanently.', example: 'Pricing 0.375% above par at 0.5% per 0.125% bump = 1.5% credit. On a $400K loan that is $6,000 toward closing costs.', highlight: true },
  { term: 'Float vs Lock',    icon: '🎯', definition: 'Float = keep the rate unlocked hoping it improves. Lock = guarantee the current rate. Floating carries risk of rate increases; locking eliminates market risk.', example: 'Floating in a rising market = gambling. Locking in a volatile market = removing uncertainty. Right choice depends on market trend and risk tolerance.', highlight: false },
  { term: '2-1 Buydown',      icon: '📉', definition: 'A seller-funded temporary rate reduction. Rate is 2% below note in Year 1, 1% below in Year 2, then at full note rate from Year 3 onward.', example: 'Note rate 7%. Year 1: 5%, Year 2: 6%, Year 3+: 7%. Seller funds the subsidy at closing — held in escrow by servicer.', highlight: false },
  { term: 'Float-Down Option', icon: '⬇️', definition: 'A provision allowing the borrower to drop their locked rate once if market rates fall below their lock. Usually costs a fee with a one-time trigger window.', example: 'Locked at 7.000%. Rates drop to 6.750%. Float-down lets borrower capture 6.750% without re-locking. Window typically 5-10 days before closing.', highlight: false },
];

const WHEN_TO_USE = [
  { scenario: 'Rate Lock Decision',        icon: '🔒', color: 'blue',   description: 'Deciding when and how long to lock. Model the cost difference between lock periods and make a data-driven recommendation.', tip: 'Always show the borrower the dollar impact of a 45 vs 30 day lock — the difference is often only $15-30/mo, but they need to see it.' },
  { scenario: 'Pricing Optimization',      icon: '💹', color: 'emerald', description: 'Borrower is short on cash to close. Use the lender credit engine to show exactly how much a higher rate generates.', tip: 'Model the monthly cost of taking a lender credit vs the cash savings. Let the borrower decide with real numbers.' },
  { scenario: 'Seller Buydown Negotiation', icon: '🏠', color: 'violet', description: 'Seller is offering concessions. Model a 2-1 or 1-0 buydown to show year-by-year payment savings.', tip: 'A $10,000 seller concession as a 2-1 buydown often provides more perceived value than a $10,000 price reduction.' },
  { scenario: 'Float vs Lock Analysis',    icon: '📈', color: 'amber',  description: 'Borrower wants to wait for rates to drop. Document your recommendation and show the risk/reward of floating.', tip: 'Save the AI market analysis to Decision Record. This protects you if rates move against the borrower after they chose to float.' },
];

function calcPI(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}
const fmtD   = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmt0   = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n) => isNaN(n) ? '--' : Number(n).toFixed(3) + '%';

function addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─── Letter Builder ───────────────────────────────────────────────────────────
function buildRateLetter(type, borrowerName, scenarioName, loanAmount, noteRate, lockPeriod, lockAdj, adjustedRate, adjustedPI, marketTrend, trendRec, aiAnalysis, lenderCreditAmt, buydown, yr1PI, yr2PI, currentPI, buydownCostNum, totalSubsidy, buydownBreakeven, floatDownOption, rateLockDate, expirationDate) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const trendObj = MARKET_TRENDS.find((t) => t.id === marketTrend);
  const lines = [];
  lines.push(today); lines.push('');
  if (type === 'borrower') {
    lines.push('Dear ' + (borrowerName || 'Valued Client') + ','); lines.push('');
    lines.push('RE: Rate Lock Strategy and Pricing Analysis - ' + (scenarioName || 'Your Home Purchase')); lines.push('');
    lines.push('I have completed a comprehensive rate analysis for your loan. This letter summarizes my recommendations on rate lock timing, pricing strategy, and any buydown options we discussed.'); lines.push('');
    lines.push('YOUR LOAN DETAILS');
    lines.push('Loan Amount: ' + fmt0(loanAmount));
    lines.push('Note Rate: ' + fmtPct(noteRate));
    lines.push('Lock Period: ' + lockPeriod + ' days');
    lines.push('Adjusted Rate (with lock pricing): ' + fmtPct(adjustedRate));
    lines.push('Monthly P&I at locked rate: ' + fmtD(adjustedPI));
    if (rateLockDate) lines.push('Lock Date: ' + rateLockDate);
    if (expirationDate) lines.push('Lock Expiration: ' + expirationDate);
    lines.push('');
    if (trendObj) {
      lines.push('MARKET ANALYSIS AND LOCK RECOMMENDATION');
      lines.push('Current Market Condition: ' + trendObj.label);
      lines.push('My Recommendation: ' + trendObj.rec); lines.push('');
      lines.push('Rationale: ' + trendObj.advice);
      if (aiAnalysis && aiAnalysis.summary) { lines.push(''); lines.push('Current Market Data:'); lines.push(aiAnalysis.summary); }
      lines.push('');
    }
    if (lockAdj !== 0) {
      lines.push('LOCK PERIOD PRICING IMPACT');
      lines.push('A ' + lockPeriod + '-day lock carries a ' + (lockAdj > 0 ? '+' : '') + lockAdj + '% rate adjustment.');
      lines.push('This changes your rate from ' + fmtPct(noteRate) + ' to ' + fmtPct(adjustedRate) + ', adding ' + fmtD(adjustedPI - calcPI(loanAmount, noteRate, 360)) + '/month to your payment.');
      lines.push('Compared to a standard 30-day lock, this extra time adds certainty to your closing timeline.'); lines.push('');
    }
    if (lenderCreditAmt > 0) {
      lines.push('LENDER CREDIT');
      lines.push('By pricing your rate slightly above par, the lender will contribute ' + fmt0(lenderCreditAmt) + ' toward your closing costs.');
      lines.push('This reduces your cash needed at closing. The tradeoff is a slightly higher monthly payment over the life of the loan.'); lines.push('');
    }
    if (buydown && yr1PI > 0) {
      lines.push('RATE BUYDOWN ANALYSIS (' + buydown.label + ')');
      lines.push('Year 1 Payment: ' + fmtD(yr1PI) + '/month (saves ' + fmtD(currentPI - yr1PI) + '/month)');
      if (yr2PI > 0) lines.push('Year 2 Payment: ' + fmtD(yr2PI) + '/month (saves ' + fmtD(currentPI - yr2PI) + '/month)');
      lines.push('Year 3+ Payment: ' + fmtD(currentPI) + '/month (full note rate)');
      lines.push('Total Subsidy Value: ' + fmt0(totalSubsidy));
      if (buydownBreakeven) lines.push('Break-Even: ' + buydownBreakeven + ' months'); lines.push('');
    }
    if (floatDownOption) {
      lines.push('FLOAT-DOWN OPTION');
      lines.push('You have requested a float-down option. This allows your rate to drop once if market rates fall below your locked rate before closing. There is typically a fee for this option and a one-time trigger window (usually 5-10 business days before closing). I will monitor rates and notify you if a float-down opportunity arises.'); lines.push('');
    }
    lines.push('IMPORTANT REMINDERS');
    lines.push('* Your rate lock expires on ' + (expirationDate || 'the date shown above') + '. Contact me immediately if your closing may be delayed.');
    lines.push('* These figures reflect principal and interest only. Your full payment includes taxes, insurance, and any mortgage insurance.');
    lines.push('* Discount points paid may be tax-deductible. Please consult your tax advisor.'); lines.push('');
    lines.push('I am here to monitor the market and keep you informed. Please reach out with any questions.'); lines.push('');
    lines.push('Warm regards,');
  } else {
    lines.push('Dear Realtor Partner,'); lines.push('');
    lines.push('RE: Rate Lock Strategy for ' + (borrowerName || 'Your Buyer') + ' - ' + (scenarioName || 'Active Transaction')); lines.push('');
    lines.push('I wanted to share the rate lock analysis for your buyer so we can coordinate the closing timeline and use the pricing data strategically in any remaining negotiations.'); lines.push('');
    lines.push('CURRENT RATE LOCK STATUS');
    lines.push('Note Rate: ' + fmtPct(noteRate));
    lines.push('Lock Period: ' + lockPeriod + ' days');
    if (rateLockDate) lines.push('Locked: ' + rateLockDate);
    if (expirationDate) lines.push('Expires: ' + expirationDate + ' -- closing MUST occur before this date'); lines.push('');
    if (trendObj) {
      lines.push('MARKET ASSESSMENT');
      lines.push('Current Market: ' + trendObj.label + ' -- ' + trendObj.rec);
      if (aiAnalysis && aiAnalysis.summary) { lines.push(''); lines.push(aiAnalysis.summary); }
      lines.push('');
    }
    lines.push('WHY THE LOCK EXPIRATION DATE MATTERS');
    lines.push('If closing is delayed past ' + (expirationDate || 'the lock expiration date') + ', I will need to extend or re-lock the rate. In a ' + (trendObj ? trendObj.label.toLowerCase() : 'current') + ' market, a re-lock could mean a higher rate for your buyer.');
    lines.push('* A 15-day extension typically costs +0.125% to the rate or a fee.');
    lines.push('* Please confirm the closing date with the title company as soon as possible.');
    lines.push('* Let me know immediately of any delays -- I need at least 48 hours notice to explore options.'); lines.push('');
    if (buydown && yr1PI > 0) {
      lines.push('SELLER CONCESSION OPPORTUNITY -- RATE BUYDOWN');
      lines.push('If the seller has any remaining concession capacity, a ' + buydown.label + ' would deliver significant value to your buyer:');
      lines.push('Year 1 savings: ' + fmtD(currentPI - yr1PI) + '/month (' + fmt0((currentPI - yr1PI) * 12) + '/year)');
      if (yr2PI > 0) lines.push('Year 2 savings: ' + fmtD(currentPI - yr2PI) + '/month');
      lines.push('Total subsidy value: ' + fmt0(totalSubsidy));
      lines.push('This is often more impactful than an equivalent price reduction, as it directly reduces the monthly payment the borrower qualifies on.'); lines.push('');
    }
    lines.push("Let's coordinate to make sure we close on time and in the best possible position for your buyer."); lines.push('');
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
    <div onClick={() => setOpen((v) => !v)}
      className={'rounded-2xl border cursor-pointer transition-all overflow-hidden ' + (highlight ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl">{icon}</span>
        <span className={'text-sm font-bold ' + (highlight ? 'text-amber-800' : 'text-slate-700')}>{term}</span>
        {highlight && <span className="ml-1 text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Key Term</span>}
        <span className="text-slate-400 text-xs ml-auto">{open ? '▲' : '▼'}</span>
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

function LockTimeline({ lockDate, expirationDate, days }) {
  if (!lockDate || !expirationDate) return null;
  const start = new Date(lockDate);
  const end = new Date(expirationDate);
  const today = new Date();
  const total = end - start;
  const elapsed = today - start;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  const expired = daysLeft < 0;
  const urgent = daysLeft <= 5 && !expired;
  return (
    <div className={'rounded-2xl border p-4 mt-4 ' + (expired ? 'bg-red-50 border-red-300' : urgent ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200')}>
      <div className="flex justify-between text-xs mb-2">
        <span className="font-semibold text-slate-600">Locked: {start.toLocaleDateString()}</span>
        <span className={'font-bold ' + (expired ? 'text-red-600' : urgent ? 'text-amber-600' : 'text-slate-600')}>
          {expired ? 'EXPIRED' : daysLeft + ' days remaining'}
        </span>
        <span className="font-semibold text-slate-600">Expires: {end.toLocaleDateString()}</span>
      </div>
      <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
        <div className={'absolute inset-y-0 left-0 rounded-full ' + (expired ? 'bg-red-500' : urgent ? 'bg-amber-500' : 'bg-blue-500')} style={{ width: pct + '%' }} />
      </div>
      <p className={'text-xs mt-1.5 font-medium ' + (expired ? 'text-red-600' : urgent ? 'text-amber-600' : 'text-slate-500')}>
        {expired ? 'Lock has expired — re-lock required immediately.' : urgent ? 'Lock expiring soon — confirm closing date and extend if needed.' : days + '-day lock · ' + Math.round(pct) + '% of lock period elapsed'}
      </p>
    </div>
  );
}

function RateLetter({ borrowerName, scenarioName, loanAmount, noteRate, lockPeriod, lockAdj, adjustedRate, adjustedPI, marketTrend, aiAnalysis, lenderCreditAmt, buydown, yr1PI, yr2PI, currentPI, buydownCostNum, totalSubsidy, buydownBreakeven, floatDownOption, rateLockDate, expirationDate }) {
  const [letterType, setLetterType] = useState('borrower');
  const [copied, setCopied] = useState(false);
  const trendObj = MARKET_TRENDS.find((t) => t.id === marketTrend);
  const letterText = buildRateLetter(letterType, borrowerName, scenarioName, loanAmount, noteRate, lockPeriod, lockAdj, adjustedRate, adjustedPI, marketTrend, trendObj ? trendObj.rec : '', aiAnalysis, lenderCreditAmt, buydown, yr1PI, yr2PI, currentPI, buydownCostNum, totalSubsidy, buydownBreakeven, floatDownOption, rateLockDate, expirationDate);
  const handleCopy = () => { navigator.clipboard.writeText(letterText); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Communication Tools</div>
          <h3 className="text-xl font-bold text-white">Borrower & Realtor Letters</h3>
          <p className="text-slate-400 text-sm mt-0.5">Auto-generated from your analysis. Review before sending.</p>
        </div>
        <span className="text-3xl">✉️</span>
      </div>
      <div className="p-8 space-y-5">
        <div className="flex gap-2">
          {[['borrower', 'Borrower Letter'], ['realtor', 'Realtor Letter']].map(([val, label]) => (
            <button key={val} onClick={() => setLetterType(val)}
              className={'px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ' + (letterType === val ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400')}>
              {label}
            </button>
          ))}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{letterText}</pre>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCopy}
            className={'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold ' + (copied ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white')}>
            {copied ? 'Copied!' : 'Copy Letter'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl">Print</button>
        </div>
        <p className="text-xs text-slate-400">Review and personalize before sending. Rate figures reflect current analysis inputs.</p>
      </div>
    </div>
  );
}

// ─── Decision Record Banner (inline — green state + NSI pill) ─────────────────
function DRBanner({ savedRecordId, saving, onSave, nsiSuggestion, onNsiNavigate }) {
  const isSaved = Boolean(savedRecordId);
  return (
    <div style={{
      background:   isSaved ? '#f0fdf4' : '#ffffff',
      borderBottom: isSaved ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
      padding:      '10px 32px',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      flexWrap:     'wrap',
      transition:   'background 0.3s, border-color 0.3s',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: isSaved ? '#dcfce7' : '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.3s',
      }}>
        {isSaved
          ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="#475569" strokeWidth="1.4"/><path d="M5 8h6M5 5.5h6M5 10.5h3.5" stroke="#475569" strokeWidth="1.2" strokeLinecap="round"/></svg>
        }
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: isSaved ? '#14532d' : '#1e293b', margin: 0 }}>
          {isSaved ? 'Decision Record — Saved ✓' : 'Decision Record'}
        </p>
        <p style={{ fontSize: 11, color: isSaved ? '#16a34a' : '#94a3b8', margin: 0 }}>
          {isSaved ? 'RATE INTEL findings logged to audit trail' : 'Save RATE INTEL findings to your audit trail'}
        </p>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isSaved && nsiSuggestion?.path && (
          <button onClick={() => onNsiNavigate(nsiSuggestion.path)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11h10" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Next Suggested Action</p>
              <p style={{ fontSize: 11, color: '#1e40af', fontWeight: 500, margin: 0 }}>{nsiSuggestion.moduleLabel || nsiSuggestion.moduleName}</p>
            </div>
            <span style={{ fontSize: 12, color: '#3b82f6' }}>→</span>
          </button>
        )}
        <button
          onClick={!isSaved && !saving ? onSave : undefined}
          disabled={isSaved || saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isSaved ? '#16a34a' : '#0f172a',
            color: '#f8fafc', border: 'none', borderRadius: 6,
            padding: '7px 15px', fontSize: 11, fontWeight: 600,
            cursor: isSaved ? 'default' : 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            opacity: saving ? 0.7 : 1, transition: 'background 0.3s',
          }}
        >
          {isSaved
            ? <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> Saved</>
            : saving ? 'Saving…'
            : <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="#f8fafc" strokeWidth="1.3"/><path d="M4.5 7l2 2 3.5-3.5" stroke="#f8fafc" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> Save to Decision Record</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RateIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);
  const [findingsReported, setFindingsReported] = useState(false);

  const [scenario,     setScenario]    = useState(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [loading,      setLoading]     = useState(!!scenarioId);
  const [scenarios,    setScenarios]   = useState([]);
  const [search,       setSearch]      = useState('');
  const [showAll,      setShowAll]     = useState(false);
  const [showGuide,    setShowGuide]   = useState(true);

  const [loanAmount,    setLoanAmount]    = useState('');
  const [noteRate,      setNoteRate]      = useState('');
  const [termMonths,    setTermMonths]    = useState('360');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [lockPeriod,    setLockPeriod]    = useState(30);
  const [marketTrend,   setMarketTrend]   = useState('');
  const [parRate,       setParRate]       = useState('');
  const [creditPerBump, setCreditPerBump] = useState('');
  const [selectedBuydown, setSelectedBuydown] = useState('');
  const [buydownCost,   setBuydownCost]   = useState('');
  const [floatDownOption, setFloatDownOption] = useState(false);
  const [rateLockDate,  setRateLockDate]  = useState('');
  const [expirationDate,setExpirationDate]= useState('');
  const [notes,         setNotes]         = useState('');

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysis,  setAiAnalysis]  = useState(null);
  const [aiError,     setAiError]     = useState('');

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then((snap) => setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then((snap) => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        if (d.loanAmount)    setLoanAmount(String(d.loanAmount));
        if (d.interestRate)  setNoteRate(String(d.interestRate));
        if (d.term)          setTermMonths(String(d.term));
        if (d.monthlyIncome) setMonthlyIncome(String(d.monthlyIncome));
        const today = todayStr();
        setRateLockDate(today);
        setExpirationDate(addDays(today, 30));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  useEffect(() => {
    if (rateLockDate) setExpirationDate(addDays(rateLockDate, lockPeriod));
  }, [rateLockDate, lockPeriod]);

  // Derived calculations
  const loan        = parseFloat(loanAmount) || 0;
  const rate        = parseFloat(noteRate)   || 0;
  const term        = parseInt(termMonths)   || 360;
  const income      = parseFloat(monthlyIncome) || 0;
  const currentPI   = calcPI(loan, rate, term);
  const lockObj     = LOCK_PERIODS.find((l) => l.days === lockPeriod) || LOCK_PERIODS[1];
  const lockAdj     = lockObj.adj;
  const adjustedRate = rate + lockAdj;
  const adjustedPI  = calcPI(loan, adjustedRate, term);
  const dti         = income > 0 && currentPI > 0 ? ((currentPI / income) * 100) : null;

  const parRateNum      = parseFloat(parRate)      || 0;
  const creditPerBumpNum = parseFloat(creditPerBump) || 0;
  const bumpsAbovePar   = parRateNum > 0 && rate > parRateNum ? (rate - parRateNum) / 0.125 : 0;
  const lenderCreditPct = bumpsAbovePar * creditPerBumpNum;
  const lenderCreditAmt = loan > 0 ? (lenderCreditPct / 100) * loan : 0;

  const buydown       = BUYDOWN_OPTIONS.find((b) => b.id === selectedBuydown);
  const buydownCostNum = parseFloat(buydownCost) || 0;
  const yr1PI         = buydown && buydown.yr1 !== null && rate > 0 ? calcPI(loan, rate - buydown.yr1, term) : 0;
  const yr2PI         = buydown && buydown.yr2 > 0  && rate > 0 ? calcPI(loan, rate - buydown.yr2, term) : 0;
  const yr1AnnualSavings = yr1PI > 0 ? (currentPI - yr1PI) * 12 : 0;
  const yr2AnnualSavings = yr2PI > 0 ? (currentPI - yr2PI) * 12 : 0;
  const totalSubsidy  = yr1AnnualSavings + yr2AnnualSavings;
  const buydownBreakeven = buydownCostNum > 0 && totalSubsidy > 0 ? Math.ceil(buydownCostNum / (totalSubsidy / 24)) : null;
  const trendObj      = MARKET_TRENDS.find((t) => t.id === marketTrend);

  // ─── NSI ────────────────────────────────────────────────────────────────────
  const rawPurpose  = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash') ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('refi') ? 'rate_term_refi'
    : 'purchase';

  const { primarySuggestion, logFollow } = useNextStepIntelligence({
    currentModuleKey:       'RATE_INTEL',
    loanPurpose,
    decisionRecordFindings: { RATE_INTEL: { noteRate: rate, lockPeriod, marketTrend } },
    scenarioData:           scenario || {},
    completedModules:       [],
    scenarioId,
    onWriteToDecisionRecord: null,
  });

  // ─── AI Market Analysis ──────────────────────────────────────────────────────
  const runMarketAnalysis = async () => {
    setAiAnalyzing(true); setAiError(''); setAiAnalysis(null);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: 'Search for the current 30-year fixed mortgage rate trend as of today. Look for: (1) current average 30-year fixed rate, (2) direction of rates this week (rising, falling, sideways, or volatile), (3) any Federal Reserve commentary or economic data driving rates, (4) MBS market conditions if available. Then provide a JSON response with this exact structure (no markdown, no backticks): {"trend":"rising|falling|sideways|volatile","currentRate":"X.XX%","weeklyChange":"+X.XXX% or -X.XXX%","verdict":"Lock Now|Consider Float|Lock at Milestone|Lock ASAP","confidence":"HIGH|MEDIUM|LOW","summary":"2-3 sentence plain English summary of current market conditions for a mortgage loan officer","dataPoints":["point 1","point 2","point 3"],"sourceDate":"today date","recommendation":"1 sentence specific recommendation for a borrower locking today"}' }],
        }),
      });
      if (!resp.ok) throw new Error('API error ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);
      setAiAnalysis(parsed);
      if (parsed.trend) setMarketTrend(parsed.trend);
      if (parsed.summary) {
        const notePrefix = 'AI Market Analysis (' + new Date().toLocaleDateString() + '): ' + parsed.summary + ' Recommendation: ' + (parsed.recommendation || parsed.verdict) + '\n\n';
        setNotes((prev) => notePrefix + (prev || ''));
      }
    } catch (err) { setAiError('Analysis failed: ' + err.message + '. Check API key or try again.'); }
    setAiAnalyzing(false);
  };

  // ─── Save to Decision Record ─────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const riskFlags = [];
      if (lockAdj > 0.25) riskFlags.push({ flagCode: 'LOCK_PERIOD_EXTENDED', sourceModule: 'RATE_INTEL', severity: 'MEDIUM', detail: 'Extended lock period adds ' + lockAdj + '% to rate' });
      if (dti && dti > 43) riskFlags.push({ flagCode: 'DTI_HIGH', sourceModule: 'RATE_INTEL', severity: 'HIGH', detail: 'P&I-only DTI at ' + dti.toFixed(1) + '% — total DTI will be higher' });
      if (marketTrend === 'rising' && !rateLockDate) riskFlags.push({ flagCode: 'RISING_MARKET_UNLOCKED', sourceModule: 'RATE_INTEL', severity: 'MEDIUM', detail: 'Rising market selected but no lock date recorded' });
      const writtenId = await reportFindings(
        'RATE_INTEL',
        {
          verdict: trendObj ? trendObj.rec : (rate > 0 ? 'Rate Analysis Complete' : 'Incomplete'),
          summary: 'Rate Intelligence — ' + (rate > 0 ? fmtPct(rate) + ' note rate' : 'no rate') + '. ' + lockPeriod + '-day lock' + (lockAdj !== 0 ? ' (' + (lockAdj > 0 ? '+' : '') + lockAdj + '%)' : ' at par') + '.' + (trendObj ? ' Market: ' + trendObj.label + '. Rec: ' + trendObj.rec + '.' : '') + (lenderCreditAmt > 0 ? ' Lender credit: ' + fmt0(lenderCreditAmt) + '.' : '') + (aiAnalysis ? ' AI analysis: ' + (aiAnalysis.verdict || '') + '.' : ''),
          noteRate: rate, adjustedRate: parseFloat(adjustedRate.toFixed(3)),
          lockPeriod, lockAdj, monthlyPI: parseFloat(currentPI.toFixed(2)),
          loanAmount: loan, termMonths: term, monthlyIncome: income,
          marketTrend: marketTrend || null,
          trendRecommendation: trendObj ? trendObj.rec : null,
          aiMarketAnalysis: aiAnalysis || null,
          parRate: parRateNum || null, lenderCreditAmt: Math.round(lenderCreditAmt),
          selectedBuydown: selectedBuydown || null, buydownCost: buydownCostNum || null,
          floatDownOption, rateLockDate: rateLockDate || null, expirationDate: expirationDate || null,
          loNotes: notes,
          completeness: { rateEntered: rate > 0, lockPeriodSet: true, marketTrendSet: !!marketTrend, aiAnalysisRun: !!aiAnalysis, lockDatesSet: !!(rateLockDate && expirationDate) },
        },
        [], riskFlags,
      );
      if (writtenId) setSavedRecordId(writtenId);
      setFindingsReported(true);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  // ─── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">🔒</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">19</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 3 — Optimization</span>
                <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-2xl font-normal text-white mt-0.5">Rate Intelligence™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Lock strategy · Pricing optimization · Buydown analysis · Float vs lock decisions. Find the optimal pricing structure for each borrower's timeline and risk tolerance.</p>
            <div className="flex flex-wrap gap-2">
              {['Rate Comparison', 'Buydown Analysis', 'Break-Even Calculator', 'Lender Credit Engine', 'Float vs Lock', 'Lock Timeline'].map(tag => (
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
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName  = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate('/rate-intel?scenarioId=' + s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType    && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">View all {filtered.length} scenarios</button>}
              {showAll && filtered.length > 5 && <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  const propertyAddress = scenario ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ') : '';
  const coBorrowerNames = scenario?.coBorrowers?.filter(cb => cb.firstName || cb.lastName).map(cb => `${cb.firstName||''} ${cb.lastName||''}`.trim()) || [];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* 1. DecisionRecordBanner FIRST */}
      <DecisionRecordBanner
        recordId={savedRecordId}
        moduleName="Rate Intelligence™"
        moduleKey="RATE_INTEL"
        onSave={handleSaveToRecord}
      />

      {/* 2. ModuleNav SECOND */}
      <ModuleNav moduleNumber={19} />

      {/* 3. Hero — flexbox */}
      <div className="bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #6366f1 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div style={{ flex: 1 }}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 19</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Rate Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl">Lock strategy · Pricing optimization · Buydown analysis · Float vs lock decisions</p>
            </div>
            {scenario && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px', flexShrink: 0 }}>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                <div className="text-slate-400 text-sm mt-1">{loan > 0 ? fmt0(loan) : ''}{rate > 0 ? ` · ${fmtPct(rate)}` : ''}{currentPI > 0 ? ` · ${fmtD(currentPI)}/mo` : ''}</div>
                {trendObj && <div className="text-indigo-300 text-xs font-bold mt-1">{trendObj.rec}</div>}
                <button onClick={() => navigate('/rate-intel')} className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 block transition-colors">Change scenario →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Borrower Bar */}
      {scenario && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName || 'Unknown Borrower'}</span>
            {coBorrowerNames.map((n, i) => <span key={i} className="text-blue-200 text-xs">+ {n}</span>)}
            {propertyAddress && <span className="text-blue-200 text-xs">{propertyAddress}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {loan > 0 && <span>Loan <strong className="text-white">{fmt0(loan)}</strong></span>}
              {rate > 0 && <span>Rate <strong className="text-white">{fmtPct(rate)}</strong></span>}
              {scenario.loanType && <span>Type <strong className="text-white">{scenario.loanType}</strong></span>}
            </div>
          </div>
        </div>
      )}

      {/* 5. ScenarioHeader */}
      <ScenarioHeader moduleTitle="Rate Intelligence™" moduleNumber="19" scenarioId={scenarioId} />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">

        {/* LO Confidence Guide */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <button onClick={() => setShowGuide((v) => !v)}
            className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg font-bold">?</div>
              <div className="text-left">
                <div className="font-bold text-slate-800 text-base">LO Confidence Guide — What Is Rate Intelligence™?</div>
                <div className="text-slate-500 text-sm">Master rate locks, pricing strategy, buydowns, and float vs lock decisions</div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">{showGuide ? '▲' : '▼'}</div>
          </button>
          {showGuide && (
            <div className="border-t border-slate-100">
              <div className="px-8 pt-6 pb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">When Should You Use This Module?</div>
                <div className="grid grid-cols-2 gap-4">
                  {WHEN_TO_USE.map((w) => {
                    const bg  = { blue: 'bg-blue-50 border-blue-200 text-blue-700', emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700', violet: 'bg-violet-50 border-violet-200 text-violet-700', amber: 'bg-amber-50 border-amber-200 text-amber-700' }[w.color];
                    const tip = { blue: 'bg-blue-100 text-blue-800', emerald: 'bg-emerald-100 text-emerald-800', violet: 'bg-violet-100 text-violet-800', amber: 'bg-amber-100 text-amber-800' }[w.color];
                    return (
                      <div key={w.scenario} className={'rounded-2xl border p-4 ' + bg}>
                        <div className="flex items-center gap-2 mb-2"><span className="text-xl">{w.icon}</span><span className="font-bold text-sm">{w.scenario}</span></div>
                        <p className="text-xs leading-relaxed mb-3 opacity-80">{w.description}</p>
                        <div className={'text-xs rounded-xl px-3 py-2 font-medium ' + tip}>💡 {w.tip}</div>
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
                  <p className="text-slate-300 text-sm leading-relaxed">"I'm going to walk you through three things: first, how long to lock your rate and what it costs; second, whether we should consider buying your rate down with seller funds; and third, whether to lock now or wait. Each decision has a real dollar impact and I'll show you exactly what it means for your payment."</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* Step 1 — Loan Details */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 1</div>
                <h2 className="text-xl font-bold text-white">Loan Details</h2>
                <p className="text-slate-400 text-sm mt-1">Auto-populated from your scenario. Edit if needed.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Loan Amount ($)',   val: loanAmount,    set: setLoanAmount,    ph: '310500' },
                    { label: 'Note Rate (%)',      val: noteRate,      set: setNoteRate,      ph: '7.125'  },
                    { label: 'Term (months)',      val: termMonths,    set: setTermMonths,    ph: '360'    },
                    { label: 'Monthly Income ($)', val: monthlyIncome, set: setMonthlyIncome, ph: '8500'   },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{f.label}</label>
                      <input type="number" value={f.val} placeholder={f.ph} onChange={(e) => f.set(e.target.value)}
                        className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-indigo-400 bg-slate-50" />
                    </div>
                  ))}
                </div>
                {currentPI > 0 && (
                  <div className="bg-slate-900 rounded-2xl px-6 py-4 grid grid-cols-3 gap-4">
                    <div className="text-center"><div className="text-xs text-slate-400 mb-1">Monthly P&amp;I</div><div className="text-2xl font-black text-white">{fmtD(currentPI)}</div></div>
                    <div className="text-center border-x border-slate-700"><div className="text-xs text-slate-400 mb-1">Annual P&amp;I</div><div className="text-2xl font-black text-white">{fmt0(currentPI * 12)}</div></div>
                    <div className="text-center"><div className="text-xs text-slate-400 mb-1">P&amp;I-Only DTI</div><div className={'text-2xl font-black ' + (dti && dti > 43 ? 'text-red-400' : dti ? 'text-emerald-400' : 'text-slate-400')}>{dti ? dti.toFixed(1) + '%' : '--'}</div></div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2 — Market Trend + AI */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 2</div>
                <h2 className="text-xl font-bold text-white">Market Trend & Float vs Lock</h2>
                <p className="text-slate-400 text-sm mt-1">Run a live AI market analysis or select manually. Your choice is logged in the Decision Record.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-2xl p-6 border border-indigo-800/40">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div>
                      <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">AI Market Intelligence</div>
                      <div className="text-white font-bold">Live Rate Environment Analysis</div>
                      <div className="text-slate-400 text-xs mt-0.5">Searches current mortgage rate data and recommends Lock or Float</div>
                    </div>
                    <button onClick={runMarketAnalysis} disabled={aiAnalyzing}
                      className={'flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all ' + (aiAnalyzing ? 'bg-indigo-800 text-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white')}>
                      {aiAnalyzing ? <><span className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin inline-block" /> Analyzing Market...</> : <>🔍 Run Live Market Analysis</>}
                    </button>
                  </div>
                  {aiError && <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-xs text-red-300">{aiError}</div>}
                  {!aiAnalysis && !aiAnalyzing && !aiError && (
                    <div className="bg-slate-800/40 rounded-xl px-4 py-3 text-xs text-slate-400">
                      Click "Run Live Market Analysis" to search current mortgage rate data, MBS market conditions, and Fed commentary. The AI will auto-select the market trend below and pre-fill your LO Notes with the analysis.
                    </div>
                  )}
                  {aiAnalysis && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          ['Current Rate', aiAnalysis.currentRate || '--', 'text-white'],
                          ['Weekly Change', aiAnalysis.weeklyChange || '--', aiAnalysis.weeklyChange && aiAnalysis.weeklyChange.startsWith('+') ? 'text-red-400' : 'text-emerald-400'],
                          ['Trend', aiAnalysis.trend ? aiAnalysis.trend.charAt(0).toUpperCase() + aiAnalysis.trend.slice(1) : '--', 'text-indigo-300'],
                          ['Confidence', aiAnalysis.confidence || '--', aiAnalysis.confidence === 'HIGH' ? 'text-emerald-400' : aiAnalysis.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-red-400'],
                        ].map(([label, val, color]) => (
                          <div key={label} className="bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-xs text-slate-400 mb-1">{label}</div>
                            <div className={'font-black text-sm ' + color}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-slate-800/40 rounded-xl px-4 py-3">
                        <div className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">AI Assessment</div>
                        <p className="text-slate-300 text-sm leading-relaxed">{aiAnalysis.summary}</p>
                      </div>
                      {aiAnalysis.dataPoints && aiAnalysis.dataPoints.length > 0 && (
                        <div className="space-y-1">
                          {aiAnalysis.dataPoints.map((pt, i) => (
                            <div key={i} className="flex gap-2 text-xs text-slate-400"><span className="text-indigo-400 shrink-0">•</span><span>{pt}</span></div>
                          ))}
                        </div>
                      )}
                      <div className={'rounded-xl px-4 py-3 border ' + (aiAnalysis.verdict === 'Lock Now' || aiAnalysis.verdict === 'Lock ASAP' ? 'bg-red-900/20 border-red-700/40' : aiAnalysis.verdict === 'Consider Float' ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-amber-900/20 border-amber-700/40')}>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">AI Recommendation</div>
                        <div className={'text-xl font-black ' + (aiAnalysis.verdict === 'Lock Now' || aiAnalysis.verdict === 'Lock ASAP' ? 'text-red-300' : aiAnalysis.verdict === 'Consider Float' ? 'text-emerald-300' : 'text-amber-300')}>{aiAnalysis.verdict}</div>
                        {aiAnalysis.recommendation && <p className="text-xs text-slate-400 mt-1">{aiAnalysis.recommendation}</p>}
                      </div>
                      <p className="text-xs text-slate-500">Analysis run: {aiAnalysis.sourceDate || new Date().toLocaleDateString()} · Market trend and LO Notes auto-populated below</p>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Market Trend Selection {aiAnalysis ? '(auto-selected from AI — adjust if needed)' : '(select manually or run AI above)'}</div>
                  <div className="grid grid-cols-2 gap-4">
                    {MARKET_TRENDS.map((t) => {
                      const sel = marketTrend === t.id;
                      const colors    = { red: 'border-red-400 bg-red-50', emerald: 'border-emerald-400 bg-emerald-50', blue: 'border-blue-400 bg-blue-50', amber: 'border-amber-400 bg-amber-50' }[t.color];
                      const recColors = { red: 'bg-red-200 text-red-800', emerald: 'bg-emerald-200 text-emerald-800', blue: 'bg-blue-200 text-blue-800', amber: 'bg-amber-200 text-amber-800' }[t.color];
                      const icons     = { up: '📈', down: '📉', flat: '↔️', bolt: '⚡' };
                      return (
                        <button key={t.id} onClick={() => setMarketTrend(sel ? '' : t.id)}
                          className={'rounded-2xl border-2 p-5 text-left transition-all ' + (sel ? colors : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{icons[t.icon]}</span>
                              <span className="font-bold text-slate-800">{t.label}</span>
                            </div>
                            {sel && <span className={'text-xs font-black px-2 py-1 rounded-lg ' + recColors}>{t.rec}</span>}
                          </div>
                          {sel ? <p className="text-xs text-slate-600 leading-relaxed mt-2">{t.advice}</p> : <p className="text-xs text-slate-400">{t.rec}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 — Lock Period */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 3</div>
                <h2 className="text-xl font-bold text-white">Rate Lock Period</h2>
                <p className="text-slate-400 text-sm mt-1">Select lock length — expiration date auto-calculates from today.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-5 gap-3">
                  {LOCK_PERIODS.map((lp) => {
                    const sel = lockPeriod === lp.days;
                    return (
                      <button key={lp.days} onClick={() => setLockPeriod(lp.days)}
                        className={'rounded-2xl border-2 p-4 text-center transition-all ' + (sel ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300')}>
                        <div className={'text-lg font-black ' + (sel ? 'text-indigo-700' : 'text-slate-700')}>{lp.days}d</div>
                        <div className={'text-xs font-bold mt-1 ' + (lp.adj > 0 ? 'text-red-500' : lp.adj < 0 ? 'text-emerald-500' : 'text-slate-400')}>
                          {lp.adj > 0 ? '+' + lp.adj + '%' : lp.adj < 0 ? lp.adj + '%' : 'Par'}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{lockPeriod}-Day Lock Details</div>
                  <p className="text-sm text-slate-600 mb-3">{lockObj.note}</p>
                  {rate > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl p-3 text-center border border-slate-200">
                        <div className="text-xs text-slate-400 mb-1">Adjusted Rate</div>
                        <div className={'text-xl font-black ' + (lockAdj > 0 ? 'text-amber-600' : lockAdj < 0 ? 'text-emerald-600' : 'text-slate-800')}>{fmtPct(adjustedRate)}</div>
                        <div className="text-xs text-slate-400">{lockAdj === 0 ? 'par' : (lockAdj > 0 ? '+' : '') + lockAdj + '% adj'}</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center border border-slate-200">
                        <div className="text-xs text-slate-400 mb-1">Adjusted P&amp;I</div>
                        <div className={'text-xl font-black ' + (lockAdj > 0 ? 'text-amber-600' : lockAdj < 0 ? 'text-emerald-600' : 'text-slate-800')}>{fmtD(adjustedPI)}</div>
                        <div className="text-xs text-slate-400">/month</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center border border-slate-200">
                        <div className="text-xs text-slate-400 mb-1">vs 30-Day Lock</div>
                        <div className={'text-xl font-black ' + (adjustedPI > currentPI ? 'text-red-500' : adjustedPI < currentPI ? 'text-emerald-600' : 'text-slate-800')}>
                          {lockAdj === 0 ? 'Baseline' : (adjustedPI > currentPI ? '+' : '') + fmtD(adjustedPI - currentPI)}
                        </div>
                        <div className="text-xs text-slate-400">{lockAdj === 0 ? 'par pricing' : '/month'}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Lock Date</label>
                    <input type="date" value={rateLockDate} onChange={(e) => setRateLockDate(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Expiration Date <span className="text-indigo-400 font-normal normal-case">(auto-calculated)</span></label>
                    <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)}
                      className="w-full border-2 border-indigo-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold" />
                  </div>
                </div>
                <LockTimeline lockDate={rateLockDate} expirationDate={expirationDate} days={lockPeriod} />
                <label className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl cursor-pointer">
                  <input type="checkbox" checked={floatDownOption} onChange={(e) => setFloatDownOption(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Float-Down Option Requested</div>
                    <div className="text-xs text-slate-500 mt-0.5">Allows rate to drop once if market improves. Costs a fee. One-time trigger window.</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Step 4 — Lender Credit */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 4 — Optional</div>
                <h2 className="text-xl font-bold text-white">Above-Par Pricing / Lender Credit</h2>
                <p className="text-slate-400 text-sm mt-1">Price above par to generate cash toward closing costs.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4">
                  <p className="text-xs text-indigo-700 leading-relaxed"><strong>How it works:</strong> If par rate is 6.875% and you price at 7.000% (0.125% above par), the lender pays a credit toward closing costs. Borrower gets cash to close but pays a higher rate permanently.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Par Rate (%)</label>
                    <input type="number" step="0.125" value={parRate} placeholder="6.875" onChange={(e) => setParRate(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                    <p className="text-xs text-slate-400 mt-1">Rate at which lender neither charges nor pays</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Credit % per 0.125% Bump</label>
                    <input type="number" step="0.125" value={creditPerBump} placeholder="0.500" onChange={(e) => setCreditPerBump(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                    <p className="text-xs text-slate-400 mt-1">From your pricing sheet — typically 0.375–0.625%</p>
                  </div>
                </div>
                {lenderCreditAmt > 0 && (
                  <div className="bg-gradient-to-br from-emerald-900 to-slate-900 rounded-2xl p-6">
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4">Lender Credit Result</div>
                    <div className="grid grid-cols-3 gap-4 text-center mb-4">
                      <div><div className="text-xs text-slate-400 mb-1">Bumps Above Par</div><div className="text-2xl font-black text-white">{bumpsAbovePar.toFixed(1)}</div></div>
                      <div><div className="text-xs text-slate-400 mb-1">Total Credit %</div><div className="text-2xl font-black text-emerald-400">{lenderCreditPct.toFixed(3)}%</div></div>
                      <div><div className="text-xs text-slate-400 mb-1">Lender Credit</div><div className="text-3xl font-black text-emerald-400">{fmt0(lenderCreditAmt)}</div></div>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl px-4 py-3">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Monthly cost: <strong className="text-amber-400">{fmtD(calcPI(loan, rate, term) - calcPI(loan, parRateNum, term))}/mo more</strong> vs par rate. Over 60 months this credit costs <strong className="text-amber-400">{fmt0((calcPI(loan, rate, term) - calcPI(loan, parRateNum, term)) * 60)}</strong> in extra payments.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 5 — Buydown */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Step 5 — Optional</div>
                <h2 className="text-xl font-bold text-white">Rate Buydown Analysis</h2>
                <p className="text-slate-400 text-sm mt-1">Model temporary or permanent buydowns. Great for seller concession negotiations.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  {BUYDOWN_OPTIONS.map((b) => {
                    const sel = selectedBuydown === b.id;
                    return (
                      <button key={b.id} onClick={() => setSelectedBuydown(sel ? '' : b.id)}
                        className={'rounded-2xl border-2 p-5 text-left transition-all ' + (sel ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300')}>
                        <div className={'text-sm font-bold mb-2 ' + (sel ? 'text-indigo-700' : 'text-slate-700')}>{b.label}</div>
                        <p className="text-xs text-slate-500 leading-relaxed">{b.note.substring(0, 80)}...</p>
                      </button>
                    );
                  })}
                </div>
                {selectedBuydown && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Buydown Cost / Subsidy Amount ($)</label>
                      <input type="number" value={buydownCost} placeholder="e.g. 8500 — seller-funded at closing" onChange={(e) => setBuydownCost(e.target.value)}
                        className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                      <p className="text-xs text-slate-400 mt-1">Usually seller-funded. Counts against concession limits (FHA/USDA: 6%, VA: 4%, Conv: 3-9%).</p>
                    </div>
                    {buydown && buydown.yr1 !== null && rate > 0 && loan > 0 && (
                      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-6">
                        <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-5">Payment Schedule</div>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div className="bg-slate-800/60 rounded-2xl p-4 text-center">
                            <div className="text-xs text-slate-400 mb-1">Year 1</div>
                            <div className="text-xs text-indigo-300 mb-2">{fmtPct(rate - buydown.yr1)} rate</div>
                            <div className="text-2xl font-black text-white">{fmtD(yr1PI)}</div>
                            <div className="text-xs text-emerald-400 mt-1">Save {fmtD(currentPI - yr1PI)}/mo</div>
                            <div className="text-xs text-emerald-400">{fmt0(yr1AnnualSavings)}/yr</div>
                          </div>
                          {buydown.yr2 > 0
                            ? <div className="bg-slate-800/60 rounded-2xl p-4 text-center">
                                <div className="text-xs text-slate-400 mb-1">Year 2</div>
                                <div className="text-xs text-indigo-300 mb-2">{fmtPct(rate - buydown.yr2)} rate</div>
                                <div className="text-2xl font-black text-white">{fmtD(yr2PI)}</div>
                                <div className="text-xs text-emerald-400 mt-1">Save {fmtD(currentPI - yr2PI)}/mo</div>
                                <div className="text-xs text-emerald-400">{fmt0(yr2AnnualSavings)}/yr</div>
                              </div>
                            : <div className="bg-slate-700/30 rounded-2xl p-4 text-center flex items-center justify-center"><span className="text-slate-500 text-xs">No Year 2 reduction</span></div>
                          }
                          <div className="bg-slate-800/60 rounded-2xl p-4 text-center">
                            <div className="text-xs text-slate-400 mb-1">Year 3+</div>
                            <div className="text-xs text-slate-400 mb-2">{fmtPct(rate)} note rate</div>
                            <div className="text-2xl font-black text-white">{fmtD(currentPI)}</div>
                            <div className="text-xs text-slate-400 mt-1">Full note rate</div>
                          </div>
                        </div>
                        <div className="bg-slate-800/40 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3">
                          <div><span className="text-xs text-slate-400">Total subsidy: </span><span className="text-emerald-400 font-black">{fmt0(totalSubsidy)}</span></div>
                          {buydownBreakeven && <div><span className="text-xs text-slate-400">Break-even: </span><span className="text-white font-black">{buydownBreakeven} months</span></div>}
                          {buydownCostNum > 0 && totalSubsidy > 0 && <div><span className="text-xs text-slate-400">Covers: </span><span className={'font-black ' + (totalSubsidy >= buydownCostNum ? 'text-emerald-400' : 'text-amber-400')}>{((totalSubsidy / buydownCostNum) * 100).toFixed(0)}% of cost</span></div>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* LO Notes — save button removed (DRBanner handles it) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <h2 className="text-xl font-bold text-white">LO Notes</h2>
                <p className="text-slate-400 text-sm mt-1">Document your lock strategy, market read, and pricing rationale. Logged in Decision Record.</p>
              </div>
              <div className="p-8">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
                  placeholder="Rate lock strategy, pricing decisions, market commentary, buydown justification, borrower instructions..."
                  className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              </div>
            </div>

            {/* Letters */}
            <RateLetter
              borrowerName={borrowerName} scenarioName={scenario?.scenarioName}
              loanAmount={loan} noteRate={rate} lockPeriod={lockPeriod} lockAdj={lockAdj}
              adjustedRate={adjustedRate} adjustedPI={adjustedPI} marketTrend={marketTrend}
              aiAnalysis={aiAnalysis} lenderCreditAmt={lenderCreditAmt} buydown={buydown}
              yr1PI={yr1PI} yr2PI={yr2PI} currentPI={currentPI} buydownCostNum={buydownCostNum}
              totalSubsidy={totalSubsidy} buydownBreakeven={buydownBreakeven}
              floatDownOption={floatDownOption} rateLockDate={rateLockDate} expirationDate={expirationDate}
            />
          </div>

          {/* Right Panel */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Rate Summary</div>
              <div className="space-y-3">
                {[
                  ['Note Rate',      rate > 0 ? fmtPct(rate) : '--',                     'text-white text-lg'],
                  ['Lock Period',    lockPeriod + ' days',                                'text-white'],
                  ['Lock Adj',       lockAdj !== 0 ? (lockAdj > 0 ? '+' : '') + lockAdj + '%' : 'Par', lockAdj > 0 ? 'text-amber-400' : lockAdj < 0 ? 'text-emerald-400' : 'text-slate-400'],
                  ['Adjusted Rate',  rate > 0 ? fmtPct(adjustedRate) : '--',             'text-blue-300 font-bold'],
                  ['Monthly P&I',    currentPI > 0 ? fmtD(currentPI) : '--',             'text-white'],
                  ['Adj. Monthly P&I', adjustedPI > 0 && lockAdj !== 0 ? fmtD(adjustedPI) : '--', 'text-slate-300'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800">
                    <span className="text-slate-400 text-sm">{l}</span>
                    <span className={'font-bold text-sm ' + c}>{v}</span>
                  </div>
                ))}
                {lenderCreditAmt > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-800">
                    <span className="text-slate-400 text-sm">Lender Credit</span>
                    <span className="font-bold text-sm text-emerald-400">{fmt0(lenderCreditAmt)}</span>
                  </div>
                )}
                {floatDownOption && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400 text-sm">Float-Down</span>
                    <span className="font-bold text-sm text-blue-400">Requested</span>
                  </div>
                )}
              </div>
              {trendObj && (
                <div className={'mt-5 rounded-2xl p-4 border ' + (trendObj.color === 'red' ? 'bg-red-900/30 border-red-700/50' : trendObj.color === 'emerald' ? 'bg-emerald-900/30 border-emerald-700/50' : trendObj.color === 'blue' ? 'bg-blue-900/30 border-blue-700/50' : 'bg-amber-900/30 border-amber-700/50')}>
                  <div className={'text-xs font-bold uppercase tracking-wide mb-2 ' + (trendObj.color === 'red' ? 'text-red-400' : trendObj.color === 'emerald' ? 'text-emerald-400' : trendObj.color === 'blue' ? 'text-blue-400' : 'text-amber-400')}>Recommendation</div>
                  <div className={'text-xl font-black mb-1 ' + (trendObj.color === 'red' ? 'text-red-300' : trendObj.color === 'emerald' ? 'text-emerald-300' : trendObj.color === 'blue' ? 'text-blue-300' : 'text-amber-300')}>{trendObj.rec}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{trendObj.advice.substring(0, 100)}...</p>
                </div>
              )}
              {aiAnalysis && (
                <div className="mt-3 bg-indigo-900/30 border border-indigo-700/40 rounded-2xl p-4">
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">AI Analysis</div>
                  <div className="text-xs text-slate-300">30yr avg: {aiAnalysis.currentRate || '--'} · {aiAnalysis.weeklyChange || '--'} this week</div>
                  <div className="text-xs text-indigo-300 font-semibold mt-1">{aiAnalysis.verdict}</div>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {[
                  'Lock before rate quote expires — re-locks cost money',
                  'Float-down has a one-time trigger window (5-10 days before closing)',
                  '2-1 buydown subsidy is held in escrow by the servicer',
                  'Each 0.25% rate reduction ≈ 1 point in cost (rough rule)',
                  'Seller-funded buydown counts against concession limits',
                  'VA: lender credit cannot exceed total closing costs',
                  'FHA/USDA: seller concessions capped at 6%',
                ].map((rule) => (
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
