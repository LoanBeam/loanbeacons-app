// src/components/DecisionRecordBanner.jsx
// Always visible after a finding is selected.
// State 1 — no recordId: shows "Save to Decision Record" button
// State 2 — recordId exists: shows saved confirmation + "View Record →" button

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DecisionRecordBanner({ recordId, savedRecordId, moduleName, moduleKey, onSave }) {
  recordId = recordId || savedRecordId;
  moduleName = moduleName || (moduleKey ? moduleKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'This module');
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle'); // idle | saving | saved

  const handleSave = async () => {
    setStatus('saving');
    try {
      if (onSave) await onSave();
    } catch (e) {
      console.error('Save error:', e);
    }
    // Always flip to saved after 1.5s max — covers non-promise reportFindings
    setTimeout(() => setStatus('saved'), 1500);
  };

  const isSaved = status === 'saved' || !!recordId;

  // ── Saved state ──
  if (isSaved) {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-3 mt-4 rounded-lg border border-emerald-300 bg-emerald-50">
        <div className="flex items-center gap-2.5">
          <span className="text-emerald-600 text-lg">✅</span>
          <div>
            <div className="text-sm font-semibold text-emerald-800">
              Saved to Decision Record
            </div>
            <div className="text-xs text-emerald-600">
              {moduleName} findings logged to your audit trail
            </div>
          </div>
        </div>
        <button
          onClick={() => recordId
            ? navigate(`/decision-records/${recordId}`)
            : navigate('/decision-records')
          }
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap shadow-sm"
        >
          View Decision Record →
        </button>
      </div>
    );
  }

  // ── Saving state ──
  if (status === 'saving') {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-3 mt-4 rounded-lg border border-indigo-200 bg-indigo-50">
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold text-indigo-700">Saving to Decision Record…</div>
        </div>
      </div>
    );
  }

  // ── Idle state — Save button ──
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 mt-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2.5">
        <span className="text-slate-400 text-lg">📋</span>
        <div>
          <div className="text-sm font-semibold text-slate-700">Decision Record</div>
          <div className="text-xs text-slate-500">Save {moduleName} findings to your audit trail</div>
        </div>
      </div>
      <button
        onClick={handleSave}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-slate-700 text-white hover:bg-slate-900 transition-colors whitespace-nowrap shadow-sm"
      >
        💾 Save to Decision Record
      </button>
    </div>
  );
}
