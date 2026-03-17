// src/components/ScenarioHeader.jsx
// LoanBeacons™ — Universal Module Header Component
// Used across all 27 modules for consistent borrower identity + file reference display

import { useNavigate } from 'react-router-dom';

/**
 * ScenarioHeader
 *
 * Props:
 *   scenario      — Firestore scenario object (full document)
 *   module        — { number: '02', stage: 'Stage 1 — Pre-Structure', name: 'Qualifying Intelligence™', color: 'indigo' }
 *   badge         — { label: '4 Programs Eligible', color: 'emerald' } | null
 *   qualifyingScore — override credit score to show (e.g. lowest middle score across borrowers)
 *   children      — optional additional header content
 */

const STAGE_LABELS = {
  1: 'Stage 1 — Pre-Structure & Initial Analysis',
  2: 'Stage 2 — Lender Fit & Program Intelligence',
  3: 'Stage 3 — Final Structure Optimization',
  4: 'Stage 4 — Verification & Submit',
};

const PURPOSE_LABELS = {
  PURCHASE: 'Purchase',
  RATE_TERM_REFI: 'Rate/Term Refi',
  CASH_OUT: 'Cash-Out Refi',
  STREAMLINE: 'Streamline',
  FIX_FLIP: 'Fix & Flip',
  CONSTRUCTION: 'Construction',
  BRIDGE: 'Bridge',
  INVESTMENT_PURCHASE: 'Investment',
  COMMERCIAL: 'Commercial',
  // Legacy values
  Purchase: 'Purchase',
  REFINANCE: 'Refi',
  Refi: 'Refi',
};

export default function ScenarioHeader({
  scenario,
  module = { number: '00', stage: 1, name: 'Module', color: 'indigo' },
  badge = null,
  qualifyingScore = null,
  children,
}) {
  const navigate = useNavigate();

  if (!scenario) return null;

  const borrowerName = `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || 'Unknown Borrower';
  const coBorrowers = (scenario.coBorrowers || []).filter(cb => cb.firstName || cb.lastName);
  const propertyAddress = [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode]
    .filter(Boolean).join(', ');

  const displayScore = qualifyingScore || scenario.creditScore;
  const stageLabel = typeof module.stage === 'number' ? STAGE_LABELS[module.stage] : module.stage;
  const purposeLabel = PURPOSE_LABELS[scenario.loanPurpose] || scenario.loanPurpose || '';

  // Mismatch detection
  const scenarioName = scenario.scenarioName || '';
  const hasMismatch = scenarioName &&
    !scenarioName.toLowerCase().includes((scenario.firstName || '').toLowerCase()) &&
    !scenarioName.toLowerCase().includes((scenario.lastName || '').toLowerCase()) &&
    scenario.firstName && scenario.lastName;

  return (
    <div className="mb-6">
      {/* Mismatch warning — above header */}
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

      {/* Main header */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5">

        {/* Top row — module identity + badges */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">
                {stageLabel}
              </span>
              <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">
                Module {module.number}
              </span>
            </div>
            <h1 className="text-2xl font-bold">{module.name}</h1>
            {module.subtitle && (
              <p className="text-indigo-300 text-sm mt-0.5">{module.subtitle}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">
              ● LIVE
            </span>
            {badge && (
              <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${
                badge.color === 'emerald'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  : badge.color === 'red'
                  ? 'bg-red-500/20 text-red-300 border-red-400/30'
                  : badge.color === 'amber'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
              }`}>
                {badge.label}
              </span>
            )}
          </div>
        </div>

        {/* Bottom row — borrower identity + reference IDs */}
        <div className="border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Left — Borrower info */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">Borrower(s)</p>

            {/* Primary borrower */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">{borrowerName}</span>
              <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">
                Primary
              </span>
              {displayScore && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
                  parseInt(displayScore) >= 740 ? 'bg-emerald-500/20 text-emerald-300' :
                  parseInt(displayScore) >= 680 ? 'bg-blue-500/20 text-blue-300' :
                  parseInt(displayScore) >= 620 ? 'bg-amber-500/20 text-amber-300' :
                  'bg-red-500/20 text-red-300'
                }`}>
                  FICO {displayScore}
                </span>
              )}
            </div>

            {/* Co-borrowers */}
            {coBorrowers.map((cb, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-indigo-200">
                  {`${cb.firstName || ''} ${cb.lastName || ''}`.trim()}
                </span>
                <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10">
                  Co-Borrower {i + 1}
                </span>
                {cb.creditScore && (
                  <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">
                    FICO {cb.creditScore}
                  </span>
                )}
              </div>
            ))}

            {/* Property address */}
            {propertyAddress && (
              <p className="text-xs text-indigo-300 mt-1">📍 {propertyAddress}</p>
            )}

            {/* Loan detail pills */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {scenario.loanType && (
                <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                  {scenario.loanType}
                </span>
              )}
              {purposeLabel && (
                <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                  {purposeLabel}
                </span>
              )}
              {scenario.loanAmount && (
                <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">
                  ${Number(scenario.loanAmount).toLocaleString()}
                </span>
              )}
              {scenario.propertyType && (
                <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                  {scenario.propertyType}
                </span>
              )}
              {scenario.occupancy && (
                <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                  {scenario.occupancy}
                </span>
              )}
            </div>
          </div>

          {/* Right — Reference IDs */}
          <div>
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">File Reference IDs</p>
            <div className="space-y-1.5">
              {scenario.loanBeaconsRef ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">LB Ref</span>
                  <span className="text-xs font-mono font-bold text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded">
                    {scenario.loanBeaconsRef}
                  </span>
                </div>
              ) : null}
              {scenario.losLoanNumber ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">LOS Loan #</span>
                  <span className="text-xs font-mono text-white/80 bg-white/10 px-2 py-0.5 rounded">
                    {scenario.losLoanNumber}
                  </span>
                </div>
              ) : null}
              {scenario.ausCaseNumber ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 w-20 shrink-0">AUS Case #</span>
                  <span className="text-xs font-mono text-purple-300 bg-purple-500/20 border border-purple-400/30 px-2 py-0.5 rounded">
                    {scenario.ausCaseNumber}
                  </span>
                </div>
              ) : null}
              {!scenario.loanBeaconsRef && !scenario.losLoanNumber && !scenario.ausCaseNumber && (
                <p className="text-xs text-white/40 italic">
                  No reference IDs on file — add in Scenario Creator
                </p>
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

        {/* Optional extra content slot */}
        {children && (
          <div className="border-t border-white/10 pt-4 mt-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
