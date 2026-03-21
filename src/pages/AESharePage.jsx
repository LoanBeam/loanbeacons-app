import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = {
  currency: (n) =>
    n != null && n !== "" && Number(n) !== 0
      ? new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 }).format(n)
      : null,
  pct:  (n) => (n != null && n !== "" && Number(n) !== 0 ? `${Number(n).toFixed(2)}%` : null),
  text: (v) => (v != null && v !== "" ? String(v) : null),
  score:(n) => (n != null && n !== "" && Number(n) !== 0 ? String(n) : null),
};

// ─── Color helpers ────────────────────────────────────────────────────────────
const dtiColor   = (v) => !v ? "#6b7280" : v > 50 ? "#dc2626" : v > 45 ? "#d97706" : "#059669";
const dtiBg      = (v) => !v ? null : v > 50 ? "#fef2f2" : v > 45 ? "#fffbeb" : "#f0fdf4";
const dtiBorder  = (v) => !v ? null : v > 50 ? "#fca5a5" : v > 45 ? "#fcd34d" : "#86efac";
const ficoColor  = (v) => !v ? "#6b7280" : v >= 720 ? "#059669" : v >= 680 ? "#d97706" : "#dc2626";
const ficoBg     = (v) => !v ? null : v >= 720 ? "#f0fdf4" : v >= 680 ? "#fffbeb" : "#fef2f2";
const ficoBorder = (v) => !v ? null : v >= 720 ? "#86efac" : v >= 680 ? "#fcd34d" : "#fca5a5";
const ficoLabel  = (v) => !v ? "" : v >= 720 ? "Strong" : v >= 680 ? "Fair" : "Below Guideline";
const probColor  = (v) => !v ? "#6b7280" : v >= 75 ? "#059669" : v >= 50 ? "#d97706" : "#dc2626";
const probBg     = (v) => !v ? null : v >= 75 ? "#f0fdf4" : v >= 50 ? "#fffbeb" : "#fef2f2";
const probLabel  = (v) => !v ? "" : v >= 75 ? "High" : v >= 50 ? "Moderate" : "Low";

const SHARE_TYPE_META = {
  AE_SUPPORT:       { label:"AE Support Requested",         icon:"🤝", color:"#d97706", bg:"#fffbeb", border:"#f59e0b" },
  SCENARIO_REVIEW:  { label:"Eligibility Review Requested", icon:"🔍", color:"#2563eb", bg:"#eff6ff", border:"#3b82f6" },
  FINAL_SUBMISSION: { label:"Ready for Submission",         icon:"✅", color:"#059669", bg:"#f0fdf4", border:"#10b981" },
};

// ─── Loading / Error ──────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div style={{ textAlign:"center", padding:"100px 20px" }}>
      <div style={{ width:44, height:44, borderRadius:"50%", border:"3px solid #e5e7eb", borderTopColor:"#d97706", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
      <p style={{ color:"#6b7280", fontSize:14 }}>Loading scenario…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
function ErrorState({ message }) {
  return (
    <div style={{ textAlign:"center", padding:"100px 20px" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🔗</div>
      <h2 style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:8 }}>Link Unavailable</h2>
      <p style={{ color:"#6b7280", fontSize:14, maxWidth:380, margin:"0 auto", lineHeight:1.6 }}>
        {message || "This share link is invalid, expired, or has been revoked."}
      </p>
    </div>
  );
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Card({ title, icon, accent="#6b7280", children }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderLeft:`4px solid ${accent}`, borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 20px", background:"#fafafa", borderBottom:"1px solid #f0f0f0" }}>
        <span style={{ fontSize:14 }}>{icon}</span>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.10em", textTransform:"uppercase", color:accent }}>{title}</span>
      </div>
      <div style={{ padding:"16px 20px" }}>{children}</div>
    </div>
  );
}
function Row({ label, value, highlight, color, bg, border }) {
  if (!value) return null;
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
      <span style={{ fontSize:12, color:"#9ca3af", flexShrink:0, marginRight:12 }}>{label}</span>
      {bg
        ? <span style={{ fontSize:13, fontWeight:700, color:color||"#374151", background:bg, border:`1px solid ${border||"transparent"}`, borderRadius:6, padding:"2px 8px" }}>{value}</span>
        : <span style={{ fontSize:13, fontWeight:highlight?700:500, color:highlight?"#111827":"#374151", textAlign:"right" }}>{value}</span>
      }
    </div>
  );
}
function FieldGrid({ children }) {
  return <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1px 20px" }}>{children}</div>;
}
function Field({ label, value, highlight, full, color, bg, border }) {
  if (!value) return <div style={{ gridColumn:full?"1/-1":"auto" }} />;
  return (
    <div style={{ gridColumn:full?"1/-1":"auto", padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
      <div style={{ fontSize:11, color:"#9ca3af", marginBottom:3 }}>{label}</div>
      {bg
        ? <span style={{ fontSize:13, fontWeight:700, color:color||"#374151", background:bg, border:`1px solid ${border||"transparent"}`, borderRadius:6, padding:"2px 8px", display:"inline-block" }}>{value}</span>
        : <div style={{ fontSize:13, fontWeight:highlight?700:500, color:highlight?"#111827":"#374151", lineHeight:1.4 }}>{value}</div>
      }
    </div>
  );
}
function StatBox({ label, value, sub, accent="#6b7280" }) {
  return (
    <div style={{ flex:1, background:"#fafafa", border:"1px solid #e5e7eb", borderTop:`3px solid ${accent}`, borderRadius:10, padding:"12px 8px", textAlign:"center", minWidth:0 }}>
      <div style={{ fontSize:17, fontWeight:800, color:accent, letterSpacing:"-0.02em", lineHeight:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value||"—"}</div>
      <div style={{ fontSize:10, color:"#6b7280", marginTop:3, fontWeight:600 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  );
}
function CheckItem({ text, pass }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"4px 0" }}>
      <span style={{ fontSize:12, flexShrink:0 }}>{pass?"✅":"⚠️"}</span>
      <span style={{ fontSize:12, color:pass?"#166534":"#92400e", lineHeight:1.5 }}>{text}</span>
    </div>
  );
}
function Pill({ text, color, bg, border }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, color:color||"#374151", background:bg||"#f3f4f6", border:`1px solid ${border||"#e5e7eb"}`, borderRadius:20, padding:"3px 10px", display:"inline-block", marginRight:6, marginBottom:4 }}>
      {text}
    </span>
  );
}

// ─── Module-Specific Context Sections ─────────────────────────────────────────
// Each module passes its own data in moduleContext. These sections render
// rich AE-relevant summaries based on which module triggered the share.

function ModuleContextSection({ moduleCtx }) {
  if (!moduleCtx || !moduleCtx.moduleName) return null;
  const name = moduleCtx.moduleName;

  // ── AUS Rescue™ ─────────────────────────────────────────────────────────────
  if (name.includes("AUS Rescue")) {
    const prob     = Number(moduleCtx.approvalProbability) || null;
    const feasib   = moduleCtx.feasibilityScore;
    const blocker  = moduleCtx.primaryBlocker;
    const ausResult = moduleCtx.ausResult;
    const strategies = moduleCtx.topStrategies || [];
    const programMigrations = moduleCtx.programMigrations || [];
    return (
      <Card title="AUS Rescue™ Analysis" icon="🚨" accent="#dc2626">
        {/* Header stats */}
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          {prob != null && (
            <div style={{ flex:1, textAlign:"center", padding:"12px 8px", background:probBg(prob), border:`1px solid ${ficoBorder(prob)}`, borderRadius:10 }}>
              <div style={{ fontSize:22, fontWeight:800, color:probColor(prob) }}>{prob}%</div>
              <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, marginTop:2 }}>Approval Probability</div>
              <div style={{ fontSize:11, color:probColor(prob), fontWeight:700, marginTop:2 }}>{probLabel(prob)}</div>
            </div>
          )}
          {feasib && (
            <div style={{ flex:1, textAlign:"center", padding:"12px 8px", background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10 }}>
              <div style={{ fontSize:18, fontWeight:800, color: feasib==="HIGH"?"#059669":feasib==="MODERATE"?"#d97706":"#dc2626" }}>{feasib}</div>
              <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, marginTop:2 }}>Fix Feasibility</div>
            </div>
          )}
          {ausResult && (
            <div style={{ flex:1, textAlign:"center", padding:"12px 8px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10 }}>
              <div style={{ fontSize:14, fontWeight:800, color:"#dc2626" }}>{ausResult}</div>
              <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, marginTop:2 }}>AUS Result</div>
            </div>
          )}
        </div>
        {blocker && (
          <div style={{ padding:"10px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Primary Blocker</div>
            <div style={{ fontSize:13, color:"#7f1d1d", fontWeight:600 }}>{blocker}</div>
          </div>
        )}
        {strategies.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Top Fix Strategies</div>
            {strategies.slice(0,5).map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
                <span style={{ fontSize:11, fontWeight:800, color:"#dc2626", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:5, padding:"1px 7px", flexShrink:0, marginTop:1 }}>#{i+1}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#111827" }}>{s.strategy || s.name || s}</div>
                  {s.impact && <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{s.impact}</div>}
                </div>
                {s.probability != null && (
                  <span style={{ fontSize:12, fontWeight:700, color:probColor(s.probability), background:probBg(s.probability), borderRadius:20, padding:"2px 8px", flexShrink:0 }}>{s.probability}%</span>
                )}
              </div>
            ))}
          </div>
        )}
        {programMigrations.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Program Migration Options</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {programMigrations.map((p, i) => (
                <div key={i} style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                  <div style={{ fontWeight:700, color:"#111827" }}>{p.program || p}</div>
                  {p.probability != null && <div style={{ color:probColor(p.probability), fontWeight:700, marginTop:2 }}>{p.probability}% approval</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ── Income Analyzer ──────────────────────────────────────────────────────────
  if (name.includes("Income Analyzer") || name.includes("IncomeAnalyzer")) {
    const totalIncome   = moduleCtx.totalQualifyingIncome || moduleCtx.totalIncome;
    const incomeTypes   = moduleCtx.incomeTypes   || [];
    const w2Income      = moduleCtx.w2Income;
    const selfEmployed  = moduleCtx.selfEmployedIncome;
    const rentalIncome  = moduleCtx.rentalIncome;
    const otherIncome   = moduleCtx.otherIncome;
    const incomeNotes   = moduleCtx.notes || moduleCtx.incomeNotes;
    return (
      <Card title="Income Analyzer Summary" icon="💼" accent="#059669">
        {totalIncome && (
          <div style={{ textAlign:"center", padding:"14px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, marginBottom:14 }}>
            <div style={{ fontSize:26, fontWeight:800, color:"#059669" }}>{fmt.currency(totalIncome)}/mo</div>
            <div style={{ fontSize:11, color:"#166534", fontWeight:600, marginTop:2 }}>Total Qualifying Income</div>
          </div>
        )}
        <FieldGrid>
          {w2Income     && <Field label="W-2 / Employment"   value={fmt.currency(w2Income)}     highlight />}
          {selfEmployed && <Field label="Self-Employed"      value={fmt.currency(selfEmployed)} highlight />}
          {rentalIncome && <Field label="Rental Income"      value={fmt.currency(rentalIncome)} />}
          {otherIncome  && <Field label="Other Income"       value={fmt.currency(otherIncome)}  />}
        </FieldGrid>
        {incomeTypes.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:6 }}>Income Types Included</div>
            <div style={{ display:"flex", flexWrap:"wrap" }}>
              {incomeTypes.map((t, i) => <Pill key={i} text={t} color="#059669" bg="#f0fdf4" border="#86efac" />)}
            </div>
          </div>
        )}
        {incomeNotes && (
          <div style={{ marginTop:12, padding:"10px 14px", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, fontSize:12, color:"#92400e" }}>
            ⚠️ {incomeNotes}
          </div>
        )}
      </Card>
    );
  }

  // ── QualifyingIntel ──────────────────────────────────────────────────────────
  if (name.includes("QualifyingIntel") || name.includes("Qualifying Intel")) {
    const qualScore     = moduleCtx.qualifyingScore;
    const maxLoan       = moduleCtx.maxLoanAmount;
    const maxPurchase   = moduleCtx.maxPurchasePrice;
    const limitingFactor = moduleCtx.limitingFactor;
    const flags         = moduleCtx.qualifyingFlags || [];
    return (
      <Card title="QualifyingIntel™ Summary" icon="🎯" accent="#2563eb">
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          {maxLoan && <StatBox label="Max Loan Amount"    value={fmt.currency(maxLoan)}    accent="#2563eb" />}
          {maxPurchase && <StatBox label="Max Purchase Price" value={fmt.currency(maxPurchase)} accent="#7c3aed" />}
          {qualScore != null && <StatBox label="Qualifying Score"  value={`${qualScore}/100`} accent={qualScore>=70?"#059669":qualScore>=50?"#d97706":"#dc2626"} />}
        </div>
        {limitingFactor && (
          <div style={{ padding:"10px 14px", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#d97706", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>Limiting Factor</div>
            <div style={{ fontSize:13, color:"#92400e", fontWeight:600 }}>{limitingFactor}</div>
          </div>
        )}
        {flags.length > 0 && (
          <div>
            {flags.map((f, i) => <CheckItem key={i} text={f.message||f} pass={f.pass !== false} />)}
          </div>
        )}
      </Card>
    );
  }

  // ── Credit Intel ─────────────────────────────────────────────────────────────
  if (name.includes("CreditIntel") || name.includes("Credit Intel")) {
    const fico          = Number(moduleCtx.creditScore) || null;
    const derogItems    = moduleCtx.derogatoryItems || [];
    const collections   = moduleCtx.collections;
    const latePayments  = moduleCtx.latePayments;
    const publicRecords = moduleCtx.publicRecords;
    const recommendations = moduleCtx.recommendations || [];
    return (
      <Card title="CreditIntel™ Summary" icon="📊" accent="#7c3aed">
        {fico && (
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px", background:ficoBg(fico), border:`1px solid ${ficoBorder(fico)}`, borderRadius:10, marginBottom:14 }}>
            <div style={{ fontSize:32, fontWeight:800, color:ficoColor(fico) }}>{fico}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:ficoColor(fico) }}>{ficoLabel(fico)}</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>Middle FICO Score</div>
            </div>
          </div>
        )}
        <FieldGrid>
          {collections   != null && <Field label="Collections"     value={String(collections)}   color={collections>0?"#dc2626":undefined} />}
          {latePayments  != null && <Field label="Late Payments"   value={String(latePayments)}   color={latePayments>0?"#d97706":undefined} />}
          {publicRecords != null && <Field label="Public Records"  value={String(publicRecords)}  color={publicRecords>0?"#dc2626":undefined} />}
        </FieldGrid>
        {derogItems.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Derogatory Items</div>
            {derogItems.map((d, i) => <CheckItem key={i} text={d.description||d} pass={false} />)}
          </div>
        )}
        {recommendations.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#2563eb", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Recommendations</div>
            {recommendations.map((r, i) => <CheckItem key={i} text={r} pass={true} />)}
          </div>
        )}
      </Card>
    );
  }

  // ── Asset Analyzer ───────────────────────────────────────────────────────────
  if (name.includes("Asset") || name.includes("AssetAnalyzer")) {
    const totalAssets   = moduleCtx.totalAssets;
    const fundsToClose  = moduleCtx.fundsToClose;
    const reserves      = moduleCtx.reserves;
    const reserveMonths = moduleCtx.reserveMonths;
    const giftFunds     = moduleCtx.giftFunds;
    const assetFlags    = moduleCtx.assetFlags || [];
    return (
      <Card title="Asset Analyzer Summary" icon="🏦" accent="#d97706">
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          {totalAssets  && <StatBox label="Total Assets"    value={fmt.currency(totalAssets)}  accent="#d97706" />}
          {fundsToClose && <StatBox label="Funds to Close"  value={fmt.currency(fundsToClose)} accent="#2563eb" />}
          {reserves     && <StatBox label="Post-Close Reserves" value={fmt.currency(reserves)} sub={reserveMonths?`${reserveMonths} months`:null} accent={reserveMonths>=2?"#059669":"#dc2626"} />}
        </div>
        {giftFunds && <Row label="Gift Funds" value={fmt.currency(giftFunds)} />}
        {assetFlags.length > 0 && (
          <div style={{ marginTop:12 }}>
            {assetFlags.map((f, i) => <CheckItem key={i} text={f.message||f} pass={f.pass !== false} />)}
          </div>
        )}
      </Card>
    );
  }

  // ── Property Intel ───────────────────────────────────────────────────────────
  if (name.includes("PropertyIntel") || name.includes("Property Intel")) {
    const propType      = moduleCtx.propertyType;
    const appraisedVal  = moduleCtx.appraisedValue;
    const zoning        = moduleCtx.zoning;
    const floodZone     = moduleCtx.floodZone;
    const concerns      = moduleCtx.propertyConcerns || [];
    const condoWarrant  = moduleCtx.condoWarranty;
    return (
      <Card title="PropertyIntel™ Summary" icon="🏘️" accent="#7c3aed">
        <FieldGrid>
          {propType     && <Field label="Property Type"     value={fmt.text(propType)} highlight />}
          {appraisedVal && <Field label="Appraised Value"   value={fmt.currency(appraisedVal)} highlight />}
          {zoning       && <Field label="Zoning"            value={fmt.text(zoning)} />}
          {floodZone    && <Field label="Flood Zone"        value={fmt.text(floodZone)} color={floodZone.startsWith("A")||floodZone.startsWith("V")?"#dc2626":undefined} />}
          {condoWarrant && <Field label="Condo Warranty"    value={fmt.text(condoWarrant)} />}
        </FieldGrid>
        {concerns.length > 0 && (
          <div style={{ marginTop:12 }}>
            {concerns.map((c, i) => <CheckItem key={i} text={c} pass={false} />)}
          </div>
        )}
      </Card>
    );
  }

  // ── Lender Match™ ────────────────────────────────────────────────────────────
  if (name.includes("Lender Match") || name.includes("LenderMatch")) {
    const matchedLender = moduleCtx.matchedLender || moduleCtx.lenderName;
    const matchScore    = moduleCtx.matchScore;
    const rate          = moduleCtx.interestRate || moduleCtx.rate;
    const apr           = moduleCtx.apr;
    const program       = moduleCtx.loanProgram || moduleCtx.program;
    const overlays      = moduleCtx.overlayNotes || moduleCtx.overlays;
    const alternates    = moduleCtx.alternativeLenders || [];
    return (
      <Card title="Lender Match™ Summary" icon="🎯" accent="#2563eb">
        {matchedLender && (
          <div style={{ padding:"12px 14px", background:"#eff6ff", border:"1px solid #3b82f6", borderRadius:10, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#2563eb", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Top Match</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#1e40af" }}>{matchedLender}</div>
            {matchScore && <div style={{ fontSize:12, color:"#2563eb", marginTop:2 }}>Match Score: {matchScore}/100</div>}
          </div>
        )}
        <FieldGrid>
          {rate    && <Field label="Interest Rate" value={fmt.pct(rate)} highlight />}
          {apr     && <Field label="APR"           value={fmt.pct(apr)} />}
          {program && <Field label="Loan Program"  value={fmt.text(program)} />}
        </FieldGrid>
        {overlays && (
          <div style={{ marginTop:12, padding:"10px 14px", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, fontSize:12, color:"#92400e" }}>
            <strong>Overlay Notes:</strong> {overlays}
          </div>
        )}
        {alternates.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Alternative Lenders</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {alternates.map((a, i) => <Pill key={i} text={a.name||a} color="#2563eb" bg="#eff6ff" border="#bfdbfe" />)}
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ── Rehab Intelligence™ ──────────────────────────────────────────────────────
  if (name.includes("Rehab") || name.includes("RehabIntelligence")) {
    const rehabBudget   = moduleCtx.rehabBudget;
    const arv           = moduleCtx.afterRepairValue;
    const arvLtv        = moduleCtx.arvLtv;
    const loanProgram   = moduleCtx.rehabProgram || moduleCtx.loanProgram;
    const contingency   = moduleCtx.contingencyReserve;
    const flags         = moduleCtx.rehabFlags || [];
    return (
      <Card title="Rehab Intelligence™ Summary" icon="🔨" accent="#d97706">
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          {rehabBudget && <StatBox label="Rehab Budget"       value={fmt.currency(rehabBudget)} accent="#d97706" />}
          {arv         && <StatBox label="After-Repair Value" value={fmt.currency(arv)}         accent="#7c3aed" />}
          {arvLtv      && <StatBox label="ARV LTV"            value={fmt.pct(arvLtv)}            accent={Number(arvLtv)<=95?"#059669":"#dc2626"} />}
        </div>
        <FieldGrid>
          {loanProgram && <Field label="Rehab Program"      value={fmt.text(loanProgram)} highlight />}
          {contingency && <Field label="Contingency Reserve" value={fmt.currency(contingency)} />}
        </FieldGrid>
        {flags.length > 0 && (
          <div style={{ marginTop:12 }}>
            {flags.map((f, i) => <CheckItem key={i} text={f.message||f} pass={f.pass !== false} />)}
          </div>
        )}
      </Card>
    );
  }

  // ── CRA Eligibility ──────────────────────────────────────────────────────────
  if (name.includes("CRA")) {
    const craEligible   = moduleCtx.craEligible;
    const censusData    = moduleCtx.censusData || {};
    const amiPct        = moduleCtx.amiPercent || moduleCtx.amiPct;
    const tractType     = moduleCtx.tractType;
    const benefits      = moduleCtx.craBenefits || [];
    return (
      <Card title="CRA Eligibility Summary" icon="🏛️" accent="#059669">
        <div style={{ textAlign:"center", padding:"12px", background:craEligible?"#f0fdf4":"#fef2f2", border:`1px solid ${craEligible?"#86efac":"#fca5a5"}`, borderRadius:10, marginBottom:14 }}>
          <div style={{ fontSize:18, fontWeight:800, color:craEligible?"#059669":"#dc2626" }}>
            {craEligible?"✅ CRA Eligible":"❌ Not CRA Eligible"}
          </div>
        </div>
        <FieldGrid>
          {amiPct    && <Field label="AMI %"       value={`${amiPct}% of AMI`} highlight />}
          {tractType && <Field label="Census Tract" value={fmt.text(tractType)} />}
          {censusData.tractId && <Field label="Tract ID" value={fmt.text(censusData.tractId)} />}
          {censusData.county  && <Field label="County"   value={fmt.text(censusData.county)} />}
        </FieldGrid>
        {benefits.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#059669", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>CRA Benefits Available</div>
            {benefits.map((b, i) => <CheckItem key={i} text={b} pass={true} />)}
          </div>
        )}
      </Card>
    );
  }

  // ── Rate Intel ───────────────────────────────────────────────────────────────
  if (name.includes("RateIntel") || name.includes("Rate Intel")) {
    const bestRate      = moduleCtx.bestRate || moduleCtx.currentRate;
    const apr           = moduleCtx.apr;
    const points        = moduleCtx.points;
    const rateType      = moduleCtx.rateType;
    const rateLock      = moduleCtx.rateLockPeriod;
    const monthlyPI     = moduleCtx.monthlyPI;
    return (
      <Card title="RateIntel™ Summary" icon="📈" accent="#2563eb">
        {bestRate && (
          <div style={{ textAlign:"center", padding:"14px", background:"#eff6ff", border:"1px solid #3b82f6", borderRadius:10, marginBottom:14 }}>
            <div style={{ fontSize:28, fontWeight:800, color:"#2563eb" }}>{fmt.pct(bestRate)}</div>
            <div style={{ fontSize:11, color:"#2563eb", fontWeight:600, marginTop:2 }}>Current Rate</div>
          </div>
        )}
        <FieldGrid>
          {apr       && <Field label="APR"             value={fmt.pct(apr)} />}
          {points    && <Field label="Points"          value={`${points} pts`} />}
          {rateType  && <Field label="Rate Type"       value={fmt.text(rateType)} />}
          {rateLock  && <Field label="Rate Lock"       value={fmt.text(rateLock)} />}
          {monthlyPI && <Field label="Monthly P&I"     value={fmt.currency(monthlyPI)} highlight />}
        </FieldGrid>
      </Card>
    );
  }

  // ── Closing Cost Calculator ──────────────────────────────────────────────────
  if (name.includes("Closing") || name.includes("ClosingCost")) {
    const totalClosing  = moduleCtx.totalClosingCosts;
    const cashToClose   = moduleCtx.cashToClose;
    const sellerCredits = moduleCtx.sellerCredits;
    const lenderCredits = moduleCtx.lenderCredits;
    const prepaids      = moduleCtx.prepaids;
    return (
      <Card title="Closing Cost Summary" icon="🧾" accent="#6b7280">
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          {totalClosing && <StatBox label="Total Closing Costs" value={fmt.currency(totalClosing)} accent="#6b7280" />}
          {cashToClose  && <StatBox label="Cash to Close"       value={fmt.currency(cashToClose)}  accent="#2563eb" />}
        </div>
        <FieldGrid>
          {sellerCredits && <Field label="Seller Credits"  value={fmt.currency(sellerCredits)} color="#059669" />}
          {lenderCredits && <Field label="Lender Credits"  value={fmt.currency(lenderCredits)} color="#059669" />}
          {prepaids      && <Field label="Prepaids"        value={fmt.currency(prepaids)} />}
        </FieldGrid>
      </Card>
    );
  }

  // ── Generic fallback for any other module ────────────────────────────────────
  // Shows module name + any extra fields that were passed
  const skipKeys = ["moduleName","moduleNumber","borrowerName","creditScore","loanAmount","loanType","propertyAddress"];
  const extraEntries = Object.entries(moduleCtx).filter(([k,v]) => !skipKeys.includes(k) && v != null && v !== "");
  if (extraEntries.length === 0) return null;
  return (
    <Card title={`${name} — Additional Context`} icon="📋" accent="#6b7280">
      {extraEntries.map(([k, v]) => (
        <Row key={k}
          label={k.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase())}
          value={typeof v==="object" ? JSON.stringify(v) : String(v)}
        />
      ))}
    </Card>
  );
}

// ─── AE Response Panel ────────────────────────────────────────────────────────
function AEResponsePanel({ token, loName, borrowerName, alreadyResponded, existingResponse }) {
  const [selected, setSelected] = useState(null);
  const [notes,    setNotes]    = useState("");
  const [aeEmail,  setAeEmail]  = useState("");
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState("");

  const RESPONSES = [
    { key:"approved",   emoji:"✅", label:"Approve",       color:"#16a34a", bg:"#f0fdf4", border:"#86efac",
      preview:"The LO will see: ✅ Approved — please check any notes or conditions below." },
    { key:"needs_info", emoji:"💬", label:"Need More Info", color:"#d97706", bg:"#fffbeb", border:"#fcd34d",
      preview:"The LO will see: 💬 More information needed before a decision can be made." },
    { key:"declined",   emoji:"❌", label:"Decline",        color:"#dc2626", bg:"#fef2f2", border:"#fca5a5",
      preview:"The LO will see: ❌ Declined — check the notes for the reason and any alternatives." },
  ];
  const activeResponse = RESPONSES.find(r => r.key === selected);

  const handleSubmit = async () => {
    if (!selected) return;
    if (!aeEmail.includes("@")) { setError("Please enter a valid email address."); return; }
    setSending(true); setError("");
    try {
      const fns = getFunctions();
      const fn  = httpsCallable(fns, "respondToScenarioShare");
      await fn({ token, aeResponse:selected, aeNotes:notes, aeEmail });
      setSent(true);
    } catch (err) {
      setError(err.message || "Failed to submit. Please try again.");
    } finally { setSending(false); }
  };

  if (alreadyResponded && existingResponse) {
    const r = RESPONSES.find(r => r.key === existingResponse) || RESPONSES[0];
    return (
      <div style={{ background:r.bg, border:`1px solid ${r.border}`, borderRadius:14, padding:"28px 24px", textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:10 }}>{r.emoji}</div>
        <div style={{ fontSize:16, fontWeight:700, color:r.color }}>You already responded: {r.label}</div>
        <div style={{ fontSize:13, color:"#6b7280", marginTop:6 }}>The loan officer has been notified.</div>
      </div>
    );
  }
  if (sent) {
    const r = RESPONSES.find(r => r.key === selected);
    return (
      <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:14, padding:"36px 24px", textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:18, fontWeight:800, color:"#16a34a", marginBottom:6 }}>Response Sent!</div>
        <div style={{ fontSize:14, color:"#166534" }}>You responded: <strong>{r?.label}</strong></div>
        <div style={{ fontSize:13, color:"#4ade80", marginTop:4 }}>{loName||"The loan officer"} has been notified.</div>
      </div>
    );
  }

  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderLeft:"4px solid #1a1a2e", borderRadius:14, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
      <div style={{ background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)", padding:"20px 24px" }}>
        <div style={{ fontSize:10, fontWeight:800, color:"#f5c842", letterSpacing:"0.10em", textTransform:"uppercase", marginBottom:4 }}>AE Response Required</div>
        <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{borrowerName?`Respond to: ${borrowerName}`:"Respond to this scenario"}</div>
        <div style={{ fontSize:12, color:"#a0aec0", marginTop:4 }}>Your response will be emailed directly to {loName||"the loan officer"}.</div>
      </div>
      <div style={{ padding:"22px 24px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Your Decision</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
          {RESPONSES.map(r => (
            <button key={r.key} onClick={() => setSelected(r.key)} style={{
              background:   selected===r.key?r.bg:"#f9fafb",
              border:       selected===r.key?`2px solid ${r.color}`:"1.5px solid #e5e7eb",
              borderRadius: 10, padding:"16px 8px", textAlign:"center", cursor:"pointer", transition:"all 0.15s",
            }}>
              <div style={{ fontSize:26, marginBottom:6 }}>{r.emoji}</div>
              <div style={{ fontSize:12, fontWeight:700, color:selected===r.key?r.color:"#374151" }}>{r.label}</div>
            </button>
          ))}
        </div>
        {activeResponse && (
          <div style={{ marginBottom:18, padding:"10px 14px", background:activeResponse.bg, border:`1px solid ${activeResponse.border}`, borderRadius:8, fontSize:12, color:activeResponse.color, lineHeight:1.5, transition:"all 0.2s" }}>
            <strong>Preview:</strong> {notes
              ? `The LO will see: ${activeResponse.emoji} ${activeResponse.label} — "${notes.slice(0,60)}${notes.length>60?"…":""}"`
              : activeResponse.preview}
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6 }}>Your Email Address</label>
          <input type="email" placeholder="ae@lender.com" value={aeEmail} onChange={e => setAeEmail(e.target.value)}
            style={{ width:"100%", boxSizing:"border-box", border:"1.5px solid #e5e7eb", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#111827", outline:"none", fontFamily:"inherit" }} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6 }}>
            Notes for the LO <span style={{ fontWeight:400, color:"#9ca3af", textTransform:"none" }}>(optional)</span>
          </label>
          <textarea rows={4}
            placeholder={
              selected==="approved"  ? "Conditions, overlays, or next steps for the LO..." :
              selected==="needs_info"? "What additional information do you need?" :
              selected==="declined"  ? "Reason for decline and any alternative suggestions..." :
              "Add conditions, notes, or guidance for the loan officer..."
            }
            value={notes} onChange={e => setNotes(e.target.value)}
            style={{ width:"100%", boxSizing:"border-box", border:"1.5px solid #e5e7eb", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#111827", outline:"none", resize:"vertical", fontFamily:"inherit" }} />
        </div>
        {error && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#dc2626", marginBottom:14 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={!selected||sending} style={{
          width:"100%", padding:14,
          background: !selected?"#e5e7eb":sending?"#d97706":"#f59e0b",
          color:      !selected?"#9ca3af":"#1a1a2e",
          border:"none", borderRadius:8, fontSize:14, fontWeight:700,
          cursor:!selected||sending?"not-allowed":"pointer",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"inherit",
          boxShadow:selected&&!sending?"0 2px 8px rgba(245,158,11,0.35)":"none", transition:"all 0.15s",
        }}>
          {sending
            ? <><div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(0,0,0,0.2)", borderTopColor:"#1a1a2e", animation:"spin 0.8s linear infinite" }} />Sending…</>
            : <>{selected?(RESPONSES.find(r=>r.key===selected)?.emoji||"✉️"):"✉️"} {selected?`Send ${RESPONSES.find(r=>r.key===selected)?.label} Response`:"Select a response above"}</>
          }
        </button>
        <p style={{ fontSize:11, color:"#9ca3af", textAlign:"center", marginTop:10, lineHeight:1.5 }}>
          Your response notifies {loName||"the LO"} instantly and updates the scenario in LoanBeacons™.
        </p>
      </div>
    </div>
  );
}

// ─── Share Content ────────────────────────────────────────────────────────────
function ShareContent({ data, token }) {
  const borrower     = data.borrower     || {};
  const property     = data.property     || {};
  const piti         = data.piti         || {};
  const dti          = data.dti          || {};
  const lo           = data.lo           || {};
  const lender       = data.lender       || {};
  const dpaContext   = data.dpaContext   || null;
  const moduleCtx    = data.moduleContext || {};
  const intelligence = data.intelligence || {};
  const shareType    = data.shareType    || "AE_SUPPORT";
  const message      = data.message      || "";
  const scenarioId   = data.scenarioId   || "";
  const timestamp    = data.timestamp    || null;
  const ae_response  = data.ae_response  || null;

  const meta = SHARE_TYPE_META[shareType] || SHARE_TYPE_META.AE_SUPPORT;

  const ltvRaw       = property.ltv ? Number(property.ltv)
                     : (property.loanAmount && property.value ? (property.loanAmount / property.value) * 100 : null);
  const frontDtiRaw  = Number(dti.front) || null;
  const backDtiRaw   = Number(dti.back)  || null;
  const ficoRaw      = Number(borrower.creditScore) || null;

  const sentDate = timestamp
    ? new Date(timestamp).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })
    : null;

  const dpaAmountDisplay = (() => {
    if (dpaContext?.dpaAmount && dpaContext.dpaAmount !== "null") return dpaContext.dpaAmount;
    if (dpaContext?.assistancePct) return `${(Number(dpaContext.assistancePct)*100).toFixed(1)}% of purchase price`;
    return "$0 — Based on CLTV";
  })();

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Purpose Banner */}
      <div style={{ background:meta.bg, border:`1px solid ${meta.border}`, borderLeft:`5px solid ${meta.color}`, borderRadius:14, padding:"18px 22px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
          <span style={{ fontSize:30, lineHeight:1, flexShrink:0 }}>{meta.icon}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.10em", textTransform:"uppercase", color:meta.color, marginBottom:3 }}>Purpose of This Share</div>
            <div style={{ fontSize:17, fontWeight:800, color:"#111827", lineHeight:1.2 }}>{meta.label}</div>
            {moduleCtx.moduleName && (
              <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                Sent from: <strong>{moduleCtx.moduleName}</strong>
                {moduleCtx.moduleNumber && ` (Module ${moduleCtx.moduleNumber})`}
              </div>
            )}
            {message && (
              <div style={{ marginTop:10, padding:"10px 14px", background:"rgba(255,255,255,0.75)", borderRadius:8, fontSize:13, color:"#374151", lineHeight:1.6, borderLeft:`3px solid ${meta.color}60`, fontStyle:"italic" }}>
                "{message}"
              </div>
            )}
          </div>
          {sentDate && (
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>Sent</div>
              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{sentDate}</div>
            </div>
          )}
        </div>
      </div>

      {/* Key Stats */}
      <div style={{ display:"flex", gap:8 }}>
        <StatBox label="Loan Amount" value={fmt.currency(property.loanAmount)} accent="#2563eb" />
        <StatBox label="LTV"         value={ltvRaw?`${ltvRaw.toFixed(1)}%`:"—"} accent="#7c3aed" />
        <StatBox label="Front DTI"   value={frontDtiRaw?`${frontDtiRaw.toFixed(2)}%`:"—"} sub="Housing" accent={dtiColor(frontDtiRaw)} />
        <StatBox label="Back DTI"    value={backDtiRaw?`${backDtiRaw.toFixed(2)}%`:"—"}   sub="Total"   accent={dtiColor(backDtiRaw)} />
        <StatBox label="FICO Score"  value={ficoRaw?String(ficoRaw):"—"} sub={ficoRaw?ficoLabel(ficoRaw):""} accent={ficoColor(ficoRaw)} />
      </div>

      {/* ── Module-Specific Context — renders ABOVE base scenario for AE focus ── */}
      <ModuleContextSection moduleCtx={moduleCtx} />

      {/* DPA Program (when sent from DPA Intelligence) */}
      {dpaContext && (
        <Card title="DPA Program Details" icon="🏠" accent="#16a34a">
          <Row label="Program Name" value={fmt.text(dpaContext.programName)} highlight />
          <div style={{ height:6 }} />
          <FieldGrid>
            <Field label="Program Type"  value={fmt.text(dpaContext.programType)} />
            <Field label="Status"        value={fmt.text(dpaContext.programStatus)} highlight />
            <Field label="DPA Amount"    value={dpaAmountDisplay} highlight />
            <Field label="Max CLTV"      value={fmt.text(dpaContext.ltvLimit)} />
            <Field label="CLTV w/ DPA"   value={fmt.text(dpaContext.cltv)} />
            <Field label="Admin Agency"  value={fmt.text(dpaContext.adminAgency)} />
            <Field label="Lender"        value={fmt.text(dpaContext.lenderName || lender.name)} />
            {dpaContext.incomeLimit && <Field label="Income Limit" value={fmt.currency(dpaContext.incomeLimit)} />}
          </FieldGrid>
          {dpaContext.layeringRules && (
            <div style={{ marginTop:14, padding:"10px 14px", background:"#dcfce7", borderRadius:8, fontSize:12, color:"#166534", lineHeight:1.5 }}>
              <strong>Stacking Rules:</strong> {dpaContext.layeringRules}
            </div>
          )}
          {dpaContext.fitReasons?.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Why This Program Fits</div>
              {dpaContext.fitReasons.map((r,i) => <CheckItem key={i} text={r} pass={true} />)}
            </div>
          )}
          {dpaContext.warnings?.length > 0 && (
            <div style={{ marginTop:12, padding:"10px 14px", background:"#fffbeb", borderRadius:8 }}>
              {dpaContext.warnings.map((w,i) => <CheckItem key={i} text={w} pass={false} />)}
            </div>
          )}
        </Card>
      )}

      {/* Borrower Profile */}
      <Card title="Borrower Profile" icon="👤" accent="#2563eb">
        <Row label="Full Name"            value={fmt.text(borrower.name)}       highlight />
        <Row label="Gross Monthly Income" value={fmt.currency(borrower.income)} highlight />
        {ficoRaw ? (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
            <span style={{ fontSize:12, color:"#9ca3af" }}>Credit Score (FICO)</span>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:ficoColor(ficoRaw), background:ficoBg(ficoRaw), border:`1px solid ${ficoBorder(ficoRaw)}`, borderRadius:20, padding:"2px 10px", fontWeight:700 }}>{ficoLabel(ficoRaw)}</span>
              <span style={{ fontSize:15, fontWeight:800, color:ficoColor(ficoRaw) }}>{ficoRaw}</span>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Property & Loan */}
      <Card title="Property & Loan" icon="🏡" accent="#7c3aed">
        <Row label="Property Address" value={fmt.text(property.address)} highlight />
        <div style={{ height:6 }} />
        <FieldGrid>
          <Field label="Property Value" value={fmt.currency(property.value)} />
          <Field label="Loan Amount"    value={fmt.currency(property.loanAmount)} highlight />
          <Field label="LTV"            value={ltvRaw?`${ltvRaw.toFixed(1)}%`:null} highlight />
          <Field label="Loan Type"      value={fmt.text(property.loanType)} />
          <Field label="Loan Product"   value={fmt.text(property.loanProduct)} />
          <Field label="City"           value={fmt.text(property.city)} />
          <Field label="State"          value={fmt.text(property.state)} />
          <Field label="ZIP Code"       value={fmt.text(property.zipCode)} />
        </FieldGrid>
      </Card>

      {/* PITI & DTI */}
      <Card title="PITI Breakdown & DTI" icon="💰" accent="#059669">
        <FieldGrid>
          <Field label="Principal & Interest" value={fmt.currency(piti.principal)} highlight />
          <Field label="Total PITI"           value={fmt.currency(piti.total)}     highlight />
          <Field label="Taxes (Monthly)"      value={fmt.currency(piti.taxes)} />
          <Field label="Insurance (Monthly)"  value={fmt.currency(piti.insurance)} />
          <Field label="HOA (Monthly)"        value={fmt.currency(piti.hoa)} />
          <Field label="MIP / PMI"            value={fmt.currency(piti.mip)} />
          {frontDtiRaw ? (
            <div style={{ padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:3 }}>Front-End DTI</div>
              <span style={{ fontSize:13, fontWeight:700, color:dtiColor(frontDtiRaw), background:dtiBg(frontDtiRaw), border:`1px solid ${dtiBorder(frontDtiRaw)}`, borderRadius:6, padding:"2px 8px", display:"inline-block" }}>
                {frontDtiRaw.toFixed(2)}%
              </span>
            </div>
          ) : <div />}
          {backDtiRaw ? (
            <div style={{ padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:3 }}>Back-End DTI</div>
              <span style={{ fontSize:13, fontWeight:700, color:dtiColor(backDtiRaw), background:dtiBg(backDtiRaw), border:`1px solid ${dtiBorder(backDtiRaw)}`, borderRadius:6, padding:"2px 8px", display:"inline-block" }}>
                {backDtiRaw.toFixed(2)}%
              </span>
            </div>
          ) : <div />}
        </FieldGrid>
      </Card>

      {/* Intelligence Flags */}
      {(intelligence.ausResult || intelligence.dpaEligible || intelligence.craFlag || intelligence.usdaEligible || intelligence.vaEligible) && (
        <Card title="Intelligence Flags" icon="🧠" accent="#d97706">
          <Row label="AUS Result"    value={fmt.text(intelligence.ausResult)} highlight />
          <Row label="DPA Eligible"  value={intelligence.dpaEligible  ?"✅ Yes":"No"} />
          <Row label="CRA Flag"      value={intelligence.craFlag       ?"✅ Yes":"No"} />
          <Row label="USDA Eligible" value={intelligence.usdaEligible  ?"✅ Yes":"No"} />
          <Row label="VA Eligible"   value={intelligence.vaEligible    ?"✅ Yes":"No"} />
        </Card>
      )}

      {/* Loan Officer */}
      <Card title="Loan Officer" icon="📋" accent="#059669">
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px", background:"#f8fafc", borderRadius:10, marginBottom:12 }}>
          <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff", fontWeight:800, flexShrink:0 }}>
            {(lo.name||"L").charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:"#111827" }}>{lo.name||"—"}</div>
            {lo.nmls    && <div style={{ fontSize:12, color:"#6b7280" }}>NMLS #{lo.nmls}</div>}
            {lo.company && <div style={{ fontSize:12, color:"#6b7280" }}>{lo.company}</div>}
          </div>
        </div>
        <Row label="Email"   value={fmt.text(lo.email)} />
        <Row label="Phone"   value={fmt.text(lo.phone)} />
        <Row label="Company" value={fmt.text(lo.company)} />
      </Card>

      {/* Scenario ID */}
      <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#9ca3af" }}>Scenario ID</span>
        <span style={{ fontSize:11, fontFamily:"monospace", color:"#6b7280", background:"#f3f4f6", padding:"3px 8px", borderRadius:5 }}>{scenarioId}</span>
      </div>

      {/* AE Response Panel */}
      <AEResponsePanel
        token={token}
        loName={lo.name}
        borrowerName={borrower.name}
        alreadyResponded={!!ae_response}
        existingResponse={ae_response}
      />

      <div style={{ textAlign:"center", padding:"12px 0 0", fontSize:11, color:"#9ca3af", lineHeight:1.8 }}>
        Secure scenario share · Generated by LoanBeacons™<br />
        <span style={{ color:"#d1d5db" }}>Powered by LoanBeacons LLC</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AESharePage() {
  const { token } = useParams();
  const [state,    setState]    = useState("loading");
  const [data,     setData]     = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    fetch(`https://us-central1-loanbeacon.cloudfunctions.net/getShareByToken?token=${token}`)
      .then(res => res.json())
      .then(payload => {
        if (payload.error) { setErrorMsg(payload.error); setState("error"); }
        else { setData(payload); setState("ready"); }
      })
      .catch(err => { setErrorMsg(err.message || "Failed to load share."); setState("error"); });
  }, [token]);

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#f8f9fb 0%,#eef2f7 100%)", fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <header style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"0 24px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, background:"linear-gradient(135deg,#f59e0b,#d97706)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🏦</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:"#111827", lineHeight:1.1 }}>LoanBeacons™</div>
            <div style={{ fontSize:10, color:"#9ca3af", letterSpacing:"0.06em", textTransform:"uppercase" }}>AE Scenario Share</div>
          </div>
        </div>
        <div style={{ fontSize:11, color:"#9ca3af", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 10px" }}>🔒 Secure share link</div>
      </header>
      <main style={{ maxWidth:760, margin:"0 auto", padding:"28px 20px 80px" }}>
        {state==="loading" && <LoadingState />}
        {state==="error"   && <ErrorState message={errorMsg} />}
        {state==="ready"   && data && <ShareContent data={data} token={token} />}
      </main>
    </div>
  );
}
