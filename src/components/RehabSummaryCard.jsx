// src/components/RehabSummaryCard.jsx
// Rehab Intelligence™ — Summary Card Component
// LoanBeacons™ Module 17

import React from 'react';

const fmt = (n) => n?.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) ?? '—';
const pct = (n) => n !== null && n !== undefined ? `${(n * 100).toFixed(1)}%` : '—';

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────
function StatusBadge({ eligible }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      background: eligible ? '#dcfce7' : '#fee2e2',
      color: eligible ? '#16a34a' : '#dc2626',
    }}>
      {eligible ? '✓ Eligible' : '✗ Ineligible'}
    </span>
  );
}

// ─────────────────────────────────────────────
// PRODUCT RESULT CARD
// ─────────────────────────────────────────────
function ProductResultCard({ result, isSelected, onSelect }) {
  const { product, eligible, flags, advisories, loanCalc } = result;

  return (
    <div
      onClick={() => eligible && onSelect?.(product.id)}
      style={{
        border: isSelected
          ? `2px solid ${product.color}`
          : eligible
            ? '1.5px solid #e2e8f0'
            : '1.5px solid #f1f5f9',
        borderRadius: '10px',
        padding: '14px 16px',
        background: isSelected ? `${product.color}08` : eligible ? '#fff' : '#fafafa',
        cursor: eligible ? 'pointer' : 'default',
        opacity: eligible ? 1 : 0.65,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: product.color,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{product.name}</span>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 7px',
              borderRadius: 4,
              background: `${product.color}18`,
              color: product.color,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>{product.badge}</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>{product.agency}</span>
        </div>
        <StatusBadge eligible={eligible} />
      </div>

      {/* Loan metrics (if eligible) */}
      {eligible && loanCalc && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          margin: '10px 0',
          padding: '10px',
          background: '#f8fafc',
          borderRadius: 8,
        }}>
          <Metric label="Max Loan" value={fmt(loanCalc.maxLoanAmount)} accent={product.color} />
          <Metric label="Max LTV" value={pct(loanCalc.maxLTV)} />
          <Metric label="Min Down" value={loanCalc.minDownPayment > 0 ? fmt(loanCalc.minDownPayment) : 'None'} />
        </div>
      )}

      {/* Ineligibility flags */}
      {!eligible && flags.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {flags.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
              <span style={{ color: '#ef4444', fontSize: 12, marginTop: 1 }}>✗</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Advisory notes */}
      {eligible && advisories.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {advisories.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
              <span style={{ color: '#f59e0b', fontSize: 11 }}>ℹ</span>
              <span style={{ fontSize: 11, color: '#78716c', lineHeight: 1.4 }}>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: product.color,
          color: '#fff',
          borderRadius: '50%',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
        }}>✓</div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent || '#0f172a' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AIV SUMMARY PANEL
// ─────────────────────────────────────────────
function AIVPanel({ aivData, loanPurpose }) {
  if (!aivData) return null;
  const isPurchase = loanPurpose === 'PURCHASE';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      borderRadius: 12,
      padding: '16px 20px',
      color: '#fff',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10 }}>
        AIV Analysis
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
            {isPurchase ? 'Purchase Price' : 'Current Value'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {fmt(isPurchase ? aivData.costBasis - (aivData.rehabCost || 0) : aivData.costBasis - (aivData.rehabCost || 0))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Renovation Budget</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(aivData.costBasis - (aivData.costBasis - (aivData.rehabCost || 0)))}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Cost Basis</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(aivData.costBasis)}</div>
        </div>
        {aivData.confirmedAIV && (
          <div>
            <div style={{ fontSize: 11, color: '#64d08c', marginBottom: 2 }}>Appraised AIV ✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#64d08c' }}>{fmt(aivData.confirmedAIV)}</div>
          </div>
        )}
        {aivData.renovationROI !== null && (
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #334155', paddingTop: 10, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Renovation ROI</span>
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: aivData.renovationROI > 0 ? '#64d08c' : '#f87171',
              }}>
                {aivData.renovationROI.toFixed(0)}%
                {aivData.valueLift > 0 && ` (+${fmt(aivData.valueLift)} value lift)`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TALKING POINTS PANEL
// ─────────────────────────────────────────────
function TalkingPointsPanel({ points, productColor }) {
  if (!points || points.length === 0) return null;

  const typeColors = {
    strength: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
    process: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
    caution: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309' },
    option: { bg: '#fdf4ff', border: '#d8b4fe', text: '#7e22ce' },
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Borrower Talking Points
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {points.map((p, i) => {
          const colors = typeColors[p.type] || typeColors.process;
          return (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{p.icon}</span>
              <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{p.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function RehabSummaryCard({
  summary,
  selectedProductId,
  onProductSelect,
}) {
  if (!summary) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🏚️</div>
        <div style={{ fontSize: 14 }}>Complete the wizard to see product eligibility</div>
      </div>
    );
  }

  const { aivData, screening, talkingPoints, loanPurpose } = summary;
  const { eligibleProducts, ineligibleProducts } = screening;

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* AIV Panel */}
      <AIVPanel aivData={aivData} loanPurpose={loanPurpose} />

      {/* Eligible Products */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Eligible Products ({eligibleProducts.length})
          </span>
          {eligibleProducts.length > 0 && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Select to deep-dive</span>
          )}
        </div>

        {eligibleProducts.length === 0 ? (
          <div style={{
            padding: '16px',
            background: '#fff1f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            fontSize: 13,
            color: '#dc2626',
            textAlign: 'center',
          }}>
            No eligible products found for this scenario. Review borrower qualifications or renovation scope.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {eligibleProducts.map(result => (
              <ProductResultCard
                key={result.productId}
                result={result}
                isSelected={selectedProductId === result.productId}
                onSelect={onProductSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ineligible Products (collapsed) */}
      {ineligibleProducts.length > 0 && (
        <details style={{ marginBottom: 20 }}>
          <summary style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: 'pointer',
            marginBottom: 8,
            userSelect: 'none',
          }}>
            Ineligible Products ({ineligibleProducts.length}) — expand to see why
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {ineligibleProducts.map(result => (
              <ProductResultCard
                key={result.productId}
                result={result}
                isSelected={false}
                onSelect={null}
              />
            ))}
          </div>
        </details>
      )}

      {/* Talking Points */}
      {talkingPoints?.length > 0 && (
        <TalkingPointsPanel
          points={talkingPoints}
          productColor={screening.results[selectedProductId]?.product?.color}
        />
      )}
    </div>
  );
}
