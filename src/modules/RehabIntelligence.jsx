// src/modules/RehabIntelligence.jsx
// Rehab Intelligence™ — Module 17
// LoanBeacons™ | 5-Step Renovation Loan Wizard

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import REHAB_PRODUCTS, { RENOVATION_COST_RANGES } from '../data/rehabProducts.js';
import {
  buildRehabSummary,
  estimateRenovationCosts,
  calculateAIV,
} from '../engines/RehabEngine.js';
import RehabSummaryCard from '../components/RehabSummaryCard.jsx';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Loan Purpose',    icon: '🏦', short: 'Purpose' },
  { id: 2, label: 'Property & Price', icon: '🏠', short: 'Property' },
  { id: 3, label: 'Renovation Scope', icon: '🔨', short: 'Renovation' },
  { id: 4, label: 'Product Match',   icon: '🎯', short: 'Products' },
  { id: 5, label: 'Summary',         icon: '📋', short: 'Summary' },
];

const PROPERTY_TYPES = [
  { value: 'SFR',         label: 'Single Family (SFR)' },
  { value: '2-4 Unit',    label: '2–4 Unit Multifamily' },
  { value: 'Condo',       label: 'Condo' },
  { value: 'PUD',         label: 'PUD / Townhome' },
  { value: 'Manufactured', label: 'Manufactured Home' },
];

const LOAN_PURPOSES = [
  { value: 'PURCHASE',        label: 'Purchase',            icon: '🛒', desc: 'Buying the property' },
  { value: 'RATE_TERM_REFI',  label: 'Rate/Term Refi',      icon: '🔁', desc: 'Refinancing with renovation' },
  { value: 'CASH_OUT_REFI',   label: 'Cash-Out Refi',       icon: '💵', desc: 'Pulling equity + renovation' },
];

const WORK_CATEGORIES = [
  {
    category: 'Structure & Systems',
    items: [
      { key: 'ROOF_REPLACEMENT',   label: 'Roof Replacement',        structural: false },
      { key: 'FOUNDATION',         label: 'Foundation Repair',       structural: true },
      { key: 'ADDITION',           label: 'Room Addition',            structural: true },
      { key: 'HVAC_REPLACE',       label: 'HVAC Replacement',        structural: false },
      { key: 'ELECTRICAL',         label: 'Electrical/Panel Upgrade', structural: false },
      { key: 'PLUMBING',           label: 'Plumbing Overhaul',       structural: false },
    ],
  },
  {
    category: 'Interior',
    items: [
      { key: 'KITCHEN_REMODEL',    label: 'Kitchen Remodel',         structural: false },
      { key: 'BATH_REMODEL',       label: 'Bathroom Remodel',        structural: false, perUnit: true },
      { key: 'FLOORING',           label: 'Flooring (Whole House)',  structural: false },
      { key: 'WINDOWS',            label: 'Window Replacement',      structural: false },
    ],
  },
  {
    category: 'Exterior & Outdoor',
    items: [
      { key: 'EXTERIOR_PAINT',     label: 'Exterior Paint/Siding',   structural: false },
      { key: 'LANDSCAPE',          label: 'Landscaping',             structural: false },
      { key: 'POOL',               label: 'New Swimming Pool',       structural: false },
    ],
  },
  {
    category: 'Environmental',
    items: [
      { key: 'MOLD_REMEDIATION',   label: 'Mold/Environmental Remediation', structural: false },
    ],
  },
];

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const ACCENT = '#7c3aed';
const ACCENT_LIGHT = '#ede9fe';

const styles = {
  container: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    maxWidth: 900,
    margin: '0 auto',
    padding: '24px 20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
    paddingBottom: 16,
    borderBottom: '2px solid #f1f5f9',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: `linear-gradient(135deg, ${ACCENT} 0%, #a855f7 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  stepNav: {
    display: 'flex',
    gap: 0,
    marginBottom: 28,
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  },
  card: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    fontSize: 14,
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  select: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    fontSize: 14,
    color: '#0f172a',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '10px 22px',
    borderRadius: 8,
    border: 'none',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  btnPrimary: {
    background: ACCENT,
    color: '#fff',
  },
  btnSecondary: {
    background: '#f1f5f9',
    color: '#475569',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#475569',
    background: '#fafafa',
    transition: 'all 0.15s',
    userSelect: 'none',
  },
  toggleActive: {
    borderColor: ACCENT,
    background: ACCENT_LIGHT,
    color: ACCENT,
  },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  divider: { height: 1, background: '#f1f5f9', margin: '16px 0' },
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function formatCurrency(val) {
  if (!val && val !== 0) return '';
  return Number(val).toLocaleString('en-US');
}

function parseCurrency(str) {
  if (!str) return '';
  return str.replace(/[^0-9.]/g, '');
}

function CurrencyInput({ label, value, onChange, placeholder, hint }) {
  const [raw, setRaw] = useState(value ? formatCurrency(value) : '');

  useEffect(() => {
    setRaw(value ? formatCurrency(value) : '');
  }, [value]);

  const handleChange = (e) => {
    const cleaned = parseCurrency(e.target.value);
    setRaw(formatCurrency(Number(cleaned)) || cleaned);
    onChange(Number(cleaned) || 0);
  };

  return (
    <div>
      <label style={styles.label}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>$</span>
        <input
          type="text"
          value={raw}
          onChange={handleChange}
          placeholder={placeholder || '0'}
          style={{ ...styles.input, paddingLeft: 24 }}
        />
      </div>
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange, description }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ ...styles.toggle, ...(checked ? styles.toggleActive : {}) }}
    >
      <span style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `2px solid ${checked ? ACCENT : '#cbd5e1'}`,
        background: checked ? ACCENT : '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 11,
        color: '#fff',
        transition: 'all 0.15s',
      }}>
        {checked && '✓'}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: checked ? '#7c3aed' : '#94a3b8', marginTop: 1 }}>{description}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP COMPONENTS
// ─────────────────────────────────────────────

// STEP 1 — Loan Purpose & Borrower
function Step1({ form, setForm }) {
  return (
    <div>
      <div style={styles.sectionTitle}>🏦 Loan Purpose & Borrower Profile</div>

      {/* Loan Purpose */}
      <label style={styles.label}>Loan Purpose</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {LOAN_PURPOSES.map(p => (
          <div
            key={p.value}
            onClick={() => setForm(f => ({ ...f, loanPurpose: p.value }))}
            style={{
              padding: '14px 12px',
              borderRadius: 10,
              border: `2px solid ${form.loanPurpose === p.value ? ACCENT : '#e2e8f0'}`,
              background: form.loanPurpose === p.value ? ACCENT_LIGHT : '#fafafa',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 4 }}>{p.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: form.loanPurpose === p.value ? ACCENT : '#0f172a' }}>{p.label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      <div style={styles.grid2}>
        <div>
          <label style={styles.label}>Borrower Name</label>
          <input
            type="text"
            value={form.borrowerName || ''}
            onChange={e => setForm(f => ({ ...f, borrowerName: e.target.value }))}
            placeholder="First Last"
            style={styles.input}
          />
        </div>
        <div>
          <label style={styles.label}>Credit Score</label>
          <input
            type="number"
            value={form.creditScore || ''}
            onChange={e => setForm(f => ({ ...f, creditScore: Number(e.target.value) }))}
            placeholder="680"
            min={500}
            max={850}
            style={styles.input}
          />
        </div>
      </div>

      <div style={{ ...styles.divider, margin: '20px 0' }} />

      <div style={styles.sectionTitle}>👤 Borrower Flags</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Toggle
          label="VA Eligible"
          description="Veteran / active duty with entitlement"
          checked={form.isVAEligible}
          onChange={v => setForm(f => ({ ...f, isVAEligible: v }))}
        />
        <Toggle
          label="Owner Occupied"
          description="Borrower intends to occupy as primary residence"
          checked={form.isOwnerOccupied}
          onChange={v => setForm(f => ({ ...f, isOwnerOccupied: v }))}
        />
        <div style={{ marginTop: 4 }}>
          <label style={styles.label}>Borrower Type</label>
          <select
            value={form.borrowerType}
            onChange={e => setForm(f => ({ ...f, borrowerType: e.target.value }))}
            style={styles.select}
          >
            <option value="PRIMARY">Primary Residence</option>
            <option value="SECONDARY">Second Home</option>
            <option value="INVESTMENT">Investment Property</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// STEP 2 — Property & Price
function Step2({ form, setForm }) {
  const isPurchase = form.loanPurpose === 'PURCHASE';

  return (
    <div>
      <div style={styles.sectionTitle}>🏠 Property Details</div>

      <div style={{ marginBottom: 16 }}>
        <label style={styles.label}>Property Address</label>
        <input
          type="text"
          value={form.propertyAddress || ''}
          onChange={e => setForm(f => ({ ...f, propertyAddress: e.target.value }))}
          placeholder="123 Main St, City, ST 00000"
          style={styles.input}
        />
      </div>

      <div style={{ ...styles.grid2, marginBottom: 16 }}>
        <div>
          <label style={styles.label}>Property Type</label>
          <select
            value={form.propertyType}
            onChange={e => setForm(f => ({ ...f, propertyType: e.target.value }))}
            style={styles.select}
          >
            {PROPERTY_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>Number of Units</label>
          <select
            value={form.units}
            onChange={e => setForm(f => ({ ...f, units: Number(e.target.value) }))}
            style={styles.select}
          >
            <option value={1}>1 Unit</option>
            <option value={2}>2 Units</option>
            <option value={3}>3 Units</option>
            <option value={4}>4 Units</option>
          </select>
        </div>
      </div>

      <div style={{ ...styles.divider, margin: '16px 0' }} />
      <div style={styles.sectionTitle}>💵 Pricing</div>

      <div style={{ ...styles.grid2, marginBottom: 16 }}>
        {isPurchase ? (
          <CurrencyInput
            label="Purchase Price"
            value={form.purchasePrice}
            onChange={v => setForm(f => ({ ...f, purchasePrice: v }))}
            placeholder="350,000"
          />
        ) : (
          <CurrencyInput
            label="Current Appraised Value"
            value={form.currentValue}
            onChange={v => setForm(f => ({ ...f, currentValue: v }))}
            placeholder="350,000"
          />
        )}
        <CurrencyInput
          label="After-Improved Value (AIV)"
          value={form.appraisedAIV}
          onChange={v => setForm(f => ({ ...f, appraisedAIV: v || null }))}
          placeholder="Optional — from appraiser"
          hint="Leave blank if appraiser's value not yet known"
        />
      </div>

      <div>
        <Toggle
          label="High-Cost Area"
          description="Property in a high-cost or super-conforming county"
          checked={form.isHighCostArea}
          onChange={v => setForm(f => ({ ...f, isHighCostArea: v }))}
        />
      </div>
    </div>
  );
}

// STEP 3 — Renovation Scope
function Step3({ form, setForm }) {
  const selected = form.rehabItems || {};
  const hasStructural = Object.entries(selected).some(([key, qty]) => {
    if (!qty) return false;
    for (const cat of WORK_CATEGORIES) {
      const item = cat.items.find(i => i.key === key);
      if (item?.structural) return true;
    }
    return false;
  });

  const toggleItem = (key) => {
    setForm(f => {
      const current = { ...f.rehabItems };
      if (current[key]) {
        delete current[key];
      } else {
        current[key] = 1;
      }
      return { ...f, rehabItems: current, hasStructuralWork: computeStructural(current) };
    });
  };

  const setQty = (key, qty) => {
    setForm(f => {
      const current = { ...f.rehabItems, [key]: qty };
      return { ...f, rehabItems: current };
    });
  };

  const computeStructural = (items) => {
    return Object.entries(items).some(([key, qty]) => {
      if (!qty) return false;
      for (const cat of WORK_CATEGORIES) {
        const item = cat.items.find(i => i.key === key);
        if (item?.structural) return true;
      }
      return false;
    });
  };

  // Estimate
  const selectedItems = Object.entries(selected).map(([key, quantity]) => ({ key, quantity }));
  const estimate = estimateRenovationCosts(selectedItems);

  const fmt = (n) => n ? `$${n.toLocaleString()}` : '$0';

  return (
    <div>
      <div style={styles.sectionTitle}>🔨 Renovation Scope</div>

      {/* Work categories */}
      {WORK_CATEGORIES.map(cat => (
        <div key={cat.category} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {cat.category}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cat.items.map(item => {
              const isSelected = !!selected[item.key];
              const range = RENOVATION_COST_RANGES[item.key];
              return (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${isSelected ? ACCENT : '#e2e8f0'}`,
                    background: isSelected ? ACCENT_LIGHT : '#fafafa',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  <div
                    onClick={() => toggleItem(item.key)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${isSelected ? ACCENT : '#cbd5e1'}`,
                      background: isSelected ? ACCENT : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#fff',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected && '✓'}
                  </div>
                  <div style={{ flex: 1 }} onClick={() => toggleItem(item.key)}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: isSelected ? ACCENT : '#334155' }}>
                      {item.label}
                      {item.structural && (
                        <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                          STRUCTURAL
                        </span>
                      )}
                    </span>
                  </div>
                  {range && (
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                      {fmt(range.low)}–{fmt(range.high)}
                    </span>
                  )}
                  {isSelected && item.perUnit && (
                    <div onClick={e => e.stopPropagation()}>
                      <select
                        value={selected[item.key] || 1}
                        onChange={e => setQty(item.key, Number(e.target.value))}
                        style={{ ...styles.select, width: 60, padding: '3px 6px', fontSize: 12 }}
                      >
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}×</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Manual override */}
      <div style={{ ...styles.divider, margin: '16px 0' }} />
      <div style={styles.sectionTitle}>✏️ Renovation Budget</div>
      <div style={styles.grid2}>
        <CurrencyInput
          label="Total Renovation Cost"
          value={form.rehabCost}
          onChange={v => setForm(f => ({ ...f, rehabCost: v }))}
          placeholder="50,000"
          hint="Use the estimator above or enter contractor bid"
        />
        <div style={{
          padding: '12px 14px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Scope Estimator
          </div>
          {selectedItems.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Select work items above</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 2 }}>
                Mid estimate: <strong>{fmt(estimate.subtotalMid)}</strong>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                w/ {(estimate.contingencyPct * 100).toFixed(0)}% contingency: {fmt(estimate.totalWithContingencyMid)}
              </div>
              {hasStructural && (
                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                  ⚠️ Structural work — 20% contingency applied
                </div>
              )}
              <button
                onClick={() => setForm(f => ({ ...f, rehabCost: estimate.totalWithContingencyMid }))}
                style={{
                  marginTop: 8,
                  ...styles.btn,
                  ...styles.btnSecondary,
                  padding: '5px 10px',
                  fontSize: 11,
                }}
              >
                Use this estimate →
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Toggle
          label="Includes Structural Work"
          description="Additions, foundation, structural modifications"
          checked={form.hasStructuralWork || hasStructural}
          onChange={v => setForm(f => ({ ...f, hasStructuralWork: v }))}
        />
      </div>
    </div>
  );
}

// STEP 4 — Product Match
function Step4({ form, summary, selectedProductId, onProductSelect }) {
  if (!summary) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
        <div style={{ fontSize: 32 }}>⏳</div>
        <div style={{ marginTop: 8 }}>Calculating product eligibility…</div>
      </div>
    );
  }

  const { screening } = summary;

  return (
    <div>
      <div style={styles.sectionTitle}>🎯 Product Eligibility Match</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        {screening.eligibleProducts.length > 0
          ? `${screening.eligibleProducts.length} of 5 renovation products eligible for this scenario. Select one to generate talking points.`
          : 'No products currently eligible. Review the flags below and adjust the scenario.'}
      </div>
      <RehabSummaryCard
        summary={summary}
        selectedProductId={selectedProductId}
        onProductSelect={onProductSelect}
      />
    </div>
  );
}

// STEP 5 — Summary
function Step5({ summary, selectedProductId }) {
  if (!summary) return null;

  const selected = selectedProductId
    ? summary.screening.results[selectedProductId]
    : summary.screening.eligibleProducts[0];

  const product = selected?.product;

  const copyToClipboard = () => {
    const text = buildTextSummary(summary, selected);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div>
      <div style={styles.sectionTitle}>📋 Rehab Intelligence™ Summary</div>

      {/* Header info */}
      <div style={{
        padding: '14px 16px',
        background: '#f8fafc',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        marginBottom: 16,
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Borrower</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{summary.borrowerName || '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Address</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{summary.propertyAddress || '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Purpose</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{summary.loanPurpose?.replace('_', ' ')}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Rehab Budget</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT }}>${summary.rehabCost?.toLocaleString()}</div>
        </div>
      </div>

      {/* Recommended product */}
      {selected?.eligible && (
        <div style={{
          padding: '14px 16px',
          background: `linear-gradient(135deg, ${product.color}12 0%, ${product.color}06 100%)`,
          border: `2px solid ${product.color}40`,
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: product.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {selected === summary.screening.eligibleProducts[0] && !selectedProductId ? '⭐ Recommended Product' : '✓ Selected Product'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{product.name}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {selected.loanCalc && (
              <>
                <Stat label="Max Loan" value={`$${selected.loanCalc.maxLoanAmount?.toLocaleString()}`} />
                <Stat label="Max LTV" value={`${(selected.loanCalc.maxLTV * 100).toFixed(1)}%`} />
                {selected.loanCalc.minDownPayment > 0 && (
                  <Stat label="Min Down" value={`$${selected.loanCalc.minDownPayment?.toLocaleString()}`} />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Full product grid */}
      <RehabSummaryCard
        summary={summary}
        selectedProductId={selectedProductId || selected?.productId}
        onProductSelect={() => {}}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          onClick={copyToClipboard}
          style={{ ...styles.btn, ...styles.btnSecondary }}
        >
          📋 Copy Summary
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function buildTextSummary(summary, selected) {
  const lines = [
    `REHAB INTELLIGENCE™ — LoanBeacons`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `BORROWER: ${summary.borrowerName || '—'}`,
    `PROPERTY: ${summary.propertyAddress || '—'}`,
    `PURPOSE: ${summary.loanPurpose?.replace('_', ' ')}`,
    `REHAB BUDGET: $${summary.rehabCost?.toLocaleString()}`,
    ``,
    `RECOMMENDED PRODUCT: ${selected?.product?.name || '—'}`,
    selected?.loanCalc ? `MAX LOAN: $${selected.loanCalc.maxLoanAmount?.toLocaleString()}` : '',
    selected?.loanCalc ? `MAX LTV: ${(selected.loanCalc.maxLTV * 100).toFixed(1)}%` : '',
    ``,
    `ELIGIBLE PRODUCTS:`,
    ...(summary.screening.eligibleProducts.map(r =>
      `  ✓ ${r.product.name} — Max Loan: $${r.loanCalc?.maxLoanAmount?.toLocaleString()}`
    )),
    ``,
    `INELIGIBLE:`,
    ...(summary.screening.ineligibleProducts.map(r =>
      `  ✗ ${r.product.name}: ${r.flags.join('; ')}`
    )),
  ];
  return lines.filter(l => l !== null).join('\n');
}

// ─────────────────────────────────────────────
// MAIN MODULE
// ─────────────────────────────────────────────

const DEFAULT_FORM = {
  loanPurpose: 'PURCHASE',
  borrowerName: '',
  creditScore: 700,
  isVAEligible: false,
  isOwnerOccupied: true,
  borrowerType: 'PRIMARY',
  propertyAddress: '',
  propertyType: 'SFR',
  units: 1,
  purchasePrice: 0,
  currentValue: 0,
  appraisedAIV: null,
  isHighCostArea: false,
  rehabCost: 0,
  rehabItems: {},
  hasStructuralWork: false,
};

export default function RehabIntelligence() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [summary, setSummary] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);

  // Auto-populate from URL params (scenario handoff)
  useEffect(() => {
    const updates = {};
    if (searchParams.get('borrowerName')) updates.borrowerName = searchParams.get('borrowerName');
    if (searchParams.get('purchasePrice')) updates.purchasePrice = Number(searchParams.get('purchasePrice'));
    if (searchParams.get('creditScore')) updates.creditScore = Number(searchParams.get('creditScore'));
    if (Object.keys(updates).length > 0) {
      setForm(f => ({ ...f, ...updates }));
    }
  }, [searchParams]);

  // Rebuild summary whenever form changes and we're on step 4+
  useEffect(() => {
    if (step >= 4) {
      recompute();
    }
  }, [form, step]);

  const recompute = useCallback(() => {
    try {
      const s = buildRehabSummary({
        ...form,
        purchasePrice: form.purchasePrice || 0,
        currentValue: form.currentValue || 0,
        rehabCost: form.rehabCost || 0,
        appraisedAIV: form.appraisedAIV || null,
      });
      setSummary(s);
    } catch (e) {
      console.error('RehabEngine error:', e);
    }
  }, [form]);

  const canAdvance = () => {
    if (step === 1) return !!form.loanPurpose;
    if (step === 2) {
      const hasValue = form.loanPurpose === 'PURCHASE' ? form.purchasePrice > 0 : form.currentValue > 0;
      return hasValue;
    }
    if (step === 3) return form.rehabCost > 0;
    return true;
  };

  const advance = () => {
    if (step < 5) {
      if (step === 3) recompute();
      setStep(s => s + 1);
    }
  };

  const back = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const handleProductSelect = (productId) => {
    setSelectedProductId(productId);
    // Rebuild talking points for selected product
    if (summary) {
      setSummary(prev => ({
        ...prev,
        talkingPoints: prev.screening.results[productId]?.eligible
          ? generateTalkingPointsForProduct(productId, prev)
          : prev.talkingPoints,
        selectedProduct: prev.screening.results[productId],
      }));
    }
  };

  const generateTalkingPointsForProduct = (productId, sum) => {
    const { generateTalkingPoints } = require('../engines/RehabEngine.js');
    return generateTalkingPoints({
      productId,
      loanCalc: sum.screening.results[productId]?.loanCalc,
      aivData: sum.aivData,
      rehabCost: sum.rehabCost,
      loanPurpose: sum.loanPurpose,
    });
  };

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>🏚️</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Rehab Intelligence™</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>Module 17 · Renovation Loan Structuring</div>
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{ ...styles.btn, ...styles.btnSecondary, marginLeft: 'auto', fontSize: 12 }}
        >
          ← Dashboard
        </button>
      </div>

      {/* Step Navigator */}
      <div style={styles.stepNav}>
        {STEPS.map((s, i) => {
          const isActive = step === s.id;
          const isComplete = step > s.id;
          return (
            <div
              key={s.id}
              onClick={() => isComplete && setStep(s.id)}
              style={{
                flex: 1,
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                background: isActive ? ACCENT : isComplete ? '#f5f3ff' : '#fafafa',
                borderRight: i < STEPS.length - 1 ? '1px solid #e2e8f0' : 'none',
                cursor: isComplete ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{isComplete ? '✓' : s.icon}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: isActive ? '#fff' : isComplete ? ACCENT : '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {s.short}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div style={styles.card}>
        {step === 1 && <Step1 form={form} setForm={setForm} />}
        {step === 2 && <Step2 form={form} setForm={setForm} />}
        {step === 3 && <Step3 form={form} setForm={setForm} />}
        {step === 4 && (
          <Step4
            form={form}
            summary={summary}
            selectedProductId={selectedProductId}
            onProductSelect={handleProductSelect}
          />
        )}
        {step === 5 && (
          <Step5
            summary={summary}
            selectedProductId={selectedProductId}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {step > 1 && (
            <button onClick={back} style={{ ...styles.btn, ...styles.btnSecondary }}>
              ← Back
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Step {step} of {STEPS.length}</span>
          {step < 5 && (
            <button
              onClick={advance}
              disabled={!canAdvance()}
              style={{
                ...styles.btn,
                ...styles.btnPrimary,
                opacity: canAdvance() ? 1 : 0.45,
                cursor: canAdvance() ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 4 ? 'View Summary →' : 'Continue →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
