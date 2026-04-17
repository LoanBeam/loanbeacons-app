// src/pages/IncomeAnalyzer.jsx
// LoanBeacons™ — Module 02 | Stage 1: Pre-Structure
// Income Analyzer™ — Named per-borrower sections, unlimited co-borrowers from scenario
// v2.0 — ModulePageShell layout standard applied (Apr 2026)

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import ModuleNav from '../components/ModuleNav';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';

// ─── Income Methods ───────────────────────────────────────────────────────────
const INCOME_METHODS = {
  W2: {
    id: 'W2', label: 'W-2 / Salaried', icon: '💼',
    fields: ['base_monthly', 'overtime_monthly', 'bonus_monthly', 'commission_monthly'],
    docs: ['2 years W-2s', '30-day paystub (YTD)', 'VOE if needed'],
    notes: 'Base salary is stable income. Overtime/bonus requires 2-year history. Commission requires 2-year avg.',
    calc: (f) => (parseFloat(f.base_monthly)||0) + (parseFloat(f.overtime_monthly)||0) + (parseFloat(f.bonus_monthly)||0) + (parseFloat(f.commission_monthly)||0),
  },
  SELF_EMPLOYED: {
    id: 'SELF_EMPLOYED', label: 'Self-Employed (1099/K-1)', icon: '🏢',
    fields: ['yr1_net_income', 'yr2_net_income', 'addbacks_depreciation', 'addbacks_depletion', 'business_use_of_home'],
    docs: ['2 years personal tax returns (1040)', '2 years business returns (if applicable)', 'YTD P&L (within 60 days)', 'CPA letter if needed'],
    notes: 'Qualifying income = 2-year average of (net income + allowable addbacks). Business losses reduce income.',
    calc: (f) => {
      const yr1 = parseFloat(f.yr1_net_income)||0;
      const yr2 = parseFloat(f.yr2_net_income)||0;
      const addbacks = (parseFloat(f.addbacks_depreciation)||0) + (parseFloat(f.addbacks_depletion)||0) + (parseFloat(f.business_use_of_home)||0);
      return ((yr1 + yr2) / 2 + addbacks) / 12;
    },
  },
  RENTAL: {
    id: 'RENTAL', label: 'Rental Income', icon: '🏠',
    fields: ['gross_rents', 'vacancy_factor_pct', 'mortgage_payment', 'taxes_insurance', 'repairs_maintenance'],
    docs: ['2 years Schedule E (tax returns)', 'Current signed leases', 'Property management agreement (if applicable)'],
    notes: 'Net rental income = gross rents × (1 - vacancy%) − PITIA. FHA/Fannie use 75% of gross rents.',
    calc: (f) => {
      const gross   = parseFloat(f.gross_rents)||0;
      const vacancy = parseFloat(f.vacancy_factor_pct)||25;
      return gross * (1 - vacancy/100);
    },
  },
  SOCIAL_SECURITY: {
    id: 'SOCIAL_SECURITY', label: 'Social Security / SSI / Disability', icon: '🏛️',
    fields: ['monthly_benefit', 'gross_up_eligible'],
    docs: ['Award letter (current year)', '2 months bank statements showing deposits', 'SSA-1099'],
    notes: 'Non-taxable SS/SSI can be grossed up 25% for qualifying. Verify continuance for 3+ years.',
    calc: (f) => {
      const base = parseFloat(f.monthly_benefit)||0;
      return f.gross_up_eligible === 'yes' ? base * 1.25 : base;
    },
  },
  PENSION: {
    id: 'PENSION', label: 'Pension / Retirement', icon: '💰',
    fields: ['monthly_amount', 'is_taxable'],
    docs: ['Award/benefit letter', '2 months bank statements', '1099-R if applicable'],
    notes: 'Non-taxable pension can be grossed up 25%. Must document continuance.',
    calc: (f) => parseFloat(f.monthly_amount)||0,
  },
  MILITARY: {
    id: 'MILITARY', label: 'Military / BAH / BAS', icon: '🎖️',
    fields: ['base_pay', 'bah', 'bas', 'other_allotments'],
    docs: ['Leave & Earnings Statement (LES)', 'Orders if PCS pending'],
    notes: 'BAH/BAS are non-taxable and can be grossed up 25%. All allotments count as qualifying income.',
    calc: (f) => {
      const base  = parseFloat(f.base_pay)||0;
      const bah   = (parseFloat(f.bah)||0) * 1.25;
      const bas   = (parseFloat(f.bas)||0) * 1.25;
      const other = parseFloat(f.other_allotments)||0;
      return base + bah + bas + other;
    },
  },
  CHILD_SUPPORT: {
    id: 'CHILD_SUPPORT', label: 'Child Support / Alimony', icon: '👨‍👧',
    fields: ['monthly_amount', 'months_remaining'],
    docs: ['Court order or divorce decree', '12 months proof of receipt (bank statements)', 'Payment history'],
    notes: 'Must have 3+ years continuance remaining. Verify consistent receipt via bank statements.',
    calc: (f) => {
      const months = parseFloat(f.months_remaining)||0;
      return months >= 36 ? (parseFloat(f.monthly_amount)||0) : 0;
    },
  },
};

const FIELD_LABELS = {
  base_monthly:          'Base Monthly Salary ($)',
  overtime_monthly:      'Overtime Monthly (2yr avg, $)',
  bonus_monthly:         'Bonus Monthly (2yr avg, $)',
  commission_monthly:    'Commission Monthly (2yr avg, $)',
  yr1_net_income:        'Year 1 Net Income ($, annual)',
  yr2_net_income:        'Year 2 Net Income ($, annual)',
  addbacks_depreciation: 'Depreciation Addback ($, annual)',
  addbacks_depletion:    'Depletion Addback ($, annual)',
  business_use_of_home:  'Business Use of Home Addback ($, annual)',
  gross_rents:           'Gross Monthly Rents ($)',
  vacancy_factor_pct:    'Vacancy Factor (%, default 25)',
  mortgage_payment:      'Mortgage Payment ($, mo)',
  taxes_insurance:       'Taxes + Insurance ($, mo)',
  repairs_maintenance:   'Repairs / Mgmt ($, mo)',
  monthly_benefit:       'Monthly Benefit Amount ($)',
  gross_up_eligible:     'Non-taxable (gross-up eligible)?',
  monthly_amount:        'Monthly Amount ($)',
  is_taxable:            'Is this income taxable?',
  base_pay:              'Base Pay (monthly, $)',
  bah:                   'BAH (monthly, $)',
  bas:                   'BAS (monthly, $)',
  other_allotments:      'Other Allotments (monthly, $)',
  months_remaining:      'Months of Continuance Remaining',
};

const fmt$ = n => n ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';

const ROLE_STYLES = {
  primary:       { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500',  total: 'text-indigo-600', bar: 'bg-indigo-400' },
  'co-borrower': { badge: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500',  total: 'text-violet-600', bar: 'bg-violet-400' },
};

// ─── Source Card — NO ModuleNav inside ───────────────────────────────────────
function SourceCard({ source, groupId, onUpdate, onRemove }) {
  const method = INCOME_METHODS[source.method];
  if (!method) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{method.icon}</span>
          <h3 className="font-bold text-slate-800">{method.label}</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Qualifying Monthly</div>
            <div className="text-lg font-black text-indigo-600">{fmt$(source.calculated)}</div>
          </div>
          <button onClick={() => onRemove(groupId, source.id)} className="text-slate-300 hover:text-red-400 text-xl">✕</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {method.fields.map(field => (
          <div key={field}>
            <label className="block text-xs font-semibold text-slate-400 mb-1">{FIELD_LABELS[field] || field}</label>
            {field === 'gross_up_eligible' || field === 'is_taxable' ? (
              <select value={source.fields[field]||'no'} onChange={e => onUpdate(groupId, source.id, field, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                <option value="yes">Yes</option><option value="no">No</option>
              </select>
            ) : (
              <input type="number" value={source.fields[field]||''} placeholder="0"
                onChange={e => onUpdate(groupId, source.id, field, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
            )}
          </div>
        ))}
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">
        <p className="text-xs text-amber-700"><strong>📐 Calculation:</strong> {method.notes}</p>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Required Documentation</p>
        <div className="flex flex-wrap gap-1.5">
          {method.docs.map((d, i) => (
            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">📎 {d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Borrower Group Section ───────────────────────────────────────────────────
function BorrowerGroup({ group, addingForGroup, onAddSource, onUpdate, onRemove, onStartAdd, onCancelAdd }) {
  const styles     = ROLE_STYLES[group.role] || ROLE_STYLES['co-borrower'];
  const groupTotal = group.sources.reduce((s, src) => s + (src.calculated||0), 0);
  const isAdding   = addingForGroup === group.id;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${styles.dot}`} />
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            {group.name || (group.role === 'primary' ? 'Borrower' : 'Co-Borrower')}
          </h2>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles.badge}`}>
            {group.role === 'primary' ? 'Primary' : 'Co-Borrower'}
          </span>
        </div>
        <div className={`text-sm font-black shrink-0 ${styles.total}`}>{fmt$(groupTotal)}/mo</div>
      </div>

      {group.sources.map(s => (
        <SourceCard key={s.id} source={s} groupId={group.id} onUpdate={onUpdate} onRemove={onRemove} />
      ))}

      {isAdding ? (
        <div className="bg-white rounded-xl border border-indigo-200 p-4">
          <p className="text-sm font-bold text-slate-700 mb-3">
            Select income type for {group.name || (group.role === 'primary' ? 'borrower' : 'co-borrower')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(INCOME_METHODS).map(m => (
              <button key={m.id} onClick={() => onAddSource(group.id, m.id)}
                className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-all">
                <span className="text-lg">{m.icon}</span>
                <span className="text-sm font-semibold text-slate-700">{m.label}</span>
              </button>
            ))}
          </div>
          <button onClick={onCancelAdd} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
      ) : (
        <button onClick={() => onStartAdd(group.id)}
          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
          + Add Income Source for {group.name || (group.role === 'primary' ? 'Borrower' : 'Co-Borrower')}
        </button>
      )}
    </div>
  );
}

// ─── Decision Record Banner (inline — green state + NSI pill) ─────────────────
function DRBanner({ savedRecordId, saving, onSave, nsiSuggestion, onNsiNavigate }) {
  const isSaved = Boolean(savedRecordId);
  return (
    <div style={{
      background:   isSaved ? '#f0fdf4' : '#ffffff',
      borderBottom: isSaved ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
      padding:      '10px 32px',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      flexWrap:     'wrap',
      transition:   'background 0.3s, border-color 0.3s',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: isSaved ? '#dcfce7' : '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.3s',
      }}>
        {isSaved
          ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="#475569" strokeWidth="1.4"/><path d="M5 8h6M5 5.5h6M5 10.5h3.5" stroke="#475569" strokeWidth="1.2" strokeLinecap="round"/></svg>
        }
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: isSaved ? '#14532d' : '#1e293b', margin: 0 }}>
          {isSaved ? 'Decision Record — Saved ✓' : 'Decision Record'}
        </p>
        <p style={{ fontSize: 11, color: isSaved ? '#16a34a' : '#94a3b8', margin: 0 }}>
          {isSaved ? 'INCOME ANALYZER findings logged to audit trail' : 'Save INCOME ANALYZER findings to your audit trail'}
        </p>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isSaved && nsiSuggestion?.path && (
          <button onClick={() => onNsiNavigate(nsiSuggestion.path)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11h10" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Next Suggested Action</p>
              <p style={{ fontSize: 11, color: '#1e40af', fontWeight: 500, margin: 0 }}>{nsiSuggestion.moduleLabel || nsiSuggestion.moduleName}</p>
            </div>
            <span style={{ fontSize: 12, color: '#3b82f6' }}>→</span>
          </button>
        )}
        <button
          onClick={!isSaved && !saving ? onSave : undefined}
          disabled={isSaved || saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isSaved ? '#16a34a' : '#0f172a',
            color: '#f8fafc', border: 'none', borderRadius: 6,
            padding: '7px 15px', fontSize: 11, fontWeight: 600,
            cursor: isSaved ? 'default' : 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            opacity: saving ? 0.7 : 1, transition: 'background 0.3s',
          }}
        >
          {isSaved
            ? <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> Saved</>
            : saving ? 'Saving…'
            : <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="#f8fafc" strokeWidth="1.3"/><path d="M4.5 7l2 2 3.5-3.5" stroke="#f8fafc" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> Save to Decision Record</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function IncomeAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate  = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings }                = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);
  const [findingsReported, setFindingsReported] = useState(false);

  const [scenario,       setScenario]       = useState(null);
  const [loading,        setLoading]        = useState(!!scenarioId);
  const [scenarios,      setScenarios]      = useState([]);
  const [search,         setSearch]         = useState('');
  const [showAll,        setShowAll]        = useState(false);
  const [notes,          setNotes]          = useState('');
  const [addingForGroup, setAddingForGroup] = useState(null);
  const [borrowerGroups, setBorrowerGroups] = useState([]);

  // ─── Load Scenario ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => {
        setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (!snap.exists()) return;
      const d = { id: snap.id, ...snap.data() };
      setScenario(d);
      const groups = [];

      const primaryName = `${d.firstName||''} ${d.lastName||''}`.trim() || d.borrowerName || 'Primary Borrower';
      const primarySources = d.monthlyIncome && parseFloat(d.monthlyIncome) > 0
        ? [{ id: Date.now(), method: 'W2', fields: { base_monthly: String(d.monthlyIncome) }, calculated: parseFloat(d.monthlyIncome)||0 }]
        : [];
      groups.push({ id: 'primary', name: primaryName, role: 'primary', sources: primarySources });

      const coBorrowers = d.coBorrowers || [];
      if (coBorrowers.length > 0) {
        coBorrowers.forEach((cb, i) => {
          const cbName    = `${cb.firstName||''} ${cb.lastName||''}`.trim() || `Co-Borrower ${i + 1}`;
          const cbIncome  = parseFloat(cb.monthlyIncome) || 0;
          const cbSources = cbIncome > 0
            ? [{ id: Date.now() + i + 1, method: 'W2', fields: { base_monthly: String(cbIncome) }, calculated: cbIncome }]
            : [];
          groups.push({ id: `co-${i}`, name: cbName, role: 'co-borrower', sources: cbSources });
        });
      } else if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
        groups.push({
          id: 'co-0', name: 'Co-Borrower', role: 'co-borrower',
          sources: [{ id: Date.now() + 1, method: 'W2', fields: { base_monthly: String(d.coBorrowerIncome) }, calculated: parseFloat(d.coBorrowerIncome)||0 }],
        });
      } else {
        groups.push({ id: 'co-0', name: 'Co-Borrower', role: 'co-borrower', sources: [] });
      }
      setBorrowerGroups(groups);
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ─── Group Operations ─────────────────────────────────────────────────────
  const handleAddSource = (groupId, methodId) => {
    const newSource = { id: Date.now(), method: methodId, fields: {}, calculated: 0 };
    setBorrowerGroups(prev => prev.map(g => g.id === groupId ? { ...g, sources: [...g.sources, newSource] } : g));
    setAddingForGroup(null);
  };

  const handleUpdateSource = (groupId, sourceId, field, val) => {
    setBorrowerGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g, sources: g.sources.map(s => {
          if (s.id !== sourceId) return s;
          const newFields = { ...s.fields, [field]: val };
          const method    = INCOME_METHODS[s.method];
          return { ...s, fields: newFields, calculated: method ? method.calc(newFields) : 0 };
        }),
      };
    }));
  };

  const handleRemoveSource = (groupId, sourceId) => {
    setBorrowerGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, sources: g.sources.filter(s => s.id !== sourceId) } : g
    ));
  };

  const handleAddCoBorrower = () => {
    const nextIdx = borrowerGroups.filter(g => g.role === 'co-borrower').length;
    setBorrowerGroups(prev => [...prev, { id: `co-${Date.now()}`, name: `Co-Borrower ${nextIdx + 1}`, role: 'co-borrower', sources: [] }]);
  };

  // ─── Totals ───────────────────────────────────────────────────────────────
  const groupTotals     = borrowerGroups.map(g => ({ ...g, total: g.sources.reduce((s, src) => s + (src.calculated||0), 0) }));
  const totalQualifying = groupTotals.reduce((s, g) => s + g.total, 0);

  // ─── NSI ─────────────────────────────────────────────────────────────────
  const rawPurpose  = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash') ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('refi') ? 'rate_term_refi'
    : 'purchase';

  const allSources  = (borrowerGroups || []).flatMap(g => g.sources || []);
  const nsiFindings = {
    incomeType:       allSources.some(s => s.method === 'SELF_EMPLOYED') ? 'self_employed'
                    : allSources.some(s => s.method === 'BANK_STATEMENT') ? 'bank_statement'
                    : 'w2',
    selfEmployed:     allSources.some(s => s.method === 'SELF_EMPLOYED'),
    incomeSufficient: totalQualifying > 0,
    assetsVerified:   false,
  };

  const { primarySuggestion, logFollow } = useNextStepIntelligence({
    currentModuleKey:        'INCOME_ANALYSIS',
    loanPurpose,
    decisionRecordFindings:  { INCOME_ANALYSIS: nsiFindings },
    scenarioData:            scenario || {},
    completedModules:        [],
    scenarioId,
    onWriteToDecisionRecord: null,
  });

  // ─── Save to Decision Record ──────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('INCOME_ANALYZER', {
        totalQualifyingMonthly: parseFloat(totalQualifying.toFixed(2)),
        annualQualifyingIncome: parseFloat((totalQualifying * 12).toFixed(2)),
        borrowerGroups: groupTotals.map(g => ({
          name: g.name, role: g.role, totalMonthly: parseFloat(g.total.toFixed(2)),
          sources: g.sources.map(s => ({ method: s.method, monthly: parseFloat(s.calculated.toFixed(2)) })),
        })),
        loNotes:   notes,
        timestamp: new Date().toISOString(),
      }, [], [], '1.0.0');
      if (writtenId) setSavedRecordId(writtenId);
      setFindingsReported(true);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );

  // ─── STATE A: No scenario — Landing / Selector ────────────────────────────
  if (!scenarioId) {
    const query     = search.toLowerCase().trim();
    const sorted    = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered  = query ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(query)) : sorted;
    const displayed = query ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore   = !query && !showAll && filtered.length > 5;

    return (
      <div className="min-h-screen bg-slate-50">

        {/* ── Hero (landing) ── */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '28px 32px 24px' }}>
          <button onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#818cf8', fontSize: 12, fontWeight: 600, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Back to Dashboard
          </button>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Stage 1 — Pre-Structure &amp; Initial Analysis
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: '#6366f1', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#fff' }}>
              M02
            </span>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#f8fafc', lineHeight: 1.15 }}>
              Income Analyzer™
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.65, maxWidth: 520, marginBottom: 14 }}>
            Multi-borrower income qualification across W-2, self-employed, rental, Social Security, military, and more — with per-borrower named sections and documentation checklists.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['W-2 / Salary', 'Self-Employed', 'Rental Income', 'Social Security', 'Military / BAH', 'Child Support'].map(tag => (
              <span key={tag} style={{ padding: '3px 11px', borderRadius: 20, border: '1px solid #334155', fontSize: 11, fontWeight: 500, color: '#cbd5e1' }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* ── Scenario Selector ── */}
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Select a Scenario</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Search by name or pick from your most recent files.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 14px', marginBottom: 14 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#94a3b8" strokeWidth="1.6"/><path d="M10.5 10.5L14 14" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round"/></svg>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              style={{ border: 'none', outline: 'none', fontSize: 13, color: '#475569', width: '100%', background: 'transparent', fontFamily: 'inherit' }} />
            {search && <button onClick={() => setSearch('')} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>}
          </div>

          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!query && !showAll && <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 7 }}>Recently Updated</p>}
              {displayed.map(s => {
                const name   = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate(`/income-analyzer?scenarioId=${s.id}`)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{name}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType    && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">
                  View all {filtered.length} scenarios
                </button>
              )}
              {showAll && filtered.length > 5 && (
                <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── STATE B: Scenario loaded — Active Module ─────────────────────────────
  const borrower        = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() || scenario.borrowerName : null;
  const coBorrowerNames = scenario?.coBorrowers?.filter(cb => cb.firstName || cb.lastName).map(cb => `${cb.firstName||''} ${cb.lastName||''}`.trim()) || [];
  const propertyAddress = scenario ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* ════════════════════════════════════════════════════════
          1. HERO
      ════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '26px 32px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        {/* Left content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            LoanBeacons™ — Module 02
          </p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#f8fafc', lineHeight: 1.15, marginBottom: 8 }}>
            Income Analyzer™
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 0 }}>
            W-2 · Self-Employed · Rental · Social Security · Military · Child Support
          </p>
        </div>

        {/* Right column — pills + scenario card */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(134,239,172,0.3)' }}>● LIVE</span>
          {totalQualifying > 0 && (
            <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(165,180,252,0.3)' }}>
              {fmt$(totalQualifying)}/mo
            </span>
          )}
          {scenario && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', minWidth: 176, backdropFilter: 'blur(4px)' }}>
              <p style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Active Scenario</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{borrower || 'Unknown Borrower'}</p>
              <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                {scenario.loanAmount ? `$${Number(scenario.loanAmount).toLocaleString()}` : ''}{scenario.loanType ? ` · ${scenario.loanType}` : ''}
              </p>
              <span onClick={() => navigate('/income-analyzer')} style={{ fontSize: 10, color: '#818cf8', marginTop: 6, cursor: 'pointer', display: 'inline-block' }}>Change scenario →</span>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          2. SCENARIO HEADER BAR
      ════════════════════════════════════════════════════════ */}
      {scenario && (
        <div style={{ background: '#1a2744', padding: '8px 32px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid #0f172a' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{borrower || 'Unknown Borrower'}</span>
          {coBorrowerNames.map((n, i) => <span key={i} style={{ fontSize: 11, color: '#64748b' }}>+ {n}</span>)}
          {propertyAddress && <><span style={{ color: '#334155', fontSize: 10 }}>|</span><span style={{ fontSize: 11, color: '#64748b' }}>{propertyAddress}</span></>}
          {scenario.loanAmount && <><span style={{ color: '#334155', fontSize: 10 }}>|</span><span style={{ fontSize: 11, color: '#64748b' }}>Loan <span style={{ color: '#cbd5e1', fontWeight: 500 }}>${Number(scenario.loanAmount).toLocaleString()}</span></span></>}
          {scenario.loanType   && <><span style={{ color: '#334155', fontSize: 10 }}>|</span><span style={{ fontSize: 11, color: '#64748b' }}>Type <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{scenario.loanType}</span></span></>}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          3. MODULE NAV BAR
      ════════════════════════════════════════════════════════ */}
      <ModuleNav moduleNumber={2} />

      {/* ════════════════════════════════════════════════════════
          4. DECISION RECORD BANNER — green on save + NSI pill
      ════════════════════════════════════════════════════════ */}
      <DRBanner
        savedRecordId={savedRecordId}
        saving={recordSaving}
        onSave={handleSaveToRecord}
        nsiSuggestion={findingsReported ? primarySuggestion : null}
        onNsiNavigate={(path) => { logFollow(); navigate(`${path}?scenarioId=${scenarioId}`); }}
      />

      {/* ════════════════════════════════════════════════════════
          5. CONTENT
      ════════════════════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">

            {borrowerGroups.map(group => (
              <BorrowerGroup
                key={group.id}
                group={group}
                addingForGroup={addingForGroup}
                onAddSource={handleAddSource}
                onUpdate={handleUpdateSource}
                onRemove={handleRemoveSource}
                onStartAdd={(id) => setAddingForGroup(id)}
                onCancelAdd={() => setAddingForGroup(null)}
              />
            ))}

            <button onClick={handleAddCoBorrower}
              className="w-full py-3 border-2 border-dashed border-violet-200 rounded-xl text-sm font-semibold text-violet-400 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-all mb-6">
              + Add Another Co-Borrower
            </button>

            {/* LO Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Income calculation rationale, unusual income types, addback justifications..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

          </div>

          {/* ── Right Panel ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Income Summary</h3>
              <div className="space-y-3">
                {groupTotals.map(g => {
                  const styles = ROLE_STYLES[g.role] || ROLE_STYLES['co-borrower'];
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-semibold truncate max-w-[130px]">{g.name}</span>
                        <span className={`font-bold shrink-0 ml-1 ${styles.total}`}>{fmt$(g.total)}/mo</span>
                      </div>
                      {totalQualifying > 0 && (
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${styles.bar} rounded-full transition-all`}
                            style={{ width: `${(g.total / totalQualifying) * 100}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="border-t border-slate-100 pt-3 flex justify-between">
                  <span className="text-sm font-bold text-slate-600">Total Qualifying</span>
                  <span className="text-sm font-black text-indigo-600">{fmt$(totalQualifying)}/mo</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Annual</span><span className="font-semibold">{fmt$(totalQualifying * 12)}</span>
                </div>
              </div>
            </div>

            {borrowerGroups.some(g => g.sources.length > 0) && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Sources Breakdown</h3>
                <div className="space-y-2">
                  {borrowerGroups.map(g =>
                    g.sources.map(s => {
                      const m      = INCOME_METHODS[s.method];
                      const styles = ROLE_STYLES[g.role] || ROLE_STYLES['co-borrower'];
                      return (
                        <div key={s.id} className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
                            <span className="text-slate-500 truncate max-w-[80px]">{g.name}</span>
                            <span className="text-slate-300 shrink-0">·</span>
                            <span className="text-slate-600 truncate">{m?.icon} {m?.label}</span>
                          </div>
                          <span className="font-bold text-slate-800 shrink-0">{fmt$(s.calculated)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• Self-employed: 2-year tax return average</p>
                <p>• Overtime/bonus: 2-year history required</p>
                <p>• Child support: 3+ years continuance</p>
                <p>• Non-taxable income: gross up 25%</p>
                <p>• Rental: 75% of gross rents (FHA/Fannie)</p>
                <p>• Commission: 2-year average, declining trends reviewed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
