// src/modules/ARMStructureIntelligence.jsx
// LoanBeacons™ — Module 17 | Stage 2: Lender Fit
// ARM Structure Intelligence™ — Caps · Payment Scenarios · Qualifying · Disclosure

import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';

// ─── Math helpers ────────────────────────────────────────────────────────────
function calcPI(bal, annRate, termMo) {
  if (!bal || !annRate || !termMo) return 0;
  const r = annRate / 100 / 12;
  if (r === 0) return bal / termMo;
  return (bal * r * Math.pow(1+r, termMo)) / (Math.pow(1+r, termMo) - 1);
}
function roundToEighth(n) { return Math.round(n * 8) / 8; }
const f$ = n => (isNaN(n)||!isFinite(n)) ? "$—" : "$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fp = (n,d=3) => isNaN(n) ? "—%" : Number(n).toFixed(d)+"%";
const fmo = n => isNaN(n)||!isFinite(n) ? "—" : Math.round(n)+" mo";

// ─── Constants ───────────────────────────────────────────────────────────────
const STEPS = ["ARM Profile","Caps Structure","Current Position","Payment Stress Test","Qualifying Analysis","ARM vs. Fixed","Results & Disclosure"];

const INDEXES = [
  { id:"sofr30",  label:"SOFR 30-Day Average",         note:"Current standard for new ARMs since LIBOR phase-out" },
  { id:"sofr6m",  label:"SOFR 6-Month Average",        note:"Less common; used by some lenders" },
  { id:"cmt1yr",  label:"1-Year CMT (Treasury)",       note:"Constant Maturity Treasury — common on legacy ARMs" },
  { id:"cmt6mo",  label:"6-Month CMT (Treasury)",      note:"Used on 6-month adjustment ARMs" },
  { id:"libor",   label:"LIBOR (Legacy — Existing Loans Only)", note:"No new LIBOR ARMs — existing loans only" },
  { id:"other",   label:"Other / Lender-Specific Index",note:"Enter current value manually" },
];

const CAP_PRESETS = [
  { label:"2/2/5", init:2, periodic:2, lifetime:5, note:"Most common — Fannie/Freddie standard" },
  { label:"2/1/5", init:2, periodic:1, lifetime:5, note:"Common on 5/1 ARMs with tighter periodic cap" },
  { label:"5/2/5", init:5, periodic:2, lifetime:5, note:"Common on 7/1 and 10/1 ARMs (large initial room)" },
  { label:"1/1/5", init:1, periodic:1, lifetime:5, note:"Very tight caps — rare, favorable to borrower" },
  { label:"Custom",init:null,periodic:null,lifetime:null,note:"Enter cap values manually" },
];

const FIXED_PERIODS = [
  { value:"3", label:"3/1 ARM", years:3, note:"3-year fixed, then adjusts annually" },
  { value:"5", label:"5/1 ARM", years:5, note:"5-year fixed, then adjusts annually" },
  { value:"7", label:"7/1 ARM", years:7, note:"7-year fixed, then adjusts annually" },
  { value:"10",label:"10/1 ARM",years:10,note:"10-year fixed, then adjusts annually" },
];

// Qualifying rate rules by program
function getQualifyingRate(startRate, fullyIndexed, fixedYears, program) {
  const fi = fullyIndexed;
  switch(program) {
    case "conventional":
      if (fixedYears >= 7) return { rate: startRate, rule: "Note rate (initial fixed period ≥ 7 years)", source: "Fannie Mae SEL 2023-08 / B3-5.1-01" };
      return { rate: Math.max(startRate, fi), rule: "Higher of note rate or fully-indexed rate (initial fixed < 7 years)", source: "Fannie Mae B3-5.1-01" };
    case "fha":
      return { rate: Math.max(startRate, fi), rule: "Higher of note rate or fully-indexed rate", source: "HUD Handbook 4000.1 §II.A.4.c" };
    case "va":
      return { rate: Math.max(startRate, fi), rule: "Higher of note rate or fully-indexed rate", source: "VA Lender's Handbook Ch. 4" };
    case "usda":
      return { rate: Math.max(startRate, fi), rule: "Higher of note rate or fully-indexed rate", source: "USDA HB-1-3555 Ch. 11" };
    default:
      return { rate: Math.max(startRate, fi), rule: "Higher of note rate or fully-indexed rate", source: "Agency guidelines" };
  }
}

// ─── Scenario engine ─────────────────────────────────────────────────────────
function buildScenario(startRate, initCap, periodicCap, lifetimeCap, margin, indexPath, fixedYrs, loanBal, termMo, fixedPeriodMo) {
  const ceiling = startRate + lifetimeCap;
  const floor = margin;
  const results = [];
  results.push({ year: 0, label: "Now (Fixed)", rate: startRate, payment: calcPI(loanBal, startRate, termMo), adjNum: 0, isFixed: true });
  let currentRate = startRate;
  let adjNum = 0;
  let remainingMo = termMo - fixedPeriodMo;
  for (let yr = 1; yr <= Math.min(10, Math.floor(remainingMo / 12)); yr++) {
    adjNum++;
    const targetIndex = indexPath[yr - 1] ?? indexPath[indexPath.length - 1];
    const targetFI = targetIndex + margin;
    let newRate;
    if (adjNum === 1) {
      const maxUp = currentRate + initCap;
      const maxDown = currentRate - initCap;
      newRate = Math.min(maxUp, Math.max(maxDown, targetFI));
    } else {
      const maxUp = currentRate + periodicCap;
      const maxDown = currentRate - periodicCap;
      newRate = Math.min(maxUp, Math.max(maxDown, targetFI));
    }
    newRate = Math.min(ceiling, Math.max(floor, newRate));
    newRate = roundToEighth(newRate);
    const moRemaining = Math.max(1, remainingMo - ((adjNum - 1) * 12));
    const payment = calcPI(loanBal, newRate, moRemaining);
    const basePayment = calcPI(loanBal, startRate, termMo);
    const delta = payment - basePayment;
    const deltaPct = basePayment > 0 ? (delta / basePayment) * 100 : 0;
    results.push({ year: yr, label: `Year ${yr + fixedYrs}`, rate: newRate, payment, delta, deltaPct, adjNum });
    currentRate = newRate;
  }
  return results;
}

// ─── Risk color helper ────────────────────────────────────────────────────────
function riskColor(pctIncrease) {
  if (pctIncrease <= 0) return { bg:"bg-green-900/20", border:"border-green-700/40", text:"text-green-300", label:"Stable" };
  if (pctIncrease < 10) return { bg:"bg-yellow-900/20", border:"border-yellow-700/40", text:"text-yellow-300", label:"Low Risk" };
  if (pctIncrease < 20) return { bg:"bg-orange-900/20", border:"border-orange-700/40", text:"text-orange-300", label:"Moderate Risk" };
  if (pctIncrease < 35) return { bg:"bg-red-900/20", border:"border-red-700/40", text:"text-red-300", label:"High Risk" };
  return { bg:"bg-red-950/40", border:"border-red-600", text:"text-red-300", label:"⚠️ Severe Risk" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ProgressBar({cur}) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-2">
        {STEPS.map((s,i)=>(
          <div key={i} className="flex flex-col items-center" style={{width:`${100/STEPS.length}%`}}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
              ${i<cur?"bg-orange-600 border-orange-600 text-white":i===cur?"bg-slate-800 border-orange-400 text-orange-200":"bg-slate-800 border-slate-600 text-slate-500"}`}>
              {i<cur?"✓":i+1}
            </div>
            <span className={`text-xs mt-1 text-center leading-tight hidden xl:block ${i===cur?"text-orange-300 font-semibold":"text-slate-500"}`}>{s}</span>
          </div>
        ))}
      </div>
      <div className="relative h-1.5 bg-slate-700 rounded-full">
        <div className="absolute h-1.5 rounded-full transition-all duration-500"
          style={{width:`${(cur/(STEPS.length-1))*100}%`, background:"linear-gradient(90deg,#ea580c,#f97316)"}}/>
      </div>
    </div>
  );
}

function Card({icon,title,subtitle,badge,children}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-4 shadow-xl">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-900/40 border border-orange-700/40 flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {badge&&<span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-900/50 border border-orange-700/50 text-orange-300 uppercase tracking-wider">{badge}</span>}
          </div>
          {subtitle&&<p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Tip({text}) {
  const [s,set]=useState(false);
  return (
    <span className="relative inline-block ml-1">
      <span onMouseEnter={()=>set(true)} onMouseLeave={()=>set(false)} className="cursor-help text-orange-400 text-xs border border-orange-700/60 rounded-full w-4 h-4 inline-flex items-center justify-center">?</span>
      {s&&<div className="absolute z-50 bottom-6 left-0 w-72 bg-slate-900 border border-orange-700/60 rounded-lg p-3 text-xs text-slate-300 shadow-2xl leading-relaxed">{text}</div>}
    </span>
  );
}

function Nav({onBack,onNext,label,disabled}) {
  return (
    <div className="flex justify-between mt-6">
      {onBack?<button onClick={onBack} className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300">← Back</button>:<div/>}
      <button onClick={onNext} disabled={disabled}
        className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${disabled?"bg-slate-700 text-slate-500 cursor-not-allowed":"bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/40"}`}>
        {label||"Continue →"}
      </button>
    </div>
  );
}

function Stat({label,value,sub,color="slate"}) {
  const c={
    green:"bg-green-900/20 border-green-700/50 text-green-300",
    red:"bg-red-900/20 border-red-700/50 text-red-300",
    orange:"bg-orange-900/20 border-orange-700/50 text-orange-300",
    yellow:"bg-yellow-900/20 border-yellow-700/50 text-yellow-300",
    blue:"bg-blue-900/20 border-blue-700/50 text-blue-300",
    slate:"bg-slate-700/40 border-slate-600/50 text-slate-200",
  };
  return (
    <div className={`rounded-xl p-4 border text-center ${c[color]}`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${c[color].split(" ")[2]}`}>{value}</p>
      {sub&&<p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function FInput({label,tip,value,onChange,placeholder,prefix,suffix,className=""}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}{tip&&<Tip text={tip}/>}</label>
      <div className="relative">
        {prefix&&<span className="absolute left-3 top-2.5 text-slate-400 text-sm pointer-events-none">{prefix}</span>}
        <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-slate-700 border border-slate-600 rounded-lg py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 ${prefix?"pl-6 pr-3":"pl-3"} ${suffix?"pr-8":"pr-3"}`}/>
        {suffix&&<span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ARMStructureIntelligence() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const scenarioId = sp.get("scenarioId");

  // ── Scenario picker state (no scenarioId) ──────────────────────────────────
  const [scenarios, setScenarios] = useState([]);
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState(null);
  const [savedRecordId, setSavedRecordId] = useState(null);

  // Step 1 — ARM Profile
  const [profile, setProfile] = useState({
    loanAmount: "", termYears: "30", originationDate: "",
    fixedPeriod: "5", adjFrequency: "12",
    startRate: "", indexType: "", currentIndex: "", margin: "",
  });

  // Step 2 — Caps
  const [caps, setCaps] = useState({ preset: "", initial: "", periodic: "", lifetime: "" });

  // Step 3 — Current Position
  const [position, setPosition] = useState({ firstAdjDate: "", remainingBalance: "", borrowerIncome: "" });

  // Step 5 — Qualifying
  const [qualify, setQualify] = useState({ program: "conventional", monthlyDebts: "" });

  // Step 6 — ARM vs Fixed
  const [vsFixed, setVsFixed] = useState({ fixedRate: "" });

  // Decision Record
  const { reportFindings } = useDecisionRecord(scenarioId);

  // ── localStorage autosave ─────────────────────────────────────────────────
  const lsKey = scenarioId ? `lb_arm_${scenarioId}` : null;

  useEffect(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({ profile, caps, position, qualify, vsFixed, step }));
  }, [lsKey, profile, caps, position, qualify, vsFixed, step]);

  // ── Scenario picker loader ────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      setLoadingList(true);
      getDocs(collection(db, 'scenarios'))
        .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(console.error)
        .finally(() => setLoadingList(false));
    }
  }, [scenarioId]);

  // ── Firestore load + localStorage restore ─────────────────────────────────
  useEffect(() => {
    if (!scenarioId) return;
    // Restore localStorage first
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.profile)   setProfile(p => ({ ...p, ...saved.profile }));
          if (saved.caps)      setCaps(saved.caps);
          if (saved.position)  setPosition(saved.position);
          if (saved.qualify)   setQualify(saved.qualify);
          if (saved.vsFixed)   setVsFixed(saved.vsFixed);
          if (saved.step !== undefined) setStep(saved.step);
        }
      } catch (_) {}
    }
    // Then hydrate from Firestore
    (async () => {
      try {
        const snap = await getDoc(doc(db, "scenarios", scenarioId));
        if (snap.exists()) {
          const d = snap.data();
          setScenario(d);
          setProfile(p => ({
            ...p,
            loanAmount:  p.loanAmount  || String(d.loanAmount  || ""),
            startRate:   p.startRate   || String(d.interestRate || ""),
            termYears:   p.termYears   || String(d.loanTerm    || "30"),
          }));
        }
      } catch (e) { console.error(e); }
    })();
  }, [scenarioId]);

  // ─── DERIVED CALCULATIONS ─────────────────────────────────────────────────
  const loanBal     = parseFloat(position.remainingBalance) || parseFloat(profile.loanAmount) || 0;
  const startRate   = parseFloat(profile.startRate) || 0;
  const indexVal    = parseFloat(profile.currentIndex) || 0;
  const margin      = parseFloat(profile.margin) || 0;
  const termMo      = (parseInt(profile.termYears) || 30) * 12;
  const fixedYrs    = parseInt(profile.fixedPeriod) || 5;
  const fixedPeriodMo = fixedYrs * 12;

  const initCap      = parseFloat(caps.initial) || 0;
  const periodicCap  = parseFloat(caps.periodic) || 0;
  const lifetimeCap  = parseFloat(caps.lifetime) || 0;

  const fullyIndexed   = roundToEighth(indexVal + margin);
  const rateCeiling    = startRate + lifetimeCap;
  const rateFloor      = margin;
  const currentPayment = calcPI(loanBal, startRate, termMo);
  const fiPayment      = calcPI(loanBal, fullyIndexed, termMo);
  const ceilingPayment = calcPI(loanBal, rateCeiling, termMo);

  const paymentShock = fullyIndexed > startRate;
  const shockAmount  = fiPayment - currentPayment;
  const shockPct     = currentPayment > 0 ? (shockAmount / currentPayment) * 100 : 0;

  const firstAdjDate = position.firstAdjDate
    ? new Date(position.firstAdjDate + "T00:00:00")
    : (() => {
        if (!profile.originationDate) return null;
        const d = new Date(profile.originationDate + "T00:00:00");
        d.setFullYear(d.getFullYear() + fixedYrs);
        return d;
      })();
  const moUntilAdj = firstAdjDate
    ? Math.max(0, Math.round((firstAdjDate - new Date()) / (1000 * 60 * 60 * 24 * 30.44)))
    : null;

  // Build three scenarios
  const flatIndex    = Array(10).fill(indexVal);
  const gradualIndex = Array(10).fill(0).map((_,i) => indexVal + (i+1)*0.25);
  const worstIndex   = Array(10).fill(999);

  const scenFlat    = buildScenario(startRate, initCap, periodicCap, lifetimeCap, margin, flatIndex,    fixedYrs, loanBal, termMo, fixedPeriodMo);
  const scenGradual = buildScenario(startRate, initCap, periodicCap, lifetimeCap, margin, gradualIndex, fixedYrs, loanBal, termMo, fixedPeriodMo);
  const scenWorst   = buildScenario(startRate, initCap, periodicCap, lifetimeCap, margin, worstIndex,   fixedYrs, loanBal, termMo, fixedPeriodMo);

  // Qualifying
  const qualInfo    = getQualifyingRate(startRate, fullyIndexed, fixedYrs, qualify.program);
  const qualPayment = calcPI(loanBal, qualInfo.rate, termMo);
  const borrowerIncome = parseFloat(position.borrowerIncome) || 0;
  const monthlyDebts   = parseFloat(qualify.monthlyDebts) || 0;
  const qualDTI        = borrowerIncome > 0 ? ((qualPayment + monthlyDebts) / borrowerIncome) * 100 : null;
  const worstDTI       = borrowerIncome > 0 ? ((ceilingPayment + monthlyDebts) / borrowerIncome) * 100 : null;

  // ARM vs Fixed
  const fixedRateComp = parseFloat(vsFixed.fixedRate) || 0;
  const fixedPayment  = calcPI(loanBal, fixedRateComp, 360);
  const fixedPeriodSavings = fixedRateComp > 0 ? (fixedPayment - currentPayment) * fixedPeriodMo : 0;

  const capsSet      = initCap > 0 && periodicCap > 0 && lifetimeCap > 0;
  const profileReady = loanBal > 0 && startRate > 0 && indexVal > 0 && margin > 0;

  // ─── Decision Record save ─────────────────────────────────────────────────
  const save = async () => {
    if (!scenarioId || scenarioId === 'standalone') return;
    try {
      const flags = [];
      if (paymentShock) flags.push({ flagCode: 'PAYMENT_SHOCK', sourceModule: 'ARM_STRUCTURE', severity: 'HIGH', detail: `+${fp(shockPct,1)} payment increase at fully-indexed rate` });
      if (moUntilAdj !== null && moUntilAdj <= 12 && moUntilAdj > 0) flags.push({ flagCode: 'ADJUSTMENT_IMMINENT', sourceModule: 'ARM_STRUCTURE', severity: 'MEDIUM', detail: `First adjustment in ${moUntilAdj} months` });
      if (qualDTI !== null && qualDTI > 50) flags.push({ flagCode: 'QUAL_DTI_HIGH', sourceModule: 'ARM_STRUCTURE', severity: 'HIGH', detail: `Qualifying DTI ${fp(qualDTI,1)} exceeds 50%` });
      if (worstDTI !== null && worstDTI > 60) flags.push({ flagCode: 'WORST_DTI_HIGH', sourceModule: 'ARM_STRUCTURE', severity: 'MEDIUM', detail: `Worst-case DTI ${fp(worstDTI,1)} at rate ceiling` });

      const findings = {
        verdict: flags.some(f => f.severity === 'HIGH') ? 'NEEDS_REVIEW' : 'ACCEPTABLE',
        summary: `ARM Structure — ${FIXED_PERIODS.find(f=>f.value===profile.fixedPeriod)?.label||'ARM'} · Start: ${fp(startRate)} · FIR: ${fp(fullyIndexed)} · Ceiling: ${fp(rateCeiling)} · Caps: ${initCap}/${periodicCap}/${lifetimeCap}${paymentShock?' · ⚠️ Payment shock':''}`,
        loanAmount: loanBal, startRate, indexType: profile.indexType, currentIndex: indexVal, margin,
        fullyIndexed, rateCeiling, rateFloor, initCap, periodicCap, lifetimeCap, fixedYrs,
        paymentShock, shockAmount: parseFloat(shockAmount.toFixed(2)), shockPct: parseFloat(shockPct.toFixed(1)),
        qualProgram: qualify.program, qualRate: qualInfo.rate, qualDTI, worstDTI, fixedRateComp,
        source: 'Fannie Mae B3-5.1-01 | HUD 4000.1 | VA Lenders Handbook',
      };

      const writtenId = await reportFindings('ARM_STRUCTURE', findings, [], flags, '1.0.0');
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
  };

  // ─── SCENARIO PICKER (no scenarioId) ─────────────────────────────────────
  if (!scenarioId) {
    const q = scenarioSearch.toLowerCase().trim();
    const sorted = [...scenarios].sort((a,b) => (b.updatedAt?.seconds||b.createdAt?.seconds||0) - (a.updatedAt?.seconds||a.createdAt?.seconds||0));
    const filtered = q ? sorted.filter(s => (s.scenarioName||`${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0,5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-orange-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-orange-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-orange-900/40">17</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-orange-400 uppercase">Stage 2 — Lender Fit</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">ARM Structure Intelligence™</h1>
              </div>
            </div>
            <p className="text-orange-200 text-sm leading-relaxed mb-5">Analyze adjustable rate mortgages: caps structure, payment stress scenarios, qualifying rate by program, ARM vs. fixed comparison, and borrower ARM disclosure.</p>
            <div className="flex flex-wrap gap-2">
              {['Caps Analysis','Payment Shock','Qualifying Rate','ARM vs. Fixed','Stress Test','Borrower Disclosure'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-orange-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Select a Scenario</h2>
          <p className="text-slate-500 text-sm mb-5">Choose a scenario to link ARM analysis, or run standalone without linking.</p>
          <input
            type="text" value={scenarioSearch} onChange={e=>setScenarioSearch(e.target.value)}
            placeholder="Search by name or scenario…"
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          {loadingList ? (
            <div className="text-center py-10 text-slate-400 text-sm">Loading scenarios…</div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No scenarios found.</div>
          ) : (
            <div className="space-y-3">
              {displayed.map(s => (
                <button key={s.id} onClick={() => navigate(`?scenarioId=${s.id}`)}
                  className="w-full text-left bg-white border border-slate-200 hover:border-orange-400 rounded-2xl px-5 py-4 shadow-sm transition-all group">
                  <div className="font-bold text-slate-800 group-hover:text-orange-700">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario'}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.streetAddress || s.city || 'No address'} · {s.loanType || 'Loan type —'} · {s.loanAmount ? '$'+Number(s.loanAmount).toLocaleString() : '—'}</div>
                </button>
              ))}
              {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-sm text-orange-600 hover:text-orange-700 py-2 font-semibold">Show all {filtered.length} scenarios ↓</button>}
            </div>
          )}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <button onClick={() => navigate('?scenarioId=standalone')}
              className="w-full py-3 rounded-2xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">
              Run Standalone (No Scenario Linked)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;600;700&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
        .pill{cursor:pointer;padding:7px 16px;border-radius:9999px;border:1.5px solid;font-size:.82rem;font-weight:600;transition:all .2s;}
        @media print{body *{visibility:hidden!important;}#armprint,#armprint *{visibility:visible!important;}#armprint{position:fixed;top:0;left:0;width:100%;background:white!important;color:black!important;padding:36px;box-sizing:border-box;}.no-print{display:none!important;}}
      `}</style>

      {/* DECISION RECORD BANNER */}
      {scenarioId && scenarioId !== 'standalone' && (
        <DecisionRecordBanner
          recordId={savedRecordId}
          moduleName="ARM Structure Intelligence™"
          moduleKey="ARM_STRUCTURE"
          onSave={save}
        />
      )}
      <ModuleNav moduleNumber={17} />

      {/* HEADER */}
      <div className="no-print" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1c1008 50%, #0f172a 100%)", borderBottom: "1px solid rgba(234,88,12,.25)" }}>
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <span className="text-xs font-bold text-orange-400 tracking-widest uppercase">LoanBeacons™</span>
              <h1 className="text-2xl font-bold text-white mt-1">📐 ARM Structure Intelligence™</h1>
              <p className="text-slate-400 text-sm mt-0.5">Adjustable Rate Mortgage Analysis · Caps · Payment Scenarios · Qualifying · Disclosure</p>
            </div>
            {scenario && scenarioId !== 'standalone' && (
              <ScenarioHeader scenario={scenario} moduleNumber={17} />
            )}
            {(!scenario || scenarioId === 'standalone') && (
              <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-2 text-xs text-yellow-400">No scenario linked — standalone mode</div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 no-print">
        <ProgressBar cur={step} />

        {/* ═══ STEP 1 — ARM PROFILE ═════════════════════════════════════════ */}
        {step === 0 && (
          <Card icon="📐" title="Step 1 — ARM Profile" subtitle="Enter the loan fundamentals and index details. This defines the ARM's identity and drives all downstream calculations.">
            <p className="text-sm font-bold text-slate-300 mb-4">Loan Details</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <FInput label="Loan Amount" tip="Current outstanding principal balance, or original loan amount if not yet originated." prefix="$" value={profile.loanAmount} onChange={v=>setProfile(p=>({...p,loanAmount:v}))} placeholder="e.g. 325000"/>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Loan Term</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-600">
                  {[["30","30-Year"],["15","15-Year"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setProfile(p=>({...p,termYears:v}))} className={`flex-1 py-2.5 text-sm font-semibold transition-all ${profile.termYears===v?"bg-orange-700 text-white":"bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Origination Date <Tip text="Original closing date. Used to auto-calculate the first adjustment date."/></label>
                <input type="date" value={profile.originationDate} onChange={e=>setProfile(p=>({...p,originationDate:e.target.value}))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"/>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-5 mb-5">
              <p className="text-sm font-bold text-slate-300 mb-4">ARM Structure</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Initial Fixed Period</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {FIXED_PERIODS.map(fp => (
                  <label key={fp.value} onClick={()=>setProfile(p=>({...p,fixedPeriod:fp.value}))} className={`block cursor-pointer p-3 rounded-xl border transition-all text-center ${profile.fixedPeriod===fp.value?"bg-orange-900/30 border-orange-500":"bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                    <input type="radio" className="hidden" checked={profile.fixedPeriod===fp.value} onChange={()=>setProfile(p=>({...p,fixedPeriod:fp.value}))}/>
                    <p className="font-bold text-white text-sm">{fp.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{fp.note}</p>
                  </label>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Adjustment Frequency (after fixed period)</p>
                <div className="flex gap-3 flex-wrap">
                  {[["12","Every 12 Months (Annual)"],["6","Every 6 Months"]].map(([v,l])=>(
                    <label key={v} className={`pill ${profile.adjFrequency===v?"bg-orange-800 border-orange-500 text-orange-200":"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                      <input type="radio" className="hidden" onChange={()=>setProfile(p=>({...p,adjFrequency:v}))}/>{l}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-5">
              <p className="text-sm font-bold text-slate-300 mb-4">Rate Components</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <FInput label="Start Rate (Note Rate)" tip="The initial interest rate locked in at origination. This is what the borrower pays during the fixed period." suffix="%" value={profile.startRate} onChange={v=>setProfile(p=>({...p,startRate:v}))} placeholder="e.g. 6.500"/>
                <FInput label="Current Index Value" tip="Today's published value for this ARM's index. Check the index's official source (e.g. the NY Fed for SOFR, the Treasury for CMT)." suffix="%" value={profile.currentIndex} onChange={v=>setProfile(p=>({...p,currentIndex:v}))} placeholder="e.g. 4.820"/>
                <FInput label="Margin" tip="The fixed spread added to the index to determine the fully-indexed rate. Set at origination and never changes. Typically 2.00–3.00% on SOFR ARMs." suffix="%" value={profile.margin} onChange={v=>setProfile(p=>({...p,margin:v}))} placeholder="e.g. 2.750"/>
              </div>

              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Index Type</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {INDEXES.map(idx => (
                  <label key={idx.id} className={`block cursor-pointer p-3 rounded-xl border transition-all ${profile.indexType===idx.id?"bg-orange-900/30 border-orange-500":"bg-slate-700/30 border-slate-600 hover:border-slate-500"}`}>
                    <input type="radio" className="hidden" checked={profile.indexType===idx.id} onChange={()=>setProfile(p=>({...p,indexType:idx.id}))}/>
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${profile.indexType===idx.id?"border-orange-400":"border-slate-500"}`}>{profile.indexType===idx.id&&<div className="w-1.5 h-1.5 rounded-full bg-orange-400"/>}</div>
                      <div><p className="font-semibold text-white text-sm">{idx.label}</p><p className="text-xs text-slate-400">{idx.note}</p></div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Live FIR preview */}
              {startRate > 0 && indexVal > 0 && margin > 0 && (
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-600">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Live Rate Preview</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400 mb-1">Current Rate (Fixed)</p><p className="text-xl font-bold font-mono text-white">{fp(startRate)}</p></div>
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400 mb-1">Index + Margin</p><p className="text-sm font-mono text-slate-300">{fp(indexVal)} + {fp(margin)}</p><p className="text-xs text-orange-400">=</p></div>
                    <div className={`rounded-lg p-3 border ${fullyIndexed > startRate ? "bg-red-900/20 border-red-700/40" : "bg-green-900/20 border-green-700/40"}`}>
                      <p className="text-xs text-slate-400 mb-1">Fully-Indexed Rate</p>
                      <p className={`text-xl font-bold font-mono ${fullyIndexed > startRate ? "text-red-300" : "text-green-300"}`}>{fp(fullyIndexed)}</p>
                      <p className={`text-xs mt-0.5 ${fullyIndexed > startRate ? "text-red-500" : "text-green-500"}`}>{fullyIndexed > startRate ? `▲ +${fp(fullyIndexed - startRate)} above current` : `▼ ${fp(startRate - fullyIndexed)} below current`}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Nav onNext={()=>setStep(1)} label={profileReady ? "Profile Complete — Continue →" : "Complete All Fields First"} disabled={!profileReady}/>
          </Card>
        )}

        {/* ═══ STEP 2 — CAPS STRUCTURE ═════════════════════════════════════ */}
        {step === 1 && (
          <Card icon="🔒" title="Step 2 — Caps Structure" subtitle="Caps are contractual limits on how far the rate can move. Three caps govern every ARM adjustment for the life of the loan.">
            <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-5 mb-6 text-sm text-orange-200 space-y-2">
              <p><strong className="text-orange-300">Initial Cap:</strong> Maximum rate change at the very first adjustment. Only applies once.</p>
              <p><strong className="text-orange-300">Periodic Cap:</strong> Maximum rate change at every adjustment after the first. Applies each time the rate resets.</p>
              <p><strong className="text-orange-300">Lifetime Cap:</strong> Maximum total rate increase over the life of the loan from the start rate. The rate can never exceed Start Rate + Lifetime Cap.</p>
              <p className="text-xs text-slate-400">Example: A 5/1 ARM at 6.50% with 2/2/5 caps → first adj max 8.50%, then max 2% per year, never above 11.50% (6.50% + 5.00%).</p>
            </div>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Select a Common Cap Structure</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {CAP_PRESETS.map(preset => (
                <label key={preset.label} className={`block cursor-pointer p-3 rounded-xl border transition-all text-center ${caps.preset===preset.label?"bg-orange-900/30 border-orange-500":"bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                  <input type="radio" className="hidden" checked={caps.preset===preset.label} onChange={()=>{
                    setCaps({ preset:preset.label, initial:preset.init!==null?String(preset.init):"", periodic:preset.periodic!==null?String(preset.periodic):"", lifetime:preset.lifetime!==null?String(preset.lifetime):"" });
                  }}/>
                  <p className="font-bold text-white text-sm font-mono">{preset.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-tight">{preset.note}</p>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Initial Adjustment Cap <Tip text="Maximum % the rate can change at the FIRST adjustment only."/></label>
                <div className="relative">
                  <input type="number" value={caps.initial} onChange={e=>setCaps(c=>({...c,initial:e.target.value,preset:"Custom"}))} placeholder="e.g. 2" className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-3 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"/>
                  <span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Periodic Cap (each subsequent adj) <Tip text="Maximum % the rate can change at every adjustment AFTER the first."/></label>
                <div className="relative">
                  <input type="number" value={caps.periodic} onChange={e=>setCaps(c=>({...c,periodic:e.target.value,preset:"Custom"}))} placeholder="e.g. 2" className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-3 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"/>
                  <span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Lifetime Cap (total from start rate) <Tip text="The rate can NEVER increase more than this % above the original start rate."/></label>
                <div className="relative">
                  <input type="number" value={caps.lifetime} onChange={e=>setCaps(c=>({...c,lifetime:e.target.value,preset:"Custom"}))} placeholder="e.g. 5" className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-3 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"/>
                  <span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">%</span>
                </div>
              </div>
            </div>

            {capsSet && startRate > 0 && (
              <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-600">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Rate Boundary Map</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <Stat label="Start Rate" value={fp(startRate)} color="slate"/>
                  <Stat label="1st Adj Max" value={fp(Math.min(startRate + initCap, rateCeiling))} sub={`+${fp(initCap)} max`} color="yellow"/>
                  <Stat label="Per-Adj Max Move" value={`±${fp(periodicCap)}`} sub="each year after" color="orange"/>
                  <Stat label="Lifetime Ceiling" value={fp(rateCeiling)} sub={`+${fp(lifetimeCap)} from start`} color="red"/>
                </div>
                {loanBal > 0 && (
                  <div className="grid grid-cols-2 gap-3 text-center mt-3">
                    <div className="bg-slate-800/60 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">Current P&I Payment</p>
                      <p className="text-lg font-bold font-mono text-slate-200">{f$(currentPayment)}/mo</p>
                    </div>
                    <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">Payment at Lifetime Ceiling</p>
                      <p className="text-lg font-bold font-mono text-red-300">{f$(ceilingPayment)}/mo</p>
                      <p className="text-xs text-red-500 mt-0.5">+{f$(ceilingPayment - currentPayment)}/mo worst case</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <Nav onBack={()=>setStep(0)} onNext={()=>setStep(2)} label={capsSet?"Caps Confirmed — Continue →":"Enter All Three Caps First"} disabled={!capsSet}/>
          </Card>
        )}

        {/* ═══ STEP 3 — CURRENT POSITION ═══════════════════════════════════ */}
        {step === 2 && (
          <Card icon="📍" title="Step 3 — Current Position" subtitle="Where is this ARM today? Establishes timing, payment shock exposure, and sets the stage for the stress test.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  First Adjustment Date <Tip text="When the rate adjusts for the first time. Auto-calculated from origination date + fixed period, but override if you know the exact date from the Note."/>
                </label>
                <input type="date"
                  value={position.firstAdjDate || (profile.originationDate && fixedYrs ? (() => { const d=new Date(profile.originationDate+"T00:00:00"); d.setFullYear(d.getFullYear()+fixedYrs); return d.toISOString().split("T")[0]; })() : "")}
                  onChange={e=>setPosition(p=>({...p,firstAdjDate:e.target.value}))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"/>
              </div>
              <FInput label="Current Remaining Balance" tip="The current outstanding principal balance. Defaults to original loan amount if blank." prefix="$" value={position.remainingBalance} onChange={v=>setPosition(p=>({...p,remainingBalance:v}))} placeholder={profile.loanAmount||"e.g. 314000"}/>
              <FInput label="Borrower Gross Monthly Income" tip="Used for DTI analysis in the Qualifying step. Optional — skip if not needed." prefix="$" value={position.borrowerIncome} onChange={v=>setPosition(p=>({...p,borrowerIncome:v}))} placeholder="e.g. 9500"/>
            </div>

            {startRate > 0 && indexVal > 0 && margin > 0 && (
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-600">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Adjustment Timing</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <Stat label="Fixed Period" value={`${fixedYrs} Years`} sub={`${FIXED_PERIODS.find(f=>f.value===profile.fixedPeriod)?.label||""}`} color="slate"/>
                    <Stat label="Months Until 1st Adj"
                      value={moUntilAdj !== null ? (moUntilAdj === 0 ? "Now / Past" : fmo(moUntilAdj)) : "—"}
                      sub={firstAdjDate ? firstAdjDate.toLocaleDateString("en-US",{month:"short",year:"numeric"}) : "Enter date"}
                      color={moUntilAdj !== null && moUntilAdj <= 6 ? "red" : moUntilAdj !== null && moUntilAdj <= 18 ? "yellow" : "slate"}/>
                    <Stat label="Adj Frequency" value={`Every ${profile.adjFrequency} Months`} sub="after first adj" color="slate"/>
                    <Stat label="Status" value={moUntilAdj === null ? "—" : moUntilAdj === 0 ? "In Adjustment" : moUntilAdj <= 12 ? "⚠️ Adjusting Soon" : "✓ In Fixed Period"} color={moUntilAdj !== null && moUntilAdj <= 12 ? "orange" : "slate"}/>
                  </div>
                  {moUntilAdj !== null && moUntilAdj <= 12 && moUntilAdj > 0 && (
                    <div className="mt-3 p-3 bg-orange-900/30 border border-orange-700/40 rounded-lg text-sm text-orange-200">⚠️ First rate adjustment is within 12 months. Borrower should review their options now — refinancing window may be closing.</div>
                  )}
                </div>

                <div className={`rounded-xl p-5 border ${paymentShock ? "bg-red-900/20 border-red-700/50" : "bg-green-900/20 border-green-700/50"}`}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Payment Shock Analysis</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-3">
                    <Stat label="Current Rate" value={fp(startRate)} color="slate"/>
                    <Stat label="Fully-Indexed Rate" value={fp(fullyIndexed)} color={paymentShock ? "red" : "green"}/>
                    <Stat label="Current Payment" value={f$(currentPayment)} sub="/month" color="slate"/>
                    <Stat label="Payment at FIR" value={f$(fiPayment)} sub={paymentShock ? `+${f$(shockAmount)}/mo` : `−${f$(-shockAmount)}/mo`} color={paymentShock ? "red" : "green"}/>
                  </div>
                  {paymentShock ? (
                    <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-3 text-sm text-red-200">
                      <strong className="text-red-300">⚠️ Payment Shock Risk Identified.</strong> The fully-indexed rate ({fp(fullyIndexed)}) is {fp(fullyIndexed - startRate)} above the current rate. If the index stays flat, the borrower faces a <strong>{fp(shockPct,1)} increase</strong> ({f$(shockAmount)}/mo) at first adjustment.
                    </div>
                  ) : (
                    <div className="bg-green-950/40 border border-green-800/50 rounded-lg p-3 text-sm text-green-200">
                      ✅ <strong>No immediate payment shock.</strong> The fully-indexed rate is {fp(startRate - fullyIndexed)} below the current rate. The borrower may actually see a payment decrease at first adjustment if the index stays flat.
                    </div>
                  )}
                </div>
              </div>
            )}

            <Nav onBack={()=>setStep(1)} onNext={()=>setStep(3)} label="Position Reviewed — Continue →" disabled={!startRate || !indexVal}/>
          </Card>
        )}

        {/* ═══ STEP 4 — PAYMENT STRESS TEST ════════════════════════════════ */}
        {step === 3 && (
          <Card icon="📊" title="Step 4 — Payment Stress Test" subtitle="Three scenarios show how rate adjustments play out year by year. Worst Case assumes caps are hit at every adjustment in the upward direction.">
            <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 mb-5 text-sm text-orange-200 space-y-1">
              <p><strong>📗 Best Case:</strong> Index stays exactly at today's value for the life of the loan.</p>
              <p><strong>📙 Base Case:</strong> Index rises +0.25% per year — a moderate, gradual increase.</p>
              <p><strong>📕 Worst Case:</strong> Each adjustment hits the maximum allowed by the caps — the most aggressive possible scenario.</p>
            </div>

            {capsSet && startRate > 0 && loanBal > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 text-center">
                  <p className="text-xs text-slate-400 mb-1">Lifetime Rate Ceiling</p>
                  <p className="text-2xl font-bold font-mono text-red-300">{fp(rateCeiling)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{fp(startRate)} start + {fp(lifetimeCap)} lifetime cap</p>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 text-center">
                  <p className="text-xs text-slate-400 mb-1">Max Possible Payment</p>
                  <p className="text-2xl font-bold font-mono text-red-300">{f$(ceilingPayment)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">at ceiling rate, {profile.termYears}-yr term</p>
                </div>
                <div className={`rounded-xl p-4 border text-center ${riskColor(((ceilingPayment-currentPayment)/currentPayment)*100).bg} ${riskColor(((ceilingPayment-currentPayment)/currentPayment)*100).border}`}>
                  <p className="text-xs text-slate-400 mb-1">Worst-Case Payment Increase</p>
                  <p className={`text-2xl font-bold font-mono ${riskColor(((ceilingPayment-currentPayment)/currentPayment)*100).text}`}>+{fp(((ceilingPayment-currentPayment)/currentPayment)*100,1)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f$(ceilingPayment - currentPayment)}/mo more</p>
                </div>
              </div>
            )}

            {capsSet && startRate > 0 && loanBal > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Year-by-Year Comparison (Years shown are loan age)</p>
                <div className="overflow-x-auto rounded-xl border border-slate-600">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900/80">
                        <th className="px-4 py-3 text-left text-xs text-slate-400 font-bold uppercase tracking-wider">Period</th>
                        <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-green-400">📗 Best Case<br/><span className="text-slate-500 normal-case font-normal">Index flat</span></th>
                        <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-yellow-400">📙 Base Case<br/><span className="text-slate-500 normal-case font-normal">+0.25%/yr</span></th>
                        <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-red-400">📕 Worst Case<br/><span className="text-slate-500 normal-case font-normal">Caps hit fully</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenFlat.map((row, idx) => {
                        const gradRow = scenGradual[idx];
                        const worstRow = scenWorst[idx];
                        const isFixed = row.isFixed;
                        return (
                          <tr key={idx} className={`border-t border-slate-700/50 ${isFixed?"bg-slate-800/30":"hover:bg-slate-700/20"}`}>
                            <td className="px-4 py-3 text-slate-300 font-semibold">
                              {row.label}
                              {isFixed && <span className="ml-2 text-xs text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded">Fixed</span>}
                            </td>
                            {[row, gradRow, worstRow].map((r, si) => {
                              if (!r) return <td key={si}/>;
                              const rc = riskColor(r.isFixed ? 0 : r.deltaPct);
                              return (
                                <td key={si} className="px-3 py-3 text-center">
                                  <p className={`font-bold font-mono ${r.isFixed ? "text-slate-200" : rc.text}`}>{f$(r.payment)}</p>
                                  {!r.isFixed && <p className={`text-xs mt-0.5 ${rc.text} opacity-80`}>{r.delta >= 0 ? "+" : ""}{f$(r.delta)} ({fp(r.deltaPct, 1)})</p>}
                                  <p className="text-xs text-slate-500 mt-0.5 font-mono">{fp(r.rate)}</p>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">Payment increases shown vs. current start-rate payment of {f$(currentPayment)}/mo · Rate column in grey below each payment</p>
              </div>
            )}

            <Nav onBack={()=>setStep(2)} onNext={()=>setStep(4)} label="Stress Test Reviewed — Continue →"/>
          </Card>
        )}

        {/* ═══ STEP 5 — QUALIFYING ANALYSIS ════════════════════════════════ */}
        {step === 4 && (
          <Card icon="🎯" title="Step 5 — Qualifying Analysis" subtitle="Which rate must the borrower qualify at? Rules vary by loan program and fixed period length. Critically important for purchase and refi underwriting.">
            <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 mb-6 text-sm text-orange-200">
              <p className="font-semibold text-orange-300 mb-1">Why this matters:</p>
              <p>The rate you use on the 1003 and in the AUS is not always the start rate. If the borrower can't qualify at the required rate, they may not be eligible for this ARM — regardless of what the payment is at origination.</p>
            </div>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Loan Program</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[["conventional","Conventional","Fannie/Freddie"],["fha","FHA","HUD/FHA"],["va","VA","VA Loan"],["usda","USDA","Rural Development"]].map(([v,l,s])=>(
                <label key={v} className={`block cursor-pointer p-3 rounded-xl border transition-all text-center ${qualify.program===v?"bg-orange-900/30 border-orange-500":"bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                  <input type="radio" className="hidden" checked={qualify.program===v} onChange={()=>setQualify(q=>({...q,program:v}))}/>
                  <p className="font-bold text-white text-sm">{l}</p>
                  <p className="text-xs text-slate-400">{s}</p>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <FInput label="Borrower Gross Monthly Income (if not entered in Step 3)" tip="Used for DTI analysis." prefix="$" value={position.borrowerIncome} onChange={v=>setPosition(p=>({...p,borrowerIncome:v}))} placeholder="e.g. 9500"/>
              <FInput label="Total Other Monthly Debt Payments" tip="All minimum monthly debt obligations: car loans, student loans, credit card minimums, other mortgages." prefix="$" value={qualify.monthlyDebts} onChange={v=>setQualify(q=>({...q,monthlyDebts:v}))} placeholder="e.g. 850"/>
            </div>

            {startRate > 0 && fullyIndexed > 0 && (
              <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-600 mb-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Qualifying Rate Determination</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <Stat label="Start Note Rate" value={fp(startRate)} color="slate"/>
                  <Stat label="Fully-Indexed Rate" value={fp(fullyIndexed)} color={fullyIndexed > startRate ? "orange" : "green"}/>
                  <Stat label={`${qualify.program.toUpperCase()} Qualifying Rate`} value={fp(qualInfo.rate)} color={qualInfo.rate > startRate ? "orange" : "slate"} sub={qualInfo.rate > startRate ? "Above start rate" : "= Start rate"}/>
                </div>
                <div className="bg-orange-900/20 border border-orange-700/40 rounded-lg p-3 text-xs text-orange-200 mb-3">
                  <strong className="text-orange-300">Rule Applied:</strong> {qualInfo.rule}<br/>
                  <span className="text-slate-400">Source: {qualInfo.source}</span>
                </div>
                {qualInfo.rate !== startRate && (
                  <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-sm text-yellow-200">
                    ⚠️ The qualifying rate ({fp(qualInfo.rate)}) is higher than the start rate ({fp(startRate)}). The borrower must qualify using a payment of <strong className="text-yellow-300">{f$(qualPayment)}/mo</strong> — not the initial {f$(currentPayment)}/mo payment.
                  </div>
                )}
              </div>
            )}

            {borrowerIncome > 0 && qualPayment > 0 && (
              <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-600">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">DTI Analysis</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-4">
                  <Stat label="Qualifying Payment" value={f$(qualPayment)} sub="used in AUS" color="orange"/>
                  <Stat label="Other Monthly Debts" value={f$(monthlyDebts)} color="slate"/>
                  <Stat label="Qualifying DTI" value={qualDTI !== null ? fp(qualDTI, 1) : "—"} color={qualDTI !== null && qualDTI > 50 ? "red" : qualDTI !== null && qualDTI > 43 ? "yellow" : "green"} sub="back-end"/>
                  <Stat label="Worst-Case DTI" value={worstDTI !== null ? fp(worstDTI, 1) : "—"} sub="at rate ceiling" color={worstDTI !== null && worstDTI > 55 ? "red" : worstDTI !== null && worstDTI > 50 ? "yellow" : "orange"}/>
                </div>
                {qualDTI !== null && qualDTI > 50 && <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300 mb-2">❌ Qualifying DTI of {fp(qualDTI,1)} exceeds conventional/FHA/VA limits (typically 45–50%).</div>}
                {worstDTI !== null && worstDTI > 60 && <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">⚠️ Worst-case DTI of {fp(worstDTI,1)} at the rate ceiling indicates significant payment sustainability risk.</div>}
                {qualDTI !== null && qualDTI <= 43 && <div className="p-3 bg-green-900/20 border border-green-700/30 rounded-lg text-sm text-green-200">✅ Qualifying DTI of {fp(qualDTI,1)} is within standard agency limits.</div>}
              </div>
            )}

            <Nav onBack={()=>setStep(3)} onNext={()=>setStep(5)} label="Qualifying Reviewed — Continue →"/>
          </Card>
        )}

        {/* ═══ STEP 6 — ARM vs. FIXED ══════════════════════════════════════ */}
        {step === 5 && (
          <Card icon="⚖️" title="Step 6 — ARM vs. Fixed Comparison" subtitle="Should the borrower keep the ARM or refinance to a fixed rate today? Break-even analysis shows when the fixed rate wins.">
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4 mb-6 text-sm text-blue-200">
              <p>Enter a 30-year fixed rate to compare. The module shows how long the ARM stays cheaper than the fixed loan, and when the cumulative cost advantage flips.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <FInput label="Hypothetical 30-Yr Fixed Rate" tip="The rate the borrower could get TODAY on a 30-year fixed refinance." suffix="%" value={vsFixed.fixedRate} onChange={v=>setVsFixed({fixedRate:v})} placeholder="e.g. 6.875"/>
              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 flex flex-col justify-center">
                <p className="text-xs text-slate-400 mb-1">30-Year Fixed Monthly P&I</p>
                <p className="text-2xl font-bold font-mono text-blue-300">{fixedRateComp > 0 ? f$(fixedPayment) : "—"}</p>
                {fixedRateComp > 0 && <p className={`text-sm mt-1 ${currentPayment < fixedPayment ? "text-green-300" : "text-red-300"}`}>{currentPayment < fixedPayment ? `ARM saves ${f$(fixedPayment - currentPayment)}/mo now` : `Fixed saves ${f$(currentPayment - fixedPayment)}/mo now`}</p>}
              </div>
            </div>

            {fixedRateComp > 0 && loanBal > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="ARM Start Payment" value={f$(currentPayment)} sub="/month now" color="orange"/>
                  <Stat label="Fixed Payment" value={f$(fixedPayment)} sub="/month (all 30 yrs)" color="blue"/>
                  <Stat label="Fixed Period Savings" value={f$(Math.abs(fixedPeriodSavings))} sub={fixedPeriodSavings > 0 ? `ARM saves in ${fixedYrs} yrs` : `Fixed saves in ${fixedYrs} yrs`} color={fixedPeriodSavings > 0 ? "green" : "red"}/>
                  <Stat label="Rate Spread" value={fp(Math.abs(fixedRateComp - startRate))} sub={fixedRateComp > startRate ? "ARM cheaper now" : "Fixed cheaper now"} color={fixedRateComp > startRate ? "green" : "red"}/>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-600">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Decision Framework</p>
                  <div className="space-y-3 text-sm">
                    {fixedRateComp > startRate && (
                      <div className="flex items-start gap-3 p-3 bg-green-900/20 border border-green-700/40 rounded-lg text-green-200">
                        <span className="text-green-400 text-lg flex-shrink-0">✅</span>
                        <p><strong>ARM is currently cheaper</strong> by {f$(fixedPayment - currentPayment)}/mo. During the {fixedYrs}-year fixed period, the borrower saves {f$(Math.abs(fixedPeriodSavings))} vs. refinancing to fixed today.</p>
                      </div>
                    )}
                    {fixedRateComp <= startRate && (
                      <div className="flex items-start gap-3 p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-blue-200">
                        <span className="text-blue-400 text-lg flex-shrink-0">ℹ️</span>
                        <p><strong>Fixed is currently cheaper</strong> by {f$(currentPayment - fixedPayment)}/mo. The borrower would save money immediately by refinancing to a fixed rate.</p>
                      </div>
                    )}
                    {paymentShock && (
                      <div className="flex items-start gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-red-200">
                        <span className="text-red-400 text-lg flex-shrink-0">⚠️</span>
                        <p><strong>Payment shock risk:</strong> At the fully-indexed rate ({fp(fullyIndexed)}), the ARM payment rises to {f$(fiPayment)}/mo — {fp(shockPct,1)} above today.</p>
                      </div>
                    )}
                    {moUntilAdj !== null && moUntilAdj <= 12 && (
                      <div className="flex items-start gap-3 p-3 bg-orange-900/20 border border-orange-700/40 rounded-lg text-orange-200">
                        <span className="text-orange-400 text-lg flex-shrink-0">⏰</span>
                        <p><strong>Adjustment window closing:</strong> Only {moUntilAdj} months until first adjustment.</p>
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-3 bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-300">
                      <span className="text-slate-400 text-lg flex-shrink-0">📌</span>
                      <p><strong>Key question:</strong> How long does the borrower plan to stay in the home? If they'll sell before the first adjustment, the ARM rate advantage is realized with no risk. If they're staying long-term, the worst-case ceiling of {f$(ceilingPayment)}/mo must be sustainable.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!fixedRateComp && <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-center"><p className="text-slate-400 text-sm">Enter a 30-year fixed rate above to see the comparison, or skip if not needed.</p></div>}

            <Nav onBack={()=>setStep(4)} onNext={()=>setStep(6)} label={fixedRateComp > 0 ? "Comparison Complete — Continue →" : "Skip Comparison — Continue →"}/>
          </Card>
        )}

        {/* ═══ STEP 7 — RESULTS & DISCLOSURE ══════════════════════════════ */}
        {step === 6 && (
          <Card icon="🏁" title="Step 7 — Results & ARM Disclosure" subtitle="Full summary. Save to Decision Record and print as borrower ARM disclosure.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                ["ARM Type", FIXED_PERIODS.find(f=>f.value===profile.fixedPeriod)?.label||"—", "slate"],
                ["Start Rate", fp(startRate), "slate"],
                ["Fully-Indexed Rate", fp(fullyIndexed), fullyIndexed > startRate ? "red" : "green"],
                ["Rate Ceiling", fp(rateCeiling), "red"],
                ["Caps Structure", capsSet?`${initCap}/${periodicCap}/${lifetimeCap}`:"—", "orange"],
                ["Current Payment", f$(currentPayment), "slate"],
                ["Payment at FIR", f$(fiPayment), paymentShock ? "orange" : "green"],
                ["Ceiling Payment", f$(ceilingPayment), "red"],
                ["Qualifying Rate", fp(qualInfo.rate), qualInfo.rate > startRate ? "orange" : "slate"],
                ["Qualifying DTI", qualDTI !== null ? fp(qualDTI,1) : "—", qualDTI && qualDTI > 45 ? "yellow" : "green"],
                ["Mo. Until 1st Adj", moUntilAdj !== null ? (moUntilAdj===0?"Now":fmo(moUntilAdj)) : "—", moUntilAdj !== null && moUntilAdj <= 12 ? "orange" : "slate"],
                ["Worst-Case DTI", worstDTI !== null ? fp(worstDTI,1) : "—", worstDTI && worstDTI > 55 ? "red" : "slate"],
              ].map(([label,value,color])=>(
                <div key={label} className={`rounded-xl p-3 border text-center ${color==="green"?"bg-green-900/20 border-green-800/50":color==="red"?"bg-red-900/20 border-red-800/50":color==="orange"?"bg-orange-900/20 border-orange-800/50":color==="yellow"?"bg-yellow-900/20 border-yellow-800/50":"bg-slate-800/60 border-slate-700"}`}>
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  <p className={`text-sm font-bold ${color==="green"?"text-green-300":color==="red"?"text-red-300":color==="orange"?"text-orange-300":color==="yellow"?"text-yellow-300":"text-slate-200"}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mb-4">
              <button onClick={save} disabled={!!savedRecordId || !scenarioId || scenarioId === 'standalone'}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${savedRecordId?"bg-green-800/50 border border-green-700/50 text-green-400":(scenarioId && scenarioId !== 'standalone')?"bg-slate-700 hover:bg-slate-600 text-white border border-slate-600":"bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"}`}>
                {savedRecordId ? "✅ Saved to Decision Record" : (scenarioId && scenarioId !== 'standalone') ? "💾 Save to Decision Record™" : "💾 No Scenario Linked"}
              </button>
              <button onClick={()=>window.print()} className="flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-lg" style={{background:"linear-gradient(135deg,#ea580c,#f97316)"}}>
                🖨️ Print ARM Disclosure PDF
              </button>
            </div>
            {(!scenarioId || scenarioId === 'standalone') && <p className="text-xs text-slate-500 text-center mb-4">Link a scenario to enable Decision Record saving.</p>}
            <button onClick={()=>{setStep(0);setSavedRecordId(null);}} className="w-full py-2.5 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700">← Analyze New ARM</button>
          </Card>
        )}
      </div>

      {/* ═══ PRINT DISCLOSURE ════════════════════════════════════════════════ */}
      <div id="armprint" style={{display:"none",fontFamily:"Arial,sans-serif",fontSize:"10.5pt",color:"#000"}}>
        <div style={{borderBottom:"3px solid #b45309",paddingBottom:"14px",marginBottom:"18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <p style={{fontSize:"8pt",color:"#888",letterSpacing:"2px",margin:"0 0 3px"}}>LOANBEACONS™ — MORTGAGE INTELLIGENCE PLATFORM</p>
              <h1 style={{fontSize:"16pt",fontWeight:"bold",color:"#b45309",margin:"0"}}>Adjustable Rate Mortgage (ARM) Disclosure</h1>
              <p style={{fontSize:"9pt",color:"#444",margin:"3px 0 0"}}>ARM Structure Analysis · Payment Scenarios · Qualifying Rate</p>
            </div>
            <div style={{textAlign:"right",fontSize:"9pt",color:"#666"}}>
              <p style={{margin:"2px 0"}}>Date: {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</p>
              {scenario&&<p style={{margin:"2px 0"}}>Borrower: {scenario.borrowerName||scenario.lastName||"—"}</p>}
              <p style={{margin:"2px 0"}}>ARM Type: {FIXED_PERIODS.find(f=>f.value===profile.fixedPeriod)?.label||"—"}</p>
            </div>
          </div>
        </div>

        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:"16px"}}>
          <thead><tr style={{background:"#b45309",color:"#fff"}}><th style={{padding:"7px 10px",textAlign:"left",fontSize:"9.5pt"}} colSpan={2}>ARM Key Terms</th><th style={{padding:"7px 10px",textAlign:"left",fontSize:"9.5pt"}} colSpan={2}>Caps Structure</th></tr></thead>
          <tbody>
            {[
              [["Start Rate",fp(startRate)],["Caps (I/P/L)",`${initCap}/${periodicCap}/${lifetimeCap}`]],
              [["Current Index",fp(indexVal)+" ("+INDEXES.find(i=>i.id===profile.indexType)?.label?.split(" ")[0]+")"],["Initial Cap","+"+fp(initCap)+" at 1st adj"]],
              [["Margin",fp(margin)],["Periodic Cap","±"+fp(periodicCap)+" each adj after"]],
              [["Fully-Indexed Rate",fp(fullyIndexed)],["Lifetime Cap","+"+fp(lifetimeCap)+" from start"]],
              [["Rate Ceiling (Max Ever)",fp(rateCeiling)],["Rate Floor",fp(rateFloor)]],
            ].map((row,i)=>(
              <tr key={i} style={{background:i%2===0?"#fff8f2":"#fff"}}>
                {row.map(([l,v],j)=>(
                  <><td key={l} style={{padding:"6px 10px",fontWeight:"600",fontSize:"9pt",width:"20%"}}>{l}</td><td key={v} style={{padding:"6px 10px",fontSize:"9pt",width:"30%"}}>{v}</td></>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{fontWeight:"bold",color:"#b45309",fontSize:"11pt",marginBottom:"6px"}}>Payment Scenarios</p>
        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:"16px",fontSize:"9pt"}}>
          <thead>
            <tr style={{background:"#1e293b",color:"#fff"}}>
              <th style={{padding:"6px 8px",textAlign:"left"}}>Period</th>
              <th style={{padding:"6px 8px",textAlign:"center",color:"#86efac"}}>Best Case (Index Flat)</th>
              <th style={{padding:"6px 8px",textAlign:"center",color:"#fde68a"}}>Base Case (+0.25%/yr)</th>
              <th style={{padding:"6px 8px",textAlign:"center",color:"#fca5a5"}}>Worst Case (Caps Hit)</th>
            </tr>
          </thead>
          <tbody>
            {scenFlat.map((row,idx)=>{
              const g=scenGradual[idx],w=scenWorst[idx];
              return (
                <tr key={idx} style={{background:idx%2===0?"#f9fafb":"#fff"}}>
                  <td style={{padding:"5px 8px",fontWeight:"600"}}>{row.label}{row.isFixed?" (Fixed)":""}</td>
                  {[row,g,w].map((r,si)=>(
                    <td key={si} style={{padding:"5px 8px",textAlign:"center"}}>
                      <strong>{f$(r?.payment)}</strong> <span style={{color:"#666"}}>@ {fp(r?.rate)}</span>
                      {!r?.isFixed&&r?.delta!==0&&<><br/><span style={{color:r?.delta>0?"#dc2626":"#16a34a",fontSize:"8pt"}}>{r?.delta>=0?"+":""}{f$(r?.delta)}</span></>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"16px"}}>
          <div style={{border:"1.5px solid #b45309",borderRadius:"7px",padding:"12px"}}>
            <p style={{fontWeight:"bold",color:"#b45309",marginBottom:"7px"}}>Qualifying Rate — {qualify.program.toUpperCase()}</p>
            <p style={{margin:"3px 0",fontSize:"9pt"}}>Rule: <strong>{qualInfo.rule}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9pt"}}>Qualifying Rate: <strong>{fp(qualInfo.rate)}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9pt"}}>Qualifying Payment: <strong>{f$(qualPayment)}/mo</strong></p>
            {qualDTI&&<p style={{margin:"3px 0",fontSize:"9pt"}}>Qualifying DTI: <strong>{fp(qualDTI,1)}</strong></p>}
            <p style={{margin:"4px 0 0",fontSize:"7.5pt",color:"#666"}}>Source: {qualInfo.source}</p>
          </div>
          <div style={{border:"1.5px solid #b45309",borderRadius:"7px",padding:"12px"}}>
            <p style={{fontWeight:"bold",color:"#b45309",marginBottom:"7px"}}>Worst-Case Summary</p>
            <p style={{margin:"3px 0",fontSize:"9pt"}}>Max Rate (Ceiling): <strong>{fp(rateCeiling)}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9pt"}}>Max Payment: <strong>{f$(ceilingPayment)}/mo</strong></p>
            <p style={{margin:"3px 0",fontSize:"9pt"}}>Max Increase: <strong>+{f$(ceilingPayment-currentPayment)}/mo</strong></p>
            {worstDTI&&<p style={{margin:"3px 0",fontSize:"9pt"}}>Worst-Case DTI: <strong>{fp(worstDTI,1)}</strong></p>}
            <p style={{margin:"4px 0 0",fontSize:"9pt",color:paymentShock?"#dc2626":"#16a34a",fontWeight:"bold"}}>{paymentShock?"⚠️ Payment shock risk identified":"✓ No immediate payment shock"}</p>
          </div>
        </div>

        <div style={{border:"1.5px solid #ccc",borderRadius:"7px",padding:"12px",marginBottom:"16px"}}>
          <p style={{fontWeight:"bold",marginBottom:"6px"}}>Borrower Acknowledgment</p>
          <p style={{fontSize:"8.5pt",color:"#444",marginBottom:"14px"}}>I/We acknowledge that I/we have received and reviewed this ARM disclosure. I/we understand that the interest rate on this loan is subject to adjustment, that the payment may increase or decrease, and that the worst-case scenario payment shown above represents the maximum possible payment based on the caps structure in my/our Note.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"14px"}}>
            {["Borrower Signature / Date","Co-Borrower Signature / Date","Loan Officer / Date"].map(l=>(
              <div key={l}><p style={{fontSize:"8pt",color:"#666"}}>{l}</p><div style={{borderBottom:"1px solid #000",height:"22px"}}/></div>
            ))}
          </div>
        </div>

        <div style={{fontSize:"7.5pt",color:"#777",borderTop:"1px solid #ccc",paddingTop:"8px"}}>
          <p>Generated by LoanBeacons™ ARM Structure Intelligence™ for loan officer use — not a commitment to lend. All calculations are estimates based on the index values and caps entered. Actual rate adjustments will be determined by the index value published per the terms of the Note. Index source: {INDEXES.find(i=>i.id===profile.indexType)?.label||"—"}. Qualifying rate rules per {qualInfo.source}. Generated: {new Date().toLocaleString()} · {scenarioId&&scenarioId!=='standalone'?`Scenario: ${scenarioId}`:"Standalone mode"}</p>
        </div>
      </div>
    </div>
  );
}
