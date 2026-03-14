// src/pages/PropertyIntel.jsx
// LoanBeacons™ — Module 9 | Stage 2: Lender Fit
// Property Intelligence™ — Property type, condition, eligibility, appraisal flags

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

const PROPERTY_TYPES = [
  { id: 'sfr', label: 'Single Family Residence', icon: '🏠', eligible: ['FHA','VA','USDA','Conventional','Jumbo'], notes: 'All programs. Standard guidelines apply.' },
  { id: 'condo', label: 'Condominium', icon: '🏢', eligible: ['FHA','VA','Conventional'], notes: 'FHA/VA require project approval. USDA rarely approves condos.' },
  { id: 'townhouse', label: 'Townhouse / PUD', icon: '🏘️', eligible: ['FHA','VA','USDA','Conventional'], notes: 'Standard guidelines. HOA docs required.' },
  { id: '2unit', label: '2-Unit (Duplex)', icon: '🏗️', eligible: ['FHA','VA','Conventional'], notes: 'Owner-occupied required for FHA/VA. 25% down for conventional investment.' },
  { id: '3_4unit', label: '3-4 Unit', icon: '🏦', eligible: ['FHA','VA','Conventional'], notes: 'Owner-occupied only for FHA/VA. Higher reserves required.' },
  { id: 'manufactured', label: 'Manufactured / Mobile Home', icon: '🚐', eligible: ['FHA','VA','Conventional'], notes: 'Must be permanently affixed, titled as real property, HUD standards.' },
  { id: 'mixed_use', label: 'Mixed-Use Property', icon: '🏪', eligible: ['FHA','Conventional'], notes: 'Residential use must be primary. Commercial portion ≤ 49%.' },
  { id: 'farm', label: 'Farm / Agricultural', icon: '🌾', eligible: [], notes: 'Typically ineligible for agency programs. Non-QM or portfolio only.' },
  { id: 'coop', label: 'Cooperative (Co-op)', icon: '🏛️', eligible: ['Conventional'], notes: 'Limited to specific markets (NYC primarily). Fannie Mae approved co-ops only.' },
];

const OCCUPANCY_TYPES = [
  { id: 'primary', label: 'Primary Residence', icon: '🏠', note: 'Best rates. All programs available.' },
  { id: 'second', label: 'Second Home', icon: '🏖️', note: '10% min down. Higher rate. Must be reasonable distance from primary.' },
  { id: 'investment', label: 'Investment Property', icon: '📈', note: '15-25% down. Higher rate. No FHA/VA/USDA.' },
];

const PROPERTY_FLAGS = [
  { id: 'deferred_maint', label: 'Deferred Maintenance / Poor Condition', severity: 'high', programs: 'All', note: 'Property must meet minimum property standards (MPS) for all agency programs. FHA is strictest.' },
  { id: 'roof_issues', label: 'Roof Issues / Remaining Life < 2 Years', severity: 'high', programs: 'FHA/VA/USDA', note: 'Appraiser will flag. Repair or escrow typically required.' },
  { id: 'foundation', label: 'Foundation / Structural Issues', severity: 'critical', programs: 'All', note: 'Major structural issues can kill any agency loan. Engineer report required.' },
  { id: 'mold_water', label: 'Mold / Water Damage / Flooding', severity: 'critical', programs: 'All', note: 'Must be remediated before closing. Flood zone disclosure required.' },
  { id: 'mechanical', label: 'Mechanical Systems Non-Functional', severity: 'high', programs: 'FHA/VA', note: 'HVAC, electrical, plumbing must be functional at time of appraisal.' },
  { id: 'unpermitted', label: 'Unpermitted Additions / Structures', severity: 'medium', programs: 'All', note: 'Appraiser may flag. May need permit or removal. Can affect value.' },
  { id: 'environmental', label: 'Environmental Hazards (Lead, Asbestos)', severity: 'critical', programs: 'All', note: 'Pre-1978 homes need lead disclosure. Testing/remediation may be required.' },
  { id: 'private_road', label: 'Private Road / No Public Access', severity: 'medium', programs: 'USDA/FHA', note: 'Recorded road maintenance agreement required. All parties must sign.' },
  { id: 'well_septic', label: 'Well / Septic System', severity: 'medium', programs: 'FHA/VA/USDA', note: 'Water potability test and septic inspection required.' },
  { id: 'flood_zone', label: 'Located in FEMA Flood Zone', severity: 'medium', programs: 'All', note: 'Flood insurance required. May affect insurance costs significantly.' },
  { id: 'hoa_issues', label: 'HOA Litigation / Budget Issues', severity: 'high', programs: 'FHA/VA/Conventional', note: 'HOA must not be in active litigation. Reserves must meet minimum requirements.' },
  { id: 'listed_sale', label: 'Property Currently Listed for Sale', severity: 'high', programs: 'VA IRRRL', note: 'Must be removed from MLS before application for VA IRRRL.' },
];

const fmt$ = n => '$' + Number(n||0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function PropertyIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [propertyType, setPropertyType] = useState('sfr');
  const [occupancy, setOccupancy] = useState('primary');
  const [yearBuilt, setYearBuilt] = useState('');
  const [sqft, setSqft] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [flags, setFlags] = useState({});
  const [condoProjectApproved, setCondoProjectApproved] = useState('unknown');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.propertyType) {
          const map = { 'Single Family': 'sfr', 'Condo': 'condo', 'Townhouse': 'townhouse', 'Multi-Family (2-4 units)': '2unit' };
          setPropertyType(map[d.propertyType] || 'sfr');
        }
        if (d.occupancy) {
          const map = { 'Primary Residence': 'primary', 'Second Home': 'second', 'Investment Property': 'investment' };
          setOccupancy(map[d.occupancy] || 'primary');
        }
        if (d.propertyValue) { setPurchasePrice(String(d.propertyValue)); setEstimatedValue(String(d.propertyValue)); }
        if (d.loanAmount) setLoanAmount(String(d.loanAmount));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  const propType = PROPERTY_TYPES.find(p => p.id === propertyType);
  const ltv = estimatedValue && loanAmount ? ((parseFloat(loanAmount) / parseFloat(estimatedValue)) * 100).toFixed(1) : null;
  const flaggedItems = PROPERTY_FLAGS.filter(f => flags[f.id]);
  const criticalFlags = flaggedItems.filter(f => f.severity === 'critical');
  const highFlags = flaggedItems.filter(f => f.severity === 'high');
  const isCondo = propertyType === 'condo';
  const preIs78 = yearBuilt && parseInt(yearBuilt) < 1978;
  const eligible = propType?.eligible || [];

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('PROPERTY_INTEL', {
        propertyType, occupancy, yearBuilt: parseInt(yearBuilt)||null,
        sqft: parseInt(sqft)||null, purchasePrice: parseFloat(purchasePrice)||null,
        estimatedValue: parseFloat(estimatedValue)||null, loanAmount: parseFloat(loanAmount)||null,
        ltv: ltv ? parseFloat(ltv) : null,
        eligiblePrograms: eligible,
        flaggedItems: flaggedItems.map(f => f.id),
        criticalFlagCount: criticalFlags.length,
        condoProjectApproved: isCondo ? condoProjectApproved : null,
        preIs78, loNotes: notes, timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" /></div>;

  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8"><div className="max-w-2xl mx-auto px-4">
      <button onClick={() => navigate('/')} className="text-blue-600 mb-4 flex items-center gap-2 text-sm">← Back</button>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">09</div>
        <div><h1 className="text-2xl font-bold">Property Intelligence™</h1><p className="text-sm text-gray-500">Stage 2 — Lender Fit</p></div>
      </div>
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-bold mb-4">Select a Scenario</h2>
        {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
          <div className="space-y-2">{scenarios.map(s => (
            <button key={s.id} onClick={() => navigate(`/property-intel?scenarioId=${s.id}`)}
              className="w-full text-left p-4 border rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
              <div className="font-semibold">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
              <div className="text-xs text-gray-500">{s.propertyType||'--'} · {s.streetAddress||'--'}</div>
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
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 9</span>
              </div>
              <h1 className="text-2xl font-bold">Property Intelligence™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}Type · Condition · Eligibility · Appraisal Flags</p>
            </div>
            <div className="text-right">
              {criticalFlags.length > 0
                ? <div className="bg-red-500/20 text-red-300 border border-red-400/30 rounded-xl px-4 py-2"><div className="text-2xl font-black">{criticalFlags.length}</div><div className="text-xs">Critical Flag{criticalFlags.length !== 1 ? 's' : ''}</div></div>
                : flaggedItems.length > 0
                ? <div className="bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-xl px-4 py-2"><div className="text-2xl font-black">{flaggedItems.length}</div><div className="text-xs">Flag{flaggedItems.length !== 1 ? 's' : ''}</div></div>
                : <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-xl px-4 py-2"><div className="text-2xl font-black">✓</div><div className="text-xs">No Flags</div></div>
              }
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* Property Type */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🏠 Property Type</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                {PROPERTY_TYPES.map(pt => (
                  <button key={pt.id} onClick={() => setPropertyType(pt.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all
                      ${propertyType === pt.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className="text-xl">{pt.icon}</span>
                    <span className={`text-xs font-semibold ${propertyType === pt.id ? 'text-indigo-700' : 'text-slate-600'}`}>{pt.label}</span>
                  </button>
                ))}
              </div>
              {propType && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {propType.eligible.length > 0
                      ? propType.eligible.map(p => <span key={p} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✓ {p}</span>)
                      : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">✗ No agency programs</span>
                    }
                  </div>
                  <p className="text-xs text-slate-500">{propType.notes}</p>
                </div>
              )}
            </div>

            {/* Occupancy */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">👤 Occupancy</h2>
              <div className="grid grid-cols-3 gap-3">
                {OCCUPANCY_TYPES.map(ot => (
                  <button key={ot.id} onClick={() => setOccupancy(ot.id)}
                    className={`p-4 rounded-xl border-2 text-center transition-all
                      ${occupancy === ot.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-2xl mb-1">{ot.icon}</div>
                    <div className={`text-sm font-bold ${occupancy === ot.id ? 'text-indigo-700' : 'text-slate-700'}`}>{ot.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{ot.note}</div>
                  </button>
                ))}
              </div>
              {occupancy === 'investment' && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700 font-semibold">⚠️ Investment property: FHA, VA, and USDA not available. Conventional requires 15-25% down. Non-QM DSCR may be best option.</p>
                </div>
              )}
            </div>

            {/* Property Details */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">📋 Property Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Year Built', val: yearBuilt, set: setYearBuilt, ph: '1998' },
                  { label: 'Square Footage', val: sqft, set: setSqft, ph: '1850' },
                  { label: 'Purchase Price ($)', val: purchasePrice, set: setPurchasePrice, ph: '345000' },
                  { label: 'Estimated Value ($)', val: estimatedValue, set: setEstimatedValue, ph: '355000' },
                  { label: 'Loan Amount ($)', val: loanAmount, set: setLoanAmount, ph: '310500' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
              {ltv && (
                <div className={`mt-4 px-4 py-3 rounded-xl border flex items-center justify-between
                  ${parseFloat(ltv) > 97 ? 'bg-red-50 border-red-200' : parseFloat(ltv) > 80 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <span className="text-sm font-bold text-slate-700">Loan-to-Value (LTV)</span>
                  <span className={`text-2xl font-black ${parseFloat(ltv) > 97 ? 'text-red-600' : parseFloat(ltv) > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{ltv}%</span>
                </div>
              )}
              {preIs78 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700 font-semibold">⚠️ Pre-1978 construction — Lead-based paint disclosure required. FHA may require lead inspection.</p>
                </div>
              )}
            </div>

            {/* Condo */}
            {isCondo && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🏢 Condo Project Review</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[['approved','✅ FHA/VA Approved','bg-emerald-50 border-emerald-300 text-emerald-700'],['not_approved','❌ Not Approved','bg-red-50 border-red-300 text-red-700'],['unknown','🔍 Not Verified','bg-slate-50 border-slate-300 text-slate-600']].map(([v, l, cls]) => (
                    <button key={v} onClick={() => setCondoProjectApproved(v)}
                      className={`p-3 rounded-xl border-2 text-center text-sm font-semibold transition-all ${condoProjectApproved === v ? cls : 'border-slate-200 text-slate-400'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                  <p>• FHA: Check HUD condo approval list at hud.gov/program_offices/housing/ramh/rams/hicl</p>
                  <p>• VA: Check VA approved condo list at benefits.va.gov/homeloans/purchaseco_condos.asp</p>
                  <p>• Conventional: Fannie/Freddie have their own approval processes (PERS)</p>
                </div>
              </div>
            )}

            {/* Property Flags */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">🚩 Property Condition Flags</h2>
              <p className="text-xs text-slate-400 mb-4">Check all items that apply. Flagged items appear in the Decision Record and trigger appraisal review.</p>
              <div className="space-y-2">
                {PROPERTY_FLAGS.map(flag => (
                  <label key={flag.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                    ${flags[flag.id]
                      ? flag.severity === 'critical' ? 'bg-red-50 border-red-300' : flag.severity === 'high' ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-200'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!flags[flag.id]} onChange={e => setFlags(p => ({ ...p, [flag.id]: e.target.checked }))}
                      className={`w-4 h-4 mt-0.5 shrink-0 ${flag.severity === 'critical' ? 'accent-red-600' : 'accent-orange-500'}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{flag.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                          ${flag.severity === 'critical' ? 'bg-red-100 text-red-700' : flag.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                          {flag.severity.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-400">({flag.programs})</span>
                      </div>
                      {flags[flag.id] && <p className="text-xs text-slate-500 mt-1">{flag.note}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Property condition notes, appraisal concerns, HOA status, repair requirements..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && <DecisionRecordBanner recordId={savedRecordId} moduleName="Property Intelligence™" onSave={handleSaveToRecord} saving={recordSaving} />}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Property Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Type', propType?.label],
                  ['Occupancy', OCCUPANCY_TYPES.find(o => o.id === occupancy)?.label],
                  ['Year Built', yearBuilt || '—'],
                  ['Square Feet', sqft ? Number(sqft).toLocaleString() : '—'],
                  ['Purchase Price', purchasePrice ? fmt$(parseFloat(purchasePrice)) : '—'],
                  ['Est. Value', estimatedValue ? fmt$(parseFloat(estimatedValue)) : '—'],
                  ['LTV', ltv ? `${ltv}%` : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className="font-semibold text-slate-700">{v || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Eligible programs */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Program Eligibility</h3>
              {['FHA','VA','USDA','Conventional','Jumbo'].map(prog => {
                const ok = eligible.includes(prog) && (occupancy !== 'investment' || prog === 'Conventional' || prog === 'Jumbo');
                return (
                  <div key={prog} className={`flex items-center justify-between px-3 py-2 rounded-lg mb-1.5 text-xs
                    ${ok ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100 opacity-50'}`}>
                    <span className={`font-semibold ${ok ? 'text-emerald-700' : 'text-slate-400'}`}>{prog}</span>
                    <span className={ok ? 'text-emerald-600 font-bold' : 'text-red-400 font-bold'}>{ok ? '✓' : '✗'}</span>
                  </div>
                );
              })}
            </div>

            {/* Flags summary */}
            {flaggedItems.length > 0 && (
              <div className={`rounded-xl border p-4 ${criticalFlags.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <h3 className={`text-xs font-bold uppercase tracking-wide mb-2 ${criticalFlags.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                  {criticalFlags.length > 0 ? '🔴 Critical Issues' : '🟡 Flags to Resolve'}
                </h3>
                {flaggedItems.map(f => (
                  <div key={f.id} className="text-xs mb-1">
                    <span className={criticalFlags.includes(f) ? 'text-red-600 font-semibold' : 'text-amber-700'}>• {f.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• FHA: property must meet MPS standards</p>
                <p>• Pre-1978: lead paint disclosure required</p>
                <p>• Condos: project approval required for FHA/VA</p>
                <p>• Investment: no FHA/VA/USDA</p>
                <p>• Well/septic: water test required</p>
                <p>• Flood zone: flood insurance mandatory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
