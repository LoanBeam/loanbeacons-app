/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/components/lenderMatch/AlternativeLenderCard.jsx
 * Version: 1.0.0 — Alternative Path (Non-QM) Lender Card
 * Step 7 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Renders a single Non-QM lender result card in the Alternative Path section.
 * Shares structural DNA with LenderScorecardCard but diverges in:
 *
 *   1. THREE ELIGIBILITY STATES — not just Eligible/Ineligible:
 *        ELIGIBLE (Profile-Based Estimate) — placeholder met 7 criteria
 *        CONDITIONAL — placeholder default: not enough certainty
 *        INELIGIBLE   — hard gate failed
 *
 *   2. PLACEHOLDER GOVERNANCE (PLACEHOLDER_GOVERNANCE.md Section 7):
 *        - Non-dismissible amber badge on every placeholder card
 *        - "📋 Placeholder Profile" data source badge (amber)
 *        - "✅ Verified Lender Data" badge (green) for real lenders
 *        - Disclaimer text in footer
 *        - 90-point cap visible on score arc
 *
 *   3. PROGRAM-SPECIFIC QUALIFYING INCOME PANELS:
 *        DSCR        — shows DSCR ratio, min required, cashflow indicator
 *        AssetDepletion — shows total assets, depletion method, monthly income
 *        BankStatement  — shows expense factor, qualifying deposit summary
 *
 *   4. CONDITIONAL FLAG DISPLAY:
 *        Flags like SHORT_TERM_RENTAL_NOT_ACCEPTED surface as
 *        dismissible advisory chips in the expanded panel.
 *
 * Props:
 *   result          {object}   — Non-QM lender eval from LenderMatchEngine
 *   onSelectLender  {function} — Called with result when LO selects
 *   isSelected      {boolean}
 *   animationDelay  {string}   — Optional CSS delay
 * ============================================================
 */

import React, { useState } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg:           "#0d1117",
  bgCard:       "#161b22",
  bgCardHover:  "#1c2128",
  bgSelected:   "#120d00",
  bgPlaceholder:"#0f0a00",
  border:       "#21262d",
  borderLight:  "#30363d",
  borderAmber:  "#92400e",
  borderGreen:  "#1f6527",

  amber:        "#d97706",
  amberLight:   "#fbbf24",
  amberBg:      "#451a03",
  amberBorder:  "#92400e",
  amberGlow:    "rgba(217, 119, 6, 0.10)",

  teal:         "#0d9488",
  tealLight:    "#2dd4bf",
  tealBg:       "#022c22",
  tealBorder:   "#065f46",

  green:        "#238636",
  greenLight:   "#3fb950",
  greenBg:      "#0f2913",
  greenBorder:  "#1f6527",

  blue:         "#1d6fa4",
  blueLight:    "#58a6ff",
  blueBg:       "#0a1929",
  blueBorder:   "#1d6fa440",

  violet:       "#7c3aed",
  violetLight:  "#a78bfa",
  violetBg:     "#130d1f",
  violetBorder: "#3d2b6b",

  red:          "#da3633",
  redLight:     "#f85149",
  redBg:        "#280d0b",
  redBorder:    "#6e1b18",

  orange:       "#c2410c",
  orangeLight:  "#fb923c",
  orangeBg:     "#2c1007",
  orangeBorder: "#7c2d12",

  textPrimary:   "#e6edf3",
  textSecondary: "#8b949e",
  textMuted:     "#484f58",
  textAmber:     "#fbbf24",
  textGreen:     "#3fb950",
  textBlue:      "#58a6ff",
  textTeal:      "#2dd4bf",

  fontMono:    "'DM Mono', 'Fira Code', monospace",
  fontDisplay: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif",
  fontBody:    "'DM Sans', 'Outfit', system-ui, sans-serif",

  radius:   "8px",
  radiusSm: "4px",
  radiusLg: "12px",
  transition: "all 0.15s ease",
};

// ─── Eligibility Status Config ────────────────────────────────────────────────
const STATUS_CONFIG = {
  ELIGIBLE: {
    color:  T.greenLight,
    bg:     T.greenBg,
    border: T.greenBorder,
    icon:   "✅",
    label:  "ELIGIBLE",
  },
  "ELIGIBLE-PLACEHOLDER": {
    color:  T.amberLight,
    bg:     T.amberBg,
    border: T.amberBorder,
    icon:   "✳️",
    label:  "ELIGIBLE*",
    note:   "Profile-Based Estimate",
  },
  CONDITIONAL: {
    color:  T.amberLight,
    bg:     T.amberBg,
    border: T.amberBorder,
    icon:   "⚠️",
    label:  "CONDITIONAL",
  },
  INELIGIBLE: {
    color:  T.redLight,
    bg:     T.redBg,
    border: T.redBorder,
    icon:   "✗",
    label:  "INELIGIBLE",
  },
};

// ─── Program Meta ─────────────────────────────────────────────────────────────
const PROGRAM_META = {
  BankStatement12:  { label: "Bank Statement 12mo", color: T.orangeLight, bg: T.orangeBg, border: T.orangeBorder, icon: "🏦" },
  BankStatement24:  { label: "Bank Statement 24mo", color: T.orangeLight, bg: T.orangeBg, border: T.orangeBorder, icon: "🏦" },
  DSCR:             { label: "DSCR",                color: T.tealLight,   bg: T.tealBg,   border: T.tealBorder,   icon: "📊" },
  AssetDepletion:   { label: "Asset Depletion",     color: T.violetLight, bg: T.violetBg, border: T.violetBorder, icon: "💎" },
  NinetyNineOnly:   { label: "1099",                color: T.blueLight,   bg: T.blueBg,   border: T.blueBorder,   icon: "📋" },
  NoDoc:            { label: "No-Doc",              color: T.textSecondary, bg: T.bgCard, border: T.borderLight,  icon: "📄" },
};

// ─── Overlay Risk ─────────────────────────────────────────────────────────────
const RISK_STYLE = {
  LOW:      { color: T.greenLight, bg: T.greenBg, border: T.greenBorder, icon: "🟢", label: "LOW" },
  MODERATE: { color: T.amberLight, bg: T.amberBg, border: T.amberBorder, icon: "🟡", label: "MOD" },
  HIGH:     { color: T.redLight,   bg: T.redBg,   border: T.redBorder,   icon: "🔴", label: "HIGH" },
};

// ─── Non-QM Score Breakdown Config ───────────────────────────────────────────
// Different weights than Agency — reflect Non-QM scoring structure
const NONQM_BREAKDOWN_SEGMENTS = [
  { key: "programMatchScore",    label: "Program Match",     max: 30,  color: T.tealLight   },
  { key: "ficoScore",            label: "FICO Cushion",      max: 20,  color: T.blueLight   },
  { key: "ltvScore",             label: "LTV Cushion",       max: 25,  color: T.greenLight  },
  { key: "profileStrengthScore", label: "Profile Strength",  max: 10,  color: T.violetLight },
  { key: "priorityScore",        label: "Priority Weight",   max: 5,   color: T.amber       },
  { key: "dscrBonus",            label: "DSCR Cushion Bonus",max: 3,   color: T.tealLight   },
  { key: "assetBonus",           label: "Asset Ratio Bonus", max: 3,   color: T.violetLight },
];

// ─── Style Injection ──────────────────────────────────────────────────────────
const STYLE_ID = "alc-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes alc-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes alc-barGrow {
      from { width: 0; }
    }
    .alc-card { animation: alc-in 0.22s ease both; }
    .alc-select-btn:hover:not(.alc-selected) {
      background-color: ${T.amber} !important;
      color: ${T.bg} !important;
      border-color: ${T.amber} !important;
    }
    .alc-bar-fill { animation: alc-barGrow 0.5s cubic-bezier(0.16,1,0.3,1) both; }
    .alc-flag-chip { cursor: default; }
    .alc-flag-chip:hover { opacity: 0.8; }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n) => n ? `$${Number(n).toLocaleString()}` : "—";
const fmtPct = (n) => n != null ? `${n}%` : "—";
const scoreColor = (s) => s >= 70 ? T.greenLight : s >= 50 ? T.amberLight : T.redLight;
const pct = (v, m) => Math.min(100, Math.max(0, Math.round((v / m) * 100)));

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHead({ label, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: "8px",
    }}>
      <span style={{
        fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.1em",
        textTransform: "uppercase", color: T.textMuted, fontWeight: 500,
      }}>
        {label}
      </span>
      {right}
    </div>
  );
}

// ── Score Arc ─────────────────────────────────────────────────────────────────
function ScoreArc({ score, maxPossible = 100, isPlaceholder }) {
  const size = 52, r = 21, circ = 2 * Math.PI * r;
  const fill = (score / maxPossible) * circ;
  const cx = 26, cy = 26;
  const color = scoreColor(score);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth="3" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ - fill}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.55s cubic-bezier(0.16,1,0.3,1)" }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontFamily={T.fontMono} fontWeight="700"
          fontSize={score >= 100 ? "12" : "14"}>
          {score}
        </text>
      </svg>
      {/* 90-pt cap indicator for placeholders */}
      {isPlaceholder && (
        <div style={{
          position: "absolute", top: "-4px", right: "-4px",
          width: "14px", height: "14px", borderRadius: "50%",
          backgroundColor: T.amberBg, border: `1px solid ${T.amberBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "8px",
        }} title="Placeholder cap: max 90 pts">
          90
        </div>
      )}
      <div style={{
        position: "absolute", bottom: "-2px", left: "50%",
        transform: "translateX(-50%)",
        fontSize: "8px", fontFamily: T.fontMono, color: T.textMuted,
        letterSpacing: "0.05em", whiteSpace: "nowrap",
      }}>
        FIT
      </div>
    </div>
  );
}

// ── Placeholder Data Source Badge ─────────────────────────────────────────────
function DataSourceBadge({ isPlaceholder }) {
  return isPlaceholder ? (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 8px",
      backgroundColor: T.amberBg,
      border: `1px solid ${T.amberBorder}`,
      borderRadius: "3px",
      fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.05em",
      color: T.textAmber, fontWeight: 600,
    }}>
      📋 Placeholder Profile
    </div>
  ) : (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 8px",
      backgroundColor: T.greenBg,
      border: `1px solid ${T.greenBorder}`,
      borderRadius: "3px",
      fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.05em",
      color: T.textGreen, fontWeight: 600,
    }}>
      ✅ Verified Lender Data
    </div>
  );
}

// ── Placeholder Inline Banner (card-level, non-dismissible) ───────────────────
function PlaceholderCardBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "10px",
      padding: "10px 16px",
      backgroundColor: "#1a0e00",
      borderTop: `1px solid ${T.amberBorder}`,
      borderLeft: `3px solid ${T.amber}`,
    }}>
      <span style={{ fontSize: "13px", flexShrink: 0 }}>⚠️</span>
      <span style={{
        fontSize: "11px", color: T.textAmber,
        fontFamily: T.fontBody, lineHeight: "1.45",
      }}>
        <strong style={{ color: T.amberLight }}>Generic profile — not a specific lender. </strong>
        Guidelines are estimated market baselines. Confirm all terms directly before quoting.
      </span>
    </div>
  );
}

// ── DSCR Qualifying Income Panel ──────────────────────────────────────────────
function DSCRPanel({ result }) {
  const { breakdown } = result;
  if (!breakdown) return null;

  const dscr     = result.dscr ?? null;
  const minDSCR  = result.breakdown?.minDSCR ?? null;
  const cushion  = dscr != null && minDSCR != null ? (dscr - minDSCR).toFixed(2) : null;
  const cashflow = dscr >= 1.25 ? "Strong"
                 : dscr >= 1.10 ? "Moderate"
                 : dscr >= 1.00 ? "Break-even"
                 : "Negative";
  const cashflowColor = dscr >= 1.25 ? T.textGreen
                      : dscr >= 1.00 ? T.textAmber
                      : T.textRed;

  return (
    <div style={{
      padding: "12px 14px",
      backgroundColor: T.tealBg,
      border: `1px solid ${T.tealBorder}`,
      borderRadius: T.radiusSm,
    }}>
      <div style={{
        fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.09em",
        color: T.textTeal, textTransform: "uppercase", marginBottom: "10px",
      }}>
        📊 DSCR Qualifying Details
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: "10px",
      }}>
        <DSCRMetric label="Your DSCR"   value={dscr?.toFixed(2) ?? "—"}     color={T.textTeal} />
        <DSCRMetric label="Min Required" value={minDSCR?.toFixed(2) ?? "—"} color={T.textSecondary} />
        {cushion && <DSCRMetric label="Cushion" value={`+${cushion}`}        color={parseFloat(cushion) >= 0.15 ? T.textGreen : T.textAmber} />}
        <DSCRMetric label="Cashflow" value={cashflow} color={cashflowColor} />
      </div>
      <div style={{
        marginTop: "10px", fontSize: "11px", color: T.textMuted,
        fontFamily: T.fontBody, lineHeight: "1.4",
      }}>
        No personal income documentation required. Qualification is based entirely on
        property rental income vs. PITIA.
      </div>
    </div>
  );
}

function DSCRMetric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, letterSpacing: "0.06em", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontFamily: T.fontMono, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}

// ── Asset Depletion Qualifying Income Panel ───────────────────────────────────
function AssetDepletionPanel({ result }) {
  // Pull from passReasons or breakdown if available
  const reasonsText = (result.passReasons || []).join(" ");
  const totalAssets = result.totalAssets ?? null;

  // Try to parse monthly income from reasons text
  const incomeMatch = reasonsText.match(/\$([\d,]+)\/mo qualifying/);
  const monthlyQual = incomeMatch ? incomeMatch[1] : null;

  // Depletion months from breakdown
  const depMonths = result.depletionMonths ?? null;

  return (
    <div style={{
      padding: "12px 14px",
      backgroundColor: T.violetBg,
      border: `1px solid ${T.violetBorder}`,
      borderRadius: T.radiusSm,
    }}>
      <div style={{
        fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.09em",
        color: T.violetLight, textTransform: "uppercase", marginBottom: "10px",
      }}>
        💎 Asset Depletion Qualifying Details
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "10px", marginBottom: "10px",
      }}>
        {totalAssets && (
          <ADMetric label="Total Qualifying Assets" value={fmt$(totalAssets)} color={T.violetLight} />
        )}
        {depMonths && (
          <ADMetric label="Depletion Term" value={`${depMonths} months`} color={T.textSecondary} />
        )}
        {monthlyQual && (
          <ADMetric label="Monthly Qualifying Income" value={`$${monthlyQual}/mo`} color={T.textGreen} />
        )}
      </div>
      {totalAssets && depMonths && (
        <div style={{
          padding: "7px 10px",
          backgroundColor: `${T.violetBg}80`,
          border: `1px solid ${T.violetBorder}`,
          borderRadius: T.radiusSm,
          fontSize: "11px", fontFamily: T.fontMono,
          color: T.textSecondary,
        }}>
          Formula: {fmt$(totalAssets)} ÷ {depMonths} mo
          {monthlyQual && (
            <span style={{ color: T.textGreen, marginLeft: "6px" }}>
              = ${monthlyQual}/mo qualifying income
            </span>
          )}
        </div>
      )}
      <div style={{
        marginTop: "8px", fontSize: "11px", color: T.textMuted,
        fontFamily: T.fontBody, lineHeight: "1.4",
      }}>
        Income is derived from documented liquid assets — no employment verification required.
      </div>
    </div>
  );
}

function ADMetric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, letterSpacing: "0.06em", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", fontFamily: T.fontMono, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}

// ── Bank Statement Qualifying Panel ───────────────────────────────────────────
function BankStatementPanel({ result }) {
  const months = result.program === "BankStatement24" ? 24 : 12;

  return (
    <div style={{
      padding: "12px 14px",
      backgroundColor: T.orangeBg,
      border: `1px solid ${T.orangeBorder}`,
      borderRadius: T.radiusSm,
    }}>
      <div style={{
        fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.09em",
        color: T.orangeLight, textTransform: "uppercase", marginBottom: "8px",
      }}>
        🏦 Bank Statement Qualifying Details
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px",
        marginBottom: "8px",
      }}>
        <BSMetric label="Statement Period" value={`${months} months`}  color={T.orangeLight} />
        <BSMetric label="Expense Factor"   value="50% of deposits"     color={T.textSecondary} />
        <BSMetric label="Income Source"    value="Deposits × 50%"      color={T.textSecondary} />
      </div>
      <div style={{
        fontSize: "11px", color: T.textMuted,
        fontFamily: T.fontBody, lineHeight: "1.4",
      }}>
        W2s and tax returns not required. Income is calculated from {months} months of
        bank deposit history — ideal for self-employed borrowers with strong cash flow
        but lower reported taxable income.
      </div>
    </div>
  );
}

function BSMetric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, letterSpacing: "0.06em", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "12px", fontFamily: T.fontMono, fontWeight: 600, color }}>
        {value}
      </div>
    </div>
  );
}

// ── Conditional Flags ─────────────────────────────────────────────────────────
function ConditionalFlagChips({ flags }) {
  if (!flags?.length) return null;

  // Human-readable label mapping
  const FLAG_LABELS = {
    SHORT_TERM_RENTAL_NOT_ACCEPTED:  { label: "Short-term rental not accepted by this profile", icon: "🏠" },
    HIGH_DTI:                        { label: "DTI may exceed profile comfort zone",             icon: "📉" },
  };

  const renderFlag = (flag, i) => {
    const custom = FLAG_LABELS[flag];
    // Parse dynamic flags like RESERVES_BELOW_MINIMUM_6MO
    if (!custom && flag.startsWith("RESERVES_BELOW_MINIMUM_")) {
      const mo = flag.replace("RESERVES_BELOW_MINIMUM_", "").replace("MO", "");
      return (
        <FlagChip key={i} icon="💰" label={`Reserves may be below ${mo}-month minimum`} />
      );
    }
    if (!custom && flag.startsWith("CASH_OUT_MAY_EXCEED_CAP_")) {
      const cap = flag.replace("CASH_OUT_MAY_EXCEED_CAP_", "");
      return (
        <FlagChip key={i} icon="💸" label={`Cash-out amount may exceed $${cap} cap`} />
      );
    }
    return custom
      ? <FlagChip key={i} icon={custom.icon} label={custom.label} />
      : <FlagChip key={i} icon="⚠️" label={flag.replace(/_/g, " ")} />;
  };

  return (
    <div>
      <SectionHead label="Advisory Flags" />
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {flags.map(renderFlag)}
      </div>
    </div>
  );
}

function FlagChip({ icon, label }) {
  return (
    <div className="alc-flag-chip" style={{
      display: "flex", alignItems: "center", gap: "8px",
      padding: "7px 10px",
      backgroundColor: "#1a0e00",
      border: `1px solid ${T.amberBorder}`,
      borderLeft: `3px solid ${T.amber}`,
      borderRadius: T.radiusSm,
      fontSize: "12px", color: T.textAmber,
      fontFamily: T.fontBody, lineHeight: "1.3",
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </div>
  );
}

// ── Non-QM Score Breakdown ────────────────────────────────────────────────────
function NonQMScoreBreakdown({ breakdown, maxPossible, isPlaceholder }) {
  if (!breakdown) return null;

  const segments = NONQM_BREAKDOWN_SEGMENTS.filter(
    (seg) => breakdown[seg.key] != null && breakdown[seg.key] > 0
  );

  return (
    <div>
      {/* Stacked bar */}
      <div style={{
        display: "flex", height: "7px", borderRadius: "4px",
        overflow: "hidden", backgroundColor: T.border, gap: "1px",
        marginBottom: "10px",
      }}>
        {segments.map((seg, i) => {
          const frac = (breakdown[seg.key] / maxPossible) * 100;
          return frac > 0 ? (
            <div
              key={seg.key}
              className="alc-bar-fill"
              title={`${seg.label}: ${breakdown[seg.key]}/${seg.max}`}
              style={{
                width: `${frac}%`, height: "100%",
                backgroundColor: seg.color,
                animationDelay: `${i * 70}ms`,
              }}
            />
          ) : null;
        })}
        {/* Placeholder cap indicator — grey zone */}
        {isPlaceholder && (
          <div style={{
            width: `${(10 / maxPossible) * 100}%`, height: "100%",
            backgroundColor: T.border,
            opacity: 0.3,
          }}
            title="Placeholder score cap: max 90/100"
          />
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: "5px",
      }}>
        {segments.map((seg) => (
          <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "7px", height: "7px", borderRadius: "2px",
              backgroundColor: seg.color, flexShrink: 0,
            }} />
            <span style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted, flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {seg.label}
            </span>
            <span style={{ fontSize: "10px", fontFamily: T.fontMono, fontWeight: 600, color: seg.color, flexShrink: 0 }}>
              {breakdown[seg.key]}
              <span style={{ color: T.textMuted, fontWeight: 400 }}>/{seg.max}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Cushion chips */}
      {(breakdown.ficoCushion != null || breakdown.ltvCushion != null) && (
        <div style={{
          marginTop: "8px", padding: "7px 10px",
          backgroundColor: T.bg, border: `1px solid ${T.border}`,
          borderRadius: T.radiusSm,
          display: "flex", gap: "16px", flexWrap: "wrap",
        }}>
          {breakdown.ficoCushion != null && (
            <CushionPill
              label="FICO"
              value={`+${breakdown.ficoCushion} pts`}
              color={breakdown.ficoCushion >= 60 ? T.textGreen : breakdown.ficoCushion >= 20 ? T.textAmber : T.textMuted}
            />
          )}
          {breakdown.ltvCushion != null && (
            <CushionPill
              label="LTV"
              value={`${breakdown.ltvCushion.toFixed(1)}%`}
              color={breakdown.ltvCushion >= 8 ? T.textGreen : breakdown.ltvCushion >= 3 ? T.textAmber : T.textMuted}
            />
          )}
          {breakdown.applicableMaxLTV != null && (
            <CushionPill label="Max LTV" value={`${breakdown.applicableMaxLTV}%`} color={T.textMuted} />
          )}
        </div>
      )}

      {/* Placeholder cap notice */}
      {isPlaceholder && (
        <div style={{
          marginTop: "8px", padding: "6px 10px",
          backgroundColor: T.amberBg, border: `1px solid ${T.amberBorder}`,
          borderRadius: T.radiusSm,
          fontSize: "10px", fontFamily: T.fontMono,
          color: T.textAmber, letterSpacing: "0.04em",
        }}>
          ⚠ Placeholder cap: max 90 pts — real verified lenders score up to 100
        </div>
      )}
    </div>
  );
}

function CushionPill({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <span style={{ fontSize: "10px", color: T.textMuted, fontFamily: T.fontMono }}>{label}</span>
      <span style={{ fontSize: "11px", fontFamily: T.fontMono, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// ── Narrative Block ───────────────────────────────────────────────────────────
function NarrativeBlock({ narrative }) {
  if (!narrative) return null;
  return (
    <div style={{
      padding: "11px 13px",
      backgroundColor: "#060d14",
      border: `1px solid ${T.blueBorder}`,
      borderLeft: `3px solid ${T.blue}`,
      borderRadius: T.radiusSm,
    }}>
      <div style={{
        fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
        color: T.textBlue, textTransform: "uppercase", marginBottom: "5px",
      }}>
        Why This Path
      </div>
      <p style={{
        fontSize: "13px", color: T.textSecondary,
        lineHeight: "1.55", fontFamily: T.fontBody, margin: 0,
      }}>
        {narrative}
      </p>
    </div>
  );
}

// ── Pass Reasons ──────────────────────────────────────────────────────────────
function PassReasons({ reasons }) {
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

// ── Strengths / Weaknesses ────────────────────────────────────────────────────
function ProfileStrengths({ strengths, weaknesses }) {
  if (!strengths?.length && !weaknesses?.length) return null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: strengths?.length && weaknesses?.length ? "1fr 1fr" : "1fr",
      gap: "12px",
    }}>
      {strengths?.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
            color: T.textGreen, textTransform: "uppercase", marginBottom: "6px" }}>
            Strengths
          </div>
          {strengths.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "6px", fontSize: "12px",
              color: T.textSecondary, marginBottom: "4px", lineHeight: "1.4" }}>
              <span style={{ color: T.greenLight, flexShrink: 0 }}>+</span>{s}
            </div>
          ))}
        </div>
      )}
      {weaknesses?.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.08em",
            color: T.textMuted, textTransform: "uppercase", marginBottom: "6px" }}>
            Considerations
          </div>
          {weaknesses.map((w, i) => (
            <div key={i} style={{ display: "flex", gap: "6px", fontSize: "12px",
              color: T.textMuted, marginBottom: "4px", lineHeight: "1.4" }}>
              <span style={{ color: T.textMuted, flexShrink: 0 }}>—</span>{w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Typical Use Case ──────────────────────────────────────────────────────────
function TypicalUseCase({ text }) {
  if (!text) return null;
  return (
    <div style={{
      padding: "9px 12px",
      backgroundColor: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: T.radiusSm,
      fontSize: "12px", color: T.textSecondary,
      fontFamily: T.fontBody, lineHeight: "1.45",
    }}>
      <span style={{ fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "4px" }}>
        Typical Use Case
      </span>
      {text}
    </div>
  );
}

// ── Disclaimer Footer ─────────────────────────────────────────────────────────
function DisclaimerFooter({ disclaimer }) {
  if (!disclaimer) return null;
  return (
    <div style={{
      padding: "8px 12px",
      backgroundColor: "#0a0600",
      border: `1px solid ${T.amberBorder}30`,
      borderRadius: T.radiusSm,
      fontSize: "10px", color: T.textMuted,
      fontFamily: T.fontBody, lineHeight: "1.5",
      fontStyle: "italic",
    }}>
      {disclaimer}
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────
export function AlternativeLenderCard({ result, onSelectLender, isSelected, animationDelay }) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  const {
    lenderId, lenderName, shortName, program,
    fitScore, breakdown, maxPossible,
    eligible, eligibilityStatus, eligibilityLabel,
    passReasons, conditionalFlags, narrative,
    overlayRisk, overlaySignals,
    tierBasis, tierNotes, typicalUseCase,
    strengths, weaknesses,
    guidelineVersionRef, dataSource, disclaimer,
    isPlaceholder,
  } = result;

  const progMeta  = PROGRAM_META[program] || PROGRAM_META.DSCR;
  const risk      = RISK_STYLE[overlayRisk] || RISK_STYLE.LOW;
  const scoreMax  = maxPossible ?? (isPlaceholder ? 90 : 100);
  const fScore    = fitScore || 0;
  const sColor    = scoreColor(fScore);
  const isEligible = eligible && eligibilityStatus !== "INELIGIBLE";

  // Resolve status config
  const statusKey = isPlaceholder && eligibilityStatus === "ELIGIBLE"
    ? "ELIGIBLE-PLACEHOLDER"
    : eligibilityStatus;
  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.CONDITIONAL;

  // Card border
  const borderLeftColor = isSelected ? T.amber
    : isPlaceholder ? T.amber
    : progMeta.color;

  const cardBg = isSelected ? T.bgSelected
    : isPlaceholder ? T.bgPlaceholder
    : expanded ? T.bgCardHover
    : T.bgCard;

  const cardShadow = isSelected
    ? `0 0 0 1px ${T.amberBorder}, inset 0 0 40px ${T.amberGlow}`
    : "none";

  // Program-specific qualifying panel
  const showDSCRPanel     = eligible && program === "DSCR";
  const showAssetPanel    = eligible && program === "AssetDepletion";
  const showBankStmtPanel = eligible && (program === "BankStatement12" || program === "BankStatement24");

  return (
    <div
      className="alc-card"
      style={{
        backgroundColor: cardBg,
        borderLeft: `3px solid ${borderLeftColor}`,
        boxShadow: cardShadow,
        transition: T.transition,
        animationDelay: animationDelay || "0ms",
        borderTop: `1px solid ${T.border}`,
        position: "relative",
      }}
    >

      {/* ── COLLAPSED ROW ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center",
          padding: "13px 18px 13px 16px", gap: "13px",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setExpanded((e) => !e)}
      >

        {/* Program icon avatar */}
        <div style={{
          width: "40px", height: "40px", borderRadius: "9px",
          backgroundColor: isPlaceholder ? T.amberBg : progMeta.bg,
          border: `1px solid ${isPlaceholder ? T.amberBorder : progMeta.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", flexShrink: 0,
          boxShadow: isPlaceholder ? `0 0 10px ${T.amber}20` : `0 0 10px ${progMeta.color}20`,
        }}>
          {progMeta.icon}
        </div>

        {/* Name + program + tier */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
            <span style={{
              fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "14px",
              color: T.textPrimary, letterSpacing: "-0.2px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "220px",
            }}>
              {lenderName}
            </span>

            {/* Program badge */}
            <span style={{
              fontSize: "10px", fontFamily: T.fontMono, letterSpacing: "0.06em",
              fontWeight: 600, padding: "2px 6px", borderRadius: "3px",
              backgroundColor: progMeta.bg,
              border: `1px solid ${progMeta.border}`,
              color: progMeta.color, flexShrink: 0,
            }}>
              {progMeta.label}
            </span>

            {/* Tier badge */}
            <span style={{
              fontSize: "10px", fontFamily: T.fontMono,
              padding: "2px 6px", borderRadius: "3px",
              backgroundColor: isPlaceholder ? T.amberBg : T.bg,
              border: `1px solid ${isPlaceholder ? T.amberBorder : T.borderLight}`,
              color: isPlaceholder ? T.textAmber : T.textSecondary,
              flexShrink: 0,
            }}>
              {tierBasis} Profile
            </span>
          </div>

          {/* Tier notes — single line collapsed */}
          {tierNotes && !expanded && (
            <div style={{
              fontSize: "11px", color: T.textMuted, fontFamily: T.fontBody,
              marginTop: "3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "380px",
            }}>
              {tierNotes}
            </div>
          )}
        </div>

        {/* Right cluster: risk + score + status + chevron */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          flexShrink: 0, marginLeft: "auto",
        }}>
          {/* Overlay risk */}
          <div style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "3px 7px",
            backgroundColor: risk.bg, border: `1px solid ${risk.border}`,
            borderRadius: "4px",
            fontSize: "10px", fontFamily: T.fontMono, fontWeight: 600,
            letterSpacing: "0.05em", color: risk.color,
          }}
            title={`Overlay Risk: ${overlayRisk}${overlaySignals?.length ? ` — ${overlaySignals.join(", ")}` : ""}`}
          >
            {risk.icon} {risk.label}
          </div>

          {/* Score arc */}
          <ScoreArc score={fScore} maxPossible={scoreMax} isPlaceholder={isPlaceholder} />

          {/* Status pill */}
          <div style={{
            fontSize: "10px", fontFamily: T.fontMono,
            letterSpacing: "0.06em", fontWeight: 700,
            padding: "4px 9px", borderRadius: "4px",
            backgroundColor: statusCfg.bg,
            border: `1px solid ${statusCfg.border}`,
            color: statusCfg.color,
            whiteSpace: "nowrap",
          }}>
            {statusCfg.icon} {statusCfg.label}
          </div>

          {/* Chevron */}
          <div style={{
            color: T.textMuted, fontSize: "12px",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            width: "16px", textAlign: "center", flexShrink: 0,
          }}>
            ▾
          </div>
        </div>
      </div>


      {/* ── PLACEHOLDER CARD BANNER (inline, non-dismissible) ─────────── */}
      {isPlaceholder && !expanded && <PlaceholderCardBanner />}


      {/* ── EXPANDED PANEL ────────────────────────────────────────────── */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: "18px 20px 20px 20px",
          display: "flex", flexDirection: "column", gap: "16px",
          animation: "alc-in 0.18s ease both",
        }}>

          {/* Placeholder inline banner — stays visible in expanded too */}
          {isPlaceholder && <PlaceholderCardBanner />}

          {/* Eligibility Status — conditional detail */}
          {eligibilityStatus === "CONDITIONAL" && isPlaceholder && (
            <div style={{
              padding: "10px 14px",
              backgroundColor: T.amberBg,
              border: `1px solid ${T.amberBorder}`,
              borderRadius: T.radiusSm,
              fontSize: "12px", color: T.textAmber,
              fontFamily: T.fontBody, lineHeight: "1.5",
            }}>
              <strong style={{ color: T.amberLight }}>Conditional Eligibility — </strong>
              This profile's guidelines are estimated. Eligibility cannot be confirmed
              without verified lender data. Treat as a directional indicator only.
              Use the Decision Record to log intent and follow up with a real lender.
            </div>
          )}

          {/* Score breakdown */}
          <div>
            <SectionHead
              label="Score Breakdown"
              right={
                <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: "16px", color: sColor }}>
                  {fScore}
                  <span style={{ fontSize: "10px", color: T.textMuted, fontWeight: 400 }}>
                    {" "}/{scoreMax}
                  </span>
                </span>
              }
            />
            <NonQMScoreBreakdown
              breakdown={breakdown}
              maxPossible={scoreMax}
              isPlaceholder={isPlaceholder}
            />
          </div>

          {/* Program-specific qualifying panel */}
          {showDSCRPanel     && <DSCRPanel result={result} />}
          {showAssetPanel    && <AssetDepletionPanel result={result} />}
          {showBankStmtPanel && <BankStatementPanel result={result} />}

          {/* Narrative */}
          {narrative && <NarrativeBlock narrative={narrative} />}

          {/* Pass reasons */}
          {passReasons?.length > 0 && (
            <div>
              <SectionHead label="Eligibility Factors" />
              <PassReasons reasons={passReasons} />
            </div>
          )}

          {/* Conditional flags */}
          {conditionalFlags?.length > 0 && (
            <ConditionalFlagChips flags={conditionalFlags} />
          )}

          {/* Strengths + Weaknesses */}
          {(strengths?.length > 0 || weaknesses?.length > 0) && (
            <div>
              <SectionHead label="Profile Characteristics" />
              <ProfileStrengths strengths={strengths} weaknesses={weaknesses} />
            </div>
          )}

          {/* Typical use case */}
          {typicalUseCase && <TypicalUseCase text={typicalUseCase} />}

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
            paddingTop: "14px", borderTop: `1px solid ${T.border}`,
          }}>
            {/* Left: data source badge + guideline ref */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <DataSourceBadge isPlaceholder={isPlaceholder} />
              {guidelineVersionRef && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "4px",
                  padding: "2px 7px",
                  backgroundColor: T.bg, border: `1px solid ${T.border}`,
                  borderRadius: "3px",
                  fontSize: "10px", fontFamily: T.fontMono, color: T.textMuted,
                }}>
                  {isPlaceholder ? "⚠" : "✓"} {guidelineVersionRef}
                </div>
              )}
            </div>

            {/* Right: Select CTA */}
            {isEligible && (
              <button
                className={`alc-select-btn${isSelected ? " alc-selected" : ""}`}
                style={{
                  padding: "9px 18px",
                  backgroundColor: isSelected ? T.amberBg : "transparent",
                  color: isSelected ? T.amberLight : T.textSecondary,
                  border: `1px solid ${isSelected ? T.amberBorder : T.borderLight}`,
                  borderRadius: T.radius,
                  fontFamily: T.fontDisplay, fontWeight: 600, fontSize: "13px",
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
                  <><span>◎</span> Log This Path</>
                )}
              </button>
            )}
          </div>

          {/* Disclaimer (placeholder only) */}
          {isPlaceholder && disclaimer && <DisclaimerFooter disclaimer={disclaimer} />}

        </div>
      )}{/* /expanded */}

    </div>
  );
}

export default AlternativeLenderCard;
