// src/pages/ComplianceIntel.jsx
// LoanBeacons™ — Module 15 | Stage 4: Verification & Submit
// Compliance Intelligence™ — QM · ATR · HPML · HMDA · Fair Lending review

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';
// ─── Data ─────────────────────────────────────────────────────────────────────
const COMPLIANCE_CHECKS = [
  { id: 'qm_status',       category: 'QM / ATR',    icon: '⚖️', risk: 'critical', label: 'Qualified Mortgage (QM) Status',          description: 'Loan meets QM definition under Reg Z §1026.43. Safe Harbor (APR ≤ APOR+1.5%) or Rebuttable Presumption (HPML QM). Non-QM loans must still meet ATR requirements.', tips: 'Verify points & fees ≤3%, no balloon, no negative amortization, term ≤30 years, DTI ≤43% (or GSE/agency eligible). Document which QM category applies.' },
  { id: 'atr_documented',  category: 'QM / ATR',    icon: '📄', risk: 'critical', label: 'ATR — 8 Factors Documented',              description: 'All 8 Ability-to-Repay factors documented per Reg Z §1026.43(c). Income, assets, employment, debts, DTI, credit history all verified and retained.', tips: 'Retain documentation for 3 years. Cannot rely solely on stated income. Third-party verification required for each factor.' },
  { id: 'points_fees',     category: 'QM / ATR',    icon: '💰', risk: 'critical', label: 'Points & Fees Cap (3% Rule)',              description: 'QM requires points and fees ≤3% of loan amount (or flat cap for smaller loans). Includes all affiliated fees — verify all included.', tips: 'Points & fees include: origination, discount points, compensation to broker, affiliated title/settlement fees. Excludes bona fide 3rd party charges.' },
  { id: 'balloon_arm',     category: 'QM / ATR',    icon: '🚫', risk: 'high',     label: 'Prohibited Loan Features Check',          description: 'QM prohibits balloon payments (except rural/seasonal qualified), negative amortization, interest-only periods >10 years, and terms >30 years.', tips: 'Rural balloon exception: creditor operates predominantly in rural/underserved areas. Small creditor balloon: <$2B assets, <2,000 first-lien originations.' },
  { id: 'hpml_check',      category: 'HPML',        icon: '📊', risk: 'critical', label: 'HPML Threshold Test',                      description: 'APR tested against APOR. First lien conforming: ≥1.5% over APOR = HPML. Jumbo: ≥2.5%. Subordinate: ≥3.5%. HPML triggers mandatory escrow and additional appraisal requirements.', tips: 'HPML does NOT mean the loan is illegal — it triggers additional requirements. Escrow for taxes and insurance required for ≥5 years. Independent appraisal required.' },
  { id: 'hoepa_check',     category: 'HOEPA',       icon: '⛔', risk: 'critical', label: 'HOEPA / Section 32 Test',                  description: 'High-cost mortgage test: Points & fees >5% of loan (or $1,099 for <$22K loans). APR >APOR+6.5% (first lien) or >APOR+8.5% (sub). Prepayment penalty test.', tips: 'HOEPA/Section 32 loans have severe restrictions — balloon payments, negative amortization, and prepayment penalties are prohibited. Counseling required before closing.' },
  { id: 'fair_lending',    category: 'Fair Lending', icon: '⚖️', risk: 'critical', label: 'Fair Lending / ECOA Review',               description: 'No disparate treatment on prohibited basis (race, color, religion, sex, national origin, age, marital status, familial status, disability). Consistent underwriting standards applied.', tips: 'Document all credit decisions consistently. Pricing must be based on risk factors, not demographic characteristics. Maintain audit trail for all pricing exceptions.' },
  { id: 'hmda_reportable', category: 'HMDA',        icon: '📋', risk: 'medium',   label: 'HMDA Reportability Determination',         description: 'Determine if transaction is HMDA reportable under Reg C. Covered institution, dwelling-secured, closed-end or HELOC, for home purchase, improvement, or refinance.', tips: 'Not all loans are reportable. Agricultural loans, commercial/business purpose, and loans on non-dwelling property may be exempt. Confirm institution coverage threshold.' },
  { id: 'hmda_data',       category: 'HMDA',        icon: '📊', risk: 'medium',   label: 'HMDA LAR Data — Complete',                 description: 'All required HMDA data points collected at application. Demographic info offered to borrower (borrower may decline). Race, ethnicity, sex self-reported or observed if not provided.', tips: 'Must offer demographic information collection even if borrower declines. If application taken in person, must observe and record if borrower does not provide.' },
  { id: 'cra_eligibility', category: 'CRA',         icon: '🏘️', risk: 'low',      label: 'CRA Credit Eligibility Flagged',           description: 'Loan qualifies for CRA credit if property in LMI census tract or borrower is LMI. Flag for institution CRA performance tracking.', tips: 'CRA credit applies to FDIC-insured institutions only. Mortgage companies and credit unions have different community reinvestment requirements.' },
  { id: 'state_predatory', category: 'State Law',   icon: '📍', risk: 'medium',   label: 'State Anti-Predatory Lending Review',      description: 'Loan reviewed against applicable state mini-HOEPA laws and rate/fee caps. Some states (GA, NY, NC, NJ) have stricter thresholds than federal HOEPA.', tips: 'Georgia Fair Lending Act, NY Banking Law, NC HPTA all have stricter requirements. Check state-specific thresholds before closing.' },
  { id: 'servicing',       category: 'RESPA',       icon: '🏦', risk: 'low',      label: 'Servicing Transfer Protections — RESPA §6', description: 'RESPA §6 servicing disclosure issued. Transfer notice requirements met. Error resolution and payment processing procedures in place.', tips: 'If servicing is transferred after closing, borrower has 60-day grace period for misdirected payments. New servicer must notify borrower 15 days before effective transfer date.' },
];

const ATR_FACTORS = [
  { factor: 'Current or reasonably expected income or assets', doc: 'Pay stubs, W-2s, tax returns, asset statements' },
  { factor: 'Current employment status', doc: 'VOE, pay stubs, employer letter' },
  { factor: 'Monthly payment on the covered transaction', doc: 'AUS findings, rate lock confirmation' },
  { factor: 'Monthly payment on any simultaneous loan', doc: 'HELOC agreement, 2nd lien note' },
  { factor: 'Monthly payment for mortgage-related obligations (taxes, insurance, HOA)', doc: 'Property tax records, insurance quote, HOA statement' },
  { factor: 'Current debt obligations, alimony, and child support', doc: 'Credit report, court orders, divorce decree' },
  { factor: 'Monthly debt-to-income ratio or residual income', doc: 'AUS findings with DTI calculation' },
  { factor: 'Credit history', doc: 'Tri-merge credit report, VOR if needed' },
];

const HMDA_FIELDS = [
  { id: 'loan_type',             label: 'Loan Type',                          note: 'Conv / FHA / VA / USDA' },
  { id: 'loan_purpose',          label: 'Loan Purpose',                       note: 'Purchase / Refi / Home improvement' },
  { id: 'occupancy_type',        label: 'Occupancy Type',                     note: 'Primary / Secondary / Investment' },
  { id: 'loan_amount',           label: 'Loan Amount',                        note: 'Rounded to nearest $1,000' },
  { id: 'action_taken',          label: 'Action Taken',                       note: 'Originated / Approved / Denied / Withdrawn' },
  { id: 'property_address',      label: 'Property Address / Census Tract',    note: 'Must geocode to census tract' },
  { id: 'borrower_demographics', label: 'Borrower Ethnicity / Race / Sex',    note: 'Self-reported or observed' },
  { id: 'income',                label: 'Gross Annual Income',                note: 'As stated on application' },
  { id: 'rate_spread',           label: 'Rate Spread (HPML only)',            note: 'APR minus APOR' },
  { id: 'hoepa_status',          label: 'HOEPA Status',                       note: 'High-cost or not' },
  { id: 'lien_status',           label: 'Lien Status',                        note: 'First / Subordinate' },
  { id: 'credit_score',          label: 'Credit Score & Scoring Model',       note: 'All scores from each bureau' },
];

const RESULT_OPTIONS = [
  { value: 'pending', label: '⏳ Pending',      color: 'border-slate-300 bg-slate-50 text-slate-600' },
  { value: 'pass',    label: '✅ Pass',          color: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
  { value: 'review',  label: '⚠️ Needs Review', color: 'border-amber-400 bg-amber-50 text-amber-800' },
  { value: 'fail',    label: '🚨 Flag / Fail',  color: 'border-red-400 bg-red-50 text-red-800' },
  { value: 'na',      label: '— N/A',           color: 'border-slate-200 bg-slate-100 text-slate-400' },
];

const RISK_BADGE = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high:     'bg-orange-100 text-orange-700 border border-orange-200',
  medium:   'bg-amber-100 text-amber-700 border border-amber-200',
  low:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const CATEGORIES = [...new Set(COMPLIANCE_CHECKS.map(c => c.category))];

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// ─── Letter Builder ───────────────────────────────────────────────────────────
function buildComplianceLetter({ borrowerName, loanType, loanApr, aporRate, aprSpread, isHPML, complianceScore, passCount, failCount, reviewCount, results, loNotes, aiSummary }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('To: Mortgage Underwriter / Compliance Officer');
  lines.push('From: George Jules Chevalier IV, NMLS #1175947 — Clearview Lending Solutions');
  lines.push('Re: Compliance Review Summary — ' + (borrowerName || 'Borrower'));
  lines.push(''); lines.push('LOAN INFORMATION');
  lines.push('Borrower: ' + (borrowerName || 'See application'));
  if (loanType)  lines.push('Loan Type: ' + loanType);
  if (loanApr)   lines.push('Loan APR: ' + loanApr + '%');
  if (aporRate)  lines.push('APOR Rate: ' + aporRate + '%');
  if (aprSpread !== '') lines.push('APR Spread: ' + aprSpread + '% → ' + (isHPML ? 'HPML — Additional requirements apply' : 'Not HPML'));
  lines.push(''); lines.push('COMPLIANCE SCORE: ' + complianceScore + '%');
  lines.push('Pass: ' + passCount + ' · Flag/Fail: ' + failCount + ' · Needs Review: ' + reviewCount);
  lines.push(''); lines.push('CHECK-BY-CHECK STATUS');
  COMPLIANCE_CHECKS.forEach(check => {
    const r = results[check.id];
    const label = RESULT_OPTIONS.find(o => o.value === r)?.label || r;
    lines.push(check.label + ': ' + label);
  });
  if (isHPML) {
    lines.push(''); lines.push('HPML REQUIREMENTS — MANDATORY');
    lines.push('1. Escrow account required for property taxes and insurance (minimum 5 years)');
    lines.push('2. Independent appraisal required (written report by certified/licensed appraiser)');
    lines.push('3. For HPMLs with LTV ≥ 110%: second appraisal required at no cost to borrower');
    lines.push('4. Prepayment penalty restrictions apply (cannot extend beyond 3 years)');
  }
  if (aiSummary) { lines.push(''); lines.push('AI COMPLIANCE ASSESSMENT'); lines.push(aiSummary); }
  if (loNotes)   { lines.push(''); lines.push('LO NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('All compliance documentation is maintained in the loan file. Please contact me with questions.');
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions | george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function LetterCard({ title, icon, body }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-3xl border-2 border-purple-200 bg-purple-50 overflow-hidden">
      <ModuleNav moduleNumber={27} />
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="font-bold text-slate-700 flex items-center gap-2">{icon} {title}</div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white transition-colors">
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
export default function ComplianceIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const [scenario, setScenario]   = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [search,    setSearch]    = useState('');
  const [showAll,   setShowAll]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [borrowerName, setBorrowerName] = useState('');

  const [activeTab, setActiveTab] = useState(0);

  // Compliance tracking
  const [results, setResults] = useState(Object.fromEntries(COMPLIANCE_CHECKS.map(c => [c.id, 'pending'])));
  const [notes,   setNotes]   = useState(Object.fromEntries(COMPLIANCE_CHECKS.map(c => [c.id, ''])));
  const [hmda,    setHmda]    = useState(Object.fromEntries(HMDA_FIELDS.map(f => [f.id, 'pending'])));

  // HPML calculator
  const [loanApr,    setLoanApr]    = useState('');
  const [aporRate,   setAporRate]   = useState('');
  const [lienType,   setLienType]   = useState('first_conforming');
  const [loanType,   setLoanType]   = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [pointsFees, setPointsFees] = useState('');

  // AI
  const [aiAnalysis,  setAiAnalysis]  = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const [loNotes,       setLoNotes]       = useState('');
  const [recordSaving,  setRecordSaving]  = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(scenarioId);

  // ─── localStorage ────────────────────────────────────────────────────────────
  const lsKey = scenarioId ? `lb_compliance_${scenarioId}` : null;

  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({ results, notes, hmda, loanApr, aporRate, lienType, loanType, loanAmount, pointsFees, loNotes, aiAnalysis, savedRecordId }));
  }, [lsKey, results, notes, hmda, loanApr, aporRate, lienType, loanType, loanAmount, pointsFees, loNotes, aiAnalysis, savedRecordId]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // ─── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios'))
        .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(console.error)
        .finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.results)       setResults(saved.results);
          if (saved.notes)         setNotes(saved.notes);
          if (saved.hmda)          setHmda(saved.hmda);
          if (saved.loanApr)       setLoanApr(saved.loanApr);
          if (saved.aporRate)      setAporRate(saved.aporRate);
          if (saved.lienType)      setLienType(saved.lienType);
          if (saved.loanType)      setLoanType(saved.loanType);
          if (saved.loanAmount)    setLoanAmount(saved.loanAmount);
          if (saved.pointsFees)    setPointsFees(saved.pointsFees);
          if (saved.loNotes)       setLoNotes(saved.loNotes);
          if (saved.aiAnalysis)    setAiAnalysis(saved.aiAnalysis);
          if (saved.savedRecordId) setSavedRecordId(saved.savedRecordId);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        if (d.interestRate) setLoanApr(prev => prev || parseFloat(d.interestRate).toFixed(3));
        if (d.loanType)     setLoanType(prev => prev || d.loanType);
        if (d.loanAmount)   setLoanAmount(prev => prev || String(d.loanAmount));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // ─── HPML Calculations ────────────────────────────────────────────────────────
  const aprSpread     = loanApr && aporRate ? (parseFloat(loanApr) - parseFloat(aporRate)).toFixed(3) : '';
  const hpmlThresholds = { first_conforming: 1.5, first_jumbo: 2.5, subordinate: 3.5 };
  const hpmlThreshold  = hpmlThresholds[lienType] || 1.5;
  const isHPML         = aprSpread !== '' && parseFloat(aprSpread) >= hpmlThreshold;
  const isHOEPA_APR    = aprSpread !== '' && parseFloat(aprSpread) >= 6.5;

  // Points & fees cap
  const loanAmt   = parseFloat(loanAmount) || 0;
  const pf        = parseFloat(pointsFees) || 0;
  const pfPct     = loanAmt > 0 ? (pf / loanAmt) * 100 : 0;
  const pfCapPct  = loanAmt >= 100000 ? 3 : loanAmt >= 60000 ? 3.5 : loanAmt >= 20000 ? 4 : 5;
  const pfOverCap = pf > 0 && pfPct > pfCapPct;
  const hoepaFeeTest = pf > 0 && pfPct > 5;

  // ─── Score ───────────────────────────────────────────────────────────────────
  const passCount      = Object.values(results).filter(r => r === 'pass').length;
  const failCount      = Object.values(results).filter(r => r === 'fail').length;
  const reviewCount    = Object.values(results).filter(r => r === 'review').length;
  const naCount        = Object.values(results).filter(r => r === 'na').length;
  const complianceScore = Math.round(((passCount + naCount) / COMPLIANCE_CHECKS.length) * 100);
  const failItems      = COMPLIANCE_CHECKS.filter(c => results[c.id] === 'fail');
  const reviewItems    = COMPLIANCE_CHECKS.filter(c => results[c.id] === 'review');
  const hmdaCollected  = Object.values(hmda).filter(v => v === 'collected').length;
  const hmdaMissing    = Object.values(hmda).filter(v => v === 'missing').length;

  // ─── AI Analysis ──────────────────────────────────────────────────────────────
  const handleAIAnalysis = async () => {
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
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `You are a senior mortgage compliance officer and regulatory expert. Review this compliance file and provide an assessment.

LOAN DETAILS:
- Loan Type: ${loanType || 'Not specified'}
- Loan Amount: ${loanAmount ? fmt0(parseFloat(loanAmount)) : 'Not specified'}
- Loan APR: ${loanApr || 'Not entered'}%
- APOR Rate: ${aporRate || 'Not entered'}%
- APR Spread: ${aprSpread !== '' ? aprSpread + '%' : 'Not calculated'}
- HPML Status: ${isHPML ? 'YES — HPML (' + aprSpread + '% spread exceeds ' + hpmlThreshold + '% threshold)' : 'Not HPML'}
- HOEPA APR Test: ${isHOEPA_APR ? 'HOEPA TRIGGERED' : 'Clear'}
- Points & Fees: ${pointsFees ? fmt0(pf) + ' (' + pfPct.toFixed(2) + '% of loan — cap is ' + pfCapPct + '%)' : 'Not entered'}
- Lien Type: ${lienType?.replace('_', ' ')}

COMPLIANCE CHECK RESULTS:
${COMPLIANCE_CHECKS.map(c => c.label + ': ' + results[c.id] + ' (' + c.risk + ' risk)').join('\n')}

Compliance Score: ${complianceScore}%
Failed Checks: ${failItems.map(c => c.label).join(', ') || 'None'}
Needs Review: ${reviewItems.map(c => c.label).join(', ') || 'None'}

HMDA: ${hmdaCollected} fields collected · ${hmdaMissing} missing

Return ONLY valid JSON (no markdown, no preamble):
{"riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","clearanceReady":true,"summary":"2-3 sentence assessment","criticalIssues":["list"],"actionItems":["list"],"hpmlGuidance":["list if HPML, else omit"],"regulatoryNotes":["list"]}`,
          }],
        }),
      });
      if (!resp.ok) throw new Error('Status ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) setAiAnalysis(JSON.parse(match[0]));
    } catch (err) { console.error(err); }
    setAiAnalyzing(false);
  };

  // ─── Decision Record ──────────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const riskFlags = [];
      failItems.forEach(item => riskFlags.push({ field: item.id, message: item.label + ' — Failed', severity: item.risk === 'critical' ? 'HIGH' : 'MEDIUM' }));
      if (isHPML)     riskFlags.push({ field: 'hpml',        message: 'HPML loan — escrow and appraisal requirements triggered',                          severity: 'MEDIUM' });
      if (isHOEPA_APR) riskFlags.push({ field: 'hoepa',      message: 'HOEPA APR test triggered — high-cost mortgage restrictions apply',                  severity: 'HIGH' });
      if (pfOverCap)  riskFlags.push({ field: 'points_fees', message: 'Points & fees (' + pfPct.toFixed(2) + '%) exceed QM cap (' + pfCapPct + '%)',       severity: 'HIGH' });
      const writtenId = await reportFindings({
        verdict: complianceScore >= 80 ? 'Compliant' : complianceScore >= 50 ? 'In Progress' : 'Action Required',
        summary: `Compliance Intelligence — ${loanType || 'Loan'} · Score: ${complianceScore}% · Pass: ${passCount} · Fail: ${failCount} · Review: ${reviewCount} · HPML: ${isHPML ? 'Yes' : 'No'} · HMDA: ${hmdaCollected}/${HMDA_FIELDS.length} collected`,
        riskFlags,
        findings: { loanApr, aporRate, aprSpread, isHPML, isHOEPA_APR, lienType, loanType, complianceScore, passCount, failCount, reviewCount, results, hmdaStatus: hmda, loNotes },
        completeness: { aprEntered: !!loanApr, noFailedChecks: failCount === 0, hmdaComplete: hmdaMissing === 0, aiRun: !!aiAnalysis },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const TABS = [
    { id: 0, label: 'HPML Calculator',    icon: '📊' },
    { id: 1, label: 'Compliance Checks',  icon: '⚖️' },
    { id: 2, label: 'ATR Factors',        icon: '📄' },
    { id: 3, label: 'HMDA Data',          icon: '📋' },
    { id: 4, label: 'AI Assessment',      icon: '🤖' },
  ];

  // ─── AI risk level → static class maps (fixes Vite 500 from dynamic Tailwind) ─
  const aiRiskBadge = {
    LOW:      'text-emerald-700 bg-emerald-100 border-emerald-300',
    MEDIUM:   'text-amber-700 bg-amber-100 border-amber-300',
    HIGH:     'text-red-700 bg-red-100 border-red-300',
    CRITICAL: 'text-red-900 bg-red-200 border-red-500',
  };

  // ─── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">⚖️</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  // ─── Scenario Picker ──────────────────────────────────────────────────────────
  if (!scenarioId) {
    const q        = search.toLowerCase().trim();
    const sorted   = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore   = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">15</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 4 — Verification & Submit</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">Compliance Intelligence™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Run QM, ATR, HPML, HMDA, and Fair Lending checks before submission. Flag compliance issues early and document your review trail.</p>
            <div className="flex flex-wrap gap-2">
              {['QM Safe Harbor', 'ATR Analysis', 'HPML Detection', 'HMDA Reporting', 'Fair Lending Review', 'Compliance Audit Trail'].map(tag => (
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
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName  = s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate('/compliance-intel?scenarioId=' + s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType   && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage      && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">
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

  // ─── Main Module ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #7c3aed 0%, transparent 50%), radial-gradient(circle at 80% 20%, #a855f7 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 15</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Compliance Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl">QM · ATR · HPML · HOEPA · HMDA · Fair Lending · AI risk assessment</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px' }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{loanType || '--'} · {loanAmount ? fmt0(parseFloat(loanAmount)) : '--'}</div>
                  <div className={'text-sm font-bold mt-1 ' + (complianceScore >= 80 ? 'text-emerald-400' : complianceScore >= 50 ? 'text-amber-400' : 'text-red-400')}>
                    {complianceScore}% compliant · {failCount > 0 ? failCount + ' failed' : 'No failures'}
                  </div>
                  {isHPML && <div className="text-amber-300 text-xs font-bold mt-1">⚠️ HPML — {aprSpread}% spread</div>}
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
              {loanType && <span>Type <strong className="text-white">{loanType}</strong></span>}
              {loanApr  && <span>APR <strong className="text-white">{loanApr}%</strong></span>}
              {isHPML   && <span className="text-amber-300 font-bold">⚠️ HPML</span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Compliance Intelligence™" moduleNumber="15" scenarioId={scenarioId} />
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2">
        <DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="COMPLIANCE_INTEL" />
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ' + (activeTab === tab.id ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 1 && failCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-black">{failCount}</span>}
                {tab.id === 0 && isHPML && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black">HPML</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* ─── TAB 0: HPML CALCULATOR ──────────────────────────────────── */}
            {activeTab === 0 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-800 to-purple-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">HPML & HOEPA Calculator</h2>
                    <p className="text-purple-200 text-sm mt-1">Enter loan APR and current APOR to auto-calculate spread and determine HPML / HOEPA status</p>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800">
                      <strong>📍 Current APOR Rate:</strong> Look up the weekly APOR at <strong>ffiec.cfpb.gov</strong> → Rate Spread Calculator. APOR is published every Thursday for the following week's applications.
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan APR (%)</label>
                        <input type="number" step="0.001" value={loanApr} onChange={e => setLoanApr(e.target.value)} placeholder="7.250"
                          className="w-full border-2 border-purple-300 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-purple-500 bg-purple-50" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Current APOR Rate (%)</label>
                        <input type="number" step="0.001" value={aporRate} onChange={e => setAporRate(e.target.value)} placeholder="6.100"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-purple-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Lien Type</label>
                        <select value={lienType} onChange={e => setLienType(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400 bg-white">
                          <option value="first_conforming">1st Lien — Conforming (threshold: 1.5%)</option>
                          <option value="first_jumbo">1st Lien — Jumbo (threshold: 2.5%)</option>
                          <option value="subordinate">Subordinate Lien (threshold: 3.5%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Type</label>
                        <select value={loanType} onChange={e => setLoanType(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400 bg-white">
                          <option value="">Select…</option>
                          {['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'ARM', 'Non-QM'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* HPML Result */}
                    {aprSpread !== '' && (
                      <div className={'rounded-3xl border-2 p-6 ' + (isHPML ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50')}>
                        <div className="flex items-center gap-4 mb-4">
                          <span className="text-4xl">{isHPML ? '⚠️' : '✅'}</span>
                          <div>
                            <div className={'text-2xl font-black ' + (isHPML ? 'text-amber-800' : 'text-emerald-800')}>
                              {isHPML ? 'HPML — Higher-Priced Mortgage Loan' : 'Not HPML — Clear'}
                            </div>
                            <div className={'text-sm ' + (isHPML ? 'text-amber-700' : 'text-emerald-700')}>
                              APR spread: {aprSpread}% · Threshold: {hpmlThreshold}% · {isHPML ? aprSpread + '% ≥ ' + hpmlThreshold + '% = HPML' : aprSpread + '% < ' + hpmlThreshold + '% = Not HPML'}
                            </div>
                          </div>
                        </div>
                        {isHPML && (
                          <div className="space-y-2">
                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">HPML Mandatory Requirements:</div>
                            {[
                              'Escrow account required for taxes and insurance (minimum 5 years)',
                              'Independent written appraisal required (by certified or licensed appraiser)',
                              'If LTV ≥ 110%: second independent appraisal required at no cost to borrower',
                              'Prepayment penalty restrictions: cannot exceed 3 years from consummation',
                              'Pre-loan counseling encouraged (not required but best practice)',
                            ].map((req, i) => (
                              <div key={i} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0 font-bold">{i + 1}.</span><span>{req}</span></div>
                            ))}
                          </div>
                        )}
                        {isHOEPA_APR && (
                          <div className="mt-4 bg-red-100 border border-red-300 rounded-2xl p-4">
                            <div className="font-bold text-red-800 text-sm">🚨 HOEPA APR Test Triggered ({aprSpread}% ≥ 6.5%)</div>
                            <div className="text-xs text-red-700 mt-1">This may be a high-cost mortgage subject to HOEPA/Section 32 restrictions. Special counseling, disclosures, and prohibitions apply. Refer to compliance counsel immediately.</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Points & Fees QM Test */}
                    <div className="border-t border-slate-200 pt-6">
                      <div className="text-sm font-bold text-slate-700 mb-4">Points & Fees QM Cap Test</div>
                      <div className="grid grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Amount ($)</label>
                          <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} placeholder="450000"
                            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-purple-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Total Points & Fees ($)</label>
                          <input type="number" value={pointsFees} onChange={e => setPointsFees(e.target.value)} placeholder="12000"
                            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-purple-400" />
                        </div>
                      </div>
                      {pf > 0 && loanAmt > 0 && (
                        <div className={'mt-4 rounded-2xl border-2 p-4 ' + (pfOverCap ? 'border-red-400 bg-red-50' : 'border-emerald-400 bg-emerald-50')}>
                          <div className={'font-bold ' + (pfOverCap ? 'text-red-700' : 'text-emerald-700')}>
                            {pfOverCap ? '🚨 Points & fees exceed QM cap' : '✅ Points & fees within QM cap'}
                          </div>
                          <div className={'text-sm mt-1 ' + (pfOverCap ? 'text-red-600' : 'text-emerald-600')}>
                            {fmt0(pf)} = {pfPct.toFixed(2)}% of {fmt0(loanAmt)} · QM cap: {pfCapPct}%
                          </div>
                          {hoepaFeeTest && <div className="text-xs text-red-700 font-bold mt-2">{'⚠️ HOEPA fee test also triggered (' + pfPct.toFixed(2) + '% > 5%)'}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 1: COMPLIANCE CHECKS ─────────────────────────────────── */}
            {activeTab === 1 && (
              <div className="space-y-6">
                {CATEGORIES.map(cat => (
                  <div key={cat} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-4">
                      <h3 className="text-sm font-bold text-white uppercase tracking-widest">{cat}</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {COMPLIANCE_CHECKS.filter(c => c.category === cat).map(check => {
                        const result    = results[check.id];
                        const resultObj = RESULT_OPTIONS.find(r => r.value === result);
                        return (
                          <div key={check.id} className={'p-6 transition-colors ' + (result === 'fail' ? 'bg-red-50' : result === 'review' ? 'bg-amber-50' : 'hover:bg-slate-50')}>
                            <div className="flex items-start gap-4">
                              <span className="text-2xl mt-0.5 shrink-0">{check.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-bold text-slate-800">{check.label}</span>
                                  <span className={'text-xs px-2 py-0.5 rounded-lg font-bold ' + RISK_BADGE[check.risk]}>{check.risk.toUpperCase()} RISK</span>
                                </div>
                                <p className="text-xs text-slate-500 mb-2">{check.description}</p>
                                <p className="text-xs text-indigo-600 italic mb-3">💡 {check.tips}</p>
                                <input type="text" value={notes[check.id]} onChange={e => setNotes(prev => ({ ...prev, [check.id]: e.target.value }))}
                                  placeholder="Notes / evidence / exception documentation..."
                                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-400 bg-slate-50" />
                              </div>
                              <div className="shrink-0">
                                <select value={result} onChange={e => setResults(prev => ({ ...prev, [check.id]: e.target.value }))}
                                  className={'text-xs border-2 rounded-2xl px-3 py-2 font-bold focus:outline-none cursor-pointer ' + (resultObj?.color || 'border-slate-200 bg-slate-50 text-slate-500')}>
                                  {RESULT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button onClick={handleSaveToRecord} disabled={recordSaving}
                    className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                    {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                  </button>
                </div>
              </div>
            )}

            {/* ─── TAB 2: ATR FACTORS ──────────────────────────────────────── */}
            {activeTab === 2 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                  <h2 className="text-xl font-bold text-white">Ability-to-Repay — 8 Required Factors</h2>
                  <p className="text-slate-400 text-sm mt-1">Reg Z §1026.43(c)(2) — All 8 factors must be considered and documented for every covered transaction</p>
                </div>
                <div className="p-8 space-y-4">
                  {ATR_FACTORS.map((item, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <div className="w-8 h-8 bg-purple-100 border border-purple-200 rounded-xl text-purple-700 text-sm font-black flex items-center justify-center shrink-0">{i + 1}</div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 mb-1">{item.factor}</div>
                        <div className="text-xs text-indigo-600">📄 Documentation: {item.doc}</div>
                      </div>
                    </div>
                  ))}
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mt-4">
                    <div className="font-bold text-purple-800 text-sm mb-2">QM Safe Harbor vs Rebuttable Presumption</div>
                    <div className="space-y-2 text-xs text-purple-800">
                      <p><strong>Safe Harbor (conclusive presumption):</strong> APR ≤ APOR + 1.5%. Lender has complete protection from ATR liability if QM requirements met.</p>
                      <p><strong>Rebuttable Presumption:</strong> APR above APOR + 1.5% but still QM (HPML QM). Borrower can rebut the presumption by showing lender failed to make reasonable good-faith determination of ATR.</p>
                      <p><strong>Non-QM:</strong> No presumption. Lender must affirmatively demonstrate ATR compliance in court if challenged. Higher documentation and evidence standard required.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── TAB 3: HMDA ─────────────────────────────────────────────── */}
            {activeTab === 3 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                  <h2 className="text-xl font-bold text-white">HMDA LAR Data Collection</h2>
                  <p className="text-slate-400 text-sm mt-1">Regulation C — Required data points for covered institutions · {hmdaCollected} collected · {hmdaMissing} missing</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {HMDA_FIELDS.map(field => {
                    const v = hmda[field.id];
                    return (
                      <div key={field.id} className={'flex items-center justify-between px-6 py-4 ' + (v === 'missing' ? 'bg-red-50' : v === 'collected' ? 'bg-emerald-50' : '')}>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{field.label}</div>
                          <div className="text-xs text-slate-400">{field.note}</div>
                        </div>
                        <select value={v} onChange={e => setHmda(prev => ({ ...prev, [field.id]: e.target.value }))}
                          className={'text-xs border-2 rounded-2xl px-3 py-2 font-bold focus:outline-none cursor-pointer ' + (v === 'collected' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : v === 'missing' ? 'border-red-400 bg-red-50 text-red-800' : v === 'na' ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                          <option value="pending">⏳ Pending</option>
                          <option value="collected">✅ Collected</option>
                          <option value="missing">⚠️ Missing</option>
                          <option value="na">— N/A</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
                {hmdaMissing > 0 && (
                  <div className="p-6 border-t border-slate-200">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                      <div className="font-bold text-red-700 text-sm">⚠️ {hmdaMissing} HMDA field(s) missing</div>
                      <div className="text-xs text-red-600 mt-1">HMDA data must be complete before loan submission. Missing data can result in regulatory penalties during CRA examination.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── TAB 4: AI ASSESSMENT ────────────────────────────────────── */}
            {activeTab === 4 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Compliance Assessment</h2>
                    <p className="text-slate-400 text-sm mt-1">Sonnet reviews the full compliance file and flags regulatory risks specific to this loan</p>
                  </div>
                  <div className="p-8">
                    {!aiAnalysis ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-slate-500 text-sm mb-4">Run AI assessment to identify compliance risks, HPML guidance, and loan-type-specific regulatory considerations.</p>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing}
                          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors">
                          {aiAnalyzing ? 'Analyzing...' : '🤖 Run AI Compliance Assessment'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Risk badge — static class lookup, no dynamic Tailwind */}
                        <div className={'inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-black text-sm ' + (aiRiskBadge[aiAnalysis.riskLevel] || aiRiskBadge.MEDIUM)}>
                          {aiAnalysis.riskLevel === 'LOW' ? '✅' : aiAnalysis.riskLevel === 'MEDIUM' ? '⚠️' : '🚨'} Risk: {aiAnalysis.riskLevel}
                          {aiAnalysis.clearanceReady && <span className="ml-2 text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">Ready for Clearance</span>}
                        </div>

                        <p className="text-slate-700 leading-relaxed">{aiAnalysis.summary}</p>

                        {/* Static two-column grid — no dynamic color interpolation */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="rounded-2xl border p-4 bg-red-50 border-red-200">
                            <div className="text-xs font-bold text-red-700 mb-2">🚨 Critical Issues</div>
                            <ul className="space-y-1">
                              {(aiAnalysis.criticalIssues || []).map((item, i) => (
                                <li key={i} className="text-xs text-red-800 flex gap-2"><span className="shrink-0">•</span><span>{item}</span></li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-2xl border p-4 bg-blue-50 border-blue-200">
                            <div className="text-xs font-bold text-blue-700 mb-2">✅ Action Items</div>
                            <ul className="space-y-1">
                              {(aiAnalysis.actionItems || []).map((item, i) => (
                                <li key={i} className="text-xs text-blue-800 flex gap-2"><span className="shrink-0">•</span><span>{item}</span></li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {aiAnalysis.hpmlGuidance?.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">⚠️ HPML-Specific Guidance</div>
                            {aiAnalysis.hpmlGuidance.map((g, i) => (
                              <div key={i} className="flex gap-2 text-sm text-amber-800 mb-1.5"><span className="shrink-0">•</span><span>{g}</span></div>
                            ))}
                          </div>
                        )}

                        {aiAnalysis.regulatoryNotes?.length > 0 && (
                          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
                            <div className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-3">📋 Regulatory Notes</div>
                            {aiAnalysis.regulatoryNotes.map((n, i) => (
                              <div key={i} className="flex gap-2 text-sm text-purple-800 mb-1.5"><span className="shrink-0">•</span><span>{n}</span></div>
                            ))}
                          </div>
                        )}

                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing} className="text-xs text-purple-600 hover:text-purple-500 font-semibold">
                          {aiAnalyzing ? 'Re-analyzing...' : '↺ Re-run'}
                        </button>
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
                      placeholder="QM exception documentation, HPML compliance steps taken, fair lending notes, state law overlays..."
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400 resize-none" />
                    <div className="mt-4 flex justify-end">
                      <button onClick={handleSaveToRecord} disabled={recordSaving}
                        className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                        {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Letter */}
                <LetterCard title="Compliance Summary Letter" icon="⚖️"
                  body={buildComplianceLetter({ borrowerName, loanType, loanApr, aporRate, aprSpread, isHPML, complianceScore, passCount, failCount, reviewCount, results, loNotes, aiSummary: aiAnalysis?.summary })} />
              </>
            )}
          </div>

          {/* ─── Sidebar ─────────────────────────────────────────────────── */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Compliance Score</div>
              <div className="text-center mb-5">
                <div className={'text-5xl font-black ' + (complianceScore >= 80 ? 'text-emerald-400' : complianceScore >= 50 ? 'text-amber-400' : 'text-red-400')}>{complianceScore}%</div>
                <div className="text-slate-400 text-sm mt-1">Pass: {passCount} · Fail: {failCount} · Review: {reviewCount} · N/A: {naCount}</div>
                <div className="mt-3 bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div className={'h-full rounded-full transition-all ' + (complianceScore >= 80 ? 'bg-emerald-400' : complianceScore >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: complianceScore + '%' }} />
                </div>
              </div>

              {/* HPML status */}
              {aprSpread !== '' && (
                <div className={'rounded-2xl border p-3 mb-4 ' + (isHPML ? 'bg-amber-900/30 border-amber-700/50' : 'bg-emerald-900/30 border-emerald-700/50')}>
                  <div className={'text-xs font-bold uppercase mb-0.5 ' + (isHPML ? 'text-amber-400' : 'text-emerald-400')}>HPML Status</div>
                  <div className={'font-black ' + (isHPML ? 'text-amber-300' : 'text-emerald-300')}>{isHPML ? '⚠️ HPML — ' + aprSpread + '% spread' : '✅ Not HPML'}</div>
                </div>
              )}

              {/* Failed items */}
              {failItems.length > 0 && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-2xl p-4 mb-4">
                  <div className="text-xs font-bold text-red-400 uppercase mb-2">🚨 Failed Checks</div>
                  {failItems.map(item => (
                    <div key={item.id} className="text-xs text-red-300 mb-1 flex gap-1.5"><span className="shrink-0">•</span><span>{item.label}</span></div>
                  ))}
                </div>
              )}

              {/* HMDA status */}
              <div className={'rounded-2xl border p-3 ' + (hmdaMissing > 0 ? 'bg-amber-900/30 border-amber-700/50' : 'bg-slate-800 border-slate-700')}>
                <div className="text-xs text-slate-400 mb-0.5">HMDA Data</div>
                <div className={'text-sm font-black ' + (hmdaMissing > 0 ? 'text-amber-300' : 'text-slate-300')}>
                  {hmdaCollected}/{HMDA_FIELDS.length} fields collected{hmdaMissing > 0 ? ' · ' + hmdaMissing + ' missing' : ''}
                </div>
              </div>

              {aiAnalysis?.riskLevel && (
                <div className={'mt-3 rounded-2xl p-3 border text-center ' + (aiAnalysis.riskLevel === 'LOW' ? 'bg-emerald-900/30 border-emerald-700/50' : aiAnalysis.riskLevel === 'MEDIUM' ? 'bg-amber-900/30 border-amber-700/50' : 'bg-red-900/30 border-red-700/50')}>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-0.5">AI Risk Level</div>
                  <div className={'font-black ' + (aiAnalysis.riskLevel === 'LOW' ? 'text-emerald-300' : aiAnalysis.riskLevel === 'MEDIUM' ? 'text-amber-300' : 'text-red-300')}>{aiAnalysis.riskLevel}</div>
                </div>
              )}
            </div>

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {[
                  'HPML (1st conforming): APR ≥ APOR + 1.5% — escrow + appraisal required',
                  'QM points & fees cap: 3% for loans ≥ $100K (sliding scale for smaller loans)',
                  'HOEPA fee test: points & fees > 5% = high-cost mortgage',
                  'ATR: all 8 factors must be documented — cannot rely on stated income',
                  'Fair lending: pricing exceptions must be documented with risk-based justification',
                  'HMDA: demographic data must be offered — record even if borrower declines',
                  'Non-QM loans: no ATR presumption — higher documentation standard',
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
