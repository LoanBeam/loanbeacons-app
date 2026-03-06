import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs } from 'firebase/firestore';

// ─── PROGRAM DEFINITIONS ────────────────────────────────────────────────────────
const PROGRAMS = {
  fha: { label: 'FHA', agency: 'FHA TOTAL Scorecard', maxDTI: 56.9, minCredit: 580, minDown: 3.5, findings: ['Accept/Eligible', 'Refer/Eligible', 'Refer with Caution'], positiveFindings: ['Accept/Eligible'] },
  conventional: { label: 'Conventional', agency: 'DU / LPA', maxDTI: 50, minCredit: 620, minDown: 3, findings: ['Approve/Eligible', 'Refer/Eligible', 'Refer with Caution', 'Ineligible'], positiveFindings: ['Approve/Eligible'] },
  homeready: { label: 'HomeReady', agency: 'DU', maxDTI: 50, minCredit: 620, minDown: 3, findings: ['Approve/Eligible', 'Refer/Eligible', 'Ineligible'], positiveFindings: ['Approve/Eligible'] },
  homepossible: { label: 'Home Possible', agency: 'LPA', maxDTI: 50, minCredit: 620, minDown: 3, findings: ['Accept', 'Caution', 'Ineligible'], positiveFindings: ['Accept'] },
  va: { label: 'VA', agency: 'DU / LPA', maxDTI: 60, minCredit: 580, minDown: 0, findings: ['Approve/Eligible', 'Refer/Eligible', 'Ineligible'], positiveFindings: ['Approve/Eligible'] },
  usda: { label: 'USDA', agency: 'GUS', maxDTI: 41, frontEndMax: 29, minCredit: 640, minDown: 0, findings: ['Accept', 'Refer', 'Ineligible'], positiveFindings: ['Accept'] },
  nonqm: { label: 'Non-QM', agency: 'Portfolio / Manual', maxDTI: 55, minCredit: 580, minDown: 10, findings: ['Approved', 'Declined'], positiveFindings: ['Approved'] },
};

// ─── 23-STRATEGY DATABASE ───────────────────────────────────────────────────────
const STRATEGIES = [
  {
    id: 1, title: 'Term Adjustment (360 → 324 Months)', category: 'dti', icon: '📅',
    impact: 'critical', cost: 'Free', timeline: 'Same Day', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible'], notPrograms: ['va', 'usda', 'nonqm'],
    programWarning: 'Does NOT work for VA, USDA, or Non-QM',
    probability: { fha: 88, conventional: 65, homeready: 65, homepossible: 65 },
    detail: 'Shift from 360-month to 324-month term. FHA TOTAL Scorecard evaluates equity build over the loan life — shorter term = faster equity = different risk classification. Can flip Refer/Eligible to Accept/Eligible despite the higher monthly payment. Most effective for FHA loans with DTI 52–57%. Use when borrower is borderline and can handle the slightly higher payment.',
    bestFor: 'FHA loans with DTI 52–57% — most impactful for FHA TOTAL Scorecard',
  },
  {
    id: 2, title: 'Strategic Debt Payoff (Highest DTI Impact First)', category: 'dti', icon: '💳',
    impact: 'critical', cost: '$500–$5,000', timeline: '3–5 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda', 'nonqm'],
    notPrograms: [],
    probability: { fha: 90, conventional: 92, homeready: 92, homepossible: 92, va: 85, usda: 88, nonqm: 85 },
    detail: 'Calculate DTI impact per dollar: (Monthly Payment ÷ Payoff Amount) × 100. Credit card $200/mo on $4,000 balance = 5.0% impact per dollar. Auto loan $400/mo on $15,000 balance = 2.67% impact. Pay off highest impact-per-dollar first. FHA DTI limit 56.9% — every point matters. Conventional max 50%. VA no strict DTI limit but helps residual income. USDA 29/41 — very strict on both ratios.',
    bestFor: 'Universal — works for all programs. Highest ROI strategy before any other action.',
  },
  {
    id: 3, title: '10-Month Installment Debt Exclusion Rule', category: 'dti', icon: '🗓️',
    impact: 'critical', cost: '$100–$2,000', timeline: '3–5 Days', risk: 'Low',
    programs: ['conventional', 'homeready', 'homepossible'],
    notPrograms: ['fha', 'va', 'usda', 'nonqm'],
    programWarning: 'CONVENTIONAL ONLY — Do NOT use for FHA, VA, or USDA. Critical compliance rule.',
    probability: { conventional: 92, homeready: 92, homepossible: 92 },
    detail: 'Debts with fewer than 10 payments remaining are EXCLUDED from conventional DTI entirely. Pay a debt down to 9 months remaining → the entire monthly payment is excluded. Example: $350/mo auto with 12 months left → pay $700 → payment completely removed from DTI. One of the most powerful conventional-only rescue tools. Always check remaining months on all installment accounts first.',
    bestFor: 'Borrowers on conventional with installment loans nearly paid off',
  },
  {
    id: 4, title: 'Student Loan Payment Recast (IDR Enrollment)', category: 'dti', icon: '🎓',
    impact: 'critical', cost: 'Free', timeline: '1–2 Weeks', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'usda'],
    notPrograms: ['va'],
    programWarning: 'VA uses 5% of balance rule — IDR almost never helps VA borrowers',
    probability: { fha: 80, conventional: 90, homeready: 90, homepossible: 90, usda: 72 },
    detail: 'Enroll in Income-Driven Repayment (IDR) plan to establish a documented lower payment. Calculation rules by program: Fannie/Freddie — 1% of balance OR documented IDR payment, use whichever is lower. FHA — 0.5% of balance OR documented payment, whichever is GREATER. VA — 5% of balance OR actual payment, whichever is GREATER (rarely helps). Example on $50K loan: Fannie/Freddie saves $425/mo ($500 → $75). FHA saves $175/mo ($250 → $75).',
    bestFor: 'Conventional borrowers with large student loan balances and IDR eligibility',
  },
  {
    id: 5, title: 'Authorized User Account Removal', category: 'dti', icon: '👤',
    impact: 'high', cost: 'Free', timeline: '2–4 Weeks', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda', 'nonqm'],
    notPrograms: [],
    probability: { fha: 85, conventional: 85, homeready: 85, homepossible: 85, va: 80, usda: 80, nonqm: 75 },
    detail: 'Remove borrower as authorized user on someone else\'s credit cards. This eliminates the AU debt obligation from DTI calculations entirely. No credit score damage if borrower has their own established tradelines. Example: $8,000 AU balance with $200/mo minimum → removed from DTI entirely. Pull updated credit after removal to confirm. Check this FIRST before any payoff — it\'s free and instant.',
    bestFor: 'Borrowers with high AU balances that are not their actual financial obligation',
  },
  {
    id: 6, title: 'FHA vs. HomeReady vs. Home Possible Program Evaluation', category: 'program', icon: '🔄',
    impact: 'high', cost: 'Free', timeline: 'Same Day', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible'],
    notPrograms: ['va', 'usda', 'nonqm'],
    probability: { fha: 90, conventional: 88, homeready: 90, homepossible: 90 },
    detail: 'HomeReady/Home Possible is better than FHA when: Credit 680+, DTI <50%, property in good condition, long-term ownership (MI drops at 78% LTV, saves $150–250/mo after drop, $30K+ over loan life). FHA is better when: Credit 580–679, DTI 50–57%, limited reserves, need 6% seller concessions, faster closing. Census Tract Exception: HomeReady/HP income limits are COMPLETELY WAIVED if property is in an eligible low-income census tract — check Fannie/Freddie lookup tools. This is frequently missed.',
    bestFor: 'Every low-down-payment loan — evaluate program before assuming FHA is default',
  },
  {
    id: 7, title: 'Rapid Rescore After Revolving Utilization Paydown', category: 'credit', icon: '⚡',
    impact: 'high', cost: '$150–$300', timeline: '2–4 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 85, conventional: 88, homeready: 88, homepossible: 88, va: 82, usda: 80 },
    detail: 'Pay credit cards to <30% utilization (ideal <10%). Request rapid rescore from lender. Typical FICO gain: 10–25 points in 72 hours. Conventional score tiers: 740+ = best pricing. 680–739 = better pricing. 640–679 = standard. <620 = ineligible. Target: get every card under 30%, and one card under 10% for maximum impact. Example: 80% utilization → 30% = 15–30 point gain. 678 → 695 FICO can unlock better pricing tier, saving 0.25–0.50% in rate permanently.',
    bestFor: 'Borrowers with revolving debt over 30% utilization — highest credit score ROI',
  },
  {
    id: 8, title: 'Gift Funds for Down Payment or Reserves', category: 'reserves', icon: '🎁',
    impact: 'high', cost: 'Free', timeline: '2–3 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    programWarning: 'Non-QM often requires 5–10% borrower funds — verify guidelines',
    probability: { fha: 90, conventional: 82, homeready: 85, homepossible: 85, va: 88, usda: 78 },
    detail: 'Acceptable sources by program: FHA — family, employer, labor union, charitable org. Fannie Mae — relatives, fiancé, employer, close friend. Freddie Mac — relatives, fiancé, close friend (needs motivation letter). VA — very flexible, almost any source. Benefits: preserves borrower liquid assets as reserves (compensating factor), enables larger down payment (lower LTV), eliminates need for retirement liquidation. Document with gift letter + bank wire/transfer evidence.',
    bestFor: 'First-time buyers with family support who need cash for down payment or reserves',
  },
  {
    id: 9, title: 'Non-QM Pivot (Bank Statement / Asset Depletion / DSCR)', category: 'program', icon: '🏦',
    impact: 'high', cost: '1.5–2.5% Higher Rate', timeline: '1–2 Weeks', risk: 'Medium',
    programs: ['fha', 'conventional', 'homeready', 'homepossible'],
    notPrograms: ['nonqm'],
    probability: { fha: 82, conventional: 85, homeready: 85, homepossible: 85 },
    detail: 'Three Non-QM paths when agency fails: (1) Bank Statement — 12 or 24-month deposits × 50% expense factor = qualifying income. Best for self-employed with write-offs. Example: $180K deposits → $90K qualifying income. (2) Asset Depletion — (Total Assets − Down Payment) ÷ 360 = monthly income. $2M assets → $5,278/mo qualifying income. Best for retirees. (3) DSCR — qualify on property cash flow only, no personal income. Best for investors. Exit strategy: use Non-QM for 12–24 months, rebuild qualifying profile, refinance to agency.',
    bestFor: 'Self-employed with write-offs, high-asset retirees, or real estate investors',
  },
  {
    id: 10, title: 'VA Residual Income Optimization', category: 'dti', icon: '🎖️',
    impact: 'high', cost: 'Free–Medium', timeline: '3–7 Days', risk: 'Low',
    programs: ['va'],
    notPrograms: ['fha', 'conventional', 'homeready', 'homepossible', 'usda', 'nonqm'],
    probability: { va: 88 },
    detail: 'VA uses residual income as the PRIMARY qualifier — not DTI. Residual = Gross Income − (PITI + Debts + Monthly Taxes + Living Expenses). Regional requirements vary by family size and loan size. Optimization strategies: Include all income including BAH and disability (grossed up 25%), pay off small debts (even $50/mo matters), account for homeownership tax deductions, document all dependents (tax credits reduce obligation). Example: $7K income − $2.1K PITI − $800 debts − $1.2K taxes − $788 living = $2,112 residual vs. $1,173 requirement = APPROVED.',
    bestFor: 'VA borrowers with DTI over 50% who have strong residual income',
  },
  {
    id: 11, title: 'USDA Front-End DTI Optimization', category: 'dti', icon: '🌾',
    impact: 'high', cost: 'Free–Medium', timeline: 'Days to Weeks', risk: 'Low',
    programs: ['usda'],
    notPrograms: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'nonqm'],
    probability: { usda: 80 },
    detail: 'USDA requires BOTH front-end (29% max housing) AND back-end (41% max total) — strictest of all programs. Both ratios must be met simultaneously. Optimization: Increase voluntary down payment (USDA allows it), buy down rate with seller concessions (lowers front-end), choose property in lower tax area, lower HOA/insurance, add co-borrower income. When USDA beats FHA: 0% down, DTI naturally under 29/41, rural property, lower MI costs (1% upfront vs 1.75%). When FHA beats USDA: front-end DTI 30–40%, urban property, faster closing needed.',
    bestFor: 'Rural buyers who can meet the strict 29/41 dual DTI requirement',
  },
  {
    id: 12, title: 'Occupancy Reclassification / Job Relocation', category: 'ltv', icon: '🏠',
    impact: 'high', cost: 'Free', timeline: '1–2 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va'],
    notPrograms: ['usda', 'nonqm'],
    probability: { fha: 82, conventional: 85, homeready: 85, homepossible: 85, va: 80 },
    detail: 'Buying new primary while owning current home can be misclassified as second home — triggering higher rate, higher DTI limits, and 10% down requirement. Solutions: (1) Job Relocation Letter — employer confirms transfer >50 miles, new home closer to new job. (2) Current Home Listed or Under Contract — listing agreement OR ratified sales contract showing move within 60 days. Impact: avoids second-home classification, excludes current home payment from DTI, saves 0.25–0.75% in rate, enables 3% down instead of 10%.',
    bestFor: 'Relocating borrowers who still own their current primary residence',
  },
  {
    id: 13, title: '12+ Months Cash Reserves as Compensating Factor', category: 'reserves', icon: '💰',
    impact: 'medium', cost: 'Free (documentation)', timeline: '1–2 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'nonqm', 'usda'],
    notPrograms: ['va'],
    probability: { fha: 78, conventional: 82, homeready: 82, homepossible: 82, nonqm: 80, usda: 72 },
    detail: 'Reserve counting: 100% — Checking, savings, stocks/bonds (seasoned 30+ days). 60–70% — 401k/IRA (penalty/tax discount). 100% — 401k loan (not withdrawal). 0% — Primary residence equity, personal property. When it helps most: High DTI (50–57%) + 12+ months reserves = often approved on manual UW. Marginal credit (640–680) + 15 months reserves = often approved. Non-QM typically requires 6–24 months as baseline. Jumbo 6–12 months standard.',
    bestFor: 'Borrowers with strong savings who have borderline DTI or credit score',
  },
  {
    id: 14, title: 'Rent Payment History Documentation', category: 'credit', icon: '🔑',
    impact: 'medium', cost: 'Free', timeline: '2–3 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 72, conventional: 70, homeready: 75, homepossible: 75, va: 70, usda: 68 },
    detail: 'Gather 12–24 months of canceled checks or bank statements showing on-time rent payments. Particularly valuable when proposed mortgage is ≥80% of current rent — demonstrates payment shock tolerance. Manual underwriting compensating factor that can offset high DTI or thin credit history. Example: current rent $1,800, proposed mortgage $2,000, 24 months of perfect history = strong manual UW compensating factor accepted by most investors.',
    bestFor: 'First-time buyers with consistent on-time rent payment history',
  },
  {
    id: 15, title: 'Income Growth Documentation (Raise / Promotion)', category: 'income', icon: '📈',
    impact: 'medium', cost: 'Free', timeline: '1–2 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 72, conventional: 70, homeready: 72, homepossible: 72, va: 68, usda: 65 },
    detail: 'Obtain employer letter documenting recent raise or promotion, including new salary effective date. Shows income trajectory is improving — suggests DTI will continue to decrease. Example: $60K → $75K (25% income growth) = strong compensating factor for manual underwriting. Most effective combined with other factors (reserves, rent history). Also useful for recent grads or career changers who show strong upward trajectory.',
    bestFor: 'Borrowers recently promoted, given raises, or entering a higher-paying field',
  },
  {
    id: 16, title: 'Boarder / Accessory Unit Rental Income', category: 'income', icon: '🏘️',
    impact: 'high', cost: 'Free', timeline: '3–5 Days', risk: 'Medium',
    programs: ['fha', 'conventional', 'homeready'],
    notPrograms: ['homepossible', 'va', 'usda', 'nonqm'],
    programWarning: 'HomeReady is most flexible for boarder income; Home Possible has restrictions',
    probability: { fha: 78, conventional: 70, homeready: 82 },
    detail: 'Document roommate or accessory unit rental income. Requirements: non-family member renter, arm\'s-length written lease agreement, 12 months of verified deposit history via bank statements. FHA allows boarder income to directly offset the housing expense in ratio calculations. HomeReady (Fannie) is specifically designed for multi-generational households and most flexible. Example: housing expense $2,000/mo, boarder income $500/mo → net housing $1,500 → DTI improves ~3.5%.',
    bestFor: 'Multi-generational households or owner-occupants renting a room to a non-family tenant',
  },
  {
    id: 17, title: 'Overtime / Bonus Income Documentation', category: 'income', icon: '⏰',
    impact: 'high', cost: 'Free', timeline: '2–3 Days', risk: 'Medium',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 78, conventional: 80, homeready: 80, homepossible: 80, va: 75, usda: 72 },
    detail: 'Standard requirement: 2-year history to use overtime or bonus income. Exception path: 12–18 months of history PLUS employer guarantee letter confirming it will continue. Letter must be specific about amount and continuity. Example: base salary qualifies borrower at 48% DTI, but adding $800/mo consistent overtime drops DTI to 42% — well within guidelines. All major AUS engines accept well-documented employer letters. W-2s for 2 years plus YTD paystubs required.',
    bestFor: 'Borrowers with consistent overtime or annual bonus who have 12+ months of history',
  },
  {
    id: 18, title: 'HomeReady / Home Possible Census Tract Income Waiver', category: 'program', icon: '🗺️',
    impact: 'high', cost: 'Free', timeline: 'Same Day', risk: 'Low',
    programs: ['homeready', 'homepossible', 'conventional'],
    notPrograms: ['fha', 'va', 'usda', 'nonqm'],
    probability: { homeready: 90, homepossible: 90, conventional: 85 },
    detail: 'HomeReady and Home Possible have income limits (typically 80% AMI of area). Critical exception: income limits are COMPLETELY WAIVED if the property is in an eligible low-income census tract. Example: borrower income $95K, area income limit $85K — normally ineligible for HomeReady. Property checks out in eligible tract → income limit fully waived → qualifies for 3% down with better pricing than FHA. Use Fannie Mae HomeReady lookup tool and Freddie Mac Income & Property Eligibility tool. This opportunity is missed frequently.',
    bestFor: 'Higher-income borrowers who would normally exceed HomeReady/HP limits',
  },
  {
    id: 19, title: 'Seller Concessions — Maximize to Build Reserves', category: 'reserves', icon: '🤝',
    impact: 'medium', cost: 'Free (negotiation)', timeline: 'Contract Negotiation', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 80, conventional: 75, homeready: 78, homepossible: 78, va: 82, usda: 80 },
    detail: 'Maximum seller concession limits: FHA — 6% of sales price. Conventional >90% LTV — 3%. Conventional 75–90% LTV — 6%. Conventional <75% LTV — 9%. VA — 4% plus reasonable closing costs. USDA — 6%. Strategy: use concessions to cover ALL closing costs, which preserves borrower\'s cash as liquid post-closing reserves. Higher reserves = stronger compensating factor for AUS. This converts borrower cash from costs into reserves — often moving AUS from Refer to Approve.',
    bestFor: 'Borrowers who need reserves as compensating factor for high DTI or marginal credit',
  },
  {
    id: 20, title: 'AUS Re-Run After Rate Drop or Buydown', category: 'dti', icon: '📉',
    impact: 'medium', cost: 'Free (re-run) or buydown cost', timeline: 'Same Day', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 72, conventional: 72, homeready: 72, homepossible: 72, va: 68, usda: 68 },
    detail: 'AUS recalculates based on current market rate entered. 0.5% rate drop = $75–$125/mo payment reduction = lower DTI. Example: 6.5% → 6.0% on $275K loan saves ~$100/mo, improving DTI by 0.75–1.0%. Actions: (1) Simply re-run if market rates have moved since original submission. (2) Structure seller concessions as rate buydown — lower rate → lower payment → lower DTI → better AUS. (3) Use temporary 2-1 buydown if permanent rate too expensive. Always re-run AUS after any rate change.',
    bestFor: 'Borrowers when current rates are lower than original AUS submission rate',
  },
  {
    id: 21, title: '401K Loan vs. Withdrawal for Reserves', category: 'reserves', icon: '🏛️',
    impact: 'medium', cost: '$50–$150 Fees', timeline: '1–2 Weeks', risk: 'Medium',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda', 'nonqm'],
    notPrograms: [],
    probability: { fha: 75, conventional: 78, homeready: 78, homepossible: 78, va: 70, usda: 72, nonqm: 80 },
    detail: '401K withdrawal: only 60% of value counts (40% penalty/tax haircut applied by AUS). 401K loan: 100% of value counts as reserves, but the repayment adds to monthly debt obligations in DTI. Decision matrix: Example $30K in 401K — withdrawal = $18K in reserves, no DTI impact. Loan = $30K in reserves but adds $200–$400/mo to DTI. Use loan when: reserves critically needed AND DTI has room to absorb repayment. Use withdrawal when: DTI is already tight and can\'t add loan payment.',
    bestFor: 'Borrowers with 401K assets when reserves are the primary approval obstacle',
  },
  {
    id: 22, title: 'Asset Consolidation (60-Day Seasoning Plan)', category: 'reserves', icon: '🏧',
    impact: 'low', cost: 'Free', timeline: '2+ Months Planning', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda', 'nonqm'],
    notPrograms: [],
    probability: { fha: 85, conventional: 88, homeready: 88, homepossible: 88, va: 82, usda: 82, nonqm: 80 },
    detail: 'Consolidate multiple small accounts into one account 60+ days before closing application. Avoids large deposit sourcing requirements that require extensive paper trail documentation. Example: 5 accounts × $2K each = sourcing questions on each. 1 account × $10K (seasoned 60+ days) = clean, no documentation questions. Best used as proactive planning strategy 2–3 months before application submission. Also apply to any large deposits — document them before 60-day window if possible.',
    bestFor: 'Proactive planning — advise borrowers to consolidate 60+ days before application',
  },
  {
    id: 23, title: 'Credit Mix Enhancement (Authorized User Addition)', category: 'credit', icon: '✨',
    impact: 'medium', cost: 'Free', timeline: '30–60 Days', risk: 'Low',
    programs: ['fha', 'conventional', 'homeready', 'homepossible', 'va', 'usda'],
    notPrograms: ['nonqm'],
    probability: { fha: 72, conventional: 70, homeready: 72, homepossible: 72, va: 68, usda: 68 },
    detail: 'Add borrower as authorized user on a family member\'s well-seasoned account. Ideal account: 10+ year history, perfect payment record throughout, utilization <10%. Adds tradeline age, payment history, and mix to borrower\'s credit profile. Score improvement: 15–30 points typical for thin files. Best for first-time buyers with only 2–3 tradelines. Important: confirm borrower has their own active tradelines first — AU addition alone on a thin file may not be sufficient for underwriting.',
    bestFor: 'First-time buyers or borrowers with thin credit files (2–3 tradelines)',
  },
];

// ─── DUPLICATE DEBT FLAGS ───────────────────────────────────────────────────────
const DUPLICATE_FLAGS = [
  { label: 'Authorized user account counted in DTI', detail: 'AU accounts appear on credit report but borrower has no legal liability. Verify each AU account and remove from DTI if not the borrower\'s debt.', fix: 'Identify AU accounts, remove from DTI. If account has history of late payments, consider also removing as AU to protect score.' },
  { label: 'Student loan double-counted (deferred + payment showing)', detail: 'Some LOS systems count both the deferred status entry AND the IDR payment when both appear on report. Result: the loan is counted twice.', fix: 'Use only the IDR documented payment or the applicable percentage calculation. Remove duplicate deferred entry from DTI.' },
  { label: 'Vehicle lease appearing as both installment and auto', detail: 'Car leases sometimes surface in two separate tradeline categories on credit report, inflating DTI.', fix: 'Pull all three bureaus. Verify only one entry per vehicle obligation. Document and remove duplicate.' },
  { label: 'Child support included as both judgment and payment', detail: 'Child support can appear as a court judgment AND as a recurring obligation, causing double-counting.', fix: 'Use official court order to establish exact monthly amount. Remove any duplicate judgment entry.' },
  { label: 'Co-signed debt counted for primary borrower', detail: 'Borrower co-signed for someone else. If that person is making all payments, the debt can be excluded.', fix: 'Provide 12 months of bank statements showing the primary borrower on the co-signed account making all payments from their own account.' },
  { label: 'Closed or paid account still in DTI', detail: 'Paid-off or recently closed accounts may still show a minimum payment in AUS. These should be $0 in DTI.', fix: 'Pull payoff/closure letter. Zero out the payment in LOS. Rapid rescore if needed to update tradeline status.' },
  { label: 'Business debt included in personal DTI (self-employed)', detail: 'Business loans or lines of credit that appear on personal credit but are paid by the business should be excluded from personal DTI.', fix: 'Provide 12 months of business bank statements showing the business making all payments on the account from business funds.' },
  { label: 'Rental property debt without rental income offset', detail: 'If a rental property PITIA is in DTI but the rental income is not being counted, the net obligation is artificially inflated.', fix: 'Document rental income via current signed lease plus 2-year Schedule E. Use net rental income to offset the full PITIA obligation.' },
];

// ─── PROGRAM EVALUATOR ──────────────────────────────────────────────────────────
function evaluateProgramFit(creditScore, dti, frontEndDTI, reserves, downPct, flags) {
  const { isVeteran, isRuralProperty, isSelfEmployed, hasRecentBankruptcy } = flags;
  return Object.entries(PROGRAMS).map(([key, p]) => {
    const issues = [], strengths = [];
    let score = 100;

    if (creditScore >= 740) strengths.push('Excellent credit — best pricing tier');
    else if (creditScore >= 680) strengths.push('Good credit score');

    if (creditScore < p.minCredit) { issues.push(`Credit ${creditScore} below ${p.minCredit} minimum`); score -= 40; }
    if (dti > p.maxDTI) { issues.push(`DTI ${dti}% exceeds ${p.maxDTI}% max`); score -= 35; }
    else if (dti <= p.maxDTI * 0.88) strengths.push(`DTI ${dti}% comfortably within limit`);
    if (key === 'usda' && frontEndDTI && frontEndDTI > 29) { issues.push(`Front-end DTI ${frontEndDTI}% exceeds USDA 29% limit`); score -= 30; }
    if (downPct < p.minDown) { issues.push(`${downPct}% down below ${p.minDown}% minimum`); score -= 20; }

    if (key === 'va' && !isVeteran) { issues.push('VA requires military/veteran status'); score = 0; }
    if (key === 'usda' && !isRuralProperty) { issues.push('USDA requires eligible rural property'); score -= 40; }
    if (isSelfEmployed && key === 'nonqm') strengths.push('Bank statement income available — strong fit');
    if (isSelfEmployed && ['conventional', 'homeready', 'homepossible', 'fha'].includes(key)) issues.push('Self-employed income may be limited by tax write-offs');
    if (hasRecentBankruptcy) {
      if (['conventional', 'homeready', 'homepossible'].includes(key)) { issues.push('BK/FC: 4yr conventional waiting period'); score -= 30; }
      if (key === 'fha') { issues.push('BK: 2yr / FC: 3yr FHA waiting period'); score -= 20; }
      if (key === 'nonqm') strengths.push('Non-QM may allow 12–24 months post-discharge');
    }
    if (reserves >= 12) strengths.push('12+ months reserves — strong compensating factor');
    else if (reserves >= 6) strengths.push(`${reserves} months reserves`);

    const finalScore = Math.max(0, score);
    return {
      key, label: p.label, score: finalScore,
      likelihood: finalScore >= 75 ? 'High' : finalScore >= 45 ? 'Medium' : 'Low',
      issues, strengths,
    };
  }).sort((a, b) => b.score - a.score);
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────────
const IMPACT_BADGE = { critical: 'bg-red-100 text-red-700 border border-red-200', high: 'bg-orange-100 text-orange-700 border border-orange-200', medium: 'bg-yellow-100 text-yellow-700 border border-yellow-200', low: 'bg-slate-100 text-slate-500 border border-slate-200' };
const pColor = p => p >= 85 ? 'text-emerald-600' : p >= 65 ? 'text-amber-600' : 'text-red-500';
const pBar = p => p >= 85 ? 'bg-emerald-500' : p >= 65 ? 'bg-amber-500' : 'bg-red-500';
const LIKELIHOOD_STYLE = { High: 'bg-emerald-50 border-emerald-300 text-emerald-700', Medium: 'bg-amber-50 border-amber-300 text-amber-700', Low: 'bg-red-50 border-red-200 text-red-600' };
const CATS = { dti: { label: 'DTI / Payment', icon: '📊' }, credit: { label: 'Credit', icon: '📉' }, reserves: { label: 'Reserves', icon: '🏦' }, income: { label: 'Income', icon: '💼' }, ltv: { label: 'LTV / Occupancy', icon: '🏠' }, program: { label: 'Program Switch', icon: '🔄' } };

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────────
export default function AUSRescue() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState('conventional');
  const [currentFinding, setCurrentFinding] = useState('');
  const [profile, setProfile] = useState({ creditScore: '', dti: '', frontEndDTI: '', reserves: '', downPayment: '', isVeteran: false, isRuralProperty: false, isSelfEmployed: false, hasRecentBankruptcy: false });
  const [selectedCats, setSelectedCats] = useState([]);
  const [activeTab, setActiveTab] = useState('strategies');
  const [flaggedDuplicates, setFlaggedDuplicates] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null); // { fileName, fieldsFound }
  const [parseError, setParseError] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'scenarios'))
      .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const addLog = msg => setAuditLog(p => [{ msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...p.slice(0, 24)]);

  const handleScenarioSelect = id => {
    setSelectedScenarioId(id);
    const sc = scenarios.find(s => s.id === id);
    setSelectedScenario(sc || null);
    if (sc) {
      setProfile(prev => ({ ...prev, creditScore: sc.creditScore || '', dti: sc.dti || '', downPayment: sc.downPayment || '' }));
      addLog(`Loaded: ${sc.scenarioName || id}`);
    }
  };

  // ─── PDF PARSING ─────────────────────────────────────────────────────────────
  // NOTE: Calls Anthropic API from the frontend using your .env API key.
  // For a client-facing production app, proxy this through a Firebase Cloud Function.
  const parsePDFWithClaude = async (file) => {
    setIsParsing(true);
    setParseError('');
    setParseResult(null);
    addLog(`Parsing: ${file.name}`);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not set in .env file');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              {
                type: 'text',
                text: `You are parsing a DU (Desktop Underwriter) or LPA (Loan Product Advisor) AUS findings document. Extract fields and return ONLY valid JSON, no markdown, no preamble:
{
  "ausEngine": "du" or "lpa" or "fha_total",
  "finding": "exact overall decision string (e.g. Refer/Eligible, Approve/Eligible, Accept, Caution, Ineligible)",
  "program": "fha" or "conventional" or "homeready" or "homepossible" or "va" or "usda" or "nonqm",
  "creditScore": number or null,
  "backEndDTI": number or null,
  "frontEndDTI": number or null,
  "reservesMonths": number or null,
  "downPaymentPct": number or null,
  "isVeteran": boolean,
  "isSelfEmployed": boolean,
  "detectedIssues": array of applicable: "dti", "credit", "reserves", "income", "ltv", "program",
  "riskFactors": array of up to 6 brief strings describing specific risk factors found
}
Use null for unknown numbers, false for unknown booleans.`
              },
            ],
          }],
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error ${response.status}`);
      }
      const data = await response.json();
      const raw = data.content?.[0]?.text || '';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

      const engineToProgram = { du: 'conventional', lpa: 'conventional', fha_total: 'fha' };
      const detectedProgram = parsed.program || engineToProgram[parsed.ausEngine] || 'conventional';
      const findingMap = {
        'approve/eligible': 'Approve/Eligible', 'refer/eligible': 'Refer/Eligible',
        'refer with caution': 'Refer with Caution', 'ineligible': 'Ineligible',
        'accept/eligible': 'Accept/Eligible', 'accept': 'Accept',
        'caution': 'Caution', 'refer': 'Refer', 'approved': 'Approved', 'declined': 'Declined',
      };
      const normalizedFinding = findingMap[parsed.finding?.toLowerCase().trim()] || parsed.finding || '';

      setProgram(detectedProgram);
      setCurrentFinding(normalizedFinding);
      setProfile(prev => ({
        ...prev,
        creditScore: parsed.creditScore?.toString() || prev.creditScore,
        dti: parsed.backEndDTI?.toString() || prev.dti,
        frontEndDTI: parsed.frontEndDTI?.toString() || prev.frontEndDTI,
        reserves: parsed.reservesMonths?.toString() || prev.reserves,
        downPayment: parsed.downPaymentPct?.toString() || prev.downPayment,
        isVeteran: parsed.isVeteran || prev.isVeteran,
        isSelfEmployed: parsed.isSelfEmployed || prev.isSelfEmployed,
      }));
      if (parsed.detectedIssues?.length) setSelectedCats(parsed.detectedIssues);

      const fieldsFound = [
        normalizedFinding && 'Finding',
        parsed.creditScore && 'Credit Score',
        parsed.backEndDTI && 'DTI',
        parsed.frontEndDTI && 'Front-End DTI',
        parsed.reservesMonths && 'Reserves',
        parsed.downPaymentPct && 'Down Payment',
        parsed.detectedIssues?.length && `${parsed.detectedIssues.length} issue categories`,
      ].filter(Boolean);
      setParseResult({ fileName: file.name, fieldsFound, riskFactors: parsed.riskFactors || [] });
      addLog(`Parsed: ${fieldsFound.join(', ')}`);
    } catch (err) {
      const msg = err.message.includes('VITE_ANTHROPIC_API_KEY')
        ? 'Add VITE_ANTHROPIC_API_KEY=your_key to your .env file to enable PDF parsing'
        : `Parse failed: ${err.message}`;
      setParseError(msg);
      addLog(`Parse failed: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setParseError('Please upload a PDF file (.pdf)'); return; }
    if (file.size > 10 * 1024 * 1024) { setParseError('File too large — max 10MB'); return; }
    parsePDFWithClaude(file);
    e.target.value = '';
  };

  const isPositive = currentFinding && PROGRAMS[program]?.positiveFindings?.includes(currentFinding);
  const needsRescue = currentFinding && !isPositive;

  const relevantStrategies = STRATEGIES
    .filter(s => s.programs.includes(program) && (selectedCats.length === 0 || selectedCats.includes(s.category)))
    .sort((a, b) => (b.probability[program] || 0) - (a.probability[program] || 0));

  const programResults = profile.creditScore && profile.dti
    ? evaluateProgramFit(+profile.creditScore, +profile.dti, +profile.frontEndDTI || 0, +profile.reserves || 0, +profile.downPayment || 3, profile)
    : [];

  const toggleCat = cat => setSelectedCats(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);
  const toggleDup = idx => {
    setFlaggedDuplicates(p => {
      const next = p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx];
      addLog(next.includes(idx) ? `🔍 Flagged: ${DUPLICATE_FLAGS[idx].label}` : `✓ Cleared: ${DUPLICATE_FLAGS[idx].label}`);
      return next;
    });
  };

  const generateNotes = () => {
    let n = `AUS RESCUE™ v2.0 — LO NOTES\n${new Date().toLocaleDateString()} | LoanBeacons™ | Patent Pending\n${'─'.repeat(45)}\n\n`;
    n += `PROGRAM: ${PROGRAMS[program].label} | FINDING: ${currentFinding}\n`;
    if (profile.creditScore) n += `Credit: ${profile.creditScore} | DTI: ${profile.dti}% | Reserves: ${profile.reserves} months\n\n`;
    if (flaggedDuplicates.length) {
      n += `DUPLICATE DEBT FLAGS:\n`;
      flaggedDuplicates.forEach(i => { n += `  ⚠️ ${DUPLICATE_FLAGS[i].label}\n  Fix: ${DUPLICATE_FLAGS[i].fix}\n\n`; });
    }
    n += `STRATEGIES (${PROGRAMS[program].label}):\n`;
    relevantStrategies.forEach((s, i) => { n += `\n${i + 1}. [${s.probability[program]}%] ${s.title}\n   ${s.cost} | ${s.timeline} | ${s.detail}\n`; });
    if (programResults.length) {
      n += `\nPROGRAM ALTERNATIVES:\n`;
      programResults.slice(0, 5).forEach(r => { n += `  ${r.label}: ${r.likelihood} (${r.score}/100)\n`; });
    }
    navigator.clipboard.writeText(n).catch(() => {});
    addLog('Notes exported to clipboard');
    alert('LO Notes copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 2 — Lender Fit</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 8</span>
              </div>
              <h1 className="text-2xl font-bold">AUS Rescue™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">23 Strategies · Program Switch Analysis · Duplicate Debt Detection</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              <span className="text-slate-400 text-xs">Patent Pending</span>
            </div>
          </div>
          {/* Scenario + Program */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-slate-300 text-sm">Scenario:</label>
              {loading ? <span className="text-slate-400 text-sm">Loading…</span> : (
                <select value={selectedScenarioId} onChange={e => handleScenarioSelect(e.target.value)}
                  className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-w-[200px]">
                  <option value="">— Select Scenario —</option>
                  {scenarios.map(s => <option key={s.id} value={s.id}>{s.scenarioName || s.borrowerName || s.id.slice(0,8)}</option>)}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-slate-300 text-sm">Program:</label>
              {Object.entries(PROGRAMS).map(([key, p]) => (
                <button key={key} onClick={() => { setProgram(key); setCurrentFinding(''); addLog(`Program: ${p.label}`); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${program === key ? 'bg-white text-slate-900 border-white shadow-md' : 'border-slate-600 text-slate-300 hover:border-slate-400'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

          {/* LEFT */}
          <div className="xl:col-span-3 space-y-5">

            {/* STEP 1 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Step 1 — Loan Profile & AUS Finding</h2>

              {/* PDF UPLOAD ZONE */}
              <div className="mb-5">
                <div className={`border-2 border-dashed rounded-xl p-4 transition-all ${isParsing ? 'border-indigo-400 bg-indigo-50' : parseResult ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 hover:border-indigo-300 bg-slate-50 hover:bg-indigo-50/20'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{isParsing ? '⏳' : parseResult ? '✅' : '📄'}</span>
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          {isParsing ? 'Parsing AUS findings…' : parseResult ? `Parsed: ${parseResult.fileName}` : 'Upload DU or LPA Findings PDF'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isParsing ? 'AI is reading the document and auto-filling fields…' : parseResult ? `Fields extracted: ${parseResult.fieldsFound.join(' · ')}` : 'AI auto-populates finding, DTI, credit score, reserves, and issue categories'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isParsing && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
                      {!isParsing && (
                        <label className="cursor-pointer">
                          <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" />
                          <span className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">
                            ⬆️ {parseResult ? 'Upload New PDF' : 'Upload PDF'}
                          </span>
                        </label>
                      )}
                      {parseResult && !isParsing && (
                        <button onClick={() => setParseResult(null)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded border border-slate-200">Clear</button>
                      )}
                    </div>
                  </div>

                  {/* Risk Factors from parsed PDF */}
                  {parseResult?.riskFactors?.length > 0 && (
                    <div className="mt-3 border-t border-emerald-200 pt-3">
                      <p className="text-xs font-bold text-emerald-700 mb-1.5">Risk factors found in findings:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {parseResult.riskFactors.map((r, i) => (
                          <span key={i} className="text-xs bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">⚠ {r}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parse Error */}
                  {parseError && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-red-600">{parseError}</p>
                      <button onClick={() => setParseError('')} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 ml-1">Or fill in the fields manually below ↓</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {[
                  { k: 'creditScore', l: 'Credit Score', ph: '720' },
                  { k: 'dti', l: 'Back-End DTI %', ph: '47' },
                  { k: 'frontEndDTI', l: 'Front-End DTI %', ph: '32' },
                  { k: 'reserves', l: 'Reserves (months)', ph: '4' },
                  { k: 'downPayment', l: 'Down Payment %', ph: '5' },
                ].map(f => (
                  <div key={f.k}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.l}</label>
                    <input type="number" placeholder={f.ph} value={profile[f.k]}
                      onChange={e => setProfile(prev => ({ ...prev, [f.k]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mb-4">
                {[{ k: 'isVeteran', l: 'Veteran/Military' }, { k: 'isRuralProperty', l: 'Rural Property' }, { k: 'isSelfEmployed', l: 'Self-Employed' }, { k: 'hasRecentBankruptcy', l: 'Recent BK/FC' }].map(f => (
                  <label key={f.k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={profile[f.k]} onChange={e => setProfile(prev => ({ ...prev, [f.k]: e.target.checked }))} className="rounded" />
                    <span className="text-sm text-slate-600">{f.l}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Current AUS Finding — {PROGRAMS[program].agency}</label>
                <div className="flex flex-wrap gap-2">
                  {PROGRAMS[program].findings.map(f => {
                    const pos = PROGRAMS[program].positiveFindings.includes(f);
                    return (
                      <button key={f} onClick={() => { setCurrentFinding(f); addLog(`Finding: ${f}`); }}
                        className={`py-2 px-4 rounded-lg text-sm font-semibold border-2 transition-all ${currentFinding === f ? (pos ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-red-600 bg-red-600 text-white') : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        {pos ? '✅ ' : '🔴 '}{f}
                      </button>
                    );
                  })}
                </div>
              </div>
              {isPositive && (
                <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-3xl">🎉</span>
                  <div>
                    <p className="text-emerald-800 font-bold">{currentFinding} — No Rescue Needed!</p>
                    <p className="text-emerald-600 text-sm">This loan is eligible. Document compensating factors and submit with confidence.</p>
                  </div>
                </div>
              )}
              {needsRescue && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-3xl">🚨</span>
                  <div>
                    <p className="text-red-800 font-bold">{currentFinding} on {PROGRAMS[program].label} — AUS Rescue Active</p>
                    <p className="text-red-600 text-sm">Use the tabs below to run strategies, evaluate alternate programs, and check for duplicate debts.</p>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2 Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-1">Filter by Issue:</span>
                {Object.entries(CATS).map(([key, cat]) => (
                  <button key={key} onClick={() => toggleCat(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${selectedCats.includes(key) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'}`}>
                    {cat.icon} {cat.label}
                  </button>
                ))}
                {selectedCats.length > 0 && (
                  <button onClick={() => setSelectedCats([])} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-slate-200 text-slate-400">✕ Clear</button>
                )}
              </div>
            </div>

            {/* TABS */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="flex border-b border-slate-100 px-4 pt-4">
                {[
                  { k: 'strategies', l: `📋 Strategies (${relevantStrategies.length})` },
                  { k: 'program-switch', l: `🔄 Program Switch${programResults.length ? ` — ${programResults[0]?.likelihood} fit: ${programResults[0]?.label}` : ''}` },
                  { k: 'duplicate-check', l: `🔍 Duplicate Debts${flaggedDuplicates.length ? ` (${flaggedDuplicates.length} flagged)` : ''}` },
                ].map(t => (
                  <button key={t.k} onClick={() => setActiveTab(t.k)}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 mr-1 transition-colors ${activeTab === t.k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    {t.l}
                  </button>
                ))}
              </div>

              {/* STRATEGIES */}
              {activeTab === 'strategies' && (
                <div className="p-5">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-slate-400 text-xs">{relevantStrategies.length} strategies for <span className="font-semibold text-slate-600">{PROGRAMS[program].label}</span>{selectedCats.length > 0 ? ` · ${selectedCats.map(c => CATS[c].label).join(', ')}` : ' · All categories'} · Sorted by success probability</p>
                    <button onClick={generateNotes} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">📋 Export LO Notes</button>
                  </div>
                  <div className="space-y-2">
                    {relevantStrategies.map(s => {
                      const prob = s.probability[program] || 0;
                      const open = expandedId === s.id;
                      return (
                        <div key={s.id} className={`border rounded-xl transition-all ${open ? 'border-indigo-200 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}>
                          <button className="w-full text-left p-4" onClick={() => setExpandedId(open ? null : s.id)}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1">
                                <span className="text-xl mt-0.5">{s.icon}</span>
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <p className="text-sm font-bold text-slate-800">{s.title}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${IMPACT_BADGE[s.impact]}`}>{s.impact}</span>
                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{CATS[s.category]?.label}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                                    <span>💰 {s.cost}</span><span>⏱️ {s.timeline}</span><span>⚠️ {s.risk} risk</span>
                                  </div>
                                  {s.programWarning && <p className="text-xs text-amber-600 font-semibold mt-1">⚠️ {s.programWarning}</p>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-xl font-black ${pColor(prob)}`}>{prob}%</p>
                                <p className="text-xs text-slate-400 mb-1">Success</p>
                                <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pBar(prob)}`} style={{ width: `${prob}%` }} />
                                </div>
                                <p className="text-xs text-slate-300 mt-1">{open ? '▲' : '▼'}</p>
                              </div>
                            </div>
                          </button>
                          {open && (
                            <div className="px-4 pb-4 border-t border-slate-50">
                              <p className="text-sm text-slate-600 leading-relaxed mt-3">{s.detail}</p>
                              {s.bestFor && <p className="text-xs text-indigo-600 font-semibold mt-2">🎯 Best for: {s.bestFor}</p>}
                              <div className="mt-3 flex flex-wrap gap-1 items-center">
                                <span className="text-xs text-slate-400 mr-1">Also works:</span>
                                {s.programs.filter(k => k !== program).map(k => <span key={k} className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full">{PROGRAMS[k]?.label}</span>)}
                                {s.notPrograms.length > 0 && <>
                                  <span className="text-xs text-red-400 ml-2 mr-1">Not for:</span>
                                  {s.notPrograms.map(k => <span key={k} className="text-xs bg-red-50 text-red-400 border border-red-100 px-2 py-0.5 rounded-full">{PROGRAMS[k]?.label}</span>)}
                                </>}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {relevantStrategies.length === 0 && (
                      <div className="text-center py-10 bg-slate-50 rounded-xl">
                        <p className="text-4xl mb-2">🔍</p>
                        <p className="text-slate-500 font-semibold">No strategies match current filters</p>
                        <p className="text-slate-400 text-sm mt-1">Clear issue filters or change program</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PROGRAM SWITCH */}
              {activeTab === 'program-switch' && (
                <div className="p-5">
                  <p className="text-slate-400 text-xs mb-4 leading-relaxed">Enter loan profile in Step 1 to see program fit analysis. The goal of AUS Rescue™ is to get the loan approved — even if the program must change.</p>

                  {/* Decision Tree */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2">📋 Program Decision Tree (from AUS Rescue Strategy Matrix)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-indigo-700">
                      {[
                        ['Credit 580–679 + DTI 50–57% + Few Reserves', 'FHA (only viable path)'],
                        ['Credit 680+ + DTI <50% + Good Reserves', 'HomeReady / Home Possible'],
                        ['Self-Employed + Tax Write-Offs', 'Non-QM Bank Statement'],
                        ['Investor + Approaching 10-Property Limit', 'Non-QM DSCR'],
                        ['Veteran + DTI >50%', 'VA (use residual income)'],
                        ['Rural + 0% Down + DTI <29/41', 'USDA'],
                        ['High Assets + Low/Irregular Income', 'Non-QM Asset Depletion'],
                        ['Recent BK 12–24 months + Rebuilt Credit', 'Non-QM (bridge to agency)'],
                      ].map(([scenario, program], i) => (
                        <p key={i}>• {scenario} → <strong>{program}</strong></p>
                      ))}
                    </div>
                  </div>

                  {programResults.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-xl">
                      <p className="text-4xl mb-2">📊</p>
                      <p className="text-slate-500 font-semibold">Enter credit score + DTI in Step 1</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {programResults.map(r => (
                        <div key={r.key} className={`rounded-xl border p-4 ${r.key === program ? 'border-indigo-300 bg-indigo-50' : r.likelihood === 'High' ? 'border-emerald-200 bg-emerald-50/60' : r.likelihood === 'Medium' ? 'border-amber-100 bg-amber-50/40' : 'border-slate-100 bg-slate-50/40'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <p className="text-sm font-bold text-slate-800">{r.label}</p>
                                {r.key === program && <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-semibold">Current Program</span>}
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${LIKELIHOOD_STYLE[r.likelihood]}`}>{r.likelihood} Likelihood</span>
                              </div>
                              {r.strengths.length > 0 && <div className="flex flex-wrap gap-1.5 mb-1.5">{r.strengths.map((s, i) => <span key={i} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ {s}</span>)}</div>}
                              {r.issues.length > 0 && <div className="flex flex-wrap gap-1.5">{r.issues.map((issue, i) => <span key={i} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">✗ {issue}</span>)}</div>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-2xl font-black text-slate-700">{r.score}</p>
                              <p className="text-xs text-slate-400">/ 100</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* DUPLICATE CHECK */}
              {activeTab === 'duplicate-check' && (
                <div className="p-5">
                  <div className="mb-4">
                    <p className="text-slate-500 text-sm leading-relaxed">Duplicate debts and misclassified obligations artificially inflate DTI — sometimes by 3–8 points. Check each item. A single fix here can flip an AUS finding without any payoff required.</p>
                  </div>
                  {flaggedDuplicates.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                      <p className="text-amber-800 text-sm font-bold">⚠️ {flaggedDuplicates.length} issue{flaggedDuplicates.length > 1 ? 's' : ''} flagged — review with processor before resubmitting AUS</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {DUPLICATE_FLAGS.map((flag, idx) => {
                      const checked = flaggedDuplicates.includes(idx);
                      return (
                        <div key={idx} onClick={() => toggleDup(idx)}
                          className={`rounded-xl border p-4 cursor-pointer transition-all ${checked ? 'border-amber-300 bg-amber-50' : 'border-slate-100 hover:border-slate-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${checked ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`}>
                              {checked && <span className="text-white text-xs font-black">!</span>}
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm font-semibold ${checked ? 'text-amber-800' : 'text-slate-700'}`}>{flag.label}</p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{flag.detail}</p>
                              {checked && (
                                <div className="mt-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                                  <p className="text-xs font-semibold text-amber-700">📌 Remedy: {flag.fix}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="space-y-4">
            {selectedScenario && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Scenario</h3>
                <div className="space-y-2">
                  {[['Borrower', selectedScenario.borrowerName], ['Scenario', selectedScenario.scenarioName], ['Loan Type', selectedScenario.loanType], ['Purchase Price', selectedScenario.purchasePrice ? `$${Number(selectedScenario.purchasePrice).toLocaleString()}` : null], ['Loan Amount', selectedScenario.loanAmount ? `$${Number(selectedScenario.loanAmount).toLocaleString()}` : null], ['Income', selectedScenario.monthlyIncome ? `$${Number(selectedScenario.monthlyIncome).toLocaleString()}/mo` : null]].filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-slate-400">{l}</span>
                      <span className="text-slate-700 font-semibold truncate max-w-[55%] text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Rescue Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Program', PROGRAMS[program].label],
                  ['Strategies', relevantStrategies.length],
                  ['High Prob (85%+)', relevantStrategies.filter(s => (s.probability[program] || 0) >= 85).length],
                  ['Duplicate Flags', flaggedDuplicates.length || '—'],
                  ['Top Strategy', relevantStrategies[0] ? `${relevantStrategies[0].probability[program]}%` : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className="font-bold text-slate-700">{v}</span>
                  </div>
                ))}
                {programResults.length > 0 && programResults[0].key !== program && programResults[0].likelihood === 'High' && (
                  <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700 font-semibold">
                    💡 Consider switching to {PROGRAMS[programResults[0].key]?.label} — higher fit score
                  </div>
                )}
              </div>
              <button onClick={generateNotes} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors">
                📋 Export Full LO Notes
              </button>
            </div>

            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">⚠️ Critical Rules</h3>
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p><span className="text-amber-400 font-bold">10-Month Rule:</span> Conventional ONLY. Never FHA/VA/USDA.</p>
                <p><span className="text-amber-400 font-bold">Student Loans:</span> Fannie: 1% or IDR. FHA: 0.5% or IDR (greater). VA: 5% or actual.</p>
                <p><span className="text-amber-400 font-bold">Census Tract:</span> HomeReady/HP income limits WAIVED in eligible tracts.</p>
                <p><span className="text-amber-400 font-bold">Non-QM Exit:</span> Bridge 12–24 months → refinance to agency.</p>
                <p><span className="text-amber-400 font-bold">Always rerun AUS</span> after any data change. One DTI point changes everything.</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Audit Log</h3>
              {auditLog.length === 0 ? <p className="text-xs text-slate-300 italic">No activity yet…</p> : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {auditLog.map((e, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-slate-300 whitespace-nowrap shrink-0">{e.time}</span>
                      <span className="text-slate-600 leading-tight">{e.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
