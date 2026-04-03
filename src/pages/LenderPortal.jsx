import { useState, useEffect, useRef } from "react";
import { db } from "../firebase/config";
import {
  doc, getDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

// ── Non-QM products list (must match LenderProfileBuilder) ────────────────────
const NON_QM_PRODUCTS = [
  { id: "dscr",        label: "DSCR",                  icon: "📊", hasDSCR: true },
  { id: "bankstmt_12", label: "Bank Statement 12mo",   icon: "🏦", hasStmt: true },
  { id: "bankstmt_24", label: "Bank Statement 24mo",   icon: "🏦", hasStmt: true },
  { id: "pl_only",     label: "P&L Only",              icon: "📋" },
  { id: "asset_dep",   label: "Asset Depletion",       icon: "💰" },
  { id: "w2_1099",     label: "1099 Only",             icon: "📄" },
  { id: "for_natl",    label: "Foreign National",      icon: "🌐" },
  { id: "itin",        label: "ITIN",                  icon: "🪪" },
  { id: "recent_cred", label: "Recent Credit Events",  icon: "⚠️" },
  { id: "non_warr",    label: "Non-Warrantable Condo", icon: "🏢" },
];

const inp = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-slate-400 placeholder-slate-400";
const lbl = "block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide";
const card = "bg-white border border-slate-200 rounded-3xl p-6 shadow-sm";

// ── Matrix AI Uploader (inline, no import needed) ─────────────────────────────
function MatrixUploader({ onExtracted, existingMatrix }) {
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") { setErr("PDF files only."); return; }
    setStatus("extracting"); setErr("");
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
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
                { type: "text", text: `Extract ALL guideline data from this Non-QM lender matrix PDF. Return ONLY valid JSON:\n{"effectiveDate":null,"lenderName":null,"products":[{"name":"","minFICO":null,"maxLTV":{"purchase":null,"rateterm":null,"cashout":null},"maxLoan":null,"minLoan":null,"prepay":null,"interestOnly":false,"occupancy":[],"propertyTypes":[],"dscrMin":null,"noRatioDSCR":null,"strAllowed":null,"bkSeasoning":null,"fcSeasoning":null,"ssSeasoning":null,"notes":""}],"llpas":[{"factor":"","adjustment":""}],"generalNotes":""}` }
              ]
            }]
          })
        });
        const data = await res.json();
        const text = (data.content || []).find(b => b.type === "text")?.text || "";
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        onExtracted(parsed);
        setStatus("done");
      } catch (e) {
        setErr("Extraction failed. Check PDF quality and try again.");
        setStatus("error");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onDragOver={e => e.preventDefault()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${status === "done" ? "border-green-300 bg-green-50" : "border-slate-300 hover:border-violet-400 hover:bg-violet-50"}`}
      >
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        <div className="text-2xl mb-2">{status === "extracting" ? "⚙️" : status === "done" ? "✅" : "📄"}</div>
        <p className="font-semibold text-slate-700 text-sm">
          {status === "idle" && "Click or drag to upload matrix PDF"}
          {status === "extracting" && "Claude AI is reading your matrix..."}
          {status === "done" && "Matrix extracted — review below"}
          {status === "error" && "Extraction failed"}
        </p>
        {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
      </div>
      {existingMatrix && (existingMatrix.products || []).length > 0 && (
        <div className="mt-4 space-y-2">
          {existingMatrix.products.map((p, i) => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-bold text-violet-700 uppercase mb-2">{p.name}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {p.minFICO != null && <div><span className="text-slate-500">Min FICO</span><br/><strong>{p.minFICO}</strong></div>}
                {p.maxLTV?.purchase != null && <div><span className="text-slate-500">Max LTV (Purch)</span><br/><strong>{p.maxLTV.purchase}%</strong></div>}
                {p.maxLoan != null && <div><span className="text-slate-500">Max Loan</span><br/><strong>${Number(p.maxLoan).toLocaleString()}</strong></div>}
              </div>
              {p.notes && <p className="text-xs text-slate-400 mt-2">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main LenderPortal ──────────────────────────────────────────────────────────
export default function LenderPortal() {
  const auth = getAuth();
  const navigate = useNavigate();

  const [loading, setLoading]     = useState(true);
  const [authError, setAuthError] = useState("");
  const [account, setAccount]     = useState(null);   // lenderAccounts doc
  const [profile, setProfile]     = useState(null);   // lenderProfiles doc
  const [profileId, setProfileId] = useState(null);

  // Edit state
  const [tab, setTab]             = useState("profile");  // profile | guidelines | matrix | contact
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState("");

  // Editable fields
  const [lenderType, setLenderType]       = useState("nonqm");
  const [selectedProducts, setProducts]   = useState([]);
  const [nqmProductData, setNQMData]      = useState({});
  const [matrix, setMatrix]               = useState(null);
  const [primaryAE, setPrimaryAE]         = useState({ name: "", email: "", phone: "", title: "" });
  const [notes, setNotes]                 = useState("");

  // ── Auth + data load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) { navigate("/login"); return; }

      try {
        // Load lenderAccount
        const accountSnap = await getDoc(doc(db, "lenderAccounts", user.uid));
        if (!accountSnap.exists()) {
          setAuthError("No lender account found. Contact support@loanbeacons.com");
          setLoading(false);
          return;
        }
        const accountData = accountSnap.data();
        setAccount(accountData);

        if (accountData.role === "pending_backup") {
          setAuthError("pending_backup");
          setLoading(false);
          return;
        }

        // Load lenderProfile
        const profileSnap = await getDoc(doc(db, "lenderProfiles", accountData.lenderProfileId));
        if (!profileSnap.exists()) {
          setAuthError("Lender profile not found. Contact support@loanbeacons.com");
          setLoading(false);
          return;
        }

        const profileData = profileSnap.data();
        setProfile(profileData);
        setProfileId(accountData.lenderProfileId);

        // Hydrate edit state
        setLenderType(profileData.type || "nonqm");
        setProducts(profileData.nqmProducts || []);
        setNQMData(profileData.nqmProductData || {});
        setMatrix(profileData.matrixData || null);
        setPrimaryAE(profileData.primaryAE || { name: "", email: "", phone: "", title: "" });
        setNotes(profileData.notes || "");
      } catch (e) {
        console.error("Portal load error:", e);
        setAuthError("Failed to load your profile. Try refreshing.");
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Save changes ──────────────────────────────────────────────────────────────
  const save = async (partial) => {
    if (!profileId) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await updateDoc(doc(db, "lenderProfiles", profileId), {
        ...partial,
        updatedAt: serverTimestamp(),
      });
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e) {
      console.error("Save error:", e);
      setSaveMsg("Save failed — try again.");
    }
    setSaving(false);
  };

  const saveContact = () => save({ primaryAE: { ...primaryAE, updatedAt: serverTimestamp() } });
  const saveGuidelines = () => save({ type: lenderType, nqmProducts: selectedProducts, nqmProductData: nqmProductData, notes });
  const saveMatrix = (m) => { setMatrix(m); save({ matrixData: m }); };

  const toggleProduct = (id) => setProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const updateNQM = (pid, field, val) => setNQMData(prev => ({ ...prev, [pid]: { ...(prev[pid] || {}), [field]: val } }));

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PortalShell account={null} onSignOut={() => signOut(auth).then(() => navigate("/login"))}>
        <div className="text-center py-20 text-slate-400">Loading your profile...</div>
      </PortalShell>
    );
  }

  // ── Auth errors ───────────────────────────────────────────────────────────────
  if (authError === "pending_backup") {
    return (
      <PortalShell account={account} onSignOut={() => signOut(auth).then(() => navigate("/login"))}>
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-10 text-center max-w-md mx-auto">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-slate-900 mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>Pending Admin Approval</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Your registration as backup AE is under review. You'll receive confirmation from the LoanBeacons administrator once approved.
          </p>
          <p className="text-xs text-slate-400 mt-4">Questions? support@loanbeacons.com</p>
        </div>
      </PortalShell>
    );
  }

  if (authError) {
    return (
      <PortalShell account={null} onSignOut={() => signOut(auth).then(() => navigate("/login"))}>
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">
          <p className="text-red-800">{authError}</p>
        </div>
      </PortalShell>
    );
  }

  // ── Main portal ───────────────────────────────────────────────────────────────
  return (
    <PortalShell account={account} profile={profile} onSignOut={() => signOut(auth).then(() => navigate("/login"))}>

      {/* Sub-nav */}
      <div className="flex gap-2 flex-wrap mb-6">
        {[["profile","🏦 Lender Profile"],["guidelines","📋 Guidelines"],["matrix","📊 Matrix Upload"],["contact","👤 My Contact Info"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${tab === id ? "bg-green-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile overview ── */}
      {tab === "profile" && profile && (
        <div className="space-y-4">
          <div className={card}>
            <h3 className="text-lg font-bold text-slate-900 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>{profile.name}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-slate-500 text-xs">NMLS#</p><p className="font-bold text-slate-900">{profile.nmls}</p></div>
              <div><p className="text-slate-500 text-xs">Type</p><p className="font-bold text-slate-900 capitalize">{profile.type}</p></div>
              <div><p className="text-slate-500 text-xs">Products</p><p className="font-bold text-slate-900">{(profile.nqmProducts || []).length}</p></div>
              <div><p className="text-slate-500 text-xs">Matrix</p><p className="font-bold text-slate-900">{profile.matrixData ? "✓ Loaded" : "Not uploaded"}</p></div>
            </div>
          </div>

          {/* Primary AE (read preview) */}
          <div className={card}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Primary AE Contact (you)</p>
                <p className="font-semibold text-slate-900">{profile.primaryAE?.name || "—"}</p>
                <p className="text-slate-500 text-sm">{profile.primaryAE?.email}</p>
                <p className="text-slate-500 text-sm">{profile.primaryAE?.phone}</p>
              </div>
              <button onClick={() => setTab("contact")} className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-400">
                Edit
              </button>
            </div>
          </div>

          {/* Backup AE (read-only) */}
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Backup AE Contact</p>
                {profile.backupAE?.name ? (
                  <>
                    <p className="font-semibold text-slate-900">{profile.backupAE.name}</p>
                    <p className="text-slate-500 text-sm">{profile.backupAE.email}</p>
                    <p className="text-slate-500 text-sm">{profile.backupAE.phone}</p>
                  </>
                ) : (
                  <p className="text-slate-400 text-sm">Not yet assigned</p>
                )}
              </div>
              <span className="px-2.5 py-1 bg-slate-200 text-slate-500 text-xs font-bold rounded-full">Admin Only</span>
            </div>
            <p className="text-xs text-slate-400 mt-3">The backup AE is managed by the LoanBeacons administrator. Contact support@loanbeacons.com to update this field.</p>
          </div>
        </div>
      )}

      {/* ── Guidelines ── */}
      {tab === "guidelines" && (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            Your guidelines are visible to all LoanBeacons loan officers and matched against active scenarios in real time. Keep them current — changes take effect immediately.
          </div>

          <div className={card}>
            <h4 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Products Offered</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {NON_QM_PRODUCTS.map(p => (
                <button key={p.id} onClick={() => toggleProduct(p.id)}
                  className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all ${selectedProducts.includes(p.id) ? "bg-violet-50 border-violet-400" : "bg-slate-50 border-slate-200 hover:border-violet-200"}`}>
                  <span className="text-base block mb-1">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {selectedProducts.length > 0 && selectedProducts.map(pid => {
            const p = NON_QM_PRODUCTS.find(x => x.id === pid);
            if (!p) return null;
            const d = nqmProductData[pid] || {};
            const f = (field, val) => updateNQM(pid, field, val);
            return (
              <div key={pid} className={card}>
                <h4 className="text-sm font-bold text-slate-800 mb-4">{p.icon} {p.label}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className={lbl}>Min FICO</label><input value={d.minFICO || ""} onChange={e => f("minFICO", e.target.value)} placeholder="e.g. 620" className={inp} /></div>
                  <div><label className={lbl}>Max LTV — Purchase</label><input value={d.maxLTV_purchase || ""} onChange={e => f("maxLTV_purchase", e.target.value)} placeholder="e.g. 80%" className={inp} /></div>
                  <div><label className={lbl}>Max LTV — Cash-Out</label><input value={d.maxLTV_cashout || ""} onChange={e => f("maxLTV_cashout", e.target.value)} placeholder="e.g. 75%" className={inp} /></div>
                  <div><label className={lbl}>Max Loan</label><input value={d.maxLoan || ""} onChange={e => f("maxLoan", e.target.value)} placeholder="e.g. $3,000,000" className={inp} /></div>
                  <div><label className={lbl}>BK Seasoning</label><input value={d.bkSeasoning || ""} onChange={e => f("bkSeasoning", e.target.value)} placeholder="e.g. 12 months" className={inp} /></div>
                  <div><label className={lbl}>FC Seasoning</label><input value={d.fcSeasoning || ""} onChange={e => f("fcSeasoning", e.target.value)} placeholder="e.g. 24 months" className={inp} /></div>
                  {p.hasDSCR && <div><label className={lbl}>Min DSCR</label><input value={d.minDSCR || ""} onChange={e => f("minDSCR", e.target.value)} placeholder="e.g. 1.0" className={inp} /></div>}
                  {p.hasStmt && <div><label className={lbl}>Expense Factor</label><input value={d.expenseRatio || ""} onChange={e => f("expenseRatio", e.target.value)} placeholder="e.g. 50%" className={inp} /></div>}
                </div>
                <div className="mt-3">
                  <label className={lbl}>Notes</label>
                  <textarea value={d.notes || ""} onChange={e => f("notes", e.target.value)} rows={2} placeholder="Special requirements, restrictions..." className={`${inp} resize-none`} />
                </div>
              </div>
            );
          })}

          <div className={card}>
            <label className={lbl}>General Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Submission tips, turn times, niche programs, anything LOs should know..." className={`${inp} resize-none`} />
          </div>

          <SaveBar onSave={saveGuidelines} saving={saving} saveMsg={saveMsg} />
        </div>
      )}

      {/* ── Matrix upload ── */}
      {tab === "matrix" && (
        <div className="space-y-4">
          <div className={card}>
            <MatrixUploader onExtracted={saveMatrix} existingMatrix={matrix} />
          </div>
          {saveMsg && <p className="text-center text-sm text-green-700 font-semibold">{saveMsg}</p>}
        </div>
      )}

      {/* ── My Contact Info ── */}
      {tab === "contact" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            This is the contact information LoanBeacons loan officers will use to reach you. Keep it current — especially if your direct line or email changes.
          </div>

          <div className={card}>
            <h4 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Primary AE Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={lbl}>Full Name</label><input value={primaryAE.name} onChange={e => setPrimaryAE(p => ({ ...p, name: e.target.value }))} placeholder="Sarah Johnson" className={inp} /></div>
              <div><label className={lbl}>Email</label><input value={primaryAE.email} onChange={e => setPrimaryAE(p => ({ ...p, email: e.target.value }))} placeholder="sarah@lender.com" className={inp} /></div>
              <div><label className={lbl}>Phone</label><input value={primaryAE.phone} onChange={e => setPrimaryAE(p => ({ ...p, phone: e.target.value }))} placeholder="(800) 555-0100" className={inp} /></div>
              <div><label className={lbl}>Title</label><input value={primaryAE.title} onChange={e => setPrimaryAE(p => ({ ...p, title: e.target.value }))} placeholder="Account Executive" className={inp} /></div>
            </div>
          </div>

          {/* Backup AE — read-only for AE */}
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-bold text-slate-700" style={{ fontFamily: "'DM Serif Display', serif" }}>Backup AE Contact</h4>
              <span className="px-2.5 py-1 bg-slate-200 text-slate-500 text-xs font-bold rounded-full">Admin Only</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[["Full Name",profile?.backupAE?.name],["Email",profile?.backupAE?.email],["Phone",profile?.backupAE?.phone],["Title",profile?.backupAE?.title]].map(([label, val]) => (
                <div key={label}>
                  <label className={lbl}>{label}</label>
                  <input readOnly value={val || ""} placeholder="Managed by LoanBeacons Admin" className={`${inp} bg-white text-slate-400 cursor-default`} />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">To update the backup AE, email support@loanbeacons.com</p>
          </div>

          <SaveBar onSave={saveContact} saving={saving} saveMsg={saveMsg} />
        </div>
      )}
    </PortalShell>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────
function PortalShell({ account, profile, onSignOut, children }) {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: "#f8fafc" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display&display=swap');`}</style>
      <div className="bg-slate-900 px-6 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-green-400 tracking-widest uppercase mb-1">LoanBeacons™ — Lender Portal</p>
            {profile && (
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {profile.name}
              </h1>
            )}
            {account && <p className="text-slate-400 text-xs mt-0.5">Signed in as {account.name} · {account.role === "primary_ae" ? "Primary AE" : "Pending"}</p>}
          </div>
          <button onClick={onSignOut} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold">
            Sign Out
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-8">{children}</div>
    </div>
  );
}

function SaveBar({ onSave, saving, saveMsg }) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={onSave} disabled={saving}
        className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${saving ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-green-700 hover:bg-green-600 text-white shadow-sm"}`}>
        {saving ? "Saving..." : "💾 Save Changes"}
      </button>
      {saveMsg && <p className={`text-sm font-semibold ${saveMsg.includes("failed") ? "text-red-600" : "text-green-700"}`}>{saveMsg}</p>}
    </div>
  );
}
