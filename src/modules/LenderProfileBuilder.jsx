import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../firebase/config";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";

const storage = getStorage();

// ─── Agency Standards ─────────────────────────────────────────────────────────
const AGENCY_STANDARDS = {
  FHA: {
    label: "FHA", fullName: "Federal Housing Administration",
    source: "HUD Handbook 4000.1", icon: "🏛️", color: "blue", updateFreq: "2–3x/year",
    fields: {
      minFICO:          { label: "Minimum Credit Score",        value: 580,        note: "500–579 requires 10% down. AUS may approve lower with compensating factors." },
      minFICO_10pct:    { label: "Min FICO (10% Down)",         value: 500,        note: "Borrowers 500–579 require minimum 10% down payment." },
      maxDTI:           { label: "Maximum DTI (AUS)",           value: 57,  unit: "%",      note: "FHA allows up to 57% with AUS approval. Manual underwrite max 43%." },
      maxDTI_manual:    { label: "Maximum DTI (Manual UW)",     value: 43,  unit: "%",      note: "Manual underwrite max 43%. Up to 45% with 2 compensating factors." },
      maxLTV_purchase:  { label: "Max LTV — Purchase",          value: 96.5,unit: "%",      note: "96.5% = 3.5% minimum down payment. FICO ≥ 580 required." },
      maxLTV_rateterm:  { label: "Max LTV — Rate/Term Refi",    value: 97.75,unit:"%",      note: "No cash-out. Primary residence only." },
      maxLTV_cashout:   { label: "Max LTV — Cash-Out Refi",     value: 80,  unit: "%",      note: "Owner-occupied primary. 12-month seasoning required." },
      mipUpfront:       { label: "Upfront MIP",                 value: 1.75,unit: "%",      note: "1.75% of base loan amount. Can be financed." },
      bkChapter7:       { label: "BK Chapter 7 Seasoning",      value: 24,  unit: "months", note: "2 years from discharge. 1 year with extenuating circumstances." },
      bkChapter13:      { label: "BK Chapter 13 Seasoning",     value: 12,  unit: "months", note: "12 months on-time payments + court approval required." },
      foreclosure:      { label: "Foreclosure Seasoning",       value: 36,  unit: "months", note: "3 years from completion. 1 year with extenuating circumstances." },
      shortsale:        { label: "Short Sale / DIL Seasoning",  value: 36,  unit: "months", note: "3 years. May be reduced with extenuating circumstances." },
      maxLoanLimit:     { label: "Loan Limit (Standard Areas)", value: 498257, prefix: "$", note: "2024 standard area limit. High-cost up to $1,149,825." },
      selfEmployed:     { label: "Self-Employed Doc",           value: "2 years",            note: "2 years history required. 1 year possible with prior employment in same field." },
      reserves:         { label: "Reserve Requirement",         value: "None required",      note: "No minimum reserve requirement by FHA. Lenders may impose overlays." },
    }
  },
  CONVENTIONAL: {
    label: "Conventional", fullName: "Fannie Mae / Freddie Mac",
    source: "Fannie Mae Selling Guide + Freddie Mac SF Guide", icon: "🏦", color: "indigo", updateFreq: "Monthly",
    fields: {
      minFICO:                   { label: "Minimum Credit Score",         value: 620,     note: "620 minimum. DU/LPA may approve lower. Best pricing at 740+." },
      maxDTI:                    { label: "Maximum DTI",                  value: 50,  unit: "%",      note: "45–50% with DU/LPA. Manual UW max 36–45%." },
      maxLTV_purchase_primary:   { label: "Max LTV — Purchase (Primary)", value: 97,  unit: "%",      note: "97% for FTHB (HomeReady/Home Possible). 95% standard." },
      maxLTV_purchase_2unit:     { label: "Max LTV — Purchase (2-4 Unit)",value: 85,  unit: "%",      note: "2-unit primary: 85%. 3-4 unit: 75%." },
      maxLTV_investment:         { label: "Max LTV — Investment",         value: 75,  unit: "%",      note: "Single-unit: 85% purchase / 75% refi. 2-4 unit: 75%." },
      maxLTV_cashout:            { label: "Max LTV — Cash-Out Refi",      value: 80,  unit: "%",      note: "Primary: 80%. Investment: 75%. 6-month seasoning required." },
      conformingLimit:           { label: "Conforming Loan Limit",        value: 766550, prefix: "$", note: "2024 standard. High-cost up to $1,149,825." },
      bkChapter7:                { label: "BK Chapter 7 Seasoning",       value: 48,  unit: "months", note: "4 years from discharge. 2 years with extenuating circumstances." },
      foreclosure:               { label: "Foreclosure Seasoning",        value: 84,  unit: "months", note: "7 years standard. 3 years with extenuating circumstances + 90% LTV max." },
      shortsale:                 { label: "Short Sale Seasoning",         value: 48,  unit: "months", note: "4 years. 2 years with extenuating circumstances." },
      pmi_ltv:                   { label: "PMI Required Above",           value: 80,  unit: "%",      note: "PMI required when LTV > 80%. Auto-cancelled at 78%." },
      reserves_2unit:            { label: "Reserves — 2-4 Unit",          value: 6,   unit: "months PITI", note: "6 months PITI reserves for 2-4 unit properties." },
      selfEmployed:              { label: "Self-Employed Doc",            value: "2 years",            note: "2 years tax returns (personal + business). YTD P&L." },
    }
  },
  VA: {
    label: "VA", fullName: "Department of Veterans Affairs",
    source: "VA Lenders Handbook (VA Pamphlet 26-7)", icon: "🎖️", color: "emerald", updateFreq: "Periodic + Circulars",
    fields: {
      minFICO:               { label: "Minimum Credit Score (Agency)", value: 0,    note: "VA sets no minimum. Lender overlays typically 580–640." },
      maxDTI:                { label: "Maximum DTI",                   value: 41,   unit: "%",      note: "41% guideline. Higher acceptable with sufficient residual income." },
      maxLTV_purchase:       { label: "Max LTV — Purchase",            value: 100,  unit: "%",      note: "100% financing for eligible veterans with full entitlement." },
      maxLTV_cashout:        { label: "Max LTV — Cash-Out Refi",       value: 100,  unit: "%",      note: "Type II cash-out: up to 100% LTV." },
      fundingFee_first:      { label: "Funding Fee — First Use",       value: 2.15, unit: "%",      note: "2.15% first use, 0% down. Waived for disabled veterans." },
      fundingFee_subsequent: { label: "Funding Fee — Subsequent Use",  value: 3.3,  unit: "%",      note: "3.30% subsequent use. Same reductions apply." },
      fundingFee_irrrl:      { label: "Funding Fee — IRRRL",           value: 0.5,  unit: "%",      note: "0.50% on all IRRRLs. Waived for disabled veterans." },
      bkChapter7:            { label: "BK Chapter 7 Seasoning",        value: 24,   unit: "months", note: "2 years from discharge. Credit reestablished required." },
      foreclosure:           { label: "Foreclosure Seasoning",         value: 24,   unit: "months", note: "2 years. Lender overlays often require 36+ months." },
      residualIncome:        { label: "Residual Income Required",      value: "Yes",                note: "Required. Varies by family size and region. VA's primary qualifying metric." },
      entitlement:           { label: "Loan Limit (Full Entitlement)", value: "No limit",           note: "No limit with full entitlement. Reduced entitlement = county conforming limit." },
      pmi:                   { label: "PMI / MIP Required",            value: "None",               note: "No PMI at any LTV. Funding fee only." },
    }
  },
  USDA: {
    label: "USDA", fullName: "USDA Rural Development",
    source: "USDA HB-1-3555", icon: "🌾", color: "amber", updateFreq: "1–2x/year",
    fields: {
      minFICO:             { label: "Minimum Credit Score (GUS)", value: 640,          note: "640 for GUS automated approval. Lower requires manual UW." },
      maxDTI:              { label: "Maximum DTI",                value: 41,  unit: "%",      note: "29/41% guideline. GUS may approve higher." },
      maxLTV_purchase:     { label: "Max LTV — Purchase",         value: 100, unit: "%",      note: "100% financing + can finance guarantee fee." },
      guaranteeFee:        { label: "Upfront Guarantee Fee",      value: 1.0, unit: "%",      note: "1.00% of loan amount. Can be financed." },
      annualFee:           { label: "Annual Fee",                 value: 0.35,unit: "%",      note: "0.35% of outstanding balance annually. Paid monthly." },
      incomeLimit:         { label: "Income Limit",               value: "115% of AMI",        note: "Cannot exceed 115% of area median income." },
      propertyEligibility: { label: "Property Eligibility",       value: "Rural areas only",   note: "Must be in USDA-eligible rural area." },
      bkChapter7:          { label: "BK Chapter 7 Seasoning",     value: 36,  unit: "months", note: "3 years from discharge date." },
      foreclosure:         { label: "Foreclosure Seasoning",      value: 36,  unit: "months", note: "3 years from completion date." },
    }
  }
};

const fp = (n, u) => u === "%" ? `${n}%` : u === "months" ? `${n} mo` : u === "months PITI" ? `${n} mo PITI` : u ? `${n} ${u}` : String(n);

const agencyColors = {
  blue:    { bg: "bg-blue-900/20",    border: "border-blue-700/50",    badge: "bg-blue-800/60 text-blue-300",       text: "text-blue-400"    },
  indigo:  { bg: "bg-indigo-900/20",  border: "border-indigo-700/50",  badge: "bg-indigo-800/60 text-indigo-300",   text: "text-indigo-400"  },
  emerald: { bg: "bg-emerald-900/20", border: "border-emerald-700/50", badge: "bg-emerald-800/60 text-emerald-300", text: "text-emerald-400" },
  amber:   { bg: "bg-amber-900/20",   border: "border-amber-700/50",   badge: "bg-amber-800/60 text-amber-300",     text: "text-amber-400"   },
};

const PROGRAM_TYPES  = [
  { value: "grant",           label: "Grant" },
  { value: "forgivable_loan", label: "Forgivable Loan" },
  { value: "deferred_loan",   label: "Deferred Loan" },
  { value: "second_mortgage", label: "2nd Mortgage" },
];
const LOAN_TYPES = ["FHA", "Conventional", "VA", "USDA"];

// ─── LOGO UTILS ───────────────────────────────────────────────────────────────
async function compressLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 120;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Load failed")); };
    img.src = url;
  });
}

function LenderLogo({ logoBase64, name, size = 48 }) {
  if (logoBase64) {
    return (
      <img src={logoBase64} alt={`${name} logo`} style={{
        width: size, height: size, objectFit: "contain", borderRadius: 10,
        background: "#fff", padding: 3, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0,
      }}/>
    );
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.45, borderRadius: 10, flexShrink: 0 }}
      className="bg-green-900/40 border border-green-700/40 flex items-center justify-center">
      🏦
    </div>
  );
}

function LogoUploadInput({ value, onChange, label = "Lender Logo" }) {
  const [dragging, setDragging] = useState(false);
  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try { onChange(await compressLogo(file)); } catch (e) { console.error("Logo compress:", e); }
  };
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-2">{label}</label>}
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          {value
            ? <img src={value} alt="preview" className="w-14 h-14 rounded-xl object-contain bg-white p-1 border border-slate-600"/>
            : <div className="w-14 h-14 rounded-xl bg-slate-700 border border-dashed border-slate-500 flex items-center justify-center text-slate-500 text-xs">No logo</div>
          }
        </div>
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          className={`flex-1 flex flex-col items-center justify-center h-14 border-2 border-dashed rounded-xl cursor-pointer transition-all text-xs
            ${dragging ? "border-green-400 bg-green-900/20" : "border-slate-600 hover:border-green-500/60 hover:bg-slate-800/60 text-slate-400"}`}>
          <input type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])}/>
          <span>⬆️ Upload logo</span>
          <span className="text-slate-500 mt-0.5">PNG · JPG · SVG — auto-resized to thumbnail</span>
        </label>
        {value && (
          <button onClick={() => onChange(null)} className="text-xs text-slate-500 hover:text-red-400 px-2 py-1 transition-colors">
            ✕ Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DOCUMENT TYPE OPTIONS ────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: "guidelines", label: "Guidelines",  icon: "📋" },
  { value: "matrix",     label: "Matrix",      icon: "📊" },
  { value: "rate_sheet", label: "Rate Sheet",  icon: "💰" },
  { value: "other",      label: "Other",       icon: "📄" },
];

// ─── PER-LENDER DOCUMENTS SECTION ────────────────────────────────────────────
function LenderDocsSection({ lenderId, lenderName, uid, onExtractDpa }) {
  const [docs,      setDocs]      = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [successMsg,  setSuccessMsg]  = useState(null);
  const [open, setOpen]  = useState(false);
  const [docType, setDocType] = useState("guidelines");
  const [extractingDocId, setExtractingDocId] = useState(null);

  const flash = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3500); };

  const reload = useCallback(async () => {
    if (!uid || !lenderId) return;
    try {
      const snap = await getDocs(collection(db, "lenderProfiles", lenderId, "documents"));
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.uploadedAt?.seconds - a.uploadedAt?.seconds));
    } catch (e) { console.error("Docs load:", e); }
  }, [uid, lenderId]);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid || !lenderId) return;
    if (file.type !== "application/pdf") { setUploadError("PDF files only."); return; }
    setUploadError(null);
    setUploading(true);
    setProgress(0);

    try {
      const storagePath = `lenderDocs/${uid}/${lenderId}/${Date.now()}_${file.name}`;
      const storageRef  = ref(storage, storagePath);
      const uploadTask  = uploadBytesResumable(storageRef, file);

      await new Promise((resolve, reject) => {
        uploadTask.on("state_changed",
          snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          resolve
        );
      });

      const downloadURL = await getDownloadURL(storageRef);

      await addDoc(collection(db, "lenderProfiles", lenderId, "documents"), {
        name:        file.name,
        type:        docType,
        url:         downloadURL,
        storagePath,
        size:        file.size,
        uploadedAt:  serverTimestamp(),
        lender_id:   lenderId,
        lender_name: lenderName,
        uid,
      });

      flash(`✅ "${file.name}" uploaded successfully.`);
      await reload();
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      setProgress(0);
      e.target.value = "";
    }
  };

  const deleteDoc_ = async (document) => {
    if (!uid) return;
    try {
      // Delete from Storage
      try {
        const storageRef = ref(storage, document.storagePath);
        await deleteObject(storageRef);
      } catch (_) { /* file may already be gone */ }
      // Delete from Firestore
      await deleteDoc(doc(db, "lenderProfiles", lenderId, "documents", document.id));
      setDocs(prev => prev.filter(d => d.id !== document.id));
      flash("Document removed.");
    } catch (e) { console.error("Delete doc:", e); }
  };

  const handleExtract = async (document) => {
    setExtractingDocId(document.id);
    try {
      // Fetch the PDF from Storage URL as blob, convert to base64
      const resp    = await fetch(document.url);
      const blob    = await resp.blob();
      const base64  = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(blob);
      });

      // Call parent handler which runs the Haiku extraction
      await onExtractDpa({ base64, fileName: document.name, lenderId, lenderName });
      flash(`✅ Extraction complete — check DPA Programs below.`);
    } catch (err) {
      console.error("Extract error:", err);
      setUploadError("Extraction failed: " + err.message);
    } finally {
      setExtractingDocId(null);
    }
  };

  const fmt = (bytes) => bytes < 1024*1024 ? `${(bytes/1024).toFixed(0)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;
  const typeMap = Object.fromEntries(DOC_TYPES.map(t => [t.value, t]));

  return (
    <div className="mt-3">
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-start justify-between px-4 py-3 rounded-xl transition-all group
          ${docs.length === 0 && !open
            ? "bg-blue-900/20 border border-blue-700/50 hover:border-blue-500 hover:bg-blue-900/30"
            : "bg-slate-900/60 border border-slate-600 hover:border-blue-700/50"}`}>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">📁</span>
            <span className={`text-sm font-bold transition-colors ${docs.length === 0 ? "text-blue-300 group-hover:text-blue-200" : "text-slate-300 group-hover:text-white"}`}>
              Guidelines &amp; Matrices
            </span>
            {docs.length > 0 ? (
              <span className="px-2 py-0.5 bg-blue-900/50 border border-blue-700/50 rounded text-xs font-bold text-blue-300">
                {docs.length} doc{docs.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"/>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"/>
                </span>
                <span className="text-xs text-blue-400 font-semibold">Store lender PDFs here</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 ml-6">
            Underwriting guidelines · Product matrices · Rate sheets — stored permanently for reference
          </p>
        </div>
        <span className={`text-sm mt-0.5 flex-shrink-0 ${docs.length === 0 ? "text-blue-500" : "text-slate-500"}`}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Upload zone */}
          <div className="bg-slate-900/40 border border-blue-700/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">📥 Upload PDF Document</p>
              <span className="text-xs text-slate-500">Stored permanently on this lender</span>
            </div>

            {/* Doc type selector */}
            <div className="flex gap-2 flex-wrap mb-3">
              {DOC_TYPES.map(t => (
                <button key={t.value} onClick={() => setDocType(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
                    ${docType === t.value
                      ? "bg-blue-700 border-blue-500 text-white"
                      : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500"}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <label className={`relative flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all
              ${uploading ? "border-blue-500/60 bg-blue-900/10" : "border-blue-700/40 hover:border-blue-400/60 hover:bg-blue-900/10 bg-slate-900/30"}`}>
              <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload} disabled={uploading}/>
              {uploading ? (
                <div className="text-center w-full px-6">
                  <p className="text-sm text-blue-400 font-semibold mb-2">Uploading... {progress}%</p>
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }}/>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-xl mb-1">⬆️</div>
                  <p className="text-sm text-blue-300 font-bold">Click or drag PDF</p>
                  <p className="text-xs text-slate-400 mt-0.5">Will be saved as: {DOC_TYPES.find(t => t.value === docType)?.icon} {DOC_TYPES.find(t => t.value === docType)?.label}</p>
                </div>
              )}
            </label>

            {uploadError && <p className="mt-2 text-xs text-red-300 bg-red-900/20 border border-red-700 rounded-lg p-2">⚠ {uploadError}</p>}
            {successMsg  && <p className="mt-2 text-xs text-green-300 bg-green-900/20 border border-green-700 rounded-lg p-2">{successMsg}</p>}
          </div>

          {/* Stored docs list */}
          {docs.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                📁 Stored Documents — {docs.length}
              </p>
              <div className="space-y-2">
                {docs.map(d => {
                  const meta = typeMap[d.type] || typeMap.other;
                  const isExtracting = extractingDocId === d.id;
                  return (
                    <div key={d.id} className="flex items-center gap-3 bg-slate-800/50 border border-slate-600 rounded-xl px-3 py-2.5">
                      <span className="text-lg flex-shrink-0">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{d.name}</div>
                        <div className="text-xs text-slate-400">
                          {meta.label}
                          {d.size ? ` · ${fmt(d.size)}` : ""}
                          {d.uploadedAt?.toDate ? ` · ${d.uploadedAt.toDate().toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a href={d.url} target="_blank" rel="noopener noreferrer"
                          className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all">
                          View
                        </a>
                        {(d.type === "guidelines" || d.type === "matrix") && (
                          <button
                            onClick={() => handleExtract(d)}
                            disabled={isExtracting}
                            className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-green-900/50 hover:bg-green-800/60 border border-green-700/50 text-green-300 transition-all disabled:opacity-50">
                            {isExtracting ? "🤖 Extracting..." : "🤖 Extract DPA"}
                          </button>
                        )}
                        <button onClick={() => deleteDoc_(d)}
                          className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-red-900/40 border border-slate-600 hover:border-red-700 text-slate-400 hover:text-red-300 transition-all">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {docs.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-2">No documents stored yet. Upload a PDF above.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PER-LENDER DPA SECTION ───────────────────────────────────────────────────
function LenderDpaSection({ lenderId, lenderName, uid }) {
  const [pending,    setPending]    = useState([]);
  const [confirmed,  setConfirmed]  = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [successMsg,  setSuccessMsg]  = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [open, setOpen] = useState(false);

  const flash = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3500); };

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const [ps, cs] = await Promise.all([
        getDocs(collection(db, "dpaPrograms", uid, "pending")),
        getDocs(collection(db, "dpaPrograms", uid, "confirmed")),
      ]);
      setPending(ps.docs.map(d => ({ _docId: d.id, ...d.data() })).filter(d => d.lender_id === lenderId));
      setConfirmed(cs.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.lender_id === lenderId));
    } catch (e) { console.error("DPA load:", e); }
  }, [uid, lenderId]);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    if (file.type !== "application/pdf") { setUploadError("PDF files only."); return; }
    setUploadError(null);
    setUploading(true);
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
    setUploading(false);
    setExtracting(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: `You are a mortgage industry data extraction specialist. Extract all Down Payment Assistance (DPA) programs from the provided lender guidelines or matrix PDF.

Return ONLY a valid JSON array — no markdown, no explanation, no preamble. Each object must follow this exact schema:
{
  "name": "Program name",
  "provider": "Lender or agency name",
  "type": "grant|forgivable_loan|deferred_loan|second_mortgage",
  "amount_type": "fixed|percent",
  "amount_value": 10000,
  "min_fico": 620,
  "max_dti": 45,
  "ami_percent": 80,
  "max_purchase_price": null,
  "eligible_loan_types": ["FHA"],
  "state": "GA",
  "counties": null,
  "first_time_buyer_required": false,
  "forgivable_years": null,
  "notes": "Brief description of repayment terms and key requirements",
  "website": "",
  "homebuyer_ed": false,
  "deferred_until": null
}
Rules: type must be one of: grant, forgivable_loan, deferred_loan, second_mortgage. Use null for unknown numerics. If no DPA programs found, return []. Output ONLY the JSON array.`,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text",     text: `Extract all DPA programs from this lender document: ${file.name}` },
            ],
          }],
        }),
      });
      const data  = await resp.json();
      const raw   = data.content?.map(b => b.text || "").join("") || "[]";
      const clean = raw.replace(/```json|```/g, "").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array found");
      const programs = JSON.parse(match[0]);
      if (!Array.isArray(programs) || programs.length === 0) {
        setUploadError("No DPA programs found in this document."); setExtracting(false); return;
      }
      await Promise.all(programs.map(p =>
        addDoc(collection(db, "dpaPrograms", uid, "pending"), {
          ...p,
          lender_id: lenderId,
          provider: p.provider || lenderName,
          source_file: file.name,
          extracted_at: serverTimestamp(),
          lender_sourced: true,
        })
      ));
      flash(`✅ Extracted ${programs.length} program${programs.length !== 1 ? "s" : ""} — review below.`);
      await reload();
    } catch (err) {
      console.error("Extraction error:", err);
      setUploadError("Extraction failed: " + err.message);
    } finally {
      setExtracting(false);
      e.target.value = "";
    }
  };

  const confirmProgram = async (item) => {
    if (!uid) return;
    const id = `lender-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now()}`;
    const { _docId, ...fields } = item;
    try {
      await setDoc(doc(db, "dpaPrograms", uid, "confirmed", id), {
        ...fields, id, lender_id: lenderId, lender_sourced: true, confirmed_at: serverTimestamp(),
      });
      await deleteDoc(doc(db, "dpaPrograms", uid, "pending", _docId));
      flash(`✅ "${item.name}" is now live in DPA Intelligence.`);
      await reload();
    } catch (e) { console.error("Confirm:", e); }
  };

  const discardProgram = async (docId) => {
    if (!uid) return;
    await deleteDoc(doc(db, "dpaPrograms", uid, "pending", docId));
    setPending(prev => prev.filter(p => p._docId !== docId));
  };

  const removeConfirmed = async (progId) => {
    if (!uid) return;
    await deleteDoc(doc(db, "dpaPrograms", uid, "confirmed", progId));
    setConfirmed(prev => prev.filter(p => p.id !== progId));
    flash("Program removed from DPA Intelligence.");
  };

  const editPending = (docId, field, value) =>
    setPending(prev => prev.map(p => p._docId === docId ? { ...p, [field]: value } : p));

  const isEmpty = confirmed.length === 0 && pending.length === 0;

  return (
    <div className="mt-4 pt-4 border-t border-slate-700/50">
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-start justify-between px-4 py-3 rounded-xl transition-all group
          ${isEmpty
            ? "bg-green-900/20 border border-green-700/60 hover:border-green-500 hover:bg-green-900/30"
            : "bg-slate-900/60 border border-slate-600 hover:border-green-700/50"
          }`}>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">📄</span>
            <span className={`text-sm font-bold transition-colors ${isEmpty ? "text-green-300 group-hover:text-green-200" : "text-slate-300 group-hover:text-white"}`}>
              DPA Programs → DPA Intelligence
            </span>
            {confirmed.length > 0 && (
              <span className="px-2 py-0.5 bg-green-900/50 border border-green-700/50 rounded text-xs font-bold text-green-300">
                {confirmed.length} live
              </span>
            )}
            {pending.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-900/40 border border-amber-600 rounded text-xs font-bold text-amber-300">
                {pending.length} pending
              </span>
            )}
            {isEmpty && (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"/>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"/>
                </span>
                <span className="text-xs text-green-400 font-semibold">Upload PDF to auto-extract programs</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 ml-6">
            Upload any PDF with DPA details — AI extracts programs into Module 07 DPA Intelligence
          </p>
        </div>
        <span className={`text-sm mt-0.5 flex-shrink-0 ${isEmpty ? "text-green-500" : "text-slate-500"}`}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Upload zone */}
          <div className="bg-slate-900/40 border border-green-700/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider">📥 Upload PDF with DPA Programs</p>
              <span className="text-xs text-slate-500">AI extracts programs automatically</span>
            </div>

            {/* Checklist hint */}
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2.5 mb-3">
              <p className="text-xs font-semibold text-green-300 mb-1.5">✅ Good PDFs to upload here:</p>
              <div className="grid grid-cols-1 gap-1">
                {[
                  "Lists program names (e.g. Dream Plan, HomeReady Plus)",
                  "Shows DPA amount or % of loan/purchase price",
                  "Includes FICO minimum and DTI maximum",
                  "States eligible loan types (FHA, Conventional, etc.)",
                ].map((hint, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-green-500 text-xs mt-0.5 flex-shrink-0">✓</span>
                    <span className="text-xs text-slate-400">{hint}</span>
                  </div>
                ))}
              </div>
            </div>

            <label className={`relative flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all
              ${extracting || uploading
                ? "border-green-500/60 bg-green-900/10"
                : "border-green-700/50 hover:border-green-400/70 hover:bg-green-900/10 bg-slate-900/30"}`}>
              <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload} disabled={uploading || extracting}/>
              {uploading ? (
                <p className="text-sm text-slate-400">📂 Reading file...</p>
              ) : extracting ? (
                <div className="text-center">
                  <p className="text-sm text-green-400 font-bold animate-pulse">🤖 AI extracting DPA programs...</p>
                  <p className="text-xs text-slate-500 mt-1">This takes 10–20 seconds</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-2xl mb-1">⬆️</div>
                  <p className="text-sm text-green-300 font-bold">Click or drag PDF here</p>
                  <p className="text-xs text-slate-400 mt-0.5">DPA program sheet · Product flyer · Lender matrix</p>
                </div>
              )}
            </label>
            {uploadError && <p className="mt-2 text-xs text-red-300 bg-red-900/20 border border-red-700 rounded-lg p-2">⚠ {uploadError}</p>}
            {successMsg  && <p className="mt-2 text-xs text-green-300 bg-green-900/20 border border-green-700 rounded-lg p-2">{successMsg}</p>}
          </div>

          {/* Pending */}
          {pending.length > 0 && (
            <div className="bg-slate-900/40 border border-amber-700/30 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
                ⏳ Pending Review — {pending.length} program{pending.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-3">
                {pending.map(item => (
                  <div key={item._docId} className="bg-slate-800/60 border border-slate-600 rounded-xl overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{item.name || "Unnamed"}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <DpaChip label={PROGRAM_TYPES.find(t => t.value === item.type)?.label || "?"} color="blue"/>
                          <DpaChip label={item.amount_type === "percent" ? `${item.amount_value}%` : item.amount_value ? `$${Number(item.amount_value).toLocaleString()}` : "Amt ?"} color="green"/>
                          {item.min_fico && <DpaChip label={`FICO ${item.min_fico}+`} color="gray"/>}
                          {item.state    && <DpaChip label={item.state} color="gray"/>}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => setEditingId(editingId === item._docId ? null : item._docId)}
                          className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all">
                          {editingId === item._docId ? "✕" : "✏"}
                        </button>
                        <button onClick={() => confirmProgram(item)}
                          className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-green-700 hover:bg-green-600 text-white transition-all">
                          ✓ Confirm
                        </button>
                        <button onClick={() => discardProgram(item._docId)}
                          className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-300 border border-slate-600 hover:border-red-700 transition-all">
                          ✕
                        </button>
                      </div>
                    </div>
                    {editingId === item._docId && (
                      <div className="px-3 pb-3 pt-3 border-t border-slate-700 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Program Name</label>
                            <input value={item.name || ""} onChange={e => editPending(item._docId, "name", e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs focus:outline-none focus:border-green-500"/>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Type</label>
                            <select value={item.type || ""} onChange={e => editPending(item._docId, "type", e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs">
                              {PROGRAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Amount</label>
                            <div className="flex gap-1">
                              <select value={item.amount_type || "fixed"} onChange={e => editPending(item._docId, "amount_type", e.target.value)}
                                className="w-16 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs">
                                <option value="fixed">$</option>
                                <option value="percent">%</option>
                              </select>
                              <input type="number" value={item.amount_value || ""} onChange={e => editPending(item._docId, "amount_value", Number(e.target.value))}
                                className="flex-1 px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs"/>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">State (blank = nationwide)</label>
                            <input value={item.state || ""} onChange={e => editPending(item._docId, "state", e.target.value.toUpperCase().slice(0,2))}
                              maxLength={2} placeholder="GA"
                              className="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs"/>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Loan Types</label>
                          <div className="flex gap-3">
                            {LOAN_TYPES.map(lt => {
                              const sel = (item.eligible_loan_types || []).includes(lt);
                              return (
                                <label key={lt} className="flex items-center gap-1 cursor-pointer">
                                  <input type="checkbox" checked={sel} className="accent-green-500"
                                    onChange={() => editPending(item._docId, "eligible_loan_types",
                                      sel ? (item.eligible_loan_types||[]).filter(x=>x!==lt) : [...(item.eligible_loan_types||[]), lt])}/>
                                  <span className="text-xs text-slate-300">{lt}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => confirmProgram(item)}
                            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-all">
                            ✓ Save & Confirm
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmed */}
          {confirmed.length > 0 && (
            <div className="bg-slate-900/40 border border-green-700/30 rounded-xl p-4">
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-3">
                ✅ Live in DPA Intelligence — {confirmed.length} program{confirmed.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {confirmed.map(prog => (
                  <div key={prog.id} className="flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{prog.name}</div>
                      <div className="text-xs text-slate-400">
                        {PROGRAM_TYPES.find(t=>t.value===prog.type)?.label || prog.type}
                        {prog.state ? ` · ${prog.state}` : " · Nationwide"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-green-400">
                        {prog.amount_type === "percent" ? `${prog.amount_value}%` : prog.amount_value ? `$${Number(prog.amount_value).toLocaleString()}` : "—"}
                      </span>
                      <button onClick={() => removeConfirmed(prog.id)}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-900/20">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && confirmed.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-2">No DPA programs yet. Upload a PDF above to get started.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DpaChip({ label, color }) {
  const colors = {
    blue:  "bg-blue-900/50 text-blue-300 border-blue-700",
    green: "bg-green-900/50 text-green-300 border-green-700",
    gray:  "bg-slate-700 text-slate-300 border-slate-600",
  };
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${colors[color] || colors.gray}`}>{label}</span>;
}

// ─── OVERLAY INPUT ────────────────────────────────────────────────────────────
function OverlayInput({ fieldKey, agencyField, overlay, onChange, channelOverlay, onChannelChange }) {
  const [open, setOpen] = useState(false);
  const hasOverlay = overlay !== undefined && overlay !== "" && overlay !== null;
  const hasChannel = channelOverlay !== undefined && channelOverlay !== "" && channelOverlay !== null;
  const effective  = hasChannel ? channelOverlay : hasOverlay ? overlay : agencyField.value;

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
              placeholder={`Agency: ${agencyField.prefix || ""}${typeof agencyField.value === "number" ? fp(agencyField.value, agencyField.unit) : agencyField.value}`}
              className="w-full bg-slate-700 border border-orange-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400 placeholder-slate-500"/>
            {hasOverlay && <button onClick={() => onChange(fieldKey, "")} className="mt-1 text-xs text-red-400 hover:text-red-300">↺ Remove overlay</button>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-purple-400 mb-1">Layer 3 — Channel Override</label>
            <p className="text-xs text-slate-500 mb-2">AE-negotiated exception. Overrides lender overlay.</p>
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

// ─── AGENCY STANDARDS TAB ─────────────────────────────────────────────────────
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
        <p className="text-sm text-slate-300">Pre-loaded and maintained by LoanBeacons™. These are the baseline values — lender overlays (Layer 2) and channel overrides (Layer 3) are applied on top.</p>
      </div>
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
      <div className={`rounded-xl p-5 border mb-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><span className="text-2xl">{agency.icon}</span><h3 className={`text-lg font-bold ${colors.text}`}>{agency.fullName}</h3></div>
            <p className="text-xs text-slate-400">Source: {agency.source}</p>
            <p className="text-xs text-slate-500 mt-0.5">Update frequency: {agency.updateFreq}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${colors.badge}`}>✓ Current — LoanBeacons Verified</div>
        </div>
      </div>
      <div className="space-y-3">
        {Object.entries(agency.fields).map(([key, field]) => (
          <div key={key} onClick={() => setExpandedField(expandedField === key ? null : key)}
            className={`rounded-xl border p-4 cursor-pointer transition-all hover:border-slate-500 ${expandedField === key ? "bg-slate-800/60 border-slate-500" : "bg-slate-800/30 border-slate-700"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-1 h-8 rounded-full ${colors.text.replace("text-","bg-")}`}/>
                <div>
                  <p className="text-xs font-semibold text-slate-400">{field.label}</p>
                  <p className={`text-lg font-bold font-mono ${colors.text}`}>{field.prefix||""}{typeof field.value==="number"?fp(field.value,field.unit):field.value}</p>
                </div>
              </div>
              <span className="text-slate-500 text-sm">{expandedField===key?"▲":"▼"}</span>
            </div>
            {expandedField===key && <div className={`mt-3 pt-3 border-t ${colors.border} text-sm text-slate-300 leading-relaxed`}>{field.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BROKERAGE APPROVED TOGGLE ────────────────────────────────────────────────
function BrokerageApprovedToggle({ lender, onToggled }) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const isApproved = lender.brokerage_approved === true;
  const toggle = async () => {
    setSaving(true);
    try {
      const next = !isApproved;
      await updateDoc(doc(db, "lenderProfiles", lender.id), {
        brokerage_approved: next, brokerage_approved_at: next ? serverTimestamp() : null, updatedAt: serverTimestamp(),
      });
      setSaved(true); onToggled({ ...lender, brokerage_approved: next });
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error("Approved toggle:", e); }
    finally { setSaving(false); }
  };
  return (
    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Brokerage Approval Status</p>
          <p className="text-xs text-slate-500">{isApproved ? "Approved — DPA programs show as approved for this lender" : "Toggle on once your brokerage is approved to submit loans"}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saved && <span className="text-xs text-green-400 font-semibold">✓ Saved</span>}
          <button onClick={toggle} disabled={saving}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${isApproved?"bg-green-600":"bg-slate-600"}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isApproved?"translate-x-8":"translate-x-1"}`}/>
          </button>
          <span className={`text-sm font-bold ${isApproved?"text-green-400":"text-slate-500"}`}>{saving?"Saving…":isApproved?"Approved":"Not Approved"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── INLINE AE EDITOR ─────────────────────────────────────────────────────────
function InlineAEEditor({ lender, onSaved, onCancel }) {
  const [fields, setFields] = useState({ aeContact: lender.aeContact||"", aeEmail: lender.aeEmail||"", aePhone: lender.aePhone||"" });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const f = (k, v) => setFields(p => ({ ...p, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "lenderProfiles", lender.id), { ...fields, updatedAt: serverTimestamp() });
      setSaved(true); setTimeout(() => onSaved({ ...lender, ...fields }), 800);
    } catch (e) { console.error("AE save:", e); } finally { setSaving(false); }
  };
  return (
    <div className="bg-slate-900/70 rounded-xl p-4 border border-green-700/50 mb-4">
      <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-3">✏️ Edit Account Executive</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        {[["AE Name","aeContact","text","e.g. Sarah Johnson"],["AE Email","aeEmail","email","ae@lender.com"],["AE Phone","aePhone","tel","(800) 555-0100"]].map(([label,key,type,ph]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
            <input type={type} value={fields[key]} onChange={e=>f(key,e.target.value)} placeholder={ph}
              className="w-full bg-slate-800 border border-slate-600 focus:border-green-500 rounded-lg px-3 py-2 text-white text-sm outline-none"/>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving||saved} className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white font-bold text-sm transition-all">
          {saved?"✅ Saved":saving?"Saving…":"💾 Save AE Contact"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold text-sm">Cancel</button>
      </div>
    </div>
  );
}

// ─── LOGO EDITOR (in expanded view) ──────────────────────────────────────────
function LenderLogoEditor({ lender, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const handleLogoChange = async (b64) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "lenderProfiles", lender.id), { logoBase64: b64||null, updatedAt: serverTimestamp() });
      setSaved(true); onUpdated({ ...lender, logoBase64: b64||null });
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error("Logo save:", e); } finally { setSaving(false); }
  };
  return (
    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lender Logo</p>
        {saved  && <span className="text-xs text-green-400 font-semibold">✓ Saved</span>}
        {saving && <span className="text-xs text-slate-400">Saving...</span>}
      </div>
      <LogoUploadInput value={lender.logoBase64||null} onChange={handleLogoChange} label=""/>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function LenderProfileBuilder() {
  const auth = getAuth();
  const [uid, setUid] = useState(null);
  const [tab, setTab] = useState("standards");
  const [lenders, setLenders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [viewLender,  setViewLender]  = useState(null);
  const [editingAeId, setEditingAeId] = useState(null);

  const [form, setForm] = useState({
    name:"", nmls:"", type:"wholesale", loanTypes:[], aeContact:"", aeEmail:"", aePhone:"", notes:"", logoBase64: null,
  });
  const [overlays, setOverlays]                 = useState({});
  const [channelOverrides, setChannelOverrides] = useState({});
  const [lenderAgencies, setLenderAgencies]     = useState([]);

  useEffect(() => { const u = onAuthStateChanged(auth, u => setUid(u?.uid||null)); return u; }, []);
  useEffect(() => { loadLenders(); }, []);

  const loadLenders = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "lenderProfiles"));
      setLenders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Load lenders:", e); }
    setLoading(false);
  };

  const saveLender = async () => {
    if (!form.name || !form.nmls) return;
    try {
      const ref = await addDoc(collection(db, "lenderProfiles"), {
        ...form, agencies: lenderAgencies, overlays, channelOverrides,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        source: "BROKER_PRIVATE", visibility: "private",
        agencyStandardRefs: lenderAgencies, layer1: "AGENCY_STANDARDS_V1",
      });
      try { await addDoc(collection(db, "platform_activity"), { module: "Lender Profile Builder", action: "lender_created", lenderId: ref.id, lenderName: form.name, timestamp: serverTimestamp() }); } catch(_) {}
      setSaved(true);
      setForm({ name:"", nmls:"", type:"wholesale", loanTypes:[], aeContact:"", aeEmail:"", aePhone:"", notes:"", logoBase64: null });
      setOverlays({}); setChannelOverrides({}); setLenderAgencies([]);
      await loadLenders(); setTab("profiles");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error("Save lender:", e); }
  };

  const handleAeSaved = (upd) => { setLenders(prev => prev.map(l => l.id===upd.id?upd:l)); setViewLender(upd); setEditingAeId(null); };
  const handleLogoUpdated = (upd) => { setLenders(prev => prev.map(l => l.id===upd.id?upd:l)); setViewLender(upd); };

  // Shared DPA extraction function — used by both LenderDocsSection and LenderDpaSection
  const buildExtractDpa = (lenderId, lenderName) => async ({ base64, fileName }) => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: `You are a mortgage industry data extraction specialist. Extract all Down Payment Assistance (DPA) programs from the provided lender guidelines or matrix PDF.

Return ONLY a valid JSON array — no markdown, no explanation, no preamble. Each object must follow this exact schema:
{
  "name": "Program name",
  "provider": "Lender or agency name",
  "type": "grant|forgivable_loan|deferred_loan|second_mortgage",
  "amount_type": "fixed|percent",
  "amount_value": 10000,
  "min_fico": 620,
  "max_dti": 45,
  "ami_percent": 80,
  "max_purchase_price": null,
  "eligible_loan_types": ["FHA"],
  "state": "GA",
  "counties": null,
  "first_time_buyer_required": false,
  "forgivable_years": null,
  "notes": "Brief description of repayment terms and key requirements",
  "website": "",
  "homebuyer_ed": false,
  "deferred_until": null
}
Rules: type must be one of: grant, forgivable_loan, deferred_loan, second_mortgage. Use null for unknown numerics. If no DPA programs found, return []. Output ONLY the JSON array.`,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: `Extract all DPA programs from this lender document: ${fileName}` },
          ],
        }],
      }),
    });
    const data  = await resp.json();
    const raw   = data.content?.map(b => b.text || "").join("") || "[]";
    const clean = raw.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array found");
    const programs = JSON.parse(match[0]);
    if (!Array.isArray(programs) || programs.length === 0) throw new Error("No DPA programs found in this document");
    await Promise.all(programs.map(p =>
      addDoc(collection(db, "dpaPrograms", uid, "pending"), {
        ...p,
        lender_id: lenderId,
        provider: p.provider || lenderName,
        source_file: fileName,
        extracted_at: serverTimestamp(),
        lender_sourced: true,
      })
    ));
    return programs.length;
  };

  const toggleAgency  = (a) => setLenderAgencies(p => p.includes(a)?p.filter(x=>x!==a):[...p,a]);
  const setOverlay    = (f, v) => setOverlays(p => ({ ...p, [f]: v }));
  const setChannel    = (f, v) => setChannelOverrides(p => ({ ...p, [f]: v }));

  const overlayCount = Object.values(overlays).filter(v=>v!==""&&v!==null&&v!==undefined).length;
  const channelCount = Object.values(channelOverrides).filter(v=>v!==""&&v!==null&&v!==undefined).length;
  const formValid    = form.name.trim() && form.nmls.trim() && lenderAgencies.length > 0;

  return (
    <div className="min-h-screen bg-slate-900 text-white" style={{ fontFamily:"'Sora','DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* HEADER */}
      <div style={{ background:"linear-gradient(135deg,#0f172a 0%,#0d1f12 60%,#0f172a 100%)", borderBottom:"1px solid rgba(74,222,128,.18)" }}>
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs font-bold text-green-400 tracking-widest uppercase">LoanBeacons™ — Core Infrastructure</span>
            <h1 className="text-3xl font-extrabold text-white mt-1">🏗️ Lender Profile Builder™</h1>
            <p className="text-slate-400 text-sm mt-1">Three-Layer Guideline Stack · Agency Standards · Lender Overlays · Channel Overrides</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["standards","profiles","add"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${tab===t?"bg-green-700 text-white shadow-lg shadow-green-900/40":"bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                {t==="standards"?"📋 Agency Standards":t==="profiles"?`🗂️ My Lenders (${lenders.length})`:"➕ Add Lender"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ═══ AGENCY STANDARDS ════════════════════════════════════════════ */}
        {tab === "standards" && (
          <div>
            <div className="mb-6 p-5 bg-green-900/20 border border-green-700/40 rounded-2xl">
              <h2 className="text-base font-bold text-green-300 mb-2">Layer 1 — Agency Standards Reference</h2>
              <p className="text-sm text-slate-300 leading-relaxed">Pre-loaded by LoanBeacons™. Every lender profile starts here — you only need to capture where your lender <strong className="text-white">differs</strong> from the standard.</p>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[["FHA 4000.1","HUD/FHA"],["Fannie Mae Selling Guide","FHFA/FNMA"],["Freddie Mac SF Guide","FHFA/FHLMC"],["VA Pamphlet 26-7","Dept. Veterans Affairs"],["USDA HB-1-3555","USDA Rural Dev."],["HomeReady + Home Possible","FNMA/FHLMC"]].map(([d,a]) => (
                  <div key={d} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs font-bold text-slate-300">{d}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a}</p>
                  </div>
                ))}
              </div>
            </div>
            <AgencyStandardsTab />
          </div>
        )}

        {/* ═══ MY LENDERS ══════════════════════════════════════════════════ */}
        {tab === "profiles" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">My Lender Profiles</h2>
                <p className="text-slate-400 text-sm mt-0.5">Your private lender roster with guidelines, DPA programs, and AE contacts.</p>
              </div>
              <button onClick={() => setTab("add")} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-green-700 hover:bg-green-600 text-white">➕ Add Lender</button>
            </div>
            {loading && <div className="text-center py-12 text-slate-400">Loading profiles...</div>}
            {!loading && lenders.length === 0 && (
              <div className="text-center py-16 bg-slate-800/40 border border-slate-700 rounded-2xl">
                <div className="text-4xl mb-4">🏗️</div>
                <h3 className="text-lg font-bold text-white mb-2">No lender profiles yet</h3>
                <p className="text-slate-400 text-sm mb-6">Add your first lender to begin building your personal guideline roster.</p>
                <button onClick={() => setTab("add")} className="px-6 py-3 rounded-xl font-bold text-sm bg-green-700 hover:bg-green-600 text-white">➕ Add First Lender</button>
              </div>
            )}
            {!loading && lenders.length > 0 && (
              <div className="space-y-4">
                {lenders.map(lender => {
                  const oCount     = Object.values(lender.overlays||{}).filter(v=>v!==""&&v!==null).length;
                  const cCount     = Object.values(lender.channelOverrides||{}).filter(v=>v!==""&&v!==null).length;
                  const isExpanded = viewLender?.id === lender.id;
                  const isEditingAe = editingAeId === lender.id;

                  return (
                    <div key={lender.id} className="bg-slate-800/50 border border-slate-700 hover:border-green-700/50 rounded-2xl p-5 transition-all">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-4">
                          {/* Logo thumbnail */}
                          <LenderLogo logoBase64={lender.logoBase64} name={lender.name} size={48}/>
                          <div>
                            <h3 className="text-lg font-bold text-white">{lender.name}</h3>
                            <p className="text-sm text-slate-400">NMLS# {lender.nmls} · {lender.type}</p>
                            <div className="flex gap-2 flex-wrap mt-2">
                              {(lender.agencies||[]).map(a => (
                                <span key={a} className={`px-2 py-0.5 rounded text-xs font-bold ${agencyColors[AGENCY_STANDARDS[a]?.color]?.badge||"bg-slate-700 text-slate-300"}`}>{a}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <div className="text-center"><p className="text-lg font-bold text-orange-400">{oCount}</p><p className="text-xs text-slate-500">Overlays</p></div>
                          <div className="text-center"><p className="text-lg font-bold text-purple-400">{cCount}</p><p className="text-xs text-slate-500">Channel</p></div>
                          <button
                            onClick={() => { if(isExpanded){setViewLender(null);setEditingAeId(null);}else{setViewLender(lender);setEditingAeId(null);} }}
                            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold text-sm">
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-5 pt-5 border-t border-slate-700">
                          {/* Three-layer summary */}
                          <div className="grid grid-cols-3 gap-3 mb-5">
                            <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-3 text-center"><p className="text-xs text-slate-400 mb-1">Layer 1</p><p className="font-bold text-green-300 text-sm">Agency Standard</p><p className="text-xs text-slate-500 mt-0.5">Pre-loaded</p></div>
                            <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-3 text-center"><p className="text-xs text-slate-400 mb-1">Layer 2</p><p className="font-bold text-orange-300 text-sm">{oCount} Lender Overlays</p><p className="text-xs text-slate-500 mt-0.5">Where lender differs</p></div>
                            <div className="bg-purple-900/20 border border-purple-700/40 rounded-xl p-3 text-center"><p className="text-xs text-slate-400 mb-1">Layer 3</p><p className="font-bold text-purple-300 text-sm">{cCount} Channel Overrides</p><p className="text-xs text-slate-500 mt-0.5">AE-negotiated</p></div>
                          </div>

                          {/* Logo editor */}
                          <LenderLogoEditor lender={lender} onUpdated={handleLogoUpdated}/>

                          {/* Brokerage approval */}
                          <BrokerageApprovedToggle lender={lender} onToggled={(upd) => { setLenders(prev=>prev.map(l=>l.id===upd.id?upd:l)); if(viewLender?.id===upd.id)setViewLender(upd); }}/>

                          {/* AE Contact */}
                          {isEditingAe ? (
                            <InlineAEEditor lender={lender} onSaved={handleAeSaved} onCancel={() => setEditingAeId(null)}/>
                          ) : (
                            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-600 mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Account Executive</p>
                                <button onClick={() => setEditingAeId(lender.id)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:text-green-300 bg-green-900/30 hover:bg-green-900/50 border border-green-700/50 rounded-lg px-3 py-1.5 transition-all">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                  Edit
                                </button>
                              </div>
                              {lender.aeContact||lender.aeEmail||lender.aePhone ? (
                                <>{lender.aeContact&&<p className="text-white font-semibold">{lender.aeContact}</p>}{lender.aeEmail&&<p className="text-slate-400 text-sm">{lender.aeEmail}</p>}{lender.aePhone&&<p className="text-slate-400 text-sm">{lender.aePhone}</p>}</>
                              ) : (
                                <p className="text-slate-500 text-sm italic">No AE contact saved. <button onClick={()=>setEditingAeId(lender.id)} className="ml-1 text-green-400 hover:text-green-300 not-italic font-semibold">Add one →</button></p>
                              )}
                            </div>
                          )}

                          {/* ── Guidelines & Matrices ── */}
                          <LenderDocsSection
                            lenderId={lender.id}
                            lenderName={lender.name}
                            uid={uid}
                            onExtractDpa={buildExtractDpa(lender.id, lender.name)}
                          />

                          {/* ── DPA Programs ── */}
                          <LenderDpaSection lenderId={lender.id} lenderName={lender.name} uid={uid} onSharedExtract={buildExtractDpa(lender.id, lender.name)}/>

                          {/* Overlay detail */}
                          {oCount > 0 && (
                            <div className="mb-4 mt-4">
                              <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">Lender Overlays (Layer 2)</p>
                              <div className="space-y-2">
                                {Object.entries(lender.overlays||{}).filter(([,v])=>v!==""&&v!==null).map(([k,v]) => {
                                  const [agKey,...fKey]=k.split("_"); const fieldKey=fKey.join("_"); const agStd=AGENCY_STANDARDS[agKey]?.fields[fieldKey];
                                  return (
                                    <div key={k} className="flex items-center justify-between bg-orange-900/20 border border-orange-700/30 rounded-lg px-4 py-2">
                                      <p className="text-sm text-slate-300">{agStd?.label||k}</p>
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500 line-through">{agStd?.prefix||""}{agStd?.value!==undefined?fp(agStd.value,agStd?.unit):"—"}</span>
                                        <span className="text-sm font-bold text-orange-300">{v}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {cCount > 0 && (
                            <div className="mt-4">
                              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3">Channel Overrides (Layer 3)</p>
                              <div className="space-y-2">
                                {Object.entries(lender.channelOverrides||{}).filter(([,v])=>v!==""&&v!==null).map(([k,v]) => {
                                  const [agKey,...fKey]=k.split("_"); const fieldKey=fKey.join("_"); const agStd=AGENCY_STANDARDS[agKey]?.fields[fieldKey];
                                  return (
                                    <div key={k} className="flex items-center justify-between bg-purple-900/20 border border-purple-700/30 rounded-lg px-4 py-2">
                                      <p className="text-sm text-slate-300">{agStd?.label||k}</p>
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

        {/* ═══ ADD LENDER ══════════════════════════════════════════════════ */}
        {tab === "add" && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Add New Lender Profile</h2>
            <p className="text-slate-400 text-sm mb-6">Start with the lender's identity, then capture <strong className="text-orange-300">only where they differ</strong> from agency standard.</p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[["Layer 1","Agency Standard","Pre-loaded. You don't enter these.","green"],["Layer 2","Lender Overlay","Enter only if lender differs from agency.","orange"],["Layer 3","Channel Override","AE-negotiated exception. Highest priority.","purple"]].map(([layer,name,desc,color]) => (
                <div key={layer} className={`rounded-xl p-4 border ${color==="green"?"bg-green-900/20 border-green-700/40":color==="orange"?"bg-orange-900/20 border-orange-700/40":"bg-purple-900/20 border-purple-700/40"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${color==="green"?"text-green-400":color==="orange"?"text-orange-400":"text-purple-400"}`}>{layer}</p>
                  <p className="font-bold text-white text-sm">{name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            {/* Identity + Logo */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4">Lender Identity</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Lender Name *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. United Wholesale Mortgage"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">NMLS# *</label>
                  <input value={form.nmls} onChange={e=>setForm(f=>({...f,nmls:e.target.value}))} placeholder="e.g. 3038"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                </div>
              </div>
              <div className="mb-4">
                <LogoUploadInput value={form.logoBase64} onChange={b64=>setForm(f=>({...f,logoBase64:b64}))}/>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-2">Channel Type</label>
                <div className="flex gap-3">
                  {[["wholesale","Wholesale"],["correspondent","Correspondent"],["retail","Retail"]].map(([v,l]) => (
                    <label key={v} className={`cursor-pointer px-4 py-2 rounded-xl border font-semibold text-sm transition-all ${form.type===v?"bg-green-800 border-green-500 text-white":"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                      <input type="radio" className="hidden" checked={form.type===v} onChange={()=>setForm(f=>({...f,type:v}))}/>{l}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Loan Programs Offered * (select all that apply)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(AGENCY_STANDARDS).map(([key,ag]) => (
                    <label key={key} className={`block cursor-pointer p-3 rounded-xl border text-center transition-all ${lenderAgencies.includes(key)?`${agencyColors[ag.color].bg} ${agencyColors[ag.color].border}`:"bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                      <input type="checkbox" className="hidden" checked={lenderAgencies.includes(key)} onChange={()=>toggleAgency(key)}/>
                      <div className="text-xl mb-1">{ag.icon}</div>
                      <p className="font-bold text-white text-sm">{ag.label}</p>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* AE Contact */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-5">
              <h3 className="text-sm font-bold text-slate-300 mb-1">Account Executive Contact</h3>
              <p className="text-xs text-slate-500 mb-4">The person who communicates channel overlays to you.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[["AE Name","aeContact","text","e.g. Sarah Johnson"],["AE Email","aeEmail","email","e.g. sarah.j@lender.com"],["AE Phone","aePhone","tel","e.g. (800) 555-0100"]].map(([label,key,type,ph]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                    <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"/>
                  </div>
                ))}
              </div>
            </div>

            {/* Guideline Overlays */}
            {lenderAgencies.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-5">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-bold text-slate-300">Guideline Overlays</h3>
                  {overlayCount>0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-900/50 border border-orange-700/50 text-orange-300">{overlayCount} overlay{overlayCount!==1?"s":""}</span>}
                  {channelCount>0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-900/50 border border-purple-700/50 text-purple-300">{channelCount} channel</span>}
                </div>
                <p className="text-xs text-slate-500 mb-5">Click <strong className="text-white">✏️ Edit</strong> on any field where this lender differs from agency standard.</p>
                {lenderAgencies.map(agKey => (
                  <div key={agKey} className="mb-6">
                    <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${agencyColors[AGENCY_STANDARDS[agKey].color].border}`}>
                      <span>{AGENCY_STANDARDS[agKey].icon}</span>
                      <p className={`font-bold text-sm ${agencyColors[AGENCY_STANDARDS[agKey].color].text}`}>{AGENCY_STANDARDS[agKey].label} — {AGENCY_STANDARDS[agKey].fullName}</p>
                    </div>
                    <div className="space-y-3">
                      {Object.entries(AGENCY_STANDARDS[agKey].fields).map(([fieldKey,field]) => {
                        const ck = `${agKey}_${fieldKey}`;
                        return <OverlayInput key={ck} fieldKey={ck} agencyField={field} overlay={overlays[ck]} onChange={setOverlay} channelOverlay={channelOverrides[ck]} onChannelChange={setChannel}/>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-6">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Notes / Special Guidelines</label>
              <p className="text-xs text-slate-500 mb-2">Pricing tiers, niche programs, submission preferences, turn times, etc.</p>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={4}
                placeholder="e.g. Strong on Non-QM. AE prefers pre-approval calls. Fast turn on VA — typically 15 days..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500 resize-none"/>
            </div>

            <div className="flex items-center gap-4">
              <button onClick={saveLender} disabled={!formValid}
                className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all ${formValid?"bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/40":"bg-slate-700 text-slate-500 cursor-not-allowed"}`}>
                {saved?"✅ Lender Profile Saved":"💾 Save Lender Profile to Firestore"}
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

      <div className="max-w-5xl mx-auto px-4 pb-8">
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">LoanBeacons™ Lender Profile Builder™ — Three-Layer Guideline Architecture · Layer 1: Agency Standards · Layer 2: Lender Overlays · Layer 3: Channel Overrides · PRD v3.0 FINAL</p>
        </div>
      </div>
    </div>
  );
}
