/**
 * ============================================================
 * LoanBeacons™ — Lender Match™
 * src/components/lenderMatch/DecisionRecordModal.jsx
 * Redesigned Apr 2026 — light theme + borrower identification
 * ============================================================
 */
import React, { useState, useEffect, useRef } from 'react';

const OVERLAY_COLORS = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  MODERATE: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};

const fmt$ = (n) => n ? `$${Number(n).toLocaleString()}` : '—';

function buildScenarioRows(snap) {
  if (!snap) return [];
  return [
    { label: 'Transaction Type', value: snap.transactionType || 'purchase' },
    { label: 'Loan Amount',      value: fmt$(snap.loanAmount),        mono: true },
    { label: 'Property Value',   value: fmt$(snap.propertyValue),     mono: true },
    { label: 'Credit Score',     value: snap.creditScore?.toString(), mono: true },
    { label: 'LTV',              value: snap.ltv  ? `${snap.ltv}%`  : '—', mono: true },
    { label: 'DTI',              value: snap.dti  ? `${snap.dti}%`  : '—', mono: true },
    { label: 'DSCR',             value: snap.dscr ? snap.dscr.toFixed(2) : null, mono: true },
    { label: 'Property Type',    value: snap.propertyType },
    { label: 'Occupancy',        value: snap.occupancy },
    { label: 'State',            value: snap.state },
    { label: 'Income Doc',       value: snap.incomeDocType },
    { label: 'Self-Employed',    value: snap.selfEmployed ? 'Yes' : 'No' },
    { label: 'Credit Event',     value: snap.creditEvent !== 'none' ? `${snap.creditEvent} (${snap.creditEventMonths} months)` : 'None' },
    { label: 'Reserves',         value: snap.reservesMonths ? `${snap.reservesMonths} months` : '—' },
    { label: 'Total Assets',     value: snap.totalAssets ? fmt$(snap.totalAssets) : null, mono: true },
  ].filter(r => r.value && r.value !== '—' && r.value !== 'null');
}

function buildClipboardText(record, result) {
  const s = record.scenarioSnapshot || {};
  const borrower = resolveBorrowerName(record);
  const lines = [
    'LOANBEACONS — DECISION RECORD™',
    borrower !== 'Borrower not identified' ? `Borrower: ${borrower}` : '',
    `Selected: ${record.profileName || record.selectedLenderId}`,
    `Program:  ${result?.program || '—'}`,
    `Status:   ${record.eligibilityStatus}`,
    `Fit Score: ${record.fitScore} / ${result?.isPlaceholder ? 90 : 100}`,
    `Overlay Risk: ${record.overlayRisk}`,
    `Confidence: ${Math.round((record.confidenceScore ?? 0) * 100)}%`,
    `Data Source: ${record.dataSource}`,
    `Guideline Ref: ${record.guidelineVersionRef}`,
    `Selected At: ${record.selectedAt}`,
    '',
    'SCENARIO',
    `Loan Amount: $${Number(s.loanAmount || 0).toLocaleString()}`,
    `Property Value: $${Number(s.propertyValue || 0).toLocaleString()}`,
    `Credit Score: ${s.creditScore}`,
    `LTV: ${s.ltv}%`,
    `DTI: ${s.dti}%`,
    `Property: ${s.propertyType} / ${s.occupancy}`,
    `State: ${s.state}`,
    `Income Doc: ${s.incomeDocType}`,
    '',
    'ELIGIBILITY FACTORS',
    ...(record.reasonsSnapshot || []).map(r => `  • ${r}`),
  ].filter(l => l !== undefined);
  return lines.join('\n');
}

// Resolve borrower name from multiple possible field locations
function resolveBorrowerName(record) {
  const s = record.scenarioSnapshot || {};

  // Try full name fields first
  if (record.borrowerName)           return record.borrowerName;
  if (s.borrowerName)                return s.borrowerName;

  // Try first + last combo
  const first = record.borrowerFirstName || s.borrowerFirstName || s.firstName || '';
  const last  = record.borrowerLastName  || s.borrowerLastName  || s.lastName  || '';
  if (first || last) return `${first} ${last}`.trim();

  // Try address as fallback context
  if (s.propertyAddress || s.address) return null;

  return null;
}

function resolvePropertyAddress(record) {
  const s = record.scenarioSnapshot || {};
  return s.propertyAddress || s.address || s.subjectProperty || null;
}

function FieldRow({ label, value, mono }) {
  if (value == null || value === '') return null;
  return (
    <div className="grid gap-2 py-2 border-b border-slate-100 last:border-0"
      style={{ gridTemplateColumns: '140px 1fr' }}>
      <span className="text-xs font-mono text-slate-400 tracking-wide pt-0.5">{label}</span>
      <span className={`${mono ? 'font-mono text-xs' : 'text-sm'} text-slate-700 leading-snug break-words`}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100 mb-0">
        {title}
      </div>
      {children}
    </div>
  );
}

function ScoreTile({ value, label, color, bg, border }) {
  const isLong = typeof value === 'string' && value.length > 9;
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl border flex-1 min-w-0"
      style={{ backgroundColor: bg, borderColor: border }}>
      <span className={`font-mono font-bold leading-none mb-1 text-center ${isLong ? 'text-xs' : 'text-2xl'}`}
        style={{ color }}>
        {value}
      </span>
      <span className="text-xs font-mono text-slate-400 tracking-wider text-center leading-tight">{label}</span>
    </div>
  );
}

export function DecisionRecordModal({ record, result, saved, saving, onSave, onClose }) {
  const [copied, setCopied] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => { modalRef.current?.focus(); }, []);

  if (!record) return null;

  const isPlaceholder  = record.dataSource === 'PLACEHOLDER';
  const scoreMax       = isPlaceholder ? 90 : 100;
  const riskCfg        = OVERLAY_COLORS[record.overlayRisk] || OVERLAY_COLORS.LOW;
  const confidencePct  = Math.round((record.confidenceScore ?? 0) * 100);
  const scoreRows      = buildScenarioRows(record.scenarioSnapshot);

  const borrowerName   = resolveBorrowerName(record);
  const propertyAddr   = resolvePropertyAddress(record);
  const snap           = record.scenarioSnapshot || {};

  const fitColor = record.fitScore >= 75 ? '#16a34a' : record.fitScore >= 55 ? '#d97706' : '#dc2626';
  const fitBg    = record.fitScore >= 75 ? '#f0fdf4' : record.fitScore >= 55 ? '#fffbeb' : '#fef2f2';
  const fitBdr   = record.fitScore >= 75 ? '#bbf7d0' : record.fitScore >= 55 ? '#fde68a' : '#fecaca';

  const eligColor  = record.eligibilityStatus === 'ELIGIBLE' ? '#16a34a' : record.eligibilityStatus === 'CONDITIONAL' ? '#d97706' : '#dc2626';
  const eligBg     = record.eligibilityStatus === 'ELIGIBLE' ? '#f0fdf4' : record.eligibilityStatus === 'CONDITIONAL' ? '#fffbeb' : '#fef2f2';
  const eligBorder = record.eligibilityStatus === 'ELIGIBLE' ? '#bbf7d0' : record.eligibilityStatus === 'CONDITIONAL' ? '#fde68a' : '#fecaca';

  const confColor = confidencePct >= 85 ? '#16a34a' : confidencePct >= 60 ? '#d97706' : '#dc2626';
  const confBg    = confidencePct >= 85 ? '#f0fdf4' : confidencePct >= 60 ? '#fffbeb' : '#fef2f2';
  const confBdr   = confidencePct >= 85 ? '#bbf7d0' : confidencePct >= 60 ? '#fde68a' : '#fecaca';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildClipboardText(record, result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998, backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Decision Record"
        style={{
          position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, width: 'min(680px, 96vw)', maxHeight: 'calc(100vh - 72px)',
          display: 'flex', flexDirection: 'column',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(15,23,42,0.20), 0 0 0 1px rgba(15,23,42,0.06)',
          outline: 'none',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-lg flex-shrink-0">
              📌
            </div>
            <div>
              <div className="font-bold text-slate-800 text-base leading-tight"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                Decision Record™
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                {record.selectedAt ? new Date(record.selectedAt).toLocaleString() : 'Sealed at selection'}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-xl font-light flex-shrink-0">
            ×
          </button>
        </div>

        {/* ── BORROWER IDENTIFICATION BANNER ── */}
        <div className={`flex items-center gap-4 px-5 py-3.5 border-b flex-shrink-0 ${
          borrowerName ? 'bg-slate-800 border-slate-700' : 'bg-amber-50 border-amber-200'
        }`}>
          {borrowerName ? (
            <>
              <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {borrowerName.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm">{borrowerName}</div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {snap.state && (
                    <span className="text-slate-400 text-xs font-mono">{snap.state}</span>
                  )}
                  {snap.creditScore && (
                    <span className="text-slate-400 text-xs font-mono">{snap.creditScore} FICO</span>
                  )}
                  {snap.loanAmount && (
                    <span className="text-slate-400 text-xs font-mono">{fmt$(snap.loanAmount)}</span>
                  )}
                  {propertyAddr && (
                    <span className="text-slate-400 text-xs font-mono truncate max-w-xs">{propertyAddr}</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 text-xs font-mono text-slate-500 bg-slate-700 px-2.5 py-1 rounded-full">
                {snap.transactionType || 'purchase'}
              </div>
            </>
          ) : (
            <>
              <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <div className="text-amber-700 text-sm font-semibold">Borrower not identified</div>
                <div className="text-amber-600 text-xs mt-0.5">
                  No borrower name was found in this scenario. Add borrower name in ScenarioCreator to identify records.
                </div>
              </div>
              {/* Show key loan info even without borrower name */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {snap.creditScore && (
                  <span className="text-xs font-mono text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">{snap.creditScore} FICO</span>
                )}
                {snap.loanAmount && (
                  <span className="text-xs font-mono text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">{fmt$(snap.loanAmount)}</span>
                )}
                {snap.state && (
                  <span className="text-xs font-mono text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">{snap.state}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Score strip */}
          <div className="flex gap-2.5 flex-wrap">
            <ScoreTile value={record.fitScore}            label={`FIT SCORE / ${scoreMax}`}
              color={fitColor}       bg={fitBg}       border={fitBdr} />
            <ScoreTile value={record.eligibilityStatus}  label="ELIGIBILITY"
              color={eligColor}      bg={eligBg}      border={eligBorder} />
            <ScoreTile value={record.overlayRisk}        label="OVERLAY RISK"
              color={riskCfg.color}  bg={riskCfg.bg}  border={riskCfg.border} />
            <ScoreTile value={`${confidencePct}%`}       label="CONFIDENCE"
              color={confColor}      bg={confBg}      border={confBdr} />
          </div>

          {/* Selection */}
          <Section title="Selection">
            <FieldRow label="Lender / Profile" value={record.profileName} />
            <FieldRow label="Program"          value={result?.program} mono />
            <FieldRow label="Tier"             value={record.tier} />
            <FieldRow label="Tier Basis"       value={record.tierBasis} mono />
            <FieldRow label="Data Source"      value={record.dataSource} mono />
            <FieldRow label="Ruleset Version"  value={`v${record.rulesetVersion ?? 0}`} mono />
            <FieldRow label="Guideline Ref"    value={record.guidelineVersionRef} mono />
          </Section>

          {/* Scenario Snapshot */}
          <Section title="Scenario Snapshot (sealed at selection)">
            {scoreRows.map((row, i) => (
              <FieldRow key={i} label={row.label} value={row.value} mono={row.mono} />
            ))}
          </Section>

          {/* Eligibility Factors */}
          {record.reasonsSnapshot?.length > 0 && (
            <Section title="Eligibility Factors">
              <div className="pt-2 space-y-1.5">
                {record.reasonsSnapshot.map((r, i) => {
                  const isWarning = r.startsWith('⚠️');
                  return (
                    <div key={i} className={`flex items-start gap-2 text-xs leading-snug px-3 py-2 rounded-lg border ${
                      isWarning
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-green-50 border-green-100 text-green-700'
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">{isWarning ? '⚠' : '✓'}</span>
                      {isWarning ? r.replace('⚠️ ', '') : r}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Narrative */}
          {record.narrativeSnapshot && (
            <Section title="Why This Lender — Narrative (at time of selection)">
              <div className="px-4 py-3 mt-2 bg-blue-50 border border-blue-200 border-l-4 border-l-blue-400 rounded-lg text-sm text-slate-600 leading-relaxed">
                {record.narrativeSnapshot}
              </div>
            </Section>
          )}

          {/* Placeholder disclaimer */}
          {isPlaceholder && record.placeholderDisclaimer && (
            <Section title="Placeholder Disclaimer">
              <div className="px-4 py-3 mt-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 italic leading-relaxed">
                {record.placeholderDisclaimer}
              </div>
            </Section>
          )}

          {/* Save confirmation */}
          {saved && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              <span className="text-lg">✓</span>
              Decision Record saved. It will appear in this loan's Decision Log.
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex-wrap">
          <button onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 text-sm border rounded-xl transition-all ${
              copied
                ? 'bg-green-50 text-green-600 border-green-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}>
            {copied ? '✓ Copied' : '⎘ Copy Summary'}
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-white transition-colors">
            Close
          </button>
          {!saved && (
            <button
              disabled={saving}
              onClick={() => onSave(record)}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl transition-all ${
                saving
                  ? 'bg-orange-100 text-orange-400 cursor-not-allowed border border-orange-200'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm border border-orange-500'
              }`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />Saving…</>
                : <>📌 Save Decision Record</>
              }
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default DecisionRecordModal;
