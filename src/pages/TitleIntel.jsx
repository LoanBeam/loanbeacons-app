// src/pages/TitleIntel.jsx
// Title Intelligence™ — Module 23
// Stage 3 — Property & Closing
// Layout: DecisionRecordBanner → ModuleNav → hero → ScenarioHeader

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ModuleNav from '../components/ModuleNav';
import ScenarioHeader from '../components/ScenarioHeader';
import NextStepCard from '../components/NextStepCard';

// ─── Constants ────────────────────────────────────────────────────────────────
const LS_KEY = (id) => `lb_titleintel_${id}`;

const HOA_SUPER_LIEN_STATES     = ['AL','AK','AZ','CO','CT','DE','FL','HI','IL','MD','MA','MN','MO','NV','NH','NJ','OR','PA','RI','SC','TN','UT','WA','WY'];
const COMMUNITY_PROPERTY_STATES = ['AZ','CA','ID','LA','NV','NM','TX','WA','WI'];

const VESTING_OPTIONS = [
  { id: 'sole',           label: 'Sole and Separate Property',                  note: 'One person takes title alone. Spouse not on title — may require quitclaim in community property states.' },
  { id: 'joint_tenants',  label: 'Joint Tenants w/ Right of Survivorship',      note: 'Equal undivided interests. Surviving owner takes full title automatically. Avoids probate.' },
  { id: 'tenants_common', label: 'Tenants in Common',                           note: 'Unequal interests allowed. Each owner can will their share. No automatic survivorship.' },
  { id: 'community',      label: 'Community Property',                          note: 'AZ, CA, ID, LA, NV, NM, TX, WA, WI only. Equal ownership between spouses.' },
  { id: 'community_ros',  label: 'Community Property w/ Right of Survivorship', note: 'CA, AZ, NV only. Combines community property with survivorship benefit.' },
  { id: 'trust',          label: 'Living Trust / Revocable Trust',              note: 'Title held in trust. Lender must review and approve trust documents. Not universally accepted.' },
  { id: 'llc',            label: 'LLC / Corporation',                           note: 'Investment properties only. No FHA/VA/USDA eligibility. DSCR/Non-QM preferred vehicle.' },
];

const TITLE_ISSUES = [
  { id: 'existing_liens',   label: 'Existing Mortgages / Liens to Payoff',    severity: 'info',     note: 'Must be paid off at closing. Confirm payoff amounts from all servicers in writing.' },
  { id: 'tax_liens',        label: 'IRS or State Tax Liens',                   severity: 'critical', note: 'Must be paid or released before/at closing. Federal tax liens — title insurance will not insure over them.' },
  { id: 'mechanics_lien',   label: "Mechanic's Liens / Contractor Claims",     severity: 'high',     note: 'Must be released before closing. Obtain lien waivers from all contractors. Check county records.' },
  { id: 'judgment_lien',    label: 'Judgment Liens Against Borrower',          severity: 'high',     note: 'Attach to real property in most states. Must be satisfied at or before closing.' },
  { id: 'hoa_lien',         label: 'HOA Delinquency / Lien',                   severity: 'high',     note: 'HOA must be current. Super-lien states allow HOA to foreclose ahead of first mortgage.' },
  { id: 'easements',        label: 'Easements / Encroachments',                severity: 'medium',   note: 'Utility easements are typical. Encroachments must be resolved or excluded from the title policy.' },
  { id: 'gap_title',        label: 'Gap in Chain of Title',                    severity: 'high',     note: 'Title company must research and cure the gap. May require quiet title action.' },
  { id: 'forged_docs',      label: 'Suspected Forged or Fraudulent Documents', severity: 'critical', note: 'Stop the transaction. Notify lender compliance immediately.' },
  { id: 'probate',          label: 'Estate / Probate Sale',                    severity: 'medium',   note: 'Personal representative must have authority to sell. Court approval may be required.' },
  { id: 'divorce',          label: 'Divorce / Marital Interest',               severity: 'medium',   note: 'Divorce decree must address the property. Quitclaim may be required from ex-spouse.' },
  { id: 'boundary',         label: 'Boundary / Survey Dispute',                severity: 'medium',   note: 'Survey required. Dispute must be resolved or excluded from the title policy.' },
  { id: 'deed_restriction', label: 'Deed Restrictions / CC&Rs Violation',      severity: 'medium',   note: 'Review CC&Rs. Existing violations affect title insurability and marketability.' },
  { id: 'lis_pendens',      label: 'Lis Pendens / Active Litigation',          severity: 'critical', note: 'Active lawsuit affecting the property. Title company will not insure until dismissed.' },
  { id: 'short_sale',       label: 'Short Sale / Pre-Foreclosure',             severity: 'high',     note: 'Requires lender approval letter. Confirm all junior liens addressed.' },
];

const TITLE_COMPANIES = ['In-House Title','Old Republic Title','First American Title','Fidelity National Title','Stewart Title','Doma Title','WFG National Title','Other'];
const TABS = ['Upload & Extract', 'Review & Complete', 'AI Analysis'];

const RISK_CONFIG = {
  CLEAR:     { label: 'Clear to Close',  emoji: '✅', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', heroBg: 'bg-emerald-500/20', heroText: 'text-emerald-300', heroBorder: 'border-emerald-400/30' },
  CAUTION:   { label: 'Caution',         emoji: '⚠️', bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-700',   heroBg: 'bg-amber-500/20',   heroText: 'text-amber-300',   heroBorder: 'border-amber-400/30'   },
  HIGH_RISK: { label: 'High Risk',       emoji: '🔴', bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-800',  badge: 'bg-orange-100 text-orange-700', heroBg: 'bg-orange-500/20',  heroText: 'text-orange-300',  heroBorder: 'border-orange-400/30'  },
  STOP:      { label: 'STOP',            emoji: '🛑', bg: 'bg-red-50',     border: 'border-red-400',     text: 'text-red-800',     badge: 'bg-red-100 text-red-700',       heroBg: 'bg-red-500/20',     heroText: 'text-red-300',     heroBorder: 'border-red-400/30'     },
};

const fmt$       = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const daysBetween = (d) => { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 86400000); };

const anthropicHeaders = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
const getKey = () => import.meta.env.VITE_ANTHROPIC_API_KEY;

async function callHaiku(base64Pdf, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ...anthropicHeaders, 'x-api-key': getKey() },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 2500,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
        { type: 'text', text: prompt },
      ]}],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || '';
}

async function callSonnet(systemPrompt, userContent, maxTokens = 3500) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ...anthropicHeaders, 'x-api-key': getKey() },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userContent }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || '';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TitleIntel() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const scenarioId     = searchParams.get('scenarioId');
  const lsKey          = scenarioId ? LS_KEY(scenarioId) : null;

  // ─── Decision Record
  const { reportFindings, savedRecordId, setSavedRecordId } = useDecisionRecord('TITLE_INTEL', scenarioId);
  const [recordSaving, setRecordSaving] = useState(false);

  // ─── Scenario state
  const [scenario,  setScenario]  = useState(null);
  const [loading,   setLoading]   = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);
  const [search,    setSearch]    = useState('');
  const [showAll,   setShowAll]   = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // ─── Form state
  const [vesting,           setVesting]           = useState('');
  const [vestingConfirmed,  setVestingConfirmed]  = useState(false);
  const [titleCompany,      setTitleCompany]      = useState('');
  const [titleCompanyOther, setTitleCompanyOther] = useState('');
  const [titleOrdered,      setTitleOrdered]      = useState(false);
  const [titleReceived,     setTitleReceived]     = useState(false);
  const [closingDate,       setClosingDate]       = useState('');
  const [liens,             setLiens]             = useState([]);
  const [issues,            setIssues]            = useState({});
  const [titleInsurance,    setTitleInsurance]    = useState({ lender: '', owner: '' });
  const [loNotes,           setLoNotes]           = useState('');

  // ─── PDF extraction
  const [prelimFile,          setPrelimFile]          = useState(null);
  const [prelimExtracting,    setPrelimExtracting]    = useState(false);
  const [prelimExtraction,    setPrelimExtraction]    = useState(null);
  const [prelimError,         setPrelimError]         = useState('');
  const [extractionApplied,   setExtractionApplied]   = useState(false);

  // ─── AI analysis
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState('');
  const [aiTab,      setAiTab]      = useState(0);

  // ─── Derived values
  const flaggedIssues      = TITLE_ISSUES.filter(i => issues[i.id]);
  const criticalIssues     = flaggedIssues.filter(i => i.severity === 'critical');
  const highIssues         = flaggedIssues.filter(i => i.severity === 'high');
  const totalLienAmount    = liens.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const unconfirmedPayoffs = liens.filter(l => !l.payoffConfirmed).length;
  const totalTitleIns      = (parseFloat(titleInsurance.lender) || 0) + (parseFloat(titleInsurance.owner) || 0);
  const daysToClose        = daysBetween(closingDate);
  const riskCfg            = aiAnalysis?.riskRating ? RISK_CONFIG[aiAnalysis.riskRating] : null;

  const loanType  = scenario?.loanType || '';
  const propState = (scenario?.propertyState || scenario?.state || '').toUpperCase();
  const isFHA     = loanType.toUpperCase().includes('FHA');
  const isVA      = loanType.toUpperCase().includes('VA');
  const isUSDA    = loanType.toUpperCase().includes('USDA');
  const isAgency  = isFHA || isVA || isUSDA || loanType.toUpperCase().includes('CONVENTIONAL');
  const isHoaSuperLienState  = propState && HOA_SUPER_LIEN_STATES.includes(propState);
  const isCommunityPropState = propState && COMMUNITY_PROPERTY_STATES.includes(propState);

  const loanTypeFlags = [];
  if (vesting === 'llc'  && isAgency)                    loanTypeFlags.push({ severity: 'critical', msg: `LLC vesting is NOT eligible for ${loanType} loans. Vesting must change before this loan can close.` });
  if (vesting === 'trust' && (isFHA || isVA))             loanTypeFlags.push({ severity: 'high',     msg: `Trust vesting requires formal lender approval for ${loanType} loans. Obtain trust certification immediately.` });
  if (vesting === 'sole'  && isCommunityPropState)        loanTypeFlags.push({ severity: 'high',     msg: `Sole vesting in ${propState} (community property state) — non-borrowing spouse likely needs to sign or quitclaim.` });
  if (issues.hoa_lien     && isHoaSuperLienState)         loanTypeFlags.push({ severity: 'critical', msg: `${propState} is a HOA super-lien state — HOA delinquency can foreclose ahead of the 1st mortgage. Must be cured before closing.` });

  const timelineFlags = [];
  if (daysToClose !== null && criticalIssues.length > 0 && daysToClose < 45)  timelineFlags.push(`⏰ ${criticalIssues.length} critical issue(s) with ${daysToClose} days to closing. Critical items typically require 30–90 days to resolve.`);
  if (daysToClose !== null && issues.tax_liens && daysToClose < 60)            timelineFlags.push(`⏰ IRS lien releases typically take 30–90 days. Target closing is in ${daysToClose} days — request the release immediately.`);
  if (daysToClose !== null && issues.gap_title)                                timelineFlags.push(`⏰ Quiet title actions for chain-of-title gaps can take 60–120 days. Engage a real estate attorney immediately.`);

  const readinessChecks = [
    { label: 'Vesting selected',       done: !!vesting },
    { label: 'Vesting confirmed',      done: vestingConfirmed },
    { label: 'Title company selected', done: !!titleCompany },
    { label: 'Issues reviewed',        done: titleReceived || extractionApplied },
    { label: 'Liens entered or none',  done: true },
  ];
  const readinessScore = readinessChecks.filter(c => c.done).length;

  // ─── NSI — Next Step Intelligence™
  const { primarySuggestion, logFollow } = useNextStepIntelligence({
    currentModuleKey:       'TITLE_INTEL',
    loanPurpose:            scenario?.loanPurpose || 'PURCHASE',
    scenarioId,
    decisionRecordFindings: {
      TITLE_INTEL: {
        criticalIssues:    criticalIssues.length,
        highIssues:        highIssues.length,
        flaggedCount:      flaggedIssues.length,
        unconfirmedPayoffs,
        vestingConfirmed,
        lienCount:         liens.length,
        aiRiskRating:      aiAnalysis?.riskRating || null,
        titleReceived,
      },
    },
    suggestions: [
      {
        moduleKey:           'DISCLOSURE_INTEL',
        moduleLabel:         'Disclosure Intelligence™',
        route:               '/disclosure-intel',
        urgency:             criticalIssues.length > 0 ? 'HIGH' : 'MEDIUM',
        stage:               3,
        canSkip:             false,
        loanPurposeRelevant: true,
        reason:              criticalIssues.length > 0
          ? `Title has ${criticalIssues.length} critical issue(s) — document in Disclosure Intelligence™ and confirm TRID timing before issuing the Loan Estimate.`
          : 'Title review complete. Proceed to Disclosure Intelligence™ for TRID deadline tracking and LE compliance.',
      },
      {
        moduleKey:           'FLOOD_INTEL',
        moduleLabel:         'Flood Intelligence™',
        route:               '/flood-intel',
        urgency:             'MEDIUM',
        stage:               3,
        canSkip:             true,
        loanPurposeRelevant: true,
        reason:              'Confirm FEMA flood zone determination and NFIP insurance requirements before closing disclosures are issued.',
      },
    ],
  });

  // ─── localStorage
  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({ vesting, vestingConfirmed, titleCompany, titleCompanyOther, titleOrdered, titleReceived, closingDate, liens, issues, titleInsurance, loNotes, aiAnalysis, savedRecordId, extractionApplied }));
  }, [lsKey, vesting, vestingConfirmed, titleCompany, titleCompanyOther, titleOrdered, titleReceived, closingDate, liens, issues, titleInsurance, loNotes, aiAnalysis, savedRecordId, extractionApplied]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // ─── Data loading
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error).finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.vesting)               setVesting(saved.vesting);
          if (saved.vestingConfirmed)      setVestingConfirmed(saved.vestingConfirmed);
          if (saved.titleCompany)          setTitleCompany(saved.titleCompany);
          if (saved.titleCompanyOther)     setTitleCompanyOther(saved.titleCompanyOther);
          if (saved.titleOrdered != null)  setTitleOrdered(saved.titleOrdered);
          if (saved.titleReceived != null) setTitleReceived(saved.titleReceived);
          if (saved.closingDate)           setClosingDate(saved.closingDate);
          if (saved.liens)                 setLiens(saved.liens);
          if (saved.issues)                setIssues(saved.issues);
          if (saved.titleInsurance)        setTitleInsurance(saved.titleInsurance);
          if (saved.loNotes)               setLoNotes(saved.loNotes);
          if (saved.aiAnalysis)            setAiAnalysis(saved.aiAnalysis);
          if (saved.savedRecordId)         setSavedRecordId(saved.savedRecordId);
          if (saved.extractionApplied)     setExtractionApplied(saved.extractionApplied);
          if (saved.vesting || saved.extractionApplied) setActiveTab(1);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => { if (snap.exists()) setScenario({ id: snap.id, ...snap.data() }); }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // ─── Lien CRUD
  const addLien    = () => setLiens(p => [...p, { id: Date.now(), type: '', creditor: '', amount: '', payoffConfirmed: false, instrumentNumber: '' }]);
  const updateLien = (id, f, v) => setLiens(p => p.map(l => l.id === id ? { ...l, [f]: v } : l));
  const removeLien = (id) => setLiens(p => p.filter(l => l.id !== id));

  // ─── PDF extraction
  const extractFromPrelim = async (file) => {
    setPrelimExtracting(true); setPrelimError(''); setPrelimExtraction(null);
    try {
      const base64       = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('File read failed')); r.readAsDataURL(file); });
      const validIssueIds   = TITLE_ISSUES.map(i => i.id).join(', ');
      const validVestingIds = VESTING_OPTIONS.map(v => v.id).join(', ');
      const prompt = `You are a senior title officer extracting structured data from a preliminary title report or title commitment.

Read this document thoroughly and respond ONLY with a valid JSON object — no preamble, no markdown fences, no text outside the JSON.

JSON schema:
{
  "vestingFound": "exact id from: ${validIssueIds} — or null",
  "vestingRawText": "exact vesting language as written — or null",
  "titleCompany": "title company name if shown — or null",
  "closingDate": "YYYY-MM-DD if found — or null",
  "flaggedIssueIds": ["ids from: ${validIssueIds} — empty array if none"],
  "liens": [{ "type": "1st Mortgage|2nd Mortgage|HELOC|Tax Lien|Judgment|HOA|Mechanic's Lien|Other", "creditor": "exact name", "amount": number_or_null, "recordedDate": "string or null", "instrumentNumber": "string or null" }],
  "easementDescriptions": ["array of easement descriptions"],
  "chainOfTitleNotes": "any chain of title gaps, breaks, missing deeds — or null",
  "ccAndRNotes": "CC&R or deed restriction notes — or null",
  "hoaInfo": { "name": "HOA name or null", "delinquent": true_or_false_or_null, "amount": number_or_null },
  "propertyAddress": "full property address — or null",
  "legalDescription": "abbreviated legal description — or null",
  "dealRiskFlags": ["plain-English red flags the LO must know immediately"],
  "extractionSummary": "3-4 sentence plain-English summary of key findings"
}

Rules:
- existing_liens: any deed of trust or mortgage listed as an encumbrance
- judgment_lien: any unsatisfied court judgment
- tax_liens: any IRS or state tax lien
- hoa_lien: any HOA fees owed or HOA lien
- easements: any recorded easement
- gap_title: any missing deed, unknown grantor, or chain break
- mechanics_lien: any contractor or mechanic lien
- lis_pendens: any active litigation notice
- dealRiskFlags must be direct and specific — name dollar amounts, dates, and parties where visible`;
      const raw    = await callHaiku(base64, prompt);
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setPrelimExtraction(parsed);
    } catch (e) { console.error(e); setPrelimError('Extraction failed. Ensure the PDF is text-based (not scanned). ' + e.message); }
    finally { setPrelimExtracting(false); }
  };

  const applyExtraction = () => {
    if (!prelimExtraction) return;
    if (prelimExtraction.vestingFound)           setVesting(prelimExtraction.vestingFound);
    if (prelimExtraction.titleCompany)           setTitleCompany(prelimExtraction.titleCompany);
    if (prelimExtraction.closingDate)            setClosingDate(prelimExtraction.closingDate);
    if (prelimExtraction.flaggedIssueIds?.length > 0) setIssues(prev => { const n = { ...prev }; prelimExtraction.flaggedIssueIds.forEach(id => { n[id] = true; }); return n; });
    if (prelimExtraction.liens?.length > 0)      setLiens(prev => [...prev, ...prelimExtraction.liens.map(l => ({ id: Date.now() + Math.random(), type: l.type || 'Other', creditor: l.creditor || '', amount: l.amount != null ? String(l.amount) : '', payoffConfirmed: false, instrumentNumber: l.instrumentNumber || '' }))]);
    const notes = [];
    if (prelimExtraction.chainOfTitleNotes) notes.push(`[Chain of Title] ${prelimExtraction.chainOfTitleNotes}`);
    if (prelimExtraction.ccAndRNotes)       notes.push(`[CC&Rs] ${prelimExtraction.ccAndRNotes}`);
    if (prelimExtraction.easementDescriptions?.length > 0) notes.push(`[Easements] ${prelimExtraction.easementDescriptions.join(' | ')}`);
    if (prelimExtraction.hoaInfo?.name)     notes.push(`[HOA] ${prelimExtraction.hoaInfo.name}${prelimExtraction.hoaInfo.delinquent ? ' — DELINQUENT' : ''}${prelimExtraction.hoaInfo.amount ? ` ($${prelimExtraction.hoaInfo.amount})` : ''}`);
    if (notes.length > 0) setLoNotes(prev => prev ? `${prev}\n\n${notes.join('\n')}` : notes.join('\n'));
    if (prelimExtraction.chainOfTitleNotes?.toLowerCase().match(/gap|break|missing|unknown/)) setIssues(prev => ({ ...prev, gap_title: true }));
    setTitleReceived(true); setExtractionApplied(true); setPrelimExtraction(null); setPrelimFile(null); setActiveTab(1);
  };

  // ─── AI Analysis
  const runAiAnalysis = async () => {
    setAiLoading(true); setAiError(''); setAiTab(0);
    try {
      const context = `TITLE INTELLIGENCE PROFILE\nBORROWER: ${scenario ? (scenario.firstName||'') + ' ' + (scenario.lastName||'') : 'Unknown'}\nLOAN TYPE: ${loanType || 'Not specified'}\nPROPERTY STATE: ${propState || 'Not specified'}\nVESTING: ${VESTING_OPTIONS.find(v => v.id === vesting)?.label || 'Not selected'}${vestingConfirmed ? ' (CONFIRMED)' : ' (UNCONFIRMED)'}\nTITLE COMPANY: ${titleCompany === 'Other' ? titleCompanyOther : titleCompany || 'Not selected'}\nSEARCH ORDERED: ${titleOrdered}\nREPORT RECEIVED: ${titleReceived}\nCLOSING DATE: ${closingDate || 'Not set'}${daysToClose !== null ? ` (${daysToClose} days)` : ''}\nPDF EXTRACTED: ${extractionApplied}\n\nLIENS (${liens.length} | ${fmt$(totalLienAmount)} | ${unconfirmedPayoffs} unconfirmed):\n${liens.length > 0 ? liens.map(l => `- ${l.type} | ${l.creditor} | ${fmt$(l.amount)} | ${l.payoffConfirmed ? 'CONFIRMED' : 'UNCONFIRMED'}`).join('\n') : '- None'}\n\nFLAGGED ISSUES (${flaggedIssues.length} | ${criticalIssues.length} critical):\n${flaggedIssues.length > 0 ? flaggedIssues.map(i => `- [${i.severity.toUpperCase()}] ${i.label}`).join('\n') : '- None'}\n\nAUTO FLAGS:\n${[...loanTypeFlags.map(f=>`- [${f.severity.toUpperCase()}] ${f.msg}`),...timelineFlags.map(t=>`- [HIGH] ${t}`)].join('\n') || '- None'}\n\nTITLE INSURANCE: Lender ${titleInsurance.lender ? fmt$(titleInsurance.lender) : 'not entered'} | Owner ${titleInsurance.owner ? fmt$(titleInsurance.owner) : 'not entered'}\n\nLO NOTES:\n${loNotes || 'None'}`;

      const systemPrompt = `You are a senior title officer and mortgage compliance expert with 25 years of experience. You are thorough, direct, and never let a deal-killing issue go unmentioned.

Respond ONLY with a valid JSON object — no preamble, no markdown fences.

{
  "riskRating": "CLEAR|CAUTION|HIGH_RISK|STOP",
  "riskSummary": "2-3 sentence narrative of overall title risk and closing readiness",
  "closingReadiness": "READY|CONDITIONAL|NOT_READY",
  "closingReadinessNote": "one concrete sentence on the single most important thing needed to close",
  "vestingNote": "detailed analysis of vesting — lender requirements, state law, loan type compatibility, action needed",
  "lienAssessment": "assessment of liens — total exposure, unconfirmed payoffs, servicer coordination, timing risk",
  "issueResolutions": [{ "issueId": "id", "issueLabel": "label", "severity": "severity", "resolution": "specific 2-4 sentence action steps — name exact documents, parties, timelines", "estimatedDays": "resolution time estimate" }],
  "recommendedConditions": ["specific underwriter conditions — documents and actions required before CTC"],
  "borrowerLetter": "Complete plain-language letter (4-6 paragraphs). What title insurance is, what was found, what they need to do, timeline. Warm but professional. No legalese. Ready to send.",
  "underwriterSummary": "Professional underwriter memo (4-5 paragraphs). Risk rating, each flagged item, show-stoppers, recommended conditions list. Formal tone."
}

STOP: any critical issue making closing impossible today. HIGH_RISK: 2+ HIGH items, vesting/loan type conflict, tight timeline. CAUTION: medium items, unconfirmed payoffs, vesting unconfirmed. CLEAR: no issues, confirmed, report received. One issueResolution per flagged issue — never skip.`;

      const raw = await callSonnet(systemPrompt, context, 3500);
      setAiAnalysis(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { console.error(e); setAiError('Analysis failed — check your API key. ' + e.message); }
    finally { setAiLoading(false); }
  };

  // ─── Save to Decision Record
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings(
        'TITLE_INTEL',
        {
          vesting, vestingConfirmed,
          titleCompany:         titleCompany === 'Other' ? titleCompanyOther : titleCompany,
          titleOrdered, titleReceived,
          closingDate:          closingDate || null,
          flaggedIssues:        flaggedIssues.map(i => i.id),
          criticalIssueCount:   criticalIssues.length,
          highIssueCount:       highIssues.length,
          lienCount:            liens.length,
          totalLienAmount:      Math.round(totalLienAmount),
          unconfirmedPayoffs,
          lenderTitleInsurance: parseFloat(titleInsurance.lender) || null,
          ownerTitleInsurance:  parseFloat(titleInsurance.owner)  || null,
          aiRiskRating:         aiAnalysis?.riskRating    || null,
          aiClosingReadiness:   aiAnalysis?.closingReadiness || null,
          extractionApplied,
          loNotes,
          timestamp: new Date().toISOString(),
        },
        [],
        [],
        '1.0.0'
      );
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); } finally { setRecordSaving(false); }
  };

  // ─── Loading
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <div className="animate-spin w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full" />
    </div>
  );

  // ─── Picker Page ──────────────────────────────────────────────────────────
  if (!scenarioId) {
    const q         = search.toLowerCase().trim();
    const sorted    = [...scenarios].sort((a,b) => (b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
    const filtered  = q ? sorted.filter(s=>(s.scenarioName||`${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0,5);
    const hasMore   = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg">23</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 3 — Property &amp; Closing</span>
                <h1 className="text-2xl font-normal text-white mt-0.5" style={{ fontFamily: '"DM Serif Display", serif' }}>Title Intelligence™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Upload the preliminary title report and let AI surface every risk before it reaches the closing table.</p>
            <div className="flex flex-wrap gap-2">
              {['PDF Extraction','Lien Tracking','Issue Flags','Loan-Type Awareness','AI Risk Analysis','Closing Letters'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">Select a Scenario</p>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm"><p className="text-3xl mb-3">📂</p><p className="text-sm font-semibold text-slate-600">No scenarios found</p><button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm"><p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p><button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button></div>
          ) : (
            <div className="space-y-2.5">
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed';
                return (
                  <button key={s.id} onClick={() => navigate(`/title-intel?scenarioId=${s.id}`)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700">{sName}</div>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {s.loanAmount > 0 && <span className="text-xs text-slate-500 font-mono">${Number(s.loanAmount).toLocaleString()}</span>}
                          {s.loanType    && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">View all {filtered.length} scenarios</button>}
              {showAll && filtered.length > 5 && <button onClick={() => setShowAll(false)} className="w-full text-center text-xs text-slate-400 py-2">↑ Show less</button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : null;

  // ─── Module Page ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-16" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* 1 — Decision Record Banner */}
      <DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="TITLE_INTEL" />

      {/* 2 — Module Nav */}
      <ModuleNav moduleNumber={23} />

      {/* 3 — Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #6366f1 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 3 — Property &amp; Closing</span>
              <h1 className="text-4xl font-normal text-white mb-2 mt-0.5" style={{ fontFamily: '"DM Serif Display", serif' }}>Title Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl leading-relaxed">
                {borrowerName ? `${borrowerName} · ` : ''}Vesting · Liens · Chain of Title · AI Risk Analysis
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {['PDF Extraction','Lien Tracking','Issue Flags','AI Risk Analysis','Closing Letters'].map(tag => (
                  <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
                ))}
              </div>
            </div>
            <div className="shrink-0">
              {riskCfg ? (
                <div className={`${riskCfg.heroBg} ${riskCfg.heroBorder} border rounded-2xl px-5 py-3 text-center`}>
                  <div className={`text-2xl font-black ${riskCfg.heroText}`}>{riskCfg.emoji}</div>
                  <div className={`text-sm font-bold ${riskCfg.heroText}`}>{riskCfg.label}</div>
                </div>
              ) : criticalIssues.length > 0 ? (
                <div className="bg-red-500/20 border border-red-400/30 rounded-2xl px-5 py-3 text-center">
                  <div className="text-3xl font-black text-red-300">{criticalIssues.length}</div>
                  <div className="text-xs text-red-300">Critical Issue{criticalIssues.length !== 1 ? 's' : ''}</div>
                </div>
              ) : (
                <div className="bg-white/10 border border-white/10 rounded-2xl px-5 py-3 text-center">
                  <div className="text-3xl font-black text-white">{flaggedIssues.length > 0 ? flaggedIssues.length : '✓'}</div>
                  <div className="text-xs text-indigo-200">{flaggedIssues.length > 0 ? 'Issues Flagged' : 'No Issues'}</div>
                </div>
              )}
            </div>
          </div>

          {/* Critical issue banner in hero */}
          {(criticalIssues.length > 0 || loanTypeFlags.some(f => f.severity === 'critical')) && (
            <div className="mt-4 bg-red-500/20 border border-red-400/40 rounded-2xl px-4 py-3 flex items-start gap-2">
              <span className="text-red-300 text-base shrink-0">🛑</span>
              <div className="text-xs text-red-200 space-y-0.5">
                {criticalIssues.map(i => <p key={i.id} className="font-semibold">{i.label} — must be resolved before closing</p>)}
                {loanTypeFlags.filter(f => f.severity === 'critical').map((f,i) => <p key={i} className="font-semibold">{f.msg}</p>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4 — Scenario Header */}
      <ScenarioHeader moduleTitle="Title Intelligence™" moduleNumber="23" scenarioId={scenarioId} />

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map((tab, i) => (
              <button key={tab} onClick={() => setActiveTab(i)}
                className={'flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all ' + (activeTab === i ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                {i === 0 && !extractionApplied && <span className="w-2 h-2 bg-indigo-400 rounded-full" />}
                <span>{tab}</span>
                {i === 2 && aiAnalysis && <span className={`text-xs px-1.5 py-0.5 rounded-full ${RISK_CONFIG[aiAnalysis.riskRating]?.badge}`}>{aiAnalysis.riskRating}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Main Panel ── */}
          <div className="xl:col-span-2 space-y-5">

            {/* ══ TAB 0: UPLOAD & EXTRACT ══════════════════════════════ */}
            {activeTab === 0 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5">
                    <h2 className="text-lg font-bold text-white" style={{ fontFamily: '"DM Serif Display", serif' }}>Upload Preliminary Title Report</h2>
                    <p className="text-indigo-200 text-xs mt-1">Haiku reads the full report and auto-populates every section — issues, liens, vesting, chain of title, and deal risk flags.</p>
                  </div>
                  <div className="p-6">
                    {!prelimFile && !prelimExtracting && !prelimExtraction && (
                      <>
                        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-indigo-200 rounded-2xl py-12 px-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-all group">
                          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-indigo-100 transition-colors">📑</div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-700">Click to upload or drag &amp; drop</p>
                            <p className="text-xs text-slate-400 mt-0.5">Preliminary title report or title commitment · PDF only</p>
                          </div>
                          <input type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setPrelimFile(f); extractFromPrelim(f); } }} />
                        </label>
                        <div className="flex items-center gap-3 mt-4"><div className="flex-1 h-px bg-slate-100" /><span className="text-xs text-slate-300 font-semibold">or</span><div className="flex-1 h-px bg-slate-100" /></div>
                        <button onClick={() => setActiveTab(1)} className="w-full mt-3 text-xs font-semibold text-slate-500 hover:text-indigo-600 py-2 transition-colors">Don't have the prelim yet? Enter manually →</button>
                      </>
                    )}
                    {prelimExtracting && (
                      <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <div className="relative">
                          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl">📑</div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center"><div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
                        </div>
                        <div className="text-center"><p className="text-sm font-bold text-slate-700">Reading title report…</p><p className="text-xs text-slate-400 mt-1">Haiku is extracting issues, liens, vesting, chain of title, and deal risk flags</p></div>
                        <div className="w-full max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '70%' }} /></div>
                      </div>
                    )}
                    {prelimError && (
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-4"><p className="text-xs font-bold text-red-700 mb-1">Extraction failed</p><p className="text-xs text-red-600">{prelimError}</p><button onClick={() => { setPrelimFile(null); setPrelimError(''); }} className="mt-3 text-xs font-bold text-red-600 underline">Try again</button></div>
                    )}
                    {prelimExtraction && !prelimExtracting && (
                      <div className="space-y-4">
                        {prelimExtraction.dealRiskFlags?.length > 0 && (
                          <div className="bg-red-50 border border-red-300 rounded-2xl p-4">
                            <p className="text-xs font-black text-red-700 uppercase tracking-wide mb-2">🛑 Deal Risk Flags — Review Immediately</p>
                            <div className="space-y-1.5">{prelimExtraction.dealRiskFlags.map((flag, i) => <p key={i} className="text-xs text-red-700 font-semibold">• {flag}</p>)}</div>
                          </div>
                        )}
                        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                          <p className="text-xs font-bold text-indigo-700 mb-1.5">📋 Extraction Summary</p>
                          <p className="text-xs text-indigo-700 leading-relaxed">{prelimExtraction.extractionSummary}</p>
                          {prelimExtraction.propertyAddress && <p className="text-xs text-indigo-500 mt-2 font-semibold">📍 {prelimExtraction.propertyAddress}</p>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'Issues Found',   value: prelimExtraction.flaggedIssueIds?.length || 0, color: (prelimExtraction.flaggedIssueIds?.length||0) > 0 ? 'text-red-600' : 'text-emerald-600' },
                            { label: 'Liens Found',    value: prelimExtraction.liens?.length || 0,           color: (prelimExtraction.liens?.length||0) > 0 ? 'text-amber-600' : 'text-emerald-600' },
                            { label: 'Vesting',        value: prelimExtraction.vestingFound ? '✓' : '—',     color: prelimExtraction.vestingFound ? 'text-emerald-600' : 'text-slate-400' },
                            { label: 'Chain of Title', value: prelimExtraction.chainOfTitleNotes ? '⚠' : '✓', color: prelimExtraction.chainOfTitleNotes ? 'text-amber-600' : 'text-emerald-600' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-slate-50 rounded-2xl border border-slate-200 p-3 text-center">
                              <div className={`text-xl font-black ${color}`}>{value}</div>
                              <div className="text-xs text-slate-500 font-semibold mt-0.5">{label}</div>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-3">
                          {prelimExtraction.flaggedIssueIds?.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Issues Detected</p>
                              <div className="space-y-1.5">
                                {prelimExtraction.flaggedIssueIds.map(id => {
                                  const issue = TITLE_ISSUES.find(i => i.id === id);
                                  return issue ? (
                                    <div key={id} className="flex items-center gap-2">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${issue.severity==='critical'?'bg-red-100 text-red-700':issue.severity==='high'?'bg-orange-100 text-orange-700':issue.severity==='info'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>{issue.severity.toUpperCase()}</span>
                                      <span className="text-xs text-slate-700 font-semibold">{issue.label}</span>
                                    </div>) : null;
                                })}
                              </div>
                            </div>
                          )}
                          {prelimExtraction.liens?.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Liens Detected</p>
                              <div className="space-y-1.5">
                                {prelimExtraction.liens.map((l, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-700 font-semibold">{l.creditor || l.type}</span>
                                    <div className="flex items-center gap-2"><span className="text-slate-400">{l.type}</span>{l.amount && <span className="font-bold text-slate-800">{fmt$(l.amount)}</span>}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {prelimExtraction.vestingFound && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Vesting Detected</p>
                              <p className="text-xs text-slate-700 font-semibold">{VESTING_OPTIONS.find(v => v.id === prelimExtraction.vestingFound)?.label}</p>
                              {prelimExtraction.vestingRawText && <p className="text-xs text-slate-400 mt-1 italic">"{prelimExtraction.vestingRawText}"</p>}
                            </div>
                          )}
                          {prelimExtraction.chainOfTitleNotes && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                              <p className="text-xs font-bold text-amber-700 mb-1">⛓ Chain of Title Notes</p>
                              <p className="text-xs text-amber-700 leading-relaxed">{prelimExtraction.chainOfTitleNotes}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button onClick={applyExtraction} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-3 rounded-2xl transition-colors shadow-md shadow-indigo-200">✓ Apply All Findings &amp; Continue to Review</button>
                          <button onClick={() => { setPrelimFile(null); setPrelimExtraction(null); setPrelimError(''); }} className="px-5 border border-slate-200 text-slate-500 hover:text-slate-700 text-sm font-semibold rounded-2xl">Discard</button>
                        </div>
                        <p className="text-xs text-slate-400 text-center">Everything applied is fully editable in the Review tab.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-slate-700 mb-1" style={{ fontFamily: '"DM Serif Display", serif' }}>📚 What to Look For in a Prelim Title Report</h3>
                  <p className="text-xs text-slate-400 mb-4">New to reviewing title? Here's what every LO must check before sending a file to underwriting.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { icon: '📜', title: 'Schedule A — Vesting',        desc: 'Shows who currently owns the property and how title is held. Confirm names match the borrower(s) exactly.' },
                      { icon: '💳', title: 'Schedule B-I — Requirements', desc: 'Items that MUST be completed before title insurance is issued. This is your closing checklist — every item needs resolution.' },
                      { icon: '🚩', title: 'Schedule B-II — Exceptions',  desc: 'Easements, CC&Rs, restrictions not insured against. Review every exception — some are benign, others can kill a deal.' },
                      { icon: '⛓',  title: 'Chain of Title',              desc: 'History of ownership transfers. A break or gap means no one can legally convey clear title — this is a deal-stopper.' },
                      { icon: '🏛️', title: 'Judgment Search',             desc: 'Unsatisfied court judgments against the borrower attach to the property in most states. Must be paid at closing.' },
                      { icon: '💰', title: 'Tax Status',                  desc: 'Property taxes must be current. IRS or state tax liens must be formally released — not just paid, but released of record.' },
                    ].map(({ icon, title, desc }) => (
                      <div key={title} className="flex gap-3 p-3 bg-slate-50 rounded-2xl">
                        <span className="text-xl shrink-0">{icon}</span>
                        <div><p className="text-xs font-bold text-slate-700">{title}</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══ TAB 1: REVIEW & COMPLETE ═════════════════════════════ */}
            {activeTab === 1 && (
              <>
                {loanTypeFlags.length > 0 && (
                  <div className="space-y-2">
                    {loanTypeFlags.map((f,i) => (
                      <div key={i} className={`rounded-3xl border px-5 py-4 flex items-start gap-3 ${f.severity==='critical'?'bg-red-50 border-red-300':'bg-orange-50 border-orange-200'}`}>
                        <span className="text-base shrink-0">{f.severity==='critical'?'🛑':'⚠️'}</span>
                        <p className={`text-sm font-semibold ${f.severity==='critical'?'text-red-700':'text-orange-700'}`}>{f.msg}</p>
                      </div>
                    ))}
                  </div>
                )}
                {timelineFlags.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-3xl p-4 space-y-1.5">
                    {timelineFlags.map((f,i) => <p key={i} className="text-xs text-orange-700 font-semibold">{f}</p>)}
                  </div>
                )}

                {/* Vesting */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div><h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">📜 How Will Title Be Held?</h2><p className="text-xs text-slate-400 mt-0.5">Confirm vesting with borrower and their attorney before proceeding.</p></div>
                    {vesting && (<label className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer text-xs font-bold shrink-0 transition-all ${vestingConfirmed?'bg-emerald-50 border-emerald-300 text-emerald-700':'bg-slate-50 border-slate-200 text-slate-500'}`}><input type="checkbox" checked={vestingConfirmed} onChange={e => setVestingConfirmed(e.target.checked)} className="accent-emerald-600" />{vestingConfirmed?'✓ Confirmed':'Confirm'}</label>)}
                  </div>
                  {!vesting && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-3 text-xs text-amber-700 font-semibold">⚠️ Vesting not detected in title report — select the correct vesting type below.</div>}
                  <div className="space-y-2">
                    {VESTING_OPTIONS.map(v => (
                      <label key={v.id} className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${vesting===v.id?'bg-indigo-50 border-indigo-300':'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                        <input type="radio" name="vesting" value={v.id} checked={vesting===v.id} onChange={() => { setVesting(v.id); setVestingConfirmed(false); }} className="w-4 h-4 mt-0.5 accent-indigo-600 shrink-0" />
                        <div><div className="text-sm font-semibold text-slate-800">{v.label}</div><div className="text-xs text-slate-400 mt-0.5">{v.note}</div></div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Title Company & Status */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🏢 Title Company &amp; Status</h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title Company</label>
                      <select value={titleCompany} onChange={e => setTitleCompany(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none">
                        <option value="">Select…</option>{TITLE_COMPANIES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {titleCompany === 'Other' && <input type="text" value={titleCompanyOther} onChange={e => setTitleCompanyOther(e.target.value)} placeholder="Enter title company name…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none mt-2" />}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Target Closing Date</label>
                      <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                      {daysToClose !== null && daysToClose <= 30 && <p className="text-xs text-orange-600 font-semibold mt-1">⏰ {daysToClose} days to close</p>}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {[['titleOrdered','📋 Title Search Ordered',titleOrdered,setTitleOrdered],['titleReceived','📄 Prelim Report Received',titleReceived,setTitleReceived]].map(([id,label,val,setter]) => (
                      <label key={id} className={`flex items-center gap-2 px-4 py-3 rounded-2xl border cursor-pointer transition-all flex-1 justify-center ${val?'bg-emerald-50 border-emerald-300':'bg-slate-50 border-slate-200'}`}>
                        <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} className="accent-emerald-600" />
                        <span className={`text-sm font-semibold ${val?'text-emerald-700':'text-slate-600'}`}>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Liens */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">💳 Liens to Pay Off at Closing</h2>
                    <button onClick={addLien} className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors">+ Add Lien</button>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">All liens must be satisfied at or before closing. Confirm written payoff statements — verbal quotes are not acceptable.</p>
                  {liens.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl"><p className="text-2xl mb-2">🔗</p><p className="text-sm text-slate-400 font-medium">No liens entered</p></div>
                  ) : (
                    <div className="space-y-3">
                      {liens.map(l => (
                        <div key={l.id} className={`rounded-2xl border p-4 ${l.payoffConfirmed?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <select value={l.type} onChange={e => updateLien(l.id,'type',e.target.value)} className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:outline-none">
                              <option value="">Type…</option>{['1st Mortgage','2nd Mortgage','HELOC','Tax Lien','Judgment','HOA',"Mechanic's Lien",'Other'].map(t => <option key={t}>{t}</option>)}
                            </select>
                            <input type="text" value={l.creditor} placeholder="Creditor / Servicer" onChange={e => updateLien(l.id,'creditor',e.target.value)} className="flex-1 min-w-[120px] border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            <input type="number" value={l.amount} placeholder="Payoff $" onChange={e => updateLien(l.id,'amount',e.target.value)} className="w-28 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                              <input type="checkbox" checked={l.payoffConfirmed} onChange={e => updateLien(l.id,'payoffConfirmed',e.target.checked)} className="accent-emerald-600" />
                              <span className={l.payoffConfirmed?'text-emerald-700 font-bold':'text-amber-700 font-semibold'}>{l.payoffConfirmed?'✓ Confirmed':'Confirm'}</span>
                            </label>
                            <button onClick={() => removeLien(l.id)} className="text-slate-300 hover:text-red-400 ml-auto">✕</button>
                          </div>
                          {l.instrumentNumber && <p className="text-xs text-slate-400 mt-1.5 ml-1">Instrument #{l.instrumentNumber}</p>}
                        </div>
                      ))}
                      <div className="flex justify-between px-4 py-3 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-200">
                        <span className="text-slate-500">Total Payoffs</span><span className="text-slate-800">{fmt$(totalLienAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Issues Checklist */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">🚩 Title Issues Checklist</h2>
                  <p className="text-xs text-slate-400 mb-4">{extractionApplied?'Pre-populated from your uploaded prelim. Review and add any additional items.':'Check all issues found in the prelim report or known to you as the LO.'}</p>
                  <div className="space-y-2">
                    {TITLE_ISSUES.map(issue => (
                      <label key={issue.id} className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${issues[issue.id]?issue.severity==='critical'?'bg-red-50 border-red-300':issue.severity==='high'?'bg-orange-50 border-orange-200':'bg-amber-50 border-amber-200':'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                        <input type="checkbox" checked={!!issues[issue.id]} onChange={e => setIssues(p => ({ ...p, [issue.id]: e.target.checked }))} className="w-4 h-4 mt-0.5 shrink-0 accent-red-600" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{issue.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${issue.severity==='critical'?'bg-red-100 text-red-700':issue.severity==='high'?'bg-orange-100 text-orange-700':issue.severity==='info'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>{issue.severity.toUpperCase()}</span>
                            {extractionApplied && issues[issue.id] && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">From Prelim</span>}
                          </div>
                          {issues[issue.id] && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{issue.note}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Title Insurance */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🛡️ Title Insurance Premiums</h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {[["Lender's Policy ($)",'lender'],["Owner's Policy ($)",'owner']].map(([label,key]) => (
                      <div key={key}><label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label><input type="number" value={titleInsurance[key]} placeholder="0" onChange={e => setTitleInsurance(p => ({ ...p, [key]: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" /></div>
                    ))}
                  </div>
                  {totalTitleIns > 0 && <div className="flex justify-between px-4 py-2.5 bg-indigo-50 rounded-xl text-sm font-bold mb-3"><span className="text-slate-500">Total</span><span className="text-indigo-700">{fmt$(totalTitleIns)}</span></div>}
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-xs text-blue-700 space-y-1">
                    <p>• Lender's title insurance is mandatory on all agency loans</p>
                    <p>• Owner's policy is optional but strongly recommended</p>
                    <p>• Simultaneous issue discount available when purchasing both</p>
                  </div>
                </div>

                {/* LO Notes */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
                  <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={5}
                    placeholder="Title search findings, lien resolution status, attorney recommendations, timeline concerns…"
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none" />
                </div>

                {/* Ready for AI */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div><p className="text-sm font-bold text-indigo-800">Ready for AI Analysis?</p><p className="text-xs text-indigo-600 mt-0.5">{readinessScore === readinessChecks.length ? 'All checks complete.' : `${readinessScore}/${readinessChecks.length} checks complete.`}</p></div>
                    <button onClick={() => setActiveTab(2)} className="text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-2xl transition-colors">→ Run AI Analysis</button>
                  </div>
                </div>

                {/* NSI on review tab */}
                {primarySuggestion && (
                  <NextStepCard suggestion={primarySuggestion} onFollow={logFollow} />
                )}
              </>
            )}

            {/* ══ TAB 2: AI ANALYSIS ═══════════════════════════════════ */}
            {activeTab === 2 && (
              <div className="space-y-5">
                {!aiAnalysis && !aiLoading && (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-600 mb-3 uppercase tracking-wide">Pre-Analysis Checklist</h3>
                    <div className="space-y-2 mb-5">
                      {readinessChecks.map(({ label, done }) => (
                        <div key={label} className="flex items-center gap-2.5">
                          <span className={`text-sm shrink-0 ${done?'text-emerald-500':'text-slate-300'}`}>{done?'✓':'○'}</span>
                          <span className={`text-sm ${done?'text-slate-700 font-medium':'text-slate-400'}`}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-center pt-2">
                      <div className="text-4xl mb-3">🔍</div>
                      <h3 className="text-lg font-bold text-slate-800 mb-2" style={{ fontFamily: '"DM Serif Display", serif' }}>AI Title Risk Analysis</h3>
                      <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">Claude analyzes your full title profile — vesting, liens, every flagged issue — and generates a risk rating, issue resolutions, and both letters.</p>
                      <button onClick={runAiAnalysis} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-8 py-3 rounded-2xl transition-colors shadow-md shadow-indigo-200">Run Title Risk Analysis</button>
                    </div>
                  </div>
                )}
                {aiLoading && (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-sm font-semibold text-slate-600">Analyzing title profile…</p>
                    <p className="text-xs text-slate-400 mt-1">Generating risk rating, resolutions, and letters</p>
                  </div>
                )}
                {aiError && !aiLoading && (
                  <div className="bg-red-50 border border-red-200 rounded-3xl p-5">
                    <p className="text-sm font-bold text-red-700 mb-1">Analysis Error</p>
                    <p className="text-xs text-red-600">{aiError}</p>
                    <button onClick={runAiAnalysis} className="mt-3 text-xs font-bold text-red-600 underline">Try again</button>
                  </div>
                )}
                {aiAnalysis && !aiLoading && (() => {
                  const cfg = RISK_CONFIG[aiAnalysis.riskRating] || RISK_CONFIG.CAUTION;
                  return (
                    <>
                      <div className={`${cfg.bg} ${cfg.border} border rounded-3xl p-5`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-2xl">{cfg.emoji}</span>
                              <span className={`text-xl font-black ${cfg.text}`} style={{ fontFamily: '"DM Serif Display", serif' }}>{cfg.label}</span>
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${cfg.badge}`}>{aiAnalysis.closingReadiness?.replace('_',' ')}</span>
                            </div>
                            <p className={`text-sm leading-relaxed ${cfg.text}`}>{aiAnalysis.riskSummary}</p>
                            {aiAnalysis.closingReadinessNote && <p className={`text-xs mt-2 font-semibold ${cfg.text} opacity-80`}>→ {aiAnalysis.closingReadinessNote}</p>}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={runAiAnalysis} className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">↻ Re-analyze</button>
                            <button onClick={handleSaveToRecord} disabled={recordSaving}
                              className={'text-xs font-bold px-3 py-1.5 rounded-xl transition-all ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                              {recordSaving ? 'Saving…' : savedRecordId ? '✔ Saved' : '💾 Save Record'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {aiAnalysis.recommendedConditions?.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">📋 Recommended Underwriter Conditions</h4>
                          <div className="space-y-2">
                            {aiAnalysis.recommendedConditions.map((c,i) => (
                              <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-2xl px-3 py-2.5">
                                <span className="text-slate-400 text-xs font-bold shrink-0 mt-0.5">{i+1}.</span>
                                <p className="text-xs text-slate-700">{c}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex border-b border-slate-100">
                          {['Risk Assessment','Borrower Letter','Underwriter Summary'].map((t,i) => (
                            <button key={t} onClick={() => setAiTab(i)} className={`flex-1 py-3.5 text-xs font-bold transition-colors ${aiTab===i?'text-indigo-700 border-b-2 border-indigo-500 bg-indigo-50/50':'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                          ))}
                        </div>
                        <div className="p-6">
                          {aiTab === 0 && (
                            <div className="space-y-5">
                              {aiAnalysis.vestingNote && <div><h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📜 Vesting Assessment</h4><p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-4">{aiAnalysis.vestingNote}</p></div>}
                              {aiAnalysis.lienAssessment && liens.length > 0 && <div><h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">💳 Lien Assessment</h4><p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-4">{aiAnalysis.lienAssessment}</p></div>}
                              {aiAnalysis.issueResolutions?.length > 0 ? (
                                <div>
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">🚩 Issue-by-Issue Resolution Guidance</h4>
                                  <div className="space-y-3">
                                    {aiAnalysis.issueResolutions.map((item,idx) => {
                                      const sev    = item.severity;
                                      const colors = sev==='critical'?'bg-red-50 border-red-200 text-red-800':sev==='high'?'bg-orange-50 border-orange-200 text-orange-800':sev==='info'?'bg-blue-50 border-blue-200 text-blue-800':'bg-amber-50 border-amber-200 text-amber-800';
                                      const badge  = sev==='critical'?'bg-red-100 text-red-700':sev==='high'?'bg-orange-100 text-orange-700':sev==='info'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700';
                                      return (
                                        <div key={idx} className={`rounded-2xl border p-4 ${colors}`}>
                                          <div className="flex items-center gap-2 flex-wrap mb-2">
                                            <span className="text-sm font-bold">{item.issueLabel}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${badge}`}>{sev.toUpperCase()}</span>
                                            {item.estimatedDays && <span className="text-xs bg-white/60 px-2 py-0.5 rounded-full font-semibold opacity-80">⏱ {item.estimatedDays}</span>}
                                          </div>
                                          <p className="text-xs leading-relaxed opacity-90">{item.resolution}</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : <div className="text-center py-6 bg-emerald-50 border border-emerald-200 rounded-2xl"><p className="text-emerald-700 font-bold text-sm">✅ No title issues flagged — title appears clean.</p></div>}
                            </div>
                          )}
                          {aiTab === 1 && (
                            <div>
                              <div className="flex items-center justify-between mb-4">
                                <div><h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Borrower Explanation Letter</h4><p className="text-xs text-slate-400 mt-0.5">Plain-language · Ready to send</p></div>
                                <button onClick={() => navigator.clipboard.writeText(aiAnalysis.borrowerLetter||'')} className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-100">Copy</button>
                              </div>
                              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono">{aiAnalysis.borrowerLetter}</div>
                            </div>
                          )}
                          {aiTab === 2 && (
                            <div>
                              <div className="flex items-center justify-between mb-4">
                                <div><h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Underwriter Summary Memo</h4><p className="text-xs text-slate-400 mt-0.5">Professional · Formal tone</p></div>
                                <button onClick={() => navigator.clipboard.writeText(aiAnalysis.underwriterSummary||'')} className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-100">Copy</button>
                              </div>
                              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono">{aiAnalysis.underwriterSummary}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* NSI on AI analysis tab */}
                      {primarySuggestion && (
                        <NextStepCard suggestion={primarySuggestion} onFollow={logFollow} />
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ── Right Sidebar ── */}
          <div className="xl:col-span-1 space-y-4 xl:sticky xl:top-6 self-start">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Title Status</h3>
              <div className="space-y-2.5 text-xs">
                {[
                  ['Vesting',         vesting ? VESTING_OPTIONS.find(v => v.id === vesting)?.label : '—'],
                  ['Confirmed',       vestingConfirmed ? '✅ Yes' : '⏳ Pending'],
                  ['Title Company',   titleCompany === 'Other' ? (titleCompanyOther||'Other') : (titleCompany||'—')],
                  ['Closing Date',    closingDate ? `${closingDate}${daysToClose!==null?` (${daysToClose}d)`:''}` : '—'],
                  ['Search Ordered',  titleOrdered  ? '✅ Yes' : '⏳ Pending'],
                  ['Report Received', titleReceived ? '✅ Yes' : '⏳ Pending'],
                  ['PDF Extracted',   extractionApplied ? '✅ Applied' : '—'],
                  ['Liens',           liens.length > 0 ? `${liens.length} (${fmt$(totalLienAmount)})` : 'None'],
                  ['Unconfirmed',     unconfirmedPayoffs > 0 ? `⚠️ ${unconfirmedPayoffs}` : '✓ All Confirmed'],
                  ['Issues Flagged',  flaggedIssues.length > 0 ? `${flaggedIssues.length} (${criticalIssues.length} crit)` : 'None'],
                  ['Title Insurance', totalTitleIns > 0 ? fmt$(totalTitleIns) : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-slate-400 shrink-0">{label}</span>
                    <span className="font-semibold text-slate-700 text-right max-w-[55%] truncate">{value}</span>
                  </div>
                ))}
              </div>
              {riskCfg && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className={`${riskCfg.bg} ${riskCfg.border} border rounded-2xl px-3 py-2.5 flex items-center gap-2`}>
                    <span className="text-base">{riskCfg.emoji}</span>
                    <div>
                      <div className={`text-xs font-black ${riskCfg.text}`}>AI Risk: {riskCfg.label}</div>
                      <div className={`text-xs ${riskCfg.text} opacity-70`}>{aiAnalysis?.closingReadiness?.replace('_',' ')}</div>
                    </div>
                  </div>
                </div>
              )}
              <button onClick={handleSaveToRecord} disabled={recordSaving}
                className={'mt-4 w-full py-2.5 rounded-xl text-xs font-bold transition-all ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                {recordSaving ? 'Saving…' : savedRecordId ? '✔ Decision Record Saved' : '💾 Save Decision Record'}
              </button>
            </div>

            {flaggedIssues.length > 0 && (
              <div className={`rounded-3xl border p-4 ${criticalIssues.length>0?'bg-red-50 border-red-200':'bg-amber-50 border-amber-200'}`}>
                <h3 className={`text-xs font-bold uppercase tracking-wide mb-2.5 ${criticalIssues.length>0?'text-red-700':'text-amber-700'}`}>Issues to Resolve ({flaggedIssues.length})</h3>
                <div className="space-y-1.5">
                  {flaggedIssues.map(i => (
                    <div key={i.id} className="text-xs">
                      <span className={i.severity==='critical'?'text-red-600 font-bold':i.severity==='high'?'text-orange-700 font-semibold':'text-amber-700'}>
                        {i.severity==='critical'?'🛑':i.severity==='high'?'🔴':'⚠️'} {i.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(isHoaSuperLienState || isCommunityPropState) && (
              <div className="bg-blue-50 border border-blue-200 rounded-3xl p-4">
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">🗺 State Flags</h3>
                <div className="text-xs text-blue-700 space-y-1.5">
                  {isHoaSuperLienState  && <p>• <strong>{propState}</strong> is a HOA super-lien state — HOA delinquency can prime the 1st mortgage</p>}
                  {isCommunityPropState && <p>• <strong>{propState}</strong> is a community property state — non-borrowing spouse may need to sign</p>}
                </div>
              </div>
            )}

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2.5">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• All liens must be satisfied at or before closing</p>
                <p>• IRS tax liens: must be released — not just paid</p>
                <p>• Judgments attach to real property in most states</p>
                <p>• Trust vesting: lender must formally approve the trust</p>
                <p>• LLC vesting: ineligible for FHA, VA, or USDA loans</p>
                <p>• Community property: non-borrowing spouse may need to sign</p>
                <p>• HOA super-lien states: delinquency can prime the 1st mortgage</p>
                <p>• Lender's title insurance is mandatory on all agency loans</p>
                <p>• Lis pendens: transaction must stop until dismissed</p>
              </div>
            </div>

            {/* Quick Nav */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Quick Nav</h3>
              <div className="space-y-1.5">
                {TABS.map((tab,i) => (
                  <button key={tab} onClick={() => setActiveTab(i)} className={`w-full text-left text-xs px-3 py-2 rounded-xl transition-colors font-medium ${activeTab===i?'bg-indigo-50 text-indigo-700 font-bold':'text-slate-500 hover:bg-slate-50'}`}>{i+1}. {tab}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
