/**
 * ============================================================
 * LoanBeacons™ — Lender Match™
 * src/components/lenderMatch/LenderScorecardCard.jsx
 * Redesigned Apr 2026 — platform light theme
 * All functionality preserved.
 * ============================================================
 */
import React, { useState } from 'react';

// ─── Score helpers ────────────────────────────────────────────────────────────
const scoreColor = (s) =>
  s >= 75 ? '#16a34a' : s >= 55 ? '#d97706' : '#dc2626';

const BREAKDOWN_SEGMENTS = [
  { key: 'ficoScore',            label: 'FICO Cushion',     max: 25, color: '#3b82f6' },
  { key: 'ltvScore',             label: 'LTV Cushion',      max: 20, color: '#16a34a' },
  { key: 'dtiScore',             label: 'DTI Cushion',      max: 20, color: '#8b5cf6' },
  { key: 'programStrengthScore', label: 'Program Strength', max: 20, color: '#f97316' },
  { key: 'priorityScore',        label: 'Priority Weight',  max: 15, color: '#d97706' },
];

const RISK_STYLE = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '🟢', label: 'LOW'  },
  MODERATE: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟡', label: 'MOD'  },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴', label: 'HIGH' },
};

const PROGRAM_COLOR = {
  Conventional: '#3b82f6',
  FHA:          '#f97316',
  VA:           '#8b5cf6',
};

const TIER_STYLE = {
  'Premier Platform':   { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Solid Platform':     { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'Good Platform':      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  'Standard Platform':  { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  'Specialty Platform': { color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreArc({ score, maxScore = 100, size = 52 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const filled = (score / maxScore) * circ;
  const color = scoreColor(score);
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)' }}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontFamily="'DM Mono', monospace" fontWeight="700"
        fontSize={score >= 100 ? '13' : '15'}>
        {score}
      </text>
    </svg>
  );
}

function ScoreBreakdownBar({ breakdown, maxPossible = 100 }) {
  if (!breakdown) return null;
  const segments = BREAKDOWN_SEGMENTS.filter(seg => breakdown[seg.key] !== undefined);
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 gap-px mb-3">
        {segments.map(seg => {
          const frac = (breakdown[seg.key] || 0) / maxPossible * 100;
          return frac > 0 ? (
            <div key={seg.key} style={{ width: `${frac}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${breakdown[seg.key]}/${seg.max}`} />
          ) : null;
        })}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {segments.map(seg => {
          const val = breakdown[seg.key] || 0;
          return (
            <div key={seg.key} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs text-slate-400 flex-1 truncate font-mono">{seg.label}</span>
              <span className="text-xs font-bold font-mono flex-shrink-0" style={{ color: val > 0 ? seg.color : '#94a3b8' }}>
                {val}<span className="text-slate-300 font-normal">/{seg.max}</span>
              </span>
            </div>
          );
        })}
      </div>
      {(breakdown.ficoCushion !== undefined || breakdown.ltvCushion !== undefined || breakdown.dtiCushion !== undefined) && (
        <div className="mt-2.5 flex gap-4 flex-wrap p-2 bg-slate-50 rounded-lg border border-slate-100">
          {breakdown.ficoCushion !== undefined && (
            <CushionChip label="FICO cushion" value={`+${breakdown.ficoCushion} pts`}
              color={breakdown.ficoCushion >= 80 ? '#16a34a' : breakdown.ficoCushion >= 30 ? '#d97706' : '#94a3b8'} />
          )}
          {breakdown.ltvCushion !== undefined && (
            <CushionChip label="LTV cushion" value={`${breakdown.ltvCushion.toFixed(1)}%`}
              color={breakdown.ltvCushion >= 10 ? '#16a34a' : breakdown.ltvCushion >= 4 ? '#d97706' : '#94a3b8'} />
          )}
          {breakdown.dtiCushion !== undefined && (
            <CushionChip label="DTI cushion" value={`${breakdown.dtiCushion.toFixed(1)}%`}
              color={breakdown.dtiCushion >= 10 ? '#16a34a' : breakdown.dtiCushion >= 4 ? '#d97706' : '#94a3b8'} />
          )}
        </div>
      )}
    </div>
  );
}

function CushionChip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400 font-mono">{label}</span>
      <span className="text-xs font-bold font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function PassReasonsList({ reasons }) {
  if (!reasons?.length) return null;
  return (
    <div className="space-y-1.5">
      {reasons.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-slate-500 leading-snug">
          <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
          {r}
        </div>
      ))}
    </div>
  );
}

function StrengthsWeaknesses({ strengths, weaknesses }) {
  if (!strengths?.length && !weaknesses?.length) return null;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: strengths?.length && weaknesses?.length ? '1fr 1fr' : '1fr' }}>
      {strengths?.length > 0 && (
        <div>
          <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">Strengths</div>
          {strengths.map((s, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-500 mb-1.5 leading-snug">
              <span className="text-green-500 flex-shrink-0 font-bold">+</span>{s}
            </div>
          ))}
        </div>
      )}
      {weaknesses?.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Considerations</div>
          {weaknesses.map((w, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-400 mb-1.5 leading-snug">
              <span className="flex-shrink-0">—</span>{w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramNotes({ notes }) {
  if (!notes?.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((note, i) => (
        <div key={i} className="flex gap-2 items-start px-3 py-2 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded-lg text-xs text-amber-800 leading-snug">
          <span className="flex-shrink-0 text-amber-500">ℹ</span>{note}
        </div>
      ))}
    </div>
  );
}

function NarrativeBlock({ narrative }) {
  if (!narrative) return null;
  return (
    <div className="px-4 py-3 bg-blue-50 border border-blue-200 border-l-4 border-l-blue-400 rounded-lg">
      <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1.5">Why This Lender</div>
      <p className="text-sm text-slate-600 leading-relaxed m-0">{narrative}</p>
    </div>
  );
}

function GuidelineRefBadge({ guidelineRef }) {
  if (!guidelineRef) return null;
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-400">
      <span className="text-green-500">✓</span>{guidelineRef}
    </div>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{children}</span>
      {right}
    </div>
  );
}

function OverlaySignalsList({ signals, level }) {
  const risk = RISK_STYLE[level] || RISK_STYLE.MODERATE;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map((s, i) => (
        <span key={i} className="text-xs font-mono px-2 py-1 rounded border"
          style={{ backgroundColor: risk.bg, borderColor: risk.border, color: risk.color }}>
          {s}
        </span>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function LenderScorecardCard({ result, onSelectLender, isSelected, animationDelay }) {
  const [expanded, setExpanded] = useState(false);
  if (!result) return null;

  const {
    lenderName, shortName, program, fitScore, breakdown,
    eligible, passReasons, overlayRisk, overlaySignals,
    tier, tierNotes, strengths, weaknesses, narrative,
    notes, guidelineVersionRef, accentColor,
  } = result;

  const risk      = RISK_STYLE[overlayRisk] || RISK_STYLE.LOW;
  const progColor = PROGRAM_COLOR[program]  || '#3b82f6';
  const tierStyle = TIER_STYLE[tier]        || TIER_STYLE['Solid Platform'];
  const fScore    = fitScore || 0;
  const scoreClr  = scoreColor(fScore);

  const initials = (shortName || lenderName || '?')
    .split(/[\s/]/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();

  const borderColor = isSelected ? '#f97316' : (accentColor || progColor);

  return (
    <div
      className={`transition-all border-t border-slate-100 ${expanded ? 'bg-slate-50' : isSelected ? 'bg-orange-50' : 'bg-white hover:bg-slate-50'}`}
      style={{ borderLeft: `3px solid ${borderColor}`, animationDelay: animationDelay || '0ms' }}
    >
      {/* ── COLLAPSED ROW ── */}
      <div className="flex items-center gap-3 px-4 py-3.5">

        {/* Avatar */}
        <div
          onClick={() => setExpanded(e => !e)}
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold cursor-pointer"
          style={{ background: `linear-gradient(135deg, ${accentColor || progColor}, ${accentColor || progColor}99)` }}
        >
          {initials}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{lenderName}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded border font-mono"
              style={{ backgroundColor: `${progColor}15`, borderColor: `${progColor}40`, color: progColor }}>
              {program}
            </span>
            {tier && (
              <span className="text-xs px-2 py-0.5 rounded border font-mono"
                style={{ backgroundColor: tierStyle.bg, borderColor: tierStyle.border, color: tierStyle.color }}>
                {tier}
              </span>
            )}
          </div>
          {tierNotes && !expanded && (
            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{tierNotes}</div>
          )}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Risk badge */}
          <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold font-mono border"
            style={{ backgroundColor: risk.bg, borderColor: risk.border, color: risk.color }}
            title={`Overlay Risk: ${overlayRisk}${overlaySignals?.length ? ` (${overlaySignals.join(', ')})` : ''}`}>
            {risk.icon} {risk.label}
          </div>

          {/* Score arc */}
          <div className="relative">
            <ScoreArc score={fScore} maxScore={100} size={50} />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-slate-400 font-mono" style={{ fontSize: 8 }}>FIT</div>
          </div>

          {/* Eligible badge */}
          <div className="text-xs font-bold px-2.5 py-1 rounded border font-mono bg-green-50 border-green-200 text-green-700">
            ELIGIBLE
          </div>

          {/* Select button */}
          <button
            onClick={e => { e.stopPropagation(); if (!isSelected) onSelectLender(result); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              isSelected
                ? 'bg-orange-50 text-orange-600 border-orange-300 cursor-default'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-orange-500 hover:text-white hover:border-orange-500'
            }`}
          >
            {isSelected ? <>★ Selected</> : <>◎ Select</>}
          </button>

          {/* Chevron */}
          <div
            className="text-slate-300 cursor-pointer hover:text-slate-500 transition-colors w-4 text-center flex-shrink-0"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
            onClick={() => setExpanded(e => !e)}
          >
            ▾
          </div>
        </div>
      </div>

      {/* ── EXPANDED PANEL ── */}
      {expanded && (
        <div className="border-t border-slate-100 p-5 space-y-5 bg-white">

          {/* Score breakdown */}
          <div>
            <SectionLabel right={
              <span className="font-mono font-bold text-base" style={{ color: scoreClr }}>
                {fScore}<span className="text-slate-300 font-normal text-xs"> /100</span>
              </span>
            }>Score Breakdown</SectionLabel>
            <ScoreBreakdownBar breakdown={breakdown} maxPossible={100} />
          </div>

          {narrative && <NarrativeBlock narrative={narrative} />}

          {passReasons?.length > 0 && (
            <div>
              <SectionLabel>Eligibility Factors</SectionLabel>
              <PassReasonsList reasons={passReasons} />
            </div>
          )}

          <div className="grid gap-5" style={{ gridTemplateColumns: notes?.length ? '1fr 1fr' : '1fr' }}>
            {(strengths?.length > 0 || weaknesses?.length > 0) && (
              <div>
                <SectionLabel>Lender Profile</SectionLabel>
                <StrengthsWeaknesses strengths={strengths} weaknesses={weaknesses} />
              </div>
            )}
            {notes?.length > 0 && (
              <div>
                <SectionLabel>Program Notes</SectionLabel>
                <ProgramNotes notes={notes} />
              </div>
            )}
          </div>

          {overlaySignals?.length > 0 && (
            <div>
              <SectionLabel>Risk Signals</SectionLabel>
              <OverlaySignalsList signals={overlaySignals} level={overlayRisk} />
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-slate-100">
            <GuidelineRefBadge guidelineRef={guidelineVersionRef} />
            <button
              onClick={e => { e.stopPropagation(); if (!isSelected) onSelectLender(result); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                isSelected
                  ? 'bg-orange-50 text-orange-600 border-orange-300 cursor-default'
                  : 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500 shadow-sm'
              }`}
            >
              {isSelected ? <>★ Selected — View Decision Record</> : <>◎ Select This Lender</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LenderScorecardCard;
