/**
 * ============================================================
 * LoanBeacons™ — Lender Match™
 * src/modules/LenderMatch.jsx
 * M08 · Stage 2: Lender Fit
 * Apr 2026 — borrower identification wired end-to-end
 * ============================================================
 */
import { useSearchParams } from 'react-router-dom';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import {
  runLenderMatch,
  buildDecisionRecord,
  normalizeScenario,
  OVERLAY_RISK,
  ELIGIBILITY_STATUS,
  SCENARIO_INTENT,
  ENGINE_VERSION,
} from '../engines/LenderMatchEngine';
import { useLenderProfiles } from '../hooks/useLenderProfiles';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';
import { LenderScorecardCard }   from '../components/lenderMatch/LenderScorecardCard';
import { AlternativeLenderCard } from '../components/lenderMatch/AlternativeLenderCard';
import { DecisionRecordModal }   from '../components/lenderMatch/DecisionRecordModal';
import { IneligibleLenderRow }   from '../components/lenderMatch/IneligibleLenderRow';

// ─── Constants ───────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const PROPERTY_TYPES = [
  { value: 'SFR',                  label: 'Single Family (SFR)' },
  { value: 'Condo',                label: 'Condo (Warrantable)' },
  { value: 'Condo_NonWarrantable', label: 'Condo (Non-Warrantable)' },
  { value: 'TwoUnit',              label: '2-Unit' },
  { value: 'ThreeUnit',            label: '3-Unit' },
  { value: 'FourUnit',             label: '4-Unit' },
  { value: 'Manufactured',         label: 'Manufactured Home' },
  { value: 'MixedUse',             label: 'Mixed Use' },
];

const INCOME_DOC_OPTIONS = [
  { value: 'fullDoc',         label: 'Full Documentation (W2 / Tax Returns)', nonQM: false },
  { value: 'bankStatement12', label: 'Bank Statement — 12 Month',             nonQM: true  },
  { value: 'bankStatement24', label: 'Bank Statement — 24 Month',             nonQM: true  },
  { value: 'dscr',            label: 'DSCR (No Personal Income)',             nonQM: true  },
  { value: 'assetDepletion',  label: 'Asset Depletion',                      nonQM: true  },
  { value: 'ninetyNineOnly',  label: '1099 Only',                            nonQM: true  },
  { value: 'noDoc',           label: 'No Documentation',                     nonQM: true  },
];

const LOAN_TYPES = [
  { value: 'All',          label: 'All Programs' },
  { value: 'Conventional', label: 'Conventional' },
  { value: 'FHA',          label: 'FHA' },
  { value: 'VA',           label: 'VA' },
  { value: 'NonQM',        label: 'Non-QM Only' },
];

const CREDIT_EVENTS = [
  { value: 'none',      label: 'None' },
  { value: 'BK',        label: 'Bankruptcy' },
  { value: 'FC',        label: 'Foreclosure' },
  { value: 'shortSale', label: 'Short Sale' },
];

const INTENT_OPTIONS = [
  { value: SCENARIO_INTENT.AGENCY_FIRST,      label: 'Agency First — Prefer conventional path' },
  { value: SCENARIO_INTENT.ALTERNATIVE_FOCUS, label: 'Alternative Focus — Non-QM primary' },
  { value: SCENARIO_INTENT.SPEED_FOCUS,       label: 'Speed Focus — Fastest close' },
];

const INITIAL_FORM = {
  loanType: 'All', transactionType: 'purchase', loanAmount: '',
  propertyValue: '', creditScore: '', incomeDocType: 'fullDoc',
  monthlyIncome: '', monthlyDebts: '', propertyType: 'SFR',
  occupancy: 'Primary', state: '', selfEmployed: false,
  creditEvent: 'none', creditEventMonths: '', vaEntitlement: 'Full',
  dscr: '', grossRentalIncome: '', totalAssets: '', reservesMonths: '',
  intent: SCENARIO_INTENT.AGENCY_FIRST,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt   = (v) => { const n = parseInt(String(v).replace(/\D/g,'')); return isNaN(n) ? '' : n.toLocaleString(); };
const parse = (v) => parseInt(String(v).replace(/\D/g,'')) || '';
const fmt$  = (n) => n ? `$${Number(n).toLocaleString()}` : '';

const confColor = { HIGH: '#16a34a', MODERATE: '#d97706', LOW: '#dc2626' };

// Resolve borrower name from any of the possible Firestore field names
function resolveBorrowerFromScenario(s) {
  const first = s.borrowerFirstName || s.firstName || s.primaryBorrowerFirstName || '';
  const last  = s.borrowerLastName  || s.lastName  || s.primaryBorrowerLastName  || '';
  const full  = s.borrowerName      || s.primaryBorrowerName || '';

  const name = full || (first || last ? `${first} ${last}`.trim() : '');

  // Address — try multiple common field names
  const address = s.propertyAddress || s.subjectPropertyAddress
    || s.address || s.subjectProperty || '';

  const city   = s.city   || s.propertyCity   || '';
  const state  = s.state  || s.propertyState  || '';
  const county = s.county || s.propertyCounty || '';

  return {
    name:    name    || null,
    address: address || null,
    city:    city    || null,
    state:   state   || null,
    county:  county  || null,
  };
}

// ─── Small UI Components ──────────────────────────────────────────────────────

function Field({ label, tag, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
        {tag && (
          <span className="normal-case tracking-normal font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-xs">
            {tag}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent placeholder-slate-300 transition-shadow"
      {...props}
    />
  );
}

function Sel({ children, ...props }) {
  return (
    <select
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
      {...props}
    >
      {children}
    </select>
  );
}

function TxToggle({ value, onChange }) {
  const opts = [{ v:'purchase',l:'Purchase'},{v:'rateTerm',l:'Rate/Term'},{v:'cashOut',l:'Cash-Out'}];
  return (
    <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
      {opts.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            value === o.v ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'
          }`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => onChange(!value)}>
      <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${value ? 'bg-orange-500' : 'bg-slate-200'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}

function SecLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-3.5">
      <div className="w-3 h-px bg-orange-400" />
      <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">{children}</span>
    </div>
  );
}

function Hr() { return <div className="border-t border-slate-100 my-5" />; }

function ConfChip({ confidence }) {
  if (!confidence) return null;
  const color = confColor[confidence.level] || '#64748b';
  const pct = Math.round(confidence.score * 100);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs shadow-sm">
      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div style={{ width: `${pct}%`, backgroundColor: color }} className="h-full rounded-full transition-all" />
      </div>
      <span className="text-slate-400">Confidence:</span>
      <span className="font-bold" style={{ color }}>{confidence.level}</span>
      <span className="text-slate-300">({pct}%)</span>
    </div>
  );
}

function OverlayChip({ risk }) {
  if (!risk) return null;
  const icons  = { LOW:'🟢', MODERATE:'🟡', HIGH:'🔴' };
  const colors = { LOW:'#16a34a', MODERATE:'#d97706', HIGH:'#dc2626' };
  const color  = colors[risk.level] || '#64748b';
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs shadow-sm">
      <span>{icons[risk.level]}</span>
      <span className="text-slate-400">Overlay Risk:</span>
      <span className="font-bold" style={{ color }}>{risk.level}</span>
      {risk.signalCount > 0 && <span className="text-slate-300">({risk.signalCount} signal{risk.signalCount !== 1 ? 's' : ''})</span>}
    </div>
  );
}

function PlaceholderBanner() {
  return (
    <div className="flex items-start gap-3 px-5 py-3 bg-amber-50 border-l-4 border-amber-400 text-xs text-amber-800">
      <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
      <span><strong>GENERIC NON-QM PROFILE —</strong> Estimated guidelines. Confirm all terms directly with lender before quoting.</span>
    </div>
  );
}

function AePanel({ lenderName, getAeInfo }) {
  const ae = getAeInfo(lenderName);
  if (!ae) return null;
  return (
    <div className="flex items-start gap-3 px-5 py-2.5 bg-blue-50 border-l-4 border-blue-400">
      <span className="text-xs font-bold text-blue-500 uppercase tracking-widest pt-0.5 flex-shrink-0">Your AE</span>
      <div className="text-xs space-y-0.5">
        <div className="font-semibold text-slate-700">{ae.aeName}</div>
        {ae.aeEmail && <a href={`mailto:${ae.aeEmail}`} className="text-blue-600 hover:underline block">{ae.aeEmail}</a>}
        {ae.aePhone && <a href={`tel:${ae.aePhone}`} className="text-blue-600 hover:underline block">{ae.aePhone}</a>}
      </div>
    </div>
  );
}

// ── Borrower ID Banner ────────────────────────────────────────────────────────
function BorrowerBanner({ borrower, form }) {
  if (!borrower) return null;

  const initials = borrower.name
    ? borrower.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const chips = [
    form.creditScore && `${form.creditScore} FICO`,
    form.loanAmount  && fmt$(Number(form.loanAmount)),
    borrower.state || form.state,
    form.transactionType && form.transactionType.charAt(0).toUpperCase() + form.transactionType.slice(1),
  ].filter(Boolean);

  if (!borrower.name) {
    // No name found — show a soft warning with available loan data
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-4">
        <span className="text-2xl flex-shrink-0">⚠️</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-amber-700">Borrower name not found in scenario</div>
          <div className="text-xs text-amber-600 mt-0.5">
            Add a borrower name in ScenarioCreator to identify records across modules.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
          {chips.map((c, i) => (
            <span key={i} className="text-xs font-mono bg-amber-100 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{c}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-2xl px-5 py-4 flex items-center gap-4">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {initials}
      </div>

      {/* Name + address */}
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold text-base">{borrower.name}</div>
        {(borrower.address || borrower.city || borrower.county) && (
          <div className="text-slate-400 text-xs mt-0.5 truncate">
            {[borrower.address, borrower.city, borrower.county, borrower.state]
              .filter(Boolean).join(', ')}
          </div>
        )}
      </div>

      {/* Loan data chips */}
      <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
        {chips.map((c, i) => (
          <span key={i} className="text-xs font-mono bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full">{c}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LenderMatch() {
  const [form, setForm]         = useState(INITIAL_FORM);
  const [borrower, setBorrower] = useState(null);   // ← borrower identification
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [showIneligible, setShowIneligible] = useState({ agency: false, nonqm: false });
  const [selectedLender, setSelectedLender] = useState(null);
  const [decisionModal, setDecisionModal]   = useState({ open: false, record: null });
  const [savingRecord, setSavingRecord]     = useState(false);

  const resultsRef = useRef(null);
  const { getAeInfo } = useLenderProfiles();
  const [searchParams] = useSearchParams();

  // ── Scenario pre-load — captures borrower + all loan fields ──────────────
  useEffect(() => {
    const sid = searchParams.get('scenarioId');
    if (!sid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scenarios', sid));
        if (snap.exists()) {
          const s = snap.data();

          // Loan fields
          if (s.loanAmount)    set('loanAmount',    String(s.loanAmount));
          if (s.propertyValue) set('propertyValue', String(s.propertyValue));
          if (s.creditScore)   set('creditScore',   String(s.creditScore));
          if (s.state)         set('state',         s.state);
          if (s.loanType)      set('loanType',      s.loanType);
          if (s.propertyType)  set('propertyType',  s.propertyType);
          if (s.occupancy)     set('occupancy',     s.occupancy);
          if (s.monthlyIncome) set('monthlyIncome', String(s.monthlyIncome));
          if (s.monthlyDebts)  set('monthlyDebts',  String(s.monthlyDebts));

          // Borrower identification — resolve from scenario
          setBorrower(resolveBorrowerFromScenario(s));
        }
      } catch (e) { console.error('Scenario load:', e); }
    })();
  }, [searchParams]);

  // ── NSI ───────────────────────────────────────────────────────────────────
  const scenarioIdParam = searchParams.get('scenarioId');
  const loanPurpose = form.transactionType === 'cashOut'  ? 'cash_out_refi'
    : form.transactionType === 'rateTerm' ? 'rate_term_refi'
    : 'purchase';

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:       'LENDER_MATCH',
      loanPurpose,
      decisionRecordFindings: {
        LENDER_MATCH: {
          matchFound:  (results?.totalEligible ?? 0) > 0,
          agencyFound: (results?.agencySection?.totalEligible ?? 0) > 0,
          nonQMFound:  (results?.nonQMSection?.totalEligible ?? 0) > 0,
        },
      },
      scenarioData:            {},
      completedModules:        [],
      scenarioId:              scenarioIdParam,
      onWriteToDecisionRecord: null,
    });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const set    = useCallback((f, v) => setForm(p => ({ ...p, [f]: v })), []);
  const setCur = useCallback((f, r) => setForm(p => ({ ...p, [f]: parse(r) })), []);

  const isNonQM = INCOME_DOC_OPTIONS.find(o => o.value === form.incomeDocType)?.nonQM ?? false;
  const isDSCR  = form.incomeDocType === 'dscr';
  const isAsset = form.incomeDocType === 'assetDepletion';
  const isVA    = form.loanType === 'VA' || form.loanType === 'All';
  const hasCE   = form.creditEvent !== 'none';
  const ltv     = form.loanAmount && form.propertyValue
    ? ((form.loanAmount / form.propertyValue) * 100).toFixed(1) : null;

  const handleRun = useCallback(async () => {
    setLoading(true); setError(null); setSelectedLender(null);
    try {
      const raw = {
        ...form,
        loanAmount:        Number(form.loanAmount)        || 0,
        propertyValue:     Number(form.propertyValue)     || 0,
        creditScore:       Number(form.creditScore)       || 0,
        monthlyIncome:     Number(form.monthlyIncome)     || 0,
        monthlyDebts:      Number(form.monthlyDebts)      || 0,
        dscr:              form.dscr ? parseFloat(form.dscr) : null,
        totalAssets:       Number(form.totalAssets)       || 0,
        reservesMonths:    Number(form.reservesMonths)    || 0,
        creditEventMonths: Number(form.creditEventMonths) || 0,
      };
      await new Promise(r => setTimeout(r, 60));
      setResults(runLenderMatch(raw, { firestoreAvailable: true }));
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      console.error('[LenderMatch] Engine error:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally { setLoading(false); }
  }, [form]);

  const handleClear = useCallback(() => {
    setForm(INITIAL_FORM); setResults(null); setError(null);
    setSelectedLender(null); setBorrower(null);
  }, []);

  const handleSelectLender = useCallback((result) => {
    if (!results) return;
    setSelectedLender(result.lenderId);
    const scenario = normalizeScenario({
      ...form,
      loanAmount:    Number(form.loanAmount)    || 0,
      propertyValue: Number(form.propertyValue) || 0,
      creditScore:   Number(form.creditScore)   || 0,
      // ── Inject borrower identification into the scenario snapshot ──
      borrowerName:    borrower?.name    || null,
      propertyAddress: borrower?.address || null,
      city:            borrower?.city    || null,
      county:          borrower?.county  || null,
    });
    setDecisionModal({ open: true, record: buildDecisionRecord(result, scenario, results), result });
  }, [form, results, borrower]);

  const handleSaveDecisionRecord = useCallback(async (record) => {
    setSavingRecord(true);
    try {
      await addDoc(collection(db, 'decisionRecords'), { ...record, savedAt: serverTimestamp() });
      setDecisionModal(p => ({ ...p, saved: true }));
    } catch (err) { console.error('[LenderMatch] Save error:', err); }
    finally { setSavingRecord(false); }
  }, []);

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading) handleRun(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleRun, loading]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-20" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl mx-4 mt-4 mb-6 p-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-1.5">
              Module 08 · Stage 2: Lender Fit
            </p>
            <h1 className="text-white font-bold text-3xl mb-2" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
              Lender Match™
            </h1>
            <p className="text-slate-400 text-sm max-w-lg leading-relaxed">
              7-step evaluation pipeline across agency and Non-QM lender profiles.
              Matches your borrower's scenario to eligible lenders and surfaces the optimal path forward.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">LIVE</span>
            <span className="text-slate-500 text-xs font-mono">ENGINE v{ENGINE_VERSION}</span>
            {results && (
              <span className="text-slate-400 text-xs font-mono">{results.totalEligible} eligible found</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 space-y-4">

        {/* ── BORROWER IDENTIFICATION BANNER ───────────────────────────── */}
        <BorrowerBanner borrower={borrower} form={form} />

        {/* ── FORM CARD ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">

          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              Loan Scenario
            </h2>
            {ltv && (
              <span className="text-xs text-slate-400">
                Computed LTV: <strong className={
                  parseFloat(ltv) > 95 ? 'text-red-600' :
                  parseFloat(ltv) > 80 ? 'text-amber-600' : 'text-green-600'
                }>{ltv}%</strong>
              </span>
            )}
          </div>

          <div className="p-6 space-y-6">

            {/* Program & Transaction */}
            <div>
              <SecLabel>Program &amp; Transaction</SecLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Loan Type">
                  <Sel value={form.loanType} onChange={e => set('loanType', e.target.value)}>
                    {LOAN_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                </Field>
                <Field label="Transaction Type">
                  <TxToggle value={form.transactionType} onChange={v => set('transactionType', v)} />
                </Field>
                <Field label="Intent" tag="optional">
                  <Sel value={form.intent} onChange={e => set('intent', e.target.value)}>
                    {INTENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                </Field>
              </div>
            </div>

            <Hr />

            {/* Loan Details */}
            <div>
              <SecLabel>Loan Details</SecLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Loan Amount">
                  <Input type="text" inputMode="numeric" placeholder="450,000"
                    value={form.loanAmount ? fmt(form.loanAmount) : ''}
                    onChange={e => setCur('loanAmount', e.target.value)} />
                </Field>
                <Field label="Property Value">
                  <Input type="text" inputMode="numeric" placeholder="562,500"
                    value={form.propertyValue ? fmt(form.propertyValue) : ''}
                    onChange={e => setCur('propertyValue', e.target.value)} />
                </Field>
                <Field label="Credit Score">
                  <Input type="number" min="300" max="850" placeholder="500–850"
                    value={form.creditScore} onChange={e => set('creditScore', e.target.value)} />
                </Field>
                <Field label="State">
                  <Sel value={form.state} onChange={e => set('state', e.target.value)}>
                    <option value="">Select…</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Sel>
                </Field>
              </div>
            </div>

            <Hr />

            {/* Property */}
            <div>
              <SecLabel>Property</SecLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Property Type">
                  <Sel value={form.propertyType} onChange={e => set('propertyType', e.target.value)}>
                    {PROPERTY_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                </Field>
                <Field label="Occupancy">
                  <Sel value={form.occupancy} onChange={e => set('occupancy', e.target.value)}>
                    <option value="Primary">Primary Residence</option>
                    <option value="SecondHome">Second Home</option>
                    <option value="Investment">Investment Property</option>
                  </Sel>
                </Field>
                <Field label="Self-Employed">
                  <div className="pt-1">
                    <Toggle value={form.selfEmployed} onChange={v => set('selfEmployed', v)}
                      label={form.selfEmployed ? 'Yes — self-employed' : 'No — W2 / salaried'} />
                  </div>
                </Field>
              </div>
            </div>

            <Hr />

            {/* Income Documentation */}
            <div>
              <SecLabel>
                Income Documentation
                {isNonQM && <span className="ml-2 normal-case text-amber-600">· Non-QM Path</span>}
              </SecLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Documentation Type">
                  <Sel value={form.incomeDocType} onChange={e => set('incomeDocType', e.target.value)}>
                    {INCOME_DOC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                </Field>
                {!isNonQM && (
                  <>
                    <Field label="Monthly Income (Gross)">
                      <Input type="text" inputMode="numeric" placeholder="8,500"
                        value={form.monthlyIncome ? fmt(form.monthlyIncome) : ''}
                        onChange={e => setCur('monthlyIncome', e.target.value)} />
                    </Field>
                    <Field label="Monthly Debts (PITIA + all)">
                      <Input type="text" inputMode="numeric" placeholder="3,200"
                        value={form.monthlyDebts ? fmt(form.monthlyDebts) : ''}
                        onChange={e => setCur('monthlyDebts', e.target.value)} />
                    </Field>
                  </>
                )}
                {isDSCR && (
                  <>
                    <Field label="Gross Rental Income / Month" tag="auto-calc">
                      <Input type="text" inputMode="numeric" placeholder="2,800"
                        value={form.grossRentalIncome ? fmt(form.grossRentalIncome) : ''}
                        onChange={e => setCur('grossRentalIncome', e.target.value)} />
                    </Field>
                    <Field label="DSCR Ratio" tag="optional">
                      <Input type="number" step="0.01" min="0" placeholder="1.15"
                        value={form.dscr} onChange={e => set('dscr', e.target.value)} />
                    </Field>
                  </>
                )}
                {isAsset && (
                  <Field label="Total Qualifying Assets" tag="asset depletion">
                    <Input type="text" inputMode="numeric" placeholder="1,200,000"
                      value={form.totalAssets ? fmt(form.totalAssets) : ''}
                      onChange={e => setCur('totalAssets', e.target.value)} />
                  </Field>
                )}
                <Field label="Post-Close Reserves (months)">
                  <Input type="number" min="0" placeholder="3"
                    value={form.reservesMonths} onChange={e => set('reservesMonths', e.target.value)} />
                </Field>
              </div>
            </div>

            <Hr />

            {/* Credit & VA */}
            <div>
              <SecLabel>Credit &amp; VA Details</SecLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Credit Event">
                  <Sel value={form.creditEvent} onChange={e => set('creditEvent', e.target.value)}>
                    {CREDIT_EVENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                </Field>
                {hasCE && (
                  <Field label="Months Since Discharge / Close">
                    <Input type="number" min="0" placeholder="18"
                      value={form.creditEventMonths} onChange={e => set('creditEventMonths', e.target.value)} />
                  </Field>
                )}
                {isVA && (
                  <Field label="VA Entitlement" tag="VA">
                    <Sel value={form.vaEntitlement} onChange={e => set('vaEntitlement', e.target.value)}>
                      <option value="Full">Full Entitlement</option>
                      <option value="Reduced">Reduced Entitlement</option>
                      <option value="None">None / Not Applicable</option>
                    </Sel>
                  </Field>
                )}
              </div>
            </div>

          </div>

          {/* Form footer */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100">
            <button onClick={handleRun} disabled={loading} type="button"
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                loading
                  ? 'bg-orange-100 text-orange-400 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm hover:shadow-md'
              }`}>
              {loading
                ? <><span className="w-3.5 h-3.5 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />Matching…</>
                : '🔍 Run Lender Match'
              }
            </button>
            <button onClick={handleClear} type="button"
              className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              Clear
            </button>
            <span className="ml-auto text-xs text-slate-300 font-mono">⌘↵ to run</span>
          </div>
        </div>

        {/* ── ERROR ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <span className="flex-shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
            <p className="text-xs font-mono text-slate-400 tracking-widest uppercase">
              Evaluating Lenders · 7-Step Pipeline
            </p>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────────── */}
        {results && !loading && (
          <div ref={resultsRef} className="space-y-5">

            {/* Results header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Match Results</h2>
                <p className="text-xs text-slate-400 mt-1 font-mono">{results.scenarioSummary}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <ConfChip confidence={results.confidence} />
                <OverlayChip risk={results.overlayRisk} />
              </div>
            </div>

            {/* Stat chips */}
            <div className="flex gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-500 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                {results.agencySection?.totalEligible ?? 0} Agency eligible
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-500 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                {results.nonQMSection?.totalEligible ?? 0} Alternative Path eligible
              </div>
              {results.hasPlaceholderResults && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-500 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-300 flex-shrink-0" />
                  Includes placeholder profiles
                </div>
              )}
            </div>

            {/* ── Next Step Intelligence™ ── */}
            {primarySuggestion && (
              <NextStepCard
                suggestion={primarySuggestion}
                secondarySuggestions={secondarySuggestions}
                onFollow={logFollow}
                onOverride={logOverride}
                loanPurpose={loanPurpose}
                scenarioId={scenarioIdParam}
              />
            )}

            {/* ── AGENCY PATH ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" style={{ boxShadow: '0 0 6px #3b82f660' }} />
                <span className="text-sm font-bold text-slate-700">Agency Path</span>
                <span className="text-xs text-slate-400">Conventional · FHA · VA</span>
                <span className="ml-auto text-xs text-slate-400 font-mono">
                  {results.agencySection?.totalEligible ?? 0} / {(results.agencySection?.eligible?.length ?? 0) + (results.agencySection?.ineligible?.length ?? 0)} eligible
                </span>
              </div>

              {results.agencySection?.noMatch ? (
                <div className="flex flex-col items-center py-12 gap-2 text-center">
                  <span className="text-4xl">🚫</span>
                  <p className="text-sm font-semibold text-slate-500 mt-1">No Agency Lenders Matched</p>
                  <p className="text-xs text-slate-400 max-w-sm">{results.agencySection.noMatchMessage}</p>
                </div>
              ) : (
                (results.agencySection?.eligible || []).map((r, i) => (
                  <div key={`ag-${r.lenderId}-${i}`}>
                    <LenderScorecardCard result={r} onSelectLender={handleSelectLender}
                      isSelected={selectedLender === r.lenderId} style={{ animationDelay: `${i*40}ms` }} />
                    <AePanel lenderName={r.lenderName} getAeInfo={getAeInfo} />
                  </div>
                ))
              )}

              {(results.agencySection?.ineligible?.length ?? 0) > 0 && (
                <>
                  <button onClick={() => setShowIneligible(s => ({ ...s, agency: !s.agency }))}
                    className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-slate-400 hover:text-slate-600 border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <span>{showIneligible.agency ? '▲' : '▼'}</span>
                    <span>{results.agencySection.ineligible.length} ineligible lender{results.agencySection.ineligible.length !== 1 ? 's' : ''} — click to {showIneligible.agency ? 'hide' : 'see why'}</span>
                  </button>
                  {showIneligible.agency && (results.agencySection?.ineligible || []).map((r, i) => (
                    <IneligibleLenderRow key={`inelig-ag-${r.lenderId}-${i}`} result={r} />
                  ))}
                </>
              )}
            </div>

            {/* ── ALTERNATIVE PATH ────────────────────────────────────── */}
            <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${results.nonQMSection?.isHero ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className={`flex items-center gap-3 px-5 py-3.5 border-b ${results.nonQMSection?.isHero ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0"
                  style={{ boxShadow: results.nonQMSection?.isHero ? '0 0 10px #f59e0b80' : 'none' }} />
                <span className="text-sm font-bold text-slate-700">Alternative Path</span>
                <span className="text-xs text-slate-400">Non-QM · Bank Statement · DSCR · Asset Depletion</span>
                {results.nonQMSection?.isHero && (
                  <span className="text-xs font-bold bg-amber-500 text-white px-2.5 py-0.5 rounded-full ml-1">PRIMARY PATH</span>
                )}
                <span className="ml-auto text-xs text-slate-400 font-mono">
                  {results.nonQMSection?.totalEligible ?? 0} / {(results.nonQMSection?.eligible?.length ?? 0) + (results.nonQMSection?.ineligible?.length ?? 0)} eligible
                </span>
              </div>

              {results.nonQMSection?.hasPlaceholders && <PlaceholderBanner />}

              {results.nonQMSection?.noMatch ? (
                <div className="flex flex-col items-center py-12 gap-2 text-center">
                  <span className="text-4xl">{results.nonQMSection?.totalIneligible > 0 ? '🔄' : '📋'}</span>
                  <p className="text-sm font-semibold text-slate-500 mt-1">No Alternative Path Results</p>
                  <p className="text-xs text-slate-400 max-w-sm">{results.nonQMSection.noMatchMessage}</p>
                </div>
              ) : (
                (results.nonQMSection?.eligible || []).map((r, i) => (
                  <div key={`alt-${r.lenderId}-${i}`}>
                    <AlternativeLenderCard result={r} onSelectLender={handleSelectLender}
                      isSelected={selectedLender === r.lenderId} style={{ animationDelay: `${i*40}ms` }} />
                    <AePanel lenderName={r.lenderName} getAeInfo={getAeInfo} />
                  </div>
                ))
              )}

              {(results.nonQMSection?.ineligible?.length ?? 0) > 0 && (
                <>
                  <button onClick={() => setShowIneligible(s => ({ ...s, nonqm: !s.nonqm }))}
                    className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-slate-400 hover:text-slate-600 border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <span>{showIneligible.nonqm ? '▲' : '▼'}</span>
                    <span>{results.nonQMSection.ineligible.length} ineligible profile{results.nonQMSection.ineligible.length !== 1 ? 's' : ''} — click to {showIneligible.nonqm ? 'hide' : 'see why'}</span>
                  </button>
                  {showIneligible.nonqm && (results.nonQMSection?.ineligible || []).map((r, i) => (
                    <IneligibleLenderRow key={`inelig-alt-${r.lenderId}-${i}`} result={r} />
                  ))}
                </>
              )}
            </div>

          </div>
        )}

      </div>

      {/* ── DECISION RECORD MODAL ─────────────────────────────────────────── */}
      {decisionModal.open && (
        <DecisionRecordModal
          record={decisionModal.record}
          result={decisionModal.result}
          saved={decisionModal.saved}
          saving={savingRecord}
          onSave={handleSaveDecisionRecord}
          onClose={() => setDecisionModal({ open: false, record: null })}
        />
      )}

    </div>
  );
}
