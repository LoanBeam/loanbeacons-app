// src/components/CRASnapshotCard.jsx
// CRA Eligibility Intelligence™ — Visual snapshot card
// Uses craService.js data shape directly.

import React from 'react';

const INCOME_CONFIG = {
  LOW:      { label: 'Low-Income Tract',      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', badge: '#dcfce7' },
  MODERATE: { label: 'Moderate-Income Tract', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', badge: '#e0f2fe' },
  MIDDLE:   { label: 'Middle-Income Tract',   color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', badge: '#ede9fe' },
  UPPER:    { label: 'Upper-Income Tract',    color: '#b45309', bg: '#fffbeb', border: '#fde68a', badge: '#fef3c7' },
  UNKNOWN:  { label: 'Income Level Unknown',  color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', badge: '#f3f4f6' },
};

function pct(val) {
  if (val == null || val === 0) return '—';
  return `${Number(val).toFixed(1)}%`;
}

function dollar(val) {
  if (!val) return '—';
  return `$${Number(val).toLocaleString()}`;
}

function DataRow({ label, value, accent }) {
  return (
    <div style={styles.dataRow}>
      <span style={styles.dataLabel}>{label}</span>
      <span style={{ ...styles.dataValue, color: accent || '#111827' }}>{value}</span>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={styles.sectionHeader}>
      <span style={styles.sectionHeaderText}>{title}</span>
    </div>
  );
}

function AMITierBar({ borrowerAmiPct }) {
  const tiers = [
    { label: '<50%',    max: 50,  color: '#16a34a' },
    { label: '50–80%',  max: 80,  color: '#0284c7' },
    { label: '80–120%', max: 120, color: '#7c3aed' },
    { label: '>120%',   max: 200, color: '#b45309' },
  ];
  const clamped = Math.min(borrowerAmiPct || 0, 200);
  const fillPct = (clamped / 200) * 100;
  const activeTier = tiers.find((t) => clamped <= t.max) || tiers[tiers.length - 1];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Borrower Income vs. Area Median</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: activeTier.color }}>
          {borrowerAmiPct != null ? `${Number(borrowerAmiPct).toFixed(1)}% of AMI` : '—'}
        </span>
      </div>
      <div style={styles.amiTrack}>
        {[25, 40, 60].map((pos) => (
          <div key={pos} style={{ position: 'absolute', left: `${pos}%`, top: 0, bottom: 0, width: 1, background: '#e5e7eb' }} />
        ))}
        <div style={{ ...styles.amiFill, width: `${fillPct}%`, background: activeTier.color }} />
        {borrowerAmiPct != null && (
          <div style={{ ...styles.amiDot, left: `calc(${fillPct}% - 5px)`, background: activeTier.color }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        {tiers.map((t) => (
          <span key={t.label} style={{
            fontSize: 10,
            color: activeTier.label === t.label ? t.color : '#9ca3af',
            fontWeight: activeTier.label === t.label ? 700 : 400,
          }}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}

export default function CRASnapshotCard({ craData, loading, error, borrowerIncome }) {
  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.loadingWrapper}>
          <div style={styles.spinner} />
          <span style={styles.loadingText}>Fetching CRA tract data…</span>
        </div>
      </div>
    );
  }

  if (!craData && !error) {
    return (
      <div style={{ ...styles.card, ...styles.emptyCard }}>
        <span style={styles.emptyIcon}>🏘</span>
        <p style={styles.emptyText}>CRA snapshot will appear after address confirmation.</p>
      </div>
    );
  }

  if (!craData && error) {
    return (
      <div style={{ ...styles.card, borderColor: '#fca5a5', background: '#fff5f5' }}>
        <div style={styles.errorWrapper}>
          <span style={styles.errorIcon}>⚠</span>
          <div>
            <p style={styles.errorTitle}>CRA Data Unavailable</p>
            <p style={styles.errorMsg}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const tractLevel     = craData?.tractMetrics?.tractIncomeLevel || 'UNKNOWN';
  const config         = INCOME_CONFIG[tractLevel] || INCOME_CONFIG.UNKNOWN;
  const tractCode      = craData?.geography?.fullTractFIPS || craData?.geography?.tractCode;
  const countyName     = craData?.geography?.countyName;
  const msaName        = craData?.geography?.msaName;
  const tractMfiPct    = craData?.tractMetrics?.tractMfiPct;
  const amiOverall     = craData?.incomeData?.amiOverall;
  const isLowMod       = craData?.tractMetrics?.isLowModTract;
  const minorityPct    = craData?.tractMetrics?.tractMinorityPct;
  const flags          = craData?.flags || {};
  const borrowerAmiPct = flags.borrowerAmiPct;
  const isHighMinority = flags.isHighMinorityTract;
  const demo           = craData?.demographics || {};
  const hispanicPct    = demo?.hispanic?.pct;
  const blackPct       = demo?.black?.pct;
  const asianPct       = demo?.asianPacific?.pct;
  const hudWarning     = flags.hudExpirationWarning;
  const hudMsg         = flags.hudExpirationMessage;
  const isPartial      = !craData?.dataQuality?.fullDataAvailable;

  return (
    <div style={{ ...styles.card, borderColor: config.border, background: config.bg }}>
      <div style={{ ...styles.header, background: config.badge, borderBottom: `1px solid ${config.border}` }}>
        <div style={styles.headerLeft}>
          <span style={styles.moduleLabel}>CRA Eligibility Intelligence™</span>
          <h3 style={{ ...styles.tractTitle, color: config.color }}>{config.label}</h3>
          {tractCode && (
            <span style={styles.tractId}>
              Tract {tractCode}{countyName ? ` · ${countyName}` : ''}{msaName ? ` · ${msaName}` : ''}
            </span>
          )}
        </div>
        <div style={styles.headerBadges}>
          {isLowMod && <span style={{ ...styles.badge, background: config.color, color: '#fff' }}>LMI Eligible</span>}
          {isLowMod && <span style={{ ...styles.badge, background: '#0f172a', color: '#fff' }}>CRA Qualified</span>}
          {isHighMinority && <span style={{ ...styles.badge, background: '#7c3aed', color: '#fff' }}>Majority-Minority</span>}
          {isPartial && <span style={{ ...styles.badge, background: '#d97706', color: '#fff' }}>Partial Data</span>}
        </div>
      </div>

      {isPartial && error && (
        <div style={styles.alertWarning}>
          <span style={{ marginRight: 6 }}>⚠</span>{error}
        </div>
      )}

      {hudWarning && hudMsg && (
        <div style={styles.alertWarning}>
          <span style={{ marginRight: 6 }}>🔔</span>{hudMsg}
        </div>
      )}

      <div style={styles.body}>
        <div style={styles.col}>
          <SectionHeader title="Tract Income" />
          <DataRow label="Tract MFI vs. Area" value={pct(tractMfiPct)} accent={config.color} />
          <DataRow label="Area Median Income" value={dollar(amiOverall)} />
          <DataRow label="ACS Data Year" value={craData?.effectiveYear ? `FY${craData.effectiveYear}` : '—'} />
        </div>
        <div style={styles.col}>
          <SectionHeader title="Demographics" />
          <DataRow label="Minority Population" value={pct(minorityPct)} accent={isHighMinority ? '#7c3aed' : undefined} />
          {hispanicPct != null && <DataRow label="Hispanic / Latino" value={pct(hispanicPct)} />}
          {blackPct != null && <DataRow label="Black / African American" value={pct(blackPct)} />}
          {asianPct != null && <DataRow label="Asian / Pacific Islander" value={pct(asianPct)} />}
        </div>
      </div>

      {borrowerAmiPct != null && (
        <div style={styles.amiSection}>
          <AMITierBar borrowerAmiPct={borrowerAmiPct} />
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginTop: 16, marginBottom: 8, fontSize: 13, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  header: { padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: 2 },
  headerBadges: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' },
  moduleLabel: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' },
  tractTitle: { margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 },
  tractId: { fontSize: 11, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' },
  badge: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap' },
  alertWarning: { background: '#fffbeb', borderTop: '1px solid #fde68a', borderBottom: '1px solid #fde68a', padding: '8px 16px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center' },
  body: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '12px 16px 4px' },
  col: { paddingRight: 16 },
  sectionHeader: { borderBottom: '1px solid #e5e7eb', marginBottom: 6, paddingBottom: 3 },
  sectionHeaderText: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 5, gap: 8 },
  dataLabel: { color: '#6b7280', fontSize: 12, flexShrink: 0 },
  dataValue: { fontWeight: 600, fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  amiSection: { padding: '4px 16px 14px', borderTop: '1px solid rgba(0,0,0,0.05)', marginTop: 8 },
  amiTrack: { position: 'relative', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'visible' },
  amiFill: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4, transition: 'width 0.4s ease', opacity: 0.85 },
  amiDot: { position: 'absolute', top: -1, width: 10, height: 10, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.4s ease' },
  loadingWrapper: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', color: '#6b7280' },
  spinner: { width: 16, height: 16, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#0284c7', animation: 'cra-spin 0.7s linear infinite' },
  loadingText: { fontSize: 13, color: '#6b7280' },
  errorWrapper: { display: 'flex', gap: 10, padding: '14px 16px', alignItems: 'flex-start' },
  errorIcon: { fontSize: 18, lineHeight: 1, flexShrink: 0 },
  errorTitle: { margin: 0, fontWeight: 700, fontSize: 13, color: '#991b1b' },
  errorMsg: { margin: '2px 0 0', fontSize: 12, color: '#b91c1c' },
  emptyCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#f9fafb', borderColor: '#e5e7eb' },
  emptyIcon: { fontSize: 20 },
  emptyText: { margin: 0, fontSize: 12, color: '#9ca3af' },
};

if (typeof document !== 'undefined' && !document.getElementById('cra-spin-style')) {
  const style = document.createElement('style');
  style.id = 'cra-spin-style';
  style.textContent = `@keyframes cra-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
