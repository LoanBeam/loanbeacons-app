// ─────────────────────────────────────────────────────────────────
// NextStepCard.jsx
// LoanBeacons™ — Next Step Intelligence™ UI Component
// Placement: Bottom of every module, above DecisionRecordBanner
// Renders only after reportFindings() has been called
// Patent Pending: U.S. Application No. 63/739,290
// ─────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────
// Urgency config — colors, labels, icons
// ─────────────────────────────────────────────
const URGENCY = {
  HIGH: {
    leftBorder:   'border-l-red-500',
    badgeBg:      'bg-red-50',
    badgeText:    'text-red-700',
    badgeBorder:  'border-red-200',
    dotColor:     'bg-red-500',
    label:        'High Priority',
  },
  MEDIUM: {
    leftBorder:   'border-l-amber-500',
    badgeBg:      'bg-amber-50',
    badgeText:    'text-amber-700',
    badgeBorder:  'border-amber-200',
    dotColor:     'bg-amber-500',
    label:        'Medium Priority',
  },
  LOW: {
    leftBorder:   'border-l-green-500',
    badgeBg:      'bg-green-50',
    badgeText:    'text-green-700',
    badgeBorder:  'border-green-200',
    dotColor:     'bg-green-500',
    label:        'Suggested Next',
  },
};

const LOAN_PURPOSE_LABELS = {
  purchase:        'Purchase',
  rate_term_refi:  'Rate/Term Refi',
  cash_out_refi:   'Cash-Out Refi',
};

const STAGE_LABELS = {
  1: 'Stage 1 — Pre-Structure',
  2: 'Stage 2 — Lender Fit',
  3: 'Stage 3 — Optimization',
  4: 'Stage 4 — Verify & Submit',
};

// ─────────────────────────────────────────────
// Sub-component: Secondary Suggestion Pill
// ─────────────────────────────────────────────
function SecondaryPill({ suggestion, onClick }) {
  const u = URGENCY[suggestion.urgency] || URGENCY.LOW;
  return (
    <button
      onClick={() => onClick(suggestion)}
      title={suggestion.reason}
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-3 py-1
        text-xs font-medium font-['DM_Sans'] transition-all
        hover:shadow-sm hover:scale-105 active:scale-100
        ${u.badgeBg} ${u.badgeText} ${u.badgeBorder}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${u.dotColor}`} />
      {suggestion.moduleLabel}
    </button>
  );
}

// ─────────────────────────────────────────────
// Main component: NextStepCard
// ─────────────────────────────────────────────
export default function NextStepCard({
  suggestion,
  secondarySuggestions = [],
  onFollow,           // (moduleKey) => void — caller can pre-hook before navigate
  onOverride,         // (moduleKey, note) => void
  loanPurpose,
  scenarioId,
}) {
  const navigate = useNavigate();
  const [overrideMode,  setOverrideMode]  = useState(false);
  const [overrideNote,  setOverrideNote]  = useState('');
  const [acted,         setActed]         = useState(false);
  const [actedMessage,  setActedMessage]  = useState('');
  const [actedType,     setActedType]     = useState(null); // "followed" | "overridden"

  // Nothing to render if no suggestion or already completed
  if (!suggestion) return null;

  const u = URGENCY[suggestion.urgency] || URGENCY.LOW;
  const purposeLabel = LOAN_PURPOSE_LABELS[loanPurpose] || loanPurpose || '';
  const stageLabel   = STAGE_LABELS[suggestion.stage] || `Stage ${suggestion.stage}`;

  // ── Follow handler ──
  const handleFollow = () => {
    onFollow?.(suggestion.moduleKey);
    setActed(true);
    setActedType('followed');
    setActedMessage(`Navigating to ${suggestion.moduleLabel}…`);
    const dest = suggestion.route + (scenarioId ? `?scenarioId=${scenarioId}` : '');
    // Small delay so the "acted" state renders before navigation
    setTimeout(() => navigate(dest), 150);
  };

  // ── Secondary follow ──
  const handleSecondaryFollow = (s) => {
    onFollow?.(s.moduleKey);
    const dest = s.route + (scenarioId ? `?scenarioId=${scenarioId}` : '');
    navigate(dest);
  };

  // ── Override confirm ──
  const handleOverrideConfirm = () => {
    onOverride?.(suggestion.moduleKey, overrideNote.trim() || null);
    setOverrideMode(false);
    setOverrideNote('');
    setActed(true);
    setActedType('overridden');
    setActedMessage('Override logged to Decision Record.');
  };

  // ─────────────────────────────────────────────
  // ACTED STATE — shown after follow or override
  // ─────────────────────────────────────────────
  if (acted) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 flex items-center gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${actedType === 'followed' ? 'bg-indigo-100' : 'bg-slate-200'}`}>
          <svg className={`w-3.5 h-3.5 ${actedType === 'followed' ? 'text-indigo-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800 font-['DM_Sans']">
            Next Step Intelligence™
          </p>
          <p className="text-xs text-slate-500 font-['DM_Sans'] mt-0.5">{actedMessage}</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // MAIN CARD
  // ─────────────────────────────────────────────
  return (
    <div className="mt-6 space-y-2.5">

      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-indigo-500 font-['DM_Sans']">
          Next Step Intelligence™
        </span>
        <span className={`
          inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full
          border font-semibold font-['DM_Sans']
          ${u.badgeBg} ${u.badgeText} ${u.badgeBorder}
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${u.dotColor}`} />
          {u.label}
        </span>
        <span className="ml-auto text-[11px] text-slate-400 font-['DM_Sans']">
          {purposeLabel}
        </span>
      </div>

      {/* Primary card */}
      <div className={`
        rounded-3xl border-2 border-indigo-100 border-l-4 ${u.leftBorder}
        bg-gradient-to-br from-indigo-50 to-blue-50
        shadow-sm overflow-hidden
      `}>
        <div className="p-5">

          {/* Stage badge + module name */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-[17px] font-semibold text-slate-900 font-['DM_Serif_Display'] leading-snug">
              {suggestion.moduleLabel}
            </h3>
            <span className="shrink-0 text-[10px] font-medium text-slate-400 font-['DM_Sans'] mt-1 whitespace-nowrap">
              {stageLabel}
            </span>
          </div>

          {/* Reason */}
          <p className="text-sm text-slate-600 font-['DM_Sans'] leading-relaxed">
            {suggestion.reason}
          </p>

          {/* Action area */}
          {!overrideMode ? (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleFollow}
                className="
                  inline-flex items-center gap-2 rounded-xl
                  bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                  text-white text-sm font-semibold px-5 py-2.5
                  font-['DM_Sans'] transition-colors shadow-sm
                "
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                Go to {suggestion.moduleLabel}
              </button>

              {suggestion.canSkip && (
                <button
                  onClick={() => setOverrideMode(true)}
                  className="
                    rounded-xl border border-slate-300
                    text-slate-500 hover:text-slate-700 hover:border-slate-400
                    text-sm font-medium px-4 py-2.5
                    font-['DM_Sans'] transition-colors
                  "
                >
                  Override / Choose Different
                </button>
              )}

              {!suggestion.canSkip && (
                <span className="text-xs text-red-600 font-medium font-['DM_Sans'] flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  This step cannot be skipped
                </span>
              )}
            </div>
          ) : (
            /* Override flow */
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 font-['DM_Sans'] mb-1.5">
                  Optional note — why are you overriding this suggestion?
                  <span className="font-normal ml-1 text-slate-400">(logged to Decision Record)</span>
                </label>
                <input
                  type="text"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOverrideConfirm()}
                  placeholder="e.g. Proceeding to closing cost review per borrower request…"
                  autoFocus
                  className="
                    w-full rounded-xl border border-slate-300
                    text-sm text-slate-700 placeholder-slate-300
                    px-3.5 py-2.5 font-['DM_Sans']
                    focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                    bg-white
                  "
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleOverrideConfirm}
                  className="
                    rounded-xl bg-slate-800 hover:bg-slate-900
                    text-white text-sm font-semibold px-4 py-2
                    font-['DM_Sans'] transition-colors
                  "
                >
                  Confirm Override
                </button>
                <button
                  onClick={() => { setOverrideMode(false); setOverrideNote(''); }}
                  className="
                    rounded-xl border border-slate-300
                    text-slate-500 hover:text-slate-700
                    text-sm font-medium px-4 py-2
                    font-['DM_Sans'] transition-colors
                  "
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Secondary suggestions — pill row */}
      {secondarySuggestions.length > 0 && !overrideMode && (
        <div className="flex items-center gap-2 flex-wrap pl-1">
          <span className="text-[11px] text-slate-400 font-['DM_Sans'] shrink-0">Also consider:</span>
          {secondarySuggestions.map((s) => (
            <SecondaryPill
              key={s.moduleKey}
              suggestion={s}
              onClick={handleSecondaryFollow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
