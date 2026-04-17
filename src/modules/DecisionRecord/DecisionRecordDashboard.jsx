// src/modules/DecisionRecord/DecisionRecordDashboard.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

const MODULES = [
  { key:'SCENARIO_CREATOR',    label:'Scenario',      route:'/scenario-creator',    icon:'📋', stage:1 },
  { key:'QUALIFYING_INTEL',    label:'Qualifying',    route:'/qualifying-intel',    icon:'🎯', stage:1 },
  { key:'INCOME_ANALYZER',     label:'Income',        route:'/income-analyzer',     icon:'💵', stage:1 },
  { key:'ASSET_ANALYZER',      label:'Assets',        route:'/asset-analyzer',      icon:'🏦', stage:1 },
  { key:'CREDIT_INTEL',        label:'Credit',        route:'/credit-intel',        icon:'📈', stage:1 },
  { key:'DPA_INTEL',           label:'DPA',           route:'/dpa-intelligence',    icon:'🏅', stage:2 },
  { key:'LENDER_MATCH',        label:'Lender Match',  route:'/lender-match',        icon:'🎯', stage:2 },
  { key:'AUS_RESCUE',          label:'AUS Rescue',    route:'/aus-rescue',          icon:'🚨', stage:2 },
  { key:'ARM_STRUCTURE',       label:'ARM',           route:'/arm-structure',       icon:'📉', stage:2 },
  { key:'REHAB_INTELLIGENCE',  label:'Rehab',         route:'/rehab-intelligence',  icon:'🔧', stage:2 },
  { key:'PIGGYBACK_OPTIMIZER', label:'Piggyback',     route:'/piggyback-optimizer', icon:'🔗', stage:2 },
  { key:'PROPERTY_INTEL',      label:'Collateral',    route:'/property-intel',      icon:'🏡', stage:2 },
  { key:'CLOSING_COST_CALC',   label:'Closing Costs', route:'/closing-cost-calc',   icon:'🧾', stage:3 },
  { key:'RATE_INTEL',          label:'Rate',          route:'/rate-intel',          icon:'📊', stage:3 },
  { key:'TITLE_INTEL',         label:'Title',         route:'/title-intel',         icon:'📄', stage:3 },
  { key:'COMPLIANCE_INTEL',    label:'Compliance',    route:'/compliance-intel',    icon:'⚠️', stage:4 },
  { key:'DISCLOSURE_INTEL',    label:'Disclosures',   route:'/disclosure-intel',    icon:'📜', stage:4 },
  { key:'FLOOD_INTEL',         label:'Flood',         route:'/flood-intel',         icon:'🌊', stage:4 },
  { key:'CRA_INTEL',           label:'CRA',           route:'/cra-intel',           icon:'📌', stage:4 },
];

const STAGE_LABELS = {1:'Pre-Structure',2:'Lender Fit',3:'Final Structure',4:'Verification'};

function getBorrowerName(r){const h=r.header||{};if(h.borrowerName?.trim())return h.borrowerName.trim();const f=[h.borrowerFirstName,h.borrowerLastName].filter(Boolean).join(' ');if(f.trim())return f.trim();return h.name?.trim()||null;}
function getLoanType(r){const h=r.header||{};return h.loanType||h.program||null;}
function getAddress(r){const h=r.header||{};return h.propertyAddress||h.borrowerAddress||h.streetAddress||null;}
function getLoanPurpose(r){const h=r.header||{};return h.loanPurpose||h.purpose||null;}
function getModuleTags(r){return r.header?.moduleVersionTags||r.moduleVersionTags||{};}
function getRiskFlags(r){return r.risk_flags||r.riskFlags||[];}
function getScore(r){const s=r.completeness_score||0;return s<=1?Math.round(s*100):Math.round(s);}
function getStatus(r){return r.submittedAt?'submitted':r.locked?'locked':'draft';}
function getScenarioId(r){return r.header?.scenarioId||r.scenarioId||r['$scenarioId']||null;}
function getRiskLevel(flags){if(!flags?.length)return'clear';if(flags.some(f=>['CRITICAL','HIGH'].includes(f.severity)))return'high';return'medium';}
function formatRelative(ts){if(!ts)return null;const d=ts.toDate?ts.toDate():ts.seconds?new Date(ts.seconds*1000):null;if(!d)return null;const diff=new Date()-d,mins=Math.floor(diff/60000),hours=Math.floor(diff/3600000),days=Math.floor(diff/86400000);if(mins<2)return'Just now';if(mins<60)return`${mins}m ago`;if(hours<24)return`${hours}h ago`;if(days<7)return`${days}d ago`;return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});}
const fmt0=n=>n?'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0}):null;
const LTC={FHA:{bg:'bg-blue-100',text:'text-blue-800'},CONVENTIONAL:{bg:'bg-violet-100',text:'text-violet-800'},VA:{bg:'bg-green-100',text:'text-green-800'},USDA:{bg:'bg-emerald-100',text:'text-emerald-800'},'NON-QM':{bg:'bg-orange-100',text:'text-orange-800'},DEFAULT:{bg:'bg-slate-100',text:'text-slate-600'}};
function lts(lt){if(!lt)return LTC.DEFAULT;const u=lt.toUpperCase();for(const k of Object.keys(LTC)){if(u.includes(k))return LTC[k];}return LTC.DEFAULT;}

// ── Archive confirmation popover ──────────────────────────────
function ArchivePopover({ record, onArchive, onCancel }) {
  const name = getBorrowerName(record) || 'this record';
  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-64" onClick={e => e.stopPropagation()}>
      <div className="text-sm font-bold text-slate-800 mb-1">Archive record?</div>
      <div className="text-xs text-slate-500 mb-3 leading-relaxed">
        <span className="font-semibold text-slate-700">{name}</span> will be hidden from the dashboard but preserved in Firestore. You can restore it anytime from the Archived tab.
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onArchive}
          className="flex-1 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors"
        >
          Archive
        </button>
      </div>
    </div>
  );
}

function RecordRow({ record, isArchived, onArchiveChange }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showArchivePopover, setShowArchivePopover] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const popoverRef = useRef(null);

  const borrower = getBorrowerName(record), loanType = getLoanType(record), address = getAddress(record);
  const purpose = getLoanPurpose(record), score = getScore(record), flags = getRiskFlags(record);
  const risk = getRiskLevel(flags), tags = getModuleTags(record), relTime = formatRelative(record.updatedAt);
  const scenarioId = getScenarioId(record), sc = record._scenario || {};
  const ltsStyle = lts(loanType), runCount = Object.keys(tags).length;
  const highFlags = flags.filter(f => ['CRITICAL','HIGH'].includes(f.severity));
  const medFlags = flags.filter(f => f.severity === 'MEDIUM');
  const nextModules = MODULES.filter(m => !tags[m.key]).slice(0, 3);
  const riskLeft = risk === 'high' ? '#ef4444' : risk === 'medium' ? '#f59e0b' : 'transparent';

  const handleArchive = async (e) => {
    e.stopPropagation();
    setArchiving(true);
    try {
      await updateDoc(doc(db, 'decisionRecords', record.id), {
        archived: true,
        archivedAt: serverTimestamp(),
      });
      onArchiveChange(record.id, true);
    } catch (err) {
      console.error('Archive failed:', err);
    }
    setArchiving(false);
    setShowArchivePopover(false);
  };

  const handleRestore = async (e) => {
    e.stopPropagation();
    setArchiving(true);
    try {
      await updateDoc(doc(db, 'decisionRecords', record.id), {
        archived: false,
        archivedAt: null,
      });
      onArchiveChange(record.id, false);
    } catch (err) {
      console.error('Restore failed:', err);
    }
    setArchiving(false);
  };

  return (<>
    <tr
      onClick={() => setOpen(v => !v)}
      className={`border-b border-slate-100 cursor-pointer transition-colors ${open ? 'bg-amber-50' : 'hover:bg-slate-50'} group ${isArchived ? 'opacity-70' : ''}`}
      style={{ borderLeft: `3px solid ${riskLeft}` }}
    >
      <td className="pl-4 pr-2 py-3 w-24">
        {risk === 'high' && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600"><span className="w-2 h-2 rounded-full bg-red-500"/>High</span>}
        {risk === 'medium' && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-400"/>Review</span>}
        {risk === 'clear' && <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-400"/>Clear</span>}
      </td>
      <td className="px-3 py-3 min-w-0 max-w-xs">
        <div className="font-semibold text-sm text-slate-900 truncate">{borrower || <span className="text-slate-400 italic font-normal">Unnamed</span>}</div>
        {address && <div className="text-xs text-slate-400 truncate mt-0.5">{address}</div>}
      </td>
      <td className="px-3 py-3 w-44">
        <div className="flex flex-col gap-1">
          {loanType && <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold w-fit ${ltsStyle.bg} ${ltsStyle.text}`}>{loanType}</span>}
          {purpose && <span className="text-xs text-slate-400">{purpose.replace(/_/g, ' ')}</span>}
        </div>
      </td>
      <td className="px-3 py-3 w-28 text-center">
        <span className="text-xs font-semibold text-slate-600 tabular-nums">{runCount}<span className="text-slate-300">/{MODULES.length}</span></span>
        <div className="flex gap-0.5 flex-wrap mt-1 justify-center" style={{ maxWidth: 80 }}>
          {MODULES.slice(0, 12).map(m => <div key={m.key} className={`w-1.5 h-1.5 rounded-full ${tags[m.key] ? 'bg-emerald-400' : 'bg-slate-200'}`} title={m.label}/>)}
        </div>
      </td>
      <td className="px-3 py-3 w-28">
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${score >= 80 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${score}%` }}/></div>
          <span className="text-xs font-bold text-slate-500 tabular-nums">{score}%</span>
        </div>
      </td>
      <td className="px-3 py-3 w-28">
        {flags.length === 0 ? <span className="text-xs text-slate-300">—</span> :
          <div className="flex flex-col gap-0.5">
            {highFlags.length > 0 && <span className="text-xs font-bold text-red-600">{highFlags.length} high</span>}
            {medFlags.length > 0 && <span className="text-xs font-semibold text-amber-600">{medFlags.length} review</span>}
          </div>}
      </td>
      <td className="px-3 py-3 w-24 text-right"><span className="text-xs text-slate-400">{relTime || '—'}</span></td>

      {/* Archive / Restore action */}
      <td className="pl-2 pr-3 py-3 w-16 text-right" ref={popoverRef} style={{ position: 'relative' }}>
        <div className="flex items-center justify-end gap-1">
          {isArchived ? (
            <button
              onClick={e => { e.stopPropagation(); handleRestore(e); }}
              disabled={archiving}
              title="Restore record"
              className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg text-xs font-bold text-emerald-600 hover:bg-emerald-50 border border-emerald-200"
            >
              {archiving ? '…' : 'Restore'}
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setShowArchivePopover(v => !v); }}
              disabled={archiving}
              title="Archive record"
              className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              {archiving ? '…' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              )}
            </button>
          )}
          <span className={`text-slate-400 text-xs transition-transform inline-block ${open ? 'rotate-90' : ''}`}>›</span>
        </div>
        {showArchivePopover && (
          <ArchivePopover
            record={record}
            onArchive={handleArchive}
            onCancel={e => { e?.stopPropagation(); setShowArchivePopover(false); }}
          />
        )}
      </td>
    </tr>

    {open && (
      <tr className="border-b border-amber-200" style={{ borderLeft: `3px solid ${riskLeft}` }}>
        <td colSpan={8} className="bg-amber-50 px-5 py-5">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Scenario Context</div>
                <div className="space-y-2 text-sm">
                  {sc.loanAmount && <div className="flex justify-between"><span className="text-slate-500">Loan Amount</span><span className="font-bold text-slate-800">{fmt0(sc.loanAmount)}</span></div>}
                  {sc.propertyValue && <div className="flex justify-between"><span className="text-slate-500">Property Value</span><span className="font-bold text-slate-800">{fmt0(sc.propertyValue)}</span></div>}
                  {sc.creditScore && <div className="flex justify-between"><span className="text-slate-500">FICO</span><span className={`font-bold ${parseFloat(sc.creditScore) >= 720 ? 'text-emerald-600' : parseFloat(sc.creditScore) >= 640 ? 'text-amber-600' : 'text-red-600'}`}>{sc.creditScore}</span></div>}
                  {sc.state && <div className="flex justify-between"><span className="text-slate-500">State</span><span className="font-bold text-slate-800">{sc.state}</span></div>}
                  {!sc.loanAmount && !sc.creditScore && <div className="text-xs text-slate-400 italic">No scenario data available</div>}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); navigate(`/decision-records/${record.id}`); }} className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors text-left flex items-center gap-2">📋 Open Decision Record</button>
              {scenarioId && <button onClick={e => { e.stopPropagation(); navigate(`/scenario-creator?scenarioId=${scenarioId}`); }} className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200 transition-colors text-left flex items-center gap-2">📂 Open Scenario</button>}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Launch Module</div>
              {scenarioId ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {MODULES.map(m => {
                    const ran = !!tags[m.key];
                    return (<button key={m.key} onClick={e => { e.stopPropagation(); navigate(`${m.route}?scenarioId=${scenarioId}`); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all border ${ran ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'}`}>
                      <span className="flex-shrink-0">{m.icon}</span><span className="truncate">{m.label}</span>{ran && <span className="ml-auto text-emerald-500 flex-shrink-0">✓</span>}
                    </button>);
                  })}
                </div>
              ) : <div className="text-xs text-slate-400 italic py-2">No scenario linked — cannot launch modules</div>}
            </div>
            <div className="space-y-3">
              {flags.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Active Flags</div>
                  <div className="space-y-2">
                    {flags.slice(0, 5).map((f, i) => { const isH = ['CRITICAL','HIGH'].includes(f.severity); return (<div key={i} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${isH ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}><span className="flex-shrink-0 font-bold">{isH ? '✖' : '⚠️'}</span><span className="leading-relaxed">{f.detail || f.message || f.flagCode || 'Flag'}</span></div>); })}
                    {flags.length > 5 && <div className="text-xs text-slate-400">+{flags.length - 5} more — open Decision Record</div>}
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="text-xs font-bold text-emerald-700 mb-1">✓ No Risk Flags</div>
                  <div className="text-xs text-emerald-600">This deal is clean across all modules run so far.</div>
                </div>
              )}
              {nextModules.length > 0 && scenarioId && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Suggested Next</div>
                  <div className="space-y-1.5">
                    {nextModules.map(m => (
                      <button key={m.key} onClick={e => { e.stopPropagation(); navigate(`${m.route}?scenarioId=${scenarioId}`); }} className="w-full flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-amber-50 hover:text-amber-700 border border-slate-200 hover:border-amber-300 rounded-lg px-3 py-2 transition-all text-left">
                        <span>{m.icon}</span><span>{m.label}</span><span className="ml-auto text-slate-300 text-xs">{STAGE_LABELS[m.stage]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    )}
  </>);
}

export default function DecisionRecordDashboard() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('risk');
  const [showUnnamed, setShowUnnamed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, 'decisionRecords'));
        let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        const enriched = await Promise.all(data.map(async (record) => {
          const sid = record.header?.scenarioId || record.scenarioId || record['$scenarioId'] || null;
          if (!sid) return record;
          try {
            const sSnap = await getDoc(doc(db, 'scenarios', sid));
            if (!sSnap.exists()) return record;
            const s = { id: sSnap.id, ...sSnap.data() };
            const fn = s.firstName || s.borrower?.firstName || '', ln = s.lastName || s.borrower?.lastName || '';
            const bn = (fn || ln) ? `${fn} ${ln}`.trim() : (s.borrowerName || s.name || '');
            return { ...record, _scenario: s, header: { ...(record.header || {}), borrowerName: record.header?.borrowerName || bn || '', loanType: record.header?.loanType || s.loanType || s.program || '', loanPurpose: record.header?.loanPurpose || s.loanPurpose || s.purpose || '', propertyAddress: record.header?.propertyAddress || s.streetAddress || s.propertyAddress || '' } };
          } catch { return record; }
        }));
        setRecords(enriched);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  // Handle archive/restore without full reload
  const handleArchiveChange = (id, archived) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, archived } : r));
  };

  const active = records.filter(r => !r.archived);
  const archived = records.filter(r => r.archived);
  const named = active.filter(r => getBorrowerName(r));
  const unnamed = active.filter(r => !getBorrowerName(r));
  const highRisk = named.filter(r => getRiskLevel(getRiskFlags(r)) === 'high');
  const submitted = named.filter(r => getStatus(r) === 'submitted').length;
  const avgComplete = records.length ? Math.round(records.reduce((s, r) => s + (r.completeness_score || 0), 0) / records.length * (records[0]?.completeness_score <= 1 ? 100 : 1)) : 0;
  const riskOrder = { high: 0, medium: 1, clear: 2 };

  const isArchivedTab = filter === 'archived';

  let filtered = isArchivedTab
    ? archived
    : named.filter(r => {
        if (filter === 'attention' && getRiskLevel(getRiskFlags(r)) !== 'high') return false;
        if (filter === 'draft' && getStatus(r) !== 'draft') return false;
        if (filter === 'submitted' && getStatus(r) !== 'submitted') return false;
        if (search.trim()) { const q = search.toLowerCase(), name = (getBorrowerName(r) || '').toLowerCase(), addr = (getAddress(r) || '').toLowerCase(), loan = (getLoanType(r) || '').toLowerCase(); if (!name.includes(q) && !addr.includes(q) && !loan.includes(q)) return false; }
        return true;
      });

  if (!isArchivedTab) {
    if (sortBy === 'risk') { filtered = [...filtered].sort((a, b) => { const d = riskOrder[getRiskLevel(getRiskFlags(a))] - riskOrder[getRiskLevel(getRiskFlags(b))]; return d !== 0 ? d : (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0); }); }
    else if (sortBy === 'completeness') { filtered = [...filtered].sort((a, b) => (b.completeness_score || 0) - (a.completeness_score || 0)); }
    else if (sortBy === 'name') { filtered = [...filtered].sort((a, b) => (getBorrowerName(a) || '').localeCompare(getBorrowerName(b) || '')); }
    else { filtered = [...filtered].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)); }
  }

  const counts = { all: named.length, attention: highRisk.length, draft: named.filter(r => getStatus(r) === 'draft').length, submitted, archived: archived.length };

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="bg-slate-900 px-6 py-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg"><span className="text-slate-900 font-black text-sm">21</span></div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-white text-xl font-black tracking-tight">Decision Records</h1><span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded font-mono">Module 21</span></div>
              <p className="text-slate-500 text-xs mt-0.5">Click any deal to expand · launch modules · review flags · access scenario</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-right">
            {[{label:'Records',value:records.length,color:'text-white'},{label:'High Risk',value:highRisk.length,color:highRisk.length>0?'text-red-400':'text-slate-500'},{label:'Submitted',value:submitted,color:'text-emerald-400'},{label:'Avg Complete',value:avgComplete+'%',color:'text-amber-400'}].map((k, i, arr) => (
              <div key={k.label} className="flex items-center gap-6">
                <div><div className={`text-3xl font-black font-mono leading-none ${k.color}`}>{k.value}</div><div className="text-slate-500 text-xs mt-1 uppercase tracking-widest">{k.label}</div></div>
                {i < arr.length - 1 && <div className="w-px h-10 bg-slate-700"/>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {[
            {key:'all',label:'All Deals',count:counts.all},
            {key:'attention',label:'⚠ Needs Attention',count:counts.attention},
            {key:'draft',label:'In Progress',count:counts.draft},
            {key:'submitted',label:'Submitted',count:counts.submitted},
            {key:'archived',label:'🗄 Archived',count:counts.archived},
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${filter === f.key ? (f.key === 'attention' ? 'bg-red-500 border-red-500 text-white shadow-md' : f.key === 'archived' ? 'bg-slate-600 border-slate-600 text-white shadow-md' : 'bg-amber-500 border-amber-500 text-white shadow-md') : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700'}`}>
              {f.label}<span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filter === f.key ? 'bg-white/30 text-white' : 'bg-slate-100 text-slate-500'}`}>{f.count}</span>
            </button>
          ))}
          <div className="flex-1"/>
          {!isArchivedTab && <>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search borrower, address, loan type…" className="pl-8 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white w-64"/></div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="risk">Sort: Risk First</option><option value="updated">Sort: Most Recent</option><option value="completeness">Sort: Completeness</option><option value="name">Sort: Borrower Name</option>
            </select>
          </>}
        </div>

        {isArchivedTab && (
          <div className="bg-slate-100 border border-slate-200 rounded-xl px-5 py-3 mb-4 flex items-center gap-3">
            <span className="text-slate-500 text-sm">🗄</span>
            <p className="text-sm text-slate-600">Archived records are hidden from the main dashboard but fully preserved in Firestore. Hover any row and click <strong>Restore</strong> to bring it back.</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/><div className="text-slate-500 text-sm">Loading decision records…</div></div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">⚠️ {error}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">{isArchivedTab ? '🗄' : '📋'}</div>
            <div className="text-slate-700 font-semibold text-lg">{isArchivedTab ? 'No archived records' : 'No records match this filter'}</div>
            <div className="text-slate-400 text-sm mt-2">{isArchivedTab ? 'Records you archive will appear here.' : 'Records are auto-created when you save any module to the Decision Record.'}</div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead><tr className="border-b border-slate-200 bg-slate-50">
                <th className="pl-4 pr-2 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Risk</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Borrower / Address</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-44">Loan</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-28 text-center">Modules</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">Complete</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">Flags</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-24 text-right">Updated</th>
                <th className="pl-2 pr-4 py-3 w-16"/>
              </tr></thead>
              <tbody>
                {filtered.map(record => <RecordRow key={record.id} record={record} isArchived={!!record.archived} onArchiveChange={handleArchiveChange}/>)}
              </tbody>
            </table>
            {!isArchivedTab && unnamed.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <button onClick={() => setShowUnnamed(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 font-medium flex items-center gap-1.5 transition-colors">
                  <span className={`transition-transform ${showUnnamed ? 'rotate-90' : ''}`}>›</span>
                  {unnamed.length} record{unnamed.length !== 1 ? 's' : ''} with no borrower name yet <span className="text-slate-300">(no scenario linked)</span>
                </button>
                {showUnnamed && <table className="w-full mt-3"><tbody>{unnamed.map(record => <RecordRow key={record.id} record={record} isArchived={false} onArchiveChange={handleArchiveChange}/>)}</tbody></table>}
              </div>
            )}
          </div>
        )}

        {filtered.length > 0 && <p className="text-center text-xs text-slate-400 mt-4">{filtered.length} deal{filtered.length !== 1 ? 's' : ''} · {isArchivedTab ? 'Hover any row and click Restore to unarchive' : 'Click any row to expand and launch modules · hover a row and click 🗑 to archive'}{!isArchivedTab && unnamed.length > 0 ? ` · ${unnamed.length} unnamed below` : ''}</p>}
      </div>
    </div>
  );
}
