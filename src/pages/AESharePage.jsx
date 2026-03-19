import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = {
  currency: (n) =>
    n != null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
      : "—",
  pct:   (n) => (n != null ? `${Number(n).toFixed(2)}%` : "—"),
  phone: (p) => p || "—",
};

const PURPOSE_META = {
  "Pricing Review":      { icon: "📊", color: "#2563eb" },
  "Exception Request":   { icon: "⚡", color: "#d97706" },
  "Scenario Discussion": { icon: "💬", color: "#059669" },
  "Guideline Question":  { icon: "📋", color: "#7c3aed" },
  "Rate Lock Discussion":{ icon: "🔒", color: "#dc2626" },
  "AE_SUPPORT":          { icon: "🤝", color: "#d97706" },
  "SCENARIO_REVIEW":     { icon: "🔍", color: "#2563eb" },
  "FINAL_SUBMISSION":    { icon: "✅", color: "#059669" },
};

const SHARE_TYPE_LABELS = {
  AE_SUPPORT:       "I need AE support on this scenario",
  SCENARIO_REVIEW:  "Please review this scenario for eligibility",
  FINAL_SUBMISSION: "This is ready — please prepare for submission",
};

// ─── Sub-components ──────────────────────────────────────────────────────────
function SectionCard({ title, icon, children, accent }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"14px 20px", borderBottom:"1px solid #f3f4f6", background:"#fafafa" }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:accent||"#6b7280" }}>{title}</span>
      </div>
      <div style={{ padding:"18px 20px" }}>{children}</div>
    </div>
  );
}

function DataRow({ label, value, highlight }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #f9fafb" }}>
      <span style={{ fontSize:13, color:"#6b7280" }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:highlight?700:500, color:highlight?"#111827":"#374151" }}>{value||"—"}</span>
    </div>
  );
}

function StatBadge({ label, value, sub }) {
  return (
    <div style={{ flex:1, background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
      <div style={{ fontSize:20, fontWeight:800, color:"#111827", letterSpacing:"-0.02em" }}>{value}</div>
      <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ textAlign:"center", padding:"80px 20px" }}>
      <div style={{ width:40, height:40, borderRadius:"50%", border:"3px solid #e5e7eb", borderTopColor:"#f59e0b", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
      <p style={{ color:"#6b7280", fontSize:14 }}>Loading scenario share…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{ textAlign:"center", padding:"80px 20px" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🔗</div>
      <h2 style={{ fontSize:20, fontWeight:700, color:"#111827", marginBottom:8 }}>Link Unavailable</h2>
      <p style={{ color:"#6b7280", fontSize:14, maxWidth:360, margin:"0 auto" }}>
        {message || "This share link is invalid, expired, or has been revoked. Please request a new link from the loan officer."}
      </p>
    </div>
  );
}

// ─── AE Response Panel ───────────────────────────────────────────────────────
function AEResponsePanel({ token, loName, borrowerName, alreadyResponded, existingResponse }) {
  const [selected, setSelected] = useState(null);   // 'approved' | 'needs_info' | 'declined'
  const [notes,    setNotes]    = useState("");
  const [aeEmail,  setAeEmail]  = useState("");
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState("");

  const RESPONSES = [
    { key:"approved",   emoji:"✅", label:"Approve",        color:"#16a34a", bg:"#f0fdf4", border:"#86efac" },
    { key:"needs_info", emoji:"💬", label:"Need More Info",  color:"#d97706", bg:"#fffbeb", border:"#fcd34d" },
    { key:"declined",   emoji:"❌", label:"Decline",         color:"#dc2626", bg:"#fef2f2", border:"#fca5a5" },
  ];

  const handleSubmit = async () => {
    if (!selected) return;
    if (!aeEmail.includes("@")) { setError("Please enter a valid email address."); return; }
    setSending(true);
    setError("");
    try {
      const functions     = getFunctions();
      const respondFn     = httpsCallable(functions, "respondToScenarioShare");
      await respondFn({ token, aeResponse: selected, aeNotes: notes, aeEmail });
      setSent(true);
    } catch (err) {
      setError(err.message || "Failed to submit response. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Already responded
  if (alreadyResponded && existingResponse) {
    const r = RESPONSES.find(r => r.key === existingResponse) || RESPONSES[0];
    return (
      <div style={{ background:r.bg, border:`1px solid ${r.border}`, borderRadius:12, padding:"24px 20px", textAlign:"center" }}>
        <div style={{ fontSize:36, marginBottom:8 }}>{r.emoji}</div>
        <div style={{ fontSize:16, fontWeight:700, color:r.color }}>You already responded: {r.label}</div>
        <div style={{ fontSize:13, color:"#6b7280", marginTop:6 }}>This scenario share has already received your response. The loan officer has been notified.</div>
      </div>
    );
  }

  // Sent successfully
  if (sent) {
    const r = RESPONSES.find(r => r.key === selected);
    return (
      <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:12, padding:"32px 20px", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:18, fontWeight:700, color:"#16a34a", marginBottom:6 }}>Response Sent!</div>
        <div style={{ fontSize:14, color:"#166534", marginBottom:4 }}>
          You responded: <strong>{r?.label}</strong>
        </div>
        <div style={{ fontSize:13, color:"#4ade80" }}>
          {loName || "The loan officer"} has been notified by email.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", padding:"18px 20px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#f5c842", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:4 }}>
          AE Response Required
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>
          {borrowerName ? `Respond to scenario: ${borrowerName}` : "Respond to this scenario share"}
        </div>
        <div style={{ fontSize:12, color:"#a0aec0", marginTop:4 }}>
          Your response will be sent directly to {loName || "the loan officer"} via email.
        </div>
      </div>

      <div style={{ padding:"20px" }}>

        {/* Response buttons */}
        <div style={{ fontSize:12, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
          Your Decision
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
          {RESPONSES.map(r => (
            <button
              key={r.key}
              onClick={() => setSelected(r.key)}
              style={{
                background:   selected === r.key ? r.bg : "#f9fafb",
                border:       selected === r.key ? `2px solid ${r.color}` : "1.5px solid #e5e7eb",
                borderRadius: 10,
                padding:      "14px 10px",
                textAlign:    "center",
                cursor:       "pointer",
                transition:   "all 0.15s",
              }}
            >
              <div style={{ fontSize:24, marginBottom:6 }}>{r.emoji}</div>
              <div style={{ fontSize:12, fontWeight:700, color:selected===r.key?r.color:"#374151" }}>{r.label}</div>
            </button>
          ))}
        </div>

        {/* AE Email */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6 }}>
            Your Email Address
          </label>
          <input
            type="email"
            placeholder="ae@lender.com"
            value={aeEmail}
            onChange={e => setAeEmail(e.target.value)}
            style={{ width:"100%", boxSizing:"border-box", border:"1px solid #d1d5db", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#111827", outline:"none" }}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6 }}>
            Notes for the LO <span style={{ fontWeight:400, color:"#9ca3af" }}>(optional)</span>
          </label>
          <textarea
            rows={4}
            placeholder={
              selected === "approved"   ? "Any conditions, overlays, or next steps for the LO..." :
              selected === "needs_info" ? "What additional information do you need?" :
              selected === "declined"   ? "Reason for decline and any alternative suggestions..." :
              "Add any notes or conditions for the loan officer..."
            }
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ width:"100%", boxSizing:"border-box", border:"1px solid #d1d5db", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#111827", outline:"none", resize:"vertical" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#dc2626", marginBottom:14 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selected || sending}
          style={{
            width:         "100%",
            padding:       "14px",
            background:    !selected ? "#e5e7eb" : sending ? "#d97706" : "#f59e0b",
            color:         !selected ? "#9ca3af" : "#1a1a2e",
            border:        "none",
            borderRadius:  8,
            fontSize:      14,
            fontWeight:    700,
            cursor:        !selected || sending ? "not-allowed" : "pointer",
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            gap:           8,
          }}
        >
          {sending ? (
            <>
              <div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(0,0,0,0.2)", borderTopColor:"#1a1a2e", animation:"spin 0.8s linear infinite" }} />
              Sending Response…
            </>
          ) : (
            <>
              {selected ? (RESPONSES.find(r=>r.key===selected)?.emoji||"✉️") : "✉️"}
              {selected ? `Send ${RESPONSES.find(r=>r.key===selected)?.label} Response` : "Select a response above"}
            </>
          )}
        </button>

        <p style={{ fontSize:11, color:"#9ca3af", textAlign:"center", marginTop:10 }}>
          Your response will notify {loName||"the loan officer"} instantly by email and update the scenario in LoanBeacons™.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AESharePage() {
  const { token } = useParams();
  const [state,    setState]    = useState("loading");
  const [data,     setData]     = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    const functions = getFunctions();
    const getShare  = httpsCallable(functions, "getShareByToken");
    getShare({ token })
      .then(res => {
        if (!res.data || res.data.error) {
          setErrorMsg(res.data?.error || "Share not found.");
          setState("error");
        } else {
          setData(res.data);
          setState("ready");
        }
      })
      .catch(err => {
        setErrorMsg(err.message || "Failed to load share.");
        setState("error");
      });
  }, [token]);

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #f8f9fb 0%, #f0f4f8 100%)", fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <header style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"0 24px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:"linear-gradient(135deg,#f59e0b,#d97706)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>🏦</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:"#111827", lineHeight:1.1 }}>LoanBeacons</div>
            <div style={{ fontSize:10, color:"#9ca3af", letterSpacing:"0.06em", textTransform:"uppercase" }}>AE Scenario Share</div>
          </div>
        </div>
        <div style={{ fontSize:11, color:"#9ca3af", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 10px" }}>
          Secure share link
        </div>
      </header>

      <main style={{ maxWidth:720, margin:"0 auto", padding:"32px 20px 60px" }}>
        {state === "loading" && <LoadingState />}
        {state === "error"   && <ErrorState message={errorMsg} />}
        {state === "ready"   && data && <ShareContent data={data} token={token} />}
      </main>
    </div>
  );
}

// ─── Share Content ────────────────────────────────────────────────────────────
function ShareContent({ data, token }) {
  const {
    purpose, shareType, message, createdAt, expiresAt,
    scenario = {}, lender = {}, lo = {},
    ae_response, borrower = {},
  } = data;

  const resolvedPurpose = SHARE_TYPE_LABELS[shareType] || purpose || shareType || "Scenario Share";
  const purposeMeta     = PURPOSE_META[shareType] || PURPOSE_META[purpose] || { icon:"📄", color:"#6b7280" };

  const created = createdAt
    ? new Date(createdAt._seconds * 1000 || createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" })
    : null;

  const expires = expiresAt
    ? new Date(expiresAt._seconds * 1000 || expiresAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })
    : null;

  const borrowerName = borrower?.name || scenario?.borrowerName || data?.borrowerName || "";
  const loName       = lo?.name || "";

  // Module context (from new Share with AE button)
  const moduleContext = data?.moduleContext || {};

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Purpose Banner */}
      <div style={{ background:"#fff", border:`1px solid ${purposeMeta.color}30`, borderLeft:`4px solid ${purposeMeta.color}`, borderRadius:10, padding:"16px 20px", display:"flex", alignItems:"flex-start", gap:14, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
        <span style={{ fontSize:28, lineHeight:1 }}>{purposeMeta.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:purposeMeta.color, marginBottom:3 }}>Purpose</div>
          <div style={{ fontSize:16, fontWeight:800, color:"#111827" }}>{resolvedPurpose}</div>
          {moduleContext.moduleName && (
            <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>
              Module: <strong>{moduleContext.moduleName}</strong>
              {moduleContext.borrowerName && <> · Borrower: <strong>{moduleContext.borrowerName}</strong></>}
            </div>
          )}
          {message && (
            <div style={{ marginTop:10, padding:"10px 14px", background:"#f9fafb", borderRadius:7, fontSize:13, color:"#374151", lineHeight:1.5, borderLeft:`3px solid ${purposeMeta.color}50` }}>
              "{message}"
            </div>
          )}
        </div>
        {created && (
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>Sent</div>
            <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{created}</div>
            {expires && (
              <>
                <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", marginTop:6 }}>Expires</div>
                <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{expires}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Key Stats */}
      <div style={{ display:"flex", gap:10 }}>
        <StatBadge label="Loan Amount" value={fmt.currency(scenario.loanAmount || moduleContext.loanAmount)} />
        <StatBadge label="LTV"         value={fmt.pct(scenario.ltv)} />
        <StatBadge label="Front DTI"   value={fmt.pct(scenario.frontDti)} sub="Housing" />
        <StatBadge label="Back DTI"    value={fmt.pct(scenario.backDti)}  sub="Total" />
      </div>

      {/* Loan Snapshot */}
      <SectionCard title="Loan Snapshot" icon="📋" accent="#2563eb">
        <DataRow label="Borrower"          value={borrowerName || scenario.borrowerName}       highlight />
        <DataRow label="Loan Purpose"      value={scenario.loanPurpose} />
        <DataRow label="Loan Program"      value={scenario.loanProgram || scenario.program || moduleContext.loanType} />
        <DataRow label="Property Address"  value={scenario.propertyAddress || moduleContext.propertyAddress} />
        <DataRow label="Property Type"     value={scenario.propertyType} />
        <DataRow label="Occupancy"         value={scenario.occupancy} />
        <DataRow label="Purchase Price"    value={fmt.currency(scenario.purchasePrice || scenario.salesPrice)} />
        <DataRow label="Loan Amount"       value={fmt.currency(scenario.loanAmount || moduleContext.loanAmount)} highlight />
        <DataRow label="Credit Score"      value={scenario.creditScore || moduleContext.creditScore ? `${scenario.creditScore || moduleContext.creditScore} FICO` : null} />
        <DataRow label="Monthly Income"    value={fmt.currency(scenario.monthlyIncome)} />
        <DataRow label="Total Housing (PITI)" value={fmt.currency(scenario.totalHousing)} />
      </SectionCard>

      {/* Matched Lender */}
      {(lender?.lenderName || lender?.name) && (
        <SectionCard title="Matched Lender" icon="🏦" accent="#d97706">
          <DataRow label="Lender"       value={lender.lenderName || lender.name}                        highlight />
          <DataRow label="AE / Contact" value={lender.aeName || lender.aeContact} />
          <DataRow label="Loan Program" value={lender.program || lender.loanProgram} />
          <DataRow label="Interest Rate" value={fmt.pct(lender.rate || lender.interestRate)}            highlight />
          <DataRow label="APR"          value={fmt.pct(lender.apr)} />
          <DataRow label="Points"       value={lender.points != null ? `${lender.points} pts` : null} />
          <DataRow label="Monthly P&I"  value={fmt.currency(lender.monthlyPI || lender.monthlyPayment)} />
          <DataRow label="Match Score"  value={lender.matchScore ? `${lender.matchScore}/100` : null} />
          <DataRow label="Overlay Notes" value={lender.overlayNotes} />
        </SectionCard>
      )}

      {/* LO Contact */}
      <SectionCard title="Loan Officer" icon="👤" accent="#059669">
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:12 }}>
          <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff", fontWeight:800, flexShrink:0 }}>
            {(lo.name||"L").charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:"#111827" }}>{lo.name||"—"}</div>
            {lo.nmls && <div style={{ fontSize:12, color:"#6b7280" }}>NMLS #{lo.nmls}</div>}
          </div>
        </div>
        <DataRow label="Phone"       value={fmt.phone(lo.phone)} />
        <DataRow label="Email"       value={lo.email} />
        <DataRow label="Company"     value={lo.company} />
        <DataRow label="Branch NMLS" value={lo.branchNmls ? `#${lo.branchNmls}` : null} />
      </SectionCard>

      {/* ── AE RESPONSE PANEL ─────────────────────────────────────────────── */}
      <AEResponsePanel
        token={token}
        loName={loName}
        borrowerName={borrowerName}
        alreadyResponded={!!ae_response}
        existingResponse={ae_response}
      />

      {/* Footer */}
      <div style={{ textAlign:"center", padding:"20px 0 0", fontSize:11, color:"#9ca3af", lineHeight:1.6 }}>
        This is a secure scenario share generated by LoanBeacons™.<br />
        For questions, contact the loan officer directly.<br />
        <span style={{ color:"#d1d5db" }}>Powered by LoanBeacons LLC</span>
      </div>
    </div>
  );
}
