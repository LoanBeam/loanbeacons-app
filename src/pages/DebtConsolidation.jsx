// src/pages/DebtConsolidation.jsx
// LoanBeacons™ — Module 6 | Stage 1: Pre-Structure
// Debt Resolution Engine™ — Corrected minimum-cost algorithm + legally compliant borrower PDF

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/config';
import ModuleNav from '../components/ModuleNav';
// ── Program DTI Limits ─────────────────────────────────────────────
// guideline = standard underwriting target
// backMax   = AUS maximum (DU/LPA/GUS approval can exceed guideline up to this)
// ausNote   = what the LO/borrower needs to know about exceeding the guideline
const PROGRAM_DTI_LIMITS = {
  CONVENTIONAL: {
    label: 'Conventional', guideline: 43.0, backMax: 50.0,
    ausNote: 'DU or LPA may approve up to 50% with strong compensating factors (reserves, credit score, low LTV).',
  },
  FHA: {
    label: 'FHA', guideline: 43.0, backMax: 56.9,
    ausNote: 'FHA TOTAL Scorecard can approve up to 56.9% for AUS Accept/Eligible findings.',
  },
  VA: {
    label: 'VA', guideline: 41.0, backMax: 65.0,
    ausNote: 'VA has no hard DTI cap. Residual income is the primary qualifier. Above 41% requires strong residual income.',
  },
  USDA: {
    label: 'USDA', guideline: 41.0, backMax: 44.0, frontMax: 29.0,
    ausNote: 'GUS approval required above guideline. Both front-end (29%) and back-end (41%) ratios must be met.',
  },
  HOMEREADY: {
    label: 'HomeReady', guideline: 43.0, backMax: 50.0,
    ausNote: 'Fannie Mae DU can approve up to 50%. Income limit 80% AMI (census tract may waive).',
  },
  HOMEPOSSIBLE: {
    label: 'Home Possible', guideline: 43.0, backMax: 45.0,
    ausNote: 'Freddie Mac LPA can approve up to 45%. Income limit 80% AMI (census tract may waive).',
  },
};
// Backward compat helper
function progIdeal(p) { return p?.guideline || 43.0; }
function progMax(p)   { return p?.backMax   || 50.0; }

// ── Student Loan Rules ─────────────────────────────────────────────
function computeStudentLoanPayment(tl, loanProgram, conventionalInvestor) {
  const bal  = parseFloat(tl.balance) || 0;
  const doc  = parseFloat(tl.documented_monthly_payment) || 0;
  const rep  = parseFloat(tl.reported_monthly_payment)   || 0;
  if (doc > 0) return { method: 'DOCUMENTED_PAYMENT',          payment: doc,           note: 'Payment per servicer statement' };
  if (rep > 0) return { method: 'CREDIT_REPORT_PAYMENT',       payment: rep,           note: 'Payment per credit report' };
  if (loanProgram === 'FHA')  return { method: 'FHA_0_5_PCT',  payment: bal * 0.005,   note: 'FHA: 0.5% of balance' };
  if (loanProgram === 'VA')   return { method: 'VA_5_PCT_12',  payment: bal * 0.05/12, note: 'VA: 5% ÷ 12' };
  if (loanProgram === 'CONVENTIONAL') {
    if (conventionalInvestor === 'FANNIE') {
      if (tl.idr_verified_zero) return { method: 'FANNIE_IDR_ZERO', payment: 0,        note: 'Fannie: $0 IDR verified' };
      return { method: 'FANNIE_1_PCT', payment: bal * 0.01, note: 'Fannie: 1% of balance' };
    }
    if (conventionalInvestor === 'FREDDIE') return { method: 'FREDDIE_0_5_PCT', payment: bal * 0.005, note: 'Freddie: 0.5% of balance' };
  }
  return { method: 'FALLBACK_0_5_PCT', payment: bal * 0.005, note: '0.5% fallback' };
}

// ── Duplicate Detection ────────────────────────────────────────────
function detectDuplicates(tradelines) {
  const groups = [], processed = new Set();
  const BAL_TOL = (a, b) => Math.abs(a - b) <= Math.max(25, Math.max(a, b) * 0.01);
  const PAY_TOL = (a, b) => Math.abs(a - b) <= Math.max(5, Math.max(a, b) * 0.01);
  const studentLoans = tradelines.filter(t => t.debt_type === 'STUDENT_LOAN');
  const byServicer = {};
  studentLoans.forEach(t => {
    const key = (t.creditor_name_raw || '').toLowerCase();
    if (!byServicer[key]) byServicer[key] = [];
    byServicer[key].push(t);
  });
  Object.values(byServicer).forEach(group => {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => (parseFloat(b.balance)||0) - (parseFloat(a.balance)||0));
      const largest = sorted[0], others = sorted.slice(1);
      const othersSum = others.reduce((s, t) => s + (parseFloat(t.balance)||0), 0);
      const largestBal = parseFloat(largest.balance) || 0;
      if (BAL_TOL(largestBal, othersSum) || largestBal > othersSum * 0.8) {
        const gid = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        groups.push({ dedupe_group_id: gid, group_type: 'STUDENT_SUMMARY_CHILD', confidence: 'MEDIUM',
          badge_label: 'Student Loan Summary Duplicate',
          tooltip: 'A summary loan line may duplicate individual loans — double-counting inflates DTI.',
          members: [{ tradeline_id: largest.tradeline_id, role: 'SUMMARY' }, ...others.map(t => ({ tradeline_id: t.tradeline_id, role: 'CHILD' }))],
        });
        group.forEach(t => processed.add(t.tradeline_id));
      }
    }
  });
  for (let i = 0; i < tradelines.length; i++) {
    for (let j = i + 1; j < tradelines.length; j++) {
      const a = tradelines[i], b = tradelines[j];
      if (processed.has(a.tradeline_id) && processed.has(b.tradeline_id)) continue;
      const balA = parseFloat(a.balance)||0, balB = parseFloat(b.balance)||0;
      const payA = parseFloat(a.reported_monthly_payment)||0, payB = parseFloat(b.reported_monthly_payment)||0;
      let confidence = null, reason = null;
      if (a.account_last4 && b.account_last4 && a.account_last4 === b.account_last4 &&
        (a.creditor_name_raw||'').toLowerCase() === (b.creditor_name_raw||'').toLowerCase() && BAL_TOL(balA,balB))
        { confidence='HIGH'; reason='Account + Creditor match'; }
      else if ((a.creditor_name_raw||'').toLowerCase() === (b.creditor_name_raw||'').toLowerCase() && BAL_TOL(balA,balB) && PAY_TOL(payA,payB))
        { confidence='MEDIUM'; reason='Creditor + balance + payment match'; }
      else if ((a.creditor_name_raw||'').toLowerCase() === (b.creditor_name_raw||'').toLowerCase() && BAL_TOL(balA,balB))
        { confidence='LOW'; reason='Creditor + balance match'; }
      if (confidence) {
        const gid = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        const keep = balA >= balB ? a : b, rem = balA >= balB ? b : a;
        groups.push({ dedupe_group_id: gid, group_type: 'GENERAL', confidence,
          badge_label: `Possible Duplicate (${confidence} confidence)`, tooltip: reason,
          members: [{ tradeline_id: keep.tradeline_id, role: 'KEEP' }, { tradeline_id: rem.tradeline_id, role: 'REMOVE' }],
        });
        processed.add(a.tradeline_id); processed.add(b.tradeline_id);
      }
    }
  }
  return groups;
}

// ── Debt Resolution Engine — Minimum Cost Algorithm ───────────────
// Strategy: Sort by HIGHEST monthly payment first (biggest DTI relief first).
// This gives the LO a clear, explainable plan: "We pay off the accounts with
// the largest monthly payments because each one eliminates the most DTI per account."
// We keep adding accounts until we close the DTI gap or run out of debts.
function buildResolutionPlan(activeTradelines, totalHousing, monthlyIncome, loanProgram, loOverrides = {}) {
  if (!monthlyIncome || !totalHousing) return null;
  const prog = PROGRAM_DTI_LIMITS[loanProgram?.toUpperCase()] || PROGRAM_DTI_LIMITS['CONVENTIONAL'];
  const getQualPay = (t) => {
    const ov = loOverrides[t.tradeline_id];
    if (ov?.markedPaid) return 0;
    if (ov?.paymentOverride !== undefined && ov.paymentOverride !== '') return parseFloat(ov.paymentOverride) || 0;
    return t.debt_type === 'STUDENT_LOAN' ? (parseFloat(t.student_qualifying_payment)||0) : (parseFloat(t.reported_monthly_payment)||0);
  };
  const totalDebt = activeTradelines.reduce((s, t) => s + getQualPay(t), 0);
  const currentDTI = ((totalHousing + totalDebt) / monthlyIncome) * 100;
  const guideline  = progIdeal(prog);   // standard target (e.g. 43%)
  const maxDTI     = progMax(prog);     // AUS maximum (e.g. 50%)
  const targetDTI  = guideline;         // plan aims for guideline
  const targetDebt = Math.max(0, (guideline / 100) * monthlyIncome - totalHousing);
  const debtGap    = Math.max(0, totalDebt - targetDebt);
  // alreadyOk = within AUS maximum (can qualify, no mandatory payoff)
  // atGuideline = within standard guideline (no AUS risk)
  const atGuideline = currentDTI <= guideline;
  const alreadyOk   = currentDTI <= maxDTI;
  const withinMax   = currentDTI <= maxDTI;
  const aboveGuideline = currentDTI > guideline && currentDTI <= maxDTI;

  // Build tradeline list with override-aware payments
  const sortedByPayment = activeTradelines
    .filter(t => {
      const ov = loOverrides[t.tradeline_id];
      if (ov?.markedPaid) return false;
      const pay = getQualPay(t);
      return pay > 0 && (parseFloat(t.balance)||0) > 0;
    })
    .map(t => ({
      ...t,
      qualPay:     getQualPay(t),
      balance_num: parseFloat(t.balance) || 0,
      loForcedIn:  loOverrides[t.tradeline_id]?.inPlan === true,
      loForcedOut: loOverrides[t.tradeline_id]?.inPlan === false,
    }))
    .sort((a, b) => b.qualPay - a.qualPay);

  // Separate LO-forced accounts from AI-suggested
  const forcedIn   = sortedByPayment.filter(t => t.loForcedIn);
  const forcedOut  = sortedByPayment.filter(t => t.loForcedOut);
  const aiCandidates = sortedByPayment.filter(t => !t.loForcedIn && !t.loForcedOut);

  // Start with forced-in accounts, then greedily add AI candidates until gap closed
  let reliefAccumulated = forcedIn.reduce((s, t) => s + t.qualPay, 0);
  const payToCloseItems = [...forcedIn];
  for (const tl of aiCandidates) {
    if (reliefAccumulated >= debtGap && debtGap > 0) break;
    payToCloseItems.push(tl);
    reliefAccumulated += tl.qualPay;
  }

  const payToCloseCost  = payToCloseItems.reduce((s, t) => s + t.balance_num, 0);
  const reliefTotal     = payToCloseItems.reduce((s, t) => s + t.qualPay, 0);
  const dtiAfterPayoff  = ((totalHousing + Math.max(0, totalDebt - reliefTotal)) / monthlyIncome) * 100;

  // Collection risk: non-medical collections with $2k+ aggregate
  const nonMedicalCollections = activeTradelines.filter(t =>
    t.debt_type === 'COLLECTION' && t.status !== 'PAID' &&
    (t.collection_type || 'non_medical') !== 'medical' &&
    (parseFloat(t.balance) || 0) > 0
  );
  const nonMedicalCollTotal = nonMedicalCollections.reduce((s, t) => s + (parseFloat(t.balance)||0), 0);
  const collectionRisk = nonMedicalCollTotal >= 2000;

  // Best-case DTI flag: even after all payoffs, still above guideline
  const bestCaseDTI = ((totalHousing + Math.max(0, totalDebt - sortedByPayment.reduce((s,t) => s+t.qualPay,0))) / monthlyIncome) * 100;
  const ausRequiredAfterPlan = dtiAfterPayoff > guideline;

  return {
    currentDTI, targetDTI, guideline, maxDTI, debtGap, totalDebt,
    alreadyOk, atGuideline, aboveGuideline, withinMax, prog,
    payToCloseItems, payToCloseCost, reliefTotal, dtiAfterPayoff,
    sortedByPayment, collectionRisk, nonMedicalCollTotal,
    nonMedicalCollections, ausRequiredAfterPlan, bestCaseDTI,
  };
}

// ── Borrower PDF Generator ─────────────────────────────────────────
// Opens a print-ready HTML page. Legally compliant per Reg Z, RESPA, ECOA.
function generateBorrowerPDF(scenario, resolutionPlan, tradelines, loanProgram, loProfile) {
  const borrowerName  = `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || 'Borrower';
  const loName        = loProfile?.displayName  || loProfile?.name  || scenario.loName  || '[Loan Officer Name]';
  const loNMLS        = loProfile?.nmls         || loProfile?.nmlsId || scenario.loNmls || '[NMLS ID]';
  const companyNMLS   = loProfile?.companyNmls  || scenario.companyNmls || '[Company NMLS]';
  const companyName   = loProfile?.companyName  || scenario.companyName || 'Clearview Lending Solutions';
  const today         = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmt$          = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPct        = n => Number(n||0).toFixed(1) + '%';

  const activeTradelines = tradelines.filter(t => t.dedupe_action !== 'AUTO_REMOVED' && t.dedupe_action !== 'MANUAL_EXCLUDED');

  const tableRows = resolutionPlan?.payToCloseItems?.map((tl, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${tl.creditor_name_raw}</strong><br/><span style="color:#666;font-size:11px">${(tl.debt_type||'').replace(/_/g,' ')}</span></td>
      <td style="text-align:right">${fmt$(tl.balance_num)}</td>
      <td style="text-align:right">${fmt$(tl.qualPay)}/mo</td>
      <td style="text-align:right;color:#16a34a;font-weight:bold">Eliminated</td>
    </tr>
  `).join('') || '';

  const remainingRows = activeTradelines
    .filter(t => {
      if (resolutionPlan?.payToCloseItems?.some(p => p.tradeline_id === t.tradeline_id)) return false;
      const bal = parseFloat(t.balance) || 0;
      const pay = t.debt_type === 'STUDENT_LOAN' ? (parseFloat(t.student_qualifying_payment)||0) : (parseFloat(t.reported_monthly_payment)||0);
      return bal > 0 || pay > 0; // exclude $0 balance + $0 payment accounts
    })
    .map(tl => {
      const pay = tl.debt_type === 'STUDENT_LOAN' ? (parseFloat(tl.student_qualifying_payment)||0) : (parseFloat(tl.reported_monthly_payment)||0);
      return `
        <tr>
          <td colspan="2">${tl.creditor_name_raw} <span style="color:#666;font-size:11px">(${(tl.debt_type||'').replace(/_/g,' ')})</span></td>
          <td style="text-align:right">${fmt$(parseFloat(tl.balance)||0)}</td>
          <td style="text-align:right">${fmt$(pay)}/mo</td>
          <td style="text-align:right;color:#2563eb">Remains Open</td>
        </tr>
      `;
    }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Debt Resolution Plan — ${borrowerName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, serif; color: #1a1a1a; background: #fff; padding: 40px 48px; font-size: 13px; line-height: 1.6; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e1b4b; padding-bottom: 18px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.5px; }
  .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .doc-meta { text-align: right; font-size: 11px; color: #6b7280; }
  .doc-meta strong { color: #1a1a1a; font-size: 13px; }
  .title-block { background: #1e1b4b; color: white; padding: 18px 24px; border-radius: 8px; margin-bottom: 24px; }
  .title-block h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .title-block p { font-size: 12px; opacity: 0.8; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .info-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
  .info-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 8px; }
  .info-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; border-bottom: 1px solid #f3f4f6; }
  .info-row:last-child { border-bottom: none; }
  .info-row .val { font-weight: 700; color: #1e1b4b; }
  .dti-bar { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .dti-bar h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 12px; }
  .dti-visual { display: flex; align-items: center; gap: 20px; }
  .dti-box { text-align: center; background: white; border-radius: 8px; padding: 12px 20px; border: 2px solid #e5e7eb; min-width: 100px; }
  .dti-box.current { border-color: #f59e0b; }
  .dti-box.target  { border-color: #16a34a; }
  .dti-num { font-size: 28px; font-weight: 900; }
  .dti-num.current { color: #d97706; }
  .dti-num.target  { color: #16a34a; }
  .dti-label { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .arrow { font-size: 24px; color: #9ca3af; }
  .dti-note { flex: 1; font-size: 12px; color: #374151; background: #f0fdf4; border-left: 3px solid #16a34a; padding: 10px 14px; border-radius: 4px; }
  h2 { font-size: 15px; font-weight: 800; color: #1e1b4b; margin: 20px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
  th { background: #1e1b4b; color: white; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
  th:not(:first-child) { text-align: right; }
  td { padding: 9px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  tfoot td { background: #1e1b4b !important; color: white; font-weight: 700; padding: 10px; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .tag-green { background: #dcfce7; color: #15803d; }
  .tag-blue  { background: #dbeafe; color: #1d4ed8; }
  .talking-point { background: #faf5ff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .talking-point h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #7c3aed; margin-bottom: 8px; }
  .talking-point p { font-size: 12px; color: #374151; line-height: 1.7; }
  .disclaimer-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 10.5px; color: #6b7280; line-height: 1.7; }
  .disclaimer-block h4 { font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #1e1b4b; margin-top: 24px; padding-top: 14px; font-size: 10.5px; color: #6b7280; }
  .footer .lo-info { line-height: 1.8; }
  .footer .equal-housing { font-size: 10px; text-align: right; }
  .summary-box { display: flex; gap: 12px; margin-bottom: 20px; }
  .sum-card { flex: 1; border-radius: 8px; padding: 14px; text-align: center; }
  .sum-card.purple { background: #f5f3ff; border: 1px solid #c4b5fd; }
  .sum-card.green  { background: #f0fdf4; border: 1px solid #86efac; }
  .sum-card.amber  { background: #fffbeb; border: 1px solid #fcd34d; }
  .sum-card .num   { font-size: 22px; font-weight: 900; }
  .sum-card.purple .num { color: #7c3aed; }
  .sum-card.green  .num { color: #16a34a; }
  .sum-card.amber  .num { color: #d97706; }
  .sum-card .lbl   { font-size: 10px; color: #6b7280; margin-top: 3px; }
  @media print {
    body { padding: 24px 32px; }
    .no-print { display: none; }
    @page { margin: 0.5in; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="brand">LoanBeacons™</div>
    <div class="brand-sub">Powered by ${companyName}</div>
  </div>
  <div class="doc-meta">
    <strong>Debt Resolution Summary</strong><br/>
    Prepared for: ${borrowerName}<br/>
    Date: ${today}<br/>
    Prepared by: ${loName} | NMLS #${loNMLS}
  </div>
</div>

<!-- Title -->
<div class="title-block">
  <h1>Your Personalized Debt Resolution Plan</h1>
  <p>This analysis was prepared to help you understand your current debt profile and the recommended steps to strengthen your mortgage application.</p>
</div>

<!-- DTI Visual -->
<div class="dti-bar">
  <h3>Debt-to-Income Ratio (DTI) — Before & After Resolution</h3>
  <div class="dti-visual">
    <div class="dti-box current">
      <div class="dti-num current">${fmtPct(resolutionPlan?.currentDTI || 0)}</div>
      <div class="dti-label">Current DTI</div>
    </div>
    <div class="arrow">→</div>
    <div class="dti-box target">
      <div class="dti-num target">${fmtPct(resolutionPlan?.dtiAfterPayoff || 0)}</div>
      <div class="dti-label">Projected DTI After Plan</div>
    </div>
    <div class="dti-note">
      <strong>What is DTI?</strong> Your Debt-to-Income ratio compares your total monthly debt payments to your gross monthly income.
      Lenders use this to determine how much mortgage you can comfortably carry.<br/><br/>
      <strong>${resolutionPlan?.prog?.label || loanProgram || 'Your'} Program Guidelines:</strong><br/>
      Standard guideline: <strong>${fmtPct(resolutionPlan?.guideline || 43)}</strong> or below.<br/>
      AUS (automated underwriting) may approve up to <strong>${fmtPct(resolutionPlan?.maxDTI || 50)}</strong> with strong compensating factors.<br/>
      ${resolutionPlan?.prog?.ausNote || ''}
    </div>
  </div>
</div>

<!-- Summary Cards -->
<div class="summary-box">
  <div class="sum-card purple">
    <div class="num">${fmt$(resolutionPlan?.payToCloseCost || 0)}</div>
    <div class="lbl">Total Payoff at Closing</div>
  </div>
  <div class="sum-card amber">
    <div class="num">${fmt$(resolutionPlan?.reliefTotal || 0)}/mo</div>
    <div class="lbl">Monthly Debt Eliminated</div>
  </div>
  <div class="sum-card green">
    <div class="num">${(resolutionPlan?.payToCloseItems || []).length}</div>
    <div class="lbl">Account${(resolutionPlan?.payToCloseItems||[]).length !== 1 ? 's' : ''} to Pay Off</div>
  </div>
</div>

<!-- Recommended Payoff Plan -->
<h2>Recommended Accounts to Pay Off at Closing</h2>
<p style="font-size:12px;color:#374151;margin-bottom:12px;">
  These accounts are recommended for payoff based on their monthly payment amounts.
  Eliminating the largest monthly payments first is the most efficient path to reducing your DTI.
  All payoffs are handled at closing through the title/settlement company — you do not need to pay these before closing.
</p>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Creditor</th>
      <th style="text-align:right">Payoff Balance</th>
      <th style="text-align:right">Monthly Payment Eliminated</th>
      <th style="text-align:right">Result</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="2">Total</td>
      <td style="text-align:right">${fmt$(resolutionPlan?.payToCloseCost || 0)}</td>
      <td style="text-align:right">−${fmt$(resolutionPlan?.reliefTotal || 0)}/mo</td>
      <td style="text-align:right">DTI: ${fmtPct(resolutionPlan?.dtiAfterPayoff || 0)}</td>
    </tr>
  </tfoot>
</table>

${remainingRows ? `
<!-- Remaining Debts -->
<h2>Accounts Remaining Open After Closing</h2>
<p style="font-size:12px;color:#374151;margin-bottom:12px;">These accounts will remain open and are included in your qualifying debt calculation.</p>
<table>
  <thead>
    <tr><th colspan="2">Creditor</th><th style="text-align:right">Balance</th><th style="text-align:right">Monthly Payment</th><th style="text-align:right">Status</th></tr>
  </thead>
  <tbody>${remainingRows}</tbody>
</table>` : ''}

<!-- LO Talking Point / Plain Language Summary -->
<div class="talking-point">
  <h3>Plain Language Summary</h3>
  <p>
    Based on a review of your credit report, your current monthly debt obligations total
    <strong>${fmt$(resolutionPlan?.totalDebt || 0)}/month</strong>.
    For your ${resolutionPlan?.prog?.label || loanProgram || 'selected'} program, the standard DTI guideline is
    <strong>${fmtPct(resolutionPlan?.guideline || 43)}</strong>. Automated underwriting may approve up to
    <strong>${fmtPct(resolutionPlan?.maxDTI || 50)}</strong> with strong compensating factors.
    By paying off ${(resolutionPlan?.payToCloseItems||[]).length} account${(resolutionPlan?.payToCloseItems||[]).length !== 1 ? 's' : ''} totaling
    <strong>${fmt$(resolutionPlan?.payToCloseCost || 0)}</strong> at closing, your monthly obligations drop by
    <strong>${fmt$(resolutionPlan?.reliefTotal || 0)}/month</strong>, bringing your DTI to
    <strong>${fmtPct(resolutionPlan?.dtiAfterPayoff || 0)}</strong> —
    ${(resolutionPlan?.ausRequiredAfterPlan)
      ? 'this is above the standard ' + fmtPct(resolutionPlan.guideline) + ' guideline but within the AUS maximum of ' + fmtPct(resolutionPlan.maxDTI) + '. <strong>Automated underwriting (DU/LPA) approval will be required with strong compensating factors</strong> such as reserves, a high credit score, or a low loan-to-value ratio.'
      : 'within program guidelines.'
    }
    These payoffs are coordinated through the settlement company at closing. No action is required from you before that date.
  </p>
</div>

${resolutionPlan?.collectionRisk ? `
<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
  <p style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">⚠ Collection Account Notice</p>
  <p style="font-size:12px;color:#78350f;line-height:1.6;">
    Your credit report shows non-medical collection accounts totaling <strong>${fmt$(resolutionPlan.nonMedicalCollTotal)}</strong>.
    Most conventional lenders require collection accounts over $2,000 in aggregate to be paid in full at or before closing,
    or supported by a documented repayment agreement. Your loan officer will discuss the best approach for your specific situation.
    This is separate from the accounts listed in your payoff plan above.
  </p>
</div>` : ''}

<!-- Legal Disclaimers -->
<div class="disclaimer-block">
  <h4>Important Disclosures & Disclaimers</h4>
  <p>
    <strong>Not a Loan Commitment.</strong> This document is for informational and analytical purposes only.
    It does not constitute a loan approval, loan commitment, or guarantee of financing of any kind.
    Final loan approval is subject to underwriting review, verification of all information, satisfactory appraisal,
    title examination, and all other conditions required by the lender. Loan terms and program eligibility are subject to change.
  </p><br/>
  <p>
    <strong>DTI Estimates.</strong> Debt-to-income ratio calculations shown in this document are estimates based on
    information extracted from your credit report and the loan parameters provided by your loan officer.
    Actual qualifying DTI may differ based on final income documentation, credit report review by the underwriter,
    and applicable program guidelines at the time of underwriting.
  </p><br/>
  <p>
    <strong>Credit Report Accuracy.</strong> This analysis is based on information extracted from your credit report.
    If you believe any item on your credit report is inaccurate, you have the right to dispute it directly with
    the reporting credit bureau under the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681.
  </p><br/>
  <p>
    <strong>Equal Credit Opportunity.</strong> ${companyName} is an equal opportunity lender.
    We do not discriminate on the basis of race, color, religion, national origin, sex, marital status, age,
    familial status, disability, or any other characteristic protected by applicable law, in accordance with the
    Equal Credit Opportunity Act (ECOA) and the Fair Housing Act.
  </p><br/>
  <p>
    <strong>Payoff Amounts.</strong> Account balances and payoff amounts shown are based on information available
    at the time this report was generated. Actual payoff amounts at closing may differ due to accrued interest,
    fees, and daily interest accrual. Final payoff amounts will be confirmed by the settlement/title company
    through official payoff statements obtained directly from each creditor.
  </p>
</div>

<!-- Footer -->
<div class="footer">
  <div class="lo-info">
    <strong>${loName}</strong> | NMLS #${loNMLS}<br/>
    ${companyName} | Company NMLS #${companyNMLS}<br/>
    This document was prepared on ${today} using LoanBeacons™ Debt Resolution Engine
  </div>
  <div class="equal-housing" style="text-align:right">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="44" height="44" style="display:inline-block;margin-bottom:4px">
      <rect width="60" height="60" rx="4" fill="#1e1b4b"/>
      <polygon points="30,8 6,28 12,28 12,52 48,52 48,28 54,28" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>
      <rect x="24" y="38" width="12" height="14" fill="white"/>
      <line x1="18" y1="32" x2="42" y2="32" stroke="white" stroke-width="2.5"/>
      <line x1="18" y1="39" x2="42" y2="39" stroke="white" stroke-width="2.5"/>
    </svg><br/>
    <span style="font-size:9px;font-weight:700;color:#1e1b4b;letter-spacing:0.5px">EQUAL HOUSING<br/>OPPORTUNITY</span><br/><br/>
    <span style="font-size:9px;color:#6b7280">LoanBeacons™ — Patent Pending</span>
  </div>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt$   = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = n => isNaN(n) || !isFinite(n) ? '—' : Number(n).toFixed(1) + '%';

const SOURCE_BADGES = {
  MISMO:         { label: 'MISMO',        color: 'bg-amber-100 text-amber-800' },
  CREDIT_REPORT: { label: 'Credit Report', color: 'bg-blue-100 text-blue-800'  },
  MANUAL:        { label: 'Manual',        color: 'bg-slate-100 text-slate-600'},
};

const DEBT_TYPES = ['REVOLVING','INSTALLMENT','MORTGAGE','STUDENT_LOAN','COLLECTION','CHARGE_OFF','LEASE','ALIMONY_CHILD_SUPPORT','OTHER'];

function mapMismoType(type) {
  if (!type) return 'OTHER';
  const t = type.toUpperCase();
  if (t.includes('STUDENT'))                       return 'STUDENT_LOAN';
  if (t.includes('REVOLV') || t.includes('CARD'))  return 'REVOLVING';
  if (t.includes('INSTALL'))                       return 'INSTALLMENT';
  if (t.includes('MORTGAGE') || t.includes('REAL')) return 'MORTGAGE';
  if (t.includes('COLLECT'))                       return 'COLLECTION';
  if (t.includes('LEASE'))                         return 'LEASE';
  if (t.includes('ALIMONY') || t.includes('CHILD')) return 'ALIMONY_CHILD_SUPPORT';
  return 'OTHER';
}

// ── Main Component ─────────────────────────────────────────────────
export default function DebtConsolidation() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const scenarioIdParam = searchParams.get('scenarioId');

  const [selectedScenario, setSelectedScenario] = useState(null);
  const [scenarios,        setScenarios]         = useState([]);
  const [search,   setSearch]   = useState('');
  const [showAll,  setShowAll]  = useState(false);
  const [tradelines,       setTradelines]        = useState([]);
  const [dedupeGroups,     setDedupeGroups]      = useState([]);
  const [auditLog,         setAuditLog]          = useState([]);
  const [toast,            setToast]             = useState('');
  const [saving,           setSaving]            = useState(false);
  const [activeTab,        setActiveTab]         = useState('resolution');
  const [showAddForm,      setShowAddForm]       = useState(false);
  // LO Override state — per-tradeline controls
  const [loOverrides,      setLoOverrides]       = useState({}); // { tradeline_id: { inPlan, paymentOverride, excludedNote, markedPaid } }
  const [editingPayment,   setEditingPayment]    = useState(null); // tradeline_id being edited
  const [paymentEditVal,   setPaymentEditVal]    = useState('');
  const [excludeNote,      setExcludeNote]       = useState('');
  const [excludingId,      setExcludingId]       = useState(null);

  const [newTradeline,     setNewTradeline]      = useState({
    creditor_name_raw: '', debt_type: 'REVOLVING', balance: '',
    reported_monthly_payment: '', documented_monthly_payment: '',
    account_last4: '', status: 'OPEN', idr_verified_zero: false,
  });

  const [loProfile,     setLoProfile]        = useState(null);
  const fileRef                              = useRef(null);
  const [uploadFile,    setUploadFile]       = useState(null);
  const [uploadLoading, setUploadLoading]    = useState(false);
  const [uploadResult,  setUploadResult]     = useState(null);
  const [uploadError,   setUploadError]      = useState('');
  const [showUpload,    setShowUpload]       = useState(true);

  const activeScenarioId   = scenarioIdParam || selectedScenario?.id || null;
  const { reportFindings } = useDecisionRecord(activeScenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);

  useEffect(() => {
    loadScenarios();
    loadLOProfile();
  }, []);

  const loadLOProfile = async () => {
    try {
      const auth = getAuth();
      const uid  = auth.currentUser?.uid;
      if (!uid) return;
      // Try loProfiles first (written by Admin), fall back to userProfiles
      const snap = await getDoc(doc(db, 'loProfiles', uid));
      if (snap.exists()) { setLoProfile(snap.data()); return; }
      const snap2 = await getDoc(doc(db, 'userProfiles', uid));
      if (snap2.exists()) setLoProfile(snap2.data());
    } catch (e) { console.error('LO profile load failed:', e); }
  };

  useEffect(() => {
    if (scenarioIdParam && scenarios.length > 0 && !selectedScenario) {
      const match = scenarios.find(s => s.id === scenarioIdParam);
      if (match) selectScenario(match);
    }
  }, [scenarioIdParam, scenarios]);

  const loadScenarios = async () => {
    try {
      const snap = await getDocs(collection(db, 'scenarios'));
      setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const selectScenario = async (scenario) => {
    setSelectedScenario(scenario);
    try {
      const tlSnap = await getDocs(collection(db, 'scenarios', scenario.id, 'tradelines'));
      let tls = tlSnap.docs.map(d => ({ tradeline_id: d.id, ...d.data() }));
      if (tls.length === 0 && scenario.liabilities?.length > 0) {
        tls = scenario.liabilities
          .filter(l => !l.excluded && parseFloat(l.monthlyPayment) > 0)
          .map((l, i) => ({
            tradeline_id: 'tl_mismo_' + i + '_' + Date.now(),
            creditor_name_raw: l.creditor || 'Unknown Creditor',
            debt_type: mapMismoType(l.type),
            balance: String(l.balance || 0),
            reported_monthly_payment: String(l.monthlyPayment || 0),
            documented_monthly_payment: '',
            account_last4: '',
            status: 'OPEN',
            idr_verified_zero: false,
            dedupe_action: 'NONE',
            source: 'MISMO',
          }));
      }
      const lp  = scenario.loanType || scenario.loan_type || scenario.loanProgram || '';
      const inv = scenario.conventionalInvestor || scenario.conventional_investor || '';
      const computed = tls.map(tl => {
        if (tl.debt_type === 'STUDENT_LOAN') {
          const r = computeStudentLoanPayment(tl, lp, inv);
          return { ...tl, student_qualifying_payment: r.payment, student_qual_payment_method: r.method };
        }
        return tl;
      });
      setTradelines(computed);
      runDedupe(computed);
    } catch (e) { console.error(e); setTradelines([]); setDedupeGroups([]); }
  };

  const runDedupe = (tls) => {
    const active  = tls.filter(t => t.dedupe_action !== 'AUTO_REMOVED' && t.dedupe_action !== 'MANUAL_EXCLUDED');
    const groups  = detectDuplicates(active);
    const updated = [...tls];
    groups.forEach(g => {
      if (g.confidence === 'HIGH' && g.group_type !== 'STUDENT_SUMMARY_CHILD') {
        const removeId = g.members.find(m => m.role === 'REMOVE')?.tradeline_id;
        if (removeId) {
          const idx = updated.findIndex(t => t.tradeline_id === removeId);
          if (idx > -1) updated[idx] = { ...updated[idx], dedupe_action: 'AUTO_REMOVED', dedupe_group_id: g.dedupe_group_id };
        }
        g.resolved = true;
      }
    });
    setTradelines(updated);
    setDedupeGroups(groups);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // Rich audit log — creates human-readable compliance entries
  const logAudit = (type, id, meta) => {
    const messages = {
      CREDIT_REPORT_UPLOADED:    m => `Credit report uploaded — ${m.tradelineCount} tradeline${m.tradelineCount !== 1 ? 's' : ''} extracted and applied to liability table`,
      TRADELINE_ADDED:           m => `LO added tradeline manually: ${m.creditor} (${m.type}) — Balance: $${Number(m.balance||0).toLocaleString()}, Payment: $${Number(m.payment||0).toLocaleString()}/mo`,
      DEDUPE_RESOLVED:           m => `Duplicate resolved: ${m.creditor || 'account'} — action: ${(m.action||'excluded').replace(/_/g,' ')}`,
      SCENARIO_SAVED:            m => `Liability data saved to scenario — ${m.tradeline_count} tradeline${m.tradeline_count !== 1 ? 's' : ''}`,
      LO_PLAN_OVERRIDE_IN:       m => `LO manually added "${m.creditor}" to pay-to-close plan (borrower preference)`,
      LO_PLAN_OVERRIDE_OUT:      m => `LO removed "${m.creditor}" from pay-to-close plan (borrower request)`,
      LO_PLAN_OVERRIDE_RESET:    m => `LO reset "${m.creditor}" to AI recommendation`,
      LO_PAYMENT_OVERRIDE:       m => `LO overrode qualifying payment for "${m.creditor}": $${m.oldPay}/mo → $${m.newPay}/mo (${m.reason || 'LO adjustment'})`,
      LO_MARKED_PAID:            m => `LO marked "${m.creditor}" as paid/excluded from DTI — Note: ${m.note || 'no note provided'}`,
      LO_UNMARKED_PAID:          m => `LO restored "${m.creditor}" to active DTI calculation`,
      PDF_EXPORTED:              m => `Borrower-ready PDF exported for ${m.borrower || 'borrower'}`,
      DECISION_RECORD_SAVED:     m => `Findings saved to Decision Record — DTI: ${m.dti}%, Pay-to-Close: $${Number(m.payToClose||0).toLocaleString()}`,
    };
    const msg = messages[type]?.(meta) || type.replace(/_/g, ' ');
    const entry = { event_type: type, subject_id: id, metadata: meta, message: msg, created_at: new Date() };
    setAuditLog(prev => [entry, ...prev]);
    if (selectedScenario) addDoc(collection(db, 'scenarios', selectedScenario.id, 'audit_events'), entry).catch(console.error);
  };

  // ── LO Override Handlers ──────────────────────────────────────
  const togglePlanOverride = (tl) => {
    const current = loOverrides[tl.tradeline_id];
    const qualPay = tl.debt_type === 'STUDENT_LOAN' ? (parseFloat(tl.student_qualifying_payment)||0) : (parseFloat(tl.reported_monthly_payment)||0);
    const inPlanNow = plan?.payToCloseItems?.some(p => p.tradeline_id === tl.tradeline_id);
    if (current?.inPlan === true) {
      // Was forced in — remove override (go back to AI)
      setLoOverrides(p => { const n = {...p}; delete n[tl.tradeline_id]; return n; });
      logAudit('LO_PLAN_OVERRIDE_RESET', tl.tradeline_id, { creditor: tl.creditor_name_raw });
    } else if (current?.inPlan === false) {
      // Was forced out — remove override (go back to AI)
      setLoOverrides(p => { const n = {...p}; delete n[tl.tradeline_id]; return n; });
      logAudit('LO_PLAN_OVERRIDE_RESET', tl.tradeline_id, { creditor: tl.creditor_name_raw });
    } else if (inPlanNow) {
      // AI included it — LO wants to remove
      setLoOverrides(p => ({ ...p, [tl.tradeline_id]: { ...p[tl.tradeline_id], inPlan: false } }));
      logAudit('LO_PLAN_OVERRIDE_OUT', tl.tradeline_id, { creditor: tl.creditor_name_raw });
    } else {
      // AI excluded it — LO wants to add
      setLoOverrides(p => ({ ...p, [tl.tradeline_id]: { ...p[tl.tradeline_id], inPlan: true } }));
      logAudit('LO_PLAN_OVERRIDE_IN', tl.tradeline_id, { creditor: tl.creditor_name_raw });
    }
  };

  const savePaymentOverride = (tl) => {
    const oldPay = tl.debt_type === 'STUDENT_LOAN' ? (parseFloat(tl.student_qualifying_payment)||0) : (parseFloat(tl.reported_monthly_payment)||0);
    setLoOverrides(p => ({ ...p, [tl.tradeline_id]: { ...p[tl.tradeline_id], paymentOverride: paymentEditVal } }));
    logAudit('LO_PAYMENT_OVERRIDE', tl.tradeline_id, { creditor: tl.creditor_name_raw, oldPay: oldPay.toFixed(0), newPay: paymentEditVal, reason: 'LO adjustment' });
    setEditingPayment(null); setPaymentEditVal('');
    showToast(`Payment updated for ${tl.creditor_name_raw} — DTI recalculated`);
  };

  const markAsPaid = (tl) => {
    if (!excludeNote.trim()) { showToast('Please enter a note explaining why this account is excluded.'); return; }
    setLoOverrides(p => ({ ...p, [tl.tradeline_id]: { ...p[tl.tradeline_id], markedPaid: true, excludedNote: excludeNote } }));
    logAudit('LO_MARKED_PAID', tl.tradeline_id, { creditor: tl.creditor_name_raw, note: excludeNote });
    setExcludingId(null); setExcludeNote('');
    showToast(`${tl.creditor_name_raw} excluded from DTI — logged to audit trail`);
  };

  const unmarkPaid = (tl) => {
    setLoOverrides(p => { const n = {...p}; if (n[tl.tradeline_id]) { delete n[tl.tradeline_id].markedPaid; delete n[tl.tradeline_id].excludedNote; } return n; });
    logAudit('LO_UNMARKED_PAID', tl.tradeline_id, { creditor: tl.creditor_name_raw });
    showToast(`${tl.creditor_name_raw} restored to active DTI`);
  };

  // ── Derived ────────────────────────────────────────────────────
  const activeTradelines     = tradelines.filter(t => t.dedupe_action !== 'AUTO_REMOVED' && t.dedupe_action !== 'MANUAL_EXCLUDED');
  const loanProgram          = selectedScenario?.loanType || selectedScenario?.loan_type || selectedScenario?.loanProgram || '';
  const conventionalInvestor = selectedScenario?.conventionalInvestor || selectedScenario?.conventional_investor || '';
  const monthlyIncome        = parseFloat(selectedScenario?.monthlyIncome) || 0;
  const loanAmount           = parseFloat(selectedScenario?.loanAmount)    || 0;
  const interestRate         = parseFloat(selectedScenario?.interestRate)  || 0;
  const propTaxes            = parseFloat(selectedScenario?.propTaxes)     || 0;
  const homeInsurance        = parseFloat(selectedScenario?.homeInsurance) || 0;
  const hoaDues              = parseFloat(selectedScenario?.hoaDues)       || 0;
  const mortgageInsurance    = parseFloat(selectedScenario?.mortgageInsurance) || 0;

  const pi = (() => {
    if (!loanAmount || !interestRate) return 0;
    const r = interestRate / 100 / 12, n = 360;
    if (r === 0) return loanAmount / n;
    return loanAmount * (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
  })();
  const totalHousing = pi + propTaxes + homeInsurance + hoaDues + mortgageInsurance;
  const totalDebt    = activeTradelines.reduce((s, t) => {
    const pay = t.debt_type === 'STUDENT_LOAN' ? (parseFloat(t.student_qualifying_payment)||0) : (parseFloat(t.reported_monthly_payment)||0);
    return s + pay;
  }, 0);
  const currentDTI    = monthlyIncome > 0 ? ((totalHousing + totalDebt) / monthlyIncome) * 100 : 0;
  const flaggedGroups  = dedupeGroups.filter(g => !g.resolved && (g.confidence === 'MEDIUM' || g.confidence === 'LOW' || g.group_type === 'STUDENT_SUMMARY_CHILD'));
  // Income verification cross-check
  const incomeUnverified = !selectedScenario?.incomeAnalyzerCompleted && !selectedScenario?.income_analyzer_completed;
  const plan          = buildResolutionPlan(activeTradelines, totalHousing, monthlyIncome, loanProgram, loOverrides);
  const crCount       = tradelines.filter(t => t.source === 'CREDIT_REPORT').length;
  const mismoCount    = tradelines.filter(t => t.source === 'MISMO').length;
  const prog          = PROGRAM_DTI_LIMITS[loanProgram?.toUpperCase()] || null;

  // ── AI Upload ──────────────────────────────────────────────────
  const handleAIReview = async () => {
    if (!uploadFile) return;
    setUploadLoading(true); setUploadError(''); setUploadResult(null);
    try {
      const base64Data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(uploadFile);
      });
      const isImage   = uploadFile.type.startsWith('image/');
      const mediaType = isImage ? uploadFile.type : 'application/pdf';
      const prompt    = `You are a senior mortgage processor reviewing a credit report for debt-to-income analysis.
Extract ALL open tradelines and return ONLY valid JSON, no markdown, no backticks:
{
  "tradelines": [{"creditor": "string", "type": "REVOLVING|INSTALLMENT|MORTGAGE|STUDENT_LOAN|COLLECTION|CHARGE_OFF|OTHER", "balance": number, "monthly_payment": number, "account_last4": "string or null", "status": "OPEN|CLOSED|PAID"}],
  "collections": [{"creditor": "string", "balance": number, "type": "medical|non_medical", "status": "open|paid"}],
  "total_monthly_debt": number,
  "flags": ["any underwriting concerns"]
}
Include ALL open revolving, installment, mortgage, student loans, and collections. Do NOT include closed or paid accounts unless they are collections.`;

      const msgContent = isImage
        ? [{ type: 'image',    source: { type: 'base64', media_type: mediaType,         data: base64Data } }, { type: 'text', text: prompt }]
        : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }, { type: 'text', text: prompt }];

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 3000, messages: [{ role: 'user', content: msgContent }] }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data  = await resp.json();
      const text  = data.content?.find(b => b.type === 'text')?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      setUploadResult(JSON.parse(clean));
    } catch (e) {
      setUploadError('Could not extract debt data. Check the file and try again.');
      console.error(e);
    } finally { setUploadLoading(false); }
  };

  const applyExtractedDebts = () => {
    if (!uploadResult) return;
    const lp  = selectedScenario?.loanType || selectedScenario?.loan_type || selectedScenario?.loanProgram || '';
    const inv = selectedScenario?.conventionalInvestor || selectedScenario?.conventional_investor || '';
    const extracted = (uploadResult.tradelines || []).map((t, i) => {
      let newTl = {
        tradeline_id: 'tl_cr_' + Date.now() + '_' + i,
        creditor_name_raw: t.creditor || 'Unknown',
        debt_type: t.type || 'OTHER',
        balance: String(t.balance || 0),
        reported_monthly_payment: String(t.monthly_payment || 0),
        documented_monthly_payment: '',
        account_last4: t.account_last4 || '',
        status: (t.status || 'OPEN').toUpperCase(),
        idr_verified_zero: false,
        dedupe_action: 'NONE',
        source: 'CREDIT_REPORT',
      };
      if (newTl.debt_type === 'STUDENT_LOAN') {
        const r = computeStudentLoanPayment(newTl, lp, inv);
        newTl = { ...newTl, student_qualifying_payment: r.payment, student_qual_payment_method: r.method };
      }
      return newTl;
    });
    const collections = (uploadResult.collections || []).map((c, i) => ({
      tradeline_id: 'tl_coll_' + Date.now() + '_' + i,
      creditor_name_raw: c.creditor || 'Collection',
      debt_type: 'COLLECTION',
      balance: String(c.balance || 0),
      reported_monthly_payment: '0',
      documented_monthly_payment: '',
      account_last4: '',
      status: (c.status || 'open').toUpperCase(),
      idr_verified_zero: false,
      dedupe_action: 'NONE',
      source: 'CREDIT_REPORT',
    }));
    const all = [...extracted, ...collections];
    setTradelines(all);
    runDedupe(all);
    logAudit('CREDIT_REPORT_UPLOADED', 'upload', { tradelineCount: all.length });
    setUploadResult(null); setUploadFile(null); setShowUpload(false);
    setActiveTab('resolution');
    showToast(`✓ ${all.length} tradelines loaded — Resolution Engine ready`);
  };

  const handleAddTradeline = () => {
    const id = 'tl_' + Date.now();
    let newTl = { ...newTradeline, tradeline_id: id, dedupe_action: 'NONE', source: 'MANUAL' };
    if (newTl.debt_type === 'STUDENT_LOAN') {
      const r = computeStudentLoanPayment(newTl, loanProgram, conventionalInvestor);
      newTl = { ...newTl, student_qualifying_payment: r.payment, student_qual_payment_method: r.method };
    }
    const updated = [...tradelines, newTl];
    setTradelines(updated); runDedupe(updated); setShowAddForm(false);
    logAudit('TRADELINE_ADDED', id, { creditor: newTl.creditor_name_raw, type: newTl.debt_type, balance: newTl.balance, payment: newTl.reported_monthly_payment });
    setNewTradeline({ creditor_name_raw: '', debt_type: 'REVOLVING', balance: '', reported_monthly_payment: '', documented_monthly_payment: '', account_last4: '', status: 'OPEN', idr_verified_zero: false });
  };

  const handleSave = async () => {
    if (!selectedScenario) return;
    setSaving(true);
    try {
      for (const tl of tradelines) {
        const { tradeline_id, ...data } = tl;
        await setDoc(doc(db, 'scenarios', selectedScenario.id, 'tradelines', tradeline_id), { ...data, updated_at: new Date() });
      }
      await updateDoc(doc(db, 'scenarios', selectedScenario.id), {
        debt_resolution_analysis: {
          completed_at: new Date(), total_monthly_obligations: totalDebt,
          qualifying_dti: parseFloat(currentDTI.toFixed(1)) || 0,
          tradeline_count: tradelines.length,
          resolution_path: plan?.alreadyOk ? 'NO_ACTION' : 'PAY_TO_CLOSE',
          pay_to_close_cost: plan?.payToCloseCost || 0,
        }
      });
      logAudit('SCENARIO_SAVED', selectedScenario.id, { tradeline_count: tradelines.length });
      showToast('Saved to scenario successfully!');
    } catch (e) { console.error(e); showToast('Error saving. Please try again.'); }
    finally { setSaving(false); }
  };

  const handleSaveToRecord = async () => {
    if (!activeScenarioId) return;
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('DEBT_CONSOLIDATION', {
        tradelineCount: tradelines.length, activeCount: activeTradelines.length,
        totalMonthlyObligations: totalDebt, qualifyingDTI: parseFloat(currentDTI.toFixed(1)) || 0,
        flaggedGroups: flaggedGroups.length, resolutionPath: plan?.alreadyOk ? 'NO_ACTION' : 'PAY_TO_CLOSE',
        payToCloseCost: plan?.payToCloseCost || 0,
        dtiAfterResolution: parseFloat((plan?.dtiAfterPayoff || 0).toFixed(1)),
        timestamp: new Date().toISOString(),
      });
      if (writtenId) {
        setSavedRecordId(writtenId);
        logAudit('DECISION_RECORD_SAVED', writtenId, { dti: parseFloat(currentDTI.toFixed(1)), payToClose: plan?.payToCloseCost || 0 });
      }
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  const applyDedupeRecommendation = (group) => {
    const targetId = group.members.find(m => m.role === 'SUMMARY' || m.role === 'REMOVE')?.tradeline_id;
    if (!targetId) return;
    setTradelines(prev => prev.map(t => t.tradeline_id === targetId ? { ...t, dedupe_action: 'MANUAL_EXCLUDED' } : t));
    setDedupeGroups(prev => prev.map(g => g.dedupe_group_id === group.dedupe_group_id ? { ...g, resolved: true } : g));
    logAudit('DEDUPE_RESOLVED', group.dedupe_group_id, {});
    showToast('Duplicate resolved — liability table updated.');
  };

  // ── Scenario Picker ────────────────────────────────────────────
  if (!selectedScenario) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
      <ModuleNav moduleNumber={6} />
        <div className="bg-gradient-to-br from-slate-900 to-violet-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-violet-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">06</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-violet-400 uppercase">Stage 1 — Pre-Structure</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">Debt Resolution Engine™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Upload the credit report — AI extracts all liabilities — the engine builds the minimum-cost Pay-to-Close plan. Find the fastest, cheapest path to qualification.</p>
            <div className="flex flex-wrap gap-2">
              {['Credit Report Upload', 'AI Debt Extraction', 'Pay-to-Qualify Plan', 'Minimum Cost Strategy', 'DTI Rescue', 'Borrower PDF Export'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2>
            <p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-violet-600 hover:text-violet-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs violet-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => selectScenario(s)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-violet-300 hover:bg-violet-50/30 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-violet-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-violet-50 text-violet-600 border-violet-100 border px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-violet-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-violet-500 hover:text-violet-700 border-violet-200 hover:bg-violet-50 py-3 border border-dashed rounded-2xl transition-all">
                  View all {filtered.length} scenarios
                </button>
              )}
              {showAll && filtered.length > 5 && (
                <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main Module ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-6 pb-24">
      {toast && <div className="fixed top-4 right-4 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-semibold">{toast}</div>}

      <div className="max-w-6xl mx-auto px-4">

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-violet-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => setSelectedScenario(null)} className="text-violet-300 hover:text-white text-xs">← Scenarios</button>
                <span className="text-violet-400">|</span>
                <span className="text-xs font-bold tracking-widest text-violet-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-violet-500/30 text-violet-200 text-xs px-2 py-0.5 rounded-full border border-violet-400/30">Module 6</span>
              </div>
              <h1 className="text-2xl font-bold">Debt Resolution Engine™</h1>
              <p className="text-violet-300 text-sm mt-0.5">
                {selectedScenario.scenarioName || `${selectedScenario.firstName||''} ${selectedScenario.lastName||''}`.trim()} · {loanProgram||'--'} · {fmt$(loanAmount)} loan
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              {currentDTI > 0 && (
                <span className={`text-xs px-3 py-1 rounded-full border font-bold ${
                  currentDTI <= (prog?.guideline||43) ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  : currentDTI <= (prog?.backMax||50) ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                  : 'bg-red-500/20 text-red-300 border-red-400/30'
                }`}>
                  DTI {fmtPct(currentDTI)} {currentDTI <= (prog?.guideline||43) ? '✓ Within Guideline' : currentDTI <= (prog?.backMax||50) ? '⚠ Above Guideline — AUS Required' : '✗ Exceeds Maximum'}
                </span>
              )}
            </div>
          </div>
          {activeTradelines.length > 0 && (
            <div className="border-t border-white/10 pt-4 mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Monthly Debts', val: fmt$(totalDebt), sub: activeTradelines.length + ' accounts' },
                { label: 'Housing PITI',  val: totalHousing > 0 ? fmt$(totalHousing) : '—', sub: 'from scenario' },
                { label: 'Back-End DTI',  val: fmtPct(currentDTI), sub: `guideline ${prog ? fmtPct(prog.guideline||43) : '43%'} / max ${prog ? fmtPct(prog.backMax||50) : '50%'}` },
                { label: 'Pay to Close',  val: plan && !plan.alreadyOk ? fmt$(plan.payToCloseCost) : '—', sub: plan?.alreadyOk ? 'none required' : `${plan?.payToCloseItems?.length||0} accounts` },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-xs text-violet-300 mb-0.5">{item.label}</div>
                  <div className="text-xl font-black text-white">{item.val}</div>
                  <div className="text-xs text-white/40">{item.sub}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Upload */}
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🤖 AI Credit Report Upload</h2>
              <p className="text-xs text-slate-400 mt-0.5">Upload the credit report — AI extracts all open debts and the engine builds the payoff plan automatically.</p>
            </div>
            <div className="flex items-center gap-3">
              {crCount > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-full">✓ {crCount} debts loaded</span>}
              <button onClick={() => setShowUpload(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">{showUpload ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          {showUpload && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-indigo-300 rounded-xl p-6 text-center bg-indigo-50/60 cursor-pointer hover:bg-indigo-50 transition-all"
                onClick={() => !uploadFile && fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".pdf,image/*"
                  onChange={e => { setUploadFile(e.target.files?.[0]||null); setUploadResult(null); setUploadError(''); }}
                  className="hidden" />
                {uploadFile ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 font-semibold">📄 {uploadFile.name}</span>
                    <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} className="text-xs text-slate-400 hover:text-red-400">✕ Remove</button>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl mb-2">📋</div>
                    <p className="text-sm font-bold text-indigo-700">Click to upload credit report</p>
                    <p className="text-xs text-slate-400 mt-1">PDF or image — Haiku AI extracts all open debts automatically</p>
                  </div>
                )}
              </div>
              {uploadFile && !uploadResult && (
                <button onClick={handleAIReview} disabled={uploadLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all">
                  {uploadLoading ? '⏳ Analyzing credit report...' : '🔍 Extract All Debts — Run AI Review'}
                </button>
              )}
              {uploadError && <p className="text-xs text-red-500 font-semibold">{uploadError}</p>}
              {uploadResult && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">✓ Extraction Complete</p>
                  <div className="flex gap-3 flex-wrap text-center">
                    {uploadResult.tradelines?.length > 0 && (
                      <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="font-black text-2xl text-blue-700">{uploadResult.tradelines.length}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Open Tradelines</div>
                      </div>
                    )}
                    {uploadResult.collections?.length > 0 && (
                      <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="font-black text-2xl text-amber-600">{uploadResult.collections.length}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Collections</div>
                      </div>
                    )}
                    {uploadResult.total_monthly_debt > 0 && (
                      <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="font-black text-2xl text-emerald-700">{fmt$(uploadResult.total_monthly_debt)}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Monthly Debt</div>
                      </div>
                    )}
                  </div>
                  {uploadResult.flags?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-bold text-amber-700 mb-1">⚠ Underwriting Flags</p>
                      {uploadResult.flags.map((f, i) => <p key={i} className="text-xs text-amber-700">• {f}</p>)}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={applyExtractedDebts} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">
                      ✓ Apply & Run Resolution Engine
                    </button>
                    <button onClick={() => setUploadResult(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">Discard</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        {tradelines.length > 0 && (
          <div className="flex gap-1 mb-5 bg-white border border-slate-200 rounded-xl p-1 w-fit">
            {[
              { key: 'resolution', label: '🎯 Resolution Plan' },
              { key: 'liabilities', label: '📋 Liabilities' },
              { key: 'audit', label: '📝 Audit Log' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Duplicate Alerts */}
        {flaggedGroups.length > 0 && (
          <div className="space-y-3 mb-5">
            {flaggedGroups.map(g => (
              <div key={g.dedupe_group_id} className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-amber-800">⚠️ {g.badge_label}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{g.tooltip}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => applyDedupeRecommendation(g)} className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg">Resolve</button>
                  <button onClick={() => setDedupeGroups(prev => prev.map(dg => dg.dedupe_group_id === g.dedupe_group_id ? {...dg, resolved: true} : dg))} className="text-xs text-amber-700 font-semibold px-3 py-1.5 border border-amber-300 rounded-lg hover:bg-amber-100">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Warnings Block ── */}
        {selectedScenario && (
          <div className="space-y-3 mb-5">
            {incomeUnverified && currentDTI > 0 && (
              <div className="bg-blue-50 border border-blue-300 rounded-xl px-5 py-3 flex items-start gap-3">
                <span className="text-blue-500 text-lg shrink-0 mt-0.5">ℹ</span>
                <div>
                  <p className="text-sm font-bold text-blue-800">Income Not Verified — DTI May Be Inaccurate</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    This analysis uses <strong>${fmt$(monthlyIncome)}/mo</strong> from the scenario. Income Analyzer (Module 3) has not been completed.
                    Actual qualifying income may differ after reviewing pay stubs, W-2s, and other documentation.
                    Complete Module 3 first for a more accurate DTI calculation.
                  </p>
                </div>
              </div>
            )}
            {plan?.collectionRisk && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-3 flex items-start gap-3">
                <span className="text-amber-500 text-lg shrink-0 mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">Collection Account Risk — Underwriting Condition Likely</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Non-medical collection accounts total <strong>${fmt$(plan.nonMedicalCollTotal)}</strong>.
                    Conventional guidelines require aggregate non-medical collections over $2,000 to be paid in full or have a documented repayment plan at closing.
                    FHA ignores medical collections but non-medical may still require a Letter of Explanation.
                  </p>
                  <p className="text-xs text-amber-600 mt-1 font-semibold">
                    Accounts: {plan.nonMedicalCollections.map(c => c.creditor_name_raw).join(', ')}
                  </p>
                </div>
              </div>
            )}
            {plan?.ausRequiredAfterPlan && plan?.payToCloseItems?.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-300 rounded-xl px-5 py-3 flex items-start gap-3">
                <span className="text-indigo-500 text-lg shrink-0 mt-0.5">📋</span>
                <div>
                  <p className="text-sm font-bold text-indigo-800">AUS Approval Required — Best Achievable DTI is {fmtPct(plan.dtiAfterPayoff)}</p>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Even after paying off all recommended accounts, the projected DTI of <strong>{fmtPct(plan.dtiAfterPayoff)}</strong> exceeds
                    the {plan.prog.label} standard guideline of <strong>{fmtPct(plan.guideline)}</strong>.
                    This loan will require AUS (DU/LPA) approval. Strong compensating factors — reserves, credit score, low LTV — will be critical.
                    Consider running AUS Rescue (Module 8) to evaluate program alternatives.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Resolution Plan Tab ── */}
        {activeTab === 'resolution' && (
          <div className="space-y-5">
            {!plan || activeTradelines.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div className="text-5xl mb-4">🎯</div>
                <p className="text-slate-600 font-bold text-lg mb-2">Ready to run</p>
                <p className="text-slate-400 text-sm">Upload the credit report above to automatically build the debt resolution plan.</p>
              </div>
            ) : (plan.atGuideline || plan.alreadyOk) ? (
              // Path: No action needed
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-3xl shrink-0">✅</div>
                  <div>
                    <h2 className="text-lg font-black text-emerald-800">DTI is Within Guidelines — No Payoff Required</h2>
                    <p className="text-sm text-emerald-700 mt-1">
                      Back-end DTI of <strong>{fmtPct(plan.currentDTI)}</strong> is
                      {plan.atGuideline
                        ? <> within the {plan.prog.label} guideline of <strong>{fmtPct(plan.guideline)}</strong>. This file is structurally clean — proceed to loan structuring.</>
                        : <> above the standard {plan.prog.label} guideline of <strong>{fmtPct(plan.guideline)}</strong> but within the AUS maximum of <strong>{fmtPct(plan.maxDTI)}</strong>. Loan may qualify with AUS approval. Consider paying down debts to reach guideline. <span className="text-xs opacity-80">{plan.prog.ausNote}</span></>
                      }
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  {[['Current DTI', fmtPct(plan.currentDTI), 'text-emerald-700'], ['Program Target', fmtPct(plan.targetDTI), 'text-slate-700'], ['Payoff Required', '$0', 'text-emerald-700']].map(([l, v, c]) => (
                    <div key={l} className="bg-white rounded-lg p-3 border border-emerald-100">
                      <div className={`font-black text-2xl ${c}`}>{v}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* DTI Gap Banner */}
                <div className={`rounded-xl border p-5 ${plan.withinMax ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                      <p className={`font-black text-base ${plan.withinMax ? 'text-amber-800' : 'text-red-800'}`}>
                        {plan.withinMax ? '⚠ DTI elevated — optimization available' : '🚫 DTI exceeds maximum — resolution required to qualify'}
                      </p>
                      <p className={`text-xs mt-1.5 ${plan.withinMax ? 'text-amber-700' : 'text-red-700'}`}>
                        Current DTI: <strong>{fmtPct(plan.currentDTI)}</strong> · {plan.prog.label} guideline: <strong>{fmtPct(plan.guideline)}</strong> · AUS max: <strong>{fmtPct(plan.maxDTI)}</strong>
                        {plan.aboveGuideline && <span className="ml-2 font-bold">(AUS approval likely required above {fmtPct(plan.guideline)})</span>}
                        <br/>Need to eliminate <strong>{fmt$(plan.debtGap)}/mo</strong> in debt payments to reach the {fmtPct(plan.guideline)} guideline.
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-4xl font-black ${plan.withinMax ? 'text-amber-700' : 'text-red-600'}`}>{fmtPct(plan.currentDTI)}</div>
                      <div className="text-xs text-slate-500">Current DTI</div>
                    </div>
                  </div>
                </div>

                {/* ── Pay to Close Plan ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-700 to-indigo-700 px-5 py-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h2 className="text-white font-black text-lg">Recommended Pay-to-Close Plan</h2>
                        <p className="text-violet-200 text-xs mt-0.5">
                          Accounts sorted by highest monthly payment — biggest DTI relief per account eliminated.
                          We pay off the fewest accounts needed to close the DTI gap.
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-white">{fmt$(plan.payToCloseCost)}</div>
                        <div className="text-violet-200 text-xs">total payoff at closing</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    {/* Before / After */}
                    <div className="flex items-center gap-4 mb-5 flex-wrap">
                      <div className="flex-1 bg-slate-50 rounded-xl p-4 text-center border border-slate-200">
                        <div className="text-xs text-slate-400 mb-1">Before</div>
                        <div className="text-3xl font-black text-slate-700">{fmtPct(plan.currentDTI)}</div>
                        <div className="text-xs text-slate-400 mt-1">{fmt$(plan.totalDebt)}/mo in debts</div>
                      </div>
                      <div className="text-3xl text-violet-400 font-black">→</div>
                      <div className="flex-1 bg-emerald-50 rounded-xl p-4 text-center border border-emerald-200">
                        <div className="text-xs text-slate-400 mb-1">After Payoff</div>
                        <div className="text-3xl font-black text-emerald-700">{fmtPct(plan.dtiAfterPayoff)}</div>
                        <div className="text-xs text-emerald-600 mt-1">−{fmt$(plan.reliefTotal)}/mo eliminated</div>
                      </div>
                      <div className="flex-1 bg-violet-50 rounded-xl p-4 text-center border border-violet-200">
                        <div className="text-xs text-slate-400 mb-1">Cost to Close Gap</div>
                        <div className="text-3xl font-black text-violet-700">{fmt$(plan.payToCloseCost)}</div>
                        <div className="text-xs text-slate-400 mt-1">{plan.payToCloseItems.length} account{plan.payToCloseItems.length !== 1 ? 's' : ''} paid at closing</div>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden mb-5">
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Accounts to Pay Off — Sorted by Highest Monthly Payment</p>
                        <p className="text-xs text-slate-400 italic">Highest payment first = most DTI relief per account</p>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="px-4 py-2 text-left text-xs text-slate-400 font-semibold">#</th>
                            <th className="px-4 py-2 text-left text-xs text-slate-400 font-semibold">Creditor</th>
                            <th className="px-4 py-2 text-right text-xs text-slate-400 font-semibold">Payoff Balance</th>
                            <th className="px-4 py-2 text-right text-xs text-slate-400 font-semibold">Monthly Relief</th>
                            <th className="px-4 py-2 text-right text-xs text-slate-400 font-semibold">DTI Reduction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.payToCloseItems.map((tl, i) => {
                            const dtiDrop = monthlyIncome > 0 ? (tl.qualPay / monthlyIncome * 100).toFixed(1) : '—';
                            return (
                              <tr key={tl.tradeline_id} className={`border-b border-slate-50 ${i === 0 ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                                <td className="px-4 py-3">
                                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{i+1}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-slate-800">{tl.creditor_name_raw}</div>
                                  <div className="text-xs text-slate-400">{(tl.debt_type||'').replace(/_/g,' ')} {tl.account_last4 ? `· ****${tl.account_last4}` : ''}</div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{fmt$(tl.balance_num)}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">−{fmt$(tl.qualPay)}/mo</td>
                                <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">−{dtiDrop}%</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-violet-700">
                            <td colSpan={2} className="px-4 py-3 text-sm font-bold text-white">Total Payoff at Closing</td>
                            <td className="px-4 py-3 text-right font-mono font-black text-white">{fmt$(plan.payToCloseCost)}</td>
                            <td className="px-4 py-3 text-right font-mono font-black text-emerald-300">−{fmt$(plan.reliefTotal)}/mo</td>
                            <td className="px-4 py-3 text-right text-xs font-black text-white">{fmtPct(plan.currentDTI)} → {fmtPct(plan.dtiAfterPayoff)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* LO Talking Point */}
                    <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 mb-4">
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">💬 LO Talking Point — Ready to Use with Borrower</p>
                      <p className="text-sm text-violet-900 leading-relaxed">
                        "Right now your monthly debt payments are <strong>{fmt$(plan.totalDebt)}/mo</strong>, which puts your DTI at <strong>{fmtPct(plan.currentDTI)}</strong>.
                        The {plan.prog.label} standard guideline is <strong>{fmtPct(plan.guideline)}</strong> — automated underwriting can go up to <strong>{fmtPct(plan.maxDTI)}</strong> with compensating factors.
                        The fastest way to get there is to pay off {plan.payToCloseItems.length === 1 ? 'this account' : 'these ' + plan.payToCloseItems.length + ' accounts'} — {plan.payToCloseItems.map(t => t.creditor_name_raw).join(', ')} — totaling <strong>{fmt$(plan.payToCloseCost)}</strong>.
                        That happens at closing through the title company, so you don't need to do anything before then.
                        Afterward your monthly debt drops by <strong>{fmt$(plan.reliefTotal)}/mo</strong> and your DTI lands at <strong>{fmtPct(plan.dtiAfterPayoff)}</strong>
                        {plan.ausRequiredAfterPlan
                          ? <> — this is above the standard {fmtPct(plan.guideline)} guideline but within the AUS maximum of {fmtPct(plan.maxDTI)}. Automated underwriting approval will be required with compensating factors.</>
                          : <> — within program guidelines.</>
                        }"
                      </p>
                    </div>

                    {/* Export PDF button */}
                    <button
                      onClick={() => {
                      generateBorrowerPDF(selectedScenario, plan, tradelines, loanProgram, loProfile);
                      logAudit('PDF_EXPORTED', 'pdf', { borrower: `${selectedScenario.firstName||''} ${selectedScenario.lastName||''}`.trim() });
                    }}
                      className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                      📄 Export Borrower-Ready PDF — Debt Resolution Summary
                    </button>
                  </div>
                </div>

                {/* Cash-Out path for refis */}
                {(['Cash-Out Refinance','Refinance','Rate/Term Refinance','Rate and Term Refinance','REFI','Refi'].includes(selectedScenario?.loanPurpose) ||
                  (selectedScenario?.loanPurpose || '').toLowerCase().includes('refi') ||
                  (selectedScenario?.loanPurpose || '').toLowerCase().includes('refinance')) && (
                  <div className="bg-white rounded-xl border border-teal-200 shadow-sm p-5">
                    <h2 className="font-black text-teal-800 text-base mb-2">Alternative Path — Cash-Out Consolidation</h2>
                    <p className="text-xs text-teal-700">
                      Since this is a refinance, you could roll <strong>{fmt$(plan.payToCloseCost)}</strong> into the new loan rather than paying cash at closing.
                      New loan amount would be <strong>{fmt$(loanAmount + plan.payToCloseCost)}</strong>.
                      Use RateIntel (Module 10) to compare whether the consolidated rate is better than carrying these debts separately.
                    </p>
                  </div>
                )}
              </>
            )}

            {activeScenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Debt Resolution Engine™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
            <button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50 text-sm">
              {saving ? 'Saving...' : '💾 Save to Scenario'}
            </button>
          </div>
        )}

        {/* ── Liabilities Tab ── */}
        {/* ── Liabilities Tab ── */}
        {activeTab === 'liabilities' && (
          <div className="space-y-4">

            {/* Purpose Banner */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-3">
              <p className="text-sm font-bold text-violet-800 mb-0.5">🎛 LO Override Panel</p>
              <p className="text-xs text-violet-700">
                The AI built the pay-to-close plan above based on highest monthly payment first.
                Use this panel to customize: add or remove any account from the plan, override a payment amount,
                or mark an account as already paid. The Resolution Plan updates in real time as you make changes.
                Every action is logged to the Audit Trail for compliance.
              </p>
            </div>

            {/* Add Tradeline */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h2 className="font-bold text-slate-800">Liability Table</h2>
                  <div className="flex gap-2 mt-1 text-xs flex-wrap">
                    {mismoCount > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{mismoCount} from MISMO</span>}
                    {crCount > 0    && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{crCount} from Credit Report</span>}
                    {Object.keys(loOverrides).length > 0 && <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">{Object.keys(loOverrides).length} LO override{Object.keys(loOverrides).length !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <button onClick={() => setShowAddForm(!showAddForm)} className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg">+ Add Tradeline</button>
              </div>

              {showAddForm && (
                <div className="bg-violet-50 border-b border-violet-200 p-4">
                  <p className="text-xs font-semibold text-violet-700 mb-3">Add a debt not on the credit report or enter a corrected amount:</p>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Creditor *</label>
                      <input value={newTradeline.creditor_name_raw} onChange={e => setNewTradeline(p=>({...p,creditor_name_raw:e.target.value}))}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="e.g. Chase"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Type *</label>
                      <select value={newTradeline.debt_type} onChange={e => setNewTradeline(p=>({...p,debt_type:e.target.value}))}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                        {DEBT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Balance *</label>
                      <input type="number" value={newTradeline.balance} onChange={e => setNewTradeline(p=>({...p,balance:e.target.value}))}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="0"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Monthly Payment</label>
                      <input type="number" value={newTradeline.reported_monthly_payment} onChange={e => setNewTradeline(p=>({...p,reported_monthly_payment:e.target.value}))}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="0"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Acct Last 4</label>
                      <input value={newTradeline.account_last4} onChange={e => setNewTradeline(p=>({...p,account_last4:e.target.value}))}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" maxLength={4}/></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddTradeline} className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-lg">Add to Liability Table</button>
                    <button onClick={() => setShowAddForm(false)} className="bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {/* Override table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-semibold">Creditor</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-semibold">Balance</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-semibold">Qualifying Pmt</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-400 font-semibold">In Pay-to-Close Plan</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-400 font-semibold">LO Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tradelines.length === 0
                      ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No tradelines yet. Upload a credit report or add manually above.</td></tr>
                      : tradelines.map(tl => {
                          const isDedupeExcluded = tl.dedupe_action === 'AUTO_REMOVED' || tl.dedupe_action === 'MANUAL_EXCLUDED';
                          const ov          = loOverrides[tl.tradeline_id] || {};
                          const isMarkedPaid = ov.markedPaid;
                          const baseQualPay = tl.debt_type === 'STUDENT_LOAN' ? parseFloat(tl.student_qualifying_payment||0) : parseFloat(tl.reported_monthly_payment||0);
                          const qualPay     = isMarkedPaid ? 0 : (ov.paymentOverride !== undefined && ov.paymentOverride !== '' ? parseFloat(ov.paymentOverride)||0 : baseQualPay);
                          const inPlan      = plan?.payToCloseItems?.some(p => p.tradeline_id === tl.tradeline_id);
                          const srcBadge    = SOURCE_BADGES[tl.source] || SOURCE_BADGES['MANUAL'];
                          const hasOverride = ov.inPlan !== undefined;
                          const hasPayOv    = ov.paymentOverride !== undefined && ov.paymentOverride !== '';
                          const isEditingThis = editingPayment === tl.tradeline_id;
                          const isExcludingThis = excludingId === tl.tradeline_id;

                          if (isDedupeExcluded) return (
                            <tr key={tl.tradeline_id} className="opacity-30 bg-slate-50">
                              <td className="px-4 py-3 text-slate-400 text-xs" colSpan={5}>{tl.creditor_name_raw} — excluded by duplicate detection</td>
                            </tr>
                          );

                          return (
                            <tr key={tl.tradeline_id} className={`${isMarkedPaid ? 'bg-slate-50 opacity-60' : inPlan ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-800">{tl.creditor_name_raw}</div>
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  <span className="text-xs text-slate-400">{(tl.debt_type||'').replace(/_/g,' ')}</span>
                                  {tl.account_last4 && <span className="text-xs text-slate-400">· ****{tl.account_last4}</span>}
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${srcBadge.color}`}>{srcBadge.label}</span>
                                  {hasOverride && <span className="text-xs bg-violet-100 text-violet-700 font-bold px-1.5 py-0.5 rounded-full">LO Override</span>}
                                  {hasPayOv    && <span className="text-xs bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full">Pmt Overridden</span>}
                                  {isMarkedPaid && <span className="text-xs bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded-full">Marked Paid</span>}
                                </div>
                                {isMarkedPaid && ov.excludedNote && <div className="text-xs text-slate-400 italic mt-0.5">Note: {ov.excludedNote}</div>}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt$(parseFloat(tl.balance||0))}</td>
                              <td className="px-4 py-3 text-right">
                                {isEditingThis ? (
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className="text-slate-400 text-xs">$</span>
                                    <input type="number" value={paymentEditVal} onChange={e => setPaymentEditVal(e.target.value)}
                                      className="w-20 border border-violet-300 rounded px-2 py-1 text-xs text-right focus:ring-1 focus:ring-violet-400" autoFocus/>
                                    <button onClick={() => savePaymentOverride(tl)} className="text-xs bg-violet-600 text-white px-2 py-1 rounded font-bold">Save</button>
                                    <button onClick={() => setEditingPayment(null)} className="text-xs text-slate-400 px-1">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className={`font-mono font-bold ${isMarkedPaid ? 'line-through text-slate-400' : hasPayOv ? 'text-orange-600' : 'text-slate-700'}`}>
                                      {fmt$(qualPay)}/mo
                                    </span>
                                    {!isMarkedPaid && (
                                      <button onClick={() => { setEditingPayment(tl.tradeline_id); setPaymentEditVal(String(qualPay)); }}
                                        className="text-xs text-slate-300 hover:text-violet-500 ml-1" title="Override payment">✏️</button>
                                    )}
                                  </div>
                                )}
                                {hasPayOv && !isEditingThis && (
                                  <div className="text-xs text-slate-400 text-right">was {fmt$(baseQualPay)}/mo
                                    <button onClick={() => { setLoOverrides(p => { const n={...p}; if(n[tl.tradeline_id]) delete n[tl.tradeline_id].paymentOverride; return n; }); }} className="text-red-400 hover:text-red-600 ml-1 text-xs">undo</button>
                                  </div>
                                )}
                              </td>

                              {/* In Plan toggle */}
                              <td className="px-4 py-3 text-center">
                                {isMarkedPaid ? (
                                  <span className="text-xs text-slate-400">—</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <button onClick={() => togglePlanOverride(tl)}
                                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                                        inPlan
                                          ? 'bg-violet-600 text-white hover:bg-red-500'
                                          : 'bg-slate-100 text-slate-500 hover:bg-violet-100 hover:text-violet-700'
                                      }`}>
                                      {inPlan ? '✓ In Plan — Click to Remove' : '+ Add to Plan'}
                                    </button>
                                    {hasOverride && (
                                      <button onClick={() => { setLoOverrides(p => { const n={...p}; delete n[tl.tradeline_id]?.inPlan; if(Object.keys(n[tl.tradeline_id]||{}).length===0) delete n[tl.tradeline_id]; return n; }); logAudit('LO_PLAN_OVERRIDE_RESET', tl.tradeline_id, { creditor: tl.creditor_name_raw }); }}
                                        className="text-xs text-slate-400 hover:text-violet-600 underline">Reset to AI suggestion</button>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Mark as Paid / Exclude */}
                              <td className="px-4 py-3 text-center">
                                {isMarkedPaid ? (
                                  <button onClick={() => unmarkPaid(tl)} className="text-xs bg-slate-200 hover:bg-green-100 hover:text-green-700 text-slate-600 font-semibold px-3 py-1.5 rounded-lg">
                                    Restore to DTI
                                  </button>
                                ) : isExcludingThis ? (
                                  <div className="flex flex-col gap-1 items-center">
                                    <input value={excludeNote} onChange={e => setExcludeNote(e.target.value)}
                                      placeholder="Reason (required)..."
                                      className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-red-300"/>
                                    <div className="flex gap-1">
                                      <button onClick={() => markAsPaid(tl)} className="text-xs bg-red-500 hover:bg-red-600 text-white font-bold px-2 py-1 rounded">Confirm</button>
                                      <button onClick={() => { setExcludingId(null); setExcludeNote(''); }} className="text-xs text-slate-400 px-2 py-1">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => setExcludingId(tl.tradeline_id)}
                                    className="text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-red-200">
                                    Mark as Paid
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live DTI preview */}
            {activeTradelines.length > 0 && monthlyIncome > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Live DTI After Your Overrides</p>
                  <p className="text-xs text-slate-400">Updates in real time as you toggle accounts in/out of the plan</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-black text-slate-700">{fmtPct(currentDTI)}</div>
                    <div className="text-xs text-slate-400">Current</div>
                  </div>
                  <div className="text-xl text-violet-400 font-black">→</div>
                  <div className="text-center">
                    <div className={`text-2xl font-black ${plan && plan.dtiAfterPayoff <= (prog?.guideline||43) ? 'text-emerald-600' : plan && plan.dtiAfterPayoff <= (prog?.backMax||50) ? 'text-amber-600' : 'text-red-600'}`}>
                      {plan ? fmtPct(plan.dtiAfterPayoff) : '—'}
                    </div>
                    <div className="text-xs text-slate-400">After Plan</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-violet-700">{fmt$(plan?.payToCloseCost || 0)}</div>
                    <div className="text-xs text-slate-400">Pay to Close</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Audit Tab ── */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-slate-800 text-base">Compliance Audit Trail</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Every action taken on this file is timestamped and stored permanently.
                    This log protects the LO, the company, and the borrower — documenting how DTI was calculated,
                    what overrides were made, and who made them. Required for RESPA, ECOA, and fair lending compliance.
                  </p>
                </div>
                {auditLog.length > 0 && (
                  <span className="text-xs bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-full shrink-0">{auditLog.length} event{auditLog.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {auditLog.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                  <div className="text-3xl mb-2">📋</div>
                  <p className="text-slate-400 text-sm font-semibold">No actions recorded yet</p>
                  <p className="text-slate-300 text-xs mt-1">Events will appear here as you work through the module</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((e, i) => {
                    const isOverride = e.event_type.includes('OVERRIDE') || e.event_type.includes('MARKED');
                    const isUpload   = e.event_type.includes('UPLOAD') || e.event_type.includes('APPLIED');
                    const isDedupe   = e.event_type.includes('DEDUPE');
                    const isSave     = e.event_type.includes('SAVED') || e.event_type.includes('EXPORTED');
                    const iconColor  = isOverride ? 'text-violet-600' : isUpload ? 'text-blue-600' : isDedupe ? 'text-amber-600' : isSave ? 'text-emerald-600' : 'text-slate-400';
                    const icon       = isOverride ? '🎛' : isUpload ? '📋' : isDedupe ? '⚠️' : isSave ? '✅' : '•';
                    const ts         = new Date(e.created_at);
                    const timeStr    = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const dateStr    = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return (
                      <div key={i} className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${isOverride ? 'bg-violet-50 border-violet-100' : isSave ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                        <span className="text-base shrink-0 mt-0.5">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 leading-snug">{e.message || e.event_type.replace(/_/g,' ')}</p>
                          {e.metadata && Object.keys(e.metadata).length > 0 && (
                            <div className="flex gap-3 mt-1 flex-wrap">
                              {Object.entries(e.metadata).filter(([k]) => !['creditor'].includes(k)).map(([k,v]) => (
                                <span key={k} className="text-xs text-slate-400">{k.replace(/_/g,' ')}: <span className="font-semibold text-slate-500">{String(v)}</span></span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs text-slate-400">
                          <div className="font-semibold">{timeStr}</div>
                          <div>{dateStr}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {auditLog.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                <p className="text-xs font-bold text-amber-800 mb-1">⚖ Legal Notice</p>
                <p className="text-xs text-amber-700">
                  This audit trail is stored permanently in the borrower's loan file. It documents LO decision-making
                  in compliance with RESPA, ECOA, and applicable fair lending regulations.
                  Do not delete or alter entries. All overrides require documented rationale.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
</div>
  );
}
