// src/pages/IncomeAnalyzer.jsx
// LoanBeacons™ — Module 3 | Stage 1: Pre-Structure
// Income Analyzer™ — Named per-borrower sections, unlimited co-borrowers from scenario
// Rebuild: Each borrower (primary + all co-borrowers) gets their own named, expandable income section

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ModuleNav from '../components/ModuleNav';

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
      const gross = parseFloat(f.gross_rents)||0;
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
  base_monthly:           'Base Monthly Salary ($)',
  overtime_monthly:       'Overtime Monthly (2yr avg, $)',
  bonus_monthly:          'Bonus Monthly (2yr avg, $)',
  commission_monthly:     'Commission Monthly (2yr avg, $)',
  yr1_net_income:         'Year 1 Net Income ($, annual)',
  yr2_net_income:         'Year 2 Net Income ($, annual)',
  addbacks_depreciation:  'Depreciation Addback ($, annual)',
  addbacks_depletion:     'Depletion Addback ($, annual)',
  business_use_of_home:   'Business Use of Home Addback ($, annual)',
  gross_rents:            'Gross Monthly Rents ($)',
  vacancy_factor_pct:     'Vacancy Factor (%, default 25)',
  mortgage_payment:       'Mortgage Payment ($, mo)',
  taxes_insurance:        'Taxes + Insurance ($, mo)',
  repairs_maintenance:    'Repairs / Mgmt ($, mo)',
  monthly_benefit:        'Monthly Benefit Amount ($)',
  gross_up_eligible:      'Non-taxable (gross-up eligible)?',
  monthly_amount:         'Monthly Amount ($)',
  is_taxable:             'Is this income taxable?',
  base_pay:               'Base Pay (monthly, $)',
  bah:                    'BAH (monthly, $)',
  bas:                    'BAS (monthly, $)',
  other_allotments:       'Other Allotments (monthly, $)',
  months_remaining:       'Months of Continuance Remaining',
};

const fmt$ = n => n ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';

// Role badge + color styles
const ROLE_STYLES = {
  primary:       { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500',  total: 'text-indigo-600', bar: 'bg-indigo-400' },
  'co-borrower': { badge: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500',  total: 'text-violet-600', bar: 'bg-violet-400' },
};

// ─── Source Card ──────────────────────────────────────────────────────────────
function SourceCard({ source, groupId, onUpdate, onRemove }) {
  const method = INCOME_METHODS[source.method];
  if (!method) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <ModuleNav moduleNumber={3} />
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
  const styles   = ROLE_STYLES[group.role] || ROLE_STYLES['co-borrower'];
  const groupTotal = group.sources.reduce((s, src) => s + (src.calculated||0), 0);
  const isAdding = addingForGroup === group.id;

  return (
    <div className="mb-8">
      {/* Section header with borrower name */}
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

      {/* Income source cards */}
      {group.sources.map(s => (
        <SourceCard key={s.id} source={s} groupId={group.id} onUpdate={onUpdate} onRemove={onRemove} />
      ))}

      {/* Income type picker */}
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function IncomeAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving]   = useState(false);

  const [scenario, setScenario]   = useState(null);
  const [loading, setLoading]     = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);
  const [notes, setNotes]         = useState('');
  const [addingForGroup, setAddingForGroup] = useState(null);
  const [borrowerGroups, setBorrowerGroups] = useState([]);

  // ─── Load Scenario ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => {
        setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }).catch(console.error);
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (!snap.exists()) return;
      const d = { id: snap.id, ...snap.data() };
      setScenario(d);

      const groups = [];

      // Primary borrower
      const primaryName = `${d.firstName||''} ${d.lastName||''}`.trim() || d.borrowerName || 'Primary Borrower';
      const primarySources = d.monthlyIncome && parseFloat(d.monthlyIncome) > 0
        ? [{ id: Date.now(), method: 'W2', fields: { base_monthly: String(d.monthlyIncome) }, calculated: parseFloat(d.monthlyIncome)||0 }]
        : [];
      groups.push({ id: 'primary', name: primaryName, role: 'primary', sources: primarySources });

      // Co-borrowers — support full array from scenario.coBorrowers
      const coBorrowers = d.coBorrowers || [];
      if (coBorrowers.length > 0) {
        coBorrowers.forEach((cb, i) => {
          const cbName   = `${cb.firstName||''} ${cb.lastName||''}`.trim() || `Co-Borrower ${i + 1}`;
          const cbIncome = parseFloat(cb.monthlyIncome) || 0;
          const cbSources = cbIncome > 0
            ? [{ id: Date.now() + i + 1, method: 'W2', fields: { base_monthly: String(cbIncome) }, calculated: cbIncome }]
            : [];
          groups.push({ id: `co-${i}`, name: cbName, role: 'co-borrower', sources: cbSources });
        });
      } else if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
        // Legacy single co-borrower income field fallback
        groups.push({
          id: 'co-0', name: 'Co-Borrower', role: 'co-borrower',
          sources: [{ id: Date.now() + 1, method: 'W2', fields: { base_monthly: String(d.coBorrowerIncome) }, calculated: parseFloat(d.coBorrowerIncome)||0 }],
        });
      } else {
        // Always show at least one empty co-borrower section
        groups.push({ id: 'co-0', name: 'Co-Borrower', role: 'co-borrower', sources: [] });
      }

      setBorrowerGroups(groups);
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ─── Group Operations ────────────────────────────────────────────────────
  const handleAddSource = (groupId, methodId) => {
    const newSource = { id: Date.now(), method: methodId, fields: {}, calculated: 0 };
    setBorrowerGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, sources: [...g.sources, newSource] } : g
    ));
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
    setBorrowerGroups(prev => [...prev, {
      id: `co-${Date.now()}`,
      name: `Co-Borrower ${nextIdx + 1}`,
      role: 'co-borrower',
      sources: [],
    }]);
  };

  // ─── Totals ──────────────────────────────────────────────────────────────
  const groupTotals    = borrowerGroups.map(g => ({ ...g, total: g.sources.reduce((s, src) => s + (src.calculated||0), 0) }));
  const totalQualifying = groupTotals.reduce((s, g) => s + g.total, 0);

  // ─── Decision Record ─────────────────────────────────────────────────────
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
        loNotes: notes,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
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

  // ─── No scenario — picker ─────────────────────────────────────────────────
  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <button onClick={() => navigate('/')} className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2 text-sm">← Back</button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">03</div>
          <div><h1 className="text-2xl font-bold text-gray-900">Income Analyzer™</h1><p className="text-sm text-gray-500">Stage 1 — Pre-Structure</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
            <div className="space-y-2">
              {scenarios.map(s => (
                <button key={s.id} onClick={() => navigate(`/income-analyzer?scenarioId=${s.id}`)}
                  className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <div className="font-semibold text-gray-800">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">${parseFloat(s.loanAmount||0).toLocaleString()} · {s.loanType||'--'}</div>
                </button>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );

  const allNames = borrowerGroups.map(g => g.name).filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-gray-50 py-6 pb-24">
      <div className="max-w-5xl mx-auto px-4">

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 3</span>
              </div>
              <h1 className="text-2xl font-bold">Income Analyzer™</h1>
              <p className="text-indigo-200 text-sm mt-0.5 truncate max-w-lg">{allNames || 'W-2 · Self-Employed · Rental · SS · Military · More'}</p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Qualifying</div>
              <div className="text-3xl font-black text-white">{fmt$(totalQualifying)}<span className="text-sm font-normal text-slate-400">/mo</span></div>
              <div className="text-xs text-slate-400">{fmt$(totalQualifying * 12)}/yr</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">

            {/* Per-borrower income groups */}
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

            {/* Add another co-borrower */}
            <button onClick={handleAddCoBorrower}
              className="w-full py-3 border-2 border-dashed border-violet-200 rounded-xl text-sm font-semibold text-violet-400 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-all mb-6">
              + Add Another Co-Borrower
            </button>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Income calculation rationale, unusual income types, addback justifications..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Income Analyzer™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Income Summary — named per borrower */}
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

            {/* Sources Breakdown — all borrowers with name labels */}
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

            {/* Key Rules */}
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
