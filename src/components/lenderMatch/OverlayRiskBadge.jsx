/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/components/lenderMatch/OverlayRiskBadge.jsx
 * Version: 1.0.0 — Overlay Risk Badge
 * Step 8 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Standalone overlay risk display used in the results header.
 * Renders a pill showing LOW / MODERATE / HIGH with a click-to-expand
 * dropdown panel listing all active risk signals and a weight bar.
 *
 * Props:
 *   risk     {object}  — { level, signals, signalCount, totalWeight }
 *   compact  {boolean} — Pill-only, no expand (default: false)
 * ============================================================
 */

import React, { useState, useRef, useEffect } from "react";

const T = {
  bg:          "#0d1117",
  bgCard:      "#161b22",
  border:      "#21262d",

  greenLight:  "#3fb950",
  greenBg:     "#0f2913",
  greenBorder: "#1f6527",

  amberLight:  "#fbbf24",
  amberBg:     "#451a03",
  amberBorder: "#92400e",

  redLight:    "#f85149",
  redBg:       "#280d0b",
  redBorder:   "#6e1b18",

  textSecondary: "#8b949e",
  textMuted:     "#484f58",

  fontMono:  "'DM Mono', 'Fira Code', monospace",
  fontBody:  "'DM Sans', 'Outfit', system-ui, sans-serif",
  radius:    "8px",
  radiusSm:  "4px",
};

const RISK_CONFIG = {
  LOW: {
    icon: "🟢", label: "LOW RISK", shortLabel: "LOW",
    color: T.greenLight, bg: T.greenBg, border: T.greenBorder,
    description: "No significant stacked risk factors. Standard underwriting scrutiny expected.",
  },
  MODERATE: {
    icon: "🟡", label: "MODERATE RISK", shortLabel: "MOD",
    color: T.amberLight, bg: T.amberBg, border: T.amberBorder,
    description: "Multiple risk signals present. Expect additional documentation requests and possible lender overlays.",
  },
  HIGH: {
    icon: "🔴", label: "HIGH RISK", shortLabel: "HIGH",
    color: T.redLight, bg: T.redBg, border: T.redBorder,
    description: "Compounding risk factors detected. Lender scrutiny will be elevated. Prepare thorough documentation and consider risk mitigation strategies before submission.",
  },
};

const SID = "orb-styles";
if (typeof document !== "undefined" && !document.getElementById(SID)) {
  const el = document.createElement("style");
  el.id = SID;
  el.textContent = `
    @keyframes orb-drop {
      from { opacity:0; transform:translateY(-4px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .orb-panel { animation: orb-drop 0.14s ease both; }
    .orb-pill:hover { opacity: 0.82; }
  `;
  document.head.appendChild(el);
}

export function OverlayRiskBadge({ risk, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  if (!risk) return null;

  const cfg        = RISK_CONFIG[risk.level] || RISK_CONFIG.LOW;
  const hasSignals = (risk.signals?.length ?? 0) > 0;
  const clickable  = hasSignals && !compact;

  const Pill = (
    <div
      className="orb-pill"
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: compact ? "3px 9px" : "5px 12px",
        backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
        borderRadius: "20px",
        fontSize: compact ? "11px" : "12px", fontFamily: T.fontMono,
        fontWeight: 600, letterSpacing: "0.05em", color: cfg.color,
        userSelect: "none", cursor: clickable ? "pointer" : "default",
        transition: "opacity 0.12s ease",
      }}
      onClick={() => clickable && setOpen((o) => !o)}
    >
      <span>{cfg.icon}</span>
      <span>Overlay Risk: {compact ? cfg.shortLabel : cfg.label}</span>
      {risk.signalCount > 0 && (
        <span style={{
          backgroundColor: `${cfg.color}20`, border: `1px solid ${cfg.border}`,
          borderRadius: "10px", padding: "0 6px",
          fontSize: "10px", color: cfg.color,
        }}>
          {risk.signalCount}
        </span>
      )}
      {clickable && (
        <span style={{
          fontSize: "10px", color: T.textMuted, marginLeft: "2px",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.18s ease",
          display: "inline-block",
        }}>▾</span>
      )}
    </div>
  );

  if (compact) return Pill;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {Pill}
      {open && (
        <div className="orb-panel" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
          minWidth: "290px", maxWidth: "370px",
          backgroundColor: T.bgCard, border: `1px solid ${cfg.border}`,
          borderRadius: T.radius, overflow: "hidden",
          boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", backgroundColor: cfg.bg,
            borderBottom: `1px solid ${cfg.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "11px", fontFamily: T.fontMono, fontWeight: 700,
              color: cfg.color, letterSpacing: "0.06em" }}>
              {cfg.icon} {cfg.label}
            </span>
            <button onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: T.textMuted, fontSize: "16px", padding: "0 2px", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Description */}
          <div style={{
            padding: "10px 14px", fontSize: "12px", color: T.textSecondary,
            fontFamily: T.fontBody, lineHeight: "1.5",
            borderBottom: `1px solid ${T.border}`,
          }}>
            {cfg.description}
          </div>

          {/* Signals */}
          {hasSignals && (
            <div style={{ padding: "10px 14px" }}>
              <div style={{
                fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
                textTransform: "uppercase", color: T.textMuted, marginBottom: "7px",
              }}>
                Active Risk Signals
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {risk.signals.map((sig, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: "7px",
                    padding: "6px 8px",
                    backgroundColor: `${cfg.color}08`,
                    border: `1px solid ${cfg.border}50`,
                    borderRadius: T.radiusSm,
                    fontSize: "12px", color: cfg.color,
                    fontFamily: T.fontBody, lineHeight: "1.35",
                  }}>
                    <span style={{ flexShrink: 0, marginTop: "1px" }}>›</span>
                    {sig}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weight bar */}
          {(risk.totalWeight ?? 0) > 0 && (
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.border}` }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, marginBottom: "5px",
              }}>
                <span>Risk weight</span>
                <span style={{ color: cfg.color }}>{risk.totalWeight} / 10</span>
              </div>
              <div style={{ height: "4px", backgroundColor: T.border, borderRadius: "2px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, (risk.totalWeight / 10) * 100)}%`,
                  backgroundColor: cfg.color, borderRadius: "2px",
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OverlayRiskBadge;
