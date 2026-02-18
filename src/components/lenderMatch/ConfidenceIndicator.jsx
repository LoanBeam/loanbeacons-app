/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/components/lenderMatch/ConfidenceIndicator.jsx
 * Version: 1.0.0 — Confidence Indicator
 * Step 9 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Displays engine confidence score (0–100%) in the results header.
 * Confidence is driven by input completeness + guideline currency.
 * Placeholder results apply a hard ceiling (max ~75%).
 *
 * Props:
 *   confidence  {object}  — { score: 0.0–1.0, level: "HIGH"|"MODERATE"|"LOW", message: string }
 *   compact     {boolean} — Compact pill mode for inline use (default: false)
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

  fontMono: "'DM Mono', 'Fira Code', monospace",
  fontBody: "'DM Sans', 'Outfit', system-ui, sans-serif",
  radius:   "8px",
  radiusSm: "4px",
};

const CONFIDENCE_CONFIG = {
  HIGH: {
    color:  T.greenLight,
    bg:     T.greenBg,
    border: T.greenBorder,
    icon:   "◉",
    detail: "All required inputs provided. Guideline data is current. Results carry full engine weight.",
  },
  MODERATE: {
    color:  T.amberLight,
    bg:     T.amberBg,
    border: T.amberBorder,
    icon:   "◎",
    detail: "Some inputs estimated using conservative defaults, or one or more results use placeholder guideline data. Results are directionally reliable but should be confirmed with lender.",
  },
  LOW: {
    color:  T.redLight,
    bg:     T.redBg,
    border: T.redBorder,
    icon:   "○",
    detail: "Significant inputs are missing or guideline data may be outdated. Treat results as a starting point only. Verify all eligibility and scoring with lenders directly.",
  },
};

// What factors affect confidence — shown in expanded panel
const CONFIDENCE_FACTORS = [
  { label: "Input completeness",   weight: "50%", description: "How many required scenario fields were provided" },
  { label: "Guideline currency",   weight: "50%", description: "How recently verified the lender guideline data is" },
  { label: "Placeholder ceiling",  weight: "Cap", description: "Results containing placeholder profiles are capped at ~75% confidence regardless of inputs" },
];

const SID = "ci-styles";
if (typeof document !== "undefined" && !document.getElementById(SID)) {
  const el = document.createElement("style");
  el.id = SID;
  el.textContent = `
    @keyframes ci-drop {
      from { opacity:0; transform:translateY(-4px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .ci-panel  { animation: ci-drop 0.14s ease both; }
    .ci-pill:hover { opacity: 0.82; }
    @keyframes ci-barGrow {
      from { width: 0; }
    }
    .ci-bar { animation: ci-barGrow 0.55s cubic-bezier(0.16,1,0.3,1) both; }
  `;
  document.head.appendChild(el);
}

export function ConfidenceIndicator({ confidence, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  if (!confidence) return null;

  const cfg   = CONFIDENCE_CONFIG[confidence.level] || CONFIDENCE_CONFIG.MODERATE;
  const pct   = Math.round((confidence.score ?? 0) * 100);

  // Bar segment colors: stacked green-to-amber-to-red
  const barColor = pct >= 85 ? T.greenLight : pct >= 60 ? T.amberLight : T.redLight;

  const Pill = (
    <div
      className="ci-pill"
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        padding: compact ? "3px 10px" : "5px 12px",
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: "20px",
        cursor: "pointer", userSelect: "none",
        transition: "opacity 0.12s ease",
      }}
      onClick={() => setOpen((o) => !o)}
    >
      {/* Compact bar */}
      {!compact && (
        <div style={{
          width: "52px", height: "4px",
          backgroundColor: T.border, borderRadius: "2px", overflow: "hidden",
        }}>
          <div
            className="ci-bar"
            style={{
              width: `${pct}%`, height: "100%",
              backgroundColor: barColor, borderRadius: "2px",
            }}
          />
        </div>
      )}

      {/* Label */}
      <span style={{
        fontSize: "12px", fontFamily: T.fontMono,
        color: T.textSecondary,
        letterSpacing: "0.02em",
      }}>
        Confidence:
      </span>

      {/* Level */}
      <span style={{
        fontSize: "12px", fontFamily: T.fontMono,
        fontWeight: 700, color: cfg.color,
        letterSpacing: "0.04em",
      }}>
        {confidence.level}
      </span>

      {/* Pct */}
      <span style={{
        fontSize: "11px", fontFamily: T.fontMono,
        color: T.textMuted,
      }}>
        ({pct}%)
      </span>

      {/* Chevron */}
      <span style={{
        fontSize: "10px", color: T.textMuted,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.18s ease",
        display: "inline-block",
      }}>▾</span>
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {Pill}

      {open && (
        <div className="ci-panel" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
          minWidth: "310px", maxWidth: "400px",
          backgroundColor: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius, overflow: "hidden",
          boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: "11px", fontFamily: T.fontMono,
              fontWeight: 700, color: T.textSecondary, letterSpacing: "0.06em",
            }}>
              ENGINE CONFIDENCE
            </span>
            <button onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: T.textMuted, fontSize: "16px", padding: "0 2px", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Score + full bar */}
          <div style={{ padding: "14px 14px 12px" }}>
            <div style={{
              display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "10px",
            }}>
              <span style={{
                fontFamily: T.fontMono, fontWeight: 700,
                fontSize: "32px", color: cfg.color, lineHeight: 1,
              }}>
                {pct}%
              </span>
              <span style={{
                fontSize: "12px", fontFamily: T.fontMono,
                fontWeight: 600, color: cfg.color, letterSpacing: "0.06em",
              }}>
                {confidence.level}
              </span>
            </div>

            {/* Full-width bar */}
            <div style={{
              height: "6px", backgroundColor: T.border,
              borderRadius: "3px", overflow: "hidden",
            }}>
              <div
                className="ci-bar"
                style={{
                  width: `${pct}%`, height: "100%",
                  backgroundColor: barColor,
                  borderRadius: "3px",
                }}
              />
            </div>

            {/* Threshold marks */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginTop: "4px",
              fontSize: "9px", fontFamily: T.fontMono, color: T.textMuted,
            }}>
              <span>0</span>
              <span style={{ color: T.redLight }}>60 LOW</span>
              <span style={{ color: T.amberLight }}>75 MOD</span>
              <span style={{ color: T.greenLight }}>85 HIGH</span>
              <span>100</span>
            </div>
          </div>

          {/* Message */}
          <div style={{
            padding: "0 14px 12px",
            fontSize: "12px", color: T.textSecondary,
            fontFamily: T.fontBody, lineHeight: "1.5",
          }}>
            {confidence.message}
          </div>

          {/* Factors table */}
          <div style={{
            padding: "10px 14px",
            borderTop: `1px solid ${T.border}`,
          }}>
            <div style={{
              fontSize: "10px", fontFamily: T.fontMono,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: T.textMuted, marginBottom: "8px",
            }}>
              Score Components
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {CONFIDENCE_FACTORS.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                }}>
                  <span style={{
                    fontSize: "10px", fontFamily: T.fontMono,
                    color: T.textMuted, fontWeight: 700,
                    minWidth: "34px", flexShrink: 0,
                    marginTop: "1px",
                  }}>
                    {f.weight}
                  </span>
                  <div>
                    <div style={{
                      fontSize: "11px", fontFamily: T.fontMono,
                      color: T.textSecondary, fontWeight: 600,
                      marginBottom: "1px",
                    }}>
                      {f.label}
                    </div>
                    <div style={{
                      fontSize: "11px", fontFamily: T.fontBody,
                      color: T.textMuted, lineHeight: "1.35",
                    }}>
                      {f.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default ConfidenceIndicator;
