/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/components/lenderMatch/LenderScorecardCard.jsx
 * Version: 1.0.0 — Agency Lender Scorecard Card
 * Step 6 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Renders a single Agency lender result card.
 *
 * States:
 *   collapsed  — default: logo, name, program, fit score, eligibility, overlay risk
 *   expanded   — adds: score breakdown bars, narrative, pass reasons, notes,
 *                strengths/weaknesses, "Select This Lender" CTA
 *   selected   — amber left border, amber glow, "Selected" state on CTA
 *
 * Props:
 *   result          {object}   — Agency lender eval from LenderMatchEngine
 *   onSelectLender  {function} — Called with result when LO selects this lender
 *   isSelected      {boolean}
 *   animationDelay  {string}   — Optional CSS animation delay (e.g. "80ms")
 *
 * Design direction: Precision instrument — Bloomberg terminal density
 * meets editorial clarity. Score breakdown as a segmented bar diagram.
 * Each data element has intentional visual hierarchy. Never decorative
 * for its own sake — every pixel serves the LO's decision.
 * ============================================================
 */

import React, { useState } from "react";

// ─── Design Tokens (matches LenderMatch.jsx palette) ─────────────────────────
const T = {
  bg:           "#0d1117",
  bgCard:       "#161b22",
  bgCardHover:  "#1c2128",
  bgSelected:   "#120d00",
  border:       "#21262d",
  borderLight:  "#30363d",
  borderAmber:  "#92400e",
  borderBlue:   "#1d6fa4",

  amber:        "#d97706",
  amberLight:   "#fbbf24",
  amberBg:      "#451a03",
  amberBorder:  "#92400e",
  amberGlow:    "rgba(217, 119, 6, 0.12)",

  blue:         "#1d6fa4",
  blueLight:    "#58a6ff",
  blueBg:       "#0a1929",

  green:        "#238636",
  greenLight:   "#3fb950",
  greenBg:      "#0f2913",
  greenBorder:  "#1f6527",

  red:          "#da3633",
  redLight:     "#f85149",
  redBg:        "#280d0b",
  redBorder:    "#6e1b18",

  textPrimary:   "#e6edf3",
  textSecondary: "#8b949e",
  textMuted:     "#484f58",
  textAmber:     "#fbbf24",
  textGreen:     "#3fb950",
  textBlue:      "#58a6ff",

  fontMono:    "'DM Mono', 'Fira Code', monospace",
  fontDisplay: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif",
  fontBody:    "'DM Sans', 'Outfit', system-ui, sans-serif",

  radius:   "8px",
  radiusSm: "4px",
  radiusLg: "12px",

  transition: "all 0.15s ease",
};

// ─── Score Breakdown Config ───────────────────────────────────────────────────
// Maps breakdown keys → display labels + colors + max values
const BREAKDOWN_SEGMENTS = [
  { key: "ficoScore",            label: "FICO Cushion",    max: 25,  color: "#58a6ff" },
  { key: "ltvScore",             label: "LTV Cushion",     max: 20,  color: "#3fb950" },
  { key: "dtiScore",             label: "DTI Cushion",     max: 20,  color: "#a78bfa" },
  { key: "programStrengthScore", label: "Program Strength",max: 20,  color: "#f97316" },
  { key: "priorityScore",        label: "Priority Weight", max: 15,  color: "#d97706" },
];

// ─── Overlay Risk Styles ──────────────────────────────────────────────────────
const RISK_STYLE = {
  LOW:      { color: "#3fb950", bg: "#0f2913", border: "#1f6527", icon: "🟢", label: "LOW" },
  MODERATE: { color: "#fbbf24", bg: "#451a03", border: "#92400e", icon: "🟡", label: "MOD" },
  HIGH:     { color: "#f85149", bg: "#280d0b", border: "#6e1b18", icon: "🔴", label: "HIGH" },
};

// ─── Program Accent Colors ────────────────────────────────────────────────────
const PROGRAM_COLOR = {
  Conventional: "#58a6ff",
  FHA:          "#f97316",
  VA:           "#a78bfa",
};

// ─── Tier Display Badges ──────────────────────────────────────────────────────
const TIER_STYLE = {
  "Premier Platform":   { color: "#fbbf24", bg: "#2a1a00", border: "#92400e" },
  "Solid Platform":     { color: "#58a6ff", bg: "#0a1929", border: "#1d6fa4" },
  "Good Platform":      { color: "#3fb950", bg: "#0f2913", border: "#1f6527" },
  "Standard Platform":  { color: "#8b949e", bg: "#161b22", border: "#30363d" },
  "Specialty Platform": { color: "#a78bfa", bg: "#130d1f", border: "#3d2b6b" },
};

// ─── Inject card-level styles ─────────────────────────────────────────────────
const STYLE_ID = "lsc-card-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes lsc-fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes lsc-scoreReveal {
      from { width: 0; }
    }
    .lsc-card { animation: lsc-fadeIn 0.22s ease both; }
    .lsc-card:hover .lsc-hover-reveal { opacity: 1 !important; }
    .lsc-expand-btn:hover { background-color: #1c2128 !important; color: #e6edf3 !important; }
    .lsc-select-btn:hover:not(.lsc-selected) {
      background-color: #d97706 !important;
      color: #0d1117 !important;
    }
    .lsc-score-bar { animation: lsc-scoreReveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pct = (val, max) => Math.min(100, Math.max(0, Math.round((val / max) * 100)));
const scoreColor = (score) =>
  score >= 75 ? T.greenLight :
  score >= 55 ? T.amberLight :
  T.redLight;


// ─── Score Arc (SVG donut-style score display) ────────────────────────────────
function ScoreArc({ score, maxScore = 100, size = 56 }) {
  const r        = (size / 2) - 5;
  const circ     = 2 * Math.PI * r;
  const filled   = (score / maxScore) * circ;
  const color    = scoreColor(score);
  const cx       = size / 2;
  const cy       = size / 2;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={T.border}
        strokeWidth="3.5"
      />
      {/* Fill — starts from top (rotate -90deg) */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      />
      {/* Score text */}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontFamily={T.fontMono}
        fontWeight="700"
        fontSize={score >= 100 ? "13" : "15"}
      >
        {score}
      </text>
    </svg>
  );
}

// ─── Score Breakdown Bar ──────────────────────────────────────────────────────
function ScoreBreakdownBar({ breakdown, maxPossible = 100 }) {
  if (!breakdown) return null;

  const segments = BREAKDOWN_SEGMENTS.filter((seg) => breakdown[seg.key] !== undefined);
  const total    = segments.reduce((sum, seg) => sum + (breakdown[seg.key] || 0), 0);

  return (
    <div style={{ marginTop: "14px" }}>
      {/* Stacked segment bar */}
      <div style={{
        display: "flex",
        height: "8px",
        borderRadius: "4px",
        overflow: "hidden",
        backgroundColor: T.border,
        gap: "1px",
        marginBottom: "10px",
      }}>
        {segments.map((seg) => {
          const val  = breakdown[seg.key] || 0;
          const frac = (val / maxPossible) * 100;
          return frac > 0 ? (
            <div
              key={seg.key}
              className="lsc-score-bar"
              title={`${seg.label}: ${val}/${seg.max}`}
              style={{
                width:           `${frac}%`,
                backgroundColor: seg.color,
                height:          "100%",
                animationDelay:  `${segments.indexOf(seg) * 80}ms`,
              }}
            />
          ) : null;
        })}
      </div>

      {/* Legend rows */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "6px",
      }}>
        {segments.map((seg) => {
          const val    = breakdown[seg.key] || 0;
          const filled = pct(val, seg.max);
          return (
            <div key={seg.key} style={{
              display: "flex", alignItems: "center", gap: "7px",
            }}>
              <div style={{
                width: "8px", height: "8px", borderRadius: "2px",
                backgroundColor: seg.color, flexShrink: 0,
              }} />
              <div style={{
                flex: 1,
                fontSize: "11px", fontFamily: T.fontMono,
                color: T.textSecondary,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {seg.label}
              </div>
              <div style={{
                fontSize: "11px", fontFamily: T.fontMono,
                fontWeight: 600,
                color: val > 0 ? seg.color : T.textMuted,
                flexShrink: 0,
              }}>
                {val}<span style={{ color: T.textMuted, fontWeight: 400 }}>/{seg.max}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cushion details if present */}
      {(breakdown.ficoCushion !== undefined || breakdown.ltvCushion !== undefined || breakdown.dtiCushion !== undefined) && (
        <div style={{
          marginTop: "10px",
          padding: "8px 10px",
          backgroundColor: T.bg,
          border: `1px solid ${T.border}`,
          borderRadius: T.radiusSm,
          display: "flex", gap: "16px", flexWrap: "wrap",
        }}>
          {breakdown.ficoCushion !== undefined && (
            <CushionChip
              label="FICO cushion"
              value={`+${breakdown.ficoCushion} pts`}
              color={breakdown.ficoCushion >= 80 ? T.textGreen : breakdown.ficoCushion >= 30 ? T.textAmber : T.textMuted}
            />
          )}
          {breakdown.ltvCushion !== undefined && (
            <CushionChip
              label="LTV cushion"
              value={`${breakdown.ltvCushion.toFixed(1)}%`}
              color={breakdown.ltvCushion >= 10 ? T.textGreen : breakdown.ltvCushion >= 4 ? T.textAmber : T.textMuted}
            />
          )}
          {breakdown.dtiCushion !== undefined && (
            <CushionChip
              label="DTI cushion"
              value={`${breakdown.dtiCushion.toFixed(1)}%`}
              color={breakdown.dtiCushion >= 10 ? T.textGreen : breakdown.dtiCushion >= 4 ? T.textAmber : T.textMuted}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CushionChip({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <span style={{ fontSize: "10px", color: T.textMuted, fontFamily: T.fontMono }}>{label}</span>
      <span style={{ fontSize: "12px", fontFamily: T.fontMono, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}


// ─── Pass Reasons List ────────────────────────────────────────────────────────
function PassReasonsList({ reasons }) {
  if (!reasons?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {reasons.map((r, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: "7px",
          fontSize: "12px", color: T.textSecondary, lineHeight: "1.4",
        }}>
          <span style={{ color: T.greenLight, flexShrink: 0, fontSize: "10px", marginTop: "2px" }}>✓</span>
          {r}
        </div>
      ))}
    </div>
  );
}


// ─── Strengths / Weaknesses ───────────────────────────────────────────────────
function StrengthsWeaknesses({ strengths, weaknesses }) {
  if (!strengths?.length && !weaknesses?.length) return null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: strengths?.length && weaknesses?.length ? "1fr 1fr" : "1fr",
      gap: "12px",
    }}>
      {strengths?.length > 0 && (
        <div>
          <div style={{
            fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
            color: T.textGreen, textTransform: "uppercase", marginBottom: "6px",
          }}>
            Strengths
          </div>
          {strengths.map((s, i) => (
            <div key={i} style={{
              display: "flex", gap: "6px", fontSize: "12px",
              color: T.textSecondary, marginBottom: "4px", lineHeight: "1.4",
            }}>
              <span style={{ color: T.greenLight, flexShrink: 0 }}>+</span>
              {s}
            </div>
          ))}
        </div>
      )}
      {weaknesses?.length > 0 && (
        <div>
          <div style={{
            fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
            color: T.textMuted, textTransform: "uppercase", marginBottom: "6px",
          }}>
            Considerations
          </div>
          {weaknesses.map((w, i) => (
            <div key={i} style={{
              display: "flex", gap: "6px", fontSize: "12px",
              color: T.textMuted, marginBottom: "4px", lineHeight: "1.4",
            }}>
              <span style={{ color: T.textMuted, flexShrink: 0 }}>—</span>
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Program Notes ────────────────────────────────────────────────────────────
function ProgramNotes({ notes }) {
  if (!notes?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {notes.map((note, i) => (
        <div key={i} style={{
          display: "flex", gap: "7px", alignItems: "flex-start",
          padding: "7px 10px",
          backgroundColor: T.bg,
          border: `1px solid ${T.border}`,
          borderLeft: `2px solid ${T.amber}`,
          borderRadius: T.radiusSm,
          fontSize: "12px",
          color: T.textSecondary,
          lineHeight: "1.4",
        }}>
          <span style={{ fontSize: "11px", flexShrink: 0 }}>ℹ</span>
          {note}
        </div>
      ))}
    </div>
  );
}


// ─── Narrative Block ──────────────────────────────────────────────────────────
function NarrativeBlock({ narrative }) {
  if (!narrative) return null;
  return (
    <div style={{
      padding: "12px 14px",
      backgroundColor: "#0d1620",
      border: `1px solid ${T.borderBlue}40`,
      borderLeft: `3px solid ${T.blue}`,
      borderRadius: T.radiusSm,
    }}>
      <div style={{
        fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
        color: T.textBlue, textTransform: "uppercase", marginBottom: "6px",
      }}>
        Why This Lender
      </div>
      <div style={{
        fontSize: "13px", color: T.textSecondary,
        lineHeight: "1.55", fontFamily: T.fontBody,
      }}>
        {narrative}
      </div>
    </div>
  );
}


// ─── Guideline Ref Badge ──────────────────────────────────────────────────────
function GuidelineRefBadge({ ref: gRef }) {
  if (!gRef) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 7px",
      backgroundColor: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: "3px",
      fontSize: "10px",
      fontFamily: T.fontMono,
      color: T.textMuted,
      letterSpacing: "0.04em",
    }}>
      <span style={{ color: T.textGreen }}>✓</span>
      {gRef}
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────
export function LenderScorecardCard({ result, onSelectLender, isSelected, animationDelay }) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  const {
    lenderName, shortName, program, fitScore, breakdown,
    eligible, eligibilityStatus, passReasons, failReason,
    overlayRisk, overlaySignals, tier, tierBasis,
    strengths, weaknesses, tierNotes, narrative,
    notes, guidelineVersionRef, accentColor,
  } = result;

  const risk        = RISK_STYLE[overlayRisk] || RISK_STYLE.LOW;
  const progColor   = PROGRAM_COLOR[program] || T.blueLight;
  const tierStyle   = TIER_STYLE[tier] || TIER_STYLE["Solid Platform"];
  const fScore      = fitScore || 0;
  const scoreClr    = scoreColor(fScore);

  // Initials for avatar
  const initials = (shortName || lenderName || "?")
    .split(/[\s/]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // Card border / glow based on state
  const cardBorderLeft = isSelected
    ? `3px solid ${T.amber}`
    : eligible
      ? `3px solid ${accentColor || progColor}`
      : `3px solid ${T.borderLight}`;

  const cardBg = isSelected
    ? T.bgSelected
    : expanded
      ? T.bgCardHover
      : T.bgCard;

  const cardBoxShadow = isSelected
    ? `0 0 0 1px ${T.amberBorder}, inset 0 0 40px ${T.amberGlow}`
    : "none";

  return (
    <div
      className="lsc-card"
      style={{
        backgroundColor: cardBg,
        borderLeft: cardBorderLeft,
        boxShadow: cardBoxShadow,
        transition: T.transition,
        animationDelay: animationDelay || "0ms",
        position: "relative",
        borderTop: `1px solid ${T.border}`,
      }}
    >
      {/* ── COLLAPSED ROW (always visible) ────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 18px 14px 16px",
          gap: "14px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((e) => !e)}
      >

        {/* Avatar */}
        <div style={{
          width: "40px", height: "40px", borderRadius: "9px",
          backgroundColor: accentColor || T.blue,
          background: `linear-gradient(135deg, ${accentColor || T.blue}cc, ${accentColor || T.blue}66)`,
          border: `1px solid ${accentColor || T.blue}60`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "12px",
          color: "#fff", letterSpacing: "-0.3px",
          boxShadow: `0 0 12px ${accentColor || T.blue}30`,
        }}>
          {initials}
        </div>

        {/* Name + Program */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "14px",
              color: T.textPrimary, letterSpacing: "-0.2px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: "240px",
            }}>
              {lenderName}
            </span>

            {/* Program badge */}
            <span style={{
              fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.07em",
              fontWeight: 600, padding: "2px 7px", borderRadius: "3px",
              backgroundColor: `${progColor}18`,
              border: `1px solid ${progColor}40`,
              color: progColor,
              flexShrink: 0,
            }}>
              {program}
            </span>

            {/* Tier badge */}
            {tier && (
              <span style={{
                fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.05em",
                padding: "2px 6px", borderRadius: "3px",
                backgroundColor: tierStyle.bg,
                border: `1px solid ${tierStyle.border}`,
                color: tierStyle.color,
                flexShrink: 0,
              }}>
                {tier}
              </span>
            )}
          </div>

          {/* Tier notes — single line */}
          {tierNotes && !expanded && (
            <div style={{
              fontSize: "11px", color: T.textMuted, fontFamily: T.fontBody,
              marginTop: "3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: "400px",
            }}>
              {tierNotes}
            </div>
          )}
        </div>

        {/* Metrics cluster */}
        <div style={{
          display: "flex", alignItems: "center",
          gap: "14px", flexShrink: 0, marginLeft: "auto",
        }}>

          {/* Overlay risk chip */}
          <div style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "3px 8px",
            backgroundColor: risk.bg,
            border: `1px solid ${risk.border}`,
            borderRadius: "4px",
            fontSize: "10px", fontFamily: T.fontMono,
            fontWeight: 600, letterSpacing: "0.05em",
            color: risk.color,
          }}
            title={`Overlay Risk: ${overlayRisk}${overlaySignals?.length ? ` (${overlaySignals.join(", ")})` : ""}`}
          >
            {risk.icon} {risk.label}
          </div>

          {/* Score Arc */}
          <div style={{ position: "relative" }}>
            <ScoreArc score={fScore} maxScore={100} size={52} />
            <div style={{
              position: "absolute", bottom: "-2px", left: "50%",
              transform: "translateX(-50%)",
              fontSize: "8px", fontFamily: T.fontMono, letterSpacing: "0.06em",
              color: T.textMuted, whiteSpace: "nowrap",
            }}>
              FIT
            </div>
          </div>

          {/* Eligibility pill */}
          <div style={{
            fontSize: "10px", fontFamily: T.fontMono,
            letterSpacing: "0.07em", fontWeight: 700,
            padding: "4px 10px", borderRadius: "4px",
            backgroundColor: T.greenBg,
            border: `1px solid ${T.greenBorder}`,
            color: T.greenLight,
          }}>
            ELIGIBLE
          </div>

          {/* Expand chevron */}
          <div style={{
            color: T.textMuted, fontSize: "12px",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            width: "16px", textAlign: "center", flexShrink: 0,
          }}>
            ▾
          </div>
        </div>
      </div>{/* /collapsed row */}


      {/* ── EXPANDED PANEL ────────────────────────────────────────────── */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: "18px 20px 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          animation: "lsc-fadeIn 0.18s ease both",
        }}>

          {/* Score breakdown */}
          <div>
            <SectionHeader
              label="Score Breakdown"
              rightNode={
                <span style={{
                  fontFamily: T.fontMono, fontWeight: 700, fontSize: "18px",
                  color: scoreClr,
                }}>
                  {fScore}
                  <span style={{ fontSize: "11px", color: T.textMuted, fontWeight: 400 }}>
                    {" "}/100
                  </span>
                </span>
              }
            />
            <ScoreBreakdownBar breakdown={breakdown} maxPossible={100} />
          </div>

          {/* Narrative */}
          {narrative && (
            <NarrativeBlock narrative={narrative} />
          )}

          {/* Pass reasons */}
          {passReasons?.length > 0 && (
            <div>
              <SectionHeader label="Eligibility Factors" />
              <PassReasonsList reasons={passReasons} />
            </div>
          )}

          {/* Two-column: Strengths + Notes */}
          <div style={{
            display: "grid",
            gridTemplateColumns: notes?.length ? "1fr 1fr" : "1fr",
            gap: "18px",
          }}>
            {/* Strengths / Weaknesses */}
            {(strengths?.length > 0 || weaknesses?.length > 0) && (
              <div>
                <SectionHeader label="Lender Profile" />
                <StrengthsWeaknesses strengths={strengths} weaknesses={weaknesses} />
              </div>
            )}

            {/* Program notes */}
            {notes?.length > 0 && (
              <div>
                <SectionHeader label="Program Notes" />
                <ProgramNotes notes={notes} />
              </div>
            )}
          </div>

          {/* Overlay risk signals (if non-empty) */}
          {overlaySignals?.length > 0 && (
            <div>
              <SectionHeader label="Risk Signals" />
              <OverlaySignalsList signals={overlaySignals} level={overlayRisk} />
            </div>
          )}

          {/* Footer: guideline ref + Select CTA */}
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap", gap: "12px",
            paddingTop: "14px",
            borderTop: `1px solid ${T.border}`,
          }}>
            <GuidelineRefBadge ref={guidelineVersionRef} />

            {/* Select CTA */}
            <button
              className={`lsc-select-btn${isSelected ? " lsc-selected" : ""}`}
              style={{
                padding: "9px 20px",
                backgroundColor: isSelected ? T.amberBg : "transparent",
                color: isSelected ? T.amberLight : T.textSecondary,
                border: `1px solid ${isSelected ? T.amberBorder : T.borderLight}`,
                borderRadius: T.radius,
                fontFamily: T.fontDisplay,
                fontWeight: 600, fontSize: "13px",
                cursor: isSelected ? "default" : "pointer",
                transition: T.transition,
                display: "flex", alignItems: "center", gap: "7px",
                letterSpacing: "-0.2px",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSelected) onSelectLender(result);
              }}
            >
              {isSelected ? (
                <><span style={{ color: T.amberLight }}>★</span> Selected — View Decision Record</>
              ) : (
                <><span>◎</span> Select This Lender</>
              )}
            </button>
          </div>

        </div>
      )}{/* /expanded */}

    </div>
  );
}


// ─── Section Header (shared within card) ─────────────────────────────────────
function SectionHeader({ label, rightNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px",
    }}>
      <span style={{
        fontSize: "10px", fontFamily: T.fontMono,
        letterSpacing: "0.1em", textTransform: "uppercase",
        color: T.textMuted, fontWeight: 500,
      }}>
        {label}
      </span>
      {rightNode && rightNode}
    </div>
  );
}


// ─── Overlay Signal List ──────────────────────────────────────────────────────
function OverlaySignalsList({ signals, level }) {
  const risk = RISK_STYLE[level] || RISK_STYLE.MODERATE;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {signals.map((s, i) => (
        <span key={i} style={{
          fontSize: "11px", fontFamily: T.fontMono,
          padding: "3px 8px",
          backgroundColor: risk.bg,
          border: `1px solid ${risk.border}`,
          borderRadius: "3px",
          color: risk.color,
        }}>
          {s}
        </span>
      ))}
    </div>
  );
}

export default LenderScorecardCard;
