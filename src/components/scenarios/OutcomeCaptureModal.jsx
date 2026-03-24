import { useState } from 'react';
import './OutcomeCaptureModal.css';

const AUS_OPTIONS  = ['Yes — 1st submission', 'No — needed AUS Rescue', 'Not applicable'];
const DPA_OPTIONS  = ['Yes', 'No', 'N/A'];
const STAR_LABELS  = ['', 'Not at all', 'Partially', 'Mostly', 'Very helpful', 'Spot-on'];

// ─────────────────────────────────────────────────────────────────────────────
// OutcomeCaptureModal
// Shown when the LO clicks "Mark Closed" on an Approved scenario.
// Captures outcome data that feeds LO / Broker / Lender stats and the
// LoanBeacons intelligence feedback loop.
// ─────────────────────────────────────────────────────────────────────────────
export default function OutcomeCaptureModal({ scenario, onConfirm, onCancel }) {
  const [closeDate,    setCloseDate]    = useState(new Date().toISOString().slice(0, 10));
  const [finalAmount,  setFinalAmount]  = useState(
    String(Math.round(Number(scenario.loanAmount || scenario.propertyValue || 0)))
  );
  const [lenderUsed,   setLenderUsed]   = useState('');
  const [programClose, setProgramClose] = useState(scenario.loanProgram || scenario.program || '');
  const [ausResult,    setAusResult]    = useState(AUS_OPTIONS[0]);
  const [dpaUsed,      setDpaUsed]      = useState('No');
  const [rating,       setRating]       = useState(5);
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);

  const borrowerName = (() => {
    if (scenario.borrowerName) return scenario.borrowerName;
    const f = scenario.firstName || '';
    const l = scenario.lastName  || '';
    return `${f} ${l}`.trim() || 'Borrower';
  })();

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm({
        closeDate,
        finalAmount:  Number(finalAmount.replace(/[^0-9]/g, '')),
        lenderUsed,
        programAtClose: programClose,
        ausFirstSub:  ausResult,
        dpaUsed,
        accuracyRating: rating,
        notes,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ocm-overlay" role="dialog" aria-modal="true">
      <div className="ocm-modal">

        {/* Header */}
        <div className="ocm-head">
          <div>
            <div className="ocm-title">Mark scenario as Closed</div>
            <div className="ocm-sub">
              {borrowerName}&nbsp;&middot;&nbsp;{scenario.id}
              &nbsp;&middot;&nbsp;
              ${Math.round(Number(scenario.loanAmount || scenario.propertyValue || 0)).toLocaleString()}
            </div>
          </div>
          <button className="ocm-x" onClick={onCancel} aria-label="Close">&#10005;</button>
        </div>

        {/* Body */}
        <div className="ocm-body">

          <div className="ocm-row-2">
            <div className="ocm-field">
              <label className="ocm-label">Close date</label>
              <input
                type="date"
                className="ocm-input"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
              />
            </div>
            <div className="ocm-field">
              <label className="ocm-label">Final loan amount</label>
              <input
                type="text"
                className="ocm-input"
                value={finalAmount}
                onChange={(e) => setFinalAmount(e.target.value)}
                placeholder="e.g. 320000"
              />
            </div>
          </div>

          <div className="ocm-field">
            <label className="ocm-label">Lender used</label>
            <input
              type="text"
              className="ocm-input"
              value={lenderUsed}
              onChange={(e) => setLenderUsed(e.target.value)}
              placeholder="e.g. United Wholesale Mortgage"
            />
          </div>

          <div className="ocm-field">
            <label className="ocm-label">Program at close</label>
            <input
              type="text"
              className="ocm-input"
              value={programClose}
              onChange={(e) => setProgramClose(e.target.value)}
              placeholder="e.g. Conventional 30yr Fixed"
            />
          </div>

          <div className="ocm-field">
            <label className="ocm-label">AUS pass on first submission?</label>
            <div className="ocm-pills">
              {AUS_OPTIONS.map((o) => (
                <button
                  key={o}
                  className={`ocm-pill${ausResult === o ? ' on' : ''}`}
                  onClick={() => setAusResult(o)}
                  type="button"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div className="ocm-field">
            <label className="ocm-label">DPA program used?</label>
            <div className="ocm-pills">
              {DPA_OPTIONS.map((o) => (
                <button
                  key={o}
                  className={`ocm-pill${dpaUsed === o ? ' on' : ''}`}
                  onClick={() => setDpaUsed(o)}
                  type="button"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div className="ocm-field">
            <label className="ocm-label">
              Did LoanBeacons intelligence match the outcome?
            </label>
            <div className="ocm-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`ocm-star${n <= rating ? ' on' : ''}`}
                  onClick={() => setRating(n)}
                  type="button"
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                >
                  {n <= rating ? '▪' : '▫'}
                </button>
              ))}
              <span className="ocm-star-label">{STAR_LABELS[rating]}</span>
            </div>
          </div>

          <div className="ocm-field">
            <label className="ocm-label">Notes (optional)</label>
            <textarea
              className="ocm-input ocm-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What worked? What didn't? Any context for future scenarios..."
              rows={3}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="ocm-foot">
          <button className="ocm-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="ocm-confirm" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving...' : '✓ Confirm close & capture outcome'}
          </button>
        </div>

      </div>
    </div>
  );
}
