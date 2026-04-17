// ─── DPA Intelligence — Module 09 ────────────────────────────────────────────
// LoanBeacons™ | Nationwide DPA Search Engine
// Architecture: Georgia hardcoded seed + Anthropic web search for non-GA states
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/config';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import AEShareForm from '../components/AEShareForm';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import ModuleNav from '../components/ModuleNav';
import ScenarioHeader from '../components/ScenarioHeader';

const MODULE_ID = 'dpa-intelligence';

// ─── COLORS ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#f8fafc',
  surface: '#ffffff',
  card: '#f8fafc',
  cardHover: '#f1f5f9',
  border: '#e2e8f0',
  borderLight: '#cbd5e1',
  green: '#16a34a',
  greenDark: '#14532d',
  greenMuted: '#dcfce7',
  amber: '#d97706',
  amberDark: '#451a03',
  red: '#dc2626',
  redDark: '#fef2f2',
  blue: '#2563eb',
  blueDark: '#dbeafe',
  purple: '#7c3aed',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
};

// ─── GEORGIA AMI LOOKUP ───────────────────────────────────────────────────────
const GA_AMI = {
  // Atlanta MSA
  fulton: 115100, dekalb: 115100, cobb: 115100, gwinnett: 115100,
  cherokee: 115100, forsyth: 115100, henry: 115100, fayette: 115100,
  douglas: 115100, rockdale: 115100, clayton: 115100, newton: 115100,
  paulding: 115100, carroll: 115100, coweta: 115100, barrow: 115100,
  bartow: 115100, hall: 115100, spalding: 115100, walton: 115100,
  // Savannah MSA
  chatham: 83800, bryan: 83800, effingham: 83800,
  // Augusta MSA
  richmond: 79200, columbia: 79200, mcduffie: 79200, burke: 79200,
  // Columbus MSA
  muscogee: 75200, harris: 75200, chattahoochee: 75200,
  // Macon MSA
  bibb: 72500, jones: 72500, monroe: 72500, crawford: 72500,
  // Warner Robins MSA
  houston: 79900, peach: 79900,
  // Albany MSA
  dougherty: 65000, lee: 65000, terrell: 65000,
};
const GA_NONMETRO_AMI = 69700;
const HH_FACTOR = { 1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00, 5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32 };

function getAMILimit(countyRaw, amiPct, hhSize = 3) {
  const key = (countyRaw || '').toLowerCase().replace(' county', '').trim();
  const base = GA_AMI[key] || GA_NONMETRO_AMI;
  return base * (HH_FACTOR[hhSize] || 1.0) * (amiPct / 100);
}

// ─── GEORGIA DPA SEED DATA ────────────────────────────────────────────────────
const GEORGIA_DPA_PROGRAMS = [
  {
    id: 'ga-dream-standard',
    name: 'Georgia Dream Standard',
    shortName: 'GA Dream Standard',
    provider: 'Georgia Dept. of Community Affairs',
    providerAbbr: 'GDCA',
    type: 'deferred_loan',
    amount_type: 'fixed',
    amount: 10000,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Sale, Refi, or 1st Mortgage Payoff',
    min_fico: 640,
    max_dti: 45,
    max_purchase_price: 350000,
    ami_percent: 80,
    max_income_note: '80% AMI (county-specific)',
    first_time_buyer_required: true,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'VA', 'USDA', 'Conventional'],
    counties: 'statewide',
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.dca.ga.gov/safe-affordable-housing/homeownership/georgia-dream',
    notes: '8-hour homebuyer education required. Cannot be layered with other DPA soft seconds. Most widely available GA program.',
    tags: ['state', 'deferred', 'zero-interest', 'ftb'],
  },
  {
    id: 'ga-dream-pen',
    name: 'Georgia Dream PEN',
    shortName: 'GA Dream PEN',
    provider: 'Georgia Dept. of Community Affairs',
    providerAbbr: 'GDCA',
    type: 'deferred_loan',
    amount_type: 'fixed',
    amount: 12500,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Sale, Refi, or 1st Mortgage Payoff',
    min_fico: 640,
    max_dti: 45,
    max_purchase_price: 350000,
    ami_percent: 80,
    max_income_note: '80% AMI (county-specific)',
    first_time_buyer_required: true,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'VA', 'USDA', 'Conventional'],
    counties: 'statewide',
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    occupation_required: ['Law Enforcement', 'Firefighter', 'EMS', 'Teacher', 'Healthcare Worker', 'Active Military', 'Veteran'],
    website: 'https://www.dca.ga.gov/safe-affordable-housing/homeownership/georgia-dream',
    notes: 'Protectors, Educators & Nurses. Borrower or co-borrower must be in qualifying occupation. Extra $2,500 over Standard.',
    tags: ['state', 'deferred', 'zero-interest', 'ftb', 'occupation'],
  },
  {
    id: 'ga-dream-choice',
    name: 'Georgia Dream CHOICE',
    shortName: 'GA Dream CHOICE',
    provider: 'Georgia Dept. of Community Affairs',
    providerAbbr: 'GDCA',
    type: 'deferred_loan',
    amount_type: 'fixed',
    amount: 12500,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Sale, Refi, or 1st Mortgage Payoff',
    min_fico: 640,
    max_dti: 45,
    max_purchase_price: 350000,
    ami_percent: 80,
    max_income_note: '80% AMI (county-specific)',
    first_time_buyer_required: true,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'VA', 'USDA', 'Conventional'],
    counties: 'statewide',
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    disability_required: true,
    website: 'https://www.dca.ga.gov/safe-affordable-housing/homeownership/georgia-dream',
    notes: 'For borrowers or household members with a documented disability. Same terms as PEN but for disability qualification.',
    tags: ['state', 'deferred', 'zero-interest', 'ftb', 'disability'],
  },
  {
    id: 'invest-atlanta-aha',
    name: 'Invest Atlanta – Affordable Housing Initiative',
    shortName: 'Invest ATL – AHI',
    provider: 'Invest Atlanta',
    providerAbbr: 'Invest ATL',
    type: 'forgivable',
    amount_type: 'fixed',
    amount: 20000,
    interest_rate: 0,
    forgivable_years: 5,
    deferred_until: 'Forgiven after 5 years owner-occupancy',
    min_fico: 660,
    max_dti: 50,
    max_purchase_price: 400000,
    ami_percent: 80,
    max_income_note: '80% AMI (Atlanta MSA)',
    first_time_buyer_required: false,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'Conventional'],
    counties: ['Fulton', 'DeKalb'],
    stackable: true,
    stack_exceptions: ['ga-dream-standard', 'ga-dream-pen', 'ga-dream-choice'],
    homebuyer_ed: true,
    website: 'https://www.investatlanta.com/homebuyers',
    notes: 'Property must be within City of Atlanta boundaries. Forgiven after 5 years. Not stackable with GA Dream soft seconds.',
    tags: ['city', 'forgivable', 'atlanta', 'zero-interest', 'no-ftb-req'],
  },
  {
    id: 'invest-atlanta-vine-city',
    name: 'Invest Atlanta – Vine City Renaissance Initiative',
    shortName: 'Invest ATL – Vine City',
    provider: 'Invest Atlanta',
    providerAbbr: 'Invest ATL',
    type: 'grant',
    amount_type: 'fixed',
    amount: 30000,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: null,
    min_fico: 660,
    max_dti: 50,
    max_purchase_price: 300000,
    ami_percent: 80,
    max_income_note: '80% AMI (Atlanta MSA)',
    first_time_buyer_required: false,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'Conventional'],
    counties: ['Fulton'],
    zip_codes: ['30314', '30318'],
    stackable: true,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.investatlanta.com/homebuyers/vine-city',
    notes: 'Target area: Vine City / English Avenue (zip 30314, 30318). True grant — no repayment required. Highest grant amount in GA.',
    tags: ['city', 'grant', 'atlanta', 'target-area', 'no-repayment', 'no-ftb-req'],
  },
  {
    id: 'gwinnett-county-dpa',
    name: 'Gwinnett County DPA Program',
    shortName: 'Gwinnett DPA',
    provider: 'Gwinnett County Community Development',
    providerAbbr: 'Gwinnett County',
    type: 'deferred_loan',
    amount_type: 'fixed',
    amount: 7500,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Sale, Refi, or Transfer',
    min_fico: 640,
    max_dti: 43,
    max_purchase_price: 275000,
    ami_percent: 80,
    max_income_note: '80% AMI (Gwinnett MSA)',
    first_time_buyer_required: true,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'VA', 'Conventional'],
    counties: ['Gwinnett'],
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.gwinnettcounty.com/web/gwinnett/departments/communitydevelopment',
    notes: 'Gwinnett County properties only. Subject to annual funding availability. Can be used with mortgage credit certificates.',
    tags: ['county', 'deferred', 'gwinnett', 'ftb'],
  },
  {
    id: 'dekalb-county-dpa',
    name: 'DeKalb County Affordable Housing DPA',
    shortName: 'DeKalb DPA',
    provider: 'DeKalb County Community Development',
    providerAbbr: 'DeKalb County',
    type: 'deferred_loan',
    amount_type: 'fixed',
    amount: 7500,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Sale, Refi, or Transfer',
    min_fico: 640,
    max_dti: 43,
    max_purchase_price: 300000,
    ami_percent: 80,
    max_income_note: '80% AMI (DeKalb MSA)',
    first_time_buyer_required: true,
    broker_eligible: true,
    eligible_loan_types: ['FHA', 'Conventional'],
    counties: ['DeKalb'],
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.dekalbcountyga.gov/community-development',
    notes: 'Unincorporated DeKalb County or eligible municipalities. Annual funding cycle — verify availability.',
    tags: ['county', 'deferred', 'dekalb', 'ftb'],
  },
  {
    id: 'savannah-dpa',
    name: 'City of Savannah DPA Program',
    shortName: 'Savannah DPA',
    provider: 'City of Savannah – Housing Dept.',
    providerAbbr: 'Savannah',
    type: 'forgivable',
    amount_type: 'fixed',
    amount: 15000,
    interest_rate: 0,
    forgivable_years: 10,
    deferred_until: 'Forgiven after 10 years owner-occupancy',
    min_fico: 620,
    max_dti: 45,
    max_purchase_price: 300000,
    ami_percent: 80,
    max_income_note: '80% AMI (Savannah MSA)',
    first_time_buyer_required: true,
    broker_eligible: false,
    eligible_loan_types: ['FHA', 'Conventional'],
    counties: ['Chatham'],
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.savannahga.gov/1175/Housing-Program',
    notes: '⚠️ Direct lenders only — not available through mortgage brokers. City of Savannah limits. 10-year forgiveness period.',
    tags: ['city', 'forgivable', 'savannah', 'ftb', 'direct-lender-only'],
  },
  {
    id: 'augusta-dpa',
    name: 'Augusta Housing & Community Development DPA',
    shortName: 'Augusta DPA',
    provider: 'Augusta-Richmond County HCD',
    providerAbbr: 'Augusta HCD',
    type: 'deferred_loan',
    amount_type: 'fixed',
    amount: 5000,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Sale or Property Transfer',
    min_fico: 620,
    max_dti: 43,
    max_purchase_price: 200000,
    ami_percent: 80,
    max_income_note: '80% AMI (Augusta MSA)',
    first_time_buyer_required: true,
    broker_eligible: false,
    eligible_loan_types: ['FHA', 'Conventional'],
    counties: ['Richmond'],
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.augustaga.gov/1016/Housing-Community-Development',
    notes: '⚠️ Direct lenders only. Augusta-Richmond County properties. Subject to annual HUD funding availability.',
    tags: ['city', 'deferred', 'augusta', 'ftb', 'direct-lender-only'],
  },
  {
    id: 'chenoa-fund-fha',
    name: 'Chenoa Fund – FHA DPA (3.5%)',
    shortName: 'Chenoa Fund FHA',
    provider: 'CBC Mortgage Agency',
    providerAbbr: 'Chenoa Fund',
    type: 'second_mortgage',
    amount_type: 'percentage',
    amount: 3.5,
    interest_rate: 0,
    forgivable_years: 3,
    deferred_until: 'Monthly payments; forgiven if on-time for 36 months (≤115% AMI)',
    min_fico: 600,
    max_dti: 50,
    max_purchase_price: null,
    ami_percent: null,
    max_income_note: 'No income limit — 0% rate if ≤115% AMI; 6% rate above 115%',
    first_time_buyer_required: false,
    broker_eligible: true,
    eligible_loan_types: ['FHA'],
    counties: 'statewide',
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: false,
    website: 'https://chenoafund.org',
    notes: 'Covers full 3.5% FHA down payment. No income limit. Must repay if refi before 36 months. Nationwide — available in all GA counties.',
    tags: ['nationwide', 'fha-only', 'no-income-limit', 'broker-friendly', 'no-ftb-req'],
  },
  {
    id: 'cbcma-fha-5pct',
    name: 'CBC Mortgage Agency – FHA DPA (5%)',
    shortName: 'CBCMA FHA 5%',
    provider: 'CBC Mortgage Agency',
    providerAbbr: 'CBCMA',
    type: 'second_mortgage',
    amount_type: 'percentage',
    amount: 5.0,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: 'Due at sale/refi; partial forgiveness terms vary',
    min_fico: 620,
    max_dti: 50,
    max_purchase_price: null,
    ami_percent: null,
    max_income_note: 'No income limit; rate and terms vary by program tier',
    first_time_buyer_required: false,
    broker_eligible: true,
    eligible_loan_types: ['FHA'],
    counties: 'statewide',
    stackable: false,
    stack_exceptions: [],
    homebuyer_ed: false,
    website: 'https://www.cbcma.com',
    notes: '5% covers down payment + partial closing costs. FHA only. No income limit — great for moderate-to-upper income borrowers who still need DPA.',
    tags: ['nationwide', 'fha-only', 'no-income-limit', 'broker-friendly', 'closing-costs', 'no-ftb-req'],
  },
  {
    id: 'fhlb-atlanta-ahp',
    name: 'FHLB Atlanta – Affordable Housing Program (AHP)',
    shortName: 'FHLB AHP',
    provider: 'Federal Home Loan Bank of Atlanta',
    providerAbbr: 'FHLB Atlanta',
    type: 'grant',
    amount_type: 'fixed',
    amount: 12500,
    interest_rate: 0,
    forgivable_years: null,
    deferred_until: null,
    min_fico: 620,
    max_dti: 45,
    max_purchase_price: null,
    ami_percent: 80,
    max_income_note: '80% AMI',
    first_time_buyer_required: true,
    broker_eligible: false,
    eligible_loan_types: ['FHA', 'VA', 'USDA', 'Conventional'],
    counties: 'statewide',
    stackable: true,
    stack_exceptions: [],
    homebuyer_ed: true,
    website: 'https://www.fhlbatl.com/community-investment/affordable-housing-program',
    notes: '⚠️ Must be originated through an FHLB Atlanta member bank — not available through mortgage brokers. True grant, no repayment. Award amount varies by year ($5K–$15K typical).',
    tags: ['federal', 'grant', 'no-repayment', 'ftb', 'bank-only'],
  },
];

// ─── RULE ENGINE ──────────────────────────────────────────────────────────────
function evaluateEligibility(program, scenario) {
  if (!scenario?.loaded) {
    return { eligible: 'unknown', score: 50, issues: [], warnings: ['Load a scenario for eligibility analysis'], cltv: null, dpaAmount: 0 };
  }

  const issues = [];
  const warnings = [];
  let eligible = true;

  const fico = parseInt(scenario.creditScore || scenario.fico || 0);
  const dti = parseFloat(scenario.dti || 0);
  const purchasePrice = parseFloat(scenario.propertyValue || scenario.purchasePrice || 0);
  const loanAmount = parseFloat(scenario.loanAmount || 0);
  const annualIncome = parseFloat(scenario.annualIncome || (scenario.monthlyIncome || 0) * 12 || 0);
  const loanType = (scenario.loanType || '').toUpperCase().replace('-', '').trim();
  const isFTB = scenario.isFirstTimeBuyer === true || scenario.isFirstTimeBuyer === 'true' || scenario.firstTimeBuyer === true;
  const county = (scenario.county || '').toLowerCase().replace(' county', '');

  const dpaAmount = program.amount_type === 'percentage'
    ? (loanAmount * program.amount / 100)
    : program.amount;

  const cltv = purchasePrice > 0 ? ((loanAmount + dpaAmount) / purchasePrice * 100) : null;

  // FICO
  if (fico > 0 && fico < program.min_fico) {
    eligible = false;
    issues.push(`FICO ${fico} below program minimum of ${program.min_fico}`);
  } else if (fico === 0) {
    warnings.push('Credit score missing — FICO eligibility not verified');
  }

  // DTI
  if (dti > 0 && dti > program.max_dti) {
    eligible = false;
    issues.push(`DTI ${dti.toFixed(1)}% exceeds max ${program.max_dti}%`);
  }

  // Purchase price
  if (program.max_purchase_price && purchasePrice > program.max_purchase_price) {
    eligible = false;
    issues.push(`Purchase $${purchasePrice.toLocaleString()} exceeds max $${program.max_purchase_price.toLocaleString()}`);
  }

  // Loan type
  if (loanType && program.eligible_loan_types?.length > 0) {
    const types = program.eligible_loan_types.map(t => t.toUpperCase().replace('-', ''));
    if (!types.includes(loanType)) {
      eligible = false;
      issues.push(`${loanType} not eligible — accepts: ${program.eligible_loan_types.join(', ')}`);
    }
  } else if (!loanType) {
    warnings.push(`Set loan type to verify — accepts: ${program.eligible_loan_types?.join(', ') || 'varies'}`);
  }

  // First-time buyer
  if (program.first_time_buyer_required && !isFTB) {
    eligible = false;
    issues.push('First-time homebuyer required — not flagged in scenario');
  }

  // AMI / Income
  if (program.ami_percent && annualIncome > 0) {
    const limit = getAMILimit(county, program.ami_percent, 3);
    if (annualIncome > limit) {
      eligible = false;
      issues.push(`Income $${annualIncome.toLocaleString()} may exceed ${program.ami_percent}% AMI (~$${Math.round(limit).toLocaleString()}) — verify county limit`);
    }
  } else if (program.ami_percent && !annualIncome) {
    warnings.push(`Income not in scenario — ${program.ami_percent}% AMI limit unverified`);
  }

  // Broker eligibility
  if (!program.broker_eligible) {
    warnings.push('Requires direct lender (bank) — not available through brokers');
  }

  // CLTV
  if (cltv !== null && cltv > 105) {
    warnings.push(`Combined LTV ${cltv.toFixed(1)}% — verify program allows > 105% CLTV`);
  }

  // Geographic
  if (Array.isArray(program.counties)) {
    const validCounties = program.counties.map(c => c.toLowerCase());
    if (county && !validCounties.some(c => county.includes(c) || c.includes(county))) {
      eligible = false;
      issues.push(`Property not in eligible area: ${program.counties.join(', ')} only`);
    } else if (!county) {
      warnings.push(`Geographic restriction: ${program.counties.join(', ')} only — verify property location`);
    }
  }

  const score = eligible
    ? Math.max(50, 100 - warnings.length * 8)
    : Math.max(0, 30 - issues.length * 8);

  return { eligible: eligible ? 'eligible' : 'ineligible', score, issues, warnings, cltv, dpaAmount };
}

// ─── STACKING ENGINE ──────────────────────────────────────────────────────────
const INCOMPATIBLE_PAIRS = [
  ['deferred_loan', 'deferred_loan'],
  ['deferred_loan', 'second_mortgage'],
  ['second_mortgage', 'second_mortgage'],
  ['forgivable', 'forgivable'],
];

function checkStackPair(a, b) {
  if (!a.stackable && !b.stackable) return { compatible: false, reason: `Neither program allows layering with other DPA` };
  if (!a.stackable) return { compatible: false, reason: `${a.shortName} does not allow stacking` };
  if (!b.stackable) return { compatible: false, reason: `${b.shortName} does not allow stacking` };
  if (a.stack_exceptions?.includes(b.id) || b.stack_exceptions?.includes(a.id)) {
    return { compatible: false, reason: `These two programs explicitly exclude each other` };
  }
  const typeA = a.type, typeB = b.type;
  const incompatible = INCOMPATIBLE_PAIRS.some(
    ([x, y]) => (typeA === x && typeB === y) || (typeA === y && typeB === x)
  );
  if (incompatible) return { compatible: false, reason: `Cannot combine ${typeA.replace('_', ' ')} + ${typeB.replace('_', ' ')}` };
  if (typeA === 'grant' || typeB === 'grant') return { compatible: true, reason: 'Grant may layer with other assistance — verify with lender' };
  if ((typeA === 'forgivable' && typeB === 'grant') || (typeA === 'grant' && typeB === 'forgivable')) {
    return { compatible: true, reason: 'Forgivable + grant may be allowed — confirm with lender' };
  }
  return { compatible: false, reason: 'Stacking rules inconclusive — verify with lender' };
}

function analyzeStack(selectedIds, allPrograms, scenario) {
  const programs = selectedIds.map(id => allPrograms.find(p => p.id === id)).filter(Boolean);
  if (programs.length < 2) return null;
  const pairs = [];
  for (let i = 0; i < programs.length; i++) {
    for (let j = i + 1; j < programs.length; j++) {
      pairs.push({ a: programs[i], b: programs[j], ...checkStackPair(programs[i], programs[j]) });
    }
  }
  const allCompatible = pairs.every(p => p.compatible);
  const loanAmt = parseFloat(scenario?.loanAmount || 0);
  const price = parseFloat(scenario?.propertyValue || 0);
  const totalDPA = programs.reduce((sum, p) => {
    return sum + (p.amount_type === 'percentage' ? loanAmt * p.amount / 100 : p.amount);
  }, 0);
  const combinedCLTV = price > 0 ? ((loanAmt + totalDPA) / price * 100) : null;
  const effDownPct = price > 0 ? ((price - loanAmt) / price * 100) : null;
  return { programs, pairs, allCompatible, totalDPA, combinedCLTV, effDownPct };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtAmt(program) {
  if (program.amount_type === 'percentage') return `${program.amount}% of loan`;
  return `$${program.amount.toLocaleString()}`;
}

const TYPE_META = {
  grant:          { label: 'Grant',          icon: '🎁', color: C.green,  bg: C.greenMuted },
  forgivable:     { label: 'Forgivable Loan', icon: '⏱', color: '#15803d', bg: '#dcfce7' },
  deferred_loan:  { label: 'Deferred Loan',  icon: '⏸', color: C.blue,   bg: C.blueDark },
  second_mortgage:{ label: '2nd Mortgage',   icon: '🏠', color: C.amber,  bg: C.amberDark },
};

const APPROVAL_STATES = ['unknown', 'requested', 'approved'];
const APPROVAL_META = {
  approved:  { label: '✓ Lender Approved',   color: C.green,  bg: C.greenMuted,  border: C.green },
  requested: { label: '⏳ Approval Requested', color: C.amber,  bg: C.amberDark,   border: C.amber },
  unknown:   { label: '? Approval Unknown',   color: C.textMuted, bg: C.card, border: C.border },
};

// ─── LENDER APPROVAL BADGE ────────────────────────────────────────────────────
function LenderApprovalBadge({ programId, status = 'unknown', onChange }) {
  const meta = APPROVAL_META[status] || APPROVAL_META.unknown;
  const cycle = () => {
    const idx = APPROVAL_STATES.indexOf(status);
    onChange(programId, APPROVAL_STATES[(idx + 1) % APPROVAL_STATES.length]);
  };
  return (
    <button
      onClick={cycle}
      title="Click to update lender approval status"
      style={{
        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', border: `1px solid ${meta.border}`,
        background: meta.bg, color: meta.color,
        transition: 'opacity 0.15s', letterSpacing: 0.2,
      }}
    >
      {meta.label}
    </button>
  );
}

// ─── ELIGIBILITY BADGE ────────────────────────────────────────────────────────
function EligibilityBadge({ status }) {
  const cfg = {
    eligible:   { label: '✓ Eligible',    bg: C.greenMuted,  color: C.green,  border: C.green },
    ineligible: { label: '✗ Ineligible',  bg: '#fef2f2',     color: '#dc2626', border: C.red },
    unknown:    { label: '? Verify',      bg: C.card,        color: C.textMuted, border: C.border },
  }[status] || { label: '? Verify', bg: C.card, color: C.textMuted, border: C.border };
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      letterSpacing: 0.3,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── PROGRAM CARD ─────────────────────────────────────────────────────────────
function ProgramCard({ program, eligibility, lenderStatus, onLenderChange, stackSelected, onToggleStack, isExpanded, onToggleExpand, onRequestApproval }) {
  const typeMeta = TYPE_META[program.type] || TYPE_META.deferred_loan;
  const hasIssues = eligibility.issues?.length > 0;
  const hasWarnings = eligibility.warnings?.length > 0;

  return (
    <div style={{
      background: C.card, border: `1px solid ${stackSelected ? C.blue : C.border}`,
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: stackSelected ? `0 0 0 2px ${C.blue}33` : 'none',
    }}>
      {/* Card Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                color: typeMeta.color, background: typeMeta.bg, padding: '2px 6px', borderRadius: 3,
              }}>
                {typeMeta.icon} {typeMeta.label}
              </span>
              {program.ai_sourced && (
                <span style={{ fontSize: 10, color: C.purple, background: '#3b0764', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
                  🤖 AI-Researched
                </span>
              )}
              {program.lender_sourced && (
                <span style={{ fontSize: 10, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
                  📋 Lender Program
                </span>
              )}
              {program.lender_sourced && lenderStatus === 'approved' && (
                <span style={{ fontSize: 10, color: C.green, background: C.greenMuted, padding: '2px 6px', borderRadius: 3, fontWeight: 700, border: `1px solid ${C.green}55` }}>
                  ✓ Approved Lender
                </span>
              )}
              {program.tags?.includes('no-ftb-req') && (
                <span style={{ fontSize: 10, color: '#94a3b8', background: '#1e293b', padding: '2px 6px', borderRadius: 3 }}>
                  No FTB Req
                </span>
              )}
              {!program.broker_eligible && (
                <span style={{ fontSize: 10, color: C.amber, background: C.amberDark, padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
                  ⚠ Bank Only
                </span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, lineHeight: 1.3 }}>{program.name}</div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{program.provider}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <EligibilityBadge status={eligibility.eligible} />
            <LenderApprovalBadge programId={program.id} status={lenderStatus} onChange={onLenderChange} />
          </div>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
        <MetricChip label="DPA Amount" value={fmtAmt(program)} accent={C.green} />
        <MetricChip label="Min FICO" value={program.min_fico} accent={C.textSecondary} />
        <MetricChip label="Max DTI" value={`${program.max_dti}%`} accent={C.textSecondary} />
        {program.max_purchase_price && (
          <MetricChip label="Max Price" value={`$${(program.max_purchase_price / 1000).toFixed(0)}K`} accent={C.textSecondary} />
        )}
        {program.ami_percent && (
          <MetricChip label="AMI Limit" value={`${program.ami_percent}% AMI`} accent={C.textSecondary} />
        )}
        {program.forgivable_years && (
          <MetricChip label="Forgiven" value={`${program.forgivable_years}yr`} accent={C.amber} />
        )}
        {eligibility.cltv !== null && (
          <MetricChip
            label="CLTV w/ DPA"
            value={`${eligibility.cltv.toFixed(1)}%`}
            accent={eligibility.cltv > 105 ? C.amber : C.green}
          />
        )}
      </div>

      {/* Loan Types + Geography */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {program.eligible_loan_types?.map(lt => (
            <span key={lt} style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 3, fontWeight: 600,
              background: '#1e3a5f', color: '#93c5fd', border: '1px solid #1d4ed8',
            }}>{lt}</span>
          ))}
        </div>
        <span style={{ color: C.textMuted, fontSize: 11 }}>
          📍 {Array.isArray(program.counties) ? program.counties.join(', ') : 'Statewide'}
        </span>
      </div>

      {/* Issues / Warnings (collapsed unless expanded) */}
      {(hasIssues || hasWarnings) && (
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}` }}>
          {hasIssues && eligibility.issues.map((issue, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fca5a5', display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>✗</span><span>{issue}</span>
            </div>
          ))}
          {hasWarnings && !isExpanded && eligibility.warnings.slice(0, 1).map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fde68a', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span><span>{w}</span>
            </div>
          ))}
          {hasWarnings && isExpanded && eligibility.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fde68a', display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span><span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded Notes */}
      {isExpanded && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6 }}>{program.notes}</div>
          {program.deferred_until && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>📋 Repayment: {program.deferred_until}</div>
          )}
          {program.homebuyer_ed && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>🎓 Homebuyer education course required</div>
          )}
          {program.website && (
            <a href={program.website} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: C.blue, marginTop: 6, display: 'inline-block' }}>
              ↗ Program Website
            </a>
          )}
        </div>
      )}

      {/* Card Footer */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onToggleExpand}
          style={{ fontSize: 12, color: C.textSecondary, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
          {isExpanded ? '▲ Less' : '▼ More details'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onRequestApproval(program)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${lenderStatus === 'approved' ? C.green : lenderStatus === 'requested' ? C.amber : C.border}`,
              background: lenderStatus === 'approved' ? C.greenMuted : lenderStatus === 'requested' ? C.amberDark : 'transparent',
              color: lenderStatus === 'approved' ? C.green : lenderStatus === 'requested' ? C.amber : C.textSecondary,
              transition: 'all 0.15s',
            }}>
            {lenderStatus === 'approved' ? '✓ Approved' : lenderStatus === 'requested' ? '⏳ Requested' : '📨 Request Approval'}
          </button>
          <button
            onClick={() => onToggleStack(program.id)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${stackSelected ? C.blue : C.border}`,
              background: stackSelected ? C.blueDark : 'transparent',
              color: stackSelected ? '#93c5fd' : C.textSecondary,
              transition: 'all 0.15s',
            }}>
            {stackSelected ? '✓ In Stack' : '+ Stack Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricChip({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent || C.textPrimary }}>{value}</span>
    </div>
  );
}

// ─── STACKING PANEL ────────────────────────────────────────────────────────────
function StackingPanel({ analysis, onClear }) {
  if (!analysis) return null;
  const { programs, pairs, allCompatible, totalDPA, combinedCLTV, effDownPct } = analysis;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${allCompatible ? C.blue : C.red}`,
      borderRadius: 10, padding: 20, marginBottom: 20,
      boxShadow: allCompatible ? `0 0 0 1px ${C.blue}44` : `0 0 0 1px ${C.red}44`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
            {allCompatible ? '✓ Stack Analysis — Compatible' : '✗ Stack Analysis — Incompatible'}
          </div>
          <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
            {programs.length} programs selected
          </div>
        </div>
        <button onClick={onClear}
          style={{ fontSize: 12, color: C.textMuted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, cursor: 'pointer', padding: '5px 10px' }}>
          Clear Stack
        </button>
      </div>

      {/* Combined metrics */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '12px 16px', background: C.card, borderRadius: 8, marginBottom: 14 }}>
        <MetricChip label="Total DPA" value={`$${Math.round(totalDPA).toLocaleString()}`} accent={C.green} />
        {combinedCLTV && <MetricChip label="Combined CLTV" value={`${combinedCLTV.toFixed(1)}%`} accent={combinedCLTV > 105 ? C.amber : C.green} />}
        {effDownPct && <MetricChip label="Effective Down %" value={`${effDownPct.toFixed(1)}%`} accent={C.textSecondary} />}
      </div>

      {/* Pair analysis */}
      {pairs.map((pair, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
          background: pair.compatible ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${pair.compatible ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 6, marginBottom: 8,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{pair.compatible ? '✓' : '✗'}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>
              {pair.a.shortName} + {pair.b.shortName}
            </div>
            <div style={{ fontSize: 12, color: pair.compatible ? C.green : '#fca5a5', marginTop: 2 }}>
              {pair.reason}
            </div>
          </div>
        </div>
      ))}

      {!allCompatible && (
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, padding: '8px 12px', background: C.redDark, borderRadius: 6, border: `1px solid #fecaca` }}>
          ⚠️ One or more program pairs are not stackable. Lender must approve any layering — always verify with your AE before promising stacked DPA.
        </div>
      )}
    </div>
  );
}

// ─── SCENARIO CONTEXT BAR ─────────────────────────────────────────────────────
function ScenarioContextBar({ scenario, activeState }) {
  if (!scenario?.loaded) return null;
  const fico = parseInt(scenario.creditScore || scenario.fico || 0);
  const dti = parseFloat(scenario.dti || 0);
  const price = parseFloat(scenario.propertyValue || 0);
  const loan = parseFloat(scenario.loanAmount || 0);
  const ltv = price > 0 ? (loan / price * 100).toFixed(1) : null;
  const income = parseFloat(scenario.annualIncome || 0);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '10px 16px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center',
    }}>
      <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Scenario Context</span>
      {fico > 0 && <CtxItem label="FICO" value={fico} accent={fico >= 680 ? C.green : fico >= 640 ? C.amber : C.red} />}
      {dti > 0 && <CtxItem label="DTI" value={`${dti}%`} accent={dti <= 43 ? C.green : dti <= 50 ? C.amber : C.red} />}
      {price > 0 && <CtxItem label="Purchase" value={`$${(price / 1000).toFixed(0)}K`} accent={C.textSecondary} />}
      {ltv && <CtxItem label="LTV" value={`${ltv}%`} accent={C.textSecondary} />}
      {income > 0 && <CtxItem label="Income" value={`$${(income / 1000).toFixed(0)}K/yr`} accent={C.textSecondary} />}
      {scenario.loanType && <CtxItem label="Loan Type" value={scenario.loanType} accent={C.blue} />}
      <CtxItem label="State" value={activeState} accent={activeState === 'GA' ? C.green : C.blue} />
    </div>
  );
}

function CtxItem({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent || C.textPrimary }}>{value}</span>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DPAIntelligence() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  // Auth
  const [user, setUser] = useState(null);
  useEffect(() => { const u = onAuthStateChanged(auth, setUser); return u; }, []);

  // Decision Record
  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving]   = useState(false);

  // AE Share modal
  const [aeShareTarget, setAeShareTarget] = useState(null); // { program }

  // Scenario
  const [scenario, setScenario] = useState({ loaded: false });
  const [scenarioLoading, setScenarioLoading] = useState(true);
  useEffect(() => {
    if (!scenarioId) { setScenarioLoading(false); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scenarios', scenarioId));
        if (snap.exists()) setScenario({ ...snap.data(), loaded: true });
      } catch (e) { console.error('Scenario load error:', e); }
      finally { setScenarioLoading(false); }
    })();
  }, [scenarioId]);

  // Active state (from scenario or manual override)
  const [activeState, setActiveState] = useState('GA');

  useEffect(() => {
    if (scenario?.loaded) {
      const st = (scenario.state || scenario.propertyState || 'GA').toUpperCase();
      setActiveState(st);
    }
  }, [scenario]);

  // Lender approvals (Firestore persisted)
  const [lenderApprovals, setLenderApprovals] = useState({});
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'loProfiles', user.uid));
        if (snap.exists()) setLenderApprovals(snap.data().dpaLenderApprovals || {});
      } catch (e) { console.error('Approval load error:', e); }
    })();
  }, [user]);

  const handleLenderApproval = useCallback(async (programId, status) => {
    const next = { ...lenderApprovals, [programId]: status };
    setLenderApprovals(next);
    if (!user) return;
    try {
      await setDoc(doc(db, 'loProfiles', user.uid), { dpaLenderApprovals: next }, { merge: true });
    } catch (e) { console.error('Approval save error:', e); }
  }, [user, lenderApprovals]);

  // Lender-sourced DPA programs (confirmed via Admin review)
  const [lenderDpaPrograms, setLenderDpaPrograms] = useState([]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'dpaPrograms', user.uid, 'confirmed'));
        const programs = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
          lender_sourced: true,
          broker_eligible: true, // lender-uploaded = already approved
        }));
        setLenderDpaPrograms(programs);
      } catch (e) { console.error('Lender DPA load error:', e); }
    })();
  }, [user]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterBrokerOnly, setFilterBrokerOnly] = useState(false);
  const [filterEligibleOnly, setFilterEligibleOnly] = useState(false);

  // ── localStorage autosave ─────────────────────────────────────────────────
  const LS_KEY = scenarioId ? `lb_dpaintelligence_${scenarioId}` : null;
  useEffect(() => {
    if (!LS_KEY) return;
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved?.filterType)     setFilterType(saved.filterType);
      if (saved?.filterBrokerOnly !== undefined) setFilterBrokerOnly(saved.filterBrokerOnly);
      if (saved?.filterEligibleOnly !== undefined) setFilterEligibleOnly(saved.filterEligibleOnly);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LS_KEY]);
  useEffect(() => {
    if (!LS_KEY) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ filterType, filterBrokerOnly, filterEligibleOnly })); } catch { /* ignore */ }
  }, [LS_KEY, filterType, filterBrokerOnly, filterEligibleOnly]);

  // Stack selection
  const [stackSelection, setStackSelection] = useState([]);

  // Expanded cards
  const [expandedCards, setExpandedCards] = useState({});
  const toggleExpand = (id) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));

  // Non-GA search
  const [nonGAPrograms, setNonGAPrograms] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Reset non-GA data when state changes
  useEffect(() => {
    setNonGAPrograms([]);
    setHasSearched(false);
    setSearchError(null);
    setStackSelection([]);
  }, [activeState]);

  // Programs source
  // Merge seed/AI programs with lender-confirmed programs
  // Filter lender programs by state match (or statewide if no state field)
  const lenderProgramsForState = useMemo(() => {
    return lenderDpaPrograms.filter(p => {
      if (!p.state) return true; // no state restriction = statewide
      return p.state.toUpperCase() === activeState;
    });
  }, [lenderDpaPrograms, activeState]);

  const basePrograms = useMemo(() => {
    const seed = activeState === 'GA' ? GEORGIA_DPA_PROGRAMS : nonGAPrograms;
    // Deduplicate by id — lender programs take precedence
    const lenderIds = new Set(lenderProgramsForState.map(p => p.id));
    return [...lenderProgramsForState, ...seed.filter(p => !lenderIds.has(p.id))];
  }, [activeState, nonGAPrograms, lenderProgramsForState]);

  // Eligibility map (memoized)
  const eligibilityMap = useMemo(() => {
    const map = {};
    basePrograms.forEach(p => { map[p.id] = evaluateEligibility(p, scenario); });
    return map;
  }, [basePrograms, scenario]);

  // Filtered programs
  const filteredPrograms = useMemo(() => {
    return basePrograms.filter(p => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hit = [p.name, p.provider, p.notes || '', (p.tags || []).join(' ')]
          .some(s => s.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filterType !== 'all' && p.type !== filterType) return false;
      if (filterBrokerOnly && !p.broker_eligible) return false;
      if (filterEligibleOnly && eligibilityMap[p.id]?.eligible !== 'eligible') return false;
      return true;
    });
  }, [basePrograms, searchQuery, filterType, filterBrokerOnly, filterEligibleOnly, eligibilityMap]);

  // Stack analysis
  const stackAnalysis = useMemo(() => {
    if (stackSelection.length < 2) return null;
    return analyzeStack(stackSelection, basePrograms, scenario);
  }, [stackSelection, basePrograms, scenario]);

  // Counts
  const eligibleCount = Object.values(eligibilityMap).filter(e => e.eligible === 'eligible').length;
  const ineligibleCount = Object.values(eligibilityMap).filter(e => e.eligible === 'ineligible').length;

  // Report to Decision Record whenever eligible programs are found
  useEffect(() => {
    if (!scenarioId || basePrograms.length === 0) return;
    const eligiblePrograms = basePrograms.filter(p => eligibilityMap[p.id]?.eligible === 'eligible');
    const topProgram = eligiblePrograms[0];
    reportFindings('DPA_INTELLIGENCE', {
      state: activeState,
      totalPrograms: basePrograms.length,
      eligibleCount,
      ineligibleCount,
      topProgram: topProgram ? { name: topProgram.name, provider: topProgram.provider, type: topProgram.type } : null,
      eligiblePrograms: eligiblePrograms.map(p => ({
        id: p.id,
        name: p.name,
        provider: p.provider,
        type: p.type,
        dpaAmount: eligibilityMap[p.id]?.dpaAmount,
        cltv: eligibilityMap[p.id]?.cltv,
        broker_eligible: p.broker_eligible,
      })),
      stackingAnalyzed: stackSelection.length >= 2,
      timestamp: new Date().toISOString(),
    }, [],
    eligibleCount === 0 ? [{ flagCode: 'NO_DPA', sourceModule: 'DPA_INTELLIGENCE', severity: 'WARNING', detail: `No eligible DPA programs found for ${activeState}` }] : [],
    '1.0.0'
    ).then(id => { if (id) setSavedRecordId(id); }).catch(() => {});
  }, [eligibilityMap, eligibleCount, ineligibleCount, basePrograms, activeState, scenarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle stack
  const toggleStack = (id) => {
    setStackSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Request Approval → open AEShareForm pre-populated with program context
  const handleRequestApproval = useCallback((program) => {
    setAeShareTarget({ program });
    // Optimistically mark as requested if currently unknown
    if ((lenderApprovals[program.id] || 'unknown') === 'unknown') {
      handleLenderApproval(program.id, 'requested');
    }
  }, [lenderApprovals, handleLenderApproval]);

  // Non-GA live search
  const handleNonGASearch = async () => {
    if (activeState === 'GA') return;
    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);
    setNonGAPrograms([]);

    try {
      const county = scenario?.county || '';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: `You are a down payment assistance program research specialist. Search the web for current DPA programs in the specified state. Respond ONLY with a valid JSON array. No markdown fences, no preamble, no explanation. Each object must have exactly these fields: id (short lowercase slug), name (string), provider (string), type (one of: grant|forgivable|deferred_loan|second_mortgage), amount_type (fixed|percentage), amount (number), min_fico (number, use 620 if unknown), max_dti (number, use 45 if unknown), max_purchase_price (number or null), ami_percent (number or null), max_income_note (string), first_time_buyer_required (boolean), broker_eligible (boolean), eligible_loan_types (array of strings), counties (string — "statewide" or comma-separated county names), stackable (boolean, default false), notes (string), website (string or ""). Return 5-10 programs maximum. Return ONLY the JSON array.`,
          messages: [{
            role: 'user',
            content: `Find current down payment assistance programs in ${activeState}${county ? `, focusing on ${county} county area` : ''}. Include the state HFA agency program and major city/county programs. Borrower context: purchase price $${scenario?.propertyValue || 'unknown'}, loan type ${scenario?.loanType || 'not specified'}, income $${scenario?.annualIncome || 'unknown'}/yr. Return JSON array only.`
          }]
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const textBlock = data.content?.find(b => b.type === 'text');
      if (!textBlock?.text) throw new Error('No response content received');

      const raw = textBlock.text.trim();
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Could not find JSON array in response — try again');

      const parsed = JSON.parse(jsonMatch[0]);
      const enriched = parsed.map((p, i) => ({
        shortName: (p.name || '').split('–')[0].split('-')[0].trim().slice(0, 40),
        providerAbbr: (p.provider || '').split(' ').slice(0, 3).join(' '),
        interest_rate: 0,
        forgivable_years: null,
        deferred_until: null,
        homebuyer_ed: false,
        stack_exceptions: [],
        tags: ['ai-sourced', activeState.toLowerCase()],
        ...p,
        id: p.id || `${activeState.toLowerCase()}-ai-${i}`,
        state: activeState,
        ai_sourced: true,
        stackable: p.stackable || false,
      }));
      setNonGAPrograms(enriched);
    } catch (err) {
      setSearchError(err.message || 'Search failed — please try again');
    } finally {
      setSearchLoading(false);
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: C.textPrimary, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 100 }}>

      {/* ── 1. DecisionRecordBanner — FIRST ───────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px 0' }}>
        <DecisionRecordBanner
          recordId={savedRecordId}
          moduleName="DPA Intelligence™"
          moduleKey="DPA_INTELLIGENCE"
          onSave={() => {}}
          saving={recordSaving}
        />
      </div>

      {/* ── 2. ModuleNav — SECOND ─────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <ModuleNav moduleNumber={9} />
      </div>

      {/* ── 3. Hero — flexbox: left flex:1 | right flexShrink:0 ──────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 16px' }}>
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl px-6 py-5">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'DM Serif Display, serif', margin: 0 }}>
                DPA Intelligence™
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Nationwide down payment assistance search engine · Georgia hardcoded + AI-powered out-of-state search
              </p>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, marginLeft: 24 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className="text-xs font-bold tracking-widest uppercase bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-400/30 text-indigo-300">
                  Stage 2 — Lender Fit
                </span>
                <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full border border-white/20">Module 9</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              </div>
              {scenario?.loaded && (
                <div className="bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-right" style={{ minWidth: 190 }}>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    {[scenario.firstName, scenario.lastName].filter(Boolean).join(' ') || 'Borrower'}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '2px 0' }}>
                    {scenario.loanAmount ? `$${Number(scenario.loanAmount).toLocaleString()}` : '—'}
                  </p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    {scenario.loanType || 'N/A'}{activeState ? ` · ${activeState}` : ''}
                  </p>
                </div>
              )}
              {activeState === 'GA' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <StatBadge value={eligibleCount} label="Eligible" color={C.green} />
                  <StatBadge value={ineligibleCount} label="Ineligible" color={C.red} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. ScenarioHeader bar ─────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <ScenarioHeader scenario={scenario?.loaded ? scenario : null} moduleNumber={9} scenarioId={scenarioId} />
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 20px' }}>
        {/* Scenario Context Bar */}
        <ScenarioContextBar scenario={scenario} activeState={activeState} />

        {/* State Selector */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                Property State
              </label>
              <input
                type="text"
                value={activeState}
                onChange={e => setActiveState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="GA"
                maxLength={2}
                style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                  color: C.textPrimary, padding: '6px 10px', fontSize: 15, fontWeight: 700,
                  width: 60, textAlign: 'center', letterSpacing: 1,
                }}
              />
            </div>
            {activeState !== 'GA' && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 8 }}>
                  {hasSearched && nonGAPrograms.length > 0
                    ? `✓ Found ${nonGAPrograms.length} DPA programs in ${activeState} via AI web search`
                    : `AI will search for current DPA programs in ${activeState} using live web search.`}
                </div>
                <button
                  onClick={handleNonGASearch}
                  disabled={searchLoading}
                  style={{
                    background: searchLoading ? C.surface : C.blue, color: '#fff',
                    border: 'none', borderRadius: 6, padding: '8px 18px',
                    fontSize: 13, fontWeight: 600, cursor: searchLoading ? 'wait' : 'pointer',
                    opacity: searchLoading ? 0.7 : 1,
                  }}>
                  {searchLoading ? '🔍 Searching...' : `🔍 Search ${activeState} DPA Programs`}
                </button>
                {searchError && (
                  <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 8 }}>⚠ {searchError}</div>
                )}
              </div>
            )}
            {activeState === 'GA' && (
              <div style={{ fontSize: 12, color: C.textMuted }}>
                ✓ Georgia — {GEORGIA_DPA_PROGRAMS.length} programs loaded from verified seed database
              </div>
            )}
          </div>
        </div>

        {/* Stacking Panel */}
        {stackSelection.length >= 2 && (
          <StackingPanel analysis={stackAnalysis} onClear={() => setStackSelection([])} />
        )}

        {/* Filter Bar */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search programs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.textPrimary, padding: '7px 12px', fontSize: 13, flex: 1, minWidth: 180,
            }}
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSecondary, padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}>
            <option value="all">All Types</option>
            <option value="grant">Grants</option>
            <option value="forgivable">Forgivable</option>
            <option value="deferred_loan">Deferred Loans</option>
            <option value="second_mortgage">2nd Mortgages</option>
          </select>
          <ToggleFilter label="Broker-Eligible Only" active={filterBrokerOnly} onToggle={() => setFilterBrokerOnly(p => !p)} color={C.green} />
          <ToggleFilter label="Eligible Only" active={filterEligibleOnly} onToggle={() => setFilterEligibleOnly(p => !p)} color={C.blue} />
          {stackSelection.length > 0 && (
            <button
              onClick={() => setStackSelection([])}
              style={{ fontSize: 12, color: C.amber, background: 'none', border: `1px solid ${C.amberDark}`, borderRadius: 5, cursor: 'pointer', padding: '5px 10px' }}>
              Clear Stack ({stackSelection.length})
            </button>
          )}
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
            {filteredPrograms.length} of {basePrograms.length} programs
          </span>
        </div>

        {/* Non-GA empty state */}
        {activeState !== 'GA' && !searchLoading && !hasSearched && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.textSecondary, marginBottom: 8 }}>
              Ready to search {activeState} DPA programs
            </div>
            <div style={{ fontSize: 13 }}>
              Click "Search {activeState} DPA Programs" above to find current programs via live web search.
            </div>
          </div>
        )}

        {activeState !== 'GA' && !searchLoading && hasSearched && nonGAPrograms.length === 0 && !searchError && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.textSecondary, marginBottom: 8 }}>No programs returned</div>
            <div style={{ fontSize: 13 }}>Try searching again — results may vary. Consider verifying directly with the state HFA.</div>
          </div>
        )}

        {activeState !== 'GA' && nonGAPrograms.length > 0 && (
          <div style={{ background: '#faf5ff', border: `1px solid #e9d5ff`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#6d28d9' }}>
            🤖 AI-Researched Programs — These results were found via live web search and have not been manually verified. Always confirm program details with the state HFA or program administrator before promising DPA to a borrower.
          </div>
        )}

        {/* Program Grid */}
        {(activeState === 'GA' || filteredPrograms.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
            {filteredPrograms.map(program => (
              <ProgramCard
                key={program.id}
                program={program}
                eligibility={eligibilityMap[program.id] || { eligible: 'unknown', issues: [], warnings: [] }}
                lenderStatus={lenderApprovals[program.id] || 'unknown'}
                onLenderChange={handleLenderApproval}
                stackSelected={stackSelection.includes(program.id)}
                onToggleStack={toggleStack}
                isExpanded={!!expandedCards[program.id]}
                onToggleExpand={() => toggleExpand(program.id)}
                onRequestApproval={handleRequestApproval}
              />
            ))}
          </div>
        )}

        {filteredPrograms.length === 0 && basePrograms.length > 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.textMuted }}>
            <div style={{ fontSize: 13 }}>No programs match your current filters.</div>
            <button onClick={() => { setSearchQuery(''); setFilterType('all'); setFilterBrokerOnly(false); setFilterEligibleOnly(false); }}
              style={{ marginTop: 10, fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* AE Share Form Modal — Request Approval */}
      {aeShareTarget && (
        <AEShareForm
          scenarioId={scenarioId}
          prePopulate={{
            subject: `DPA Approval Request — ${aeShareTarget.program.name}`,
            programName: aeShareTarget.program.name,
            programProvider: aeShareTarget.program.provider,
            programType: aeShareTarget.program.type,
            notes: `Requesting lender approval to broker the ${aeShareTarget.program.name} DPA program offered by ${aeShareTarget.program.provider}. Please confirm eligibility and submit required approvals.`,
          }}
          onClose={() => setAeShareTarget(null)}
          onSent={() => {
            handleLenderApproval(aeShareTarget.program.id, 'requested');
            setAeShareTarget(null);
          }}
        />
      )}

</div>
  );
}

// ─── MINOR UI HELPERS ─────────────────────────────────────────────────────────
function StatBadge({ value, label, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
    </div>
  );
}

function ToggleFilter({ label, active, onToggle, color }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${active ? color : C.border}`,
        background: active ? `${color}22` : 'transparent',
        color: active ? color : C.textMuted,
        transition: 'all 0.15s',
      }}>
      {active ? '✓ ' : ''}{label}
    </button>
  );
}
