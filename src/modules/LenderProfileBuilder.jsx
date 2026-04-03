import { useState, useEffect, useRef } from "react";
import { db } from "../firebase/config";
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  serverTimestamp,
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import DecisionRecordBanner from "../components/DecisionRecordBanner";
import { useDecisionRecord } from "../hooks/useDecisionRecord";

// ── Agency Standards (Layer 1 — Pre-loaded by LoanBeacons™) ──────────────────
const AGENCY_STANDARDS = {
  FHA: {
    label: "FHA", fullName: "Federal Housing Administration",
    source: "HUD Handbook 4000.1", icon: "🏛️", color: "blue", updateFreq: "2–3x/year",
    fields: {
      minFICO: { label: "Minimum Credit Score", value: 580, note: "500–579 requires 10% down. AUS may approve lower with compensating factors." },
      minFICO_10pct: { label: "Min FICO (10% Down)", value: 500, note: "Borrowers 500–579 require minimum 10% down payment." },
      maxDTI: { label: "Maximum DTI (AUS)", value: 57, unit: "%", note: "FHA allows up to 57% with AUS approval. Manual underwrite max 43% (or 45% with compensating factors)." },
      maxDTI_manual: { label: "Maximum DTI (Manual UW)", value: 43, unit: "%", note: "Manual underwrite max 43%. Up to 45% with 2 compensating factors." },
      maxLTV_purchase: { label: "Max LTV — Purchase", value: 96.5, unit: "%", note: "96.5% = 3.5% minimum down payment. FICO ≥ 580 required." },
      maxLTV_rateterm: { label: "Max LTV — Rate/Term Refi", value: 97.75, unit: "%", note: "No cash-out. Primary residence only." },
      maxLTV_cashout: { label: "Max LTV — Cash-Out Refi", value: 80, unit: "%", note: "Owner-occupied primary residence. 12-month seasoning required." },
      mipUpfront: { label: "Upfront MIP", value: 1.75, unit: "%", note: "1.75% of base loan amount. Can be financed into the loan." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 24, unit: "months", note: "2 years from discharge date. 1 year with extenuating circumstances + reestablished credit." },
      bkChapter13: { label: "BK Chapter 13 Seasoning", value: 12, unit: "months", note: "12 months of payments made on time + court approval required." },
      foreclosure: { label: "Foreclosure Seasoning", value: 36, unit: "months", note: "3 years from completion date. 1 year with extenuating circumstances." },
      shortsale: { label: "Short Sale / DIL Seasoning", value: 36, unit: "months", note: "3 years. May be reduced with extenuating circumstances." },
      maxLoanLimit: { label: "Loan Limit (Standard Areas)", value: 498257, prefix: "$", note: "2024 standard area limit. High-cost areas up to $1,149,825." },
      selfEmployed: { label: "Self-Employed Doc Requirement", value: "2 years", note: "2 years self-employment history required. 1 year possible with prior same-field employment." },
      reserves: { label: "Reserve Requirement", value: "None required", note: "No minimum reserve requirement by FHA. Lenders may impose overlays." },
    }
  },
  CONVENTIONAL: {
    label: "Conventional", fullName: "Fannie Mae / Freddie Mac",
    source: "Fannie Mae Selling Guide + Freddie Mac SF Guide", icon: "🏦", color: "indigo", updateFreq: "Monthly",
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
    source: "VA Lenders Handbook (VA Pamphlet 26-7)", icon: "🎖️", color: "emerald", updateFreq: "Periodic + Circulars",
    fields: {
      minFICO: { label: "Minimum Credit Score (Agency)", value: 0, note: "VA sets no minimum FICO. All lenders impose overlays (typically 580–640). Qualify on residual income + DTI." },
      maxDTI: { label: "Maximum DTI", value: 41, unit: "%", note: "41% guideline. Higher DTI acceptable with sufficient residual income. No hard cap by VA." },
      maxLTV_purchase: { label: "Max LTV — Purchase", value: 100, unit: "%", note: "100% financing for eligible veterans with full entitlement. No down payment required." },
      maxLTV_cashout: { label: "Max LTV — Cash-Out Refi", value: 100, unit: "%", note: "VA Type II cash-out: up to 100% LTV." },
      fundingFee_first: { label: "Funding Fee — First Use", value: 2.15, unit: "%", note: "2.15% for first use with 0% down. Waived for disabled veterans." },
      fundingFee_subsequent: { label: "Funding Fee — Subsequent Use", value: 3.3, unit: "%", note: "3.30% for subsequent use with 0% down." },
      fundingFee_irrrl: { label: "Funding Fee — IRRRL", value: 0.5, unit: "%", note: "0.50% on all IRRRLs. Waived for disabled veterans." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 24, unit: "months", note: "2 years from discharge. Credit reestablished required." },
      foreclosure: { label: "Foreclosure Seasoning", value: 24, unit: "months", note: "2 years. Lender overlays often require 36+ months." },
      residualIncome: { label: "Residual Income Required", value: "Yes", note: "Residual income test required. Varies by family size and region. VA's primary qualifying metric." },
      pmi: { label: "PMI / MIP Required", value: "None", note: "VA loans have no private mortgage insurance at any LTV. Funding fee only." },
    }
  },
  USDA: {
    label: "USDA", fullName: "USDA Rural Development",
    source: "USDA HB-1-3555", icon: "🌾", color: "amber", updateFreq: "1–2x/year",
    fields: {
      minFICO: { label: "Minimum Credit Score (GUS)", value: 640, note: "640 for GUS automated approval. Lower FICO requires manual underwrite." },
      maxDTI: { label: "Maximum DTI", value: 41, unit: "%", note: "29/41% guideline ratios. GUS may approve higher. Manual underwrite max 29/41%." },
      maxLTV_purchase: { label: "Max LTV — Purchase", value: 100, unit: "%", note: "100% financing + can finance guarantee fee. No down payment required." },
      guaranteeFee: { label: "Upfront Guarantee Fee", value: 1.0, unit: "%", note: "1.00% of loan amount. Can be financed into the loan." },
      annualFee: { label: "Annual Fee (MIP equivalent)", value: 0.35, unit: "%", note: "0.35% of outstanding balance annually. Paid monthly." },
      incomeLimit: { label: "Income Limit", value: "115% of AMI", note: "Borrower household income cannot exceed 115% of area median income." },
      propertyEligibility: { label: "Property Eligibility", value: "Rural areas only", note: "Property must be in USDA-eligible rural area. Check USDA property eligibility map." },
      bkChapter7: { label: "BK Chapter 7 Seasoning", value: 36, unit: "months", note: "3 years from discharge date." },
      foreclosure: { label: "Foreclosure Seasoning", value: 36, unit: "months", note: "3 years from completion date." },
    }
  }
};

// ── Non-QM Products ───────────────────────────────────────────────────────────
const NON_QM_PRODUCTS = [
  { id: "dscr",         label: "DSCR",                   icon: "📊", desc: "Debt Service Coverage Ratio — qualifies on rental income only",            hasDSCR: true },
  { id: "bankstmt_12",  label: "Bank Statement 12mo",    icon: "🏦", desc: "12-month personal or business bank statements",                            hasStmt: true },
  { id: "bankstmt_24",  label: "Bank Statement 24mo",    icon: "🏦", desc: "24-month personal or business bank statements",                            hasStmt: true },
  { id: "pl_only",      label: "P&L Only",               icon: "📋", desc: "CPA-prepared profit & loss, no tax returns required" },
  { id: "asset_dep",    label: "Asset Depletion",        icon: "💰", desc: "Liquid assets ÷ loan term = qualifying income" },
  { id: "w2_1099",      label: "1099 Only",              icon: "📄", desc: "1099 income streams in lieu of full tax returns" },
  { id: "for_natl",     label: "Foreign National",       icon: "🌐", desc: "Non-US citizens / non-permanent residents" },
  { id: "itin",         label: "ITIN",                   icon: "🪪", desc: "ITIN borrowers without a Social Security Number" },
  { id: "recent_cred",  label: "Recent Credit Events",   icon: "⚠️", desc: "BK/FC/SS inside standard agency seasoning windows" },
  { id: "non_warr",     label: "Non-Warrantable Condo",  icon: "🏢", desc: "Condos that fail agency warrantability requirements" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fp = (n, u) => u === "%" ? `${n}%` : u === "months" ? `${n} mo` : u === "months PITI" ? `${n} mo PITI` : u ? `${n} ${u}` : String(n);

const AC = {
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    badge: "bg-blue-100 text-blue-700",    text: "text-blue-600",    bar: "bg-blue-400"    },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  badge: "bg-indigo-100 text-indigo-700",  text: "text-indigo-600",  bar: "bg-indigo-400"  },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600", bar: "bg-emerald-400" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700",   text: "text-amber-600",   bar: "bg-amber-400"   },
};

const inp = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-slate-400 placeholder-slate-400";
const lbl = "block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide";
const card = "bg-white border border-slate-200 rounded-3xl p-6 shadow-sm";

const lenderTypeConfig = {
  wholesale:    { label: "Wholesale",      icon: "🏗️", color: "bg-green-100 text-green-700"  },
  correspondent:{ label: "Correspondent", icon: "📑", color: "bg-blue-100 text-blue-700"    },
  retail:       { label: "Retail",        icon: "🏬", color: "bg-slate-100 text-slate-700"  },
  nonqm:        { label: "Non-QM",        icon: "📊", color: "bg-violet-100 text-violet-700"},
  hardmoney:    { label: "Hard Money",    icon: "🔨", color: "bg-amber-100 text-amber-700"  },
};

// ── Matrix AI Uploader ────────────────────────────────────────────────────────
function MatrixUploader({ onExtracted, existingMatrix }) {
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") { setErr("PDF files only."); return; }
    setStatus("reading"); setErr("");
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      setStatus("extracting");
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4096,
            messages: [{
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
                { type: "text", text: `You are a Non-QM lending expert. Extract ALL guideline data from this lender matrix or rate sheet PDF. Return ONLY valid JSON, no markdown fences, no explanation:\n{\n  "effectiveDate": "string or null",\n  "lenderName": "string or null",\n  "products": [{\n    "name": "product name",\n    "minFICO": number_or_null,\n    "maxLTV": {"purchase": number_or_null, "rateterm": number_or_null, "cashout": number_or_null},\n    "maxLoan": number_or_null,\n    "minLoan": number_or_null,\n    "prepay": "none|1yr|2yr|3yr|5yr|step-down or null",\n    "interestOnly": true_or_false,\n    "occupancy": ["owner","2ndhome","investment"],\n    "propertyTypes": ["sfr","2-4unit","condo","townhome","5plus","commercial"],\n    "dscrMin": number_or_null,\n    "noRatioDSCR": true_or_false_or_null,\n    "strAllowed": true_or_false_or_null,\n    "bkSeasoning": "X months or null",\n    "fcSeasoning": "X months or null",\n    "ssSeasoning": "X months or null",\n    "notes": "key restrictions or requirements"\n  }],\n  "llpas": [{"factor": "description", "adjustment": "+/-X.XXX"}],\n  "generalNotes": "lender-wide requirements or special programs"\n}` }
              ]
            }]
          })
        });
        const data = await res.json();
        const text = (data.content || []).find(b => b.type === "text")?.text || "";
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        onExtracted(parsed);
        setStatus("done");
      } catch (e) {
        console.error("Matrix extraction error:", e);
        setErr("Extraction failed. Check PDF quality or try a cleaner file.");
        setStatus("error");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "'DM Serif Display', serif" }}>
          Non-QM Matrix Reader
        </h3>
        {existingMatrix && (
          <span className="px-2.5 py-0.5 bg-violet-100 text-violet-700 text-xs font-bold rounded-full">✓ Matrix Loaded</span>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-xs text-amber-800 leading-relaxed">
        <strong>Even if this lender doesn't publish guidelines,</strong> upload their PDF rate matrix or product spec sheet. Claude AI will extract all products, FICO bands, LTV limits, LLPAs, seasoning requirements, and special programs — converting an opaque matrix into a structured, searchable profile.
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onDragOver={e => e.preventDefault()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${status === "done" ? "border-green-300 bg-green-50" : "border-slate-300 hover:border-violet-400 hover:bg-violet-50"}`}
      >
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
        <div className="text-3xl mb-2">
          {status === "extracting" ? "⚙️" : status === "done" ? "✅" : "📄"}
        </div>
        <p className="font-semibold text-slate-700 text-sm">
          {status === "idle" && "Click or drag to upload matrix PDF"}
          {status === "reading" && "Reading PDF..."}
          {status === "extracting" && "Claude AI is interpreting guidelines..."}
          {status === "done" && "Matrix extracted successfully — review below"}
          {status === "error" && "Upload failed — try again"}
        </p>
        {status === "idle" && <p className="text-xs text-slate-400 mt-1">PDF only · Rate sheets, matrices, guideline specs</p>}
        {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
      </div>

      {existingMatrix && (
        <div className="mt-5 space-y-3">
          {(existingMatrix.lenderName || existingMatrix.effectiveDate) && (
            <p className="text-xs text-slate-500">
              {existingMatrix.lenderName && <><strong className="text-slate-700">{existingMatrix.lenderName}</strong> · </>}
              {existingMatrix.effectiveDate && <>Effective {existingMatrix.effectiveDate}</>}
            </p>
          )}

          {(existingMatrix.products || []).map((p, i) => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">{p.name}</span>
                {p.interestOnly && <span className="px-2 py-0.5 bg-violet-100 text-violet-600 text-xs rounded-full font-bold">I/O</span>}
                {p.noRatioDSCR && <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full font-bold">No-Ratio</span>}
                {p.strAllowed && <span className="px-2 py-0.5 bg-green-100 text-green-600 text-xs rounded-full font-bold">STR ✓</span>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {p.minFICO != null && <div><p className="text-slate-500">Min FICO</p><p className="font-bold text-slate-900">{p.minFICO}</p></div>}
                {p.maxLTV?.purchase != null && <div><p className="text-slate-500">Max LTV (Purchase)</p><p className="font-bold text-slate-900">{p.maxLTV.purchase}%</p></div>}
                {p.maxLTV?.cashout != null && <div><p className="text-slate-500">Max LTV (Cash-Out)</p><p className="font-bold text-slate-900">{p.maxLTV.cashout}%</p></div>}
                {p.maxLoan != null && <div><p className="text-slate-500">Max Loan</p><p className="font-bold text-slate-900">${Number(p.maxLoan).toLocaleString()}</p></div>}
                {p.dscrMin != null && <div><p className="text-slate-500">Min DSCR</p><p className="font-bold text-slate-900">{p.dscrMin}x</p></div>}
                {p.prepay && p.prepay !== "none" && <div><p className="text-slate-500">Prepay</p><p className="font-bold text-slate-900">{p.prepay}</p></div>}
                {p.bkSeasoning && <div><p className="text-slate-500">BK Seasoning</p><p className="font-bold text-slate-900">{p.bkSeasoning}</p></div>}
                {p.fcSeasoning && <div><p className="text-slate-500">FC Seasoning</p><p className="font-bold text-slate-900">{p.fcSeasoning}</p></div>}
              </div>
              {p.notes && <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">{p.notes}</p>}
            </div>
          ))}

          {(existingMatrix.llpas || []).length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">LLPAs / Adjustments</p>
              <div className="space-y-1">
                {existingMatrix.llpas.map((l, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-600">{l.factor}</span>
                    <span className={`font-bold ${String(l.adjustment).startsWith("-") ? "text-green-600" : "text-red-600"}`}>{l.adjustment}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {existingMatrix.generalNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">General Notes</p>
              <p className="text-xs text-amber-800">{existingMatrix.generalNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overlay Input ─────────────────────────────────────────────────────────────
function OverlayInput({ fieldKey, agencyField, overlay, onChange, channelOverlay, onChannelChange }) {
  const [open, setOpen] = useState(false);
  const hasOverlay = overlay !== undefined && overlay !== "" && overlay !== null;
  const hasChannel = channelOverlay !== undefined && channelOverlay !== "" && channelOverlay !== null;
  const effective = hasChannel ? channelOverlay : hasOverlay ? overlay : agencyField.value;

  return (
    <div className={`rounded-2xl border p-4 transition-all ${hasChannel ? "bg-violet-50 border-violet-200" : hasOverlay ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{agencyField.label}</p>
            {hasChannel && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">Channel Override</span>}
            {hasOverlay && !hasChannel && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Lender Overlay</span>}
            {!hasOverlay && !hasChannel && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">Follows Agency</span>}
          </div>
          <div className="flex items-baseline gap-3">
            {(hasOverlay || hasChannel) && (
              <span className="text-slate-400 text-xs line-through">
                {agencyField.prefix || ""}{typeof agencyField.value === "number" ? fp(agencyField.value, agencyField.unit) : agencyField.value}
              </span>
            )}
            <span className="text-slate-900 font-bold text-sm font-mono">
              {agencyField.prefix || ""}{typeof effective === "number" ? fp(effective, agencyField.unit) : effective}
            </span>
          </div>
          {agencyField.note && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{agencyField.note}</p>}
        </div>
        <button onClick={() => setOpen(!open)}
          className="text-xs px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-400 text-slate-600 font-semibold flex-shrink-0 shadow-sm">
          {open ? "Close" : "✏️ Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-orange-600 mb-1 uppercase tracking-wide">Layer 2 — Lender Overlay</label>
            <p className="text-xs text-slate-400 mb-2">Enter only if this lender differs from agency standard.</p>
            <input type="text" value={overlay || ""} onChange={e => onChange(fieldKey, e.target.value)}
              placeholder={`Agency: ${agencyField.prefix || ""}${typeof agencyField.value === "number" ? fp(agencyField.value, agencyField.unit) : agencyField.value}`}
              className={inp} />
            {hasOverlay && <button onClick={() => onChange(fieldKey, "")} className="mt-1 text-xs text-red-500 hover:text-red-700">↺ Remove — revert to agency</button>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-violet-600 mb-1 uppercase tracking-wide">Layer 3 — Channel Override</label>
            <p className="text-xs text-slate-400 mb-2">AE-negotiated exception. Overrides everything above.</p>
            <input type="text" value={channelOverlay || ""} onChange={e => onChannelChange(fieldKey, e.target.value)}
              placeholder="e.g. 660 per AE agreement Feb 2026"
              className={inp} />
            {hasChannel && <button onClick={() => onChannelChange(fieldKey, "")} className="mt-1 text-xs text-red-500 hover:text-red-700">↺ Remove channel override</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agency Standards Tab ──────────────────────────────────────────────────────
function AgencyStandardsTab() {
  const [activeAgency, setActiveAgency] = useState("FHA");
  const [expandedField, setExpandedField] = useState(null);
  const agency = AGENCY_STANDARDS[activeAgency];
  const c = AC[agency.color];

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-800 leading-relaxed">
        <strong>Layer 1 — Pre-loaded & maintained by LoanBeacons™.</strong> Updated within 5 business days of any agency publication. Your lender profiles only capture where a lender <em>differs</em> from these — dramatically reducing data entry and eliminating re-typing errors.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(AGENCY_STANDARDS).map(([key, ag]) => (
          <button key={key} onClick={() => setActiveAgency(key)}
            className={`p-4 rounded-2xl border text-center transition-all ${activeAgency === key ? `${AC[ag.color].bg} ${AC[ag.color].border}` : "bg-white border-slate-200 hover:border-slate-300"}`}>
            <div className="text-2xl mb-1">{ag.icon}</div>
            <p className="font-bold text-slate-900 text-sm">{ag.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{ag.fullName}</p>
          </button>
        ))}
      </div>

      <div className={`rounded-2xl p-5 border mb-5 ${c.bg} ${c.border}`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{agency.icon}</span>
              <h3 className={`text-lg font-bold ${c.text}`} style={{ fontFamily: "'DM Serif Display', serif" }}>{agency.fullName}</h3>
            </div>
            <p className="text-xs text-slate-500">Source: {agency.source} · Updated {agency.updateFreq}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${c.badge}`}>✓ LoanBeacons Verified</span>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(agency.fields).map(([key, field]) => (
          <div key={key} onClick={() => setExpandedField(expandedField === key ? null : key)}
            className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:border-slate-300 ${expandedField === key ? "border-slate-300 shadow-sm" : "border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-1 h-8 rounded-full ${c.bar}`} />
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{field.label}</p>
                  <p className={`text-base font-bold font-mono ${c.text}`}>
                    {field.prefix || ""}{typeof field.value === "number" ? fp(field.value, field.unit) : field.value}
                  </p>
                </div>
              </div>
              <span className="text-slate-400 text-xs">{expandedField === key ? "▲" : "▼"}</span>
            </div>
            {expandedField === key && (
              <div className={`mt-3 pt-3 border-t ${c.border} text-sm text-slate-600 leading-relaxed`}>{field.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Non-QM Product Card ───────────────────────────────────────────────────────
function NonQMProductCard({ product, data, onChange }) {
  const [open, setOpen] = useState(false);
  const f = (key, val) => onChange(product.id, key, val);
  const toggleArr = (key, val) => {
    const arr = data[key] || [];
    f(key, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between p-4 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{product.icon}</span>
          <div>
            <p className="font-bold text-slate-900 text-sm">{product.label}</p>
            <p className="text-xs text-slate-500">{product.desc}</p>
          </div>
        </div>
        <span className="text-slate-400 text-sm ml-4">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="border-t border-slate-100 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className={lbl}>Min FICO</label><input value={data.minFICO || ""} onChange={e => f("minFICO", e.target.value)} placeholder="e.g. 620" className={inp} /></div>
            <div><label className={lbl}>Max LTV — Purchase</label><input value={data.maxLTV_purchase || ""} onChange={e => f("maxLTV_purchase", e.target.value)} placeholder="e.g. 80%" className={inp} /></div>
            <div><label className={lbl}>Max LTV — Rate/Term</label><input value={data.maxLTV_rateterm || ""} onChange={e => f("maxLTV_rateterm", e.target.value)} placeholder="e.g. 75%" className={inp} /></div>
            <div><label className={lbl}>Max LTV — Cash-Out</label><input value={data.maxLTV_cashout || ""} onChange={e => f("maxLTV_cashout", e.target.value)} placeholder="e.g. 70%" className={inp} /></div>
            <div><label className={lbl}>Max Loan Amount</label><input value={data.maxLoan || ""} onChange={e => f("maxLoan", e.target.value)} placeholder="e.g. $3,000,000" className={inp} /></div>
            <div>
              <label className={lbl}>Prepay Penalty</label>
              <select value={data.prepay || "none"} onChange={e => f("prepay", e.target.value)} className={inp}>
                <option value="none">None</option>
                <option value="1yr">1 Year</option>
                <option value="2yr">2 Years</option>
                <option value="3yr">3 Years</option>
                <option value="5yr">5 Years</option>
                <option value="step">Step-Down</option>
              </select>
            </div>
          </div>

          {product.hasDSCR && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-700 mb-3 uppercase tracking-wide">DSCR Specifics</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className={lbl}>Min DSCR Ratio</label><input value={data.minDSCR || ""} onChange={e => f("minDSCR", e.target.value)} placeholder="e.g. 1.0" className={inp} /></div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={data.noRatioDSCR || false} onChange={e => f("noRatioDSCR", e.target.checked)} className="rounded" />
                    <span className="text-xs text-slate-700 font-semibold">No-Ratio DSCR</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={data.strAllowed || false} onChange={e => f("strAllowed", e.target.checked)} className="rounded" />
                    <span className="text-xs text-slate-700 font-semibold">STR / Airbnb OK</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {product.hasStmt && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-xs font-bold text-indigo-700 mb-3 uppercase tracking-wide">Bank Statement Specifics</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Statement Type</label>
                  <select value={data.stmtType || "either"} onChange={e => f("stmtType", e.target.value)} className={inp}>
                    <option value="personal">Personal Only</option>
                    <option value="business">Business Only</option>
                    <option value="either">Either Accepted</option>
                  </select>
                </div>
                <div><label className={lbl}>Expense Factor (Business Stmts)</label><input value={data.expenseRatio || ""} onChange={e => f("expenseRatio", e.target.value)} placeholder="e.g. 50%" className={inp} /></div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>BK Seasoning</label><input value={data.bkSeasoning || ""} onChange={e => f("bkSeasoning", e.target.value)} placeholder="e.g. 12 months" className={inp} /></div>
            <div><label className={lbl}>FC Seasoning</label><input value={data.fcSeasoning || ""} onChange={e => f("fcSeasoning", e.target.value)} placeholder="e.g. 24 months" className={inp} /></div>
            <div><label className={lbl}>SS Seasoning</label><input value={data.ssSeasoning || ""} onChange={e => f("ssSeasoning", e.target.value)} placeholder="e.g. 24 months" className={inp} /></div>
          </div>

          <div>
            <label className={lbl}>Occupancy Allowed</label>
            <div className="flex flex-wrap gap-2">
              {[["owner","Owner-Occupied"],["2ndhome","2nd Home"],["investment","Investment"]].map(([v, l]) => (
                <button key={v} onClick={() => toggleArr("occupancy", v)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${(data.occupancy || []).includes(v) ? "bg-violet-700 border-violet-700 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-violet-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={lbl}>Property Types</label>
            <div className="flex flex-wrap gap-2">
              {[["sfr","SFR"],["2-4","2-4 Unit"],["condo","Condo"],["townhome","Townhome"],["5plus","5+ Unit"],["commercial","Commercial"]].map(([v, l]) => (
                <button key={v} onClick={() => toggleArr("propertyTypes", v)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${(data.propertyTypes || []).includes(v) ? "bg-violet-700 border-violet-700 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-violet-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={data.interestOnly || false} onChange={e => f("interestOnly", e.target.checked)} className="rounded" />
            <span className="text-sm text-slate-700 font-semibold">Interest-Only Option Available</span>
          </label>

          <div>
            <label className={lbl}>Notes / Special Requirements</label>
            <textarea value={data.notes || ""} onChange={e => f("notes", e.target.value)} rows={2}
              placeholder="e.g. Min 2 years self-employment, no condotels, max 10 financed properties..."
              className={`${inp} resize-none`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Non-QM Section ────────────────────────────────────────────────────────────
function NonQMSection({ selectedProducts, setSelectedProducts, productData, setProductData, matrix, setMatrix }) {
  const toggle = (id) => setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const updateProduct = (productId, field, val) =>
    setProductData(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [field]: val } }));

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 leading-relaxed">
        <strong>Non-QM Profile Mode:</strong> Select all products this lender offers, then complete guidelines for each. If they provide a rate matrix PDF, upload it — Claude AI will extract everything automatically.
      </div>

      <div className={card}>
        <MatrixUploader onExtracted={setMatrix} existingMatrix={matrix} />
      </div>

      <div className={card}>
        <label className={lbl + " mb-3"}>Products Offered (select all that apply)</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {NON_QM_PRODUCTS.map(p => (
            <button key={p.id} onClick={() => toggle(p.id)}
              className={`p-3 rounded-2xl border text-left transition-all ${selectedProducts.includes(p.id) ? "bg-violet-50 border-violet-400 shadow-sm" : "bg-slate-50 border-slate-200 hover:border-violet-200"}`}>
              <span className="text-lg">{p.icon}</span>
              <p className="font-bold text-slate-900 text-xs mt-1">{p.label}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {selectedProducts.length > 0 && (
        <div>
          <label className={lbl + " mb-3"}>Product Guidelines — click any product to expand</label>
          <div className="space-y-3">
            {NON_QM_PRODUCTS.filter(p => selectedProducts.includes(p.id)).map(p => (
              <NonQMProductCard key={p.id} product={p} data={productData[p.id] || {}} onChange={updateProduct} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hard Money Section ────────────────────────────────────────────────────────
function HardMoneySection({ data, onChange }) {
  const f = (key, val) => onChange(key, val);
  const toggleArr = (key, val) => {
    const arr = data[key] || [];
    f(key, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 leading-relaxed">
        <strong>Hard Money / Private Lender Profile:</strong> Capture the deal structure parameters that define how this lender evaluates and prices fix-and-flip, bridge, and new construction transactions.
      </div>

      {/* Deal Structure */}
      <div className={card}>
        <h3 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Deal Structure & Lending Basis</h3>
        <div className="mb-4">
          <label className={lbl}>How does this lender calculate the loan amount?</label>
          <div className="flex flex-wrap gap-3">
            {[["purchase","Purchase Price"],["arv","As-Renovated Value (ARV)"],["lower_of","Lower of: (Purchase + Rehab) or ARV"]].map(([v, l]) => (
              <button key={v} onClick={() => f("lendingBasis", v)}
                className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${data.lendingBasis === v ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><label className={lbl}>Max LTV on Purchase Price</label><input value={data.maxLTV_purchase || ""} onChange={e => f("maxLTV_purchase", e.target.value)} placeholder="e.g. 85%" className={inp} /></div>
          <div><label className={lbl}>Max % of ARV</label><input value={data.maxPctARV || ""} onChange={e => f("maxPctARV", e.target.value)} placeholder="e.g. 70%" className={inp} /></div>
          <div><label className={lbl}>Max LTC (Purchase + Rehab)</label><input value={data.maxLTC || ""} onChange={e => f("maxLTC", e.target.value)} placeholder="e.g. 90%" className={inp} /></div>
          <div><label className={lbl}>Max Loan Amount</label><input value={data.maxLoan || ""} onChange={e => f("maxLoan", e.target.value)} placeholder="e.g. $2,000,000" className={inp} /></div>
          <div><label className={lbl}>Min Loan Amount</label><input value={data.minLoan || ""} onChange={e => f("minLoan", e.target.value)} placeholder="e.g. $75,000" className={inp} /></div>
          <div><label className={lbl}>Min Credit Score</label><input value={data.minFICO || ""} onChange={e => f("minFICO", e.target.value)} placeholder="e.g. 620 or None" className={inp} /></div>
        </div>
      </div>

      {/* Pricing */}
      <div className={card}>
        <h3 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Pricing & Terms</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div><label className={lbl}>Lender Origination Points</label><input value={data.originationPoints || ""} onChange={e => f("originationPoints", e.target.value)} placeholder="e.g. 2 points" className={inp} /></div>
          <div><label className={lbl}>Max Broker Points Allowed</label><input value={data.maxBrokerPoints || ""} onChange={e => f("maxBrokerPoints", e.target.value)} placeholder="e.g. 2 points" className={inp} /></div>
          <div><label className={lbl}>Rate Floor</label><input value={data.rateFloor || ""} onChange={e => f("rateFloor", e.target.value)} placeholder="e.g. 10.99%" className={inp} /></div>
          <div><label className={lbl}>Rate Ceiling</label><input value={data.rateCeiling || ""} onChange={e => f("rateCeiling", e.target.value)} placeholder="e.g. 14.99%" className={inp} /></div>
        </div>
        <div className="mb-4">
          <label className={lbl}>Loan Terms Available</label>
          <div className="flex gap-3 flex-wrap">
            {["6mo","12mo","18mo","24mo"].map(v => (
              <button key={v} onClick={() => toggleArr("terms", v)}
                className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${(data.terms || []).includes(v) ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={data.extensionAvailable || false} onChange={e => f("extensionAvailable", e.target.checked)} className="rounded" />
            <span className="text-sm font-semibold text-slate-700">Extension Available</span>
          </label>
          {data.extensionAvailable && (
            <div className="flex-1 min-w-48">
              <input value={data.extensionCost || ""} onChange={e => f("extensionCost", e.target.value)}
                placeholder="e.g. 1 point per 6-month extension" className={inp} />
            </div>
          )}
        </div>
      </div>

      {/* Rehab & Draw */}
      <div className={card}>
        <h3 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Rehab Budget & Draw Structure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Draw Type</label>
            <select value={data.drawType || "inspection"} onChange={e => f("drawType", e.target.value)} className={inp}>
              <option value="lump_sum">Lump Sum at Closing</option>
              <option value="milestone">Milestone-Based</option>
              <option value="inspection">Inspector-Approved Draws</option>
            </select>
          </div>
          <div className="flex items-center gap-4 pt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={data.escrowRehab !== false} onChange={e => f("escrowRehab", e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-700 font-semibold">Rehab Funds Escrowed</span>
            </label>
          </div>
        </div>
      </div>

      {/* Borrower Requirements */}
      <div className={card}>
        <h3 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Borrower Requirements</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={lbl}>Experience Required</label>
            <select value={data.experienceRequired || "none"} onChange={e => f("experienceRequired", e.target.value)} className={inp}>
              <option value="none">None Required</option>
              <option value="1flip">Minimum 1 Completed Flip</option>
              <option value="3flips">Minimum 3 Completed Flips</option>
              <option value="5plus">5+ Completed Flips</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={data.personalGuarantee !== false} onChange={e => f("personalGuarantee", e.target.checked)} className="rounded" />
            <span className="text-sm text-slate-700 font-semibold">Personal Guarantee Required</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={data.entityRequired || false} onChange={e => f("entityRequired", e.target.checked)} className="rounded" />
            <span className="text-sm text-slate-700 font-semibold">LLC / Corp Required (no individual)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={data.crossCollateral || false} onChange={e => f("crossCollateral", e.target.checked)} className="rounded" />
            <span className="text-sm text-slate-700 font-semibold">Cross-Collateralization Available</span>
          </label>
        </div>
      </div>

      {/* Property & Geography */}
      <div className={card}>
        <h3 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Property Types & Geography</h3>
        <div className="mb-4">
          <label className={lbl}>Property Types Accepted</label>
          <div className="flex flex-wrap gap-2">
            {[["sfr","SFR"],["2-4","2-4 Unit"],["5plus","5+ Unit Multifamily"],["commercial","Commercial"],["land","Land"],["new_const","New Construction"]].map(([v, l]) => (
              <button key={v} onClick={() => toggleArr("propertyTypes", v)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${(data.propertyTypes || []).includes(v) ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>State Footprint</label>
          <div className="flex gap-3 mb-2">
            <button onClick={() => f("stateFootprint", "nationwide")}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold ${data.stateFootprint !== "specific" ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
              Nationwide
            </button>
            <button onClick={() => f("stateFootprint", "specific")}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold ${data.stateFootprint === "specific" ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
              Specific States Only
            </button>
          </div>
          {data.stateFootprint === "specific" && (
            <input value={data.specificStates || ""} onChange={e => f("specificStates", e.target.value)}
              placeholder="e.g. GA, FL, TX, NC, SC, TN" className={inp} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LenderProfileBuilder() {
  const [sp] = useSearchParams();
  const scenarioIdParam = sp.get("scenarioId");
  const { reportFindings } = useDecisionRecord(scenarioIdParam);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [tab, setTab] = useState("standards");
  const [lenders, setLenders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewLender, setViewLender] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Add lender form state
  const [form, setForm] = useState({ name: "", nmls: "", type: "wholesale", aeContact: "", aeEmail: "", aePhone: "", notes: "" });
  const [lenderAgencies, setLenderAgencies] = useState([]);
  const [overlays, setOverlays] = useState({});
  const [channelOverrides, setChannelOverrides] = useState({});
  const [logoDataUrl, setLogoDataUrl] = useState("");

  // Non-QM state
  const [selectedNQMProducts, setSelectedNQMProducts] = useState([]);
  const [nqmProductData, setNQMProductData] = useState({});
  const [nqmMatrix, setNQMMatrix] = useState(null);

  // Hard Money state
  const [hmData, setHMData] = useState({ lendingBasis: "lower_of", stateFootprint: "nationwide", escrowRehab: true, personalGuarantee: true });

  const isNQM = form.type === "nonqm";
  const isHM  = form.type === "hardmoney";
  const isAgency = !isNQM && !isHM;

  useEffect(() => { loadLenders(); }, []);

  const loadLenders = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "lenderProfiles"));
      setLenders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Load lenders:", e); }
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ name: "", nmls: "", type: "wholesale", aeContact: "", aeEmail: "", aePhone: "", notes: "" });
    setLenderAgencies([]); setOverlays({}); setChannelOverrides({}); setLogoDataUrl("");
    setSelectedNQMProducts([]); setNQMProductData({}); setNQMMatrix(null);
    setHMData({ lendingBasis: "lower_of", stateFootprint: "nationwide", escrowRehab: true, personalGuarantee: true });
  };

  const saveLender = async () => {
    if (!form.name.trim() || !form.nmls.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        logoDataUrl,
        agencies: isAgency ? lenderAgencies : [],
        overlays: isAgency ? overlays : {},
        channelOverrides: isAgency ? channelOverrides : {},
        nqmProducts: isNQM ? selectedNQMProducts : [],
        nqmProductData: isNQM ? nqmProductData : {},
        matrixData: isNQM ? nqmMatrix : null,
        hmData: isHM ? hmData : null,
        layer1: "AGENCY_STANDARDS_V1",
        source: "BROKER_PRIVATE",
        visibility: "private",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "lenderProfiles"), payload);
      try {
        await addDoc(collection(db, "platform_activity"), {
          module: "Lender Profile Builder", action: "lender_created",
          lenderId: ref.id, lenderName: form.name, lenderType: form.type, timestamp: serverTimestamp(),
        });
      } catch (_) {}
      setSaved(true);
      resetForm();
      await loadLenders();
      setTab("profiles");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error("Save lender:", e); }
    setSaving(false);
  };

  const deleteLender = async (id) => {
    try {
      await deleteDoc(doc(db, "lenderProfiles", id));
      setLenders(prev => prev.filter(l => l.id !== id));
      if (viewLender?.id === id) setViewLender(null);
      setDeleteConfirm(null);
    } catch (e) { console.error("Delete lender:", e); }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const toggleAgency = (a) => setLenderAgencies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  const setOverlay  = (field, val) => setOverlays(prev => ({ ...prev, [field]: val }));
  const setChannel  = (field, val) => setChannelOverrides(prev => ({ ...prev, [field]: val }));
  const overlayCount = Object.values(overlays).filter(v => v !== "" && v !== null && v !== undefined).length;
  const channelCount = Object.values(channelOverrides).filter(v => v !== "" && v !== null && v !== undefined).length;

  const formValid = form.name.trim() && form.nmls.trim() && (isNQM || isHM || lenderAgencies.length > 0);

  return (
    <div>
      {/* Sub-header with tabs */}
      <div className="bg-white border-b border-slate-200 px-0 pb-0 mb-6 -mx-0">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div>
            <p className="text-xs font-bold text-green-600 tracking-widest uppercase">Core Infrastructure</p>
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Lender Profile Builder™
            </h2>
            <p className="text-slate-500 text-sm mt-0.5">Three-Layer Guideline Stack · Agency Standards · Non-QM Matrix Reader · Hard Money Profiles</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[["standards","📋 Agency Standards"],["profiles",`🗂️ My Lenders (${lenders.length})`],["add","➕ Add Lender"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${tab === id ? "bg-green-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-0.5 bg-slate-100" />
      </div>

      {/* ── AGENCY STANDARDS ── */}
      {tab === "standards" && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[["FHA 4000.1","HUD/FHA","🏛️"],["Fannie Mae Selling Guide","FHFA/FNMA","🏦"],["VA Pamphlet 26-7","Dept. Veterans Affairs","🎖️"],["USDA HB-1-3555","USDA Rural Dev.","🌾"],["Freddie Mac SF Guide","FHFA/FHLMC","🏦"],["HomeReady + Home Possible","FNMA/FHLMC","✨"]].map(([d, ag, icon]) => (
              <div key={d} className="bg-white border border-slate-200 rounded-2xl p-3 text-center shadow-sm">
                <p className="text-xl mb-1">{icon}</p>
                <p className="text-xs font-bold text-slate-800">{d}</p>
                <p className="text-xs text-slate-500 mt-0.5">{ag}</p>
              </div>
            ))}
          </div>
          <AgencyStandardsTab />
        </div>
      )}

      {/* ── MY LENDERS ── */}
      {tab === "profiles" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'DM Serif Display', serif" }}>My Lender Profiles</h3>
              <p className="text-slate-500 text-sm mt-0.5">Your private lender roster — agency, Non-QM, and Hard Money.</p>
            </div>
            <button onClick={() => setTab("add")} className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-green-700 hover:bg-green-600 text-white shadow-sm">
              ➕ Add Lender
            </button>
          </div>

          {loading && <div className="text-center py-12 text-slate-400">Loading profiles...</div>}

          {!loading && lenders.length === 0 && (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <div className="text-4xl mb-4">🏗️</div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">No lender profiles yet</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">Add your first lender — agency wholesale, Non-QM, or hard money — to begin building your roster.</p>
              <button onClick={() => setTab("add")} className="px-6 py-3 rounded-xl font-semibold text-sm bg-green-700 hover:bg-green-600 text-white">
                ➕ Add First Lender
              </button>
            </div>
          )}

          {!loading && lenders.length > 0 && (
            <div className="space-y-4">
              {lenders.map(lender => {
                const oCount = Object.values(lender.overlays || {}).filter(v => v !== "" && v !== null).length;
                const cCount = Object.values(lender.channelOverrides || {}).filter(v => v !== "" && v !== null).length;
                const isExpanded = viewLender?.id === lender.id;
                const tc = lenderTypeConfig[lender.type] || lenderTypeConfig.wholesale;
                return (
                  <div key={lender.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm transition-all hover:border-slate-300">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {lender.logoDataUrl
                            ? <img src={lender.logoDataUrl} alt={lender.name} className="w-full h-full object-contain p-1" />
                            : <span className="text-xl">{tc.icon}</span>}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900">{lender.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tc.color}`}>{tc.label}</span>
                            {lender.matrixData && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">Matrix ✓</span>}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">NMLS# {lender.nmls}</p>
                          <div className="flex gap-2 flex-wrap mt-2">
                            {(lender.agencies || []).map(a => (
                              <span key={a} className={`px-2 py-0.5 rounded text-xs font-bold ${AC[AGENCY_STANDARDS[a]?.color]?.badge || "bg-slate-100 text-slate-500"}`}>{a}</span>
                            ))}
                            {(lender.nqmProducts || []).slice(0,3).map(pid => {
                              const p = NON_QM_PRODUCTS.find(x => x.id === pid);
                              return <span key={pid} className="px-2 py-0.5 rounded text-xs font-bold bg-violet-100 text-violet-700">{p?.label || pid}</span>;
                            })}
                            {(lender.nqmProducts || []).length > 3 && (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-violet-100 text-violet-700">+{lender.nqmProducts.length - 3} more</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {oCount > 0 && <div className="text-center"><p className="text-base font-bold text-orange-600">{oCount}</p><p className="text-xs text-slate-400">Overlays</p></div>}
                        {cCount > 0 && <div className="text-center"><p className="text-base font-bold text-violet-600">{cCount}</p><p className="text-xs text-slate-400">Channel</p></div>}
                        <button onClick={() => setViewLender(isExpanded ? null : lender)}
                          className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 font-semibold text-sm">
                          {isExpanded ? "Hide" : "View"}
                        </button>
                        {deleteConfirm === lender.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => deleteLender(lender.id)} className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold">Delete</button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-3 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(lender.id)} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-red-300 text-red-400 font-semibold text-sm">🗑️</button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
                        {lender.type === "nonqm" && lender.matrixData && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <MatrixUploader onExtracted={() => {}} existingMatrix={lender.matrixData} />
                          </div>
                        )}
                        {lender.type === "hardmoney" && lender.hmData && (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Deal Structure</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                ["Max ARV %", lender.hmData.maxPctARV],
                                ["Max LTC", lender.hmData.maxLTC],
                                ["Rate Range", lender.hmData.rateFloor && `${lender.hmData.rateFloor} – ${lender.hmData.rateCeiling || "?"}`],
                                ["Loan Terms", (lender.hmData.terms || []).join(", ")],
                                ["Experience Req.", lender.hmData.experienceRequired === "none" ? "None" : lender.hmData.experienceRequired],
                                ["PG Required", lender.hmData.personalGuarantee ? "Yes" : "No"],
                                ["LLC Required", lender.hmData.entityRequired ? "Yes" : "No"],
                                ["Draw Type", lender.hmData.drawType],
                              ].filter(([, v]) => v).map(([label, val]) => (
                                <div key={label} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                  <p className="text-xs text-amber-700">{label}</p>
                                  <p className="text-sm font-bold text-amber-900 mt-0.5">{val}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {lender.aeContact && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Account Executive</p>
                            <p className="font-semibold text-slate-900">{lender.aeContact}</p>
                            {lender.aeEmail && <p className="text-slate-500 text-sm">{lender.aeEmail}</p>}
                            {lender.aePhone && <p className="text-slate-500 text-sm">{lender.aePhone}</p>}
                          </div>
                        )}
                        {oCount > 0 && (
                          <div>
                            <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2">Lender Overlays (Layer 2)</p>
                            <div className="space-y-2">
                              {Object.entries(lender.overlays || {}).filter(([, v]) => v !== "" && v !== null).map(([k, v]) => {
                                const [agKey, ...fKey] = k.split("_");
                                const fieldKey = fKey.join("_");
                                const agStd = AGENCY_STANDARDS[agKey]?.fields[fieldKey];
                                return (
                                  <div key={k} className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-2">
                                    <p className="text-sm text-slate-700">{agStd?.label || k}</p>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-slate-400 line-through">{agStd?.prefix || ""}{agStd?.value !== undefined ? fp(agStd.value, agStd?.unit) : "—"}</span>
                                      <span className="text-sm font-bold text-orange-700">{v}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {lender.notes && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-sm text-slate-600 leading-relaxed">{lender.notes}</p>
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

      {/* ── ADD LENDER ── */}
      {tab === "add" && (
        <div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>Add New Lender Profile</h3>
          <p className="text-slate-500 text-sm mb-6">Start with the lender's identity, then select their type to unlock the appropriate guideline capture flow.</p>

          {/* Layer Legend (agency only) */}
          {isAgency && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[["Layer 1","Agency Standard","Pre-loaded. You don't enter these.","green"],["Layer 2","Lender Overlay","Enter only where lender differs from agency.","orange"],["Layer 3","Channel Override","AE-negotiated exception. Highest priority.","violet"]].map(([layer, name, desc, color]) => (
                <div key={layer} className={`rounded-2xl p-4 border ${color === "green" ? "bg-green-50 border-green-200" : color === "orange" ? "bg-orange-50 border-orange-200" : "bg-violet-50 border-violet-200"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${color === "green" ? "text-green-600" : color === "orange" ? "text-orange-600" : "text-violet-600"}`}>{layer}</p>
                  <p className="font-bold text-slate-900 text-sm">{name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* Identity */}
          <div className={`${card} mb-5`}>
            <h4 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Lender Identity</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2"><label className={lbl}>Lender Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. United Wholesale Mortgage" className={inp} /></div>
              <div><label className={lbl}>NMLS# *</label><input value={form.nmls} onChange={e => setForm(f => ({ ...f, nmls: e.target.value }))} placeholder="e.g. 3038" className={inp} /></div>
            </div>

            {/* Logo */}
            <div className="mb-4">
              <label className={lbl}>Lender Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoDataUrl ? <img src={logoDataUrl} alt="Logo" className="w-full h-full object-contain p-1" /> : <span className="text-slate-400 text-xs text-center px-1">No logo</span>}
                </div>
                <label className="cursor-pointer px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold">
                  Upload PNG / JPG / SVG
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                {logoDataUrl && <button onClick={() => setLogoDataUrl("")} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
              </div>
            </div>

            {/* Lender Type */}
            <div>
              <label className={lbl}>Lender Type *</label>
              <div className="flex flex-wrap gap-3">
                {Object.entries(lenderTypeConfig).map(([v, cfg]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
                    className={`px-4 py-2 rounded-xl border font-semibold text-sm transition-all flex items-center gap-2 ${
                      form.type === v
                        ? v === "nonqm"     ? "bg-violet-700 border-violet-700 text-white"
                        : v === "hardmoney" ? "bg-amber-600 border-amber-600 text-white"
                        : "bg-green-700 border-green-700 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                    }`}>
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Agency Programs (agency types only) */}
            {isAgency && (
              <div className="mt-4">
                <label className={lbl}>Loan Programs Offered * (select all that apply)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(AGENCY_STANDARDS).map(([key, ag]) => (
                    <label key={key} className={`block cursor-pointer p-3 rounded-2xl border text-center transition-all ${lenderAgencies.includes(key) ? `${AC[ag.color].bg} ${AC[ag.color].border}` : "bg-slate-50 border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" className="hidden" checked={lenderAgencies.includes(key)} onChange={() => toggleAgency(key)} />
                      <div className="text-xl mb-1">{ag.icon}</div>
                      <p className="font-bold text-slate-900 text-sm">{ag.label}</p>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AE Contact */}
          <div className={`${card} mb-5`}>
            <h4 className="text-base font-bold text-slate-800 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>Account Executive Contact</h4>
            <p className="text-xs text-slate-400 mb-4">The person who negotiates exceptions, pushes rate updates, and communicates overlays. Always stored with the profile so it's at hand.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className={lbl}>AE Name</label><input value={form.aeContact} onChange={e => setForm(f => ({ ...f, aeContact: e.target.value }))} placeholder="e.g. Sarah Johnson" className={inp} /></div>
              <div><label className={lbl}>AE Email</label><input value={form.aeEmail} onChange={e => setForm(f => ({ ...f, aeEmail: e.target.value }))} placeholder="e.g. sarah@lender.com" className={inp} /></div>
              <div><label className={lbl}>AE Phone</label><input value={form.aePhone} onChange={e => setForm(f => ({ ...f, aePhone: e.target.value }))} placeholder="e.g. (800) 555-0100" className={inp} /></div>
            </div>
          </div>

          {/* Agency Overlays */}
          {isAgency && lenderAgencies.length > 0 && (
            <div className={`${card} mb-5`}>
              <div className="flex items-center gap-3 mb-2">
                <h4 className="text-base font-bold text-slate-800" style={{ fontFamily: "'DM Serif Display', serif" }}>Guideline Overlays</h4>
                {overlayCount > 0 && <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{overlayCount} overlay{overlayCount !== 1 ? "s" : ""}</span>}
                {channelCount > 0 && <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">{channelCount} channel</span>}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-5 text-xs text-amber-800">
                Click <strong>✏️ Edit</strong> only on fields where this lender differs from agency standard. All other fields automatically inherit agency values — no entry needed.
              </div>
              {lenderAgencies.map(agKey => (
                <div key={agKey} className="mb-6">
                  <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${AC[AGENCY_STANDARDS[agKey].color].border}`}>
                    <span>{AGENCY_STANDARDS[agKey].icon}</span>
                    <p className={`font-bold text-sm ${AC[AGENCY_STANDARDS[agKey].color].text}`}>{AGENCY_STANDARDS[agKey].label} — {AGENCY_STANDARDS[agKey].fullName}</p>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(AGENCY_STANDARDS[agKey].fields).map(([fieldKey, field]) => {
                      const compositeKey = `${agKey}_${fieldKey}`;
                      return (
                        <OverlayInput key={compositeKey} fieldKey={compositeKey} agencyField={field}
                          overlay={overlays[compositeKey]} onChange={setOverlay}
                          channelOverlay={channelOverrides[compositeKey]} onChannelChange={setChannel} />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Non-QM Section */}
          {isNQM && (
            <div className="mb-5">
              <NonQMSection
                selectedProducts={selectedNQMProducts} setSelectedProducts={setSelectedNQMProducts}
                productData={nqmProductData} setProductData={setNQMProductData}
                matrix={nqmMatrix} setMatrix={setNQMMatrix}
              />
            </div>
          )}

          {/* Hard Money Section */}
          {isHM && (
            <div className="mb-5">
              <HardMoneySection
                data={hmData}
                onChange={(key, val) => setHMData(prev => ({ ...prev, [key]: val }))}
              />
            </div>
          )}

          {/* Notes */}
          <div className={`${card} mb-6`}>
            <label className={lbl}>Notes / Special Guidelines</label>
            <p className="text-xs text-slate-400 mb-2">Submission preferences, turn times, niche programs, pricing tiers, anything that doesn't fit a structured field.</p>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={4}
              placeholder="e.g. Strong on Non-QM. AE prefers pre-approval calls. 15-day turn on VA. Ask AE about LLPA waivers on rural properties..."
              className={`${inp} resize-none`} />
          </div>

          {/* Save */}
          <div className="flex items-center gap-4">
            <button onClick={saveLender} disabled={!formValid || saving}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all ${formValid && !saving ? "bg-green-700 hover:bg-green-600 text-white shadow-sm" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
              {saving ? "Saving..." : saved ? "✅ Lender Profile Saved" : "💾 Save Lender Profile"}
            </button>
            <button onClick={() => { resetForm(); setTab("profiles"); }}
              className="px-6 py-3.5 rounded-2xl font-semibold text-sm bg-white border border-slate-200 hover:border-slate-400 text-slate-600">
              Cancel
            </button>
          </div>
          {!formValid && (
            <p className="text-xs text-slate-400 text-center mt-2">
              {isAgency ? "Enter lender name, NMLS#, and select at least one loan program to enable save." : "Enter lender name and NMLS# to enable save."}
            </p>
          )}
          {scenarioIdParam && (
            <div className="mt-4">
              <DecisionRecordBanner
                recordId={savedRecordId}
                moduleName="Lender Profile Builder"
                onSave={() => {
                  setRecordSaving(true);
                  reportFindings("LENDER_PROFILE", { lenderName: form.name, lenderType: form.type, nmls: form.nmls, timestamp: new Date().toISOString() })
                    .then(id => { if (id) setSavedRecordId(id); })
                    .finally(() => setRecordSaving(false));
                }}
                saving={recordSaving}
              />
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-10 bg-white border border-slate-200 rounded-2xl p-4 text-center">
        <p className="text-xs text-slate-400">LoanBeacons™ Lender Profile Builder™ · Three-Layer Guideline Architecture · Agency Standards (FHA 4000.1, Fannie Mae Selling Guide, Freddie Mac SF Guide, VA Pamphlet 26-7, USDA HB-1-3555) · Non-QM Matrix AI Reader · Hard Money Deal Structure · PRD v4.0</p>
      </div>
    </div>
  );
}
