// ═══════════════════════════════════════════════════════════════════
//  src/modules/DecisionRecord/DecisionRecord.jsx
//  LoanBeacons — Decision Record™  Module 21
//  Canonical Sequence Audit Trail Dashboard
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate }                   from 'react-router-dom';
import {
  collection, query, where, onSnapshot,
  orderBy, getDocs,
}                                                   from 'firebase/firestore';
import { getAuth }                                  from 'firebase/auth';
import { db }                                       from '../../firebase/config';
import {
  MODULE_KEYS,
  RECORD_STATUS,
  FLAG_SEVERITY,
  LIVE_MODULE_KEYS,
  ALL_MODULE_KEYS,
  DISPOSITION_OPTIONS,
}                                                   from '../../constants/decisionRecordConstants';
import './DecisionRecord.css';

// ─── Module display metadata ──────────────────────────────────────
const MODULE_META = {
  scenario_creator:       { label: 'Scenario Creator',       stage: 1, icon: '⚡' },
  income_analysis:        { label: 'Income Analysis',         stage: 1, icon: '💰' },
  asset_review:           { label: 'Asset Review',            stage: 1, icon: '🏦' },
  credit_analysis:        { label: 'Credit Analysis',         stage: 1, icon: '📊' },
  property_analysis:      { label: 'Property Analysis',       stage: 1, icon: '🏠' },
  lender_match:           { label: 'Lender Match™',           stage: 2, icon: '🎯' },
  program_eligibility:    { label: 'Program Eligibility',     stage: 2, icon: '✅' },
  aus_rescue:             { label: 'AUS Rescue™',             stage: 2, icon: '🛟' },
  non_qm_pathways:        { label: 'Non-QM Pathways',         stage: 2, icon: '🔀' },
  dpa_eligibility:        { label: 'DPA Intelligence™',       stage: 2, icon: '🏛️' },
  lender_profile_builder: { label: 'Lender Profile Builder', stage: 2, icon: '🔧' },
  cra_intelligence:       { label: 'CRA Intelligence',        stage: 3, icon: '🗺️' },
  rate_scenario:          { label: 'Rate Buydown Calculator', stage: 3, icon: '📉' },
  closing_cost_estimator: { label: 'Closing Cost Estimator',  stage: 3, icon: '🧮' },
  cash_to_close:          { label: 'Cash to Close',           stage: 3, icon: '💵' },
  rehab_intelligence:     { label: 'Rehab Intelligence™',     stage: 3, icon: '🔨' },
  document_checklist:     { label: 'Document Checklist',      stage: 4, icon: '📋' },
  compliance_review:      { label: 'Compliance Review',       stage: 4, icon: '⚖️' },
  ae_share_service:       { label: 'AE Share Service',        stage: 4, icon: '📤' },
  submission_package:     { label: 'Submission Package',      stage: 4, icon: '📦' },
  decision_record:        { label: 'Decision Record™',        stage: 4, icon: '🔒' },
};

const STAGE_META = [
  { id: 1, label: 'Pre-Structure & Initial Analysis',   short: 'Pre-Structure',   color: '#818cf8' },
  { id: 2, label: 'Lender Fit & Program Intelligence',  short: 'Lender Fit',      color: '#38bdf8' },
  { id: 3, label: 'Final Structure Optimization',       short: 'Final Structure', color: '#22d3ee' },
  { id: 4, label: 'Verification & Submit',              short: 'Verification',    color: '#34d399' },
];

const FLAG_COLORS = {
  info:     { bg: '#0f1e35', border: '#2563eb', text: '#93c5fd', dot: '#3b82f6'  },
  warning:  { bg: '#1f1200', border: '#d97706', text: '#fcd34d', dot: '#f59e0b'  },
  critical: { bg: '#1f0505', border: '#dc2626', text: '#fca5a5', dot: '#ef4444'  },
};

// ─── Helpers ─────────────────────────────────────────────────────
function fmtTs(ts) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function fmtTsShort(ts) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

// ─── Completeness Ring ────────────────────────────────────────────
function CompletenessRing({ score = 0, reported = 0, total = 0 }) {
  const r      = 56;
  const circ   = 2 * Math.PI * r;
  const pct    = Math.round(score * 100);
  const offset = circ - score * circ;
  const color  = pct >= 90 ? '#34d399' : pct >= 75 ? '#38bdf8' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="dr-ring-wrap">
      <svg width="148" height="148" viewBox="0 0 148 148">
        {/* Glow base */}
        <circle cx="74" cy="74" r={r} fill="none" stroke="#111f35" strokeWidth="14" />
        {/* Progress arc */}
        <circle
          cx="74" cy="74" r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 74 74)"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1), stroke .4s ease', filter: `drop-shadow(0 0 8px ${color}60)` }}
        />
        {/* Percentage */}
        <text x="74" y="68" textAnchor="middle" fill={color}
          fontSize="28" fontWeight="700" fontFamily="'JetBrains Mono', monospace"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}>
          {pct}%
        </text>
        <text x="74" y="84" textAnchor="middle" fill="#475569" fontSize="9"
          fontFamily="'Outfit', sans-serif" letterSpacing="0.15em">
          COMPLETE
        </text>
        <text x="74" y="100" textAnchor="middle" fill="#334155" fontSize="10"
          fontFamily="'JetBrains Mono', monospace">
          {reported}/{total} modules
        </text>
      </svg>
    </div>
  );
}

// ─── JSON Pretty Viewer ───────────────────────────────────────────
function JsonBlock({ data }) {
  // Colorize JSON output
  const json = JSON.stringify(data, null, 2);
  const lines = json.split('\n').map((line, i) => {
    const keyMatch   = line.match(/^(\s*)("[\w_]+")(\s*:\s*)(.*)/);
    const strVal     = line.match(/:\s*"(.+)"[,]?$/);
    const numVal     = line.match(/:\s*(\d[\d.]*)[,]?$/);
    const boolNull   = line.match(/:\s*(true|false|null)[,]?$/);

    if (keyMatch) {
      return (
        <div key={i} className="dr-json-line">
          <span style={{ color: '#475569' }}>{keyMatch[1]}</span>
          <span style={{ color: '#7dd3fc' }}>{keyMatch[2]}</span>
          <span style={{ color: '#475569' }}>{keyMatch[3]}</span>
          {strVal  && <span style={{ color: '#86efac' }}>"{strVal[1]}"</span>}
          {numVal  && <span style={{ color: '#fda4af' }}>{numVal[1]}</span>}
          {boolNull && <span style={{ color: '#c084fc' }}>{boolNull[1]}</span>}
          {!strVal && !numVal && !boolNull && <span style={{ color: '#94a3b8' }}>{keyMatch[4]}</span>}
        </div>
      );
    }
    return <div key={i} className="dr-json-line"><span style={{ color: '#334155' }}>{line}</span></div>;
  });
  return <div className="dr-json-block">{lines}</div>;
}

// ═══════════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════════
export default function DecisionRecord() {
  const { scenarioId: paramId } = useParams();
  const navigate                = useNavigate();
  const auth                    = getAuth();
  const user                    = auth.currentUser;

  const [scenarios,       setScenarios]       = useState([]);
  const [selectedId,      setSelectedId]      = useState(paramId || '');
  const [record,          setRecord]          = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [noRecord,        setNoRecord]        = useState(false);
  const [activeTab,       setActiveTab]       = useState('overview');
  const [expandedModule,  setExpandedModule]  = useState(null);
  const [searchFindings,  setSearchFindings]  = useState('');

  // ── Load scenarios dropdown ──────────────────────────────────────
  useEffect(() => {
    // scenarios collection has no userId field — query without filter
 const q = query(collection(db, 'scenarios'));
    const unsub = onSnapshot(q, snap => {
      setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.warn('[DecisionRecord] scenarios fetch failed:', err.message);
    });
    return unsub;
  }, []);

  // ── Real-time listener on decisionRecords ────────────────────────
  useEffect(() => {
    if (!selectedId) { setRecord(null); setNoRecord(false); return; }
    setLoading(true);
    setNoRecord(false);

    const q = query(
  collection(db, 'decisionRecords'),
  where('scenarioId', '==', selectedId)
);

    const unsub = onSnapshot(q, snap => {
      if (snap.empty) {
        setRecord(null);
        setNoRecord(true);
        setLoading(false);
        return;
      }
      // Take the latest version (highest record_version)
      setRecord(snap.docs[0].data());
      setNoRecord(false);
      setLoading(false);
    }, err => {
      console.warn('[DecisionRecord] record fetch failed:', err.message);
      setLoading(false);
    });

    return unsub;
  }, [selectedId]);

  // ── Derived data ─────────────────────────────────────────────────
  const systemFindings = record?.system_findings || {};
  const reportedKeys   = Object.keys(systemFindings);
  const liveKeys       = LIVE_MODULE_KEYS || [];
  const allModuleKeys  = Object.values(MODULE_KEYS);
  const score          = record?.completeness_score || 0;
  const riskFlags      = record?.risk_flags         || [];
  const evidence       = record?.evidence           || [];
  const missingMods    = record?.missing_modules    || [];
  const status         = record?.status             || RECORD_STATUS.DRAFT;

  const criticalCount = riskFlags.filter(f => f.severity === FLAG_SEVERITY.CRITICAL).length;
  const warningCount  = riskFlags.filter(f => f.severity === FLAG_SEVERITY.WARNING ).length;
  const infoCount     = riskFlags.filter(f => f.severity === FLAG_SEVERITY.INFO    ).length;

  const statusMap = {
    [RECORD_STATUS.DRAFT]:    { bg: '#0f1e35', border: '#2563eb', text: '#93c5fd', label: 'DRAFT',    glow: '#2563eb' },
    [RECORD_STATUS.LOCKING]:  { bg: '#1f1200', border: '#d97706', text: '#fcd34d', label: 'LOCKING',  glow: '#d97706' },
    [RECORD_STATUS.LOCKED]:   { bg: '#052e16', border: '#16a34a', text: '#86efac', label: '🔒 LOCKED', glow: '#16a34a' },
  };
  const sc = statusMap[status] || statusMap[RECORD_STATUS.DRAFT];

  const modulesByStage = STAGE_META.map(s => ({
    ...s,
    modules: allModuleKeys.filter(k => MODULE_META[k]?.stage === s.id),
  }));

  // Filter for search
  const filteredReportedKeys = searchFindings.trim()
    ? reportedKeys.filter(k => {
        const meta = MODULE_META[k];
        return (
          (meta?.label || k).toLowerCase().includes(searchFindings.toLowerCase()) ||
          JSON.stringify(systemFindings[k]).toLowerCase().includes(searchFindings.toLowerCase())
        );
      })
    : reportedKeys;

  const tabs = [
    { id: 'overview', label: 'Overview'                                         },
    { id: 'findings', label: 'Findings',   count: reportedKeys.length           },
    { id: 'flags',    label: 'Risk Flags', count: riskFlags.length,  alert: criticalCount > 0 },
    { id: 'evidence', label: 'Evidence',   count: evidence.length               },
    { id: 'notes',    label: 'Notes & Lock'                                     },
  ];

  // ── Scenario display name helper ─────────────────────────────────
  function scenarioLabel(s) {
    const name = [s.firstName, s.lastName].filter(Boolean).join(' ')
              || s.borrowerName
              || 'Unknown Borrower';
    const addr = s.streetAddress || s.propertyAddress || '';
    return addr ? `${name}  ·  ${addr}` : name;
  }

  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="dr-root">

      {/* ══ TOP BAR ═══════════════════════════════════════════════ */}
      <div className="dr-topbar">
        <div className="dr-topbar-left">
          <span className="dr-module-num">21</span>
          <div className="dr-topbar-titles">
            <h1 className="dr-title">Decision Record™</h1>
            <span className="dr-subtitle">Canonical Sequence Audit Trail</span>
          </div>
        </div>
        <div className="dr-topbar-center">
          <div className="dr-select-wrap">
            <span className="dr-select-icon">🔍</span>
            <select
              className="dr-scenario-select"
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setActiveTab('overview'); }}
            >
              <option value="">— Select a Scenario to View —</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{scenarioLabel(s)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="dr-topbar-right">
          {record && (
            <div className="dr-status-pill" style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, boxShadow: `0 0 12px ${sc.glow}30` }}>
              {sc.label}
            </div>
          )}
        </div>
      </div>

      {/* ══ EMPTY STATES ══════════════════════════════════════════ */}
      {!selectedId && (
        <div className="dr-splash">
          <div className="dr-splash-glow" />
          <div className="dr-splash-icon">⚖️</div>
          <h2 className="dr-splash-title">Decision Record™</h2>
          <p className="dr-splash-body">
            Select a scenario above to view its complete audit trail —<br />
            every module finding, risk flag, and decision logged by the Canonical Sequence.
          </p>
          <div className="dr-splash-stats">
            <div className="dr-splash-stat"><span className="dr-splash-num">21</span><span>Modules</span></div>
            <div className="dr-splash-stat"><span className="dr-splash-num">4</span><span>Stages</span></div>
            <div className="dr-splash-stat"><span className="dr-splash-num">∞</span><span>Audit Trail</span></div>
          </div>
        </div>
      )}

      {selectedId && loading && (
        <div className="dr-splash">
          <div className="dr-spinner" />
          <p style={{ color: '#475569', marginTop: 16 }}>Loading Decision Record…</p>
        </div>
      )}

      {selectedId && !loading && noRecord && (
        <div className="dr-splash">
          <div className="dr-splash-icon" style={{ fontSize: 48 }}>📭</div>
          <h2 className="dr-splash-title" style={{ fontSize: 22 }}>No Record Yet</h2>
          <p className="dr-splash-body">
            This scenario hasn't generated a Decision Record yet.<br />
            Open it and run through the Canonical Sequence — findings will populate here automatically.
          </p>
        </div>
      )}

      {/* ══ MAIN DASHBOARD ════════════════════════════════════════ */}
      {record && !loading && (
        <div className="dr-main">

          {/* ── Record Header Card ── */}
          <div className="dr-header-card">
            <div className="dr-header-left">
              <div className="dr-hc-top">
                <span className="dr-record-ver">v{record.record_version || 1}</span>
                {record.change_reason && (
                  <span className="dr-change-reason">Revised: {record.change_reason}</span>
                )}
              </div>
              <div className="dr-borrower-name">
                {record.header?.borrowerName || 'Unknown Borrower'}
              </div>
              <div className="dr-header-chips">
                {record.header?.propertyAddress && (
                  <span className="dr-chip"><span className="dr-chip-icon">🏠</span>{record.header.propertyAddress}</span>
                )}
                {record.header?.loanType && (
                  <span className="dr-chip"><span className="dr-chip-icon">📋</span>{record.header.loanType}</span>
                )}
                {record.header?.loanPurpose && (
                  <span className="dr-chip"><span className="dr-chip-icon">🎯</span>{record.header.loanPurpose}</span>
                )}
                {record.header?.loName && (
                  <span className="dr-chip"><span className="dr-chip-icon">👤</span>{record.header.loName}</span>
                )}
                {record.header?.branchId && (
                  <span className="dr-chip dr-chip-dim"><span className="dr-chip-icon">🏢</span>{record.header.branchId}</span>
                )}
              </div>
              <div className="dr-header-timestamps">
                <span>Created {fmtTsShort(record.header?.createdAt)}</span>
                <span className="dr-ts-sep">·</span>
                <span>Updated {fmtTsShort(record.header?.updatedAt)}</span>
                <span className="dr-ts-sep">·</span>
                <span>Record ID: <code>{record.recordId?.substring(0, 12) || '—'}</code></span>
              </div>
            </div>

            <div className="dr-header-center">
              <CompletenessRing score={score} reported={reportedKeys.length} total={liveKeys.length} />
            </div>

            <div className="dr-header-right">
              <div className="dr-flag-summary">
                {criticalCount > 0 && (
                  <div className="dr-flag-summary-row critical">
                    <span className="dr-flag-summary-dot" />
                    <span className="dr-flag-summary-count">{criticalCount}</span>
                    <span>Critical</span>
                  </div>
                )}
                {warningCount > 0 && (
                  <div className="dr-flag-summary-row warning">
                    <span className="dr-flag-summary-dot" />
                    <span className="dr-flag-summary-count">{warningCount}</span>
                    <span>Warning</span>
                  </div>
                )}
                {infoCount > 0 && (
                  <div className="dr-flag-summary-row info">
                    <span className="dr-flag-summary-dot" />
                    <span className="dr-flag-summary-count">{infoCount}</span>
                    <span>Info</span>
                  </div>
                )}
                {riskFlags.length === 0 && (
                  <div className="dr-flag-summary-clean">
                    <span>✅</span>
                    <span>No risk flags</span>
                  </div>
                )}
              </div>

              {/* Attestation quick-status */}
              <div className={`dr-attest-quick ${record.lo_attestation?.certified ? 'certified' : 'pending'}`}>
                {record.lo_attestation?.certified ? '✅ LO Attested' : '⏳ Awaiting Attestation'}
              </div>

              {/* Final disposition if logged */}
              {systemFindings['decision_record']?.disposition && (
                <div className="dr-disposition-badge">
                  <span className="dr-disposition-label">Disposition</span>
                  <span className="dr-disposition-value">{systemFindings['decision_record'].disposition}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Tab Bar ── */}
          <div className="dr-tabs">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`dr-tab ${activeTab === t.id ? 'active' : ''} ${t.alert ? 'tab-alert' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={`dr-tab-badge ${t.alert ? 'tab-badge-alert' : ''}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ══ TAB: OVERVIEW ════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="dr-tab-pane">

              {/* Stage progress cards */}
              <div className="dr-stage-row">
                {modulesByStage.map(stage => {
                  const stageReported = stage.modules.filter(k => systemFindings[k]).length;
                  const stageTotal    = stage.modules.length;
                  const pct           = stageTotal > 0 ? stageReported / stageTotal : 0;
                  const allDone       = stageReported === stageTotal;
                  return (
                    <div key={stage.id} className="dr-stage-card"
                      style={{ '--sc': stage.color }}>
                      <div className="dr-stage-header">
                        <span className="dr-stage-num-badge">Stage {stage.id}</span>
                        {allDone && <span className="dr-stage-done">✓</span>}
                      </div>
                      <div className="dr-stage-title">{stage.short}</div>
                      <div className="dr-stage-bar-track">
                        <div
                          className="dr-stage-bar-fill"
                          style={{ width: `${pct * 100}%`, background: stage.color, boxShadow: `0 0 8px ${stage.color}60` }}
                        />
                      </div>
                      <div className="dr-stage-count" style={{ color: stage.color }}>
                        {stageReported} / {stageTotal}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Module grid by stage */}
              {modulesByStage.map(stage => (
                <div key={stage.id} className="dr-stage-section">
                  <div className="dr-stage-section-head" style={{ '--sc': stage.color }}>
                    <span className="dr-stage-section-dot" style={{ background: stage.color, boxShadow: `0 0 6px ${stage.color}` }} />
                    <span className="dr-stage-section-num">Stage {stage.id}</span>
                    <span className="dr-stage-section-label">{stage.label}</span>
                  </div>
                  <div className="dr-module-grid">
                    {stage.modules.map(key => {
                      const meta      = MODULE_META[key] || { label: key, icon: '⬜' };
                      const finding   = systemFindings[key];
                      const isLive    = liveKeys.includes(key);
                      const reported  = !!finding;
                      return (
                        <div
                          key={key}
                          className={`dr-module-card ${reported ? 'mc-reported' : ''} ${!isLive ? 'mc-future' : ''}`}
                          style={{ '--sc': stage.color }}
                          title={reported ? `Click to view ${meta.label} findings` : undefined}
                          onClick={() => {
                            if (reported) {
                              setActiveTab('findings');
                              setExpandedModule(key);
                            }
                          }}
                        >
                          <div className="dr-mc-top">
                            <span className="dr-mc-icon">{meta.icon}</span>
                            <span className={`dr-mc-dot ${reported ? 'dot-on' : 'dot-off'}`}
                              style={reported ? { background: stage.color, boxShadow: `0 0 5px ${stage.color}` } : {}} />
                          </div>
                          <div className="dr-mc-name">{meta.label}</div>
                          {reported && (
                            <div className="dr-mc-ts">{fmtTsShort(finding.reported_at)}</div>
                          )}
                          {!isLive && <span className="dr-mc-future">future</span>}
                          {reported && <div className="dr-mc-hover-text">View Findings →</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Missing modules notice */}
              {missingMods.length > 0 && (
                <div className="dr-missing-panel">
                  <div className="dr-missing-head">
                    <span className="dr-missing-icon">⏳</span>
                    <span>Pending Live Modules ({missingMods.length})</span>
                  </div>
                  <div className="dr-missing-chips">
                    {missingMods.map(k => (
                      <span key={k} className="dr-missing-chip">
                        {MODULE_META[k]?.icon} {MODULE_META[k]?.label || k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB: FINDINGS ════════════════════════════════════ */}
          {activeTab === 'findings' && (
            <div className="dr-tab-pane">
              <div className="dr-findings-toolbar">
                <span className="dr-findings-count">{reportedKeys.length} modules reported</span>
                <input
                  className="dr-search-input"
                  type="text"
                  placeholder="Search findings…"
                  value={searchFindings}
                  onChange={e => setSearchFindings(e.target.value)}
                />
              </div>

              {filteredReportedKeys.length === 0 && (
                <div className="dr-empty-pane">
                  {reportedKeys.length === 0
                    ? 'No module findings recorded yet.'
                    : 'No findings match your search.'}
                </div>
              )}

              {filteredReportedKeys.map(key => {
                const finding    = systemFindings[key];
                const meta       = MODULE_META[key] || { label: key, icon: '⬜', stage: 0 };
                const stageMeta  = STAGE_META.find(s => s.id === meta.stage);
                const isExpanded = expandedModule === key;
                // Strip metadata fields from displayed findings
                const displayData = Object.fromEntries(
                  Object.entries(finding).filter(([k]) => !['reported_at', 'module_version'].includes(k))
                );

                return (
                  <div key={key}
                    className={`dr-finding-block ${isExpanded ? 'fb-open' : ''}`}
                    style={{ '--sc': stageMeta?.color || '#38bdf8' }}>
                    <div
                      className="dr-finding-head"
                      onClick={() => setExpandedModule(isExpanded ? null : key)}
                    >
                      <span className="dr-finding-icon">{meta.icon}</span>
                      <div className="dr-finding-titles">
                        <span className="dr-finding-name">{meta.label}</span>
                        <span className="dr-finding-stage-chip" style={{ color: stageMeta?.color }}>
                          Stage {meta.stage} · {stageMeta?.short}
                        </span>
                      </div>
                      <div className="dr-finding-meta-row">
                        <span className="dr-finding-ts">{fmtTsShort(finding.reported_at)}</span>
                        <span className="dr-finding-ver">v{finding.module_version || '1.0.0'}</span>
                      </div>
                      <span className="dr-finding-chevron">{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {isExpanded && (
                      <div className="dr-finding-body">
                        <JsonBlock data={displayData} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ TAB: RISK FLAGS ══════════════════════════════════ */}
          {activeTab === 'flags' && (
            <div className="dr-tab-pane">
              {riskFlags.length === 0 && (
                <div className="dr-clean-state">
                  <div className="dr-clean-icon">✅</div>
                  <div className="dr-clean-title">Clean Record</div>
                  <div className="dr-clean-body">No risk flags have been raised on this Decision Record.</div>
                </div>
              )}

              {[FLAG_SEVERITY.CRITICAL, FLAG_SEVERITY.WARNING, FLAG_SEVERITY.INFO].map(sev => {
                const flags = riskFlags.filter(f => f.severity === sev);
                if (!flags.length) return null;
                const fc    = FLAG_COLORS[sev] || FLAG_COLORS.info;
                const label = sev.toUpperCase();

                return (
                  <div key={sev} className="dr-flag-group">
                    <div className="dr-flag-group-head" style={{ color: fc.dot }}>
                      <span className="dr-flag-group-dot" style={{ background: fc.dot, boxShadow: `0 0 6px ${fc.dot}` }} />
                      {label}
                      <span className="dr-flag-group-count" style={{ background: fc.bg, color: fc.text, borderColor: fc.border }}>
                        {flags.length}
                      </span>
                    </div>
                    {flags.map((f, i) => (
                      <div key={i} className="dr-flag-item"
                        style={{ background: fc.bg, borderLeft: `3px solid ${fc.border}` }}>
                        <div className="dr-flag-code" style={{ color: fc.dot }}>{f.flag_code}</div>
                        <div className="dr-flag-source">
                          {MODULE_META[f.source_module]?.icon} {MODULE_META[f.source_module]?.label || f.source_module}
                        </div>
                        <div className="dr-flag-detail">{f.detail || '—'}</div>
                        <div className="dr-flag-ts">{fmtTsShort(f.flagged_at)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ TAB: EVIDENCE ════════════════════════════════════ */}
          {activeTab === 'evidence' && (
            <div className="dr-tab-pane">
              {evidence.length === 0 && (
                <div className="dr-empty-pane">No evidence items attached to this record.</div>
              )}
              <div className="dr-evidence-grid">
                {evidence.map((ev, i) => (
                  <div key={i} className="dr-evidence-card">
                    <div className="dr-ev-type">{ev.type}</div>
                    <div className="dr-ev-source">{ev.source_name || '—'}</div>
                    {ev.source_id  && <div className="dr-ev-row"><span>ID</span><code>{ev.source_id}</code></div>}
                    {ev.version_tag && <div className="dr-ev-row"><span>Version</span><code>{ev.version_tag}</code></div>}
                    {ev.retrieved_by && <div className="dr-ev-row"><span>By</span><span>{ev.retrieved_by}</span></div>}
                    <div className="dr-ev-ts">{fmtTs(ev.retrieved_at)}</div>
                    {ev.source_url && (
                      <a href={ev.source_url} target="_blank" rel="noreferrer" className="dr-ev-link">
                        View Source ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ TAB: NOTES & LOCK ════════════════════════════════ */}
          {activeTab === 'notes' && (
            <div className="dr-tab-pane dr-notes-layout">

              {/* LO Notes */}
              <div className="dr-info-card">
                <div className="dr-card-label">LO Notes</div>
                {record.lo_notes?.text ? (
                  <>
                    <div className="dr-lo-notes-text">{record.lo_notes.text}</div>
                    {record.lo_notes.tags?.length > 0 && (
                      <div className="dr-lo-tags">
                        {record.lo_notes.tags.map(t => (
                          <span key={t} className="dr-lo-tag">{t.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                    <div className="dr-card-ts">Authored {fmtTs(record.lo_notes.authored_at)}</div>
                  </>
                ) : (
                  <div className="dr-card-empty">No LO notes on this record yet.</div>
                )}
              </div>

              {/* LO Attestation */}
              <div className="dr-info-card">
                <div className="dr-card-label">LO Attestation</div>
                {record.lo_attestation?.certified ? (
                  <div className="dr-attest-block certified">
                    <div className="dr-attest-check-large">✅</div>
                    <div>
                      <div className="dr-attest-by">Certified by {record.lo_attestation.certified_by}</div>
                      <div className="dr-card-ts">{fmtTs(record.lo_attestation.certified_at)}</div>
                      <div className="dr-attest-quote">"I certify this record reflects the information available at the time of this decision."</div>
                    </div>
                  </div>
                ) : (
                  <div className="dr-attest-block pending">
                    <div className="dr-attest-warn">⏳</div>
                    <div>
                      <div className="dr-attest-pending-txt">Attestation required before record lock</div>
                      <div className="dr-card-ts">The LO must certify this record before it can be sealed.</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Manager Review */}
              <div className="dr-info-card">
                <div className="dr-card-label">Manager Review</div>
                <div className="dr-manager-status">
                  <span className={`dr-manager-dot ${record.manager_review?.reviewed ? 'dot-green' : 'dot-dim'}`} />
                  <span>{record.manager_review?.reviewed
                    ? `Reviewed by ${record.manager_review.reviewed_by}`
                    : 'Not yet reviewed by manager'}
                  </span>
                  {record.manager_review?.reviewed_at && (
                    <span className="dr-card-ts" style={{ marginLeft: 'auto' }}>{fmtTsShort(record.manager_review.reviewed_at)}</span>
                  )}
                  {record.manager_review?.flagged_for_followup && (
                    <span className="dr-follow-up-badge">🚩 Flagged for Follow-up</span>
                  )}
                </div>
                {record.manager_review?.comments?.length > 0 && (
                  <div className="dr-comments-list">
                    {record.manager_review.comments.map((c, i) => (
                      <div key={i} className="dr-comment">
                        <span className="dr-comment-by">{c.authored_by}</span>
                        <span className="dr-comment-txt">{c.text}</span>
                        <span className="dr-comment-ts">{fmtTsShort(c.authored_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Final Disposition */}
              {systemFindings['decision_record'] && (
                <div className="dr-info-card dr-disposition-card">
                  <div className="dr-card-label">Final Disposition</div>
                  <div className="dr-disposition-main">
                    {systemFindings['decision_record'].disposition || '—'}
                  </div>
                  {systemFindings['decision_record'].program_selected && (
                    <div className="dr-dispo-row">
                      <span>Program</span><span>{systemFindings['decision_record'].program_selected}</span>
                    </div>
                  )}
                  {systemFindings['decision_record'].lender_selected && (
                    <div className="dr-dispo-row">
                      <span>Lender</span><span>{systemFindings['decision_record'].lender_selected}</span>
                    </div>
                  )}
                  {systemFindings['decision_record'].loan_amount && (
                    <div className="dr-dispo-row">
                      <span>Loan Amount</span>
                      <span>${Number(systemFindings['decision_record'].loan_amount).toLocaleString()}</span>
                    </div>
                  )}
                  {systemFindings['decision_record'].interest_rate && (
                    <div className="dr-dispo-row">
                      <span>Interest Rate</span><span>{systemFindings['decision_record'].interest_rate}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Lock Info */}
              {status === RECORD_STATUS.LOCKED && (
                <div className="dr-info-card dr-lock-card">
                  <div className="dr-card-label">🔒 Lock Info</div>
                  <div className="dr-lock-row"><span>Locked At</span><span>{fmtTs(record.locked_at)}</span></div>
                  <div className="dr-lock-row"><span>Locked By</span><span>{record.locked_by_user_id || '—'}</span></div>
                  <div className="dr-lock-row"><span>Record Version</span><span>v{record.record_version}</span></div>
                  {record.record_hash && (
                    <div className="dr-lock-row dr-hash-row">
                      <span>SHA-256</span>
                      <code className="dr-hash-val">{record.record_hash}</code>
                    </div>
                  )}
                </div>
              )}

              {/* Version history note */}
              {record.supersedes_record_id && (
                <div className="dr-info-card dr-version-card">
                  <div className="dr-card-label">Version History</div>
                  <div className="dr-version-row">
                    <span>Supersedes</span>
                    <code>{record.supersedes_record_id}</code>
                  </div>
                  {record.change_reason && (
                    <div className="dr-version-row">
                      <span>Change Reason</span>
                      <span>{record.change_reason}</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* ── Record footer ── */}
          <div className="dr-footer">
            <span>LoanBeacons Decision Record™ · Module 21</span>
            <span>·</span>
            <span>{fmtTs(record.header?.updatedAt)}</span>
            <span>·</span>
            <span className="dr-footer-score"
              style={{ color: score >= 0.9 ? '#34d399' : score >= 0.5 ? '#f59e0b' : '#ef4444' }}>
              {Math.round(score * 100)}% complete
            </span>
          </div>

        </div>
      )}
    </div>
  );
}