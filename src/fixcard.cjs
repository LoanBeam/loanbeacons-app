const fs = require('fs');
const code = `import React, { useState } from 'react';

const fmt = (n) => n?.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) ?? '-';
const pct = (n) => n !== null && n !== undefined ? ((n * 100).toFixed(1) + '%') : '-';

function StatusBadge({ eligible }) {
  return <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', background: eligible ? '#dcfce7' : '#fee2e2', color: eligible ? '#16a34a' : '#dc2626' }}>{eligible ? 'Eligible' : 'Ineligible'}</span>;
}

function Metric({ label, value, accent }) {
  return <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 700, color: accent || '#0f172a' }}>{value}</div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginTop: 2 }}>{label}</div></div>;
}

function ROITooltip({ aivData }) {
  const [visible, setVisible] = useState(false);
  const isNegative = aivData.renovationROI <= 0;
  const color = isNegative ? '#f87171' : '#64d08c';
  const roiLabel = aivData.renovationROI.toFixed(0) + '%';
  const liftLabel = aivData.valueLift > 0 ? ' (+' + Math.round(aivData.valueLift).toLocaleString() + ' value lift)' : '';
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: color, cursor: 'help', borderBottom: '1px dashed ' + color }} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
        {roiLabel}{liftLabel}
      </span>
      {visible && (
        <div style={{ position: 'absolute', bottom: '125%', right: 0, width: 260, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', zIndex: 100 }}>
          {isNegative ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>Negative ROI - Review Scenario</div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginBottom: 8 }}>All-in cost exceeds the after-improved value. Borrower may be over-improving for the market.</div>
              <div style={{ fontSize: 11, color: '#fcd34d', lineHeight: 1.8 }}>Suggestions: Re-scope renovation costs, challenge AIV comparables, or verify appraisal reflects all improvements.</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64d08c', marginBottom: 6 }}>Positive ROI</div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>The renovation generates more value than it costs. The borrower builds equity through the rehab.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AIVPanel({ aivData, loanPurpose, rehabCost, baseValue }) {
  if (!aivData) return null;
  const isPurchase = loanPurpose === 'PURCHASE';
  return (
    <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: 12, padding: '16px 20px', color: '#fff', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10 }}>AIV Analysis</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{isPurchase ? 'Purchase Price' : 'Current Value'}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(baseValue)}</div></div>
        <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Renovation Budget</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(rehabCost)}</div></div>
        <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Cost Basis</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(aivData.costBasis)}</div></div>
        {aivData.confirmedAIV && <div><div style={{ fontSize: 11, color: '#64d08c', marginBottom: 2 }}>Appraised AIV</div><div style={{ fontSize: 18, fontWeight: 700, color: '#64d08c' }}>{fmt(aivData.confirmedAIV)}</div></div>}
        {aivData.renovationROI !== null && (
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #334155', paddingTop: 10, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Renovation ROI</span>
              <ROITooltip aivData={aivData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductResultCard({ result, isSelected, onSelect }) {
  const { product, eligible, flags, advisories, loanCalc } = result;
  return (
    <div onClick={() => eligible && onSelect && onSelect(result.productId)} style={{ border: isSelected ? '2px solid ' + product.color : eligible ? '1.5px solid #e2e8f0' : '1.5px solid #f1f5f9', borderRadius: '10px', padding: '14px 16px', background: isSelected ? product.color + '08' : eligible ? '#fff' : '#fafafa', cursor: eligible ? 'pointer' : 'default', opacity: eligible ? 1 : 0.65, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: product.color }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{product.name}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: product.color + '18', color: product.color, textTransform: 'uppercase' }}>{product.badge}</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>{product.agency}</span>
        </div>
        <StatusBadge eligible={eligible} />
      </div>
      {eligible && loanCalc && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '10px 0', padding: '10px', background: '#f8fafc', borderRadius: 8 }}>
          <Metric label='Max Loan' value={fmt(loanCalc.maxLoanAmount)} accent={product.color} />
          <Metric label='Max LTV' value={pct(loanCalc.maxLTV)} />
          <Metric label='Min Down' value={loanCalc.minDownPayment > 0 ? fmt(loanCalc.minDownPayment) : 'None'} />
        </div>
      )}
      {!eligible && flags.length > 0 && <div style={{ marginTop: 8 }}>{flags.map((f, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}><span style={{ color: '#ef4444', fontSize: 12 }}>x</span><span style={{ fontSize: 12, color: '#64748b' }}>{f}</span></div>)}</div>}
      {eligible && advisories && advisories.length > 0 && <div style={{ marginTop: 6 }}>{advisories.map((a, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}><span style={{ color: '#f59e0b', fontSize: 11 }}>i</span><span style={{ fontSize: 11, color: '#78716c', lineHeight: 1.4 }}>{a}</span></div>)}</div>}
      {isSelected && <div style={{ position: 'absolute', top: 10, right: 10, background: product.color, color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>ok</div>}
    </div>
  );
}

function TalkingPointsPanel({ points }) {
  if (!points || points.length === 0) return null;
  const typeColors = { strength: { bg: '#f0fdf4', border: '#86efac' }, process: { bg: '#eff6ff', border: '#93c5fd' }, caution: { bg: '#fffbeb', border: '#fcd34d' }, option: { bg: '#fdf4ff', border: '#d8b4fe' } };
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>Borrower Talking Points</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {points.map((p, i) => { const colors = typeColors[p.type] || typeColors.process; return <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: colors.bg, border: '1px solid ' + colors.border, borderRadius: 8 }}><span style={{ fontSize: 16, flexShrink: 0 }}>{p.icon}</span><span style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{p.text}</span></div>; })}
      </div>
    </div>
  );
}

export default function RehabSummaryCard({ summary, selectedProductId, onProductSelect }) {
  if (!summary) return <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}><div style={{ fontSize: 14 }}>Complete the wizard to see product eligibility</div></div>;
  const { aivData, screening, talkingPoints, loanPurpose, rehabCost, purchasePrice, currentValue } = summary;
  const { eligibleProducts, ineligibleProducts } = screening;
  const baseValue = loanPurpose === 'PURCHASE' ? purchasePrice : currentValue;
  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <AIVPanel aivData={aivData} loanPurpose={loanPurpose} rehabCost={rehabCost} baseValue={baseValue} />
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Eligible Products ({eligibleProducts.length})</span>
          {eligibleProducts.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>Select to deep-dive</span>}
        </div>
        {eligibleProducts.length === 0
          ? <div style={{ padding: '16px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', textAlign: 'center' }}>No eligible products found.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{eligibleProducts.map(r => <ProductResultCard key={r.productId} result={r} isSelected={selectedProductId === r.productId} onSelect={onProductSelect} />)}</div>
        }
      </div>
      {ineligibleProducts.length > 0 && (
        <details style={{ marginBottom: 20 }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>Ineligible Products ({ineligibleProducts.length}) - expand to see why</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>{ineligibleProducts.map(r => <ProductResultCard key={r.productId} result={r} isSelected={false} onSelect={null} />)}</div>
        </details>
      )}
      {talkingPoints && talkingPoints.length > 0 && <TalkingPointsPanel points={talkingPoints} />}
    </div>
  );
}
`;
fs.writeFileSync('src/components/RehabSummaryCard.jsx', code);
console.log('Written: ' + code.length + ' chars');