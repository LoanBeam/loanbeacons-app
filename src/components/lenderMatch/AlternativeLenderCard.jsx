/**
 * ============================================================
 * LoanBeacons™ — Lender Match™
 * src/components/lenderMatch/AlternativeLenderCard.jsx
 * Redesigned Apr 2026 — platform light theme
 * All functionality preserved.
 * ============================================================
 */
import React, { useState } from 'react';

// ─── Eligibility Status ───────────────────────────────────────────────────────
const STATUS_CONFIG = {
  ELIGIBLE: {
    color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', label: 'ELIGIBLE',
  },
  'ELIGIBLE-PLACEHOLDER': {
    color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '✳️', label: 'ELIGIBLE*', note: 'Profile-Based Estimate',
  },
  CONDITIONAL: {
    color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '⚠️', label: 'CONDITIONAL',
  },
  INELIGIBLE: {
    color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '✗', label: 'INELIGIBLE',
  },
};

// ─── Program Meta ─────────────────────────────────────────────────────────────
const PROGRAM_META = {
  BankStatement12: { label: 'Bank Statement 12mo', color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: '🏦' },
  BankStatement24: { label: 'Bank Statement 24mo', color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: '🏦' },
  DSCR:            { label: 'DSCR',                color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', icon: '📊' },
  AssetDepletion:  { label: 'Asset Depletion',     color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: '💎' },
  NinetyNineOnly:  { label: '1099',                color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: '📋' },
  NoDoc:           { label: 'No-Doc',              color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: '📄' },
};

// ─── Risk ─────────────────────────────────────────────────────────────────────
const RISK_STYLE = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '🟢', label: 'LOW'  },
  MODERATE: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟡', label: 'MOD'  },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴', label: 'HIGH' },
};

// ─── Non-QM Score Breakdown ───────────────────────────────────────────────────
const NONQM_SEGMENTS = [
  { key: 'programMatchScore',    label: 'Program Match',     max: 30, color: '#0d9488' },
  { key: 'ficoScore',            label: 'FICO Cushion',      max: 20, color: '#3b82f6' },
  { key: 'ltvScore',             label: 'LTV Cushion',       max: 25, color: '#16a34a' },
  { key: 'profileStrengthScore', label: 'Profile Strength',  max: 10, color: '#8b5cf6' },
  { key: 'priorityScore',        label: 'Priority Weight',   max: 5,  color: '#d97706' },
  { key: 'dscrBonus',            label: 'DSCR Cushion Bonus',max: 3,  color: '#0d9488' },
  { key: 'assetBonus',           label: 'Asset Ratio Bonus', max: 3,  color: '#8b5cf6' },
];

const scoreColor = (s) => s >= 70 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626';
const fmt$ = (n) => n ? `$${Number(n).toLocaleString()}` : '—';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreArc({ score, maxPossible = 100, isPlaceholder }) {
  const size = 52, r = 21, circ = 2 * Math.PI * r;
  const fill = (score / maxPossible) * circ;
  const cx = 26, cy = 26;
  const color = scoreColor(score);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ - fill}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.55s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontFamily="'DM Mono', monospace" fontWeight="700"
          fontSize={score >= 100 ? '12' : '14'}>
          {score}
        </text>
      </svg>
      {isPlaceholder && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: 16, height: 16, borderRadius: '50%',
          backgroundColor: '#fffbeb', border: '1px solid #fde68a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, color: '#d97706', fontWeight: 700,
        }} title="Placeholder cap: max 90 pts">90</div>
      )}
      <div style={{
        position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
        fontSize: 8, fontFamily: "'DM Mono', monospace", color: '#94a3b8', whiteSpace: 'nowrap',
      }}>FIT</div>
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

function DataSourceBadge({ isPlaceholder }) {
  return isPlaceholder ? (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs font-bold font-mono text-amber-600">
      📋 Placeholder Profile
    </div>
  ) : (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-50 border border-green-200 rounded text-xs font-bold font-mono text-green-600">
      ✅ Verified Lender Data
    </div>
  );
}

function PlaceholderCardBanner() {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 bg-amber-50 border-t border-amber-200 border-l-4 border-l-amber-400 text-xs text-amber-800">
      <span className="flex-shrink-0 mt-0.5">⚠️</span>
      <span><strong className="text-amber-700">Generic profile — not a specific lender.</strong> Guidelines are estimated market baselines. Confirm all terms directly before quoting.</span>
    </div>
  );
}

function DSCRPanel({ result }) {
  const { breakdown } = result;
  if (!breakdown) return null;
  const dscr = result.dscr ?? null;
  const minDSCR = result.breakdown?.minDSCR ?? null;
  const cushion = dscr != null && minDSCR != null ? (dscr - minDSCR).toFixed(2) : null;
  const cashflow = dscr >= 1.25 ? 'Strong' : dscr >= 1.10 ? 'Moderate' : dscr >= 1.00 ? 'Break-even' : 'Negative';
  const cashflowColor = dscr >= 1.25 ? '#16a34a' : dscr >= 1.00 ? '#d97706' : '#dc2626';
  return (
    <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl">
      <div className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-3">📊 DSCR Qualifying Details</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        <Metric label="Your DSCR"    value={dscr?.toFixed(2) ?? '—'}    color="#0d9488" />
        <Metric label="Min Required" value={minDSCR?.toFixed(2) ?? '—'} color="#64748b" />
        {cushion && <Metric label="Cushion" value={`+${cushion}`} color={parseFloat(cushion) >= 0.15 ? '#16a34a' : '#d97706'} />}
        <Metric label="Cashflow" value={cashflow} color={cashflowColor} />
      </div>
      <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">No personal income documentation required. Qualification is based entirely on property rental income vs. PITIA.</p>
    </div>
  );
}

function AssetDepletionPanel({ result }) {
  const reasonsText = (result.passReasons || []).join(' ');
  const totalAssets = result.totalAssets ?? null;
  const incomeMatch = reasonsText.match(/\$([\d,]+)\/mo qualifying/);
  const monthlyQual = incomeMatch ? incomeMatch[1] : null;
  const depMonths = result.depletionMonths ?? null;
  return (
    <div className="p-3.5 bg-violet-50 border border-violet-200 rounded-xl">
      <div className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-3">💎 Asset Depletion Qualifying Details</div>
      <div className="grid gap-3 mb-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {totalAssets && <Metric label="Total Qualifying Assets"   value={fmt$(totalAssets)}        color="#8b5cf6" />}
        {depMonths   && <Metric label="Depletion Term"            value={`${depMonths} months`}   color="#64748b" />}
        {monthlyQual && <Metric label="Monthly Qualifying Income" value={`$${monthlyQual}/mo`}    color="#16a34a" />}
      </div>
      {totalAssets && depMonths && (
        <div className="px-3 py-2 bg-violet-100 border border-violet-200 rounded-lg text-xs font-mono text-violet-600">
          {fmt$(totalAssets)} ÷ {depMonths} mo
          {monthlyQual && <span className="text-green-600 ml-2">= ${monthlyQual}/mo qualifying income</span>}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">Income is derived from documented liquid assets — no employment verification required.</p>
    </div>
  );
}

function BankStatementPanel({ result }) {
  const months = result.program === 'BankStatement24' ? 24 : 12;
  return (
    <div className="p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
      <div className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-3">🏦 Bank Statement Qualifying Details</div>
      <div className="grid grid-cols-3 gap-3 mb-2.5">
        <Metric label="Statement Period" value={`${months} months`} color="#f97316" />
        <Metric label="Expense Factor"   value="50% of deposits"   color="#64748b" />
        <Metric label="Income Source"    value="Deposits × 50%"    color="#64748b" />
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">W2s and tax returns not required. Income is calculated from {months} months of bank deposit history — ideal for self-employed borrowers with strong cash flow but lower reported taxable income.</p>
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div>
      <div className="text-xs text-slate-400 font-mono mb-1 tracking-wide">{label}</div>
      <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function ConditionalFlagChips({ flags }) {
  if (!flags?.length) return null;
  const FLAG_LABELS = {
    SHORT_TERM_RENTAL_NOT_ACCEPTED: { label: 'Short-term rental not accepted by this profile', icon: '🏠' },
    HIGH_DTI: { label: 'DTI may exceed profile comfort zone', icon: '📉' },
  };
  const renderFlag = (flag, i) => {
    const custom = FLAG_LABELS[flag];
    if (!custom && flag.startsWith('RESERVES_BELOW_MINIMUM_')) {
      const mo = flag.replace('RESERVES_BELOW_MINIMUM_', '').replace('MO', '');
      return <FlagChip key={i} icon="💰" label={`Reserves may be below ${mo}-month minimum`} />;
    }
    if (!custom && flag.startsWith('CASH_OUT_MAY_EXCEED_CAP_')) {
      const cap = flag.replace('CASH_OUT_MAY_EXCEED_CAP_', '');
      return <FlagChip key={i} icon="💸" label={`Cash-out amount may exceed $${cap} cap`} />;
    }
    return custom
      ? <FlagChip key={i} icon={custom.icon} label={custom.label} />
      : <FlagChip key={i} icon="⚠️" label={flag.replace(/_/g, ' ')} />;
  };
  return (
    <div>
      <SectionLabel>Advisory Flags</SectionLabel>
      <div className="space-y-1.5">{flags.map(renderFlag)}</div>
    </div>
  );
}

function FlagChip({ icon, label }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded-lg text-xs text-amber-800 leading-snug">
      <span className="flex-shrink-0">{icon}</span>{label}
    </div>
  );
}

function NonQMScoreBreakdown({ breakdown, maxPossible, isPlaceholder }) {
  if (!breakdown) return null;
  const segments = NONQM_SEGMENTS.filter(seg => breakdown[seg.key] != null && breakdown[seg.key] > 0);
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 gap-px mb-3">
        {segments.map((seg, i) => {
          const frac = (breakdown[seg.key] / maxPossible) * 100;
          return frac > 0 ? (
            <div key={seg.key} style={{ width: `${frac}%`, backgroundColor: seg.color }} title={`${seg.label}: ${breakdown[seg.key]}/${seg.max}`} />
          ) : null;
        })}
        {isPlaceholder && (
          <div style={{ width: `${(10 / maxPossible) * 100}%`, backgroundColor: '#e2e8f0' }} title="Placeholder cap: max 90/100" />
        )}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-slate-400 font-mono flex-1 truncate">{seg.label}</span>
            <span className="text-xs font-bold font-mono flex-shrink-0" style={{ color: seg.color }}>
              {breakdown[seg.key]}<span className="text-slate-300 font-normal">/{seg.max}</span>
            </span>
          </div>
        ))}
      </div>
      {(breakdown.ficoCushion != null || breakdown.ltvCushion != null) && (
        <div className="mt-2.5 flex gap-4 flex-wrap p-2 bg-slate-50 rounded-lg border border-slate-100">
          {breakdown.ficoCushion != null && (
            <CushionPill label="FICO" value={`+${breakdown.ficoCushion} pts`}
              color={breakdown.ficoCushion >= 60 ? '#16a34a' : breakdown.ficoCushion >= 20 ? '#d97706' : '#94a3b8'} />
          )}
          {breakdown.ltvCushion != null && (
            <CushionPill label="LTV" value={`${breakdown.ltvCushion.toFixed(1)}%`}
              color={breakdown.ltvCushion >= 8 ? '#16a34a' : breakdown.ltvCushion >= 3 ? '#d97706' : '#94a3b8'} />
          )}
          {breakdown.applicableMaxLTV != null && (
            <CushionPill label="Max LTV" value={`${breakdown.applicableMaxLTV}%`} color="#94a3b8" />
          )}
        </div>
      )}
      {isPlaceholder && (
        <div className="mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono text-amber-600">
          ⚠ Placeholder cap: max 90 pts — real verified lenders score up to 100
        </div>
      )}
    </div>
  );
}

function CushionPill({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400 font-mono">{label}</span>
      <span className="text-xs font-bold font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function NarrativeBlock({ narrative }) {
  if (!narrative) return null;
  return (
    <div className="px-4 py-3 bg-blue-50 border border-blue-200 border-l-4 border-l-blue-400 rounded-lg">
      <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1.5">Why This Path</div>
      <p className="text-sm text-slate-600 leading-relaxed m-0">{narrative}</p>
    </div>
  );
}

function PassReasons({ reasons }) {
  if (!reasons?.length) return null;
  return (
    <div className="space-y-1.5">
      {reasons.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-slate-500 leading-snug">
          <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>{r}
        </div>
      ))}
    </div>
  );
}

function ProfileStrengths({ strengths, weaknesses }) {
  if (!strengths?.length && !weaknesses?.length) return null;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: strengths?.length && weaknesses?.length ? '1fr 1fr' : '1fr' }}>
      {strengths?.length > 0 && (
        <div>
          <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">Strengths</div>
          {strengths.map((s, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-500 mb-1.5 leading-snug">
              <span className="text-green-500 font-bold flex-shrink-0">+</span>{s}
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

function TypicalUseCase({ text }) {
  if (!text) return null;
  return (
    <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Typical Use Case</div>
      <p className="text-xs text-slate-500 leading-relaxed m-0">{text}</p>
    </div>
  );
}

function DisclaimerFooter({ disclaimer }) {
  if (!disclaimer) return null;
  return (
    <div className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-400 italic leading-relaxed">
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

  const progMeta   = PROGRAM_META[program] || PROGRAM_META.DSCR;
  const risk       = RISK_STYLE[overlayRisk] || RISK_STYLE.LOW;
  const scoreMax   = maxPossible ?? (isPlaceholder ? 90 : 100);
  const fScore     = fitScore || 0;
  const sColor     = scoreColor(fScore);
  const isEligible = eligible && eligibilityStatus !== 'INELIGIBLE';

  const statusKey = isPlaceholder && eligibilityStatus === 'ELIGIBLE' ? 'ELIGIBLE-PLACEHOLDER' : eligibilityStatus;
  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.CONDITIONAL;

  const borderColor = isSelected ? '#f97316' : isPlaceholder ? '#d97706' : progMeta.color;

  const showDSCRPanel     = eligible && program === 'DSCR';
  const showAssetPanel    = eligible && program === 'AssetDepletion';
  const showBankStmtPanel = eligible && (program === 'BankStatement12' || program === 'BankStatement24');

  return (
    <div
      className={`transition-all border-t border-slate-100 ${
        isSelected ? 'bg-orange-50' : isPlaceholder ? 'bg-amber-50/30' : expanded ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
      }`}
      style={{ borderLeft: `3px solid ${borderColor}`, animationDelay: animationDelay || '0ms' }}
    >
      {/* ── COLLAPSED ROW ── */}
      <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}>

        {/* Program icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg border"
          style={{ backgroundColor: isPlaceholder ? '#fffbeb' : progMeta.bg, borderColor: isPlaceholder ? '#fde68a' : progMeta.border }}>
          {progMeta.icon}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800 truncate max-w-[220px]">{lenderName}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded border font-mono"
              style={{ backgroundColor: progMeta.bg, borderColor: progMeta.border, color: progMeta.color }}>
              {progMeta.label}
            </span>
            <span className="text-xs px-2 py-0.5 rounded border font-mono"
              style={{ backgroundColor: isPlaceholder ? '#fffbeb' : '#f8fafc', borderColor: isPlaceholder ? '#fde68a' : '#e2e8f0', color: isPlaceholder ? '#d97706' : '#94a3b8' }}>
              {tierBasis} Profile
            </span>
          </div>
          {tierNotes && !expanded && (
            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{tierNotes}</div>
          )}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold font-mono border"
            style={{ backgroundColor: risk.bg, borderColor: risk.border, color: risk.color }}
            title={`Overlay Risk: ${overlayRisk}${overlaySignals?.length ? ` — ${overlaySignals.join(', ')}` : ''}`}>
            {risk.icon} {risk.label}
          </div>

          <ScoreArc score={fScore} maxPossible={scoreMax} isPlaceholder={isPlaceholder} />

          <div className="text-xs font-bold px-2.5 py-1 rounded border font-mono"
            style={{ backgroundColor: statusCfg.bg, borderColor: statusCfg.border, color: statusCfg.color }}>
            {statusCfg.icon} {statusCfg.label}
          </div>

          <div className="text-slate-300 w-4 text-center flex-shrink-0 hover:text-slate-500 transition-colors"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            ▾
          </div>
        </div>
      </div>

      {/* Placeholder banner — collapsed */}
      {isPlaceholder && !expanded && <PlaceholderCardBanner />}

      {/* ── EXPANDED PANEL ── */}
      {expanded && (
        <div className="border-t border-slate-100 p-5 space-y-5 bg-white">

          {isPlaceholder && <PlaceholderCardBanner />}

          {eligibilityStatus === 'CONDITIONAL' && isPlaceholder && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
              <strong className="text-amber-700">Conditional Eligibility — </strong>
              This profile's guidelines are estimated. Eligibility cannot be confirmed without verified lender data. Treat as a directional indicator only.
            </div>
          )}

          <div>
            <SectionLabel right={
              <span className="font-mono font-bold text-base" style={{ color: sColor }}>
                {fScore}<span className="text-slate-300 font-normal text-xs"> /{scoreMax}</span>
              </span>
            }>Score Breakdown</SectionLabel>
            <NonQMScoreBreakdown breakdown={breakdown} maxPossible={scoreMax} isPlaceholder={isPlaceholder} />
          </div>

          {showDSCRPanel     && <DSCRPanel result={result} />}
          {showAssetPanel    && <AssetDepletionPanel result={result} />}
          {showBankStmtPanel && <BankStatementPanel result={result} />}

          {narrative && <NarrativeBlock narrative={narrative} />}

          {passReasons?.length > 0 && (
            <div>
              <SectionLabel>Eligibility Factors</SectionLabel>
              <PassReasons reasons={passReasons} />
            </div>
          )}

          {conditionalFlags?.length > 0 && <ConditionalFlagChips flags={conditionalFlags} />}

          {(strengths?.length > 0 || weaknesses?.length > 0) && (
            <div>
              <SectionLabel>Profile Characteristics</SectionLabel>
              <ProfileStrengths strengths={strengths} weaknesses={weaknesses} />
            </div>
          )}

          {typicalUseCase && <TypicalUseCase text={typicalUseCase} />}

          <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <DataSourceBadge isPlaceholder={isPlaceholder} />
              {guidelineVersionRef && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-400">
                  {isPlaceholder ? '⚠' : '✓'} {guidelineVersionRef}
                </div>
              )}
            </div>
            {isEligible && (
              <button
                onClick={e => { e.stopPropagation(); if (!isSelected) onSelectLender(result); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  isSelected
                    ? 'bg-orange-50 text-orange-600 border-orange-300 cursor-default'
                    : 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500 shadow-sm'
                }`}
              >
                {isSelected ? <>★ Selected — View Decision Record</> : <>◎ Log This Path</>}
              </button>
            )}
          </div>

          {isPlaceholder && disclaimer && <DisclaimerFooter disclaimer={disclaimer} />}

        </div>
      )}
    </div>
  );
}

export default AlternativeLenderCard;
