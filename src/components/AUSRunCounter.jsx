/**
 * LoanBeacons™ — AUS Run Counter
 * Read-only. Submission number auto-extracted from uploaded DU/LPA/GUS findings PDF.
 *
 * DU  (Fannie Mae)  : case file locks ~20 submissions
 * LPA (Freddie Mac) : restrictions apply ~25 submissions
 * GUS (USDA)        : no hard published limit
 *
 * Props:
 *   submissionNumber  {number|null}  Extracted from PDF parse result
 *   program           {string}       Current program key
 *   caseFileId        {string|null}  DU/LPA case file ID (if extracted)
 *   ausEngine         {string|null}  'du' | 'lpa' | 'fha_total' | 'gus'
 */

import { useState } from 'react';

const THRESHOLDS = { warn: 12, danger: 17, critical: 20 };

const ENGINE_LIMITS = {
  du:        { limit: 20, label: 'DU',        note: 'Fannie Mae Desktop Underwriter' },
  lpa:       { limit: 25, label: 'LPA',       note: 'Freddie Mac Loan Product Advisor' },
  fha_total: { limit: 20, label: 'FHA TOTAL', note: 'FHA TOTAL Scorecard via DU' },
  gus:       { limit: null, label: 'GUS',     note: 'USDA Guaranteed Underwriting System' },
};

export default function AUSRunCounter({ submissionNumber, program, caseFileId, ausEngine }) {
  const [showDetail, setShowDetail] = useState(false);

  const inferredEngine = ausEngine || (
    program === 'homepossible' ? 'lpa' :
    program === 'usda'         ? 'gus' :
    program === 'fha'          ? 'fha_total' : 'du'
  );

  const engineCfg  = ENGINE_LIMITS[inferredEngine] || ENGINE_LIMITS.du;
  const count      = submissionNumber ?? null;
  const limit      = engineCfg.limit;
  const remaining  = limit && count != null ? Math.max(0, limit - count) : null;

  const isCritical = count != null && limit && count >= THRESHOLDS.critical;
  const isDanger   = count != null && limit && count >= THRESHOLDS.danger   && !isCritical;
  const isWarn     = count != null && limit && count >= THRESHOLDS.warn     && !isDanger && !isCritical;

  const colors = isCritical
    ? { bg:'bg-red-50',    border:'border-red-300',   text:'text-red-700',   bar:'bg-red-500',    icon:'🔴', badge:'bg-red-600 text-white' }
    : isDanger
    ? { bg:'bg-orange-50', border:'border-orange-300', text:'text-orange-700',bar:'bg-orange-500', icon:'🟠', badge:'bg-orange-500 text-white' }
    : isWarn
    ? { bg:'bg-yellow-50', border:'border-yellow-300', text:'text-yellow-800',bar:'bg-yellow-400', icon:'🟡', badge:'bg-yellow-400 text-yellow-900' }
    : { bg:'bg-slate-50',  border:'border-slate-200',  text:'text-slate-600', bar:'bg-emerald-400',icon:'🟢', badge:'bg-slate-200 text-slate-700' };

  const barPct = limit && count != null ? Math.min(100, (count / limit) * 100) : 0;

  // Not yet extracted from a PDF
  if (count === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
        <span className="text-base">📋</span>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">AUS Submission Count</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Upload a DU or LPA findings PDF — submission number extracts automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}>

      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-base flex-shrink-0">{colors.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wide ${colors.text}`}>
              Submission {count}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
              {engineCfg.label}
            </span>
            {isCritical && (
              <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                ⚠ APPROACHING LOCK
              </span>
            )}
          </div>

          {limit && (
            <div className="mt-1.5 w-full h-1.5 bg-white/70 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${colors.bar}`} style={{ width: `${barPct}%` }} />
            </div>
          )}

          <p className={`text-[11px] mt-1 ${colors.text} opacity-90`}>
            {isCritical
              ? `⚠ ~${remaining} submission${remaining !== 1 ? 's' : ''} remaining before ${engineCfg.label} case file may lock — contact your AE about a new case file.`
              : isDanger
              ? `~${remaining} submission${remaining !== 1 ? 's' : ''} remaining — batch all fixes into one run. Don't run exploratory submissions.`
              : isWarn
              ? `~${remaining} estimated remaining — run this Rule Engine analysis before each ${engineCfg.label} submission.`
              : limit
              ? `~${remaining} of ${limit} estimated submissions remaining · ${engineCfg.note}`
              : engineCfg.note}
          </p>

          {caseFileId && (
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Case file: {caseFileId}</p>
          )}
        </div>

        <button
          onClick={() => setShowDetail(v => !v)}
          className={`text-[10px] font-semibold px-2 py-1 rounded border flex-shrink-0 ${colors.border} ${colors.text} hover:opacity-80`}
        >
          {showDetail ? 'Hide' : 'Info'}
        </button>
      </div>

      {isCritical && (
        <div className="bg-red-100 border-t border-red-200 px-4 py-2">
          <p className="text-xs font-semibold text-red-700">
            Action required: At {count} submissions, DU may flag or lock this case file. Implement all planned fixes in a single submission. Ask your AE for a new case file number if needed.
          </p>
        </div>
      )}

      {showDetail && (
        <div className={`border-t ${colors.border} px-4 py-3 text-xs ${colors.text} space-y-2`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-bold mb-1">DU / FHA TOTAL (Fannie Mae)</p>
              <p className="opacity-80">1–10: Normal. 11–15: Monitor. 16–19: Batch all fixes before next run. 20+: Case file may lock — new case number from AE required.</p>
            </div>
            <div>
              <p className="font-bold mb-1">LPA (Freddie Mac)</p>
              <p className="opacity-80">Similar limits apply ~25 submissions. Each re-run may pull a new credit inquiry — coordinate with processor before each run.</p>
            </div>
          </div>
          <div className="bg-white/60 rounded-lg p-2.5">
            <p className="font-bold mb-1">Best practices:</p>
            <ul className="space-y-1 opacity-80 list-disc list-inside">
              <li>Processor, UW, and LO runs all count toward the same case file limit</li>
              <li>Use this Rule Engine analysis before every AUS submission</li>
              <li>Implement all planned fixes in one submission — not one at a time</li>
              <li>At submission 15+, brief your AE and have a new case file ready</li>
            </ul>
          </div>
          <p className="text-[10px] opacity-60 italic">
            Submission count auto-extracted from uploaded DU/LPA findings PDF. Upload the latest findings after each run to keep this current.
          </p>
        </div>
      )}
    </div>
  );
}
