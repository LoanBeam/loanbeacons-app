import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  serverTimestamp, query, where, orderBy
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";

// ─── Agency Standards (Layer 1 — Pre-loaded by LoanBeacons) ─────────────────
// Source: FHA 4000.1, Fannie Mae Selling Guide, Freddie Mac SF Guide,
//         VA Lenders Handbook (VA Pamphlet 26-7), USDA HB-1-3555
const AGENCY_STANDARDS = {
  FHA: {
    label: "FHA", fullName: "Federal Housing Administration",
    source: "HUD Handbook 4000.1", icon: "🏛️",
    color: "blue", updateFreq: "2–3x/year",
    sourceUrl: "https://hud.gov",
    fields: {
      minFICO: { label: "Minimum Credit Score", value: 580, note: "500–579 requires 10% down. AUS may approve lower with compensating factors." },
      minFICO_10pct: { label: "Min FICO (10% Down)", value: 500, note: "Borrowers 500–579 require minimum 10% down payment." },
      maxDTI: { label: "Maximum DTI (AUS)", value: 57, unit: "%", note: "FHA allows up to 57% with AUS approval. Manual underwrite max 43% (or 45% with compensating factors)." },
      maxDTI_manual: { label: "Maximum DTI (Manual UW)", value: 43, unit: "%", note: "Manual underwrite max 43%. Up to 45% with 2 compensating factors." },
      maxLTV_purchase: { label: "Max LTV — Purchase", value: 96.5, unit: "%", note: "96.5% = 3.5% minimum down payment. FICO ≥ 580 required." },
      maxLTV_rateterm: { label: "Max LTV — Rate/Term Refi", value: 97.75, unit: "%", note: "No cash-out. Primary residence only." },
      maxLTV_cashout: { label: "Max LTV — Cash-Out Refi", value: 80, unit: "%", note: "Owner-occupied primary residence. 12-month seasoning required." },
      mipUpfront: { label: "Upfront MIP", value: 1.75, unit: "%", note: "1.75% of base loan amount. Can be financed into the loan." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 24, unit: "months", note: "2 years from discharge date. 1 year allowed with extenuating circumstances + reestablished credit." },
      bkChapter13: { label: "BK Chapter 13 Seasoning", value: 12, unit: "months", note: "12 months of payments made on time + court approval required." },
      foreclosure: { label: "Foreclosure Seasoning", value: 36, unit: "months", note: "3 years from completion date. 1 year with extenuating circumstances." },
      shortsale: { label: "Short Sale / DIL Seasoning", value: 36, unit: "months", note: "3 years. May be reduced with extenuating circumstances." },
      maxLoanLimit: { label: "Loan Limit (Standard Areas)", value: 498257, prefix: "$", note: "2024 standard area limit. High-cost areas up to $1,149,825." },
      selfEmployed: { label: "Self-Employed Doc Requirement", value: "2 years", note: "2 years self-employment history required. 1 year possible with prior employment in same field." },
      reserves: { label: "Reserve Requirement", value: "None required", note: "No minimum reserve requirement by FHA. Lenders may impose overlays." },
    }
  },
  CONVENTIONAL: {
    label: "Conventional", fullName: "Fannie Mae / Freddie Mac",
    source: "Fannie Mae Selling Guide + Freddie Mac SF Guide", icon: "🏦",
    color: "indigo", updateFreq: "Monthly",
    sourceUrl: "https://fanniemae.com",
    fields: {
      minFICO: { label: "Minimum Credit Score", value: 620, note: "620 minimum. DU/LPA may approve lower in rare cases. Best pricing at 740+." },
      maxDTI: { label: "Maximum DTI", value: 50, unit: "%", note: "45–50% with DU/LPA approval. Manual underwrite max 36–45% depending on LTV/reserves." },
      maxLTV_purchase_primary: { label: "Max LTV — Purchase (Primary)", value: 97, unit: "%", note: "97% for first-time homebuyers (HomeReady/Home Possible). 95% standard purchase." },
      maxLTV_purchase_2unit: { label: "Max LTV — Purchase (2-4 Unit)", value: 85, unit: "%", note: "2-unit primary: 85%. 3-4 unit primary: 75%." },
      maxLTV_investment: { label: "Max LTV — Investment Property", value: 75, unit: "%", note: "Single-unit investment: 85% purchase / 75% refi. 2-4 unit investment: 75%." },
      maxLTV_cashout: { label: "Max LTV — Cash-Out Refi", value: 80, unit: "%", note: "Primary residence: 80%. Investment property: 75%. 6-month seasoning required." },
      conformingLimit: { label: "Conforming Loan Limit", value: 766550, prefix: "$", note: "2024 standard conforming limit. High-cost up to $1,149,825." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 48, unit: "months", note: "4 years from discharge. 2 years with extenuating circumstances (documented hardship)." },
      foreclosure: { label: "Foreclosure Seasoning", value: 84, unit: "months", note: "7 years standard. 3 years with extenuating circumstances + max 90% LTV." },
      shortsale: { label: "Short Sale Seasoning", value: 48, unit: "months", note: "4 years standard. 2 years with extenuating circumstances." },
      pmi_ltv: { label: "PMI Required Above", value: 80, unit: "%", note: "Private mortgage insurance required when LTV > 80%. Automatically cancelled at 78% LTV." },
      reserves_2unit: { label: "Reserves — 2-4 Unit", value: 6, unit: "months PITI", note: "6 months PITI reserves required for 2-4 unit properties." },
      selfEmployed: { label: "Self-Employed Doc", value: "2 years", note: "2 years tax returns (personal + business). YTD P&L for current year." },
    }
  },
  VA: {
    label: "VA", fullName: "Department of Veterans Affairs",
    source: "VA Lenders Handbook (VA Pamphlet 26-7)", icon: "🎖️",
    color: "emerald", updateFreq: "Periodic + Circulars",
    sourceUrl: "https://benefits.va.gov",
    fields: {
      minFICO: { label: "Minimum Credit Score (Agency)", value: 0, note: "VA sets no minimum FICO. All lenders impose overlays (typically 580–640). Qualify on residual income + DTI." },
      maxDTI: { label: "Maximum DTI", value: 41, unit: "%", note: "41% guideline. Higher DTI acceptable with sufficient residual income. No hard cap by VA." },
      maxLTV_purchase: { label: "Max LTV — Purchase", value: 100, unit: "%", note: "100% financing for eligible veterans with full entitlement. No down payment required." },
      maxLTV_cashout: { label: "Max LTV — Cash-Out Refi", value: 100, unit: "%", note: "VA Type II cash-out: up to 100% LTV. Type I (no additional cash): up to 100%." },
      fundingFee_first: { label: "Funding Fee — First Use", value: 2.15, unit: "%", note: "2.15% for first use with 0% down. Reduced with 5%+ or 10%+ down. Waived for disabled veterans." },
      fundingFee_subsequent: { label: "Funding Fee — Subsequent Use", value: 3.3, unit: "%", note: "3.30% for subsequent use with 0% down. Same reductions apply." },
      fundingFee_irrrl: { label: "Funding Fee — IRRRL", value: 0.5, unit: "%", note: "0.50% on all IRRRLs. Waived for disabled veterans." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 24, unit: "months", note: "2 years from discharge. Credit reestablished required." },
      foreclosure: { label: "Foreclosure Seasoning", value: 24, unit: "months", note: "2 years. Lender overlays often require 36+ months." },
      residualIncome: { label: "Residual Income Required", value: "Yes", note: "Residual income test required. Varies by family size and region. This is VA's primary qualifying metric." },
      entitlement: { label: "Loan Limit (Full Entitlement)", value: "No limit", note: "Veterans with full entitlement have no loan limit. Reduced entitlement: county conforming limit." },
      pmi: { label: "PMI / MIP Required", value: "None", note: "VA loans have no private mortgage insurance at any LTV. Funding fee only." },
    }
  },
  USDA: {
    label: "USDA", fullName: "USDA Rural Development",
    source: "USDA HB-1-3555", icon: "🌾",
    color: "amber", updateFreq: "1–2x/year",
    sourceUrl: "https://rd.usda.gov",
    fields: {
      minFICO: { label: "Minimum Credit Score (GUS)", value: 640, note: "640 for GUS automated approval. Lower FICO requires manual underwrite." },
      maxDTI: { label: "Maximum DTI", value: 41, unit: "%", note: "29/41% guideline ratios. GUS may approve higher. Manual underwrite max 29/41%." },
      maxLTV_purchase: { label: "Max LTV — Purchase", value: 100, unit: "%", note: "100% financing + can finance guarantee fee. No down payment required." },
      guaranteeFee: { label: "Upfront Guarantee Fee", value: 1.0, unit: "%", note: "1.00% of loan amount. Can be financed into the loan." },
      annualFee: { label: "Annual Fee (MIP equivalent)", value: 0.35, unit: "%", note: "0.35% of outstanding balance annually. Paid monthly." },
      incomeLimit: { label: "Income Limit", value: "115% of AMI", note: "Borrower household income cannot exceed 115% of area median income. Check USDA eligibility maps." },
      propertyEligibility: { label: "Property Eligibility", value: "Rural areas only", note: "Property must be in USDA-eligible rural area. Check USDA property eligibility map." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 36, unit: "months", note: "3 years from discharge date." },
      foreclosure: { label: "Foreclosure Seasoning", value: 36, unit: "months", note: "3 years from completion date." },
    }
  }
};

// ─── Field helpers ────────────────────────────────────────────────────────────
const f$ = n => "$" + Number(n).toLocaleString("en-US");
const fp = (n, u) => u === "%" ? `${n}%` : u === "months" ? `${n} mo` : u === "months PITI" ? `${n} mo PITI` : u ? `${n} ${u}` : String(n);

// Color maps
const agencyColors = {
  blue: { bg: "bg-blue-900/20", border: "border-blue-700/50", badge: "bg-blue-800/60 text-blue-300", text: "text-blue-400" },
  indigo: { bg: "bg-indigo-900/20", border: "border-indigo-700/50", badge: "bg-indigo-800/60 text-indigo-300", text: "text-indigo-400" },
  emerald: { bg: "bg-emerald-900/20", border: "border-emerald-700/50", badge: "bg-emerald-800/60 text-emerald-300", text: "text-emerald-400" },
  amber: { bg: "bg-amber-900/20", border: "border-amber-700/50", badge: "bg-amber-800/60 text-amber-300", text: "text-amber-400" },
};

// ─── Overlay input component ─────────────────────────────────────────────────
function OverlayInput({ fieldKey, agencyField, overlay, onChange, channelOverlay, onChannelChange }) {
  const [open, setOpen] = useState(false);
  const hasOverlay = overlay !== undefined && overlay !== "" && overlay !== null;
  const hasChannel = channelOverlay !== undefined && channelOverlay !== "" && channelOverlay !== null;
  const displayVal = hasChannel ? channelOverlay : hasOverlay ? overlay : null;
  const effective = displayVal !== null ? displayVal : agencyField.value;

  return (
    <div className={`rounded-xl border transition-all ${hasChannel ? "bg-purple-900/20 border-purple-700/40" : hasOverlay ? "bg-orange-900/20 border-orange-700/40" : "bg-slate-800/40 border-slate-700/50"} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{agencyField.label}</p>
            {hasChannel && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-purple-800/60 text-purple-300">CHANNEL OVERRIDE</span>}
            {hasOverlay && !hasChannel && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-orange-800/60 text-orange-300">LENDER OVERLAY</span>}
            {!hasOverlay && !hasChannel && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-700/60 text-slate-400">FOLLOWS AGENCY</span>}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-slate-500 text-xs line-through">
              {agencyField.prefix || ""}{typeof agencyField.value === "number" ? fp(agencyField.value, agencyField.unit) : agencyField.value}
            </span>
            <span className="text-white font-bold font-mono text-sm">
              {agencyField.prefix || ""}{typeof effective === "number" ? fp(effective, agencyField.unit) : effective}
            </span>
          </div>
          {agencyField.note && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{agencyField.note}</p>}
        </div>
        <button onClick={() => setOpen(!open)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold flex-shrink-0">
          {open ? "Close" : "✏️ Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-orange-400 mb-1">Layer 2 — Lender Overlay</label>
            <p className="text-xs text-slate-500 mb-2">Enter ONLY if this lender differs from the agency standard above.</p>
            <input type="text" value={overlay || ""} onChange={e => onChange(fieldKey, e.target.value)}
              placeholder={`Agency standard: ${agencyField.prefix || ""}${typeof agencyField.value === "number" ? fp(agencyField.value, agencyField.unit) : agencyField.value}`}
              className="w-full bg-slate-700 border border-orange-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400 placeholder-slate-500"/>
            {hasOverlay && <button onClick={() => onChange(fieldKey, "")} className="mt-1 text-xs text-red-400 hover:text-red-300">↺ Remove overlay — revert to agency</button>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-purple-400 mb-1">Layer 3 — Channel Override</label>
            <p className="text-xs text-slate-500 mb-2">AE-negotiated exception. Overrides lender overlay above.</p>
            <input type="text" value={channelOverlay || ""} onChange={e => onChannelChange(fieldKey, e.target.value)}
              placeholder="e.g. 660 per AE agreement dated Feb 2026"
              className="w-full bg-slate-700 border border-purple-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-400 placeholder-slate-500"/>
            {hasChannel && <button onClick={() => onChannelChange(fieldKey, "")} className="mt-1 text-xs text-red-400 hover:text-red-300">↺ Remove channel override</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agency Standards Tab ────────────────────────────────────────────────────
function AgencyStandardsTab() {
  const [activeAgency, setActiveAgency] = useState("FHA");
  const [expandedField, setExpandedField] = useState(null);
  const agency = AGENCY_STANDARDS[activeAgency];
  const colors = agencyColors[agency.color];

  return (
    <div>
      <div className="mb-6 p-4 bg-slate-800/60 border border-slate-700 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
          <p className="text-xs font-bold text-green-400 uppercase tracking-widest">Layer 1 — Agency Standards</p>
        </div>
        <p className="text-sm text-slate-300">Pre-loaded and maintained by LoanBeacons™. Updated within 5 business days of any agency publication. These are the baseline values — lender overlays (Layer 2) and channel overrides (Layer 3) are applied on top.</p>
      </div>

      {/* Agency selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(AGENCY_STANDARDS).map(([key, ag]) => (
          <button key={key} onClick={() => setActiveAgency(key)}
            className={`p-4 rounded-xl border text-center transition-all ${activeAgency === key ? `${agencyColors[ag.color].bg} ${agencyColors[ag.color].border}` : "bg-slate-800/40 border-slate-700 hover:border-slate-500"}`}>
            <div className="text-2xl mb-1">{ag.icon}</div>
            <p className="font-bold text-white text-sm">{ag.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{ag.fullName}</p>
          </button>
        ))}
      </div>

      {/* Agency header */}
      <div className={`rounded-xl p-5 border mb-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{agency.icon}</span>
              <h3 className={`text-lg font-bold ${colors.text}`}>{agency.fullName}</h3>
            </div>
            <p className="text-xs text-slate-400">Source: {agency.source}</p>
            <p className="text-xs text-slate-500 mt-0.5">Update frequency: {agency.updateFreq}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${colors.badge}`}>
            ✓ Current — LoanBeacons Verified
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {Object.entries(agency.fields).map(([key, field]) => (
          <div key={key} className={`rounded-xl border p-4 cursor-pointer transition-all hover:border-slate-500 ${expandedField === key ? "bg-slate-800/60 border-slate-500" : "bg-slate-800/30 border-slate-700"}`}
            onClick={() => setExpandedField(expandedField === key ? null : key)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-1 h-8 rounded-full ${colors.text.replace("text-", "bg-")}`}/>
                <div>
                  <p className="text-xs font-semibold text-slate-400">{field.label}</p>
                  <p className={`text-lg font-bold font-mono ${colors.text}`}>
                    {field.prefix || ""}{typeof field.value === "number" ? fp(field.value, field.unit) : field.value}
                  </p>
                </div>
              </div>
              <span className="text-slate-500 text-sm">{expandedField === key ? "▲" : "▼"}</span>
            </div>
            {expandedField === key && (
              <div className={`mt-3 pt-3 border-t ${colors.border} text-sm text-slate-300 leading-relaxed`}>
                {field.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LenderProfileBuilder() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState("standards"); // standards | profiles | add
  const [lenders, setLenders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewLender, setViewLender] = useState(null);

  // New lender form state
  const [form, setForm] = useState({
    name: "", nmls: "", type: "wholesale", // wholesale | correspondent | retail
    loanTypes: [],
    aeContact: "", aeEmail: "", aePhone: "",
    notes: "",
  });

  // Layer 2 overlays (lender differs from agency)
  const [overlays, setOverlays] = useState({});
  // Layer 3 channel overrides (AE-negotiated)
  const [channelOverrides, setChannelOverrides] = useState({});
  // Which agencies does this lender offer?
  const [lenderAgencies, setLenderAgencies] = useState([]);

  // Load saved lenders from Firestore
  useEffect(() => {
    loadLenders();
  }, []);

  const loadLenders = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "lenderProfiles"));
      setLenders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Load lenders:", e);
    }
    setLoading(false);
  };

  const saveLender = async () => {
    if (!form.name || !form.nmls) return;
    try {
      const payload = {
        ...form,
        agencies: lenderAgencies,
        overlays,
        channelOverrides,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "BROKER_PRIVATE",
        visibility: "private",
        agencyStandardRefs: lenderAgencies,
        layer1: "AGENCY_STANDARDS_V1",
      };
      const ref = await addDoc(collection(db, "lenderProfiles"), payload);
      // Decision log
      try {
        await addDoc(collection(db, "platform_activity"), {
          module: "Lender Profile Builder",
          action: "lender_created",
          lenderId: ref.id,
          lenderName: form.name,
          timestamp: serverTimestamp(),
        });
      } catch (_) {}
      setSaved(true);
      setForm({ name: "", nmls: "", type: "wholesale", loanTypes: [], aeContact: "", aeEmail: "", aePhone: "", notes: "" });
      setOverlays({});
      setChannelOverrides({});
      setLenderAgencies([]);
      await loadLenders();
      setTab("profiles");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Save lender:", e);
    }
  };

  const toggleAgency = (a) => setLenderAgencies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  const toggleLoanType = (t) => setForm(f => ({ ...f, loanTypes: f.loanTypes.includes(t) ? f.loanTypes.filter(x => x !== t) : [...f.loanTypes, t] }));

  const setOverlay = (field, val) => setOverlays(prev => ({ ...prev, [field]: val }));
  const setChannel = (field, val) => setChannelOverrides(prev => ({ ...prev, [field]: val }));

  // Count overlays
  const overlayCount = Object.values(overlays).filter(v => v !== "" && v !== null && v !== undefined).length;
  const channelCount = Object.values(channelOverrides).filter(v => v !== "" && v !== null && v !== undefined).length;

  // Effective fields for selected agencies
  const effectiveFields = lenderAgencies.flatMap(ag =>
    Object.entries(AGENCY_STANDARDS[ag]?.fields || {}).map(([k, f]) => ({ key: `${ag}_${k}`, agencyField: f, agency: ag }))
  );

  const formValid = form.name.trim() && form.nmls.trim() && lenderAgencies.length > 0;

  return (
    <div className="min-h-screen bg-slate-900 text-white" style={{ fontFamily: "'Sora', 'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        .layer-badge { font-size:.65rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; padding:2px 7px; border-radius:4px; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #0d1f12 60%, #0f172a 100%)", borderBottom: "1px solid rgba(74,222,128,.18)" }}>
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs font-bold text-green-400 tracking-widest uppercase">LoanBeacons™ — Core Infrastructure</span>
            <h1 className="text-3xl font-extrabold text-white mt-1">🏗️ Lender Profile Builder™</h1>
            <p className="text-slate-400 text-sm mt-1">Three-Layer Guideline Stack · Agency Standards · Lender Overlays · Channel Overrides</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["standards", "profiles", "add"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${tab === t ? "bg-green-700 text-white shadow-lg shadow-green-900/40" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                {t === "standards" ? "📋 Agency Standards" : t === "profiles" ? `🗂️ My Lenders (${lenders.length})` : "➕ Add Lender"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ═══ TAB: AGENCY STANDARDS ════════════════════════════════════════ */}
        {tab === "standards" && (
          <div>
            <div className="mb-6 p-5 bg-green-900/20 border border-green-700/40 rounded-2xl">
              <h2 className="text-base font-bold text-green-300 mb-2">Layer 1 — Agency Standards Reference</h2>
              <p className="text-sm text-slate-300 leading-relaxed">These are the baseline agency guidelines pre-loaded by LoanBeacons™. Every lender profile starts here — you only need to capture where your lender <strong className="text-white">differs</strong> from the standard. This dramatically reduces data entry time and eliminates errors from re-typing known values.</p>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  ["FHA 4000.1", "HUD/FHA", "blue"],
                  ["Fannie Mae Selling Guide", "FHFA/FNMA", "indigo"],
                  ["Freddie Mac SF Guide", "FHFA/FHLMC", "indigo"],
                  ["VA Pamphlet 26-7", "Dept. Veterans Affairs", "emerald"],
                  ["USDA HB-1-3555", "USDA Rural Dev.", "amber"],
                  ["HomeReady + Home Possible", "FNMA/FHLMC", "indigo"],
                ].map(([doc, agency, color]) => (
                  <div key={doc} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs font-bold text-slate-300">{doc}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{agency}</p>
                  </div>
                ))}
              </div>
            </div>
            <AgencyStandardsTab />
          </div>
        )}

        {/* ═══ TAB: MY LENDERS ══════════════════════════════════════════════ */}
        {tab === "profiles" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">My Lender Profiles</h2>
                <p className="text-slate-400 text-sm mt-0.5">Your private lender roster. Each profile stores agency baseline + lender overlays + channel overrides.</p>
              </div>
              <button onClick={() => setTab("add")} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-green-700 hover:bg-green-600 text-white">
                ➕ Add Lender
              </button>
            </div>

            {loading && <div className="text-center py-12 text-slate-400">Loading profiles...</div>}

            {!loading && lenders.length === 0 && (
              <div className="text-center py-16 bg-slate-800/40 border border-slate-700 rounded-2xl">
                <div className="text-4xl mb-4">🏗️</div>
                <h3 className="text-lg font-bold text-white mb-2">No lender profiles yet</h3>
                <p className="text-slate-400 text-sm mb-6">Add your first lender to begin building your personal guideline roster.</p>
                <button onClick={() => setTab("add")} className="px-6 py-3 rounded-xl font-bold text-sm bg-green-700 hover:bg-green-600 text-white">
                  ➕ Add First Lender
                </button>
              </div>
            )}

            {!loading && lenders.length > 0 && (
              <div className="space-y-4">
                {lenders.map(lender => {
                  const oCount = Object.values(lender.overlays || {}).filter(v => v !== "" && v !== null).length;
                  const cCount = Object.values(lender.channelOverrides || {}).filter(v => v !== "" && v !== null).length;
                  return (
                    <div key={lender.id} className="bg-slate-800/50 border border-slate-700 hover:border-green-700/50 rounded-2xl p-5 transition-all">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-green-900/40 border border-green-700/40 flex items-center justify-center text-2xl flex-shrink-0">🏦</div>
                          <div>
                            <h3 className="text-lg font-bold text-white">{lender.name}</h3>
                            <p className="text-sm text-slate-400">NMLS# {lender.nmls} · {lender.type}</p>
                            <div className="flex gap-2 flex-wrap mt-2">
                              {(lender.agencies || []).map(a => (
                                <span key={a} className={`px-2 py-0.5 rounded text-xs font-bold ${agencyColors[AGENCY_STANDARDS[a]?.color]?.badge || "bg-slate-700 text-slate-300"}`}>{a}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <div className="text-center">
                            <p className="text-lg font-bold text-orange-400">{oCount}</p>
                            <p className="text-xs text-slate-500">Overlays</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-purple-400">{cCount}</p>
                            <p className="text-xs text-slate-500">Channel</p>
                          </div>
                          <button onClick={() => setViewLender(viewLender?.id === lender.id ? null : lender)}
                            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold text-sm">
                            {viewLender?.id === lender.id ? "Hide" : "View"}
                          </button>
                        </div>
                      </div>

                      {/* Expanded profile view */}
                      {viewLender?.id === lender.id && (
                        <div className="mt-5 pt-5 border-t border-slate-700">
                          {/* Three-layer summary */}
                          <div className="grid grid-cols-3 gap-3 mb-5">
                            <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-3 text-center">
                              <p className="text-xs text-slate-400 mb-1">Layer 1</p>
                              <p className="font-bold text-green-300 text-sm">Agency Standard</p>
                              <p className="text-xs text-slate-500 mt-0.5">Pre-loaded by LoanBeacons</p>
                            </div>
                            <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-3 text-center">
                              <p className="text-xs text-slate-400 mb-1">Layer 2</p>
                              <p className="font-bold text-orange-300 text-sm">{oCount} Lender Overlays</p>
                              <p className="text-xs text-slate-500 mt-0.5">Where lender differs</p>
                            </div>
                            <div className="bg-purple-900/20 border border-purple-700/40 rounded-xl p-3 text-center">
                              <p className="text-xs text-slate-400 mb-1">Layer 3</p>
                              <p className="font-bold text-purple-300 text-sm">{cCount} Channel Overrides</p>
                              <p className="text-xs text-slate-500 mt-0.5">AE-negotiated exceptions</p>
                            </div>
                          </div>

                          {/* AE Contact */}
                          {lender.aeContact && (
                            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 mb-4">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Account Executive</p>
                              <p className="text-white font-semibold">{lender.aeContact}</p>
                              {lender.aeEmail && <p className="text-slate-400 text-sm">{lender.aeEmail}</p>}
                              {lender.aePhone && <p className="text-slate-400 text-sm">{lender.aePhone}</p>}
                            </div>
                          )}

                          {/* Overlay detail */}
                          {oCount > 0 && (
                            <div className="mb-4">
                              <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">Lender Overlays (Layer 2)</p>
                              <div className="space-y-2">
                                {Object.entries(lender.overlays || {}).filter(([, v]) => v !== "" && v !== null).map(([k, v]) => {
                                  const [agKey, ...fKey] = k.split("_");
                                  const fieldKey = fKey.join("_");
                                  const agStd = AGENCY_STANDARDS[agKey]?.fields[fieldKey];
                                  return (
                                    <div key={k} className="flex items-center justify-between bg-orange-900/20 border border-orange-700/30 rounded-lg px-4 py-2">
                                      <p className="text-sm text-slate-300">{agStd?.label || k}</p>
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500 line-through">{agStd?.prefix || ""}{agStd?.value !== undefined ? fp(agStd.value, agStd?.unit) : "—"}</span>
                                        <span className="text-sm font-bold text-orange-300">{v}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Channel override detail */}
                          {cCount > 0 && (
                            <div>
                              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3">Channel Overrides (Layer 3)</p>
                              <div className="space-y-2">
                                {Object.entries(lender.channelOverrides || {}).filter(([, v]) => v !== "" && v !== null).map(([k, v]) => {
                                  const [agKey, ...fKey] = k.split("_");
                                  const fieldKey = fKey.join("_");
                                  const agStd = AGENCY_STANDARDS[agKey]?.fields[fieldKey];
                                  return (
                                    <div key={k} className="flex items-center justify-between bg-purple-900/20 border border-purple-700/30 rounded-lg px-4 py-2">
                                      <p className="text-sm text-slate-300">{agStd?.label || k}</p>
                                      <span className="text-sm font-bold text-purple-300">{v}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {lender.notes && (
                            <div className="mt-4 bg-slate-800/60 border border-slate-600 rounded-xl p-4">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                              <p className="text-sm text-slate-300 leading-relaxed">{lender.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: ADD LENDER ══════════════════════════════════════════════ */}
        {tab === "add" && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Add New Lender Profile</h2>
            <p className="text-slate-400 text-sm mb-6">Start with the lender's identity, then capture <strong className="text-orange-300">only where they differ</strong> from agency standard. Fields that follow agency standard require no entry.</p>

            {/* Layer legend */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                ["Layer 1", "Agency Standard", "Pre-loaded. You don't enter these.", "green"],
                ["Layer 2", "Lender Overlay", "Enter only if lender differs from agency.", "orange"],
                ["Layer 3", "Channel Override", "AE-negotiated exception. Highest priority.", "purple"],
              ].map(([layer, name, desc, color]) => (
                <div key={layer} className={`rounded-xl p-4 border ${color === "green" ? "bg-green-900/20 border-green-700/40" : color === "orange" ? "bg-orange-900/20 border-orange-700/40" : "bg-purple-900/20 border-purple-700/40"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${color === "green" ? "text-green-400" : color === "orange" ? "text-orange-400" : "text-purple-400"}`}>{layer}</p>
                  <p className="font-bold text-white text-sm">{name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            {/* Identity */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4">Lender Identity</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Lender Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. United Wholesale Mortgage"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">NMLS# *</label>
                  <input value={form.nmls} onChange={e => setForm(f => ({ ...f, nmls: e.target.value }))}
                    placeholder="e.g. 3038"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-2">Channel Type</label>
                <div className="flex gap-3">
                  {[["wholesale", "Wholesale"], ["correspondent", "Correspondent"], ["retail", "Retail"]].map(([v, l]) => (
                    <label key={v} className={`pill cursor-pointer px-4 py-2 rounded-xl border font-semibold text-sm transition-all ${form.type === v ? "bg-green-800 border-green-500 text-white" : "border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                      <input type="radio" className="hidden" checked={form.type === v} onChange={() => setForm(f => ({ ...f, type: v }))}/>{l}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Loan Programs Offered * (select all that apply)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(AGENCY_STANDARDS).map(([key, ag]) => (
                    <label key={key} className={`block cursor-pointer p-3 rounded-xl border text-center transition-all ${lenderAgencies.includes(key) ? `${agencyColors[ag.color].bg} ${agencyColors[ag.color].border}` : "bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                      <input type="checkbox" className="hidden" checked={lenderAgencies.includes(key)} onChange={() => toggleAgency(key)}/>
                      <div className="text-xl mb-1">{ag.icon}</div>
                      <p className="font-bold text-white text-sm">{ag.label}</p>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* AE Contact (Layer 3 context) */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-5">
              <h3 className="text-sm font-bold text-slate-300 mb-1">Account Executive Contact</h3>
              <p className="text-xs text-slate-500 mb-4">This is the person who communicates channel overlays to you. Store their info here so it's always with the profile.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">AE Name</label>
                  <input value={form.aeContact} onChange={e => setForm(f => ({ ...f, aeContact: e.target.value }))}
                    placeholder="e.g. Sarah Johnson"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">AE Email</label>
                  <input value={form.aeEmail} onChange={e => setForm(f => ({ ...f, aeEmail: e.target.value }))}
                    placeholder="e.g. sarah.j@lender.com"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">AE Phone</label>
                  <input value={form.aePhone} onChange={e => setForm(f => ({ ...f, aePhone: e.target.value }))}
                    placeholder="e.g. (800) 555-0100"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
              </div>
            </div>

            {/* Guideline Overlays — only show if agencies selected */}
            {lenderAgencies.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-5">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-bold text-slate-300">Guideline Overlays</h3>
                  {overlayCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-900/50 border border-orange-700/50 text-orange-300">{overlayCount} overlay{overlayCount !== 1 ? "s" : ""}</span>}
                  {channelCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-900/50 border border-purple-700/50 text-purple-300">{channelCount} channel</span>}
                </div>
                <p className="text-xs text-slate-500 mb-5">Click <strong className="text-white">✏️ Edit</strong> on any field where this lender differs from agency standard. Leave all other fields blank — they automatically inherit the agency value.</p>

                {lenderAgencies.map(agKey => (
                  <div key={agKey} className="mb-6">
                    <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${agencyColors[AGENCY_STANDARDS[agKey].color].border}`}>
                      <span>{AGENCY_STANDARDS[agKey].icon}</span>
                      <p className={`font-bold text-sm ${agencyColors[AGENCY_STANDARDS[agKey].color].text}`}>{AGENCY_STANDARDS[agKey].label} — {AGENCY_STANDARDS[agKey].fullName}</p>
                    </div>
                    <div className="space-y-3">
                      {Object.entries(AGENCY_STANDARDS[agKey].fields).map(([fieldKey, field]) => {
                        const compositeKey = `${agKey}_${fieldKey}`;
                        return (
                          <OverlayInput
                            key={compositeKey}
                            fieldKey={compositeKey}
                            agencyField={field}
                            overlay={overlays[compositeKey]}
                            onChange={setOverlay}
                            channelOverlay={channelOverrides[compositeKey]}
                            onChannelChange={setChannel}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-6">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Notes / Special Guidelines</label>
              <p className="text-xs text-slate-500 mb-2">Anything that doesn't fit a structured field — pricing tiers, niche programs, submission preferences, turn times, etc.</p>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Strong on Non-QM. AE prefers pre-approval calls. Fast turn on VA — typically 15 days. Avoid after 3pm EST submissions..."
                rows={4}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500 resize-none"/>
            </div>

            {/* Save */}
            <div className="flex items-center gap-4">
              <button onClick={saveLender} disabled={!formValid}
                className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all ${formValid ? "bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/40" : "bg-slate-700 text-slate-500 cursor-not-allowed"}`}>
                {saved ? "✅ Lender Profile Saved" : "💾 Save Lender Profile to Firestore"}
              </button>
              <button onClick={() => { setTab("profiles"); setOverlays({}); setChannelOverrides({}); setLenderAgencies([]); }}
                className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300">
                Cancel
              </button>
            </div>
            {!formValid && <p className="text-xs text-slate-500 text-center mt-2">Enter lender name, NMLS#, and select at least one loan program to enable save.</p>}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="max-w-5xl mx-auto px-4 pb-8">
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">
            LoanBeacons™ Lender Profile Builder™ — Three-Layer Guideline Architecture · Layer 1: Agency Standards (FHA 4000.1, Fannie Mae Selling Guide, Freddie Mac SF Guide, VA Pamphlet 26-7, USDA HB-1-3555) · Layer 2: Lender Overlays · Layer 3: Channel Overrides · PRD v3.0 FINAL · Phase 1A+1B
          </p>
          <p className="text-xs text-slate-600 mt-1">PDF Pipeline (Phase 1B+), AI Interview (Phase 1C), Community Library (Phase 2), Smart Chat (Phase 4) — Planned future phases per PRD v3.0</p>
        </div>
      </div>
    </div>
  );
}
