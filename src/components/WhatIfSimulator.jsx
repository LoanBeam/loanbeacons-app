/**
 * LoanBeacons™ — What-If Simulator
 * AUS Rescue v2.0 — Real-time scenario analysis without burning AUS runs.
 *
 * Four simulators in one panel:
 *   1. Rate Sensitivity  — buydown changes DTI + flips program eligibility
 *   2. Debt Payoff       — eliminate debts, watch programs re-rank live
 *   3. Co-Borrower       — add income, DTI recalculates across all 11 programs
 *   4. Comparison        — two scenarios side by side, fastest path highlighted
 *
 * All math is deterministic. No AI calls. Re-runs rankPrograms() from the
 * Rule Engine on every change.
 *
 * Props:
 *   baseProfile   {Object}   pmeProfile from AUSRescue — borrower baseline
 *   loanAmount    {number}   Loan amount in dollars
 *   interestRate  {number}   Current interest rate (e.g. 7.25)
 *   monthlyIncome {number}   Optional — derived from DTI + payment if not supplied
 */

import { useState, useMemo } from 'react';
import { rankPrograms, assessFeasibility, identifyPrimaryBlocker } from '../engines/programRuleEngine';

// ── Math helpers ──────────────────────────────────────────────────────────────

/** Monthly P&I payment */
const calcPayment = (principal, annualRate, termMonths = 360) => {
  if (!principal || !annualRate) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return +(principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)).toFixed(2);
};

/** Derive monthly gross income from DTI + total monthly obligations */
const deriveIncome = (dti, monthlyPayment, frontEndDti) => {
  // Use front-end DTI if available (more accurate housing ratio)
  if (frontEndDti && monthlyPayment) {
    return monthlyPayment / (frontEndDti / 100);
  }
  // Fall back: assume housing is ~38% of total DTI
  if (dti && monthlyPayment) {
    const housingShare = Math.min(dti, 45) / dti;
    return monthlyPayment / (dti / 100 * housingShare);
  }
  return null;
};

// ── Mini program bar ──────────────────────────────────────────────────────────
function ProgramBar({ result, baseResult, showDelta }) {
  const tier = result.eligible ? 'eligible' : result.conditional ? 'conditional' : 'disqualified';
  const barColor = tier === 'eligible' ? '#1D9E75' : tier === 'conditional' ? '#BA7517' : '#888780';
  const pct = result.approvalProbability;
  const basePct = baseResult?.approvalProbability ?? pct;
  const delta = pct - basePct;
  const isDimmed = tier === 'disqualified';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0', opacity: isDimmed ? 0.45 : 1,
    }}>
      <span style={{ fontSize: 14, width: 20, flexShrink: 0 }}>{result.icon}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, width: 100, flexShrink: 0,
        color: isDimmed ? '#6b7280' : '#1e293b',
      }}>
        {result.programName}
      </span>
      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${pct}%`,
          background: barColor,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, width: 30, textAlign: 'right',
        color: barColor, flexShrink: 0,
        fontFamily: 'monospace',
      }}>
        {isDimmed ? '—' : `${pct}%`}
      </span>
      {showDelta && delta !== 0 && !isDimmed && (
        <span style={{
          fontSize: 10, fontWeight: 700, width: 32, textAlign: 'right', flexShrink: 0,
          color: delta > 0 ? '#059669' : '#dc2626',
        }}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

// ── Feasibility pill ──────────────────────────────────────────────────────────
function FeasPill({ label }) {
  const cfg = {
    HIGH:   { bg: '#dcfce7', color: '#166534', text: '▲ HIGH' },
    MEDIUM: { bg: '#fef9c3', color: '#854d0e', text: '● MEDIUM' },
    LOW:    { bg: '#fee2e2', color: '#991b1b', text: '▼ LOW' },
  }[label] || { bg: '#f1f5f9', color: '#475569', text: label };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 5, padding: '2px 10px',
      fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
    }}>
      {cfg.text}
    </span>
  );
}

// ── Results column ────────────────────────────────────────────────────────────
function ResultsColumn({ profile, baseProfile, label, highlight }) {
  const ranked = useMemo(() => {
    if (!profile?.fico) return [];
    return rankPrograms(profile);
  }, [profile]);

  const baseRanked = useMemo(() => {
    if (!baseProfile?.fico) return [];
    return rankPrograms(baseProfile);
  }, [baseProfile]);

  const feasibility = useMemo(() => ranked.length ? assessFeasibility(ranked) : null, [ranked]);
  const blocker     = useMemo(() => ranked.length ? identifyPrimaryBlocker(ranked) : null, [ranked]);

  const showDelta = !!baseProfile && baseProfile !== profile;
  const eligibleCount = ranked.filter(r => r.eligible).length;

  if (!profile?.fico) {
    return (
      <div style={{
        flex: 1, background: '#f8fafc', borderRadius: 10,
        border: '1px solid #e2e8f0', padding: '20px 16px',
        textAlign: 'center', color: '#94a3b8', fontSize: 12,
      }}>
        Enter Credit Score and DTI to run simulation
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, background: highlight ? '#f0fdf4' : '#f8fafc',
      borderRadius: 10,
      border: `1px solid ${highlight ? '#86efac' : '#e2e8f0'}`,
      padding: '14px 16px',
      transition: 'all 0.3s ease',
    }}>
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em' }}>
          {label.toUpperCase()}
        </span>
        {feasibility && <FeasPill label={feasibility} />}
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {blocker && (
          <span style={{
            background: '#fee2e2', color: '#991b1b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600,
          }}>
            ● {blocker.rule} blocker
          </span>
        )}
        <span style={{
          background: eligibleCount > 0 ? '#dcfce7' : '#f1f5f9',
          color: eligibleCount > 0 ? '#166534' : '#64748b',
          borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600,
        }}>
          {eligibleCount} eligible program{eligibleCount !== 1 ? 's' : ''}
        </span>
        {highlight && (
          <span style={{
            background: '#dcfce7', color: '#166534',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700,
          }}>
            ★ BEST PATH
          </span>
        )}
      </div>

      {/* Program bars */}
      <div>
        {ranked.map(r => {
          const base = baseRanked.find(b => b.programId === r.programId);
          return <ProgramBar key={r.programId} result={r} baseResult={base} showDelta={showDelta} />;
        })}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: active ? '#eef2ff' : 'transparent',
        border: active ? '1px solid #c7d2fe' : '1px solid transparent',
        borderRadius: 8, padding: '8px 12px',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'all 0.15s ease',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{
        fontSize: 12, fontWeight: 700,
        color: active ? '#4338ca' : '#475569',
        letterSpacing: '0.03em',
      }}>
        {title}
      </span>
      <span style={{
        marginLeft: 'auto', fontSize: 11, color: active ? '#6366f1' : '#94a3b8',
        transform: active ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
      }}>▾</span>
    </button>
  );
}

// ── Input row helper ──────────────────────────────────────────────────────────
function InputRow({ label, value, onChange, suffix, min, max, step, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <label style={{ fontSize: 12, color: '#475569', fontWeight: 500, width: 160, flexShrink: 0 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        <input
          type="number"
          value={value}
          min={min} max={max} step={step || 1}
          onChange={e => onChange(e.target.value)}
          style={{
            border: '1px solid #e2e8f0', borderRadius: 6,
            padding: '5px 10px', fontSize: 12,
            width: 90, background: '#fff',
            color: '#1e293b', fontFamily: 'monospace',
          }}
        />
        {suffix && <span style={{ fontSize: 11, color: '#94a3b8' }}>{suffix}</span>}
        {hint && <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>{hint}</span>}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function WhatIfSimulator({ baseProfile, loanAmount, interestRate }) {
  const [activeSection, setActiveSection] = useState('rate');

  // ── Rate sensitivity state ────────────────────────────────────────────────
  const [rateDelta, setRateDelta] = useState(0);   // in 0.25% increments

  // ── Debt payoff state ─────────────────────────────────────────────────────
  const [debts, setDebts] = useState([
    { id: 1, label: 'Debt 1', monthly: '' },
  ]);
  const addDebt = () => setDebts(d => [...d, { id: Date.now(), label: `Debt ${d.length + 1}`, monthly: '' }]);
  const removeDebt = id => setDebts(d => d.filter(x => x.id !== id));
  const updateDebt = (id, val) => setDebts(d => d.map(x => x.id === id ? { ...x, monthly: val } : x));

  // ── Co-borrower state ─────────────────────────────────────────────────────
  const [coborrowerIncome, setCoborrowerIncome] = useState('');

  // ── Comparison state ──────────────────────────────────────────────────────
  const [compScenarios, setCompScenarios] = useState([
    { id: 1, label: 'Scenario A', dtiDelta: 0, ficoDelta: 0 },
    { id: 2, label: 'Scenario B', dtiDelta: 0, ficoDelta: 0 },
  ]);
  const updateComp = (id, field, val) =>
    setCompScenarios(s => s.map(x => x.id === id ? { ...x, [field]: Number(val) } : x));

  // ── Derived income (needed for debt payoff + co-borrower math) ───────────
  const derivedIncome = useMemo(() => {
    if (!baseProfile?.dti) return null;
    const payment = calcPayment(loanAmount, interestRate);
    return deriveIncome(baseProfile.dti, payment, baseProfile.ltv ? null : null);
  }, [baseProfile, loanAmount, interestRate]);

  const [manualIncome, setManualIncome] = useState('');
  const monthlyIncome = Number(manualIncome) || derivedIncome || null;

  // ── Adjusted profiles ─────────────────────────────────────────────────────

  // Rate sensitivity profile
  const rateProfile = useMemo(() => {
    if (!baseProfile?.fico || !baseProfile?.dti) return null;
    if (rateDelta === 0) return baseProfile;
    const currentPayment  = calcPayment(loanAmount, interestRate);
    const newRate         = Math.max(0.5, interestRate - rateDelta);
    const newPayment      = calcPayment(loanAmount, newRate);
    const paymentDelta    = currentPayment - newPayment;
    const income          = monthlyIncome || (currentPayment / ((baseProfile.dti * 0.38) / 100));
    const dtiDelta        = (paymentDelta / income) * 100;
    return { ...baseProfile, dti: Math.max(0, +(baseProfile.dti - dtiDelta).toFixed(1)) };
  }, [baseProfile, rateDelta, loanAmount, interestRate, monthlyIncome]);

  // Debt payoff profile
  const debtProfile = useMemo(() => {
    if (!baseProfile?.fico || !baseProfile?.dti) return null;
    const totalEliminated = debts.reduce((sum, d) => sum + (Number(d.monthly) || 0), 0);
    if (totalEliminated === 0) return baseProfile;
    const income = monthlyIncome || null;
    if (!income) return baseProfile;
    const dtiDelta = (totalEliminated / income) * 100;
    return { ...baseProfile, dti: Math.max(0, +(baseProfile.dti - dtiDelta).toFixed(1)) };
  }, [baseProfile, debts, monthlyIncome]);

  // Co-borrower profile
  const coborrowerProfile = useMemo(() => {
    if (!baseProfile?.fico || !baseProfile?.dti) return null;
    const addedIncome = Number(coborrowerIncome) || 0;
    if (addedIncome === 0) return baseProfile;
    const income = monthlyIncome;
    if (!income) return baseProfile;
    const currentObligations = income * (baseProfile.dti / 100);
    const newDti = (currentObligations / (income + addedIncome)) * 100;
    return { ...baseProfile, dti: Math.max(0, +newDti.toFixed(1)) };
  }, [baseProfile, coborrowerIncome, monthlyIncome]);

  // Comparison profiles
  const compProfiles = useMemo(() => compScenarios.map(sc => {
    if (!baseProfile?.fico) return null;
    return {
      ...baseProfile,
      dti:  Math.max(0, (baseProfile.dti  || 0) - sc.dtiDelta),
      fico: Math.min(850, (baseProfile.fico || 0) + sc.ficoDelta),
    };
  }), [baseProfile, compScenarios]);

  // Determine best comparison scenario
  const compFeasibility = compProfiles.map(p => p?.fico ? assessFeasibility(rankPrograms(p)) : 'LOW');
  const compEligible    = compProfiles.map(p => p?.fico ? rankPrograms(p).filter(r => r.eligible).length : 0);
  const bestCompIdx     = compEligible[0] >= compEligible[1] ? 0 : 1;

  const noBase = !baseProfile?.fico;

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{
        background: '#1e293b', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ width: 3, height: 22, background: '#6366f1', borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 14, letterSpacing: '0.02em' }}>
            WHAT-IF SIMULATOR
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
            Simulate fixes in real time · No AUS submission needed · Rule Engine re-ranks all 11 programs instantly
          </div>
        </div>
        {noBase && (
          <span style={{
            marginLeft: 'auto', background: '#f59e0b20', color: '#f59e0b',
            border: '1px solid #f59e0b40', borderRadius: 6,
            padding: '3px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0,
          }}>
            ⚡ Enter FICO + DTI to activate
          </span>
        )}
      </div>

      {/* Income input — needed for debt/co-borrower math */}
      {!noBase && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>
            💡 Monthly gross income
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#92400e' }}>$</span>
            <input
              type="number"
              placeholder="e.g. 7500"
              value={manualIncome}
              onChange={e => setManualIncome(e.target.value)}
              style={{
                border: '1px solid #fcd34d', borderRadius: 6,
                padding: '4px 10px', fontSize: 12, width: 110,
                background: '#fff', fontFamily: 'monospace',
              }}
            />
            <span style={{ fontSize: 11, color: '#92400e' }}>/mo</span>
          </div>
          <span style={{ fontSize: 11, color: '#b45309', fontStyle: 'italic' }}>
            Required for debt payoff and co-borrower simulations. Rate sensitivity works without it.
          </span>
        </div>
      )}

      {/* ── RATE SENSITIVITY ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <SectionHeader
          icon="📉" title="Rate Sensitivity — Buydown Impact on DTI & Programs"
          active={activeSection === 'rate'}
          onClick={() => setActiveSection(s => s === 'rate' ? null : 'rate')}
        />
        {activeSection === 'rate' && (
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 10px 10px',
            padding: '16px', marginTop: -1,
          }}>
            {/* Rate slider */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Rate buydown</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 0.25, 0.5, 0.75, 1.0].map(v => (
                    <button
                      key={v}
                      onClick={() => setRateDelta(v)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: `1px solid ${rateDelta === v ? '#6366f1' : '#e2e8f0'}`,
                        background: rateDelta === v ? '#6366f1' : '#f8fafc',
                        color: rateDelta === v ? '#fff' : '#475569',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {v === 0 ? 'None' : `-${v}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment math display */}
              {loanAmount && interestRate && rateDelta > 0 && (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #86efac',
                  borderRadius: 7, padding: '8px 12px',
                  display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12,
                }}>
                  {(() => {
                    const oldPmt = calcPayment(loanAmount, interestRate);
                    const newRate = Math.max(0.5, interestRate - rateDelta);
                    const newPmt = calcPayment(loanAmount, newRate);
                    const savings = oldPmt - newPmt;
                    const income = monthlyIncome || (oldPmt / ((baseProfile.dti * 0.38) / 100));
                    const dtiDrop = income ? (savings / income * 100).toFixed(1) : '?';
                    return (
                      <>
                        <div>
                          <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>RATE</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>
                            {interestRate}% → {newRate}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>MONTHLY SAVINGS</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>
                            −${Math.round(savings)}/mo
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>DTI IMPROVEMENT</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>
                            −{dtiDrop}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>NEW DTI</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>
                            {rateProfile?.dti ?? '—'}%
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {(!loanAmount || !interestRate) && (
                <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 8 }}>
                  Enter loan amount and interest rate in Step 1 for payment math
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <ResultsColumn profile={baseProfile} baseProfile={null} label="Current" />
              <ResultsColumn profile={rateProfile} baseProfile={baseProfile} label={rateDelta > 0 ? `After −${rateDelta}% Buydown` : 'After Buydown'} highlight={rateDelta > 0} />
            </div>
          </div>
        )}
      </div>

      {/* ── DEBT PAYOFF SIMULATOR ────────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <SectionHeader
          icon="💸" title="Debt Payoff Simulator — Eliminate Debts, Watch Programs Re-Rank"
          active={activeSection === 'debt'}
          onClick={() => setActiveSection(s => s === 'debt' ? null : 'debt')}
        />
        {activeSection === 'debt' && (
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 10px 10px',
            padding: '16px', marginTop: -1,
          }}>
            {!monthlyIncome && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7,
                padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#92400e',
              }}>
                ⚡ Enter monthly gross income above to run debt payoff math
              </div>
            )}

            {/* Debt inputs */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.07em', marginBottom: 8 }}>
                MONTHLY PAYMENTS TO ELIMINATE
              </div>
              {debts.map((debt, i) => (
                <div key={debt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    placeholder={`Debt ${i + 1} label`}
                    value={debt.label}
                    onChange={e => setDebts(d => d.map(x => x.id === debt.id ? { ...x, label: e.target.value } : x))}
                    style={{
                      border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px',
                      fontSize: 12, width: 130, color: '#1e293b',
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>$</span>
                  <input
                    type="number"
                    placeholder="Monthly pmt"
                    value={debt.monthly}
                    onChange={e => updateDebt(debt.id, e.target.value)}
                    style={{
                      border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px',
                      fontSize: 12, width: 100, fontFamily: 'monospace', color: '#1e293b',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>/mo</span>
                  {debts.length > 1 && (
                    <button onClick={() => removeDebt(debt.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94a3b8', fontSize: 14, padding: '0 4px',
                    }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={addDebt} style={{
                background: '#f8fafc', border: '1px dashed #cbd5e1',
                borderRadius: 6, padding: '5px 14px', fontSize: 11,
                fontWeight: 600, color: '#6366f1', cursor: 'pointer', marginTop: 4,
              }}>
                + Add debt
              </button>
            </div>

            {/* Summary */}
            {(() => {
              const total = debts.reduce((s, d) => s + (Number(d.monthly) || 0), 0);
              const dtiDrop = monthlyIncome && total ? (total / monthlyIncome * 100).toFixed(1) : null;
              if (!total) return null;
              return (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #86efac',
                  borderRadius: 7, padding: '8px 12px', marginBottom: 12,
                  display: 'flex', gap: 20, flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>TOTAL ELIMINATED</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>${total.toLocaleString()}/mo</div>
                  </div>
                  {dtiDrop && (
                    <>
                      <div>
                        <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>DTI IMPROVEMENT</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>−{dtiDrop}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>NEW DTI</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>{debtProfile?.dti ?? '—'}%</div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 12 }}>
              <ResultsColumn profile={baseProfile} baseProfile={null} label="Current" />
              <ResultsColumn profile={debtProfile} baseProfile={baseProfile} label="After Payoff" highlight={!!debts.find(d => d.monthly)} />
            </div>
          </div>
        )}
      </div>

      {/* ── CO-BORROWER SIMULATOR ────────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <SectionHeader
          icon="👥" title="Co-Borrower Income — Add Income, Watch DTI Drop Across All Programs"
          active={activeSection === 'coborrower'}
          onClick={() => setActiveSection(s => s === 'coborrower' ? null : 'coborrower')}
        />
        {activeSection === 'coborrower' && (
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 10px 10px',
            padding: '16px', marginTop: -1,
          }}>
            {!monthlyIncome && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7,
                padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#92400e',
              }}>
                ⚡ Enter monthly gross income above to run co-borrower math
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', width: 180, flexShrink: 0 }}>
                Co-borrower monthly income
              </label>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>$</span>
              <input
                type="number"
                placeholder="e.g. 3500"
                value={coborrowerIncome}
                onChange={e => setCoborrowerIncome(e.target.value)}
                style={{
                  border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '5px 10px', fontSize: 12, width: 110,
                  fontFamily: 'monospace', color: '#1e293b',
                }}
              />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>/mo gross</span>
            </div>

            {/* Summary */}
            {(() => {
              const added = Number(coborrowerIncome) || 0;
              if (!added || !monthlyIncome) return null;
              const obligations = monthlyIncome * (baseProfile.dti / 100);
              const newDti = (obligations / (monthlyIncome + added) * 100).toFixed(1);
              const drop = (baseProfile.dti - newDti).toFixed(1);
              return (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #86efac',
                  borderRadius: 7, padding: '8px 12px', marginBottom: 12,
                  display: 'flex', gap: 20, flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>COMBINED INCOME</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>
                      ${(monthlyIncome + added).toLocaleString()}/mo
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>DTI IMPROVEMENT</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>−{drop}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: '0.06em' }}>NEW DTI</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>{newDti}%</div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 12 }}>
              <ResultsColumn profile={baseProfile} baseProfile={null} label="Borrower Only" />
              <ResultsColumn profile={coborrowerProfile} baseProfile={baseProfile} label="With Co-Borrower" highlight={!!coborrowerIncome} />
            </div>
          </div>
        )}
      </div>

      {/* ── SCENARIO COMPARISON ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <SectionHeader
          icon="⚖️" title="Scenario Comparison — Two Paths Side by Side"
          active={activeSection === 'compare'}
          onClick={() => setActiveSection(s => s === 'compare' ? null : 'compare')}
        />
        {activeSection === 'compare' && (
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 10px 10px',
            padding: '16px', marginTop: -1,
          }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              {compScenarios.map((sc, idx) => (
                <div key={sc.id} style={{
                  flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '12px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 10, letterSpacing: '0.06em' }}>
                    {sc.label.toUpperCase()}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                      Scenario label
                    </label>
                    <input
                      type="text"
                      value={sc.label}
                      onChange={e => updateComp(sc.id, 'label', e.target.value)}
                      style={{
                        border: '1px solid #e2e8f0', borderRadius: 6,
                        padding: '5px 10px', fontSize: 12, width: '100%',
                        color: '#1e293b', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <InputRow
                    label="DTI reduction"
                    value={sc.dtiDelta}
                    onChange={v => updateComp(sc.id, 'dtiDelta', v)}
                    suffix="% less"
                    min={0} max={30} step={0.5}
                    hint="e.g. after debt payoff"
                  />
                  <InputRow
                    label="FICO increase"
                    value={sc.ficoDelta}
                    onChange={v => updateComp(sc.id, 'ficoDelta', v)}
                    suffix="pts"
                    min={0} max={100} step={5}
                    hint="e.g. after rapid rescore"
                  />
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Result: </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                      FICO {(baseProfile?.fico || 0) + sc.ficoDelta} · DTI {Math.max(0, (baseProfile?.dti || 0) - sc.dtiDelta).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {compScenarios.map((sc, idx) => (
                <ResultsColumn
                  key={sc.id}
                  profile={compProfiles[idx]}
                  baseProfile={baseProfile}
                  label={sc.label}
                  highlight={idx === bestCompIdx && compEligible[idx] > 0}
                />
              ))}
            </div>

            {compEligible[0] !== compEligible[1] && (
              <div style={{
                marginTop: 12, background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: 7, padding: '8px 14px',
                fontSize: 12, fontWeight: 600, color: '#166534',
              }}>
                ★ {compScenarios[bestCompIdx].label} is the stronger path —
                {' '}{compEligible[bestCompIdx]} eligible program{compEligible[bestCompIdx] !== 1 ? 's' : ''}
                {' '}vs {compEligible[bestCompIdx === 0 ? 1 : 0]} in the alternative.
              </div>
            )}
            {compEligible[0] === compEligible[1] && compEligible[0] > 0 && (
              <div style={{
                marginTop: 12, background: '#f0f9ff', border: '1px solid #7dd3fc',
                borderRadius: 7, padding: '8px 14px',
                fontSize: 12, fontWeight: 600, color: '#0369a1',
              }}>
                Both paths yield {compEligible[0]} eligible program{compEligible[0] !== 1 ? 's' : ''} —
                choose based on cost, timeline, and borrower preference.
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
