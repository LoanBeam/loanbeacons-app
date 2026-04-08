/**
 * DealAdvisor™ — AUS Rescue Conversational Deal Advisor v3.0
 *
 * New in v3:
 * - Early agency failure detection (credit history blocker → skip to verdict immediately)
 * - Deal Verdict: Option 1 (Non-QM now) + Option 2 (Wait + rebuild)
 * - LenderMatch Firestore search for Non-QM lenders BEFORE any other suggestion
 * - Two-option borrower letter when all agency paths fail
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const STORAGE_KEY   = (id) => `lb_dealadvisor3_${id}`;

// ── Agency failure detection ───────────────────────────────────────────────────
const AGENCY_PROGRAMS = ['fha','conventional','homeready','home possible','va','usda','fannie','freddie'];
const CREDIT_BLOCKERS = ['mortgage late','late payment','delinquent','60 day','90 day','bankruptcy','foreclosure','caution','msg 3895','fcl0433','credit standard'];

// ── Deal Sappers — hard stops that bypass agency strategy loop ─────────────────
const DEAL_SAPPERS = [
  {
    id: 'mortgage_late_12m',
    label: 'Mortgage Late in Last 12 Months',
    icon: '🏠',
    severity: 'hard_stop',
    agencyBlocks: ['fha','conventional','homeready','home possible','va','usda'],
    contextPrompt: 'Borrower has a documented mortgage late within the last 12 months.',
    explainableBy: ['divorce','death','medical','job loss','natural disaster'],
    nonQMNote: 'Non-QM lenders can manually underwrite around a single mortgage late when a documented life event explains it — especially with strong LTV.',
    requiresContext: true,
    contextLabel: 'Explain the circumstance (e.g. divorce, medical, job loss)',
    contextPlaceholder: 'e.g. Property awarded in divorce Dec 2024 — mortgage late Dec 2025 during ownership transfer. Not yet on credit report.',
  },
  {
    id: 'bankruptcy_2yr',
    label: 'Bankruptcy Discharged Within 2 Years',
    icon: '⚖️',
    severity: 'hard_stop',
    agencyBlocks: ['conventional','homeready','home possible'],
    nonQMNote: 'Chapter 7 < 2 years = conventional hard stop. FHA requires 2 years from discharge. Non-QM portfolio lenders can go 1-day-out-of-bankruptcy.',
    requiresContext: true,
    contextLabel: 'Chapter type and discharge date',
    contextPlaceholder: 'e.g. Chapter 7, discharged March 2024',
  },
  {
    id: 'foreclosure_3yr',
    label: 'Foreclosure or Deed-in-Lieu Within 3 Years',
    icon: '🔑',
    severity: 'hard_stop',
    agencyBlocks: ['fha','conventional','homeready','home possible','va','usda'],
    nonQMNote: 'All agency programs require 3-7 year waiting periods post-foreclosure. Non-QM lenders can approve 1 day out.',
    requiresContext: true,
    contextLabel: 'Completion date of foreclosure',
    contextPlaceholder: 'e.g. Foreclosure completed January 2024',
  },
  {
    id: 'short_sale_2yr',
    label: 'Short Sale Within 2 Years',
    icon: '📉',
    severity: 'hard_stop',
    agencyBlocks: ['conventional','homeready','home possible'],
    nonQMNote: 'Conventional requires 4 years from short sale. FHA 3 years. Non-QM can go day-1 post short sale.',
    requiresContext: true,
    contextLabel: 'Short sale completion date',
    contextPlaceholder: 'e.g. Short sale completed June 2024',
  },
  {
    id: 'divorce_property_award',
    label: 'Property Awarded in Divorce (Mortgage Not on Credit)',
    icon: '📋',
    severity: 'context',
    agencyBlocks: [],
    nonQMNote: 'Underwriters need the divorce decree to verify ownership transfer and explain any payment history gaps.',
    requiresContext: true,
    contextLabel: 'Date property was awarded',
    contextPlaceholder: 'e.g. Divorce final Dec 2024 — property awarded, name not yet on title/credit report',
  },
  {
    id: 'multiple_lates',
    label: '3+ Mortgage Lates in Last 24 Months',
    icon: '⚠️',
    severity: 'hard_stop',
    agencyBlocks: ['fha','conventional','homeready','home possible','va','usda'],
    nonQMNote: 'Pattern delinquency severely limits Non-QM options too — only specialty credit repair programs and hard money remain.',
    requiresContext: false,
    contextLabel: null,
  },
  {
    id: 'active_collections',
    label: 'Active Collections or Charge-Offs (Non-Medical)',
    icon: '📁',
    severity: 'caution',
    agencyBlocks: [],
    nonQMNote: 'Collections under $2,000 typically ignorable on conventional. Over $2,000 may require payoff or letter of explanation.',
    requiresContext: true,
    contextLabel: 'Total collections amount and number of accounts',
    contextPlaceholder: 'e.g. 2 accounts totaling $4,200',
  },
  {
    id: 'self_employed_declining',
    label: 'Self-Employed with Declining Income (2yr)',
    icon: '📊',
    severity: 'caution',
    agencyBlocks: [],
    nonQMNote: 'Bank statement Non-QM uses deposits rather than tax returns — ideal when write-offs cause declining income on paper.',
    requiresContext: true,
    contextLabel: 'Year 1 vs Year 2 net income',
    contextPlaceholder: 'e.g. 2023: $85K, 2024: $62K — client has strong bank deposits',
  },
  {
    id: 'recent_job_change',
    label: 'Job Change Less Than 2 Years (Non-Same Field)',
    icon: '💼',
    severity: 'caution',
    agencyBlocks: [],
    nonQMNote: 'Same-field job changes are acceptable. Different industry changes within 2 years create income history gaps.',
    requiresContext: true,
    contextLabel: 'Previous and current employment',
    contextPlaceholder: 'e.g. Left nursing 6 months ago, now in real estate sales',
  },
  {
    id: 'property_condition',
    label: 'Property Has Condition Issues (Needs Repairs)',
    icon: '🏚️',
    severity: 'caution',
    agencyBlocks: ['conventional','homeready','home possible','va','usda'],
    nonQMNote: 'FHA 203k or Fannie HomeStyle for rehabbers. Non-QM bridge/hard money if condition too poor for any agency program.',
    requiresContext: true,
    contextLabel: 'Describe the condition issues',
    contextPlaceholder: 'e.g. Roof needs replacement, kitchen non-functional',
  },
];

function getSapperHardStops(activeSappers) {
  return activeSappers.filter(s => {
    const def = DEAL_SAPPERS.find(d => d.id === s.id);
    return def?.severity === 'hard_stop';
  });
}

function buildSapperContext(activeSappers) {
  if (!activeSappers.length) return '';
  const lines = ['\nLO-REPORTED DEAL SAPPERS (critical context — use this to inform all advice):'];
  activeSappers.forEach(s => {
    const def = DEAL_SAPPERS.find(d => d.id === s.id);
    if (!def) return;
    lines.push(`  ⚠ ${def.label}${s.context ? ` — "${s.context}"` : ''}`);
    if (def.nonQMNote) lines.push(`    Non-QM note: ${def.nonQMNote}`);
    if (def.id === 'divorce_property_award') lines.push(`    IMPORTANT: Mortgage late during divorce property transfer is explainable with divorce decree — do NOT treat as pattern delinquency.`);
  });
  return lines.join('\n');
}

function isAgencyExhausted(barriers) {
  if (barriers.length < 2) return false;
  const allText = barriers.map(b => (b.reason || '').toLowerCase()).join(' ');
  const agencyBlocked = AGENCY_PROGRAMS.filter(prog =>
    barriers.some(b => b.program?.toLowerCase().includes(prog) || b.reason?.toLowerCase().includes(prog))
  );
  const hasCreditBlocker = CREDIT_BLOCKERS.some(kw => allText.includes(kw));
  return agencyBlocked.length >= 3 || (agencyBlocked.length >= 2 && hasCreditBlocker);
}

// ── Web search for Non-QM lenders when LenderMatch is empty ───────────────────
async function searchNonQMLendersOnline(profile) {
  try {
    const fico  = profile?.creditScore || 'mid-600s';
    const ltv   = profile?.ltv        || 'under 65%';
    const query = `Non-QM mortgage lenders 2025 refinance credit score ${fico} LTV ${ltv} mortgage late single family primary residence Georgia`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: 'You are a mortgage industry researcher. Search for Non-QM lenders that can approve a refinance with a single mortgage late, FICO in the mid-600s, and very low LTV. Return ONLY a JSON array — no markdown — of up to 6 lenders. Each object: {"name":"Lender Name","nmls":"NMLS# if found","specialty":"what they are known for","website":"website url","whyGood":"1 sentence on why this lender fits this profile"}',
        messages: [{ role: 'user', content: `Search for Non-QM lenders that can approve: ${query}. Return JSON array only.` }],
      }),
    });
    const data = await res.json();
    // Extract text from all content blocks including after tool use
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!textBlocks) return [];
    const match = textBlocks.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const lenders = JSON.parse(match[0]);
    return lenders.map(l => ({ ...l, fromWeb: true }));
  } catch (err) {
    console.warn('Non-QM web search failed:', err.message);
    return [];
  }
}
async function fetchNonQMLenders() {
  try {
    const snap = await getDocs(
      query(collection(db, 'lenders'),
        where('lenderType', 'in', ['non-qm','Non-QM','nonqm','hard_money','Hard Money'])
      )
    );
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allSnap = await getDocs(collection(db, 'lenders'));
    return allSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => {
      const t = (l.lenderType || l.type || l.program || '').toLowerCase();
      return t.includes('non') || t.includes('qm') || t.includes('portfolio') || t.includes('hard');
    });
  } catch (err) {
    console.warn('LenderMatch fetch failed:', err.message);
    return [];
  }
}

// ── API Helper — Sonnet for analysis/reasoning ────────────────────────────────
async function callSonnet(messages, systemPrompt, maxTokens = 1200) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || '';
}

// ── API Helper — Haiku for letter generation (higher rate limits, lower cost) ──
async function callHaiku(messages, systemPrompt, maxTokens = 1200) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || '';
}

// ── Context builder ────────────────────────────────────────────────────────────
function buildFindingsContext(findings) {
  if (!findings) return 'No DU findings uploaded yet.';
  const f = findings;
  const lines = [
    `LOAN PURPOSE: ${f.loanPurpose || 'Unknown'}${f.refiPurpose ? ` (${f.refiPurpose})` : ''}`,
    `AUS RECOMMENDATION: ${f.recommendation || f.finding || 'Unknown'}`,
    `BORROWER: ${f.borrowerName || 'Unknown'} | PROPERTY: ${f.propertyAddress || 'Unknown'}`,
    `CREDIT SCORE: ${f.creditScore || 'Unknown'} (all scores: ${f.allCreditScores?.join(', ') || 'N/A'})`,
    `BACK-END DTI: ${f.backEndDTI || 'Unknown'}% | FRONT-END DTI: ${f.frontEndDTI || 'Unknown'}%`,
    `LOAN AMOUNT: ${f.loanAmount ? `$${f.loanAmount.toLocaleString()}` : 'Unknown'} | APPRAISED VALUE: ${f.appraisedValue ? `$${f.appraisedValue.toLocaleString()}` : 'Unknown'}`,
    `LTV: ${f.ltv || 'Unknown'}% | NOTE RATE: ${f.noteRate || f.interestRate || 'Unknown'}%`,
    `RESERVES: ${f.reservesMonths || 'Unknown'} months | MONTHLY INCOME: ${f.monthlyIncome ? `$${f.monthlyIncome.toLocaleString()}` : 'Unknown'}`,
    f.cashBack ? `CASH BACK: $${f.cashBack.toLocaleString()}` : null,
    `SUBMISSION #: ${f.submissionNumber || 'Unknown'} | CASEFILE: ${f.caseFileId || 'Unknown'}`,
    '', 'DU MESSAGE IDs: ' + (f.duMessageIds?.join(', ') || 'None'), '',
  ].filter(l => l !== null);
  if (f.duMessages?.length) { lines.push('DU MESSAGES:'); f.duMessages.forEach(m => lines.push(`  MSG ${m.id}: ${m.summary}`)); lines.push(''); }
  if (f.ineligibilityReasons?.length) { lines.push('INELIGIBILITY REASONS:'); f.ineligibilityReasons.forEach((r,i) => lines.push(`  ${i+1}. ${r}`)); lines.push(''); }
  if (f.liabilitiesToPayoff?.length) { lines.push('LIABILITIES TO PAY OFF:'); f.liabilitiesToPayoff.forEach(l => lines.push(`  ${l.creditor}: $${l.balance?.toLocaleString()} balance, $${l.payment}/mo`)); lines.push(''); }
  if (f.strengths?.length) lines.push('STRENGTHS: ' + f.strengths.join(', '));
  if (f.riskFactors?.length) lines.push('RISK FACTORS: ' + f.riskFactors.join(', '));
  return lines.join('\n');
}

// ── System Prompts ─────────────────────────────────────────────────────────────
const buildAdvisorSystem = (ctx) => `You are a senior mortgage loan officer with 20+ years of experience advising colleagues on complex AUS findings.

CRITICAL RULES:
1. Base ALL advice on the actual DU findings below. No assumptions.
2. REFINANCE = NOT a purchase. Never mention down payment. Focus on LTV, liens, cash-back.
3. LTV below 65% is a major compensating factor — always call it out explicitly.
4. DU CASH-OUT MISCALCULATION: When MSG 1772/3629 shows large cash-out but MSG 0119 shows small actual cash back, this is a Line D/E data entry problem — NOT a program switch situation.
5. DSCR = investment properties ONLY. Never suggest for primary residence.
6. CREDIT HISTORY BLOCKER: When a mortgage late, bankruptcy, or delinquency blocks ALL agency programs, say so directly. Do not waste LO time on agency alternatives that will all fail for the same reason. Pivot to Non-QM and wait-rebuild path.
7. Reference actual MSG IDs and exact dollar figures.
8. Speak like a trusted colleague. Direct, 2-3 short paragraphs. No bullet lists.

ACTUAL DU FINDINGS:
${ctx}`;

const LETTER_SYSTEM = `You are a mortgage loan officer writing a professional, empathetic letter to your borrower. First person. Warm, honest, plain English — no acronyms without spelling them out. Natural paragraphs only, no bullet lists or headers inside letter body.`;

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DealAdvisor({ parsedFindings, strategies = [], scenarioId, borrowerName: borrowerNameProp = 'Borrower', loName = 'Your Loan Officer' }) {
  const borrowerName = parsedFindings?.borrowerName || borrowerNameProp || 'Borrower';

  const [phase, setPhase]                   = useState('idle');
  const [brief, setBrief]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [loadingMsg, setLoadingMsg]         = useState('');
  const [thread, setThread]                 = useState([]);
  const [barriers, setBarriers]             = useState([]);
  const [queue, setQueue]                   = useState([]);
  const [activeRec, setActiveRec]           = useState(null);
  const [showBarrierInput, setShowBarrierInput] = useState(false);
  const [barrierText, setBarrierText]       = useState('');
  const [letter, setLetter]                 = useState('');
  const [letterCopied, setLetterCopied]     = useState(false);
  const [confirmedPath, setConfirmedPath]   = useState(null);
  const [verdict, setVerdict]               = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [activeSappers, setActiveSappers]   = useState([]);
  const [showSappers, setShowSappers]       = useState(true);

  const convHistory = useRef([]);
  const bottomRef   = useRef(null);

  useEffect(() => {
    if (!scenarioId || phase === 'idle') return;
    localStorage.setItem(STORAGE_KEY(scenarioId), JSON.stringify({ phase, brief, thread, barriers, queue, activeRec, letter, confirmedPath, verdict, activeSappers }));
  }, [phase, brief, thread, barriers, queue, activeRec, letter, confirmedPath, verdict, activeSappers, scenarioId]);

  useEffect(() => {
    if (!scenarioId) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY(scenarioId));
      if (saved) {
        const d = JSON.parse(saved);
        setPhase(d.phase||'idle'); setBrief(d.brief||''); setThread(d.thread||[]);
        setBarriers(d.barriers||[]); setQueue(d.queue||[]); setActiveRec(d.activeRec||null);
        setLetter(d.letter||''); setConfirmedPath(d.confirmedPath||null); setVerdict(d.verdict||null);
        setActiveSappers(d.activeSappers||[]);
      }
    } catch {}
  }, [scenarioId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread, letter, showBarrierInput, loading, verdict]);

  const findingsCtx = buildFindingsContext(parsedFindings);
  const sapperCtx   = buildSapperContext(activeSappers);
  const SYSTEM      = buildAdvisorSystem(findingsCtx + sapperCtx);
  const isRefi      = !!(parsedFindings?.loanPurpose?.toLowerCase().includes('refi') || parsedFindings?.refiPurpose);

  // Sapper helpers
  const toggleSapper = (id) => {
    setActiveSappers(prev => prev.find(s => s.id === id) ? prev.filter(s => s.id !== id) : [...prev, { id, context: '' }]);
  };
  const updateSapperContext = (id, ctx) => {
    setActiveSappers(prev => prev.map(s => s.id === id ? { ...s, context: ctx } : s));
  };
  const hardStops = getSapperHardStops(activeSappers);
  const hasHardStop = hardStops.length > 0;

  // ── Generate Deal Verdict ──────────────────────────────────────────────────
  const generateVerdict = useCallback(async (currentBarriers, currentHistory) => {
    setVerdictLoading(true);
    setLoadingMsg('Searching LenderMatch for Non-QM lenders...');
    const lmLenders = await fetchNonQMLenders();

    let allLenders = lmLenders;
    let webLenders = [];

    // If LenderMatch has no Non-QM lenders, search the internet
    if (lmLenders.length === 0) {
      setLoadingMsg('No Non-QM lenders in LenderMatch — searching internet for matches...');
      webLenders = await searchNonQMLendersOnline(parsedFindings);
      allLenders = webLenders;
    }

    setLoadingMsg('Building deal verdict...');
    const barrierSummary = currentBarriers.map(b => `- ${b.program}: "${b.reason}"`).join('\n');
    const lenderContext = allLenders.length > 0
      ? `Non-QM lenders identified${lmLenders.length > 0 ? ' from LoanBeacons LenderMatch' : ' via web search'}:\n${allLenders.slice(0,8).map(l => `  - ${l.name||l.companyName||'Unknown'} | NMLS: ${l.nmls||l.companyNMLS||'N/A'} | ${l.specialty||l.lenderType||'Non-QM'}${l.whyGood ? ` | ${l.whyGood}` : ''}`).join('\n')}`
      : 'No Non-QM lenders found in LenderMatch or web search — recommend manually contacting Angel Oak, Acra, or Citadel for this profile.';

    const verdictPrompt = `All agency paths exhausted for this ${isRefi?'refinance':'purchase'} loan.\nBlockers: ${barrierSummary}\nLoan profile: FICO ${parsedFindings?.creditScore||'N/A'} | DTI ${parsedFindings?.backEndDTI||'N/A'}% | LTV ${parsedFindings?.ltv||'N/A'}%\n${lenderContext}\n\nReturn ONLY valid JSON (no markdown):\n{"agencyVerdict":"1-2 sentences on why agency is closed","whatIsWorking":"1-2 sentences on LTV/DTI strengths","option1Headline":"Non-QM Now","option1Detail":"2-3 sentences on Non-QM viability","option1Action":"single most important first step","option2Headline":"Wait and Rebuild","option2Detail":"2-3 sentences on timeline","option2Action":"single most important first step","recommendation":"clear call — no hedging"}`;

    try {
      const raw = await callSonnet([{ role: 'user', content: verdictPrompt }], 'You are a senior mortgage advisor. Return only valid JSON as instructed.', 600);
      let parsed;
      try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
      catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
      if (parsed) { setVerdict({ ...parsed, lenders: allLenders, lendersFromWeb: webLenders.length > 0 }); setPhase('verdict'); }
    } catch (err) {
      setVerdict({
        agencyVerdict: 'All agency programs have been ruled out based on the credit history barriers documented.',
        whatIsWorking: `The loan structure is sound — ${parsedFindings?.ltv||'N/A'}% LTV is strong and DTI is within acceptable range.`,
        option1Headline: 'Non-QM Refinance — Close Now',
        option1Detail: 'Non-QM lenders manually underwrite without AUS, meaning the credit history flag blocking agency can be weighed against compensating factors like the strong LTV.',
        option1Action: 'Contact Non-QM lenders listed below with the LP CAUTION certificate and supporting documentation for the credit event.',
        option2Headline: 'Wait and Rebuild — Agency in 6-12 Months',
        option2Detail: 'Once the mortgage late ages past 12 months with clean payment history, resubmit to LP which already showed a sound loan structure.',
        option2Action: 'Set calendar reminder for 12 months from late date. Work on credit utilization in the meantime.',
        recommendation: 'If the debt burden is causing financial stress today, Non-QM closes the deal and provides immediate relief. Present both options honestly and let the borrower decide.',
        lenders: allLenders,
        lendersFromWeb: webLenders.length > 0,
      });
      setPhase('verdict');
    } finally { setVerdictLoading(false); setLoading(false); }
  }, [parsedFindings, SYSTEM]);

  // ── Step 1: Brief ──────────────────────────────────────────────────────────
  const generateBrief = useCallback(async () => {
    if (!parsedFindings) return;
    setLoading(true); setLoadingMsg('Reading DU findings...'); setPhase('briefing');
    convHistory.current = [];

    // ── Hard stop pre-check — if sappers indicate agency is impossible, skip to verdict ──
    if (hasHardStop) {
      const hardStopNames = hardStops.map(s => {
        const def = DEAL_SAPPERS.find(d => d.id === s.id);
        return `${def?.label}${s.context ? ` (${s.context})` : ''}`;
      }).join('; ');
      const briefMsg = `Analyze this DU findings report. The LO has flagged the following hard stops that make all agency programs impossible: ${hardStopNames}.\n\nIn 2-3 paragraphs: (1) what DU found and why it returned ${parsedFindings?.recommendation||'ineligible'}, (2) confirm why the flagged hard stop(s) close all agency paths, (3) what this means for the borrower and why Non-QM is the correct direction. ${isRefi ? 'This is a refinance — no down payment language.' : ''}`;
      convHistory.current.push({ role: 'user', content: briefMsg });
      try {
        const briefText = await callSonnet(convHistory.current, SYSTEM, 900);
        convHistory.current.push({ role: 'assistant', content: briefText });
        setBrief(briefText);
        setThread([{ type: 'brief', content: briefText }, { type: 'hardstop', sappers: hardStops }]);
        setPhase('advising');
        await generateVerdict(
          hardStops.map(s => ({ program: DEAL_SAPPERS.find(d=>d.id===s.id)?.label || s.id, reason: s.context || 'Hard stop — flagged pre-analysis' })),
          convHistory.current
        );
      } catch (err) { addThread({ type: 'error', content: `Analysis failed: ${err.message}` }); setPhase('idle'); }
      finally { setLoading(false); }
      return;
    }
    const purposeNote = isRefi
      ? `This is a ${parsedFindings.refiPurpose||''} Refinance — NOT a purchase. No down payment. Focus on LTV (${parsedFindings.ltv}%), existing mortgage payoff. If MSG 3629 shows large cash-out but MSG 0119 shows small actual cash back, explain the Line D/E classification issue.`
      : 'This is a purchase transaction.';
    const userMsg = `Analyze this DU findings report:\n1. PRIMARY reason came back ${parsedFindings?.recommendation||'ineligible'} — use actual MSG IDs and dollar figures.\n2. Secondary compounding issues.\n3. What realistically needs to change.\n\n${purposeNote}\n\nBe precise. 2-3 paragraphs.`;
    convHistory.current.push({ role: 'user', content: userMsg });
    try {
      const briefText = await callSonnet(convHistory.current, SYSTEM, 900);
      convHistory.current.push({ role: 'assistant', content: briefText });
      setBrief(briefText);
      setThread([{ type: 'brief', content: briefText }]);
      const initialQueue = [...strategies];
      setQueue(initialQueue);
      setPhase('advising');
      await presentNextRec(initialQueue, [], convHistory.current);
    } catch (err) { addThread({ type: 'error', content: `Analysis failed: ${err.message}` }); setPhase('idle'); }
    finally { setLoading(false); }
  }, [parsedFindings, strategies, SYSTEM, isRefi]);

  // ── Step 2: Next rec ───────────────────────────────────────────────────────
  const presentNextRec = useCallback(async (currentQueue, currentBarriers, currentHistory) => {
    if (isAgencyExhausted(currentBarriers) || !currentQueue.length) {
      setActiveRec({ exhausted: true });
      await generateVerdict(currentBarriers, currentHistory);
      return;
    }
    setLoading(true); setLoadingMsg('Evaluating best available path...');
    const top = currentQueue[0];
    const barrierSummary = currentBarriers.length ? `\nPaths ruled out:\n${currentBarriers.map(b=>`- ${b.program}: "${b.reason}"`).join('\n')}` : '';
    const remaining = currentQueue.slice(0,5).map(s=>`- ${s.name} (${s.approvalProbability}% approval)`).join('\n');
    const userMsg = `Based on actual DU findings for this ${isRefi?'refinance':'purchase'}${barrierSummary}\n\nRemaining options:\n${remaining}\n\nIn 2-3 sentences explain why "${top.name}" (${top.approvalProbability}% approval) is best. Then 1 sentence on the single most critical verification.${isRefi?' Refinance — no down payment language.':''}`;
    const history = [...currentHistory, { role: 'user', content: userMsg }];
    try {
      const recText = await callSonnet(history, SYSTEM, 450);
      history.push({ role: 'assistant', content: recText });
      convHistory.current = history;
      setActiveRec({ ...top, explanation: recText });
      addThread({ type: 'rec', content: recText, strategy: top });
    } catch (err) { addThread({ type: 'error', content: `Recommendation failed: ${err.message}` }); }
    finally { setLoading(false); setShowBarrierInput(false); setBarrierText(''); }
  }, [isRefi, SYSTEM, generateVerdict]);

  // ── Step 3: Barrier ────────────────────────────────────────────────────────
  const handleBarrierSubmit = useCallback(async () => {
    if (!barrierText.trim() || !activeRec) return;
    const barrier = { program: activeRec.name, reason: barrierText.trim(), timestamp: new Date().toISOString() };
    const updatedBarriers = [...barriers, barrier];
    setBarriers(updatedBarriers);
    const bl = barrierText.toLowerCase();
    const kills = { fha:['fha'], conventional:['conventional','fannie','freddie','conforming'], va:['va ','veteran'], usda:['usda','rural'], 'non-qm':['non-qm','nonqm','portfolio'], homeready:['homeready','home ready'], 'home possible':['home possible'] };
    const updatedQueue = queue.slice(1).filter(s => {
      const sl = s.name.toLowerCase();
      for (const [prog,kws] of Object.entries(kills)) {
        if (kws.some(kw=>bl.includes(kw)) && (sl.includes(prog)||kws.some(kw=>sl.includes(kw)))) return false;
      }
      return true;
    });
    setQueue(updatedQueue);
    addThread({ type: 'barrier', content: barrierText.trim(), program: activeRec.name });
    setShowBarrierInput(false); setLoading(true); setLoadingMsg('Acknowledged...');

    if (isAgencyExhausted(updatedBarriers)) {
      setBarrierText('');
      addThread({ type: 'ack', content: "Understood — that closes out the remaining agency options. Given the pattern of barriers here, I'm going to skip ahead and give you the full deal verdict with your two real options rather than work through strategies that will all hit the same wall." });
      setLoading(false);
      await generateVerdict(updatedBarriers, convHistory.current);
      return;
    }

    const ackMsg = `Cannot pursue "${activeRec.name}": "${barrierText.trim()}"\nAll barriers:\n${updatedBarriers.map(b=>`- ${b.program}: "${b.reason}"`).join('\n')}\n1-2 sentences: acknowledge the specific barrier. 1 sentence: pivot to next.`;
    const history = [...convHistory.current, { role: 'user', content: ackMsg }];
    try {
      const ackText = await callSonnet(history, SYSTEM, 300);
      history.push({ role: 'assistant', content: ackText });
      convHistory.current = history;
      addThread({ type: 'ack', content: ackText });
    } catch {}
    finally { setLoading(false); setBarrierText(''); }
    await presentNextRec(updatedQueue, updatedBarriers, convHistory.current);
  }, [barrierText, activeRec, barriers, queue, presentNextRec, SYSTEM, generateVerdict]);

  // ── Step 4a: Single-path letter ────────────────────────────────────────────
  const generateLetter = useCallback(async () => {
    if (!activeRec) return;
    setConfirmedPath(activeRec); setPhase('complete'); setLoading(true); setLoadingMsg('Writing borrower letter...');
    const barrierNarrative = barriers.length ? `\nPaths ruled out:\n${barriers.map(b=>`- ${b.program}: ${b.reason}`).join('\n')}` : '';
    const letterPrompt = `Write a borrower letter for ${borrowerName}.\nCONTEXT: ${isRefi?`${parsedFindings?.refiPurpose||''} Refinance — NOT a purchase. No down payment language.`:'Purchase.'}\nProperty: ${parsedFindings?.propertyAddress||'subject property'} | Loan: ${parsedFindings?.loanAmount?`$${parsedFindings.loanAmount.toLocaleString()}`:'as applied'} | Value: ${parsedFindings?.appraisedValue?`$${parsedFindings.appraisedValue.toLocaleString()}`:'as appraised'} | LTV: ${parsedFindings?.ltv||'N/A'}% | Score: ${parsedFindings?.creditScore||'N/A'} | DTI: ${parsedFindings?.backEndDTI||'N/A'}%\nWhy ineligible: ${brief}\nConfirmed path: ${activeRec.name} — ${activeRec.explanation}${barrierNarrative}\n\nWrite the letter:\n1. Open warmly\n2. Plain English — what Desktop Underwriter found\n3. ${isRefi?'Focus on LTV and equity. NO down payment language.':'Explain clearly.'}\n4. Why ${activeRec.name} is best path now\n5. 2-3 most important action items\n6. Building Toward Your Best Rate — 6-12 month roadmap\n7. Warm close\n8. Sign off: "${loName}, Mortgage Loan Officer, NMLS #1175947"`;
    try {
      const letterText = await callHaiku([{ role: 'user', content: letterPrompt }], LETTER_SYSTEM, 1200);
      setLetter(letterText);
    } catch (err) { setLetter(`Error: ${err.message}`); }
    finally { setLoading(false); }
  }, [activeRec, barriers, brief, borrowerName, loName, parsedFindings, isRefi]);

  // ── Step 4b: Two-option verdict letter ────────────────────────────────────
  const generateVerdictLetter = useCallback(async () => {
    if (!verdict) return;
    setLoading(true); setLoadingMsg('Writing two-option borrower letter...'); setPhase('complete');
    const lenderNames = verdict.lenders?.slice(0,3).map(l=>l.companyName||l.name).filter(Boolean).join(', ');
    const letterPrompt = `Write a borrower letter for ${borrowerName} presenting two paths forward.\n\nLOAN CONTEXT:\n- ${isRefi?`${parsedFindings?.refiPurpose||''} Refinance — NOT a purchase. No down payment language.`:'Purchase.'}\n- Property: ${parsedFindings?.propertyAddress||'subject property'}\n- Loan amount: ${parsedFindings?.loanAmount?`$${parsedFindings.loanAmount.toLocaleString()}`:'as applied'}\n- Appraised value: ${parsedFindings?.appraisedValue?`$${parsedFindings.appraisedValue.toLocaleString()}`:'as appraised'}\n- LTV: ${parsedFindings?.ltv||'N/A'}% (strong equity position)\n- Credit score: ${parsedFindings?.creditScore||'N/A'} | DTI: ${parsedFindings?.backEndDTI||'N/A'}%\n\nWhat is working: ${verdict.whatIsWorking}\nWhy agency is closed: ${verdict.agencyVerdict}\nOption 1 (Non-QM now): ${verdict.option1Detail}${lenderNames?`\nLenders being considered: ${lenderNames}`:''}\nOption 2 (Wait and rebuild): ${verdict.option2Detail}\nRecommendation: ${verdict.recommendation}\n\nWrite the letter:\n1. Open warmly — acknowledge this process has been stressful\n2. Plain English — what Desktop Underwriter and Loan Product Advisor found (spell out fully)\n3. Acknowledge what IS strong about their file\n4. Explain clearly why standard programs are not available right now\n5. Present Option 1 (Non-QM) warmly — explain in plain English, the rate tradeoff, why their equity makes them a strong candidate\n6. Present Option 2 (wait and rebuild) clearly — specific timeline and actions\n7. Make your recommendation clearly — do not hedge\n8. Warm close — deals like this do close, you are in their corner\n9. Sign off: "${loName}, Mortgage Loan Officer, NMLS #1175947"`;
    try {
      const letterText = await callHaiku([{ role: 'user', content: letterPrompt }], LETTER_SYSTEM, 1200);
      setLetter(letterText);
    } catch (err) { setLetter(`Error: ${err.message}`); }
    finally { setLoading(false); }
  }, [verdict, borrowerName, loName, parsedFindings, isRefi]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addThread = entry => setThread(prev => [...prev, entry]);
  const reset = () => {
    setPhase('idle'); setBrief(''); setThread([]); setBarriers([]); setQueue([]);
    setActiveRec(null); setLetter(''); setConfirmedPath(null); setVerdict(null);
    setActiveSappers([]); setShowSappers(true);
    setShowBarrierInput(false); setBarrierText(''); convHistory.current = [];
    if (scenarioId) localStorage.removeItem(STORAGE_KEY(scenarioId));
  };
  const copyLetter = () => { navigator.clipboard.writeText(letter); setLetterCopied(true); setTimeout(()=>setLetterCopied(false),2500); };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }} className="space-y-5 pb-10">
      <div className="bg-slate-900 rounded-3xl overflow-hidden">
        <div className="px-7 py-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-400 text-xl">⚡</span>
              <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-white text-2xl font-normal tracking-tight">Deal Advisor™</span>
              {isRefi && <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full border border-blue-400/30 ml-1">Refinance</span>}
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">v3.0</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xl">Tracks barriers, detects agency dead-ends early, searches LenderMatch for Non-QM lenders, and delivers the two-option verdict when all agency paths are closed.</p>
            {parsedFindings && (
              <div className="flex flex-wrap gap-3 mt-3">
                {parsedFindings.borrowerName && <span className="text-xs text-slate-300">👤 {parsedFindings.borrowerName}</span>}
                {parsedFindings.recommendation && <span className="text-xs text-amber-400 font-semibold">📋 {parsedFindings.recommendation}</span>}
                {(parsedFindings.loanPurpose||parsedFindings.refiPurpose) && <span className="text-xs text-slate-400">🏠 {parsedFindings.loanPurpose}{parsedFindings.refiPurpose?` · ${parsedFindings.refiPurpose}`:''}</span>}
                {parsedFindings.ltv && <span className="text-xs text-emerald-400 font-semibold">LTV {parsedFindings.ltv}%</span>}
                {parsedFindings.creditScore && <span className="text-xs text-slate-400">FICO {parsedFindings.creditScore}</span>}
                {parsedFindings.backEndDTI && <span className="text-xs text-slate-400">DTI {parsedFindings.backEndDTI}%</span>}
              </div>
            )}
          </div>
          {phase !== 'idle' && <button onClick={reset} className="text-slate-500 hover:text-slate-300 text-xs border border-slate-700 px-3 py-1.5 rounded-lg transition-all shrink-0 mt-1">Reset</button>}
        </div>
        {phase === 'idle' && (
          <div className="px-7 pb-7 space-y-4">
            {!parsedFindings
              ? <div className="bg-slate-800 rounded-2xl px-5 py-4 text-slate-400 text-sm">Upload a DU or LPA PDF above to activate Deal Advisor™.</div>
              : <>
                  {/* Deal Sappers Section */}
                  <div className="bg-slate-800 rounded-2xl overflow-hidden">
                    <button onClick={() => setShowSappers(s => !s)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-700 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-red-400 text-sm">🚨</span>
                        <span className="text-white text-sm font-semibold">Deal Sappers</span>
                        <span className="text-slate-400 text-xs">— check before analyzing</span>
                        {activeSappers.length > 0 && (
                          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{activeSappers.length}</span>
                        )}
                        {hasHardStop && (
                          <span className="bg-red-500/20 text-red-300 text-xs px-2 py-0.5 rounded-full border border-red-500/30 font-semibold">⚡ Hard Stop — Skip to Non-QM</span>
                        )}
                      </div>
                      <span className="text-slate-400 text-xs">{showSappers ? '▲' : '▼'}</span>
                    </button>
                    {showSappers && (
                      <div className="px-5 pb-5 space-y-2">
                        <p className="text-slate-400 text-xs mb-3">Flag any deal conditions that would block agency approval. Hard stops skip the strategy loop and go straight to the Non-QM verdict.</p>
                        {DEAL_SAPPERS.map(sapper => {
                          const isActive = activeSappers.find(s => s.id === sapper.id);
                          return (
                            <div key={sapper.id} className={`rounded-xl border transition-all ${isActive ? 'border-red-500/50 bg-red-950/30' : 'border-slate-600 bg-slate-700/30'}`}>
                              <button onClick={() => toggleSapper(sapper.id)} className="w-full px-4 py-3 flex items-center justify-between text-left">
                                <div className="flex items-center gap-3">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isActive ? 'bg-red-500 border-red-500' : 'border-slate-500'}`}>
                                    {isActive && <span className="text-white text-xs font-black">✓</span>}
                                  </div>
                                  <span className="text-sm">{sapper.icon}</span>
                                  <div>
                                    <span className={`text-sm font-medium ${isActive ? 'text-red-300' : 'text-slate-300'}`}>{sapper.label}</span>
                                    {sapper.severity === 'hard_stop' && (
                                      <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-semibold">HARD STOP</span>
                                    )}
                                    {sapper.severity === 'caution' && (
                                      <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold">CAUTION</span>
                                    )}
                                  </div>
                                </div>
                              </button>
                              {isActive && sapper.requiresContext && (
                                <div className="px-4 pb-4">
                                  <label className="block text-xs text-slate-400 font-semibold mb-1.5">{sapper.contextLabel}</label>
                                  <textarea
                                    value={isActive.context || ''}
                                    onChange={e => updateSapperContext(sapper.id, e.target.value)}
                                    placeholder={sapper.contextPlaceholder}
                                    rows={2}
                                    className="w-full text-xs bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                                  />
                                  {sapper.nonQMNote && (
                                    <p className="text-xs text-amber-400/80 mt-1.5">💡 {sapper.nonQMNote}</p>
                                  )}
                                </div>
                              )}
                              {isActive && !sapper.requiresContext && sapper.nonQMNote && (
                                <div className="px-4 pb-3">
                                  <p className="text-xs text-amber-400/80">💡 {sapper.nonQMNote}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button onClick={generateBrief} disabled={loading} className={`w-full font-semibold text-sm px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${hasHardStop ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'} disabled:opacity-50`}>
                    {hasHardStop ? <><span>🚨</span> Hard Stop Detected — Skip to Non-QM Verdict</> : <><span>🔍</span> Analyze These DU Findings</>}
                  </button>
                </>
            }
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
        <p className="text-amber-800 text-xs font-semibold uppercase tracking-widest mb-1.5">How This Works</p>
        <p className="text-amber-800 text-xs leading-relaxed">Deal Advisor™ reads actual DU/LP findings, tracks every barrier you report, and detects when a credit history issue makes all agency programs impossible. When that happens it stops immediately — searches your LenderMatch lenders first — and delivers a clear two-option verdict: close now with Non-QM, or wait and rebuild for agency.</p>
      </div>

      {parsedFindings && phase === 'idle' && <ParsedSummary findings={parsedFindings} />}

      {thread.length > 0 && <div className="space-y-4">{thread.map((entry,i) => <ThreadEntry key={i} entry={entry} />)}</div>}

      {(loading || verdictLoading) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5 flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin" />
          <span className="text-slate-500 text-sm">{loadingMsg}</span>
        </div>
      )}

      {activeRec && !activeRec.exhausted && phase === 'advising' && !loading && (
        <RecCard rec={activeRec} barriers={barriers} showBarrierInput={showBarrierInput} barrierText={barrierText}
          onBarrierTextChange={setBarrierText} onShowBarrier={()=>setShowBarrierInput(true)}
          onCancelBarrier={()=>{setShowBarrierInput(false);setBarrierText('');}}
          onSubmitBarrier={handleBarrierSubmit} onConfirm={generateLetter} loading={loading} />
      )}

      {verdict && phase === 'verdict' && !verdictLoading && !loading && (
        <DealVerdict verdict={verdict} parsedFindings={parsedFindings} barriers={barriers} onGenerateLetter={generateVerdictLetter} letterLoading={loading} />
      )}

      {confirmedPath && !letter && loading && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-4 flex items-center gap-3">
          <span className="text-emerald-500">✅</span>
          <div><p className="text-emerald-700 font-semibold text-sm">Path Confirmed — {confirmedPath.name}</p><p className="text-emerald-600 text-xs mt-0.5">Generating borrower letter...</p></div>
        </div>
      )}

      {letter && <BorrowerLetter letter={letter} borrowerName={borrowerName} confirmedPath={confirmedPath} verdict={verdict} barriers={barriers} copied={letterCopied} onCopy={copyLetter} />}

      <div ref={bottomRef} />
    </div>
  );
}

function DealVerdict({ verdict: v, parsedFindings: f, barriers, onGenerateLetter, letterLoading }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-3xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-700 flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div><p className="text-white font-bold text-base">Agency Financing Closed</p><p className="text-slate-400 text-xs">All conventional and government programs ruled out</p></div>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-slate-300 text-sm leading-relaxed">{v.agencyVerdict}</p>
          <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl px-4 py-3">
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">What IS Working</p>
            <p className="text-emerald-300 text-sm leading-relaxed">{v.whatIsWorking}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-white rounded-3xl shadow-sm border border-emerald-200 overflow-hidden">
          <div className="bg-emerald-600 px-5 py-3"><p className="text-white font-bold text-sm">Option 1 — Close Now</p><p className="text-emerald-100 text-xs">{v.option1Headline}</p></div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-slate-600 text-sm leading-relaxed">{v.option1Detail}</p>
            <div className="bg-emerald-50 rounded-xl px-4 py-3"><p className="text-emerald-700 text-xs font-semibold mb-0.5">First Action</p><p className="text-emerald-800 text-sm">{v.option1Action}</p></div>
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {v.lendersFromWeb ? 'Found via Web Search' : 'From Your LenderMatch'}
                </span>
                {v.lenders?.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${v.lendersFromWeb ? 'bg-blue-100 text-blue-600' : 'bg-indigo-100 text-indigo-600'}`}>
                    {v.lenders.length} found
                  </span>
                )}
                {v.lendersFromWeb && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠️ Verify before contacting</span>
                )}
              </div>
              {v.lenders?.length > 0
                ? <div className="space-y-2">{v.lenders.slice(0,6).map((l,i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 ${l.fromWeb ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{l.name||l.companyName||'Unknown Lender'}</p>
                          <p className="text-xs text-slate-500">NMLS: {l.nmls||l.companyNMLS||'N/A'} · {l.specialty||l.lenderType||'Non-QM'}</p>
                          {l.whyGood && <p className="text-xs text-emerald-700 mt-0.5 italic">{l.whyGood}</p>}
                          {l.aeEmail && <p className="text-xs text-indigo-500 mt-0.5">{l.aeEmail}</p>}
                        </div>
                        {l.website && (
                          <a href={l.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700 shrink-0 underline">Visit →</a>
                        )}
                      </div>
                    </div>
                  ))}</div>
                : <div className="bg-amber-50 rounded-xl px-4 py-3"><p className="text-amber-700 text-xs font-semibold mb-0.5">No Non-QM Lenders Found</p><p className="text-amber-600 text-xs">Add lenders via Lender Profile Builder, or manually contact Angel Oak, Acra, or Citadel for this profile.</p></div>
              }
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-blue-200 overflow-hidden">
          <div className="bg-blue-600 px-5 py-3"><p className="text-white font-bold text-sm">Option 2 — Wait & Rebuild</p><p className="text-blue-100 text-xs">{v.option2Headline}</p></div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-slate-600 text-sm leading-relaxed">{v.option2Detail}</p>
            <div className="bg-blue-50 rounded-xl px-4 py-3"><p className="text-blue-700 text-xs font-semibold mb-0.5">First Action</p><p className="text-blue-800 text-sm">{v.option2Action}</p></div>
            {f?.creditScore && (
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Credit Targets</p>
                {[['Current FICO',f.creditScore,'text-slate-700'],['Target for agency Accept','660+','text-emerald-600'],['Current LTV (strong)',`${f.ltv}%`,'text-emerald-600']].map(([label,value,cls])=>(
                  <div key={label} className="flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className={`font-semibold ${cls}`}>{value}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-6 py-5">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-indigo-500 text-xl mt-0.5">💡</span>
          <div><p className="text-indigo-800 font-bold text-sm mb-1">Recommendation</p><p className="text-indigo-700 text-sm leading-relaxed">{v.recommendation}</p></div>
        </div>
        <button onClick={onGenerateLetter} disabled={letterLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2">
          <span>✉️</span>{letterLoading?'Writing letter...':'Generate Two-Option Borrower Letter'}
        </button>
      </div>

      {barriers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Barrier Log — All Programs Tried</p>
          <div className="space-y-1.5">{barriers.map((b,i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-red-400 text-xs mt-0.5 shrink-0">✗</span>
              <div><span className="text-xs font-semibold text-slate-600">{b.program}: </span><span className="text-xs text-slate-500">"{b.reason}"</span></div>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
}

function ParsedSummary({ findings: f }) {
  const [expanded, setExpanded] = useState(false);
  if (!f) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button onClick={()=>setExpanded(!expanded)} className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">📄</span>
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">DU Findings Extracted</span>
          <span className="text-xs text-slate-400">— {f.loanPurpose||'Unknown'}{f.refiPurpose?` · ${f.refiPurpose}`:''} · {f.recommendation||f.finding}</span>
        </div>
        <span className="text-slate-400 text-xs">{expanded?'▲':'▼'}</span>
      </button>
      {expanded && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {[['Loan Purpose',(f.loanPurpose||''+(f.refiPurpose?` · ${f.refiPurpose}`:''))],['AUS Finding',f.recommendation||f.finding],['Borrower',f.borrowerName],['Loan Amount',f.loanAmount?`$${f.loanAmount.toLocaleString()}`:null],['Appraised Value',f.appraisedValue?`$${f.appraisedValue.toLocaleString()}`:null],['LTV',f.ltv?`${f.ltv}%`:null],['Cash Back',f.cashBack?`$${f.cashBack.toLocaleString()}`:null],['Credit Score',f.creditScore?`${f.creditScore} (${f.allCreditScores?.join('/')||'N/A'})`:null],['DTI',f.backEndDTI?`${f.backEndDTI}%`:null],['DU Messages',f.duMessageIds?.length?f.duMessageIds.join(', '):null]].filter(([,v])=>v).map(([label,value])=>(
            <div key={label} className="flex gap-2"><span className="text-xs text-slate-400 shrink-0 w-28">{label}:</span><span className="text-xs text-slate-700 font-medium">{value}</span></div>
          ))}
          {f.ineligibilityReasons?.length>0&&(<div className="col-span-2 mt-2 pt-2 border-t border-slate-100"><p className="text-xs text-slate-500 font-semibold mb-1">Ineligibility Reasons:</p>{f.ineligibilityReasons.map((r,i)=><p key={i} className="text-xs text-red-600 mb-0.5">{i+1}. {r}</p>)}</div>)}
        </div>
      )}
    </div>
  );
}

function ThreadEntry({ entry }) {
  if (entry.type==='brief') return (<div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"><div className="bg-slate-900 px-6 py-4 flex items-center gap-3"><span className="text-lg">🔍</span><div><p className="text-white font-semibold text-sm">Why This Loan Is Ineligible</p><p className="text-slate-400 text-xs">Based on actual DU findings</p></div></div><div className="px-6 py-5"><p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{entry.content}</p></div></div>);
  if (entry.type==='barrier') return (<div className="flex items-start gap-3 px-1"><div className="bg-slate-100 rounded-full w-7 h-7 flex items-center justify-center shrink-0 mt-0.5"><span className="text-slate-500 text-xs font-bold">LO</span></div><div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg"><p className="text-xs text-slate-500 font-medium mb-0.5">Re: {entry.program}</p><p className="text-slate-700 text-sm">"{entry.content}"</p></div></div>);
  if (entry.type==='ack') return (<div className="flex items-start gap-3 px-1 justify-end"><div className="bg-amber-500 rounded-2xl rounded-tr-sm px-4 py-3 max-w-lg"><p className="text-white text-sm leading-relaxed">{entry.content}</p></div><div className="bg-amber-500 rounded-full w-7 h-7 flex items-center justify-center shrink-0 mt-0.5"><span className="text-white text-xs font-bold">AI</span></div></div>);
  if (entry.type==='hardstop') return (
    <div className="bg-red-950/40 border border-red-700/50 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-red-400">🚨</span>
        <p className="text-red-300 font-semibold text-sm">Hard Stop Detected — Agency Programs Bypassed</p>
      </div>
      <div className="space-y-1.5">
        {(entry.sappers||[]).map((s,i) => {
          const def = DEAL_SAPPERS.find(d => d.id === s.id);
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-red-500 text-xs mt-0.5 shrink-0">✗</span>
              <div>
                <span className="text-xs font-semibold text-red-300">{def?.label || s.id}</span>
                {s.context && <span className="text-xs text-red-400/80"> — "{s.context}"</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-red-400/70 text-xs mt-2">Skipping agency strategies — going directly to Non-QM verdict.</p>
    </div>
  );
  return null;
}

function RecCard({ rec, barriers, showBarrierInput, barrierText, onBarrierTextChange, onShowBarrier, onCancelBarrier, onSubmitBarrier, onConfirm, loading }) {
  const prob = rec.approvalProbability;
  const probColor = prob>=85?'text-emerald-600 bg-emerald-50 border-emerald-200':prob>=70?'text-amber-600 bg-amber-50 border-amber-200':'text-red-600 bg-red-50 border-red-200';
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="text-white text-lg">💡</span><p className="text-white font-semibold text-sm">Best Available Path{barriers.length>0?` (after ${barriers.length} barrier${barriers.length>1?'s':''})`:''}</p></div>
        {prob>0&&<span className={`text-xs font-bold px-3 py-1 rounded-full border ${probColor}`}>{prob}% approval</span>}
      </div>
      <div className="px-6 py-5 space-y-4">
        <div><h3 style={{ fontFamily:"'DM Serif Display', serif" }} className="text-slate-900 text-xl font-normal">{rec.name}</h3>{(rec.timeframe||rec.cost||rec.risk)&&<p className="text-slate-400 text-xs mt-0.5">{[rec.timeframe,rec.cost,rec.risk&&`Risk: ${rec.risk}`].filter(Boolean).join(' · ')}</p>}</div>
        {rec.explanation&&<p className="text-slate-600 text-sm leading-relaxed">{rec.explanation}</p>}
        {!showBarrierInput&&(<div className="grid grid-cols-2 gap-3 pt-1"><button onClick={onConfirm} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"><span>✅</span><span>Yes — Build the Plan</span></button><button onClick={onShowBarrier} disabled={loading} className="bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 font-semibold text-sm py-3 px-4 rounded-xl border border-red-200 hover:border-red-300 transition-colors flex items-center justify-center gap-2"><span>✗</span><span>There's a Barrier</span></button></div>)}
        {showBarrierInput&&(<div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3"><label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">Why can't you pursue this path?</label><textarea value={barrierText} onChange={e=>onBarrierTextChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&barrierText.trim())onSubmitBarrier();}} placeholder={`e.g. "Can't do FHA — borrower had 1 mortgage late in the last 12 months following a divorce"`} rows={3} className="w-full text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" /><div className="flex gap-2"><button onClick={onSubmitBarrier} disabled={!barrierText.trim()||loading} className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-colors">Submit — Find Next Path</button><button onClick={onCancelBarrier} className="text-slate-500 text-sm px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">Cancel</button></div><p className="text-slate-400 text-xs">⌘+Enter to submit</p></div>)}
      </div>
    </div>
  );
}

function BorrowerLetter({ letter, borrowerName, confirmedPath, verdict, barriers, copied, onCopy }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><span className="text-lg">✉️</span><div><p className="text-white font-semibold text-sm">{verdict?'Two-Option Borrower Letter':`Borrower Letter — ${borrowerName}`}</p><p className="text-slate-400 text-xs">{verdict?'Non-QM Now vs. Wait & Rebuild':confirmedPath?.name} · {barriers.length} barrier{barriers.length!==1?'s':''} documented</p></div></div>
        <div className="flex items-center gap-2"><button onClick={onCopy} className="bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">{copied?'✓ Copied!':'📋 Copy Letter'}</button><button onClick={()=>setExpanded(e=>!e)} className="text-slate-400 hover:text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition-colors">{expanded?'Collapse':'Expand'}</button></div>
      </div>
      {expanded&&(<div className="px-8 py-7"><div className="bg-slate-50 rounded-2xl border border-slate-100 px-8 py-8"><div className="border-b border-slate-200 pb-5 mb-6 flex items-start justify-between"><div><p style={{ fontFamily:"'DM Serif Display', serif" }} className="text-slate-900 text-lg">LoanBeacons™</p><p className="text-slate-400 text-xs mt-0.5">Intelligent Mortgage Advisory</p></div><p className="text-slate-400 text-xs">{new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p></div><p className="text-slate-700 text-sm leading-[1.9] whitespace-pre-line">{letter}</p></div>{barriers.length>0&&(<div className="mt-5 bg-slate-50 rounded-xl border border-slate-100 px-5 py-4"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">LO Barrier Log (Internal — Do Not Share)</p><div className="space-y-2">{barriers.map((b,i)=>(<div key={i} className="flex items-start gap-2"><span className="text-red-400 text-xs mt-0.5 shrink-0">✗</span><div><span className="text-xs font-semibold text-slate-600">{b.program}: </span><span className="text-xs text-slate-500">"{b.reason}"</span></div></div>))}</div></div>)}</div>)}
    </div>
  );
}
