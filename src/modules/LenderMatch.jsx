/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/modules/LenderMatch.jsx
 * Version: 1.0.1 — Writes selected lender back to scenario on DR save
 * ============================================================
 */
import { useSearchParams } from 'react-router-dom';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';
import React, { useState, useCallback, useRef, useEffect } from "react";
import { db } from "../firebase/config";
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from "firebase/firestore";
import {
  runLenderMatch,
  buildDecisionRecord,
  normalizeScenario,
  OVERLAY_RISK,
  ELIGIBILITY_STATUS,
  SCENARIO_INTENT,
  ENGINE_VERSION,
} from "../engines/LenderMatchEngine";
import { useLenderProfiles } from "../hooks/useLenderProfiles";
import { useDecisionRecord } from "../hooks/useDecisionRecord";
import DecisionRecordBanner from "../components/DecisionRecordBanner";

import { LenderScorecardCard }   from "../components/lenderMatch/LenderScorecardCard";
import { AlternativeLenderCard } from "../components/lenderMatch/AlternativeLenderCard";
import { DecisionRecordModal }   from "../components/lenderMatch/DecisionRecordModal";
import { IneligibleLenderRow }   from "../components/lenderMatch/IneligibleLenderRow";


// ─── Constants ────────────────────────────────────────────────────────────────

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

const PROPERTY_TYPE_OPTIONS = [
  { value: "SFR",                  label: "Single Family (SFR)"       },
  { value: "Condo",                label: "Condo (Warrantable)"       },
  { value: "Condo_NonWarrantable", label: "Condo (Non-Warrantable)"   },
  { value: "TwoUnit",              label: "2-Unit"                    },
  { value: "ThreeUnit",            label: "3-Unit"                    },
  { value: "FourUnit",             label: "4-Unit"                    },
  { value: "Manufactured",         label: "Manufactured Home"         },
  { value: "MixedUse",             label: "Mixed Use"                 },
];

const INCOME_DOC_OPTIONS = [
  { value: "fullDoc",         label: "Full Documentation (W2 / Tax Returns)", nonQM: false },
  { value: "bankStatement12", label: "Bank Statement — 12 Month",             nonQM: true  },
  { value: "bankStatement24", label: "Bank Statement — 24 Month",             nonQM: true  },
  { value: "dscr",            label: "DSCR (No Personal Income)",             nonQM: true  },
  { value: "assetDepletion",  label: "Asset Depletion",                       nonQM: true  },
  { value: "ninetyNineOnly",  label: "1099 Only",                             nonQM: true  },
  { value: "noDoc",           label: "No Documentation",                      nonQM: true  },
];

const LOAN_TYPE_OPTIONS = [
  { value: "All",          label: "All Programs"  },
  { value: "Conventional", label: "Conventional"  },
  { value: "FHA",          label: "FHA"           },
  { value: "VA",           label: "VA"            },
  { value: "NonQM",        label: "Non-QM Only"   },
];

const CREDIT_EVENT_OPTIONS = [
  { value: "none",      label: "None"        },
  { value: "BK",        label: "Bankruptcy"  },
  { value: "FC",        label: "Foreclosure" },
  { value: "shortSale", label: "Short Sale"  },
];

const INTENT_OPTIONS = [
  { value: SCENARIO_INTENT.AGENCY_FIRST,      label: "Agency First — Prefer conventional path" },
  { value: SCENARIO_INTENT.ALTERNATIVE_FOCUS, label: "Alternative Focus — Non-QM primary"      },
  { value: SCENARIO_INTENT.SPEED_FOCUS,       label: "Speed Focus — Fastest close"             },
];

const INITIAL_FORM = {
  loanType: "All", transactionType: "purchase", loanAmount: "", propertyValue: "",
  creditScore: "", incomeDocType: "fullDoc", monthlyIncome: "", monthlyDebts: "",
  propertyType: "SFR", occupancy: "Primary", state: "", selfEmployed: false,
  creditEvent: "none", creditEventMonths: "", vaEntitlement: "Full",
  dscr: "", grossRentalIncome: "", totalAssets: "", reservesMonths: "",
  intent: SCENARIO_INTENT.AGENCY_FIRST,
};

// ─── Design Tokens ────────────────────────────────────────────────────────────

const T = {
  bg: "#0d1117", bgCard: "#161b22", bgInput: "#0d1117", border: "#21262d", borderLight: "#30363d",
  amber: "#d97706", amberLight: "#fbbf24", amberBg: "#451a03", amberBorder: "#92400e",
  blue: "#1d6fa4", blueLight: "#58a6ff", green: "#238636", greenLight: "#3fb950",
  greenBg: "#0f2913", greenBorder: "#1f6527", red: "#da3633", redLight: "#f85149",
  redBg: "#280d0b", redBorder: "#6e1b18", teal: "#0d9488",
  textPrimary: "#e6edf3", textSecondary: "#8b949e", textMuted: "#484f58",
  textAmber: "#fbbf24", textGreen: "#3fb950", textRed: "#f85149", textBlue: "#58a6ff",
  fontMono: "'DM Mono', monospace", fontDisplay: "'Sora', system-ui, sans-serif",
  fontBody: "'DM Sans', system-ui, sans-serif",
  radius: "8px", radiusLg: "12px", radiusSm: "4px", transition: "all 0.15s ease",
};

const S = {
  page: { minHeight: "100vh", backgroundColor: T.bg, fontFamily: T.fontBody, color: T.textPrimary, paddingBottom: "80px" },
  header: { background: `linear-gradient(180deg, #0d1117 0%, rgba(13,17,23,0.95) 100%)`, borderBottom: `1px solid ${T.border}`, padding: "20px 24px 16px", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" },
  headerInner: { maxWidth: "1280px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" },
  logoGroup: { display: "flex", alignItems: "center", gap: "12px" },
  logoIcon: { width: "32px", height: "32px", borderRadius: "8px", background: `linear-gradient(135deg, ${T.amber} 0%, ${T.amberLight} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 },
  logoText: { fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "16px", color: T.textPrimary, letterSpacing: "-0.3px" },
  logoSubtext: { fontFamily: T.fontMono, fontSize: "10px", color: T.textAmber, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "1px" },
  headerMeta: { display: "flex", alignItems: "center", gap: "16px" },
  engineBadge: { fontFamily: T.fontMono, fontSize: "10px", color: T.textMuted, letterSpacing: "0.06em", padding: "3px 8px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm },
  body: { maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" },
  formSection: { marginBottom: "32px" },
  formCard: { backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, overflow: "hidden" },
  formCardHeader: { padding: "18px 24px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" },
  formCardTitle: { fontFamily: T.fontDisplay, fontWeight: 600, fontSize: "14px", color: T.textPrimary, display: "flex", alignItems: "center", gap: "8px" },
  formCardTitleDot: { width: "6px", height: "6px", borderRadius: "50%", backgroundColor: T.amber, display: "inline-block" },
  formBody: { padding: "24px" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" },
  formGroup: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontFamily: T.fontMono, fontSize: "11px", color: T.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" },
  labelTag: { fontSize: "9px", padding: "1px 5px", borderRadius: "3px", backgroundColor: "#1a2332", color: T.textBlue, letterSpacing: "0.04em", border: `1px solid #1d6fa440` },
  labelTagAmber: { backgroundColor: "#2a1a00", color: T.textAmber, border: `1px solid ${T.amberBorder}` },
  input: { backgroundColor: T.bgInput, border: `1px solid ${T.borderLight}`, borderRadius: T.radius, padding: "9px 12px", fontSize: "14px", color: T.textPrimary, fontFamily: T.fontBody, outline: "none", transition: T.transition, width: "100%", boxSizing: "border-box" },
  select: { backgroundColor: T.bgInput, border: `1px solid ${T.borderLight}`, borderRadius: T.radius, padding: "9px 12px", fontSize: "14px", color: T.textPrimary, fontFamily: T.fontBody, outline: "none", transition: T.transition, width: "100%", boxSizing: "border-box", cursor: "pointer" },
  formDivider: { height: "1px", backgroundColor: T.border, margin: "20px 0" },
  formSectionLabel: { fontFamily: T.fontMono, fontSize: "10px", color: T.textAmber, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" },
  toggleRow: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" },
  toggleTrack: (a) => ({ width: "36px", height: "20px", borderRadius: "10px", backgroundColor: a ? T.amber : T.borderLight, position: "relative", transition: T.transition, flexShrink: 0, cursor: "pointer" }),
  toggleThumb: (a) => ({ position: "absolute", top: "3px", left: a ? "19px" : "3px", width: "14px", height: "14px", borderRadius: "50%", backgroundColor: a ? T.bg : T.textMuted, transition: T.transition }),
  toggleLabel: { fontSize: "13px", color: T.textPrimary },
  txToggle: { display: "flex", backgroundColor: T.bg, border: `1px solid ${T.borderLight}`, borderRadius: T.radius, overflow: "hidden" },
  txToggleBtn: (a) => ({ flex: 1, padding: "8px 10px", fontSize: "12px", fontFamily: T.fontMono, fontWeight: a ? 600 : 400, color: a ? T.bg : T.textSecondary, backgroundColor: a ? T.amber : "transparent", border: "none", cursor: "pointer", transition: T.transition }),
  submitBtn: (l) => ({ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "13px 28px", backgroundColor: l ? T.amberBg : T.amber, color: l ? T.amberLight : T.bg, border: `1px solid ${l ? T.amberBorder : T.amber}`, borderRadius: T.radius, fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "14px", cursor: l ? "not-allowed" : "pointer", transition: T.transition, minWidth: "200px" }),
  clearBtn: { padding: "13px 20px", backgroundColor: "transparent", color: T.textSecondary, border: `1px solid ${T.borderLight}`, borderRadius: T.radius, fontFamily: T.fontBody, fontSize: "13px", cursor: "pointer" },
  formFooter: { padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "12px" },
  resultsHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "24px", flexWrap: "wrap" },
  resultsTitle: { fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "20px", color: T.textPrimary, letterSpacing: "-0.4px" },
  resultsMeta: { fontSize: "12px", color: T.textSecondary, fontFamily: T.fontMono, marginTop: "4px" },
  agencyHeader: { display: "flex", alignItems: "center", gap: "10px", padding: "14px 20px", backgroundColor: "#0d1117", border: `1px solid ${T.border}`, borderBottom: "none", borderRadius: `${T.radiusLg} ${T.radiusLg} 0 0` },
  agencyHeaderDot: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: T.blueLight, boxShadow: `0 0 8px ${T.blueLight}60` },
  agencyHeaderTitle: { fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "13px", color: T.textPrimary },
  agencyHeaderSub: { fontFamily: T.fontMono, fontSize: "11px", color: T.textSecondary, marginLeft: "auto" },
  altHeader: (h) => ({ display: "flex", alignItems: "center", gap: "10px", padding: "14px 20px", backgroundColor: h ? T.amberBg : T.bg, border: `1px solid ${h ? T.amberBorder : T.border}`, borderBottom: "none", borderRadius: `${T.radiusLg} ${T.radiusLg} 0 0` }),
  altHeaderDot: (h) => ({ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: h ? T.amberLight : T.amber }),
  altHeaderTitle: (h) => ({ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "13px", color: h ? T.textAmber : T.textPrimary }),
  altHeaderHeroBadge: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", backgroundColor: T.amber, color: T.bg, borderRadius: "3px", fontWeight: 700 },
  cardsGrid: { display: "grid", gap: "0", border: `1px solid ${T.border}`, borderRadius: `0 0 ${T.radiusLg} ${T.radiusLg}`, overflow: "hidden" },
  placeholderBanner: { display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 20px", backgroundColor: T.amberBg, borderTop: `1px solid ${T.amberBorder}`, borderLeft: `3px solid ${T.amber}` },
  noMatchBox: { padding: "36px 24px", textAlign: "center", border: `1px solid ${T.border}`, borderRadius: `0 0 ${T.radiusLg} ${T.radiusLg}` },
  noMatchIcon: { fontSize: "28px", marginBottom: "12px", display: "block" },
  noMatchTitle: { fontFamily: T.fontDisplay, fontWeight: 600, fontSize: "14px", color: T.textSecondary, marginBottom: "8px" },
  noMatchText: { fontSize: "13px", color: T.textMuted, maxWidth: "480px", margin: "0 auto", lineHeight: "1.5" },
  ineligibleToggle: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", cursor: "pointer", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.radius} ${T.radius}`, backgroundColor: T.bgCard, fontSize: "12px", color: T.textSecondary, fontFamily: T.fontMono, userSelect: "none" },
  loadingBox: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: "20px" },
  loadingSpinner: { width: "40px", height: "40px", border: `3px solid ${T.border}`, borderTop: `3px solid ${T.amber}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  loadingText: { fontFamily: T.fontMono, fontSize: "12px", color: T.textSecondary, letterSpacing: "0.08em" },
  errorBox: { padding: "24px", backgroundColor: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: T.radius, display: "flex", alignItems: "flex-start", gap: "12px" },
  errorText: { fontSize: "13px", color: T.textRed, lineHeight: "1.5" },
  statsRow: { display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" },
  statChip: { display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "20px", fontSize: "12px", fontFamily: T.fontMono, color: T.textSecondary },
  statChipDot: (c) => ({ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: c, flexShrink: 0 }),
};

if (typeof document !== "undefined" && !document.getElementById("lender-match-styles")) {
  const s = document.createElement("style");
  s.id = "lender-match-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .lm-result-row { animation: fadeSlideIn 0.2s ease forwards; }
    .lm-input:focus { border-color: ${T.amber} !important; box-shadow: 0 0 0 3px ${T.amber}20 !important; }
    .lm-select:focus { border-color: ${T.amber} !important; }
    .lm-btn-clear:hover { background-color: ${T.bgCard} !important; color: ${T.textPrimary} !important; }
    .lm-btn-submit:hover:not(:disabled) { background-color: ${T.amberLight} !important; }
    .lm-ineligible-toggle:hover { color: ${T.textPrimary} !important; }
  `;
  document.head.appendChild(s);
}

const fmt = (v) => { if (!v) return ""; const n = parseInt(String(v).replace(/\D/g,"")); return isNaN(n) ? "" : n.toLocaleString(); };
const parse = (v) => parseInt(String(v).replace(/\D/g,"")) || "";
const riskColor = { [OVERLAY_RISK.LOW]: T.greenLight, [OVERLAY_RISK.MODERATE]: T.amberLight, [OVERLAY_RISK.HIGH]: T.redLight };
const riskIcon  = { [OVERLAY_RISK.LOW]: "🟢", [OVERLAY_RISK.MODERATE]: "🟡", [OVERLAY_RISK.HIGH]: "🔴" };
const confColor = { HIGH: T.greenLight, MODERATE: T.amberLight, LOW: T.redLight };

function OverlayRiskBadgeInline({ risk }) {
  if (!risk) return null;
  const c = riskColor[risk.level] || T.textSecondary;
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"5px 10px", borderRadius:"20px", backgroundColor:T.bgCard, border:`1px solid ${c}40`, fontSize:"12px", fontFamily:T.fontMono, color:c }}>
      {riskIcon[risk.level]} Overlay Risk: {risk.level}
      {risk.signalCount > 0 && <span style={{color:T.textMuted}}>({risk.signalCount} signal{risk.signalCount!==1?"s":""})</span>}
    </div>
  );
}

function ConfidenceBarInline({ confidence }) {
  if (!confidence) return null;
  const c = confColor[confidence.level] || T.textSecondary;
  const p = Math.round(confidence.score * 100);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"5px 12px", borderRadius:"20px", backgroundColor:T.bgCard, border:`1px solid ${T.border}`, fontSize:"12px", fontFamily:T.fontMono }}>
      <div style={{ width:"60px", height:"4px", backgroundColor:T.border, borderRadius:"2px", overflow:"hidden" }}>
        <div style={{ width:`${p}%`, height:"100%", backgroundColor:c, borderRadius:"2px" }} />
      </div>
      <span style={{color:T.textSecondary}}>Confidence:</span>
      <span style={{color:c, fontWeight:600}}>{confidence.level}</span>
      <span style={{color:T.textMuted}}>({p}%)</span>
    </div>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={S.toggleRow} onClick={() => onChange(!value)}>
      <div style={S.toggleTrack(value)}><div style={S.toggleThumb(value)} /></div>
      <span style={S.toggleLabel}>{label}</span>
    </div>
  );
}

function TransactionToggle({ value, onChange }) {
  return (
    <div style={S.txToggle}>
      {[{value:"purchase",label:"Purchase"},{value:"rateTerm",label:"Rate/Term"},{value:"cashOut",label:"Cash-Out"}].map(o => (
        <button key={o.value} style={S.txToggleBtn(value===o.value)} onClick={() => onChange(o.value)} type="button">{o.label}</button>
      ))}
    </div>
  );
}

function FormGroup({ label, tag, tagVariant, children }) {
  return (
    <div style={S.formGroup}>
      <label style={S.label}>
        {label}
        {tag && <span style={{...S.labelTag,...(tagVariant==="amber"?S.labelTagAmber:{})}}>{tag}</span>}
      </label>
      {children}
    </div>
  );
}

function PlaceholderBanner() {
  return (
    <div style={S.placeholderBanner}>
      <span style={{fontSize:"16px",flexShrink:0,marginTop:"1px"}}>⚠️</span>
      <span style={{fontSize:"12px",color:T.textAmber,lineHeight:"1.5"}}>
        <strong style={{color:T.amberLight}}>GENERIC NON-QM PROFILE — </strong>
        Estimated guidelines, not verified lender data. Confirm terms directly with lender before quoting.
      </span>
    </div>
  );
}

function AePanel({ lenderName, getAeInfo }) {
  const ae = getAeInfo(lenderName);
  if (!ae) return null;
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:"16px",padding:"10px 20px 10px 24px",backgroundColor:"#0b1320",borderTop:"1px solid #1d2d44",borderLeft:"3px solid #1d6fa4"}}>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:"10px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#58a6ff",fontWeight:600,flexShrink:0}}>Your AE</span>
      <div style={{display:"flex",gap:"20px",flexWrap:"wrap",alignItems:"center"}}>
        {ae.aeContact && <span style={{fontSize:"12px",color:"#e6edf3",fontWeight:600}}>{ae.aeContact}</span>}
        {ae.aeEmail   && <a href={"mailto:"+ae.aeEmail} style={{fontSize:"12px",color:"#58a6ff",textDecoration:"none"}}>{ae.aeEmail}</a>}
        {ae.aePhone   && <a href={"tel:"+ae.aePhone}   style={{fontSize:"12px",color:"#58a6ff",textDecoration:"none"}}>{ae.aePhone}</a>}
      </div>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

export default function LenderMatch() {
  const [form, setForm]         = useState(INITIAL_FORM);
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [showIneligible, setShowIneligible] = useState({ agency: false, nonqm: false });
  const [selectedLender, setSelectedLender] = useState(null);
  const [decisionModal, setDecisionModal]   = useState({ open: false, record: null });
  const [savingRecord, setSavingRecord]     = useState(false);
  const [recordSaving, setRecordSaving]     = useState(false);
  const [savedRecordId, setSavedRecordId]   = useState(null);
  const [savedLenderName, setSavedLenderName] = useState(null);
  // Borrower display info (loaded from scenario, not part of engine form)
  const [borrowerDisplay, setBorrowerDisplay] = useState({ name: '', address: '', firstTimeBuyer: false });

  const resultsRef = useRef(null);
  const { getAeInfo } = useLenderProfiles();
  const [searchParams] = useSearchParams();
  const scenarioIdParam = searchParams.get('scenarioId');
  const { reportFindings } = useDecisionRecord(scenarioIdParam);

  // ── Load scenario from Firestore ─────────────────────────────────────────
  useEffect(() => {
    if (!scenarioIdParam) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scenarios', scenarioIdParam));
        if (!snap.exists()) return;
        const s = snap.data();
        const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
        if (s.loanAmount)    f('loanAmount',    String(s.loanAmount));
        if (s.propertyValue) f('propertyValue', String(s.propertyValue));
        if (s.creditScore)   f('creditScore',   String(s.creditScore));
        if (s.state)         f('state',         s.state);
        if (s.loanType)      f('loanType',      s.loanType);
        if (s.propertyType)  f('propertyType',  s.propertyType);
        if (s.occupancy)     f('occupancy',     s.occupancy);
        if (s.monthlyIncome) f('monthlyIncome', String(s.monthlyIncome));
        if (s.monthlyDebts)  f('monthlyDebts',  String(s.monthlyDebts));
        if (s.lenderName)    setSavedLenderName(s.lenderName);
        // Borrower display info
        const name = [s.firstName, s.lastName].filter(Boolean).join(' ');
        const addr = [s.streetAddress, s.city, s.state, s.zipCode].filter(Boolean).join(', ');
        setBorrowerDisplay({ name, address: addr, firstTimeBuyer: s.firstTimeBuyer || false });
      } catch (e) { console.error('Scenario load:', e); }
    })();
  }, [scenarioIdParam]);

  const set = useCallback((field, value) => setForm(p => ({ ...p, [field]: value })), []);
  const setCurrency = useCallback((field, raw) => setForm(p => ({ ...p, [field]: parse(raw) })), []);

  const isNonQMPath    = INCOME_DOC_OPTIONS.find(o => o.value === form.incomeDocType)?.nonQM ?? false;
  const isDSCR         = form.incomeDocType === "dscr";
  const isAssetDepl    = form.incomeDocType === "assetDepletion";
  const isVA           = form.loanType === "VA" || form.loanType === "All";
  const hasCreditEvent = form.creditEvent !== "none";
  const computedLTV    = form.loanAmount && form.propertyValue
    ? ((form.loanAmount / form.propertyValue) * 100).toFixed(1) : null;

  // ── Run engine ────────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    setLoading(true); setError(null); setSelectedLender(null);
    try {
      const raw = {
        ...form,
        loanAmount:        Number(form.loanAmount)        || 0,
        propertyValue:     Number(form.propertyValue)     || 0,
        creditScore:       Number(form.creditScore)       || 0,
        monthlyIncome:     Number(form.monthlyIncome)     || 0,
        monthlyDebts:      Number(form.monthlyDebts)      || 0,
        dscr:              form.dscr ? parseFloat(form.dscr) : null,
        totalAssets:       Number(form.totalAssets)       || 0,
        reservesMonths:    Number(form.reservesMonths)    || 0,
        creditEventMonths: Number(form.creditEventMonths) || 0,
      };
      await new Promise(r => setTimeout(r, 60));
      const engineResult = runLenderMatch(raw, { firestoreAvailable: true });
      setResults(engineResult);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(err?.message || "Unexpected error. Please try again.");
    } finally { setLoading(false); }
  }, [form]);

  const handleClear = useCallback(() => {
    setForm(INITIAL_FORM); setResults(null); setError(null); setSelectedLender(null);
  }, []);

  const handleSaveToRecord = async () => {
    if (!results) return;
    setRecordSaving(true);
    try {
      const id = await reportFindings('LENDER_MATCH', {
        totalEligible:  results.totalEligible,
        topLender:      results.agencySection?.eligible?.[0]?.lenderName || null,
        agencyEligible: results.agencySection?.eligible?.length || 0,
        nonQMEligible:  results.nonQMSection?.eligible?.length  || 0,
        timestamp:      new Date().toISOString(),
      });
      if (id) setSavedRecordId(id);
    } catch (e) { console.error('DR save failed:', e); }
    finally { setRecordSaving(false); }
  };

  const handleSelectLender = useCallback((result) => {
    if (!results) return;
    setSelectedLender(result.lenderId);
    const scenario = normalizeScenario({
      ...form,
      loanAmount:    Number(form.loanAmount)    || 0,
      propertyValue: Number(form.propertyValue) || 0,
      creditScore:   Number(form.creditScore)   || 0,
    });
    setDecisionModal({ open: true, record: buildDecisionRecord(result, scenario, results), result });
  }, [form, results]);

  // ── Save Decision Record + write lender back to scenario ─────────────────
  const handleSaveDecisionRecord = useCallback(async (record) => {
    setSavingRecord(true);
    try {
      // 1. Save Decision Record to Firestore
      await addDoc(collection(db, "decisionRecords"), {
        ...record,
        savedAt: serverTimestamp(),
      });

      // 2. Write selected lender back to scenario so DPA Intelligence
      //    can show the Request Approval button automatically
      if (scenarioIdParam && record.selectedLenderId) {
        await updateDoc(doc(db, 'scenarios', scenarioIdParam), {
          lenderId:         record.selectedLenderId,
          lenderName:       record.profileName || '',
          lenderSelectedAt: serverTimestamp(),
        });
        setSavedLenderName(record.profileName || '');
        console.log(`[LenderMatch] ✓ Lender written to scenario: ${record.profileName}`);
      }

      setDecisionModal(prev => ({ ...prev, saved: true }));
    } catch (err) {
      console.error("[LenderMatch] Error saving Decision Record:", err);
    } finally { setSavingRecord(false); }
  }, [scenarioIdParam]);

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !loading) handleRun(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleRun, loading]);


  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logoGroup}>
            <div style={S.logoIcon}>🔦</div>
            <div>
              <div style={S.logoText}>Lender Match™</div>
              <div style={S.logoSubtext}>Decision Intelligence Engine</div>
            </div>
          </div>
          <div style={S.headerMeta}>
            {/* Show saved lender confirmation badge */}
            {savedLenderName && (
              <span style={{ ...S.engineBadge, color: T.greenLight, borderColor: T.greenBorder }}>
                ✓ {savedLenderName} linked to scenario
              </span>
            )}
            {results && <span style={S.engineBadge}>{results.totalEligible} eligible · {results.timestamp?.slice(0,10)}</span>}
            <span style={S.engineBadge}>ENGINE v{ENGINE_VERSION}</span>
          </div>
        </div>
      </header>

      {/* ── BORROWER INFO BANNER ── */}
      {(borrowerDisplay.name || scenarioIdParam) && (
        <div style={{ backgroundColor: "#1B3A6B", padding: "10px 24px" }}>
          <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>
              Borrower Scenario — Lender Match™
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "24px" }}>
              {borrowerDisplay.name && (
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>{borrowerDisplay.name}</span>
              )}
              {borrowerDisplay.address && (
                <span style={{ color: "#bfdbfe", fontSize: "13px" }}>{borrowerDisplay.address}</span>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "13px", color: "#dbeafe" }}>
                {form.creditScore > 0   && <span>FICO <strong style={{ color: "#fff" }}>{form.creditScore}</strong></span>}
                {form.loanType          && <span>Loan <strong style={{ color: "#fff" }}>{form.loanType === "All" ? "All Programs" : form.loanType}</strong></span>}
                {form.propertyValue > 0 && <span>Price <strong style={{ color: "#fff" }}>${Number(form.propertyValue).toLocaleString()}</strong></span>}
                {form.loanAmount > 0    && <span>Loan Amt <strong style={{ color: "#fff" }}>${Number(form.loanAmount).toLocaleString()}</strong></span>}
                {computedLTV            && <span>LTV <strong style={{ color: "#fff" }}>{computedLTV}%</strong></span>}
                {form.state             && <span>State <strong style={{ color: "#fff" }}>{form.state}</strong></span>}
                <span style={{ color: borrowerDisplay.firstTimeBuyer ? "#6ee7b7" : "#bfdbfe", fontWeight: borrowerDisplay.firstTimeBuyer ? 600 : 400 }}>
                  {borrowerDisplay.firstTimeBuyer ? "FTHB ✓" : "Not FTHB"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <main style={S.body}>

        {/* ── FORM ── */}
        <div style={S.formSection}>
          <div style={S.formCard}>
            <div style={S.formCardHeader}>
              <div style={S.formCardTitle}><span style={S.formCardTitleDot} />Loan Scenario</div>
              {computedLTV && (
                <div style={{fontFamily:T.fontMono,fontSize:"11px",color:T.textSecondary,display:"flex",alignItems:"center",gap:"6px"}}>
                  <span style={{color:T.textMuted}}>Computed LTV:</span>
                  <span style={{color: parseFloat(computedLTV)>95 ? T.textRed : parseFloat(computedLTV)>80 ? T.textAmber : T.greenLight, fontWeight:600}}>{computedLTV}%</span>
                </div>
              )}
            </div>

            <div style={S.formBody}>

              {/* Program & Transaction */}
              <div style={S.formSectionLabel}><span style={{width:"12px",height:"1px",backgroundColor:T.amber,display:"inline-block"}} />Program & Transaction</div>
              <div style={{...S.formGrid,marginBottom:"20px"}}>
                <FormGroup label="Loan Type">
                  <select className="lm-select" style={S.select} value={form.loanType} onChange={e=>set("loanType",e.target.value)}>
                    {LOAN_TYPE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormGroup>
                <FormGroup label="Transaction Type"><TransactionToggle value={form.transactionType} onChange={v=>set("transactionType",v)} /></FormGroup>
                <FormGroup label="Intent" tag="optional">
                  <select className="lm-select" style={S.select} value={form.intent} onChange={e=>set("intent",e.target.value)}>
                    {INTENT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormGroup>
              </div>
              <div style={S.formDivider} />

              {/* Loan Details */}
              <div style={S.formSectionLabel}><span style={{width:"12px",height:"1px",backgroundColor:T.amber,display:"inline-block"}} />Loan Details</div>
              <div style={{...S.formGrid,marginBottom:"20px"}}>
                <FormGroup label="Loan Amount"><input className="lm-input" style={S.input} type="text" inputMode="numeric" placeholder="e.g. 450,000" value={form.loanAmount ? fmt(form.loanAmount) : ""} onChange={e=>setCurrency("loanAmount",e.target.value)} /></FormGroup>
                <FormGroup label="Property Value"><input className="lm-input" style={S.input} type="text" inputMode="numeric" placeholder="e.g. 562,500" value={form.propertyValue ? fmt(form.propertyValue) : ""} onChange={e=>setCurrency("propertyValue",e.target.value)} /></FormGroup>
                <FormGroup label="Credit Score"><input className="lm-input" style={S.input} type="number" min="300" max="850" placeholder="500–850" value={form.creditScore} onChange={e=>set("creditScore",e.target.value)} /></FormGroup>
                <FormGroup label="State">
                  <select className="lm-select" style={S.select} value={form.state} onChange={e=>set("state",e.target.value)}>
                    <option value="">Select state…</option>
                    {US_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </FormGroup>
              </div>
              <div style={S.formDivider} />

              {/* Property */}
              <div style={S.formSectionLabel}><span style={{width:"12px",height:"1px",backgroundColor:T.amber,display:"inline-block"}} />Property</div>
              <div style={{...S.formGrid,marginBottom:"20px"}}>
                <FormGroup label="Property Type">
                  <select className="lm-select" style={S.select} value={form.propertyType} onChange={e=>set("propertyType",e.target.value)}>
                    {PROPERTY_TYPE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormGroup>
                <FormGroup label="Occupancy">
                  <select className="lm-select" style={S.select} value={form.occupancy} onChange={e=>set("occupancy",e.target.value)}>
                    <option value="Primary">Primary Residence</option>
                    <option value="SecondHome">Second Home</option>
                    <option value="Investment">Investment Property</option>
                  </select>
                </FormGroup>
                <FormGroup label="Self-Employed">
                  <div style={{paddingTop:"6px"}}><Toggle value={form.selfEmployed} onChange={v=>set("selfEmployed",v)} label={form.selfEmployed?"Yes — self-employed":"No — W2 / salaried"} /></div>
                </FormGroup>
              </div>
              <div style={S.formDivider} />

              {/* Income Documentation */}
              <div style={S.formSectionLabel}>
                <span style={{width:"12px",height:"1px",backgroundColor:T.amber,display:"inline-block"}} />
                Income Documentation
                {isNonQMPath && <span style={{...S.labelTag,...S.labelTagAmber}}>Non-QM Path</span>}
              </div>
              <div style={{...S.formGrid,marginBottom:"20px"}}>
                <FormGroup label="Documentation Type">
                  <select className="lm-select" style={S.select} value={form.incomeDocType} onChange={e=>set("incomeDocType",e.target.value)}>
                    {INCOME_DOC_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormGroup>
                {!isNonQMPath && (<>
                  <FormGroup label="Monthly Income (Gross)"><input className="lm-input" style={S.input} type="text" inputMode="numeric" placeholder="e.g. 8,500" value={form.monthlyIncome ? fmt(form.monthlyIncome) : ""} onChange={e=>setCurrency("monthlyIncome",e.target.value)} /></FormGroup>
                  <FormGroup label="Monthly Debts (PITIA + all)"><input className="lm-input" style={S.input} type="text" inputMode="numeric" placeholder="e.g. 3,200" value={form.monthlyDebts ? fmt(form.monthlyDebts) : ""} onChange={e=>setCurrency("monthlyDebts",e.target.value)} /></FormGroup>
                </>)}
                {isDSCR && (<>
                  <FormGroup label="Gross Rental Income / Month" tag="auto-calc"><input className="lm-input" style={S.input} type="text" inputMode="numeric" placeholder="e.g. 2,800" value={form.grossRentalIncome ? fmt(form.grossRentalIncome) : ""} onChange={e=>setCurrency("grossRentalIncome",e.target.value)} /></FormGroup>
                  <FormGroup label="DSCR Ratio" tag="optional"><input className="lm-input" style={S.input} type="number" step="0.01" min="0" placeholder="e.g. 1.15" value={form.dscr} onChange={e=>set("dscr",e.target.value)} /></FormGroup>
                </>)}
                {isAssetDepl && (
                  <FormGroup label="Total Qualifying Assets" tag="asset depletion" tagVariant="amber"><input className="lm-input" style={S.input} type="text" inputMode="numeric" placeholder="e.g. 1,200,000" value={form.totalAssets ? fmt(form.totalAssets) : ""} onChange={e=>setCurrency("totalAssets",e.target.value)} /></FormGroup>
                )}
                <FormGroup label="Post-Close Reserves (months)"><input className="lm-input" style={S.input} type="number" min="0" placeholder="e.g. 3" value={form.reservesMonths} onChange={e=>set("reservesMonths",e.target.value)} /></FormGroup>
              </div>
              <div style={S.formDivider} />

              {/* Credit & VA */}
              <div style={S.formSectionLabel}><span style={{width:"12px",height:"1px",backgroundColor:T.amber,display:"inline-block"}} />Credit & VA Details</div>
              <div style={{...S.formGrid,marginBottom:hasCreditEvent?"20px":"0"}}>
                <FormGroup label="Credit Event">
                  <select className="lm-select" style={S.select} value={form.creditEvent} onChange={e=>set("creditEvent",e.target.value)}>
                    {CREDIT_EVENT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormGroup>
                {hasCreditEvent && <FormGroup label="Months Since Discharge / Close"><input className="lm-input" style={S.input} type="number" min="0" placeholder="e.g. 18" value={form.creditEventMonths} onChange={e=>set("creditEventMonths",e.target.value)} /></FormGroup>}
                {isVA && (
                  <FormGroup label="VA Entitlement" tag="VA">
                    <select className="lm-select" style={S.select} value={form.vaEntitlement} onChange={e=>set("vaEntitlement",e.target.value)}>
                      <option value="Full">Full Entitlement</option>
                      <option value="Reduced">Reduced Entitlement</option>
                      <option value="None">None / Not Applicable</option>
                    </select>
                  </FormGroup>
                )}
              </div>
            </div>

            <div style={S.formFooter}>
              <button className="lm-btn-submit" style={S.submitBtn(loading)} onClick={handleRun} disabled={loading} type="button">
                {loading ? <><div style={{width:"14px",height:"14px",border:`2px solid ${T.amberBorder}`,borderTop:`2px solid ${T.amberLight}`,borderRadius:"50%",animation:"spin 0.7s linear infinite"}} />Matching…</> : <>🔍 Run Lender Match</>}
              </button>
              <button className="lm-btn-clear" style={S.clearBtn} onClick={handleClear} type="button">Clear</button>
              <span style={{fontFamily:T.fontMono,fontSize:"10px",color:T.textMuted,marginLeft:"auto"}}>⌘↵ to run</span>
            </div>
          </div>
        </div>

        {error && <div style={S.errorBox}><span style={{fontSize:"16px"}}>⚠️</span><span style={S.errorText}>{error}</span></div>}

        {loading && (
          <div style={S.loadingBox}>
            <div style={S.loadingSpinner} />
            <div style={S.loadingText}>EVALUATING LENDERS · 7-STEP PIPELINE</div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {results && !loading && (
          <div ref={resultsRef}>
            <div style={S.resultsHeader}>
              <div>
                <div style={S.resultsTitle}>Match Results</div>
                <div style={S.resultsMeta}>{results.scenarioSummary}</div>
              </div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
                <ConfidenceBarInline confidence={results.confidence} />
                <OverlayRiskBadgeInline risk={results.overlayRisk} />
              </div>
            </div>

            <div style={S.statsRow}>
              <div style={S.statChip}><div style={S.statChipDot(T.blueLight)} />{results.agencySection?.totalEligible??0} Agency eligible</div>
              <div style={S.statChip}><div style={S.statChipDot(T.amber)} />{results.nonQMSection?.totalEligible??0} Alternative Path eligible</div>
            </div>

            {/* Agency */}
            <div style={S.agencyHeader}>
              <div style={S.agencyHeaderDot} />
              <span style={S.agencyHeaderTitle}>Agency Path</span>
              <span style={{fontFamily:T.fontMono,fontSize:"10px",color:T.textMuted,marginLeft:"6px"}}>Conventional · FHA · VA</span>
              <span style={S.agencyHeaderSub}>{results.agencySection?.totalEligible??0} of {(results.agencySection?.eligible?.length??0)+(results.agencySection?.ineligible?.length??0)} eligible</span>
            </div>
            {results.agencySection?.noMatch ? (
              <div style={{...S.noMatchBox,border:`1px solid ${T.border}`,borderTop:"none"}}>
                <span style={S.noMatchIcon}>🚫</span>
                <div style={S.noMatchTitle}>No Agency Lenders Matched</div>
                <div style={S.noMatchText}>{results.agencySection.noMatchMessage}</div>
              </div>
            ) : (
              <div style={S.cardsGrid}>
                {(results.agencySection?.eligible||[]).map((result,i) => (
                  <div key={`${result.lenderId}-${result.program}-${i}`}>
                    <LenderScorecardCard result={result} onSelectLender={handleSelectLender} isSelected={selectedLender===result.lenderId} />
                    <AePanel lenderName={result.lenderName} getAeInfo={getAeInfo} />
                  </div>
                ))}
              </div>
            )}
            {(results.agencySection?.ineligible?.length??0)>0 && (<>
              <div className="lm-ineligible-toggle" style={S.ineligibleToggle} onClick={()=>setShowIneligible(s=>({...s,agency:!s.agency}))}>
                {showIneligible.agency?"▲":"▼"}&nbsp;{results.agencySection.ineligible.length} ineligible — click to {showIneligible.agency?"hide":"see why"}
              </div>
              {showIneligible.agency && <div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:`0 0 ${T.radius} ${T.radius}`,overflow:"hidden"}}>{(results.agencySection?.ineligible||[]).map((r,i)=><IneligibleLenderRow key={i} result={r} />)}</div>}
            </>)}

            {/* Alternative Path */}
            <div style={{marginTop:"32px"}} />
            <div style={S.altHeader(results.nonQMSection?.isHero)}>
              <div style={S.altHeaderDot(results.nonQMSection?.isHero)} />
              <span style={S.altHeaderTitle(results.nonQMSection?.isHero)}>Alternative Path</span>
              <span style={{fontFamily:T.fontMono,fontSize:"10px",color:T.textMuted,marginLeft:"6px"}}>Non-QM · Bank Statement · DSCR · Asset Depletion</span>
              {results.nonQMSection?.isHero && <span style={S.altHeaderHeroBadge}>PRIMARY PATH</span>}
              <span style={{marginLeft:"auto",fontFamily:T.fontMono,fontSize:"10px",color:T.textMuted}}>{results.nonQMSection?.totalEligible??0} of {(results.nonQMSection?.eligible?.length??0)+(results.nonQMSection?.ineligible?.length??0)} eligible</span>
            </div>
            {results.nonQMSection?.hasPlaceholders && <PlaceholderBanner />}
            {results.nonQMSection?.noMatch ? (
              <div style={{...S.noMatchBox,border:`1px solid ${T.border}`}}>
                <span style={S.noMatchIcon}>📋</span>
                <div style={S.noMatchTitle}>No Alternative Path Results</div>
                <div style={S.noMatchText}>{results.nonQMSection.noMatchMessage}</div>
              </div>
            ) : (
              <div style={S.cardsGrid}>
                {(results.nonQMSection?.eligible||[]).map((result,i) => (
                  <div key={`${result.lenderId}-${result.program}-${i}`}>
                    <AlternativeLenderCard result={result} onSelectLender={handleSelectLender} isSelected={selectedLender===result.lenderId} />
                    <AePanel lenderName={result.lenderName} getAeInfo={getAeInfo} />
                  </div>
                ))}
              </div>
            )}
            {(results.nonQMSection?.ineligible?.length??0)>0 && (<>
              <div className="lm-ineligible-toggle" style={S.ineligibleToggle} onClick={()=>setShowIneligible(s=>({...s,nonqm:!s.nonqm}))}>
                {showIneligible.nonqm?"▲":"▼"}&nbsp;{results.nonQMSection.ineligible.length} ineligible — click to {showIneligible.nonqm?"hide":"see why"}
              </div>
              {showIneligible.nonqm && <div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:`0 0 ${T.radius} ${T.radius}`,overflow:"hidden"}}>{(results.nonQMSection?.ineligible||[]).map((r,i)=><IneligibleLenderRow key={i} result={r} />)}</div>}
            </>)}
          </div>
        )}
      </main>

      {scenarioIdParam && <DecisionRecordBanner recordId={savedRecordId} moduleName="Lender Match™" onSave={handleSaveToRecord} saving={recordSaving} />}

      {decisionModal.open && (
        <DecisionRecordModal
          record={decisionModal.record}
          result={decisionModal.result}
          saved={decisionModal.saved}
          saving={savingRecord}
          onSave={handleSaveDecisionRecord}
          onClose={() => setDecisionModal({ open: false, record: null })}
        />
      )}

      <CanonicalSequenceBar currentModuleKey="LENDER_MATCH" scenarioId={scenarioIdParam} recordId={null} />
    </div>
  );
}
