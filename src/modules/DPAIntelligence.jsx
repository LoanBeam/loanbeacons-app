import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase/config';
import { DPA_PROGRAMS } from '../data/dpa/dpaData';
import { evaluateAllPrograms, getFreshnessLabel, getConfidenceLabel } from '../engines/dpa/dpaStackOptimizer';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import AEShareForm from '../components/lenderMatch/AEShareForm';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const APPROVAL_STATES = { APPROVED: 'approved', REQUESTED: 'requested', UNKNOWN: 'unknown' };

const STATUS_CONFIG = {
  PASS:        { bg: 'bg-emerald-50',  border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', label: 'PASS'        },
  CONDITIONAL: { bg: 'bg-amber-50',    border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500',   label: 'CONDITIONAL' },
  FAIL:        { bg: 'bg-red-50',      border: 'border-red-200',     badge: 'bg-red-100 text-red-700',         dot: 'bg-red-400',     label: 'INELIGIBLE'  },
};

const TYPE_LABELS = {
  grant:       { label: 'Grant',       color: 'bg-purple-100 text-purple-800' },
  forgivable:  { label: 'Forgivable',  color: 'bg-blue-100 text-blue-800'     },
  second_lien: { label: '2nd Lien',    color: 'bg-slate-100 text-slate-700'   },
  repayable:   { label: 'Repayable',   color: 'bg-orange-100 text-orange-800' },
};

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function DPAIntelligence() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = getAuth();

  const scenarioId = searchParams.get('scenarioId') || '';
  const scenario = useMemo(() => ({
    scenarioId,
    firstName:      searchParams.get('firstName')      || '',
    lastName:       searchParams.get('lastName')        || '',
    streetAddress:  searchParams.get('streetAddress')  || '',
    city:           searchParams.get('city')            || '',
    state:          searchParams.get('state')           || 'GA',
    zipCode:        searchParams.get('zipCode')         || '',
    county:         searchParams.get('county')          || '',
    loanType:       searchParams.get('loanType')        || 'FHA',
    purchasePrice:  parseFloat(searchParams.get('purchasePrice'))  || 0,
    loanAmount:     parseFloat(searchParams.get('loanAmount'))     || 0,
    creditScore:    parseInt(searchParams.get('creditScore'))      || 0,
    annualIncome:   parseFloat(searchParams.get('annualIncome'))   || 0,
    householdSize:  parseInt(searchParams.get('householdSize'))    || 1,
    firstTimeBuyer: searchParams.get('firstTimeBuyer') === 'true',
    backendDTI:     (() => { const v = parseFloat(searchParams.get('backendDTI')) || 0; return v > 1 ? v / 100 : v; })(),
    occupancy:      searchParams.get('occupancy')       || 'primary',
    lenderId:       searchParams.get('lenderId')        || '',
    lenderName:     searchParams.get('lenderName')      || '',
  }), [searchParams]);

  const [firestoreLenderId, setFirestoreLenderId]     = useState('');
  const [firestoreLenderName, setFirestoreLenderName] = useState('');

  useEffect(() => {
    if (!scenarioId || scenario.lenderId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scenarios', scenarioId));
        if (snap.exists()) {
          const d = snap.data();
          if (d.lenderId)   setFirestoreLenderId(d.lenderId);
          if (d.lenderName) setFirestoreLenderName(d.lenderName);
        }
      } catch (e) { console.error('DPA lender fallback load:', e); }
    })();
  }, [scenarioId, scenario.lenderId]);

  const effectiveLenderId   = scenario.lenderId   || firestoreLenderId;
  const effectiveLenderName = scenario.lenderName || firestoreLenderName;

  const [brokerOnly, setBrokerOnly]                   = useState(true);
  const [fthbOverride, setFthbOverride]               = useState(null);
  const [hasRun, setHasRun]                           = useState(false);
  const [isRunning, setIsRunning]                     = useState(false);
  const [results, setResults]                         = useState([]);
  const [selectedProgram, setSelectedProgram]         = useState(null);
  const [approvalMap, setApprovalMap]                 = useState({});
  const [brokerageApproved, setBrokerageApproved]     = useState(false);
  const [brokerageLenderName, setBrokerageLenderName] = useState('');
  const [haikusLoading, setHaikusLoading]             = useState(false);
  const [haikus, setHaikus]                           = useState({});
  const [showFailDetails, setShowFailDetails]         = useState({});
  const [aeShareModal, setAeShareModal]               = useState(null);
  const [aeSending, setAeSending]                     = useState(false);
  const [aeSent, setAeSent]                           = useState(false);

  const { reportFindings } = useDecisionRecord(scenarioId);

  useEffect(() => {
    if (!effectiveLenderId || !auth.currentUser) return;
    const q = query(
      collection(db, 'dpa_lender_approvals'),
      where('lo_id',     '==', auth.currentUser.uid),
      where('lender_id', '==', effectiveLenderId)
    );
    getDocs(q).then(snap => {
      const map = {};
      snap.forEach(d => { map[d.data().program_id] = d.data().approval_state; });
      setApprovalMap(prev => ({ ...prev, ...map }));
    }).catch(e => console.error('per-LO approval load:', e));
  }, [effectiveLenderId, auth.currentUser]);

  const effectiveFthb = fthbOverride ?? scenario.firstTimeBuyer;

  const handleRunSearch = async () => {
    setIsRunning(true);
    setHasRun(false);
    setHaikus({});
    setSelectedProgram(null);

    let newApprovalMap = {};
    try {
      const allSnap = await getDocs(collection(db, 'lenderProfiles'));
      const approvedDoc = allSnap.docs.find(d => d.data().brokerage_approved === true);
      if (approvedDoc) {
        newApprovalMap = { __brokerage_approved__: true, __lender_name__: approvedDoc.data().name };
      }
    } catch (e) {
      console.error('[DPA] lenderProfiles read failed:', e);
    }

    await new Promise(r => setTimeout(r, 800));

    const pool = brokerOnly ? DPA_PROGRAMS.filter(p => p.broker_eligible) : DPA_PROGRAMS;
    const effectiveScenario = { ...scenario, firstTimeBuyer: effectiveFthb };
    const evaluated = evaluateAllPrograms(pool, effectiveScenario);

    if (newApprovalMap.__brokerage_approved__) {
      setBrokerageApproved(true);
      setBrokerageLenderName(newApprovalMap.__lender_name__ || '');
    }
    setApprovalMap(newApprovalMap);
    setResults(evaluated);
    setHasRun(true);
    setIsRunning(false);

    const top3 = evaluated.filter(r => r.evaluation.status === 'PASS').slice(0, 3);
    if (top3.length > 0 && scenarioId) {
      reportFindings({
        moduleKey: 'DPA_INTELLIGENCE',
        moduleVersion: '2.0.0',
        findings: top3.map(r => ({
          program_id:   r.program.id,
          program_name: r.program.program_name,
          status:       r.evaluation.status,
          dpa_amount:   r.evaluation.dpa_amount_calculated,
          warnings:     r.evaluation.warnings,
        })),
        inputs: { brokerOnly, fthbOverride, scenario: effectiveScenario },
      });
    }

    const passPrograms = evaluated.filter(r => r.evaluation.status !== 'FAIL').slice(0, 6);
    if (passPrograms.length > 0) generateHaikus(passPrograms);
  };

  const generateHaikus = async (programs) => {
    setHaikusLoading(true);
    const results = {};
    await Promise.all(programs.map(async ({ program, evaluation }) => {
      try {
        const prompt = `You are a mortgage loan officer assistant. Write exactly ONE sentence (under 25 words) summarizing this DPA program result for the loan officer. Be specific about amount, type, and the key eligibility reason. No preamble.

Program: ${program.program_name}
Type: ${program.program_type}
Amount: ${evaluation.dpa_amount_calculated ? '$' + evaluation.dpa_amount_calculated.toLocaleString() : (program.assistance_pct ? (program.assistance_pct * 100) + '% of purchase price' : 'See program')}
Status: ${evaluation.status}
Key pass reason: ${evaluation.reasons?.[0] || 'Eligible'}
${evaluation.warnings?.length ? 'Warning: ' + evaluation.warnings[0] : ''}`;

        const res = await fetch('/anthropic-api/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 80,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await res.json();
        results[program.id] = data.content?.[0]?.text?.trim() || '';
      } catch {
        results[program.id] = '';
      }
    }));
    setHaikus(results);
    setHaikusLoading(false);
  };

  const handleOpenAeModal = useCallback((program, evaluation) => {
    setAeSent(false);
    setAeSending(false);
    setAeShareModal({ program, evaluation });
  }, []);

  const handleCloseAeModal = useCallback(() => {
    setAeShareModal(null);
    setAeSent(false);
    setAeSending(false);
  }, []);

  const handleAeSend = useCallback(async (emails, shareType, message) => {
    if (!aeShareModal || !auth.currentUser) return;
    const { program, evaluation } = aeShareModal;
    setAeSending(true);
    try {
      const functions = getFunctions();
      const createShare = httpsCallable(functions, 'createScenarioShare');
      await createShare({
        scenarioId,
        recipientEmails: emails,
        shareType,
        message,
        dpaContext: {
          programName:   program.program_name,
          programType:   program.program_type,
          dpaAmount:     evaluation.dpa_amount_calculated
                           ? `$${evaluation.dpa_amount_calculated.toLocaleString()}`
                           : program.assistance_pct
                             ? `${(program.assistance_pct * 100).toFixed(1)}% of purchase price`
                             : null,
          ltvLimit:      evaluation.cltv_details?.program_max
                           ? `${(evaluation.cltv_details.program_max * 100).toFixed(1)}%`
                           : null,
          incomeLimit:   program.income_limits ?? null,
          layeringRules: program.stacking_rules?.subordinate_financing_rules ?? null,
          adminAgency:   program.admin_agency ?? null,
          programStatus: evaluation.status,
        },
      });
      if (scenario.lenderId) {
        await addDoc(collection(db, 'dpa_lender_approvals'), {
          lo_id:          auth.currentUser.uid,
          lender_id:      scenario.lenderId,
          lender_name:    scenario.lenderName,
          program_id:     program.id,
          program_name:   program.program_name,
          approval_state: APPROVAL_STATES.REQUESTED,
          requested_at:   serverTimestamp(),
          ae_outreach_id: null,
          last_updated:   serverTimestamp(),
        });
        setApprovalMap(prev => ({ ...prev, [program.id]: APPROVAL_STATES.REQUESTED }));
      }
      setAeSent(true);
      setTimeout(() => handleCloseAeModal(), 2000);
    } catch (err) {
      console.error('AE send failed:', err);
    } finally {
      setAeSending(false);
    }
  }, [aeShareModal, auth.currentUser, scenarioId, scenario.lenderId, scenario.lenderName, handleCloseAeModal]);

  const buildDpaContext = (program, evaluation) => ({
    programName:   program.program_name,
    programType:   TYPE_LABELS[program.program_type]?.label || program.program_type,
    adminAgency:   program.admin_agency,
    dpaAmount:     evaluation.dpa_amount_calculated
                     ? `$${evaluation.dpa_amount_calculated.toLocaleString()}`
                     : program.assistance_pct
                       ? `${(program.assistance_pct * 100).toFixed(1)}% of purchase price`
                       : null,
    ltvLimit:      evaluation.cltv_details?.program_max
                     ? `${(evaluation.cltv_details.program_max * 100).toFixed(1)}%`
                     : null,
    incomeLimit:   program.income_limits ?? null,
    layeringRules: program.stacking_rules?.subordinate_financing_rules ?? null,
    programStatus: evaluation.status,
  });

  const passCount = results.filter(r => r.evaluation.status === 'PASS').length;
  const condCount = results.filter(r => r.evaluation.status === 'CONDITIONAL').length;
  const failCount = results.filter(r => r.evaluation.status === 'FAIL').length;

  const borrowerName = [scenario.firstName, scenario.lastName].filter(Boolean).join(' ') || 'No borrower selected';
  const addressLine  = [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-gray-50">

      {scenarioId && <DecisionRecordBanner scenarioId={scenarioId} moduleKey="DPA_INTELLIGENCE" />}
      <ScenarioHeader moduleTitle="DPA Intelligence™" moduleNumber="07" scenarioId={scenarioId} />

      {/* Borrower Info Banner */}
      <div className="bg-[#1B3A6B] px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest mb-1">
            Borrower Scenario — DPA Intelligence™
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-base">{borrowerName}</span>
            {addressLine && <span className="text-blue-200 text-sm">{addressLine}</span>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-100">
              {scenario.creditScore > 0 && <span>FICO <strong className="text-white">{scenario.creditScore}</strong></span>}
              {scenario.loanType     && <span>Loan <strong className="text-white">{scenario.loanType}</strong></span>}
              {scenario.purchasePrice > 0 && <span>Price <strong className="text-white">${scenario.purchasePrice.toLocaleString()}</strong></span>}
              {scenario.backendDTI > 0 && <span>DTI <strong className="text-white">{scenario.backendDTI.toFixed(1)}%</strong></span>}
              {scenario.householdSize > 0 && <span>HH <strong className="text-white">{scenario.householdSize}</strong></span>}
              {scenario.annualIncome > 0 && <span>Income <strong className="text-white">${scenario.annualIncome.toLocaleString()}</strong></span>}
              <span className={effectiveFthb ? 'text-emerald-300 font-semibold' : 'text-blue-200'}>
                {effectiveFthb ? 'FTHB ✓' : 'Not FTHB'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* Search Controls */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

            <div className="flex flex-col gap-3">
              {/* Broker Only Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBrokerOnly(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${brokerOnly ? 'bg-[#1B3A6B]' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${brokerOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Broker Programs Only</p>
                  <p className="text-xs text-gray-500">
                    {brokerOnly ? 'Showing broker-eligible programs — toggle off to see all' : 'Showing all programs including retail-only'}
                  </p>
                </div>
              </div>

              {/* FTHB Override Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFthbOverride(v => v === null ? true : v === true ? false : null)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${effectiveFthb ? 'bg-[#1B3A6B]' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${effectiveFthb ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-800">First-Time Homebuyer</p>
                  <p className="text-xs text-gray-500">
                    {fthbOverride === null
                      ? `FTHB ${scenario.firstTimeBuyer ? 'detected from scenario' : 'not detected'}`
                      : fthbOverride
                        ? 'FTHB programs included · Manual override'
                        : 'FTHB programs excluded · Manual override'}
                  </p>
                </div>
              </div>
            </div>

            {/* Scenario Quick Summary */}
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                scenario.state    && { label: 'State',  value: scenario.state },
                scenario.county   && { label: 'County', value: scenario.county },
                scenario.loanType && { label: 'Loan',   value: scenario.loanType },
                scenario.creditScore > 0 && { label: 'FICO', value: scenario.creditScore },
              ].filter(Boolean).map(({ label, value }) => (
                <span key={label} className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                  <span className="text-gray-400">{label}: </span>{value}
                </span>
              ))}
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunSearch}
              disabled={isRunning}
              className="bg-[#1B3A6B] hover:bg-blue-800 disabled:bg-gray-300 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {isRunning ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running Stack Optimizer™…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Run DPA Intelligence™
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Summary Bar */}
        {hasRun && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Eligible',    count: passCount, color: 'emerald' },
              { label: 'Conditional', count: condCount, color: 'amber'   },
              { label: 'Ineligible',  count: failCount, color: 'red'     },
            ].map(({ label, count, color }) => (
              <div key={label} className={`bg-white rounded-xl border border-${color}-200 p-4 text-center shadow-sm`}>
                <p className={`text-2xl font-bold text-${color}-600`}>{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label} Programs</p>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!hasRun && !isRunning && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#1B3A6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Ready to Search DPA Programs</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              Run DPA Intelligence™ to evaluate {brokerOnly ? 'broker-eligible' : 'all'} programs against this borrower's profile using the Stack Optimizer™.
            </p>
          </div>
        )}

        {/* Results List */}
        {hasRun && (
          <div className="space-y-3">
            {results.map(({ program, evaluation }) => (
              <ProgramCard
                key={program.id}
                program={program}
                evaluation={evaluation}
                haiku={haikus[program.id]}
                haikusLoading={haikusLoading}
                approvalState={brokerageApproved ? APPROVAL_STATES.APPROVED : (approvalMap[program.id] || APPROVAL_STATES.UNKNOWN)}
                lenderName={brokerageLenderName || effectiveLenderName}
                lenderId={effectiveLenderId || 'brokerage'}
                onSelect={() => setSelectedProgram({ program, evaluation })}
                onRequestApproval={() => handleOpenAeModal(program, evaluation)}
                showFailDetail={showFailDetails[program.id]}
                onToggleFailDetail={() => setShowFailDetails(prev => ({ ...prev, [program.id]: !prev[program.id] }))}
                brokerOnly={brokerOnly}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedProgram && (
        <ProgramDrawer
          program={selectedProgram.program}
          evaluation={selectedProgram.evaluation}
          haiku={haikus[selectedProgram.program.id]}
          approvalState={brokerageApproved ? APPROVAL_STATES.APPROVED : (approvalMap[selectedProgram.program.id] || APPROVAL_STATES.UNKNOWN)}
          lenderName={brokerageLenderName || effectiveLenderName}
          onRequestApproval={() => handleOpenAeModal(selectedProgram.program, selectedProgram.evaluation)}
          onClose={() => setSelectedProgram(null)}
        />
      )}

      {/* AE Share Modal */}
      {aeShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseAeModal} />
          <div className="relative w-full max-w-lg mx-4 bg-[#0d1117] rounded-2xl shadow-2xl overflow-hidden border border-[#21262d]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div>
                <p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-widest mb-0.5">DPA Approval Request</p>
                <h2 className="text-white font-bold text-sm leading-snug">{aeShareModal.program.program_name}</h2>
              </div>
              <button onClick={handleCloseAeModal} className="text-[#8b949e] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AEShareForm
              onSend={handleAeSend}
              sending={aeSending}
              sent={aeSent}
              dpaContext={buildDpaContext(aeShareModal.program, aeShareModal.evaluation)}
            />
          </div>
        </div>
      )}

      {/* Canonical Sequence Bar */}
      <CanonicalSequenceBar scenarioId={scenarioId} />
    </div>
  );
}

// ── PROGRAM CARD ─────────────────────────────────────────────────────────────
function ProgramCard({ program, evaluation, haiku, haikusLoading, approvalState, lenderName, lenderId, onSelect, onRequestApproval, showFailDetail, onToggleFailDetail, brokerOnly }) {
  const cfg = STATUS_CONFIG[evaluation.status];
  const typeCfg = TYPE_LABELS[program.program_type] || { label: program.program_type, color: 'bg-gray-100 text-gray-700' };
  const freshness = getFreshnessLabel(program.last_verified_date);
  const isFail = evaluation.status === 'FAIL';

  const dpaDisplay = evaluation.dpa_amount_calculated
    ? `$${evaluation.dpa_amount_calculated.toLocaleString()}`
    : program.assistance_pct
      ? `${(program.assistance_pct * 100).toFixed(1)}% of price`
      : '—';

  return (
    <div className={`bg-white rounded-xl border ${isFail ? 'border-gray-200 opacity-75' : cfg.border} shadow-sm overflow-hidden`}>
      <div className={`flex items-start justify-between gap-3 p-4 ${isFail ? '' : cfg.bg}`}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-gray-900">{program.program_name}</h3>
              {!program.broker_eligible && brokerOnly === false && (
                <span className="text-[10px] bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded">RETAIL ONLY</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
              <span className="text-[11px] text-gray-500">{program.admin_agency}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-gray-900">{dpaDisplay}</p>
          <p className="text-[11px] text-gray-400">DPA Amount</p>
        </div>
      </div>

      {!isFail && (
        <div className="px-4 py-2 border-t border-gray-100">
          {haikusLoading && !haiku ? (
            <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
          ) : haiku ? (
            <p className="text-xs text-gray-600 italic">{haiku}</p>
          ) : null}
        </div>
      )}

      {!isFail && evaluation.cltv_details && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600">
          <span>CLTV: <strong className="text-gray-800">{(evaluation.cltv_details.cltv_with_dpa * 100).toFixed(1)}%</strong></span>
          <span>Base LTV: <strong className="text-gray-800">{(evaluation.cltv_details.base_ltv * 100).toFixed(1)}%</strong></span>
          <span>DPA: <strong className="text-gray-800">${(evaluation.cltv_details.dpa_amount || 0).toLocaleString()}</strong></span>
          <span className={`font-medium ${freshness.color === 'green' ? 'text-emerald-600' : freshness.color === 'amber' ? 'text-amber-600' : 'text-red-500'}`}>
            {freshness.urgent ? '⚠️ ' : '✓ '}{freshness.label}
          </span>
        </div>
      )}

      {evaluation.warnings?.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          {evaluation.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠️ {w}</p>
          ))}
        </div>
      )}

      {isFail && (
        <div className="px-4 py-2 border-t border-gray-100">
          <button onClick={onToggleFailDetail} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <svg className={`w-3 h-3 transition-transform ${showFailDetail ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {showFailDetail ? 'Hide' : 'Show'} ineligibility reason
          </button>
          {showFailDetail && (
            <div className="mt-1.5 space-y-1">
              {evaluation.fail_reasons?.map((r, i) => (
                <p key={i} className="text-xs text-red-600">✗ {r}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <LenderApprovalBadge approvalState={approvalState} lenderName={lenderName} lenderId={lenderId} />
          {!isFail && lenderId && approvalState === 'unknown' && (
            <button onClick={onRequestApproval}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B3A6B] hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full px-2.5 py-1 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Request Approval
            </button>
          )}
        </div>
        {!isFail && (
          <button onClick={onSelect} className="text-xs text-[#1B3A6B] hover:text-blue-800 font-semibold flex items-center gap-1">
            View Full Details
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── LENDER APPROVAL BADGE ─────────────────────────────────────────────────────
function LenderApprovalBadge({ approvalState, lenderName, lenderId }) {
  if (!lenderId) {
    return (
      <span className="text-[11px] text-gray-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
        No lender selected
      </span>
    );
  }
  const name = lenderName || 'your lender';
  if (approvalState === APPROVAL_STATES.APPROVED) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
        </svg>
        Approved — {name}
      </span>
    );
  }
  if (approvalState === APPROVAL_STATES.REQUESTED) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
        <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Approval Requested — {name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
      Not Yet Approved — {name}
    </span>
  );
}

// ── PROGRAM DETAIL DRAWER ─────────────────────────────────────────────────────
function ProgramDrawer({ program, evaluation, haiku, approvalState, lenderName, onRequestApproval, onClose }) {
  const cfg = STATUS_CONFIG[evaluation.status];
  const typeCfg = TYPE_LABELS[program.program_type] || { label: program.program_type, color: 'bg-gray-100 text-gray-700' };
  const freshness = getFreshnessLabel(program.last_verified_date);
  const confidence = getConfidenceLabel(program.confidence_score);

  const dpaDisplay = evaluation.dpa_amount_calculated
    ? `$${evaluation.dpa_amount_calculated.toLocaleString()}`
    : program.assistance_pct
      ? `${(program.assistance_pct * 100).toFixed(1)}% of purchase price`
      : 'See program details';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-[#1B3A6B] px-5 py-4 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
            </div>
            <h2 className="text-white font-bold text-base leading-snug">{program.program_name}</h2>
            <p className="text-blue-200 text-xs mt-0.5">{program.admin_agency}</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white mt-0.5 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {haiku && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">AI Summary</p>
              <p className="text-sm text-blue-900 italic">{haiku}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">DPA Amount</p>
              <p className="text-xl font-bold text-gray-900">{dpaDisplay}</p>
            </div>
            {evaluation.cltv_details && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">CLTV with DPA</p>
                <p className="text-xl font-bold text-gray-900">{(evaluation.cltv_details.cltv_with_dpa * 100).toFixed(1)}%</p>
                <p className="text-xs text-gray-400">Max: {(evaluation.cltv_details.program_max * 100).toFixed(1)}%</p>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Program Description</h4>
            <p className="text-sm text-gray-700 leading-relaxed">{program.description}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Contact & Resources</h4>
            <div className="space-y-1.5">
              {program.website_url && (
                <a href={program.website_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#1B3A6B] hover:text-blue-800 font-medium">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  Official Program Website ↗
                </a>
              )}
              {program.contact_phone && (
                <p className="text-sm text-gray-700">
                  <span className="text-gray-400">Phone: </span>
                  <a href={`tel:${program.contact_phone}`} className="text-[#1B3A6B] font-medium">{program.contact_phone}</a>
                </p>
              )}
              {program.contact_email && (
                <p className="text-sm text-gray-700">
                  <span className="text-gray-400">Email: </span>
                  <a href={`mailto:${program.contact_email}`} className="text-[#1B3A6B] font-medium">{program.contact_email}</a>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${freshness.color === 'green' ? 'bg-emerald-400' : freshness.color === 'amber' ? 'bg-amber-400' : 'bg-red-400'}`} />
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700">{freshness.label}</p>
              <p className="text-xs text-gray-400">Source: {program.source} · Confidence: {confidence.label}</p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Stack Optimizer™ — Eligibility Trace</h4>
            <div className="space-y-2">
              {evaluation.steps?.map(step => (
                <div key={step.step} className="flex gap-3 text-xs">
                  <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold
                    ${step.pass === true ? 'bg-emerald-100 text-emerald-700' : step.pass === false ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                    {step.pass === true ? '✓' : step.pass === false ? '✗' : '!'}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Step {step.step}: {step.name}</p>
                    <p className="text-gray-500">{step.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {evaluation.warnings?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700">Warnings</p>
              {evaluation.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">⚠️ {w}</p>
              ))}
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Lender Approval Status</h4>
            <div className="flex items-center gap-3 flex-wrap">
              <LenderApprovalBadge approvalState={approvalState} lenderName={lenderName} lenderId="mock" />
              {approvalState === APPROVAL_STATES.UNKNOWN && (
                <button onClick={onRequestApproval}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1B3A6B] hover:bg-blue-800 rounded-lg px-3 py-1.5 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Request Approval via AE
                </button>
              )}
            </div>
            {approvalState === APPROVAL_STATES.UNKNOWN && (
              <p className="text-xs text-gray-400 mt-1.5">Sends program details and scenario to your AE via the AE Share Service.</p>
            )}
          </div>

          {program.stacking_rules?.subordinate_financing_rules && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Stacking Rules</h4>
              <p className="text-xs text-gray-600">{program.stacking_rules.subordinate_financing_rules}</p>
              {program.stacking_rules.mi_impact_rules && (
                <p className="text-xs text-gray-500 mt-1">MI: {program.stacking_rules.mi_impact_rules}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
