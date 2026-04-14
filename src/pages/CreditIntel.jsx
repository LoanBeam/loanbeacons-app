// src/pages/CreditIntel.jsx
// LoanBeacons™ — Module 5 | Stage 1: Pre-Structure
// Credit Intelligence™ — Full Enhanced Build
// High Impact: Upload open by default, Pay-to-Close Gap, One-click Rescore Plan
// Medium Impact: Score gap cross-ref, Auto-check derogatory from AI, "Just missed" eligibility
// Polish: Smart strategy pre-selection, Enhanced Decision Record log

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';
import ModuleNav from '../components/ModuleNav';

const SCORE_TIERS = [
  { min: 760, label: 'Excellent',     badge: 'bg-emerald-100 text-emerald-700', desc: 'Best pricing on all programs. No overlays apply.' },
  { min: 740, label: 'Very Good',     badge: 'bg-emerald-100 text-emerald-700', desc: 'Top-tier pricing. Minor adjustments on some products.' },
  { min: 720, label: 'Good',          badge: 'bg-green-100 text-green-700',     desc: 'Standard pricing. All programs available.' },
  { min: 700, label: 'Above Average', badge: 'bg-lime-100 text-lime-700',       desc: 'Good pricing. Review overlays for jumbo/Non-QM.' },
  { min: 680, label: 'Average',       badge: 'bg-yellow-100 text-yellow-700',   desc: 'Standard pricing. Compensating factors help.' },
  { min: 660, label: 'Fair',          badge: 'bg-amber-100 text-amber-700',     desc: 'Some programs restricted. Conventional may require higher down.' },
  { min: 640, label: 'Below Average', badge: 'bg-orange-100 text-orange-700',   desc: 'FHA/VA still available. Conventional difficult.' },
  { min: 620, label: 'Poor',          badge: 'bg-red-100 text-red-600',         desc: 'FHA minimum. Limited options. Focus on rapid rescore.' },
  { min: 580, label: 'Very Poor',     badge: 'bg-red-100 text-red-600',         desc: 'FHA with manual UW. VA possible. Non-QM bridge loan.' },
  { min: 0,   label: 'Below Minimum', badge: 'bg-red-200 text-red-700',         desc: 'Does not qualify for any agency program.' },
];

const PROGRAM_MIN_SCORES = {
  'Conventional (Standard)':   { score: 620, note: 'Most lenders require 640-660 overlay' },
  'HomeReady / Home Possible':  { score: 620, note: 'Fannie 620 / Freddie 660' },
  'FHA':                        { score: 580, note: '3.5% down at 580+. 10% down at 500-579.' },
  'VA':                         { score: 580, note: 'VA has no minimum. Most lenders require 580-620 overlay.' },
  'USDA':                       { score: 640, note: 'GUS typically requires 640+' },
  'Jumbo':                      { score: 700, note: 'Most lenders require 720-740 for best pricing' },
  'Non-QM':                     { score: 580, note: 'Varies by product. Bank Statement often 600+' },
};

const SCORE_MILESTONES = [580, 600, 620, 640, 660, 680, 700, 720, 740, 760];

const DEROGATORY_TYPES = [
  { id: 'bankruptcy_7',  label: 'Chapter 7 Bankruptcy',       fha: 24, conv: 48, va: 24, usda: 36, note: 'Months from discharge date',                                                 aiKeywords: ['chapter 7', 'bankruptcy 7', 'bk7']           },
  { id: 'bankruptcy_13', label: 'Chapter 13 Bankruptcy',      fha: 12, conv: 24, va: 12, usda: 12, note: 'Months from filing (with trustee approval). 24 mo from discharge for conv.', aiKeywords: ['chapter 13', 'bankruptcy 13', 'bk13']         },
  { id: 'foreclosure',   label: 'Foreclosure',                 fha: 36, conv: 84, va: 24, usda: 36, note: 'Months from completion date. Extenuating circumstances may reduce.',         aiKeywords: ['foreclosure', 'foreclosed']                   },
  { id: 'short_sale',    label: 'Short Sale / DIL',            fha: 36, conv: 24, va: 24, usda: 36, note: 'Months from completion. FHA: may waive if no late pmts + extenuating circ.', aiKeywords: ['short sale', 'deed in lieu', 'dil']           },
  { id: 'late_mortgage', label: '30-Day Mortgage Late (12mo)', fha: 0,  conv: 0,  va: 0,  usda: 0,  note: 'Most lenders allow max 1x30 in 12 months. 0x30 often required as overlay.',  aiKeywords: ['30 day late', 'mortgage late', '30-day']      },
  { id: 'collections',   label: 'Open Collections',            fha: 0,  conv: 0,  va: 0,  usda: 0,  note: 'FHA: medical collections ignored. Non-medical may require payoff or LOE.',   aiKeywords: ['collection', 'collections']                   },
  { id: 'judgments',     label: 'Judgments / Liens',           fha: 0,  conv: 0,  va: 0,  usda: 0,  note: 'Must be paid at or before closing on most programs.',                        aiKeywords: ['judgment', 'lien', 'tax lien']                },
];

const RESCORE_STRATEGIES = [
  { title: 'Pay revolving balances to <10% utilization', impact: '20-40 pts', timeframe: '72 hours (rapid rescore)', cost: '$150-300',        rapidRescore: true,  trigger: 'highUtil'    },
  { title: 'Dispute inaccurate derogatory items',        impact: '10-30 pts', timeframe: '30-45 days',               cost: 'Free',            rapidRescore: false, trigger: 'derogatory'  },
  { title: 'Add as authorized user on seasoned account', impact: '15-30 pts', timeframe: '30-45 days',               cost: 'Free',            rapidRescore: false, trigger: 'thinFile'    },
  { title: 'Pay off small collection accounts',          impact: '5-15 pts',  timeframe: '72 hours (rapid rescore)', cost: 'Account balance', rapidRescore: true,  trigger: 'collections' },
  { title: 'Remove inaccurate AU accounts',              impact: 'Varies',    timeframe: '72 hours (rapid rescore)', cost: 'Free',            rapidRescore: true,  trigger: null          },
  { title: 'Open a secured credit card (thin file)',     impact: '20-40 pts', timeframe: '6-12 months',              cost: '$200-500 deposit', rapidRescore: false, trigger: 'thinFile'   },
];

const LOE_TEMPLATES = {
  bankruptcy_7:  (date, name) => `To Whom It May Concern,\n\nI, ${name || '[Borrower Name]'}, am writing to explain the Chapter 7 bankruptcy discharged on ${date || '[Date]'}.\n\nThis financial hardship was caused by [briefly describe circumstances, e.g., job loss, medical emergency, divorce]. Since the discharge, I have diligently worked to rebuild my credit by maintaining all accounts in good standing, paying all obligations on time, and responsibly managing my finances.\n\nI have maintained stable employment at [Employer] for [X] years and believe I am now in a strong financial position to responsibly handle this mortgage obligation.\n\nSincerely,\n${name || '[Borrower Name]'}\n[Date]`,
  bankruptcy_13: (date, name) => `To Whom It May Concern,\n\nI, ${name || '[Borrower Name]'}, am writing to explain the Chapter 13 bankruptcy filed on ${date || '[Date]'}.\n\nI entered into a Chapter 13 repayment plan due to [briefly describe circumstances]. I successfully completed/am completing all trustee-required payments, demonstrating my commitment to honoring financial obligations.\n\nAll accounts have been maintained in good standing since filing and I have received trustee approval for this mortgage transaction.\n\nSincerely,\n${name || '[Borrower Name]'}\n[Date]`,
  foreclosure:   (date, name) => `To Whom It May Concern,\n\nI, ${name || '[Borrower Name]'}, am writing to explain the foreclosure completed on ${date || '[Date]'}.\n\nThis event occurred due to [describe extenuating circumstances, e.g., significant income reduction, medical hardship]. This was not a strategic default - I made every effort to retain the property and worked with my servicer to explore all available options.\n\nSince this event, I have reestablished strong credit, maintained consistent employment, and built substantial savings. I am committed to being a responsible homeowner.\n\nSincerely,\n${name || '[Borrower Name]'}\n[Date]`,
  short_sale:    (date, name) => `To Whom It May Concern,\n\nI, ${name || '[Borrower Name]'}, am writing to explain the short sale completed on ${date || '[Date]'}.\n\nDue to [describe circumstances], I was unable to sell the property for its full mortgage value. The short sale was approved by my lender and I received written consent to proceed. I made no mortgage payments late prior to initiating the short sale process.\n\nI have since fully recovered financially and am prepared to fulfill all obligations of this new mortgage.\n\nSincerely,\n${name || '[Borrower Name]'}\n[Date]`,
  collections:   (date, name) => `To Whom It May Concern,\n\nI, ${name || '[Borrower Name]'}, am writing to explain the collection account(s) appearing on my credit report.\n\n[Describe the nature of the debt, e.g., medical bills from a hospitalization in (year)]. At the time, I was experiencing [financial hardship reason] and was unable to address this obligation. I was unaware this account had been forwarded to collections until I reviewed my credit report in preparation for this mortgage application.\n\nI have since [resolved / am in the process of resolving] this account and have taken steps to prevent similar situations going forward.\n\nSincerely,\n${name || '[Borrower Name]'}\n[Date]`,
};

const fmt$ = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function getScoreTier(score) {
  for (const tier of SCORE_TIERS) if (score >= tier.min) return tier;
  return SCORE_TIERS[SCORE_TIERS.length - 1];
}

function monthsElapsed(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

const REASON_CODE_MAP = {
  '10': { text: 'Revolving utilization too high',           actionable: true,  estPts: '20–40', action: 'Pay revolving cards to <10% utilization. Rapid rescore available.' },
  '39': { text: 'Serious delinquency on record',            actionable: false, estPts: '0',     action: 'Time-only. Delinquency ages off after 7 years. Dispute if inaccurate.' },
  '13': { text: 'Delinquency too recent or unknown',        actionable: false, estPts: '0',     action: 'Time-only. Score improves as delinquency ages. Nothing actionable now.' },
  '18': { text: 'Number of accounts with delinquency',      actionable: false, estPts: '5–15',  action: 'Dispute any inaccurate late payments. Otherwise time-only.' },
  '14': { text: 'Length of time accounts established',      actionable: false, estPts: '0',     action: 'Time-only. Keep oldest accounts open. Do not close seasoned tradelines.' },
  '5':  { text: 'Too many accounts with balances',          actionable: true,  estPts: '10–20', action: 'Pay off or pay down smallest balance accounts first.' },
  '8':  { text: 'Too many inquiries last 12 months',        actionable: false, estPts: '3–8',   action: 'Stop new applications. Inquiries age off in 12 months. Minor impact.' },
  '6':  { text: 'Too many consumer finance company accounts', actionable: false, estPts: '5–10', action: 'Time-only. Avoid opening new consumer finance accounts.' },
  '4':  { text: 'Lack of recent installment loan information', actionable: true, estPts: '10–20', action: 'Consider a small credit-builder loan or secured installment account.' },
  '15': { text: 'Lack of recent revolving account information', actionable: true, estPts: '10–20', action: 'Open a secured credit card. Use lightly and pay in full each month.' },
};

// Normalize code strings — strip leading zeros
const normalizeCode = code => String(code).replace(/^0+/, '') || '0';

export default function CreditIntel() {
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

  // ── Multi-report / multi-borrower credit score state ─────────────────────
  const [allBorrowers, setAllBorrowers] = useState([]);
  // allBorrowers: [{ name, experian, transunion, equifax, computedMiddle, reportSlot }]
  const [reports, setReports] = useState([
    { id: 1, label: 'Report 1 — Primary Borrower(s)',    file: null, loading: false, result: null, error: '' },
    { id: 2, label: 'Report 2 — Co-Borrower(s)',         file: null, loading: false, result: null, error: '' },
    { id: 3, label: 'Report 3 — Additional Borrower(s)', file: null, loading: false, result: null, error: '' },
  ]);
  const [scoreWriteBackDone, setScoreWriteBackDone] = useState(false);
  const [borrowerScore, setBorrowerScore] = useState('');

  // ── Feature state ─────────────────────────────────────────────────────────
  const [auAccounts, setAuAccounts]       = useState([]);
  const [focusBorrower, setFocusBorrower] = useState(null);
  const [rescoreLetterVisible, setRescoreLetterVisible] = useState(false);
  const [rescoreLetterText, setRescoreLetterText]       = useState('');

  const [tradelines,          setTradelines]          = useState({ revolving: '', installment: '', mortgage: '', totalAccounts: '' });
  const [utilization,         setUtilization]         = useState('');
  const [derogatory,          setDerogatory]          = useState({});
  const [derogatoryDates,     setDerogatoryDates]     = useState({});
  const [collections,         setCollections]         = useState([]);
  const [selectedStrategies,  setSelectedStrategies]  = useState({});
  const [notes,               setNotes]               = useState('');

  const [simCards,       setSimCards]       = useState([{ id: 1, name: '', balance: '', limit: '' }]);
  const [showRescore,    setShowRescore]    = useState(false);
  const [rescoredCopied, setRescoredCopied] = useState(false);

  const [loeEvent,  setLoeEvent]  = useState('');
  const [loeText,   setLoeText]   = useState('');
  const [showLOE,   setShowLOE]   = useState(false);
  const [loeCopied, setLoeCopied] = useState(false);

  const borrowerName = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() : '';

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.creditScore) {
          setBorrowerScore(String(d.creditScore));
          // Pre-seed allBorrowers from scenario if no reports uploaded yet
          setAllBorrowers([{ name: `${d.firstName||''} ${d.lastName||''}`.trim() || 'Primary Borrower', experian: null, transunion: null, equifax: null, computedMiddle: d.creditScore, reportSlot: 0 }]);
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // Smart strategy pre-selection
  useEffect(() => {
    const u      = parseFloat(utilization) || 0;
    const revolv = parseInt(tradelines.revolving) || 0;
    const total  = parseInt(tradelines.totalAccounts) || 0;
    const hasDero = Object.values(derogatory).some(Boolean);
    const hasColl = collections.filter(c => c.status === 'open').length > 0;
    const thin    = total > 0 && total < 3;
    setSelectedStrategies({
      0: u > 30,
      1: hasDero,
      2: thin,
      3: hasColl,
      4: false,
      5: thin && revolv === 0,
    });
  }, [utilization, tradelines.totalAccounts, tradelines.revolving, derogatory, collections]);

  // Derived — qualifying score from all borrowers (lowest middle)
  const qualifyingScore = allBorrowers.length > 0
    ? Math.min(...allBorrowers.map(b => b.computedMiddle).filter(s => s > 0))
    : (parseInt(borrowerScore) || 0);
  const qualifyingBorrower = allBorrowers.find(b => b.computedMiddle === qualifyingScore) || null;
  const midScore  = qualifyingScore; // alias for Decision Record compat
  const coMidScore = 0;              // deprecated — allBorrowers handles this now
  const tier            = qualifyingScore > 0 ? getScoreTier(qualifyingScore) : null;
  const util            = parseFloat(utilization) || 0;
  const eligiblePrograms = Object.entries(PROGRAM_MIN_SCORES).filter(([, v]) => qualifyingScore >= v.score);

  const nextMilestone = SCORE_MILESTONES.find(m => m > qualifyingScore) || null;
  const pointsToNext  = nextMilestone ? nextMilestone - qualifyingScore : 0;
  const nextPrograms  = nextMilestone ? Object.entries(PROGRAM_MIN_SCORES).filter(([, v]) => v.score === nextMilestone || (v.score <= nextMilestone && v.score > qualifyingScore)) : [];

  // Sim calculations
  const simCardsWithPaydown = simCards.map(card => {
    const bal = parseFloat(card.balance) || 0;
    const lim = parseFloat(card.limit)   || 0;
    const targetBal     = lim > 0 ? Math.round(lim * 0.09) : 0;
    const paydownNeeded = Math.max(0, bal - targetBal);
    const currentUtil   = lim > 0 ? ((bal / lim) * 100).toFixed(0) : 0;
    return { ...card, targetBal, paydownNeeded, currentUtil };
  });

  const totalBalance       = simCards.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0);
  const totalLimit         = simCards.reduce((s, c) => s + (parseFloat(c.limit)   || 0), 0);
  const currentSimUtil     = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const totalPaydownNeeded = simCardsWithPaydown.reduce((s, c) => s + c.paydownNeeded, 0);

  const estimateScoreGain = (from) => {
    if (from <= 10) return 0;
    if (from > 50)  return 35;
    if (from > 30)  return 25;
    return 15;
  };

  const simGain        = estimateScoreGain(currentSimUtil);
  const projectedScore = qualifyingScore > 0 ? qualifyingScore + simGain : 0;
  const projectedTier  = projectedScore > 0 ? getScoreTier(projectedScore) : null;
  const simClosesGap   = simGain > 0 && nextMilestone && (qualifyingScore + simGain) >= nextMilestone;
  const fastestCard    = simCardsWithPaydown.filter(c => c.paydownNeeded > 0).sort((a, b) => b.paydownNeeded - a.paydownNeeded)[0] || null;

  const generateResCorePlan = () => {
    const lines = [`Rescore Action Plan — ${borrowerName || 'Borrower'}\n`];
    lines.push(`Current Score: ${qualifyingScore}  Projected: ${projectedScore} (+${simGain} pts estimated)\n`);
    const paydowns = simCardsWithPaydown.filter(c => c.paydownNeeded > 0);
    if (paydowns.length > 0) {
      lines.push('--- Card Paydowns (target <10% utilization per card) ---');
      paydowns.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.name || `Card ${i + 1}`}: Pay ${fmt$(c.paydownNeeded)} — reduce from ${fmt$(parseFloat(c.balance) || 0)} to ${fmt$(c.targetBal)} (${c.currentUtil}% -> 9%)`);
      });
      lines.push(`\nTotal paydown needed: ${fmt$(totalPaydownNeeded)}`);
    }
    const strats = Object.entries(selectedStrategies).filter(([, v]) => v);
    if (strats.length > 0) {
      lines.push('\n--- Recommended Strategies ---');
      strats.forEach(([i]) => {
        const s = RESCORE_STRATEGIES[i];
        lines.push(`* ${s.title} — est. ${s.impact} in ${s.timeframe}`);
      });
    }
    if (nextMilestone) {
      lines.push(`\n--- Goal ---`);
      lines.push(simClosesGap
        ? `Paydown alone should close the ${pointsToNext}-pt gap to ${nextMilestone}.`
        : `Target: ${nextMilestone} (${pointsToNext} pts needed). Combine paydown + strategies above.`);
    }
    return lines.join('\n');
  };


  const addCollection    = ()         => setCollections(p => [...p, { id: Date.now(), creditor: '', amount: '', type: 'medical', status: 'open', loe: false }]);
  const updateCollection = (id, f, v) => setCollections(p => p.map(c => c.id === id ? { ...c, [f]: v } : c));
  const removeCollection = (id)       => setCollections(p => p.filter(c => c.id !== id));

  // ── Multi-report AI extraction ────────────────────────────────────────────
  const computeMiddle = (exp, tu, eq) => {
    const scores = [exp, tu, eq].map(Number).filter(n => n > 0).sort((a, b) => a - b);
    if (scores.length === 0) return 0;
    return scores[Math.floor(scores.length / 2)];
  };

  const handleReportUpload = (slotId, file) => {
    if (!file) return;
    setReports(p => p.map(r => r.id === slotId ? { ...r, file, result: null, error: '' } : r));
  };

  const runReportAI = async (slotId) => {
    const slot = reports.find(r => r.id === slotId);
    if (!slot?.file) return;
    setReports(p => p.map(r => r.id === slotId ? { ...r, loading: true, error: '' } : r));
    try {
      const base64Data = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Read failed'));
        reader.readAsDataURL(slot.file);
      });
      const isImage   = slot.file.type.startsWith('image/');
      const mediaType = isImage ? slot.file.type : 'application/pdf';

      const prompt = `You are a senior mortgage processor reviewing a tri-merge credit report that may contain ONE or MULTIPLE borrowers.
Extract ALL borrowers found in this report. Return ONLY valid JSON, no markdown, no backticks:
{
  "borrowers": [
    {
      "name": "FULL NAME as shown",
      "experian": number or null,
      "transunion": number or null,
      "equifax": number or null,
      "reasonCodes": {
        "experian": ["10","18","13"],
        "transunion": ["039","010","018"],
        "equifax": ["00039","00010"]
      }
    }
  ],
  "authorizedUserAccounts": [
    {"creditor": "string", "balance": number, "payment": number, "borrower": "name of borrower listed as AU"}
  ],
  "revolvingAccounts": number,
  "installmentAccounts": number,
  "mortgageAccounts": number,
  "totalAccounts": number,
  "overallUtilization": number or null,
  "revolvingAccountDetails": [{"creditor":"string","balance":number,"limit":number}],
  "derogatoryItems": [{"type":"string","date":"YYYY-MM-DD or null","description":"string"}],
  "collections": [{"creditor":"string","amount":number,"type":"medical|non_medical","status":"open|paid"}],
  "flags": ["array of underwriting concern strings"],
  "summary": "one sentence summary"
}
CRITICAL: If you see scores for multiple people, include ALL in the borrowers array with their individual bureau scores and reason codes.
For authorizedUserAccounts: look for ECOA code "A" = Authorized User. Extract those accounts separately — they may inflate DTI incorrectly.
For reasonCodes: extract the actual numeric codes shown next to each bureau score (e.g. 00039, 010, 13). Include ALL codes shown, as arrays of strings.
For derogatoryItems, type should match: bankruptcy_7, bankruptcy_13, foreclosure, short_sale, late_mortgage, collections, judgments.`;

      const msgContent = isImage
        ? [{ type: 'image',    source: { type: 'base64', media_type: mediaType,         data: base64Data } }, { type: 'text', text: prompt }]
        : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }, { type: 'text', text: prompt }];

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: msgContent }] }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data  = await resp.json();
      const text  = data.content?.find(b => b.type === 'text')?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);
      setReports(p => p.map(r => r.id === slotId ? { ...r, loading: false, result } : r));
    } catch (e) {
      setReports(p => p.map(r => r.id === slotId ? { ...r, loading: false, error: 'Could not extract credit data. Check the file and try again.' } : r));
      console.error(e);
    }
  };

  const applyReportResult = (slotId) => {
    const slot = reports.find(r => r.id === slotId);
    if (!slot?.result) return;
    const result = slot.result;

    // Merge borrowers from this report into allBorrowers (replace any from same slot)
    // Also clear slot-0 scenario seed when report 1 is applied — avoids duplicates
    if (result.borrowers?.length > 0) {
      const newBorrowers = result.borrowers.map(b => ({
        name: b.name || `Borrower (Report ${slotId})`,
        experian: b.experian || null,
        transunion: b.transunion || null,
        equifax: b.equifax || null,
        computedMiddle: computeMiddle(b.experian, b.transunion, b.equifax),
        reportSlot: slotId,
        reasonCodes: b.reasonCodes || {},
      })).filter(b => b.computedMiddle > 0);

      setAllBorrowers(prev => {
        // Always clear slot-0 scenario seed when any real report is applied
        const filtered = prev.filter(b => b.reportSlot !== slotId && b.reportSlot !== 0);
        return [...filtered, ...newBorrowers];
      });
      setScoreWriteBackDone(false);

      // Set borrowerScore to qualifying for tradelines compat
      const allMiddles = [...allBorrowers.filter(b => b.reportSlot !== slotId), ...newBorrowers].map(b => b.computedMiddle).filter(s => s > 0);
      if (allMiddles.length > 0) setBorrowerScore(String(Math.min(...allMiddles)));
    }

    // Detect Authorized User accounts
    if (result.authorizedUserAccounts?.length > 0) {
      setAuAccounts(prev => {
        const withoutSlot = prev.filter(a => a.reportSlot !== slotId);
        return [...withoutSlot, ...result.authorizedUserAccounts.map(a => ({ ...a, reportSlot: slotId }))];
      });
    }

    // Apply tradelines from first report only (usually the primary borrower report)
    if (slotId === 1) {
      if (result.overallUtilization != null) setUtilization(String(result.overallUtilization));
      if (result.revolvingAccounts !== undefined)
        setTradelines(p => ({
          ...p,
          revolving:     String(result.revolvingAccounts    || ''),
          installment:   String(result.installmentAccounts  || ''),
          mortgage:      String(result.mortgageAccounts     || ''),
          totalAccounts: String(result.totalAccounts        || ''),
        }));
      if (result.revolvingAccountDetails?.length > 0)
        setSimCards(result.revolvingAccountDetails.map((c, i) => ({
          id: Date.now() + i, name: c.creditor || `Card ${i + 1}`,
          balance: String(c.balance || ''), limit: String(c.limit || ''),
        })));
    }
    // Merge collections and derogatory from all reports
    if (result.collections?.length > 0)
      setCollections(p => [...p, ...result.collections.map((c, i) => ({
        id: Date.now() + i, creditor: c.creditor, amount: String(c.amount),
        type: c.type || 'non_medical', status: c.status || 'open', loe: false,
      }))]);
    if (result.derogatoryItems?.length > 0) {
      const newDerog = {}, newDates = {};
      result.derogatoryItems.forEach(item => {
        const matched = DEROGATORY_TYPES.find(d =>
          d.id === item.type || d.aiKeywords?.some(kw => item.type?.toLowerCase().includes(kw) || item.description?.toLowerCase().includes(kw))
        );
        if (matched) { newDerog[matched.id] = true; if (item.date) newDates[matched.id] = item.date; }
      });
      if (Object.keys(newDerog).length > 0) {
        setDerogatory(p => ({ ...p, ...newDerog }));
        setDerogatoryDates(p => ({ ...p, ...newDates }));
      }
    }
    setReports(p => p.map(r => r.id === slotId ? { ...r, result: null } : r));
  };

  const handleScoreWriteBack = async () => {
    if (!scenarioId || qualifyingScore === 0) return;
    try {
      await updateDoc(doc(db, 'scenarios', scenarioId), { creditScore: qualifyingScore, updated_at: serverTimestamp() });
      setScoreWriteBackDone(true);
    } catch (e) { console.error('Score write-back failed:', e); }
  };

  // ── Fastest Path to Next Milestone ────────────────────────────────────────
  const fastestPathCards = useMemo(() => {
    return simCardsWithPaydown
      .filter(c => c.paydownNeeded > 0)
      .map(c => {
        const util = parseFloat(c.currentUtil) || 0;
        const estPts = util > 80 ? 20 : util > 50 ? 15 : util > 30 ? 10 : 5;
        return { ...c, estPts };
      });
  }, [simCardsWithPaydown]);

  const cheapestPath = useMemo(() => {
    if (!nextMilestone || fastestPathCards.length === 0 || pointsToNext === 0) return null;
    const n = fastestPathCards.length;
    let best = null;
    // Enumerate all non-empty combinations (max 16 with 4 cards)
    for (let mask = 1; mask < (1 << n); mask++) {
      const combo = fastestPathCards.filter((_, i) => mask & (1 << i));
      const pts  = combo.reduce((s, c) => s + c.estPts, 0);
      const cost = combo.reduce((s, c) => s + c.paydownNeeded, 0);
      if (pts >= pointsToNext && (!best || cost < best.totalCost || (cost === best.totalCost && combo.length < best.steps.length))) {
        best = { steps: combo, totalCost: cost, totalPts: pts };
      }
    }
    return best;
  }, [fastestPathCards, nextMilestone, pointsToNext]);

  // ── Rapid Rescore Letter Generator ────────────────────────────────────────
  const generateRescoreLetter = () => {
    const b = qualifyingBorrower || allBorrowers[0];
    const name = b?.name || borrowerName || '[Borrower Name]';
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const vendorName = 'Advantage Credit, Inc.';
    const paydowns = simCardsWithPaydown.filter(c => c.paydownNeeded > 0);
    const auList = auAccounts.filter(a => !a.borrower || a.borrower === b?.name);

    let letter = `Date: ${today}\n\nTo: ${vendorName}\nRE: Rapid Rescore Request — ${name}\n\n`;
    letter += `Please process the following rapid rescore actions for the above-named borrower:\n\n`;

    if (paydowns.length > 0) {
      letter += `CREDIT CARD PAYDOWNS (target <10% utilization):\n`;
      paydowns.forEach((c, i) => {
        letter += `${i + 1}. ${c.name || 'Account'}\n`;
        letter += `   Current Balance: $${parseFloat(c.balance || 0).toLocaleString()}\n`;
        letter += `   New Balance After Paydown: $${c.targetBal.toLocaleString()}\n`;
        letter += `   Credit Limit: $${parseFloat(c.limit || 0).toLocaleString()}\n`;
        letter += `   Supporting documentation: payment confirmation attached\n\n`;
      });
    }

    if (auList.length > 0) {
      letter += `AUTHORIZED USER REMOVALS:\n`;
      auList.forEach((a, i) => {
        letter += `${i + 1}. ${a.creditor} — Balance: $${(a.balance || 0).toLocaleString()} — Borrower listed as Authorized User only\n`;
        letter += `   Please remove this account from DTI calculation — borrower has no legal liability\n\n`;
      });
    }

    letter += `Please process and return updated scores at your earliest convenience.\n\n`;
    letter += `Requested by: [Loan Officer Name]\nNMLS #: [Your NMLS #]\nCompany: [Your Company Name]\n\n`;
    letter += `— Generated by LoanBeacons™ Credit Intelligence™ | Patent Pending`;
    setRescoreLetterText(letter);
    setRescoreLetterVisible(true);
  };

  const generateLOE = (eventId) => {
    const tmpl = LOE_TEMPLATES[eventId];
    if (tmpl) { setLoeText(tmpl(derogatoryDates[eventId] || '', borrowerName)); setLoeEvent(eventId); setShowLOE(true); }
  };

  const copyLOE = () => {
    navigator.clipboard.writeText(loeText).then(() => { setLoeCopied(true); setTimeout(() => setLoeCopied(false), 2000); });
  };

  const copyResCorePlan = () => {
    navigator.clipboard.writeText(generateResCorePlan()).then(() => { setRescoredCopied(true); setTimeout(() => setRescoredCopied(false), 2000); });
  };

  // ─── Next Step Intelligence™ ──────────────────────────────────────────────
  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash')
    ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('term') || rawPurpose.includes('refi')
      ? 'rate_term_refi'
      : 'purchase';

  const nsiFindings = {
    creditScore:     qualifyingScore || 0,
    hasCollections:  collections.filter(c => c.status === 'open').length > 0,
    hasDerogatory:   Object.values(derogatory).some(Boolean),
  };

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'CREDIT_INTEL',
      loanPurpose,
      decisionRecordFindings:  { CREDIT_INTEL: nsiFindings },
      scenarioData:            scenario || {},
      completedModules:        [],
      scenarioId,
      onWriteToDecisionRecord: null,
    });

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('CREDIT_INTEL', {
        borrowerMidScore: midScore, coBorrowerMidScore: coMidScore, qualifyingScore,
        scoreTier: tier?.label || null, utilization: util,
        derogatoryEvents:           Object.keys(derogatory).filter(k => derogatory[k]),
        collectionCount:            collections.length,
        openCollections:            collections.filter(c => c.status === 'open').length,
        eligibleProgramCount:       eligiblePrograms.length,
        rescoreStrategiesSelected:  Object.keys(selectedStrategies).filter(k => selectedStrategies[k]).map(k => RESCORE_STRATEGIES[k]?.title),
        projectedScoreAfterRescore: simGain > 0 ? projectedScore : null,
        simulatedScoreGain:         simGain || null,
        totalPaydownNeeded:         totalPaydownNeeded || null,
        cardPaydownPlan:            simCardsWithPaydown.filter(c => c.paydownNeeded > 0).map(c => ({ card: c.name, paydown: c.paydownNeeded, targetBalance: c.targetBal })),
        pointsToNextMilestone:      pointsToNext,
        nextMilestone,
        simClosesGap,
        tradelines: { revolving: tradelines.revolving, installment: tradelines.installment, mortgage: tradelines.mortgage },
        loNotes: notes,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
      setFindingsReported(true);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ModuleNav moduleNumber={5} />
      <div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
    </div>
  );

  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <button onClick={() => navigate('/')} className="text-blue-600 mb-4 flex items-center gap-2 text-sm">← Back</button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">05</div>
          <div><h1 className="text-2xl font-bold">Credit Intelligence™</h1><p className="text-sm text-gray-500">Stage 1 — Pre-Structure</p></div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-bold text-gray-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
            <div className="space-y-2">
              {scenarios.map(s => (
                <button key={s.id} onClick={() => navigate(`/credit-intel?scenarioId=${s.id}`)}
                  className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
                  <div className="text-xs text-gray-500">${parseFloat(s.loanAmount||0).toLocaleString()} · Credit: {s.creditScore||'--'}</div>
                </button>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-6 pb-24">
      <div className="max-w-5xl mx-auto px-4">
        <ModuleNav moduleNumber={5} />

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 5</span>
              </div>
              <h1 className="text-2xl font-bold">Credit Intelligence™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}Score Tiers · Derogatory Events · Rapid Rescore</p>
            </div>
            {tier && (
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Qualifying Score</div>
                <div className="text-4xl font-black text-white">{qualifyingScore}</div>
                <div className={`text-xs font-bold px-3 py-1 rounded-full mt-1 inline-block ${tier.badge}`}>{tier.label}</div>
              </div>
            )}
          </div>
        </div>

        {/* Score Gap Alert — enhanced with sim cross-ref */}
        {qualifyingScore > 0 && nextMilestone && pointsToNext <= 40 && (
          <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-2xl">🎯</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">{pointsToNext} point{pointsToNext !== 1 ? 's' : ''} away from the next milestone — {nextMilestone}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Reaching {nextMilestone} unlocks better pricing and program eligibility.
                {pointsToNext <= 15 ? ' A rapid rescore may close this gap in 72 hours.' : ' Review rescore strategies below.'}
              </p>
              {simClosesGap && fastestCard && (
                <p className="text-xs text-emerald-700 font-bold mt-1">
                  ✓ Paying down {fastestCard.name || 'revolving cards'} projects +{simGain} pts — enough to cross {nextMilestone} without additional strategies.
                </p>
              )}
              {!simClosesGap && simGain > 0 && (
                <p className="text-xs text-amber-700 mt-1">Card paydown projects +{simGain} pts — combine with additional strategies to close the gap.</p>
              )}
              {nextPrograms.length > 0 && (
                <p className="text-xs text-amber-600 mt-1 font-semibold">Unlocks: {nextPrograms.map(([p]) => p).join(', ')}</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* ── MULTI-REPORT AI UPLOAD ─────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🤖 AI Credit Report Review</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload up to 3 separate credit reports — AI extracts all borrowers from each. Handles primary borrower report + co-borrower prequal report automatically.</p>
              </div>
              <div className="space-y-3">
                {reports.map(slot => (
                  <div key={slot.id} className={`border rounded-xl p-4 ${slot.result ? 'border-emerald-300 bg-emerald-50/40' : slot.file ? 'border-indigo-300 bg-indigo-50/30' : 'border-dashed border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-600">{slot.label}</p>
                      {slot.file && !slot.result && (
                        <button onClick={() => setReports(p => p.map(r => r.id === slot.id ? { ...r, file: null, error: '' } : r))}
                          className="text-xs text-slate-400 hover:text-red-400">✕ Remove</button>
                      )}
                    </div>

                    {!slot.file ? (
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="file" accept=".pdf,image/*" className="hidden"
                          onChange={e => handleReportUpload(slot.id, e.target.files?.[0] || null)} />
                        <span className="text-xs text-indigo-600 font-semibold border border-indigo-300 rounded-lg px-3 py-1.5 hover:bg-indigo-50">📄 Upload PDF</span>
                        <span className="text-xs text-slate-400">or drag a file here</span>
                      </label>
                    ) : slot.result ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-emerald-700">✅ {slot.result.borrowers?.length || 0} borrower{(slot.result.borrowers?.length||0) !== 1 ? 's' : ''} extracted</p>
                        <div className="space-y-1">
                          {slot.result.borrowers?.map((b, i) => {
                            const mid = computeMiddle(b.experian, b.transunion, b.equifax);
                            return (
                              <div key={i} className="flex items-center justify-between text-xs bg-white border border-emerald-100 rounded-lg px-3 py-1.5">
                                <span className="font-semibold text-slate-700 truncate">{b.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-slate-400">{[b.experian, b.transunion, b.equifax].filter(Boolean).join(' / ')}</span>
                                  <span className="font-black text-emerald-700">Mid: {mid}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {slot.result.flags?.length > 0 && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            {slot.result.flags.map((f, i) => <p key={i}>⚠ {f}</p>)}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => applyReportResult(slot.id)}
                            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold">
                            ✓ Apply to Module
                          </button>
                          <button onClick={() => setReports(p => p.map(r => r.id === slot.id ? { ...r, result: null } : r))}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">Discard</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-600 font-semibold truncate">📄 {slot.file.name}</p>
                        <button onClick={() => runReportAI(slot.id)} disabled={slot.loading}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all">
                          {slot.loading ? '⏳ Analyzing…' : '🔍 Run AI Review'}
                        </button>
                        {slot.error && <p className="text-xs text-red-500">{slot.error}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── UNIFIED BORROWER SCORE TABLE ──────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">📊 Credit Scores — All Borrowers</h2>

              {allBorrowers.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  <p>Upload credit reports above — AI will extract all borrowers automatically.</p>
                  <p className="text-xs mt-1 text-slate-300">Or enter scores manually below ↓</p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {allBorrowers.map((b, i) => {
                    const isQualifying = b.computedMiddle === qualifyingScore;
                    const ci = (b.name || '').indexOf(',');
                    const niceName = ci > -1
                      ? (b.name.slice(ci+1).trim() + ' ' + b.name.slice(0,ci).trim())
                      : b.name;
                    const displayName = niceName.toLowerCase().split(' ').filter(Boolean)
                      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    return (
                      <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${isQualifying ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-100'}`}>
                        <div>
                          <p className={`text-sm font-bold ${isQualifying ? 'text-amber-800' : 'text-slate-700'}`}>
                            {isQualifying ? '⭐ ' : ''}{displayName}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {[b.experian && `EXP ${b.experian}`, b.transunion && `TU ${b.transunion}`, b.equifax && `EQ ${b.equifax}`].filter(Boolean).join(' · ') || (b.reportSlot === 0 ? 'From scenario — upload report to get bureau scores' : 'Scores from AI')}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${isQualifying ? 'text-amber-700' : 'text-slate-600'}`}>{b.computedMiddle}</div>
                          <div className="text-[10px] text-slate-400">middle score</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {allBorrowers.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-indigo-800">Qualifying Score: {qualifyingScore}</p>
                    <p className="text-xs text-indigo-600 mt-0.5">
                      {qualifyingBorrower ? (() => {
                        const ci = (qualifyingBorrower.name || '').indexOf(',');
                        const nice = ci > -1
                          ? (qualifyingBorrower.name.slice(ci+1).trim() + ' ' + qualifyingBorrower.name.slice(0,ci).trim())
                          : qualifyingBorrower.name;
                        return nice.toLowerCase().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
                      })() + ' — lowest middle' : 'lowest middle across all borrowers'}
                      {allBorrowers.length > 1 && <span className="ml-2 text-amber-600 font-semibold">⚠ {allBorrowers.length}-borrower file</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {scenarioId && !scoreWriteBackDone && (
                      <button onClick={handleScoreWriteBack}
                        className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg">
                        Update Scenario
                      </button>
                    )}
                    {scoreWriteBackDone && <span className="text-xs font-bold text-emerald-600">✅ Scenario Updated</span>}
                  </div>
                </div>
              )}

              {/* Manual entry fallback */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-400 mb-2">Manual entry (optional — use if not uploading PDFs)</p>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-500">Qualifying mid score:</label>
                  <input type="number" value={borrowerScore} onChange={e => { setBorrowerScore(e.target.value); if (allBorrowers.length === 0 && e.target.value) setAllBorrowers([{ name: 'Borrower', experian: null, transunion: null, equifax: null, computedMiddle: parseInt(e.target.value)||0, reportSlot: 0 }]); }}
                    placeholder="e.g. 680"
                    className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
            </div>
            {/* ── SCORE FACTOR INTELLIGENCE ─────────────────────────── */}
            {allBorrowers.some(b => b.reasonCodes && (Object.values(b.reasonCodes).flat().length > 0)) && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🧠 Score Factor Intelligence</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Reason codes extracted from credit report — ranked by actionability</p>
                  </div>
                  {allBorrowers.length > 1 && (
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setFocusBorrower(null)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${!focusBorrower ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                        Qualifying
                      </button>
                      {allBorrowers.map((b, i) => {
                        // Handle "LASTNAME, FIRSTNAME" → "Firstname Lastname" and normalize to Title Case
                        const raw = b.name || '';
                        const commaIdx = raw.indexOf(',');
                        const reordered = commaIdx > -1
                          ? (raw.slice(commaIdx + 1).trim() + ' ' + raw.slice(0, commaIdx).trim())
                          : raw;
                        const displayName = reordered
                          .toLowerCase()
                          .split(' ')
                          .filter(Boolean)
                          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ');
                        return (
                          <button key={i} onClick={() => setFocusBorrower(b.name)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${focusBorrower === b.name ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                            {displayName}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {(() => {
                  // Find target borrower directly from allBorrowers — no name-match needed
                  const targetBorrower = focusBorrower
                    ? allBorrowers.find(b => b.name === focusBorrower)
                    : (qualifyingBorrower || allBorrowers[0]);
                  if (!targetBorrower) return <p className="text-xs text-slate-400">Upload a credit report to see score factors.</p>;

                  const rc = targetBorrower.reasonCodes || {};
                  const allCodes = [...new Set([
                    ...(rc.experian   || []),
                    ...(rc.transunion || []),
                    ...(rc.equifax    || []),
                  ].map(normalizeCode))].filter(c => c && c !== '0' && /^\d+$/.test(c));

                  const codes = allCodes.map(code => ({
                    code,
                    ...(REASON_CODE_MAP[code] || { text: `Score factor code ${code}`, actionable: false, estPts: '?', action: 'Review with credit analyst.' }),
                  }));

                  const actionable = codes.filter(c => c.actionable);
                  const timeOnly   = codes.filter(c => !c.actionable);

                  // Display name: handle LASTNAME, FIRSTNAME format
                  const raw = targetBorrower.name || '';
                  const commaIdx = raw.indexOf(',');
                  const reordered = commaIdx > -1
                    ? (raw.slice(commaIdx + 1).trim() + ' ' + raw.slice(0, commaIdx).trim())
                    : raw;
                  const displayLabel = reordered.toLowerCase().split(' ').filter(Boolean)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Showing codes for:</span>
                        <span className="text-xs font-bold text-slate-700">{displayLabel}</span>
                        {!focusBorrower && qualifyingBorrower && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Qualifying</span>}
                      </div>
                      {actionable.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-emerald-700">✅ Actionable — do these now</p>
                          {actionable.map((c, i) => (
                            <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-emerald-800">{c.text}</span>
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">+{c.estPts} pts est.</span>
                              </div>
                              <p className="text-xs text-emerald-700">{c.action}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {timeOnly.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-400">⏳ Time-only — nothing to do</p>
                          {timeOnly.map((c, i) => (
                            <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3 opacity-70">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-600">{c.text}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-400 font-bold px-2 py-0.5 rounded-full">Time only</span>
                              </div>
                              <p className="text-xs text-slate-500">{c.action}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {codes.length === 0 && <p className="text-xs text-slate-400">No reason codes extracted from this borrower's report.</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── AU ACCOUNT DETECTION ──────────────────────────────────── */}
            {auAccounts.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⚡</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800">Free Action Detected — Authorized User Accounts</p>
                    <p className="text-xs text-amber-700 mt-0.5">These accounts appear in DTI but borrower has no legal liability. Removing may reduce DTI at zero cost.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {auAccounts.map((a, i) => (
                    <div key={i} className="bg-white border border-amber-200 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{a.creditor}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Balance: ${(a.balance || 0).toLocaleString()} · Payment: ${(a.payment || 0).toLocaleString()}/mo
                            {a.borrower && (() => {
                              const raw = a.borrower;
                              const ci = raw.indexOf(',');
                              const nice = ci > -1
                                ? (raw.slice(ci+1).trim() + ' ' + raw.slice(0,ci).trim())
                                : raw;
                              const titled = nice.toLowerCase().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
                              return <span className="ml-2 text-amber-600">AU on {titled}'s report</span>;
                            })()}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">ECOA: A</span>
                      </div>
                      <p className="text-xs text-amber-700 mt-2">⚠ Verify borrower has independent tradelines before removing. If yes — remove as AU to eliminate ${(a.payment||0).toLocaleString()}/mo from DTI instantly.</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FASTEST PATH TO MILESTONE ─────────────────────────────── */}
            {cheapestPath && nextMilestone && (
              <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🎯</span>
                  <div>
                    <p className="text-sm font-bold text-indigo-800">Fastest Path to {nextMilestone} — Minimum Spend</p>
                    <p className="text-xs text-indigo-600 mt-0.5">You need {pointsToNext} pts. Here's the cheapest way to get there — stop after this, don't overspend.</p>
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  {cheapestPath.steps.map((c, i) => (
                    <div key={i} className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-sm font-bold text-indigo-900">{c.name || `Card ${i+1}`}</p>
                        <p className="text-xs text-indigo-600">Pay {fmt$(c.paydownNeeded)} → reduce ${parseFloat(c.balance||0).toLocaleString()} to ${c.targetBal.toLocaleString()} ({c.currentUtil}% → 9%)</p>
                      </div>
                      <span className="text-sm font-black text-emerald-600">+{c.estPts} pts est.</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between bg-indigo-600 text-white rounded-lg px-4 py-3">
                  <span className="text-sm font-bold">Total spend to cross {nextMilestone}</span>
                  <span className="text-lg font-black">{fmt$(cheapestPath.totalCost)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 italic">Estimates based on utilization reduction. Actual results vary. Request rapid rescore after paydowns.</p>
              </div>
            )}

            {/* ── RAPID RESCORE REQUEST LETTER ─────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">📨 Rapid Rescore Request</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Pre-filled letter for your credit vendor — ready to send after paydowns are made.</p>
                </div>
                <button onClick={generateRescoreLetter}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg">
                  Generate Letter
                </button>
              </div>
              {rescoreLetterVisible && (
                <div className="space-y-2">
                  <textarea readOnly value={rescoreLetterText} rows={14}
                    className="w-full text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(rescoreLetterText); }}
                      className="flex-1 py-2 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50">
                      📋 Copy to Clipboard
                    </button>
                    <button onClick={() => setRescoreLetterVisible(false)}
                      className="px-4 py-2 text-xs text-slate-400 border border-slate-200 rounded-lg hover:bg-slate-50">
                      Hide
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tradelines */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">💳 Tradelines & Utilization</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[['Revolving Accounts', tradelines.revolving, v => setTradelines(p => ({...p, revolving: v}))],
                  ['Installment Accounts', tradelines.installment, v => setTradelines(p => ({...p, installment: v}))],
                  ['Mortgage Accounts', tradelines.mortgage, v => setTradelines(p => ({...p, mortgage: v}))],
                  ['Total Accounts', tradelines.totalAccounts, v => setTradelines(p => ({...p, totalAccounts: v}))],
                ].map(([l, v, s]) => (
                  <div key={l}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{l}</label>
                    <input type="number" value={v} placeholder="0" onChange={e => s(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Overall Revolving Utilization (%)</label>
                <input type="number" value={utilization} placeholder="32" onChange={e => setUtilization(e.target.value)}
                  className={`w-48 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 ${util > 50 ? 'border-red-300 bg-red-50' : util > 30 ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} />
                {util > 0 && (
                  <p className={`text-xs mt-1 ${util > 50 ? 'text-red-600' : util > 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {util > 50 ? '⚠ High utilization — rapid rescore recommended' : util > 30 ? '⚠ Moderate — paying down can improve score' : '✓ Good utilization'}
                  </p>
                )}
              </div>
            </div>

            {/* Rescore Simulator with Pay-to-Close Gap */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">⚡ Rescore Simulator</h2>
              <p className="text-xs text-slate-400 mb-4">
                {simCards.some(c => c.name) ? 'Cards pre-populated from credit report. Add missing limits to run simulation.' : 'Enter card balances and limits — or upload credit report above to auto-fill.'}
              </p>

              <div className="space-y-2 mb-3">
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-bold text-slate-400 px-1 mb-1">
                  <span className="col-span-4">Card</span>
                  <span className="col-span-2 text-right">Balance</span>
                  <span className="col-span-2 text-right">Limit</span>
                  <span className="col-span-2 text-center">Util %</span>
                  <span className="col-span-2 text-right">Pay Down To</span>
                </div>
                {simCardsWithPaydown.map((card, i) => (
                  <div key={card.id} className={`grid grid-cols-12 gap-2 items-center rounded-lg p-2 ${card.paydownNeeded > 0 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50 border border-slate-100'}`}>
                    <input type="text" value={card.name} placeholder={`Card ${i + 1}`}
                      onChange={e => setSimCards(p => p.map(c => c.id === card.id ? { ...c, name: e.target.value } : c))}
                      className="col-span-4 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
                    <input type="number" value={card.balance} placeholder="Balance"
                      onChange={e => setSimCards(p => p.map(c => c.id === card.id ? { ...c, balance: e.target.value } : c))}
                      className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
                    <input type="number" value={card.limit} placeholder="Limit"
                      onChange={e => setSimCards(p => p.map(c => c.id === card.id ? { ...c, limit: e.target.value } : c))}
                      className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
                    <div className={`col-span-2 text-xs font-bold text-center ${parseFloat(card.currentUtil) > 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {card.limit ? `${card.currentUtil}%` : '—'}
                    </div>
                    <div className={`col-span-1 text-xs font-bold text-right ${card.paydownNeeded > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {card.limit ? (card.paydownNeeded > 0 ? fmt$(card.paydownNeeded) : '✓') : '—'}
                    </div>
                    {simCardsWithPaydown.length > 1 && (
                      <button onClick={() => setSimCards(p => p.filter(c => c.id !== card.id))} className="col-span-1 text-slate-300 hover:text-red-400 text-center">✕</button>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={() => setSimCards(p => [...p, { id: Date.now(), name: '', balance: '', limit: '' }])}
                className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 mb-4">+ Add Card</button>

              {simGain > 0 && qualifyingScore > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Projected Score After Paydown</span>
                    <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">+{simGain} pts est.</span>
                  </div>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="text-center">
                      <div className="text-xs text-slate-400">Current</div>
                      <div className="text-2xl font-black text-slate-700">{qualifyingScore}</div>
                      {tier && <div className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${tier.badge}`}>{tier.label}</div>}
                    </div>
                    <div className="text-2xl text-emerald-400 font-black">→</div>
                    <div className="text-center">
                      <div className="text-xs text-slate-400">Projected</div>
                      <div className="text-2xl font-black text-emerald-600">{projectedScore}</div>
                      {projectedTier && <div className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${projectedTier.badge}`}>{projectedTier.label}</div>}
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-xs text-slate-400">Total to pay down</div>
                      <div className="text-xl font-black text-amber-600">{fmt$(totalPaydownNeeded)}</div>
                    </div>
                  </div>
                  {projectedScore >= 620 && qualifyingScore < 620 && <p className="text-xs text-emerald-700 font-bold">🎉 Crosses 620 — Conventional/FHA eligibility unlocked!</p>}
                  {projectedScore >= 740 && qualifyingScore < 740 && <p className="text-xs text-emerald-700 font-bold">🎉 Crosses 740 — best pricing tier unlocked!</p>}
                  <p className="text-xs text-slate-400 italic">Estimates based on utilization reduction. Actual results vary.</p>

                  {/* One-click Rescore Action Plan */}
                  <div className="pt-2 border-t border-emerald-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-emerald-800">📋 Rescore Action Plan — ready to hand to borrower</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowRescore(v => !v)} className="text-xs text-emerald-700 font-semibold hover:text-emerald-900">
                          {showRescore ? 'Hide' : 'Preview'}
                        </button>
                        <button onClick={copyResCorePlan}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all">
                          {rescoredCopied ? '✓ Copied!' : '📋 Copy Plan'}
                        </button>
                      </div>
                    </div>
                    {showRescore && (
                      <pre className="text-xs text-slate-600 bg-white border border-emerald-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                        {generateResCorePlan()}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Derogatory Events */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">⚠️ Derogatory Events</h2>
              <p className="text-xs text-slate-400 mb-4">Auto-populated from credit report upload. Check all that apply. Waiting periods from discharge/completion date.</p>
              <div className="space-y-3">
                {DEROGATORY_TYPES.map(d => {
                  const checked = !!derogatory[d.id];
                  const dateVal = derogatoryDates[d.id] || '';
                  const elapsed = checked && dateVal ? monthsElapsed(dateVal) : null;
                  const hasLOE  = !!LOE_TEMPLATES[d.id];
                  return (
                    <div key={d.id} className={`rounded-xl border p-4 transition-all ${checked ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={e => setDerogatory(p => ({ ...p, [d.id]: e.target.checked }))}
                          className="w-4 h-4 mt-0.5 accent-red-600 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-slate-800">{d.label}</div>
                              {checked && !dateVal && d.fha > 0 && <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Add date →</span>}
                            </div>
                            {checked && hasLOE && (
                              <button onClick={() => generateLOE(d.id)} className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded-lg hover:bg-indigo-200 transition-all">
                                📝 Generate LOE
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{d.note}</div>
                          {checked && (
                            <>
                              {d.fha > 0 && (
                                <div className="mt-2">
                                  <label className="block text-xs text-slate-400 mb-1">Date of Event (discharge/completion)</label>
                                  <input type="date" value={dateVal} onChange={e => setDerogatoryDates(p => ({ ...p, [d.id]: e.target.value }))}
                                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300" />
                                </div>
                              )}
                              {elapsed !== null && d.fha > 0 && (
                                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  {[['FHA', d.fha], ['Conv.', d.conv], ['VA', d.va], ['USDA', d.usda]].map(([prog, req]) => {
                                    if (req === 0) return <div key={prog} className="bg-white rounded-lg p-2 border border-slate-100 text-center"><div className="font-bold text-slate-400">Case-by-case</div><div className="text-slate-400">{prog}</div></div>;
                                    const remaining = req - elapsed;
                                    const eligible  = remaining <= 0;
                                    return (
                                      <div key={prog} className={`rounded-lg p-2 border text-center ${eligible ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-100'}`}>
                                        <div className={`font-bold ${eligible ? 'text-emerald-600' : 'text-red-500'}`}>{eligible ? '✓ Eligible' : `${remaining} mo left`}</div>
                                        <div className="text-slate-400">{prog}</div>
                                        <div className={`text-xs ${eligible ? 'text-emerald-500' : 'text-red-400'}`}>{elapsed} / {req} mo</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {elapsed === null && d.fha > 0 && (
                                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                                  {[['FHA', d.fha], ['Conv.', d.conv], ['VA', d.va], ['USDA', d.usda]].map(([prog, req]) => (
                                    <div key={prog} className="bg-white rounded-lg p-2 border border-red-100 text-center">
                                      <div className="font-bold text-red-600">{req > 0 ? `${req} mo` : 'Case-by-case'}</div>
                                      <div className="text-slate-400">{prog}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LOE Generator */}
            {showLOE && (
              <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700">📝 Letter of Explanation — {DEROGATORY_TYPES.find(d => d.id === loeEvent)?.label}</h2>
                  <button onClick={() => setShowLOE(false)} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
                </div>
                <p className="text-xs text-slate-400 mb-2">Edit as needed. Fields in [brackets] require borrower input.</p>
                <textarea value={loeText} onChange={e => setLoeText(e.target.value)} rows={12}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-indigo-300 resize-none bg-slate-50" />
                <div className="flex gap-2 mt-3">
                  <button onClick={copyLOE} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all">
                    {loeCopied ? '✓ Copied!' : '📋 Copy to Clipboard'}
                  </button>
                  <button onClick={() => setShowLOE(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">Done</button>
                </div>
              </div>
            )}

            {/* Collections */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">📋 Collections & Judgments</h2>
                <button onClick={addCollection} className="text-xs text-indigo-600 font-semibold">+ Add</button>
              </div>
              <p className="text-xs text-slate-400 mb-4">FHA ignores medical collections. Non-medical $2,000+ aggregate may require payoff or LOE.</p>
              {collections.length === 0 ? <p className="text-sm text-slate-300 italic">None entered.</p> : (
                <div className="space-y-2">
                  {collections.map(c => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <input type="text" value={c.creditor} placeholder="Creditor name" onChange={e => updateCollection(c.id, 'creditor', e.target.value)} className="flex-1 min-w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <input type="number" value={c.amount} placeholder="$" onChange={e => updateCollection(c.id, 'amount', e.target.value)} className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <select value={c.type} onChange={e => updateCollection(c.id, 'type', e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                        <option value="medical">Medical</option>
                        <option value="non_medical">Non-Medical</option>
                        <option value="judgment">Judgment</option>
                      </select>
                      <select value={c.status} onChange={e => updateCollection(c.id, 'status', e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                        <option value="open">Open</option>
                        <option value="paid">Paid</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={c.loe} onChange={e => updateCollection(c.id, 'loe', e.target.checked)} className="accent-indigo-600" />
                        <span className="text-slate-500">LOE</span>
                      </label>
                      <button onClick={() => removeCollection(c.id)} className="text-slate-300 hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rapid Rescore Strategies — smart pre-selection */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">⚡ Rapid Rescore Strategies</h2>
                <span className="text-xs text-slate-400 italic">Auto-selected based on borrower profile</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">Pre-selected based on the file. Review and adjust as needed.</p>
              <div className="space-y-2">
                {RESCORE_STRATEGIES.map((s, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                    ${selectedStrategies[i] ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!selectedStrategies[i]}
                      onChange={e => setSelectedStrategies(p => ({ ...p, [i]: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-indigo-600 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold text-slate-800">{s.title}</div>
                        {s.rapidRescore && <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">72hr</span>}
                        {selectedStrategies[i] && s.trigger && <span className="text-xs bg-indigo-100 text-indigo-600 font-semibold px-1.5 py-0.5 rounded">Auto-selected</span>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-400">
                        <span>📈 {s.impact}</span>
                        <span>⏱ {s.timeframe}</span>
                        <span>💰 {s.cost}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* LO Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Credit analysis notes, LOE explanations, rescore plan details..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

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
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Credit Intelligence™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {tier && (
              <div className={`rounded-xl border p-4 ${tier.badge} border-current`}>
                <h3 className="text-xs font-bold uppercase tracking-wide mb-2 opacity-70">Score Tier</h3>
                <div className="text-4xl font-black">{qualifyingScore}</div>
                <div className="text-sm font-bold mt-1">{tier.label}</div>
                <div className="text-xs mt-2 opacity-80">{tier.desc}</div>
              </div>
            )}

            {util > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Utilization</h3>
                <div className={`text-3xl font-black ${util > 50 ? 'text-red-500' : util > 30 ? 'text-amber-500' : 'text-emerald-500'}`}>{util}%</div>
                <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${util > 50 ? 'bg-red-400' : util > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(util, 100)}%` }} />
                </div>
                <div className="text-xs text-slate-400 mt-1">Target: &lt;10% for max score</div>
              </div>
            )}

            {/* Program Eligibility — just missed indicator */}
            {qualifyingScore > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Program Eligibility</h3>
                <div className="space-y-1.5">
                  {Object.entries(PROGRAM_MIN_SCORES).map(([prog, data]) => {
                    const pass      = qualifyingScore >= data.score;
                    const ptsAway   = data.score - qualifyingScore;
                    const justMissed = !pass && ptsAway <= 20;
                    return (
                      <div key={prog} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs
                        ${pass ? 'bg-emerald-50 border border-emerald-100' : justMissed ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-100 opacity-60'}`}>
                        <span className={`font-semibold ${pass ? 'text-emerald-700' : justMissed ? 'text-amber-700' : 'text-slate-400'}`}>{prog}</span>
                        <span className={pass ? 'text-emerald-600 font-bold' : justMissed ? 'text-amber-600 font-bold' : 'text-red-400 font-bold'}>
                          {pass ? '✓' : justMissed ? `${ptsAway} pts away` : `Need ${data.score}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• Use <strong>middle score</strong> of lower-scoring borrower</p>
                <p>• Utilization target: &lt;10% per card for max impact</p>
                <p>• Medical collections: FHA ignores them</p>
                <p>• Rapid rescore: 72-hr turnaround via lender</p>
                <p>• AU removal can help OR hurt — verify</p>
                <p>• BK Ch7: 2yr FHA, 4yr conventional</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
