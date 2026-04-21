// src/pages/QualifyingIntel.jsx
// LoanBeacons™ — Module 2 | Stage 1: Pre-Structure & Initial Analysis
// Qualifying Intelligence™ — DTI analysis, income qualification, program fit
// Enhanced: Student Loan Payment Factor (Option C) — program-aware qualifying payment wired into DTI
// Fix: verticalAlign: 'middle' on all ProgramFitRow <td> elements (Tailwind preflight override)
// v3.0 — Max Purchase Price, Rate Sensitivity, Buydown Analysis, Required Income, Save feature (Apr 2026)

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import ModuleNav from '../components/ModuleNav';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';

// ─── Program DTI Limits ───────────────────────────────────────────────────────
const PROGRAMS = {
  FHA:          { label: 'FHA',          frontMax: 46.9, backMax: 56.9, minCredit: 580, notes: 'AUS Accept/Eligible can exceed limits with compensating factors' },
  CONVENTIONAL: { label: 'Conventional', frontMax: null,  backMax: 50.0, minCredit: 620, notes: 'DU/LPA may approve higher DTI with strong compensating factors' },
  HOMEREADY:    { label: 'HomeReady',    frontMax: null,  backMax: 50.0, minCredit: 620, notes: 'Income limit 80% AMI unless census tract eligible' },
  HOMEPOSSIBLE: { label: 'Home Possible',frontMax: null,  backMax: 45.0, minCredit: 660, notes: 'Income limit 80% AMI unless census tract eligible' },
  VA:           { label: 'VA',           frontMax: null,  backMax: 41.0, minCredit: 580, notes: 'No hard limit — residual income is primary qualifier' },
  USDA:         { label: 'USDA',         frontMax: 29.0,  backMax: 41.0, minCredit: 640, notes: 'Strictest dual-ratio requirement — both must be met' },
};

// ─── Student Loan Payment Engine ─────────────────────────────────────────────
function calcSLPayment(balance, actualPayment, deferred, deferMonths, loanType) {
  const bal    = parseFloat(balance)       || 0;
  const actual = parseFloat(actualPayment) || 0;
  const defer  = parseInt(deferMonths)     || 0;
  if (bal === 0) return { payment: 0, rule: '', label: '' };

  const lt = (loanType || '').toUpperCase();
  const isFannie   = ['CONVENTIONAL', 'HOMEREADY', 'JUMBO'].includes(lt);
  const isFreddie  = lt === 'HOMEPOSSIBLE';
  const isFHA      = lt === 'FHA' || lt === 'FHA_203K';
  const isVA       = lt === 'VA';
  const isUSDA     = lt === 'USDA';

  if (isVA) {
    if (deferred && defer >= 12) return { payment: 0,             rule: 'Deferred 12+ months from closing — excluded from DTI',      label: 'Excluded' };
    if (actual > 0)              return { payment: actual,        rule: 'Use actual monthly payment',                                 label: 'Actual'   };
    return                              { payment: bal * 0.05/12, rule: '5% of balance ÷ 12 (no payment on file)',                    label: '5%/12'    };
  }
  if (isFHA) {
    const p = Math.max(actual, bal * 0.01);
    return { payment: p, rule: actual >= bal * 0.01 ? 'Actual payment (meets 1% floor)' : '1% of balance — actual payment below floor', label: '1% Floor' };
  }
  if (isFreddie || isUSDA) {
    const p = actual > 0 ? actual : bal * 0.005;
    return { payment: p, rule: actual > 0 ? 'Actual payment' : '0.5% of balance (IBR/deferred)', label: actual > 0 ? 'Actual' : '0.5%' };
  }
  // Fannie Mae / default
  const p = actual > 0 ? actual : bal * 0.01;
  return { payment: p, rule: actual > 0 ? 'Actual payment' : '1% of balance (IBR/deferred)', label: actual > 0 ? 'Actual' : '1%' };
}

const SL_PROGRAM_COMPARISON = [
  { key: 'CONVENTIONAL', label: 'Conventional (Fannie Mae)' },
  { key: 'HOMEPOSSIBLE',  label: 'Home Possible (Freddie)'  },
  { key: 'FHA',           label: 'FHA'                      },
  { key: 'VA',            label: 'VA'                        },
  { key: 'USDA',          label: 'USDA'                      },
];

// ─── Income Types ─────────────────────────────────────────────────────────────
const INCOME_TYPES = [
  { id: 'w2_salary',       label: 'W-2 Salary / Hourly',        stable: true,  grossUp: false, continuance: false,
    docsNeeded: '2 years W-2s + 30-day paystub',
    calcRule:   'Use YTD gross ÷ months elapsed. If declining income, use lower year.',
    docs: ['Most recent 30-day paystub', 'W-2 for prior year', 'W-2 for year before that', 'VOE if < 2 years at employer'] },
  { id: 'fulltime_second', label: 'Full-Time Second Job',        stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years uninterrupted history required + paystubs from both jobs',
    calcRule:   '2-year history required with no gaps. Cannot be used if < 24 months. Average last 2 years.',
    docs: ['2 years W-2s from second employer', '30-day paystubs from second job', 'Employer letter confirming current status'],
    warning: 'FHA and conventional both require full 24-month history. No exceptions for recent second jobs.' },
  { id: 'part_time',       label: 'Part-Time / Seasonal Job',    stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years history required + paystubs',
    calcRule:   'Average income over 24 months including gaps. Cannot use if < 24 months consistent history.',
    docs: ['2 years W-2s', '30-day paystubs', 'Employer letter if seasonal'] },
  { id: 'self_employ',     label: 'Self-Employed (1099/K-1)',     stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years personal + business tax returns + YTD P&L + business license',
    calcRule:   'Use 24-month average of net income after add-backs. Declining income = use lower year.',
    docs: ['2 years personal tax returns (1040)', '2 years business tax returns (1120/1120S/1065)', 'YTD Profit & Loss (CPA-prepared or borrower-signed)', 'Business license or CPA letter confirming 2+ years', 'Business bank statements (12-24 months)'],
    warning: 'Declining income between years requires use of lower year. Business losses must be applied against personal income.' },
  { id: 'commission',      label: 'Commission / Variable Pay',   stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years W-2s + YTD paystub + employer letter confirming base + commission structure',
    calcRule:   'If commission > 25% of total income: 24-month average required.',
    docs: ['2 years W-2s', 'YTD paystub showing commission breakdown', 'Employer letter confirming commission structure', '2 years 1099 if independent contractor'],
    warning: 'If commission income has declined year over year, use the lower figure.' },
  { id: 'overtime',        label: 'Overtime / Bonus',            stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years history required (12-18 months with strong employer letter)',
    calcRule:   'Average over 24 months. If declining, use lower period or exclude.',
    docs: ['2 years W-2s showing overtime/bonus', 'YTD paystub', 'Employer letter confirming likely continuance'] },
  { id: 'social_sec',      label: 'Social Security / SSI',       stable: true,  grossUp: true,  continuance: true,
    docsNeeded: 'Award letter + 2 months bank statements showing direct deposit',
    calcRule:   'Non-taxable SSI/disability can be grossed up 25% for qualifying.',
    docs: ['SSA award letter (within 12 months)', '2 months bank statements confirming deposits', 'Tax returns to confirm non-taxable status (if grossing up)'],
    grossUpNote: 'Non-taxable SSI can be grossed up 25% — divide monthly amount by 0.75 for qualifying income.' },
  { id: 'pension',         label: 'Pension / Retirement',        stable: true,  grossUp: false, continuance: true,
    docsNeeded: 'Award letter + 12 months bank statements',
    calcRule:   'Use current monthly benefit. If non-taxable (Roth/disability pension), gross up 25%.',
    docs: ['Pension award/benefit letter', '12 months bank statements', '1099-R if applicable'],
    grossUpNote: 'Non-taxable pension distributions may be grossed up 25% — verify tax status.' },
  { id: 'rental',          label: 'Rental Income',               stable: false, grossUp: false, continuance: false,
    docsNeeded: '2 years Schedule E + current signed leases + property management agreements',
    calcRule:   'Use 75% of gross rent (vacancy factor) OR Schedule E net + depreciation add-back.',
    docs: ['2 years personal tax returns with Schedule E', 'Current signed leases', 'Mortgage statement for rental property', 'Property management agreement (if applicable)'],
    warning: 'Cannot use rental income if property has < 2-year rental history on taxes.' },
  { id: 'child_supp',      label: 'Child Support / Alimony',     stable: false, grossUp: false, continuance: true,
    docsNeeded: 'Court order + 12 months proof of receipt + divorce decree',
    calcRule:   'Must document consistent receipt for 12 months. Must have 3+ years continuance remaining.',
    docs: ['Divorce decree or separation agreement', 'Court order showing amount and duration', '12 months bank statements confirming receipt', 'Copy of any modification orders'],
    warning: 'Must have at least 3 years of documented continuance remaining. Voluntary payments without court order cannot be used.' },
  { id: 'military',        label: 'Military / BAH / BAS',        stable: true,  grossUp: true,  continuance: false,
    docsNeeded: 'Most recent LES (Leave and Earnings Statement)',
    calcRule:   'All military income including BAH and BAS is grossed up 25% for qualifying.',
    docs: ['Most recent LES showing all pay components', 'Orders if recently reassigned', 'VA award letter if receiving disability pay'],
    grossUpNote: 'BAH and BAS are non-taxable — gross up 25% — divide by 0.75 for qualifying income.' },
  { id: 'disability',      label: 'Disability Income',           stable: true,  grossUp: true,  continuance: true,
    docsNeeded: 'Award letter + bank statements confirming deposits',
    calcRule:   'Non-taxable disability income can be grossed up 25%. VA disability is always non-taxable.',
    docs: ['Disability award letter (SSA, VA, or private insurer)', '12 months bank statements', 'Tax returns to confirm non-taxable status'],
    grossUpNote: 'VA disability and SSA disability are non-taxable — gross up 25% for qualifying.' },
  { id: 'investment',      label: 'Investment / Dividends',      stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years 1099-DIV/1099-INT + 2 years tax returns + asset statements confirming assets still held',
    calcRule:   'Average 24-month history. Must confirm assets generating income are still held.',
    docs: ['2 years 1099-DIV or 1099-INT', '2 years tax returns', '2 months most recent asset statements', 'Evidence assets are still held'] },
  { id: 'rsu_stock',       label: 'RSU / Stock Compensation',    stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years W-2s showing RSU/stock income + vesting schedule + employer letter',
    calcRule:   '24-month average required. Must document vesting schedule confirms continuance for 3+ years.',
    docs: ['2 years W-2s with RSU/stock income broken out', 'Vesting schedule from employer', 'Employer letter confirming future vesting', 'Grant agreements'],
    warning: 'Cannot use RSU income if vesting schedule ends within 3 years of closing.' },
  { id: 'foster_care',     label: 'Foster Care Income',          stable: true,  grossUp: true,  continuance: true,
    docsNeeded: 'Agency documentation + 2 years history of receipt',
    calcRule:   'Non-taxable foster care payments can be grossed up 25%. Must have 2-year documented history.',
    docs: ['Foster care agency agreement', '2 years documentation of receipt', 'Bank statements confirming deposits'],
    grossUpNote: 'Foster care payments are non-taxable — gross up 25% for qualifying.' },
  { id: 'notes_receivable',label: 'Notes Receivable',            stable: false, grossUp: false, continuance: true,
    docsNeeded: '2 years tax returns showing interest income + copy of executed note + evidence of payment history',
    calcRule:   'Must have 3+ years of documented continuance remaining. Use 24-month average from tax returns.',
    docs: ['Executed promissory note', '2 years tax returns showing interest income', '12 months bank statements confirming receipt', 'Evidence of borrower ability to continue payments'] },
];

// ─── Compensating Factors ─────────────────────────────────────────────────────
const COMP_FACTORS = [
  { id: 'reserves_12',    label: '12+ months PITI reserves',            impact: 'HIGH',   detail: 'Liquid assets covering 12+ months of total housing payment' },
  { id: 'low_payment_sh', label: 'Low payment shock (<20% increase)',   impact: 'HIGH',   detail: 'New PITI is less than 120% of current housing expense' },
  { id: 'stable_employ',  label: '2+ years same employer',              impact: 'MEDIUM', detail: 'Documented 24+ months with current employer, same field' },
  { id: 'credit_680',     label: 'Credit score 680+',                   impact: 'HIGH',   detail: 'Middle score of the lower-scoring borrower >= 680' },
  { id: 'min_increase',   label: 'Minimal increase in housing expense', impact: 'MEDIUM', detail: 'Proposed PITI <= 105% of current housing expense' },
  { id: 'additional_inc', label: 'Documented non-qualifying income',    impact: 'MEDIUM', detail: 'Income that exists but cannot be used to qualify (e.g., <2yr history)' },
  { id: 'low_ltv',        label: 'Low LTV (<=75%)',                     impact: 'HIGH',   detail: 'Significant equity position reduces lender risk' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$   = n => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = n => isNaN(n) || !isFinite(n) ? '—' : Number(n).toFixed(1) + '%';
const fmt$0  = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function calcPI(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

// Returns monthly MI as a rate of loan amount (not a dollar amount)
// Sources: FHA ML 2023-05 · Fannie Desktop Underwriter PMI tables · USDA 3555 · VA Circ 26-8
function getMIRate(programKey, downPctNum, ficoScore) {
  const ltv  = (100 - downPctNum) / 100;
  const fico = parseInt(ficoScore) || 680;
  switch (programKey) {
    case 'FHA':
      // FHA MIP (post-March 2023 reduced rates, 30-year term)
      // < 10% down = LTV > 90%: 0.55%/yr; >= 10% down = LTV ≤ 90%: 0.50%/yr
      return (downPctNum >= 10 ? 0.0050 : 0.0055) / 12;
    case 'CONVENTIONAL':
      if (downPctNum >= 20) return 0;
      if (ltv > 0.97) return (fico>=720?0.0072:fico>=680?0.0089:fico>=660?0.0104:0.0120)/12;
      if (ltv > 0.95) return (fico>=720?0.0054:fico>=680?0.0073:fico>=660?0.0090:0.0108)/12;
      if (ltv > 0.90) return (fico>=720?0.0038:fico>=680?0.0055:fico>=660?0.0073:0.0090)/12;
      if (ltv > 0.85) return (fico>=720?0.0025:fico>=680?0.0040:fico>=660?0.0057:0.0074)/12;
      return              (fico>=720?0.0016:fico>=680?0.0025:fico>=660?0.0038:0.0052)/12;
    case 'HOMEREADY':
      // HomeReady: reduced MI ~25-35% below standard Conventional
      if (downPctNum >= 20) return 0;
      if (ltv > 0.95) return (fico>=720?0.0050:fico>=680?0.0063:fico>=660?0.0073:0.0088)/12;
      if (ltv > 0.90) return (fico>=720?0.0027:fico>=680?0.0039:fico>=660?0.0052:0.0065)/12;
      if (ltv > 0.85) return (fico>=720?0.0018:fico>=680?0.0028:fico>=660?0.0040:0.0054)/12;
      return              (fico>=720?0.0011:fico>=680?0.0018:fico>=660?0.0027:0.0038)/12;
    case 'HOMEPOSSIBLE':
      // Home Possible: similar reduced MI to HomeReady
      if (downPctNum >= 20) return 0;
      if (ltv > 0.95) return (fico>=720?0.0050:fico>=680?0.0063:fico>=660?0.0073:0.0088)/12;
      if (ltv > 0.90) return (fico>=720?0.0027:fico>=680?0.0039:fico>=660?0.0052:0.0065)/12;
      if (ltv > 0.85) return (fico>=720?0.0018:fico>=680?0.0028:fico>=660?0.0040:0.0054)/12;
      return              (fico>=720?0.0011:fico>=680?0.0018:fico>=660?0.0027:0.0038)/12;
    case 'USDA':
      return 0.0035/12; // 0.35%/yr annual guarantee fee
    case 'VA':
      return 0; // no monthly MI (funding fee is one-time, typically financed)
    default:
      return 0;
  }
}

function dtiColor(dti, max) {
  if (!dti || isNaN(dti)) return 'text-slate-400';
  if (!max) return dti > 50 ? 'text-red-600' : dti > 43 ? 'text-amber-600' : 'text-emerald-600';
  if (dti > max) return 'text-red-600';
  if (dti > max * 0.9) return 'text-amber-600';
  return 'text-emerald-600';
}

// ─── Section wrapper — NO ModuleNav inside (moved to page-level shell) ────────
function Section({ title, subtitle, icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-0.5">
          {icon && <span className="text-lg">{icon}</span>}
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5 ml-7">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Program Fit Row ──────────────────────────────────────────────────────────
function ProgramFitRow({ prog, progKey, frontDTI, backDTI, creditScore, totalIncome }) {
  const frontPass  = !prog.frontMax || frontDTI <= prog.frontMax;
  const backPass   = progKey === 'VA' ? true : backDTI <= prog.backMax;
  const creditPass = !creditScore || creditScore >= prog.minCredit;
  const eligible   = frontPass && backPass && creditPass;
  const isVA       = progKey === 'VA';
  const vaOverDTI  = isVA && backDTI > prog.backMax;
  const usdaFrontGap = prog.frontMax && !frontPass && totalIncome > 0 ? (totalIncome * prog.frontMax / 100) : null;

  return (
    <tr className={`border-b border-slate-50 ${eligible ? 'hover:bg-emerald-50/30' : 'hover:bg-red-50/20'}`}>
      <td valign="middle" className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${eligible || isVA ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <span className="text-sm font-bold text-slate-800">{prog.label}</span>
        </div>
      </td>
      <td valign="middle" className="px-4 py-3 text-center">
        {prog.frontMax
          ? <div>
              <span className={`text-sm font-bold ${frontPass ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmtPct(frontDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.frontMax}%</span>
              </span>
              {!frontPass && usdaFrontGap && <p className="text-xs text-red-500 mt-0.5">Need {fmt$(usdaFrontGap)}/mo income to meet limit</p>}
            </div>
          : <span className="text-xs text-slate-400">No limit</span>}
      </td>
      <td valign="middle" className="px-4 py-3 text-center">
        <span className={`text-sm font-bold ${isVA && vaOverDTI ? 'text-amber-600' : backPass ? 'text-emerald-600' : 'text-red-600'}`}>
          {fmtPct(backDTI)} <span className="text-xs font-normal text-slate-400">/ {prog.backMax}%</span>
        </span>
        {isVA && vaOverDTI && <p className="text-xs text-amber-600 mt-0.5">Review residual income</p>}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center h-full min-h-[44px]">
          {isVA
            ? <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${vaOverDTI ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {vaOverDTI ? '⚠ Check Residual' : '✓ Qualifies'}
              </span>
            : <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                {eligible ? '✓ Qualifies' : '✗ Fails'}
              </span>}
        </div>
      </td>
      <td valign="middle" className="px-4 py-3 text-xs text-slate-400 max-w-xs">{prog.notes}</td>
    </tr>
  );
}

// ─── Decision Record Banner (inline — green state + NSI pill) ─────────────────
function DRBanner({ savedRecordId, saving, onSave, nsiSuggestion, onNsiNavigate }) {
  const isSaved = Boolean(savedRecordId);
  return (
    <div style={{
      background:   isSaved ? '#f0fdf4' : '#ffffff',
      borderBottom: isSaved ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
      padding:      '10px 32px',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      flexWrap:     'wrap',
      transition:   'background 0.3s, border-color 0.3s',
    }}>
      {/* Icon */}
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: isSaved ? '#dcfce7' : '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.3s',
      }}>
        {isSaved
          ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="#475569" strokeWidth="1.4"/><path d="M5 8h6M5 5.5h6M5 10.5h3.5" stroke="#475569" strokeWidth="1.2" strokeLinecap="round"/></svg>
        }
      </div>

      {/* Label */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: isSaved ? '#14532d' : '#1e293b', margin: 0 }}>
          {isSaved ? 'Decision Record — Saved ✓' : 'Decision Record'}
        </p>
        <p style={{ fontSize: 11, color: isSaved ? '#16a34a' : '#94a3b8', margin: 0 }}>
          {isSaved
            ? 'QUALIFYING INTEL findings logged to audit trail'
            : 'Save QUALIFYING INTEL findings to your audit trail'}
        </p>
      </div>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

        {/* NSI pill — appears only after save */}
        {isSaved && nsiSuggestion?.path && (
          <button
            onClick={() => onNsiNavigate(nsiSuggestion.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, padding: '5px 13px', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11h10" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Next Suggested Action</p>
              <p style={{ fontSize: 11, color: '#1e40af', fontWeight: 500, margin: 0 }}>{nsiSuggestion.moduleLabel || nsiSuggestion.moduleName}</p>
            </div>
            <span style={{ fontSize: 12, color: '#3b82f6' }}>→</span>
          </button>
        )}

        {/* Save / Saved button */}
        <button
          onClick={!isSaved && !saving ? onSave : undefined}
          disabled={isSaved || saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isSaved ? '#16a34a' : '#0f172a',
            color: '#f8fafc', border: 'none', borderRadius: 6,
            padding: '7px 15px', fontSize: 11, fontWeight: 600,
            cursor: isSaved ? 'default' : 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            opacity: saving ? 0.7 : 1, transition: 'background 0.3s',
          }}
        >
          {isSaved
            ? <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> Saved</>
            : saving
              ? 'Saving…'
              : <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="#f8fafc" strokeWidth="1.3"/><path d="M4.5 7l2 2 3.5-3.5" stroke="#f8fafc" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> Save to Decision Record</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function QualifyingIntel() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const scenarioId     = searchParams.get('scenarioId');

  const { reportFindings }                = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);
  // Letter generator state
  const [letterType,        setLetterType]        = useState('prequal');
  const [letterExpiry,      setLetterExpiry]      = useState('30');
  const [letterProperty,    setLetterProperty]    = useState('');
  const [letterLoName,      setLetterLoName]      = useState('');
  const [letterLoNmls,      setLetterLoNmls]      = useState('');
  const [letterCompany,     setLetterCompany]     = useState('');
  const [letterCompanyNmls, setLetterCompanyNmls] = useState('');
  const [letterPhone,       setLetterPhone]       = useState('');
  const [letterEmail,       setLetterEmail]       = useState('');
  const [ausOnFile,         setAusOnFile]         = useState(false);
  const [ausSystem,         setAusSystem]         = useState('DU');
  const [ausFinding,        setAusFinding]        = useState('Approve/Eligible');
  const [letterGenerating,  setLetterGenerating]  = useState(false);
  const [generatedLetter,   setGeneratedLetter]   = useState('');
  const [letterError,       setLetterError]       = useState('');
  const [findingsReported, setFindingsReported] = useState(false);
  const [m02Imported,     setM02Imported]     = useState(false);
  const [activeTab,       setActiveTab]       = useState(0);

  const [scenario,  setScenario]  = useState(null);
  const [loading,   setLoading]   = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);
  const [search,    setSearch]    = useState('');
  const [showAll,   setShowAll]   = useState(false);

  // Income
  const [incomes,            setIncomes]            = useState([{ id: 1, type: 'w2_salary', gross: '', note: '', nonTaxableConfirmed: false }]);
  const [coborrowerIncomes,  setCoborrowerIncomes]  = useState([]);

  // Housing
  const [loanAmount, setLoanAmount] = useState('');
  const [rate,       setRate]       = useState('');
  const [term,       setTerm]       = useState('360');
  const [taxes,      setTaxes]      = useState('');
  const [insurance,  setInsurance]  = useState('');
  const [hoa,        setHoa]        = useState('');
  const [mi,         setMi]         = useState('');
  const [debts,      setDebt]       = useState('');
  const [creditScore,setCreditScore]= useState('');

  // Student Loan Payment Factor
  const [slBalance,       setSlBalance]       = useState('');
  const [slActualPayment, setSlActualPayment] = useState('');
  const [slDeferred,      setSlDeferred]      = useState(false);
  const [slDeferMonths,   setSlDeferMonths]   = useState('');

  // Other
  const [compFactors,    setCompFactors]    = useState({});
  const [incomeTypes,    setIncomeTypes]    = useState({});
  const [notes,          setNotes]          = useState('');
  const [downPaymentPct, setDownPaymentPct] = useState('5');
  const [dtiTarget,      setDtiTarget]      = useState('standard'); // 'conservative'|'standard'|'maximum'
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialLoadDone = useRef(false);

  // ─── Load Scenario ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      import('firebase/firestore').then(({ collection, getDocs }) => {
        getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      });
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.loanAmount)       setLoanAmount(String(d.loanAmount));
        if (d.interestRate)     setRate(String(d.interestRate));
        if (d.term)             setTerm(String(d.term));
        if (d.propTaxes)        setTaxes(String(d.propTaxes));
        if (d.homeInsurance)    setInsurance(String(d.homeInsurance));
        if (d.hoaDues)          setHoa(String(d.hoaDues));
        if (d.mortgageInsurance)setMi(String(d.mortgageInsurance));
        if (d.monthlyDebts)     setDebt(String(d.monthlyDebts));
        if (d.creditScore) {
          const allScores = [parseInt(d.creditScore) || null, ...(d.coBorrowers || []).map(cb => parseInt(cb.creditScore) || null)].filter(s => s && s > 300 && s <= 850);
          setCreditScore(String(allScores.length > 0 ? Math.min(...allScores) : parseInt(d.creditScore)));
        }
        // ── M02 Income Analyzer → M03 auto-populate ──────────────────────────────
        // Priority: M02 saved income (d.income) > scenario simple field (d.monthlyIncome)
        // localStorage restore below will override if LO has manually edited M03
        const M02_TO_M03 = {
          SELF_EMPLOYED:    'self_employ',
          W2:               'w2_salary',
          SOCIAL_SECURITY:  'social_sec',
          PENSION:          'pension',
          MILITARY:         'military_bah',
          CHILD_SUPPORT:    'child_support',
          RENTAL:           'rental',
          CONTRACTOR_1099:  'self_employ',
          CAPITAL_GAINS:    'w2_salary',
          S_CORP:           'self_employ',
        };
        const NON_TAXABLE_METHODS = new Set(['SOCIAL_SECURITY', 'MILITARY']);

        if (d.income?.borrowers?.length > 0) {
          // M02 has saved structured income — use it
          const primary   = d.income.borrowers.find(b => b.role === 'primary') || d.income.borrowers[0];
          const coBorrs   = d.income.borrowers.filter(b => b.role !== 'primary');

          if (primary?.sources?.length > 0) {
            const mapped = primary.sources
              .filter(s => s.monthly > 0)
              .map((s, i) => ({
                id: i + 1,
                type: M02_TO_M03[s.method] || 'w2_salary',
                gross: String(s.monthly.toFixed(2)),
                note: s.label || '',
                nonTaxableConfirmed: NON_TAXABLE_METHODS.has(s.method),
              }));
            if (mapped.length > 0) {
              setIncomes(mapped);
              setM02Imported(true);
            }
          } else if (primary?.monthlyIncome > 0) {
            setIncomes([{ id: 1, type: 'w2_salary', gross: String(primary.monthlyIncome.toFixed(2)), note: 'From M02', nonTaxableConfirmed: false }]);
            setM02Imported(true);
          }

          if (coBorrs.length > 0) {
            const coMapped = coBorrs.flatMap((cb, ci) =>
              (cb.sources || []).filter(s => s.monthly > 0).map((s, si) => ({
                id: ci * 100 + si + 1,
                type: M02_TO_M03[s.method] || 'w2_salary',
                gross: String(s.monthly.toFixed(2)),
                note: cb.name || s.label || '',
                nonTaxableConfirmed: NON_TAXABLE_METHODS.has(s.method),
              }))
            );
            if (coMapped.length > 0) setCoborrowerIncomes(coMapped);
          }
        } else if (d.monthlyIncome) {
          // Fallback: old simple field
          setIncomes([{ id: 1, type: 'w2_salary', gross: String(d.monthlyIncome), note: '', nonTaxableConfirmed: false }]);
          const coBorrowersWithIncome = (d.coBorrowers || []).filter(cb => parseFloat(cb.monthlyIncome) > 0);
          if (coBorrowersWithIncome.length > 0) {
            setCoborrowerIncomes(coBorrowersWithIncome.map((cb, i) => ({
              id: i + 1, type: 'w2_salary', gross: String(cb.monthlyIncome),
              note: `${cb.firstName || ''} ${cb.lastName || ''}`.trim(), nonTaxableConfirmed: false,
            })));
          } else if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
            setCoborrowerIncomes([{ id: 1, type: 'w2_salary', gross: String(d.coBorrowerIncome), note: '', nonTaxableConfirmed: false }]);
          }
        }

        // ── Restore previously saved user inputs ──────────────────────────────
        // INCOME: only restore from localStorage if LO actually entered non-zero amounts.
        // Blank localStorage entries (gross:'') must NOT overwrite M02 imported income.
        // NON-INCOME fields (loan amount, rate, debts, etc.) always restore from localStorage.
        try {
          const saved = localStorage.getItem(`lb_qualifying_intel_${snap.id}`);
          if (saved) {
            const p = JSON.parse(saved);
            const lsHasRealIncome   = p.incomes?.some(i => parseFloat(i.gross) > 0);
            const lsHasRealCoBorr   = p.coborrowerIncomes?.some(i => parseFloat(i.gross) > 0);
            // Only let localStorage income win if the LO actually typed real numbers in M03
            if (lsHasRealIncome)                 setIncomes(p.incomes);
            if (lsHasRealCoBorr)                 setCoborrowerIncomes(p.coborrowerIncomes);
            // Non-income fields always restore — these don't come from M02
            if (p.loanAmount)                    setLoanAmount(p.loanAmount);
            if (p.rate)                          setRate(p.rate);
            if (p.term)                          setTerm(p.term);
            if (p.taxes)                         setTaxes(p.taxes);
            if (p.insurance)                     setInsurance(p.insurance);
            if (p.hoa)                           setHoa(p.hoa);
            if (p.mi)                            setMi(p.mi);
            if (p.debts)                         setDebt(p.debts);
            if (p.creditScore)                   setCreditScore(p.creditScore);
            if (p.slBalance)                     setSlBalance(p.slBalance);
            if (p.slActualPayment)               setSlActualPayment(p.slActualPayment);
            if (p.slDeferred !== undefined)      setSlDeferred(p.slDeferred);
            if (p.slDeferMonths)                 setSlDeferMonths(p.slDeferMonths);
            if (p.compFactors)                   setCompFactors(p.compFactors);
            if (p.incomeTypes)                   setIncomeTypes(p.incomeTypes);
            if (p.notes !== undefined)           setNotes(p.notes);
            if (p.downPaymentPct)                setDownPaymentPct(p.downPaymentPct);
            if (p.dtiTarget)                     setDtiTarget(p.dtiTarget);
          }
        } catch (e) { /* ignore bad cache */ }
        // Mark load complete — dirty tracking starts after this
        setTimeout(() => { initialLoadDone.current = true; }, 150);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ─── localStorage autosave ────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) return;
    localStorage.setItem(`lb_qualifying_intel_${scenarioId}`, JSON.stringify({
      incomes, coborrowerIncomes, loanAmount, rate, term,
      taxes, insurance, hoa, mi, debts, creditScore,
      slBalance, slActualPayment, slDeferred, slDeferMonths,
      compFactors, incomeTypes, notes, downPaymentPct, dtiTarget,
    }));
  }, [scenarioId, incomes, coborrowerIncomes, loanAmount, rate, term,
      taxes, insurance, hoa, mi, debts, creditScore,
      slBalance, slActualPayment, slDeferred, slDeferMonths,
      compFactors, incomeTypes, notes, downPaymentPct]);

  // ─── Dirty tracking — mark unsaved after initial load ───────────────────
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setHasUnsavedChanges(true);
  }, [incomes, coborrowerIncomes, loanAmount, rate, term,
      taxes, insurance, hoa, mi, debts, creditScore,
      slBalance, slActualPayment, slDeferred, slDeferMonths,
      compFactors, incomeTypes, notes, downPaymentPct]);

  // ─── Warn before browser close if unsaved ───────────────────────────────
  useEffect(() => {
    const fn = e => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [hasUnsavedChanges]);

  // ─── Calculations ─────────────────────────────────────────────────────────
  const getQualifyingIncome = (inc) => {
    const raw     = parseFloat(inc.gross) || 0;
    const incType = INCOME_TYPES.find(t => t.id === inc.type);
    if (incType?.grossUp && inc.nonTaxableConfirmed) return raw / 0.75;
    return raw;
  };

  const totalBorrowerIncome   = incomes.reduce((s, i) => s + getQualifyingIncome(i), 0);
  const totalCoBorrowerIncome = coborrowerIncomes.reduce((s, i) => s + getQualifyingIncome(i), 0);
  const totalIncome           = totalBorrowerIncome + totalCoBorrowerIncome;

  const pi           = calcPI(parseFloat(loanAmount), parseFloat(rate), parseInt(term));
  const totalHousing = pi + (parseFloat(taxes) || 0) + (parseFloat(insurance) || 0) + (parseFloat(hoa) || 0) + (parseFloat(mi) || 0);

  const slResult       = calcSLPayment(slBalance, slActualPayment, slDeferred, slDeferMonths, scenario?.loanType || '');
  const slQualPayment  = slResult.payment;

  const totalDebts   = (parseFloat(debts) || 0) + slQualPayment;
  const frontDTI     = totalIncome > 0 ? (totalHousing / totalIncome) * 100 : 0;
  const backDTI      = totalIncome > 0 ? ((totalHousing + totalDebts) / totalIncome) * 100 : 0;
  const cfCount      = Object.values(compFactors).filter(Boolean).length;
  const requiredIncome43 = totalHousing + totalDebts > 0 ? (totalHousing + totalDebts) / 0.43 : 0;
  const incomeGap    = requiredIncome43 - totalIncome;

  const programResults   = Object.entries(PROGRAMS).map(([key, prog]) => {
    const frontPass  = !prog.frontMax || frontDTI <= prog.frontMax;
    const backPass   = key === 'VA' ? true : backDTI <= prog.backMax;
    const creditPass = !creditScore || parseInt(creditScore) >= prog.minCredit;
    return { key, prog, eligible: frontPass && backPass && creditPass };
  });
  const eligiblePrograms = programResults.filter(r => r.eligible);
  const overallPass      = eligiblePrograms.length > 0;

  // ─── Feature computed values ──────────────────────────────────────────────
  const baseRate           = parseFloat(rate) || 0;
  const fixedCosts         = (parseFloat(taxes)||0) + (parseFloat(insurance)||0) + (parseFloat(hoa)||0) + (parseFloat(mi)||0);
  const otherFixed         = (parseFloat(taxes)||0) + (parseFloat(insurance)||0) + (parseFloat(hoa)||0); // excl MI — used in per-program max loan calc
  const monthlyPayFactor   = (() => {
    const r = baseRate / 100 / 12, n = parseInt(term) || 360;
    if (!r || !n) return 0;
    return (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
  })();

  // ─── DTI Target definitions ───────────────────────────────────────────────
  const DTI_TARGETS = {
    conservative: { label: 'Conservative', pct: 43, colorClass: 'emerald', badge: '🟢', desc: 'Clean approval — safe for AUS' },
    standard:     { label: 'Standard',     pct: 45, colorClass: 'amber',   badge: '🟡', desc: 'Solid approval — common LO target' },
    maximum:      { label: 'Maximum',      pct: null, colorClass: 'red',   badge: '🔴', desc: 'Program ceiling — AUS stretch' },
  };
  const activeDTITarget = DTI_TARGETS[dtiTarget] || DTI_TARGETS.standard;

  // Feature 1 — Max Purchase Price per program (uses selected DTI target + auto MI)
  const downPct = parseFloat(downPaymentPct) || 5;
  const maxPurchasePrices = Object.entries(PROGRAMS).map(([key, prog]) => {
    const ficoNum    = parseInt(creditScore) || 680;
    // Per-program monthly MI rate (fraction of loan amount)
    const miRate     = getMIRate(key, downPct, ficoNum);
    // Effective DTI = min(target%, program max) — never exceed program limit
    const targetPct  = dtiTarget === 'maximum' ? prog.backMax : Math.min(activeDTITarget.pct, prog.backMax);
    const frontTgt   = prog.frontMax ? Math.min(prog.frontMax, dtiTarget === 'maximum' ? prog.frontMax : (prog.frontMax < activeDTITarget.pct ? prog.frontMax : activeDTITarget.pct)) : Infinity;
    const maxBudget  = totalIncome > 0 ? totalIncome * (targetPct / 100) - (parseFloat(debts)||0) - slQualPayment : 0;
    const maxFront   = prog.frontMax && totalIncome > 0 ? totalIncome * (frontTgt / 100) : Infinity;
    // Subtract non-MI fixed costs; MI is handled by effective rate below
    const maxAvail   = Math.min(maxBudget, maxFront) - otherFixed;
    // Solve: loan × (payFactor + miRate) = maxAvail  →  maxLoan = maxAvail / (payFactor + miRate)
    // This properly handles the circular dependency (MI depends on loan amount)
    const effFactor  = monthlyPayFactor + miRate;
    const maxLoan    = effFactor > 0 && maxAvail > 0 ? maxAvail / effFactor : 0;
    const maxPurchase = maxLoan > 0 ? maxLoan / (1 - downPct / 100) : 0;
    const estMI      = Math.round(maxLoan * miRate);
    // Projected DTI if LO uses this exact max loan (accurate: includes program MI)
    const projLoan   = Math.max(0, Math.round(maxLoan));
    const projPI     = monthlyPayFactor > 0 && projLoan > 0 ? projLoan * monthlyPayFactor : 0;
    const projMI     = projLoan * miRate;
    const projDTI    = totalIncome > 0 && projPI > 0
      ? ((projPI + otherFixed + projMI + totalDebts) / totalIncome) * 100
      : 0;
    return {
      key, label: prog.label,
      maxLoan:    Math.max(0, Math.round(maxLoan)),
      maxPurchase: Math.max(0, Math.round(maxPurchase)),
      projDTI:    parseFloat(projDTI.toFixed(1)),
      targetPct,
      estMI,        // auto-calculated monthly MI for this program at this loan amount
      miRate,       // monthly rate fraction (for display)
      miAnnualPct:  parseFloat((miRate * 12 * 100).toFixed(3)), // e.g. 0.55
    };
  });

  // Feature 2 — Required Income by Program (includes per-program auto-MI)
  const requiredIncomeByProg = Object.entries(PROGRAMS).map(([key, prog]) => {
    // Use auto-calculated MI for this program at current loan amount
    const curLoan     = parseFloat(loanAmount) || 0;
    const miRate      = getMIRate(key, downPct, parseInt(creditScore)||680);
    const autoMI      = curLoan * miRate;
    // Housing with program-specific MI (overrides manual mi field for per-program comparison)
    const housingWithMI = pi + otherFixed + autoMI;
    const reqBack     = (housingWithMI + totalDebts) > 0 ? (housingWithMI + totalDebts) / (prog.backMax / 100) : 0;
    const reqFront    = prog.frontMax && housingWithMI > 0 ? housingWithMI / (prog.frontMax / 100) : 0;
    const required    = Math.max(reqBack, reqFront);
    const gap         = required - totalIncome;
    const eligible    = programResults.find(r => r.key === key)?.eligible;
    return { key, label: prog.label, required, gap, eligible, autoMI: Math.round(autoMI) };
  });

  // Feature 3 — Rate Sensitivity Table
  const rateSensitivity = baseRate > 0 && parseFloat(loanAmount) > 0
    ? [-1, -0.5, 0, 0.5, 1].map(delta => {
        const r       = Math.max(0.1, baseRate + delta);
        const piAdj   = calcPI(parseFloat(loanAmount), r, parseInt(term));
        const hAdj    = piAdj + fixedCosts;
        const fAdj    = totalIncome > 0 ? (hAdj / totalIncome) * 100 : 0;
        const bAdj    = totalIncome > 0 ? ((hAdj + totalDebts) / totalIncome) * 100 : 0;
        return { delta, rate: r, pi: piAdj, housing: hAdj, frontDTI: fAdj, backDTI: bAdj, isCurrent: delta === 0 };
      })
    : [];

  // Feature 4 — Buydown Qualifying Analysis
  const buydownAnalysis = baseRate > 0 && parseFloat(loanAmount) > 0 ? (() => {
    const lA = parseFloat(loanAmount), tM = parseInt(term)||360;
    const mk = (r) => ({ pi: calcPI(lA, Math.max(0.1, r), tM), rate: r });
    const note = mk(baseRate);
    const b21 = { yr1: mk(baseRate-2), yr2: mk(baseRate-1), note };
    const b10 = { yr1: mk(baseRate-1), note };
    const dti = (piVal) => ({
      front: totalIncome > 0 ? ((piVal + fixedCosts) / totalIncome * 100) : 0,
      back:  totalIncome > 0 ? ((piVal + fixedCosts + totalDebts) / totalIncome * 100) : 0,
    });
    return {
      twoOne: { ...b21,
        fhaDTI:  dti(b21.yr1.pi),   // FHA qualifies at buydown rate yr1
        convDTI: dti(note.pi),        // Conv/VA/USDA qualify at note rate
      },
      oneZero: { ...b10,
        fhaDTI:  dti(b10.yr1.pi),
        convDTI: dti(note.pi),
      },
    };
  })() : null;

  // ─── Next Step Intelligence™ ──────────────────────────────────────────────
  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash')
    ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('term') || rawPurpose.includes('refi')
      ? 'rate_term_refi'
      : 'purchase';

  const nsiFindings = {
    dti:               parseFloat(backDTI?.toFixed(2))  || 0,
    frontEndDTI:       parseFloat(frontDTI?.toFixed(2)) || 0,
    creditScore:       parseInt(creditScore) || 0,
    selfEmployed:      incomes.some(i => i.type === 'self_employ'),
    incomeType:        incomes[0]?.type || '',
    totalIncome:       totalIncome,
    totalHousing:      totalHousing,
    totalDebts:        totalDebts,
    eligiblePrograms:  eligiblePrograms.map(r => r.key),
    programsAnalyzed:  true,
    dtiCalculated:     totalIncome > 0 && totalHousing > 0,
    incomeConfirmed:   totalIncome > 0,
  };

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'QUALIFYING_INTEL',
      loanPurpose,
      decisionRecordFindings:  { QUALIFYING_INTEL: nsiFindings },
      scenarioData:            scenario || {},
      completedModules:        findingsReported ? ['INCOME_ANALYZER', 'QUALIFYING_INTEL'] : ['INCOME_ANALYZER'],
      scenarioId,
      onWriteToDecisionRecord: null,
    });

  // ─── Letter Generator ────────────────────────────────────────────────────────
  const generateLetter = async () => {
    setLetterGenerating(true);
    setLetterError('');
    setGeneratedLetter('');

    const borrowerName  = scenario ? (scenario.firstName||'') + ' ' + (scenario.lastName||'') : 'Borrower';
    const bestProgram   = maxPurchasePrices.filter(p=>programResults.find(r=>r.key===p.key)?.eligible&&p.maxPurchase>0).sort((a,b)=>b.maxPurchase-a.maxPurchase)[0];
    const maxPrice      = bestProgram ? '$' + bestProgram.maxPurchase.toLocaleString() : 'N/A';
    const qualProgs     = eligiblePrograms.map(r=>r.prog?.label||r.key).join(', ') || 'N/A';
    const expDays       = parseInt(letterExpiry||'30');
    const expDate       = new Date(); expDate.setDate(expDate.getDate() + expDays);
    const expiryDate    = expDate.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    const today         = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    const isPreApproval = letterType === 'preapproval';
    const letterLabel   = isPreApproval ? 'Pre-Approval' : 'Pre-Qualification';

    // Build system prompt using array join to avoid multi-line template literal encoding issues
    const sysLines = [
      'You are a licensed mortgage compliance officer writing a ' + letterLabel + ' Letter for a loan officer.',
      '',
      'COMPLIANCE REQUIREMENTS - every letter MUST include all of these:',
      '',
      '1. COMMITMENT DISCLAIMER: State clearly this is NOT a commitment to lend, NOT a guarantee of loan approval, and NOT a final credit decision.',
      '2. CONDITIONS: Include subject-to conditions: satisfactory appraisal, clear title, verification of income/assets, final underwriting review, no material change in financial condition, satisfactory insurance.',
      isPreApproval
        ? '3. AUS DISCLOSURE: Reference the ' + ausSystem + ' finding (' + ausFinding + ') but state final approval is subject to complete underwriting review.'
        : '3. INFORMATION BASIS: State the letter is based on information provided by the borrower that has not been independently verified.',
      '4. EQUAL HOUSING LENDER: Include the Equal Housing Lender statement and Equal Housing Opportunity prominently.',
      '5. NMLS DISCLOSURE: Include both LO NMLS# and Company NMLS# with: "NMLS Consumer Access: www.nmlsconsumeraccess.org".',
      '6. INTEREST RATE: Do NOT state any specific interest rate - rates are subject to market conditions and credit approval.',
      '7. FAIR HOUSING: Neutral professional language only. Do not reference race, color, religion, national origin, sex, disability, or familial status.',
      '8. EXPIRATION: Clearly state the letter expires on ' + expiryDate + ' and has no validity after that date.',
      '9. ECOA NOTICE: Include the federal Equal Credit Opportunity Act notice about non-discrimination in credit decisions.',
      '10. FOOTER: Include "This ' + letterLabel.toLowerCase() + ' letter does not constitute a loan commitment or lock-in agreement."',
      '',
      'FORMAT: Professional business letter, plain text, no markdown. Include: date, salutation (Dear Home Seller/Real Estate Professional), body paragraphs, numbered conditions list, signature block, compliance footer. 400-600 words. Use actual data provided - no placeholder brackets.',
    ];
    const systemPrompt = sysLines.join('
');

    // Build user message using array join
    const coBorrower = scenario?.coBorrowers?.length
      ? 'Co-Borrower: ' + (scenario.coBorrowers[0]?.firstName||'') + ' ' + (scenario.coBorrowers[0]?.lastName||'')
      : '';
    const msgLines = [
      'Generate the letter with this data:',
      '',
      'Borrower: ' + borrowerName.trim(),
      coBorrower,
      'Letter Date: ' + today,
      'Letter Expiration: ' + expiryDate,
      'Maximum Purchase Price: ' + maxPrice,
      'Qualifying Programs: ' + qualProgs,
      letterProperty ? 'Subject Property: ' + letterProperty : 'No specific property (open letter - valid for any property up to max)',
      isPreApproval ? 'AUS System: ' + ausSystem : '',
      isPreApproval ? 'AUS Finding: ' + ausFinding : '',
      '',
      'Loan Officer: ' + (letterLoName || 'Loan Officer'),
      'LO NMLS#: ' + (letterLoNmls || 'NMLS# on file'),
      'Company: ' + (letterCompany || 'Lending Company'),
      'Company NMLS#: ' + (letterCompanyNmls || 'Company NMLS# on file'),
      letterPhone ? 'Phone: ' + letterPhone : '',
      letterEmail ? 'Email: ' + letterEmail : '',
    ].filter(l => l !== '').join('
');
    const userMsg = msgLines;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      const data = await res.json();
      if (data.content?.[0]?.text) {
        setGeneratedLetter(data.content[0].text);
      } else {
        setLetterError('Letter generation failed — ' + (data.error?.message || 'unknown error'));
      }
    } catch (e) {
      setLetterError('Network error: ' + e.message);
    } finally {
      setLetterGenerating(false);
    }
  };

  // ─── Decision Record ──────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('QUALIFYING_INTEL', {
        totalIncome, totalBorrowerIncome, totalCoBorrowerIncome,
        totalHousing, totalDebts,
        frontDTI:  parseFloat(frontDTI.toFixed(2)),
        backDTI:   parseFloat(backDTI.toFixed(2)),
        creditScore: parseInt(creditScore) || null,
        piPayment: parseFloat(pi.toFixed(2)),
        eligiblePrograms: eligiblePrograms.map(r => r.key),
        compensatingFactors:      Object.keys(compFactors).filter(k => compFactors[k]),
        compensatingFactorCount:  cfCount,
        incomeTypes:              Object.keys(incomeTypes).filter(k => incomeTypes[k]),
        studentLoanBalance:       parseFloat(slBalance)       || 0,
        studentLoanActualPayment: parseFloat(slActualPayment) || 0,
        studentLoanQualifyingPayment: parseFloat(slQualPayment.toFixed(2)),
        studentLoanRule:          slResult.rule,
        loNotes:                  notes,
        timestamp:                new Date().toISOString(),
      }, [], [], '1.0.0');
      if (writtenId) setSavedRecordId(writtenId);
      setFindingsReported(true);
      setHasUnsavedChanges(false);

      // Also write qualifying summary to scenario doc for downstream modules
      if (scenarioId) {
        try {
          await updateDoc(doc(db, 'scenarios', scenarioId), {
            qualifyingIntel: {
              totalIncome, totalBorrowerIncome, totalCoBorrowerIncome,
              totalHousing, totalDebts,
              frontDTI:         parseFloat(frontDTI.toFixed(2)),
              backDTI:          parseFloat(backDTI.toFixed(2)),
              eligiblePrograms: eligiblePrograms.map(r => r.key),
              creditScore:      parseInt(creditScore) || null,
              loanAmount:       parseFloat(loanAmount) || null,
              savedAt:          new Date().toISOString(),
            },
            qualifyingIntelUpdatedAt: serverTimestamp(),
          });
        } catch (e) { console.warn('[M03] Firestore write failed:', e.message); }
      }
    } catch (e) { console.error('Decision Record save failed:', e); }
    finally { setRecordSaving(false); }
  };

  const addIncome    = (setter)            => setter(prev => [...prev, { id: Date.now(), type: 'w2_salary', gross: '', note: '', nonTaxableConfirmed: false }]);
  const updateIncome = (setter, id, f, v)  => setter(prev => prev.map(i => i.id === id ? { ...i, [f]: v } : i));
  const removeIncome = (setter, id)        => setter(prev => prev.filter(i => i.id !== id));

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading scenario…</span>
      </div>
    </div>
  );

  // ─── STATE A: No scenario — Landing / Selector ────────────────────────────
  if (!scenarioId) {
    const query    = search.toLowerCase().trim();
    const sorted   = [...scenarios].sort((a, b) => {
      const tA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const tB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return tB - tA;
    });
    const filtered  = query ? sorted.filter(s => {
      const name = (s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim()).toLowerCase();
      return name.includes(query);
    }) : sorted;
    const displayed = query ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore   = !query && !showAll && filtered.length > 5;

    return (
      <div className="min-h-screen bg-slate-50">

        {/* ── Hero (landing) ── */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '28px 32px 24px' }}>
          <button
            onClick={() => {
              if (hasUnsavedChanges && !window.confirm('You have unsaved qualifying results.\n\nLeave without saving?\n\nClick Cancel to go back and save.')) return;
              navigate('/');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#818cf8', fontSize: 12, fontWeight: 600, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Back to Dashboard
          </button>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Stage 1 — Pre-Structure &amp; Initial Analysis
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: '#6366f1', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#fff' }}>
              M03
            </span>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#f8fafc', lineHeight: 1.15 }}>
              Qualifying Intelligence™
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.65, maxWidth: 520, marginBottom: 14 }}>
            Analyze borrower DTI, income qualification, and program eligibility across FHA, Conventional, VA, USDA, HomeReady, and Home Possible — with built-in student loan payment engine and compensating factor documentation.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['DTI Analysis', 'Income Gross-Up', 'Student Loan Engine', 'Program Fit Matrix', 'Compensating Factors', 'Doc Checklist'].map(tag => (
              <span key={tag} style={{ padding: '3px 11px', borderRadius: 20, border: '1px solid #334155', fontSize: 11, fontWeight: 500, color: '#cbd5e1' }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* ── Scenario Selector ── */}
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Select a Scenario</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Search by name or pick from your most recent files.</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 14px', marginBottom: 14 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#94a3b8" strokeWidth="1.6"/><path d="M10.5 10.5L14 14" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round"/></svg>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowAll(false); }}
              placeholder="Search borrower name…"
              style={{ border: 'none', outline: 'none', fontSize: 13, color: '#475569', width: '100%', background: 'transparent', fontFamily: 'inherit' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>}
          </div>

          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!query && !showAll && (
                <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 7 }}>Recently Updated</p>
              )}
              {displayed.map(s => {
                const name    = s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario';
                const amount  = parseFloat(s.loanAmount || 0);
                const program = s.loanType || null;
                const credit  = s.creditScore || null;
                const stage   = s.stage || null;
                return (
                  <button key={s.id}
                    onClick={() => navigate(`/qualifying-intel?scenarioId=${s.id}`)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{name}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {program   && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{program}</span>}
                          {credit    && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {credit}</span>}
                          {stage     && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">
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

  // ─── STATE B: Scenario loaded — Active Module ─────────────────────────────
  const borrower        = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || scenario.borrowerName : null;
  const coBorrowerNames = scenario?.coBorrowers?.filter(cb => cb.firstName || cb.lastName).map(cb => `${cb.firstName || ''} ${cb.lastName || ''}`.trim()) || [];
  const propertyAddress = scenario ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* ── 1. Decision Record Banner ── */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <DecisionRecordBanner
          recordId={savedRecordId}
          moduleName="Qualifying Intelligence™"
          moduleKey="QUALIFYING_INTEL"
          onSave={handleSaveToRecord}
          saving={recordSaving}
        />
      </div>

      {/* ── 2. Module Nav ── */}
      <div className="max-w-7xl mx-auto px-6">
        <ModuleNav moduleNumber={3} />
      </div>

      {/* ── 3. Hero — rounded-3xl matching M02 standard ── */}
      <div className="max-w-7xl mx-auto px-6 mb-4">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl px-6 py-5">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <button onClick={() => {
                if (hasUnsavedChanges && !window.confirm('You have unsaved qualifying results.\n\nLeave without saving?\n\nClick Cancel to go back and save.')) return;
                navigate('/');
              }} className="text-slate-400 hover:text-white text-xs mb-2 block">← Dashboard</button>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'DM Serif Display,serif' }}>Qualifying Intelligence™</h1>
              <p className="text-slate-400 text-sm mt-1">DTI Analysis · Income Qualification · Program Fit</p>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, marginLeft: 24 }}>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-400/30">Stage 1 — Pre-Structure</span>
                <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full border border-white/20">Module 3</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              </div>
              {scenario && (
                <div className="bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-right" style={{ minWidth: 190 }}>
                  <p className="text-xs text-slate-300 truncate" style={{ maxWidth: 200 }}>{borrower || scenario.scenarioName || 'No Borrower'}</p>
                  <p className="text-lg font-black text-white">{scenario.loanAmount ? '$' + parseInt(scenario.loanAmount).toLocaleString() : '—'}</p>
                  <p className="text-xs text-slate-400">
                    {scenario.loanType || 'Purchase'}
                    {totalIncome > 0 && <span className="text-indigo-300 font-bold"> · {fmt$(totalIncome)}/mo</span>}
                    {totalIncome > 0 && totalHousing > 0 && (
                      <span className={`font-bold ml-1 ${backDTI > 50 ? 'text-red-300' : backDTI > 43 ? 'text-amber-300' : 'text-emerald-300'}`}>· {fmtPct(backDTI)} DTI</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Scenario Header ── */}
      <div className="max-w-7xl mx-auto px-6">
        <ScenarioHeader moduleTitle="Qualifying Intelligence™" moduleNumber={3} scenarioId={scenarioId} />
      </div>

      {/* ── Unsaved changes bar ── */}
      {hasUnsavedChanges && (
        <div className="max-w-7xl mx-auto px-6 mt-2">
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-amber-800 font-semibold">⚠ Unsaved changes — save to preserve qualifying results</span>
            <button onClick={handleSaveToRecord} disabled={recordSaving}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-60">
              {recordSaving ? '⏳ Saving…' : '💾 Save Now'}
            </button>
          </div>
        </div>
      )}

      {/* ── 5. Next Step Intelligence™ — above tab nav, matching M02 ── */}
      {findingsReported && (
        <div className="max-w-7xl mx-auto px-6">
          {primarySuggestion ? (
            <NextStepCard
              suggestion={primarySuggestion}
              secondarySuggestions={secondarySuggestions}
              onFollow={logFollow}
              onOverride={logOverride}
              loanPurpose={loanPurpose}
              scenarioId={scenarioId}
            />
          ) : (
            <div className="mt-4 mb-2 bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Next Step Intelligence™</p>
                  <p className="text-sm font-bold text-slate-800">Qualifying complete — proceed to Asset Analyzer</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4 ml-11">DTI analysis saved to the Decision Record. Next, verify asset documentation — reserves, down payment source, and closing cost funds.</p>
              <div className="flex items-center gap-3 flex-wrap ml-11">
                <button onClick={() => navigate(`/asset-analyzer?scenarioId=${scenarioId}`)}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                  Go to Asset Analyzer
                </button>
                <button onClick={() => navigate(`/lender-match?scenarioId=${scenarioId}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl transition-colors hover:text-indigo-800">
                  → Lender Match
                </button>
                <button onClick={() => navigate(`/credit-analyzer?scenarioId=${scenarioId}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl transition-colors hover:text-indigo-800">
                  → Credit Analyzer
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          6. THREE-TAB LAYOUT
      ════════════════════════════════════════════════════════ */}

      {/* ── Tab Navigation Bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center">
            {[
              { id: 0, label: 'Qualify',       icon: '🏠', sub: 'Programs & Purchase Price' },
              { id: 1, label: 'Scenarios',     icon: '📉', sub: 'Rate & Buydown Analysis'   },
              { id: 2, label: 'Docs & Factors',icon: '📋', sub: 'Checklist & LO Notes'      },
              { id: 3, label: 'Letters',        icon: '📄', sub: 'Pre-Qual · Pre-Approval'   },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-5 py-3 border-b-2 transition-all text-left ${activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                <div className="text-sm font-bold">{t.icon} {t.label}</div>
                <div className="hidden md:block text-xs text-slate-400 leading-none mt-0.5">{t.sub}</div>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-4 pr-2">
              {totalIncome > 0 && (
                <div className="text-right">
                  <div className="text-xs text-slate-400">Total Income</div>
                  <div className="text-sm font-black text-emerald-600">{fmt$(totalIncome)}/mo</div>
                </div>
              )}
              {totalIncome > 0 && totalHousing > 0 && (
                <div className="text-right">
                  <div className="text-xs text-slate-400">Back DTI</div>
                  <div className={`text-sm font-black font-mono ${backDTI > 56.9 ? 'text-red-600' : backDTI > 50 ? 'text-amber-600' : backDTI > 43 ? 'text-amber-500' : 'text-emerald-600'}`}>{fmtPct(backDTI)}</div>
                </div>
              )}
              {totalIncome > 0 && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${overallPass ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  {overallPass ? `✓ ${eligiblePrograms.length} Eligible` : '✗ None Qualify'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ════ TAB 0: QUALIFY ════ */}
        {activeTab === 0 && (
          <div className="grid xl:grid-cols-3 gap-6">

            {/* Left column */}
            <div className="xl:col-span-2 space-y-5">

              {/* Income Bar */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">💼 Borrower Income</h2>
                  <div className="flex items-center gap-2">
                    {m02Imported && <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">✅ From M02</span>}
                    <span className="text-sm font-black text-emerald-600">{fmt$(totalBorrowerIncome)}/mo</span>
                  </div>
                </div>
                {m02Imported && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
                    <p className="text-xs text-emerald-700">Imported from M02 Income Analyzer™ — edit below to override</p>
                  </div>
                )}
                <div className="space-y-2">
                  {incomes.map((inc) => {
                    const incType = INCOME_TYPES.find(t => t.id === inc.type);
                    const rawAmt  = parseFloat(inc.gross) || 0;
                    const grossedUp = incType?.grossUp && inc.nonTaxableConfirmed && rawAmt > 0;
                    const qualAmt   = grossedUp ? rawAmt / 0.75 : rawAmt;
                    return (
                      <div key={inc.id} className={`grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-xl ${grossedUp ? 'bg-purple-50' : 'bg-slate-50'}`}>
                        <div className="col-span-5">
                          <select value={inc.type} onChange={e => updateIncome(setIncomes, inc.id, 'type', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-indigo-300">
                            {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-4 relative">
                          <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">$</span>
                          <input type="number" value={inc.gross} placeholder="0.00"
                            onChange={e => updateIncome(setIncomes, inc.id, 'gross', e.target.value)}
                            className="w-full pl-5 border border-slate-200 rounded-lg py-1.5 text-xs bg-white focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="col-span-2 text-right">
                          {incType?.grossUp && rawAmt > 0 && (
                            <label className="flex items-center gap-1 justify-end cursor-pointer">
                              <input type="checkbox" checked={!!inc.nonTaxableConfirmed}
                                onChange={e => updateIncome(setIncomes, inc.id, 'nonTaxableConfirmed', e.target.checked)}
                                className="accent-purple-600 w-3 h-3" />
                              <span className="text-xs text-purple-600 font-semibold">↑25%</span>
                            </label>
                          )}
                          {qualAmt > 0 && <div className="text-xs font-bold text-indigo-600 font-mono">{fmt$(qualAmt)}</div>}
                        </div>
                        <div className="col-span-1 text-center">
                          {incomes.length > 1 && <button onClick={() => removeIncome(setIncomes, inc.id)} className="text-slate-300 hover:text-red-400 text-sm">✕</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => addIncome(setIncomes)} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">+ Add Income Source</button>
                  {coborrowerIncomes.length === 0 && (
                    <button onClick={() => addIncome(setCoborrowerIncomes)} className="text-xs text-slate-400 hover:text-slate-600">+ Add Co-Borrower</button>
                  )}
                </div>
                {coborrowerIncomes.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Co-Borrower</p>
                      <span className="text-xs font-black text-violet-600">{fmt$(totalCoBorrowerIncome)}/mo</span>
                    </div>
                    {coborrowerIncomes.map(inc => (
                      <div key={inc.id} className="grid grid-cols-12 gap-2 items-center mb-2 bg-slate-50 px-2 py-2 rounded-xl">
                        <div className="col-span-5">
                          <select value={inc.type} onChange={e => updateIncome(setCoborrowerIncomes, inc.id, 'type', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white">
                            {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-5 relative">
                          <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">$</span>
                          <input type="number" value={inc.gross} placeholder="0.00"
                            onChange={e => updateIncome(setCoborrowerIncomes, inc.id, 'gross', e.target.value)}
                            className="w-full pl-5 border border-slate-200 rounded-lg py-1.5 text-xs bg-white" />
                        </div>
                        <div className="col-span-2 text-center">
                          <button onClick={() => removeIncome(setCoborrowerIncomes, inc.id)} className="text-slate-300 hover:text-red-400 text-sm">✕</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => addIncome(setCoborrowerIncomes)} className="text-xs text-slate-400 hover:text-slate-600">+ Add Co-Borrower Income</button>
                  </div>
                )}
              </div>

              {/* Housing & Debts — compact grid */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">🏠 Housing & Debts</h2>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-3">
                  {/* Loan Amount Warning — when current loan exceeds max for eligible programs */}
                  {parseFloat(loanAmount) > 0 && (() => {
                    const eligibleMaxLoans = maxPurchasePrices.filter(p => programResults.find(r=>r.key===p.key)?.eligible && p.maxLoan > 0);
                    const lowestEligibleMax = eligibleMaxLoans.length > 0 ? Math.min(...eligibleMaxLoans.map(p=>p.maxLoan)) : 0;
                    return lowestEligibleMax > 0 && parseFloat(loanAmount) > lowestEligibleMax ? (
                      <div className="col-span-3 md:col-span-4 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500 text-base">⚠</span>
                          <div>
                            <p className="text-xs font-bold text-amber-800">Loan amount exceeds qualifying max</p>
                            <p className="text-xs text-amber-700">Max qualifying loan: <span className="font-mono font-bold">{fmt$0(lowestEligibleMax)}</span> — click "← Use This" on a program card below</p>
                          </div>
                        </div>
                        <button onClick={() => setLoanAmount(String(lowestEligibleMax))}
                          className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap">
                          Fix It →
                        </button>
                      </div>
                    ) : null;
                  })()}
                  {[
                    { label: 'Loan Amount', val: loanAmount, set: setLoanAmount, ph: '400000' },
                    { label: 'Taxes /mo',   val: taxes,      set: setTaxes,      ph: '417'    },
                    { label: 'Insurance',   val: insurance,  set: setInsurance,  ph: '250'    },
                    { label: 'HOA /mo',     val: hoa,        set: setHoa,        ph: '0'      },
                    { label: 'MI/MIP (auto↓)', val: mi, set: setMi, ph: 'auto' },
                    { label: 'Monthly Debts', val: debts,    set: setDebt,       ph: '850'    },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">$</span>
                        <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                          className="w-full pl-5 border border-slate-200 rounded-lg py-1.5 text-xs focus:ring-2 focus:ring-indigo-300" />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Rate (%)</label>
                    <input type="number" step="0.001" value={rate} placeholder="6.375" onChange={e => setRate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Term</label>
                    <select value={term} onChange={e => setTerm(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                      <option value="360">30yr</option><option value="300">25yr</option>
                      <option value="240">20yr</option><option value="180">15yr</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Credit Score</label>
                    <input type="number" value={creditScore} placeholder="720" onChange={e => setCreditScore(e.target.value)}
                      className={`w-full border rounded-lg px-2 py-1.5 text-xs ${parseInt(creditScore) >= 740 ? 'border-emerald-300' : parseInt(creditScore) >= 620 ? 'border-amber-300' : 'border-slate-200'}`} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1 mb-2">
                  MI/MIP auto-populates when you click <strong>← Use This</strong> on a program card below. Rates are estimates — verify with MI provider at underwrite.
                </p>
                {totalHousing > 0 && (
                  <div className="bg-slate-900 rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <div className="flex gap-4 text-xs flex-wrap">
                      <span className="text-slate-400">P&I <span className="text-white font-bold font-mono">{fmt$(pi)}</span></span>
                      <span className="text-slate-400">Taxes <span className="text-white font-bold font-mono">{fmt$(parseFloat(taxes)||0)}</span></span>
                      <span className="text-slate-400">Ins <span className="text-white font-bold font-mono">{fmt$(parseFloat(insurance)||0)}</span></span>
                      {parseFloat(mi)  > 0 && <span className="text-slate-400">MI <span className="text-white font-bold font-mono">{fmt$(parseFloat(mi))}</span></span>}
                      {parseFloat(hoa) > 0 && <span className="text-slate-400">HOA <span className="text-white font-bold font-mono">{fmt$(parseFloat(hoa))}</span></span>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">Total PITI</div>
                      <div className="text-xl font-black text-white font-mono">{fmt$(totalHousing)}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Down Payment Control */}
              {/* ── DTI Target Selector ── */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🎯 Qualifying DTI Target</h2>
                  <span className="text-xs text-slate-400">Controls max loan calculation</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {Object.entries(DTI_TARGETS).map(([key, t]) => (
                    <button key={key} onClick={() => setDtiTarget(key)}
                      className={`py-3 px-2 rounded-xl border-2 text-center transition-all ${dtiTarget === key
                        ? key === 'conservative' ? 'border-emerald-500 bg-emerald-50'
                        : key === 'standard'     ? 'border-amber-500 bg-amber-50'
                        : 'border-red-400 bg-red-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className="text-lg leading-tight">{t.badge}</div>
                      <div className={`text-sm font-black mt-0.5 ${dtiTarget === key
                        ? key === 'conservative' ? 'text-emerald-700'
                        : key === 'standard'     ? 'text-amber-700'
                        : 'text-red-600' : 'text-slate-700'}`}>
                        {t.label}
                      </div>
                      <div className={`text-xs font-bold ${dtiTarget === key
                        ? key === 'conservative' ? 'text-emerald-600'
                        : key === 'standard'     ? 'text-amber-600'
                        : 'text-red-500' : 'text-slate-400'}`}>
                        {t.pct ? `≤${t.pct}% DTI` : 'Program max'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 leading-tight hidden md:block">{t.desc}</div>
                    </button>
                  ))}
                </div>
                {dtiTarget === 'maximum' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-red-700 font-semibold">⚠ Maximum uses each program's hard DTI ceiling. AUS approval not guaranteed. Use only with strong compensating factors documented.</p>
                  </div>
                )}
                {dtiTarget === 'conservative' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-emerald-700 font-semibold">✓ Conservative target keeps DTI at 43% — clean AUS approvals, best for tight files.</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">💰 Down Payment</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Custom %:</span>
                    <div className="relative w-20">
                      <input type="number" step="0.5" value={downPaymentPct} onChange={e => setDownPaymentPct(e.target.value)}
                        className="w-full border-2 border-indigo-300 rounded-lg px-2 py-1 text-sm font-black text-center text-indigo-700 focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <span className="text-xs font-bold text-indigo-600">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    { pct: '0',   label: '0%',   note: 'VA/USDA' },
                    { pct: '3',   label: '3%',   note: 'Conv' },
                    { pct: '3.5', label: '3.5%', note: 'FHA min' },
                    { pct: '5',   label: '5%',   note: 'Conv' },
                    { pct: '10',  label: '10%',  note: 'Conv' },
                    { pct: '20',  label: '20%',  note: 'No MI' },
                  ].map(({ pct, label, note }) => (
                    <button key={pct} onClick={() => setDownPaymentPct(pct)}
                      className={`py-2.5 rounded-xl border-2 text-center transition-all ${downPaymentPct === pct ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                      <div className="text-sm font-black">{label}</div>
                      <div className={`text-xs ${downPaymentPct === pct ? 'text-indigo-200' : 'text-slate-400'}`}>{note}</div>
                    </button>
                  ))}
                </div>
                {parseFloat(loanAmount) > 0 && parseFloat(downPaymentPct) > 0 && (
                  <div className="mt-3 bg-indigo-50 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-indigo-600 font-semibold">Down payment on <span className="font-mono">{fmt$0(parseFloat(loanAmount))}</span> loan:</span>
                    <span className="text-sm font-black text-indigo-700 font-mono">
                      {fmt$0(parseFloat(loanAmount) / (1 - Math.min(parseFloat(downPaymentPct),99)/100) * (parseFloat(downPaymentPct)/100))}
                    </span>
                  </div>
                )}
              </div>

              {/* Program Cards */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">📋 Program Eligibility</h2>
                  {totalIncome > 0 && totalHousing > 0 && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${overallPass ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {overallPass ? `✓ ${eligiblePrograms.length} program${eligiblePrograms.length !== 1 ? 's' : ''} qualify` : '✗ No programs qualify'}
                    </span>
                  )}
                </div>
                {(totalIncome === 0 || totalHousing === 0) ? (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                    <p className="text-3xl mb-3">📊</p>
                    <p className="text-slate-500 text-sm font-semibold">Enter income and housing above</p>
                    <p className="text-slate-400 text-xs mt-1">Program eligibility and max purchase prices will appear here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(PROGRAMS).map(([key, prog]) => {
                      const frontPass  = !prog.frontMax || frontDTI <= prog.frontMax;
                      const backPass   = key === 'VA' ? true : backDTI <= prog.backMax;
                      const creditPass = !creditScore || parseInt(creditScore) >= prog.minCredit;
                      const eligible   = frontPass && backPass && creditPass;
                      const isVA       = key === 'VA';
                      const vaOverDTI  = isVA && backDTI > prog.backMax;
                      const mp         = maxPurchasePrices.find(p => p.key === key);
                      const MIN_DOWN   = { FHA:3.5, CONVENTIONAL:3, HOMEREADY:3, HOMEPOSSIBLE:3, VA:0, USDA:0 };
                      const minDown    = MIN_DOWN[key] ?? 3;
                      const curDown    = parseFloat(downPaymentPct) || 5;
                      const failReason = !creditPass
                        ? `Credit ${parseInt(creditScore)||0} below ${prog.minCredit} minimum`
                        : !backPass  ? `Back DTI ${fmtPct(backDTI)} exceeds ${prog.backMax}% max`
                        : !frontPass ? `Front DTI ${fmtPct(frontDTI)} exceeds ${prog.frontMax}% max`
                        : '';
                      const ri = requiredIncomeByProg.find(r => r.key === key);
                      return (
                        <div key={key} className={`rounded-2xl border-2 p-5 transition-all ${eligible ? 'border-emerald-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50/60'}`}>
                          {/* Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${eligible ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                              <span className="text-base font-black text-slate-800">{prog.label}</span>
                              {prog.minCredit && <span className="text-xs text-slate-400 font-mono">{prog.minCredit}+ FICO</span>}
                            </div>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isVA && vaOverDTI ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              {eligible ? '✓ Qualifies' : isVA && vaOverDTI ? '⚠ Check Residual' : '✗ Fails'}
                            </span>
                          </div>

                          {/* DTI Bar */}
                          <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-500">Back-End DTI</span>
                              <span className={`font-bold font-mono ${backPass ? 'text-emerald-600' : 'text-red-600'}`}>
                                {fmtPct(backDTI)} <span className="text-slate-400 font-normal">/ {prog.backMax}%</span>
                              </span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${backDTI > prog.backMax ? 'bg-red-500' : backDTI > prog.backMax * 0.9 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min((backDTI / prog.backMax) * 100, 100)}%` }} />
                            </div>
                          </div>

                          {/* Max Purchase + Down Payment Grid */}
                          {mp?.maxPurchase > 0 ? (
                            <div className="space-y-2">
                              <div className="bg-indigo-50 rounded-xl px-4 py-3">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-xs text-indigo-500 mb-0.5">Max Purchase Price</p>
                                    <p className="text-2xl font-black text-indigo-700 font-mono">{fmt$0(mp.maxPurchase)}</p>
                                  </div>
                                  {/* MI badge */}
                                  {mp.miAnnualPct > 0 ? (
                                    <div className="text-right">
                                      <p className="text-xs text-slate-400">Est. MI/MIP</p>
                                      <p className="text-sm font-black text-slate-700 font-mono">{fmt$(mp.estMI)}/mo</p>
                                      <p className="text-xs text-slate-400">{mp.miAnnualPct}%/yr</p>
                                    </div>
                                  ) : (
                                    <div className="text-right">
                                      <p className="text-xs text-slate-400">MI/MIP</p>
                                      <p className="text-sm font-black text-emerald-600">$0</p>
                                      <p className="text-xs text-slate-400">{key==='VA'?'VA — none':key==='USDA'?'0.35% financed':'≥20% down'}</p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  <div>
                                    <p className="text-xs text-slate-500">Max loan amount:</p>
                                    <p className="text-base font-black text-slate-800 font-mono">{fmt$0(mp.maxLoan)}</p>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setLoanAmount(String(mp.maxLoan));
                                      if (mp.estMI > 0) setMi(String(mp.estMI));
                                      else setMi('0');
                                    }}
                                    className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                                      parseFloat(loanAmount) === mp.maxLoan
                                        ? dtiTarget === 'conservative' ? 'bg-emerald-100 text-emerald-700 border-emerald-400'
                                        : dtiTarget === 'standard'     ? 'bg-amber-100 text-amber-700 border-amber-400'
                                        : 'bg-red-100 text-red-700 border-red-400'
                                        : 'bg-white text-indigo-700 border-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-600'
                                    }`}
                                    title={`Projected DTI: ${mp.projDTI}% · MI/MIP ${mp.estMI > 0 ? fmt$(mp.estMI)+'/mo auto-set' : '$0 — none required'}`}
                                  >
                                    <span>{parseFloat(loanAmount) === mp.maxLoan ? '✓ Using' : '← Use This'}</span>
                                    {mp.projDTI > 0 && (
                                      <span className={`text-xs mt-0.5 font-black ${
                                        parseFloat(loanAmount) === mp.maxLoan ? 'opacity-80' :
                                        mp.projDTI <= 43 ? 'text-emerald-600' :
                                        mp.projDTI <= 45 ? 'text-amber-600' :
                                        mp.projDTI <= 50 ? 'text-orange-500' : 'text-red-600'
                                      }`}>{mp.projDTI}% DTI</span>
                                    )}
                                  </button>
                                </div>
                                {parseFloat(loanAmount) > mp.maxLoan && mp.maxLoan > 0 && (
                                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                                    <span className="text-amber-500 text-xs">⚠</span>
                                    <p className="text-xs text-amber-700 font-semibold">
                                      Current loan <span className="font-mono">{fmt$0(parseFloat(loanAmount))}</span> exceeds max by <span className="font-mono">{fmt$0(parseFloat(loanAmount)-mp.maxLoan)}</span>
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-slate-50 rounded-xl p-2 text-center">
                                  <p className="text-xs text-slate-400">Min Down</p>
                                  <p className="text-sm font-black text-slate-700">{key==='VA'||key==='USDA'?'0%':`${minDown}%`}</p>
                                  <p className="text-xs font-mono text-slate-500">{key==='VA'||key==='USDA'?'$0':fmt$0(mp.maxPurchase*minDown/100)}</p>
                                </div>
                                <div className={`rounded-xl p-2 text-center ${eligible?'bg-indigo-50':'bg-slate-50'}`}>
                                  <p className="text-xs text-slate-400">{curDown}% Down</p>
                                  <p className={`text-sm font-black font-mono ${eligible?'text-indigo-700':'text-slate-500'}`}>{fmt$0(mp.maxPurchase*curDown/100)}</p>
                                </div>
                                <div className={`rounded-xl p-2 text-center ${eligible?'bg-emerald-50':'bg-slate-50'}`}>
                                  <p className="text-xs text-slate-400">20% Down</p>
                                  <p className={`text-sm font-black font-mono ${eligible?'text-emerald-700':'text-slate-500'}`}>{fmt$0(mp.maxPurchase*0.20)}</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-50 rounded-xl p-3 text-center text-xs text-slate-400">—</div>
                          )}

                          {/* Fail reason + income gap */}
                          {!eligible && (
                            <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                              <p className="text-xs text-red-600 font-semibold">✗ {failReason}</p>
                              {ri?.gap > 0 && <p className="text-xs text-red-500 mt-0.5">Need <span className="font-bold font-mono">{fmt$(ri.gap)}/mo</span> more income</p>}
                            </div>
                          )}
                          {isVA && <p className="text-xs text-amber-600 mt-2 italic">VA: residual income governs — verify separately</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              {/* DTI Summary */}
              {totalIncome > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">DTI Summary</h3>
                  {[
                    { label:'Front DTI', val:frontDTI, guide:28, max:46.9 },
                    { label:'Back DTI',  val:backDTI,  guide:43, max:56.9 },
                  ].map(item => (
                    <div key={item.label} className="mb-3">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-slate-500">{item.label}</span>
                        <span className={`text-sm font-black font-mono ${dtiColor(item.val, item.max)}`}>{fmtPct(item.val)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.val>item.max?'bg-red-500':item.val>item.guide?'bg-amber-400':'bg-emerald-500'}`}
                          style={{width:`${Math.min(item.val/item.max*100,100)}%`}} />
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                    {[['Total Income',fmt$(totalIncome)+'/mo'],['Total PITI',fmt$(totalHousing)+'/mo'],['Total Debts',fmt$(totalDebts)+'/mo']].map(([l,v])=>(
                      <div key={l} className="flex justify-between">
                        <span className="text-slate-400">{l}</span>
                        <span className="font-bold text-slate-700">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Best Max Purchase */}
              {totalIncome > 0 && monthlyPayFactor > 0 && (() => {
                const best = maxPurchasePrices.filter(p=>p.maxPurchase>0).sort((a,b)=>b.maxPurchase-a.maxPurchase)[0];
                return best ? (
                  <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-4 text-white">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wide">🏡 Best Max Purchase</h3>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        dtiTarget==='conservative'?'bg-emerald-400/30 text-emerald-200':
                        dtiTarget==='standard'    ?'bg-amber-400/30 text-amber-200':
                        'bg-red-400/30 text-red-200'}`}>
                        {activeDTITarget.badge} {activeDTITarget.label}
                      </span>
                    </div>
                    <div className="text-2xl font-black font-mono">{fmt$0(best.maxPurchase)}</div>
                    <p className="text-xs text-indigo-300 mt-0.5">{best.label} · {downPct}% down · ≤{best.targetPct}% DTI</p>
                    <div className="mt-3 pt-3 border-t border-indigo-500 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-indigo-300">Max Loan</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{fmt$0(best.maxLoan)}</span>
                          <button onClick={() => setLoanAmount(String(best.maxLoan))}
                            className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all ${
                              parseFloat(loanAmount) === best.maxLoan
                                ? 'bg-emerald-400/30 text-emerald-200 border-emerald-400/40'
                                : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                            }`}>
                            {parseFloat(loanAmount) === best.maxLoan ? '✓' : '← Use'}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between"><span className="text-indigo-300">Down Payment</span><span className="font-mono font-bold">{fmt$0(best.maxPurchase*downPct/100)}</span></div>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Program Quick List */}
              {totalIncome > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Programs</h3>
                  <div className="space-y-1.5">
                    {programResults.map(({key,prog,eligible}) => {
                      const mp = maxPurchasePrices.find(p=>p.key===key);
                      return (
                        <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${eligible?'bg-emerald-50 border border-emerald-100':'bg-slate-50 border border-slate-100'}`}>
                          <div className="flex items-center gap-2">
                            <span className={eligible?'text-emerald-600 font-bold':'text-slate-300 font-bold'}>{eligible?'✓':'✗'}</span>
                            <span className={`font-semibold ${eligible?'text-emerald-700':'text-slate-400'}`}>{prog.label}</span>
                          </div>
                          {mp?.maxPurchase > 0 && <span className={`font-mono font-bold text-xs ${eligible?'text-indigo-600':'text-slate-400'}`}>{fmt$0(mp.maxPurchase)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Key Rules */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Rules</h3>
                <div className="text-xs text-amber-700 space-y-1">
                  <p>• FHA back-end max: 56.9% (AUS)</p>
                  <p>• Conventional: 50% (DU/LPA)</p>
                  <p>• HomeReady/Home Possible: ≤80% AMI</p>
                  <p>• VA: no hard DTI — residual income</p>
                  <p>• USDA: 29% front / 41% back</p>
                  <p>• Non-taxable: gross up 25% (÷0.75)</p>
                  <p>• OT/bonus: 2-year history required</p>
                  <p>• SE: 2-year tax return average</p>
                </div>
              </div>

              {/* Save to Decision Record */}
              <div className={`rounded-2xl border p-4 transition-all ${savedRecordId && !hasUnsavedChanges ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${savedRecordId && !hasUnsavedChanges ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    {savedRecordId && !hasUnsavedChanges
                      ? <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="#475569" strokeWidth="1.4"/><path d="M5 8h6M5 5.5h6M5 10.5h3.5" stroke="#475569" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    }
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${savedRecordId && !hasUnsavedChanges ? 'text-emerald-800' : 'text-slate-700'}`}>
                      {savedRecordId && !hasUnsavedChanges ? 'Decision Record Saved ✓' : 'Decision Record'}
                    </p>
                    <p className={`text-xs ${savedRecordId && !hasUnsavedChanges ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {savedRecordId && !hasUnsavedChanges ? 'Findings logged to audit trail' : 'Save findings to audit trail'}
                    </p>
                  </div>
                </div>
                {(hasUnsavedChanges || !savedRecordId) && (
                  <button onClick={handleSaveToRecord} disabled={recordSaving}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                    {recordSaving ? '⏳ Saving…' : <><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="#fff" strokeWidth="1.3"/><path d="M4.5 7l2 2 3.5-3.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> Save to Decision Record</>}
                  </button>
                )}
              </div>

            </div>

          </div>
        )}

        {/* ════ TAB 1: SCENARIOS ════ */}
        {activeTab === 1 && (
          <div className="space-y-5">

            {/* Rate Sensitivity */}
            <Section title="Rate Sensitivity" subtitle="DTI and payment impact at ±0.5% and ±1.0% from current rate." icon="📉">
              {rateSensitivity.length > 0 ? (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Rate</th>
                        <th className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">P&I</th>
                        <th className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">PITI</th>
                        <th className="text-center px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Front DTI</th>
                        <th className="text-center px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Back DTI</th>
                        <th className="text-center px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Conv</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateSensitivity.map(({delta,rate:r,pi:rPi,housing,frontDTI:fD,backDTI:bD,isCurrent})=>(
                        <tr key={delta} className={`border-b border-slate-50 ${isCurrent?'bg-indigo-50 font-bold':'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3">
                            <span className={`font-mono font-bold ${isCurrent?'text-indigo-700':delta<0?'text-emerald-600':'text-red-500'}`}>{r.toFixed(3)}%</span>
                            {isCurrent && <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">Current</span>}
                            {!isCurrent && <span className={`ml-1 text-xs ${delta<0?'text-emerald-500':'text-red-400'}`}>{delta>0?'+':''}{delta}%</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt$(rPi)}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt$(housing)}</td>
                          <td className={`px-4 py-3 text-center font-mono font-bold ${fD>46.9?'text-red-600':fD>36?'text-amber-600':'text-emerald-600'}`}>{fmtPct(fD)}</td>
                          <td className={`px-4 py-3 text-center font-mono font-bold ${bD>56.9?'text-red-600':bD>50?'text-amber-600':bD>43?'text-amber-500':'text-emerald-600'}`}>{fmtPct(bD)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${bD<=50?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-600 border-red-200'}`}>{bD<=50?'✓':'✗'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-400 italic text-center py-6">Enter loan amount and interest rate on the Qualify tab.</p>}
            </Section>

            {/* Buydown Analysis */}
            <Section title="Buydown Qualifying Analysis" subtitle="Fannie/Freddie/VA/USDA qualify at note rate. FHA may use temporary rate." icon="📊">
              {buydownAnalysis ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-amber-800">⚠ Key Guideline</p>
                    <p className="text-xs text-amber-700 mt-0.5">Conventional, VA, and USDA must qualify at the <strong>note rate</strong>. FHA 4000.1 may allow qualifying at the temporary buydown rate if seller or lender-funded — always confirm with AUS.</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { label:'2-1 Buydown', data:buydownAnalysis.twoOne, years:[
                        {label:`Yr 1 — ${buydownAnalysis.twoOne.yr1.rate.toFixed(3)}%`,pi:buydownAnalysis.twoOne.yr1.pi},
                        {label:`Yr 2 — ${buydownAnalysis.twoOne.yr2.rate.toFixed(3)}%`,pi:buydownAnalysis.twoOne.yr2.pi},
                        {label:`Yr 3+ — ${buydownAnalysis.twoOne.note.rate.toFixed(3)}% (note)`,pi:buydownAnalysis.twoOne.note.pi,isNote:true},
                      ]},
                      { label:'1-0 Buydown', data:buydownAnalysis.oneZero, years:[
                        {label:`Yr 1 — ${buydownAnalysis.oneZero.yr1.rate.toFixed(3)}%`,pi:buydownAnalysis.oneZero.yr1.pi},
                        {label:`Yr 2+ — ${buydownAnalysis.oneZero.note.rate.toFixed(3)}% (note)`,pi:buydownAnalysis.oneZero.note.pi,isNote:true},
                      ]},
                    ].map(({label,data,years})=>(
                      <div key={label} className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between">
                          <span className="text-sm font-bold">{label}</span>
                          <span className="text-xs text-slate-400">Note: {data.note.rate.toFixed(3)}%</span>
                        </div>
                        <div className="p-3 space-y-2">
                          {years.map(({label:yl,pi:yPi,isNote})=>(
                            <div key={yl} className={`flex justify-between items-center px-3 py-2 rounded-xl ${isNote?'bg-slate-50 border border-slate-200':'bg-white border border-slate-100'}`}>
                              <div>
                                <p className="text-xs font-semibold text-slate-700">{yl}</p>
                                <p className="text-xs text-slate-400 font-mono">P&I: {fmt$(yPi)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-400">Back DTI</p>
                                <p className={`text-sm font-black font-mono ${totalIncome>0&&((yPi+fixedCosts+totalDebts)/totalIncome*100)>50?'text-red-600':'text-emerald-600'}`}>
                                  {totalIncome>0?fmtPct((yPi+fixedCosts+totalDebts)/totalIncome*100):'—'}
                                </p>
                              </div>
                            </div>
                          ))}
                          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                            <div className="bg-blue-50 rounded-xl p-2 text-center">
                              <p className="text-xs font-bold text-blue-600">FHA (yr1)</p>
                              <p className={`text-sm font-black font-mono ${data.fhaDTI.back>56.9?'text-red-600':'text-blue-700'}`}>{fmtPct(data.fhaDTI.back)}</p>
                            </div>
                            <div className="bg-indigo-50 rounded-xl p-2 text-center">
                              <p className="text-xs font-bold text-indigo-600">Conv (note)</p>
                              <p className={`text-sm font-black font-mono ${data.convDTI.back>50?'text-red-600':'text-indigo-700'}`}>{fmtPct(data.convDTI.back)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-sm text-slate-400 italic text-center py-6">Enter loan amount and interest rate on the Qualify tab.</p>}
            </Section>

            {/* Required Income by Program */}
            {totalIncome > 0 && totalHousing > 0 && (
              <Section title="Required Income by Program" subtitle="Exact monthly income needed to qualify — and the gap or surplus for this borrower." icon="🎯">
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Program</th>
                        <th className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Required /mo</th>
                        <th className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Current /mo</th>
                        <th className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wide">Gap / Surplus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requiredIncomeByProg.map(({key,label,required,gap,eligible})=>(
                        <tr key={key} className={`border-b border-slate-50 ${eligible?'hover:bg-emerald-50/30':'hover:bg-red-50/20'}`}>
                          <td className="px-4 py-3 font-semibold text-slate-700">{label}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">{fmt$(required)}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-500">{fmt$(totalIncome)}</td>
                          <td className={`px-4 py-3 text-right font-mono font-black ${gap<=0?'text-emerald-600':'text-red-500'}`}>
                            {gap<=0?'+':''}{fmt$(Math.abs(gap))}/mo {gap<=0?'surplus':'short'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

          </div>
        )}

        {/* ════ TAB 2: DOCS & FACTORS ════ */}
        {activeTab === 2 && (
          <div className="max-w-4xl space-y-5">

            {/* Compensating Factors */}
            <Section title="Compensating Factors" subtitle="Document all factors that support approval at elevated DTI." icon="⚖️">
              <div className="space-y-2">
                {COMP_FACTORS.map(cf=>(
                  <label key={cf.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${compFactors[cf.id]?'bg-emerald-50 border-emerald-200':'bg-white border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={!!compFactors[cf.id]}
                      onChange={e=>setCompFactors(p=>({...p,[cf.id]:e.target.checked}))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${compFactors[cf.id]?'text-emerald-800':'text-slate-700'}`}>{cf.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cf.impact==='HIGH'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{cf.impact}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{cf.detail}</p>
                    </div>
                  </label>
                ))}
              </div>
              {cfCount>0 && <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5"><p className="text-sm font-bold text-emerald-700">✓ {cfCount} factor{cfCount!==1?'s':''} documented{cfCount>=2?' — strong manual underwrite position':''}</p></div>}
            </Section>

            {/* Student Loan */}
            <Section title="Student Loan Payment Factor" subtitle="Program-aware qualifying payment — automatically included in back-end DTI." icon="🎓">
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Total Balance</label>
                  <div className="relative"><span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={slBalance} onChange={e=>setSlBalance(e.target.value)} placeholder="e.g. 48000"
                      className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300"/></div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Actual Monthly (IBR/IDR)</label>
                  <div className="relative"><span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" value={slActualPayment} onChange={e=>setSlActualPayment(e.target.value)} placeholder="0 if deferred"
                      className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300"/></div>
                </div>
                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer mt-5">
                    <input type="checkbox" checked={slDeferred} onChange={e=>setSlDeferred(e.target.checked)} className="accent-indigo-600 w-4 h-4"/>
                    <span className="text-xs font-semibold text-slate-600">Deferred / IBR / $0</span>
                  </label>
                  {slDeferred && <input type="number" value={slDeferMonths} onChange={e=>setSlDeferMonths(e.target.value)} placeholder="Months remaining" className="w-full mt-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"/>}
                </div>
              </div>
              {parseFloat(slBalance)>0 && (
                <div className={`rounded-xl border p-4 ${slQualPayment===0?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-0.5">Qualifying Payment — {scenario?.loanType||'current program'}</p>
                      <p className="text-xs text-slate-500">{slResult.rule}</p>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-black ${slQualPayment===0?'text-emerald-600':'text-amber-600'}`}>{fmt$0(slQualPayment)}/mo</div>
                      <div className="text-xs text-slate-400">Added to DTI</div>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Income Doc Checklist */}
            <Section title="Income Documentation Checklist" subtitle="Check off each item as obtained and added to the file." icon="📎">
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Income Types Present</p>
                <div className="flex flex-wrap gap-2">
                  {INCOME_TYPES.map(t=>(
                    <label key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold transition-all ${incomeTypes[t.id]?t.grossUp?'bg-purple-600 text-white border-purple-600':'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                      <input type="checkbox" checked={!!incomeTypes[t.id]} onChange={e=>setIncomeTypes(p=>({...p,[t.id]:e.target.checked}))} className="hidden"/>
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {INCOME_TYPES.filter(t=>incomeTypes[t.id]).map(t=>{
                  const ck=`docs_${t.id}`,cd=incomeTypes[ck]||{},allCk=t.docs.every((_,i)=>cd[i]);
                  return (
                    <div key={t.id} className={`rounded-xl border overflow-hidden ${t.grossUp?'border-purple-200':t.stable?'border-emerald-200':'border-amber-200'}`}>
                      <div className={`flex items-center justify-between px-4 py-3 ${t.grossUp?'bg-purple-50':t.stable?'bg-emerald-50':'bg-amber-50'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-2 h-2 rounded-full ${t.grossUp?'bg-purple-500':t.stable?'bg-emerald-500':'bg-amber-500'}`}/>
                          <span className="text-sm font-bold text-slate-800">{t.label}</span>
                          {t.grossUp && <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">Gross Up 25%</span>}
                          {t.continuance && <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">Continuance Required</span>}
                        </div>
                        {allCk && <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-full font-bold shrink-0">✓ Complete</span>}
                      </div>
                      <div className="px-4 py-3 bg-white">
                        {t.grossUpNote && <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 mb-2"><p className="text-xs text-purple-700">{t.grossUpNote}</p></div>}
                        {t.calcRule && <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2"><p className="text-xs font-semibold text-blue-700">📐 How to Calculate</p><p className="text-xs text-blue-600 mt-0.5">{t.calcRule}</p></div>}
                        <div className="space-y-1.5">
                          {t.docs.map((docItem,i)=>{
                            const isChecked=!!(cd[i]);
                            return (
                              <label key={i} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer ${isChecked?'bg-emerald-50':'hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={isChecked}
                                  onChange={e=>setIncomeTypes(prev=>({...prev,[ck]:{...(prev[ck]||{}),[i]:e.target.checked}}))}
                                  className="mt-0.5 w-3.5 h-3.5 accent-emerald-600 shrink-0"/>
                                <span className={`text-xs ${isChecked?'line-through text-slate-400':'text-slate-600'}`}>{docItem}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* LO Notes + Save */}
            <Section title="LO Notes" icon="📝">
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4}
                placeholder="DTI rationale, compensating factor details, program recommendations, underwriter notes…"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none"/>
              <button onClick={handleSaveToRecord} disabled={recordSaving}
                className="mt-3 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {recordSaving?'⏳ Saving…':'💾 Save to Decision Record'}
              </button>
            </Section>

          </div>
        )}

        {/* ════ TAB 3: LETTERS ════ */}
        {activeTab === 3 && (
          <div className="max-w-3xl space-y-5">
            <Section title="Pre-Qualification / Pre-Approval Letter" icon="📄">

              {/* Letter type toggle */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { id:'prequal',     label:'Pre-Qualification Letter',  sub:'Income documented · no AUS required',     ok:true },
                  { id:'preapproval', label:'Pre-Approval Letter',       sub:'Requires AUS Approve/Eligible on file',   ok:ausOnFile },
                ].map(t => (
                  <button key={t.id} onClick={() => { if (t.ok || t.id==='preapproval') setLetterType(t.id); }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${letterType===t.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <p className={`text-sm font-bold ${letterType===t.id ? 'text-indigo-700' : 'text-slate-700'}`}>{t.label}</p>
                    <p className={`text-xs mt-0.5 ${letterType===t.id ? 'text-indigo-500' : 'text-slate-400'}`}>{t.sub}</p>
                  </button>
                ))}
              </div>

              {/* Pre-Approval AUS gate */}
              {letterType === 'preapproval' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                  <p className="text-xs font-bold text-amber-800 mb-3">AUS finding required for Pre-Approval letter</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[
                      { val:false, label:'No AUS on file', sub:'Run M10 AUS Rescue first' },
                      { val:true,  label:'AUS on file',    sub:'Approve/Eligible confirmed' },
                    ].map(opt => (
                      <button key={String(opt.val)} onClick={() => setAusOnFile(opt.val)}
                        className={`p-2.5 rounded-lg border-2 text-left transition-all ${ausOnFile===opt.val ? opt.val ? 'border-emerald-500 bg-emerald-50' : 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}>
                        <p className={`text-xs font-bold ${ausOnFile===opt.val ? opt.val ? 'text-emerald-700' : 'text-red-700' : 'text-slate-600'}`}>{opt.label}</p>
                        <p className={`text-xs ${ausOnFile===opt.val ? opt.val ? 'text-emerald-600' : 'text-red-600' : 'text-slate-400'}`}>{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                  {ausOnFile && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">AUS System</label>
                        <select value={ausSystem} onChange={e=>setAusSystem(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                          <option value="DU">Desktop Underwriter (DU) — Fannie Mae</option>
                          <option value="LPA">Loan Product Advisor (LPA) — Freddie Mac</option>
                          <option value="GUS">GUS — USDA Rural Development</option>
                          <option value="VA">VA — LAPP / SAR / ACE</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Finding / Recommendation</label>
                        <select value={ausFinding} onChange={e=>setAusFinding(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                          <option>Approve/Eligible</option>
                          <option>Accept (Freddie Mac LPA)</option>
                          <option>Refer/Eligible — manual UW</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Letter fields — two-column grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Expiration</label>
                  <select value={letterExpiry} onChange={e=>setLetterExpiry(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                    <option value="120">120 days</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Subject Property Address <span className="font-normal text-slate-400">(leave blank for open letter valid for any property)</span></label>
                  <input type="text" value={letterProperty} onChange={e=>setLetterProperty(e.target.value)}
                    placeholder="123 Main St, Atlanta, GA 30301 — or leave blank"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs" />
                </div>
              </div>

              {/* LO signature block */}
              <div className="border border-slate-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Loan Officer Signature Block</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label:'LO Name',        val:letterLoName,      set:setLetterLoName,      ph:'Full name as licensed' },
                    { label:'LO NMLS #',      val:letterLoNmls,      set:setLetterLoNmls,      ph:'e.g. 1175947' },
                    { label:'Company Name',   val:letterCompany,     set:setLetterCompany,     ph:'Clearview Lending Solutions' },
                    { label:'Company NMLS #', val:letterCompanyNmls, set:setLetterCompanyNmls, ph:'e.g. 2647763' },
                    { label:'Phone',          val:letterPhone,       set:setLetterPhone,       ph:'(xxx) xxx-xxxx' },
                    { label:'Email',          val:letterEmail,       set:setLetterEmail,       ph:'lo@company.com' },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                      <input type="text" value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance notice */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4 space-y-1">
                <p className="text-xs font-bold text-slate-600">Compliance checklist — auto-included in every letter:</p>
                {[
                  'Not a commitment to lend — stated clearly',
                  '"Subject to" conditions: appraisal, title, income/asset verification, final UW',
                  'Equal Housing Lender / Equal Housing Opportunity statement',
                  'NMLS disclosure with nmlsconsumeraccess.org reference',
                  'ECOA notice — no discriminatory language',
                  'Expiration date stated explicitly',
                  'No specific interest rate quoted',
                  letterType==='preapproval' ? 'AUS finding referenced ('+ausSystem+' '+ausFinding+')' : 'Stated-income basis disclosure',
                ].map((item,i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-emerald-500 text-xs shrink-0">✓</span>
                    <span className="text-xs text-slate-600">{item}</span>
                  </div>
                ))}
              </div>

              {/* Generate button */}
              {(letterType === 'prequal' || (letterType === 'preapproval' && ausOnFile)) ? (
                <button onClick={generateLetter} disabled={letterGenerating}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {letterGenerating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Generating compliant letter…</span></>
                  ) : (
                    <><span>📄</span><span>Generate {letterType === 'prequal' ? 'Pre-Qualification' : 'Pre-Approval'} Letter</span></>
                  )}
                </button>
              ) : (
                <button disabled className="w-full py-3 bg-slate-100 text-slate-400 text-sm font-bold rounded-xl cursor-not-allowed">
                  Complete AUS section above to generate Pre-Approval Letter
                </button>
              )}

              {/* Error */}
              {letterError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-red-700 font-semibold">{letterError}</p>
                </div>
              )}

              {/* Generated letter output */}
              {generatedLetter && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Generated Letter</p>
                    <div className="flex gap-2">
                      <button onClick={() => {navigator.clipboard.writeText(generatedLetter);}}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 bg-indigo-50 px-3 py-1 rounded-lg transition-colors">
                        📋 Copy
                      </button>
                      <button onClick={() => window.print()}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 bg-white px-3 py-1 rounded-lg transition-colors">
                        🖨 Print
                      </button>
                      <button onClick={() => setGeneratedLetter('')}
                        className="text-xs font-semibold text-slate-400 hover:text-slate-600 border border-slate-200 bg-white px-3 py-1 rounded-lg transition-colors">
                        ✕ Clear
                      </button>
                    </div>
                  </div>
                  <div className="bg-white border-2 border-indigo-100 rounded-xl p-5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-mono text-xs">
                    {generatedLetter}
                  </div>
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-700"><strong>LO Responsibility:</strong> Review this letter before sending. You are responsible for ensuring accuracy of all figures, borrower information, and compliance with applicable state and federal regulations. This letter is generated as a draft only.</p>
                  </div>
                </div>
              )}

            </Section>

          </div>
        )}

      </div>
    </div>
  );
}