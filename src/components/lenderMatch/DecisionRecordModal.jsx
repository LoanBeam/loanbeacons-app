/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/components/lenderMatch/DecisionRecordModal.jsx
 * Version: 1.0.1 — Fixed z-index + maxHeight for CanonicalSequenceBar
 * ============================================================
 */

import React, { useState, useEffect, useRef } from "react";

const T = {
  bg:          "#0d1117",
  bgCard:      "#161b22",
  bgModal:     "#0d1117",
  border:      "#21262d",
  borderLight: "#30363d",
  amber:       "#d97706",
  amberLight:  "#fbbf24",
  amberBg:     "#451a03",
  amberBorder: "#92400e",
  greenLight:  "#3fb950",
  greenBg:     "#0f2913",
  greenBorder: "#1f6527",
  blueLight:   "#58a6ff",
  blueBg:      "#0a1929",
  blueBorder:  "#1d6fa440",
  redLight:    "#f85149",
  redBg:       "#280d0b",
  redBorder:   "#6e1b18",
  textPrimary:   "#e6edf3",
  textSecondary: "#8b949e",
  textMuted:     "#484f58",
  textAmber:     "#fbbf24",
  textGreen:     "#3fb950",
  fontMono:    "'DM Mono', 'Fira Code', monospace",
  fontDisplay: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif",
  fontBody:    "'DM Sans', 'Outfit', system-ui, sans-serif",
  radius:      "8px",
  radiusSm:    "4px",
  radiusLg:    "12px",
};

const OVERLAY_COLORS = {
  LOW:      { color: T.greenLight, bg: T.greenBg, border: T.greenBorder },
  MODERATE: { color: T.amberLight, bg: T.amberBg, border: T.amberBorder },
  HIGH:     { color: T.redLight,   bg: T.redBg,   border: T.redBorder   },
};

const SID = "drm-styles";
if (typeof document !== "undefined" && !document.getElementById(SID)) {
  const el = document.createElement("style");
  el.id = SID;
  el.textContent = `
    @keyframes drm-bg {
      from { opacity:0; }
      to   { opacity:1; }
    }
    @keyframes drm-slide {
      from { opacity:0; transform:translateY(16px) scale(0.98); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .drm-overlay { animation: drm-bg 0.18s ease both; }
    .drm-modal   { animation: drm-slide 0.22s cubic-bezier(0.16,1,0.3,1) both; }
    .drm-copy-btn:hover  { background-color: #1c2128 !important; color: #e6edf3 !important; }
    .drm-save-btn:hover:not(:disabled) { background-color: #fbbf24 !important; }
    .drm-close-btn:hover { color: #e6edf3 !important; }
  `;
  document.head.appendChild(el);
}

function FieldRow({ label, value, valueColor, mono }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px", padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: "11px", fontFamily: T.fontMono, color: T.textMuted, letterSpacing: "0.06em", alignSelf: "start", paddingTop: "1px" }}>{label}</span>
      <span style={{ fontSize: mono ? "12px" : "13px", fontFamily: mono ? T.fontMono : T.fontBody, color: valueColor || T.textPrimary, lineHeight: "1.4", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function ModalSection({ title, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, fontWeight: 500, paddingBottom: "8px", marginBottom: "0px", borderBottom: `1px solid ${T.border}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function fmt$(n) { return n ? `$${Number(n).toLocaleString()}` : "—"; }

function buildScenarioRows(snap) {
  if (!snap) return [];
  return [
    { label: "Transaction Type", value: snap.transactionType || "purchase" },
    { label: "Loan Amount",      value: fmt$(snap.loanAmount),      mono: true },
    { label: "Property Value",   value: fmt$(snap.propertyValue),   mono: true },
    { label: "Credit Score",     value: snap.creditScore?.toString(), mono: true },
    { label: "LTV",              value: snap.ltv  ? `${snap.ltv}%`  : "—", mono: true },
    { label: "DTI",              value: snap.dti  ? `${snap.dti}%`  : "—", mono: true },
    { label: "DSCR",             value: snap.dscr ? snap.dscr.toFixed(2) : null, mono: true },
    { label: "Property Type",    value: snap.propertyType },
    { label: "Occupancy",        value: snap.occupancy },
    { label: "State",            value: snap.state },
    { label: "Income Doc",       value: snap.incomeDocType },
    { label: "Self-Employed",    value: snap.selfEmployed ? "Yes" : "No" },
    { label: "Credit Event",     value: snap.creditEvent !== "none" ? `${snap.creditEvent} (${snap.creditEventMonths} months)` : "None" },
    { label: "Reserves",         value: snap.reservesMonths ? `${snap.reservesMonths} months` : "—" },
    { label: "Total Assets",     value: snap.totalAssets ? fmt$(snap.totalAssets) : null, mono: true },
  ].filter((r) => r.value && r.value !== "—" && r.value !== "null");
}

function buildClipboardText(record, result) {
  const s = record.scenarioSnapshot || {};
  const lines = [
    "LOANBEACONS — DECISION RECORD™",
    `Selected: ${record.profileName || record.selectedLenderId}`,
    `Program:  ${result?.program || "—"}`,
    `Status:   ${record.eligibilityStatus}`,
    `Fit Score: ${record.fitScore} / ${result?.isPlaceholder ? 90 : 100}`,
    `Overlay Risk: ${record.overlayRisk}`,
    `Confidence: ${Math.round((record.confidenceScore ?? 0) * 100)}%`,
    `Data Source: ${record.dataSource}`,
    `Guideline Ref: ${record.guidelineVersionRef}`,
    `Selected At: ${record.selectedAt}`,
    "",
    "SCENARIO",
    `Loan Amount: $${Number(s.loanAmount || 0).toLocaleString()}`,
    `Property Value: $${Number(s.propertyValue || 0).toLocaleString()}`,
    `Credit Score: ${s.creditScore}`,
    `LTV: ${s.ltv}%`,
    `DTI: ${s.dti}%`,
    `Property: ${s.propertyType} / ${s.occupancy}`,
    `State: ${s.state}`,
    `Income Doc: ${s.incomeDocType}`,
    "",
    "ELIGIBILITY FACTORS",
    ...(record.reasonsSnapshot || []).map((r) => `  • ${r}`),
  ];
  return lines.join("\n");
}

export function DecisionRecordModal({ record, result, saved, saving, onSave, onClose }) {
  const [copied, setCopied] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  useEffect(() => { modalRef.current?.focus(); }, []);

  if (!record) return null;

  const isPlaceholder = record.dataSource === "PLACEHOLDER";
  const scoreMax      = isPlaceholder ? 90 : 100;
  const riskCfg       = OVERLAY_COLORS[record.overlayRisk] || OVERLAY_COLORS.LOW;
  const confidencePct = Math.round((record.confidenceScore ?? 0) * 100);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildClipboardText(record, result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const scoreRows = buildScenarioRows(record.scenarioSnapshot);

  return (
    <>
      {/* Backdrop — z-index 9998 clears CanonicalSequenceBar */}
      <div
        className="drm-overlay"
        style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Modal — z-index 9999, maxHeight leaves room for CanonicalSequenceBar */}
      <div
        className="drm-modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Decision Record"
        style={{
          position:        "fixed",
          top:             "8px",
          left:            "50%",
          transform:       "translateX(-50%)",
          zIndex:          9999,
          width:           "min(680px, 96vw)",
          maxHeight:       "calc(100vh - 72px)",
          display:         "flex",
          flexDirection:   "column",
          backgroundColor: T.bgModal,
          border:          `1px solid ${T.borderLight}`,
          borderRadius:    T.radiusLg,
          overflow:        "hidden",
          boxShadow:       "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          outline:         "none",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, backgroundColor: T.bgCard }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "34px", height: "34px", borderRadius: "8px", backgroundColor: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>📌</div>
            <div>
              <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "15px", color: T.textPrimary, letterSpacing: "-0.3px" }}>Decision Record™</div>
              <div style={{ fontSize: "11px", fontFamily: T.fontMono, color: T.textMuted, letterSpacing: "0.04em", marginTop: "2px" }}>
                {record.selectedAt ? new Date(record.selectedAt).toLocaleString() : "Sealed at selection"}
              </div>
            </div>
          </div>
          <button className="drm-close-btn" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: "22px", lineHeight: 1, padding: "4px 6px", transition: "color 0.12s ease" }}>×</button>
        </div>

        {/* Scrollable Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Score strip */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {/* Fit score */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 18px", backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius, flex: "1 1 90px" }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: "28px", lineHeight: 1, color: record.fitScore >= 75 ? T.greenLight : record.fitScore >= 55 ? T.amberLight : T.redLight }}>{record.fitScore}</span>
              <span style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, marginTop: "4px", letterSpacing: "0.08em" }}>FIT SCORE / {scoreMax}</span>
            </div>
            {/* Eligibility */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 18px", backgroundColor: record.eligibilityStatus === "ELIGIBLE" ? T.greenBg : record.eligibilityStatus === "CONDITIONAL" ? T.amberBg : T.redBg, border: `1px solid ${record.eligibilityStatus === "ELIGIBLE" ? T.greenBorder : record.eligibilityStatus === "CONDITIONAL" ? T.amberBorder : T.redBorder}`, borderRadius: T.radius, flex: "1 1 90px" }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: "13px", letterSpacing: "0.07em", color: record.eligibilityStatus === "ELIGIBLE" ? T.greenLight : record.eligibilityStatus === "CONDITIONAL" ? T.amberLight : T.redLight }}>{record.eligibilityStatus}</span>
              <span style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, marginTop: "4px", letterSpacing: "0.06em" }}>ELIGIBILITY</span>
            </div>
            {/* Overlay risk */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 18px", backgroundColor: riskCfg.bg, border: `1px solid ${riskCfg.border}`, borderRadius: T.radius, flex: "1 1 90px" }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: "13px", letterSpacing: "0.07em", color: riskCfg.color }}>{record.overlayRisk}</span>
              <span style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, marginTop: "4px", letterSpacing: "0.06em" }}>OVERLAY RISK</span>
            </div>
            {/* Confidence */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 18px", backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius, flex: "1 1 90px" }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: "28px", lineHeight: 1, color: confidencePct >= 85 ? T.greenLight : confidencePct >= 60 ? T.amberLight : T.redLight }}>{confidencePct}%</span>
              <span style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, marginTop: "4px", letterSpacing: "0.08em" }}>CONFIDENCE</span>
            </div>
          </div>

          {/* Selection */}
          <ModalSection title="Selection">
            <FieldRow label="Lender / Profile" value={record.profileName} />
            <FieldRow label="Program"          value={result?.program} mono />
            <FieldRow label="Tier"             value={record.tier} />
            <FieldRow label="Tier Basis"       value={record.tierBasis} mono />
            <FieldRow label="Data Source"      value={record.dataSource} valueColor={isPlaceholder ? T.amberLight : T.greenLight} mono />
            <FieldRow label="Ruleset Version"  value={`v${record.rulesetVersion ?? 0}`} mono />
            <FieldRow label="Guideline Ref"    value={record.guidelineVersionRef} mono />
          </ModalSection>

          {/* Scenario Snapshot */}
          <ModalSection title="Scenario Snapshot (sealed at selection)">
            {scoreRows.map((row, i) => <FieldRow key={i} label={row.label} value={row.value} mono={row.mono} />)}
          </ModalSection>

          {/* Eligibility Factors */}
          {record.reasonsSnapshot?.length > 0 && (
            <ModalSection title="Eligibility Factors">
              <div style={{ paddingTop: "8px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {record.reasonsSnapshot.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: T.textSecondary, fontFamily: T.fontBody, lineHeight: "1.4", padding: "5px 8px", backgroundColor: r.startsWith("⚠️") ? T.amberBg : T.bgCard, border: `1px solid ${r.startsWith("⚠️") ? T.amberBorder : T.border}`, borderRadius: T.radiusSm }}>
                    <span style={{ flexShrink: 0, marginTop: "1px", color: r.startsWith("⚠️") ? T.amberLight : T.greenLight, fontSize: "11px" }}>{r.startsWith("⚠️") ? "⚠" : "✓"}</span>
                    {r.startsWith("⚠️") ? r.replace("⚠️ ", "") : r}
                  </div>
                ))}
              </div>
            </ModalSection>
          )}

          {/* Narrative */}
          {record.narrativeSnapshot && (
            <ModalSection title="Why This Lender — Narrative (at time of selection)">
              <div style={{ padding: "12px 14px", marginTop: "8px", backgroundColor: T.blueBg, border: `1px solid ${T.blueBorder}`, borderLeft: `3px solid #1d6fa4`, borderRadius: T.radiusSm, fontSize: "13px", color: T.textSecondary, fontFamily: T.fontBody, lineHeight: "1.55" }}>
                {record.narrativeSnapshot}
              </div>
            </ModalSection>
          )}

          {/* Placeholder disclaimer */}
          {isPlaceholder && record.placeholderDisclaimer && (
            <ModalSection title="Placeholder Disclaimer">
              <div style={{ padding: "10px 12px", marginTop: "8px", backgroundColor: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: T.radiusSm, fontSize: "11px", color: T.textAmber, fontFamily: T.fontBody, lineHeight: "1.5", fontStyle: "italic" }}>
                {record.placeholderDisclaimer}
              </div>
            </ModalSection>
          )}

          {/* Save confirmation */}
          {saved && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: T.radius, fontSize: "13px", color: T.textGreen, fontFamily: T.fontBody }}>
              <span style={{ fontSize: "16px" }}>✓</span>
              Decision Record saved to file. It will appear in this loan's Decision Log.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, backgroundColor: T.bgCard, flexWrap: "wrap" }}>
          <button className="drm-copy-btn" onClick={handleCopy} style={{ padding: "8px 16px", backgroundColor: "transparent", color: copied ? T.textGreen : T.textSecondary, border: `1px solid ${copied ? T.greenBorder : T.borderLight}`, borderRadius: T.radius, fontFamily: T.fontBody, fontWeight: 500, fontSize: "13px", cursor: "pointer", transition: "all 0.15s ease", display: "flex", alignItems: "center", gap: "6px" }}>
            {copied ? "✓ Copied" : "⎘ Copy Summary"}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: "8px 16px", backgroundColor: "transparent", color: T.textSecondary, border: `1px solid ${T.borderLight}`, borderRadius: T.radius, fontFamily: T.fontBody, fontSize: "13px", cursor: "pointer" }}>
            Close
          </button>
          {!saved && (
            <button className="drm-save-btn" disabled={saving} onClick={() => onSave(record)} style={{ padding: "8px 20px", backgroundColor: saving ? T.amberBg : T.amber, color: saving ? T.amberLight : T.bg, border: `1px solid ${T.amberBorder}`, borderRadius: T.radius, fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", transition: "background-color 0.15s ease", display: "flex", alignItems: "center", gap: "7px", letterSpacing: "-0.2px" }}>
              {saving ? (
                <><div style={{ width: "12px", height: "12px", border: `2px solid ${T.amberBorder}`, borderTop: `2px solid ${T.amberLight}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Saving…</>
              ) : <>📌 Save Decision Record</>}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default DecisionRecordModal;
