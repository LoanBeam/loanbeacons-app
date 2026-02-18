/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/components/lenderMatch/IneligibleLenderRow.jsx
 * Version: 1.0.0 — Ineligible Lender Row
 * Step 11 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Compact row rendered inside the "N ineligible lenders — click to see why"
 * collapsed section in LenderMatch.jsx. Shows the lender name, program,
 * and the single first-failing gate reason from the engine.
 *
 * Used for BOTH Agency ineligible rows and Non-QM ineligible rows.
 * The isPlaceholder flag adjusts the visual treatment.
 *
 * Props:
 *   result  {object}  — Ineligible lender eval object from LenderMatchEngine
 * ============================================================
 */

import React, { useState } from "react";

const T = {
  bg:          "#0d1117",
  bgCard:      "#161b22",
  border:      "#21262d",
  borderLight: "#30363d",

  amber:       "#d97706",
  amberLight:  "#fbbf24",
  amberBg:     "#451a03",
  amberBorder: "#92400e",

  red:         "#da3633",
  redLight:    "#f85149",
  redBg:       "#280d0b",
  redBorder:   "#6e1b18",

  textPrimary:   "#e6edf3",
  textSecondary: "#8b949e",
  textMuted:     "#484f58",

  fontMono:    "'DM Mono', 'Fira Code', monospace",
  fontDisplay: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif",
  fontBody:    "'DM Sans', 'Outfit', system-ui, sans-serif",
  radius:   "8px",
  radiusSm: "4px",
  transition: "all 0.12s ease",
};

// Gate-to-category mapping — colour-codes the fail reason
const GATE_CATEGORIES = {
  FICO:       { label: "FICO",       color: "#f97316" },
  LTV:        { label: "LTV",        color: "#f85149" },
  DTI:        { label: "DTI",        color: "#a78bfa" },
  BK:         { label: "Seasoning",  color: T.amberLight },
  Foreclosure:{ label: "Seasoning",  color: T.amberLight },
  "Short Sale":{ label: "Seasoning", color: T.amberLight },
  "investment":{ label: "Occupancy", color: "#58a6ff" },
  "does not offer":{ label: "Program", color: T.textSecondary },
  "not licensed":{ label: "State",   color: "#58a6ff" },
  "full documentation":{ label: "Doc Type", color: T.amberLight },
  "DSCR":     { label: "DSCR",       color: "#2dd4bf" },
  "assets":   { label: "Assets",     color: "#a78bfa" },
  "exceeds":  { label: "Amount",     color: T.redLight },
  "manufactured":{ label: "Property", color: T.amberLight },
  "non-warrantable":{ label: "Property", color: T.amberLight },
};

function getGateCategory(failReason) {
  if (!failReason) return null;
  const lower = failReason.toLowerCase();
  for (const [key, val] of Object.entries(GATE_CATEGORIES)) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return null;
}

const SID = "ilr-styles";
if (typeof document !== "undefined" && !document.getElementById(SID)) {
  const el = document.createElement("style");
  el.id = SID;
  el.textContent = `
    .ilr-row { transition: background-color 0.12s ease; }
    .ilr-row:hover { background-color: #1a1a20 !important; }
    .ilr-expand-btn:hover { color: #e6edf3 !important; }
  `;
  document.head.appendChild(el);
}

export function IneligibleLenderRow({ result }) {
  const [showDetail, setShowDetail] = useState(false);

  if (!result) return null;

  const {
    lenderName, shortName, program, failReason,
    isPlaceholder, accentColor, lenderId, profileName,
  } = result;

  const displayName = shortName || lenderName || profileName || lenderId || "Unknown";
  const gateCat     = getGateCategory(failReason);

  // Initials for the micro-avatar
  const initials = displayName
    .split(/[\s/]/).filter(Boolean)
    .slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div
      className="ilr-row"
      style={{
        borderTop:       `1px solid ${T.border}`,
        backgroundColor: T.bgCard,
      }}
    >
      {/* ── Main row ── */}
      <div
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         "12px",
          padding:     "9px 18px 9px 16px",
          cursor:      failReason ? "pointer" : "default",
          userSelect:  "none",
          opacity:     0.7,
        }}
        onClick={() => failReason && setShowDetail((d) => !d)}
      >
        {/* Micro avatar */}
        <div style={{
          width:           "28px",
          height:          "28px",
          borderRadius:    "6px",
          flexShrink:      0,
          backgroundColor: isPlaceholder ? T.amberBg : (accentColor ? `${accentColor}30` : "#1c2128"),
          border:          `1px solid ${isPlaceholder ? T.amberBorder : T.borderLight}`,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          fontSize:        "9px",
          fontFamily:      T.fontDisplay,
          fontWeight:      700,
          color:           isPlaceholder ? T.amberLight : T.textMuted,
          letterSpacing:   "-0.2px",
        }}>
          {isPlaceholder ? "📋" : initials}
        </div>

        {/* Name + program */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize:       "12px",
            fontFamily:     T.fontDisplay,
            fontWeight:     600,
            color:          T.textSecondary,
            marginRight:    "8px",
            whiteSpace:     "nowrap",
            overflow:       "hidden",
            textOverflow:   "ellipsis",
          }}>
            {displayName}
          </span>
          {program && (
            <span style={{
              fontSize:    "10px",
              fontFamily:  T.fontMono,
              color:       T.textMuted,
              letterSpacing: "0.05em",
            }}>
              {program}
              {isPlaceholder && (
                <span style={{ color: T.amber, marginLeft: "5px" }}>Placeholder</span>
              )}
            </span>
          )}
        </div>

        {/* Gate category badge */}
        {gateCat && (
          <div style={{
            flexShrink:      0,
            fontSize:        "10px",
            fontFamily:      T.fontMono,
            fontWeight:      600,
            letterSpacing:   "0.06em",
            padding:         "2px 7px",
            borderRadius:    T.radiusSm,
            backgroundColor: `${gateCat.color}15`,
            border:          `1px solid ${gateCat.color}40`,
            color:           gateCat.color,
          }}>
            {gateCat.label}
          </div>
        )}

        {/* Ineligible pill */}
        <div style={{
          flexShrink:      0,
          fontSize:        "10px",
          fontFamily:      T.fontMono,
          fontWeight:      700,
          letterSpacing:   "0.06em",
          padding:         "2px 7px",
          borderRadius:    T.radiusSm,
          backgroundColor: T.redBg,
          border:          `1px solid ${T.redBorder}`,
          color:           T.redLight,
        }}>
          ✗ INELIGIBLE
        </div>

        {/* Expand chevron */}
        {failReason && (
          <div
            className="ilr-expand-btn"
            style={{
              color:     T.textMuted,
              fontSize:  "11px",
              flexShrink: 0,
              transform: showDetail ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.18s ease, color 0.12s ease",
              width:     "14px",
              textAlign: "center",
            }}
          >
            ▾
          </div>
        )}
      </div>

      {/* ── Fail reason detail ── */}
      {showDetail && failReason && (
        <div style={{
          padding:         "0 18px 10px 58px",  // aligns under name
          borderTop:       `1px dashed ${T.border}`,
          backgroundColor: T.bg,
        }}>
          <div style={{
            display:    "flex",
            alignItems: "flex-start",
            gap:        "8px",
            paddingTop: "9px",
          }}>
            <span style={{ color: T.redLight, flexShrink: 0, fontSize: "11px", marginTop: "1px" }}>✗</span>
            <span style={{
              fontSize:   "12px",
              fontFamily: T.fontBody,
              color:      T.textSecondary,
              lineHeight: "1.5",
            }}>
              {failReason}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default IneligibleLenderRow;
