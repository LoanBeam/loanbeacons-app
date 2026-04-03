// src/pages/DisclosureIntel.jsx
// LoanBeacons™ — Module 14 | Stage 4: Verification & Submit
// Disclosure Intelligence™ — TRID · RESPA · ECOA · Deadline tracking · Compliance score

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ─── Business Day Calculator ──────────────────────────────────────────────────
function addBusinessDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  let added = 0;
  while (added < Math.abs(days)) {
    d.setDate(d.getDate() + (days > 0 ? 1 : -1));
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

function subtractBusinessDays(dateStr, days) {
  return addBusinessDays(dateStr, -days);
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T12:00:00');
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
  return diff;
}

// ─── Disclosure Items ─────────────────────────────────────────────────────────
const DISCLOSURE_ITEMS = [
  {
    id: 'loan_estimate',
    label: 'Loan Estimate (LE)',
    icon: '📄',
    regulation: 'TRID / Reg Z §1026.19(e)',
    deadline: '3 business days from application',
    deadlineKey: 'le_due',
    description: 'Must be delivered within 3 business days of receiving a complete 6-piece loan application. Triggers the 7-business-day waiting period before consummation.',
    applies: () => true,
    severity: 'critical',
    tips: 'Clock starts on the date the 6th piece of information is received. Revised LE required if APR increases >0.125%, loan product changes, or new prepayment penalty is added.',
  },
  {
    id: 'closing_disclosure',
    label: 'Closing Disclosure (CD)',
    icon: '📋',
    regulation: 'TRID / Reg Z §1026.19(f)',
    deadline: '3 business days before consummation',
    deadlineKey: 'cd_due',
    description: 'Borrower must RECEIVE the CD at least 3 business days before loan consummation. A revised CD may trigger a new 3-day waiting period.',
    applies: () => true,
    severity: 'critical',
    tips: 'Delivery by email requires borrower consent. Hand delivery counts same day. Mail delivery: add 3 calendar days for assumed receipt.',
  },
  {
    id: 'right_of_rescission',
    label: 'Right of Rescission',
    icon: '🔄',
    regulation: 'Reg Z §1026.23',
    deadline: '3 business days after consummation',
    deadlineKey: 'rescission_end',
    description: 'Applies to refinances of primary residences ONLY. Borrower has 3 business days to rescind. Funds cannot be disbursed until rescission period expires.',
    applies: (purpose) => purpose === 'refinance' || purpose === 'cash_out',
    severity: 'critical',
    tips: 'Does NOT apply to purchase loans. For investment/second home refis: no rescission right. Ensure all borrowers on title sign and receive the notice.',
  },
  {
    id: 'charm_booklet',
    label: 'CHARM Booklet',
    icon: '📚',
    regulation: 'Reg Z §1026.19(b)',
    deadline: 'At or before ARM application',
    deadlineKey: null,
    description: 'Consumer Handbook on Adjustable Rate Mortgages. Required for ALL ARM products at or before application — not at closing.',
    applies: (_, loanType) => loanType === 'ARM',
    severity: 'high',
    tips: 'Must be provided even if borrower ultimately selects a fixed product after initial ARM inquiry. Document delivery with borrower acknowledgment.',
  },
  {
    id: 'special_info_booklet',
    label: 'Special Information Booklet (CFPB Guide)',
    icon: '📖',
    regulation: 'RESPA §5 / 12 CFR 1024.6',
    deadline: 'Within 3 business days of application',
    deadlineKey: 'le_due',
    description: '"Your Home Loan Toolkit" — CFPB homebuying guide. Required for purchase transactions only. Same 3-day window as LE.',
    applies: (purpose) => purpose === 'purchase',
    severity: 'high',
    tips: 'Can be delivered electronically with consent. Not required for refinances. Use the CFPB\'s current version — outdated versions are non-compliant.',
  },
  {
    id: 'servicing_disclosure',
    label: 'Mortgage Servicing Disclosure',
    icon: '🏦',
    regulation: 'RESPA §6 / 12 CFR 1024.21',
    deadline: 'Within 3 business days of application',
    deadlineKey: 'le_due',
    description: 'Discloses whether the lender intends to service the loan or transfer servicing. Must include transfer history statistics.',
    applies: () => true,
    severity: 'high',
    tips: 'If servicing is transferred after closing, borrower has a 60-day grace period for misdirected payments. New servicer must notify borrower 15 days before transfer.',
  },
  {
    id: 'affiliated_business',
    label: 'Affiliated Business Arrangement (AfBA)',
    icon: '🤝',
    regulation: 'RESPA §8(c)(4) / 12 CFR 1024.15',
    deadline: 'At or before referral',
    deadlineKey: null,
    description: 'Required whenever referring borrower to an affiliated settlement service provider (title company, insurance, etc.) with a business relationship.',
    applies: () => false, // manual — LO must determine
    severity: 'medium',
    tips: 'Must describe the relationship and estimated charges. Borrower is NOT required to use the affiliated provider. Retain signed copy in file.',
  },
  {
    id: 'appraisal_disclosure',
    label: 'Appraisal / ECOA Notice',
    icon: '🏠',
    regulation: 'ECOA / Reg B §1002.14',
    deadline: 'Within 3 business days of application',
    deadlineKey: 'le_due',
    description: 'Must notify borrower of right to receive a free copy of the appraisal. Appraisal copy must be provided promptly upon completion.',
    applies: () => true,
    severity: 'high',
    tips: 'Appraisal copy must be provided at least 3 business days before consummation — even if borrower waives the right. Waiver must be in writing.',
  },
  {
    id: 'fair_lending_notice',
    label: 'ECOA Adverse Action Notice',
    icon: '⚖️',
    regulation: 'ECOA / Reg B §1002.9',
    deadline: 'Within 30 days of adverse action',
    deadlineKey: 'adverse_action_due',
    description: 'Required if application is denied, withdrawn at lender request, or approved on different terms. Must state specific reasons for adverse action.',
    applies: () => false, // manual — triggered by adverse action
    severity: 'critical',
    tips: 'Failure to provide adverse action notice is a federal violation. Do not use vague reasons — must be specific (e.g., "Debt-to-income ratio too high"). Retain copy for 25 months.',
  },
  {
    id: 'mip_pmi_disclosure',
    label: 'MIP / PMI Disclosure',
    icon: '🛡️',
    regulation: 'HPA / FHA Guidelines / Reg Z',
    deadline: 'At application / with LE',
    deadlineKey: 'le_due',
    description: 'Discloses mortgage insurance premiums, duration, and cancellation rights. FHA: MIP for life of loan (if <10% down). Conventional: PMI cancels at 80% LTV.',
    applies: () => true,
    severity: 'medium',
    tips: 'For FHA: MIP disclosure must show upfront MIP amount and ongoing monthly amount. For conventional: PMI cancellation notice must explain automatic termination at 78% LTV.',
  },
];

const STATUS_OPTIONS = [
  { value: 'pending',  label: '⏳ Pending',              color: 'border-amber-400 bg-amber-50 text-amber-800' },
  { value: 'issued',   label: '📤 Issued',               color: 'border-blue-400 bg-blue-50 text-blue-800' },
  { value: 'received', label: '✅ Received / Confirmed', color: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
  { value: 'na',       label: '— N/A',                   color: 'border-slate-300 bg-slate-100 text-slate-500' },
  { value: 'waived',   label: '⚡ Waived / Exception',   color: 'border-orange-400 bg-orange-50 text-orange-700' },
];

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// ─── Letter Builder ───────────────────────────────────────────────────────────
function buildComplianceLetter({ borrowerName, loanType, loanPurpose, applicationDate, closingDate, deadlines, statuses, complianceScore, pendingItems, loNotes, aiSummary }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('To: Mortgage Underwriter / Processor / Compliance Officer');
  lines.push('From: George Jules Chevalier IV, NMLS #1175947 — Clearview Lending Solutions');
  lines.push('Re: Disclosure Compliance Summary — ' + (borrowerName || 'Borrower'));
  lines.push(''); lines.push('LOAN INFORMATION');
  lines.push('Borrower: ' + (borrowerName || 'See application'));
  lines.push('Loan Type: ' + (loanType || 'See application'));
  lines.push('Loan Purpose: ' + (loanPurpose?.replace('_', '-') || 'See application'));
  if (applicationDate) lines.push('Application Date: ' + formatDate(applicationDate));
  if (closingDate) lines.push('Estimated Closing: ' + formatDate(closingDate));
  lines.push(''); lines.push('COMPLIANCE SCORE: ' + complianceScore + '%');
  lines.push(complianceScore >= 80 ? 'Status: COMPLIANT — All critical disclosures addressed' : complianceScore >= 50 ? 'Status: IN PROGRESS — Some disclosures pending' : 'Status: ACTION REQUIRED — Multiple disclosures pending');
  if (deadlines.le_due) { lines.push(''); lines.push('KEY DEADLINES'); lines.push('Loan Estimate due: ' + formatDate(deadlines.le_due)); }
  if (deadlines.cd_due) lines.push('Closing Disclosure due: ' + formatDate(deadlines.cd_due));
  if (deadlines.rescission_end) lines.push('Rescission period ends: ' + formatDate(deadlines.rescission_end));
  lines.push(''); lines.push('DISCLOSURE STATUS SUMMARY');
  DISCLOSURE_ITEMS.forEach(item => {
    const status = statuses[item.id];
    const statusLabel = STATUS_OPTIONS.find(s => s.value === status)?.label || status;
    lines.push(item.label + ': ' + statusLabel);
  });
  if (pendingItems.length > 0) {
    lines.push(''); lines.push('PENDING ITEMS REQUIRING ACTION (' + pendingItems.length + ')');
    pendingItems.forEach((item, i) => lines.push((i + 1) + '. ' + item.label + ' — ' + item.deadline));
  }
  if (aiSummary) { lines.push(''); lines.push('AI COMPLIANCE ASSESSMENT'); lines.push(aiSummary); }
  if (loNotes) { lines.push(''); lines.push('LO NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('All disclosure documentation is maintained in the loan file. Please contact me with any questions.');
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions | george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function LetterCard({ title, icon, body }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-3xl border-2 border-indigo-200 bg-indigo-50 overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="font-bold text-slate-700 flex items-center gap-2">{icon} {title}</div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
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
export default function DisclosureIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const [scenario, setScenario]   = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [borrowerName, setBorrowerName] = useState('');

  const [activeTab, setActiveTab] = useState(0);

  // Loan context
  const [applicationDate, setApplicationDate] = useState('');
  const [closingDate, setClosingDate]         = useState('');
  const [loanType, setLoanType]               = useState('');
  const [loanPurpose, setLoanPurpose]         = useState('');
  const [adverseActionDate, setAdverseActionDate] = useState('');

  // Disclosure tracking
  const [statuses, setStatuses] = useState(
    Object.fromEntries(DISCLOSURE_ITEMS.map(i => [i.id, 'pending']))
  );
  const [notes, setNotes] = useState(
    Object.fromEntries(DISCLOSURE_ITEMS.map(i => [i.id, '']))
  );

  // AI
  const [aiAnalysis, setAiAnalysis]   = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const [loNotes, setLoNotes] = useState('');
  const [recordSaving, setRecordSaving]   = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(scenarioId);

  // ─── localStorage ─────────────────────────────────────────────────────────
  const lsKey = scenarioId ? `lb_disclosure_${scenarioId}` : null;

  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({
      applicationDate, closingDate, loanType, loanPurpose, adverseActionDate,
      statuses, notes, loNotes, aiAnalysis, savedRecordId,
    }));
  }, [lsKey, applicationDate, closingDate, loanType, loanPurpose, adverseActionDate, statuses, notes, loNotes, aiAnalysis, savedRecordId]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error).finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.applicationDate)   setApplicationDate(saved.applicationDate);
          if (saved.closingDate)       setClosingDate(saved.closingDate);
          if (saved.loanType)          setLoanType(saved.loanType);
          if (saved.loanPurpose)       setLoanPurpose(saved.loanPurpose);
          if (saved.adverseActionDate) setAdverseActionDate(saved.adverseActionDate);
          if (saved.statuses)          setStatuses(saved.statuses);
          if (saved.notes)             setNotes(saved.notes);
          if (saved.loNotes)           setLoNotes(saved.loNotes);
          if (saved.aiAnalysis)        setAiAnalysis(saved.aiAnalysis);
          if (saved.savedRecordId)     setSavedRecordId(saved.savedRecordId);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        if (d.loanType) setLoanType(prev => prev || d.loanType);
        const purpose = d.loanPurpose || d.purpose || '';
        if (purpose) {
          const mapped = purpose.toLowerCase().includes('purchase') ? 'purchase' : purpose.toLowerCase().includes('cash') ? 'cash_out' : purpose.toLowerCase().includes('refi') ? 'refinance' : '';
          if (mapped) setLoanPurpose(prev => prev || mapped);
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // Auto-set N/A based on loan type / purpose
  useEffect(() => {
    if (!loanPurpose && !loanType) return;
    setStatuses(prev => {
      const next = { ...prev };
      if (loanPurpose === 'purchase') {
        if (next.right_of_rescission === 'pending') next.right_of_rescission = 'na';
      }
      if (loanType !== 'ARM') {
        if (next.charm_booklet === 'pending') next.charm_booklet = 'na';
      } else {
        if (next.charm_booklet === 'na') next.charm_booklet = 'pending';
      }
      if (loanPurpose !== 'purchase') {
        if (next.special_info_booklet === 'pending') next.special_info_booklet = 'na';
      } else {
        if (next.special_info_booklet === 'na') next.special_info_booklet = 'pending';
      }
      return next;
    });
  }, [loanPurpose, loanType]);

  // ─── Deadline Calculations ─────────────────────────────────────────────────
  const deadlines = useMemo(() => {
    const d = {};
    if (applicationDate) {
      d.le_due = addBusinessDays(applicationDate, 3);
    }
    if (closingDate) {
      d.cd_due = subtractBusinessDays(closingDate, 3);
      d.rescission_end = addBusinessDays(closingDate, 3);
      d.fund_date = addBusinessDays(closingDate, 3);
    }
    if (adverseActionDate) {
      d.adverse_action_due = addBusinessDays(adverseActionDate, 21);
    }
    return d;
  }, [applicationDate, closingDate, adverseActionDate]);

  // ─── Compliance Score ──────────────────────────────────────────────────────
  const applicable = DISCLOSURE_ITEMS.filter(item =>
    item.applies === undefined || item.applies(loanPurpose, loanType) !== false
  );
  const issuedCount    = Object.values(statuses).filter(s => s === 'issued' || s === 'received').length;
  const naCount        = Object.values(statuses).filter(s => s === 'na' || s === 'waived').length;
  const pendingCount   = DISCLOSURE_ITEMS.length - issuedCount - naCount;
  const complianceScore = Math.round(((issuedCount + naCount) / DISCLOSURE_ITEMS.length) * 100);
  const pendingItems   = DISCLOSURE_ITEMS.filter(item => statuses[item.id] === 'pending');
  const criticalPending = pendingItems.filter(item => item.severity === 'critical');

  // ─── AI Analysis ──────────────────────────────────────────────────────────
  const handleAIAnalysis = async () => {
    setAiAnalyzing(true);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1200,
          messages: [{ role: 'user', content: `You are a senior mortgage compliance officer. Review this disclosure tracking file and identify compliance risks.

LOAN INFO:
- Loan Type: ${loanType || 'Not specified'}
- Loan Purpose: ${loanPurpose || 'Not specified'}
- Application Date: ${applicationDate ? formatDate(applicationDate) : 'Not entered'}
- Closing Date: ${closingDate ? formatDate(closingDate) : 'Not entered'}
- LE Due: ${deadlines.le_due ? formatDate(deadlines.le_due) : 'Not calculated'}
- CD Due: ${deadlines.cd_due ? formatDate(deadlines.cd_due) : 'Not calculated'}

DISCLOSURE STATUS:
${DISCLOSURE_ITEMS.map(item => `${item.label}: ${statuses[item.id]} (${item.regulation})`).join('\n')}

Compliance Score: ${complianceScore}%
Pending Items: ${pendingCount}
Critical Pending: ${criticalPending.map(i => i.label).join(', ') || 'None'}

Return ONLY valid JSON: {"riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","summary":"2-3 sentence compliance assessment","criticalIssues":["list critical violations or risks"],"actionItems":["specific immediate actions needed"],"watchOuts":["compliance pitfalls for this loan type"],"clearanceReady":true_or_false}` }],
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

  // ─── Decision Record ───────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const riskFlags = [];
      if (criticalPending.length > 0) {
        criticalPending.forEach(item => riskFlags.push({ field: item.id, message: item.label + ' — pending', severity: 'HIGH' }));
      }
      if (deadlines.le_due && daysUntil(deadlines.le_due) < 0) riskFlags.push({ field: 'le_due', message: 'Loan Estimate deadline has passed', severity: 'HIGH' });
      if (deadlines.cd_due && daysUntil(deadlines.cd_due) < 0) riskFlags.push({ field: 'cd_due', message: 'Closing Disclosure deadline has passed', severity: 'HIGH' });
      const writtenId = await reportFindings({
        verdict: complianceScore >= 80 ? 'Compliant' : complianceScore >= 50 ? 'In Progress' : 'Action Required',
        summary: `Disclosure Intelligence — ${loanType || 'Loan'} ${loanPurpose || ''} · Compliance score: ${complianceScore}% · ${issuedCount} issued · ${pendingCount} pending · ${naCount} N/A`,
        riskFlags,
        findings: {
          loanType, loanPurpose, applicationDate, closingDate,
          complianceScore, issuedCount, pendingCount, naCount,
          statuses, pendingItems: pendingItems.map(i => i.id),
          deadlines, loNotes,
        },
        completeness: {
          appDateEntered: !!applicationDate, closingDateEntered: !!closingDate,
          loanTypeSet: !!loanType, noOutstandingCritical: criticalPending.length === 0,
        },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const TABS = [
    { id: 0, label: 'Deadline Tracker', icon: '📅' },
    { id: 1, label: 'Disclosure Checklist', icon: '📋' },
    { id: 2, label: 'AI Assessment', icon: '🤖' },
    { id: 3, label: 'Regulation Guide', icon: '📚' },
  ];

  const riskColor = { LOW: 'text-emerald-700 bg-emerald-100 border-emerald-300', MEDIUM: 'text-amber-700 bg-amber-100 border-amber-300', HIGH: 'text-red-700 bg-red-100 border-red-300', CRITICAL: 'text-red-900 bg-red-200 border-red-500' };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">📋</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  if (!scenarioId) return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <div className="bg-slate-900 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 14</div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Disclosure Intelligence™</h1>
          <p className="text-slate-400">TRID · RESPA · ECOA · Deadline tracking · Compliance scoring</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-slate-400 text-sm">No scenarios found.</p> :
            <div className="space-y-2">{scenarios.map(s => (
              <button key={s.id} onClick={() => navigate('/disclosure-intel?scenarioId=' + s.id)}
                className="w-full text-left p-4 border border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                <div className="flex justify-between items-center">
                  <div><div className="font-bold text-slate-800">{s.scenarioName || ([s.firstName, s.lastName].filter(Boolean).join(' ')) || 'Unnamed'}</div><div className="text-xs text-slate-500 mt-0.5">{fmt0(s.loanAmount)} · {s.loanType}</div></div>
                  <span className="text-indigo-400 text-xl">→</span>
                </div>
              </button>
            ))}</div>
          }
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #6366f1 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 14</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Disclosure Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl">TRID · RESPA · ECOA · Deadline calculator · Compliance tracking · AI risk assessment</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px' }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{loanType || '--'} · {loanPurpose || '--'}</div>
                  <div className={'text-sm font-bold mt-1 ' + (complianceScore >= 80 ? 'text-emerald-400' : complianceScore >= 50 ? 'text-amber-400' : 'text-red-400')}>
                    {complianceScore}% compliant · {pendingCount} pending
                  </div>
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
              {loanPurpose && <span>Purpose <strong className="text-white">{loanPurpose}</strong></span>}
              {deadlines.le_due && <span>LE Due <strong className="text-white">{formatDate(deadlines.le_due)}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Disclosure Intelligence™" moduleNumber="14" scenarioId={scenarioId} />
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2"><DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="DISCLOSURE_INTEL" /></div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all ' + (activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 1 && pendingCount > 0 && <span className={'text-xs px-2 py-0.5 rounded-full font-black ' + (criticalPending.length > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{pendingCount}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* ─── TAB 0: DEADLINE TRACKER ────────────────────────────────── */}
            {activeTab === 0 && (
              <>
                {/* Loan Context */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Loan Context</h2>
                    <p className="text-slate-400 text-sm mt-1">Enter application and closing dates — all TRID/RESPA deadlines auto-calculate from these two dates.</p>
                  </div>
                  <div className="p-8 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Application Date <span className="text-indigo-500">★ Triggers LE deadline</span></label>
                        <input type="date" value={applicationDate} onChange={e => setApplicationDate(e.target.value)}
                          className="w-full border-2 border-indigo-300 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-indigo-500 bg-indigo-50" />
                        {applicationDate && <div className="text-xs text-indigo-600 mt-1.5 font-semibold">LE must be delivered by: {formatDate(deadlines.le_due)}</div>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Estimated Closing Date <span className="text-indigo-500">★ Triggers CD deadline</span></label>
                        <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)}
                          className="w-full border-2 border-indigo-300 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-indigo-500 bg-indigo-50" />
                        {closingDate && <div className="text-xs text-indigo-600 mt-1.5 font-semibold">CD must be received by: {formatDate(deadlines.cd_due)}</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Type</label>
                        <select value={loanType} onChange={e => setLoanType(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                          <option value="">Select…</option>
                          {['Conventional','FHA','VA','USDA','ARM','Jumbo','Non-QM'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Purpose</label>
                        <select value={loanPurpose} onChange={e => setLoanPurpose(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                          <option value="">Select…</option>
                          <option value="purchase">Purchase</option>
                          <option value="refinance">Rate/Term Refinance</option>
                          <option value="cash_out">Cash-Out Refinance</option>
                        </select>
                      </div>
                    </div>
                    {(loanPurpose === 'refinance' || loanPurpose === 'cash_out') && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Adverse Action Date (if applicable)</label>
                        <input type="date" value={adverseActionDate} onChange={e => setAdverseActionDate(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-indigo-400" />
                        {adverseActionDate && <div className="text-xs text-red-600 mt-1.5 font-semibold">Adverse Action Notice due by: {formatDate(deadlines.adverse_action_due)}</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Deadline Timeline */}
                {(applicationDate || closingDate) && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-800 to-indigo-700 px-8 py-5">
                      <h2 className="text-xl font-bold text-white">📅 Compliance Deadline Timeline</h2>
                      <p className="text-indigo-200 text-sm mt-1">All deadlines auto-calculated in business days — federal holidays excluded</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {[
                        { label: 'Application Date', date: applicationDate, note: 'TRID clock starts', icon: '🏁', severity: 'neutral' },
                        { label: 'Loan Estimate (LE) Due', date: deadlines.le_due, note: '3 business days from application', icon: '📄', severity: 'critical' },
                        { label: 'Closing Disclosure (CD) Must Be Received', date: deadlines.cd_due, note: '3 business days before closing', icon: '📋', severity: 'critical' },
                        { label: 'Estimated Closing Date', date: closingDate, note: 'Consummation', icon: '🔑', severity: 'neutral' },
                        ...(loanPurpose === 'refinance' || loanPurpose === 'cash_out' ? [
                          { label: 'Right of Rescission Expires', date: deadlines.rescission_end, note: '3 business days after closing (refi primary only)', icon: '🔄', severity: 'high' },
                          { label: 'Funds Can Disburse', date: deadlines.fund_date, note: 'After rescission period', icon: '💰', severity: 'neutral' },
                        ] : []),
                      ].filter(row => row.date).map(row => {
                        const days = daysUntil(row.date);
                        const isPast = days < 0;
                        const isUrgent = days >= 0 && days <= 2;
                        return (
                          <div key={row.label} className={'flex items-center justify-between px-8 py-4 ' + (isUrgent ? 'bg-red-50' : isPast ? 'bg-slate-50' : '')}>
                            <div className="flex items-center gap-4">
                              <span className="text-xl">{row.icon}</span>
                              <div>
                                <div className={'text-sm font-bold ' + (row.severity === 'critical' ? 'text-indigo-800' : 'text-slate-800')}>{row.label}</div>
                                <div className="text-xs text-slate-500">{row.note}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-slate-800">{formatDate(row.date)}</div>
                              {days !== null && (
                                <div className={'text-xs font-bold ' + (isPast ? 'text-red-600' : isUrgent ? 'text-red-500' : days <= 7 ? 'text-amber-600' : 'text-emerald-600')}>
                                  {isPast ? Math.abs(days) + ' days ago' : days === 0 ? 'TODAY' : days + ' days away'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!applicationDate && !closingDate && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-8 text-center">
                    <div className="text-4xl mb-3">📅</div>
                    <p className="text-indigo-700 font-semibold">Enter application date and closing date above</p>
                    <p className="text-indigo-500 text-sm mt-1">All TRID and RESPA deadlines will calculate automatically in business days</p>
                  </div>
                )}
              </>
            )}

            {/* ─── TAB 1: CHECKLIST ────────────────────────────────────────── */}
            {activeTab === 1 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                  <h2 className="text-xl font-bold text-white">Disclosure Checklist</h2>
                  <p className="text-slate-400 text-sm mt-1">Track status for all 10 required disclosures · Items auto-set N/A based on loan type and purpose</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {DISCLOSURE_ITEMS.map(item => {
                    const status = statuses[item.id];
                    const statusObj = STATUS_OPTIONS.find(s => s.value === status);
                    const deadlineDate = item.deadlineKey ? deadlines[item.deadlineKey] : null;
                    const days = deadlineDate ? daysUntil(deadlineDate) : null;
                    const isUrgent = days !== null && days >= 0 && days <= 2 && status === 'pending';
                    return (
                      <div key={item.id} className={'p-6 transition-colors ' + (isUrgent ? 'bg-red-50' : 'hover:bg-slate-50')}>
                        <div className="flex items-start gap-4">
                          <span className="text-2xl mt-0.5 shrink-0">{item.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-bold text-slate-800">{item.label}</span>
                              <span className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-lg font-semibold">{item.regulation}</span>
                              {item.severity === 'critical' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg font-bold">CRITICAL</span>}
                            </div>
                            <p className="text-xs text-slate-500 mb-2">{item.description}</p>
                            <div className="text-xs text-amber-600 font-semibold mb-2">⏱ {item.deadline}{deadlineDate ? ' → ' + formatDate(deadlineDate) : ''}</div>
                            {isUrgent && <div className="text-xs text-red-700 font-bold bg-red-100 rounded-xl px-3 py-1.5 mb-2">🚨 {days === 0 ? 'DUE TODAY' : days + ' day(s) remaining — action required immediately'}</div>}
                            <input type="text" value={notes[item.id]} onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Add notes (date issued, tracking #, exception reason...)"
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-400 bg-slate-50" />
                            {item.tips && <p className="text-xs text-slate-400 mt-2 italic">💡 {item.tips}</p>}
                          </div>
                          <div className="shrink-0">
                            <select value={status} onChange={e => setStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className={'text-xs border-2 rounded-2xl px-3 py-2 font-bold focus:outline-none cursor-pointer ' + (statusObj?.color || 'border-slate-200 bg-slate-50 text-slate-500')}>
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-6 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-500">{issuedCount} issued · {pendingCount} pending · {naCount} N/A</div>
                    <button onClick={handleSaveToRecord} disabled={recordSaving}
                      className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                      {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── TAB 2: AI ASSESSMENT ────────────────────────────────────── */}
            {activeTab === 2 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Compliance Assessment</h2>
                    <p className="text-slate-400 text-sm mt-1">Sonnet reviews the disclosure file and flags compliance risks specific to this loan type</p>
                  </div>
                  <div className="p-8">
                    {!aiAnalysis ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-slate-500 text-sm mb-4">Run AI assessment to identify compliance risks, action items, and loan-type-specific watch-outs.</p>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing}
                          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors">
                          {aiAnalyzing ? 'Analyzing...' : '🤖 Run AI Compliance Assessment'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className={'inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-black text-sm ' + (riskColor[aiAnalysis.riskLevel] || riskColor.MEDIUM)}>
                          {aiAnalysis.riskLevel === 'LOW' ? '✅' : aiAnalysis.riskLevel === 'MEDIUM' ? '⚠️' : '🚨'} Risk Level: {aiAnalysis.riskLevel}
                          {aiAnalysis.clearanceReady && <span className="ml-2 text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">Ready for Clearance</span>}
                        </div>
                        <p className="text-slate-700 leading-relaxed">{aiAnalysis.summary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[['🚨 Critical Issues', aiAnalysis.criticalIssues, 'red'], ['✅ Action Items', aiAnalysis.actionItems, 'blue'], ['⚠️ Watch-Outs', aiAnalysis.watchOuts, 'amber']].map(([label, items, color]) => (
                            <div key={label} className={`rounded-2xl border p-4 bg-${color}-50 border-${color}-200`}>
                              <div className={`text-xs font-bold text-${color}-700 mb-2`}>{label}</div>
                              <ul className="space-y-1">{(items || []).map((item, i) => <li key={i} className={`text-xs text-${color}-800 flex gap-2`}><span className="shrink-0">•</span><span>{item}</span></li>)}</ul>
                            </div>
                          ))}
                        </div>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing} className="text-xs text-indigo-600 hover:text-indigo-500 font-semibold">{aiAnalyzing ? 'Re-analyzing...' : '↺ Re-run'}</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* LO Notes */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">LO Notes</h2></div>
                  <div className="p-8">
                    <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={4}
                      placeholder="Exception documentation, timing notes, lender instructions, re-disclosure triggers, borrower acknowledgments..."
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                    <div className="mt-4 flex justify-end">
                      <button onClick={handleSaveToRecord} disabled={recordSaving}
                        className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                        {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Compliance Letter */}
                <LetterCard title="Compliance Summary Letter" icon="📋" body={buildComplianceLetter({
                  borrowerName, loanType, loanPurpose, applicationDate, closingDate,
                  deadlines, statuses, complianceScore, pendingItems, loNotes, aiSummary: aiAnalysis?.summary,
                })} />
              </>
            )}

            {/* ─── TAB 3: REGULATION GUIDE ─────────────────────────────────── */}
            {activeTab === 3 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">TRID / RESPA / ECOA Quick Reference</h2>
                    <p className="text-slate-400 text-sm mt-1">Key rules every LO must know — regulations, deadlines, and compliance tips</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      { law: 'TRID', full: 'TILA-RESPA Integrated Disclosure Rule', color: 'indigo', rules: [
                        'LE must be delivered within 3 business days of complete application (6 required pieces)',
                        'CD must be RECEIVED at least 3 business days before consummation',
                        'Revised LE required if APR increases >0.125%, loan product changes, or prepayment penalty added',
                        '7 business day waiting period between LE delivery and consummation (cannot waive)',
                        'Changed circumstances must be documented to justify revised LE',
                      ]},
                      { law: 'RESPA', full: 'Real Estate Settlement Procedures Act', color: 'blue', rules: [
                        'Section 5: Homebuying guide required for purchases within 3 business days of application',
                        'Section 6: Servicing disclosure required within 3 business days of application',
                        'Section 8: Anti-kickback — cannot give or receive referral fees for settlement services',
                        'Section 8(c)(4): Affiliated Business Arrangement disclosure before referral',
                        'Section 9: Cannot require use of specific title company',
                      ]},
                      { law: 'ECOA / Reg B', full: 'Equal Credit Opportunity Act', color: 'violet', rules: [
                        'Appraisal notice required within 3 business days of application',
                        'Appraisal copy must be provided at least 3 business days before consummation',
                        'Adverse action notice required within 30 days — must state specific reasons',
                        'Cannot discriminate based on race, color, religion, sex, national origin, age, marital status',
                        'Joint credit: must report credit history in names of all applicants',
                      ]},
                      { law: 'Reg Z', full: 'Truth in Lending Act', color: 'emerald', rules: [
                        'Right of rescission: 3 business days for primary residence refinances only',
                        'CHARM booklet: required for all ARM products at or before application',
                        'APR must be disclosed and accurate within 0.125% tolerance (0.25% for irregular transactions)',
                        'Finance charge must be accurate within $100 tolerance',
                        'Higher-priced mortgage loans have additional requirements (escrow, appraisal)',
                      ]},
                    ].map(section => (
                      <div key={section.law} className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`text-xs font-black px-3 py-1.5 rounded-xl bg-${section.color}-100 text-${section.color}-800`}>{section.law}</span>
                          <span className="text-sm text-slate-500">{section.full}</span>
                        </div>
                        <ul className="space-y-2">
                          {section.rules.map((rule, i) => (
                            <li key={i} className="flex gap-2 text-xs text-slate-600"><span className="shrink-0 text-indigo-500 mt-0.5">•</span><span>{rule}</span></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Business Day Definition */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-6">
                  <div className="font-bold text-indigo-800 mb-3">📅 What Counts as a "Business Day"?</div>
                  <div className="space-y-2 text-xs text-indigo-800">
                    <p><strong>For LE and CD delivery (TRID):</strong> All calendar days EXCEPT Sundays and federal public holidays. Saturdays count.</p>
                    <p><strong>For Right of Rescission (Reg Z):</strong> All calendar days EXCEPT Sundays and federal public holidays. Saturdays count.</p>
                    <p><strong>For Adverse Action (ECOA):</strong> Any day that is not a Saturday, Sunday, or federal holiday. This module uses this stricter definition for all calculations.</p>
                    <p><strong>Federal Holidays:</strong> New Year's Day, MLK Day, Presidents Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas.</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Compliance Score</div>
              <div className="text-center mb-5">
                <div className={'text-5xl font-black ' + (complianceScore >= 80 ? 'text-emerald-400' : complianceScore >= 50 ? 'text-amber-400' : 'text-red-400')}>{complianceScore}%</div>
                <div className="text-slate-400 text-sm mt-1">{issuedCount} issued · {pendingCount} pending · {naCount} N/A</div>
                <div className="mt-3 bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div className={'h-full rounded-full transition-all ' + (complianceScore >= 80 ? 'bg-emerald-400' : complianceScore >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: complianceScore + '%' }} />
                </div>
              </div>

              {/* Critical pending */}
              {criticalPending.length > 0 && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-2xl p-4 mb-4">
                  <div className="text-xs font-bold text-red-400 uppercase mb-2">🚨 Critical Pending</div>
                  {criticalPending.map(item => (
                    <div key={item.id} className="text-xs text-red-300 mb-1 flex gap-1.5"><span className="shrink-0">•</span><span>{item.label}</span></div>
                  ))}
                </div>
              )}

              {/* Key deadlines */}
              {(deadlines.le_due || deadlines.cd_due) && (
                <div className="space-y-2 mb-4">
                  {deadlines.le_due && (
                    <div className={'rounded-2xl border p-3 ' + (daysUntil(deadlines.le_due) < 0 ? 'bg-red-900/30 border-red-700/50' : daysUntil(deadlines.le_due) <= 1 ? 'bg-amber-900/30 border-amber-700/50' : 'bg-slate-800 border-slate-700')}>
                      <div className="text-xs text-slate-400 mb-0.5">LE Due</div>
                      <div className="text-sm font-black text-white">{formatDate(deadlines.le_due)}</div>
                      <div className={'text-xs font-bold ' + (daysUntil(deadlines.le_due) < 0 ? 'text-red-400' : 'text-slate-400')}>
                        {daysUntil(deadlines.le_due) < 0 ? 'PAST DUE' : daysUntil(deadlines.le_due) + ' days away'}
                      </div>
                    </div>
                  )}
                  {deadlines.cd_due && (
                    <div className={'rounded-2xl border p-3 ' + (daysUntil(deadlines.cd_due) < 0 ? 'bg-red-900/30 border-red-700/50' : daysUntil(deadlines.cd_due) <= 2 ? 'bg-amber-900/30 border-amber-700/50' : 'bg-slate-800 border-slate-700')}>
                      <div className="text-xs text-slate-400 mb-0.5">CD Must Be Received By</div>
                      <div className="text-sm font-black text-white">{formatDate(deadlines.cd_due)}</div>
                      <div className={'text-xs font-bold ' + (daysUntil(deadlines.cd_due) < 0 ? 'text-red-400' : 'text-slate-400')}>
                        {daysUntil(deadlines.cd_due) < 0 ? 'PAST DUE' : daysUntil(deadlines.cd_due) + ' days away'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiAnalysis?.riskLevel && (
                <div className={'rounded-2xl p-3 border text-center ' + (aiAnalysis.riskLevel === 'LOW' ? 'bg-emerald-900/30 border-emerald-700/50' : aiAnalysis.riskLevel === 'MEDIUM' ? 'bg-amber-900/30 border-amber-700/50' : 'bg-red-900/30 border-red-700/50')}>
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
                  'LE must be DELIVERED within 3 business days — receipt of 6th piece triggers clock',
                  'CD must be RECEIVED 3 business days before closing — not just sent',
                  'Saturdays count as business days for TRID disclosures',
                  'APR change >0.125% requires revised LE and new 3-day waiting period',
                  'Right of rescission: refi of primary residence ONLY — not purchases',
                  'CHARM booklet: required at ARM application — not closing',
                  'Adverse action: must state specific reasons — vague reasons are violations',
                ].map(rule => <li key={rule} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0">•</span><span>{rule}</span></li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <CanonicalSequenceBar currentModuleKey="DISCLOSURE_INTEL" scenarioId={scenarioId} recordId={savedRecordId} />
    </div>
  );
}
