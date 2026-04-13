// src/modules/RehabIntelligence.jsx
// LoanBeacons™ — Module 17 | Stage 2: Lender Fit
// Rehab Intelligence™ — Agency renovation · Hard Money · Non-QM · DSCR Fix & Hold

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';
// ─── Cost Ranges ──────────────────────────────────────────────────────────────
const COST_RANGES = {
  ROOF_REPLACEMENT:  { low: 8000,   high: 20000,  label: 'Roof Replacement' },
  FOUNDATION:        { low: 10000,  high: 40000,  label: 'Foundation Repair' },
  ADDITION:          { low: 40000,  high: 120000, label: 'Room Addition' },
  HVAC_REPLACE:      { low: 6000,   high: 15000,  label: 'HVAC Replacement' },
  ELECTRICAL:        { low: 5000,   high: 20000,  label: 'Electrical/Panel Upgrade' },
  PLUMBING:          { low: 4000,   high: 15000,  label: 'Plumbing Overhaul' },
  KITCHEN_REMODEL:   { low: 15000,  high: 60000,  label: 'Kitchen Remodel' },
  BATH_REMODEL:      { low: 8000,   high: 25000,  label: 'Bathroom Remodel' },
  FLOORING:          { low: 5000,   high: 20000,  label: 'Flooring (Whole House)' },
  WINDOWS:           { low: 5000,   high: 20000,  label: 'Window Replacement' },
  EXTERIOR_PAINT:    { low: 3000,   high: 12000,  label: 'Exterior Paint/Siding' },
  LANDSCAPE:         { low: 2000,   high: 10000,  label: 'Landscaping' },
  POOL:              { low: 30000,  high: 80000,  label: 'New Swimming Pool' },
  MOLD_REMEDIATION:  { low: 3000,   high: 15000,  label: 'Mold Remediation' },
};

const WORK_CATEGORIES = [
  { category: 'Structure & Systems', icon: '🏗️', items: [
    { key: 'ROOF_REPLACEMENT', label: 'Roof Replacement',           structural: false },
    { key: 'FOUNDATION',       label: 'Foundation Repair',          structural: true  },
    { key: 'ADDITION',         label: 'Room Addition',              structural: true  },
    { key: 'HVAC_REPLACE',     label: 'HVAC Replacement',           structural: false },
    { key: 'ELECTRICAL',       label: 'Electrical / Panel Upgrade', structural: false },
    { key: 'PLUMBING',         label: 'Plumbing Overhaul',          structural: false },
  ]},
  { category: 'Interior', icon: '🛋️', items: [
    { key: 'KITCHEN_REMODEL',  label: 'Kitchen Remodel',            structural: false },
    { key: 'BATH_REMODEL',     label: 'Bathroom Remodel',           structural: false, perUnit: true },
    { key: 'FLOORING',         label: 'Flooring (Whole House)',     structural: false },
    { key: 'WINDOWS',          label: 'Window Replacement',         structural: false },
  ]},
  { category: 'Exterior & Outdoor', icon: '🌿', items: [
    { key: 'EXTERIOR_PAINT',   label: 'Exterior Paint / Siding',    structural: false },
    { key: 'LANDSCAPE',        label: 'Landscaping',                structural: false },
    { key: 'POOL',             label: 'New Swimming Pool',          structural: false },
  ]},
  { category: 'Environmental', icon: '⚠️', items: [
    { key: 'MOLD_REMEDIATION', label: 'Mold / Environmental Remediation', structural: false },
  ]},
];

// ─── All 9 Rehab Products ─────────────────────────────────────────────────────
const REHAB_PRODUCTS = [
  // ── AGENCY ──
  {
    id: 'FHA_203K_STD', label: 'FHA 203k Standard', icon: '🏛️', color: 'blue',
    lenderType: 'agency', minFICO: 580, minRehab: 5000, maxRehab: null,
    allowsStructural: true, allowsPool: false, vaOnly: false, investmentOK: true, maxLTV: 96.5,
    description: 'Full renovation including structural work. No maximum rehab amount (within loan limits). Requires HUD consultant for projects over $35k.',
    rules: ['Min $5k renovation cost', 'HUD consultant required for scope >$35k', 'No luxury items (pools, outdoor kitchens)', 'Occupancy required within 6 months', '6-month completion deadline'],
    requirements: ['Full appraisal (as-is + ARV)', 'HUD-approved consultant (if >$35k)', 'Licensed contractor + insurance', 'Detailed scope of work', 'Architect/engineer plans if structural'],
  },
  {
    id: 'FHA_203K_LTD', label: 'FHA 203k Limited', icon: '🔑', color: 'cyan',
    lenderType: 'agency', minFICO: 580, minRehab: 1000, maxRehab: 35000,
    allowsStructural: false, allowsPool: false, vaOnly: false, investmentOK: false, maxLTV: 96.5,
    description: 'Streamlined renovation up to $35k. No structural work. No HUD consultant required. Faster and simpler than Standard.',
    rules: ['Max $35,000 renovation cost', 'No structural work of any kind', 'No HUD consultant required', 'Complete within 6 months', 'No luxury items'],
    requirements: ['Appraisal with ARV', 'Licensed contractor + detailed bid', 'Contractor license and insurance', 'Scope of work with line items'],
  },
  {
    id: 'HOMESTYLE', label: 'HomeStyle Renovation (Fannie Mae)', icon: '🏠', color: 'violet',
    lenderType: 'agency', minFICO: 620, minRehab: 1, maxRehab: null,
    allowsStructural: true, allowsPool: true, vaOnly: false, investmentOK: true, maxLTV: 97,
    description: 'Conventional renovation. Up to 75% of AIV. Allows structural, luxury, and investment properties.',
    rules: ['Reno cost cannot exceed 75% of AIV', 'All work completed within 12 months', 'Licensed contractor required', 'Pools and luxury items allowed', 'Investment properties eligible (25% down)'],
    requirements: ['Full appraisal (as-is + AIV)', 'Licensed contractor with insurance', 'Signed renovation agreement', 'Detailed scope + plans if structural', '6-month reserves for investment'],
  },
  {
    id: 'CHOICERENO', label: 'CHOICERenovation (Freddie Mac)', icon: '🏡', color: 'emerald',
    lenderType: 'agency', minFICO: 620, minRehab: 1, maxRehab: null,
    allowsStructural: true, allowsPool: true, vaOnly: false, investmentOK: true, maxLTV: 97,
    description: 'Freddie Mac renovation. Similar to HomeStyle with slight LTV/reserve differences. Resilience improvements get 2% premium.',
    rules: ['Reno cannot exceed 75% of AIV', '12-month completion window', 'Resilience work (storm, flood) gets 2% AIV premium', 'Investment properties allowed', '6-month seasoning for refinances'],
    requirements: ['Full appraisal with AIV', 'Licensed contractor', 'Renovation agreement', 'Scope of work', 'Investment: 12-month reserves'],
  },
  {
    id: 'VA_RENO', label: 'VA Renovation', icon: '🎖️', color: 'red',
    lenderType: 'agency', minFICO: 620, minRehab: 1, maxRehab: 50000,
    allowsStructural: false, allowsPool: false, vaOnly: true, investmentOK: false, maxLTV: 100,
    description: 'VA renovation for eligible veterans. Up to $50k. No luxury. Owner-occupied primary only.',
    rules: ['VA eligibility required', 'Max $50,000 renovation budget', 'No structural work', 'No luxury items or pools', 'Owner-occupied primary only'],
    requirements: ['VA Certificate of Eligibility', 'VA appraisal (as-is + after improved)', 'Licensed contractor', 'Scope of work', 'Veteran eligibility docs'],
  },
  // ── HARD MONEY ──
  {
    id: 'FIX_FLIP_HM', label: 'Fix & Flip (Hard Money)', icon: '🔨', color: 'amber',
    lenderType: 'hardmoney', minFICO: 580, minRehab: 5000, maxRehab: null,
    allowsStructural: true, allowsPool: true, vaOnly: false, investmentOK: true, maxLTV: 70,
    maxLTC: 85, typicalRate: '10–14%', typicalPoints: '2–4',
    termMonths: 12, interestOnly: true,
    description: 'Asset-based short-term financing. Approval driven by ARV and deal quality — not borrower income. 12–18 month term, interest-only. Fastest path to close.',
    rules: ['Max 70% of ARV (after-repair value)', 'Max 85% of total cost (LTC)', 'Interest-only payments during renovation', '12–18 month term — sell or refinance at maturity', 'Scope of work + contractor required', 'Draw schedule with inspections at each phase', 'Exit strategy letter required'],
    requirements: ['As-is + ARV appraisal (lender-ordered)', 'Signed contractor bid with line items', 'GC license + liability insurance', 'Builder\'s risk insurance', '3–6 months interest reserves (bank statements)', 'Exit strategy letter (sell or refi timeline)', 'Proof of down payment / cash to close', 'Prior flip experience list (addresses + outcomes)', 'Entity docs if vesting in LLC', 'Photo walk-through of property'],
    lenderChecklist: [
      { item: 'Purchase contract or property deed', critical: true },
      { item: 'As-is + ARV appraisal (lender orders)', critical: true },
      { item: 'Signed contractor bid with line-item breakdown', critical: true },
      { item: 'General contractor license + liability insurance', critical: true },
      { item: 'Builder\'s risk insurance binder', critical: true },
      { item: '3–6 months interest reserves (bank statements)', critical: true },
      { item: 'Exit strategy letter — signed by borrower', critical: true },
      { item: 'Prior flip experience (addresses, purchase/sale dates, profit)', critical: false },
      { item: 'Entity documents (LLC operating agreement, articles)', critical: false },
      { item: 'Property photos (interior + exterior walk-through)', critical: false },
      { item: 'Draw schedule by renovation phase', critical: false },
      { item: 'Title commitment / preliminary report', critical: true },
    ],
  },
  {
    id: 'BRIDGE_HM', label: 'Bridge Loan (Hard Money)', icon: '🌉', color: 'orange',
    lenderType: 'hardmoney', minFICO: 580, minRehab: 0, maxRehab: null,
    allowsStructural: true, allowsPool: true, vaOnly: false, investmentOK: true, maxLTV: 65,
    maxLTC: 80, typicalRate: '11–15%', typicalPoints: '2–3',
    termMonths: 12, interestOnly: true,
    description: 'Short-term bridge for time-sensitive acquisitions. Close in 5–10 days. Cross-collateralization possible. Light or no renovation required.',
    rules: ['Max 65% of ARV / as-is value', 'Max 80% of purchase price (light reno)', 'Close in 5–10 business days possible', '6–12 month term', 'Cross-collateral with other owned property available', 'Interest only — no prepayment penalty typical'],
    requirements: ['Property value confirmation (BPO or appraisal)', 'Clear exit strategy (refi or sale timeline)', 'Proof of equity / cash to close', '3 months reserves recommended', 'Title commitment', 'Entity docs if LLC', 'Executed purchase contract'],
    lenderChecklist: [
      { item: 'Executed purchase contract', critical: true },
      { item: 'Property BPO or full appraisal', critical: true },
      { item: 'Clear exit strategy with timeline', critical: true },
      { item: 'Proof of cash reserves (3 months minimum)', critical: true },
      { item: 'Title commitment / preliminary report', critical: true },
      { item: 'Entity documents if vesting in LLC/Trust', critical: false },
      { item: 'Cross-collateral property information (if applicable)', critical: false },
      { item: 'Property photos', critical: false },
    ],
  },
  // ── NON-QM ──
  {
    id: 'DSCR_RENO', label: 'DSCR Fix & Hold (Non-QM)', icon: '📈', color: 'teal',
    lenderType: 'nonqm', minFICO: 620, minRehab: 1, maxRehab: null,
    allowsStructural: false, allowsPool: false, vaOnly: false, investmentOK: true, maxLTV: 75,
    typicalRate: '7.5–10%', typicalPoints: '1–3', termMonths: 360, interestOnly: false,
    description: 'Non-QM buy-and-hold. Income qualified on projected rent (DSCR ≥ 1.0) — no tax returns, no employment. Close in LLC. Renovate then rent.',
    rules: ['Min DSCR 1.0–1.25 (market rent / PITIA)', 'No personal income or employment required', 'Renovation cosmetic only (no structural)', '30-year amortization or interest-only options', 'Investment property only', 'LLC vesting allowed (lender-specific)'],
    requirements: ['Appraisal with rental income schedule (Form 1007)', 'DSCR calculation worksheet', 'Scope of work for renovation', '6–12 months post-close reserves', 'LLC operating agreement + articles', 'Rent schedule / executed lease (if tenant in place)', 'Market rent appraisal if vacant'],
    lenderChecklist: [
      { item: 'Full appraisal with 1007 rent schedule', critical: true },
      { item: 'DSCR calculation (rent / PITIA ≥ 1.0)', critical: true },
      { item: 'Scope of work + contractor bid', critical: true },
      { item: '6–12 months post-close reserves', critical: true },
      { item: 'LLC operating agreement + articles of organization', critical: false },
      { item: 'Executed lease (if tenant in place)', critical: false },
      { item: 'Market rent appraisal if vacant', critical: false },
      { item: 'Insurance (landlord policy)', critical: true },
      { item: 'Entity EIN documentation', critical: false },
    ],
  },
  {
    id: 'NONQM_RENO', label: 'Non-QM Renovation (Bank Statement)', icon: '🏦', color: 'purple',
    lenderType: 'nonqm', minFICO: 620, minRehab: 1, maxRehab: null,
    allowsStructural: false, allowsPool: true, vaOnly: false, investmentOK: true, maxLTV: 80,
    typicalRate: '8–11%', typicalPoints: '1–2', termMonths: 360, interestOnly: false,
    description: 'Non-QM renovation with bank statement or asset depletion income. Primary, second home, or investment. No W-2 or tax returns required.',
    rules: ['12 or 24-month bank statement income (no tax returns)', 'Primary, second home, or investment eligible', 'Structural work case-by-case (lender dependent)', '30-year or interest-only options', 'Renovation scope reviewed by lender underwriter'],
    requirements: ['12–24 months personal or business bank statements', 'Business license or CPA letter (business account)', 'Scope of work + contractor license', 'Appraisal with ARV estimate', '6–12 months reserves post-close', 'Signed renovation agreement', 'LLC docs if vesting in entity'],
    lenderChecklist: [
      { item: '12–24 months bank statements (all pages)', critical: true },
      { item: 'Business license or CPA letter (if business account)', critical: true },
      { item: 'Scope of work + signed contractor bid', critical: true },
      { item: 'Full appraisal with ARV', critical: true },
      { item: '6–12 months post-close reserves', critical: true },
      { item: 'Signed renovation agreement', critical: true },
      { item: 'LLC / entity docs if vesting in entity', critical: false },
      { item: 'CPA or tax preparer letter confirming self-employment', critical: false },
    ],
  },
];

// ─── Engine Functions ─────────────────────────────────────────────────────────
function estimateRenovationCosts(selectedItems) {
  let low = 0, high = 0;
  const hasStructural = selectedItems.some(({ key }) =>
    WORK_CATEGORIES.flatMap(c => c.items).find(i => i.key === key)?.structural
  );
  selectedItems.forEach(({ key, quantity = 1 }) => {
    const r = COST_RANGES[key];
    if (r) { low += r.low * quantity; high += r.high * quantity; }
  });
  const mid = Math.round((low + high) / 2);
  const contingencyPct = hasStructural ? 0.20 : 0.10;
  return { subtotalLow: low, subtotalHigh: high, subtotalMid: mid, contingencyPct,
    totalWithContingencyMid: Math.round(mid * (1 + contingencyPct)), hasStructural };
}

function calcARV(form) {
  if (form.arvOverride && parseFloat(form.arvOverride) > 0) return { arv: parseFloat(form.arvOverride), source: 'Appraiser / lender provided' };
  if (form.appraisedAIV && parseFloat(form.appraisedAIV) > 0) return { arv: parseFloat(form.appraisedAIV), source: 'Appraised AIV (agency appraisal)' };
  const base = form.loanPurpose === 'PURCHASE' ? (parseFloat(form.purchasePrice) || 0) : (parseFloat(form.currentValue) || 0);
  return { arv: Math.round(base + (parseFloat(form.rehabCost) || 0) * 1.1), source: 'Estimated (base + 110% rehab)' };
}

function screenProducts(form, hasStructural) {
  const arvData = calcARV(form);
  const arv = arvData.arv;
  const base = form.loanPurpose === 'PURCHASE' ? (parseFloat(form.purchasePrice) || 0) : (parseFloat(form.currentValue) || 0);
  const rehabCost = parseFloat(form.rehabCost) || 0;
  const totalCost = base + rehabCost;
  const fico = parseFloat(form.creditScore) || 0;
  const hasPool = !!(form.rehabItems?.POOL);
  const isInvestment = form.borrowerType === 'INVESTMENT';

  const results = {};
  REHAB_PRODUCTS.forEach(p => {
    const flags = [];
    if (fico > 0 && fico < p.minFICO)           flags.push(`FICO ${fico} below minimum ${p.minFICO}`);
    if (p.minRehab && rehabCost < p.minRehab)   flags.push(`Reno cost below minimum ${fmt0(p.minRehab)}`);
    if (p.maxRehab && rehabCost > p.maxRehab)   flags.push(`Reno cost ${fmt0(rehabCost)} exceeds max ${fmt0(p.maxRehab)}`);
    if (!p.allowsStructural && hasStructural)    flags.push('Structural work not allowed on this product');
    if (!p.allowsPool && hasPool)                flags.push('Pool installation not allowed');
    if (p.vaOnly && !form.isVAEligible)          flags.push('VA eligibility required');
    if (!p.investmentOK && isInvestment)         flags.push('Investment properties not eligible');
    if (p.lenderType === 'agency' && arv > 0 && rehabCost > 0 && (p.id === 'HOMESTYLE' || p.id === 'CHOICERENO') && rehabCost > arv * 0.75)
      flags.push(`Reno ${fmt0(rehabCost)} exceeds 75% of AIV (${fmt0(arv * 0.75)})`);
    if (p.maxLTC && totalCost > 0) {
      const ltc = (totalCost / totalCost) * 100; // always 100% of itself
      const maxLoan = Math.min(arv * (p.maxLTV / 100), totalCost * (p.maxLTC / 100));
      if (maxLoan <= 0 && rehabCost === 0 && p.lenderType === 'hardmoney' && p.minRehab === 0) {
        // bridge with no reno — still eligible
      }
    }
    // DSCR: investment only
    if (p.id === 'DSCR_RENO' && form.borrowerType !== 'INVESTMENT') flags.push('DSCR Fix & Hold is investment property only');

    const maxLoanAmt = p.maxLTC
      ? Math.round(Math.min(arv * (p.maxLTV / 100), totalCost * (p.maxLTC / 100)))
      : Math.round(arv * (p.maxLTV / 100));

    results[p.id] = { eligible: flags.length === 0, flags, product: p, loanCalc: { arv, maxLoanAmt, totalCost, base, rehabCost } };
  });

  return { results, eligibleProducts: REHAB_PRODUCTS.filter(p => results[p.id].eligible).map(p => p.id) };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt0  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n) => isNaN(n) || !isFinite(n) ? '--' : n.toFixed(1) + '%';

// ─── Color Maps ───────────────────────────────────────────────────────────────
const BORDER_MAP = { blue: 'border-blue-400', cyan: 'border-cyan-400', violet: 'border-violet-500', emerald: 'border-emerald-500', red: 'border-red-400', amber: 'border-amber-500', orange: 'border-orange-500', teal: 'border-teal-500', purple: 'border-purple-500' };
const BG_MAP    = { blue: 'bg-blue-50', cyan: 'bg-cyan-50', violet: 'bg-violet-50', emerald: 'bg-emerald-50', red: 'bg-red-50', amber: 'bg-amber-50', orange: 'bg-orange-50', teal: 'bg-teal-50', purple: 'bg-purple-50' };
const TEXT_MAP  = { blue: 'text-blue-700', cyan: 'text-cyan-700', violet: 'text-violet-700', emerald: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700', orange: 'text-orange-700', teal: 'text-teal-700', purple: 'text-purple-700' };
const BADGE_MAP = { agency: 'bg-blue-100 text-blue-700', hardmoney: 'bg-amber-100 text-amber-800', nonqm: 'bg-purple-100 text-purple-800' };
const TYPE_LABEL = { agency: 'Agency', hardmoney: 'Hard Money', nonqm: 'Non-QM' };

// ─── Letter Builders ──────────────────────────────────────────────────────────
function buildBorrowerLetter({ borrowerName, propertyAddress, loanPurpose, rehabCost, arv, selectedProduct, eligibleCount, loNotes, aiSummary }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('Dear ' + (borrowerName || 'Valued Client') + ',');
  lines.push(''); lines.push('RE: Renovation Loan Analysis — ' + (propertyAddress || 'Subject Property')); lines.push('');
  lines.push('I have completed a renovation financing analysis for your project. Below is a summary of your options and recommendations.');
  lines.push(''); lines.push('PROJECT OVERVIEW');
  lines.push('Property: ' + (propertyAddress || 'See file'));
  lines.push('Loan Purpose: ' + (loanPurpose?.replace(/_/g, ' ') || 'Purchase'));
  lines.push('Renovation Budget: ' + fmt0(rehabCost));
  lines.push('After-Repair Value (ARV): ' + fmt0(arv));
  if (selectedProduct) {
    lines.push(''); lines.push('RECOMMENDED PRODUCT: ' + selectedProduct.label + ' [' + TYPE_LABEL[selectedProduct.lenderType] + ']');
    lines.push(selectedProduct.description); lines.push('');
    lines.push('Key Requirements:');
    selectedProduct.rules.forEach((r, i) => lines.push((i + 1) + '. ' + r));
    if (selectedProduct.lenderType === 'hardmoney') {
      lines.push(''); lines.push('HARD MONEY FINANCING — WHAT YOU NEED TO KNOW');
      lines.push('Hard money loans are asset-based. Your income and employment are not the primary qualification factors — the property\'s ARV and your renovation plan are. This allows for fast closings (5–15 days) and flexible underwriting, but requires a clear exit strategy: you must either sell the property or refinance into long-term financing before the loan matures.');
      lines.push('Estimated Rate: ' + selectedProduct.typicalRate);
      lines.push('Estimated Points: ' + selectedProduct.typicalPoints + ' (paid at closing)');
    }
    if (selectedProduct.lenderType === 'nonqm') {
      lines.push(''); lines.push('NON-QM FINANCING — WHAT YOU NEED TO KNOW');
      lines.push('Non-QM (Non-Qualified Mortgage) loans are for borrowers who don\'t qualify under standard agency guidelines. They offer flexible income documentation and allow for investment property renovation financing based on rental income (DSCR) or bank statement income.');
    }
  }
  lines.push(''); lines.push('PRODUCTS ANALYZED: ' + eligibleCount + ' eligible product(s) identified for this scenario.');
  if (aiSummary) { lines.push(''); lines.push('ANALYSIS SUMMARY'); lines.push(aiSummary); }
  if (loNotes) { lines.push(''); lines.push('ADDITIONAL NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('Please contact me with any questions. I am available to walk through your options in detail.');
  lines.push(''); lines.push('Respectfully,');
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions'); lines.push('george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function buildLenderPackageLetter({ borrowerName, propertyAddress, loanPurpose, rehabCost, arv, arvSource, selectedProduct, screening, form, hmCalc, loNotes, aiFlags }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const p = selectedProduct;
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('To: Lender / Underwriter');
  lines.push('From: George Jules Chevalier IV, NMLS #1175947 — Clearview Lending Solutions');
  lines.push('Re: Renovation Loan Submission — ' + (borrowerName || 'Borrower') + ' | ' + (p?.label || 'Product TBD'));
  lines.push(''); lines.push('═══════════════════════════════════════════════════════');
  lines.push('DEAL SUMMARY');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('Borrower: ' + (borrowerName || 'See application'));
  lines.push('Property: ' + (propertyAddress || 'See application'));
  lines.push('Loan Purpose: ' + (loanPurpose?.replace(/_/g, ' ') || 'Purchase'));
  lines.push('Renovation Budget: ' + fmt0(rehabCost));
  lines.push('After-Repair Value: ' + fmt0(arv) + ' (' + (arvSource || 'estimated') + ')');
  lines.push('FICO Score: ' + (form.creditScore || 'See application'));
  lines.push('Borrower Type: ' + form.borrowerType?.replace(/_/g, ' '));
  lines.push('VA Eligible: ' + (form.isVAEligible ? 'Yes' : 'No'));
  if (p) {
    lines.push(''); lines.push('SELECTED PRODUCT: ' + p.label);
    lines.push('Lender Type: ' + TYPE_LABEL[p.lenderType]);
    lines.push('Max LTV: ' + p.maxLTV + '%');
    if (p.maxLTC) lines.push('Max LTC: ' + p.maxLTC + '%');
    if (p.typicalRate) lines.push('Typical Rate: ' + p.typicalRate);
    if (p.typicalPoints) lines.push('Typical Points: ' + p.typicalPoints);
    if (p.termMonths && p.termMonths <= 24) lines.push('Loan Term: ' + p.termMonths + ' months');
  }
  if (p?.lenderType === 'hardmoney' && hmCalc) {
    lines.push(''); lines.push('HARD MONEY METRICS');
    lines.push('Total Project Cost (Purchase + Rehab): ' + fmt0(hmCalc.totalCost));
    lines.push('Loan-to-Cost (LTC): ' + fmtPct(hmCalc.ltc));
    lines.push('LTV on ARV: ' + fmtPct(hmCalc.ltvOnArv));
    lines.push('Max Loan (lesser of LTC/ARV constraint): ' + fmt0(hmCalc.maxLoan));
    lines.push('Profit Margin (ARV - Total Cost): ' + fmt0(hmCalc.profitMargin) + ' (' + fmtPct(hmCalc.profitMarginPct) + ' ROI)');
    lines.push('Exit Strategy: ' + (form.exitStrategy?.replace(/_/g, ' ') || 'Not specified'));
    lines.push('Borrower Flip Experience: ' + (form.flipExperience || '0') + ' prior project(s)');
  }
  if (p?.lenderType === 'nonqm') {
    lines.push(''); lines.push('NON-QM UNDERWRITING BASIS');
    if (p.id === 'DSCR_RENO') {
      lines.push('Income Type: DSCR (rental income — no personal income required)');
      lines.push('DSCR Target: ≥ 1.0 (market rent / PITIA)');
      lines.push('Market Rent: ' + (form.marketRent ? fmt0(parseFloat(form.marketRent)) + '/mo' : 'See appraisal'));
    } else {
      lines.push('Income Type: Bank Statement (' + (form.bankStmtMonths || '24') + '-month)');
      lines.push('Account Type: ' + (form.bankStmtType || 'Business'));
    }
  }
  lines.push(''); lines.push('PRODUCT ELIGIBILITY SCREENING');
  lines.push('File screened against all ' + REHAB_PRODUCTS.length + ' renovation products.');
  lines.push('Eligible: ' + (screening?.eligibleProducts?.join(', ') || 'See analysis'));
  if (p) {
    lines.push(''); lines.push('REQUIRED DOCUMENTATION — ' + p.label.toUpperCase());
    (p.requirements || []).forEach((r, i) => lines.push((i + 1) + '. ' + r));
  }
  if (aiFlags?.length > 0) { lines.push(''); lines.push('FLAGS / RISK NOTES'); aiFlags.forEach((f, i) => lines.push((i + 1) + '. ' + f)); }
  if (loNotes) { lines.push(''); lines.push('LO NOTES'); lines.push(loNotes); }
  lines.push(''); lines.push('All documentation available upon request. Please contact me directly with questions or conditions.');
  lines.push(''); lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions | george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

function LetterCard({ title, icon, body, color = 'violet' }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={'rounded-3xl border-2 overflow-hidden ' + (color === 'violet' ? 'border-violet-200 bg-violet-50' : 'border-blue-200 bg-blue-50')}>
      <ModuleNav moduleNumber={18} />
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="font-bold text-slate-700 flex items-center gap-2">{icon} {title}</div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={'text-xs px-4 py-2 rounded-xl text-white transition-colors ' + (color === 'violet' ? 'bg-violet-700 hover:bg-violet-600' : 'bg-blue-700 hover:bg-blue-600')}>
            {copied ? '✓ Copied' : 'Copy Letter'}
          </button>
          <button onClick={() => window.print()} className="text-xs px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white">Print</button>
        </div>
      </div>
      <pre className="p-6 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">{body}</pre>
    </div>
  );
}

// ─── Default form ─────────────────────────────────────────────────────────────
const DEFAULT_FORM = {
  borrowerName: '', creditScore: '', loanPurpose: 'PURCHASE', borrowerType: 'PRIMARY',
  isVAEligible: false, isOwnerOccupied: true, propertyAddress: '', propertyType: 'SFR',
  units: 1, purchasePrice: '', currentValue: '', appraisedAIV: '', arvOverride: '',
  isHighCostArea: false, rehabCost: '', rehabItems: {}, hasStructuralWork: false,
  // Hard Money fields
  exitStrategy: 'SELL', flipExperience: '0', holdPeriodMonths: '12',
  entityType: 'INDIVIDUAL', pointsInput: '3', rateInput: '12', reserveMonths: '6',
  // Non-QM fields
  marketRent: '', dscrTarget: '1.10', bankStmtMonths: '24', bankStmtType: 'business',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RehabIntelligence() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scenarioId = searchParams.get('scenarioId');

  const [scenario, setScenario]   = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [search,   setSearch]     = useState('');
  const [showAll,  setShowAll]    = useState(false);
  const [loading, setLoading]     = useState(true);

  const [activeTab, setActiveTab]           = useState(0);
  const [form, setForm]                     = useState(DEFAULT_FORM);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [checkedItems, setCheckedItems]     = useState({});
  const [activeLetterTab, setActiveLetterTab] = useState('borrower');

  // PDF / AI — Contractor Bid
  const [uploading, setUploading]     = useState(false);
  const [aiExtracted, setAiExtracted] = useState(null);
  const [aiAnalysis, setAiAnalysis]   = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiError, setAiError]         = useState('');

  // PDF / AI — Appraisal
  const [appraisalUploading, setAppraisalUploading] = useState(false);
  const [appraisalData, setAppraisalData]           = useState(null);
  const [appraisalError, setAppraisalError]         = useState('');

  const [loNotes, setLoNotes] = useState('');
  const [recordSaving, setRecordSaving]   = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const { reportFindings } = useDecisionRecord(scenarioId);

  const lsKey = scenarioId ? `lb_rehab_${scenarioId}` : null;

  useEffect(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({ form, selectedProductId, aiExtracted, aiAnalysis, appraisalData, loNotes, savedRecordId, checkedItems }));
  }, [lsKey, form, selectedProductId, aiExtracted, aiAnalysis, loNotes, savedRecordId, checkedItems]);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error).finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.form)              setForm(saved.form);
          if (saved.selectedProductId) setSelectedProductId(saved.selectedProductId);
          if (saved.aiExtracted)       setAiExtracted(saved.aiExtracted);
          if (saved.aiAnalysis)        setAiAnalysis(saved.aiAnalysis);
          if (saved.appraisalData)     setAppraisalData(saved.appraisalData);
          if (saved.loNotes)           setLoNotes(saved.loNotes);
          if (saved.savedRecordId)     setSavedRecordId(saved.savedRecordId);
          if (saved.checkedItems)      setCheckedItems(saved.checkedItems);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        setForm(prev => ({
          ...prev,
          borrowerName: [d.firstName, d.lastName].filter(Boolean).join(' ') || prev.borrowerName,
          creditScore: d.creditScore || prev.creditScore,
          propertyAddress: d.streetAddress ? [d.streetAddress, d.city, d.state].filter(Boolean).join(', ') : prev.propertyAddress,
          purchasePrice: d.propertyValue || prev.purchasePrice,
          loanPurpose: d.loanPurpose === 'RATE_TERM_REFI' ? 'RATE_TERM_REFI' : d.loanPurpose === 'CASH_OUT_REFI' ? 'CASH_OUT_REFI' : 'PURCHASE',
          isVAEligible: d.loanType === 'VA' || prev.isVAEligible,
        }));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const rehabItems    = form.rehabItems || {};
  const selectedItems = Object.entries(rehabItems).map(([key, qty]) => ({ key, quantity: qty }));
  const estimate      = estimateRenovationCosts(selectedItems);
  const hasStructural = estimate.hasStructural || form.hasStructuralWork;
  const arvData       = calcARV(form);
  const arv           = arvData.arv;
  const screening     = screenProducts(form, hasStructural);
  const eligibleProducts = screening.eligibleProducts;

  const selectedProduct = selectedProductId
    ? REHAB_PRODUCTS.find(p => p.id === selectedProductId)
    : REHAB_PRODUCTS.find(p => p.id === eligibleProducts[0]);

  // Hard Money Calculations
  const base      = form.loanPurpose === 'PURCHASE' ? (parseFloat(form.purchasePrice) || 0) : (parseFloat(form.currentValue) || 0);
  const rehabCost = parseFloat(form.rehabCost) || 0;
  const totalCost = base + rehabCost;
  const points    = parseFloat(form.pointsInput) || 3;
  const rate      = parseFloat(form.rateInput) || 12;
  const reserveMonths = parseInt(form.reserveMonths) || 6;

  const hmMaxByLTV = selectedProduct?.maxLTV ? Math.round(arv * (selectedProduct.maxLTV / 100)) : 0;
  const hmMaxByLTC = selectedProduct?.maxLTC  ? Math.round(totalCost * (selectedProduct.maxLTC / 100)) : hmMaxByLTV;
  const hmMaxLoan  = selectedProduct?.lenderType === 'hardmoney' ? Math.min(hmMaxByLTV, hmMaxByLTC) : hmMaxByLTV;
  const ltc        = totalCost > 0 ? (hmMaxLoan / totalCost) * 100 : 0;
  const ltvOnArv   = arv > 0 ? (hmMaxLoan / arv) * 100 : 0;
  const pointsCost = hmMaxLoan * (points / 100);
  const monthlyInterest = hmMaxLoan * (rate / 100 / 12);
  const interestReserve = monthlyInterest * reserveMonths;
  const profitMargin    = arv - totalCost;
  const profitMarginPct = totalCost > 0 ? (profitMargin / totalCost) * 100 : 0;

  // DSCR
  const marketRent = parseFloat(form.marketRent) || 0;
  const dscrLoanAmt = arv > 0 ? Math.round(arv * 0.75) : 0;
  const estimatedPI = dscrLoanAmt > 0 ? dscrLoanAmt * (0.085 / 12 / (1 - Math.pow(1 + 0.085 / 12, -360))) : 0;
  const estimatedPITIA = estimatedPI * 1.35; // rough taxes + insurance
  const dscr = estimatedPITIA > 0 ? marketRent / estimatedPITIA : 0;

  const hmCalc = { totalCost, ltc, ltvOnArv, maxLoan: hmMaxLoan, profitMargin, profitMarginPct, pointsCost, monthlyInterest, interestReserve };

  // Checklist for selected product
  const lenderChecklist = selectedProduct?.lenderChecklist || [];
  const checkedCount = lenderChecklist.filter((_, i) => checkedItems[`${selectedProduct?.id}_${i}`]).length;

  // ─── AI PDF Upload ────────────────────────────────────────────────────────────
  const handleContractorBidUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true); setAiError(''); setAiExtracted(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Read failed'));
        reader.readAsDataURL(files[0]);
      });
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract contractor bid data. Return ONLY valid JSON: {"contractorName":"string","totalBid":number,"lineItems":[{"description":"string","amount":number,"category":"structural|mechanical|interior|exterior|other"}],"notes":"any flags","hasStructuralWork":true_or_false,"completionTimeline":"string if mentioned"}' },
          ]}],
        }),
      });
      if (!resp.ok) throw new Error('Status ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse bid');
      const extracted = JSON.parse(match[0]);
      setAiExtracted(extracted);
      if (extracted.totalBid) setForm(f => ({ ...f, rehabCost: String(extracted.totalBid) }));
      if (extracted.hasStructuralWork) setForm(f => ({ ...f, hasStructuralWork: true }));
      setActiveTab(1);
    } catch (err) { setAiError('Extraction failed: ' + err.message); }
    setUploading(false);
  };

  // ─── Appraisal PDF Upload (Haiku) ─────────────────────────────────────────────
  const handleAppraisalUpload = async (files) => {
    if (!files?.length) return;
    setAppraisalUploading(true);
    setAppraisalError('');
    setAppraisalData(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Read failed'));
        reader.readAsDataURL(files[0]);
      });
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 2500,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract all key data from this real estate appraisal report. Return ONLY valid JSON, no markdown: {"subjectAddress":"string","effectiveDate":"string","appraisalType":"URAR|Desktop|Drive-by|BPO|Other","asIsValue":number_or_null,"arvAfterImprovedValue":number_or_null,"condition":"C1|C2|C3|C4|C5|C6 or string","quality":"Q1|Q2|Q3|Q4|Q5|Q6 or string","gla":number_or_null,"yearBuilt":number_or_null,"siteSize":"string","floodZone":"X|AE|A|V|Other","floodHazard":true_or_false,"appraiserName":"string","requiredRepairs":["list of any completion items or required repairs noted by appraiser"],"comparables":[{"address":"string","salePrice":number,"saleDate":"string","gla":number,"distanceMiles":number,"adjustedValue":number}],"rentSchedule":{"monthlyMarketRent":number_or_null,"grossRentMultiplier":number_or_null},"appraiserComments":"brief summary of key comments","hasStructuralConcerns":true_or_false}' },
          ]}],
        }),
      });
      if (!resp.ok) throw new Error('Status ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse appraisal data');
      const extracted = JSON.parse(match[0]);
      setAppraisalData(extracted);
      // Auto-populate key fields
      if (extracted.arvAfterImprovedValue) setForm(f => ({ ...f, arvOverride: String(extracted.arvAfterImprovedValue) }));
      else if (extracted.asIsValue && !form.arvOverride) setForm(f => ({ ...f, appraisedAIV: String(extracted.asIsValue) }));
      if (extracted.asIsValue && form.loanPurpose !== 'PURCHASE') setForm(f => ({ ...f, currentValue: String(extracted.asIsValue) }));
      if (extracted.rentSchedule?.monthlyMarketRent) setForm(f => ({ ...f, marketRent: String(extracted.rentSchedule.monthlyMarketRent) }));
      if (extracted.hasStructuralConcerns) setForm(f => ({ ...f, hasStructuralWork: true }));
    } catch (err) { setAppraisalError('Extraction failed: ' + err.message); }
    setAppraisalUploading(false);
  };
  const handleAIAnalysis = async () => {
    if (!rehabCost) return;
    setAiAnalyzing(true);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1500,
          messages: [{ role: 'user', content: `You are a senior renovation and hard money mortgage specialist. Analyze this deal.

SCENARIO:
- Loan Purpose: ${form.loanPurpose?.replace(/_/g, ' ')}
- FICO: ${form.creditScore || 'Not provided'}
- Borrower Type: ${form.borrowerType}
- VA Eligible: ${form.isVAEligible ? 'Yes' : 'No'}
- Base Value: ${fmt0(base)}
- Renovation: ${fmt0(rehabCost)}
- ARV: ${fmt0(arv)} (${arvData.source})
- Total Cost: ${fmt0(totalCost)}
- Structural Work: ${hasStructural ? 'Yes' : 'No'}
- Eligible Products: ${eligibleProducts.join(', ') || 'None'}
- Selected Product: ${selectedProduct?.label || 'Not selected'} [${selectedProduct ? TYPE_LABEL[selectedProduct.lenderType] : 'N/A'}]
${selectedProduct?.lenderType === 'hardmoney' ? `- LTC: ${fmtPct(ltc)}\n- LTV on ARV: ${fmtPct(ltvOnArv)}\n- Profit Margin: ${fmt0(profitMargin)} (${fmtPct(profitMarginPct)})\n- Exit Strategy: ${form.exitStrategy?.replace(/_/g, ' ')}\n- Prior Flips: ${form.flipExperience}` : ''}
${selectedProduct?.id === 'DSCR_RENO' ? `- Market Rent: ${fmt0(marketRent)}/mo\n- Est. DSCR: ${dscr.toFixed(2)}` : ''}

Return ONLY valid JSON: {"verdict":"STRONG|ACCEPTABLE|MARGINAL|COMPLEX","summary":"2-3 sentence assessment","strengths":["up to 3"],"concerns":["up to 4"],"recommendations":["up to 3"],"talkingPoints":["2-3 borrower talking points"],"lenderFlags":["specific things lender will scrutinize"]}` }],
        }),
      });
      if (!resp.ok) throw new Error('Status ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) setAiAnalysis(JSON.parse(match[0]));
    } catch (err) { console.error(err); }
    setAiAnalyzing(false);
  };

  // ─── Decision Record ──────────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    if (!rehabCost) return;
    setRecordSaving(true);
    try {
      const riskFlags = [];
      if (eligibleProducts.length === 0) riskFlags.push({ field: 'eligibility', message: 'No products eligible', severity: 'HIGH' });
      if (hasStructural && selectedProduct && !selectedProduct.allowsStructural) riskFlags.push({ field: 'structural', message: 'Structural work — product conflict', severity: 'HIGH' });
      if (selectedProduct?.lenderType === 'hardmoney' && profitMarginPct < 15) riskFlags.push({ field: 'margin', message: 'Profit margin <15% — thin deal', severity: 'MEDIUM' });
      if (dscr > 0 && dscr < 1.0) riskFlags.push({ field: 'dscr', message: 'DSCR below 1.0 — may not qualify', severity: 'HIGH' });
      const writtenId = await reportFindings({
        verdict: eligibleProducts.length > 0 ? (aiAnalysis?.verdict || 'ACCEPTABLE') : 'NEEDS REVIEW',
        summary: `Rehab Intelligence — ${form.loanPurpose?.replace(/_/g, ' ')} · Reno: ${fmt0(rehabCost)} · ARV: ${fmt0(arv)} · ${eligibleProducts.length} product(s) eligible · ${selectedProduct?.label || 'No product'}`,
        riskFlags,
        findings: { loanPurpose: form.loanPurpose, rehabCost, arv, totalCost, hasStructural, selectedProduct: selectedProduct?.id, eligibleProducts, creditScore: form.creditScore, exitStrategy: form.exitStrategy, flipExperience: form.flipExperience, loNotes },
        completeness: { purposeSet: !!form.loanPurpose, rehabEntered: !!rehabCost, productSelected: !!selectedProductId, aiRun: !!aiAnalysis },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const TABS = [
    { id: 0, label: 'Loan Setup',        icon: '🏦' },
    { id: 1, label: 'Renovation Scope',  icon: '🔨' },
    { id: 2, label: 'Product Match',     icon: '🎯' },
    { id: 3, label: 'Hard Money / Non-QM', icon: '💰' },
    { id: 4, label: 'Loan Calculator',   icon: '📊' },
    { id: 5, label: 'Summary & Letters', icon: '📝' },
  ];

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">🏚️</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-orange-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-orange-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-orange-900/40">17</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-orange-400 uppercase">Stage 2 — Lender Fit</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">Rehab Intelligence™</h1>
              </div>
            </div>
            <p className="text-orange-200 text-sm leading-relaxed mb-5">Structure renovation loans across Agency, Hard Money, Non-QM, and DSCR Fix & Hold products. AI-powered contractor bid analysis, product eligibility screening, and AIV calculation.</p>
            <div className="flex flex-wrap gap-2">
              {['FHA 203(k)', 'Fannie HomeStyle', 'Hard Money', 'Non-QM Rehab', 'DSCR Fix & Hold', 'AI Bid Analysis'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-orange-200 px-3 py-1 rounded-full font-medium">{tag}</span>
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
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-orange-600 hover:text-orange-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-orange-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate('/rehab-intelligence?scenarioId=' + s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-orange-300 hover:shadow-md hover:bg-orange-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-orange-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-orange-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-orange-500 hover:text-orange-700 py-3 border border-dashed border-orange-200 rounded-2xl hover:bg-orange-50 transition-all">
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

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #f97316 0%, transparent 50%), radial-gradient(circle at 80% 20%, #f59e0b 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 17</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Rehab Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl">Agency renovation · Fix & Flip · Bridge · DSCR Fix & Hold · Non-QM · AI bid analysis</p>
              <div className="flex gap-2 mt-3">
                {['Agency', 'Hard Money', 'Non-QM / DSCR'].map(t => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 font-semibold">{t}</span>
                ))}
              </div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '260px' }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{form.borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{form.propertyAddress || 'No address'}</div>
                  <div className={'text-sm font-bold mt-1 ' + (eligibleProducts.length > 0 ? 'text-emerald-400' : 'text-amber-400')}>
                    {eligibleProducts.length > 0 ? eligibleProducts.length + ' of ' + REHAB_PRODUCTS.length + ' products eligible' : 'No products matched yet'}
                  </div>
                  {selectedProduct && <div className="text-orange-300 text-xs mt-1 flex items-center gap-1">{selectedProduct.icon} {selectedProduct.label} <span className={'px-1.5 py-0.5 rounded text-xs font-bold ' + BADGE_MAP[selectedProduct.lenderType]}>{TYPE_LABEL[selectedProduct.lenderType]}</span></div>}
                </>
              ) : <div className="text-slate-400 text-sm">No scenario loaded</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Borrower Bar */}
      {scenarioId && form.borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{form.borrowerName}</span>
            {form.propertyAddress && <span className="text-blue-200 text-xs">{form.propertyAddress}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {rehabCost > 0 && <span>Reno <strong className="text-white">{fmt0(rehabCost)}</strong></span>}
              {arv > 0 && <span>ARV <strong className="text-white">{fmt0(arv)}</strong></span>}
              {selectedProduct?.lenderType === 'hardmoney' && profitMargin > 0 && <span>Profit <strong className="text-white">{fmt0(profitMargin)}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Rehab Intelligence™" moduleNumber="17" scenarioId={scenarioId} />
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2"><DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="REHAB_INTEL" /></div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ' + (activeTab === tab.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 2 && eligibleProducts.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black">{eligibleProducts.length}</span>}
                {tab.id === 3 && selectedProduct?.lenderType !== 'agency' && selectedProduct && <span className={'text-xs px-2 py-0.5 rounded-full font-bold ' + BADGE_MAP[selectedProduct.lenderType]}>{TYPE_LABEL[selectedProduct.lenderType]}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* ─── TAB 0: LOAN SETUP ──────────────────────────────────────────── */}
            {activeTab === 0 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Loan Purpose</h2>
                    <p className="text-slate-400 text-sm mt-1">Determines product eligibility and maximum renovation amounts.</p>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-3 gap-4">
                      {[['PURCHASE','🛒','Purchase','Buy + renovate'],['RATE_TERM_REFI','🔁','Rate/Term Refi','Refi + renovate'],['CASH_OUT_REFI','💵','Cash-Out Refi','Equity + renovate']].map(([v,ic,l,d]) => (
                        <button key={v} onClick={() => setForm(f => ({ ...f, loanPurpose: v }))}
                          className={'rounded-2xl border-2 p-5 text-left transition-all ' + (form.loanPurpose === v ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <div className="text-3xl mb-2">{ic}</div>
                          <div className={'text-sm font-bold mb-1 ' + (form.loanPurpose === v ? 'text-orange-700' : 'text-slate-700')}>{l}</div>
                          <div className="text-xs text-slate-500">{d}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Borrower Profile</h2>
                    <p className="text-slate-400 text-sm mt-1">Credit score and eligibility flags drive product matching across all 9 products.</p>
                  </div>
                  <div className="p-8 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Borrower Name</label>
                        <input value={form.borrowerName} onChange={e => setForm(f => ({ ...f, borrowerName: e.target.value }))} placeholder="First Last"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Credit Score</label>
                        <input type="number" value={form.creditScore} onChange={e => setForm(f => ({ ...f, creditScore: e.target.value }))} placeholder="680" min="500" max="850"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-orange-400" />
                        {form.creditScore && (
                          <div className={'text-xs mt-1.5 font-semibold ' + (parseFloat(form.creditScore) >= 620 ? 'text-emerald-600' : parseFloat(form.creditScore) >= 580 ? 'text-amber-600' : 'text-red-600')}>
                            {parseFloat(form.creditScore) >= 620 ? '✓ All products available' : parseFloat(form.creditScore) >= 580 ? '⚠ FHA products only (agency). Hard money/Non-QM vary by lender.' : '⚠ Below most minimums — hard money lenders may still consider asset strength'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {[['PRIMARY','🏠 Primary','All products'],['SECONDARY','🏖️ Second Home','Conventional only'],['INVESTMENT','📈 Investment','HomeStyle/CHOICE/NonQM/HM']].map(([v,l,n]) => (
                        <button key={v} onClick={() => setForm(f => ({ ...f, borrowerType: v }))}
                          className={'rounded-2xl border-2 p-4 text-left transition-all ' + (form.borrowerType === v ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <div className={'text-sm font-bold mb-1 ' + (form.borrowerType === v ? 'text-orange-700' : 'text-slate-700')}>{l}</div>
                          <div className="text-xs text-slate-500">{n}</div>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {[['isVAEligible','🎖️ VA Eligible','Unlocks VA Renovation'],['isOwnerOccupied','🏠 Owner Occupied','Required for FHA'],['isHighCostArea','📍 High-Cost Area','Affects conforming limits']].map(([k,l,n]) => (
                        <button key={k} onClick={() => setForm(f => ({ ...f, [k]: !f[k] }))}
                          className={'rounded-2xl border-2 p-4 text-left transition-all ' + (form[k] ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <div className={'text-sm font-bold mb-1 ' + (form[k] ? 'text-orange-700' : 'text-slate-600')}>{form[k] ? '✓ ' : ''}{l}</div>
                          <div className="text-xs text-slate-500">{n}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Property & Valuation</h2>
                    <p className="text-slate-400 text-sm mt-1">ARV is the most critical number for hard money and Non-QM — enter appraiser's ARV when available.</p>
                  </div>
                  <div className="p-8 space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Property Address</label>
                      <input value={form.propertyAddress} onChange={e => setForm(f => ({ ...f, propertyAddress: e.target.value }))} placeholder="123 Main St, City, ST 00000"
                        className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Property Type</label>
                        <select value={form.propertyType} onChange={e => setForm(f => ({ ...f, propertyType: e.target.value }))}
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 bg-white">
                          {[['SFR','Single Family (SFR)'],['2-4 Unit','2–4 Unit Multifamily'],['Condo','Condo'],['PUD','PUD / Townhome'],['Manufactured','Manufactured Home']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{form.loanPurpose === 'PURCHASE' ? 'Purchase Price ($)' : 'Current Appraised Value ($)'}</label>
                        <input type="number" value={form.loanPurpose === 'PURCHASE' ? form.purchasePrice : form.currentValue}
                          onChange={e => setForm(f => form.loanPurpose === 'PURCHASE' ? ({ ...f, purchasePrice: e.target.value }) : ({ ...f, currentValue: e.target.value }))}
                          placeholder="350000" className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-orange-400" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">ARV — After-Repair Value ($) <span className="text-orange-500">★ Key metric</span></label>
                        <input type="number" value={form.arvOverride} onChange={e => setForm(f => ({ ...f, arvOverride: e.target.value }))} placeholder="From appraiser/lender"
                          className="w-full border-2 border-orange-300 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-orange-500 bg-orange-50" />
                        <div className="text-xs text-slate-400 mt-1.5">
                          {form.arvOverride ? '✓ Using provided ARV' : 'Estimated ARV: ' + fmt0(arv) + ' (base + 110% rehab)'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Agency AIV (Fannie/Freddie appraisal)</label>
                        <input type="number" value={form.appraisedAIV} onChange={e => setForm(f => ({ ...f, appraisedAIV: e.target.value }))} placeholder="If different from ARV"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-orange-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 1: RENOVATION SCOPE ─────────────────────────────────────── */}
            {activeTab === 1 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Contractor Bid Upload</h2>
                    <p className="text-slate-400 text-sm mt-1">Upload contractor bid PDF — Haiku extracts line items and auto-fills the renovation budget</p>
                  </div>
                  <div className="p-8">
                    <label className={'block border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ' + (uploading ? 'border-orange-300 bg-orange-50' : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50')}>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => handleContractorBidUpload(e.target.files)} disabled={uploading} />
                      {uploading ? <div><div className="text-3xl mb-3 animate-pulse">⏳</div><div className="font-bold text-orange-700">Extracting bid line items...</div></div>
                        : <div><div className="text-3xl mb-3">📋</div><div className="font-bold text-slate-700">Upload Contractor Bid / SOW PDF</div><div className="text-sm text-slate-500 mt-1">AI extracts all line items and flags structural work</div></div>}
                    </label>
                    {aiError && <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{aiError}</div>}
                    {aiExtracted && (
                      <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                        <div className="font-bold text-emerald-800 mb-2">✅ Bid Extracted — {aiExtracted.contractorName || 'Contractor'}</div>
                        <div className="text-2xl font-black text-emerald-700 mb-3">{fmt0(aiExtracted.totalBid)}</div>
                        {aiExtracted.completionTimeline && <div className="text-xs text-emerald-700 mb-3">Timeline: {aiExtracted.completionTimeline}</div>}
                        <div className="space-y-1.5">{(aiExtracted.lineItems || []).map((item, i) => (
                          <div key={i} className="flex justify-between text-sm py-1.5 border-b border-emerald-200">
                            <span className={'text-emerald-800 flex items-center gap-2'}>{item.category === 'structural' && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">STRUCT</span>}{item.description}</span>
                            <span className="font-bold text-emerald-700">{fmt0(item.amount)}</span>
                          </div>
                        ))}</div>
                        {aiExtracted.hasStructuralWork && <div className="mt-3 text-xs text-red-700 font-bold bg-red-50 rounded-xl p-3">⚠️ Structural work detected — 203k Limited and VA Renovation auto-disqualified</div>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Scope of Work</h2>
                    <p className="text-slate-400 text-sm mt-1">Select all applicable items — structural flags eliminate certain products automatically</p>
                  </div>
                  <div className="p-8 space-y-6">
                    {WORK_CATEGORIES.map(cat => (
                      <div key={cat.category}>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{cat.icon} {cat.category}</div>
                        <div className="space-y-2">
                          {cat.items.map(item => {
                            const isSelected = !!rehabItems[item.key];
                            const range = COST_RANGES[item.key];
                            return (
                              <button key={item.key} onClick={() => setForm(f => { const next = { ...f.rehabItems }; if (next[item.key]) delete next[item.key]; else next[item.key] = 1; return { ...f, rehabItems: next }; })}
                                className={'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all ' + (isSelected ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                                <div className={'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 text-xs font-black text-white ' + (isSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-300')}>{isSelected ? '✓' : ''}</div>
                                <div className="flex-1">
                                  <span className={'text-sm font-semibold ' + (isSelected ? 'text-orange-700' : 'text-slate-700')}>{item.label}</span>
                                  {item.structural && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg font-bold">STRUCTURAL</span>}
                                </div>
                                {range && <span className="text-xs text-slate-400 shrink-0">{fmt0(range.low)}–{fmt0(range.high)}</span>}
                                {isSelected && item.perUnit && (
                                  <select value={rehabItems[item.key] || 1} onChange={e => { e.stopPropagation(); setForm(f => ({ ...f, rehabItems: { ...f.rehabItems, [item.key]: parseInt(e.target.value) } })); }} onClick={e => e.stopPropagation()} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white">
                                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}×</option>)}
                                  </select>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Renovation Budget</h2></div>
                  <div className="p-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Total Renovation Cost ($)</label>
                        <input type="number" value={form.rehabCost} onChange={e => setForm(f => ({ ...f, rehabCost: e.target.value }))} placeholder="50000"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-orange-400" />
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Scope Estimator</div>
                        {selectedItems.length === 0 ? <div className="text-sm text-slate-400">Select items above</div> : (
                          <>
                            <div className="text-sm text-slate-600 mb-1">Mid: <strong>{fmt0(estimate.subtotalMid)}</strong></div>
                            <div className="text-xs text-slate-500 mb-2">+{Math.round(estimate.contingencyPct * 100)}% contingency: <strong>{fmt0(estimate.totalWithContingencyMid)}</strong></div>
                            {hasStructural && <div className="text-xs text-red-600 mb-2 font-semibold">⚠️ 20% contingency (structural)</div>}
                            <button onClick={() => setForm(f => ({ ...f, rehabCost: String(estimate.totalWithContingencyMid) }))} className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-colors">Use estimate →</button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-4">
                      <button onClick={() => setForm(f => ({ ...f, hasStructuralWork: !f.hasStructuralWork }))}
                        className={'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ' + (form.hasStructuralWork || hasStructural ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                        <div className={'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 text-xs font-black text-white ' + (form.hasStructuralWork || hasStructural ? 'bg-red-500 border-red-500' : 'border-slate-300')}>{(form.hasStructuralWork || hasStructural) ? '✓' : ''}</div>
                        <div>
                          <div className={'text-sm font-bold ' + (form.hasStructuralWork || hasStructural ? 'text-red-700' : 'text-slate-700')}>Includes Structural Work</div>
                          <div className="text-xs text-slate-500">Auto-eliminates: 203k Limited, VA Renovation, DSCR Fix & Hold</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 2: PRODUCT MATCH ─────────────────────────────────────────── */}
            {activeTab === 2 && (
              <div className="space-y-4">
                {!rehabCost ? (
                  <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
                    <div className="text-4xl mb-4">🔨</div>
                    <p className="text-slate-500">Enter renovation cost first.</p>
                    <button onClick={() => setActiveTab(1)} className="mt-4 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-2xl text-sm">Go to Renovation Scope →</button>
                  </div>
                ) : (
                  <>
                    {/* Product type filter badges */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Eligible:</span>
                      {['agency','hardmoney','nonqm'].map(type => {
                        const count = eligibleProducts.filter(id => REHAB_PRODUCTS.find(p => p.id === id)?.lenderType === type).length;
                        const total = REHAB_PRODUCTS.filter(p => p.lenderType === type).length;
                        return (
                          <span key={type} className={'px-3 py-1.5 rounded-xl text-xs font-bold ' + (count > 0 ? BADGE_MAP[type] : 'bg-slate-100 text-slate-400')}>
                            {TYPE_LABEL[type]}: {count}/{total}
                          </span>
                        );
                      })}
                    </div>

                    {/* Agency Products */}
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">🏛️ Agency Products</div>
                    {REHAB_PRODUCTS.filter(p => p.lenderType === 'agency').map(product => {
                      const result = screening.results[product.id];
                      const isEligible = result?.eligible;
                      const isSelected = selectedProductId === product.id || (!selectedProductId && isEligible && eligibleProducts[0] === product.id);
                      return (
                        <div key={product.id} onClick={() => isEligible && setSelectedProductId(product.id)}
                          className={'rounded-3xl border-2 overflow-hidden transition-all ' + (isEligible ? 'cursor-pointer ' + (isSelected ? BORDER_MAP[product.color] + ' ' + BG_MAP[product.color] + ' shadow-md' : 'border-slate-200 bg-white hover:border-slate-300') : 'border-slate-100 bg-slate-50 opacity-55')}>
                          <div className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{product.icon}</span>
                              <div>
                                <div className={'text-sm font-black ' + (isSelected ? TEXT_MAP[product.color] : 'text-slate-800')}>{product.label}</div>
                                <div className="text-xs text-slate-500">Min FICO {product.minFICO} · Max LTV {product.maxLTV}%{product.maxRehab ? ' · Max ' + fmt0(product.maxRehab) : ''}</div>
                              </div>
                            </div>
                            <div className={'text-xs font-bold px-3 py-1 rounded-full ' + (isEligible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>{isEligible ? '✓ Eligible' : '✗ Ineligible'}</div>
                          </div>
                          {isSelected && isEligible && (
                            <div className="px-6 pb-5">
                              <p className="text-xs text-slate-600 mb-3">{product.description}</p>
                              <div className="space-y-1">{product.rules.map((r, i) => <div key={i} className="flex gap-2 text-xs text-slate-600"><span className="shrink-0">•</span><span>{r}</span></div>)}</div>
                              {result?.loanCalc && <div className="mt-4 grid grid-cols-3 gap-3">{[['AIV/ARV',fmt0(result.loanCalc.arv)],['Max LTV',product.maxLTV+'%'],['Max Loan',fmt0(result.loanCalc.maxLoanAmt)]].map(([l,v]) => <div key={l} className="bg-white rounded-xl p-3 text-center border border-slate-200"><div className="text-xs text-slate-500 mb-0.5">{l}</div><div className={'text-sm font-black ' + TEXT_MAP[product.color]}>{v}</div></div>)}</div>}
                            </div>
                          )}
                          {!isEligible && result?.flags?.length > 0 && <div className="px-6 pb-4">{result.flags.map((flag, i) => <div key={i} className="text-xs text-red-600 flex gap-2"><span>•</span><span>{flag}</span></div>)}</div>}
                        </div>
                      );
                    })}

                    {/* Hard Money Products */}
                    <div className="text-xs font-bold text-amber-700 uppercase tracking-widest px-1 mt-4">💰 Hard Money Products</div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
                      <strong>Hard money loans</strong> are asset-based — approval is driven by the deal quality (ARV, equity, exit strategy) not the borrower's income or employment. Faster closings, flexible underwriting, higher rates. Ideal for fix & flip and time-sensitive acquisitions.
                    </div>
                    {REHAB_PRODUCTS.filter(p => p.lenderType === 'hardmoney').map(product => {
                      const result = screening.results[product.id];
                      const isEligible = result?.eligible;
                      const isSelected = selectedProductId === product.id || (!selectedProductId && isEligible && eligibleProducts[0] === product.id);
                      return (
                        <div key={product.id} onClick={() => isEligible && setSelectedProductId(product.id)}
                          className={'rounded-3xl border-2 overflow-hidden transition-all ' + (isEligible ? 'cursor-pointer ' + (isSelected ? 'border-amber-500 bg-amber-50 shadow-md' : 'border-slate-200 bg-white hover:border-amber-300') : 'border-slate-100 bg-slate-50 opacity-55')}>
                          <div className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{product.icon}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={'text-sm font-black ' + (isSelected ? 'text-amber-700' : 'text-slate-800')}>{product.label}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">Hard Money</span>
                                </div>
                                <div className="text-xs text-slate-500">{product.typicalRate} · {product.typicalPoints} pts · {product.termMonths}mo term · Interest only</div>
                              </div>
                            </div>
                            <div className={'text-xs font-bold px-3 py-1 rounded-full ' + (isEligible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>{isEligible ? '✓ Eligible' : '✗ Ineligible'}</div>
                          </div>
                          {isSelected && isEligible && (
                            <div className="px-6 pb-5">
                              <p className="text-xs text-slate-600 mb-3">{product.description}</p>
                              <div className="grid grid-cols-2 gap-3 mb-4">
                                {[['Max LTV on ARV',product.maxLTV+'%'],['Max LTC',product.maxLTC+'%'],['Typical Rate',product.typicalRate],['Typical Points',product.typicalPoints]].map(([l,v]) => (
                                  <div key={l} className="bg-amber-50 border border-amber-200 rounded-xl p-3"><div className="text-xs text-amber-600 mb-0.5">{l}</div><div className="text-sm font-black text-amber-800">{v}</div></div>
                                ))}
                              </div>
                              <div className="text-xs font-bold text-slate-500 uppercase mb-2">What This Lender Needs</div>
                              <div className="space-y-1">{product.requirements.map((r, i) => <div key={i} className="flex gap-2 text-xs text-slate-600"><span className="shrink-0 text-amber-600">•</span><span>{r}</span></div>)}</div>
                            </div>
                          )}
                          {!isEligible && result?.flags?.length > 0 && <div className="px-6 pb-4">{result.flags.map((f, i) => <div key={i} className="text-xs text-red-600 flex gap-2"><span>•</span><span>{f}</span></div>)}</div>}
                        </div>
                      );
                    })}

                    {/* Non-QM Products */}
                    <div className="text-xs font-bold text-purple-700 uppercase tracking-widest px-1 mt-4">🏦 Non-QM Products</div>
                    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs text-purple-800">
                      <strong>Non-QM renovation loans</strong> qualify borrowers outside standard agency guidelines — using bank statements, rental income (DSCR), or asset depletion. No W-2 or tax returns required for income. Higher rates than agency but more flexible underwriting.
                    </div>
                    {REHAB_PRODUCTS.filter(p => p.lenderType === 'nonqm').map(product => {
                      const result = screening.results[product.id];
                      const isEligible = result?.eligible;
                      const isSelected = selectedProductId === product.id || (!selectedProductId && isEligible && eligibleProducts[0] === product.id);
                      return (
                        <div key={product.id} onClick={() => isEligible && setSelectedProductId(product.id)}
                          className={'rounded-3xl border-2 overflow-hidden transition-all ' + (isEligible ? 'cursor-pointer ' + (isSelected ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-slate-200 bg-white hover:border-purple-300') : 'border-slate-100 bg-slate-50 opacity-55')}>
                          <div className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{product.icon}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={'text-sm font-black ' + (isSelected ? 'text-purple-700' : 'text-slate-800')}>{product.label}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">Non-QM</span>
                                </div>
                                <div className="text-xs text-slate-500">{product.typicalRate} rate · {product.typicalPoints} pts · Max LTV {product.maxLTV}%</div>
                              </div>
                            </div>
                            <div className={'text-xs font-bold px-3 py-1 rounded-full ' + (isEligible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>{isEligible ? '✓ Eligible' : '✗ Ineligible'}</div>
                          </div>
                          {isSelected && isEligible && (
                            <div className="px-6 pb-5">
                              <p className="text-xs text-slate-600 mb-3">{product.description}</p>
                              <div className="space-y-1 mb-4">{product.rules.map((r, i) => <div key={i} className="flex gap-2 text-xs text-slate-600"><span className="shrink-0 text-purple-600">•</span><span>{r}</span></div>)}</div>
                              <div className="text-xs font-bold text-slate-500 uppercase mb-2">What This Lender Needs</div>
                              <div className="space-y-1">{product.requirements.map((r, i) => <div key={i} className="flex gap-2 text-xs text-slate-600"><span className="shrink-0 text-purple-600">•</span><span>{r}</span></div>)}</div>
                            </div>
                          )}
                          {!isEligible && result?.flags?.length > 0 && <div className="px-6 pb-4">{result.flags.map((f, i) => <div key={i} className="text-xs text-red-600 flex gap-2"><span>•</span><span>{f}</span></div>)}</div>}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ─── TAB 3: HARD MONEY / NON-QM ─────────────────────────────────── */}
            {activeTab === 3 && (
              <>
                {/* Appraisal Upload */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">🏠 Appraisal Upload — AI Data Extraction</h2>
                    <p className="text-slate-400 text-sm mt-1">Upload the appraisal or BPO — Haiku extracts ARV, as-is value, condition, repairs, rent schedule, and comps. Auto-populates all key fields.</p>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {[
                        { icon: '📊', title: 'ARV / AIV', desc: 'Auto-fills the After-Repair Value field — the most critical hard money number' },
                        { icon: '🔍', title: 'Condition & Repairs', desc: 'Extracts condition rating and required completion items from appraiser notes' },
                        { icon: '💰', title: 'Rent Schedule', desc: 'Pulls 1007 market rent for DSCR calculation — auto-fills the DSCR rent field' },
                      ].map(s => (
                        <div key={s.title} className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <div className="text-2xl mb-2">{s.icon}</div>
                          <div className="text-xs font-bold text-slate-700 mb-1">{s.title}</div>
                          <div className="text-xs text-slate-500">{s.desc}</div>
                        </div>
                      ))}
                    </div>

                    <label className={'block border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ' + (appraisalUploading ? 'border-blue-300 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50')}>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => handleAppraisalUpload(e.target.files)} disabled={appraisalUploading} />
                      {appraisalUploading ? (
                        <div><div className="text-3xl mb-3 animate-pulse">⏳</div><div className="font-bold text-blue-700">Reading appraisal...</div><div className="text-sm text-blue-500 mt-1">Extracting ARV, condition, comps, and rent schedule</div></div>
                      ) : (
                        <div><div className="text-3xl mb-3">📄</div><div className="font-bold text-slate-700">Upload Appraisal / BPO / Desk Review PDF</div><div className="text-sm text-slate-500 mt-1">URAR (1004), 2055, desktop review, or broker price opinion</div><div className="text-xs text-slate-400 mt-2">Supports agency appraisals with ARV · Hard money BPOs · DSCR rent schedules (1007)</div></div>
                      )}
                    </label>

                    {appraisalError && <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{appraisalError}</div>}

                    {appraisalData && (
                      <div className="mt-6 space-y-4">
                        {/* Header */}
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="font-bold text-blue-800">✅ Appraisal Extracted — {appraisalData.appraiserName || 'Appraiser'}</div>
                              <div className="text-xs text-blue-600 mt-0.5">{appraisalData.appraisalType} · Effective: {appraisalData.effectiveDate || 'See report'}</div>
                            </div>
                            <button onClick={() => { setAppraisalData(null); setAppraisalError(''); }} className="text-xs text-blue-400 hover:text-blue-600">Clear</button>
                          </div>

                          {/* Key values grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { label: 'As-Is Value', value: appraisalData.asIsValue ? fmt0(appraisalData.asIsValue) : '--', color: 'slate', note: 'Current condition' },
                              { label: 'ARV / After-Improved', value: appraisalData.arvAfterImprovedValue ? fmt0(appraisalData.arvAfterImprovedValue) : '--', color: 'orange', note: 'Auto-filled above ↑' },
                              { label: 'Condition', value: appraisalData.condition || '--', color: appraisalData.condition?.startsWith('C5') || appraisalData.condition?.startsWith('C6') ? 'red' : appraisalData.condition?.startsWith('C4') ? 'amber' : 'emerald', note: 'UAD rating' },
                              { label: 'Market Rent (1007)', value: appraisalData.rentSchedule?.monthlyMarketRent ? fmt0(appraisalData.rentSchedule.monthlyMarketRent) + '/mo' : '--', color: 'purple', note: 'Auto-filled DSCR ↑' },
                            ].map(m => (
                              <div key={m.label} className={'rounded-xl border p-3 text-center ' + (m.color === 'orange' ? 'border-orange-200 bg-orange-50' : m.color === 'red' ? 'border-red-200 bg-red-50' : m.color === 'amber' ? 'border-amber-200 bg-amber-50' : m.color === 'emerald' ? 'border-emerald-200 bg-emerald-50' : m.color === 'purple' ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-white')}>
                                <div className={'text-sm font-black ' + (m.color === 'orange' ? 'text-orange-700' : m.color === 'red' ? 'text-red-600' : m.color === 'amber' ? 'text-amber-700' : m.color === 'emerald' ? 'text-emerald-700' : m.color === 'purple' ? 'text-purple-700' : 'text-slate-800')}>{m.value}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
                                <div className="text-xs text-slate-400">{m.note}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Required Repairs */}
                        {appraisalData.requiredRepairs?.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                            <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Required Repairs / Completion Items ({appraisalData.requiredRepairs.length})</div>
                            <div className="space-y-2">
                              {appraisalData.requiredRepairs.map((r, i) => (
                                <div key={i} className="flex gap-2 text-sm text-amber-800">
                                  <span className="shrink-0 font-bold">{i + 1}.</span><span>{r}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 text-xs text-amber-600 font-semibold">These must be completed before closing on agency loans. Hard money lenders may fund with escrow holdback.</div>
                          </div>
                        )}

                        {/* Flood zone */}
                        {appraisalData.floodHazard && (
                          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                            <div className="font-bold text-red-700 text-sm">🌊 Flood Zone: {appraisalData.floodZone} — Flood insurance required</div>
                            <div className="text-xs text-red-600 mt-1">Mandatory flood insurance will increase monthly PITIA — affects DSCR calculation. Verify coverage before submission.</div>
                          </div>
                        )}

                        {/* Comparable Sales */}
                        {appraisalData.comparables?.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">Comparable Sales ({appraisalData.comparables.length} comps)</div>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {appraisalData.comparables.map((comp, i) => (
                                <div key={i} className="flex items-center justify-between px-5 py-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-700">{comp.address}</div>
                                    <div className="text-xs text-slate-400">{comp.saleDate} · {comp.distanceMiles?.toFixed(2)} mi · {comp.gla?.toLocaleString()} sf</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-bold text-slate-800">{fmt0(comp.salePrice)}</div>
                                    {comp.adjustedValue && <div className="text-xs text-blue-600">Adj: {fmt0(comp.adjustedValue)}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Appraiser comments */}
                        {appraisalData.appraiserComments && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Appraiser Comments</div>
                            <p className="text-sm text-slate-600 leading-relaxed">{appraisalData.appraiserComments}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Hard Money Deal Analysis */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-800 to-amber-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">💰 Hard Money Deal Metrics</h2>
                    <p className="text-amber-200 text-sm mt-1">LTC, LTV on ARV, cost of money, and profit margin — what every hard money lender evaluates first</p>
                  </div>
                  <div className="p-8 space-y-6">
                    {/* Key metrics grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'ARV', value: arv > 0 ? fmt0(arv) : '--', sub: arvData.source, color: 'orange' },
                        { label: 'Total Cost', value: totalCost > 0 ? fmt0(totalCost) : '--', sub: 'Purchase + Rehab', color: 'slate' },
                        { label: 'Max Loan (HM)', value: hmMaxLoan > 0 ? fmt0(hmMaxLoan) : '--', sub: 'Lesser of LTC/ARV limit', color: 'amber' },
                        { label: 'Profit Margin', value: profitMargin > 0 ? fmt0(profitMargin) : '--', sub: fmtPct(profitMarginPct) + ' ROI', color: profitMarginPct >= 20 ? 'emerald' : profitMarginPct >= 10 ? 'amber' : 'red' },
                      ].map(m => (
                        <div key={m.label} className={'rounded-2xl border-2 p-4 text-center ' + (m.color === 'emerald' ? 'border-emerald-200 bg-emerald-50' : m.color === 'amber' ? 'border-amber-200 bg-amber-50' : m.color === 'orange' ? 'border-orange-200 bg-orange-50' : m.color === 'red' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50')}>
                          <div className={'text-lg font-black ' + (m.color === 'emerald' ? 'text-emerald-700' : m.color === 'amber' ? 'text-amber-700' : m.color === 'orange' ? 'text-orange-700' : m.color === 'red' ? 'text-red-600' : 'text-slate-800')}>{m.value}</div>
                          <div className="text-xs font-bold text-slate-500 mt-0.5">{m.label}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{m.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* LTC / LTV gauges */}
                    <div className="grid grid-cols-2 gap-5">
                      {[['LTC (Loan-to-Cost)', ltc, 85, 'Max 85% for most HM lenders'], ['LTV on ARV', ltvOnArv, 70, 'Max 70% of ARV is standard']].map(([label, val, max, note]) => (
                        <div key={label} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</span>
                            <span className={'text-lg font-black ' + (val > max ? 'text-red-600' : val > max * 0.9 ? 'text-amber-600' : 'text-emerald-600')}>{fmtPct(val)}</span>
                          </div>
                          <div className="bg-slate-200 rounded-full h-3 overflow-hidden">
                            <div className={'h-full rounded-full transition-all ' + (val > max ? 'bg-red-500' : val > max * 0.9 ? 'bg-amber-500' : 'bg-emerald-500')}
                              style={{ width: Math.min(100, (val / (max * 1.2)) * 100) + '%' }} />
                          </div>
                          <div className="text-xs text-slate-400 mt-1.5">{note}</div>
                          {val > max && <div className="text-xs text-red-600 font-bold mt-1">⚠ Exceeds typical HM max — more cash to close required</div>}
                        </div>
                      ))}
                    </div>

                    {/* Cost of Money */}
                    <div>
                      <div className="text-sm font-bold text-slate-700 mb-4">Cost of Money Estimator</div>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        {[
                          { label: 'Rate (%)', key: 'rateInput', ph: '12', note: 'Typical 10–14%' },
                          { label: 'Points (%)', key: 'pointsInput', ph: '3', note: 'Typical 2–4 points' },
                          { label: 'Reserve Months', key: 'reserveMonths', ph: '6', note: 'Required by lender' },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{f.label}</label>
                            <input type="number" value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph}
                              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-amber-400" />
                            <div className="text-xs text-slate-400 mt-1">{f.note}</div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl divide-y divide-amber-200">
                        {[
                          ['Points Cost (at close)', fmt0(pointsCost)],
                          ['Monthly Interest (IO)', fmt0(monthlyInterest)],
                          ['Interest Reserve (' + reserveMonths + ' mo)', fmt0(interestReserve)],
                          ['Total Cost of Money', fmt0(pointsCost + interestReserve), true],
                        ].map(([l, v, bold]) => (
                          <div key={l} className={'flex justify-between items-center px-5 py-3 ' + (bold ? 'bg-amber-100' : '')}>
                            <span className={'text-sm ' + (bold ? 'font-black text-amber-800' : 'text-amber-700')}>{l}</span>
                            <span className={'font-black ' + (bold ? 'text-amber-900 text-base' : 'text-amber-700 text-sm')}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* HM specific fields */}
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Exit Strategy</label>
                        <div className="space-y-2">
                          {[['SELL','🏷️ Sell after renovation','Most common HM exit'],['REFI_CONVENTIONAL','🏦 Refinance — Conventional','Into HomeStyle or standard conv'],['REFI_DSCR','📈 Refinance — DSCR Non-QM','Fix & Hold with rental income'],['REFI_BRIDGE','🌉 Refinance — Bridge','Into another short-term product']].map(([v,l,n]) => (
                            <button key={v} onClick={() => setForm(f => ({ ...f, exitStrategy: v }))}
                              className={'w-full text-left px-4 py-3 rounded-2xl border-2 transition-all ' + (form.exitStrategy === v ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-amber-300')}>
                              <div className={'text-sm font-bold ' + (form.exitStrategy === v ? 'text-amber-700' : 'text-slate-700')}>{l}</div>
                              <div className="text-xs text-slate-500">{n}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Prior Flip Experience</label>
                          <select value={form.flipExperience} onChange={e => setForm(f => ({ ...f, flipExperience: e.target.value }))}
                            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 bg-white">
                            {[['0','First-time flipper'],['1','1 prior flip'],['2','2–3 flips'],['5','4–5 flips'],['6','6–10 flips'],['11','11+ flips (experienced)']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <div className={'text-xs mt-1.5 font-semibold ' + (parseInt(form.flipExperience) >= 3 ? 'text-emerald-600' : parseInt(form.flipExperience) >= 1 ? 'text-amber-600' : 'text-red-500')}>
                            {parseInt(form.flipExperience) >= 3 ? '✓ Strong experience — favorable to most HM lenders' : parseInt(form.flipExperience) >= 1 ? '⚠ Limited experience — some lenders require a mentor/partner' : '⚠ First-time — may require lower LTC, more reserves, or sponsor'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Entity / Vesting Type</label>
                          <select value={form.entityType} onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))}
                            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 bg-white">
                            {[['INDIVIDUAL','Individual'],['LLC_SINGLE','Single-Member LLC'],['LLC_MULTI','Multi-Member LLC'],['TRUST','Revocable Trust'],['CORP','Corporation']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <div className="text-xs text-slate-400 mt-1.5">Most HM/Non-QM lenders allow LLC vesting — confirm entity docs are current</div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Projected Hold / Reno Timeline (months)</label>
                          <input type="number" value={form.holdPeriodMonths} onChange={e => setForm(f => ({ ...f, holdPeriodMonths: e.target.value }))} placeholder="12" min="1" max="24"
                            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-amber-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DSCR / Non-QM Fields */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-800 to-purple-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">🏦 Non-QM / DSCR Analysis</h2>
                    <p className="text-purple-200 text-sm mt-1">For Fix & Hold and bank statement renovation scenarios — income qualification without tax returns</p>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Market Rent ($/month) — DSCR</label>
                        <input type="number" value={form.marketRent} onChange={e => setForm(f => ({ ...f, marketRent: e.target.value }))} placeholder="2200"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-purple-400" />
                        <div className="text-xs text-slate-400 mt-1.5">From 1007 rent schedule or market analysis</div>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                        <div className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-3">Estimated DSCR</div>
                        {marketRent > 0 ? (
                          <>
                            <div className={'text-3xl font-black mb-1 ' + (dscr >= 1.25 ? 'text-emerald-600' : dscr >= 1.0 ? 'text-amber-600' : 'text-red-600')}>{dscr.toFixed(2)}</div>
                            <div className={'text-xs font-semibold ' + (dscr >= 1.25 ? 'text-emerald-600' : dscr >= 1.0 ? 'text-amber-600' : 'text-red-600')}>
                              {dscr >= 1.25 ? '✓ Strong — most DSCR lenders require 1.0–1.25' : dscr >= 1.0 ? '⚠ Borderline — check lender minimum' : '✗ Below 1.0 — may not qualify for DSCR'}
                            </div>
                            <div className="text-xs text-purple-600 mt-2">Est. PITIA: {fmt0(estimatedPITIA)}/mo</div>
                          </>
                        ) : <div className="text-sm text-purple-400">Enter market rent to calculate</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Bank Statement Income (months)</label>
                        <div className="flex gap-2">
                          {['12','24'].map(m => <button key={m} onClick={() => setForm(f => ({ ...f, bankStmtMonths: m }))} className={'flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all ' + (form.bankStmtMonths === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500')}>{m}-Month</button>)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Bank Statement Account Type</label>
                        <div className="flex gap-2">
                          {[['business','🏢 Business'],['personal','👤 Personal']].map(([v,l]) => <button key={v} onClick={() => setForm(f => ({ ...f, bankStmtType: v }))} className={'flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all ' + (form.bankStmtType === v ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500')}>{l}</button>)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pre-Approval Checklist */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">📋 Lender Pre-Approval Checklist</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      {selectedProduct ? 'Requirements for ' + selectedProduct.label + ' — what the lender needs before they can approve this deal' : 'Select a product in Product Match to see the checklist'}
                    </p>
                  </div>
                  <div className="p-8">
                    {!selectedProduct ? (
                      <div className="text-center py-6 text-slate-400"><div className="text-4xl mb-3">🎯</div><p>Select a product in Product Match to see the pre-approval checklist</p><button onClick={() => setActiveTab(2)} className="mt-4 text-sm font-bold text-orange-600 hover:text-orange-500">Go to Product Match →</button></div>
                    ) : lenderChecklist.length === 0 ? (
                      <div className="space-y-2">{selectedProduct.requirements.map((r, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                          <div className="w-5 h-5 rounded border-2 border-slate-300 mt-0.5 shrink-0" />
                          <span className="text-sm text-slate-700">{r}</span>
                        </div>
                      ))}</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <div className={'text-sm font-bold ' + (checkedCount === lenderChecklist.length ? 'text-emerald-600' : 'text-slate-600')}>
                            {checkedCount} / {lenderChecklist.length} items ready
                          </div>
                          <div className="flex-1 mx-4 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className={'h-full rounded-full transition-all ' + (checkedCount === lenderChecklist.length ? 'bg-emerald-500' : 'bg-orange-500')}
                              style={{ width: lenderChecklist.length > 0 ? (checkedCount / lenderChecklist.length * 100) + '%' : '0%' }} />
                          </div>
                          <button onClick={() => setCheckedItems({})} className="text-xs text-slate-400 hover:text-slate-600">Reset</button>
                        </div>
                        <div className="space-y-2">
                          {lenderChecklist.map((item, i) => {
                            const key = `${selectedProduct.id}_${i}`;
                            const isChecked = !!checkedItems[key];
                            return (
                              <button key={i} onClick={() => setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }))}
                                className={'w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ' + (isChecked ? 'border-emerald-400 bg-emerald-50' : item.critical ? 'border-amber-200 bg-amber-50 hover:border-amber-300' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                                <div className={'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 text-xs font-black text-white ' + (isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300')}>{isChecked ? '✓' : ''}</div>
                                <div className="flex-1">
                                  <span className={'text-sm ' + (isChecked ? 'text-emerald-700 line-through' : 'text-slate-700')}>{item.item}</span>
                                  {item.critical && !isChecked && <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">Required</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {checkedCount === lenderChecklist.length && (
                          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                            <div className="text-emerald-700 font-bold">✅ All items ready — file is ready for lender submission</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 4: LOAN CALCULATOR ──────────────────────────────────────── */}
            {activeTab === 4 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-orange-800 to-orange-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">ARV / AIV & Loan Calculations</h2>
                    <p className="text-orange-200 text-sm mt-1">After-repair value is the foundation of every renovation loan max</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      [form.loanPurpose === 'PURCHASE' ? 'Purchase Price' : 'Current Value', fmt0(base), ''],
                      ['Renovation Cost', '+ ' + fmt0(rehabCost), ''],
                      ['ARV / After-Repair Value', fmt0(arv), arvData.source],
                    ].map(([l, v, n]) => (
                      <div key={l} className={'flex justify-between items-center px-8 py-4 ' + (l.includes('ARV') ? 'bg-orange-50' : '')}>
                        <div><span className={'text-sm ' + (l.includes('ARV') ? 'font-black text-orange-800' : 'text-slate-600')}>{l}</span>{n && <div className="text-xs text-slate-400">{n}</div>}</div>
                        <span className={'font-black ' + (l.includes('ARV') ? 'text-xl text-orange-700' : 'text-sm text-slate-800')}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">Max Loan by Product — All 9 Products</h2>
                    <p className="text-slate-400 text-sm mt-1">Sorted by lender type. Max loan = ARV × max LTV (hard money: lesser of LTV or LTC)</p>
                  </div>
                  <div>
                    {['agency','hardmoney','nonqm'].map(type => (
                      <div key={type}>
                        <div className={'px-8 py-3 text-xs font-bold uppercase tracking-widest ' + (type === 'agency' ? 'bg-blue-50 text-blue-700' : type === 'hardmoney' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700')}>{TYPE_LABEL[type]}</div>
                        {REHAB_PRODUCTS.filter(p => p.lenderType === type).map(p => {
                          const result = screening.results[p.id];
                          const isEligible = result?.eligible;
                          const maxLoan = p.maxLTC ? Math.min(arv * (p.maxLTV / 100), totalCost * (p.maxLTC / 100)) : arv * (p.maxLTV / 100);
                          return (
                            <div key={p.id} className={'flex items-center justify-between px-8 py-4 border-b border-slate-100 ' + (!isEligible ? 'opacity-40' : '')}>
                              <div className="flex items-center gap-3"><span>{p.icon}</span>
                                <div><div className="text-sm font-bold text-slate-800">{p.label}</div>
                                  <div className="text-xs text-slate-500">{p.maxLTV}% LTV{p.maxLTC ? ' · ' + p.maxLTC + '% LTC' : ''}{p.typicalRate ? ' · ' + p.typicalRate : ''}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={'text-sm font-black ' + (isEligible ? (type === 'hardmoney' ? 'text-amber-700' : type === 'nonqm' ? 'text-purple-700' : 'text-blue-700') : 'text-slate-400')}>{fmt0(maxLoan)}</div>
                                {!isEligible && <div className="text-xs text-red-500">Ineligible</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ─── TAB 5: SUMMARY & LETTERS ─────────────────────────────────────── */}
            {activeTab === 5 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                    <h2 className="text-xl font-bold text-white">AI Scenario Assessment</h2>
                    <p className="text-slate-400 text-sm mt-1">Sonnet evaluates the full deal and generates product-specific talking points and lender flags</p>
                  </div>
                  <div className="p-8">
                    {!aiAnalysis ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-slate-500 text-sm mb-4">Run AI analysis for an underwriting assessment, talking points, and lender flags specific to the selected product.</p>
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing || !rehabCost} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors">
                          {aiAnalyzing ? 'Analyzing...' : !rehabCost ? 'Enter renovation cost first' : '🤖 Run AI Analysis'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className={'inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-black text-sm ' + (aiAnalysis.verdict === 'STRONG' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : aiAnalysis.verdict === 'ACCEPTABLE' ? 'bg-blue-100 text-blue-800 border-blue-300' : aiAnalysis.verdict === 'MARGINAL' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-violet-100 text-violet-800 border-violet-300')}>
                          {selectedProduct && <span className={BADGE_MAP[selectedProduct.lenderType] + ' px-2 py-0.5 rounded text-xs'}>{TYPE_LABEL[selectedProduct.lenderType]}</span>}
                          {aiAnalysis.verdict}
                        </div>
                        <p className="text-slate-700 leading-relaxed">{aiAnalysis.summary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[['✅ Strengths', aiAnalysis.strengths, 'emerald'], ['⚠️ Concerns', aiAnalysis.concerns, 'amber'], ['💡 Recommendations', aiAnalysis.recommendations, 'blue']].map(([label, items, color]) => (
                            <div key={label} className={`rounded-2xl border p-4 bg-${color}-50 border-${color}-200`}>
                              <div className={`text-xs font-bold text-${color}-700 mb-2`}>{label}</div>
                              <ul className="space-y-1">{(items || []).map((item, i) => <li key={i} className={`text-xs text-${color}-800 flex gap-2`}><span className="shrink-0">•</span><span>{item}</span></li>)}</ul>
                            </div>
                          ))}
                        </div>
                        {aiAnalysis.talkingPoints?.length > 0 && (
                          <div className={'rounded-2xl p-5 border ' + (selectedProduct?.lenderType === 'hardmoney' ? 'bg-amber-50 border-amber-200' : selectedProduct?.lenderType === 'nonqm' ? 'bg-purple-50 border-purple-200' : 'bg-orange-50 border-orange-200')}>
                            <div className={'text-xs font-bold uppercase tracking-wide mb-3 ' + (selectedProduct?.lenderType === 'hardmoney' ? 'text-amber-700' : selectedProduct?.lenderType === 'nonqm' ? 'text-purple-700' : 'text-orange-700')}>Borrower Talking Points — {selectedProduct?.label}</div>
                            {aiAnalysis.talkingPoints.map((tp, i) => <div key={i} className="flex gap-2 text-sm text-slate-700 mb-2"><span className="shrink-0 font-bold">{i + 1}.</span><span>{tp}</span></div>)}
                          </div>
                        )}
                        {aiAnalysis.lenderFlags?.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                            <div className="text-xs font-bold text-red-700 uppercase tracking-wide mb-3">🚩 What This Lender Will Scrutinize</div>
                            {aiAnalysis.lenderFlags.map((f, i) => <div key={i} className="flex gap-2 text-sm text-red-700 mb-1.5"><span className="shrink-0">•</span><span>{f}</span></div>)}
                          </div>
                        )}
                        <button onClick={handleAIAnalysis} disabled={aiAnalyzing} className="text-xs text-orange-600 hover:text-orange-500 font-semibold">{aiAnalyzing ? 'Re-analyzing...' : '↺ Re-run'}</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">LO Notes</h2></div>
                  <div className="p-8">
                    <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={4}
                      placeholder="Product rationale, contractor notes, exit strategy details, lender overlays, compensating factors..."
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 resize-none" />
                    <div className="mt-4 flex justify-end">
                      <button onClick={handleSaveToRecord} disabled={recordSaving || !rehabCost}
                        className={'px-8 py-3 rounded-2xl text-sm font-bold transition-colors ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                        {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Letters</h2></div>
                  <div className="p-8">
                    <div className="flex gap-2 mb-6">
                      {[['borrower','👤 Borrower Letter'],['lender','📋 Lender Package']].map(([v,l]) => (
                        <button key={v} onClick={() => setActiveLetterTab(v)}
                          className={'px-5 py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ' + (activeLetterTab === v ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>{l}</button>
                      ))}
                    </div>
                    {activeLetterTab === 'borrower' && <LetterCard title="Borrower Renovation Letter" icon="👤" color="violet" body={buildBorrowerLetter({ borrowerName: form.borrowerName, propertyAddress: form.propertyAddress, loanPurpose: form.loanPurpose, rehabCost, arv, selectedProduct, eligibleCount: eligibleProducts.length, loNotes, aiSummary: aiAnalysis?.summary })} />}
                    {activeLetterTab === 'lender' && <LetterCard title="Lender Package Letter" icon="📋" color="blue" body={buildLenderPackageLetter({ borrowerName: form.borrowerName, propertyAddress: form.propertyAddress, loanPurpose: form.loanPurpose, rehabCost, arv, arvSource: arvData.source, selectedProduct, screening, form, hmCalc, loNotes, aiFlags: aiAnalysis?.lenderFlags })} />}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ══ Sidebar ══════════════════════════════════════════════════════════ */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Deal Summary</div>
              <div className="space-y-3">
                {[
                  ['Purpose', form.loanPurpose?.replace(/_/g, ' ') || '--', 'text-white'],
                  ['Base Value', base > 0 ? fmt0(base) : '--', 'text-slate-300'],
                  ['Renovation', rehabCost > 0 ? fmt0(rehabCost) : '--', 'text-orange-300'],
                  ['ARV', arv > 0 ? fmt0(arv) : '--', 'text-white'],
                  ['FICO', form.creditScore || '--', parseFloat(form.creditScore) >= 620 ? 'text-emerald-400' : parseFloat(form.creditScore) >= 580 ? 'text-amber-400' : 'text-red-400'],
                  ['Structural', hasStructural ? 'Yes' : 'No', hasStructural ? 'text-red-400' : 'text-slate-400'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800">
                    <span className="text-slate-400 text-sm">{l}</span><span className={'font-bold text-sm ' + c}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Eligible by type */}
              <div className="mt-4 space-y-2">
                {['agency','hardmoney','nonqm'].map(type => {
                  const count = eligibleProducts.filter(id => REHAB_PRODUCTS.find(p => p.id === id)?.lenderType === type).length;
                  const total = REHAB_PRODUCTS.filter(p => p.lenderType === type).length;
                  return (
                    <div key={type} className={'flex justify-between items-center px-3 py-2 rounded-xl ' + (count > 0 ? BADGE_MAP[type] : 'bg-slate-800 text-slate-500')}>
                      <span className="text-xs font-bold">{TYPE_LABEL[type]}</span>
                      <span className="text-xs font-black">{count}/{total} eligible</span>
                    </div>
                  );
                })}
              </div>
              {selectedProduct && (
                <div className={'mt-4 rounded-2xl p-4 border ' + BORDER_MAP[selectedProduct.color] + ' ' + BG_MAP[selectedProduct.color]}>
                  <div className={'text-xs font-bold uppercase tracking-wide mb-1 ' + TEXT_MAP[selectedProduct.color]}>Selected</div>
                  <div className={'text-sm font-black ' + TEXT_MAP[selectedProduct.color]}>{selectedProduct.icon} {selectedProduct.label}</div>
                  <span className={'text-xs px-2 py-0.5 rounded-full font-bold ' + BADGE_MAP[selectedProduct.lenderType]}>{TYPE_LABEL[selectedProduct.lenderType]}</span>
                  {hmMaxLoan > 0 && <div className={'text-xl font-black mt-2 ' + TEXT_MAP[selectedProduct.color]}>{fmt0(hmMaxLoan)}</div>}
                  <div className="text-xs text-slate-500">max loan amount</div>
                  {selectedProduct.lenderType === 'hardmoney' && profitMargin > 0 && (
                    <div className={'text-xs font-bold mt-2 ' + (profitMarginPct >= 20 ? 'text-emerald-600' : profitMarginPct >= 10 ? 'text-amber-600' : 'text-red-500')}>
                      Profit: {fmt0(profitMargin)} ({fmtPct(profitMarginPct)} ROI)
                    </div>
                  )}
                  {selectedProduct.id === 'DSCR_RENO' && dscr > 0 && (
                    <div className={'text-xs font-bold mt-2 ' + (dscr >= 1.25 ? 'text-emerald-600' : dscr >= 1.0 ? 'text-amber-600' : 'text-red-500')}>DSCR: {dscr.toFixed(2)}</div>
                  )}
                  {lenderChecklist.length > 0 && <div className="text-xs text-slate-500 mt-1">Checklist: {checkedCount}/{lenderChecklist.length} items</div>}
                </div>
              )}
              {aiAnalysis?.verdict && (
                <div className={'mt-3 rounded-2xl p-3 border text-center ' + (aiAnalysis.verdict === 'STRONG' ? 'bg-emerald-900/30 border-emerald-700/50' : aiAnalysis.verdict === 'ACCEPTABLE' ? 'bg-blue-900/30 border-blue-700/50' : 'bg-amber-900/30 border-amber-700/50')}>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-0.5">AI Assessment</div>
                  <div className="font-black text-white">{aiAnalysis.verdict}</div>
                </div>
              )}
            </div>

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {[
                  'Hard money: approval is asset-based — ARV and deal quality matter most',
                  'LTC (loan-to-cost): most HM lenders max at 80–85% of total project cost',
                  'LTV on ARV: max 65–70% is the hard money standard',
                  'Exit strategy letter is non-negotiable for every hard money lender',
                  'First-time flipper: expect lower LTC, higher reserves, may need sponsor',
                  'DSCR: min 1.0 to qualify — 1.25+ is strong. No personal income needed',
                  'Non-QM: 12 or 24 months bank statements replace tax returns',
                  '203k Standard: HUD consultant required for any scope over $35k',
                  'All HM/Non-QM: LLC vesting allowed — entity docs must be current',
                ].map(rule => <li key={rule} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0">•</span><span>{rule}</span></li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
</div>
  );
}
