/**
 * LoanBeacons™ — Program Migration Engine UI
 * AUS Rescue v2.0 — Layer 2: Program Ranking & Comparison
 *
 * Standalone drop-in component. Wire into AUSRescue.jsx with 3 lines.
 * Consumes rankPrograms() / identifyPrimaryBlocker() / assessFeasibility()
 * from the deterministic Rule Engine. No AI calls — pure rule output display.
 *
 * Props:
 *   profile  {Object}  Borrower profile (see programRuleEngine.js BORROWER_PROFILE_DEFAULTS)
 *   onSelectProgram  {Function}  Optional — called when LO clicks a program card
 *
 * Usage in AUSRescue.jsx:
 *   import ProgramMigrationEngine from './ProgramMigrationEngine';
 *   // After profile is ready:
 *   <ProgramMigrationEngine profile={borrowerProfile} onSelectProgram={handleProgramSelect} />
 */

import React, { useState, useMemo } from 'react';
import {
  rankPrograms,
  identifyPrimaryBlocker,
  assessFeasibility,
} from '../engines/programRuleEngine';
import { mergeReasoningResults, getStrategyNames } from '../services/ausRescueReasoning';

// ─── Color tokens (consistent with LoanBeacons dark theme) ───────────────────
const C = {
  bg:           '#0d1220',
  surface:      '#131929',
  card:         '#161e30',
  cardHover:    '#1c2640',
  border:       '#1f2d45',
  borderLight:  '#2a3a58',

  teal:         '#00c9b1',
  tealDim:      '#00c9b120',
  tealGlow:     '#00c9b140',
  blue:         '#3b82f6',
  blueDim:      '#3b82f620',
  orange:       '#f59e0b',
  orangeDim:    '#f59e0b20',
  red:          '#ef4444',
  redDim:       '#ef444420',
  yellow:       '#eab308',
  yellowDim:    '#eab30820',
  green:        '#22c55e',
  greenDim:     '#22c55e20',
  slate:        '#475569',
  slateDim:     '#47556920',

  textPrimary:  '#e2e8f0',
  textSecond:   '#94a3b8',
  textMuted:    '#4a5a78',
  textAccent:   '#00c9b1',
};

// ─── Feasibility config ───────────────────────────────────────────────────────
const FEASIBILITY_CONFIG = {
  HIGH:   { color: C.green,  bg: C.greenDim,  label: 'HIGH',   icon: '▲', desc: 'Multiple strong approval paths available' },
  MEDIUM: { color: C.yellow, bg: C.yellowDim, label: 'MEDIUM', icon: '●', desc: 'Limited paths — compensating factors needed' },
  LOW:    { color: C.red,    bg: C.redDim,    label: 'LOW',    icon: '▼', desc: 'Significant barriers — restructure required' },
};

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  eligible:    { label: 'ELIGIBLE',    color: C.teal,   dotColor: C.teal,   sortKey: 0 },
  conditional: { label: 'CONDITIONAL', color: C.orange, dotColor: C.orange, sortKey: 1 },
  disqualified:{ label: 'INELIGIBLE',  color: C.slate,  dotColor: C.red,    sortKey: 2 },
};

// ─── Probability Ring (SVG) ───────────────────────────────────────────────────
function ProbabilityRing({ value, size = 64, tier }) {
  const r      = (size - 8) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;

  const ringColor = tier === 'eligible'
    ? C.teal
    : tier === 'conditional'
      ? value >= 40 ? C.orange : C.red
      : C.slate;

  const textColor = tier === 'disqualified' ? C.textMuted : C.textPrimary;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={C.border} strokeWidth={6}
      />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={ringColor}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      {/* Value */}
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={textColor}
        fontSize={size < 56 ? 11 : 13}
        fontWeight="700"
        fontFamily="'DM Mono', 'Fira Code', monospace"
      >
        {tier === 'disqualified' ? '—' : `${value}%`}
      </text>
    </svg>
  );
}

// ─── Blocker Chip ─────────────────────────────────────────────────────────────
function BlockerChip({ blocker }) {
  const isDisq = blocker.severity === 'DISQUALIFYING' || blocker.severity === 'CRITICAL';
  const color  = isDisq ? C.red : C.orange;
  const bg     = isDisq ? C.redDim : C.orangeDim;

  const gapText = blocker.gap != null && typeof blocker.gap === 'number'
    ? blocker.rule === 'DTI'   ? `+${blocker.gap.toFixed(1)}%`
    : blocker.rule === 'FICO'  ? `+${blocker.gap}pts`
    : blocker.rule === 'LTV'   ? `+${blocker.gap.toFixed(1)}%`
    : null
    : null;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, border: `1px solid ${color}30`,
      color, borderRadius: 4, padding: '2px 7px',
      fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace",
      whiteSpace: 'nowrap',
    }}>
      <span style={{ opacity: 0.7 }}>●</span>
      {blocker.rule}
      {gapText && <span style={{ opacity: 0.8 }}>{gapText}</span>}
    </span>
  );
}

// ─── Strength Chip ────────────────────────────────────────────────────────────
function StrengthChip({ text }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: C.greenDim, border: `1px solid ${C.green}25`,
      color: C.green, borderRadius: 4, padding: '2px 7px',
      fontSize: 11, fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      ✓ {text}
    </span>
  );
}

// ─── Warning Chip ─────────────────────────────────────────────────────────────
function WarningChip({ rule }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: C.yellowDim, border: `1px solid ${C.yellow}25`,
      color: C.yellow, borderRadius: 4, padding: '2px 7px',
      fontSize: 11, fontWeight: 500,
    }}>
      ⚡ {rule} warning
    </span>
  );
}

// ─── Delta Chip (Sonnet refinement indicator) ─────────────────────────────────
function DeltaChip({ delta }) {
  if (delta == null || delta === 0) return null;
  const isUp  = delta > 0;
  const color = isUp ? C.green : C.red;
  const bg    = isUp ? C.greenDim : C.redDim;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: bg, border: `1px solid ${color}30`,
      color, borderRadius: 4, padding: '1px 5px',
      fontSize: 10, fontWeight: 700,
      fontFamily: "'DM Mono', monospace",
    }}>
      {isUp ? '▲' : '▼'}{isUp ? '+' : ''}{delta}%
    </span>
  );
}

// ─── Eligibility Badge ────────────────────────────────────────────────────────
function EligibilityBadge({ tier, label }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: `${cfg.color}18`,
      border: `1px solid ${cfg.color}40`,
      color: cfg.color,
      borderRadius: 4, padding: '2px 8px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      fontFamily: "'DM Mono', monospace",
    }}>
      {label}
    </span>
  );
}

// ─── Program Card ─────────────────────────────────────────────────────────────
function ProgramCard({ result, isExpanded, onToggle, isBestPath }) {
  const tier = result.eligible ? 'eligible' : result.conditional ? 'conditional' : 'disqualified';
  const tierCfg = TIER_CONFIG[tier];
  const isDimmed = tier === 'disqualified';

  // Show top 3 strengths max in collapsed view
  const topStrengths = (result.strengths || []).slice(0, 2);

  return (
    <div
      onClick={onToggle}
      style={{
        background: isExpanded ? C.cardHover : C.card,
        border: `1px solid ${isExpanded ? tierCfg.color + '60' : C.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        opacity: isDimmed ? 0.55 : 1,
        transition: 'all 0.18s ease',
        position: 'relative',
        outline: isBestPath ? `2px solid ${C.teal}50` : 'none',
        outlineOffset: -1,
      }}
    >
      {/* Best path ribbon */}
      {isBestPath && (
        <div style={{
          position: 'absolute', top: -1, right: 12,
          background: C.teal, color: '#0d1220',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
          padding: '2px 8px', borderRadius: '0 0 5px 5px',
        }}>
          BEST PATH
        </div>
      )}

      {/* Card Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <span style={{ fontSize: 22, flexShrink: 0 }}>{result.icon}</span>

        {/* Name + Badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              color: isDimmed ? C.textMuted : C.textPrimary,
              fontWeight: 700, fontSize: 14,
            }}>
              {result.programName}
            </span>
            <EligibilityBadge tier={tier} label={result.eligibilityLabel.toUpperCase()} />
          </div>
          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
            {result.description}
          </div>
        </div>

        {/* Probability Ring */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <ProbabilityRing value={result.approvalProbability} size={52} tier={tier} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: C.textMuted, fontSize: 9, letterSpacing: '0.05em' }}>
              {result.sonnetRefined ? 'AI REFINED' : 'BASE PROB'}
            </span>
            {result.sonnetRefined && <DeltaChip delta={result.probabilityDelta} />}
          </div>
        </div>

        {/* Expand chevron */}
        <span style={{
          color: C.textMuted, fontSize: 13, flexShrink: 0,
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease',
        }}>▾</span>
      </div>

      {/* Chips Row — always visible */}
      {(result.blockers.length > 0 || result.warnings.length > 0) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10,
        }}>
          {result.blockers.slice(0, 4).map((b, i) => <BlockerChip key={i} blocker={b} />)}
          {result.warnings.slice(0, 2).map((w, i) => <WarningChip key={i} rule={w.rule} />)}
        </div>
      )}

      {/* Expanded Detail */}
      {isExpanded && (
        <div style={{
          marginTop: 14,
          borderTop: `1px solid ${C.border}`,
          paddingTop: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Blocker Detail */}
          {result.blockers.length > 0 && (
            <div>
              <div style={{ color: C.red, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 6 }}>
                BLOCKERS
              </div>
              {result.blockers.map((b, i) => (
                <div key={i} style={{
                  background: `${C.red}0a`, border: `1px solid ${C.red}20`,
                  borderRadius: 6, padding: '8px 10px', marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>{b.label}</span>
                    {b.gap != null && typeof b.gap === 'number' && (
                      <span style={{
                        color: C.red, fontSize: 11,
                        fontFamily: "'DM Mono', monospace", fontWeight: 700, flexShrink: 0,
                      }}>
                        Gap: {b.rule === 'DTI' ? `${b.gap.toFixed(1)}%` : b.rule === 'FICO' ? `${b.gap} pts` : b.gap}
                      </span>
                    )}
                  </div>
                  {b.borrowerValue != null && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      <span style={{ color: C.textMuted, fontSize: 11 }}>
                        Borrower: <span style={{ color: C.red, fontWeight: 600 }}>{b.borrowerValue}</span>
                      </span>
                      <span style={{ color: C.textMuted, fontSize: 11 }}>
                        Limit: <span style={{ color: C.textSecond, fontWeight: 600 }}>{b.threshold}</span>
                      </span>
                    </div>
                  )}
                  <div style={{ color: C.orange, fontSize: 11, marginTop: 5, fontStyle: 'italic' }}>
                    → {b.remediation}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Passes */}
          {result.passes.length > 0 && (
            <div>
              <div style={{ color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 6 }}>
                REQUIREMENTS MET
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {result.passes.map((p, i) => (
                  <span key={i} style={{
                    background: C.greenDim, border: `1px solid ${C.green}25`,
                    color: C.green, borderRadius: 4, padding: '2px 8px',
                    fontSize: 11,
                  }}>
                    ✓ {p.label || p.rule}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Strengths */}
          {result.strengths?.length > 0 && (
            <div>
              <div style={{ color: C.textSecond, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 6 }}>
                PROGRAM STRENGTHS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {result.strengths.map((s, i) => (
                  <div key={i} style={{ color: C.textSecond, fontSize: 12, display: 'flex', gap: 6 }}>
                    <span style={{ color: C.teal, flexShrink: 0 }}>◆</span> {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Limitations */}
          {result.limitations?.length > 0 && (
            <div>
              <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 6 }}>
                LIMITATIONS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {result.limitations.map((l, i) => (
                  <div key={i} style={{ color: C.textMuted, fontSize: 12, display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0 }}>–</span> {l}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sonnet AI Narrative */}
          {result.sonnetRefined && result.narrative && (
            <div style={{
              background: '#1e1b4b', border: `1px solid #4338ca40`,
              borderRadius: 7, padding: '10px 12px',
            }}>
              <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', marginBottom: 6 }}>
                ✨ AI UNDERWRITING ANALYSIS
              </div>
              <p style={{ color: '#c7d2fe', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                {result.narrative}
              </p>
              {result.recommendedStrategies?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 5 }}>
                    RECOMMENDED STRATEGIES
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {getStrategyNames(result.recommendedStrategies).map((name, i) => (
                      <span key={i} style={{
                        background: '#312e81', border: '1px solid #4338ca50',
                        color: '#a5b4fc', borderRadius: 4, padding: '2px 8px', fontSize: 11,
                      }}>
                        {i + 1}. {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rule Score bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 600 }}>RULE COMPLIANCE SCORE</span>
              <span style={{ color: C.textSecond, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{result.ruleScore}/100</span>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${result.ruleScore}%`,
                background: result.ruleScore >= 70 ? C.teal : result.ruleScore >= 45 ? C.orange : C.red,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tier Section ─────────────────────────────────────────────────────────────
function TierSection({ tier, results, expandedId, onToggle, bestPathId }) {
  const [collapsed, setCollapsed] = useState(tier === 'disqualified');
  const cfg = TIER_CONFIG[tier];
  if (results.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 0', marginBottom: 10, width: '100%',
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dotColor, flexShrink: 0 }} />
        <span style={{
          color: cfg.color, fontSize: 11, fontWeight: 800,
          letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace",
        }}>
          {cfg.label}
        </span>
        <span style={{
          color: C.textMuted, fontSize: 11,
          fontFamily: "'DM Mono', monospace",
        }}>
          ({results.length})
        </span>
        <div style={{ flex: 1, height: 1, background: `${cfg.color}25` }} />
        <span style={{ color: C.textMuted, fontSize: 11, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(r => (
            <ProgramCard
              key={r.programId}
              result={r}
              isExpanded={expandedId === r.programId}
              onToggle={() => onToggle(r.programId)}
              isBestPath={r.programId === bestPathId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Primary Blocker Banner ───────────────────────────────────────────────────
function PrimaryBlockerBanner({ blocker, feasibility }) {
  if (!blocker) return null;
  const feasCfg = FEASIBILITY_CONFIG[feasibility] || FEASIBILITY_CONFIG.LOW;

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '14px 18px',
      marginBottom: 18,
      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
    }}>
      {/* Primary Blocker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 160 }}>
        <span style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
          PRIMARY BLOCKER
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            color: C.red, fontSize: 16, fontWeight: 800,
            fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em',
          }}>
            {blocker.rule}
          </span>
          <span style={{ color: C.textMuted, fontSize: 12 }}>blocks {blocker.count}/11 programs</span>
        </div>
        <span style={{ color: C.textSecond, fontSize: 12 }}>{blocker.label}</span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: C.border, alignSelf: 'stretch', minHeight: 40 }} />

      {/* Feasibility */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
          APPROVAL FEASIBILITY
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: feasCfg.bg, border: `1px solid ${feasCfg.color}50`,
            color: feasCfg.color,
            borderRadius: 5, padding: '3px 12px',
            fontSize: 14, fontWeight: 800,
            fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em',
          }}>
            {feasCfg.icon} {feasCfg.label}
          </span>
        </div>
        <span style={{ color: C.textMuted, fontSize: 11 }}>{feasCfg.desc}</span>
      </div>
    </div>
  );
}

// ─── Approval Probability Summary Bar ────────────────────────────────────────
function ProbabilitySummaryBar({ results }) {
  const top4 = results.filter(r => !r.disqualified).slice(0, 4);
  if (top4.length === 0) return null;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '14px 18px', marginBottom: 18,
    }}>
      <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>
        APPROVAL PROBABILITY — TOP PATHS (RULE ENGINE SEED · SONNET REFINES)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top4.map(r => {
          const tier    = r.eligible ? 'eligible' : 'conditional';
          const barColor = r.eligible
            ? C.teal
            : r.approvalProbability >= 40 ? C.orange : C.red;

          return (
            <div key={r.programId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0, width: 24 }}>{r.icon}</span>
              <span style={{ color: C.textSecond, fontSize: 12, fontWeight: 600, width: 130, flexShrink: 0 }}>
                {r.programName}
              </span>
              <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${r.approvalProbability}%`,
                  background: barColor,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <span style={{
                color: barColor, fontSize: 12, fontWeight: 700,
                fontFamily: "'DM Mono', monospace", width: 36, textAlign: 'right', flexShrink: 0,
              }}>
                {r.approvalProbability}%
              </span>
              {r.sonnetRefined && <DeltaChip delta={r.probabilityDelta} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function ProgramMigrationEngine({ profile, sonnetResults, sonnetLoading, onSelectProgram }) {
  const [expandedId, setExpandedId] = useState(null);

  // Run the rule engine
  const { ranked: rawRanked, primaryBlocker, feasibility } = useMemo(() => {
    if (!profile || !profile.fico) return { ranked: [], primaryBlocker: null, feasibility: 'LOW' };
    const ranked         = rankPrograms(profile);
    const primaryBlocker = identifyPrimaryBlocker(ranked);
    const feasibility    = assessFeasibility(ranked);
    return { ranked, primaryBlocker, feasibility };
  }, [profile]);

  // Merge Sonnet refinements on top of rule engine output
  const ranked = useMemo(
    () => mergeReasoningResults(rawRanked, sonnetResults),
    [rawRanked, sonnetResults]
  );

  // Use Sonnet feasibility/blocker if available, fall back to rule engine
  const displayFeasibility  = sonnetResults?.feasibility    || feasibility;
  const displayBlocker      = primaryBlocker;

  // Tier buckets
  const eligible     = ranked.filter(r => r.eligible);
  const conditional  = ranked.filter(r => r.conditional);
  const disqualified = ranked.filter(r => r.disqualified);

  // Best path = top non-disqualified program
  const bestPathId = ranked.find(r => !r.disqualified)?.programId;

  const handleToggle = (programId) => {
    const next = expandedId === programId ? null : programId;
    setExpandedId(next);
    if (next && onSelectProgram) {
      onSelectProgram(ranked.find(r => r.programId === programId));
    }
  };

  if (!profile || !profile.fico) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
        <div style={{ color: C.textSecond, fontSize: 14, fontWeight: 600 }}>
          Program Migration Engine
        </div>
        <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>
          Complete borrower profile to run program eligibility analysis
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      color: C.textPrimary,
    }}>
      {/* Section Title */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
      }}>
        <div style={{
          width: 3, height: 22, background: C.teal, borderRadius: 2, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.03em' }}>
          PROGRAM MIGRATION ENGINE
        </span>
        <span style={{
          color: C.textMuted, fontSize: 11,
          fontFamily: "'DM Mono', monospace",
        }}>
          {ranked.length} programs evaluated
        </span>
      </div>

      {/* Primary Blocker + Feasibility Banner */}
      <PrimaryBlockerBanner blocker={displayBlocker} feasibility={displayFeasibility} />

      {/* Probability Summary Bar */}
      <div style={{ position: 'relative' }}>
        <ProbabilitySummaryBar results={ranked} />
        {sonnetLoading && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(13,18,32,0.75)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              border: `2px solid ${C.teal}`, borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: C.textSecond, fontSize: 12 }}>Sonnet refining probabilities…</span>
          </div>
        )}
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Program Cards by Tier */}
      <TierSection
        tier="eligible"
        results={eligible}
        expandedId={expandedId}
        onToggle={handleToggle}
        bestPathId={bestPathId}
      />
      <TierSection
        tier="conditional"
        results={conditional}
        expandedId={expandedId}
        onToggle={handleToggle}
        bestPathId={bestPathId}
      />
      <TierSection
        tier="disqualified"
        results={disqualified}
        expandedId={expandedId}
        onToggle={handleToggle}
        bestPathId={null}
      />

      {/* Footer note */}
      <div style={{
        marginTop: 8, padding: '10px 14px',
        background: sonnetResults ? '#1e1b4b' : C.tealDim,
        border: `1px solid ${sonnetResults ? '#4338ca40' : C.teal + '25'}`,
        borderRadius: 7,
        color: C.textMuted, fontSize: 11,
      }}>
        {sonnetResults ? (
          <>
            <span style={{ color: '#818cf8', fontWeight: 700 }}>✨ AI Refined: </span>
            Probabilities refined by Sonnet AI with compensating factor reasoning.
            Deltas (▲▼) show change from rule engine seed. Hard gates remain absolute.
          </>
        ) : (
          <>
            <span style={{ color: C.teal, fontWeight: 700 }}>ℹ️ Note: </span>
            Probability percentages are deterministic rule engine seeds. Click "Run AI Analysis" above to refine
            with Sonnet compensating factor reasoning and AUS likelihood analysis.
          </>
        )}
      </div>
    </div>
  );
}
