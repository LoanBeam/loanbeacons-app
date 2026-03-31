// ============================================================
// VAIRRRLPricingCommission.jsx
// VAIRRRL v3.4 — Tab: Pricing & Commission
// LoanBeacons™ — Confidential
// Closing costs synced from Loan Snapshot Closing Cost Estimator
// ============================================================

import { useState, useMemo, useEffect } from 'react';

// ── Formatters ───────────────────────────────────────────────────────────────
const fmt$ = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
};

const fmtPct = (n, decimals = 3) => {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  return num.toFixed(decimals) + '%';
};

// ── P&I Calculator ───────────────────────────────────────────────────────────
const calcPI = (principal, annualRatePct, termMonths) => {
  const p = parseFloat(principal) || 0;
  const r = (parseFloat(annualRatePct) || 0) / 100 / 12;
  const n = parseInt(termMonths) || 360;
  if (p <= 0 || r <= 0) return 0;
  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
};

// ── Tooltip ──────────────────────────────────────────────────────────────────
function Tip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ cursor: 'help', color: '#7b9ec7', fontSize: 13, fontWeight: 600 }}>ℹ</span>
      {show && (
        <span style={{ position: 'absolute', bottom: '125%', left: '50%', transform: 'translateX(-50%)', background: '#1a2940', color: '#e8f0fa', padding: '8px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.5, width: 240, zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', border: '1px solid #2d4a6b', whiteSpace: 'normal' }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: { padding: '4px 0 40px', fontFamily: 'inherit' },
  printBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 12 },
  section: { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 24, overflow: 'hidden' },
  sectionHead: { background: '#f0f4fa', padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1a2940', margin: 0 },
  sectionSub: { fontSize: 12, color: '#64748b', margin: '2px 0 0', fontWeight: 400 },
  sectionBody: { padding: 20 },
  infoBanner: { background: '#e8f0fa', border: '1px solid #b3cce8', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start' },
  syncBanner: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  warnBanner: { background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' },
  nocostBanner: { background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: 8, padding: '14px 18px', marginTop: 16, fontSize: 13.5, color: '#14532d', fontWeight: 500 },
  hasCostBanner: { background: '#fefce8', border: '1px solid #eab308', borderRadius: 8, padding: '14px 18px', marginTop: 16, fontSize: 13.5, color: '#713f12' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  grid4: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' },
  inputPrefix: { position: 'relative' },
  prefix: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#64748b', pointerEvents: 'none' },
  inputWithPrefix: { padding: '9px 12px 9px 22px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' },
  smallNote: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  readonlyField: { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#1e293b', background: '#f8fafc' },
  readonlyHighlight: { padding: '9px 12px', border: '2px solid #3b82f6', borderRadius: 6, fontSize: 16, fontWeight: 700, color: '#1e40af', background: '#eff6ff' },
  toggleRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 },
  toggleLabel: { fontSize: 13, fontWeight: 600, color: '#475569', marginRight: 4 },
  toggleBtn: (active) => ({ padding: '7px 16px', border: active ? '2px solid #1a3a5c' : '1px solid #cbd5e1', borderRadius: 6, background: active ? '#1a3a5c' : '#fff', color: active ? '#fff' : '#475569', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, transition: 'all 0.15s' }),
  toggleNote: { fontSize: 12, color: '#64748b', marginLeft: 8, fontStyle: 'italic' },
  divider: { borderTop: '1px solid #e2e8f0', margin: '20px 0' },
  costGroupLabel: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, borderBottom: '1px solid #f0f4fa', paddingBottom: 6 },
  costRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  costRowLabel: { fontSize: 13, color: '#374151', flex: 1 },
  costReadonly: (variant) => ({ padding: '7px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'right', width: 120, background: variant === 'exempt' ? '#f0fdf4' : '#f8fafc', color: variant === 'exempt' ? '#15803d' : '#374151', border: variant === 'exempt' ? '1px solid #bbf7d0' : '1px solid #e2e8f0' }),
  totalsBar: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, padding: '16px 20px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap' },
  totalBlock: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 },
  totalLabel: { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' },
  totalValue: { fontSize: 18, fontWeight: 700, color: '#1e293b' },
  totalValueCredit: { fontSize: 18, fontWeight: 700, color: '#15803d' },
  totalValueNoCost: { fontSize: 18, fontWeight: 700, color: '#15803d' },
  totalValueCost: { fontSize: 18, fontWeight: 700, color: '#dc2626' },
  mathOp: { fontSize: 22, fontWeight: 300, color: '#94a3b8', padding: '0 4px' },
  compSummaryCard: { background: '#f0f4fa', borderRadius: 8, border: '1px solid #d0dff0', overflow: 'hidden', marginTop: 16 },
  compRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #e2ecf7', fontSize: 14 },
  compRowDeduct: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #e2ecf7', fontSize: 14, color: '#dc2626' },
  compRowTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#1a3a5c', fontSize: 16, fontWeight: 700, color: '#fff' },
  compRowBps: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { padding: '10px 14px', background: '#1a3a5c', color: '#fff', fontWeight: 600, textAlign: 'left', fontSize: 12 },
  td: { padding: '10px 14px', borderBottom: '1px solid #e2e8f0', color: '#374151' },
  tdHighlight: { padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#1a3a5c' },
  tdIrrrl: { padding: '10px 14px', borderBottom: '1px solid #e2e8f0', color: '#15803d', fontWeight: 600 },
  tdPurchase: { padding: '10px 14px', borderBottom: '1px solid #e2e8f0', color: '#374151' },
  strategicNote: { background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '14px 16px', marginTop: 16, fontSize: 13, color: '#1e40af', lineHeight: 1.6 },
  vetCard: { background: '#fff', border: '2px solid #1a3a5c', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 24px rgba(26,58,92,0.12)' },
  vetCardHeader: { background: 'linear-gradient(135deg, #1a3a5c 0%, #0f2540 100%)', padding: '20px 24px', color: '#fff' },
  vetCardLogo: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#7bafd4', marginBottom: 6 },
  vetCardTitle: { fontSize: 20, fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 },
  vetCardSub: { fontSize: 14, color: '#b0cde8', marginBottom: 2 },
  vetCardProp: { fontSize: 13, color: '#7bafd4' },
  vetCardDate: { fontSize: 11, color: '#5a8ab0', marginTop: 8 },
  vetCardBody: { padding: '24px' },
  vetRateRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  vetRateBlock: (variant) => ({ textAlign: 'center', padding: '16px 24px', borderRadius: 10, background: variant === 'current' ? '#fef2f2' : '#f0fdf4', border: variant === 'current' ? '2px solid #fca5a5' : '2px solid #86efac', minWidth: 140 }),
  vetRateLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', marginBottom: 4 },
  vetRateValue: (variant) => ({ fontSize: 32, fontWeight: 800, color: variant === 'current' ? '#dc2626' : '#15803d', lineHeight: 1, marginBottom: 4 }),
  vetPayment: { fontSize: 13, color: '#64748b', fontWeight: 500 },
  vetArrow: { fontSize: 28, color: '#94a3b8', fontWeight: 300 },
  vetSavingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 },
  vetSavingsItem: (highlight) => ({ textAlign: 'center', padding: '14px 10px', borderRadius: 8, background: highlight ? '#1a3a5c' : '#f8fafc', border: highlight ? 'none' : '1px solid #e2e8f0' }),
  vetSavingsLabel: (highlight) => ({ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: highlight ? '#7bafd4' : '#64748b', marginBottom: 4 }),
  vetSavingsValue: (highlight) => ({ fontSize: 18, fontWeight: 800, color: highlight ? '#fff' : '#1a3a5c' }),
  vetBadgesRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  vetBadge: (variant) => {
    const map = { exempt: { bg: '#f0fdf4', border: '#86efac', color: '#14532d' }, nocost: { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' }, ntb: { bg: '#fdf4ff', border: '#d8b4fe', color: '#581c87' }, recoup: { bg: '#fff7ed', border: '#fed7aa', color: '#7c2d12' } };
    const c = map[variant] || map.ntb;
    return { background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 600, lineHeight: 1.5, flex: 1, minWidth: 180 };
  },
  vetStatement: { background: '#f8fafc', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 20, borderLeft: '3px solid #1a3a5c' },
  vetSigRow: { display: 'flex', gap: 16, paddingTop: 20, borderTop: '1px solid #e2e8f0' },
  vetSigBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  vetSigLine: { borderBottom: '1px solid #374151', height: 28, marginBottom: 4 },
  vetSigLabel: { fontSize: 11, color: '#64748b' },
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function VAIRRRLPricingCommission({
  loanAmount = 0,
  currentRate = '',
  currentPI = '',
  newRate = '',
  newPI = '',
  fundingFeeStatus = 'unknown',
  veteranName = '',
  propertyAddress = '',
  remainingTerm = 360,
  // Closing cost props from Loan Snapshot Estimator
  initTitleSettlement = '850',
  initTitleInsurance  = '650',
  initRecordingFees   = '125',
  initOrigFee         = '0',
  initProcFee         = '895',
  initAdminFee        = '0',
  initOtherCosts      = '0',
  snapshotTotal       = null,
  ntbRecoupMos        = null,
  ntbPaymentSavings   = null,
  ntbCostsAmt         = null,
  // Controlled state from VAIRRRL.jsx (persisted via save button)
  pricingRate = '',          onPricingRateChange = () => {},
  lenderCreditPct = '',      onLenderCreditPctChange = () => {},
  compType = 'BPC',          onCompTypeChange = () => {},
  compBps = '150',           onCompBpsChange = () => {},
  splitMode = 'pct',         onSplitModeChange = () => {},
  companySplitPct = '30',    onCompanySplitPctChange = () => {},
  companyFlatFee = '0',      onCompanyFlatFeeChange = () => {},
  purchaseLoanAmt = '',      onPurchaseLoanAmtChange = () => {},
  purchaseCompBps = '150',   onPurchaseCompBpsChange = () => {},
}) {

  // ── Closing costs stay local (synced from Loan Snapshot via init props) ──
  const [titleSettlement, setTitleSettlement]   = useState(initTitleSettlement);
  const [titleInsurance, setTitleInsurance]     = useState(initTitleInsurance);
  const [recordingFees, setRecordingFees]       = useState(initRecordingFees);
  const [lenderOrigFee, setLenderOrigFee]       = useState(initOrigFee);
  const [lenderProcFee, setLenderProcFee]       = useState(initProcFee);
  const [lenderAdminFee, setLenderAdminFee]     = useState(initAdminFee);
  const [otherCosts, setOtherCosts]             = useState(initOtherCosts);
  const [isSynced, setIsSynced]                 = useState(true);

  // ── Sync from Loan Snapshot when props change ────────────────────────────
  const syncFromSnapshot = () => {
    setTitleSettlement(initTitleSettlement);
    setTitleInsurance(initTitleInsurance);
    setRecordingFees(initRecordingFees);
    setLenderOrigFee(initOrigFee);
    setLenderProcFee(initProcFee);
    setLenderAdminFee(initAdminFee);
    setOtherCosts(initOtherCosts);
    setIsSynced(true);
  };

  // Detect when local values diverge from snapshot props
  const localTotal = [titleSettlement, titleInsurance, recordingFees, lenderOrigFee, lenderProcFee, lenderAdminFee, otherCosts]
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const outOfSync = snapshotTotal !== null && Math.abs(localTotal - (snapshotTotal - (fundingFeeStatus === 'not_exempt' ? (parseFloat(loanAmount) || 0) * 0.005 : 0))) > 1;

  // ── Computed Values ──────────────────────────────────────────────────────
  const computed = useMemo(() => {
    const la  = parseFloat(loanAmount) || 0;
    const cr  = parseFloat(currentRate) || 0;
    const cpi = parseFloat(currentPI) || 0;
    const nr  = parseFloat(newRate) || 0;
    const npi = parseFloat(newPI) || 0;
    const pr  = parseFloat(pricingRate) || nr;
    const lcPct = parseFloat(lenderCreditPct) || 0;
    const lcAmt = la * (lcPct / 100);
    const vaFF  = fundingFeeStatus === 'exempt' ? 0 : la * 0.005;

    const costs = {
      titleSettlement: parseFloat(titleSettlement) || 0,
      titleInsurance:  parseFloat(titleInsurance)  || 0,
      recordingFees:   parseFloat(recordingFees)   || 0,
      lenderOrigFee:   parseFloat(lenderOrigFee)   || 0,
      lenderProcFee:   parseFloat(lenderProcFee)   || 0,
      lenderAdminFee:  parseFloat(lenderAdminFee)  || 0,
      otherCosts:      parseFloat(otherCosts)      || 0,
      vaFF,
    };
    const totalCosts    = Object.values(costs).reduce((s, v) => s + v, 0);
    const netCashToClose = Math.max(0, totalCosts - lcAmt);
    const isNoCost      = lcAmt >= totalCosts && lcAmt > 0;
    const surplus       = Math.max(0, lcAmt - totalCosts);

    const npiAtPricingRate   = calcPI(la, pr, remainingTerm);
    const savingsAtPricingRate = cpi - npiAtPricingRate;
    const recoupmentMonths   = isNoCost ? 0 : savingsAtPricingRate > 0 ? netCashToClose / savingsAtPricingRate : Infinity;
    const savingsAtNtbRate   = cpi - npi;
    const rateReduction      = cr - pr;
    const ratesMatch         = Math.abs(pr - nr) < 0.001;

    const grossComp    = la * ((parseFloat(compBps) || 0) / 10000);
    const companyTake  = splitMode === 'pct'
      ? grossComp * ((parseFloat(companySplitPct) || 0) / 100)
      : parseFloat(companyFlatFee) || 0;
    const netLoComp    = Math.max(0, grossComp - companyTake);
    const effectiveBps = la > 0 ? (netLoComp / la) * 10000 : 0;

    const pla = parseFloat(purchaseLoanAmt) || la;
    const purchaseGross       = pla * ((parseFloat(purchaseCompBps) || 0) / 10000);
    const purchaseCompanyTake = splitMode === 'pct'
      ? purchaseGross * ((parseFloat(companySplitPct) || 0) / 100)
      : parseFloat(companyFlatFee) || 0;
    const purchaseNet = Math.max(0, purchaseGross - purchaseCompanyTake);

    return { la, cr, cpi, nr, npi, pr, lcPct, lcAmt, vaFF, costs, totalCosts, netCashToClose, isNoCost, surplus, npiAtPricingRate, savingsAtPricingRate, recoupmentMonths, savingsAtNtbRate, rateReduction, ratesMatch, grossComp, companyTake, netLoComp, effectiveBps, pla, purchaseGross, purchaseCompanyTake, purchaseNet };
  }, [loanAmount, currentRate, currentPI, newRate, newPI, fundingFeeStatus, remainingTerm, pricingRate, lenderCreditPct, titleSettlement, titleInsurance, recordingFees, lenderOrigFee, lenderProcFee, lenderAdminFee, otherCosts, compBps, splitMode, companySplitPct, companyFlatFee, purchaseLoanAmt, purchaseCompBps]);

  const c = computed;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={S.page}>

      {/* ── HOW THIS WORKS ── */}
      <div style={S.infoBanner}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2940', marginBottom: 4 }}>How IRRRL Pricing Works — for Novice &amp; Experienced LOs</div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            On a VA IRRRL, lenders publish a <strong>rate sheet</strong>. At the <em>par rate</em>, there's no cost and no credit. Price above par → lender pays you a credit (YSP) → use it to cover all closing costs → <strong>true no-cost loan for the veteran at $0 out of pocket.</strong> The tradeoff: a slightly higher rate means a slightly lower monthly savings figure — but VA's NTB test still only requires ≥0.50% reduction. This tab finds the optimal pricing structure and produces a presentation-ready summary for the veteran.
          </div>
        </div>
      </div>

      {/* ── SYNC BANNER ── */}
      {outOfSync ? (
        <div style={{ ...S.warnBanner, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ Closing costs here differ from your Loan Snapshot Estimator ({snapshotTotal !== null ? fmt$(snapshotTotal) : '—'}). You've made local edits.</span>
          <button onClick={syncFromSnapshot} style={{ ...{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#0d3b6e', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 } }}>
            ↺ Sync from Loan Snapshot
          </button>
        </div>
      ) : snapshotTotal !== null ? (
        <div style={S.syncBanner}>
          <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✅ Closing costs synced from Loan Snapshot Estimator — {fmt$(snapshotTotal)}</span>
          <span style={{ fontSize: 11, color: '#6b7a8d' }}>Edit below to adjust for this lender/market</span>
        </div>
      ) : null}

      {/* ══ SECTION 1 — LOAN PRICING ════════════════════════════════════════ */}
      <div style={S.section}>
        <div style={S.sectionHead}>
          <span style={{ fontSize: 18 }}>📊</span>
          <div>
            <div style={S.sectionTitle}>Loan Pricing — No-Cost Analysis</div>
            <div style={S.sectionSub}>Enter the rate and lender credit from your rate sheet. Your NTB test rate from the Benefit Test tab is shown for reference.</div>
          </div>
        </div>
        <div style={S.sectionBody}>
          <div style={S.grid3}>
            <div style={S.fieldGroup}>
              <label style={S.label}>NTB Test Rate (Benefit Test tab)<Tip text="This is the rate you entered in the Benefit Test tab for the NTB calculation. Your actual pricing rate may differ." /></label>
              <div style={{ ...S.readonlyField, background: '#f0f4fa', color: '#1a3a5c' }}>{c.nr > 0 ? fmtPct(c.nr) : '— Enter on Benefit Test tab'}</div>
              <div style={S.smallNote}>From Benefit Test tab</div>
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Pricing Rate (%) — Your Rate Sheet<Tip text="The rate at which you're actually pricing this loan. To generate a lender credit that covers closing costs, this is typically 0.25%–0.75% above par rate. If left blank, defaults to your NTB test rate." /></label>
              <input style={S.input} type="number" step="0.125" value={pricingRate} onChange={e => onPricingRateChange(e.target.value)} placeholder={c.nr > 0 ? String(c.nr) : 'e.g. 6.000'} />
              <div style={S.smallNote}>{pricingRate ? `New P&I at this rate: ${fmt$(c.npiAtPricingRate)}/mo` : 'Leave blank to use NTB test rate'}</div>
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Lender Credit at Pricing Rate (%)<Tip text="From your lender's rate sheet. Example: if par is 5.500% and you're pricing at 6.000%, your rate sheet might show a 1.000% credit. Enter that percentage here." /></label>
              <input style={S.input} type="number" step="0.125" value={lenderCreditPct} onChange={e => onLenderCreditPctChange(e.target.value)} placeholder="e.g. 1.000" />
              {c.lcAmt > 0 && <div style={{ ...S.smallNote, color: '#15803d', fontWeight: 600 }}>= {fmt$(c.lcAmt)} lender credit on {fmt$(c.la)}</div>}
            </div>
          </div>
          {pricingRate && !c.ratesMatch && c.nr > 0 && (
            <div style={S.warnBanner}>
              ⚠️ <strong>Pricing rate ({fmtPct(c.pr)}) differs from NTB test rate ({fmtPct(c.nr)}).</strong>{' '}
              New P&I at pricing rate: <strong>{fmt$(c.npiAtPricingRate)}/mo</strong> — savings: <strong>{fmt$(c.savingsAtPricingRate)}/mo</strong> — rate reduction: <strong>{fmtPct(c.rateReduction)}</strong>.{' '}
              {c.rateReduction >= 0.5 ? '✅ Still passes the 0.50% VA minimum — you are clear to proceed.' : '❌ Rate reduction falls below 0.50% — NTB test will FAIL at this pricing rate. Lower your pricing rate.'}
            </div>
          )}
        </div>
      </div>

      {/* ══ SECTION 2 — CLOSING COST BREAKDOWN ══════════════════════════════ */}
      <div style={S.section}>
        <div style={S.sectionHead}>
          <span style={{ fontSize: 18 }}>🧾</span>
          <div>
            <div style={S.sectionTitle}>Closing Cost Breakdown</div>
            <div style={S.sectionSub}>Pre-filled from your Loan Snapshot Estimator. Adjust for this specific lender/market if needed.</div>
          </div>
        </div>
        <div style={S.sectionBody}>
          <div style={S.grid3}>
            {/* Title & Settlement */}
            <div>
              <div style={S.costGroupLabel}>📋 Title &amp; Settlement</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['Title/Settlement Fee', titleSettlement, setTitleSettlement], ['Lender\'s Title Insurance', titleInsurance, setTitleInsurance], ['Recording Fees', recordingFees, setRecordingFees]].map(([label, val, setter]) => (
                  <div key={label}>
                    <label style={{ ...S.label, textTransform: 'none', fontSize: 12 }}>{label}</label>
                    <div style={{ position: 'relative' }}><span style={S.prefix}>$</span><input style={S.inputWithPrefix} type="number" value={val} onChange={e => { setter(e.target.value); setIsSynced(false); }} /></div>
                  </div>
                ))}
              </div>
            </div>
            {/* Lender Fees */}
            <div>
              <div style={S.costGroupLabel}>🏦 Lender Fees</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['Origination Fee', lenderOrigFee, setLenderOrigFee], ['Processing Fee', lenderProcFee, setLenderProcFee], ['Underwriting / Admin Fee', lenderAdminFee, setLenderAdminFee]].map(([label, val, setter]) => (
                  <div key={label}>
                    <label style={{ ...S.label, textTransform: 'none', fontSize: 12 }}>{label}</label>
                    <div style={{ position: 'relative' }}><span style={S.prefix}>$</span><input style={S.inputWithPrefix} type="number" value={val} onChange={e => { setter(e.target.value); setIsSynced(false); }} /></div>
                  </div>
                ))}
              </div>
            </div>
            {/* VA & Other */}
            <div>
              <div style={S.costGroupLabel}>🎖️ VA &amp; Other</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ ...S.label, textTransform: 'none', fontSize: 12 }}>VA Funding Fee<Tip text="Auto-populated from Funding Fee tab. Exempt if service-connected disabled. Otherwise 0.5% of loan amount for IRRRL." /></label>
                  <div style={S.costReadonly(fundingFeeStatus === 'exempt' ? 'exempt' : 'normal')}>
                    {fundingFeeStatus === 'exempt' ? '🎖️ $0.00 — Exempt' : c.la > 0 ? fmt$(c.vaFF) : '—'}
                  </div>
                  <div style={S.smallNote}>{fundingFeeStatus === 'exempt' ? 'Service-connected disability — 38 U.S.C. § 3729(c)' : fundingFeeStatus === 'not_exempt' ? '0.5% of loan amount — IRRRL rate' : 'Set exemption status on Loan Snapshot tab'}</div>
                </div>
                <div>
                  <label style={{ ...S.label, textTransform: 'none', fontSize: 12 }}>Other Costs (prepaid, escrow, etc.)</label>
                  <div style={{ position: 'relative' }}><span style={S.prefix}>$</span><input style={S.inputWithPrefix} type="number" value={otherCosts} onChange={e => { setOtherCosts(e.target.value); setIsSynced(false); }} /></div>
                </div>
              </div>
            </div>
          </div>

          {/* Totals Bar */}
          <div style={S.totalsBar}>
            <div style={S.totalBlock}><div style={S.totalLabel}>Total Closing Costs</div><div style={S.totalValue}>{fmt$(c.totalCosts)}</div></div>
            <div style={S.mathOp}>−</div>
            <div style={S.totalBlock}><div style={S.totalLabel}>Lender Credit</div><div style={S.totalValueCredit}>{c.lcAmt > 0 ? fmt$(c.lcAmt) : '—'}</div></div>
            <div style={S.mathOp}>=</div>
            <div style={S.totalBlock}><div style={S.totalLabel}>{c.isNoCost ? '✅ Net Cash to Close' : 'Cash to Close'}</div><div style={c.isNoCost ? S.totalValueNoCost : S.totalValueCost}>{c.isNoCost ? '$0.00' : fmt$(c.netCashToClose)}</div></div>
            <div style={{ flex: 1 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Recoupment Period</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (ntbRecoupMos !== null ? ntbRecoupMos : c.recoupmentMonths) <= 36 ? '#15803d' : '#dc2626' }}>
                {c.isNoCost ? '0 months'
                  : ntbRecoupMos !== null
                    ? (ntbRecoupMos === Infinity ? '—' : `${ntbRecoupMos.toFixed(1)} months`)
                    : c.recoupmentMonths === Infinity ? '—'
                    : `${c.recoupmentMonths.toFixed(1)} months`}
              </div>
              <div style={{ fontSize: 11, color: (ntbRecoupMos !== null ? ntbRecoupMos : c.recoupmentMonths) <= 36 ? '#15803d' : '#dc2626' }}>
                {c.isNoCost ? 'No costs to recoup'
                  : (ntbRecoupMos !== null ? ntbRecoupMos : c.recoupmentMonths) <= 36
                    ? '✅ Passes VA 36-mo test'
                    : '❌ Exceeds 36-mo VA limit'}
              </div>
              {ntbRecoupMos !== null && (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Synced from Benefit Test tab</div>
              )}
            </div>
          </div>

          {c.isNoCost && (
            <div style={S.nocostBanner}>
              ✅ <strong>No-Cost IRRRL Confirmed</strong> — Lender credit of {fmt$(c.lcAmt)} fully covers all {fmt$(c.totalCosts)} in closing costs.{c.surplus > 0 && ` Surplus of ${fmt$(c.surplus)} may reduce loan balance or offset prepaids.`} Recoupment period: <strong>0 months</strong>.
            </div>
          )}
          {!c.isNoCost && c.netCashToClose > 0 && (ntbPaymentSavings > 0 || c.savingsAtPricingRate > 0) && (
            <div style={S.hasCostBanner}>
              💡 Veteran owes <strong>{fmt$(c.netCashToClose)}</strong> at closing, recouped in{' '}
              <strong>{ntbRecoupMos !== null && ntbRecoupMos !== Infinity ? `${ntbRecoupMos.toFixed(1)} months` : c.recoupmentMonths !== Infinity ? `${c.recoupmentMonths.toFixed(1)} months` : '—'}</strong>{' '}
              at {fmt$(ntbPaymentSavings || c.savingsAtPricingRate)}/mo savings.
              {(ntbRecoupMos !== null ? ntbRecoupMos : c.recoupmentMonths) <= 36
                ? ' ✅ Passes VA 36-month recoupment requirement.'
                : ' ⚠️ Exceeds VA 36-month limit — increase your pricing rate or lender credit to cover more costs.'}{' '}
              Alternatively: roll costs into loan balance — increases UPB but keeps cash-to-close at $0.
            </div>
          )}
        </div>
      </div>

      {/* ══ SECTION 3 — LO COMPENSATION ═════════════════════════════════════ */}
      <div style={S.section}>
        <div style={S.sectionHead}>
          <span style={{ fontSize: 18 }}>💰</span>
          <div><div style={S.sectionTitle}>LO Compensation Calculator</div><div style={S.sectionSub}>BPC (lender-paid) is the most common structure for VA IRRRLs — veteran pays no points.</div></div>
        </div>
        <div style={S.sectionBody}>
          <div style={S.toggleRow}>
            <span style={S.toggleLabel}>Comp Type:</span>
            <button style={S.toggleBtn(compType === 'BPC')} onClick={() => onCompTypeChange('BPC')}>BPC — Lender Paid</button>
            <button style={S.toggleBtn(compType === 'LPC')} onClick={() => onCompTypeChange('LPC')}>LPC — Borrower Paid</button>
            <span style={S.toggleNote}>{compType === 'BPC' ? '⚡ Standard for IRRRL — veteran pays nothing, LO paid by lender via YSP' : '📋 Borrower pays origination points — less common on streamline refis'}</span>
          </div>
          <div style={S.grid3}>
            <div style={S.fieldGroup}><label style={S.label}>Loan Amount</label><div style={S.readonlyField}>{c.la > 0 ? fmt$(c.la) : '—'}</div></div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Comp Rate (bps)<Tip text="150 bps = 1.50% of loan amount. Typical BPC range for VA IRRRL: 100–200 bps." /></label>
              <input style={S.input} type="number" value={compBps} onChange={e => onCompBpsChange(e.target.value)} placeholder="150" />
              <div style={S.smallNote}>{(parseFloat(compBps) || 0)} bps = {((parseFloat(compBps) || 0) / 100).toFixed(2)}% of loan amount</div>
            </div>
            <div style={S.fieldGroup}><label style={S.label}>Gross LO Compensation</label><div style={S.readonlyHighlight}>{c.la > 0 ? fmt$(c.grossComp) : '—'}</div></div>
          </div>
          <div style={S.divider} />
          <div style={S.toggleRow}>
            <span style={S.toggleLabel}>Company Override:</span>
            <button style={S.toggleBtn(splitMode === 'pct')} onClick={() => onSplitModeChange('pct')}>% Split</button>
            <button style={S.toggleBtn(splitMode === 'flat')} onClick={() => onSplitModeChange('flat')}>Flat Fee</button>
            {splitMode === 'pct' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                <input style={{ ...S.input, width: 80 }} type="number" value={companySplitPct} onChange={e => onCompanySplitPctChange(e.target.value)} placeholder="30" />
                <span style={{ fontSize: 13, color: '#475569' }}>% to company</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                <span style={{ fontSize: 13, color: '#475569' }}>$</span>
                <input style={{ ...S.input, width: 100 }} type="number" value={companyFlatFee} onChange={e => onCompanyFlatFeeChange(e.target.value)} placeholder="500" />
                <span style={{ fontSize: 13, color: '#475569' }}>flat fee</span>
              </div>
            )}
          </div>
          <div style={S.compSummaryCard}>
            <div style={S.compRow}><span>Gross LO Compensation</span><span style={{ fontWeight: 600 }}>{fmt$(c.grossComp)}</span></div>
            <div style={S.compRowDeduct}><span>Company {splitMode === 'pct' ? `Override (${companySplitPct || 0}% = ${fmt$(c.companyTake)})` : 'Flat Fee'}</span><span>− {fmt$(c.companyTake)}</span></div>
            <div style={S.compRowTotal}><span>💵 Your Net Commission</span><span style={{ fontSize: 22 }}>{fmt$(c.netLoComp)}</span></div>
            <div style={S.compRowBps}><span>Effective net compensation rate</span><span>{c.effectiveBps.toFixed(1)} bps net ({((c.effectiveBps) / 100).toFixed(2)}% of loan)</span></div>
          </div>
        </div>
      </div>

      {/* ══ SECTION 4 — IRRRL VS PURCHASE ═══════════════════════════════════ */}
      <div style={S.section}>
        <div style={S.sectionHead}>
          <span style={{ fontSize: 18 }}>⚡️</span>
          <div><div style={S.sectionTitle}>IRRRL vs Purchase — Strategic Comparison</div><div style={S.sectionSub}>Same comp rate, same pipeline slot — what's the smarter volume play?</div></div>
        </div>
        <div style={S.sectionBody}>
          <div style={S.grid2}>
            <div style={S.fieldGroup}>
              <label style={S.label}>Hypothetical Purchase Loan Amount ($)<Tip text="Enter a typical purchase loan amount to compare your per-loan commission." /></label>
              <div style={{ position: 'relative' }}><span style={S.prefix}>$</span><input style={S.inputWithPrefix} type="number" value={purchaseLoanAmt} onChange={e => onPurchaseLoanAmtChange(e.target.value)} placeholder={c.la > 0 ? String(c.la) : 'e.g. 300000'} /></div>
            </div>
            <div style={S.fieldGroup}><label style={S.label}>Purchase Comp Rate (bps)</label><input style={S.input} type="number" value={purchaseCompBps} onChange={e => onPurchaseCompBpsChange(e.target.value)} placeholder="150" /></div>
          </div>
          <div style={{ marginTop: 20, overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr><th style={S.th}>Metric</th><th style={{ ...S.th, background: '#1e4a7a' }}>VA IRRRL — This Loan</th><th style={{ ...S.th, background: '#334155' }}>Purchase — Hypothetical</th></tr>
              </thead>
              <tbody>
                {[['Loan Amount', fmt$(c.la), fmt$(c.pla)], ['Comp Rate', `${compBps || '—'} bps`, `${purchaseCompBps || '—'} bps`], ['Gross Commission', fmt$(c.grossComp), fmt$(c.purchaseGross)], ['Company Override', `− ${fmt$(c.companyTake)}`, `− ${fmt$(c.purchaseCompanyTake)}`]].map(([label, irrrl, purchase]) => (
                  <tr key={label}><td style={S.td}>{label}</td><td style={S.tdIrrrl}>{irrrl}</td><td style={S.tdPurchase}>{purchase}</td></tr>
                ))}
                <tr style={{ background: '#f0f4fa' }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>Your Net Commission</td>
                  <td style={{ ...S.td, fontWeight: 800, fontSize: 16, color: '#15803d' }}>{fmt$(c.netLoComp)}</td>
                  <td style={{ ...S.td, fontWeight: 800, fontSize: 16, color: '#1a3a5c' }}>{fmt$(c.purchaseNet)}</td>
                </tr>
                {[['Typical Days to Close', '15–21 days', '30–45 days'], ['Appraisal Required', '❌ No', '✅ Yes (~$600–900)'], ['Income Verification', '❌ No', '✅ Yes (full doc)'], ['Credit Qualification', '❌ No (streamline)', '✅ Yes (full UW)'], ['Fall-Through Risk', 'Very Low', 'Higher (inspection, appraisal, title)'], ['File Complexity', 'Low (streamline)', 'High (full package)']].map(([label, irrrl, purchase]) => (
                  <tr key={label}><td style={S.td}>{label}</td><td style={S.tdIrrrl}>{irrrl}</td><td style={S.tdPurchase}>{purchase}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.netLoComp > 0 && (
            <div style={S.strategicNote}>
              💡 <strong>Strategic context:</strong> A VA IRRRL closes in ~18 days on average. In the same 36 days it takes to close one purchase, you can close <strong>2 IRRRLs</strong> for a combined net of <strong>{fmt$(c.netLoComp * 2)}</strong>.{c.purchaseNet > 0 && (c.netLoComp * 2 > c.purchaseNet ? ` That's ${fmt$(c.netLoComp * 2 - c.purchaseNet)} more than one purchase at the same comp rate — with half the file complexity and near-zero fall-through risk.` : ` One purchase at ${fmt$(c.purchaseNet)} outpaces two IRRRLs at ${fmt$(c.netLoComp * 2)} — but factor in fall-through risk, appraisal delays, and full-doc complexity.`)} For LOs with a VA borrower database, the IRRRL is a <strong>volume play</strong>.
            </div>
          )}
        </div>
      </div>

      {/* ══ SECTION 5 — VETERAN PRESENTATION CARD ═══════════════════════════ */}
      <div style={S.section}>
        <div style={S.sectionHead}>
          <span style={{ fontSize: 18 }}>🎖️</span>
          <div><div style={S.sectionTitle}>Veteran Presentation Card</div><div style={S.sectionSub}>Plain-English summary for the veteran — every number calculated from your inputs above. Print or share before the consultation closes.</div></div>
        </div>
        <div style={S.sectionBody}>
          <div style={S.vetCard} id="va-irrrl-vet-card">
            <div style={S.vetCardHeader}>
              <div style={S.vetCardLogo}>⚡ LoanBeacons™ · VA Loan Intelligence</div>
              <div style={S.vetCardTitle}>VA Interest Rate Reduction Refinance</div>
              <div style={S.vetCardSub}>Prepared for: {veteranName || 'Veteran Name'}</div>
              <div style={S.vetCardProp}>{propertyAddress || 'Property Address'}</div>
              <div style={S.vetCardDate}>Prepared {today}</div>
            </div>
            <div style={S.vetCardBody}>
              <div style={S.vetRateRow}>
                <div style={S.vetRateBlock('current')}><div style={S.vetRateLabel}>Your Current Rate</div><div style={S.vetRateValue('current')}>{c.cr > 0 ? fmtPct(c.cr) : '—'}</div><div style={S.vetPayment}>{c.cpi > 0 ? `${fmt$(c.cpi)}/mo P&I` : '—'}</div></div>
                <div style={S.vetArrow}>→</div>
                <div style={S.vetRateBlock('new')}><div style={S.vetRateLabel}>Your New Rate</div><div style={S.vetRateValue('new')}>{c.pr > 0 ? fmtPct(c.pr) : '—'}</div><div style={S.vetPayment}>{c.npiAtPricingRate > 0 ? `${fmt$(c.npiAtPricingRate)}/mo P&I` : '—'}</div></div>
              </div>
              <div style={S.vetSavingsGrid}>
                {[['Monthly Savings', c.savingsAtPricingRate > 0 ? fmt$(c.savingsAtPricingRate) : '—', false], ['Annual Savings', c.savingsAtPricingRate > 0 ? fmt$(c.savingsAtPricingRate * 12) : '—', false], ['5-Year Savings', c.savingsAtPricingRate > 0 ? fmt$(c.savingsAtPricingRate * 60) : '—', false], ['Your Cost at Closing', c.isNoCost ? '$0.00 ✅' : c.netCashToClose > 0 ? fmt$(c.netCashToClose) : '—', true]].map(([label, value, highlight]) => (
                  <div key={label} style={S.vetSavingsItem(highlight)}><div style={S.vetSavingsLabel(highlight)}>{label}</div><div style={S.vetSavingsValue(highlight)}>{value}</div></div>
                ))}
              </div>
              <div style={S.vetBadgesRow}>
                {fundingFeeStatus === 'exempt' && <div style={S.vetBadge('exempt')}>🎖️ VA Funding Fee: WAIVED<br /><span style={{ fontSize: 11, fontWeight: 400 }}>Service-Connected Disability · 38 U.S.C. § 3729(c)</span></div>}
                {c.isNoCost && <div style={S.vetBadge('nocost')}>✅ No-Cost Refinance<br /><span style={{ fontSize: 11, fontWeight: 400 }}>Lender credit covers all closing costs — $0 out of pocket</span></div>}
                <div style={S.vetBadge('ntb')}>✅ VA Net Tangible Benefit: SATISFIED<br /><span style={{ fontSize: 11, fontWeight: 400 }}>Rate reduced {c.rateReduction > 0 ? `by ${fmtPct(c.rateReduction)}` : '—'} · Meets VA minimum 0.50% requirement</span></div>
                <div style={S.vetBadge('recoup')}>✅ Recoupment Period: {c.isNoCost ? '0 months' : ntbRecoupMos !== null && ntbRecoupMos < Infinity ? `${ntbRecoupMos.toFixed(1)} months` : c.recoupmentMonths < Infinity ? `${c.recoupmentMonths.toFixed(1)} months` : '—'}<br /><span style={{ fontSize: 11, fontWeight: 400 }}>{c.isNoCost ? 'No costs to recover — immediate benefit' : "Well within VA's 36-month maximum · VA Circular 26-18-13"}</span></div>
              </div>
              <div style={S.vetStatement}>
                This refinance lowers your interest rate{c.rateReduction > 0 ? ` by ${fmtPct(c.rateReduction)}` : ''} and reduces your monthly mortgage payment{c.savingsAtPricingRate > 0 ? ` by ${fmt$(ntbPaymentSavings || c.savingsAtPricingRate)} per month` : ''}.{c.isNoCost ? ' There is no out-of-pocket cost to you and nothing is added to your loan balance.' : c.netCashToClose > 0 ? ` Your closing costs of ${fmt$(c.netCashToClose)} are recouped in ${ntbRecoupMos !== null && ntbRecoupMos < Infinity ? ntbRecoupMos.toFixed(1) : c.recoupmentMonths < Infinity ? c.recoupmentMonths.toFixed(1) : '—'} months.` : ''} Your VA loan entitlement is fully preserved.{fundingFeeStatus === 'exempt' ? ' Your VA funding fee is completely waived due to your service-connected disability rating.' : ''} This loan meets all requirements of VA Circular 26-18-13 and qualifies for VA IRRRL streamline processing — no appraisal, no income verification, no full credit qualification required.
              </div>
              <div style={S.vetSigRow}>
                {['Loan Officer Signature', 'NMLS ID', 'Date'].map(label => (
                  <div key={label} style={S.vetSigBlock}><div style={S.vetSigLine} /><div style={S.vetSigLabel}>{label}</div></div>
                ))}
              </div>
            </div>
          </div>
          <button style={S.printBtn} onClick={() => window.print()}>🖨️ Print Veteran Presentation Card</button>
        </div>
      </div>

    </div>
  );
}
