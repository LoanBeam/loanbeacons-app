// src/components/ScenarioHeader.jsx
// LoanBeacons™ — Universal Module Header Component
// Supports both prop patterns:
//   NEW: scenario={obj} module={{ number, stage, name }}
//   OLD: moduleTitle="..." moduleNumber="07" scenarioId="..."

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AEShareForm from './lenderMatch/AEShareForm';

const STAGE_LABELS = {
  1: 'Stage 1 — Pre-Structure & Initial Analysis',
  2: 'Stage 2 — Lender Fit & Program Intelligence',
  3: 'Stage 3 — Final Structure Optimization',
  4: 'Stage 4 — Verification & Submit',
};

const PURPOSE_LABELS = {
  PURCHASE:            'Purchase',
  RATE_TERM_REFI:      'Rate/Term Refi',
  CASH_OUT:            'Cash-Out Refi',
  STREAMLINE:          'Streamline',
  FIX_FLIP:            'Fix & Flip',
  CONSTRUCTION:        'Construction',
  BRIDGE:              'Bridge',
  INVESTMENT_PURCHASE: 'Investment',
  COMMERCIAL:          'Commercial',
  Purchase:            'Purchase',
  REFINANCE:           'Refi',
  Refi:                'Refi',
};

const AE_BTN_CSS = `
  @keyframes lb-pulse-ring {
    0%   { transform: scale(1);    opacity: 0.55; }
    70%  { transform: scale(1.55); opacity: 0;    }
    100% { transform: scale(1.55); opacity: 0;    }
  }
  @keyframes lb-pulse-ring2 {
    0%   { transform: scale(1);    opacity: 0.35; }
    70%  { transform: scale(1.85); opacity: 0;    }
    100% { transform: scale(1.85); opacity: 0;    }
  }
  @keyframes lb-shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  .lb-ae-wrap  { position: relative; display: inline-flex; align-items: center; }
  .lb-ae-ring  { position: absolute; inset: 0; border-radius: 7px; background: #f97316; pointer-events: none; animation: lb-pulse-ring  2s ease-out        infinite; }
  .lb-ae-ring2 { position: absolute; inset: 0; border-radius: 7px; background: #f97316; pointer-events: none; animation: lb-pulse-ring2 2s ease-out 0.4s  infinite; }
  .lb-ae-btn {
    position: relative; z-index: 2;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: 7px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap;
    background-size: 200% auto;
    background-image: linear-gradient(90deg, #ea580c 0%, #f97316 40%, #fb923c 60%, #ea580c 100%);
    animation: lb-shimmer 3s linear infinite;
    transition: filter 0.15s;
  }
  .lb-ae-btn:hover { filter: brightness(1.1); }
`;

export default function ScenarioHeader({
  // ── NEW pattern ──────────────────────────────────────────────────────────
  scenario      = null,
  module        = null,
  badge         = null,
  qualifyingScore = null,
  children,
  // ── OLD pattern (URL-param modules) ──────────────────────────────────────
  moduleTitle   = '',
  moduleNumber  = '00',
  scenarioId    = '',
}) {
  const navigate = useNavigate();
  const auth     = getAuth();

  // ── Normalise to a single shape ──────────────────────────────────────────
  const isOldPattern = !scenario && (moduleTitle || scenarioId);

  const resolvedScenario = scenario || (isOldPattern ? { id: scenarioId } : null);
  const resolvedModule   = module   || { number: moduleNumber, stage: 2, name: moduleTitle || 'Module' };
  const resolvedId       = resolvedScenario?.id || scenarioId || '';

  // ── AE Share modal state ─────────────────────────────────────────────────
  const [aeOpen,    setAeOpen]    = useState(false);
  const [aeSending, setAeSending] = useState(false);
  const [aeSent,    setAeSent]    = useState(false);

  const handleOpenAe  = useCallback(() => { setAeSent(false); setAeOpen(true);  }, []);
  const handleCloseAe = useCallback(() => { setAeOpen(false); setAeSent(false); }, []);

  const handleAeSend = useCallback(async (emails, shareType, message) => {
    if (!resolvedId) return;
    setAeSending(true);
    try {
      const fns         = getFunctions();
      const createShare = httpsCallable(fns, 'createScenarioShare');
      const borrower    = scenario
        ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim()
        : '';
      await createShare({
        scenarioId:      resolvedId,
        recipientEmails: emails,
        shareType,
        message,
        moduleContext: {
          moduleName:      resolvedModule.name,
          moduleNumber:    resolvedModule.number,
          borrowerName:    borrower,
          loanType:        scenario?.loanType    || '',
          loanAmount:      scenario?.loanAmount  || 0,
          creditScore:     scenario?.creditScore || 0,
          propertyAddress: scenario
            ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode]
                .filter(Boolean).join(', ')
            : '',
        },
      });
      setAeSent(true);
      setTimeout(() => handleCloseAe(), 2000);
    } catch (err) {
      console.error('[ScenarioHeader] AE share failed:', err);
    } finally {
      setAeSending(false);
    }
  }, [auth.currentUser, resolvedId, resolvedModule, scenario, handleCloseAe]);

  // ── OLD pattern renders a minimal dark banner ────────────────────────────
  if (isOldPattern) {
    return (
      <div className="mb-4">
        <style>{AE_BTN_CSS}</style>
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">
              Module {resolvedModule.number}
            </span>
            <h1 className="text-lg font-bold">{resolvedModule.name}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">
              ● LIVE
            </span>
            {resolvedId && (
              <div className="lb-ae-wrap">
                <div className="lb-ae-ring" />
                <div className="lb-ae-ring2" />
                <button className="lb-ae-btn" onClick={handleOpenAe}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Share with AE
                </button>
              </div>
            )}
          </div>
        </div>

        {/* AE Modal */}
        {aeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseAe} />
            <div className="relative w-full max-w-lg mx-4 bg-[#0d1117] rounded-2xl shadow-2xl overflow-hidden border border-[#21262d]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
                <div>
                  <p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-widest mb-0.5">
                    Share with Account Executive
                  </p>
                  <h2 className="text-white font-bold text-sm">{resolvedModule.name}</h2>
                </div>
                <button onClick={handleCloseAe} className="text-[#8b949e] hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <AEShareForm onSend={handleAeSend} sending={aeSending} sent={aeSent}
                moduleContext={{ moduleName: resolvedModule.name, moduleNumber: resolvedModule.number }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── NEW pattern — full rich header ───────────────────────────────────────
  if (!scenario) return null;

  const borrowerName    = `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || 'Unknown Borrower';
  const coBorrowers     = (scenario.coBorrowers || []).filter(cb => cb.firstName || cb.lastName);
  const propertyAddress = [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode]
    .filter(Boolean).join(', ');
  const displayScore    = qualifyingScore || scenario.creditScore;
  const stageLabel      = typeof resolvedModule.stage === 'number' ? STAGE_LABELS[resolvedModule.stage] : resolvedModule.stage;
  const purposeLabel    = PURPOSE_LABELS[scenario.loanPurpose] || scenario.loanPurpose || '';
  const scenarioName    = scenario.scenarioName || '';

  const hasMismatch = scenarioName &&
    !scenarioName.toLowerCase().includes((scenario.firstName || '').toLowerCase()) &&
    !scenarioName.toLowerCase().includes((scenario.lastName  || '').toLowerCase()) &&
    scenario.firstName && scenario.lastName;

  return (
    <div className="mb-6">
      <style>{AE_BTN_CSS}</style>

      {hasMismatch && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl px-5 py-4 mb-3 flex items-start gap-3">
          <span className="text-red-500 text-xl shrink-0">⚠</span>
          <div>
            <p className="text-sm font-bold text-red-800">Borrower Name Mismatch Detected</p>
            <p className="text-sm text-red-700 mt-1">
              Scenario named <strong>"{scenarioName}"</strong> but borrower on file is <strong>{borrowerName}</strong>.
            </p>
            <button
              onClick={() => navigate(`/scenario-creator/${scenario.id}`)}
              className="mt-1.5 text-xs font-bold text-red-700 hover:text-red-900 underline"
            >
              → Fix in Scenario Creator
            </button>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5">

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">{stageLabel}</span>
              <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">
                Module {resolvedModule.number}
              </span>
            </div>
            <h1 className="text-2xl font-bold">{resolvedModule.name}</h1>
            {resolvedModule.subtitle && (
              <p className="text-indigo-300 text-sm mt-0.5">{resolvedModule.subtitle}</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">
                ● LIVE
              </span>
              <div className="lb-ae-wrap">
                <div className="lb-ae-ring" />
                <div className="lb-ae-ring2" />
                <button className="lb-ae-btn" onClick={handleOpenAe}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Share with AE
                </button>
              </div>
            </div>
            {badge && (
              <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${
                badge.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' :
                badge.color === 'red'     ? 'bg-red-500/20 text-red-300 border-red-400/30'             :
                badge.color === 'amber'   ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'       :
                'bg-blue-500/20 text-blue-300 border-blue-400/30'
              }`}>{badge.label}</span>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">Borrower(s)</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">{borrowerName}</span>
              <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">Primary</span>
              {displayScore && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
                  parseInt(displayScore) >= 740 ? 'bg-emerald-500/20 text-emerald-300' :
                  parseInt(displayScore) >= 680 ? 'bg-blue-500/20 text-blue-300'       :
                  parseInt(displayScore) >= 620 ? 'bg-amber-500/20 text-amber-300'     :
                  'bg-red-500/20 text-red-300'
                }`}>FICO {displayScore}</span>
              )}
            </div>
            {coBorrowers.map((cb, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-indigo-200">{`${cb.firstName || ''} ${cb.lastName || ''}`.trim()}</span>
                <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10">Co-Borrower {i + 1}</span>
                {cb.creditScore && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">FICO {cb.creditScore}</span>}
              </div>
            ))}
            {propertyAddress && <p className="text-xs text-indigo-300 mt-1">📍 {propertyAddress}</p>}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {scenario.loanType     && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.loanType}</span>}
              {purposeLabel          && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{purposeLabel}</span>}
              {scenario.loanAmount   && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">${Number(scenario.loanAmount).toLocaleString()}</span>}
              {scenario.propertyType && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.propertyType}</span>}
              {scenario.occupancy    && <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{scenario.occupancy}</span>}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">File Reference IDs</p>
            <div className="space-y-1.5">
              {scenario.loanBeaconsRef && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">LB Ref</span>
                  <span className="text-xs font-mono font-bold text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded">{scenario.loanBeaconsRef}</span>
                </div>
              )}
              {scenario.losLoanNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">LOS Loan #</span>
                  <span className="text-xs font-mono text-white/80 bg-white/10 px-2 py-0.5 rounded">{scenario.losLoanNumber}</span>
                </div>
              )}
              {scenario.ausCaseNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">AUS Case #</span>
                  <span className="text-xs font-mono text-purple-300 bg-purple-500/20 border border-purple-400/30 px-2 py-0.5 rounded">{scenario.ausCaseNumber}</span>
                </div>
              )}
              {!scenario.loanBeaconsRef && !scenario.losLoanNumber && !scenario.ausCaseNumber && (
                <p className="text-xs text-white/40 italic">No reference IDs on file — add in Scenario Creator</p>
              )}
              {scenarioName && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">Scenario</span>
                  <span className="text-xs text-white/70 truncate">{scenarioName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {children && <div className="border-t border-white/10 pt-4 mt-4">{children}</div>}
      </div>

      {/* AE Share Modal */}
      {aeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseAe} />
          <div className="relative w-full max-w-lg mx-4 bg-[#0d1117] rounded-2xl shadow-2xl overflow-hidden border border-[#21262d]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div>
                <p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-widest mb-0.5">Share with Account Executive</p>
                <h2 className="text-white font-bold text-sm">{resolvedModule.name} — {borrowerName}</h2>
              </div>
              <button onClick={handleCloseAe} className="text-[#8b949e] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AEShareForm
              onSend={handleAeSend}
              sending={aeSending}
              sent={aeSent}
              moduleContext={{
                moduleName:      resolvedModule.name,
                moduleNumber:    resolvedModule.number,
                borrowerName,
                loanType:        scenario.loanType    || '',
                loanAmount:      scenario.loanAmount  || 0,
                creditScore:     scenario.creditScore || 0,
                propertyAddress,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
