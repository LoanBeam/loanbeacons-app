// src/modules/DecisionRecord/DecisionRecordDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStatus(record) {
  if (record.submittedAt) return 'submitted';
  if (record.locked)      return 'locked';
  return 'draft';
}

function getBorrowerName(record) {
  const h = record.header || {};
  // Try all possible field layouts
  if (h.borrowerName && h.borrowerName.trim()) return h.borrowerName.trim();
  const full = [h.borrowerFirstName, h.borrowerLastName].filter(Boolean).join(' ');
  if (full.trim()) return full.trim();
  if (h.name && h.name.trim()) return h.name.trim();
  return null;
}

function getLoanType(record) {
  const h = record.header || {};
  return h.loanType || h.program || null;
}

function getAddress(record) {
  const h = record.header || {};
  return h.propertyAddress || h.borrowerAddress || h.streetAddress || h.address || null;
}

function getLoanPurpose(record) {
  const h = record.header || {};
  return h.loanPurpose || h.purpose || null;
}

// Service writes moduleVersionTags under header, risk_flags at root, score as 0–1 fraction
function getModuleVersionTags(record) {
  return record.header?.moduleVersionTags || record.moduleVersionTags || {};
}
function getRiskFlags(record) {
  return record.risk_flags || record.riskFlags || [];
}
function getCompletenessScore(record) {
  const raw = record.completeness_score || 0;
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}
function getFileNumber(record) {
  return record.header?.fileNumber || null;
}

function formatDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null;
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null;
  if (!d) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const MODULE_DISPLAY = {
  SCENARIO_CREATOR:    'Scenario',
  QUALIFYING_INTEL:    'Qualifying',
  INCOME_ANALYZER:     'Income',
  ASSET_ANALYZER:      'Assets',
  CREDIT_INTEL:        'Credit',
  LENDER_MATCH:        'Lender Match',
  DPA_INTEL:           'DPA',
  AUS_RESCUE:          'AUS Rescue',
  PROPERTY_INTEL:      'Property',
  TITLE_INTEL:         'Title',
  CLOSING_COST_CALC:   'Closing Costs',
  CRA_INTEL:           'CRA',
  RATE_INTEL:          'Rate',
  DISCLOSURE_INTEL:    'Disclosures',
  COMPLIANCE_INTEL:    'Compliance',
  FLOOD_INTEL:         'Flood',
  REHAB_INTEL:         'Rehab',
};

const LOAN_TYPE_COLORS = {
  FHA:          { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: '#3b82f6' },
  CONVENTIONAL: { bg: 'bg-violet-100', text: 'text-violet-800', dot: '#7c3aed' },
  VA:           { bg: 'bg-green-100',  text: 'text-green-800',  dot: '#16a34a' },
  USDA:         { bg: 'bg-emerald-100',text: 'text-emerald-800',dot: '#059669' },
  'NON-QM':     { bg: 'bg-orange-100', text: 'text-orange-800', dot: '#ea580c' },
  DEFAULT:      { bg: 'bg-slate-100',  text: 'text-slate-700',  dot: '#64748b' },
};

function getLoanTypeStyle(loanType) {
  if (!loanType) return LOAN_TYPE_COLORS.DEFAULT;
  const upper = loanType.toUpperCase();
  for (const key of Object.keys(LOAN_TYPE_COLORS)) {
    if (upper.includes(key)) return LOAN_TYPE_COLORS[key];
  }
  return LOAN_TYPE_COLORS.DEFAULT;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CompletenessRing({ score, size = 52 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span className="absolute text-xs font-black" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {score}%
      </span>
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = {
    submitted: { label: 'Submitted', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
    locked:    { label: 'Locked',    cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
    draft:     { label: 'In Progress', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  }[status] || { label: 'Draft', cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ModuleDots({ moduleVersionTags }) {
  const all = Object.keys(MODULE_DISPLAY);
  const run = new Set(Object.keys(moduleVersionTags || {}));
  const runCount = run.size;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 flex-wrap" style={{ maxWidth: 120 }}>
        {all.map(key => (
          <div key={key}
            title={MODULE_DISPLAY[key]}
            className={`w-2 h-2 rounded-full ${run.has(key) ? 'bg-emerald-500' : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className="text-xs font-bold text-slate-600">{runCount}<span className="text-slate-400 font-normal">/17</span></span>
    </div>
  );
}

function RiskBadge({ flags }) {
  if (!flags || flags.length === 0) return (
    <span className="text-xs text-slate-400 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      No flags
    </span>
  );
  const hasCritical = flags.some(f => ['CRITICAL','HIGH'].includes(f.severity));
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold ${hasCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
      ⚑ {flags.length} {hasCritical ? 'Critical' : 'Warning'}
    </span>
  );
}

function RecordCard({ record, onClick }) {
  const borrower   = getBorrowerName(record);
  const loanType   = getLoanType(record);
  const address    = getAddress(record);
  const purpose    = getLoanPurpose(record);
  const status     = getStatus(record);
  const score      = getCompletenessScore(record);
  const flags      = getRiskFlags(record);
  const fileNumber = getFileNumber(record);
  const updDate    = formatDate(record.updatedAt);
  const updTime    = formatTime(record.updatedAt);
  const creDate    = formatDate(record.createdAt);
  const lts        = getLoanTypeStyle(loanType);
  const moduleTags = getModuleVersionTags(record);
  const modules    = Object.keys(moduleTags);
  const lastModule = modules.length > 0 ? MODULE_DISPLAY[modules[modules.length - 1]] || modules[modules.length - 1] : null;

  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-2xl p-5 cursor-pointer hover:border-amber-400 hover:shadow-lg transition-all group"
      style={{ borderLeft: `4px solid ${lts.dot}` }}
    >
      {/* Top row: borrower + status */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          {borrower ? (
            <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-700 truncate transition-colors">
              {borrower}
            </h3>
          ) : (
            <h3 className="text-base font-semibold text-slate-400 italic">No borrower name yet</h3>
          )}
          {address && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">📍 {address}</p>
          )}
        </div>
        <StatusPill status={status} />
      </div>

      {/* File number */}
      {fileNumber && (
        <div className="mb-2">
          <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{fileNumber}</span>
        </div>
      )}

      {/* Loan details row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {loanType && (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${lts.bg} ${lts.text}`}>
            {loanType}
          </span>
        )}
        {purpose && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {purpose}
          </span>
        )}
        {lastModule && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
            Last: {lastModule}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CompletenessRing score={score} size={48} />
          <div>
            <ModuleDots moduleVersionTags={moduleTags} />
            <div className="mt-1.5">
              <RiskBadge flags={flags} />
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          {updDate && (
            <>
              <div className="text-xs font-semibold text-slate-600">{updDate}</div>
              <div className="text-xs text-slate-400">{updTime}</div>
            </>
          )}
          {!updDate && creDate && (
            <div className="text-xs text-slate-400">Created {creDate}</div>
          )}
          <div className="text-amber-400 group-hover:text-amber-600 mt-1 text-sm font-bold transition-colors">
            Open →
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function DecisionRecordDashboard() {
  const navigate = useNavigate();
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [sortBy, setSortBy]     = useState('updated');

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, 'decisionRecords'));
        let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

        // For records missing borrower name, fetch scenario data to backfill
        const enriched = await Promise.all(data.map(async (record) => {
          if (getBorrowerName(record)) return record; // already has name
          const scenarioId = record.header?.scenarioId || record.scenarioId || record['$scenarioId'] || record.header?.['$scenarioId'];
          if (!scenarioId) return record;
          try {
            const sSnap = await getDoc(doc(db, 'scenarios', scenarioId));
            if (!sSnap.exists()) return record;
            const s = sSnap.data();
            const firstName = s.firstName || s.borrower?.firstName || '';
            const lastName  = s.lastName  || s.borrower?.lastName  || '';
            const borrowerName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : (s.borrowerName || s.name || '');
            return {
              ...record,
              header: {
                ...(record.header || {}),
                borrowerName:    borrowerName || '',
                loanType:        record.header?.loanType    || s.loanType    || s.program    || '',
                loanPurpose:     record.header?.loanPurpose || s.loanPurpose || s.purpose    || '',
                propertyAddress: record.header?.propertyAddress || s.streetAddress || s.propertyAddress || s.address || '',
              }
            };
          } catch { return record; }
        }));

        setRecords(enriched);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const counts = {
    all:       records.length,
    draft:     records.filter(r => getStatus(r) === 'draft').length,
    locked:    records.filter(r => getStatus(r) === 'locked').length,
    submitted: records.filter(r => getStatus(r) === 'submitted').length,
  };

  let filtered = records.filter(r => {
    if (filter !== 'all' && getStatus(r) !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (getBorrowerName(r) || '').toLowerCase();
      const addr = (getAddress(r) || '').toLowerCase();
      const loan = (getLoanType(r) || '').toLowerCase();
      if (!name.includes(q) && !addr.includes(q) && !loan.includes(q)) return false;
    }
    return true;
  });

  if (sortBy === 'completeness') {
    filtered = [...filtered].sort((a, b) => (b.completeness_score || 0) - (a.completeness_score || 0));
  } else if (sortBy === 'name') {
    filtered = [...filtered].sort((a, b) => (getBorrowerName(a) || 'zzz').localeCompare(getBorrowerName(b) || 'zzz'));
  }

  const submitted = counts.submitted;
  const avgComplete = records.length
    ? Math.round(records.reduce((s, r) => s + (r.completeness_score || 0), 0) / records.length)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-slate-900 px-6 py-6 border-b border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg">
                <span className="text-slate-900 font-black text-sm">21</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-white text-xl font-black tracking-tight">Decision Records</h1>
                  <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded font-mono">Module 21</span>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">Auto-logged audit trail across all 17 active modules</p>
              </div>
            </div>
            {/* Summary KPIs */}
            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="text-3xl font-black text-white font-mono leading-none">{records.length}</div>
                <div className="text-slate-500 text-xs mt-1 uppercase tracking-widest">Records</div>
              </div>
              <div className="w-px h-10 bg-slate-700" />
              <div>
                <div className="text-3xl font-black text-emerald-400 font-mono leading-none">{submitted}</div>
                <div className="text-slate-500 text-xs mt-1 uppercase tracking-widest">Submitted</div>
              </div>
              <div className="w-px h-10 bg-slate-700" />
              <div>
                <div className="text-3xl font-black text-amber-400 font-mono leading-none">{avgComplete}%</div>
                <div className="text-slate-500 text-xs mt-1 uppercase tracking-widest">Avg Complete</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* ── Filter tabs ── */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {[
            { key: 'all',       label: 'All',         count: counts.all },
            { key: 'draft',     label: 'In Progress', count: counts.draft },
            { key: 'locked',    label: 'Locked',      count: counts.locked },
            { key: 'submitted', label: 'Submitted',   count: counts.submitted },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                filter === f.key
                  ? 'bg-amber-500 border-amber-500 text-white shadow-md'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700'
              }`}>
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                filter === f.key ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'
              }`}>{f.count}</span>
            </button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search borrower, address, loan type…"
              className="pl-8 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white w-64"
            />
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="updated">Sort: Most Recent</option>
            <option value="completeness">Sort: Completeness</option>
            <option value="name">Sort: Borrower Name</option>
          </select>
        </div>

        {/* ── Records ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <div className="text-slate-500 text-sm">Loading decision records…</div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
            ⚠️ {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">📋</div>
            <div className="text-slate-700 font-semibold text-lg">No decision records found</div>
            <div className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">
              Records are created automatically when you run any module on a scenario. Go to AUS Rescue and click Save to Decision Record.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map(record => (
              <RecordCard
                key={record.id}
                record={record}
                onClick={() => navigate(`/decision-records/${record.id}`)}
              />
            ))}
          </div>
        )}

        {/* ── Footer note ── */}
        {filtered.length > 0 && (
          <p className="text-center text-xs text-slate-400 mt-6">
            Showing {filtered.length} of {records.length} records · Click any card to open the full Decision Record
          </p>
        )}
      </div>
    </div>
  );
}
