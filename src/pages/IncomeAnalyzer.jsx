// src/pages/IncomeAnalyzer.jsx
// LoanBeacons™ — Module 3 | Stage 1: Pre-Structure
// Income Analyzer™ v2.0 — Phase 1 Build
// Three-layer engine: Haiku extraction → Rule Engine → Sonnet defense
// PRD: IncomeAnalyzer_v2_PRD.docx | March 2026

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';

// ─── INCOME METHOD DEFINITIONS ─────────────────────────────────────────────
const INCOME_METHODS = {
  W2: {
    id: 'W2', label: 'W-2 / Salaried', icon: '💼',
    fields: ['base_monthly', 'overtime_monthly', 'bonus_monthly', 'commission_monthly'],
    guidelineRef: 'Fannie Mae B3-3.1-01',
    docs: ['2 years W-2s', '30-day pay stub (YTD)', 'VOE if needed'],
    notes: 'Base salary is stable income. Overtime/bonus requires 2-year history and must not be declining.',
    docTypes: ['PAY_STUB', 'W2'],
    calc: (f) => (parseFloat(f.base_monthly)||0) + (parseFloat(f.overtime_monthly)||0) +
                 (parseFloat(f.bonus_monthly)||0) + (parseFloat(f.commission_monthly)||0),
    riskCheck: (f) => {
      const flags = [];
      if ((parseFloat(f.overtime_monthly)||0) > 0)
        flags.push({ severity: 'MEDIUM', flag: 'OT_HISTORY_REQUIRED', message: 'Overtime income included — confirm 24-month history on file before closing.' });
      if ((parseFloat(f.bonus_monthly)||0) > 0)
        flags.push({ severity: 'MEDIUM', flag: 'BONUS_HISTORY_REQUIRED', message: 'Bonus income included — confirm 24-month history and non-declining trend.' });
      if ((parseFloat(f.commission_monthly)||0) > 0)
        flags.push({ severity: 'MEDIUM', flag: 'COMMISSION_VERIFY', message: 'Commission ≥25% of income triggers 2-year Schedule C treatment per B3-3.1-03.' });
      return flags;
    },
  },
  SELF_EMPLOYED: {
    id: 'SELF_EMPLOYED', label: 'Self-Employed (1099/K-1)', icon: '🏢',
    fields: ['yr1_net_income', 'yr2_net_income', 'addbacks_depreciation', 'addbacks_depletion', 'business_use_of_home'],
    guidelineRef: 'Fannie Mae B3-3.4-01 / B3-3.4-02',
    docs: ['2 years personal tax returns (1040)', '2 years business returns', 'YTD P&L (within 60 days)'],
    notes: 'Qualifying income = 2-year average of (net income + allowable addbacks) ÷ 12. Declining trend >15% is HIGH risk.',
    docTypes: ['TAX_RETURN'],
    calc: (f) => {
      const yr1 = parseFloat(f.yr1_net_income)||0;
      const yr2 = parseFloat(f.yr2_net_income)||0;
      const addbacks = (parseFloat(f.addbacks_depreciation)||0) + (parseFloat(f.addbacks_depletion)||0) + (parseFloat(f.business_use_of_home)||0);
      // Correct: add-backs applied to each year, then averaged ÷ 12 per Fannie Mae B3-3.4-01
      if (yr1 > 0 && yr2 > 0) return ((yr1 + addbacks) + (yr2 + addbacks)) / 2 / 12;
      return (yr1 + addbacks) / 12;
    },
    riskCheck: (f) => {
      const flags = [];
      const yr1 = parseFloat(f.yr1_net_income)||0;
      const yr2 = parseFloat(f.yr2_net_income)||0;
      if (yr1 > 0 && yr2 > 0 && yr2 < yr1 * 0.85)
        flags.push({ severity: 'HIGH', flag: 'DECLINING_SE_INCOME', message: `Self-employment income declining ${Math.round((1 - yr2/yr1)*100)}% year-over-year — underwriter will scrutinize heavily.` });
      if (yr1 === 0 || yr2 === 0)
        flags.push({ severity: 'HIGH', flag: 'MISSING_YEAR', message: 'Both tax years required for self-employment income. Missing year will likely result in denial.' });
      return flags;
    },
  },
  RENTAL: {
    id: 'RENTAL', label: 'Rental Income', icon: '🏠',
    fields: ['gross_rents', 'vacancy_factor_pct', 'mortgage_payment', 'taxes_insurance', 'repairs_maintenance'],
    guidelineRef: 'Fannie Mae B3-3.1-08 / Schedule E',
    docs: ['2 years Schedule E (tax returns)', 'Current signed leases', 'Property management agreement (if applicable)'],
    notes: 'FHA/Fannie: 75% of gross rents (25% vacancy/maintenance factor). Negative rental income counts as debt.',
    docTypes: ['SCHEDULE_E'],
    calc: (f) => {
      const gross = parseFloat(f.gross_rents)||0;
      const vacancy = parseFloat(f.vacancy_factor_pct)||25;
      return gross * (1 - vacancy/100);
    },
    riskCheck: (f) => {
      const flags = [];
      const vacancy = parseFloat(f.vacancy_factor_pct)||25;
      if (vacancy < 25)
        flags.push({ severity: 'MEDIUM', flag: 'AGGRESSIVE_VACANCY', message: `Vacancy factor ${vacancy}% is below the agency standard of 25%. Underwriter may require justification.` });
      const net = (parseFloat(f.gross_rents)||0) * (1 - vacancy/100);
      if (net < 0)
        flags.push({ severity: 'HIGH', flag: 'NEGATIVE_RENTAL', message: 'Negative rental income — must be counted as monthly debt obligation in DTI calculation.' });
      return flags;
    },
  },
  SOCIAL_SECURITY: {
    id: 'SOCIAL_SECURITY', label: 'Social Security / SSI / Disability', icon: '🏛️',
    fields: ['monthly_benefit', 'gross_up_eligible'],
    guidelineRef: 'Fannie Mae B3-3.1-09',
    docs: ['SS Award Letter (current year)', '2 months bank statements showing deposits', 'SSA-1099'],
    notes: 'Non-taxable SS/SSI grossed up ÷ 0.85 = 117.65% per Fannie Mae B3-3.1-09. Verify continuance for 3+ years.',
    docTypes: ['SS_AWARD'],
    calc: (f) => {
      const base = parseFloat(f.monthly_benefit)||0;
      // Fannie Mae B3-3.1-09: divide by 0.85 (117.65% gross-up) for non-taxable income
      return f.gross_up_eligible === 'yes' ? base / 0.85 : base;
    },
    riskCheck: (f) => {
      const flags = [];
      if (f.gross_up_eligible === 'yes')
        flags.push({ severity: 'LOW', flag: 'SS_GROSSUP_APPLIED', message: 'Non-taxable SS income grossed up ÷0.85 per Fannie Mae B3-3.1-09. Document award letter confirms non-taxable status.' });
      return flags;
    },
  },
  PENSION: {
    id: 'PENSION', label: 'Pension / Retirement', icon: '💰',
    fields: ['monthly_amount', 'is_taxable'],
    guidelineRef: 'Fannie Mae B3-3.1-09',
    docs: ['Award/benefit letter', '2 months bank statements', '1099-R if applicable'],
    notes: 'Non-taxable pension grossed up ÷ 0.85. Must document continuance for 3+ years.',
    docTypes: ['PENSION'],
    calc: (f) => {
      const base = parseFloat(f.monthly_amount)||0;
      return f.is_taxable === 'no' ? base / 0.85 : base;
    },
    riskCheck: () => [],
  },
  MILITARY: {
    id: 'MILITARY', label: 'Military / BAH / BAS', icon: '🎖️',
    fields: ['base_pay', 'bah', 'bas', 'other_allotments'],
    guidelineRef: 'VA Lender Handbook Chapter 4',
    docs: ['Leave & Earnings Statement (LES)', 'Orders if PCS pending'],
    notes: 'BAH/BAS are non-taxable — grossed up ÷ 0.85. All documented allotments count as qualifying income.',
    docTypes: ['LES'],
    calc: (f) => {
      const base = parseFloat(f.base_pay)||0;
      const bah = (parseFloat(f.bah)||0) / 0.85;
      const bas = (parseFloat(f.bas)||0) / 0.85;
      const other = parseFloat(f.other_allotments)||0;
      return base + bah + bas + other;
    },
    riskCheck: (f) => {
      const flags = [];
      if (parseFloat(f.bah) > 0 || parseFloat(f.bas) > 0)
        flags.push({ severity: 'LOW', flag: 'BAH_BAS_GROSSUP', message: 'BAH/BAS grossed up ÷0.85 as non-taxable allowances per VA Lender Handbook.' });
      return flags;
    },
  },
  CHILD_SUPPORT: {
    id: 'CHILD_SUPPORT', label: 'Child Support / Alimony', icon: '👨‍👧',
    fields: ['monthly_amount', 'months_remaining'],
    guidelineRef: 'Fannie Mae B3-3.1-09',
    docs: ['Court order or divorce decree', '12 months proof of receipt (bank statements)', 'Payment history'],
    notes: 'Must have 3+ years (36 months) continuance remaining. Verify consistent receipt via 12 months bank statements.',
    docTypes: [],
    calc: (f) => {
      const months = parseFloat(f.months_remaining)||0;
      return months >= 36 ? (parseFloat(f.monthly_amount)||0) : 0;
    },
    riskCheck: (f) => {
      const flags = [];
      const months = parseFloat(f.months_remaining)||0;
      if (months > 0 && months < 36)
        flags.push({ severity: 'HIGH', flag: 'INSUFFICIENT_CONTINUANCE', message: `Child support continuance ${months} months — minimum 36 required. Income excluded from qualifying.` });
      if (months === 0)
        flags.push({ severity: 'HIGH', flag: 'CONTINUANCE_MISSING', message: 'Continuance period not entered. Child support cannot be counted without confirmed 36-month continuance.' });
      return flags;
    },
  },
  ALIMONY_RECEIVED: {
    id: 'ALIMONY_RECEIVED', label: 'Alimony Received', icon: '⚖️',
    fields: ['monthly_amount', 'months_remaining'],
    guidelineRef: 'Fannie Mae B3-3.1-09',
    docs: ['Divorce decree or separation agreement', '12 months bank statements showing deposits', 'Court order'],
    notes: 'Alimony received counts as qualifying income if 3+ years continuance remaining. Must be documented via court order and 12 months receipt history.',
    docTypes: [],
    calc: (f) => {
      const months = parseFloat(f.months_remaining)||0;
      return months >= 36 ? (parseFloat(f.monthly_amount)||0) : 0;
    },
    riskCheck: (f) => {
      const flags = [];
      const months = parseFloat(f.months_remaining)||0;
      if (months > 0 && months < 36)
        flags.push({ severity: 'HIGH', flag: 'ALIMONY_INSUFFICIENT_CONTINUANCE',
          message: `Alimony continuance ${months} months — minimum 36 months required. Income excluded.` });
      if (!f.monthly_amount || parseFloat(f.monthly_amount) === 0)
        flags.push({ severity: 'MEDIUM', flag: 'ALIMONY_AMOUNT_MISSING',
          message: 'Alimony amount not entered. Enter monthly court-ordered amount.' });
      return flags;
    },
  },
  DISABILITY: {
    id: 'DISABILITY', label: 'Long-Term Disability', icon: '🏥',
    fields: ['monthly_benefit', 'gross_up_eligible', 'months_remaining'],
    guidelineRef: 'Fannie Mae B3-3.1-09',
    docs: ['Disability award/benefit letter', '2 months bank statements', 'Documentation of long-term status'],
    notes: 'Non-taxable disability income grossed up ÷ 0.85 (117.65%). Must confirm benefit is long-term (3+ years remaining) and not temporary.',
    docTypes: [],
    calc: (f) => {
      const base = parseFloat(f.monthly_benefit)||0;
      const months = parseFloat(f.months_remaining)||0;
      if (months > 0 && months < 36) return 0;
      return f.gross_up_eligible === 'yes' ? base / 0.85 : base;
    },
    riskCheck: (f) => {
      const flags = [];
      const months = parseFloat(f.months_remaining)||0;
      if (months > 0 && months < 36)
        flags.push({ severity: 'HIGH', flag: 'DISABILITY_CONTINUANCE',
          message: `Disability benefit continuance ${months} months — 36+ months required for qualifying income.` });
      if (f.gross_up_eligible === 'yes')
        flags.push({ severity: 'LOW', flag: 'DISABILITY_GROSSUP',
          message: 'Non-taxable disability grossed up ÷0.85 per B3-3.1-09. Confirm award letter confirms non-taxable status.' });
      return flags;
    },
  },
  VA_BENEFITS: {
    id: 'VA_BENEFITS', label: 'VA Disability Benefits', icon: '🎖️',
    fields: ['monthly_benefit', 'disability_rating'],
    guidelineRef: 'VA Lender Handbook Chapter 4',
    docs: ['VA award letter showing monthly benefit', 'Rating letter showing disability %'],
    notes: 'VA disability compensation is non-taxable — grossed up ÷ 0.85. Permanent and total (P&T) rating = guaranteed continuance. All other ratings require 3+ year continuance.',
    docTypes: [],
    calc: (f) => {
      const base = parseFloat(f.monthly_benefit)||0;
      return base / 0.85; // Always non-taxable
    },
    riskCheck: (f) => {
      const flags = [];
      if (!f.disability_rating)
        flags.push({ severity: 'LOW', flag: 'VA_RATING_MISSING',
          message: 'VA disability rating not entered. P&T rating = guaranteed. Other ratings require continuance documentation.' });
      flags.push({ severity: 'LOW', flag: 'VA_GROSSUP',
          message: 'VA disability compensation grossed up ÷0.85 as non-taxable income per VA Lender Handbook.' });
      return flags;
    },
  },
  SSI: {
    id: 'SSI', label: 'SSI / SSDI Award Income', icon: '🏛️',
    fields: ['ssi_type', 'monthly_benefit', 'months_remaining'],
    guidelineRef: 'Fannie Mae B3-3.1-09',
    docs: ['SSA award letter (current year)', '2 months bank statements showing direct deposit', 'SSA-1099 if applicable'],
    notes: 'SSI is always non-taxable — gross-up ÷ 0.85 = 117.65% always applies. SSDI may be taxable if borrower has other income; verify award letter. Both require 3+ year continuance confirmation.',
    docTypes: [],
    calc: (f) => {
      const base = parseFloat(f.monthly_benefit)||0;
      const months = parseFloat(f.months_remaining)||0;
      if (months > 0 && months < 36) return 0;
      // SSI always non-taxable; SSDI may be taxable but gross-up conservative default
      return base / 0.85;
    },
    riskCheck: (f) => {
      const flags = [];
      const months = parseFloat(f.months_remaining)||0;
      const type = f.ssi_type || 'SSI';

      if (months > 0 && months < 36)
        flags.push({ severity: 'HIGH', flag: 'SSI_CONTINUANCE',
          message: `${type} continuance ${months} months — minimum 36 months required. Income excluded from qualifying.` });
      if (months === 0)
        flags.push({ severity: 'MEDIUM', flag: 'SSI_CONTINUANCE_UNKNOWN',
          message: `${type} continuance not entered. Confirm benefit continues 3+ years from award letter before including in qualifying income.` });
      if (type === 'SSI')
        flags.push({ severity: 'LOW', flag: 'SSI_GROSSUP',
          message: 'SSI is always non-taxable — grossed up ÷0.85 (117.65%) per Fannie Mae B3-3.1-09. Confirm with current SSA award letter.' });
      if (type === 'SSDI')
        flags.push({ severity: 'LOW', flag: 'SSDI_TAXABILITY',
          message: 'SSDI may be taxable if borrower has other income above IRS thresholds. Verify taxability before applying gross-up. When in doubt, do not gross up — conservative approach protects the deal.' });
      if (type === 'SS_RETIREMENT')
        flags.push({ severity: 'LOW', flag: 'SS_RETIREMENT_TAXABILITY',
          message: 'SS retirement income taxability depends on total income. Verify award letter and tax return. Gross-up only applies to non-taxable portion.' });
      return flags;
    },
  },
  INCOME_1099: {
    id: 'INCOME_1099', label: '1099 / Independent Contractor', icon: '📋',
    fields: ['treatment_type', 'yr1_gross_1099', 'yr2_gross_1099', 'yr1_schedule_c_net', 'yr2_schedule_c_net', 'addbacks_depreciation', 'se_tax_deduction_yr1', 'history_months'],
    guidelineRef: 'Fannie Mae B3-3.4-01 / B3-3.1-01',
    docs: ['2 years 1099-NEC or 1099-MISC', '2 years 1040 with Schedule C', 'YTD P&L (within 60 days)', 'Contract/engagement letter (single-payer)'],
    notes: '1099 income has THREE treatments: (1) Schedule C — 2yr avg net + add-backs; (2) Single-payer contractor 2yr+ — 1099 gross ÷ 12; (3) Hybrid W-2+1099 — combine both. Always use Schedule C net, never gross 1099, unless single-payer 2yr+ documented.',
    docTypes: ['NEC_1099', 'TAX_1040_YR1', 'TAX_1040_YR2'],
    calc: (f) => {
      const type = f.treatment_type || 'schedule_c';
      if (type === 'single_payer') {
        const yr1 = parseFloat(f.yr1_gross_1099)||0;
        const yr2 = parseFloat(f.yr2_gross_1099)||0;
        if (yr1 > 0 && yr2 > 0) return ((yr1 + yr2) / 2) / 12;
        return yr1 / 12;
      }
      // Default: Schedule C treatment
      const yr1net = parseFloat(f.yr1_schedule_c_net)||0;
      const yr2net = parseFloat(f.yr2_schedule_c_net)||0;
      const addbacks = (parseFloat(f.addbacks_depreciation)||0) + (parseFloat(f.se_tax_deduction_yr1)||0);
      if (yr1net > 0 && yr2net > 0) return (((yr1net + yr2net) / 2) + addbacks) / 12;
      return (yr1net + addbacks) / 12;
    },
    riskCheck: (f) => {
      const flags = [];
      const months = parseFloat(f.history_months)||0;
      const yr1gross = parseFloat(f.yr1_gross_1099)||0;
      const yr2gross = parseFloat(f.yr2_gross_1099)||0;
      const yr1net = parseFloat(f.yr1_schedule_c_net)||0;
      const yr2net = parseFloat(f.yr2_schedule_c_net)||0;

      if (months > 0 && months < 24)
        flags.push({ severity: 'HIGH', flag: '1099_INSUFFICIENT_HISTORY',
          message: `1099 history ${months} months — 24 months required for agency loans. Income may be excluded entirely.` });
      if (months === 0)
        flags.push({ severity: 'HIGH', flag: '1099_HISTORY_UNKNOWN',
          message: '1099 history not entered. Confirm 24-month history before counting this income.' });
      if (yr1gross > 0 && yr1net > 0 && yr1net < yr1gross * 0.50)
        flags.push({ severity: 'MEDIUM', flag: 'HIGH_EXPENSE_RATIO',
          message: `Business expenses consume ${Math.round((1 - yr1net/yr1gross)*100)}% of gross 1099 income. Qualifying income is significantly lower than gross. Do not use 1099 gross for DTI.` });
      if (yr1net > 0 && yr2net > 0 && yr2net < yr1net * 0.85)
        flags.push({ severity: 'HIGH', flag: '1099_DECLINING_INCOME',
          message: `1099 net income declining ${Math.round((1 - yr2net/yr1net)*100)}% year-over-year. Underwriter will use lower year only per B3-3.4-02.` });
      if (yr1net < 0 || yr2net < 0)
        flags.push({ severity: 'HIGH', flag: '1099_NET_LOSS',
          message: 'Schedule C shows net business loss. Loss must be deducted from total qualifying income — this reduces DTI numerator.' });
      if (f.treatment_type === 'single_payer' && months < 24)
        flags.push({ severity: 'HIGH', flag: 'SINGLE_PAYER_HISTORY',
          message: 'Single-payer 1099 treatment requires 24-month history with same client. Less than 2 years reverts to Schedule C treatment.' });
      if (!f.se_tax_deduction_yr1 || parseFloat(f.se_tax_deduction_yr1) === 0)
        flags.push({ severity: 'LOW', flag: 'SE_TAX_ADDBACK_MISSING',
          message: 'SE tax deduction (50% of self-employment tax) not entered. This is an allowable add-back that increases qualifying income.' });
      return flags;
    },
  },
};

const FIELD_LABELS = {
  base_monthly: 'Base Monthly Salary ($)',
  overtime_monthly: 'Overtime Monthly — 2yr avg ($)',
  bonus_monthly: 'Bonus Monthly — 2yr avg ($)',
  commission_monthly: 'Commission Monthly — 2yr avg ($)',
  yr1_net_income: 'Year 1 Net Income — annual ($)',
  yr2_net_income: 'Year 2 Net Income — annual ($)',
  addbacks_depreciation: 'Depreciation Addback — annual ($)',
  addbacks_depletion: 'Depletion Addback — annual ($)',
  business_use_of_home: 'Business Use of Home Addback — annual ($)',
  gross_rents: 'Gross Monthly Rents ($)',
  vacancy_factor_pct: 'Vacancy Factor % (default 25)',
  mortgage_payment: 'Mortgage Payment — monthly ($)',
  taxes_insurance: 'Taxes + Insurance — monthly ($)',
  repairs_maintenance: 'Repairs / Mgmt — monthly ($)',
  monthly_benefit: 'Monthly Benefit Amount ($)',
  gross_up_eligible: 'Non-taxable? (gross-up eligible)',
  monthly_amount: 'Monthly Amount ($)',
  is_taxable: 'Is this income taxable?',
  base_pay: 'Base Pay — monthly ($)',
  bah: 'BAH — monthly ($)',
  bas: 'BAS — monthly ($)',
  other_allotments: 'Other Allotments — monthly ($)',
  months_remaining: 'Months of Continuance Remaining',
  treatment_type: '1099 Treatment Type',
  monthly_benefit: 'Monthly Benefit Amount ($)',
  disability_rating: 'VA Disability Rating (%)',
  ssi_type: 'Benefit Type',
  months_remaining: 'Months of Continuance Remaining',
  yr1_gross_1099: 'Year 1 Gross 1099 Income ($)',
  yr2_gross_1099: 'Year 2 Gross 1099 Income ($)',
  yr1_schedule_c_net: 'Year 1 Schedule C Net Profit ($)',
  yr2_schedule_c_net: 'Year 2 Schedule C Net Profit ($)',
  se_tax_deduction_yr1: 'SE Tax Deduction Add-back ($, annual)',
  history_months: 'Months of 1099 History',
};

const DOC_TYPE_LABELS = {
  PAY_STUB: 'Pay Stub (30-day)',
  W2_YR1: 'W-2 Year 1 (most recent)',
  W2_YR2: 'W-2 Year 2 (prior year)',
  SS_AWARD: 'SS Award Letter',
  PENSION: 'Pension Letter',
  TAX_1040_YR1: '1040 Year 1 (most recent)',
  TAX_1040_YR2: '1040 Year 2 (prior year)',
  SCHEDULE_E: 'Schedule E',
  LES: 'Leave & Earnings (LES)',
  NEC_1099: '1099-NEC / 1099-MISC',
};

// Multi-doc queue config per income method
// Each entry: { key, label, maxCount, required }
const DOC_QUEUE_CONFIG = {
  W2: [
    { key: 'PAY_STUB',  label: 'Pay Stub(s)',    maxCount: 5, required: true,  hint: 'Weekly=4-5 stubs · Bi-weekly=2-3 · Semi-monthly=2 · Monthly=1 (enough to cover 30 days)' },
    { key: 'W2_YR1',   label: 'W-2 Year 1',     maxCount: 1, required: true,  hint: 'Most recent W-2 (cross-check anchor for YTD run rate)' },
    { key: 'W2_YR2',   label: 'W-2 Year 2',     maxCount: 1, required: false, hint: 'Prior year W-2 — required if claiming OT, bonus, or commission history' },
  ],
  SELF_EMPLOYED: [
    { key: 'TAX_1040_YR1', label: '1040 Year 1', maxCount: 1, required: true,  hint: 'Most recent federal tax return' },
    { key: 'TAX_1040_YR2', label: '1040 Year 2', maxCount: 1, required: true,  hint: 'Prior year federal tax return' },
  ],
  RENTAL: [
    { key: 'TAX_1040_YR1', label: '1040 / Sch E Year 1', maxCount: 1, required: true,  hint: 'Most recent return with Schedule E' },
    { key: 'TAX_1040_YR2', label: '1040 / Sch E Year 2', maxCount: 1, required: false, hint: 'Prior year return with Schedule E' },
  ],
  SOCIAL_SECURITY: [
    { key: 'SS_AWARD', label: 'SS Award Letter', maxCount: 1, required: true, hint: 'Current year award letter' },
  ],
  PENSION: [
    { key: 'PENSION', label: 'Pension Letter', maxCount: 1, required: true, hint: 'Current benefit letter or 1099-R' },
  ],
  MILITARY: [
    { key: 'LES', label: 'Leave & Earnings Statement', maxCount: 1, required: true, hint: 'Most recent LES' },
  ],
  CHILD_SUPPORT: [],
  ALIMONY_RECEIVED: [],
  DISABILITY: [],
  VA_BENEFITS: [],
  SSI: [],
  INCOME_1099: [
    { key: 'NEC_1099',      label: '1099-NEC / 1099-MISC',  maxCount: 2, required: true,  hint: 'Year 1 and Year 2 1099 forms — both years required' },
    { key: 'TAX_1040_YR1',  label: '1040 Year 1 (Sch C)',   maxCount: 1, required: true,  hint: 'Most recent federal return with Schedule C' },
    { key: 'TAX_1040_YR2',  label: '1040 Year 2 (Sch C)',   maxCount: 1, required: true,  hint: 'Prior year return with Schedule C — both years required' },
  ],
};

// Haiku extraction prompts per doc type
const HAIKU_EXTRACT_PROMPTS = {
  PAY_STUB: `You are a mortgage income analyst extracting data from a pay stub for loan qualification.
CRITICAL RULES:
(1) period_gross = SUM of ALL current period earnings — every line including regular, leave/PTO, holiday, differential. Not just regular pay.
(2) ytd_regular = YTD regular pay + YTD leave/PTO + YTD holiday + YTD differentials. All stable recurring pay. Do NOT include overtime or bonus here.
(3) ytd_overtime = YTD overtime total from YTD column only. ytd_bonus = YTD bonus total from YTD column only.
(4) ytd_gross = grand total of ALL YTD earnings.
(5) pay_frequency from period length: 14 days=biweekly, 7=weekly, 15-16=semimonthly, 28-31=monthly.
Return ONLY JSON no markdown:
{"ytd_gross":<all YTD>,"ytd_regular":<YTD regular+leave+holiday+diff not OT/bonus>,"ytd_overtime":<YTD OT only>,"ytd_bonus":<YTD bonus only>,"period_gross":<all current period earnings>,"pay_date":"<YYYY-MM-DD>","pay_period_start":"<YYYY-MM-DD>","pay_period_end":"<YYYY-MM-DD>","pay_frequency":"<weekly|biweekly|semimonthly|monthly>","employer_name":"<n>","job_title":"<t>","hourly_rate":<n>,"hours_per_period":<n>,"deductions":{"employer_loan":0,"child_support_paid":0,"alimony_paid":0,"garnishment":0,"tax_levy":0,"k401_loan":0}}`,
  W2_YR1: `Extract from this W-2. Return ONLY JSON:
{"w2_yr1_wages": <box 1 wages>, "employer_name": "<name>", "tax_year": <year>}`,
  W2_YR2: `Extract from this W-2. Return ONLY JSON:
{"w2_yr2_wages": <box 1 wages>, "employer_name": "<name>", "tax_year": <year>}`,
  SS_AWARD: `Extract from this Social Security award letter. Return ONLY JSON:
{"monthly_benefit": <monthly amount>, "gross_up_eligible": "<yes|no>", "benefit_type": "<SS|SSI|SSDI>"}`,
  PENSION: `Extract from this pension letter. Return ONLY JSON:
{"monthly_amount": <monthly benefit>, "is_taxable": "<yes|no>", "payer": "<name>"}`,
  TAX_1040_YR1: `Extract self-employment income from this tax return (most recent year). Return ONLY JSON:
{"yr1_net_income": <Schedule C net profit line 31>, "addbacks_depreciation": <depreciation>, "addbacks_depletion": <depletion, 0 if none>, "business_use_of_home": <home office deduction, 0 if none>, "tax_year": <year>}`,
  TAX_1040_YR2: `Extract self-employment income from this tax return (prior year). Return ONLY JSON:
{"yr2_net_income": <Schedule C net profit line 31>, "tax_year": <year>}`,
  SCHEDULE_E: `Extract rental income from Schedule E. Return ONLY JSON:
{"gross_rents": <total rents received monthly>, "depreciation": <annual depreciation>}`,
  LES: `Extract income from this Leave and Earnings Statement. Return ONLY JSON:
{"base_pay": <monthly base pay>, "bah": <monthly BAH, 0 if none>, "bas": <monthly BAS, 0 if none>, "other_allotments": <other monthly allotments, 0 if none>}`,
};

const fmt$ = n => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SEVERITY_STYLES = {
  HIGH:   { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500'   },
  MEDIUM: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  LOW:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-400'  },
};

// ─── HAIKU EXTRACTION ──────────────────────────────────────────────────────

async function extractWithHaiku(base64Data, docType) {
  const prompt = HAIKU_EXTRACT_PROMPTS[docType] || 'Extract all income-related fields. Return ONLY valid JSON.';
  try {
    const response = await fetch('/anthropic-api/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const data = await response.json();
    if (data.error) {
      console.error('[Haiku] API error:', data.error);
      return null;
    }
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Keep deductions as object, stringify everything else
    const result = {};
    Object.entries(parsed).forEach(([k, v]) => {
      result[k] = (k === 'deductions' && typeof v === 'object') ? v : String(v ?? '');
    });
    return result;
  } catch (e) {
    console.error('[Haiku] Extraction error:', e);
    return null;
  }
}

// ─── SESSION PERSISTENCE ─────────────────────────────────────────────────
const SESSION_COLLECTION = 'incomeAnalysisSessions';

function serializeSources(sources) {
  // Strip docQueue base64/extracted blobs — only keep field values and metadata
  return sources.map(s => ({
    id: s.id,
    method: s.method,
    fields: s.fields,
    calculated: s.calculated,
    docSource: s.docSource,
    borrowerType: s.borrowerType,
    // Save doc filenames (not content) for display
    uploadedDocs: s.docQueue?.filter(d => d.status === 'done').map(d => ({
      docType: d.docType, fileName: d.fileName, status: d.status,
    })) || [],
  }));
}

async function saveSession(scenarioId, data) {
  if (!scenarioId) return;
  try {
    await setDoc(
      doc(db, 'scenarios', scenarioId, SESSION_COLLECTION, 'session'),
      { ...data, savedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) { console.error('Auto-save failed:', e); }
}

async function loadSession(scenarioId) {
  if (!scenarioId) return null;
  try {
    const snap = await getDoc(doc(db, 'scenarios', scenarioId, SESSION_COLLECTION, 'session'));
    return snap.exists() ? snap.data() : null;
  } catch (e) { return null; }
}

// ─── YTD CALCULATION HELPER ───────────────────────────────────────────────
function calcYTDMonthly(ytdGross, payDate) {
  if (!ytdGross || !payDate) return 0;
  try {
    const pd = new Date(payDate);
    const jan1 = new Date(pd.getFullYear(), 0, 1);
    const msElapsed = pd - jan1;
    const monthsElapsed = msElapsed / (1000 * 60 * 60 * 24 * 30.44);
    if (monthsElapsed < 0.5) return 0;
    return parseFloat(ytdGross) / monthsElapsed;
  } catch { return 0; }
}

// ─── DEAL KILLER ENGINE ────────────────────────────────────────────────────
function runDealKillerEngine(incomeSources, coborrowerSources, docQueuesBySourceId) {
  const killers = [];

  const allSources = [...incomeSources, ...coborrowerSources];

  allSources.forEach(source => {
    const method = INCOME_METHODS[source.method];
    const f = source.fields;
    const docQueue = docQueuesBySourceId[source.id] || [];
    const borrowerLabel = source.borrowerType === 'coborrower' ? 'Co-Borrower' : 'Borrower';

    // ── PAY STUB DEAL KILLERS ──────────────────────────────────────────
    const stubs = docQueue.filter(d => d.docType === 'PAY_STUB' && d.status === 'done' && d.extracted);
    if (stubs.length > 0) {
      const latestStub = stubs[stubs.length - 1].extracted;

      // Liabilities from deductions
      const deductions = latestStub.deductions || {};
      if ((parseFloat(deductions.employer_loan)||0) > 0)
        killers.push({ severity: 'HIGH', category: 'HIDDEN DEBT', source: borrowerLabel,
          message: `Employer loan repayment $${parseFloat(deductions.employer_loan).toFixed(2)}/mo found on pay stub — must be counted as monthly debt in DTI calculation.`,
          action: 'Add to liabilities before running DTI. Confirm remaining balance with employer.' });
      if ((parseFloat(deductions.child_support_paid)||0) > 0)
        killers.push({ severity: 'HIGH', category: 'HIDDEN DEBT', source: borrowerLabel,
          message: `Child support paid $${parseFloat(deductions.child_support_paid).toFixed(2)}/mo withheld from paycheck — DTI liability.`,
          action: 'Verify court order. Add full monthly obligation to DTI debt stack.' });
      if ((parseFloat(deductions.alimony_paid)||0) > 0)
        killers.push({ severity: 'HIGH', category: 'HIDDEN DEBT', source: borrowerLabel,
          message: `Alimony payment $${parseFloat(deductions.alimony_paid).toFixed(2)}/mo withheld — DTI liability.`,
          action: 'Verify divorce decree. Add to DTI debt stack. Duration matters — confirm continuance.' });
      if ((parseFloat(deductions.garnishment)||0) > 0)
        killers.push({ severity: 'HIGH', category: 'HIDDEN DEBT — LEGAL FLAG', source: borrowerLabel,
          message: `Wage garnishment $${parseFloat(deductions.garnishment).toFixed(2)}/mo detected on pay stub. Underwriter will demand full explanation.`,
          action: 'Obtain LOE immediately. Identify creditor. Confirm no judgment liens on subject property. This can kill the deal.' });
      if ((parseFloat(deductions.tax_levy)||0) > 0)
        killers.push({ severity: 'HIGH', category: 'IRS/TAX LEVY — DEAL RISK', source: borrowerLabel,
          message: `Tax levy $${parseFloat(deductions.tax_levy).toFixed(2)}/mo on pay stub — IRS or state garnishment in effect.`,
          action: 'STOP. Confirm if IRS payment plan is in place. FHA/VA require IRS compliance letter. Conventional lenders may decline outright.' });
      if ((parseFloat(deductions.k401_loan)||0) > 0)
        killers.push({ severity: 'MEDIUM', category: 'HIDDEN DEBT', source: borrowerLabel,
          message: `401(k) loan repayment $${parseFloat(deductions.k401_loan).toFixed(2)}/mo on pay stub — counts as monthly debt obligation.`,
          action: 'Add to DTI debt stack. Confirm remaining loan balance. Note: this is different from 401k contribution.' });

      // YTD vs W-2 variance check
      const w2Docs = docQueue.filter(d => d.docType === 'W2_YR1' && d.status === 'done' && d.extracted);
      if (w2Docs.length > 0 && latestStub.ytd_gross && latestStub.pay_date) {
        const ytdMonthly = calcYTDMonthly(latestStub.ytd_gross, latestStub.pay_date);
        const w2Monthly = (parseFloat(w2Docs[0].extracted.w2_yr1_wages)||0) / 12;
        if (ytdMonthly > 0 && w2Monthly > 0) {
          const variance = ((ytdMonthly - w2Monthly) / w2Monthly) * 100;
          if (variance < -15)
            killers.push({ severity: 'HIGH', category: 'INCOME DECLINING', source: borrowerLabel,
              message: `YTD run rate $${ytdMonthly.toFixed(2)}/mo is ${Math.abs(variance.toFixed(1))}% BELOW prior W-2 average $${w2Monthly.toFixed(2)}/mo. Underwriter will use lower figure.`,
              action: 'Document reason for income reduction. If permanent, recalculate DTI at lower qualifying income.' });
          else if (variance > 20)
            killers.push({ severity: 'MEDIUM', category: 'INCOME SPIKE — VERIFY', source: borrowerLabel,
              message: `YTD run rate is ${variance.toFixed(1)}% ABOVE W-2 average. Underwriter will ask for explanation of increase.`,
              action: 'Obtain LOE documenting reason for income increase (raise, promotion, new job). New employer = verify 30-day history.' });
        }
      }

      // Hourly vs salaried detection
      if ((parseFloat(latestStub.hours_per_period)||0) > 0 && (parseFloat(latestStub.hours_per_period)||0) < 60)
        killers.push({ severity: 'MEDIUM', category: 'HOURLY INCOME', source: borrowerLabel,
          message: `Pay stub shows ${latestStub.hours_per_period} hours this period — income is hourly/variable, not guaranteed salary.`,
          action: 'Confirm average hours are stable. Underwriter will review 2-year history for consistency. Declining hours = declining income.' });
    }

    // ── INCOME TYPE DEAL KILLERS ───────────────────────────────────────
    if (source.method === 'SELF_EMPLOYED') {
      const yr1 = parseFloat(f.yr1_net_income)||0;
      const yr2 = parseFloat(f.yr2_net_income)||0;
      if (yr1 < 0 || yr2 < 0)
        killers.push({ severity: 'HIGH', category: 'BUSINESS LOSS', source: borrowerLabel,
          message: 'Business net loss detected in tax returns. Business losses must be deducted from total qualifying income.',
          action: 'If total qualifying income drops below qualifying threshold, loan cannot proceed without co-borrower income.' });
      if (yr1 > 0 && yr2 > 0 && yr2 < yr1 * 0.75)
        killers.push({ severity: 'HIGH', category: 'SEVERE INCOME DECLINE', source: borrowerLabel,
          message: `Self-employment income dropped ${Math.round((1-yr2/yr1)*100)}% year-over-year. Fannie Mae B3-3.4-02 requires using the lower year.`,
          action: 'Recalculate using Year 2 only (lower figure). If DTI fails at lower income, deal cannot proceed without restructuring.' });
    }

    if (source.method === 'RENTAL') {
      const net = source.calculated;
      if (net < 0)
        killers.push({ severity: 'HIGH', category: 'NEGATIVE RENTAL', source: borrowerLabel,
          message: `Rental income is negative $${Math.abs(net).toFixed(2)}/mo — this flips to a monthly DEBT obligation in DTI calculation.`,
          action: 'Add negative rental as monthly liability in DTI. This can significantly increase DTI ratio.' });
    }

    if (source.method === 'CHILD_SUPPORT') {
      const months = parseFloat(f.months_remaining)||0;
      if (months > 0 && months < 48)
        killers.push({ severity: 'MEDIUM', category: 'CONTINUANCE RISK', source: borrowerLabel,
          message: `Child support continuance ${months} months. FHA requires 3 years remaining. Many lenders want 4+ years for comfort.`,
          action: 'Confirm exact end date from court order. If <36 months, income must be excluded entirely.' });
    }

    if (source.method === 'SOCIAL_SECURITY') {
      killers.push({ severity: 'LOW', category: 'CONTINUANCE CHECK', source: borrowerLabel,
        message: 'Verify SS/disability award letter confirms benefit is permanent or long-term. Temporary disability has continuance risk.',
        action: 'Obtain current award letter. If benefit has scheduled end date, document continuance ≥3 years.' });
    }

    // 1099 income deal killers
    if (source.method === 'INCOME_1099') {
      const type = f.treatment_type || 'schedule_c';
      const yr1net = parseFloat(f.yr1_schedule_c_net)||0;
      const yr2net = parseFloat(f.yr2_schedule_c_net)||0;
      const yr1gross = parseFloat(f.yr1_gross_1099)||0;

      if (type === 'schedule_c' && yr1gross > 0 && yr1net === 0)
        killers.push({ severity: 'HIGH', category: '1099 — MISSING SCHEDULE C', source: borrowerLabel,
          message: '1099 gross entered but no Schedule C net profit — gross 1099 CANNOT be used as qualifying income.',
          action: 'Pull Schedule C from 1040. Qualifying income = net profit + allowable add-backs, not gross 1099.' });
      if (yr1net < 0)
        killers.push({ severity: 'HIGH', category: '1099 — NET LOSS', source: borrowerLabel,
          message: `Schedule C net loss $${Math.abs(yr1net).toLocaleString()} — this loss must be subtracted from total qualifying income.`,
          action: 'Deduct net loss from combined qualifying income. If total income drops below threshold, deal cannot proceed.' });
      if (type === 'single_payer')
        killers.push({ severity: 'MEDIUM', category: '1099 — EMPLOYEE/CONTRACTOR RISK', source: borrowerLabel,
          message: 'Single-payer 1099 flagged — underwriter will examine whether borrower should be classified as employee.',
          action: 'Obtain engagement letter or contract confirming independent contractor status. Some lenders decline single-payer 1099.' });
    }

    // Commission income check
    if (source.method === 'W2') {
      const base = parseFloat(f.base_monthly)||0;
      const commission = parseFloat(f.commission_monthly)||0;
      const total = base + commission;
      if (total > 0 && commission / total >= 0.25)
        killers.push({ severity: 'HIGH', category: 'COMMISSION THRESHOLD', source: borrowerLabel,
          message: `Commission is ${Math.round(commission/total*100)}% of total income — exceeds 25% threshold. Fannie Mae B3-3.1-03 requires 2-year Schedule C treatment.`,
          action: 'Pull 2 years tax returns. Recalculate using average Schedule C commission, not current pay stub figure.' });
    }
  });

  // ── CROSS-SOURCE DEAL KILLERS ──────────────────────────────────────
  const totalQualifying = [...incomeSources, ...coborrowerSources].reduce((s, src) => s + (src.calculated||0), 0);
  if (totalQualifying === 0 && (incomeSources.length > 0 || coborrowerSources.length > 0))
    killers.push({ severity: 'HIGH', category: 'ZERO QUALIFYING INCOME', source: 'All Sources',
      message: 'Total qualifying income calculated as $0.00. Fields may be incomplete or income sources may all be excluded.',
      action: 'Review each income source. Ensure all required fields are entered.' });

  // Sort: HIGH first, then MEDIUM, then LOW
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return killers.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ─── MERGE DOC RESULTS ─────────────────────────────────────────────────────
function mergeDocResults(method, existingFields, docQueue) {
  const merged = { ...existingFields };
  const byType = {};
  docQueue.filter(d => d.status === 'done' && d.extracted).forEach(d => {
    if (!byType[d.docType]) byType[d.docType] = [];
    byType[d.docType].push(d.extracted);
  });

  // Pay stubs: use YTD ÷ months elapsed method (correct per Fannie Mae B3-3.1-01)
  if (byType['PAY_STUB']?.length > 0) {
    const stubs = byType['PAY_STUB'];
    // Use most recent stub for YTD calculations
    const latestStub = stubs[stubs.length - 1];

    // Base income: YTD regular ÷ months elapsed (most accurate)
    const ytdRegularMonthly = calcYTDMonthly(latestStub.ytd_regular || latestStub.ytd_gross, latestStub.pay_date);
    const ytdTotalMonthly = calcYTDMonthly(latestStub.ytd_gross, latestStub.pay_date);
    if (ytdRegularMonthly > 0) {
      merged.base_monthly = String(Math.round(ytdRegularMonthly * 100) / 100);
    } else if (ytdTotalMonthly > 0) {
      merged.base_monthly = String(Math.round(ytdTotalMonthly * 100) / 100);
    }

    // OT: use YTD overtime ÷ months elapsed — far more accurate than per-period
    const ytdOT = parseFloat(latestStub.ytd_overtime) || 0;
    const ytdBonus = parseFloat(latestStub.ytd_bonus) || 0;
    if (ytdOT > 0) {
      const otMonthly = calcYTDMonthly(ytdOT, latestStub.pay_date);
      if (otMonthly > 0) merged.overtime_monthly = String(Math.round(otMonthly * 100) / 100);
    }
    if (ytdBonus > 0) {
      const bonusMonthly = calcYTDMonthly(ytdBonus, latestStub.pay_date);
      if (bonusMonthly > 0) merged.bonus_monthly = String(Math.round(bonusMonthly * 100) / 100);
    }
  }

  // W-2: use as cross-check anchor; only set base if no pay stub
  if (byType['W2_YR1']?.[0] && !byType['PAY_STUB']) {
    const wages = parseFloat(byType['W2_YR1'][0].w2_yr1_wages) || 0;
    if (wages > 0) merged.base_monthly = String(Math.round(wages / 12 * 100) / 100);
  }

  // 1040 self-employed
  if (byType['TAX_1040_YR1']?.[0]) {
    const e = byType['TAX_1040_YR1'][0];
    if (e.yr1_net_income)        merged.yr1_net_income        = e.yr1_net_income;
    if (e.addbacks_depreciation) merged.addbacks_depreciation = e.addbacks_depreciation;
    if (e.addbacks_depletion)    merged.addbacks_depletion    = e.addbacks_depletion;
    if (e.business_use_of_home)  merged.business_use_of_home  = e.business_use_of_home;
  }
  if (byType['TAX_1040_YR2']?.[0]) {
    const e = byType['TAX_1040_YR2'][0];
    if (e.yr2_net_income) merged.yr2_net_income = e.yr2_net_income;
  }

  // 1099 forms — extract gross by year
  if (byType['NEC_1099']?.length > 0) {
    const sorted = [...byType['NEC_1099']].sort((a,b) => (parseFloat(b.tax_year)||0) - (parseFloat(a.tax_year)||0));
    if (sorted[0]?.gross_1099) merged.yr1_gross_1099 = String(parseFloat(sorted[0].gross_1099)||0);
    if (sorted[1]?.gross_1099) merged.yr2_gross_1099 = String(parseFloat(sorted[1].gross_1099)||0);
  }

  // SS / Pension / LES — direct field copy
  ['SS_AWARD', 'PENSION', 'LES'].forEach(t => {
    if (byType[t]?.[0]) Object.assign(merged, byType[t][0]);
  });

  return merged;
}

// ─── SONNET WORKSHEET NARRATIVE ────────────────────────────────────────────
async function generateWorksheetNarrative(payload) {
  try {
    const response = await fetch('/anthropic-api/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `You are a senior mortgage income underwriter. Review this income analysis and produce a concise, defensible methodology narrative for the worksheet.

Income Data:
${JSON.stringify(payload, null, 2)}

Write a methodology section (3–5 sentences per income source) that:
1. States exactly how each income source was calculated
2. Cites the specific guideline applied
3. Explains any inclusions or exclusions
4. Notes any risk factors the underwriter should review

Then write a 2-sentence overall summary.

Format as plain text with clear section headers. Be precise and professional — this goes to an underwriter.`,
        }],
      }),
    });
    const data = await response.json();
    return data.content?.[0]?.text || '';
  } catch (e) {
    console.error('Sonnet narrative error:', e);
    return '';
  }
}

// ─── RISK FLAG ENGINE ──────────────────────────────────────────────────────
function generateAllRiskFlags(incomeSources, coborrowerSources) {
  const flags = [];
  [...incomeSources, ...coborrowerSources].forEach(source => {
    const method = INCOME_METHODS[source.method];
    if (!method) return;
    const sourceFlags = method.riskCheck(source.fields);
    sourceFlags.forEach(f => flags.push({ ...f, sourceLabel: method.label, borrowerType: source.borrowerType }));
    const MANUAL_OK_TYPES = ['CHILD_SUPPORT','ALIMONY_RECEIVED','DISABILITY','VA_BENEFITS','SSI'];
    if (source.docSource === 'manual' && !MANUAL_OK_TYPES.includes(source.method))
      flags.push({ severity: 'LOW', flag: 'MANUAL_ENTRY', message: `${method.label} — entered manually without document upload. Upload supporting document before submission.`, sourceLabel: method.label });
  });
  return flags;
}

// ─── WORKSHEET RENDERER ────────────────────────────────────────────────────
function WorksheetView({ scenario, incomeSources, coborrowerSources, riskFlags, dealKillers, narrative, totalQualifying, totalBorrower, totalCoborrower }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : 'Borrower';
  const coName = scenario ? `${scenario.coBorrowerFirstName||''} ${scenario.coBorrowerLastName||''}`.trim() : '';

  const WS_BORDER = { borderBottom: '1px solid #e2e8f0' };
  const WS_HEADER = 'text-xs font-black text-slate-500 uppercase tracking-widest';

  // Build calculation detail per source for underwriter
  const buildCalcDetail = (source) => {
    const m = INCOME_METHODS[source.method];
    const f = source.fields;
    if (!m) return [];
    const rows = [];

    if (source.method === 'W2') {
      if (parseFloat(f.base_monthly)||0) rows.push({ label: 'Base Monthly Salary (YTD ÷ months elapsed)', value: parseFloat(f.base_monthly)||0, bold: false });
      if (parseFloat(f.overtime_monthly)||0) rows.push({ label: 'Overtime Monthly — 2yr YTD average', value: parseFloat(f.overtime_monthly)||0, bold: false });
      if (parseFloat(f.bonus_monthly)||0) rows.push({ label: 'Bonus Monthly — 2yr YTD average', value: parseFloat(f.bonus_monthly)||0, bold: false });
      if (parseFloat(f.commission_monthly)||0) rows.push({ label: 'Commission Monthly — 2yr average', value: parseFloat(f.commission_monthly)||0, bold: false });
    } else if (source.method === 'SELF_EMPLOYED') {
      const yr1 = parseFloat(f.yr1_net_income)||0;
      const yr2 = parseFloat(f.yr2_net_income)||0;
      const addbacks = (parseFloat(f.addbacks_depreciation)||0)+(parseFloat(f.addbacks_depletion)||0)+(parseFloat(f.business_use_of_home)||0);
      if (yr1) rows.push({ label: 'Year 1 Net Profit (Schedule C)', value: yr1, bold: false });
      if (addbacks) rows.push({ label: 'Add-backs (depreciation, depletion, home office)', value: addbacks, bold: false, prefix: '+' });
      if (yr1) rows.push({ label: 'Year 1 Adjusted Income', value: yr1 + addbacks, bold: false, underline: true });
      if (yr2) rows.push({ label: 'Year 2 Net Profit (Schedule C)', value: yr2, bold: false });
      if (yr2) rows.push({ label: 'Year 2 Adjusted Income', value: yr2 + addbacks, bold: false, underline: true });
      if (yr1 && yr2) rows.push({ label: '2-Year Average Annual ÷ 12 = Qualifying Monthly', value: source.calculated, bold: true });
    } else if (source.method === 'RENTAL') {
      const gross = parseFloat(f.gross_rents)||0;
      const vac = parseFloat(f.vacancy_factor_pct)||25;
      rows.push({ label: `Gross Monthly Rents`, value: gross, bold: false });
      rows.push({ label: `Vacancy/Maintenance Factor (${vac}%) — Agency Standard`, value: -(gross * vac/100), bold: false, prefix: '−' });
    } else if (source.method === 'SOCIAL_SECURITY' || source.method === 'SSI') {
      const base = parseFloat(f.monthly_benefit)||0;
      const isGrossUp = f.gross_up_eligible === 'yes' || source.method === 'SSI';
      rows.push({ label: 'Monthly Benefit (from Award Letter)', value: base, bold: false });
      if (isGrossUp) rows.push({ label: 'Non-Taxable Gross-Up ÷ 0.85 = 117.65%', value: source.calculated, bold: false, prefix: '=' });
    } else if (source.method === 'PENSION') {
      rows.push({ label: 'Monthly Pension Benefit', value: parseFloat(f.monthly_amount)||0, bold: false });
      if (f.is_taxable === 'no') rows.push({ label: 'Non-Taxable Gross-Up ÷ 0.85', value: source.calculated, bold: false, prefix: '=' });
    } else if (source.method === 'MILITARY') {
      if (parseFloat(f.base_pay)||0) rows.push({ label: 'Base Pay (Monthly)', value: parseFloat(f.base_pay)||0 });
      if (parseFloat(f.bah)||0) rows.push({ label: 'BAH — Grossed Up ÷ 0.85 (Non-Taxable)', value: (parseFloat(f.bah)||0)/0.85 });
      if (parseFloat(f.bas)||0) rows.push({ label: 'BAS — Grossed Up ÷ 0.85 (Non-Taxable)', value: (parseFloat(f.bas)||0)/0.85 });
    } else if (source.method === 'CHILD_SUPPORT' || source.method === 'ALIMONY_RECEIVED') {
      rows.push({ label: 'Monthly Court-Ordered Amount', value: parseFloat(f.monthly_amount)||0 });
      rows.push({ label: `Continuance Remaining: ${f.months_remaining || 0} months`, value: null });
    } else if (source.method === 'VA_BENEFITS') {
      rows.push({ label: 'VA Monthly Disability Benefit', value: parseFloat(f.monthly_benefit)||0 });
      rows.push({ label: 'Non-Taxable Gross-Up ÷ 0.85', value: source.calculated, prefix: '=' });
    } else if (source.method === 'DISABILITY') {
      const base = parseFloat(f.monthly_benefit)||0;
      rows.push({ label: 'Monthly Disability Benefit', value: base });
      if (f.gross_up_eligible === 'yes') rows.push({ label: 'Non-Taxable Gross-Up ÷ 0.85', value: source.calculated, prefix: '=' });
    }
    return rows;
  };

  const renderSource = (source, idx, borrowerLabel) => {
    const method = INCOME_METHODS[source.method];
    if (!method) return null;
    const calcRows = buildCalcDetail(source);
    const docNames = source.docQueue?.filter(d => d.status === 'done').map(d => d.fileName) || [];

    return (
      <div key={source.id} className="mb-6">
        {/* Source Header */}
        <div className="flex items-start justify-between mb-2 pb-2 border-b-2 border-slate-800">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">{borrowerLabel} — Income Source {idx + 1}</div>
            <div className="text-base font-black text-slate-900">{method.icon} {method.label}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase tracking-wide">Qualifying Monthly</div>
            <div className="text-2xl font-black text-indigo-700">{fmt$(source.calculated)}</div>
          </div>
        </div>

        {/* Guideline & Documents */}
        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          <div><span className="text-slate-400">Guideline: </span><span className="font-semibold text-blue-700">{method.guidelineRef}</span></div>
          <div><span className="text-slate-400">Method: </span><span className="font-semibold text-slate-700">{source.docSource === 'haiku' ? 'AI Extraction (Haiku)' : 'Manual Entry'}</span></div>
          {docNames.length > 0 && <div><span className="text-slate-400">Documents: </span><span className="font-semibold text-slate-700">{docNames.join(', ')}</span></div>}
        </div>

        {/* Calculation Table */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {calcRows.filter(r => r.value !== null).map((r, i) => (
                <tr key={i} className={`border-b border-slate-100 ${r.bold ? 'bg-indigo-50' : ''}`}>
                  <td className={`px-3 py-2 ${r.bold ? 'font-black text-indigo-800' : 'text-slate-600'} ${r.underline ? 'border-b border-slate-300' : ''}`}>
                    {r.label}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${r.bold ? 'font-black text-indigo-800 text-sm' : r.value < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {r.prefix && r.prefix !== '−' ? r.prefix + ' ' : ''}{r.value < 0 ? '− ' + fmt$(Math.abs(r.value)) : fmt$(r.value)}
                  </td>
                </tr>
              ))}
              {calcRows.filter(r => r.value === null).map((r, i) => (
                <tr key={'txt' + i} className="border-b border-slate-100 bg-slate-100">
                  <td colSpan={2} className="px-3 py-1.5 text-slate-500 italic text-xs">{r.label}</td>
                </tr>
              ))}
              <tr className="bg-indigo-700">
                <td className="px-3 py-2.5 font-black text-white text-sm">Qualifying Monthly Income</td>
                <td className="px-3 py-2.5 text-right font-black text-white text-base font-mono">{fmt$(source.calculated)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {source.overrideActive && <p className="text-xs text-amber-600 font-bold mt-1">⚠ Override Active — LO manually adjusted calculation</p>}
      </div>
    );
  };

  const highRiskFlags = riskFlags.filter(f => f.severity === 'HIGH');
  const medRiskFlags = riskFlags.filter(f => f.severity === 'MEDIUM');
  const lowRiskFlags = riskFlags.filter(f => f.severity === 'LOW');

  return (
    <div id="income-worksheet" className="bg-white rounded-2xl border-2 border-slate-800 shadow-2xl overflow-hidden">

      {/* ── WORKSHEET HEADER ── */}
      <div className="bg-slate-900 px-6 py-5 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1">LoanBeacons™ — Income Calculation Worksheet</div>
            <div className="text-xl font-black text-white">{borrowerName}{coName ? ` & ${coName}` : ''}</div>
            <div className="text-indigo-200 text-sm mt-0.5">
              {scenario?.loanType || 'Loan Type TBD'} ·
              Loan Amount: {scenario?.loanAmount ? '$' + Number(scenario.loanAmount).toLocaleString() : 'TBD'} ·
              Scenario: {scenario?.id?.slice(-8) || '--'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-indigo-300 uppercase tracking-wide">Date Prepared</div>
            <div className="text-sm font-bold text-white">{today}</div>
            <div className="text-xs text-indigo-300 mt-1">LoanBeacons™ v2.0 — Module 03</div>
          </div>
        </div>
        {/* Totals Bar */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-white/10">
          <div><div className="text-xs text-indigo-300 uppercase">Borrower</div><div className="text-lg font-black">{fmt$(totalBorrower)}/mo</div></div>
          {totalCoborrower > 0 && <div><div className="text-xs text-indigo-300 uppercase">Co-Borrower</div><div className="text-lg font-black">{fmt$(totalCoborrower)}/mo</div></div>}
          <div><div className="text-xs text-indigo-300 uppercase">Total Qualifying</div><div className="text-xl font-black text-emerald-300">{fmt$(totalQualifying)}/mo</div></div>
          <div><div className="text-xs text-indigo-300 uppercase">Annual</div><div className="text-lg font-bold">{fmt$(totalQualifying * 12)}</div></div>
        </div>
      </div>

      <div className="p-6 space-y-8">

        {/* ── SECTION 1: INCOME SOURCES ── */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Section 1 — Income Calculation Detail</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          {incomeSources.length > 0 && incomeSources.map((s, i) => renderSource(s, i, '👤 Borrower'))}
          {coborrowerSources.length > 0 && coborrowerSources.map((s, i) => renderSource(s, i, '👥 Co-Borrower'))}
        </div>

        {/* ── SECTION 2: INCOME SUMMARY TABLE ── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Section 2 — Qualifying Income Summary</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <table className="w-full border border-slate-200 rounded-xl overflow-hidden text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-4 py-2.5 text-left font-bold text-xs uppercase tracking-wide">Income Source</th>
                <th className="px-4 py-2.5 text-left font-bold text-xs uppercase tracking-wide">Borrower</th>
                <th className="px-4 py-2.5 text-left font-bold text-xs uppercase tracking-wide">Method / Guideline</th>
                <th className="px-4 py-2.5 text-right font-bold text-xs uppercase tracking-wide">Qualifying Monthly</th>
              </tr>
            </thead>
            <tbody>
              {[...incomeSources.map(s => ({...s, who: 'Borrower'})), ...coborrowerSources.map(s => ({...s, who: 'Co-Borrower'}))].map((s, i) => {
                const m = INCOME_METHODS[s.method];
                return (
                  <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-2 font-semibold text-slate-800">{m?.icon} {m?.label}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{s.who}</td>
                    <td className="px-4 py-2 text-blue-700 text-xs font-mono">{m?.guidelineRef}</td>
                    <td className="px-4 py-2 text-right font-black text-slate-800 font-mono">{fmt$(s.calculated)}</td>
                  </tr>
                );
              })}
              {totalCoborrower > 0 && <tr className="bg-slate-100"><td className="px-4 py-2 text-xs text-slate-500">Borrower Subtotal</td><td colSpan={2} className="px-4 py-2"></td><td className="px-4 py-2 text-right font-bold font-mono">{fmt$(totalBorrower)}</td></tr>}
              {totalCoborrower > 0 && <tr className="bg-slate-100"><td className="px-4 py-2 text-xs text-slate-500">Co-Borrower Subtotal</td><td colSpan={2} className="px-4 py-2"></td><td className="px-4 py-2 text-right font-bold font-mono">{fmt$(totalCoborrower)}</td></tr>}
              <tr className="bg-indigo-700 text-white">
                <td className="px-4 py-3 font-black text-sm" colSpan={3}>TOTAL QUALIFYING MONTHLY INCOME</td>
                <td className="px-4 py-3 text-right font-black text-xl font-mono">{fmt$(totalQualifying)}</td>
              </tr>
              <tr className="bg-indigo-50">
                <td className="px-4 py-2 text-xs text-indigo-700" colSpan={3}>Annual Qualifying Income</td>
                <td className="px-4 py-2 text-right font-bold font-mono text-indigo-700">{fmt$(totalQualifying * 12)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── SECTION 3: RISK FLAGS ── */}
        {riskFlags.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Section 3 — Risk Flags & Underwriter Notes</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="space-y-2">
              {[...highRiskFlags, ...medRiskFlags, ...lowRiskFlags].map((flag, i) => {
                const s = SEVERITY_STYLES[flag.severity];
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${s.bg} ${s.border}`}>
                    <span className={`text-xs font-black px-2 py-0.5 rounded flex-shrink-0 mt-0.5 ${flag.severity === 'HIGH' ? 'bg-red-600 text-white' : flag.severity === 'MEDIUM' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>{flag.severity}</span>
                    <div className="flex-1">
                      <div className={`text-xs font-bold ${s.text} mb-0.5`}>{flag.sourceLabel || flag.source}</div>
                      <div className={`text-xs ${s.text}`}>{flag.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SECTION 4: METHODOLOGY & DEFENSE ── */}
        {narrative && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Section 4 — Methodology & Underwriter Defense</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{narrative}</p>
            </div>
          </div>
        )}

        {/* ── CERTIFICATION FOOTER ── */}
        <div className="border-t-2 border-slate-800 pt-5 mt-6">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold text-slate-700 mb-4">Loan Officer Certification:</p>
              <div className="border-b border-slate-400 mt-8 mb-1"></div>
              <p className="text-xs text-slate-400">LO Signature / Date</p>
              <div className="border-b border-slate-400 mt-6 mb-1"></div>
              <p className="text-xs text-slate-400">NMLS # / Company</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 mb-4">Underwriter Review:</p>
              <div className="border-b border-slate-400 mt-8 mb-1"></div>
              <p className="text-xs text-slate-400">Underwriter Signature / Date</p>
              <div className="border-b border-slate-400 mt-6 mb-1"></div>
              <p className="text-xs text-slate-400">Underwriter ID / Condition</p>
            </div>
          </div>
          <div className="mt-5 text-center">
            <p className="text-xs text-slate-400">Prepared by LoanBeacons™ Income Analyzer™ v2.0 — Module 03 | Patent Pending</p>
            <p className="text-xs text-slate-400">All calculations based on agency guidelines cited above. This worksheet is for underwriting purposes only.</p>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── SOURCE CARD COMPONENT ─────────────────────────────────────────────────
function SourceCard({ source, borrowerType, mode, onUpdate, onRemove, onDocQueueUpdate }) {
  const method = INCOME_METHODS[source.method];
  const queueConfig = DOC_QUEUE_CONFIG[source.method] || [];
  // docQueue: [{ id, docType, fileName, status: 'uploading'|'done'|'error', extracted, error }]
  const [docQueue, setDocQueue] = useState(source.docQueue || []);
  const fileRefs = useRef({});

  if (!method) return null;

  const sourceFlags = method.riskCheck(source.fields);

  const getQueueByType = (type) => docQueue.filter(d => d.docType === type);

  const handleUpload = async (docType, file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') return;
    const queueId = `${docType}_${Date.now()}`;
    const newEntry = { id: queueId, docType, fileName: file.name, status: 'uploading', extracted: null, error: '' };
    const updated = [...docQueue, newEntry];
    setDocQueue(updated);

    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const extracted = await extractWithHaiku(base64, docType);
      const final = updated.map(d => d.id === queueId
        ? { ...d, status: extracted ? 'done' : 'error', extracted, error: extracted ? '' : 'Could not extract — check file quality.' }
        : d
      );
      setDocQueue(final);
      // Merge all extracted docs into source fields
      const merged = mergeDocResults(method, source.fields, final);
      onDocQueueUpdate(borrowerType, source.id, merged, final);
    } catch (e) {
      const final = updated.map(d => d.id === queueId ? { ...d, status: 'error', error: 'Upload failed.' } : d);
      setDocQueue(final);
    }
  };

  const removeDoc = (queueId) => {
    const updated = docQueue.filter(d => d.id !== queueId);
    setDocQueue(updated);
    const merged = mergeDocResults(method, source.fields, updated);
    onDocQueueUpdate(borrowerType, source.id, merged, updated);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{method.icon}</span>
          <div>
            <h3 className="font-bold text-slate-800">{method.label}</h3>
            <span className="text-xs text-blue-600">{method.guidelineRef}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Qualifying Monthly</div>
            {source.calculated === 0 && (parseFloat(source.fields?.monthly_amount || source.fields?.monthly_benefit || 0) > 0) ? (
              <div className="text-xs font-black text-red-500 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                EXCLUDED — $0.00<br/>
                <span className="text-red-400 font-normal">Continuance insufficient</span>
              </div>
            ) : (
              <div className="text-lg font-black text-indigo-600">{fmt$(source.calculated)}</div>
            )}
          </div>
          {source.overrideActive && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold border border-amber-200">Override Active</span>
          )}
          <button onClick={() => onRemove(borrowerType, source.id)} className="text-slate-300 hover:text-red-400 text-xl transition-colors" title="Remove source">✕</button>
        </div>
      </div>

      {/* Multi-Doc Upload Queue */}
      {queueConfig.length > 0 && (
        <div className="mb-4 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-100">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">📄 Document Upload — AI Extracts Fields Automatically</span>
          </div>
          <div className="divide-y divide-slate-100">
            {queueConfig.map(cfg => {
              const uploaded = getQueueByType(cfg.key);
              const canUploadMore = uploaded.length < cfg.maxCount;
              return (
                <div key={cfg.key} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-slate-700">{cfg.label}</span>
                        {cfg.required && <span className="text-xs text-red-400 font-semibold">required</span>}
                        {cfg.maxCount > 1 && <span className="text-xs text-slate-400">up to {cfg.maxCount}</span>}
                      </div>
                      <p className="text-xs text-slate-400">{cfg.hint}</p>
                      {/* Uploaded files for this type */}
                      {uploaded.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {uploaded.map(d => (
                            <div key={d.id} className="flex items-center gap-2">
                              {d.status === 'uploading' && <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                              {d.status === 'done'     && <span className="text-green-500 text-xs flex-shrink-0">✓</span>}
                              {d.status === 'error'   && <span className="text-red-400 text-xs flex-shrink-0">✗</span>}
                              <span className="text-xs text-slate-600 truncate">{d.fileName}</span>
                              {d.status === 'done'   && <span className="text-xs text-green-600 font-semibold flex-shrink-0">Extracted</span>}
                              {d.status === 'error'  && <span className="text-xs text-red-500 flex-shrink-0">{d.error}</span>}
                              <button onClick={() => removeDoc(d.id)}
                                className="ml-auto flex-shrink-0 text-xs font-bold bg-red-100 hover:bg-red-200 text-red-600 px-2 py-0.5 rounded-md border border-red-200 transition-colors">
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {canUploadMore && (
                      <div>
                        <button
                          onClick={() => { fileRefs.current[cfg.key]?.click(); }}
                          className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap flex-shrink-0">
                          ⬆ Upload PDF
                        </button>
                        <input
                          type="file" accept=".pdf"
                          ref={el => fileRefs.current[cfg.key] = el}
                          onChange={e => { handleUpload(cfg.key, e.target.files?.[0]); e.target.value = ''; }}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-400">⬇ Fields below auto-fill from uploaded documents. Edit anytime.</p>
          </div>
        </div>
      )}

      {/* Extraction Detail Panel */}
      {(() => {
        const stubs = docQueue.filter(d => d.docType === 'PAY_STUB' && d.status === 'done' && d.extracted);
        const w2s   = docQueue.filter(d => (d.docType === 'W2_YR1' || d.docType === 'W2_YR2') && d.status === 'done' && d.extracted);
        const taxes = docQueue.filter(d => (d.docType === 'TAX_1040_YR1' || d.docType === 'TAX_1040_YR2') && d.status === 'done' && d.extracted);
        if (stubs.length === 0 && w2s.length === 0 && taxes.length === 0) return null;

        // Pay frequency helpers
        const FREQ_PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
        const STUBS_NEEDED = { weekly: 4, biweekly: 2, semimonthly: 2, monthly: 1 };
        const FREQ_LABEL = { weekly: 'Weekly (×52÷12)', biweekly: 'Bi-Weekly (×26÷12)', semimonthly: 'Semi-Monthly (×24÷12)', monthly: 'Monthly' };

        // Detect pay frequency from latest stub
        const latestStub = stubs.length > 0 ? stubs[stubs.length - 1].extracted : null;
        const detectedFreq = latestStub?.pay_frequency?.toLowerCase().replace('-','').replace(' ','') || null;
        const normalizedFreq = detectedFreq === 'biweekly' ? 'biweekly'
          : detectedFreq === 'semimonthly' ? 'semimonthly'
          : detectedFreq === 'weekly' ? 'weekly'
          : detectedFreq === 'monthly' ? 'monthly' : null;
        const periodsPerYear = normalizedFreq ? FREQ_PERIODS[normalizedFreq] : null;
        const stubsNeeded = normalizedFreq ? STUBS_NEEDED[normalizedFreq] : 3;
        const stubsRemaining = Math.max(0, stubsNeeded - stubs.length);

        // Compute correct monthly from pay period gross using frequency
        const periodGross = latestStub ? parseFloat(latestStub.period_gross) || parseFloat(latestStub.base_monthly) || 0 : 0;
        const freqMonthly = periodsPerYear && periodGross > 0
          ? (periodGross * periodsPerYear) / 12 : 0;

        // YTD method — use regular YTD for base, total YTD as cross-check
        const ytdRegularMonthly = latestStub ? calcYTDMonthly(latestStub.ytd_regular || latestStub.ytd_gross, latestStub.pay_date) : 0;
        const ytdTotalMonthly = latestStub ? calcYTDMonthly(latestStub.ytd_gross, latestStub.pay_date) : 0;
        const ytdMonthly = ytdRegularMonthly > 0 ? ytdRegularMonthly : ytdTotalMonthly;

        // OT and bonus from YTD ÷ months (most accurate)
        const ytdOTMonthly = latestStub?.ytd_overtime ? calcYTDMonthly(parseFloat(latestStub.ytd_overtime), latestStub.pay_date) : 0;
        const ytdBonusMonthly = latestStub?.ytd_bonus ? calcYTDMonthly(parseFloat(latestStub.ytd_bonus), latestStub.pay_date) : 0;

        // Choose best qualifying base: prefer YTD, fallback to frequency method
        const qualifyingMonthly = ytdMonthly > 0 ? ytdMonthly : freqMonthly;
        const methodUsed = ytdMonthly > 0 ? 'YTD Method' : periodsPerYear ? 'Frequency Method' : 'Extracted Base';

        // W-2 cross-check
        const w2Yr1Doc = docQueue.find(d => d.docType === 'W2_YR1' && d.status === 'done' && d.extracted);
        const w2Yr2Doc = docQueue.find(d => d.docType === 'W2_YR2' && d.status === 'done' && d.extracted);
        const w2Yr1Monthly = w2Yr1Doc ? (parseFloat(w2Yr1Doc.extracted.w2_yr1_wages)||0) / 12 : 0;
        const w2Yr2Monthly = w2Yr2Doc ? (parseFloat(w2Yr2Doc.extracted.w2_yr2_wages)||0) / 12 : 0;
        const w2Variance = w2Yr1Monthly > 0 && qualifyingMonthly > 0
          ? ((qualifyingMonthly - w2Yr1Monthly) / w2Yr1Monthly * 100) : null;
        const w2YoYChange = w2Yr1Monthly > 0 && w2Yr2Monthly > 0
          ? ((w2Yr1Monthly - w2Yr2Monthly) / w2Yr2Monthly * 100) : null;

        // Deductions
        const deductions = latestStub?.deductions || {};
        const hasDeductions = Object.values(deductions).some(v => parseFloat(v) > 0);

        // Employer from any stub
        const employer = stubs.map(s => s.extracted.employer_name).filter(Boolean)[0] || null;

        return (
          <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-indigo-100 bg-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">🧮 Income Calculation Detail</span>
                {employer
                  ? <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-200">🏢 {employer}</span>
                  : <span className="text-xs text-slate-400">Employer name will appear after extraction</span>
                }
              </div>
              <span className="text-xs text-indigo-500">Fields auto-filled below</span>
            </div>
            <div className="p-4 space-y-4">

              {/* Pay Frequency Banner */}
              {stubs.length > 0 && (
                <div className={`rounded-lg p-3 border ${stubsRemaining > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-700">Pay Frequency:</span>
                        {normalizedFreq
                          ? <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ {FREQ_LABEL[normalizedFreq]} — auto-detected</span>
                          : <span className="text-xs font-bold text-amber-700">⚠ Not detected</span>
                        }
                        {/* Manual override select — always visible */}
                        <select
                          value={normalizedFreq || ''}
                          onChange={e => {
                            // Store manual freq override on the source via a synthetic field update
                            const el = e.target;
                            el.dataset.manualFreq = e.target.value;
                            // Force re-render by updating a dummy field — user can also just enter base_monthly manually
                          }}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:ring-1 focus:ring-indigo-300">
                          <option value="">Select frequency manually</option>
                          <option value="weekly">Weekly (×52÷12)</option>
                          <option value="biweekly">Bi-Weekly (×26÷12)</option>
                          <option value="semimonthly">Semi-Monthly (×24÷12)</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      {normalizedFreq && (
                        <p className="text-xs text-slate-500 mt-1">
                          Monthly = period gross × {periodsPerYear} ÷ 12
                          {freqMonthly > 0 && <span className="font-bold text-slate-700"> = {fmt$(freqMonthly)}/mo</span>}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {stubsRemaining > 0
                        ? <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">{stubs.length}/{stubsNeeded} stubs · Need {stubsRemaining} more</span>
                        : <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">✓ {stubs.length} stub{stubs.length > 1 ? 's' : ''} sufficient</span>
                      }
                    </div>
                  </div>
                  {normalizedFreq === 'biweekly' && (
                    <p className="text-xs text-amber-700 mt-1.5 font-semibold">⚠ Bi-weekly ≠ Semi-monthly. Bi-weekly = 26 periods/yr · Semi-monthly = 24. Wrong formula overstates income ~8%.</p>
                  )}
                  {!normalizedFreq && stubs.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1.5">Tip: Enter Base Monthly Salary manually below using: Period Gross × (26 or 52 or 24) ÷ 12</p>
                  )}
                </div>
              )}

              {/* Pay Stub Table */}
              {stubs.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Pay Stub Detail</div>
                  <table className="w-full text-xs mb-2">
                    <thead>
                      <tr className="border-b border-indigo-100">
                        <th className="text-left py-1 text-slate-500 font-semibold">Document</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">YTD Gross</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Pay Date</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Period Gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stubs.map((d) => (
                        <tr key={d.id} className="border-b border-indigo-50">
                          <td className="py-1.5 text-slate-600 truncate max-w-[110px]">{d.fileName}</td>
                          <td className="py-1.5 text-right font-mono text-slate-700">{d.extracted.ytd_gross ? fmt$(parseFloat(d.extracted.ytd_gross)) : '—'}</td>
                          <td className="py-1.5 text-right text-slate-500">{d.extracted.pay_date || '—'}</td>
                          <td className="py-1.5 text-right font-mono text-slate-700">{d.extracted.period_gross ? fmt$(parseFloat(d.extracted.period_gross)) : fmt$(parseFloat(d.extracted.base_monthly)||0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Qualifying income calculation rows */}
                  <div className="bg-white border border-indigo-200 rounded-lg overflow-hidden">
                    {ytdMonthly > 0 && (
                      <div className={`flex items-center justify-between px-3 py-2 ${methodUsed === 'YTD Method' ? 'bg-indigo-600' : 'bg-slate-50'}`}>
                        <div>
                          <span className={`text-xs font-bold ${methodUsed === 'YTD Method' ? 'text-white' : 'text-slate-600'}`}>YTD Method ← USED &nbsp;</span>
                          <span className={`text-xs ${methodUsed === 'YTD Method' ? 'text-indigo-200' : 'text-slate-400'}`}>YTD ÷ months elapsed · Fannie Mae B3-3.1-01</span>
                        </div>
                        <span className={`font-black font-mono ${methodUsed === 'YTD Method' ? 'text-white' : 'text-slate-700'}`}>{fmt$(ytdMonthly)}/mo</span>
                      </div>
                    )}
                    {freqMonthly > 0 && (
                      <div className={`flex items-center justify-between px-3 py-2 border-t border-indigo-100 ${methodUsed === 'Frequency Method' ? 'bg-indigo-600' : 'bg-slate-50'}`}>
                        <div>
                          <span className={`text-xs font-bold ${methodUsed === 'Frequency Method' ? 'text-white' : 'text-slate-600'}`}>Frequency Method {ytdMonthly > 0 ? '' : '← USED'} &nbsp;</span>
                          <span className={`text-xs ${methodUsed === 'Frequency Method' ? 'text-indigo-200' : 'text-slate-400'}`}>Period × {periodsPerYear} ÷ 12</span>
                        </div>
                        <span className={`font-black font-mono ${methodUsed === 'Frequency Method' ? 'text-white' : 'text-slate-600'}`}>{fmt$(freqMonthly)}/mo</span>
                      </div>
                    )}
                    {/* W-2 cross-check */}
                    {w2Yr1Monthly > 0 && (
                      <div className={`flex items-center justify-between px-3 py-2 border-t border-indigo-100 ${w2Variance !== null && Math.abs(w2Variance) > 15 ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <div>
                          <span className="text-xs font-bold text-slate-600">W-2 Yr1 Cross-Check &nbsp;</span>
                          <span className="text-xs text-slate-400">Box 1 ÷ 12</span>
                          {w2Variance !== null && (
                            <span className={`ml-2 text-xs font-bold ${Math.abs(w2Variance) > 15 ? 'text-red-600' : w2Variance > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                              {w2Variance > 0 ? '+' : ''}{w2Variance.toFixed(1)}% vs YTD {Math.abs(w2Variance) > 15 ? '⚠ VARIANCE FLAG' : '✓'}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-slate-600 text-xs">{fmt$(w2Yr1Monthly)}/mo</span>
                      </div>
                    )}
                    {w2Yr2Monthly > 0 && (
                      <div className={`flex items-center justify-between px-3 py-2 border-t border-indigo-100 ${w2YoYChange !== null && w2YoYChange < -10 ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <div>
                          <span className="text-xs font-bold text-slate-600">W-2 Yr2 Cross-Check &nbsp;</span>
                          <span className="text-xs text-slate-400">Prior year trend</span>
                          {w2YoYChange !== null && (
                            <span className={`ml-2 text-xs font-bold ${w2YoYChange < -10 ? 'text-red-600' : w2YoYChange > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                              Yr1 vs Yr2: {w2YoYChange > 0 ? '+' : ''}{w2YoYChange.toFixed(1)}% {w2YoYChange < -10 ? '⚠ DECLINING TREND' : '✓ Stable'}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-slate-600 text-xs">{fmt$(w2Yr2Monthly)}/mo</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* W-2 only (no stubs) */}
              {stubs.length === 0 && w2s.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">W-2 History (No Pay Stubs Uploaded)</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-indigo-100">
                        <th className="text-left py-1 text-slate-500 font-semibold">Document</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Year</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Box 1 Wages</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Monthly (÷12)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w2s.map(d => {
                        const wages = parseFloat(d.extracted.w2_yr1_wages || d.extracted.w2_yr2_wages) || 0;
                        return (
                          <tr key={d.id} className="border-b border-indigo-50">
                            <td className="py-1.5 text-slate-600 truncate max-w-[140px]">{d.fileName}</td>
                            <td className="py-1.5 text-right text-slate-700">{d.extracted.tax_year || '—'}</td>
                            <td className="py-1.5 text-right text-slate-700 font-mono">{fmt$(wages)}</td>
                            <td className="py-1.5 text-right text-indigo-700 font-bold font-mono">{fmt$(wages / 12)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-amber-600 mt-2">⚠ Upload pay stubs for more accurate YTD qualifying income calculation.</p>
                </div>
              )}

              {/* 1040 Detail */}
              {taxes.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Tax Return Detail — Self-Employment</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-indigo-100">
                        <th className="text-left py-1 text-slate-500 font-semibold">Document</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Net Profit</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">+ Add-backs</th>
                        <th className="text-right py-1 text-slate-500 font-semibold">Adjusted Annual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxes.map(d => {
                        const net  = parseFloat(d.extracted.yr1_net_income || d.extracted.yr2_net_income) || 0;
                        const depr = parseFloat(d.extracted.addbacks_depreciation) || 0;
                        const home = parseFloat(d.extracted.business_use_of_home) || 0;
                        const depl = parseFloat(d.extracted.addbacks_depletion) || 0;
                        const addbacks = depr + home + depl;
                        return (
                          <tr key={d.id} className="border-b border-indigo-50">
                            <td className="py-1.5 text-slate-600 truncate max-w-[120px]">{d.fileName}</td>
                            <td className={`py-1.5 text-right font-mono ${net < 0 ? 'text-red-600 font-bold' : 'text-slate-700'}`}>{fmt$(net)}</td>
                            <td className="py-1.5 text-right text-green-600 font-mono">+{fmt$(addbacks)}</td>
                            <td className={`py-1.5 text-right font-bold font-mono ${net + addbacks < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt$(net + addbacks)}</td>
                          </tr>
                        );
                      })}
                      {taxes.length === 2 && (() => {
                        const totals = taxes.map(d => {
                          const net = parseFloat(d.extracted.yr1_net_income || d.extracted.yr2_net_income)||0;
                          const addbacks = (parseFloat(d.extracted.addbacks_depreciation)||0) + (parseFloat(d.extracted.business_use_of_home)||0) + (parseFloat(d.extracted.addbacks_depletion)||0);
                          return net + addbacks;
                        });
                        const yr1 = totals[0], yr2 = totals[1];
                        const trend = yr2 > 0 ? ((yr1 - yr2) / Math.abs(yr2) * 100) : null;
                        const avgAnnual = (yr1 + yr2) / 2;
                        const avgMonthly = avgAnnual / 12;
                        return (
                          <>
                            {trend !== null && (
                              <tr className={trend < -15 ? 'bg-red-50' : trend > 0 ? 'bg-green-50' : 'bg-slate-50'}>
                                <td colSpan={3} className="py-1.5 text-xs font-bold">
                                  Year-over-year trend:
                                  <span className={`ml-1 ${trend < -15 ? 'text-red-600' : trend > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                                    {trend > 0 ? '+' : ''}{trend.toFixed(1)}% {trend < -15 ? '⚠ DECLINING — USE LOWER YEAR' : trend < 0 ? '⚠ Slight decline' : '✓ Stable/growing'}
                                  </span>
                                </td>
                                <td className="py-1.5"></td>
                              </tr>
                            )}
                            <tr className="bg-indigo-100/60 font-bold">
                              <td className="py-2 text-indigo-700">2-Year Avg ÷ 12 = Qualifying</td>
                              <td className="py-2 text-right text-indigo-500 text-xs font-normal" colSpan={2}>B3-3.4-01</td>
                              <td className="py-2 text-right text-indigo-700 font-mono">{fmt$(avgMonthly)}/mo</td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Deductions / Hidden Debts */}
              {hasDeductions && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">⚠ Payroll Deductions — DTI Liabilities Detected</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {(parseFloat(deductions.employer_loan)||0) > 0 && <tr><td className="py-1 text-red-700">Employer Loan Repayment</td><td className="text-right font-bold text-red-700 font-mono">{fmt$(parseFloat(deductions.employer_loan))}/mo → DTI</td></tr>}
                      {(parseFloat(deductions.child_support_paid)||0) > 0 && <tr><td className="py-1 text-red-700">Child Support Paid (withheld)</td><td className="text-right font-bold text-red-700 font-mono">{fmt$(parseFloat(deductions.child_support_paid))}/mo → DTI</td></tr>}
                      {(parseFloat(deductions.alimony_paid)||0) > 0 && <tr><td className="py-1 text-red-700">Alimony Paid (withheld)</td><td className="text-right font-bold text-red-700 font-mono">{fmt$(parseFloat(deductions.alimony_paid))}/mo → DTI</td></tr>}
                      {(parseFloat(deductions.garnishment)||0) > 0 && <tr><td className="py-1 font-bold text-red-800">⚑ WAGE GARNISHMENT</td><td className="text-right font-bold text-red-800 font-mono">{fmt$(parseFloat(deductions.garnishment))}/mo → DTI + LOE Required</td></tr>}
                      {(parseFloat(deductions.tax_levy)||0) > 0 && <tr><td className="py-1 font-bold text-red-800">⚑ IRS / STATE TAX LEVY</td><td className="text-right font-bold text-red-800 font-mono">{fmt$(parseFloat(deductions.tax_levy))}/mo → DEAL RISK</td></tr>}
                      {(parseFloat(deductions.k401_loan)||0) > 0 && <tr><td className="py-1 text-red-700">401(k) Loan Repayment</td><td className="text-right font-bold text-red-700 font-mono">{fmt$(parseFloat(deductions.k401_loan))}/mo → DTI</td></tr>}
                    </tbody>
                  </table>
                  <p className="text-xs text-red-600 mt-2 font-semibold">↑ These do NOT reduce qualifying income. Add each to the DTI liability stack in QualifyingIntel.</p>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {method.fields.map(field => (
          <div key={field}>
            <label className="block text-xs font-semibold text-slate-400 mb-1">{FIELD_LABELS[field] || field}</label>
            {field === 'ssi_type' ? (
              <select value={source.fields[field] || 'SSI'} onChange={e => onUpdate(borrowerType, source.id, field, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                <option value="SSI">SSI — Supplemental Security Income (always non-taxable)</option>
                <option value="SSDI">SSDI — Social Security Disability Insurance</option>
                <option value="SS_RETIREMENT">SS Retirement Benefits</option>
              </select>
            ) : field === 'treatment_type' ? (
              <select value={source.fields[field] || 'schedule_c'} onChange={e => onUpdate(borrowerType, source.id, field, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                <option value="schedule_c">Schedule C — 2yr net avg (standard)</option>
                <option value="single_payer">Single-Payer Contractor — gross ÷12 (2yr same client)</option>
              </select>
            ) : field === 'gross_up_eligible' || field === 'is_taxable' ? (
              <select value={source.fields[field] || 'no'} onChange={e => onUpdate(borrowerType, source.id, field, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input type="number" value={source.fields[field] || ''} placeholder="0"
                onChange={e => onUpdate(borrowerType, source.id, field, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
            )}
          </div>
        ))}
      </div>

      {/* Calculation Note */}
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">
        <p className="text-xs text-amber-700"><strong>📐 Rule Engine:</strong> {method.notes}</p>
      </div>

      {/* Source Risk Flags */}
      {sourceFlags.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {sourceFlags.map((flag, i) => {
            const s = SEVERITY_STYLES[flag.severity];
            return (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${s.bg} ${s.border} ${s.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${s.dot}`} />
                <span>{flag.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Required Docs */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Required Documentation</p>
        <div className="flex flex-wrap gap-1.5">
          {method.docs.map((d, i) => (
            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">📎 {d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function IncomeAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  const [incomeSources, setIncomeSources] = useState([]);
  const [coborrowerSources, setCoborrowerSources] = useState([]);
  const [notes, setNotes] = useState('');
  const [addingFor, setAddingFor] = useState(null);

  // Mode: 'power' | 'guided' (guided is Phase 1.5)
  const [mode, setMode] = useState('power');
  const [showGuidedToast, setShowGuidedToast] = useState(false);

  // Worksheet state
  const [worksheetVisible, setWorksheetVisible] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [riskFlags, setRiskFlags] = useState([]);
  const [dealKillers, setDealKillers] = useState([]);
  const [docQueuesBySourceId, setDocQueuesBySourceId] = useState({});
  const [worksheetStale, setWorksheetStale] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [lastSaved, setLastSaved] = useState(null);
  const worksheetRef = useRef(null);
  const autoSaveTimer = useRef(null);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => {
        setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }).catch(console.error);
      setLoading(false);
      return;
    }

    // Load scenario + check for saved session simultaneously
    Promise.all([
      getDoc(doc(db, 'scenarios', scenarioId)),
      loadSession(scenarioId),
    ]).then(([snap, session]) => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);

        if (session?.incomeSources?.length > 0 || session?.coborrowerSources?.length > 0) {
          // Restore saved session — re-run calc() on every source to ensure calculated is fresh
          const recalc = (sources) => (sources || []).map(s => {
            const method = INCOME_METHODS[s.method];
            return { ...s, calculated: method ? method.calc(s.fields) : 0 };
          });
          setIncomeSources(recalc(session.incomeSources));
          setCoborrowerSources(recalc(session.coborrowerSources));
          if (session.notes) setNotes(session.notes);
          if (session.savedAt?.toDate) setLastSaved(session.savedAt.toDate());
          setAutoSaveStatus('saved');
        } else {
          // No saved session — use scenario defaults
          if (d.monthlyIncome) {
            setIncomeSources([{ id: Date.now(), method: 'W2', fields: { base_monthly: String(d.monthlyIncome) }, calculated: parseFloat(d.monthlyIncome)||0, docSource: 'auto', borrowerType: 'borrower' }]);
          }
          if (d.coBorrowerIncome && parseFloat(d.coBorrowerIncome) > 0) {
            setCoborrowerSources([{ id: Date.now() + 1, method: 'W2', fields: { base_monthly: String(d.coBorrowerIncome) }, calculated: parseFloat(d.coBorrowerIncome)||0, docSource: 'auto', borrowerType: 'coborrower' }]);
          }
        }
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ─── AUTO-SAVE ────────────────────────────────────────────────────────────
  const triggerAutoSave = (sources, coboSources, currentNotes) => {
    if (!scenarioId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('saving');
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await saveSession(scenarioId, {
          incomeSources: serializeSources(sources),
          coborrowerSources: serializeSources(coboSources),
          notes: currentNotes || '',
          moduleVersion: '2.0',
        });
        setAutoSaveStatus('saved');
        setLastSaved(new Date());
      } catch (e) {
        setAutoSaveStatus('error');
      }
    }, 2000); // 2 second debounce
  };

  const addSource = (borrowerType, methodId) => {
    const newSource = { id: Date.now(), method: methodId, fields: {}, calculated: 0, docSource: 'manual', borrowerType };
    let newBorrower, newCobo;
    if (borrowerType === 'borrower') {
      setIncomeSources(p => { newBorrower = [...p, newSource]; return newBorrower; });
    } else {
      setCoborrowerSources(p => { newCobo = [...p, newSource]; return newCobo; });
    }
    setAddingFor(null);
    setWorksheetStale(true);
    // Trigger auto-save after state settles
    setTimeout(() => {
      setIncomeSources(b => { setCoborrowerSources(c => { triggerAutoSave(b, c, notes); return c; }); return b; });
    }, 100);
  };

  const updateSource = (borrowerType, id, field, val) => {
    const updater = prev => prev.map(s => {
      if (s.id !== id) return s;
      const newFields = { ...s.fields, [field]: val };
      const method = INCOME_METHODS[s.method];
      const calculated = method ? method.calc(newFields) : 0;
      return { ...s, fields: newFields, calculated };
    });
    if (borrowerType === 'borrower') setIncomeSources(updater);
    else setCoborrowerSources(updater);
    setWorksheetStale(true);
    setTimeout(() => {
      setIncomeSources(b => { setCoborrowerSources(c => { triggerAutoSave(b, c, notes); return c; }); return b; });
    }, 100);
  };

  const removeSource = (borrowerType, id) => {
    if (borrowerType === 'borrower') setIncomeSources(p => p.filter(s => s.id !== id));
    else setCoborrowerSources(p => p.filter(s => s.id !== id));
    setWorksheetStale(true);
    setTimeout(() => {
      setIncomeSources(b => { setCoborrowerSources(c => { triggerAutoSave(b, c, notes); return c; }); return b; });
    }, 100);
  };

  const handleDocQueueUpdate = (borrowerType, id, mergedFields, docQueue) => {
    const updater = prev => prev.map(s => {
      if (s.id !== id) return s;
      const method = INCOME_METHODS[s.method];
      const calculated = method ? method.calc(mergedFields) : 0;
      const anyExtracted = docQueue.some(d => d.status === 'done');
      return { ...s, fields: mergedFields, calculated, docSource: anyExtracted ? 'haiku' : 'manual', docQueue };
    });
    if (borrowerType === 'borrower') setIncomeSources(updater);
    else setCoborrowerSources(updater);
    setDocQueuesBySourceId(prev => ({ ...prev, [id]: docQueue }));
    setWorksheetStale(true);
    setTimeout(() => {
      setIncomeSources(b => { setCoborrowerSources(c => { triggerAutoSave(b, c, notes); return c; }); return b; });
    }, 100);
  };

  const totalBorrower = incomeSources.reduce((s, src) => s + (src.calculated||0), 0);
  const totalCoborrower = coborrowerSources.reduce((s, src) => s + (src.calculated||0), 0);
  const totalQualifying = totalBorrower + totalCoborrower;

  const handleAnalyze = async () => {
    setAnalyzing(true);
    const flags = generateAllRiskFlags(incomeSources, coborrowerSources);
    setRiskFlags(flags);
    const killers = runDealKillerEngine(incomeSources, coborrowerSources, docQueuesBySourceId);
    setDealKillers(killers);

    const payload = {
      borrowerName: scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : 'Unknown',
      totalQualifyingMonthly: parseFloat(totalQualifying.toFixed(2)),
      totalBorrowerMonthly: parseFloat(totalBorrower.toFixed(2)),
      totalCoborrowerMonthly: parseFloat(totalCoborrower.toFixed(2)),
      incomeSources: incomeSources.map(s => ({
        method: s.method,
        label: INCOME_METHODS[s.method]?.label,
        monthly: parseFloat(s.calculated.toFixed(2)),
        fields: s.fields,
        guidelineRef: INCOME_METHODS[s.method]?.guidelineRef,
        docSource: s.docSource,
      })),
      coborrowerSources: coborrowerSources.map(s => ({
        method: s.method,
        label: INCOME_METHODS[s.method]?.label,
        monthly: parseFloat(s.calculated.toFixed(2)),
        fields: s.fields,
        guidelineRef: INCOME_METHODS[s.method]?.guidelineRef,
        docSource: s.docSource,
      })),
      riskFlags: flags,
    };

    const narrativeText = await generateWorksheetNarrative(payload);
    setNarrative(narrativeText);
    setWorksheetVisible(true);
    setWorksheetStale(false);
    setAnalyzing(false);
    // Auto-scroll to worksheet
    setTimeout(() => {
      worksheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const sourceDetail = (sources) => sources.map(s => {
        const m = INCOME_METHODS[s.method];
        const docs = s.docQueue?.filter(d => d.status === 'done').map(d => ({
          fileName: d.fileName, docType: d.docType,
          extracted: d.extracted ? Object.fromEntries(
            Object.entries(d.extracted).filter(([k]) => k !== 'deductions')
          ) : null,
        })) || [];
        return {
          method: s.method,
          label: m?.label,
          icon: m?.icon,
          guidelineRef: m?.guidelineRef,
          qualifyingMonthly: parseFloat(s.calculated.toFixed(2)),
          fields: s.fields,
          docSource: s.docSource,
          documentsUploaded: docs,
          riskFlags: m?.riskCheck(s.fields) || [],
          borrowerType: s.borrowerType,
        };
      });

      const writtenId = await reportFindings('INCOME_ANALYZER', {
        moduleVersion: '2.0',
        timestamp: new Date().toISOString(),
        // ── Totals ──
        totalQualifyingMonthly: parseFloat(totalQualifying.toFixed(2)),
        totalBorrowerMonthly: parseFloat(totalBorrower.toFixed(2)),
        totalCoborrowerMonthly: parseFloat(totalCoborrower.toFixed(2)),
        annualQualifyingIncome: parseFloat((totalQualifying * 12).toFixed(2)),
        // ── Full source detail ──
        incomeSources: sourceDetail(incomeSources),
        coborrowerSources: sourceDetail(coborrowerSources),
        // ── All flags ──
        riskFlags,
        dealKillers,
        // ── Narrative ──
        methodology: narrative,
        loNotes: notes,
        // ── DTI liabilities found in documents ──
        dtiLiabilitiesIdentified: (() => {
          const liabilities = [];
          Object.values(docQueuesBySourceId).forEach(queue => {
            queue.forEach(d => {
              if (d.extracted?.deductions) {
                const ded = d.extracted.deductions;
                Object.entries(ded).forEach(([k, v]) => {
                  if (parseFloat(v) > 0) liabilities.push({ type: k, monthlyAmount: parseFloat(v), document: d.fileName });
                });
              }
            });
          });
          return liabilities;
        })(),
        // ── Worksheet snapshot ──
        worksheetGenerated: worksheetVisible && !worksheetStale,
        worksheetTimestamp: worksheetVisible ? new Date().toISOString() : null,
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  const handlePrint = () => {
    const ws = document.getElementById('income-worksheet');
    if (!ws) return;
    const printWin = window.open('', '_blank');
    printWin.document.write(`
      <html><head><title>Income Calculation Worksheet — LoanBeacons™</title>
      <style>
        @media print {
          @page { margin: 0.75in; size: letter portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 16px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        td, th { padding: 5px 8px; font-size: 10px; }
        th { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .font-mono { font-family: 'Courier New', monospace; }
        .font-black, .font-bold { font-weight: 700; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        /* Header */
        .bg-slate-900, [class*="bg-slate-9"] { background-color: #0f172a !important; color: white !important; }
        .bg-indigo-700, [class*="bg-indigo-7"] { background-color: #4338ca !important; color: white !important; }
        .bg-indigo-50 { background-color: #eef2ff !important; }
        .bg-slate-50, .bg-slate-100 { background-color: #f8fafc !important; }
        .text-indigo-700 { color: #4338ca !important; }
        .text-emerald-300 { color: #6ee7b7 !important; }
        .text-white { color: white !important; }
        .text-red-600 { color: #dc2626 !important; }
        .text-amber-600 { color: #d97706 !important; }
        .text-blue-700 { color: #1d4ed8 !important; }
        .border, [class*="border-"] { border: 1px solid #e2e8f0; }
        .rounded-xl, .rounded-lg { border-radius: 6px; }
        .border-b-2 { border-bottom: 2px solid #1e293b; }
        .py-2\.5 { padding-top: 8px; padding-bottom: 8px; }
        .px-4 { padding-left: 12px; padding-right: 12px; }
        .mb-6 { margin-bottom: 16px; }
        .mt-5 { margin-top: 16px; }
        .text-2xl { font-size: 18px; }
        .text-xl { font-size: 15px; }
        .text-base { font-size: 12px; }
        .text-sm { font-size: 11px; }
        .text-xs { font-size: 10px; }
        .grid { display: table; width: 100%; }
        .grid-cols-2 { display: table; }
        .grid-cols-4 { display: table; }
        .flex { display: flex; }
        .items-center { align-items: center; }
        .justify-between { justify-content: space-between; }
        .space-y-8 > * + * { margin-top: 24px; }
        .border-b-slate-400 { border-bottom: 1px solid #94a3b8; }
        h1, h2, h3 { margin: 0; }
        .no-print { display: none !important; }
      </style>
      </head><body>${ws.innerHTML}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 400);
  };

  const handleModeToggle = (newMode) => {
    if (newMode === 'guided') {
      setShowGuidedToast(true);
      setTimeout(() => setShowGuidedToast(false), 3000);
      return;
    }
    setMode(newMode);
  };

  // ── LOADING ──
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );

  // ── SCENARIO SELECTOR ──
  if (!scenarioId) return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <button onClick={() => navigate(-1)} className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2 text-sm">← Back</button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">03</div>
          <div><h1 className="text-2xl font-bold text-gray-900">Income Analyzer™</h1><p className="text-sm text-gray-500">Stage 1 — Pre-Structure</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-800 mb-4">Select a Scenario</h2>
          {scenarios.length === 0 ? <p className="text-gray-400 text-sm">No scenarios found.</p> :
            <div className="space-y-2">
              {scenarios.map(s => (
                <button key={s.id} onClick={() => navigate(`/income-analyzer?scenarioId=${s.id}`)}
                  className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <div className="font-semibold text-gray-800">{s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">${parseFloat(s.loanAmount||0).toLocaleString()} · {s.loanType||'--'}</div>
                </button>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );

  const borrowerName = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() || scenario.borrowerName : null;
  const hasAnySources = incomeSources.length > 0 || coborrowerSources.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      {/* Guided Mode Toast */}
      {showGuidedToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <span>🔜</span> Guided Mode arrives in Phase 1.5 — after first cohort feedback
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4">
        {/* ── MODULE HEADER ── */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-center gap-4 mb-3">
            <button onClick={() => navigate('/income-analyzer')} className="text-indigo-300 hover:text-white text-sm flex items-center gap-1 transition-colors">← All Scenarios</button>
            <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors">↩ Previous Page</button>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 3</span>
              </div>
              <h1 className="text-2xl font-bold">Income Analyzer™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{borrowerName ? `${borrowerName} · ` : ''}W-2 · Self-Employed · Rental · SS · Military · More</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {/* Income Breakdown + Total */}
              <div className="text-right">
                {/* Per-person breakdown */}
                <div className="flex items-center gap-4 mb-2">
                  {totalBorrower > 0 && (
                    <div className="text-right">
                      <div className="text-xs text-indigo-300 uppercase tracking-wide">👤 {borrowerName || 'Borrower'}</div>
                      <div className="text-lg font-bold text-white">{fmt$(totalBorrower)}<span className="text-xs font-normal text-slate-400">/mo</span></div>
                    </div>
                  )}
                  {totalCoborrower > 0 && (
                    <div className="text-right">
                      <div className="text-xs text-indigo-300 uppercase tracking-wide">👥 Co-Borrower</div>
                      <div className="text-lg font-bold text-white">{fmt$(totalCoborrower)}<span className="text-xs font-normal text-slate-400">/mo</span></div>
                    </div>
                  )}
                </div>
                {/* Divider + Total */}
                <div className="border-t border-white/20 pt-2">
                  <div className="text-xs text-emerald-300 uppercase tracking-widest font-bold mb-0.5">Total Qualifying Income</div>
                  <div className="text-3xl font-black text-emerald-300">{fmt$(totalQualifying)}<span className="text-sm font-normal text-slate-400">/mo</span></div>
                  <div className="text-xs text-slate-400">{fmt$(totalQualifying * 12)}/yr</div>
                </div>
              </div>
              {/* Auto-Save Status */}
              {scenarioId && (
                <div className="flex items-center gap-1.5 text-xs">
                  {autoSaveStatus === 'saving' && (
                    <><span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" /><span className="text-indigo-300">Saving…</span></>
                  )}
                  {autoSaveStatus === 'saved' && lastSaved && (
                    <><span className="text-emerald-400">✓</span><span className="text-slate-400">Saved {lastSaved.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></>
                  )}
                  {autoSaveStatus === 'error' && (
                    <><span className="text-red-400">⚠</span><span className="text-red-400">Save failed</span></>
                  )}
                </div>
              )}
              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
                <button onClick={() => handleModeToggle('power')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all ${mode === 'power' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                  ⚡ Power
                </button>
                <button onClick={() => handleModeToggle('guided')}
                  className="text-xs font-bold px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1">
                  🧭 Guided <span className="text-indigo-400 text-xs">1.5</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── DEAL KILLER ALERT PANEL ── */}
        {dealKillers.length > 0 && (
          <div className="mb-5 bg-red-950 border border-red-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-3 bg-red-900 border-b border-red-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚨</span>
                <span className="text-sm font-black text-white uppercase tracking-wide">Deal Risk Alerts</span>
                <span className="bg-red-700 text-red-100 text-xs font-bold px-2 py-0.5 rounded-full">{dealKillers.filter(k=>k.severity==='HIGH').length} HIGH · {dealKillers.filter(k=>k.severity==='MEDIUM').length} MEDIUM</span>
              </div>
              <span className="text-xs text-red-300">These issues can kill this deal if not addressed before submission</span>
            </div>
            <div className="divide-y divide-red-900">
              {dealKillers.map((killer, i) => (
                <div key={i} className={`px-5 py-4 ${killer.severity === 'HIGH' ? 'bg-red-950' : killer.severity === 'MEDIUM' ? 'bg-red-950/80' : 'bg-red-950/60'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black ${
                        killer.severity === 'HIGH' ? 'bg-red-600 text-white' :
                        killer.severity === 'MEDIUM' ? 'bg-amber-500 text-white' :
                        'bg-blue-600 text-white'}`}>{killer.severity}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-red-300 uppercase tracking-wide">{killer.category}</span>
                        <span className="text-xs text-red-400">— {killer.source}</span>
                      </div>
                      <p className="text-sm text-red-100 font-semibold mb-1.5">{killer.message}</p>
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs text-amber-400 font-bold flex-shrink-0">→ Action:</span>
                        <p className="text-xs text-amber-200">{killer.action}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">

            {/* ── BORROWER INCOME ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-indigo-100">
                <div>
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">👤 Borrower Income</h2>
                  {borrowerName && <p className="text-xs text-slate-400 mt-0.5">{borrowerName}</p>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Qualifying</div>
                  <div className="text-base font-black text-indigo-600">{fmt$(totalBorrower)}/mo</div>
                </div>
              </div>
              {incomeSources.map(s => (
                <SourceCard key={s.id} source={s} borrowerType="borrower" mode={mode}
                  onUpdate={updateSource} onRemove={removeSource} onDocQueueUpdate={handleDocQueueUpdate} />
              ))}
              {/* ── QUICK-ADD: AWARD / COURT-ORDERED INCOME ── */}
              <div className="mb-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-emerald-600 flex items-center gap-2">
                  <span className="text-white text-sm">📋</span>
                  <span className="text-xs font-black text-white uppercase tracking-wide">Quick-Add: Award & Court-Ordered Income</span>
                  <span className="text-xs text-emerald-200 ml-1">— No document upload required</span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {[
                    { id: 'CHILD_SUPPORT', icon: '👨‍👧', label: 'Child Support', sub: '36+ mo continuance req.' },
                    { id: 'ALIMONY_RECEIVED', icon: '⚖️', label: 'Alimony Received', sub: '36+ mo continuance req.' },
                    { id: 'SSI', icon: '🏛️', label: 'SSI / SSDI / SS Retirement', sub: 'Grossed up ÷0.85 if non-taxable' },
                    { id: 'DISABILITY', icon: '🏥', label: 'Long-Term Disability', sub: 'Gross-up ÷0.85 if non-taxable' },
                    { id: 'VA_BENEFITS', icon: '🎖️', label: 'VA Disability Benefits', sub: 'Always grossed up ÷0.85' },
                  ].map(item => (
                    <button key={item.id}
                      onClick={() => { setAddingFor(null); addSource('borrower', item.id); }}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 text-left transition-all">
                      <span className="text-base mt-0.5">{item.icon}</span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{item.label}</div>
                        <div className="text-xs text-emerald-600">{item.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {addingFor === 'borrower' ? (
                <div className="bg-white rounded-xl border border-indigo-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-2">Select Income Type</p>
                  <p className="text-xs text-slate-400 mb-3">Document-based income uses AI extraction. Award/court-ordered income can be entered manually.</p>
                  <div className="mb-3">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📄 Document-Based Income</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(INCOME_METHODS).filter(m => !['CHILD_SUPPORT','ALIMONY_RECEIVED','DISABILITY','VA_BENEFITS','SSI','SOCIAL_SECURITY'].includes(m.id)).map(m => (
                        <button key={m.id} onClick={() => addSource('borrower', m.id)}
                          className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-all">
                          <span className="text-lg">{m.icon}</span>
                          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📋 Award / Court-Ordered Income — Manual Entry</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(INCOME_METHODS).filter(m => ['CHILD_SUPPORT','ALIMONY_RECEIVED','DISABILITY','VA_BENEFITS','SSI'].includes(m.id)).map(m => (
                        <button key={m.id} onClick={() => addSource('borrower', m.id)}
                          className="flex items-center gap-2 p-3 rounded-lg border border-green-200 hover:border-green-400 hover:bg-green-50 text-left transition-all bg-green-50/30">
                          <span className="text-lg">{m.icon}</span>
                          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setAddingFor(null)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingFor('borrower')}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                  + Add Borrower Income Source
                </button>
              )}
            </div>

            {/* ── CO-BORROWER INCOME ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-violet-100">
                <div>
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">👥 Co-Borrower Income</h2>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Qualifying</div>
                  <div className="text-base font-black text-violet-600">{fmt$(totalCoborrower)}/mo</div>
                </div>
              </div>
              {coborrowerSources.map(s => (
                <SourceCard key={s.id} source={s} borrowerType="coborrower" mode={mode}
                  onUpdate={updateSource} onRemove={removeSource} onDocQueueUpdate={handleDocQueueUpdate} />
              ))}
              {/* ── QUICK-ADD: CO-BORROWER AWARD / COURT-ORDERED INCOME ── */}
              <div className="mb-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-emerald-600 flex items-center gap-2">
                  <span className="text-white text-sm">📋</span>
                  <span className="text-xs font-black text-white uppercase tracking-wide">Quick-Add: Award & Court-Ordered Income</span>
                  <span className="text-xs text-emerald-200 ml-1">— No document upload required</span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {[
                    { id: 'CHILD_SUPPORT', icon: '👨‍👧', label: 'Child Support', sub: '36+ mo continuance req.' },
                    { id: 'ALIMONY_RECEIVED', icon: '⚖️', label: 'Alimony Received', sub: '36+ mo continuance req.' },
                    { id: 'SSI', icon: '🏛️', label: 'SSI / SSDI / SS Retirement', sub: 'Grossed up ÷0.85 if non-taxable' },
                    { id: 'DISABILITY', icon: '🏥', label: 'Long-Term Disability', sub: 'Gross-up ÷0.85 if non-taxable' },
                    { id: 'VA_BENEFITS', icon: '🎖️', label: 'VA Disability Benefits', sub: 'Always grossed up ÷0.85' },
                  ].map(item => (
                    <button key={item.id}
                      onClick={() => { setAddingFor(null); addSource('coborrower', item.id); }}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 text-left transition-all">
                      <span className="text-base mt-0.5">{item.icon}</span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{item.label}</div>
                        <div className="text-xs text-emerald-600">{item.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {addingFor === 'coborrower' ? (
                <div className="bg-white rounded-xl border border-indigo-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-2">Select Income Type</p>
                  <p className="text-xs text-slate-400 mb-3">Document-based income uses AI extraction. Award/court-ordered income can be entered manually.</p>
                  <div className="mb-3">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📄 Document-Based Income</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(INCOME_METHODS).filter(m => !['CHILD_SUPPORT','ALIMONY_RECEIVED','DISABILITY','VA_BENEFITS','SSI','SOCIAL_SECURITY'].includes(m.id)).map(m => (
                        <button key={m.id} onClick={() => addSource('coborrower', m.id)}
                          className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-all">
                          <span className="text-lg">{m.icon}</span>
                          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📋 Award / Court-Ordered Income — Manual Entry</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(INCOME_METHODS).filter(m => ['CHILD_SUPPORT','ALIMONY_RECEIVED','DISABILITY','VA_BENEFITS','SSI'].includes(m.id)).map(m => (
                        <button key={m.id} onClick={() => addSource('coborrower', m.id)}
                          className="flex items-center gap-2 p-3 rounded-lg border border-green-200 hover:border-green-400 hover:bg-green-50 text-left transition-all bg-green-50/30">
                          <span className="text-lg">{m.icon}</span>
                          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setAddingFor(null)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingFor('coborrower')}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                  + Add Co-Borrower Income Source
                </button>
              )}
            </div>

            {/* ── LO NOTES ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => { setNotes(e.target.value); triggerAutoSave(incomeSources, coborrowerSources, e.target.value); }} rows={3}
                placeholder="Income calculation rationale, unusual income types, addback justifications, underwriter notes…"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {/* ── ANALYZE BUTTON ── */}
            {hasAnySources && (
              <button onClick={handleAnalyze} disabled={analyzing}
                className={`w-full py-4 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 mb-5 shadow-md text-white
                  ${worksheetVisible && !worksheetStale ? 'bg-slate-500 hover:bg-slate-600' :
                    worksheetStale ? 'bg-amber-600 hover:bg-amber-700 animate-pulse' :
                    'bg-indigo-600 hover:bg-indigo-700'} disabled:opacity-60`}>
                {analyzing
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating Worksheet…</>
                  : worksheetStale ? '⚠ Income Changed — Regenerate Worksheet'
                  : worksheetVisible ? '↻ Regenerate Worksheet'
                  : '📋 Analyze & Generate Worksheet'}
              </button>
            )}

            {/* ── WORKSHEET ── */}
            {worksheetVisible && (
              <div className="mb-5">
                {worksheetStale && (
                  <div className="mb-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-amber-500 text-lg">⚠</span>
                    <div className="flex-1">
                      <span className="text-sm font-bold text-amber-800">Worksheet is outdated</span>
                      <span className="text-xs text-amber-600 ml-2">— Income sources have changed since last generation</span>
                    </div>
                    <button onClick={handleAnalyze} disabled={analyzing}
                      className="text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0">
                      Regenerate Now
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">📄 Income Calculation Worksheet</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrint}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-slate-700 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                      🖨️ Print / Save PDF
                    </button>

                  </div>
                </div>
                <div ref={worksheetRef}>
                  <WorksheetView
                    scenario={scenario}
                    incomeSources={incomeSources}
                    coborrowerSources={coborrowerSources}
                    riskFlags={riskFlags}
                    dealKillers={dealKillers}
                    narrative={narrative}
                    totalQualifying={totalQualifying}
                    totalBorrower={totalBorrower}
                    totalCoborrower={totalCoborrower}
                  />
                </div>
              </div>
            )}

            {scenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Income Analyzer™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="space-y-4">
            {/* Income Summary */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">📊 Income Breakdown</h3>
              <div className="space-y-3">
                {/* Borrower */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">👤 {borrowerName || 'Borrower'}</span>
                    <span className="font-black text-indigo-600">{fmt$(totalBorrower)}/mo</span>
                  </div>
                  {totalQualifying > 0 && (
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.min((totalBorrower / totalQualifying) * 100, 100)}%` }} />
                    </div>
                  )}
                </div>
                {/* Co-Borrower — only if present */}
                {totalCoborrower > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700">👥 Co-Borrower</span>
                      <span className="font-black text-violet-600">{fmt$(totalCoborrower)}/mo</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-400 rounded-full transition-all"
                        style={{ width: `${Math.min((totalCoborrower / totalQualifying) * 100, 100)}%` }} />
                    </div>
                  </div>
                )}
                {/* Total */}
                <div className="border-t-2 border-slate-200 pt-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-black text-slate-800">Total Qualifying Income</span>
                    <span className="text-lg font-black text-emerald-600">{fmt$(totalQualifying)}/mo</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>Annual</span>
                    <span className="font-semibold">{fmt$(totalQualifying * 12)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sources Breakdown */}
            {hasAnySources && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Sources Breakdown</h3>
                <div className="space-y-2">
                  {[...incomeSources, ...coborrowerSources].map(s => {
                    const m = INCOME_METHODS[s.method];
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span>{m?.icon}</span>
                          <span>{m?.label}</span>
                          {s.docSource === 'haiku' && <span className="text-green-500" title="Extracted from PDF">✓</span>}
                          {s.overrideActive && <span className="text-amber-500" title="Override active">⚠</span>}
                        </span>
                        <span className={`font-bold ${s.calculated === 0 ? 'text-red-500' : 'text-slate-800'}`}>
                          {s.calculated === 0
                            ? <span className="text-red-500 font-bold text-xs">EXCLUDED — $0.00</span>
                            : fmt$(s.calculated)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Risk Flag Summary */}
            {riskFlags.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">⚑ Risk Flag Summary</h3>
                <div className="space-y-2">
                  {['HIGH', 'MEDIUM', 'LOW'].map(sev => {
                    const count = riskFlags.filter(f => f.severity === sev).length;
                    if (!count) return null;
                    const s = SEVERITY_STYLES[sev];
                    return (
                      <div key={sev} className={`flex items-center justify-between text-xs p-2 rounded-lg ${s.bg} ${s.border} border`}>
                        <span className={`font-bold ${s.text}`}>{sev}</span>
                        <span className={`font-black ${s.text}`}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Deal Killers Summary */}
            {dealKillers.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4">
                <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide mb-3">🚨 Deal Risk Summary</h3>
                <div className="space-y-1.5">
                  {['HIGH', 'MEDIUM', 'LOW'].map(sev => {
                    const count = dealKillers.filter(k => k.severity === sev).length;
                    if (!count) return null;
                    return (
                      <div key={sev} className="flex items-center justify-between text-xs">
                        <span className={`font-bold ${sev === 'HIGH' ? 'text-red-700' : sev === 'MEDIUM' ? 'text-amber-600' : 'text-blue-600'}`}>{sev} RISK</span>
                        <span className={`font-black ${sev === 'HIGH' ? 'text-red-700' : sev === 'MEDIUM' ? 'text-amber-600' : 'text-blue-600'}`}>{count} issue{count > 1 ? 's' : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-red-500 mt-2">Scroll up to see full alerts ↑</p>
              </div>
            )}

            {/* Agency Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Agency Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• Self-employed: 2-year tax return average (B3-3.4-01)</p>
                <p>• Overtime/bonus: 24-month history required (B3-3.1-01)</p>
                <p>• Child support: 36+ months continuance (B3-3.1-09)</p>
                <p>• Non-taxable income: gross-up ÷ 0.85 = 117.65%</p>
                <p>• Rental: 75% of gross rents — FHA/Fannie (B3-3.1-08)</p>
                <p>• Commission: 2-year avg if ≥25% of income (B3-3.1-03)</p>
                <p>• Declining S/E income: HIGH risk flag (B3-3.4-02)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
