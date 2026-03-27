#!/usr/bin/env node
'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   LoanBeacons — 17 Demo Scenario Seed Script                ║
 * ║   Matches exact ScenarioCreator Firestore schema            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * SETUP (one-time):
 *   1. Firebase Console → Project Settings → Service Accounts
 *      → Generate New Private Key → save as serviceAccountKey.json
 *      → drop it in: C:\Users\Sherae's Computer\loanbeacons-app\
 *
 *   2. Install firebase-admin (if not already):
 *      npm install firebase-admin
 *
 * RUN:
 *   cd "C:\Users\Sherae's Computer\loanbeacons-app"
 *   node seed-demo-scenarios.cjs
 *
 * Re-running is safe — existing DEMO scenarios are deleted first.
 */

const admin = require('firebase-admin');

try {
  const sa = require('./serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} catch (e) {
  console.error('\n❌  serviceAccountKey.json not found.');
  console.error('    Firebase Console → Project Settings → Service Accounts → Generate New Private Key\n');
  process.exit(1);
}

const db = admin.firestore();
const TS = admin.firestore.Timestamp;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pi(principal, annualRatePct, termMonths = 360) {
  const r = annualRatePct / 100 / 12;
  return Math.round(
    (principal * r * Math.pow(1 + r, termMonths)) /
    (Math.pow(1 + r, termMonths) - 1) * 100
  ) / 100;
}

function r2(n) { return Math.round(n * 100) / 100; }
function frontDtiCalc(housing, income) { return r2(housing / income * 100); }
function backDtiCalc(housing, debts, income) { return r2((housing + debts) / income * 100); }

function ts(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return TS.fromDate(d);
}

function base(o) {
  return Object.assign({
    addressVerified:       true,
    annualHouseholdIncome: 0,
    annualNOI:             0,
    arvValue:              0,
    asIsValue:             0,
    ausCaseNumber:         '',
    avgMonthlyDeposits:    0,
    bankStmtPeriod:        '24',
    censusTract:           null,
    citizenship:           'US_CITIZEN',
    coBorrowerIncome:      0,
    coBorrowers:           [],
    constructionBudget:    0,
    conventionalInvestor:  '',
    depletionPeriod:       360,
    drawScheduleType:      '',
    dscrRatio:             0,
    dtiRatio:              0,
    estimatedCashToClose:  0,
    exitStrategy:          '',
    expenseRatio:          50,
    floodInsurance:        0,
    hoaDues:               0,
    holdPeriod:            '',
    householdSize:         0,
    insEstimated:          false,
    landAcquisitionCost:   0,
    losLoanNumber:         '',
    lotValue:              0,
    ltcRatio:              0,
    miAutoCalc:            true,
    monthlyRent:           0,
    mortgageInsurance:     0,
    occupancy:             'Primary Residence',
    otherIncome:           0,
    postCloseReserves:     0,
    propertyType:          'Single Family',
    rehabBudget:           0,
    secondMortgage:        0,
    sellerConcessions:     0,
    state:                 'GA',
    status:                'active',
    taxEstimated:          false,
    term:                  360,
    totalQualifyingAssets: 0,
    unit:                  '',
    vaEntitlement:         'FULL',
    vaFundingFeeExempt:    false,
  }, o);
}

// ─── 17 Scenarios ─────────────────────────────────────────────────────────────

const scenarios = [];

// M01 · ScenarioCreator · Marcus & Tanya Webb · FHA · Covington
{
  const P = 301080, rate = 7.125, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 130, tax = 260, debts = 200, income = 6533;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Marcus & Tanya Webb - FHA Purchase - Covington',
    loanBeaconsRef: 'LB-2026-DEMO01',
    firstName: 'Marcus', lastName: 'Webb',
    coBorrowers: [{ firstName: 'Tanya', lastName: 'Webb', creditScore: 631, monthlyIncome: 0 }],
    creditScore: 647, loanType: 'FHA', loanPurpose: 'PURCHASE',
    streetAddress: '142 Elm Grove Way', city: 'Covington', county: 'Newton', zipCode: '30014',
    propertyValue: 312000, loanAmount: P, downPayment: 10920, ltv: 96.5,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    sellerConcessions: 6000,
    created_at: ts(16), updated_at: ts(16),
  }));
}

// M02 · QualifyingIntel · Carlos Mendez · Conventional · Lawrenceville
{
  const P = 406600, rate = 7.0, miRate = 0.0052;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 142, tax = 340, debts = 850, income = 8958;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Carlos Mendez - Conventional Purchase - Lawrenceville',
    loanBeaconsRef: 'LB-2026-DEMO02',
    firstName: 'Carlos', lastName: 'Mendez',
    creditScore: 718, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '891 Sugarloaf Pkwy', city: 'Lawrenceville', county: 'Gwinnett', zipCode: '30043',
    propertyValue: 428000, loanAmount: P, downPayment: 21400, ltv: 95.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(15), updated_at: ts(15),
  }));
}

// M03 · Income Analyzer · Priya & Raj Patel · Conventional · Johns Creek
{
  const P = 526500, rate = 7.0, miRate = 0.0044;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 180, tax = 490, debts = 400;
  const priyaInc = 7833, rajInc = 6234, totalInc = priyaInc + rajInc;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Priya & Raj Patel - Conventional Purchase - Johns Creek',
    loanBeaconsRef: 'LB-2026-DEMO03',
    firstName: 'Priya', lastName: 'Patel',
    coBorrowers: [{ firstName: 'Raj', lastName: 'Patel', creditScore: 741, monthlyIncome: rajInc }],
    coBorrowerIncome: rajInc,
    creditScore: 754, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '4820 State Bridge Rd', city: 'Johns Creek', county: 'Fulton', zipCode: '30022',
    propertyValue: 585000, loanAmount: P, downPayment: 58500, ltv: 90.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: priyaInc, totalIncome: totalInc, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, totalInc), backDti: backDtiCalc(housing, debts, totalInc),
    created_at: ts(14), updated_at: ts(14),
  }));
}

// M04 · Lender Match · David & Nakia Kim · FHA · Snellville
{
  const P = 307835, rate = 7.625, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 122, tax = 258, debts = 320, income = 6200;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'David & Nakia Kim - FHA Purchase - Snellville',
    loanBeaconsRef: 'LB-2026-DEMO04',
    firstName: 'David', lastName: 'Kim',
    coBorrowers: [{ firstName: 'Nakia', lastName: 'Kim', creditScore: 589, monthlyIncome: 0 }],
    creditScore: 601, loanType: 'FHA', loanPurpose: 'PURCHASE',
    streetAddress: '2150 Scenic Hwy N', city: 'Snellville', county: 'Gwinnett', zipCode: '30078',
    propertyValue: 319000, loanAmount: P, downPayment: 11165, ltv: 96.5,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(13), updated_at: ts(13),
  }));
}

// M05 · DPA Intelligence · Aaliyah Johnson · FHA/DPA · Stonecrest
{
  const P = 240285, rate = 7.375, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 96, tax = 196, debts = 145, income = 4400;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Aaliyah Johnson - FHA Purchase - Stonecrest',
    loanBeaconsRef: 'LB-2026-DEMO05',
    firstName: 'Aaliyah', lastName: 'Johnson',
    creditScore: 638, loanType: 'FHA', loanPurpose: 'PURCHASE',
    streetAddress: '7750 Stonecrest Concourse', city: 'Stonecrest', county: 'DeKalb', zipCode: '30038',
    propertyValue: 249000, loanAmount: P, downPayment: 8715, ltv: 96.5,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    annualHouseholdIncome: 52800, householdSize: 3,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    sellerConcessions: 4900,
    created_at: ts(12), updated_at: ts(12),
  }));
}

// M06 · Debt Resolution Engine · Robert & Lisa Harmon · Conv · McDonough
{
  const P = 357600, rate = 7.0;
  const piAmt = pi(P, rate);
  const ins = 148, tax = 373, debts = 1030, income = 7556; // debts: car $480+CC1 $220+CC2 $180+student $150
  const housing = r2(piAmt + ins + tax); // 80% LTV — no PMI
  scenarios.push(base({
    scenarioName: 'Robert & Lisa Harmon - Conventional Purchase - McDonough',
    loanBeaconsRef: 'LB-2026-DEMO06',
    firstName: 'Robert', lastName: 'Harmon',
    coBorrowers: [{ firstName: 'Lisa', lastName: 'Harmon', creditScore: 678, monthlyIncome: 0 }],
    creditScore: 692, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '508 Raintree Ln', city: 'McDonough', county: 'Henry', zipCode: '30253',
    propertyValue: 447000, loanAmount: P, downPayment: 89400, ltv: 80.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: 0,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(11), updated_at: ts(11),
  }));
}

// M07 · AUS Rescue · Shanna Arscott · FHA · Marietta (DU Refer — canonical test)
{
  const P = 374420, rate = 7.5, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 132, tax = 320, debts = 666, income = 7500;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Shanna Arscott - FHA Purchase - Marietta (DU Refer)',
    loanBeaconsRef: 'LB-2026-DEMO07',
    firstName: 'Shanna', lastName: 'Arscott',
    creditScore: 622, loanType: 'FHA', loanPurpose: 'PURCHASE',
    ausCaseNumber: 'DU-2026-SHR-001',
    streetAddress: '1244 Whitlock Ave NW', city: 'Marietta', county: 'Cobb', zipCode: '30062',
    propertyValue: 388000, loanAmount: P, downPayment: 13580, ltv: 96.5,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(10), updated_at: ts(10),
  }));
}

// M08 · CreditIntel · Jerome & Keisha Williams · Conv · Augusta
{
  const P = 254600, rate = 7.25, miRate = 0.0058;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 98, tax = 210, debts = 350, income = 5800;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Jerome & Keisha Williams - Conventional Purchase - Augusta',
    loanBeaconsRef: 'LB-2026-DEMO08',
    firstName: 'Jerome', lastName: 'Williams',
    coBorrowers: [{ firstName: 'Keisha', lastName: 'Williams', creditScore: 611, monthlyIncome: 0 }],
    creditScore: 624, // Jerome mid — Keisha mid 611 controls file
    loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '2211 Wrightsboro Rd', city: 'Augusta', county: 'Richmond', zipCode: '30901',
    propertyValue: 268000, loanAmount: P, downPayment: 13400, ltv: 95.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(9), updated_at: ts(9),
  }));
}

// M09 · ARM Structure Intel · Michael & Sarah Chen · Jumbo · Alpharetta
{
  const P = 700000, rate = 6.375; // 7/1 ARM start rate
  const piAmt = pi(P, rate);
  const ins = 220, tax = 730, debts = 600, income = 15600;
  const housing = r2(piAmt + ins + tax); // 80% LTV — no PMI, jumbo portfolio
  scenarios.push(base({
    scenarioName: 'Michael & Sarah Chen - Jumbo 7/1 ARM Purchase - Alpharetta',
    loanBeaconsRef: 'LB-2026-DEMO09',
    firstName: 'Michael', lastName: 'Chen',
    coBorrowers: [{ firstName: 'Sarah', lastName: 'Chen', creditScore: 769, monthlyIncome: 0 }],
    creditScore: 782, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    conventionalInvestor: 'PORTFOLIO',
    streetAddress: '4405 Old Milton Pkwy', city: 'Alpharetta', county: 'Fulton', zipCode: '30022',
    propertyValue: 875000, loanAmount: P, downPayment: 175000, ltv: 80.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: 0,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(8), updated_at: ts(8),
  }));
}

// M10 · FHA Streamline · Patricia Moore · Refi · Macon
{
  const P = 167500, rate = 6.375, miRate = 0.0055; // target streamline rate
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 78, tax = 155, debts = 285, income = 4200;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Patricia Moore - FHA Streamline Refi - Macon',
    loanBeaconsRef: 'LB-2026-DEMO10',
    firstName: 'Patricia', lastName: 'Moore',
    creditScore: 661, loanType: 'FHA', loanPurpose: 'REFINANCE',
    streetAddress: '3344 Forsyth Rd', city: 'Macon', county: 'Bibb', zipCode: '31201',
    propertyValue: 195000, loanAmount: P, downPayment: 0, ltv: 85.9,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(7), updated_at: ts(7),
  }));
}

// M11 · VA IRRRL · SGT James Holloway · VA · Warner Robins
{
  const P = 248000, rate = 6.0; // target IRRRL rate
  const piAmt = pi(P, rate);
  const ins = 95, tax = 195, debts = 380, income = 5800;
  const housing = r2(piAmt + ins + tax); // VA — no MI
  scenarios.push(base({
    scenarioName: 'SGT James Holloway - VA IRRRL - Warner Robins',
    loanBeaconsRef: 'LB-2026-DEMO11',
    firstName: 'James', lastName: 'Holloway',
    creditScore: 698, loanType: 'VA', loanPurpose: 'REFINANCE',
    vaEntitlement: 'FULL', vaFundingFeeExempt: true, // 10% disability rating
    streetAddress: '118 Robins Pkwy', city: 'Warner Robins', county: 'Houston', zipCode: '31088',
    propertyValue: 285000, loanAmount: P, downPayment: 0, ltv: 87.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: 0,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(6), updated_at: ts(6),
  }));
}

// M12 · CRA Eligibility Intel · Diana & Marco Cruz · FHA · South Atlanta
{
  const P = 191070, rate = 7.25, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 78, tax = 158, debts = 310, income = 5100;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Diana & Marco Cruz - FHA Purchase - South Atlanta',
    loanBeaconsRef: 'LB-2026-DEMO12',
    firstName: 'Diana', lastName: 'Cruz',
    coBorrowers: [{ firstName: 'Marco', lastName: 'Cruz', creditScore: 658, monthlyIncome: 0 }],
    creditScore: 671, loanType: 'FHA', loanPurpose: 'PURCHASE',
    streetAddress: '882 Cleveland Ave SW', city: 'Atlanta', county: 'Fulton', zipCode: '30315',
    propertyValue: 198000, loanAmount: P, downPayment: 6930, ltv: 96.5,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    annualHouseholdIncome: 61200, householdSize: 4,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    sellerConcessions: 3900,
    created_at: ts(5), updated_at: ts(5),
  }));
}

// M13 · Piggyback Optimizer · Andrew & Beth Mitchell · 80/10/10 · Roswell
{
  const P = 419200, rate = 7.0;
  const piAmt = pi(P, rate);
  const ins = 168, tax = 437, debts = 400, income = 9400;
  const housing = r2(piAmt + ins + tax); // 80% LTV 1st — no PMI
  scenarios.push(base({
    scenarioName: 'Andrew & Beth Mitchell - Conventional 80/10/10 Purchase - Roswell',
    loanBeaconsRef: 'LB-2026-DEMO13',
    firstName: 'Andrew', lastName: 'Mitchell',
    coBorrowers: [{ firstName: 'Beth', lastName: 'Mitchell', creditScore: 736, monthlyIncome: 0 }],
    creditScore: 748, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '1155 Mansell Rd', city: 'Roswell', county: 'Fulton', zipCode: '30076',
    propertyValue: 524000, loanAmount: P, downPayment: 52400, ltv: 80.0,
    secondMortgage: 52400, // HELOC — 10% piggyback
    interestRate: rate, piPayment: piAmt, mortgageInsurance: 0,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(4), updated_at: ts(4),
  }));
}

// M14 · DisclosureIntel · Thomas & Grace Park · Conventional · Duluth
{
  const P = 378100, rate = 7.0, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 132, tax = 332, debts = 480, income = 8500;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Thomas & Grace Park - Conventional Purchase - Duluth',
    loanBeaconsRef: 'LB-2026-DEMO14',
    firstName: 'Thomas', lastName: 'Park',
    coBorrowers: [{ firstName: 'Grace', lastName: 'Park', creditScore: 714, monthlyIncome: 0 }],
    creditScore: 728, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '3655 Peachtree Industrial Blvd', city: 'Duluth', county: 'Gwinnett', zipCode: '30096',
    propertyValue: 398000, loanAmount: P, downPayment: 19900, ltv: 95.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(3), updated_at: ts(3),
  }));
}

// M15 · ComplianceIntel · Donna Reed · FHA · Columbus
{
  const P = 220985, rate = 7.375, miRate = 0.0055;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 88, tax = 185, debts = 225, income = 4316;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Donna Reed - FHA Purchase - Columbus',
    loanBeaconsRef: 'LB-2026-DEMO15',
    firstName: 'Donna', lastName: 'Reed',
    creditScore: 643, loanType: 'FHA', loanPurpose: 'PURCHASE',
    streetAddress: '1420 Veterans Pkwy', city: 'Columbus', county: 'Muscogee', zipCode: '31901',
    propertyValue: 229000, loanAmount: P, downPayment: 8015, ltv: 96.5,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    sellerConcessions: 4400,
    created_at: ts(2), updated_at: ts(2),
  }));
}

// M16 · FloodIntel · Nathan & Beth Cooper · Conventional · Savannah (FEMA Zone AE)
{
  const P = 258300, rate = 7.0, miRate = 0.0044;
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 105, tax = 240, flood = 153, debts = 400, income = 6083;
  const housing = r2(piAmt + miAmt + ins + tax + flood); // flood insurance in PITI/DTI
  scenarios.push(base({
    scenarioName: 'Nathan & Beth Cooper - Conventional Purchase - Savannah',
    loanBeaconsRef: 'LB-2026-DEMO16',
    firstName: 'Nathan', lastName: 'Cooper',
    coBorrowers: [{ firstName: 'Beth', lastName: 'Cooper', creditScore: 711, monthlyIncome: 0 }],
    creditScore: 724, loanType: 'CONVENTIONAL', loanPurpose: 'PURCHASE',
    streetAddress: '208 Isle of Hope Rd', city: 'Savannah', county: 'Chatham', zipCode: '31401',
    propertyValue: 287000, loanAmount: P, downPayment: 28700, ltv: 90.0,
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, floodInsurance: flood, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(1), updated_at: ts(1),
  }));
}

// M17 · Rehab Intelligence · Kevin & Amanda Foster · FHA 203k · East Point
{
  const P = 243180, rate = 7.5, miRate = 0.0055; // 96.5% of total project $252k
  const piAmt = pi(P, rate), miAmt = r2(P * miRate / 12);
  const ins = 96, tax = 195, debts = 370, income = 5750;
  const housing = r2(piAmt + miAmt + ins + tax);
  scenarios.push(base({
    scenarioName: 'Kevin & Amanda Foster - FHA 203k Purchase - East Point',
    loanBeaconsRef: 'LB-2026-DEMO17',
    firstName: 'Kevin', lastName: 'Foster',
    coBorrowers: [{ firstName: 'Amanda', lastName: 'Foster', creditScore: 642, monthlyIncome: 0 }],
    creditScore: 659, loanType: 'FHA', loanPurpose: 'PURCHASE',
    streetAddress: '1840 Sylvan Rd SW', city: 'East Point', county: 'Fulton', zipCode: '30344',
    propertyValue: 252000, // total project cost (purchase + rehab)
    loanAmount: P, downPayment: 8820, ltv: 96.5,
    rehabBudget: 88000, constructionBudget: 88000,
    asIsValue: 164000, // purchase price
    arvValue: 298000,  // after-repair value
    interestRate: rate, piPayment: piAmt, mortgageInsurance: miAmt,
    homeInsurance: ins, propTaxes: tax, totalHousing: housing,
    monthlyIncome: income, totalIncome: income, monthlyDebts: debts,
    frontDti: frontDtiCalc(housing, income), backDti: backDtiCalc(housing, debts, income),
    created_at: ts(0), updated_at: ts(0),
  }));
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🚀  LoanBeacons Demo Scenario Seeder');
  console.log('━'.repeat(56));

  // Remove existing demo scenarios so re-runs are safe
  const existing = await db.collection('scenarios')
    .where('loanBeaconsRef', '>=', 'LB-2026-DEMO')
    .where('loanBeaconsRef', '<=', 'LB-2026-DEMO99')
    .get();

  if (!existing.empty) {
    console.log(`\n🗑   Removing ${existing.size} existing demo scenario(s)...`);
    const del = db.batch();
    existing.docs.forEach(d => del.delete(d.ref));
    await del.commit();
    console.log('    Done.\n');
  }

  // Write all 17 in a single batch
  const batch = db.batch();
  scenarios.forEach(s => {
    batch.set(db.collection('scenarios').doc(), s);
    console.log(`  ✓  ${s.loanBeaconsRef}  ${s.scenarioName}`);
  });

  await batch.commit();

  console.log('\n' + '━'.repeat(56));
  console.log('✅  17 demo scenarios seeded successfully!');
  console.log('    Ctrl+Shift+R → Scenarios page to confirm.\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('\n❌  Seed failed:', err.message);
  process.exit(1);
});
