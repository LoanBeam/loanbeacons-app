// src/modules/DPAIntelligence.jsx
// LoanBeacons™ — DPA Intelligence™ v3.0
// Nationwide rebuild: GA seed + Lender programs + Web search (non-GA)
// DPA Score ranking · Stack combos · Buyer explanation AI · Prioritize toggle

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/config';
import { DPA_PROGRAMS } from '../data/dpa/dpaData';
import { evaluateAllPrograms, getFreshnessLabel, getConfidenceLabel } from '../engines/dpa/dpaStackOptimizer';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import AEShareForm from '../components/lenderMatch/AEShareForm';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const APPROVAL_STATES = { APPROVED: 'approved', REQUESTED: 'requested', UNKNOWN: 'unknown' };

const STATUS_CONFIG = {
  PASS:        { bg: 'bg-emerald-50',  border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', label: 'ELIGIBLE'    },
  CONDITIONAL: { bg: 'bg-amber-50',    border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500',   label: 'CONDITIONAL' },
  FAIL:        { bg: 'bg-red-50',      border: 'border-red-200',     badge: 'bg-red-100 text-red-700',         dot: 'bg-red-400',     label: 'INELIGIBLE'  },
};

const TYPE_LABELS = {
  grant:       { label: 'Grant',       color: 'bg-purple-100 text-purple-800' },
  forgivable:  { label: 'Forgivable',  color: 'bg-blue-100 text-blue-800'    },
  second_lien: { label: '2nd Lien',    color: 'bg-slate-100 text-slate-700'  },
  repayable:   { label: 'Repayable',   color: 'bg-orange-100 text-orange-800'},
};

const SOURCE_BADGES = {
  lender:     { label: '🏦 Lender Program', bg: 'bg-indigo-100 text-indigo-800'  },
  web_search: { label: '🌐 AI Web Search',  bg: 'bg-cyan-100 text-cyan-800'      },
  default:    { label: '🏛️ State Verified', bg: 'bg-emerald-100 text-emerald-800' },
};

const RANKING_MODES = [
  { key: 'balanced',         label: '🏆 Best Overall',  desc: 'Balanced across all factors',        weights: { dpa:0.35, terms:0.25, approval:0.20, cltv:0.10, stack:0.10 } },
  { key: 'max_dpa',          label: '💰 Max DPA',       desc: 'Prioritize highest dollar amount',   weights: { dpa:0.55, terms:0.20, approval:0.10, cltv:0.08, stack:0.07 } },
  { key: 'easiest_approval', label: '✅ Easiest Path',  desc: 'Prioritize lender-approved programs', weights: { dpa:0.15, terms:0.20, approval:0.45, cltv:0.10, stack:0.10 } },
];

const TYPE_SCORE = { grant: 1.0, forgivable: 0.8, second_lien: 0.5, repayable: 0.2 };

// ── DPA SCORE ENGINE ──────────────────────────────────────────────────────────
const computeDPAScore = (program, evaluation, approvalState, rankingMode, allPassResults, stackCombos) => {
  const weights = RANKING_MODES.find(m => m.key === rankingMode)?.weights || RANKING_MODES[0].weights;
  const maxDPA  = Math.max(...allPassResults.map(r => r.evaluation.dpa_amount_calculated || 0), 1);
  const dpaScore    = Math.min((evaluation.dpa_amount_calculated || 0) / maxDPA, 1);
  const termScore   = TYPE_SCORE[program.program_type] ?? 0.5;
  const approvalScore = approvalState === 'approved' ? 1.0 : approvalState === 'requested' ? 0.6 : 0.3;
  const cushion     = evaluation.cltv_details
    ? Math.min(Math.max(0, (evaluation.cltv_details.program_max - evaluation.cltv_details.cltv_with_dpa) / 0.05), 1)
    : 0.5;
  const isInStack   = stackCombos.some(c => c.programs.some(p => p.program.id === program.id));
  const stackScore  = isInStack ? 1.0 : 0;
  const composite = dpaScore*weights.dpa + termScore*weights.terms + approvalScore*weights.approval + cushion*weights.cltv + stackScore*weights.stack;
  return Math.round(composite * 100);
};

// ── STACK COMBO ENGINE ────────────────────────────────────────────────────────
const canStack = (progA, progB) => {
  if (progA.id === progB.id) return false;
  // Can't stack two programs from the same administering agency
  if (progA.admin_agency && progB.admin_agency && progA.admin_agency === progB.admin_agency) return false;
  if ((progA.stacking_rules || {}).no_subordinate_stacking || (progB.stacking_rules || {}).no_subordinate_stacking) return false;
  return true;
};

const computeStackCombos = (results, scenario) => {
  const passing = results.filter(r => r.evaluation.status !== 'FAIL');
  const combos = [];
  for (let i = 0; i < passing.length; i++) {
    for (let j = i + 1; j < passing.length; j++) {
      const a = passing[i], b = passing[j];
      if (!canStack(a.program, b.program)) continue;
      const totalDPA = (a.evaluation.dpa_amount_calculated || 0) + (b.evaluation.dpa_amount_calculated || 0);
      if (totalDPA > 0) {
        const combinedCLTV = scenario.loanAmount && scenario.purchasePrice
          ? (scenario.loanAmount + totalDPA) / scenario.purchasePrice
          : Math.max(a.evaluation.cltv_details?.cltv_with_dpa || 0, b.evaluation.cltv_details?.cltv_with_dpa || 0);
        combos.push({ id: `${a.program.id}+${b.program.id}`, programs: [a, b], totalDPA, combinedCLTV });
      }
    }
  }
  return combos.sort((a, b) => b.totalDPA - a.totalDPA).slice(0, 4);
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DPAIntelligence() {
  const [searchParams] = useSearchParams();
  const auth = getAuth();
  const scenarioId = searchParams.get('scenarioId') || '';

  // Scenario from Firestore
  const [scenarioDoc, setScenarioDoc] = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(!!scenarioId);

  useEffect(() => {
    if (!scenarioId) { setScenarioLoading(false); return; }
    getDoc(doc(db, 'scenarios', scenarioId))
      .then(snap => {
        if (snap.exists()) {
          const d = { id: snap.id, ...snap.data() };
          setScenarioDoc(d);
          // Auto-populate state/county overrides from scenario
          if (d.state)  setStateOverride(d.state);
          if (d.county) setCountyOverride(d.county.replace(/\s+County$/i, '').trim());
        }
      })
      .catch(console.error).finally(() => setScenarioLoading(false));
  }, [scenarioId]);

  const scenario = useMemo(() => {
    const d = scenarioDoc;
    if (d) return {
      scenarioId, firstName: d.firstName||'', lastName: d.lastName||'',
      streetAddress: d.streetAddress||'', city: d.city||'', state: d.state||'GA',
      zipCode: d.zipCode||'', county: (d.county||'').replace(/\s+County$/i,'').trim(), loanType: d.loanType||'FHA',
      purchasePrice: d.propertyValue||d.purchasePrice||0, loanAmount: d.loanAmount||0,
      creditScore: d.creditScore||0, annualIncome: d.annualIncome||0,
      householdSize: d.householdSize||1, firstTimeBuyer: d.firstTimeBuyer??false,
      backendDTI: (() => { const v = d.backDti||d.backendDTI||0; return v > 1 ? v / 100 : v; })(), occupancy: d.occupancy||'primary',
      lenderId: d.lenderId||'', lenderName: d.lenderName||'',
    };
    return {
      scenarioId, firstName: searchParams.get('firstName')||'', lastName: searchParams.get('lastName')||'',
      streetAddress: searchParams.get('streetAddress')||'', city: searchParams.get('city')||'',
      state: searchParams.get('state')||'GA', zipCode: searchParams.get('zipCode')||'',
      county: searchParams.get('county')||'', loanType: searchParams.get('loanType')||'FHA',
      purchasePrice: parseFloat(searchParams.get('purchasePrice'))||0, loanAmount: parseFloat(searchParams.get('loanAmount'))||0,
      creditScore: parseInt(searchParams.get('creditScore'))||0, annualIncome: parseFloat(searchParams.get('annualIncome'))||0,
      householdSize: parseInt(searchParams.get('householdSize'))||1,
      firstTimeBuyer: searchParams.get('firstTimeBuyer')==='true',
      backendDTI: (() => { const v = parseFloat(searchParams.get('backendDTI'))||0; return v > 1 ? v / 100 : v; })(), occupancy: searchParams.get('occupancy')||'primary',
      lenderId: searchParams.get('lenderId')||'', lenderName: searchParams.get('lenderName')||'',
    };
  }, [scenarioDoc, searchParams, scenarioId]);

  // State/county override
  const [stateOverride,  setStateOverride]  = useState('');
  const [countyOverride, setCountyOverride] = useState('');
  const effectiveState  = stateOverride  || scenario.state  || 'GA';
  const effectiveCounty = countyOverride || scenario.county || '';

  // Core state
  const [brokerOnly,    setBrokerOnly]    = useState(true);
  const [fthbOverride,  setFthbOverride]  = useState(null);
  const [hasRun,        setHasRun]        = useState(false);
  const [isRunning,     setIsRunning]     = useState(false);
  const [results,       setResults]       = useState([]);
  const [webSearchLoading, setWebSearchLoading] = useState(false);
  const [rankingMode,   setRankingMode]   = useState('balanced');
  const [stackCombos,   setStackCombos]   = useState([]);
  const [approvalMap,   setApprovalMap]   = useState({});
  const [brokerageApproved, setBrokerageApproved] = useState(false);
  const [brokerageLenderName, setBrokerageLenderName] = useState('');
  const [selectedProgram,  setSelectedProgram]  = useState(null);
  const [haikusLoading,    setHaikusLoading]    = useState(false);
  const [haikus,           setHaikus]           = useState({});
  const [showFailDetails,  setShowFailDetails]  = useState({});
  const [aeShareModal,     setAeShareModal]     = useState(null);
  const [aeSending,        setAeSending]        = useState(false);
  const [aeSent,           setAeSent]           = useState(false);
  const [programShareModal,setProgramShareModal]= useState(null);
  const [progSending,      setProgSending]      = useState(false);
  const [progSent,         setProgSent]         = useState(false);
  const [buyerExplanation, setBuyerExplanation] = useState(null);
  const [buyerExpLoading,  setBuyerExpLoading]  = useState(false);
  const [buyerExpProgram,  setBuyerExpProgram]  = useState(null);
  const [showBuyerModal,   setShowBuyerModal]   = useState(false);
  const [activeTab,        setActiveTab]        = useState('ranked');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const effectiveFthb = fthbOverride ?? scenario.firstTimeBuyer;
  const effectiveLenderId   = scenario.lenderId;
  const effectiveLenderName = scenario.lenderName || brokerageLenderName;

  useEffect(() => {
    if (!effectiveLenderId || !auth.currentUser) return;
    getDocs(query(collection(db, 'dpa_lender_approvals'), where('lo_id','==',auth.currentUser.uid), where('lender_id','==',effectiveLenderId)))
      .then(snap => { const map={}; snap.forEach(d=>{ map[d.data().program_id]=d.data().approval_state; }); setApprovalMap(prev=>({...prev,...map})); })
      .catch(console.error);
  }, [effectiveLenderId, auth.currentUser]);

  const loadLenderPrograms = async () => {
    try {
      const snap = await getDocs(collection(db, 'lenderProfiles'));
      const programs = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (!data.dpaPrograms?.length) return;
        data.dpaPrograms.forEach((p, idx) => {
          programs.push({
            id: `lender-${d.id}-${idx}`,
            program_name: p.program_name || p.name || 'Lender DPA Program',
            program_type: p.program_type || 'second_lien',
            state: p.state || null, county: p.county || null, city: p.city || null,
            admin_agency: data.name || 'Lender Program',
            website_url: p.website_url || null, contact_phone: null, contact_email: null,
            description: p.description || `${data.name||'Lender'} proprietary DPA program.`,
            assistance_amount: p.assistance_amount || null, assistance_pct: p.assistance_pct || null,
            broker_eligible: true, last_verified_date: new Date().toISOString().split('T')[0],
            confidence_score: 0.88, is_active: true, source: 'lender',
            lender_name: data.name || 'Lender', lender_id: d.id,
            rules: {
              min_fico: p.min_fico || p.rules?.min_fico || 620,
              max_dti: p.max_dti || p.rules?.max_dti || 0.50,
              income_limit: p.income_limit || p.rules?.income_limit || null,
              income_limit_type: p.income_limit_type || p.rules?.income_limit_type || null,
              max_cltv: p.max_cltv || p.rules?.max_cltv || 1.00,
              loan_types_allowed: p.loan_types_allowed || p.rules?.loan_types_allowed || ['FHA','Conventional'],
              fthb_required: p.fthb_required ?? p.rules?.fthb_required ?? false,
              occupancy_required: 'primary',
              purchase_price_limit: p.purchase_price_limit || p.rules?.purchase_price_limit || null,
              geography_scope: p.state ? 'state' : 'national',
            },
            stacking_rules: p.stacking_rules || {
              allowed_with_fha: true, allowed_with_conv: true, allowed_with_va: false, allowed_with_usda: false,
              max_combined_cltv: p.max_cltv || 1.00,
              subordinate_financing_rules: p.stacking_notes || 'Lender-specific stacking rules apply — confirm with AE.',
              mi_impact_rules: null,
            },
          });
        });
      });
      return programs;
    } catch (e) { console.error('[DPA] lender programs load failed:', e); return []; }
  };

  const searchWebForPrograms = async (state, county, loanType) => {
    setWebSearchLoading(true);
    try {
      const prompt = `Search the web for current 2025-2026 down payment assistance (DPA) programs in ${state}${county ? `, ${county} County` : ''} for a ${loanType} purchase loan. Include state HFA, local city/county, and national programs. Return ONLY valid JSON array, no markdown:\n[{"program_name":"string","program_type":"grant|forgivable|second_lien|repayable","admin_agency":"string","description":"string","assistance_amount":number_or_null,"assistance_pct":number_or_null,"min_fico":number,"max_dti":number,"fthb_required":boolean,"income_limit":number_or_null,"income_limit_type":"AMI%|absolute|null","loan_types_allowed":["FHA","Conventional"],"website_url":"string_or_null","contact_phone":"string_or_null","geography_scope":"state|county|city|national"}]\nReturn 3-8 real currently active programs. If none found return [].`;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':import.meta.env.VITE_ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({ model:'claude-sonnet-4-5', max_tokens:3000, tools:[{ type:'web_search_20250305', name:'web_search' }], messages:[{ role:'user', content:prompt }] }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const text = data.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
      return parsed.map((p,i) => ({
        id:`web-${state}-${i}`, program_name:p.program_name, program_type:p.program_type||'second_lien',
        state:state!=='GA'?state:null, county:county||null, city:null, admin_agency:p.admin_agency,
        website_url:p.website_url||null, contact_phone:p.contact_phone||null, contact_email:null,
        description:p.description, assistance_amount:p.assistance_amount||null, assistance_pct:p.assistance_pct||null,
        broker_eligible:true, last_verified_date:new Date().toISOString().split('T')[0],
        confidence_score:0.72, is_active:true, source:'web_search',
        rules:{ min_fico:p.min_fico||620, max_dti:p.max_dti||0.45, income_limit:p.income_limit||null,
          income_limit_type:p.income_limit_type||null, max_cltv:1.00,
          loan_types_allowed:p.loan_types_allowed||['FHA','Conventional'],
          fthb_required:p.fthb_required??false, occupancy_required:'primary',
          purchase_price_limit:null, geography_scope:p.geography_scope||'state' },
        stacking_rules:{ allowed_with_fha:true, allowed_with_conv:true, allowed_with_va:false, allowed_with_usda:false,
          max_combined_cltv:1.00, subordinate_financing_rules:`Verify stacking rules with ${p.admin_agency}.`, mi_impact_rules:null },
      }));
    } catch(e){ console.error('[DPA] web search failed:',e); return []; }
    finally { setWebSearchLoading(false); }
  };

  const generateHaikus = async (programs) => {
    setHaikusLoading(true);
    const res = {};
    await Promise.all(programs.map(async ({ program, evaluation }) => {
      try {
        const prompt = `Write ONE sentence under 25 words summarizing this DPA program for a loan officer. Amount, type, key eligibility only.\nProgram: ${program.program_name}\nType: ${program.program_type}\nAmount: ${evaluation.dpa_amount_calculated ? '$'+evaluation.dpa_amount_calculated.toLocaleString() : program.assistance_pct ? (program.assistance_pct*100)+'% of price' : 'See program'}\nStatus: ${evaluation.status}`;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST', headers:{'Content-Type':'application/json','x-api-key':import.meta.env.VITE_ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:80, messages:[{role:'user',content:prompt}] }),
        });
        const data = await r.json();
        res[program.id] = data.content?.[0]?.text?.trim() || '';
      } catch { res[program.id]=''; }
    }));
    setHaikus(res);
    setHaikusLoading(false);
  };

  const generateBuyerExplanation = async (program, evaluation, rank, allRanked) => {
    setBuyerExpLoading(true); setBuyerExpProgram(program); setShowBuyerModal(true); setBuyerExplanation(null);
    const others = allRanked.filter(r => r.program.id !== program.id).slice(0, 3);
    const dpaAmt = evaluation.dpa_amount_calculated ? `$${evaluation.dpa_amount_calculated.toLocaleString()}` : program.assistance_pct ? `${(program.assistance_pct*100).toFixed(1)}% of purchase price` : 'amount TBD';
    const prompt = `You are a mortgage loan officer explaining to a homebuyer WHY a specific DPA program is recommended — even if they're fixed on a popular program they heard about from friends.

RECOMMENDED (#${rank}): ${program.program_name} | Type: ${TYPE_LABELS[program.program_type]?.label} | DPA: ${dpaAmt} | Source: ${program.source==='lender'?program.lender_name:program.admin_agency}
Why it works: ${evaluation.reasons?.join('; ')||'Meets all eligibility requirements'}

OTHER OPTIONS: ${others.map((r,i)=>`${i+1}. ${r.program.program_name} — ${r.evaluation.dpa_amount_calculated?'$'+r.evaluation.dpa_amount_calculated.toLocaleString():r.program.assistance_pct?(r.program.assistance_pct*100).toFixed(1)+'% of price':'varies'} (${r.evaluation.status})`).join('; ')}

BORROWER: FICO ${scenario.creditScore||'N/A'} | DTI ${scenario.backendDTI?(scenario.backendDTI*100).toFixed(1)+'%':'N/A'} | Income ${scenario.annualIncome?'$'+scenario.annualIncome.toLocaleString():'N/A'} | FTHB: ${effectiveFthb?'Yes':'No'} | ${scenario.loanType||'FHA'} | ${effectiveState}${effectiveCounty?', '+effectiveCounty+' County':''}

Write a clear, warm 3-paragraph explanation. Return ONLY JSON:
{"headline":"one sentence why this program wins","why_this_works":"paragraph why this fits this specific borrower — be personal and specific","why_not_others":"paragraph gently explaining why other programs (name them) may not be as good — use facts","action_items":["2-3 next steps for the buyer"],"talking_points":["2-3 LO talking points when buyer pushes back"]}`;
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'Content-Type':'application/json','x-api-key':import.meta.env.VITE_ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({ model:'claude-sonnet-4-5', max_tokens:1200, messages:[{role:'user',content:prompt}] }),
      });
      const data = await resp.json();
      const raw = data.content?.map(b=>b.text||'').join('') || '';
      setBuyerExplanation(JSON.parse(raw.replace(/```json|```/g,'').trim()));
    } catch(e) {
      setBuyerExplanation({ headline:'Could not generate.', why_this_works:e.message, why_not_others:'', action_items:[], talking_points:[] });
    } finally { setBuyerExpLoading(false); }
  };

  const handleRunSearch = async () => {
    setIsRunning(true); setHasRun(false); setHaikus({}); setSelectedProgram(null); setStackCombos([]);
    const lenderProgs = await loadLenderPrograms();
    let pool = [];
    if (effectiveState === 'GA') {
      const seedPool = brokerOnly ? DPA_PROGRAMS.filter(p=>p.broker_eligible) : DPA_PROGRAMS;
      pool = [...seedPool, ...lenderProgs];
    } else {
      const webProgs = await searchWebForPrograms(effectiveState, effectiveCounty, scenario.loanType);
      pool = [...webProgs, ...lenderProgs];
    }
    try {
      const allSnap = await getDocs(collection(db, 'lenderProfiles'));
      const approvedDoc = allSnap.docs.find(d=>d.data().brokerage_approved===true);
      if (approvedDoc) { setBrokerageApproved(true); setBrokerageLenderName(approvedDoc.data().name||''); }
    } catch(e) { console.error('[DPA] brokerage check:',e); }
    const effectiveScenario = { ...scenario, state:effectiveState, county:effectiveCounty, firstTimeBuyer:effectiveFthb };
    const evaluated = evaluateAllPrograms(pool, effectiveScenario);
    const combos = computeStackCombos(evaluated, effectiveScenario);
    setStackCombos(combos); setResults(evaluated); setHasRun(true); setIsRunning(false);
    const top3 = evaluated.filter(r=>r.evaluation.status==='PASS').slice(0,3);
    if (top3.length>0 && scenarioId) {
      reportFindings({ moduleKey:'DPA_INTELLIGENCE', moduleVersion:'3.0.0',
        findings:top3.map(r=>({ program_id:r.program.id, program_name:r.program.program_name, status:r.evaluation.status, dpa_amount:r.evaluation.dpa_amount_calculated, source:r.program.source||'seed' })),
        inputs:{ brokerOnly, state:effectiveState, county:effectiveCounty },
      });
    }
    const passProgs = evaluated.filter(r=>r.evaluation.status!=='FAIL').slice(0,8);
    if (passProgs.length>0) generateHaikus(passProgs);
  };

  const handleOpenAeModal      = useCallback((p,e)=>{ setAeSent(false);setAeSending(false);setAeShareModal({program:p,evaluation:e}); },[]);
  const handleCloseAeModal     = useCallback(()=>{ setAeShareModal(null);setAeSent(false);setAeSending(false); },[]);
  const handleOpenProgramShare = useCallback((p,e)=>{ setProgramShareModal({program:p,evaluation:e});setProgSent(false); },[]);
  const handleCloseProgramShare= useCallback(()=>{ setProgramShareModal(null);setProgSent(false); },[]);

  const handleProgramSend = useCallback(async (emails, shareType, message) => {
    if (!programShareModal||!scenarioId) return;
    const {program,evaluation} = programShareModal;
    setProgSending(true);
    try {
      await addDoc(collection(db,'scenarioShares'),{
        scenarioId, aeEmails:emails, shareType:shareType||'SCENARIO_REVIEW', message:message||'',
        status:'pending', createdAt:serverTimestamp(), userId:auth.currentUser?.uid||'',
        dpaContext:{ programName:program.program_name, programType:TYPE_LABELS[program.program_type]?.label||program.program_type,
          programStatus:evaluation.status, adminAgency:program.admin_agency||'', source:program.source||'seed',
          dpaAmount:evaluation.dpa_amount_calculated?`$${evaluation.dpa_amount_calculated.toLocaleString()}`:null,
          lenderName:program.lender_name||effectiveLenderName||'' },
        moduleContext:{ moduleName:'DPA Intelligence™', moduleNumber:'07' },
      });
      setProgSent(true); setTimeout(handleCloseProgramShare,2500);
    } catch(err){ console.error('[DPA] program share:',err); }
    finally { setProgSending(false); }
  },[programShareModal,scenarioId,effectiveLenderName,auth.currentUser,handleCloseProgramShare]);

  const handleAeSend = useCallback(async (emails, shareType, message) => {
    if (!aeShareModal||!auth.currentUser) return;
    const {program,evaluation} = aeShareModal;
    setAeSending(true);
    try {
      await addDoc(collection(db,'scenarioShares'),{
        scenarioId, aeEmails:emails, shareType:shareType||'AE_SUPPORT', message:message||'',
        status:'pending', createdAt:serverTimestamp(), userId:auth.currentUser.uid,
        dpaContext:{ programName:program.program_name, programStatus:evaluation.status, adminAgency:program.admin_agency??null },
        moduleContext:{ moduleName:'DPA Intelligence™', moduleNumber:'07' },
      });
      if (scenario.lenderId) {
        await addDoc(collection(db,'dpa_lender_approvals'),{
          lo_id:auth.currentUser.uid, lender_id:scenario.lenderId, lender_name:scenario.lenderName,
          program_id:program.id, program_name:program.program_name,
          approval_state:APPROVAL_STATES.REQUESTED, requested_at:serverTimestamp(), last_updated:serverTimestamp(),
        });
        setApprovalMap(prev=>({...prev,[program.id]:APPROVAL_STATES.REQUESTED}));
      }
      setAeSent(true); setTimeout(handleCloseAeModal,2000);
    } catch(err){ console.error('AE send:',err); }
    finally { setAeSending(false); }
  },[aeShareModal,auth.currentUser,scenarioId,scenario.lenderId,scenario.lenderName,handleCloseAeModal]);

  const passResults = results.filter(r=>r.evaluation.status!=='FAIL');
  const ranked = useMemo(()=>{
    if (!hasRun||passResults.length===0) return [];
    return passResults.map(r=>{
      const approvalState = brokerageApproved?APPROVAL_STATES.APPROVED:(approvalMap[r.program.id]||APPROVAL_STATES.UNKNOWN);
      return { ...r, dpaScore:computeDPAScore(r.program,r.evaluation,approvalState,rankingMode,passResults,stackCombos), approvalState };
    }).sort((a,b)=>b.dpaScore-a.dpaScore);
  },[results,rankingMode,approvalMap,brokerageApproved,stackCombos,hasRun,passResults]);

  const top5 = ranked.slice(0,5);
  const passCount = results.filter(r=>r.evaluation.status==='PASS').length;
  const condCount = results.filter(r=>r.evaluation.status==='CONDITIONAL').length;
  const failCount = results.filter(r=>r.evaluation.status==='FAIL').length;
  const lenderCount = results.filter(r=>r.program.source==='lender').length;
  const borrowerName = [scenario.firstName,scenario.lastName].filter(Boolean).join(' ')||'No borrower selected';
  const addressLine  = [scenario.streetAddress,scenario.city,scenario.state,scenario.zipCode].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-gray-50">
      {scenarioId && <DecisionRecordBanner scenarioId={scenarioId} moduleKey="DPA_INTELLIGENCE" />}
      <ScenarioHeader moduleTitle="DPA Intelligence™" moduleNumber="07" scenarioId={scenarioId} />

      <div className="bg-[#1B3A6B] px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest mb-1">Borrower Scenario — DPA Intelligence™ v3.0</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-base">{borrowerName}</span>
            {addressLine && <span className="text-blue-200 text-sm">{addressLine}</span>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-100">
              {scenario.creditScore>0 && <span>FICO <strong className="text-white">{scenario.creditScore}</strong></span>}
              {scenario.loanType && <span>Loan <strong className="text-white">{scenario.loanType}</strong></span>}
              {scenario.purchasePrice>0 && <span>Price <strong className="text-white">${scenario.purchasePrice.toLocaleString()}</strong></span>}
              {scenario.backendDTI>0 && <span>DTI <strong className="text-white">{(scenario.backendDTI*100).toFixed(1)}%</strong></span>}
              {scenario.annualIncome>0 && <span>Income <strong className="text-white">${scenario.annualIncome.toLocaleString()}</strong></span>}
              <span className={effectiveFthb?'text-emerald-300 font-semibold':'text-blue-200'}>{effectiveFthb?'🏠 FTHB ✓':'Not FTHB'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5 pb-24 min-h-screen">

        {/* Search controls */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">State</label>
                <input value={stateOverride||effectiveState} onChange={e=>setStateOverride(e.target.value.toUpperCase().slice(0,2))} maxLength={2} placeholder="GA"
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-bold uppercase focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">County <span className="text-gray-300">(opt)</span></label>
                <input value={countyOverride||effectiveCounty} onChange={e=>setCountyOverride(e.target.value)} placeholder={effectiveCounty||'e.g. Gwinnett'}
                  className="w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-300" />
              </div>
              {effectiveState!=='GA' && <div className="flex items-end pb-0.5"><span className="text-xs bg-cyan-100 text-cyan-700 font-semibold px-2 py-1 rounded-full">🌐 Web search for {effectiveState}</span></div>}
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label:'Broker Programs Only', sub:brokerOnly?'Broker-eligible only':'All programs', val:brokerOnly, set:()=>setBrokerOnly(v=>!v) },
                { label:'First-Time Homebuyer', sub:fthbOverride===null?`FTHB ${scenario.firstTimeBuyer?'from scenario':'not detected'}`:effectiveFthb?'Manual: FTHB on':'Manual: FTHB off', val:effectiveFthb, set:()=>setFthbOverride(v=>v===null?true:v===true?false:null) },
              ].map(({label,sub,val,set})=>(
                <div key={label} className="flex items-center gap-3">
                  <button onClick={set} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${val?'bg-[#1B3A6B]':'bg-gray-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${val?'translate-x-5':'translate-x-0.5'}`} />
                  </button>
                  <div><p className="text-xs font-semibold text-gray-800">{label}</p><p className="text-[10px] text-gray-400">{sub}</p></div>
                </div>
              ))}
            </div>
            <button onClick={handleRunSearch} disabled={isRunning||scenarioLoading}
              className="ml-auto bg-[#1B3A6B] hover:bg-blue-800 disabled:bg-gray-300 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap">
              {isRunning||webSearchLoading
                ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>{webSearchLoading?'Searching Web…':'Running…'}</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>Run DPA Intelligence™</>}
            </button>
          </div>
        </div>

        {/* Stats grid — always rendered, zeros before search */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[{label:'Eligible',count:hasRun?passCount:'-',color:'emerald'},{label:'Conditional',count:hasRun?condCount:'-',color:'amber'},{label:'Ineligible',count:hasRun?failCount:'-',color:'red'},{label:'Lender Programs',count:hasRun?lenderCount:'-',color:'indigo'}].map(({label,count,color})=>(
            <div key={label} className={`bg-white rounded-xl border border-${color}-200 p-4 text-center shadow-sm transition-all`}>
              <p className={`text-2xl font-bold text-${color}-600`}>{count}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Ranking mode — always rendered, dimmed before search */}
        <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 transition-opacity ${hasRun&&ranked.length>0?'opacity-100':'opacity-40 pointer-events-none'}`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Prioritize rankings by:</p>
          <div className="flex flex-wrap gap-2">
            {RANKING_MODES.map(mode=>(
              <button key={mode.key} onClick={()=>setRankingMode(mode.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${rankingMode===mode.key?'bg-[#1B3A6B] text-white border-[#1B3A6B]':'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{RANKING_MODES.find(m=>m.key===rankingMode)?.desc}</p>
        </div>

        {/* Tab nav — always rendered */}
        <div className="flex gap-2 border-b border-gray-200">
          {[{k:'ranked',l:`🏆 Top ${hasRun?Math.min(5,ranked.length):0} Ranked`},{k:'stacks',l:`🔗 Best Stacks (${hasRun?stackCombos.length:0})`},{k:'all',l:`📋 All Programs (${hasRun?results.length:0})`}].map(t=>(
            <button key={t.k} onClick={()=>hasRun&&setActiveTab(t.k)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${activeTab===t.k&&hasRun?'border-[#1B3A6B] text-[#1B3A6B] bg-blue-50':'border-transparent text-gray-400'} ${!hasRun?'cursor-default':''}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {!hasRun && !isRunning && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#1B3A6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-2">DPA Intelligence™ v3.0 — Nationwide</h3>
            <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-500 mb-3">
              <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">🏛️ State Programs</span>
              <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">🏦 Lender Programs</span>
              <span className="bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full">🌐 Web Search (non-GA)</span>
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">🔗 Stack Combos</span>
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">💬 Buyer Explanations</span>
            </div>
            <p className="text-sm text-gray-400">Select state, toggle options, then run search</p>
          </div>
        )}

        {isRunning && (
          <div className="space-y-3">
            {[1,2,3].map(i=>(
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0"/>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-2/3"/>
                    <div className="h-3 bg-gray-100 rounded w-1/3"/>
                    <div className="h-3 bg-gray-100 rounded w-1/2"/>
                  </div>
                  <div className="w-16 h-8 bg-gray-200 rounded flex-shrink-0"/>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasRun && activeTab==='ranked' && (
          <div className="space-y-3">
            {top5.length===0
              ? <div className="bg-white rounded-xl p-10 text-center text-gray-400">No eligible programs found for this scenario.</div>
              : top5.map((item,idx)=>(
                <RankedProgramCard key={item.program.id} rank={idx+1} program={item.program} evaluation={item.evaluation}
                  dpaScore={item.dpaScore} haiku={haikus[item.program.id]} haikusLoading={haikusLoading}
                  approvalState={item.approvalState} lenderName={item.program.lender_name||effectiveLenderName}
                  lenderId={effectiveLenderId||'brokerage'}
                  onSelect={()=>setSelectedProgram({program:item.program,evaluation:item.evaluation})}
                  onRequestApproval={()=>handleOpenAeModal(item.program,item.evaluation)}
                  onShareWithAe={()=>handleOpenProgramShare(item.program,item.evaluation)}
                  onBuyerExplanation={()=>generateBuyerExplanation(item.program,item.evaluation,idx+1,top5)} />
              ))}
            {ranked.length>5 && <button onClick={()=>setActiveTab('all')} className="w-full py-2.5 text-sm text-[#1B3A6B] font-semibold border border-blue-200 rounded-xl hover:bg-blue-50">View all {results.length} programs →</button>}
          </div>
        )}

        {hasRun && activeTab==='stacks' && (
          <div className="space-y-3">
            {stackCombos.length===0
              ? <div className="bg-white rounded-xl p-10 text-center text-gray-400"><p className="font-semibold mb-1">No stackable combinations found</p><p className="text-xs">Two compatible eligible programs from different agencies are required for stacking.</p></div>
              : <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-blue-800 mb-1">💡 How stacking works</p>
                  <p className="text-xs text-blue-700">A borrower can combine ONE program per administering agency. For example: one Georgia Dream variant + Gwinnett County DPA are from different agencies so they stack. Two Georgia Dream variants cannot stack — same agency.</p>
                </div>
                {/* Max DPA callout */}
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-0.5">🏆 Maximum DPA Available — Best Stack</p>
                    <p className="text-sm font-bold text-emerald-900">{stackCombos[0].programs[0].program.program_name} + {stackCombos[0].programs[1].program.program_name}</p>
                    <p className="text-xs text-emerald-700 mt-0.5">Different agencies · No conflicts · Verify stacking rules before presenting</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-3xl font-black text-emerald-700">${stackCombos[0].totalDPA.toLocaleString()}</p>
                    <p className="text-xs text-emerald-500">combined DPA</p>
                  </div>
                </div>
                {stackCombos.map(combo=>(
                  <StackComboCard key={combo.id} combo={combo} approvalMap={approvalMap} brokerageApproved={brokerageApproved}
                    onViewDetails={r=>setSelectedProgram({program:r.program,evaluation:r.evaluation})}
                    onRequestApproval={r=>handleOpenAeModal(r.program,r.evaluation)} />
                ))}
              </>}
          </div>
        )}

        {hasRun && activeTab==='all' && (
          <div className="space-y-3">
            {results.map(({program,evaluation})=>(
              <ProgramCard key={program.id} program={program} evaluation={evaluation} haiku={haikus[program.id]}
                haikusLoading={haikusLoading}
                approvalState={brokerageApproved?APPROVAL_STATES.APPROVED:(approvalMap[program.id]||APPROVAL_STATES.UNKNOWN)}
                lenderName={program.lender_name||effectiveLenderName} lenderId={effectiveLenderId||'brokerage'}
                onSelect={()=>setSelectedProgram({program,evaluation})}
                onRequestApproval={()=>handleOpenAeModal(program,evaluation)}
                onShareWithAe={()=>handleOpenProgramShare(program,evaluation)}
                showFailDetail={showFailDetails[program.id]}
                onToggleFailDetail={()=>setShowFailDetails(prev=>({...prev,[program.id]:!prev[program.id]}))}
                brokerOnly={brokerOnly} />
            ))}
          </div>
        )}
      </div>

      {/* Program drawer */}
      {selectedProgram && (
        <ProgramDrawer program={selectedProgram.program} evaluation={selectedProgram.evaluation}
          haiku={haikus[selectedProgram.program.id]}
          approvalState={brokerageApproved?APPROVAL_STATES.APPROVED:(approvalMap[selectedProgram.program.id]||APPROVAL_STATES.UNKNOWN)}
          lenderName={selectedProgram.program.lender_name||effectiveLenderName}
          onRequestApproval={()=>handleOpenAeModal(selectedProgram.program,selectedProgram.evaluation)}
          onClose={()=>setSelectedProgram(null)} />
      )}

      {/* Buyer explanation modal */}
      {showBuyerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setShowBuyerModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[#1B3A6B] px-6 py-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest">💬 Buyer Explanation — LO Talking Points</p>
                <h2 className="text-white font-bold text-base">{buyerExpProgram?.program_name}</h2>
              </div>
              <button onClick={()=>setShowBuyerModal(false)} className="text-blue-300 hover:text-white mt-0.5"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {buyerExpLoading ? (
                <div className="flex flex-col items-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Generating buyer explanation…</p>
                </div>
              ) : buyerExplanation ? (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-base font-bold text-emerald-800">{buyerExplanation.headline}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Why this works for your buyer</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{buyerExplanation.why_this_works}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">If they ask about other programs</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{buyerExplanation.why_not_others}</p>
                  </div>
                  {buyerExplanation.talking_points?.length>0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">🎯 When buyer pushes back — use these</p>
                      <ul className="space-y-1.5">{buyerExplanation.talking_points.map((pt,i)=><li key={i} className="flex items-start gap-2 text-sm text-amber-800"><span className="font-bold shrink-0">•</span>{pt}</li>)}</ul>
                    </div>
                  )}
                  {buyerExplanation.action_items?.length>0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Next steps — tell your buyer now</p>
                      <ol className="space-y-1.5">{buyerExplanation.action_items.map((item,i)=><li key={i} className="flex items-start gap-2 text-sm text-gray-700"><span className="w-5 h-5 rounded-full bg-[#1B3A6B] text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>{item}</li>)}</ol>
                    </div>
                  )}
                  <button onClick={()=>navigator.clipboard.writeText(`${buyerExplanation.headline}\n\n${buyerExplanation.why_this_works}\n\n${buyerExplanation.why_not_others}\n\nNext steps:\n${buyerExplanation.action_items?.map((a,i)=>`${i+1}. ${a}`).join('\n')}`)}
                    className="w-full py-2.5 text-sm font-bold text-[#1B3A6B] border border-blue-200 rounded-xl hover:bg-blue-50">
                    📋 Copy Explanation to Clipboard
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {programShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseProgramShare} />
          <div className="relative w-full max-w-lg mx-4 bg-[#0d1117] rounded-2xl shadow-2xl overflow-hidden border border-[#21262d]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div><p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-widest mb-0.5">Share Program with AE</p><h2 className="text-white font-bold text-sm">{programShareModal.program.program_name}</h2></div>
              <button onClick={handleCloseProgramShare} className="text-[#8b949e] hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <AEShareForm onSend={handleProgramSend} sending={progSending} sent={progSent} />
          </div>
        </div>
      )}

      {aeShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseAeModal} />
          <div className="relative w-full max-w-lg mx-4 bg-[#0d1117] rounded-2xl shadow-2xl overflow-hidden border border-[#21262d]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div><p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-widest mb-0.5">DPA Approval Request</p><h2 className="text-white font-bold text-sm">{aeShareModal.program.program_name}</h2></div>
              <button onClick={handleCloseAeModal} className="text-[#8b949e] hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <AEShareForm onSend={handleAeSend} sending={aeSending} sent={aeSent} />
          </div>
        </div>
      )}

      <CanonicalSequenceBar scenarioId={scenarioId} />
    </div>
  );
}

// ── RANKED PROGRAM CARD ───────────────────────────────────────────────────────
function RankedProgramCard({ rank, program, evaluation, dpaScore, haiku, haikusLoading, approvalState, lenderName, lenderId, onSelect, onRequestApproval, onShareWithAe, onBuyerExplanation }) {
  const cfg = STATUS_CONFIG[evaluation.status];
  const typeCfg = TYPE_LABELS[program.program_type]||{label:program.program_type,color:'bg-gray-100 text-gray-700'};
  const sourceBadge = SOURCE_BADGES[program.source]||SOURCE_BADGES.default;
  const dpaDisplay = evaluation.dpa_amount_calculated?`$${evaluation.dpa_amount_calculated.toLocaleString()}`:program.assistance_pct?`${(program.assistance_pct*100).toFixed(1)}% of price`:'—';
  const scoreColor = dpaScore>=75?'text-emerald-600':dpaScore>=50?'text-amber-600':'text-red-500';
  const scoreBar   = dpaScore>=75?'bg-emerald-500':dpaScore>=50?'bg-amber-500':'bg-red-400';
  const rankBg     = ['bg-yellow-400','bg-gray-300','bg-amber-600','bg-gray-200','bg-gray-200'][rank-1]||'bg-gray-100';

  return (
    <div className={`bg-white rounded-xl border-2 ${rank===1?'border-yellow-300 ring-2 ring-yellow-100':'border-gray-100'} shadow-sm overflow-hidden`}>
      <div className={`flex items-start justify-between gap-3 p-4 ${cfg.bg}`}>
        <div className={`w-8 h-8 rounded-full ${rankBg} flex items-center justify-center text-sm font-black text-gray-800 flex-shrink-0 mt-0.5`}>#{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-gray-900">{program.program_name}</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceBadge.bg}`}>{sourceBadge.label}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
            <span className="text-[11px] text-gray-500">{program.admin_agency}</span>
          </div>
          {haikusLoading&&!haiku&&<div className="h-4 bg-gray-100 rounded animate-pulse w-3/4 mt-1.5" />}
          {haiku&&!haikusLoading&&<p className="text-xs text-gray-600 italic mt-1.5">{haiku}</p>}
        </div>
        <div className="text-right flex-shrink-0"><p className="text-xl font-bold text-gray-900">{dpaDisplay}</p><p className="text-[10px] text-gray-400">DPA Amount</p></div>
      </div>
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">DPA Score</span>
            <span className={`text-sm font-black ${scoreColor}`}>{dpaScore}/100</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${scoreBar}`} style={{width:`${dpaScore}%`}} /></div>
        </div>
        {evaluation.cltv_details && <div className="text-right flex-shrink-0"><p className="text-[10px] text-gray-400">CLTV</p><p className="text-xs font-bold text-gray-700">{(evaluation.cltv_details.cltv_with_dpa*100).toFixed(1)}%</p></div>}
      </div>
      {evaluation.warnings?.length>0 && <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">{evaluation.warnings.map((w,i)=><p key={i} className="text-xs text-amber-700">⚠️ {w}</p>)}</div>}
      <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <LenderApprovalBadge approvalState={approvalState} lenderName={lenderName} lenderId={lenderId} onShareWithAe={onShareWithAe} />
          {lenderId&&approvalState==='unknown'&&<button onClick={onRequestApproval} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B3A6B] hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full px-2.5 py-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Request Approval</button>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBuyerExplanation} className="text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg px-3 py-1.5 transition-colors">💬 Explain to Buyer</button>
          <button onClick={onSelect} className="text-xs text-[#1B3A6B] hover:text-blue-800 font-semibold flex items-center gap-1">View Details <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </div>
    </div>
  );
}

// ── STACK COMBO CARD ──────────────────────────────────────────────────────────
// ── STACK TYPE DETECTOR ───────────────────────────────────────────────────────
const getStackType = (programs) => {
  const [a, b] = programs;
  const sources = [a.program.source, b.program.source];
  const scopes  = [a.program.rules?.geography_scope, b.program.rules?.geography_scope];
  if (sources.includes('lender')) return { label: '🏦 State + Lender', color: 'bg-indigo-100 text-indigo-800' };
  if (scopes.includes('county') && scopes.includes('state')) return { label: '🏛️ State + County', color: 'bg-emerald-100 text-emerald-800' };
  if (scopes.includes('national') && scopes.includes('state')) return { label: '🌐 State + National', color: 'bg-cyan-100 text-cyan-800' };
  if (scopes.includes('national') && scopes.includes('county')) return { label: '🌐 County + National', color: 'bg-cyan-100 text-cyan-800' };
  return { label: '🔗 Combined', color: 'bg-blue-100 text-blue-800' };
};

// ── ELIGIBILITY ALERTS DETECTOR ───────────────────────────────────────────────
const getEligibilityAlerts = (program) => {
  const alerts = [];
  const desc = (program.description || '').toLowerCase();
  const rules = program.stacking_rules?.subordinate_financing_rules || '';

  if (desc.includes('pen') || desc.includes('protector') || desc.includes('educator') || desc.includes('nurse') || desc.includes('law enforcement') || desc.includes('military') || desc.includes('healthcare')) {
    alerts.push({ icon: '📋', text: 'Profession verification required — employer letter confirming qualifying role (law enforcement, educator, healthcare, or active military)' });
  }
  if (desc.includes('disability') || desc.includes('choice loan')) {
    alerts.push({ icon: '📋', text: 'Disability documentation required — signed certification or medical documentation at underwriting' });
  }
  if (desc.includes('counseling') || desc.includes('homebuyer education') || desc.includes('hud')) {
    alerts.push({ icon: '🎓', text: 'HUD-approved homebuyer education certificate required before closing' });
  }
  if (desc.includes('forgivable') || rules.toLowerCase().includes('forgivable')) {
    alerts.push({ icon: '📅', text: 'Forgiveness period applies — borrower must remain owner-occupied for full term or repayment triggered' });
  }
  if (program.rules?.income_limit) {
    alerts.push({ icon: '💰', text: `Income limit applies — verify borrower income against ${program.rules.income_limit_type === 'AMI%' ? Math.round(program.rules.income_limit * 100) + '% AMI limit' : '$' + program.rules.income_limit.toLocaleString() + ' absolute limit'}` });
  }
  if (program.rules?.fthb_required) {
    alerts.push({ icon: '🏠', text: 'First-time homebuyer required — verify borrower has not owned in past 3 years' });
  }
  if (program.source === 'web_search') {
    alerts.push({ icon: '⚠️', text: 'Web search result — confirm program is still active and funded before presenting to borrower' });
  }
  return alerts;
};

function StackComboCard({ combo, approvalMap, brokerageApproved, onViewDetails, onRequestApproval }) {
  const [a,b] = combo.programs;
  const [showAlerts, setShowAlerts] = useState(false);
  const bothApproved = combo.programs.every(r=>brokerageApproved||approvalMap[r.program.id]===APPROVAL_STATES.APPROVED);
  const stackType = getStackType(combo.programs);
  const allAlerts = [
    ...getEligibilityAlerts(a.program).map(al => ({ ...al, program: a.program.program_name })),
    ...getEligibilityAlerts(b.program).map(al => ({ ...al, program: b.program.program_name })),
  ];

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-blue-50 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">🔗 STACK</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stackType.color}`}>{stackType.label}</span>
            {bothApproved && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Both Approved</span>}
            {allAlerts.length > 0 && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                ⚠️ {allAlerts.length} Verification {allAlerts.length === 1 ? 'Requirement' : 'Requirements'}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-blue-900">{a.program.program_name} <span className="text-blue-400 font-normal">+</span> {b.program.program_name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-black text-blue-700">${combo.totalDPA.toLocaleString()}</p>
          <p className="text-[10px] text-blue-500">combined DPA</p>
        </div>
      </div>

      {/* Program cards */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {combo.programs.map((r,i)=>{
          const dpa = r.evaluation.dpa_amount_calculated?`$${r.evaluation.dpa_amount_calculated.toLocaleString()}`:r.program.assistance_pct?`${(r.program.assistance_pct*100).toFixed(1)}%`:'—';
          const typeCfg = TYPE_LABELS[r.program.program_type]||{label:r.program.program_type,color:'bg-gray-100 text-gray-700'};
          const sourceBadge = SOURCE_BADGES[r.program.source]||SOURCE_BADGES.default;
          const progAlerts = getEligibilityAlerts(r.program);
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex flex-wrap gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sourceBadge.bg}`}>{sourceBadge.label}</span>
              </div>
              <p className="text-xs font-bold text-gray-800">{r.program.program_name}</p>
              <p className="text-sm font-black text-gray-700">{dpa}</p>
              {progAlerts.length > 0 && (
                <p className="text-[10px] text-amber-600 font-semibold">⚠️ {progAlerts.length} req.</p>
              )}
              <button onClick={()=>onViewDetails(r)} className="text-[10px] text-[#1B3A6B] font-semibold hover:underline">View details →</button>
            </div>
          );
        })}
      </div>

      {/* CLTV */}
      {combo.combinedCLTV > 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500">Combined CLTV: <strong className="text-gray-700">{(combo.combinedCLTV*100).toFixed(1)}%</strong> — verify both programs allow this level of subordinate financing</p>
        </div>
      )}

      {/* LO Verification checklist */}
      {allAlerts.length > 0 && (
        <div className="border-t border-amber-100">
          <button onClick={()=>setShowAlerts(v=>!v)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors">
            <span>⚠️ LO Verification Checklist — {allAlerts.length} {allAlerts.length === 1 ? 'requirement' : 'requirements'} before presenting to borrower</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${showAlerts?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </button>
          {showAlerts && (
            <div className="px-4 pb-4 space-y-2 bg-amber-50">
              {allAlerts.map((al, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0">
                    <input type="checkbox" className="w-3.5 h-3.5 accent-amber-600 flex-shrink-0" id={`alert-${combo.id}-${i}`} />
                    <span className="text-sm">{al.icon}</span>
                  </div>
                  <label htmlFor={`alert-${combo.id}-${i}`} className="text-xs text-amber-800 cursor-pointer leading-relaxed">
                    <span className="font-semibold text-amber-900">{al.program}: </span>{al.text}
                  </label>
                </div>
              ))}
              <p className="text-[10px] text-amber-600 mt-2 pt-2 border-t border-amber-200">Check all boxes before sharing this stack combination with the borrower.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── STANDARD PROGRAM CARD ─────────────────────────────────────────────────────
function ProgramCard({ program, evaluation, haiku, haikusLoading, approvalState, lenderName, lenderId, onSelect, onRequestApproval, onShareWithAe, showFailDetail, onToggleFailDetail, brokerOnly }) {
  const cfg = STATUS_CONFIG[evaluation.status];
  const typeCfg = TYPE_LABELS[program.program_type]||{label:program.program_type,color:'bg-gray-100 text-gray-700'};
  const sourceBadge = SOURCE_BADGES[program.source]||SOURCE_BADGES.default;
  const freshness = getFreshnessLabel(program.last_verified_date);
  const isFail = evaluation.status==='FAIL';
  const dpaDisplay = evaluation.dpa_amount_calculated?`$${evaluation.dpa_amount_calculated.toLocaleString()}`:program.assistance_pct?`${(program.assistance_pct*100).toFixed(1)}% of price`:'—';
  return (
    <div className={`bg-white rounded-xl border ${isFail?'border-gray-200 opacity-70':cfg.border} shadow-sm overflow-hidden`}>
      <div className={`flex items-start justify-between gap-3 p-4 ${isFail?'':cfg.bg}`}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-gray-900">{program.program_name}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceBadge.bg}`}>{sourceBadge.label}</span>
              {!program.broker_eligible&&brokerOnly===false&&<span className="text-[10px] bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded">RETAIL ONLY</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
              <span className="text-[11px] text-gray-500">{program.admin_agency}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0"><p className="text-lg font-bold text-gray-900">{dpaDisplay}</p><p className="text-[11px] text-gray-400">DPA Amount</p></div>
      </div>
      {!isFail&&<div className="px-4 py-2 border-t border-gray-100 min-h-[2rem]">{haikusLoading&&!haiku?<div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mt-1"/>:haiku?<p className="text-xs text-gray-600 italic">{haiku}</p>:null}</div>}
      {!isFail&&evaluation.cltv_details&&<div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600"><span>CLTV: <strong>{(evaluation.cltv_details.cltv_with_dpa*100).toFixed(1)}%</strong></span><span>DPA: <strong>${(evaluation.cltv_details.dpa_amount||0).toLocaleString()}</strong></span><span className={`font-medium ${freshness.color==='green'?'text-emerald-600':freshness.color==='amber'?'text-amber-600':'text-red-500'}`}>{freshness.urgent?'⚠️ ':'✓ '}{freshness.label}</span></div>}
      {evaluation.warnings?.length>0&&<div className="px-4 py-2 bg-amber-50 border-t border-amber-100">{evaluation.warnings.map((w,i)=><p key={i} className="text-xs text-amber-700">⚠️ {w}</p>)}</div>}
      {isFail&&<div className="px-4 py-2 border-t border-gray-100"><button onClick={onToggleFailDetail} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><svg className={`w-3 h-3 transition-transform ${showFailDetail?'rotate-90':''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>{showFailDetail?'Hide':'Show'} ineligibility reason</button>{showFailDetail&&<div className="mt-1.5 space-y-1">{evaluation.fail_reasons?.map((r,i)=><p key={i} className="text-xs text-red-600">✗ {r}</p>)}</div>}</div>}
      <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <LenderApprovalBadge approvalState={approvalState} lenderName={lenderName} lenderId={lenderId} onShareWithAe={!isFail?onShareWithAe:null} />
          {!isFail&&lenderId&&approvalState==='unknown'&&<button onClick={onRequestApproval} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B3A6B] hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full px-2.5 py-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Request Approval</button>}
        </div>
        {!isFail&&<button onClick={onSelect} className="text-xs text-[#1B3A6B] hover:text-blue-800 font-semibold flex items-center gap-1">View Full Details <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg></button>}
      </div>
    </div>
  );
}

// ── LENDER APPROVAL BADGE ─────────────────────────────────────────────────────
function LenderApprovalBadge({ approvalState, lenderName, lenderId, onShareWithAe }) {
  if (!lenderId) return <span className="text-[11px] text-gray-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block"/>No lender selected</span>;
  const name = lenderName||'your lender';
  if (approvalState===APPROVAL_STATES.APPROVED) return <button onClick={onShareWithAe} className="group inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-400 rounded-full px-2.5 py-1 transition-colors"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>Approved — {name}</button>;
  if (approvalState===APPROVAL_STATES.REQUESTED) return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1"><svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Requested — {name}</span>;
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"/>Not Yet Approved — {name}</span>;
}

// ── PROGRAM DRAWER ────────────────────────────────────────────────────────────
function ProgramDrawer({ program, evaluation, haiku, approvalState, lenderName, onRequestApproval, onClose }) {
  const cfg = STATUS_CONFIG[evaluation.status];
  const typeCfg = TYPE_LABELS[program.program_type]||{label:program.program_type,color:'bg-gray-100 text-gray-700'};
  const sourceBadge = SOURCE_BADGES[program.source]||SOURCE_BADGES.default;
  const freshness = getFreshnessLabel(program.last_verified_date);
  const confidence = getConfidenceLabel(program.confidence_score);
  const dpaDisplay = evaluation.dpa_amount_calculated?`$${evaluation.dpa_amount_calculated.toLocaleString()}`:program.assistance_pct?`${(program.assistance_pct*100).toFixed(1)}% of purchase price`:'See program details';
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-[#1B3A6B] px-5 py-4 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceBadge.bg}`}>{sourceBadge.label}</span>
            </div>
            <h2 className="text-white font-bold text-base leading-snug">{program.program_name}</h2>
            <p className="text-blue-200 text-xs mt-0.5">{program.admin_agency}</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white mt-0.5 flex-shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {haiku&&<div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-xs font-semibold text-blue-700 mb-1">AI Summary</p><p className="text-sm text-blue-900 italic">{haiku}</p></div>}
          {program.source==='web_search'&&<div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs font-bold text-amber-700 mb-1">⚠️ Web Search Result</p><p className="text-xs text-amber-700">Verify program availability and eligibility directly with the administering agency before presenting to borrowers.</p></div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500 mb-0.5">DPA Amount</p><p className="text-xl font-bold text-gray-900">{dpaDisplay}</p></div>
            {evaluation.cltv_details&&<div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500 mb-0.5">CLTV with DPA</p><p className="text-xl font-bold text-gray-900">{(evaluation.cltv_details.cltv_with_dpa*100).toFixed(1)}%</p><p className="text-xs text-gray-400">Max: {(evaluation.cltv_details.program_max*100).toFixed(1)}%</p></div>}
          </div>
          <div><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Description</h4><p className="text-sm text-gray-700 leading-relaxed">{program.description}</p></div>
          <div><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Contact & Resources</h4>
            <div className="space-y-1.5">
              {program.website_url&&<a href={program.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[#1B3A6B] hover:text-blue-800 font-medium"><svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>Official Program Website ↗</a>}
              {program.contact_phone&&<p className="text-sm text-gray-700"><span className="text-gray-400">Phone: </span><a href={`tel:${program.contact_phone}`} className="text-[#1B3A6B] font-medium">{program.contact_phone}</a></p>}
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${freshness.color==='green'?'bg-emerald-400':freshness.color==='amber'?'bg-amber-400':'bg-red-400'}`}/>
            <div><p className="text-xs font-semibold text-gray-700">{freshness.label}</p><p className="text-xs text-gray-400">Source: {program.source} · Confidence: {confidence.label}</p></div>
          </div>
          <div><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Eligibility Trace</h4>
            <div className="space-y-2">{evaluation.steps?.map(step=>(
              <div key={step.step} className="flex gap-3 text-xs">
                <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${step.pass===true?'bg-emerald-100 text-emerald-700':step.pass===false?'bg-red-100 text-red-600':'bg-amber-100 text-amber-700'}`}>{step.pass===true?'✓':step.pass===false?'✗':'!'}</div>
                <div><p className="font-semibold text-gray-700">Step {step.step}: {step.name}</p><p className="text-gray-500">{step.reason}</p></div>
              </div>
            ))}</div>
          </div>
          {evaluation.warnings?.length>0&&<div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1"><p className="text-xs font-semibold text-amber-700">Warnings</p>{evaluation.warnings.map((w,i)=><p key={i} className="text-xs text-amber-700">⚠️ {w}</p>)}</div>}
          <div><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Lender Approval</h4>
            <div className="flex items-center gap-3 flex-wrap">
              <LenderApprovalBadge approvalState={approvalState} lenderName={lenderName} lenderId="mock"/>
              {approvalState===APPROVAL_STATES.UNKNOWN&&<button onClick={onRequestApproval} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1B3A6B] hover:bg-blue-800 rounded-lg px-3 py-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Request Approval via AE</button>}
            </div>
          </div>
          {program.stacking_rules?.subordinate_financing_rules&&<div><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Stacking Rules</h4><p className="text-xs text-gray-600">{program.stacking_rules.subordinate_financing_rules}</p>{program.stacking_rules.mi_impact_rules&&<p className="text-xs text-gray-500 mt-1">MI: {program.stacking_rules.mi_impact_rules}</p>}</div>}
        </div>
      </div>
    </div>
  );
}
