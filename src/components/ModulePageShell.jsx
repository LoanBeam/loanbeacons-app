/**
 * ModulePageShell.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * LoanBeacons™ — Universal Module Layout Template
 * Version: 1.0.0  |  April 2026
 *
 * DROP-IN USAGE — replace the ALL_CAPS placeholders:
 *
 *   <ModulePageShell
 *     moduleNumber={14}
 *     moduleKey="CONVENTIONAL_REFI"
 *     moduleName="Conventional Refi Intelligence™"
 *     moduleDesc="RefiNow™ & Refi Possible℠ Eligibility Advisor · Loan ownership lookup · Program screener"
 *     stageLabel="Stage 2 — Lender Fit"
 *     featureTags={['Loan Ownership','RefiNow™ Screener','Refi Possible℠','Recommendation','Borrower Letter']}
 *     savedRecordId={savedRecordId}
 *     onSave={handleSave}
 *     nsiModuleNumber={15}
 *     nsiModuleName="Rate Buydown Analyzer"
 *     nsiPath="/rate-buydown"
 *   >
 *     <YourTabsAndContent />
 *   </ModulePageShell>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RENDER ORDER (locked platform standard):
 *   1. Hero (dark) — module number, name, description, feature tags
 *      └─ Active scenario card (top-right) when scenario loaded
 *   2. ScenarioHeader bar — borrower name, address, loan, type, period
 *   3. ModuleNav bar — Canonical Sequence › Module dropdown │ LIVE │ AE Share
 *   4. DecisionRecordBanner — turns green after save, reveals NSI pill
 *   5. Children (tabs, content)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ModuleNav from '../components/ModuleNav';
import ScenarioHeader from '../components/ScenarioHeader';
import ScenarioSelector from '../components/ScenarioSelector';

// ─── NSI: next-step module routing map ───────────────────────────────────────
// Override per-module via nsiModuleNumber + nsiModuleName + nsiPath props,
// or rely on useNextStepIntelligence hook for dynamic suggestions.
// ─────────────────────────────────────────────────────────────────────────────

export default function ModulePageShell({
  // Module identity
  moduleNumber,          // number  — e.g. 14
  moduleKey,             // string  — e.g. 'CONVENTIONAL_REFI'  (matches MODULE_KEYS)
  moduleName,            // string  — e.g. 'Conventional Refi Intelligence™'
  moduleDesc,            // string  — one-line capability description
  stageLabel,            // string  — e.g. 'Stage 2 — Lender Fit'
  featureTags = [],      // string[] — shown as pills in the hero

  // Decision Record
  savedRecordId,         // string | null — from useDecisionRecord
  onSave,                // () => void    — triggers reportFindings → Firestore write

  // Next Step Intelligence
  nsiModuleNumber,       // number  — module to suggest after DR save
  nsiModuleName,         // string  — display name of suggested next module
  nsiPath,               // string  — route path, e.g. '/rate-buydown'

  // Scenario (passed down from parent via useScenario hook)
  scenario,              // object | null — active scenario data

  // Content
  children,
}) {
  const navigate = useNavigate();

  // ── If no scenario selected: render landing / selector state ──────────────
  if (!scenario) {
    return (
      <div style={S.page}>
        {/* ── HERO (landing) ─────────────────────────────────────── */}
        <div style={S.hero}>
          <p style={S.eyebrow}>{stageLabel}</p>
          <div style={S.heroRow}>
            <span style={S.modBadge}>M{String(moduleNumber).padStart(2, '0')}</span>
            <h1 style={S.heroTitle}>{moduleName}</h1>
          </div>
          <p style={S.heroDesc}>{moduleDesc}</p>
          <div style={S.tagRow}>
            {featureTags.map(t => (
              <span key={t} style={S.ftag}>{t}</span>
            ))}
          </div>
        </div>

        {/* ── SCENARIO SELECTOR ──────────────────────────────────── */}
        <div style={S.selectorZone}>
          <ScenarioSelector />
        </div>
      </div>
    );
  }

  // ── Active state: scenario loaded ─────────────────────────────────────────
  const isSaved = Boolean(savedRecordId);

  return (
    <div style={S.page}>

      {/* ─────────────────────────────────────────────────────────
          1. HERO (active) — with scenario card top-right
      ───────────────────────────────────────────────────────── */}
      <div style={S.hero}>
        <p style={S.eyebrow}>LoanBeacons™ — Module {moduleNumber}</p>
        <h1 style={S.heroTitle}>{moduleName}</h1>
        <p style={S.heroDesc}>{moduleDesc}</p>

        {/* Active scenario card — top-right */}
        <div style={S.scenarioCard}>
          <p style={S.scEyebrow}>Active Scenario</p>
          <p style={S.scName}>{scenario.borrowerName}</p>
          <p style={S.scSub}>
            ${scenario.loanAmount?.toLocaleString()} · {scenario.loanType} · {scenario.state}
          </p>
          <span
            style={S.scLink}
            onClick={() => navigate('/my-scenarios')}
          >
            Change scenario →
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
          2. SCENARIO HEADER BAR
      ───────────────────────────────────────────────────────── */}
      <ScenarioHeader scenario={scenario} />

      {/* ─────────────────────────────────────────────────────────
          3. MODULE NAV BAR (Canonical Sequence + AE Share)
      ───────────────────────────────────────────────────────── */}
      <ModuleNav moduleNumber={moduleNumber} />

      {/* ─────────────────────────────────────────────────────────
          4. DECISION RECORD BANNER
          - Unsaved: dark "Save to Decision Record" button
          - Saved:   green banner + NSI next-step pill
      ───────────────────────────────────────────────────────── */}
      <div style={isSaved ? { ...S.drBar, ...S.drBarSaved } : S.drBar}>

        {/* Icon */}
        <div style={isSaved ? { ...S.drIconWrap, ...S.drIconWrapSaved } : S.drIconWrap}>
          {isSaved ? (
            /* Checkmark */
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7.5l3 3 6-6" stroke="#16a34a" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            /* Document */
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="2.5" width="11" height="11" rx="2"
                stroke="#475569" strokeWidth="1.4"/>
              <path d="M5 8h6M5 5.5h6M5 10.5h3.5" stroke="#475569"
                strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          )}
        </div>

        {/* Label */}
        <div>
          <p style={isSaved ? { ...S.drLabel, color: '#14532d' } : S.drLabel}>
            {isSaved ? 'Decision Record — Saved ✓' : 'Decision Record'}
          </p>
          <p style={isSaved ? { ...S.drSub, color: '#16a34a' } : S.drSub}>
            {isSaved
              ? `${moduleKey.replace(/_/g, ' ')} findings logged to audit trail`
              : `Save ${moduleKey.replace(/_/g, ' ')} findings to your audit trail`}
          </p>
        </div>

        {/* Right side: NSI pill (saved only) + Save button */}
        <div style={S.drRight}>

          {/* NSI pill — appears only after save */}
          {isSaved && nsiPath && (
            <button
              style={S.nsiPill}
              onClick={() => navigate(nsiPath)}
              title={`Go to M${nsiModuleNumber} — ${nsiModuleName}`}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3" stroke="#3b82f6" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11h10" stroke="#3b82f6" strokeWidth="1.4"
                  strokeLinecap="round"/>
              </svg>
              <div>
                <p style={S.nsiLabel}>Next Suggested Action</p>
                <p style={S.nsiText}>M{nsiModuleNumber} — {nsiModuleName}</p>
              </div>
              <span style={S.nsiArrow}>→</span>
            </button>
          )}

          {/* Save / Saved button */}
          <button
            style={isSaved
              ? { ...S.saveBtn, ...S.saveBtnSaved }
              : S.saveBtn}
            onClick={!isSaved ? onSave : undefined}
            disabled={isSaved}
          >
            {isSaved ? (
              <>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7.5l3 3 6-6" stroke="#fff" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2" width="10" height="10" rx="1.5"
                    stroke="#f8fafc" strokeWidth="1.3"/>
                  <path d="M4.5 7l2 2 3.5-3.5" stroke="#f8fafc" strokeWidth="1.4"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Save to Decision Record
              </>
            )}
          </button>

        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
          5. MODULE CONTENT (tabs, body, etc.)
      ───────────────────────────────────────────────────────── */}
      {children}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// All values match the LoanBeacons design standard:
//   slate-900 hero · slate-50 bg · DM Sans · DM Serif Display
//   rounded-3xl → border-radius 24px for cards
//   amber key rules card (handled in individual modules)
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  page: {
    fontFamily: "'DM Sans', sans-serif",
    background: '#f8fafc',
    minHeight: '100vh',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    padding: '28px 32px 24px',
    position: 'relative',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 600,
    color: '#64748b',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  modBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 34,
    padding: '0 8px',
    background: '#6366f1',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  heroTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 26,
    color: '#f8fafc',
    lineHeight: 1.15,
  },
  heroDesc: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.65,
    maxWidth: 520,
    marginBottom: 14,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  ftag: {
    padding: '3px 11px',
    borderRadius: 20,
    border: '1px solid #334155',
    fontSize: 11,
    fontWeight: 500,
    color: '#cbd5e1',
  },

  // ── Active scenario card ───────────────────────────────────────────────────
  scenarioCard: {
    position: 'absolute',
    top: 22,
    right: 32,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid #334155',
    borderRadius: 10,
    padding: '12px 16px',
    minWidth: 176,
    backdropFilter: 'blur(4px)',
  },
  scEyebrow: {
    fontSize: 9,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 4,
  },
  scName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f1f5f9',
  },
  scSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  scLink: {
    fontSize: 11,
    color: '#818cf8',
    marginTop: 7,
    cursor: 'pointer',
    display: 'inline-block',
  },

  // ── Selector zone (landing state) ─────────────────────────────────────────
  selectorZone: {
    padding: '24px 32px',
    background: '#f8fafc',
  },

  // ── Decision Record Banner ─────────────────────────────────────────────────
  drBar: {
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding: '11px 32px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    transition: 'background 0.3s, border-color 0.3s',
  },
  drBarSaved: {
    background: '#f0fdf4',
    borderBottom: '1px solid #bbf7d0',
  },
  drIconWrap: {
    width: 30,
    height: 30,
    background: '#f1f5f9',
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.3s',
  },
  drIconWrapSaved: {
    background: '#dcfce7',
  },
  drLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#1e293b',
  },
  drSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  drRight: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  // ── NSI pill ───────────────────────────────────────────────────────────────
  nsiPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    padding: '5px 13px',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background 0.15s',
  },
  nsiLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#1d4ed8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  nsiText: {
    fontSize: 11,
    color: '#1e40af',
    fontWeight: 500,
  },
  nsiArrow: {
    fontSize: 12,
    color: '#3b82f6',
  },

  // ── Save button ────────────────────────────────────────────────────────────
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#0f172a',
    color: '#f8fafc',
    border: 'none',
    borderRadius: 6,
    padding: '7px 15px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background 0.3s',
    whiteSpace: 'nowrap',
  },
  saveBtnSaved: {
    background: '#16a34a',
    cursor: 'default',
    opacity: 0.9,
  },
};
