// src/pages/TitleIntel.jsx
// LoanBeacons™ — Module 10 | Stage 2: Lender Fit
// Title Intelligence™ — Vesting, liens, title issues, chain of title

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

const VESTING_OPTIONS = [
  { id: 'sole', label: 'Sole and Separate Property', note: 'One person takes title alone. Spouse not on title (may need quitclaim in community property states).' },
  { id: 'joint_tenants', label: 'Joint Tenants with Right of Survivorship', note: 'Equal undivided interests. Upon death, surviving owner takes full title automatically. No probate.' },
  { id: 'tenants_common', label: 'Tenants in Common', note: 'Unequal interests allowed. Each owner can will their share. No survivorship right.' },
  { id: 'community', label: 'Community Property', note: 'Available in AZ, CA, ID, LA, NV, NM, TX, WA, WI. Equal ownership between spouses.' },
  { id: 'community_ros', label: 'Community Property w/ Right of Survivorship', note: 'CA, AZ, NV. Combines community property with survivorship benefit.' },
  { id: 'trust', label: 'Living Trust / Revocable Trust', note: 'Title held in trust. Lender must review trust documents. Not all lenders accept.' },
  { id: 'llc', label: 'LLC / Corporation', note: 'Investment properties only. No FHA/VA/USDA. Non-QM DSCR preferred vehicle.' },
];

const TITLE_ISSUES = [
  { id: 'existing_liens', label: 'Existing Mortgages / Liens to Payoff', severity: 'info', note: 'Must be paid off at closing. Confirm payoff amounts from all servicers.' },
  { id: 'tax_liens', label: 'IRS or State Tax Liens', severity: 'critical', note: 'Must be paid or released before/at closing. IRS lien affects title insurance.' },
  { id: 'mechanics_lien', label: "Mechanic's Liens / Contractor Claims", severity: 'high', note: 'Must be released before closing. Get lien releases from all contractors.' },
  { id: 'judgment_lien', label: 'Judgment Liens Against Borrower', severity: 'high', note: 'Attach to real property in many states. Must be paid at closing.' },
  { id: 'hoa_lien', label: 'HOA Delinquency / Lien', severity: 'high', note: 'HOA must be current. Delinquent HOA fees must be paid before closing.' },
  { id: 'easements', label: 'Easements / Encroachments', severity: 'medium', note: 'Review survey. Utility easements are typical. Encroachments need resolution.' },
  { id: 'gap_title', label: 'Gap in Chain of Title', severity: 'high', note: 'Title company must research and bridge gap. May require quiet title action.' },
  { id: 'forged_docs', label: 'Suspected Forged or Fraudulent Documents', severity: 'critical', note: 'Stop transaction. Notify lender compliance immediately.' },
  { id: 'probate', label: 'Estate / Probate Sale', severity: 'medium', note: 'Personal representative must have authority to sell. Court approval may be required.' },
  { id: 'divorce', label: 'Divorce / Marital Interest', severity: 'medium', note: 'Divorce decree must address property. Quitclaim may be required from ex-spouse.' },
  { id: 'boundary', label: 'Boundary / Survey Dispute', severity: 'medium', note: 'Survey required. Dispute must be resolved or excluded from title policy.' },
  { id: 'deed_restriction', label: 'Deed Restrictions / CC&Rs Violation', severity: 'medium', note: 'Review restrictions. Violations can affect insurability and marketability.' },
];

const TITLE_COMPANIES = ['In-House Title', 'Old Republic Title', 'First American Title', 'Fidelity National Title', 'Stewart Title', 'Other'];

const fmt$ = n => '$' + Number(n||0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function TitleIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [vesting, setVesting] = useState('');
  const [titleCompany, setTitleCompany] = useState('');
  const [titleOrdered, setTitleOrdered] = useState(false);
  const [titleReceived, setTitleReceived] = useState(false);
  const [issues, setIssues] = useState({});
  const [liens, setLiens] = useState([]);
  const [titleInsurance, setTitleInsurance] = useState({ lender: '', owner: '' });
  const [closingDate, setClosingDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) setScenario({ id: snap.id, ...snap.data() });
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  const addLien = () => setLiens(p => [...p, { id: Date.now(), type: '', creditor: '', amount: '', payoffConfirmed: false }]);
  const updateLien = (id, field, val) => setLiens(p => p.map(l => l.id === id ? { ...l, [field]: val } : l));
  const removeLien = (id) => setLiens(p => p.filter(l => l.id !== id));

  const flaggedIssues = TITLE_ISSUES.filter(i => issues[i.id]);
  const criticalIssues = flaggedIssues.filter(i => i.severity === 'critical');
  const totalLienAmount = liens.reduce((s, l) => s + (parseFloat(l.amount)||0), 0);
  const unconfirmedPayoffs = liens.filter(l => !l.payoffConfirmed).length;

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('TITLE_INTEL', {
        vesting, titleCompany, titleOrdered, titleReceived,
        flaggedIssues: flaggedIssues.map(i => i.id),
        criticalIssueCount: criticalIssues.length,
        lienCount: liens.length,
        totalLienAmount: Math.round(totalLienAmount),
        unconfirmedPayoffs,
        lenderTitleInsurance: parseFloat(titleInsurance.lender)||null,
        ownerTitleInsurance: parseFloat(titleInsurance.owner)||null,
        closingDate: closingDate || null,
        loNotes: notes,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" /></div>;

  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8"><div className="max-w-2xl mx-auto px-4">
      <button onClick={() => navigate('/')} className="text-blue-600 mb-4 text-sm">← Back</button>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">10</div>
        <div><h1 className="text-2xl font-bold">Title Intelligence™</h1><p className="text-sm text-gray-500">Stage 2 — Lender Fit</p></div>
      </div>
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-bold mb-4">Select a Scenario</h2>
        {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
          <div className="space-y-2">{scenarios.map(s => (
            <button key={s.id} onClick={() => navigate(`/title-intel?scenarioId=${s.id}`)}
              className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
              <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
              <div className="text-xs text-gray-500">{s.streetAddress||'--'}</div>
            </button>
          ))}</div>}
      </div>
    </div></div>
  );

  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : null;

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 2 — Lender Fit</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 10</span>
              </div>
              <h1 className="text-2xl font-bold">Title Intelligence™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}Vesting · Liens · Chain of Title · Insurance</p>
            </div>
            <div className="text-right">
              {criticalIssues.length > 0
                ? <div className="bg-red-500/20 text-red-300 border border-red-400/30 rounded-xl px-4 py-2"><div className="text-2xl font-black">{criticalIssues.length}</div><div className="text-xs">Critical Issue{criticalIssues.length !== 1 ? 's' : ''}</div></div>
                : <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-xl px-4 py-2"><div className="text-2xl font-black">{flaggedIssues.length > 0 ? flaggedIssues.length : '✓'}</div><div className="text-xs">{flaggedIssues.length > 0 ? 'Issues Flagged' : 'Clear'}</div></div>
              }
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Vesting */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">📜 How Will Title Be Held (Vesting)?</h2>
              <p className="text-xs text-slate-400 mb-4">Vesting determines ownership rights, survivorship, and estate planning implications. Confirm with borrower and attorney.</p>
              <div className="space-y-2">
                {VESTING_OPTIONS.map(v => (
                  <label key={v.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                    ${vesting === v.id ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="vesting" value={v.id} checked={vesting === v.id} onChange={() => setVesting(v.id)}
                      className="w-4 h-4 mt-0.5 accent-indigo-600 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{v.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{v.note}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Title Company & Status */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🏢 Title Company & Status</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Title Company</label>
                  <select value={titleCompany} onChange={e => setTitleCompany(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                    <option value="">Select…</option>
                    {TITLE_COMPANIES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Target Closing Date</label>
                  <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
              <div className="flex gap-4">
                {[['titleOrdered', 'Title Search Ordered', titleOrdered, setTitleOrdered], ['titleReceived', 'Preliminary Report Received', titleReceived, setTitleReceived]].map(([id, label, val, setter]) => (
                  <label key={id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all
                    ${val ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                    <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} className="accent-emerald-600" />
                    <span className={`text-sm font-semibold ${val ? 'text-emerald-700' : 'text-slate-600'}`}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Liens to Payoff */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">💳 Liens to Pay Off at Closing</h2>
                <button onClick={addLien} className="text-xs text-indigo-600 font-semibold">+ Add Lien</button>
              </div>
              <p className="text-xs text-slate-400 mb-4">All liens must be paid off at or before closing. Confirm payoff amounts with each servicer.</p>
              {liens.length === 0 ? <p className="text-sm text-slate-300 italic">No liens entered.</p> :
                <div className="space-y-2">
                  {liens.map(l => (
                    <div key={l.id} className={`flex items-center gap-2 p-3 rounded-xl border ${l.payoffConfirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <select value={l.type} onChange={e => updateLien(l.id, 'type', e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                        <option value="">Type…</option>
                        {['1st Mortgage','2nd Mortgage','HELOC','Tax Lien','Judgment','HOA','Other'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="text" value={l.creditor} placeholder="Creditor / Servicer"
                        onChange={e => updateLien(l.id, 'creditor', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <input type="number" value={l.amount} placeholder="Payoff $"
                        onChange={e => updateLien(l.id, 'amount', e.target.value)}
                        className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={l.payoffConfirmed} onChange={e => updateLien(l.id, 'payoffConfirmed', e.target.checked)} className="accent-emerald-600" />
                        <span className={l.payoffConfirmed ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>Confirmed</span>
                      </label>
                      <button onClick={() => removeLien(l.id)} className="text-slate-300 hover:text-red-400">✕</button>
                    </div>
                  ))}
                  {liens.length > 0 && (
                    <div className="flex justify-between px-3 py-2 bg-slate-50 rounded-xl text-sm font-bold">
                      <span className="text-slate-500">Total Payoffs</span>
                      <span className="text-slate-800">{fmt$(totalLienAmount)}</span>
                    </div>
                  )}
                </div>
              }
            </div>

            {/* Title Issues */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">🚩 Title Issues Checklist</h2>
              <p className="text-xs text-slate-400 mb-4">Check all items found in the preliminary title report or known to the LO.</p>
              <div className="space-y-2">
                {TITLE_ISSUES.map(issue => (
                  <label key={issue.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                    ${issues[issue.id]
                      ? issue.severity === 'critical' ? 'bg-red-50 border-red-300' : issue.severity === 'high' ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!issues[issue.id]} onChange={e => setIssues(p => ({ ...p, [issue.id]: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 shrink-0 accent-red-600" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{issue.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                          ${issue.severity === 'critical' ? 'bg-red-100 text-red-700' : issue.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                          {issue.severity.toUpperCase()}
                        </span>
                      </div>
                      {issues[issue.id] && <p className="text-xs text-slate-500 mt-1">{issue.note}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Title Insurance */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🛡️ Title Insurance Premiums</h2>
              <div className="grid grid-cols-2 gap-4">
                {[['Lender\'s Title Insurance ($)', titleInsurance.lender, v => setTitleInsurance(p => ({...p, lender: v}))],
                  ['Owner\'s Title Insurance ($)', titleInsurance.owner, v => setTitleInsurance(p => ({...p, owner: v}))]].map(([l, v, s]) => (
                  <div key={l}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{l}</label>
                    <input type="number" value={v} placeholder="0" onChange={e => s(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <p>• Lender's title insurance is mandatory on all agency loans</p>
                <p>• Owner's title insurance is optional but strongly recommended</p>
                <p>• Simultaneous issue discount typically available when purchasing both</p>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Title search findings, lien resolution status, vesting notes, attorney recommendations..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && <DecisionRecordBanner recordId={savedRecordId} moduleName="Title Intelligence™" onSave={handleSaveToRecord} saving={recordSaving} />}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Title Status</h3>
              <div className="space-y-2 text-xs">
                {[['Vesting', vesting ? VESTING_OPTIONS.find(v => v.id === vesting)?.label : '—'],
                  ['Title Company', titleCompany || '—'],
                  ['Closing Date', closingDate || '—'],
                  ['Title Ordered', titleOrdered ? '✅ Yes' : '⏳ Pending'],
                  ['Report Received', titleReceived ? '✅ Yes' : '⏳ Pending'],
                  ['Liens to Pay', liens.length > 0 ? `${liens.length} (${fmt$(totalLienAmount)})` : 'None'],
                  ['Unconfirmed Payoffs', unconfirmedPayoffs > 0 ? `⚠️ ${unconfirmedPayoffs}` : '✓ All Confirmed'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className="font-semibold text-slate-700 text-right max-w-[55%] truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {flaggedIssues.length > 0 && (
              <div className={`rounded-xl border p-4 ${criticalIssues.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <h3 className={`text-xs font-bold uppercase tracking-wide mb-2 ${criticalIssues.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>Issues to Resolve</h3>
                {flaggedIssues.map(i => (
                  <div key={i.id} className="text-xs mb-1">
                    <span className={i.severity === 'critical' ? 'text-red-600 font-semibold' : 'text-amber-700'}>• {i.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• All liens must be paid at/before closing</p>
                <p>• Tax liens: must be released or escrowed</p>
                <p>• Judgments: attach to property in most states</p>
                <p>• Trust vesting: lender must approve trust</p>
                <p>• Community property states: non-borrowing spouse may need to sign</p>
                <p>• Lender's title insurance: mandatory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
