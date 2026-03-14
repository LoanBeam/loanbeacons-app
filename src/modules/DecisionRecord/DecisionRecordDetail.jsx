// src/modules/DecisionRecord/DecisionRecordDetail.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getAuth } from 'firebase/auth';

// ─── Module label map (matches MODULE_KEYS from constants) ───────────────────
const MODULE_LABELS = {
  SCENARIO_CREATOR:      { num: 1,  label: 'Scenario Creator',       route: '/scenario-creator'    },
  QUALIFYING_INTEL:      { num: 2,  label: 'Qualifying Intelligence', route: '/qualifying'           },
  INCOME_ANALYZER:       { num: 3,  label: 'Income Analyzer',         route: '/income'               },
  ASSET_ANALYZER:        { num: 4,  label: 'Asset Analyzer',          route: '/assets'               },
  CREDIT_INTEL:          { num: 5,  label: 'Credit Intelligence',     route: '/credit'               },
  LENDER_MATCH:          { num: 6,  label: 'Lender Match™',           route: '/lender-match'         },
  DPA_INTEL:             { num: 7,  label: 'DPA Intelligence™',       route: '/dpa'                  },
  AUS_RESCUE:            { num: 8,  label: 'AUS Rescue™',             route: '/aus-rescue'           },
  PROPERTY_INTEL:        { num: 9,  label: 'Property Intelligence',   route: '/property'             },
  TITLE_INTEL:           { num: 10, label: 'Title Intelligence',      route: '/title'                },
  CLOSING_COST_CALC:     { num: 11, label: 'Closing Cost Calculator', route: '/closing-costs'        },
  CRA_INTEL:             { num: 12, label: 'CRA Intelligence',        route: '/cra'                  },
  RATE_INTEL:            { num: 13, label: 'Rate Intelligence',       route: '/rate'                 },
  DISCLOSURE_INTEL:      { num: 14, label: 'Disclosure Intelligence', route: '/disclosures'          },
  COMPLIANCE_INTEL:      { num: 15, label: 'Compliance Intelligence', route: '/compliance'           },
  FLOOD_INTEL:           { num: 16, label: 'Flood Intelligence',      route: '/flood'                },
  REHAB_INTEL:           { num: 17, label: 'Rehab Intelligence™',     route: '/rehab'                },
};

const SEVERITY_CONFIG = {
  CRITICAL: { bg: 'bg-red-50',    border: 'border-red-300',   text: 'text-red-800',    icon: '🔴', badge: 'bg-red-600 text-white'    },
  HIGH:     { bg: 'bg-orange-50', border: 'border-orange-300',text: 'text-orange-800', icon: '🟠', badge: 'bg-orange-500 text-white'  },
  MEDIUM:   { bg: 'bg-amber-50',  border: 'border-amber-300', text: 'text-amber-800',  icon: '🟡', badge: 'bg-amber-400 text-slate-900'},
  LOW:      { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-800',   icon: '🔵', badge: 'bg-blue-200 text-blue-800'  },
  INFO:     { bg: 'bg-slate-50',  border: 'border-slate-200', text: 'text-slate-600',  icon: '⚪', badge: 'bg-slate-200 text-slate-600'},
};

// ─── Completeness Score Ring ─────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Strong' : score >= 50 ? 'Partial' : 'Incomplete';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg width="112" height="112" className="-rotate-90" viewBox="0 0 112 112">
          <circle cx="56" cy="56" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-800" style={{ fontFamily: 'monospace' }}>{score}%</span>
        </div>
      </div>
      <div className="text-xs font-semibold mt-1" style={{ color }}>{label}</div>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ id, title, badge, badgeColor = 'bg-amber-100 text-amber-800', children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-800">{title}</span>
          {badge !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
        </div>
        <span className="text-slate-400 text-lg">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ─── Module Findings Grid ────────────────────────────────────────────────────
function ModuleFindingsGrid({ moduleVersionTags, evidence }) {
  const navigate = useNavigate();
  const evidenceByModule = {};
  (evidence || []).forEach(e => {
    if (!evidenceByModule[e.moduleKey]) evidenceByModule[e.moduleKey] = [];
    evidenceByModule[e.moduleKey].push(e);
  });

  const allModuleKeys = Object.keys(MODULE_LABELS);
  const ranModuleKeys = Object.keys(moduleVersionTags || {});

  return (
    <div className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {allModuleKeys.map(key => {
          const cfg = MODULE_LABELS[key];
          const ran = ranModuleKeys.includes(key);
          const version = moduleVersionTags?.[key];
          const items = evidenceByModule[key] || [];
          const flaggedItems = items.filter(i => i.flagged);

          return (
            <div key={key}
              className={`rounded-lg border p-3 ${ran ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-400 font-mono w-5 text-right">{cfg.num}</span>
                  <span className={`text-sm font-semibold ${ran ? 'text-slate-800' : 'text-slate-400'}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {flaggedItems.length > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">⚑ {flaggedItems.length}</span>
                  )}
                  <span className={`w-2.5 h-2.5 rounded-full ${ran ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
              </div>
              {ran && items.length > 0 && (
                <div className="space-y-1 mt-2 border-t border-slate-100 pt-2">
                  {items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-500 truncate max-w-[60%]">{item.label}</span>
                      <span className={`font-mono font-semibold truncate max-w-[38%] text-right ${item.flagged ? 'text-red-600' : 'text-slate-700'}`}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-xs text-slate-400 text-right">+{items.length - 3} more</div>
                  )}
                </div>
              )}
              {ran && version && (
                <div className="text-xs text-slate-300 font-mono mt-1">v{version}</div>
              )}
              {/* Navigate to module button */}
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                {!ran && <span className="text-xs text-slate-400 italic">Not yet run</span>}
                {ran && <span className="text-xs text-emerald-600 font-semibold">✓ Logged</span>}
                <button
                  onClick={() => navigate(cfg.route)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                    ran
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {ran ? 'Re-run →' : 'Open Module →'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Risk Flags Panel ────────────────────────────────────────────────────────
function RiskFlagsPanel({ riskFlags }) {
  const flags = riskFlags || [];
  if (flags.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-2xl mb-2">✅</div>
        <div className="text-slate-500 text-sm">No risk flags recorded</div>
      </div>
    );
  }

  // Normalize severity to uppercase — service may write lowercase
  const normalize = (f) => ({
    ...f,
    severity: (f.severity || 'INFO').toUpperCase(),
    // Service writes: flag_code, detail, source_module — UI expected: code, message, moduleKey
    code:      f.flag_code    || f.code      || '',
    message:   f.detail       || f.message   || f.flag_code || f.code || '',
    moduleKey: f.source_module || f.moduleKey || '',
  });

  const sorted = [...flags].map(normalize).sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, WARNING: 3, LOW: 4, INFO: 5 };
    return (order[a.severity] ?? 6) - (order[b.severity] ?? 6);
  });

  return (
    <div className="p-5 space-y-3">
      {sorted.map((flag, i) => {
        const cfg = SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.INFO;
        return (
          <div key={i} className={`rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{cfg.icon}</span>
                <div>
                  <div className={`font-semibold text-sm ${cfg.text}`}>{flag.message}</div>
                  {flag.code && flag.code !== flag.message && (
                    <div className="text-xs font-mono text-slate-400 mt-0.5">{flag.code}</div>
                  )}
                  {flag.moduleKey && (
                    <div className="text-xs text-slate-500 mt-1">
                      Source: {MODULE_LABELS[flag.moduleKey]?.label || flag.moduleKey}
                    </div>
                  )}
                  {flag.resolution && (
                    <div className="text-xs text-slate-600 mt-2 bg-white bg-opacity-60 rounded px-2 py-1">
                      💡 {flag.resolution}
                    </div>
                  )}
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${cfg.badge}`}>
                {flag.severity}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Evidence Log ────────────────────────────────────────────────────────────
function EvidenceLog({ evidence }) {
  const [filterModule, setFilterModule] = useState('ALL');
  const items = evidence || [];
  const moduleKeys = ['ALL', ...new Set(items.map(e => e.moduleKey).filter(Boolean))];

  const filtered = filterModule === 'ALL' ? items : items.filter(e => e.moduleKey === filterModule);

  return (
    <div>
      {/* Module filter tabs */}
      <div className="px-5 pt-4 pb-2 flex gap-2 flex-wrap border-b border-slate-100">
        {moduleKeys.map(k => (
          <button key={k}
            onClick={() => setFilterModule(k)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${filterModule === k ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {k === 'ALL' ? 'All' : (MODULE_LABELS[k]?.label || k)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">No evidence items found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Module</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Label</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item, i) => (
                <tr key={i} className={item.flagged ? 'bg-red-50' : 'hover:bg-slate-50'}>
                  <td className="px-5 py-2.5 text-xs text-slate-500">
                    {MODULE_LABELS[item.moduleKey]?.label || item.moduleKey || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{item.label}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800">{item.value}</td>
                  <td className="px-4 py-2.5">
                    {item.flagged && <span className="text-red-600 font-bold">⚑</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── LO Attestation Flow ─────────────────────────────────────────────────────
function LOAttestationFlow({ record, onSave, onLock, onSubmit, saving, locked, submitted }) {
  const [notes, setNotes] = useState(record.lo_notes || '');
  const [attested, setAttested] = useState(record.lo_attestation?.confirmed || false);
  const [loName, setLoName] = useState(record.lo_attestation?.loName || '');
  const [loNmls, setLoNmls] = useState(record.lo_attestation?.loNmls || '');

  const canLock = attested && loName.trim() && !locked;
  const canSubmit = locked && !submitted;

  return (
    <div className="p-5 space-y-5">
      {/* LO Notes */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Loan Officer Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={submitted}
          placeholder="Add any qualifying notes, compensating factors, or documentation references…"
          rows={4}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:bg-slate-50 disabled:text-slate-400"
        />
        {!submitted && (
          <button onClick={() => onSave({ lo_notes: notes })}
            disabled={saving}
            className="mt-2 text-xs text-amber-700 hover:text-amber-900 font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : '💾 Save Notes'}
          </button>
        )}
      </div>

      {/* Attestation fields */}
      {!submitted && (
        <div className="border-t border-slate-100 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Attestation:</strong> By signing below, I certify that I have reviewed all module findings in this Decision Record, 
              that the information is accurate to the best of my knowledge, and that this file is ready for submission.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">LO Full Name</label>
              <input type="text" value={loName} onChange={e => setLoName(e.target.value)}
                disabled={locked}
                placeholder="Jane Smith"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">NMLS ID</label>
              <input type="text" value={loNmls} onChange={e => setLoNmls(e.target.value)}
                disabled={locked}
                placeholder="123456"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50" />
            </div>
          </div>
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${attested ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-300 hover:bg-slate-100'} ${locked ? 'pointer-events-none' : ''}`}>
            <input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)}
              disabled={locked}
              className="mt-0.5 w-4 h-4 accent-emerald-600" />
            <span className="text-xs text-slate-700">
              I attest that this Decision Record is complete and accurate, and I authorize this record to be locked and submitted.
            </span>
          </label>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
        {!locked && (
          <button onClick={() => onLock({ lo_notes: notes, lo_attestation: { confirmed: attested, loName, loNmls, attestedAt: new Date().toISOString() } })}
            disabled={!canLock || saving}
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            🔒 Lock Record
          </button>
        )}
        {locked && !submitted && (
          <>
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
              🔒 Record Locked
            </div>
            <button onClick={onSubmit}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
              ✅ Submit Record
            </button>
          </>
        )}
        {submitted && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-lg font-semibold">
            ✅ Submitted — {record.lo_attestation?.loName || 'LO'} · {record.submittedAt?.toDate ? record.submittedAt.toDate().toLocaleDateString() : '—'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Detail Component ───────────────────────────────────────────────────
export default function DecisionRecordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showAttestationPrompt, setShowAttestationPrompt] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'decisionRecords', id));
        if (!snap.exists()) { setError('Decision Record not found'); return; }
        const data = { id: snap.id, ...snap.data() };

        // If header is missing borrower name, fetch scenario directly as fallback
        const h = data.header || {};
        const hasBorrower = h.borrowerName?.trim() || h.borrowerFirstName?.trim() || h.name?.trim();
        const scenarioId = h.scenarioId || data.scenarioId || data['$scenarioId'] || h['$scenarioId'];

        if (!hasBorrower && scenarioId) {
          try {
            const scenSnap = await getDoc(doc(db, 'scenarios', scenarioId));
            if (scenSnap.exists()) {
              const s = scenSnap.data();
              const firstName = s.firstName || s.borrower?.firstName || '';
              const lastName  = s.lastName  || s.borrower?.lastName  || '';
              const borrowerName = (firstName || lastName)
                ? `${firstName} ${lastName}`.trim()
                : (s.borrowerName || s.name || '');
              data.header = {
                ...h,
                borrowerName:    borrowerName || h.borrowerName || '',
                loanType:        h.loanType    || s.loanType    || s.program    || '',
                loanPurpose:     h.loanPurpose || s.loanPurpose || s.purpose    || '',
                propertyAddress: h.propertyAddress || s.streetAddress || s.propertyAddress || s.address || '',
              };
            }
          } catch (e) {
            console.warn('[DecisionRecordDetail] Scenario fallback fetch failed:', e.message);
          }
        }

        setRecord(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Auto-prompt when completeness reaches 100% and record is not yet locked
  useEffect(() => {
    if (!record) return;
    const score = record.completeness_score || 0;
    const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
    if (pct >= 100 && !record.locked && !record.submittedAt) {
      setShowAttestationPrompt(true);
    }
  }, [record]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(updates) {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'decisionRecords', id), { ...updates, updatedAt: serverTimestamp() });
      setRecord(r => ({ ...r, ...updates }));
      showToast('Saved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLock(updates) {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'decisionRecords', id), {
        ...updates,
        locked: true,
        lockedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRecord(r => ({ ...r, ...updates, locked: true }));
      showToast('Record locked');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'decisionRecords', id), {
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRecord(r => ({ ...r, submittedAt: true }));
      showToast('Record submitted successfully!');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full" />
        Loading decision record…
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md text-center">
        <div className="text-red-700 font-semibold mb-2">Error</div>
        <div className="text-red-600 text-sm">{error}</div>
        <button onClick={() => navigate('/decision-records')} className="mt-4 text-sm text-slate-600 underline">← Back to list</button>
      </div>
    </div>
  );

  const { header = {}, evidence = [], completeness_score = 0, lo_attestation = {}, lo_notes = '', locked, submittedAt } = record;

  // Service writes moduleVersionTags under header.moduleVersionTags (NOT root)
  // Service writes risk flags as risk_flags (NOT riskFlags)
  // Service writes completeness as 0.0–1.0 fraction (NOT percentage)
  const moduleVersionTags = header.moduleVersionTags || record.moduleVersionTags || {};
  const riskFlags = record.risk_flags || record.riskFlags || [];
  const completeness_pct = completeness_score <= 1
    ? Math.round(completeness_score * 100)
    : Math.round(completeness_score);

  const borrower = header.borrowerName?.trim()
    || [header.borrowerFirstName, header.borrowerLastName].filter(Boolean).join(' ').trim()
    || header.name?.trim()
    || null;

  const moduleCount = Object.keys(moduleVersionTags).length;
  const criticalFlags = riskFlags.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
  const status = locked ? (submittedAt ? 'submitted' : 'locked') : 'draft';
  const STATUS_CONFIG = {
    submitted: { label: 'Submitted', bg: 'bg-emerald-100', text: 'text-emerald-800' },
    locked:    { label: 'Locked',    bg: 'bg-blue-100',    text: 'text-blue-800'    },
    draft:     { label: 'In Progress', bg: 'bg-amber-100', text: 'text-amber-800'   },
  };
  const statusCfg = STATUS_CONFIG[status];

  function fmtTs(ts) {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return '—'; }
  }

  // Suggested next modules (first 3 not yet run)
  const allKeys = Object.keys(MODULE_LABELS);
  const notRun = allKeys.filter(k => !moduleVersionTags[k]);
  const nextModules = notRun.slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-semibold shadow-lg ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── 100% Completeness Auto-Prompt ── */}
      {showAttestationPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 pointer-events-none">
          <div className="bg-white border-2 border-emerald-400 rounded-2xl shadow-2xl p-6 max-w-lg w-full pointer-events-auto animate-bounce-once">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow">
                <span className="text-2xl">🏆</span>
              </div>
              <div className="flex-1">
                <h3 className="text-slate-900 font-black text-lg mb-1">All Modules Complete!</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  This Decision Record has reached 100% completeness. All 17 module findings are logged. 
                  You can now lock and sign the record to create a tamper-evident audit trail.
                </p>
                <div className="flex gap-3">
                  <a href="#attestation"
                    onClick={() => setShowAttestationPrompt(false)}
                    className="px-5 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                    🔒 Lock & Sign Now
                  </a>
                  <button
                    onClick={() => setShowAttestationPrompt(false)}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                    Review First
                  </button>
                </div>
              </div>
              <button onClick={() => setShowAttestationPrompt(false)}
                className="text-slate-300 hover:text-slate-500 text-xl leading-none mt-0.5">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Header ── */}
      <div className="bg-slate-900 px-6 py-5 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <button onClick={() => navigate('/decision-records')}
                className="text-slate-400 hover:text-amber-400 text-sm mb-2 flex items-center gap-1 transition-colors">
                ← Decision Records
              </button>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                  <span className="text-slate-900 font-black text-sm">21</span>
                </div>
                <h1 className="text-white text-xl font-bold">{borrower || 'Unnamed Borrower'}</h1>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>{statusCfg.label}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-11 flex-wrap">
                {header.loanType    && <span className="text-xs text-amber-400 font-bold">{header.loanType}</span>}
                {header.loanPurpose && <span className="text-xs text-slate-400">{header.loanPurpose}</span>}
                {(header.propertyAddress || header.borrowerAddress || header.streetAddress) && (
                  <span className="text-xs text-slate-500">📍 {header.propertyAddress || header.borrowerAddress || header.streetAddress}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6 text-right shrink-0">
              <div>
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Modules</div>
                <div className="text-white font-black font-mono text-xl">{moduleCount}<span className="text-slate-500 text-sm font-normal"> / 17</span></div>
              </div>
              <div>
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Complete</div>
                <div className={`font-black font-mono text-xl ${completeness_pct >= 80 ? 'text-emerald-400' : completeness_pct >= 50 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {completeness_pct}%
                </div>
              </div>
              {criticalFlags > 0 && (
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Flags</div>
                  <div className="text-red-400 font-black font-mono text-xl">{riskFlags.length}</div>
                </div>
              )}
            </div>
          </div>

          {/* Scroll nav */}
          <div className="flex gap-5 mt-4 ml-11 border-t border-slate-800 pt-3">
            {['overview','modules','risk-flags','evidence','attestation'].map(s => (
              <a key={s} href={`#${s}`}
                className="text-xs text-slate-400 hover:text-amber-400 capitalize transition-colors">
                {s.replace('-', ' ')}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {/* ── What Is This? Banner (shown when record is new) ── */}
        {moduleCount === 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="text-3xl">📋</div>
              <div className="flex-1">
                <h2 className="text-indigo-900 font-bold text-base mb-1">This is {borrower ? `${borrower}'s` : 'a'} Decision Record</h2>
                <p className="text-indigo-700 text-sm leading-relaxed mb-3">
                  A Decision Record is a complete audit trail for this loan scenario. As you run each LoanBeacons module — 
                  AUS Rescue, Lender Match, DPA Intelligence, and more — their findings are automatically logged here. 
                  When all relevant modules are complete, you lock and submit the record.
                </p>
                <div className="flex items-center gap-2 text-indigo-600 text-xs font-semibold">
                  <span className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-800 font-black">1</span> Run modules on this scenario
                  <span className="text-indigo-300 mx-1">→</span>
                  <span className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-800 font-black">2</span> Click Save to Decision Record
                  <span className="text-indigo-300 mx-1">→</span>
                  <span className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-800 font-black">3</span> Lock & submit below
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Overview Row ── */}
        <div id="overview" className="grid grid-cols-3 gap-4">
          {/* Completeness */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-5">
            <ScoreRing score={completeness_pct} />
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Completeness</div>
              <div className="text-sm font-semibold text-slate-700">{moduleCount} / 17 modules</div>
              <div className="text-xs text-slate-400 mt-1">{(evidence || []).length} evidence items</div>
              <div className="text-xs text-slate-400">{riskFlags.length} risk flags</div>
            </div>
          </div>

          {/* Scenario data */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">Loan Details</div>
            <div className="space-y-2 text-sm">
              {[
                ['Borrower',     borrower],
                ['Loan Purpose', header.loanPurpose || header.purpose],
                ['Loan Type',    header.loanType || header.program],
                ['Property',     header.propertyAddress || header.borrowerAddress || header.streetAddress],
              ].map(([k, v]) => v ? (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-slate-400 shrink-0">{k}</span>
                  <span className="text-slate-700 font-medium text-xs text-right truncate max-w-[55%]">{v}</span>
                </div>
              ) : null)}
              {!borrower && !header.loanType && (
                <p className="text-slate-400 text-xs italic">Scenario data will appear here after your first module save.</p>
              )}
            </div>
          </div>

          {/* Audit trail */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">Audit Trail</div>
            <div className="space-y-2 text-xs">
              {[
                ['Created',   fmtTs(record.createdAt)],
                ['Updated',   fmtTs(record.updatedAt)],
                ['Locked',    fmtTs(record.lockedAt)],
                ['Submitted', fmtTs(record.submittedAt)],
                ['Signed By', lo_attestation?.loName || '—'],
                ['NMLS',      lo_attestation?.loNmls || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-slate-400">{k}</span>
                  <span className={`font-mono text-right ${v === '—' ? 'text-slate-300' : 'text-slate-700'}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Next Steps (shown when modules < 3 run) ── */}
        {moduleCount < 3 && nextModules.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-amber-500 text-lg">⚡</span>
              <span className="font-bold text-slate-800">Suggested Next Modules</span>
              <span className="text-xs text-slate-400 ml-1">— run these to build the audit trail</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {nextModules.map(key => {
                const cfg = MODULE_LABELS[key];
                return (
                  <button key={key} onClick={() => navigate(cfg.route)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50 transition-all text-left group">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-black text-amber-700 shrink-0 group-hover:bg-amber-200">
                      {cfg.num}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700 group-hover:text-amber-700">{cfg.label}</div>
                      <div className="text-xs text-amber-600 font-medium mt-0.5">Open →</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Module Findings ── */}
        <div id="modules">
          <Section title="Module Findings" badge={`${moduleCount} / 17`} badgeColor={moduleCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}>
            <ModuleFindingsGrid moduleVersionTags={moduleVersionTags} evidence={evidence} />
          </Section>
        </div>

        {/* ── Risk Flags ── */}
        <div id="risk-flags">
          <Section title="Risk Flags" badge={riskFlags.length}
            badgeColor={criticalFlags > 0 ? 'bg-red-100 text-red-700' : riskFlags.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}>
            <RiskFlagsPanel riskFlags={riskFlags} />
          </Section>
        </div>

        {/* ── Evidence Log ── */}
        <div id="evidence">
          <Section title="Evidence Log" badge={(evidence || []).length} badgeColor="bg-blue-100 text-blue-700" defaultOpen={(evidence || []).length > 0}>
            <EvidenceLog evidence={evidence} />
          </Section>
        </div>

        {/* ── LO Attestation ── */}
        <div id="attestation">
          <Section title="LO Attestation & Sign-Off" defaultOpen={moduleCount >= 5 && !record.submittedAt}>
            <LOAttestationFlow
              record={record}
              onSave={handleSave}
              onLock={handleLock}
              onSubmit={handleSubmit}
              saving={saving}
              locked={!!locked}
              submitted={!!submittedAt}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
