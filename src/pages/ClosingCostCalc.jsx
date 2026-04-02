// src/pages/ClosingCostCalc.jsx
// LoanBeacons™ — Module 10 | Stage 2: Lender Fit
// Closing Cost Calculator™ — National, state-aware, AI-powered estimates

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ─── Attorney-closing states ──────────────────────────────────────────────────
const ATTORNEY_STATES = ['GA','SC','NC','NY','MA','CT','RI','VT','NH','ME','WV','DE','VA','KY','TN','MS','AL'];
const TRANSFER_TAX_STATES = ['CA','NY','NJ','PA','MD','VA','DC','FL','IL','CO','WA','OR','MN','CT','MA','RI','VT','NH','ME','HI','DE','GA','SC','NC','AL','MS','TN','KY','WV','IN','OH','MI','WI','MN','IA','MO','AR','LA'];
const HIGH_TRANSFER_TAX = ['NY','DC','NJ','WA','MN','IL'];

// ─── Fee definitions ──────────────────────────────────────────────────────────
const FEE_GROUPS = [
  {
    id: 'lender',
    label: 'Lender Fees',
    icon: '🏦',
    color: 'blue',
    fees: [
      {
        id: 'origination',
        label: 'Origination Fee',
        payer: 'buyer',
        negotiable: true,
        description: 'Charged by the lender for processing and underwriting the loan. Sometimes called a "lender fee" or "underwriting fee."',
        whoPaysTip: 'Always paid by the borrower unless offset by a lender credit. VA loans: lender may charge up to 1% flat fee.',
        loanTypeTips: { VA: 'VA allows a flat 1% origination fee instead of itemized lender fees.', FHA: 'FHA allows normal origination fees. No prepayment penalty.', USDA: 'USDA allows normal lender fees.' },
        typicalRange: '0.5%–1.0% of loan amount',
        isPercent: true,
        autoCalc: (loan) => Math.round(loan * 0.005),
      },
      {
        id: 'discount_points',
        label: 'Discount Points',
        payer: 'buyer',
        negotiable: true,
        description: 'Optional prepaid interest paid upfront to permanently reduce the interest rate. Each point = 1% of loan amount and typically reduces rate by 0.125%–0.25%.',
        whoPaysTip: 'Paid by borrower or seller (if seller-funded buydown). Points may be tax-deductible — advise borrower to consult tax advisor.',
        loanTypeTips: { VA: 'Seller can pay discount points for VA loans — common negotiating tool.' },
        typicalRange: '0–2% of loan (optional)',
        isPercent: true,
        autoCalc: () => 0,
      },
      {
        id: 'processing',
        label: 'Processing Fee',
        payer: 'buyer',
        negotiable: true,
        description: 'Covers the cost of processing the loan application, gathering documents, and coordinating with all parties.',
        whoPaysTip: 'Typically paid by the borrower. Some lenders roll this into the origination fee.',
        loanTypeTips: {},
        typicalRange: '$400–$900',
        isPercent: false,
        autoCalc: () => 695,
      },
      {
        id: 'underwriting',
        label: 'Underwriting Fee',
        payer: 'buyer',
        negotiable: true,
        description: 'Fee charged by the lender for the underwriter who reviews and approves the loan file.',
        whoPaysTip: 'Almost always paid by the borrower. USDA: sometimes waived by lender.',
        loanTypeTips: {},
        typicalRange: '$500–$1,200',
        isPercent: false,
        autoCalc: () => 895,
      },
      {
        id: 'rate_lock',
        label: 'Rate Lock Fee',
        payer: 'buyer',
        negotiable: true,
        description: 'Fee to extend a rate lock beyond the standard period, or for a float-down option.',
        whoPaysTip: 'Paid by borrower when lock extension is needed. Standard 30-day locks typically have no fee.',
        loanTypeTips: {},
        typicalRange: '$0–$500 (standard lock is free)',
        isPercent: false,
        autoCalc: () => 0,
      },
    ],
  },
  {
    id: 'third_party',
    label: 'Third-Party Service Fees',
    icon: '📋',
    color: 'violet',
    fees: [
      {
        id: 'appraisal',
        label: 'Appraisal Fee',
        payer: 'buyer',
        negotiable: false,
        description: 'Required by the lender. A licensed appraiser determines the market value of the property. The lender will not fund above the appraised value.',
        whoPaysTip: 'Paid by the borrower, usually upfront at time of order. VA appraisal: ordered through VA portal, borrower pays.',
        loanTypeTips: { VA: 'VA appraisals are ordered through the VA portal. VA-assigned appraiser — borrower cannot choose.', FHA: 'FHA appraisals have additional health/safety requirements. Appraiser must be FHA-approved.', USDA: 'USDA appraisals follow agency guidelines. Rural properties may have higher fees.' },
        typicalRange: '$500–$900 (higher for rural/complex)',
        isPercent: false,
        autoCalc: () => 650,
      },
      {
        id: 'credit_report',
        label: 'Credit Report',
        payer: 'buyer',
        negotiable: false,
        description: 'Tri-merge credit report pulled from all three bureaus (Equifax, Experian, TransUnion). Required for all loan types.',
        whoPaysTip: 'Paid by borrower. RESPA allows lenders to charge the actual cost of the credit report.',
        loanTypeTips: {},
        typicalRange: '$50–$100',
        isPercent: false,
        autoCalc: () => 75,
      },
      {
        id: 'flood_cert',
        label: 'Flood Certification',
        payer: 'buyer',
        negotiable: false,
        description: 'Determines if the property is in a FEMA flood zone. Required by all lenders.',
        whoPaysTip: 'Paid by borrower. Small one-time fee.',
        loanTypeTips: {},
        typicalRange: '$15–$25',
        isPercent: false,
        autoCalc: () => 20,
      },
      {
        id: 'tax_service',
        label: 'Tax Service Fee',
        payer: 'buyer',
        negotiable: false,
        description: 'Pays a third party to monitor property tax payments on behalf of the lender for the life of the loan.',
        whoPaysTip: 'Paid by borrower at closing. One-time fee.',
        loanTypeTips: {},
        typicalRange: '$50–$100',
        isPercent: false,
        autoCalc: () => 85,
      },
    ],
  },
  {
    id: 'title',
    label: 'Title & Settlement Fees',
    icon: '📄',
    color: 'emerald',
    fees: [
      {
        id: 'title_search',
        label: 'Title Search / Exam',
        payer: 'buyer',
        negotiable: true,
        description: 'A thorough search of public records to confirm the seller has clear ownership and identify any liens, judgments, or encumbrances.',
        whoPaysTip: 'Typically paid by the buyer. In some states, custom is for seller to pay. Attorney states: included in attorney fee.',
        loanTypeTips: { VA: 'VA requires clear title. Seller cannot pay title insurance for buyer (buyer must pay own policy).', USDA: 'USDA requires full title search and title insurance.' },
        typicalRange: '$150–$400',
        isPercent: false,
        autoCalc: () => 250,
      },
      {
        id: 'title_insurance_lender',
        label: "Lender's Title Insurance",
        payer: 'buyer',
        negotiable: false,
        description: 'Protects the lender against losses from title defects, liens, or ownership disputes. Required by virtually all lenders. Covers the lender only — not the borrower.',
        whoPaysTip: 'Always paid by the borrower — this protects the lender, not you. Separate owner\'s policy needed for buyer protection.',
        loanTypeTips: { VA: 'Required. Seller cannot pay lender\'s title insurance.', USDA: 'Required for all USDA loans.', FHA: 'Required for all FHA loans.' },
        typicalRange: '0.3%–0.5% of loan amount (varies by state)',
        isPercent: true,
        autoCalc: (loan) => Math.round(loan * 0.004),
      },
      {
        id: 'title_insurance_owner',
        label: "Owner's Title Insurance",
        payer: 'negotiable',
        negotiable: true,
        description: "Protects the buyer against future title claims, liens, or ownership disputes not discovered during the title search. Highly recommended — one-time premium for lifetime protection.",
        whoPaysTip: 'Varies by state. In GA, FL, TX — often seller pays. In CA, CO, NY — often buyer pays. Always negotiable.',
        loanTypeTips: { VA: 'Seller can pay owner\'s title insurance for VA buyer.', FHA: 'Seller can pay — common in FHA transactions.', USDA: 'Seller can pay — common in USDA transactions.' },
        typicalRange: '0.3%–0.5% of purchase price',
        isPercent: true,
        autoCalc: (loan) => Math.round(loan * 0.004),
      },
      {
        id: 'settlement_fee',
        label: 'Settlement / Closing Fee',
        payer: 'split',
        negotiable: true,
        description: 'Fee charged by the closing agent (title company or attorney) for conducting the closing and disbursing funds.',
        whoPaysTip: 'Custom varies by state. Often split between buyer and seller. Attorney states: included in attorney fee.',
        loanTypeTips: {},
        typicalRange: '$300–$800',
        isPercent: false,
        autoCalc: () => 450,
      },
      {
        id: 'attorney_fee',
        label: 'Attorney Fee',
        payer: 'buyer',
        negotiable: true,
        description: 'In attorney-closing states, a licensed real estate attorney must conduct the closing. Fee covers document preparation, closing coordination, and legal review.',
        whoPaysTip: 'Typically paid by buyer. Some states require buyer and seller to have separate attorneys. Required in GA, SC, NC, NY, MA, CT, RI, VT, NH, ME, WV, DE, VA, KY, TN, MS, AL.',
        loanTypeTips: {},
        typicalRange: '$500–$1,200',
        isPercent: false,
        autoCalc: () => 750,
        stateRequired: ATTORNEY_STATES,
      },
    ],
  },
  {
    id: 'government',
    label: 'Government & Recording Fees',
    icon: '🏛️',
    color: 'amber',
    fees: [
      {
        id: 'recording',
        label: 'Recording Fee',
        payer: 'buyer',
        negotiable: false,
        description: 'Charged by the county clerk to record the deed and mortgage in public records. Amount varies by county and number of pages.',
        whoPaysTip: 'Almost always paid by the buyer. Some states allow seller to pay deed recording.',
        loanTypeTips: {},
        typicalRange: '$50–$250',
        isPercent: false,
        autoCalc: () => 150,
      },
      {
        id: 'transfer_tax',
        label: 'Transfer Tax / Stamp Tax',
        payer: 'negotiable',
        negotiable: true,
        description: 'State or county tax imposed on the transfer of real property. Rate varies dramatically by state — from $0 to over 2% of purchase price.',
        whoPaysTip: 'Varies by state custom. GA: paid by seller. FL: paid by seller. NY: buyer pays most taxes. CA: split. TX: no transfer tax. Always check local custom.',
        loanTypeTips: { VA: 'VA buyer should not pay transfer tax where custom is for seller to pay.' },
        typicalRange: '$0 (TX, AK) to 2%+ (NY, DC, WA)',
        isPercent: true,
        autoCalc: () => 0,
        stateConditional: TRANSFER_TAX_STATES,
      },
      {
        id: 'mortgage_tax',
        label: 'Mortgage Recording Tax',
        payer: 'buyer',
        negotiable: false,
        description: 'Specific to certain states (NY, FL, AL, KS, MN, OK, TN). A tax on the mortgage itself, calculated as a percentage of the loan amount.',
        whoPaysTip: 'Always paid by the borrower in states that impose it. NY: up to 1.925% of loan amount in NYC — significant cost.',
        loanTypeTips: {},
        typicalRange: '0.1%–1.925% of loan (state-specific)',
        isPercent: true,
        autoCalc: () => 0,
        stateConditional: ['NY','FL','AL','KS','MN','OK','TN'],
      },
    ],
  },
  {
    id: 'prepaids',
    label: 'Prepaids & Escrow',
    icon: '📅',
    color: 'rose',
    fees: [
      {
        id: 'prepaid_interest',
        label: 'Prepaid Interest',
        payer: 'buyer',
        negotiable: false,
        description: 'Interest owed from the closing date to the end of the month. First full mortgage payment starts the following month.',
        whoPaysTip: 'Always paid by the borrower. Closing later in the month = less prepaid interest. Closing on the 1st = maximum prepaid (almost a full month).',
        loanTypeTips: {},
        typicalRange: '1–30 days of daily interest',
        isPercent: false,
        autoCalc: (loan, rate) => rate > 0 ? Math.round(loan * (rate / 100) / 365 * 15) : 0,
      },
      {
        id: 'homeowners_insurance',
        label: 'Homeowners Insurance (1 year)',
        payer: 'buyer',
        negotiable: false,
        description: 'First year\'s homeowners insurance premium paid upfront at closing. Lender requires proof of coverage before funding.',
        whoPaysTip: 'Always paid by the borrower. Shop rates before closing — can vary significantly. Florida has highest rates nationally.',
        loanTypeTips: {},
        typicalRange: '$1,200–$3,600/year (varies by state/value)',
        isPercent: false,
        autoCalc: (loan, rate, state) => {
          const rates = { FL: 0.020, TX: 0.018, LA: 0.019, OK: 0.019, KS: 0.017, MS: 0.015, AL: 0.012, GA: 0.010, CA: 0.007, WA: 0.006 };
          const r = rates[state] || 0.010;
          return Math.round(loan * r);
        },
      },
      {
        id: 'insurance_escrow',
        label: 'Insurance Escrow (2 months)',
        payer: 'buyer',
        negotiable: false,
        description: 'Initial escrow deposit for homeowners insurance — typically 2 months of monthly insurance payment held in escrow account.',
        whoPaysTip: 'Paid by borrower. Part of initial escrow setup required by lender.',
        loanTypeTips: {},
        typicalRange: '2 months of monthly insurance premium',
        isPercent: false,
        autoCalc: (loan, rate, state) => {
          const rates = { FL: 0.020, TX: 0.018, LA: 0.019, OK: 0.019, KS: 0.017, MS: 0.015, AL: 0.012, GA: 0.010, CA: 0.007, WA: 0.006 };
          const r = rates[state] || 0.010;
          return Math.round((loan * r / 12) * 2);
        },
      },
      {
        id: 'property_tax_escrow',
        label: 'Property Tax Escrow',
        payer: 'buyer',
        negotiable: false,
        description: 'Initial escrow deposit for property taxes — typically 2–6 months depending on when taxes are next due.',
        whoPaysTip: 'Paid by borrower. Amount depends on closing month and local tax due dates.',
        loanTypeTips: {},
        typicalRange: '2–6 months of monthly tax payment',
        isPercent: false,
        autoCalc: (loan, rate, state) => {
          const taxRates = { NJ: 0.0213, IL: 0.0205, CT: 0.0194, NH: 0.0186, VT: 0.0181, TX: 0.0166, NY: 0.0158, WI: 0.0162, NE: 0.0153, PA: 0.0153, OH: 0.0153, IA: 0.0147, MI: 0.0142, RI: 0.0139, NV: 0.0059, AL: 0.0040, GA: 0.0092, FL: 0.0089, CA: 0.0074 };
          const r = taxRates[state] || 0.010;
          return Math.round((loan * r / 12) * 3);
        },
      },
    ],
  },
  {
    id: 'government_programs',
    label: 'Government Program Fees',
    icon: '🏛️',
    color: 'indigo',
    fees: [
      {
        id: 'fha_mip',
        label: 'FHA Upfront MIP (1.75%)',
        payer: 'buyer',
        negotiable: false,
        description: 'FHA Mortgage Insurance Premium paid upfront at closing. Can be financed into the loan. This is separate from the monthly MIP.',
        whoPaysTip: 'Always paid by borrower (or financed). Cannot be waived for FHA loans.',
        loanTypeTips: { FHA: 'Required on all FHA loans. 1.75% of base loan amount. Almost always financed into the loan.' },
        typicalRange: '1.75% of loan amount',
        isPercent: true,
        autoCalc: (loan) => Math.round(loan * 0.0175),
        loanTypeOnly: ['FHA'],
      },
      {
        id: 'va_funding_fee',
        label: 'VA Funding Fee',
        payer: 'buyer',
        negotiable: false,
        description: 'One-time fee paid to the VA to sustain the loan guarantee program. Amount varies based on down payment, loan type, and whether veteran has used VA benefits before. Exempt if service-connected disabled.',
        whoPaysTip: 'Paid by veteran (can be financed). Exempt for: service-connected disabled veterans, surviving spouses, Purple Heart recipients on active duty.',
        loanTypeTips: { VA: 'First use, 0% down: 2.15%. Subsequent use: 3.3%. With 5% down: 1.5%. With 10% down: 1.25%. Exempt if disabled.' },
        typicalRange: '0% (exempt) to 3.3% of loan',
        isPercent: true,
        autoCalc: (loan) => Math.round(loan * 0.0215),
        loanTypeOnly: ['VA'],
      },
      {
        id: 'usda_guarantee_fee',
        label: 'USDA Guarantee Fee (1.0%)',
        payer: 'buyer',
        negotiable: false,
        description: 'Upfront guarantee fee paid to USDA. Almost always financed into the loan. Separate from the annual fee (0.35%).',
        whoPaysTip: 'Paid by borrower — almost always financed. Seller can pay as concession.',
        loanTypeTips: { USDA: 'Required on all USDA guaranteed loans. 1.0% of loan amount. Finance into loan to minimize cash to close.' },
        typicalRange: '1.0% of loan amount',
        isPercent: true,
        autoCalc: (loan) => Math.round(loan * 0.01),
        loanTypeOnly: ['USDA'],
      },
    ],
  },
];

const PAYER_COLORS = {
  buyer:      { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200',   label: 'Buyer' },
  seller:     { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Seller' },
  lender:     { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', label: 'Lender' },
  negotiable: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  label: 'Negotiable' },
  split:      { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  label: 'Split' },
};

const GROUP_COLORS = {
  blue:   { header: 'from-blue-900 to-slate-900',   accent: 'text-blue-300',   badge: 'bg-blue-900/30 border-blue-700/40' },
  violet: { header: 'from-violet-900 to-slate-900', accent: 'text-violet-300', badge: 'bg-violet-900/30 border-violet-700/40' },
  emerald:{ header: 'from-emerald-900 to-slate-900',accent: 'text-emerald-300',badge: 'bg-emerald-900/30 border-emerald-700/40' },
  amber:  { header: 'from-amber-900 to-slate-900',  accent: 'text-amber-300',  badge: 'bg-amber-900/30 border-amber-700/40' },
  rose:   { header: 'from-rose-900 to-slate-900',   accent: 'text-rose-300',   badge: 'bg-rose-900/30 border-rose-700/40' },
  indigo: { header: 'from-indigo-900 to-slate-900', accent: 'text-indigo-300', badge: 'bg-indigo-900/30 border-indigo-700/40' },
};

const fmt0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtD = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function FeeTooltip({ fee, loanType }) {
  const [open, setOpen] = useState(false);
  const pColor = PAYER_COLORS[fee.payer] || PAYER_COLORS.buyer;
  const loanTip = fee.loanTypeTips?.[loanType];
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full bg-slate-200 hover:bg-indigo-200 text-slate-500 hover:text-indigo-700 text-xs font-black flex items-center justify-center transition-colors">
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-50 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 text-left" style={{ minWidth: '300px' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-800 text-sm">{fee.label}</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">{fee.description}</p>
          <div className={'rounded-xl px-3 py-2 mb-3 border ' + pColor.bg + ' ' + pColor.border}>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Who Pays</div>
            <p className={'text-xs font-semibold ' + pColor.text}>{fee.whoPaysTip}</p>
          </div>
          {loanTip && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-3">
              <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">{loanType} Specific</div>
              <p className="text-xs text-indigo-700">{loanTip}</p>
            </div>
          )}
          <div className="bg-slate-50 rounded-xl px-3 py-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Typical Range</div>
            <p className="text-xs text-slate-600 font-semibold">{fee.typicalRange}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Letter Builder ───────────────────────────────────────────────────────────
function buildCCLetter(type, borrowerName, scenarioName, loanAmount, purchasePrice, loanType, state, totalBuyerFees, totalSellerFees, sellerCredits, netCashToClose, aiEstimate) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(today);
  lines.push('');
  if (type === 'borrower') {
    lines.push('Dear ' + (borrowerName || 'Valued Client') + ',');
    lines.push('');
    lines.push('RE: Closing Cost Estimate - ' + (scenarioName || 'Your Home Purchase'));
    lines.push('');
    lines.push('I have prepared a detailed closing cost estimate for your transaction. These figures represent my best estimate based on current lender fees, third-party service providers, and ' + (state || 'your state') + ' customs. Final figures will appear on your Closing Disclosure (CD) at least 3 business days before closing.');
    lines.push('');
    lines.push('CLOSING COST SUMMARY');
    lines.push('Loan Amount: ' + fmt0(loanAmount));
    lines.push('Purchase Price: ' + fmt0(purchasePrice || loanAmount));
    lines.push('Loan Type: ' + (loanType || 'Not specified'));
    lines.push('State: ' + (state || 'Not specified'));
    lines.push('');
    lines.push('Your Estimated Closing Costs: ' + fmt0(totalBuyerFees));
    if (sellerCredits > 0) lines.push('Less Seller Credits: -' + fmt0(sellerCredits));
    lines.push('Estimated Cash to Close: ' + fmt0(netCashToClose));
    lines.push('');
    lines.push('IMPORTANT NOTES');
    lines.push('* This is an ESTIMATE only. Final figures may vary based on closing date, actual third-party fees, and negotiations.');
    lines.push('* Your Loan Estimate (LE) provided within 3 days of application is the binding document for fee tolerance purposes.');
    lines.push('* Closing Disclosure (CD) will be provided at least 3 business days before closing with final figures.');
    lines.push('* Property tax escrow amount varies based on your closing date and local tax due dates.');
    lines.push('* Homeowners insurance premium: please shop multiple carriers before binding coverage.');
    lines.push('');
    lines.push('WHAT TO BRING TO CLOSING');
    lines.push('* Certified check or wire transfer for the exact cash-to-close amount (confirmed 48 hours before closing)');
    lines.push('* Valid government-issued photo ID');
    lines.push('* Any outstanding documents requested by underwriting');
    lines.push('');
    lines.push('Please review these numbers and let me know if you have any questions. I am happy to walk through each line item with you.');
    lines.push('');
    lines.push('Warm regards,');
  } else {
    lines.push('Dear Realtor Partner,');
    lines.push('');
    lines.push('RE: Closing Cost Estimate for ' + (borrowerName || 'Your Buyer') + ' - ' + (scenarioName || 'Active Transaction'));
    lines.push('');
    lines.push('I have completed a closing cost estimate for your buyer. I wanted to share this so we can align on seller credit negotiations and make sure there are no surprises at the closing table.');
    lines.push('');
    lines.push('BUYER COST SUMMARY');
    lines.push('Purchase Price: ' + fmt0(purchasePrice || loanAmount));
    lines.push('Loan Amount: ' + fmt0(loanAmount));
    lines.push('Loan Type: ' + (loanType || 'Not specified'));
    lines.push('Estimated Buyer Closing Costs: ' + fmt0(totalBuyerFees));
    lines.push('Current Seller Credits: ' + fmt0(sellerCredits));
    lines.push('Net Estimated Cash to Close: ' + fmt0(netCashToClose));
    lines.push('');
    lines.push('SELLER CREDIT STRATEGY');
    if (sellerCredits === 0) {
      lines.push('Your buyer has no seller credits currently modeled. If the buyer is short on cash to close, consider negotiating seller credits toward closing costs instead of a price reduction.');
    } else {
      lines.push('Your buyer is currently receiving ' + fmt0(sellerCredits) + ' in seller credits. This brings their cash-to-close down to approximately ' + fmt0(netCashToClose) + '.');
    }
    lines.push('');
    lines.push('SELLER CREDIT LIMITS BY LOAN TYPE');
    lines.push('FHA: Up to 6% of purchase price');
    lines.push('VA: Up to 4% of purchase price (seller can also pay ALL buyer closing costs)');
    lines.push('USDA: Up to 6% of purchase price');
    lines.push('Conventional: 3% (LTV >90%), 6% (LTV 75-90%), 9% (LTV <75%)');
    lines.push('');
    lines.push('WHAT SELLERS CAN PAY');
    if (loanType === 'VA') {
      lines.push('VA NOTE: Seller can pay ALL buyer closing costs with no limit on type of fee. This is a powerful negotiating tool for VA buyers.');
    }
    lines.push('Sellers can contribute toward: lender fees, title fees, prepaids, escrow setup, discount points, and most third-party fees.');
    lines.push('');
    lines.push('Please reach out if you need me to model different seller credit scenarios or provide an updated estimate.');
    lines.push('');
    lines.push("Let's get this deal closed!");
    lines.push('');
    lines.push('Best regards,');
  }
  lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions');
  lines.push('george@cvls.loans | cvls.loans');
  return lines.join('\n');
}

// ─── Letter Component ─────────────────────────────────────────────────────────
function CCLetter({ borrowerName, scenarioName, loanAmount, purchasePrice, loanType, state, totalBuyerFees, totalSellerFees, sellerCredits, netCashToClose, aiEstimate }) {
  const [letterType, setLetterType] = useState('borrower');
  const [copied, setCopied] = useState(false);
  const letterText = buildCCLetter(letterType, borrowerName, scenarioName, loanAmount, purchasePrice, loanType, state, totalBuyerFees, totalSellerFees, sellerCredits, netCashToClose, aiEstimate);
  const handleCopy = () => { navigator.clipboard.writeText(letterText); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Communication Tools</div>
          <h3 className="text-xl font-bold text-white">Borrower & Realtor Letters</h3>
          <p className="text-slate-400 text-sm mt-0.5">Auto-generated from your estimate. Review before sending.</p>
        </div>
        <span className="text-3xl">&#x2709;&#xFE0F;</span>
      </div>
      <div className="p-8 space-y-5">
        <div className="flex gap-2">
          {[['borrower', 'Borrower Letter'], ['realtor', 'Realtor Letter']].map(([val, label]) => (
            <button key={val} onClick={() => setLetterType(val)}
              className={'px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ' + (letterType === val ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400')}>
              {label}
            </button>
          ))}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{letterText}</pre>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCopy} className={'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold ' + (copied ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white')}>
            {copied ? 'Copied!' : 'Copy Letter'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl">Print</button>
        </div>
        <p className="text-xs text-slate-400">Review and personalize before sending. Final figures come from your Closing Disclosure.</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClosingCostCalc() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings, savedRecordId, setSavedRecordId } = useDecisionRecord('CLOSING_COST', scenarioId);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario] = useState(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [loading, setLoading] = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);

  // Scenario fields
  const [loanAmount, setLoanAmount] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [loanType, setLoanType] = useState('');
  const [state, setState] = useState('');
  const [interestRate, setInterestRate] = useState(0);
  const [sellerCredits, setSellerCredits] = useState(0);
  const [downPayment, setDownPayment] = useState(0);

  // Fee values — keyed by fee id
  const [feeValues, setFeeValues] = useState({});
  const [feeOverrides, setFeeOverrides] = useState({}); // tracks manually overridden fees
  const [feePayers, setFeePayers] = useState({}); // buyer | seller | lender

  // AI state
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiEstimate, setAiEstimate] = useState(null);
  const [aiError, setAiError] = useState('');

  const [confirmedCount, setConfirmedCount] = useState(0);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then((snap) => setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then((snap) => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        setLoanAmount(d.loanAmount || 0);
        setPurchasePrice(d.propertyValue || d.loanAmount || 0);
        setLoanType(d.loanType || '');
        setState(d.state || '');
        setInterestRate(d.interestRate || 0);
        setSellerCredits(d.sellerConcessions || 0);
        setDownPayment(d.downPayment || 0);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // Auto-populate fees when loan data is available
  useEffect(() => {
    if (!loanAmount) return;
    const newValues = {};
    const newPayers = {};
    FEE_GROUPS.forEach((group) => {
      group.fees.forEach((fee) => {
        if (feeOverrides[fee.id]) return; // don't overwrite manual entries
        if (fee.loanTypeOnly && loanType && !fee.loanTypeOnly.includes(loanType)) return;
        if (fee.stateRequired && state && !fee.stateRequired.includes(state)) return;
        if (fee.stateConditional && state && !fee.stateConditional.includes(state)) return;
        const val = fee.autoCalc ? fee.autoCalc(loanAmount, interestRate, state) : 0;
        newValues[fee.id] = val;
        newPayers[fee.id] = fee.payer;
      });
    });
    setFeeValues((prev) => ({ ...newValues, ...prev }));
    setFeePayers((prev) => ({ ...newPayers, ...prev }));
  }, [loanAmount, loanType, state, interestRate]);

  const setFeeValue = (id, val) => {
    setFeeValues((prev) => ({ ...prev, [id]: parseFloat(val) || 0 }));
    setFeeOverrides((prev) => ({ ...prev, [id]: true }));
  };

  const setFeePayer = (id, payer) => {
    setFeePayers((prev) => ({ ...prev, [id]: payer }));
  };

  const confirmFee = (id) => {
    setFeeOverrides((prev) => ({ ...prev, [id]: true }));
    setConfirmedCount((c) => c + 1);
  };

  // Totals
  const allFees = FEE_GROUPS.flatMap((g) => g.fees);
  const visibleFees = allFees.filter((fee) => {
    if (fee.loanTypeOnly && loanType && !fee.loanTypeOnly.includes(loanType)) return false;
    if (fee.stateRequired && state && !fee.stateRequired.includes(state)) return false;
    return true;
  });

  const totalBuyerFees = visibleFees.reduce((sum, fee) => {
    const payer = feePayers[fee.id] || fee.payer;
    if (payer === 'buyer' || payer === 'split') return sum + (feeValues[fee.id] || 0);
    return sum;
  }, 0);

  const totalSellerFees = visibleFees.reduce((sum, fee) => {
    const payer = feePayers[fee.id] || fee.payer;
    if (payer === 'seller') return sum + (feeValues[fee.id] || 0);
    return sum;
  }, 0);

  const netCashToClose = totalBuyerFees + downPayment - sellerCredits;
  const confirmedFees = Object.keys(feeOverrides).length;
  const totalFeeCount = visibleFees.length;
  const estimateQuality = totalFeeCount > 0 ? Math.round((confirmedFees / totalFeeCount) * 100) : 0;

  // AI Estimate
  const runAiEstimate = async () => {
    setAiAnalyzing(true);
    setAiError('');
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: 'Search for current typical closing costs in ' + (state || 'the United States') + ' for a ' + (loanType || 'conventional') + ' purchase loan of $' + Math.round(loanAmount) + '. Find: (1) typical title insurance rates in ' + (state || 'this state') + ', (2) transfer tax rate if applicable, (3) attorney fee if ' + (state || 'this state') + ' is an attorney-closing state, (4) average total closing costs as percentage of loan, (5) any state-specific fees. Return ONLY valid JSON: {"totalEstimatePct":number,"titleInsurancePct":number,"transferTaxPct":number,"hasAttorneyClosing":boolean,"attorneyFeeEstimate":number,"stateSpecificNotes":"text","averageClosingCostDollars":number,"keyInsights":["insight1","insight2","insight3"],"confidence":"HIGH|MEDIUM|LOW"}'
          }],
        }),
      });
      if (!resp.ok) throw new Error('API error ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response');
      const parsed = JSON.parse(match[0]);
      setAiEstimate(parsed);
      // Apply AI title insurance if available
      if (parsed.titleInsurancePct && loanAmount) {
        const lenderTitle = Math.round(loanAmount * parsed.titleInsurancePct / 100);
        setFeeValues((prev) => ({ ...prev, title_insurance_lender: lenderTitle, title_insurance_owner: lenderTitle }));
      }
      if (parsed.transferTaxPct && purchasePrice) {
        setFeeValues((prev) => ({ ...prev, transfer_tax: Math.round(purchasePrice * parsed.transferTaxPct / 100) }));
      }
      if (parsed.hasAttorneyClosing && parsed.attorneyFeeEstimate) {
        setFeeValues((prev) => ({ ...prev, attorney_fee: parsed.attorneyFeeEstimate }));
      }
    } catch (err) {
      setAiError('AI estimate failed: ' + err.message);
    }
    setAiAnalyzing(false);
  };

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings({
        verdict: 'Closing Cost Estimate — ' + fmt0(netCashToClose) + ' estimated cash to close',
        summary: 'Closing Cost Calculator — ' + (loanType || 'Loan') + ' in ' + (state || 'N/A') + '. Loan: ' + fmt0(loanAmount) + '. Total buyer costs: ' + fmt0(totalBuyerFees) + '. Seller credits: ' + fmt0(sellerCredits) + '. Net cash to close: ' + fmt0(netCashToClose) + '. Estimate quality: ' + estimateQuality + '%.',
        riskFlags: netCashToClose > loanAmount * 0.05 ? [{ field: 'cashToClose', message: 'Cash to close exceeds 5% of loan amount — verify borrower has sufficient reserves', severity: 'MEDIUM' }] : [],
        findings: {
          loanAmount, purchasePrice, loanType, state,
          totalBuyerFees, totalSellerFees, sellerCredits, netCashToClose, downPayment,
          estimateQuality, confirmedFees, totalFeeCount,
          feeBreakdown: Object.fromEntries(visibleFees.map((f) => [f.id, { amount: feeValues[f.id] || 0, payer: feePayers[f.id] || f.payer }])),
          aiEstimate: aiEstimate || null,
        },
        completeness: { scenarioLoaded: !!scenario, feesEntered: confirmedFees > 0, aiEstimateRun: !!aiEstimate },
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">📋</div><div className="text-slate-500">Loading...</div></div>
    </div>
  );

  if (!scenarioId) return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <div className="bg-slate-900 px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 10</div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Closing Cost Calculator™</h1>
          <p className="text-slate-400">National · State-aware · AI-powered estimates · Inline education</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">Select a Scenario</h2>
          <div className="space-y-2">{scenarios.map((s) => (
            <button key={s.id} onClick={() => navigate('/closing-cost-calc?scenarioId=' + s.id)}
              className="w-full text-left p-4 border border-slate-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all group">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-800">{s.scenarioName || (s.firstName + ' ' + s.lastName).trim() || 'Unnamed'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{fmt0(s.loanAmount)} · {s.loanType} · {s.state}</div>
                </div>
                <span className="text-blue-400 text-xl">→</span>
              </div>
            </button>
          ))}</div>
        </div>
      </div>
    </div>
  );

  const isAttorneyState = ATTORNEY_STATES.includes(state);
  const hasTransferTax = TRANSFER_TAX_STATES.includes(state);

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 10</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Closing Cost Calculator™</h1>
              <p className="text-slate-400 text-base max-w-xl leading-relaxed">National · State-aware · AI-powered · Every fee explained with who pays and why</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px' }}>
              {scenario ? (
                <>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                  <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                  <div className="text-slate-400 text-sm mt-1">{fmt0(loanAmount)} · {loanType} · {state}</div>
                  {netCashToClose > 0 && <div className="text-emerald-300 text-sm font-bold mt-1">~{fmt0(netCashToClose)} est. cash to close</div>}
                  <button onClick={() => navigate('/closing-cost-calc')} className="text-xs text-blue-400 hover:text-blue-300 mt-2 block">Change scenario →</button>
                </>
              ) : (
                <div className="text-slate-400 text-sm">No scenario loaded</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Borrower bar */}
      {scenarioId && borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {scenario?.streetAddress && <span className="text-blue-200 text-xs">{[scenario.streetAddress, scenario.city, scenario.state].filter(Boolean).join(', ')}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {loanAmount > 0 && <span>Loan <strong className="text-white">{fmt0(loanAmount)}</strong></span>}
              {loanType && <span>Type <strong className="text-white">{loanType}</strong></span>}
              {state && <span>State <strong className="text-white">{state}</strong></span>}
              {netCashToClose > 0 && <span>Est. Cash to Close <strong className="text-white">{fmt0(netCashToClose)}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Closing Cost Calculator™" moduleNumber="10" scenarioId={scenarioId} />

      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2">
        <DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="CLOSING_COST" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

          {/* Main Column */}
          <div className="xl:col-span-2 space-y-8">

            {/* State + AI Bar */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
                <h2 className="text-xl font-bold text-white">State & Loan Details</h2>
                <p className="text-slate-400 text-sm mt-1">Auto-populated from scenario. State drives transfer tax, attorney requirement, and title insurance rates.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">State</label>
                    <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="GA"
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-center focus:outline-none focus:border-emerald-400 uppercase" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Type</label>
                    <select value={loanType} onChange={(e) => setLoanType(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400">
                      <option value="">Select</option>
                      {['CONVENTIONAL','FHA','VA','USDA','JUMBO','HOMEREADY','HOME_POSSIBLE'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Loan Amount</label>
                    <input type="number" value={loanAmount || ''} onChange={(e) => setLoanAmount(parseFloat(e.target.value) || 0)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Purchase Price</label>
                    <input type="number" value={purchasePrice || ''} onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-400" />
                  </div>
                </div>

                {/* State flags */}
                <div className="flex flex-wrap gap-3">
                  {isAttorneyState && <span className="bg-violet-100 border border-violet-200 text-violet-700 text-xs font-bold px-3 py-1.5 rounded-xl">⚖️ Attorney-Closing State — Attorney fee required</span>}
                  {hasTransferTax && <span className="bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-xl">🏛️ Transfer Tax State — Verify local rate</span>}
                  {HIGH_TRANSFER_TAX.includes(state) && <span className="bg-red-100 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-xl">⚠️ High Transfer Tax State — Can be 1-2%+</span>}
                  {loanType === 'VA' && <span className="bg-red-100 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-xl">🎖️ VA Loan — Seller can pay ALL buyer closing costs</span>}
                  {loanType === 'USDA' && <span className="bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl">🌾 USDA — 1% guarantee fee typically financed</span>}
                </div>

                {/* AI Estimate */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 border border-slate-700">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                    <div>
                      <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">AI Estimate Engine</div>
                      <div className="text-white font-bold">Get State-Specific Fee Estimates</div>
                      <div className="text-slate-400 text-xs mt-0.5">Searches current title rates, transfer taxes, and local closing customs for {state || 'your state'}</div>
                    </div>
                    <button onClick={runAiEstimate} disabled={aiAnalyzing || !state}
                      className={'flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold ' + (aiAnalyzing ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : !state ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white')}>
                      {aiAnalyzing ? <><span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin inline-block" /> Searching...</> : '🔍 Get AI Estimate'}
                    </button>
                  </div>
                  {!state && <p className="text-xs text-amber-400">Enter the state above to enable AI estimates.</p>}
                  {aiError && <div className="bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3 text-xs text-red-300 mt-2">{aiError}</div>}
                  {aiEstimate && (
                    <div className="space-y-3 mt-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          ['Avg Total Costs', fmt0(aiEstimate.averageClosingCostDollars), 'text-white'],
                          ['Total Est %', (aiEstimate.totalEstimatePct || 0).toFixed(2) + '%', 'text-emerald-400'],
                          ['Title Insurance', (aiEstimate.titleInsurancePct || 0).toFixed(3) + '%', 'text-blue-300'],
                          ['Transfer Tax', (aiEstimate.transferTaxPct || 0).toFixed(3) + '%', aiEstimate.transferTaxPct > 0 ? 'text-amber-400' : 'text-slate-400'],
                        ].map(([l, v, c]) => (
                          <div key={l} className="bg-slate-700/50 rounded-xl p-3 text-center">
                            <div className="text-xs text-slate-400 mb-1">{l}</div>
                            <div className={'font-black text-sm ' + c}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {aiEstimate.stateSpecificNotes && (
                        <div className="bg-slate-700/30 rounded-xl px-4 py-3">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{state} Notes</div>
                          <p className="text-xs text-slate-300">{aiEstimate.stateSpecificNotes}</p>
                        </div>
                      )}
                      {aiEstimate.keyInsights && (
                        <div className="space-y-1">
                          {aiEstimate.keyInsights.map((insight, i) => (
                            <div key={i} className="flex gap-2 text-xs text-slate-400"><span className="text-emerald-400 shrink-0">•</span><span>{insight}</span></div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-500">AI estimates applied to title insurance, transfer tax, and attorney fees below. Review and adjust as needed.</p>
                    </div>
                  )}
                </div>

                {/* Seller credits */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Seller Credits / Concessions ($)</label>
                    <input type="number" value={sellerCredits || ''} onChange={(e) => setSellerCredits(parseFloat(e.target.value) || 0)}
                      className="w-full border-2 border-emerald-200 bg-emerald-50 rounded-2xl px-4 py-3 text-sm font-semibold text-emerald-700 focus:outline-none focus:border-emerald-400" />
                    <p className="text-xs text-slate-400 mt-1">Reduces cash to close. Max: FHA/USDA 6%, VA 4%, Conv 3-9%</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Down Payment ($)</label>
                    <input type="number" value={downPayment || ''} onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                      className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Fee Groups */}
            {FEE_GROUPS.map((group) => {
              const groupFees = group.fees.filter((fee) => {
                if (fee.loanTypeOnly && loanType && !fee.loanTypeOnly.includes(loanType)) return false;
                if (fee.stateRequired && state && !fee.stateRequired.includes(state)) return false;
                return true;
              });
              if (groupFees.length === 0) return null;
              const gc = GROUP_COLORS[group.color];
              const groupTotal = groupFees.reduce((sum, fee) => {
                const payer = feePayers[fee.id] || fee.payer;
                if (payer !== 'seller' && payer !== 'lender') return sum + (feeValues[fee.id] || 0);
                return sum;
              }, 0);

              return (
                <div key={group.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={'bg-gradient-to-r px-8 py-5 flex items-center justify-between ' + gc.header}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{group.icon}</span>
                      <div>
                        <div className={'text-xs font-bold uppercase tracking-widest mb-0.5 ' + gc.accent}>{group.label}</div>
                        <div className="text-xs text-slate-400">{groupFees.length} fee{groupFees.length > 1 ? 's' : ''} · hover ? for education</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400 mb-0.5">Est. Buyer Cost</div>
                      <div className={'text-xl font-black ' + gc.accent}>{fmt0(groupTotal)}</div>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {groupFees.map((fee) => {
                      const val = feeValues[fee.id] || 0;
                      const payer = feePayers[fee.id] || fee.payer;
                      const pc = PAYER_COLORS[payer] || PAYER_COLORS.buyer;
                      const isConfirmed = !!feeOverrides[fee.id];
                      return (
                        <div key={fee.id} className={'px-8 py-4 flex items-center gap-4 ' + (isConfirmed ? 'bg-slate-50/50' : 'bg-white')}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-slate-800 truncate">{fee.label}</span>
                              <FeeTooltip fee={fee} loanType={loanType} />
                              {isConfirmed && <span className="text-xs text-emerald-600 font-bold">✓</span>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={'text-xs font-bold px-2 py-0.5 rounded-lg border ' + pc.bg + ' ' + pc.text + ' ' + pc.border}>
                                {pc.label}
                              </span>
                              {fee.negotiable && <span className="text-xs text-slate-400 italic">negotiable</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Payer toggle */}
                            <select value={payer} onChange={(e) => setFeePayer(fee.id, e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:border-indigo-400">
                              <option value="buyer">Buyer</option>
                              <option value="seller">Seller</option>
                              <option value="lender">Lender</option>
                              <option value="split">Split</option>
                            </select>
                            {/* Amount input */}
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                              <input
                                type="number"
                                value={val || ''}
                                onChange={(e) => setFeeValue(fee.id, e.target.value)}
                                onBlur={() => confirmFee(fee.id)}
                                placeholder="0"
                                className={'w-28 pl-6 pr-3 py-2 border-2 rounded-xl text-sm font-semibold text-right focus:outline-none ' + (isConfirmed ? 'border-emerald-300 bg-emerald-50 text-emerald-700 focus:border-emerald-400' : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-indigo-400')}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Save */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-bold text-slate-800">Save to Decision Record™</h3>
                  <p className="text-slate-500 text-sm">Logs all fee estimates, payer assignments, and cash-to-close to the audit trail.</p>
                </div>
                <button onClick={handleSaveToRecord} disabled={recordSaving}
                  className={'px-8 py-3 rounded-2xl text-sm font-bold ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                  {recordSaving ? 'Saving...' : savedRecordId ? '✓ Saved' : '💾 Save Decision Record™'}
                </button>
              </div>
            </div>

            {/* Letters */}
            <CCLetter
              borrowerName={borrowerName}
              scenarioName={scenario?.scenarioName}
              loanAmount={loanAmount}
              purchasePrice={purchasePrice}
              loanType={loanType}
              state={state}
              totalBuyerFees={totalBuyerFees}
              totalSellerFees={totalSellerFees}
              sellerCredits={sellerCredits}
              netCashToClose={netCashToClose}
              aiEstimate={aiEstimate}
            />
          </div>

          {/* Right Panel — Live Summary */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Cash to Close Summary</div>

              {/* Big number */}
              <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-5 text-center mb-5">
                <div className="text-xs text-slate-400 mb-1">Estimated Cash to Close</div>
                <div className="text-4xl font-black text-emerald-400">{fmt0(netCashToClose)}</div>
                <div className="text-xs text-slate-400 mt-1">includes down payment + closing costs − credits</div>
              </div>

              {/* Breakdown */}
              <div className="space-y-2 mb-5">
                {[
                  ['Down Payment', fmt0(downPayment), 'text-white'],
                  ['Buyer Closing Costs', fmt0(totalBuyerFees), 'text-white'],
                  ['Seller Credits', sellerCredits > 0 ? '-' + fmt0(sellerCredits) : '$0', sellerCredits > 0 ? 'text-emerald-400' : 'text-slate-400'],
                  ['Net Cash to Close', fmt0(netCashToClose), 'text-emerald-400 text-lg'],
                ].map(([l, v, c], i) => (
                  <div key={l} className={'flex justify-between items-center py-2 ' + (i === 3 ? 'border-t border-slate-700 mt-2 pt-3' : 'border-b border-slate-800')}>
                    <span className="text-slate-400 text-sm">{l}</span>
                    <span className={'font-black text-sm ' + c}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Fee breakdown by group */}
              <div className="space-y-2 mb-5">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">By Category</div>
                {FEE_GROUPS.map((group) => {
                  const groupFees = group.fees.filter((fee) => {
                    if (fee.loanTypeOnly && loanType && !fee.loanTypeOnly.includes(loanType)) return false;
                    if (fee.stateRequired && state && !fee.stateRequired.includes(state)) return false;
                    return true;
                  });
                  const total = groupFees.reduce((sum, fee) => {
                    const payer = feePayers[fee.id] || fee.payer;
                    if (payer !== 'seller' && payer !== 'lender') return sum + (feeValues[fee.id] || 0);
                    return sum;
                  }, 0);
                  if (total === 0) return null;
                  return (
                    <div key={group.id} className="flex justify-between items-center py-1.5">
                      <span className="text-slate-400 text-xs flex items-center gap-1.5"><span>{group.icon}</span>{group.label}</span>
                      <span className="text-slate-200 text-xs font-bold">{fmt0(total)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Estimate Quality */}
              <div className="bg-slate-800/60 rounded-2xl p-4">
                <div className="flex justify-between text-xs mb-2">
                  <span className="font-bold text-slate-300">Estimate Quality</span>
                  <span className={'font-black ' + (estimateQuality >= 75 ? 'text-emerald-400' : estimateQuality >= 40 ? 'text-amber-400' : 'text-red-400')}>{estimateQuality}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={'h-full rounded-full ' + (estimateQuality >= 75 ? 'bg-emerald-500' : estimateQuality >= 40 ? 'bg-amber-500' : 'bg-red-400')} style={{ width: estimateQuality + '%' }} />
                </div>
                <p className="text-xs text-slate-500 mt-2">{confirmedFees}/{totalFeeCount} fees confirmed. Enter and tab through each fee to improve accuracy.</p>
              </div>

              {/* Seller credit max */}
              {loanType && purchasePrice > 0 && (
                <div className="mt-4 bg-amber-900/20 border border-amber-700/30 rounded-2xl p-4">
                  <div className="text-xs font-bold text-amber-400 mb-2">Max Seller Credits</div>
                  {[
                    loanType === 'FHA' && ['FHA', purchasePrice * 0.06],
                    loanType === 'VA' && ['VA', 'All buyer costs'],
                    loanType === 'USDA' && ['USDA', purchasePrice * 0.06],
                    (loanType === 'CONVENTIONAL' || loanType === 'HOMEREADY' || loanType === 'HOME_POSSIBLE') && ['Conv (>90% LTV)', purchasePrice * 0.03],
                  ].filter(Boolean).map(([label, max]) => (
                    <div key={label} className="flex justify-between text-xs text-amber-300">
                      <span>{label}</span>
                      <span className="font-bold">{typeof max === 'string' ? max : fmt0(max)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick tips */}
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-5">
              <div className="font-bold text-blue-800 text-sm mb-3">💡 Quick Tips</div>
              <ul className="space-y-2">
                {[
                  'Hover the ? next to each fee for a full explanation of who pays and why',
                  'Change the payer dropdown to model different negotiation scenarios',
                  'Run AI Estimate for state-specific title and transfer tax rates',
                  'Tab through fee fields to mark them as confirmed (turns green)',
                  'VA loans: seller can pay ALL buyer closing costs — powerful negotiating tool',
                  'Closing later in month = less prepaid interest',
                ].map((tip) => (
                  <li key={tip} className="flex gap-2 text-xs text-blue-700"><span className="shrink-0 text-blue-400">•</span><span>{tip}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <CanonicalSequenceBar currentModuleKey="CLOSING_COST" scenarioId={scenarioId} recordId={savedRecordId} />
    </div>
  );
}
