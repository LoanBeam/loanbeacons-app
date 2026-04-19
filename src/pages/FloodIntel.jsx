// src/pages/FloodIntel.jsx
// LoanBeacons™ — Module 16 | Stage 4: Verification & Submit
// Flood Intelligence™ — FEMA flood zone · NFIP · Insurance tracking · Coverage calculator

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';
// ─── Data ─────────────────────────────────────────────────────────────────────
const FLOOD_ZONES = [
  { zone: 'AE',    sfha: true,  risk: 'HIGH',     icon: '🔴', label: 'Zone AE — High Risk (BFE Determined)',      description: 'SFHA with Base Flood Elevation established. Most common high-risk zone. 1% annual chance of flooding. Flood insurance REQUIRED.',  color: 'red' },
  { zone: 'A',     sfha: true,  risk: 'HIGH',     icon: '🔴', label: 'Zone A — High Risk (No BFE)',               description: 'SFHA with no Base Flood Elevation determined. 1% annual chance of flooding. Flood insurance REQUIRED.',                          color: 'red' },
  { zone: 'AH',    sfha: true,  risk: 'HIGH',     icon: '🔴', label: 'Zone AH — High Risk (Shallow Flooding)',    description: 'Shallow flooding 1–3 ft depth with BFE. SFHA. Flood insurance REQUIRED.',                                                     color: 'red' },
  { zone: 'AO',    sfha: true,  risk: 'HIGH',     icon: '🔴', label: 'Zone AO — High Risk (Sheet Flow)',          description: 'River or stream flood prone area with 1–3 ft average depths. SFHA. Flood insurance REQUIRED.',                                 color: 'red' },
  { zone: 'AR',    sfha: true,  risk: 'HIGH',     icon: '🟠', label: 'Zone AR — Restoration Area',               description: 'Temporary flood risk from decertified levee. SFHA. Flood insurance REQUIRED.',                                              color: 'orange' },
  { zone: 'VE',    sfha: true,  risk: 'HIGH',     icon: '🔴', label: 'Zone VE — Coastal High Risk (Wave Action)', description: 'Coastal zone with wave heights ≥3 ft and BFE. Highest-risk zone. Flood insurance REQUIRED.',                                  color: 'red' },
  { zone: 'X_500', sfha: false, risk: 'MODERATE', icon: '🟡', label: 'Zone X (Shaded) — Moderate Risk',          description: '0.2% annual chance (500-yr) flood area. Outside SFHA. Insurance RECOMMENDED but not federally required.',                     color: 'amber' },
  { zone: 'X',     sfha: false, risk: 'LOW',      icon: '🟢', label: 'Zone X (Unshaded) — Minimal Risk',         description: 'Outside 500-yr floodplain. Lowest risk. Insurance not required but recommended for full protection.',                          color: 'emerald' },
  { zone: 'D',     sfha: false, risk: 'UNKNOWN',  icon: '⚪', label: 'Zone D — Undetermined Risk',               description: 'No flood hazard analysis performed. Risk not determined. Lender may still require insurance as a condition of loan.',          color: 'slate' },
];

const CHECKLIST = [
  { id: 'determination_ordered',    label: 'Flood Zone Determination Ordered',          description: 'SFHDF completed by certified determination service (e.g., CoreLogic, First American). Must be standard form.',   required: true,  trigger: 'always' },
  { id: 'sfha_confirmed',           label: 'SFHA Status Confirmed',                    description: 'Determination confirms whether property is in Special Flood Hazard Area.',                                          required: true,  trigger: 'always' },
  { id: 'community_participating',  label: 'Community Participates in NFIP',           description: 'Confirm the community participates in NFIP. Lenders cannot require NFIP insurance in non-participating communities.', required: true,  trigger: 'sfha' },
  { id: 'insurance_ordered',        label: 'Flood Insurance Ordered / In Force',       description: 'If SFHA, flood insurance must be in place at or before closing. Policy effective date must be at or before closing.', required: true,  trigger: 'sfha' },
  { id: 'coverage_adequate',        label: 'Coverage Amount Adequate',                 description: 'Greater of: loan amount, building replacement cost, or NFIP max ($250k). Does not include land value.',              required: true,  trigger: 'sfha' },
  { id: 'lender_named',             label: 'Lender Named as Loss Payee',               description: 'Lender and its successors and assigns must be named as mortgagee and loss payee on the flood insurance policy.',       required: true,  trigger: 'sfha' },
  { id: 'life_of_loan',             label: 'Life-of-Loan Monitoring Flagged',          description: 'Property must be monitored for flood zone remapping for the life of the loan. Flag in servicing system.',             required: true,  trigger: 'always' },
  { id: 'borrower_notified',        label: 'Flood Hazard Notice Delivered — 10 Days',  description: 'Borrower must be notified of SFHA status and insurance requirement at least 10 business days before closing.',        required: true,  trigger: 'sfha' },
  { id: 'elevation_cert',           label: 'Elevation Certificate (LOMA/LOMR)',        description: 'If disputing flood zone placement, LOMA or LOMR from FEMA must be obtained and reviewed.',                           required: false, trigger: 'dispute' },
  { id: 'private_approved',         label: 'Private Flood Policy Meets Requirements',  description: 'If using private flood insurance, policy must be at least as broad as NFIP. Verify lender accepts private flood.',    required: false, trigger: 'private' },
];

const NFIP_MAX = { building: 250000, contents: 100000 };

const fmt0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtD = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0);

const BORDER_COLOR = { red: 'border-red-300', orange: 'border-orange-300', amber: 'border-amber-300', emerald: 'border-emerald-300', slate: 'border-slate-300' };
const BG_COLOR    = { red: 'bg-red-50', orange: 'bg-orange-50', amber: 'bg-amber-50', emerald: 'bg-emerald-50', slate: 'bg-slate-50' };
const TEXT_COLOR  = { red: 'text-red-700', orange: 'text-orange-700', amber: 'text-amber-700', emerald: 'text-emerald-700', slate: 'text-slate-600' };

// ─── Letter Builder ───────────────────────────────────────────────────────────
function buildFloodLetter({ borrowerName, propertyAddress, selectedZone, isSFHA, buildingCoverage, annualPremium, policyNumber, insuranceCarrier, minCoverage, loNotes, aiSummary }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const zoneObj = FLOOD_ZONES.find(z => z.zone === selectedZone);
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('To: Mortgage Underwriter / Processor / Compliance Officer');
  lines.push('From: George Jules Chevalier IV, NMLS #1175947 — Clearview Lending Solutions');
  lines.push('Re: Flood Zone Determination & Insurance Summary — ' + (borrowerName || 'Borrower'));
  lines.push(''); lines.push('PROPERTY INFORMATION');
  lines.push('Borrower: ' + (borrowerName || 'See application'));
  lines.push('Property: ' + (propertyAddress || 'See application'));
  if (selectedZone) lines.push('FEMA Flood Zone: ' + (zoneObj?.label || selectedZone));
  lines.push('SFHA Status: ' + (isSFHA ? 'YES — In Special Flood Hazard Area' : 'NO — Outside SFHA'));
  lines.push(''); lines.push('FLOOD INSURANCE REQUIREMENT');
  if (isSFHA) {
    lines.push('Flood insurance is FEDERALLY REQUIRED for this property under the National Flood Insurance Reform Act.');
    lines.push('Minimum required coverage: ' + fmt0(minCoverage));
    if (buildingCoverage) lines.push('Building coverage in place: ' + fmt0(parseFloat(buildingCoverage)));
    if (insuranceCarrier) lines.push('Insurance carrier: ' + insuranceCarrier);
    if (policyNumber)    lines.push('Policy number: ' + policyNumber);
    if (annualPremium)   lines.push('Annual premium: ' + fmtD(parseFloat(annualPremium)));
  } else {
    lines.push('Flood insurance is NOT federally required for this property. It is strongly recommended for Zone X (Shaded) properties and Zone D (undetermined risk) properties.');
  }
  if (aiSummary) { lines.push(''); lines.push('AI FLOOD RISK ASSESSMENT'); lines.push(aiSummary); }
  lines.push(''); lines.push('REGULATORY REQUIREMENTS (if SFHA)');
  ['Flood insurance must be in force at or before loan closing', 'Lender must be named as mortgagee and loss payee on policy', 'Coverage must be the greater of: loan amount, replacement cost, or $250,000 NFIP max', 'Borrower must be notified of SFHA status 10+ business days before closing', 'Life-of-loan flood zone monitoring required', 'Escrow of flood insurance premiums required for federally regulated loans'].forEach((r, i) => lines.push((i + 1) + '. ' + r));
  if (loNotes) { lines.push(''); lines.push('LO NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('All flood determination documentation is in the loan file. Please contact me with questions.');
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions | george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function LetterCard({ body }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-3xl border-2 border-cyan-200 bg-cyan-50 overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="font-bold text-slate-700 flex items-center gap-2">📋 Flood Insurance Summary Letter</div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white transition-colors">
            {copied ? '✓ Copied' : 'Copy Letter'}
          </button>
          <button onClick={() => window.print()} className="text-xs px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white">Print</button>
        </div>
      </div>
      <pre className="p-6 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">{body}</pre>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FloodIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const [scenario, setScenario]   = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [search,   setSearch]   = useState('');
  const [showAll,  setShowAll]  = useState(false);
  const [loading, setLoading]     = useState(true);
  const [borrowerName, setBorrowerName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');

  const [activeTab, setActiveTab] = useState(0);

  // Zone
  const [selectedZone, setSelectedZone]           = useState('');
  const [mapNumber, setMapNumber]                 = useState('');
  const [mapDate, setMapDate]                     = useState('');
  const [panelNumber, setPanelNumber]             = useState('');
  const [determinationDate, setDeterminationDate] = useState('');
  const [determinationProvider, setDeterminationProvider] = useState('');
  const [communityParticipates, setCommunityParticipates] = useState(null);

  // Insurance
  const [insuranceType, setInsuranceType]         = useState('nfip_building');
  const [insuranceCarrier, setInsuranceCarrier]   = useState('');
  const [buildingCoverage, setBuildingCoverage]   = useState('');
  const [contentsCoverage, setContentsCoverage]   = useState('');
  const [annualPremium, setAnnualPremium]         = useState('');
  const [policyNumber, setPolicyNumber]           = useState('');
  const [policyEffective, setPolicyEffective]     = useState('');
  const [policyExpiration, setPolicyExpiration]   = useState('');

  // Loan
  const [loanAmount, setLoanAmount]         = useState('');
  const [replacementCost, setReplacementCost] = useState('');

  // Checklist
  const [checkStatuses, setCheckStatuses] = useState(
    Object.fromEntries(CHECKLIST.map(c => [c.id, 'pending']))
  );
  const [checkNotes, setCheckNotes] = useState(
    Object.fromEntries(CHECKLIST.map(c => [c.id, '']))
  );

  // AI
  const [aiAnalysis, setAiAnalysis]   = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const [loNotes, setLoNotes] = useState('');
  const [recordSaving, setRecordSaving]   = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(scenarioId);

  // ─── localStorage ──────────────────────────────────────────────────────────
  const lsKey = scenarioId ? `lb_flood_${scenarioId}` : null;

  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({
      selectedZone, mapNumber, mapDate, panelNumber, determinationDate, determinationProvider, communityParticipates,
      insuranceType, insuranceCarrier, buildingCoverage, contentsCoverage, annualPremium, policyNumber, policyEffective, policyExpiration,
      loanAmount, replacementCost, checkStatuses, checkNotes, loNotes, aiAnalysis, savedRecordId,
    }));
  }, [lsKey, selectedZone, mapNumber, mapDate, panelNumber, determinationDate, determinationProvider, communityParticipates,
      insuranceType, insuranceCarrier, buildingCoverage, contentsCoverage, annualPremium, policyNumber, policyEffective, policyExpiration,
      loanAmount, replacementCost, checkStatuses, checkNotes, loNotes, aiAnalysis, savedRecordId]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // ─── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error).finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.selectedZone)        setSelectedZone(saved.selectedZone);
          if (saved.mapNumber)           setMapNumber(saved.mapNumber);
          if (saved.mapDate)             setMapDate(saved.mapDate);
          if (saved.panelNumber)         setPanelNumber(saved.panelNumber);
          if (saved.determinationDate)   setDeterminationDate(saved.determinationDate);
          if (saved.determinationProvider) setDeterminationProvider(saved.determinationProvider);
          if (saved.communityParticipates !== undefined) setCommunityParticipates(saved.communityParticipates);
          if (saved.insuranceType)       setInsuranceType(saved.insuranceType);
          if (saved.insuranceCarrier)    setInsuranceCarrier(saved.insuranceCarrier);
          if (saved.buildingCoverage)    setBuildingCoverage(saved.buildingCoverage);
          if (saved.contentsCoverage)    setContentsCoverage(saved.contentsCoverage);
          if (saved.annualPremium)       setAnnualPremium(saved.annualPremium);
          if (saved.policyNumber)        setPolicyNumber(saved.policyNumber);
          if (saved.policyEffective)     setPolicyEffective(saved.policyEffective);
          if (saved.policyExpiration)    setPolicyExpiration(saved.policyExpiration);
          if (saved.loanAmount)          setLoanAmount(saved.loanAmount);
          if (saved.replacementCost)     setReplacementCost(saved.replacementCost);
          if (saved.checkStatuses)       setCheckStatuses(saved.checkStatuses);
          if (saved.checkNotes)          setCheckNotes(saved.checkNotes);
          if (saved.loNotes)             setLoNotes(saved.loNotes);
          if (saved.aiAnalysis)          setAiAnalysis(saved.aiAnalysis);
          if (saved.savedRecordId)       setSavedRecordId(saved.savedRecordId);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        const addr = [d.streetAddress, d.city, d.state].filter(Boolean).join(', ');
        if (addr) setPropertyAddress(addr);
        if (d.loanAmount)    setLoanAmount(prev => prev || String(d.loanAmount));
        if (d.propertyValue) setReplacementCost(prev => prev || String(d.propertyValue));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const zoneObj    = FLOOD_ZONES.find(z => z.zone === selectedZone);
  const isSFHA     = zoneObj?.sfha || false;
  const loanAmt    = parseFloat(loanAmount) || 0;
  const replCost   = parseFloat(replacementCost) || 0;
  const bldgCov    = parseFloat(buildingCoverage) || 0;
  const minCoverage = isSFHA ? Math.min(Math.max(loanAmt, replCost), NFIP_MAX.building) : 0;
  const coverageGap = isSFHA && minCoverage > 0 && bldgCov > 0 ? Math.max(0, minCoverage - bldgCov) : 0;
  const coverageOK  = isSFHA ? (bldgCov >= minCoverage && minCoverage > 0) : true;

  // Checklist progress
  const completedChecks = Object.values(checkStatuses).filter(s => s === 'complete').length;
  const issueChecks     = Object.values(checkStatuses).filter(s => s === 'issue').length;
  const totalRelevant   = isSFHA ? CHECKLIST.length : CHECKLIST.filter(c => c.trigger === 'always').length;

  // ─── AI Analysis ────────────────────────────────────────────────────────────
  const handleAIAnalysis = async () => {
    if (!selectedZone) return;
    setAiAnalyzing(true);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          messages: [{ role: 'user', content: `You are a senior mortgage compliance officer specializing in flood insurance requirements. Analyze this flood file.

FLOOD DETERMINATION:
- Zone: ${zoneObj?.label || selectedZone}
- SFHA: ${isSFHA ? 'YES — Flood insurance required' : 'NO — Not required'}
- Community Participates in NFIP: ${communityParticipates === true ? 'Yes' : communityParticipates === false ? 'No' : 'Not confirmed'}

LOAN & COVERAGE:
- Loan Amount: ${loanAmt ? fmt0(loanAmt) : 'Not entered'}
- Replacement Cost: ${replCost ? fmt0(replCost) : 'Not entered'}
- Minimum Required Coverage: ${minCoverage ? fmt0(minCoverage) : 'Not calculated'}
- Building Coverage in Place: ${bldgCov ? fmt0(bldgCov) : 'Not entered'}
- Coverage Gap: ${coverageGap > 0 ? fmt0(coverageGap) : 'None'}
- Insurance Type: ${insuranceType}
- Annual Premium: ${annualPremium ? fmtD(parseFloat(annualPremium)) : 'Not entered'}

CHECKLIST STATUS:
${CHECKLIST.map(c => c.label + ': ' + checkStatuses[c.id]).join('\n')}

Return ONLY valid JSON: {"riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","readyToClose":true_or_false,"summary":"2-3 sentence assessment","issues":["list critical issues"],"actions":["immediate actions needed"],"lenderNotes":["key notes for underwriter"]}` }],
        }),
      });
      if (!resp.ok) throw new Error('Status ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) setAiAnalysis(JSON.parse(match[0]));
    } catch (err) { console.error(err); }
    setAiAnalyzing(false);
  };

  // ─── Decision Record ─────────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const flags = [];
      if (isSFHA && !bldgCov) flags.push({ flagCode: 'NO_FLOOD_INSURANCE', sourceModule: 'FLOOD_INTEL', severity: 'HIGH',   detail: 'SFHA property — no flood insurance entered' });
      if (coverageGap > 0)   flags.push({ flagCode: 'COVERAGE_GAP',        sourceModule: 'FLOOD_INTEL', severity: 'HIGH',   detail: 'Coverage gap: ' + fmt0(coverageGap) + ' below minimum required' });
      if (issueChecks > 0)   flags.push({ flagCode: 'CHECKLIST_ISSUES',    sourceModule: 'FLOOD_INTEL', severity: 'MEDIUM', detail: issueChecks + ' checklist item(s) flagged as issues' });
      const writtenId = await reportFindings(
        'FLOOD_INTEL',
        {
          verdict: !isSFHA ? 'No SFHA — Flood insurance not required' : coverageOK && issueChecks === 0 ? 'SFHA — Insurance in place and adequate' : 'SFHA — Action required',
          summary: `Flood Intelligence — Zone ${selectedZone || 'Not entered'} · SFHA: ${isSFHA ? 'Yes' : 'No'} · Min required: ${fmt0(minCoverage)} · Building coverage: ${fmt0(bldgCov)} · Checklist: ${completedChecks}/${CHECKLIST.length} complete`,
          selectedZone, isSFHA, mapNumber, mapDate, determinationDate,
          loanAmount: loanAmt, replacementCost: replCost, buildingCoverage: bldgCov,
          minCoverage, coverageGap, insuranceType, insuranceCarrier, policyNumber,
          annualPremium: parseFloat(annualPremium) || null, checkStatuses, loNotes,
        },
        [],
        flags,
        '1.0.0'
      );
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const TABS = [
    { id: 0, label: 'Zone Determination', icon: '🗺️' },
    { id: 1, label: 'Insurance Tracking', icon: '🛡️' },
    { id: 2, label: 'Compliance Checklist', icon: '📋' },
    { id: 3, label: 'AI Assessment', icon: '🤖' },
  ];

  const riskColor = { LOW: 'text-emerald-700 bg-emerald-100 border-emerald-300', MEDIUM: 'text-amber-700 bg-amber-100 border-amber-300', HIGH: 'text-red-700 bg-red-100 border-red-300', CRITICAL: 'text-red-900 bg-red-200 border-red-500' };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">🌊</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">24</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 4 — Verification &amp; Submit</span>
                <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-2xl font-normal text-white mt-0.5">Flood Intelligence™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Determine FEMA flood zone status, calculate NFIP coverage requirements, track insurance policies, and generate borrower flood disclosure letters.</p>
            <div className="flex flex-wrap gap-2">
              {['FEMA Zone Lookup', 'NFIP Coverage Calc', 'Insurance Tracking', 'Flood Cert Review', 'Borrower Disclosure Letter', 'Elevation Certificate'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2>
            <p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
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
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate('/flood-intel?scenarioId=' + s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
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

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      <DecisionRecordBanner
        recordId={savedRecordId}
        moduleName="Flood Intelligence™"
        moduleKey="FLOOD_INTEL"
        onSave={handleSaveToRecord}
      />
      <ModuleNav moduleNumber={24} />

      {/* Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #0891b2 0%, transparent 50%), radial-gradient(circle at 80% 20%, #0e7490 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 24</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Flood Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl">FEMA flood zone · NFIP requirements · Insurance tracking · Coverage calculator · AI risk assessment</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px', flexShrink: 0 }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{propertyAddress || 'No address'}</div>
                  {selectedZone ? (
                    <div className={'text-sm font-bold mt-1 ' + (isSFHA ? 'text-red-400' : 'text-emerald-400')}>
                      {isSFHA ? '⚠️ SFHA — Zone ' + selectedZone : '✓ Zone ' + selectedZone + ' — Not SFHA'}
                    </div>
                  ) : <div className="text-amber-400 text-sm mt-1">Zone not selected</div>}
                </>
              ) : <div className="text-slate-400 text-sm">No scenario loaded</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Borrower Bar */}
      {scenarioId && borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {propertyAddress && <span className="text-blue-200 text-xs">{propertyAddress}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {selectedZone && <span>Zone <strong className="text-white">{selectedZone}</strong></span>}
              {isSFHA && <span className="text-red-300 font-bold">⚠️ Insurance Required</span>}
              {bldgCov > 0 && <span>Coverage <strong className="text-white">{fmt0(bldgCov)}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Flood Intelligence™" moduleNumber="24" scenarioId={scenarioId} />

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all ' + (activeTab === tab.id ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 0 && selectedZone && <span className={'text-xs px-2 py-0.5 rounded-full font-black ' + (isSFHA ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>{isSFHA ? 'SFHA' : 'Clear'}</span>}
                {tab.id === 2 && issueChecks > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-black">{issueChecks}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* ─── TAB 0: ZONE DETERMINATION ───────────────────────────────── */}
            {activeTab === 0 && (
              <>
                {/* Zone selector */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">FEMA Flood Zone Selection</h2>
                    <p className="text-slate-400 text-sm mt-1">Select the zone from the Standard Flood Hazard Determination (SFHDF) form. Zone drives all insurance requirements.</p>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-1 gap-3 mb-6">
                      {FLOOD_ZONES.map(zone => (
                        <button key={zone.zone} onClick={() => setSelectedZone(zone.zone)}
                          className={'w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ' + (selectedZone === zone.zone ? BORDER_COLOR[zone.color] + ' ' + BG_COLOR[zone.color] : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <span className="text-2xl shrink-0">{zone.icon}</span>
                          <div className="flex-1">
                            <div className={'text-sm font-bold ' + (selectedZone === zone.zone ? TEXT_COLOR[zone.color] : 'text-slate-800')}>{zone.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{zone.description}</div>
                          </div>
                          <div className={'text-xs font-bold px-2 py-1 rounded-lg shrink-0 ' + (zone.sfha ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
                            {zone.sfha ? 'SFHA' : 'Non-SFHA'}
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedZone && zoneObj && (
                      <div className={'rounded-3xl border-2 p-6 ' + (isSFHA ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50')}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-3xl">{zoneObj.icon}</span>
                          <div>
                            <div className={'text-xl font-black ' + (isSFHA ? 'text-red-800' : 'text-emerald-800')}>
                              {isSFHA ? 'SFHA — Flood Insurance REQUIRED' : 'Non-SFHA — Insurance not federally required'}
                            </div>
                            <div className={'text-sm ' + (isSFHA ? 'text-red-600' : 'text-emerald-600')}>{zoneObj.description}</div>
                          </div>
                        </div>
                        {isSFHA && (
                          <div className="space-y-1 mt-3">
                            {['Flood insurance must be obtained before closing', 'Lender must be named as loss payee / mortgagee', 'Coverage must meet minimum required amount', 'Life-of-loan monitoring required', 'Borrower must be notified 10+ business days before closing'].map((req, i) => (
                              <div key={i} className="flex gap-2 text-xs text-red-700"><span className="shrink-0 font-bold">{i + 1}.</span><span>{req}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Determination details */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Determination Details</h2>
                    <p className="text-slate-400 text-sm mt-1">From the Standard Flood Hazard Determination Form (SFHDF)</p>
                  </div>
                  <div className="p-8 grid grid-cols-2 gap-5">
                    {[
                      { label: 'FEMA Map Number (FIRM)', val: mapNumber, set: setMapNumber, ph: '13097C0802E' },
                      { label: 'Map Date', val: mapDate, set: setMapDate, ph: '', type: 'date' },
                      { label: 'Panel Number', val: panelNumber, set: setPanelNumber, ph: '0802E' },
                      { label: 'Determination Date', val: determinationDate, set: setDeterminationDate, ph: '', type: 'date' },
                      { label: 'Determination Provider', val: determinationProvider, set: setDeterminationProvider, ph: 'CoreLogic / First American / etc.' },
                    ].map(f => (
                      <div key={f.label} className={f.label.includes('Provider') ? 'col-span-2' : ''}>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{f.label}</label>
                        <input type={f.type || 'text'} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cyan-400" />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Community Participates in NFIP?</label>
                      <div className="flex gap-2">
                        {[{ v: true, l: '✓ Yes', c: 'emerald' }, { v: false, l: '✗ No', c: 'red' }, { v: null, l: '? Unknown', c: 'slate' }].map(opt => (
                          <button key={String(opt.v)} onClick={() => setCommunityParticipates(opt.v)}
                            className={'flex-1 py-2.5 rounded-2xl border-2 text-sm font-bold transition-all ' + (communityParticipates === opt.v ? `border-${opt.c}-400 bg-${opt.c}-50 text-${opt.c}-700` : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                      {communityParticipates === false && (
                        <div className="mt-2 text-xs text-red-700 bg-red-50 rounded-xl p-3 font-semibold">⚠️ Non-participating communities: NFIP insurance cannot be required, but private flood insurance may still be required by lender.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 1: INSURANCE TRACKING ───────────────────────────────── */}
            {activeTab === 1 && (
              <>
                {/* Coverage calculator */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={'bg-gradient-to-r px-8 py-5 ' + (isSFHA ? 'from-red-800 to-red-700' : 'from-slate-800 to-slate-700')}>
                    <h2 className="text-xl font-bold text-white">Coverage Requirements Calculator</h2>
                    <p className={'text-sm mt-1 ' + (isSFHA ? 'text-red-200' : 'text-slate-400')}>
                      {isSFHA ? 'Minimum coverage = lesser of: loan amount, replacement cost, or NFIP max ($250k)' : 'Zone ' + (selectedZone || 'not selected') + ' — Flood insurance not federally required for this zone'}
                    </p>
                  </div>
                  <div className="p-8 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Amount ($)</label>
                        <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} placeholder="450000"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cyan-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Building Replacement Cost ($)</label>
                        <input type="number" value={replacementCost} onChange={e => setReplacementCost(e.target.value)} placeholder="400000"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cyan-400" />
                      </div>
                    </div>

                    {(loanAmt > 0 || replCost > 0) && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-100">
                        {[
                          { label: 'Loan Amount', value: loanAmt },
                          { label: 'Replacement Cost', value: replCost },
                          { label: 'NFIP Maximum (Building)', value: NFIP_MAX.building },
                        ].map(row => (
                          <div key={row.label} className={'flex justify-between items-center px-5 py-3 ' + (row.value === Math.min(Math.max(loanAmt, replCost), NFIP_MAX.building) && isSFHA ? 'bg-cyan-50' : '')}>
                            <span className="text-sm text-slate-600">{row.label}</span>
                            <span className={'text-sm font-bold ' + (row.value === Math.min(Math.max(loanAmt, replCost), NFIP_MAX.building) && isSFHA ? 'text-cyan-700' : 'text-slate-800')}>{fmt0(row.value)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center px-5 py-4 bg-cyan-50">
                          <span className="text-sm font-black text-cyan-800">Minimum Required Coverage</span>
                          <span className="text-xl font-black text-cyan-700">{minCoverage > 0 ? fmt0(minCoverage) : '--'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Policy details */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Insurance Policy Details</h2>
                    <p className="text-slate-400 text-sm mt-1">Track the flood insurance policy — required if SFHA</p>
                  </div>
                  <div className="p-8 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Insurance Type</label>
                        <select value={insuranceType} onChange={e => setInsuranceType(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400 bg-white">
                          {[['nfip_building','NFIP — Building Coverage'],['nfip_both','NFIP — Building + Contents'],['private','Private Flood Insurance'],['excess','Excess Flood Insurance'],['none','No Insurance (Non-SFHA)']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Insurance Carrier</label>
                        <input value={insuranceCarrier} onChange={e => setInsuranceCarrier(e.target.value)} placeholder="e.g. Wright Flood / Neptune / NFIP"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Building Coverage ($) <span className={isSFHA && minCoverage > 0 ? 'text-red-500' : ''}>★ Required</span></label>
                        <input type="number" value={buildingCoverage} onChange={e => setBuildingCoverage(e.target.value)} placeholder={fmt0(minCoverage) || '250000'}
                          className={'w-full border-2 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none ' + (coverageGap > 0 ? 'border-red-300 bg-red-50 focus:border-red-400' : bldgCov >= minCoverage && minCoverage > 0 ? 'border-emerald-300 bg-emerald-50 focus:border-emerald-400' : 'border-slate-200 focus:border-cyan-400')} />
                        {coverageGap > 0 && <div className="text-xs text-red-600 font-bold mt-1">⚠️ {fmt0(coverageGap)} short of minimum required</div>}
                        {coverageOK && bldgCov > 0 && <div className="text-xs text-emerald-600 font-bold mt-1">✓ Coverage meets minimum requirement</div>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Contents Coverage ($)</label>
                        <input type="number" value={contentsCoverage} onChange={e => setContentsCoverage(e.target.value)} placeholder="100000"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cyan-400" />
                        <div className="text-xs text-slate-400 mt-1">NFIP max: {fmt0(NFIP_MAX.contents)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      {[
                        { label: 'Annual Premium ($)', val: annualPremium, set: setAnnualPremium, ph: '2400', type: 'number' },
                        { label: 'Policy Number', val: policyNumber, set: setPolicyNumber, ph: 'Policy #' },
                        { label: 'Effective Date', val: policyEffective, set: setPolicyEffective, ph: '', type: 'date' },
                        { label: 'Expiration Date', val: policyExpiration, set: setPolicyExpiration, ph: '', type: 'date' },
                      ].map(f => (
                        <div key={f.label}>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{f.label}</label>
                          <input type={f.type || 'text'} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cyan-400" />
                        </div>
                      ))}
                    </div>
                    {annualPremium && (
                      <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
                        <div className="text-xs font-bold text-cyan-700 mb-1">Monthly Escrow Impact</div>
                        <div className="text-lg font-black text-cyan-800">{fmtD(parseFloat(annualPremium) / 12)}<span className="text-sm font-normal text-cyan-600">/month</span></div>
                        <div className="text-xs text-cyan-600 mt-1">Flood insurance must be escrowed for federally regulated lenders</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 2: CHECKLIST ────────────────────────────────────────── */}
            {activeTab === 2 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                  <h2 className="text-xl font-bold text-white">Flood Compliance Checklist</h2>
                  <p className="text-slate-400 text-sm mt-1">{completedChecks} of {CHECKLIST.length} complete · {issueChecks > 0 ? issueChecks + ' issues' : 'No issues'}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {CHECKLIST.map(item => {
                    const status = checkStatuses[item.id];
                    const isRelevant = isSFHA || item.trigger === 'always';
                    return (
                      <div key={item.id} className={'p-6 ' + (status === 'issue' ? 'bg-red-50' : status === 'complete' ? 'bg-emerald-50' : !isRelevant ? 'bg-slate-50 opacity-50' : 'hover:bg-slate-50')}>
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-bold text-slate-800">{item.label}</span>
                              {item.required && isSFHA && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg font-bold">Required</span>}
                              {!isRelevant && <span className="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-lg">Not applicable (non-SFHA)</span>}
                            </div>
                            <p className="text-xs text-slate-500 mb-3">{item.description}</p>
                            <input type="text" value={checkNotes[item.id]} onChange={e => setCheckNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Notes / tracking # / exception..." disabled={!isRelevant}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 bg-slate-50 disabled:opacity-40" />
                          </div>
                          <select value={status} onChange={e => setCheckStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                            disabled={!isRelevant}
                            className={'text-xs border-2 rounded-2xl px-3 py-2 font-bold focus:outline-none shrink-0 cursor-pointer disabled:opacity-40 ' + (status === 'complete' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : status === 'issue' ? 'border-red-400 bg-red-50 text-red-800' : status === 'na' ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                            <option value="pending">⏳ Pending</option>
                            <option value="complete">✅ Complete</option>
                            <option value="issue">⚠️ Issue</option>
                            <option value="na">— N/A</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── TAB 3: AI ASSESSMENT ────────────────────────────────────── */}
            {activeTab === 3 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Flood Risk Assessment</h2>
                    <p className="text-slate-400 text-sm mt-1">Sonnet evaluates flood zone status, coverage adequacy, and closing readiness</p>
                  </div>
                  <div className="p-8">
                    {!aiAnalysis ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-slate-500 text-sm mb-4">Run AI assessment to identify flood compliance risks and verify closing readiness.</p>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing || !selectedZone}
                          className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors">
                          {aiAnalyzing ? 'Analyzing...' : !selectedZone ? 'Select flood zone first' : '🤖 Run AI Assessment'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className={'inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-black text-sm ' + (riskColor[aiAnalysis.riskLevel] || riskColor.MEDIUM)}>
                          {aiAnalysis.riskLevel === 'LOW' ? '✅' : aiAnalysis.riskLevel === 'MEDIUM' ? '⚠️' : '🚨'} Risk: {aiAnalysis.riskLevel}
                          {aiAnalysis.readyToClose && <span className="ml-2 text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">Ready to Close</span>}
                          {!aiAnalysis.readyToClose && <span className="ml-2 text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">Action Required</span>}
                        </div>
                        <p className="text-slate-700 leading-relaxed">{aiAnalysis.summary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[['🚨 Issues', aiAnalysis.issues, 'red'], ['✅ Actions Needed', aiAnalysis.actions, 'blue'], ['📋 Lender Notes', aiAnalysis.lenderNotes, 'slate']].map(([label, items, color]) => (
                            <div key={label} className={'rounded-2xl border p-4 ' + (color === 'red' ? 'bg-red-50 border-red-200' : color === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200')}>
                              <div className={'text-xs font-bold mb-2 ' + (color === 'red' ? 'text-red-700' : color === 'blue' ? 'text-blue-700' : 'text-slate-600')}>{label}</div>
                              <ul className="space-y-1">{(items || []).map((item, i) => <li key={i} className={'text-xs flex gap-2 ' + (color === 'red' ? 'text-red-800' : color === 'blue' ? 'text-blue-800' : 'text-slate-700')}><span className="shrink-0">•</span><span>{item}</span></li>)}</ul>
                            </div>
                          ))}
                        </div>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing} className="text-xs text-cyan-600 hover:text-cyan-500 font-semibold">{aiAnalyzing ? 'Re-analyzing...' : '↺ Re-run'}</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* LO Notes */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">LO Notes</h2></div>
                  <div className="p-8">
                    <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={4}
                      placeholder="Zone dispute notes, LOMA application status, private insurance verification, lender overlay requirements..."
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
                  </div>
                </div>

                {/* Letter */}
                <LetterCard body={buildFloodLetter({ borrowerName, propertyAddress, selectedZone, isSFHA, buildingCoverage, annualPremium, policyNumber, insuranceCarrier, minCoverage, loNotes, aiSummary: aiAnalysis?.summary })} />
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Flood Summary</div>
              <div className="space-y-3">
                {[
                  ['Flood Zone', selectedZone || '--', selectedZone ? (isSFHA ? 'text-red-400' : 'text-emerald-400') : 'text-slate-400'],
                  ['SFHA Status', isSFHA ? '⚠️ In SFHA' : selectedZone ? '✓ Not SFHA' : '--', isSFHA ? 'text-red-400' : 'text-emerald-400'],
                  ['Min Coverage', minCoverage > 0 ? fmt0(minCoverage) : '--', 'text-white'],
                  ['Coverage in Place', bldgCov > 0 ? fmt0(bldgCov) : '--', coverageOK && bldgCov > 0 ? 'text-emerald-400' : coverageGap > 0 ? 'text-red-400' : 'text-slate-400'],
                  ['Annual Premium', annualPremium ? fmtD(parseFloat(annualPremium)) : '--', 'text-white'],
                  ['Monthly Escrow', annualPremium ? fmtD(parseFloat(annualPremium) / 12) : '--', 'text-cyan-300'],
                  ['Checklist', completedChecks + '/' + CHECKLIST.length + ' complete', completedChecks === CHECKLIST.length ? 'text-emerald-400' : 'text-amber-400'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800">
                    <span className="text-slate-400 text-sm">{l}</span><span className={'font-bold text-sm ' + c}>{v}</span>
                  </div>
                ))}
              </div>

              {coverageGap > 0 && (
                <div className="mt-4 bg-red-900/30 border border-red-700/50 rounded-2xl p-4">
                  <div className="text-xs font-bold text-red-400 uppercase mb-1">Coverage Gap</div>
                  <div className="text-lg font-black text-red-300">{fmt0(coverageGap)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Additional coverage needed</div>
                </div>
              )}

              {aiAnalysis?.riskLevel && (
                <div className={'mt-3 rounded-2xl p-3 border text-center ' + (aiAnalysis.riskLevel === 'LOW' ? 'bg-emerald-900/30 border-emerald-700/50' : aiAnalysis.riskLevel === 'MEDIUM' ? 'bg-amber-900/30 border-amber-700/50' : 'bg-red-900/30 border-red-700/50')}>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-0.5">AI Assessment</div>
                  <div className={'font-black ' + (aiAnalysis.riskLevel === 'LOW' ? 'text-emerald-300' : aiAnalysis.riskLevel === 'MEDIUM' ? 'text-amber-300' : 'text-red-300')}>{aiAnalysis.riskLevel}</div>
                  {aiAnalysis.readyToClose !== undefined && <div className={'text-xs mt-0.5 ' + (aiAnalysis.readyToClose ? 'text-emerald-400' : 'text-red-400')}>{aiAnalysis.readyToClose ? 'Ready to Close' : 'Action Required'}</div>}
                </div>
              )}
            </div>

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {['SFHA property: flood insurance required by federal law before closing', 'Coverage minimum: greater of loan amount, replacement cost, or $250k NFIP max', 'Lender must be named as mortgagee and loss payee on every policy', 'Borrower must be notified 10+ business days before closing (SFHA)', 'Private flood insurance: must be at least as broad as NFIP', 'Life-of-loan monitoring: flag in servicing for zone remapping', 'Zone X (Shaded): not required but strongly recommended', 'Escrow required: flood premiums must be escrowed for federally regulated lenders'].map(rule => (
                  <li key={rule} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0">•</span><span>{rule}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

</div>
  );
}
