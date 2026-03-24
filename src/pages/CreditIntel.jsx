// src/pages/CreditIntel.jsx
// LoanBeacons™ — Module 5 | Stage 1: Pre-Structure
// Credit Intelligence™ — Full Enhanced Build
// High Impact: Upload open by default, Pay-to-Close Gap, One-click Rescore Plan
// Medium Impact: Score gap cross-ref, Auto-check derogatory from AI, "Just missed" eligibility
// Polish: Smart strategy pre-selection, Enhanced Decision Record log

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

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

export default function CreditIntel() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const scenarioId     = searchParams.get('scenarioId');
  const fileRef        = useRef(null);

  const { reportFindings }                = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);

  const [scenario,  setScenario]  = useState(null);
  const [loading,   setLoading]   = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [borrowerScore, setBorrowerScore] = useState('');
  const [coScore,       setCoScore]       = useState('');
  const [bureau1, setBureau1] = useState('');
  const [bureau2, setBureau2] = useState('');
  const [bureau3, setBureau3] = useState('');
  const [coBureau1, setCoBureau1] = useState('');
  const [coBureau2, setCoBureau2] = useState('');
  const [coBureau3, setCoBureau3] = useState('');

  const [tradelines,          setTradelines]          = useState({ revolving: '', installment: '', mortgage: '', totalAccounts: '' });
  const [utilization,         setUtilization]         = useState('');
  const [derogatory,          setDerogatory]          = useState({});
  const [derogatoryDates,     setDerogatoryDates]     = useState({});
  const [collections,         setCollections]         = useState([]);
  const [selectedStrategies,  setSelectedStrategies]  = useState({});
  const [notes,               setNotes]               = useState('');

  // Upload — open by default
  const [uploadFile,    setUploadFile]    = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult,  setUploadResult]  = useState(null);
  const [uploadError,   setUploadError]   = useState('');
  const [showUpload,    setShowUpload]    = useState(true);

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
        if (d.creditScore) setBorrowerScore(String(d.creditScore));
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

  // Derived
  const midScore        = parseInt(borrowerScore) || 0;
  const coMidScore      = parseInt(coScore) || 0;
  const qualifyingScore = coMidScore > 0 ? Math.min(midScore, coMidScore) : midScore;
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

  const calcMid = (v1, v2, v3, newVal, setter, scoreSetter) => {
    const scores = [parseInt(v1)||0, parseInt(v2)||0, parseInt(v3)||0, parseInt(newVal)||0].filter(n => n > 0).sort((a, b) => a - b);
    setter(newVal);
    scoreSetter(String(scores[Math.floor(scores.length / 2)] || ''));
  };

  const addCollection    = ()         => setCollections(p => [...p, { id: Date.now(), creditor: '', amount: '', type: 'medical', status: 'open', loe: false }]);
  const updateCollection = (id, f, v) => setCollections(p => p.map(c => c.id === id ? { ...c, [f]: v } : c));
  const removeCollection = (id)       => setCollections(p => p.filter(c => c.id !== id));

  const handleAIReview = async () => {
    if (!uploadFile) return;
    setUploadLoading(true); setUploadError(''); setUploadResult(null);
    try {
      const base64Data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(uploadFile);
      });
      const isImage   = uploadFile.type.startsWith('image/');
      const mediaType = isImage ? uploadFile.type : 'application/pdf';
      const prompt = `You are a senior mortgage processor reviewing a tri-merge credit report.
Extract the following and return ONLY valid JSON, no markdown, no backticks:
{
  "borrowerName": "string or null",
  "experian": number or null,
  "transunion": number or null,
  "equifax": number or null,
  "midScore": number or null,
  "revolvingAccounts": number,
  "installmentAccounts": number,
  "mortgageAccounts": number,
  "totalAccounts": number,
  "overallUtilization": number,
  "revolvingAccountDetails": [{"creditor": "string", "balance": number, "limit": number}],
  "derogatoryItems": [{"type": "string", "date": "YYYY-MM-DD or null", "description": "string"}],
  "collections": [{"creditor": "string", "amount": number, "type": "medical|non_medical", "status": "open|paid"}],
  "flags": ["array of underwriting concern strings"],
  "summary": "one sentence summary"
}
For revolvingAccountDetails include every open revolving tradeline with current balance and credit limit.
For derogatoryItems, type should match one of: bankruptcy_7, bankruptcy_13, foreclosure, short_sale, late_mortgage, collections, judgments.`;

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
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 2000, messages: [{ role: 'user', content: msgContent }] }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data   = await resp.json();
      const text   = data.content?.find(b => b.type === 'text')?.text || '';
      const clean  = text.replace(/```json|```/g, '').trim();
      setUploadResult(JSON.parse(clean));
    } catch (e) {
      setUploadError('Could not extract credit data. Check the file and try again.');
      console.error(e);
    } finally { setUploadLoading(false); }
  };

  const applyExtractedCredit = () => {
    if (!uploadResult) return;
    if (uploadResult.experian)           setBureau1(String(uploadResult.experian));
    if (uploadResult.transunion)         setBureau2(String(uploadResult.transunion));
    if (uploadResult.equifax)            setBureau3(String(uploadResult.equifax));
    if (uploadResult.midScore)           setBorrowerScore(String(uploadResult.midScore));
    if (uploadResult.overallUtilization) setUtilization(String(uploadResult.overallUtilization));
    if (uploadResult.revolvingAccounts !== undefined)
      setTradelines(p => ({
        ...p,
        revolving:     String(uploadResult.revolvingAccounts    || ''),
        installment:   String(uploadResult.installmentAccounts  || ''),
        mortgage:      String(uploadResult.mortgageAccounts     || ''),
        totalAccounts: String(uploadResult.totalAccounts        || ''),
      }));
    if (uploadResult.collections?.length > 0)
      setCollections(uploadResult.collections.map((c, i) => ({
        id: Date.now() + i, creditor: c.creditor, amount: String(c.amount),
        type: c.type || 'non_medical', status: c.status || 'open', loe: false,
      })));
    // Pre-populate rescore simulator from revolving account details
    if (uploadResult.revolvingAccountDetails?.length > 0)
      setSimCards(uploadResult.revolvingAccountDetails.map((c, i) => ({
        id: Date.now() + i, name: c.creditor || `Card ${i + 1}`,
        balance: String(c.balance || ''), limit: String(c.limit || ''),
      })));
    // Auto-check derogatory events from AI extraction
    if (uploadResult.derogatoryItems?.length > 0) {
      const newDerog = {}, newDates = {};
      uploadResult.derogatoryItems.forEach(item => {
        const matched = DEROGATORY_TYPES.find(d =>
          d.id === item.type ||
          d.aiKeywords?.some(kw => item.type?.toLowerCase().includes(kw) || item.description?.toLowerCase().includes(kw))
        );
        if (matched) {
          newDerog[matched.id] = true;
          if (item.date) newDates[matched.id] = item.date;
        }
      });
      if (Object.keys(newDerog).length > 0) {
        setDerogatory(p => ({ ...p, ...newDerog }));
        setDerogatoryDates(p => ({ ...p, ...newDates }));
      }
    }
    setUploadResult(null); setUploadFile(null); setShowUpload(false);
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
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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

            {/* AI Upload — open by default, hero treatment */}
            <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🤖 AI Credit Report Review</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Upload once — AI fills scores, tradelines, collections, derogatory events, and rescore simulator automatically.</p>
                </div>
                <button onClick={() => setShowUpload(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold shrink-0 ml-4">
                  {showUpload ? 'Hide' : 'Show'}
                </button>
              </div>

              {showUpload && (
                <div className="space-y-3">
                  <div
                    className="border-2 border-dashed border-indigo-300 rounded-xl p-6 text-center bg-indigo-50/60 cursor-pointer hover:bg-indigo-50 transition-all"
                    onClick={() => !uploadFile && fileRef.current?.click()}
                  >
                    <input ref={fileRef} type="file" accept=".pdf,image/*"
                      onChange={e => { setUploadFile(e.target.files?.[0] || null); setUploadResult(null); setUploadError(''); }}
                      className="hidden" />
                    {uploadFile ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 font-semibold">📄 {uploadFile.name}</span>
                        <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} className="text-xs text-slate-400 hover:text-red-400">✕ Remove</button>
                      </div>
                    ) : (
                      <div>
                        <div className="text-3xl mb-2">📋</div>
                        <p className="text-sm font-bold text-indigo-700">Click to upload tri-merge credit report</p>
                        <p className="text-xs text-slate-400 mt-1">PDF or image — Haiku AI extracts everything automatically</p>
                      </div>
                    )}
                  </div>

                  {uploadFile && !uploadResult && (
                    <button onClick={handleAIReview} disabled={uploadLoading}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all">
                      {uploadLoading ? '⏳ Analyzing credit report...' : '🔍 Run AI Review — Extract All Data'}
                    </button>
                  )}
                  {uploadError && <p className="text-xs text-red-500 font-semibold">{uploadError}</p>}

                  {uploadResult && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Extraction Complete</p>
                      <div className="grid grid-cols-3 gap-2 text-xs text-center">
                        {[['Experian', uploadResult.experian], ['TransUnion', uploadResult.transunion], ['Equifax', uploadResult.equifax]].map(([b, s]) => (
                          <div key={b} className="bg-white rounded-lg p-2 border border-indigo-100">
                            <div className="text-slate-400">{b}</div>
                            <div className="font-black text-lg text-indigo-700">{s || '—'}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-slate-400">Mid Score: </span>
                        <span className="text-xl font-black text-indigo-700">{uploadResult.midScore || '—'}</span>
                      </div>
                      <div className="flex gap-2 text-xs text-center">
                        {uploadResult.revolvingAccountDetails?.length > 0 && (
                          <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                            <div className="font-bold text-emerald-700 text-base">{uploadResult.revolvingAccountDetails.length}</div>
                            <div className="text-slate-400">Cards → Sim</div>
                          </div>
                        )}
                        {uploadResult.derogatoryItems?.length > 0 && (
                          <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-2">
                            <div className="font-bold text-red-600 text-base">{uploadResult.derogatoryItems.length}</div>
                            <div className="text-slate-400">Derogatory → Auto-checked</div>
                          </div>
                        )}
                        {uploadResult.collections?.length > 0 && (
                          <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2">
                            <div className="font-bold text-amber-600 text-base">{uploadResult.collections.length}</div>
                            <div className="text-slate-400">Collections</div>
                          </div>
                        )}
                      </div>
                      {uploadResult.flags?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-xs font-bold text-amber-700 mb-1">⚠ Underwriting Flags</p>
                          {uploadResult.flags.map((f, i) => <p key={i} className="text-xs text-amber-700">• {f}</p>)}
                        </div>
                      )}
                      {uploadResult.summary && <p className="text-xs text-slate-500 italic">{uploadResult.summary}</p>}
                      <div className="flex gap-2">
                        <button onClick={applyExtractedCredit} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">
                          ✓ Apply Everything to Module
                        </button>
                        <button onClick={() => setUploadResult(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">Discard</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Credit Scores */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">📊 Credit Scores</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-3">Borrower — Enter all 3 bureau scores</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[['Experian', bureau1, v => calcMid(v, bureau2, bureau3, v, setBureau1, setBorrowerScore)],
                      ['TransUnion', bureau2, v => calcMid(bureau1, v, bureau3, v, setBureau2, setBorrowerScore)],
                      ['Equifax', bureau3, v => calcMid(bureau1, bureau2, v, v, setBureau3, setBorrowerScore)]].map(([l, v, fn]) => (
                      <div key={l}>
                        <label className="block text-xs text-slate-400 mb-1">{l}</label>
                        <input type="number" value={v} placeholder="---" onChange={e => fn(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-300" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-slate-400">Mid Score:</span>
                    <input type="number" value={borrowerScore} onChange={e => setBorrowerScore(e.target.value)} placeholder="or enter directly"
                      className="w-32 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-3">Co-Borrower (if applicable)</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[['Experian', coBureau1, v => calcMid(v, coBureau2, coBureau3, v, setCoBureau1, setCoScore)],
                      ['TransUnion', coBureau2, v => calcMid(coBureau1, v, coBureau3, v, setCoBureau2, setCoScore)],
                      ['Equifax', coBureau3, v => calcMid(coBureau1, coBureau2, v, v, setCoBureau3, setCoScore)]].map(([l, v, fn]) => (
                      <div key={l}>
                        <label className="block text-xs text-slate-400 mb-1">{l}</label>
                        <input type="number" value={v} placeholder="---" onChange={e => fn(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-300" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-slate-400">Mid Score:</span>
                    <input type="number" value={coScore} onChange={e => setCoScore(e.target.value)} placeholder="or enter directly"
                      className="w-32 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
              </div>

              {coMidScore > 0 && midScore > 0 && (
                <div className={`mt-4 rounded-xl px-4 py-3 border ${coMidScore < midScore ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
                  <p className="text-xs font-bold text-slate-700 mb-2">
                    Qualifying Score: {qualifyingScore} — lower of the two mid scores
                    {coMidScore < midScore && <span className="ml-2 text-amber-700">⚠ Co-borrower is the limiting factor</span>}
                  </p>
                  {coMidScore < midScore && (
                    <div className="space-y-1 mt-2">
                      <p className="text-xs font-bold text-amber-700">Co-Borrower Impact Analysis</p>
                      {SCORE_MILESTONES.filter(m => m > coMidScore && m <= midScore).slice(0, 3).map(m => {
                        const unlocked = Object.entries(PROGRAM_MIN_SCORES).filter(([, v]) => v.score <= m && v.score > coMidScore);
                        return (
                          <div key={m} className="text-xs text-amber-700">
                            • Co-borrower needs <strong>{m - coMidScore} pts</strong> to reach {m}
                            {unlocked.length > 0 && ` — unlocks ${unlocked.map(([p]) => p).join(', ')}`}
                          </div>
                        );
                      })}
                      <p className="text-xs text-slate-500 mt-2 italic">Consider removing co-borrower if their income is not needed for qualification.</p>
                    </div>
                  )}
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
