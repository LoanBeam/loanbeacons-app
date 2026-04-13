import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getDoc } from 'firebase/firestore';
import { evaluatePrograms, rateSensitivity, PROGRAM_RULES } from './ruleEngine';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { calculatePathScore } from '../utils/ausRescueScoring';
import { useSearchParams } from 'react-router-dom';
import ProgramMigrationEngine from '../components/ProgramMigrationEngine';
import { extractProfileFromScenario } from '../engines/programRuleEngine';
import AUSRunCounter from '../components/AUSRunCounter';
import WhatIfSimulator from '../components/WhatIfSimulator';
import { runSonnetReasoning, mergeReasoningResults } from '../services/ausRescueReasoning';
import DealAdvisor from '../components/DealAdvisor';
import ModuleNav from '../components/ModuleNav';

// ── DOWNLOAD COUNTER ──────────────────────────────────────────────────────────
// AUSRescue.jsx download counter: 33

// ── PROGRAMS ──────────────────────────────────────────────────────────────────
const PROGRAMS = {
  fha:          { label: 'FHA',          agency: 'FHA TOTAL Scorecard', maxDTI: 56.9, minCredit: 580, minDown: 3.5, findings: ['Accept/Eligible','Refer/Eligible','Refer with Caution'], positiveFindings: ['Accept/Eligible'] },
  conventional: { label: 'Conventional', agency: 'DU / LPA',            maxDTI: 50,   minCredit: 620, minDown: 3,   findings: ['Approve/Eligible','Refer/Eligible','Refer with Caution','Ineligible'], positiveFindings: ['Approve/Eligible'] },
  homeready:    { label: 'HomeReady',    agency: 'DU',                   maxDTI: 50,   minCredit: 620, minDown: 3,   findings: ['Approve/Eligible','Refer/Eligible','Ineligible'], positiveFindings: ['Approve/Eligible'] },
  homepossible: { label: 'Home Possible',agency: 'LPA',                  maxDTI: 50,   minCredit: 660, minDown: 3,   findings: ['Accept','Caution','Ineligible'], positiveFindings: ['Accept'] },
  va:           { label: 'VA',           agency: 'DU / LPA',             maxDTI: 60,   minCredit: 580, minDown: 0,   findings: ['Approve/Eligible','Refer/Eligible','Ineligible'], positiveFindings: ['Approve/Eligible'] },
  usda:         { label: 'USDA',         agency: 'GUS',                  maxDTI: 41,   minCredit: 640, minDown: 0,   findings: ['Accept','Refer','Ineligible'], positiveFindings: ['Accept'], frontEndMax: 29 },
  nonqm:        { label: 'Non-QM',       agency: 'Portfolio / Manual',   maxDTI: 55,   minCredit: 580, minDown: 10,  findings: ['Approved','Declined'], positiveFindings: ['Approved'] },
};

// ── STRATEGIES ────────────────────────────────────────────────────────────────
const STRATEGIES = [
  { id:1,  title:'Term Adjustment (360 → 324 Months)',           category:'dti',      icon:'🔄', impact:'critical', cost:'Free',                  timeline:'Same Day',       risk:'Low',    programs:['fha','conventional','homeready','homepossible'], notPrograms:['va','usda','nonqm'], programWarning:'Does Not work for VA, USDA, or Non-QM', probability:{fha:88,conventional:65,homeready:65,homepossible:65}, detail:'Shift from 360-month to 324-month term. FHA TOTAL Scorecard evaluates equity build over the loan life — shorter term = faster equity = different risk classification. Can flip Refer/Eligible to Accept/Eligible despite the higher monthly payment. Most effective for FHA loans with DTI 52%–57%. Use when borrower is borderline and can handle the slightly higher payment.', bestFor:'FHA loans with DTI 52%–57% — most impactful for FHA TOTAL Scorecard' },
  { id:2,  title:'Strategic Debt Payoff (Highest DTI Impact First)',category:'dti',   icon:'💸', impact:'critical', cost:'$500–$5,000',            timeline:'3–5 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda','nonqm'], notPrograms:[], probability:{fha:90,conventional:92,homeready:92,homepossible:92,va:85,usda:88,nonqm:85}, detail:'Calculate DTI impact per dollar: (Monthly Payment ÷ Payoff Amount) × 100. Credit card $200/mo on $4,000 balance = 5.0% impact per dollar. Auto loan $400/mo on $15,000 balance = 2.67% impact. Pay off highest impact-per-dollar first. FHA DTI limit 56.9% — every point matters. Conventional max 50%. VA no strict DTI limit but helps residual income. USDA 29/41 — very strict on both ratios.', bestFor:'Universal — works for all programs. Highest ROI strategy before any other action.' },
  { id:3,  title:'10-Month Installment Debt Exclusion Rule',      category:'dti',     icon:'📋', impact:'critical', cost:'$100–$2,000',            timeline:'3–5 Days',       risk:'Low',    programs:['conventional','homeready','homepossible'], notPrograms:['fha','va','usda','nonqm'], programWarning:'CONVENTIONAL ONLY — Do NOT use for FHA, VA, or USDA. Critical compliance rule.', probability:{conventional:92,homeready:92,homepossible:92}, detail:'Debts with fewer than 10 payments remaining are EXCLUDED from conventional DTI entirely. Pay a debt down to 9 months remaining — the entire monthly payment is excluded payment completely removed from DTI. One of the most powerful conventional-only rescue tools. Always check remaining months on all installment accounts first.', bestFor:'Borrowers on conventional with installment loans nearly paid off' },
  { id:4,  title:'Student Loan Payment Recast (IDR Enrollment)',  category:'dti',     icon:'🎓', impact:'critical', cost:'Free',                  timeline:'1–2 Weeks',      risk:'Low',    programs:['fha','conventional','homeready','homepossible','usda'], notPrograms:['va'], programWarning:'VA uses 5% of balance rule — IDR almost never helps VA borrowers', probability:{fha:80,conventional:90,homeready:90,homepossible:90,usda:72}, detail:'Enroll in Income-Driven Repayment (IDR) plan to establish a documented lower payment. Calculation rules by program: Fannie/Freddie — 1% of balance OR documented IDR payment, use whichever is lower. FHA — 0.5% of balance OR documented payment, whichever is GREATER. VA — 5% of balance OR actual payment, whichever is GREATER (rarely helps). Example on $50K loan: Fannie/Freddie saves $425/mo ($500 → $75). FHA saves $175/mo ($250 → $75).', bestFor:'Conventional borrowers with large student loan balances and IDR eligibility' },
  { id:5,  title:'Authorized User Account Removal',               category:'dti',     icon:'👤', impact:'high',    cost:'Free',                  timeline:'2–4 Weeks',      risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:85,conventional:85,homeready:85,homepossible:85,va:80,usda:80,nonqm:75}, detail:'Remove borrower as authorized user on someone else\'s credit cards. This eliminates the AU debt obligation from DTI calculations entirely. No credit score damage if borrower has their own established tradelines. Example: $8,000 AU balance with $200/mo minimum — removed from DTI entirely. Pull updated credit after removal to confirm. Check this FIRST before any payoff — it\'s free and instant.', bestFor:'Borrowers with high AU balances that are not their actual financial obligation' },
  { id:6,  title:'FHA vs. HomeReady vs. Home Possible Program Evaluation', category:'program', icon:'🔄', impact:'high', cost:'Free',            timeline:'Same Day',       risk:'Low',    programs:['fha','conventional','homeready','homepossible'], notPrograms:['va','usda','nonqm'], probability:{fha:90,conventional:88,homeready:90,homepossible:90}, detail:'HomeReady/Home Possible is better than FHA when: Credit 680+, DTI <50%, property in good condition, long-term ownership (MI drops at 78% LTV, saves $150–$250/mo after drop, $30K+ over loan life). FHA is better when: Credit 580–679, DTI 50%–57%, limited reserves, need 6% seller concessions, faster closing. Census Tract Exception: HomeReady/HP income limits are COMPLETELY WAIVED if property is in an eligible low-income census tract — check Fannie/Freddie lookup tools. This is frequently missed.', bestFor:'Every low-down-payment loan — evaluate program before assuming FHA is default' },
  { id:7,  title:'Rapid Rescore After Revolving Utilization Paydown', category:'credit', icon:'💳', impact:'high', cost:'$150–$300',             timeline:'2–4 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:85,conventional:88,homeready:88,homepossible:88,va:82,usda:80}, detail:'Pay credit cards to <30% utilization (ideal <10%). Request rapid rescore from lender. Typical FICO gain: 10–25 points in 72 hours. Conventional score tiers: 740+ = best pricing. 680–739 = better pricing. 640–679 = standard. <620 = ineligible. Target: get every card under 30%, and one card under 10% for maximum impact. Example: 80% utilization → 30% = 15–30 point gain. 678 → 695 FICO can unlock better pricing tier, saving 0.25%–0.50% in rate permanently.', bestFor:'Borrowers with revolving debt over 30% utilization — highest credit score ROI' },
  { id:8,  title:'Gift Funds for Down Payment or Reserves',        category:'reserves',icon:'🎁', impact:'high',    cost:'Free',                  timeline:'2–3 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], programWarning:'Non-QM often requires 5%–10% borrower funds — verify guidelines', probability:{fha:90,conventional:82,homeready:85,homepossible:85,va:88,usda:78}, detail:'Acceptable sources by program: FHA — family, employer, labor union, charitable org. Fannie Mae — relatives, fiancé, employer, close friend. Freddie Mac — relatives, fiancé, close friend. VA — very flexible, almost any source. Benefits: preserves borrower liquid assets (compensating factor), enables larger down payment (lower LTV), eliminates need for retirement liquidation. Document with gift letter + bank wire/transfer evidence.', bestFor:'First-time buyers with family support who need cash for down payment or reserves' },
  { id:9,  title:'Non-QM Pivot (Bank Statement / Asset Depletion / DSCR)', category:'program', icon:'🏦', impact:'high', cost:'1.5%–2.5% Higher Rate', timeline:'1–2 Weeks', risk:'Medium', programs:['fha','conventional','homeready','homepossible'], notPrograms:['nonqm'], probability:{fha:82,conventional:85,homeready:85,homepossible:85}, detail:'Three Non-QM paths when agency fails: (1) Bank Statement — 12 or 24-month deposits × 50% expense factor = qualifying income. Best for self-employed with write-offs. Example: $180K deposits × 50% = $90K qualifying income. (2) Asset Depletion — (Total Assets − Down Payment) ÷ 360 = monthly income. $2M assets → $5,278/mo qualifying income. Best for retirees. (3) DSCR — qualify on property cash flow only, no personal income. Best for investors. Exit strategy: use Non-QM for 12–24 months, rebuild qualifying profile, refinance to agency.', bestFor:'Self-employed with write-offs, high-asset retirees, or real estate investors' },
  { id:10, title:'VA Residual Income Optimization',                category:'dti',     icon:'🎖️', impact:'high',    cost:'Free–Medium',           timeline:'3–7 Days',       risk:'Low',    programs:['va'], notPrograms:['fha','conventional','homeready','homepossible','usda','nonqm'], probability:{va:88}, detail:'VA uses residual income as the PRIMARY qualifier — not DTI. Residual = Gross Income − (PITI + Debts + Monthly Taxes + Living Expenses). Regional requirements vary by family size and loan size. Optimization strategies: Include all income including BAH and disability (grossed up 25%), pay off small debts (even $50/mo matters), account for homeownership tax deductions, document all dependents (tax credits reduce obligation). Example: $7K income − $2.1K PITI − $800 debts − $1.2K taxes − $788 living = $2,112 residual vs. $1,173 requirement = APPROVED.', bestFor:'VA borrowers with DTI over 50% who have strong residual income' },
  { id:11, title:'USDA Front-End DTI Optimization',                category:'dti',     icon:'🌾', impact:'high',    cost:'Free–Medium',           timeline:'Days to Weeks',  risk:'Low',    programs:['usda'], notPrograms:['fha','conventional','homeready','homepossible','nonqm'], probability:{usda:80}, detail:'USDA requires BOTH front-end DTI (29% max housing) AND back-end (41% max total) — strictest of all programs. Both ratios must be met simultaneously. Optimization: Increase voluntary down payment (USDA allows it), buy down rate with seller concessions (lowers front-end), choose property in lower tax area, lower HOA/insurance, add co-borrower income. When USDA beats FHA: 0% down, rural property, lower MI costs (1% upfront vs 1.75%). When FHA beats USDA: front-end DTI 30%–40%, urban property, faster closing needed.', bestFor:'Rural buyers who can meet the strict 29/41 dual DTI requirement' },
  { id:12, title:'Occupancy Reclassification / Job Relocation',    category:'ltv',     icon:'🏠', impact:'high',    cost:'Free',                  timeline:'1–2 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','va'], notPrograms:['usda','nonqm'], probability:{fha:82,conventional:85,homeready:85,homepossible:85,va:80}, detail:'Buying new primary while owning current home can be misclassified as second home — triggering higher rate, higher DTI limits, and 10% down requirement. Solutions: (1) Job Relocation Letter — employer confirms transfer 50+ miles, new home closer to new job. (2) Current Home Listed or Under Contract — listing agreement OR ratified sales contract showing move within 60 days. Impact: avoids second-home classification, excludes current home payment from DTI, saves 0.25%–0.75% in rate, enables 3% down instead of 10%.', bestFor:'Relocating borrowers who still own their current primary residence' },
  { id:13, title:'12+ Months Cash Reserves as Compensating Factor', category:'reserves',icon:'💰', impact:'medium', cost:'Free (documentation)',   timeline:'1–2 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','nonqm'], notPrograms:['va'], probability:{fha:78,conventional:82,homeready:82,homepossible:82,nonqm:80,usda:72}, detail:'Reserve counting: 100% → Checking, savings, stocks/bonds (seasoned 30+ days). 60%–70% → 401k/IRA (penalty/tax discount). 100% → 401k loan (not withdrawal). 0% → Primary residence equity, personal property. When it helps most: High DTI (50%–57%) + 12+ months reserves = often approved on manual UW. Marginal credit (640–680) + 15 months reserves = often approved. Non-QM typically requires 6–24 months as baseline. Jumbo 6–12 months standard.', bestFor:'Borrowers with strong savings who have borderline DTI or credit score' },
  { id:14, title:'Rent Payment History Documentation',              category:'credit',  icon:'📄', impact:'medium', cost:'Free',                  timeline:'2–3 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:72,conventional:70,homeready:75,homepossible:75,va:70,usda:68}, detail:'Gather 12–24 months of canceled checks or bank statements showing on-time rent payments. Particularly valuable when proposed mortgage is ≥80% of current rent — demonstrates payment shock tolerance. Manual underwriting compensating factor that can offset high DTI or thin credit history. Example: current rent $1,800, proposed mortgage $2,000, 24 months of perfect history = strong manual UW compensating factor accepted by most investors.', bestFor:'First-time buyers with consistent on-time rent payment history' },
  { id:15, title:'Income Growth Documentation (Raise / Promotion)', category:'income',  icon:'📈', impact:'medium', cost:'Free',                  timeline:'1–2 Days',       risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:72,conventional:70,homeready:72,homepossible:72,va:68,usda:65}, detail:'Obtain employer letter documenting recent raise or promotion, including new salary effective date. Shows income trajectory is improving — suggests DTI will continue to decrease. Example: $60K → $75K (25% income growth) = strong compensating factor for manual underwriting. Most effective combined with other factors (reserves, rent history). Also useful for recent grads or career changers who show strong upward trajectory.', bestFor:'Borrowers recently promoted, given raises, or entering a higher-paying field' },
  { id:16, title:'Boarder / Accessory Unit Rental Income',          category:'income',  icon:'🏘️', impact:'high',   cost:'Free',                  timeline:'3–5 Days',       risk:'Medium', programs:['fha','conventional','homeready'], notPrograms:['homepossible','va','usda','nonqm'], programWarning:'HomeReady is most flexible for boarder income; Home Possible has restrictions', probability:{fha:78,conventional:70,homeready:82}, detail:'Document roommate or accessory unit rental income. Requirements: non-family member renter, arm\'s-length written lease agreement, 12 months of verified deposit history via bank statements. FHA allows boarder income to directly offset the housing expense in ratio calculations. HomeReady (Fannie) is specifically designed for multi-generational households and most flexible. Example: housing expense $2,000/mo, boarder income $500/mo → net housing $1,500 → DTI improves ~3.5%.', bestFor:'Multi-generational households or owner-occupants renting a room to a non-family tenant' },
  { id:17, title:'Overtime / Bonus Income Documentation',           category:'income',  icon:'⏰', impact:'high',   cost:'Free',                  timeline:'2–3 Days',       risk:'Medium', programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:78,conventional:80,homeready:80,homepossible:80,va:75,usda:72}, detail:'Standard requirement: 2-year history to use overtime or bonus income. Exception path: 12–18 months of history PLUS employer guarantee letter confirming it will continue. Letter must be specific about amount and continuity. Example: base salary qualifies borrower at 48% DTI, but adding $800/mo consistent overtime drops DTI to 42% — well within guidelines. All major AUS engines accept well-documented employer letters. W-2s for 2 years plus YTD paystubs required.', bestFor:'Borrowers with consistent overtime or annual bonus who have 12+ months of history' },
  { id:18, title:'HomeReady / Home Possible Census Tract Income Waiver', category:'program', icon:'🗺️', impact:'high', cost:'Free',               timeline:'Same Day',       risk:'Low',    programs:['homeready','homepossible','conventional'], notPrograms:['fha','va','usda','nonqm'], probability:{homeready:90,homepossible:90,conventional:85}, detail:'HomeReady and Home Possible have income limits (typically 80% AMI of area). Critical exception: income limits are COMPLETELY WAIVED if the property is in an eligible low-income census tract. Example: borrower income $95K, area income limit $85K → normally ineligible for HomeReady. Property checks out in eligible tract → income limit fully waived → qualifies for 3% down with better pricing than FHA. Use Fannie Mae HomeReady lookup tool and Freddie Mac Income & Property Eligibility tool. This opportunity is missed frequently.', bestFor:'Higher-income borrowers who would normally exceed HomeReady/HP limits' },
  { id:19, title:'Seller Concessions — Maximize to Build Reserves', category:'reserves',icon:'🤝', impact:'medium', cost:'Free (negotiation)',    timeline:'Contract Negotiation', risk:'Low', programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:80,conventional:75,homeready:78,homepossible:78,va:82,usda:80}, detail:'Maximum seller concession limits: FHA — 6% of sales price. Conventional >90% LTV — 3%. Conventional 75%–90% LTV — 6%. Conventional <75% LTV — 9%. VA — 4% plus reasonable closing costs. USDA — 6%. Strategy: use concessions to cover ALL closing costs, which preserves borrower\'s cash as liquid post-closing reserves. Higher reserves = stronger compensating factor for AUS. This converts borrower cash from costs into reserves — often moving AUS from Refer to Approve.', bestFor:'Borrowers who need reserves as compensating factor for high DTI or marginal credit' },
  { id:20, title:'AUS Re-Run After Rate Drop or Buydown',           category:'dti',     icon:'📉', impact:'medium', cost:'Free (re-run) or buydown cost', timeline:'Same Day', risk:'Low',  programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:72,conventional:72,homeready:72,homepossible:72,va:68,usda:68}, detail:'AUS recalculates based on current market rate entered. 0.5% rate drop = $75–$125/mo payment reduction = lower DTI. Example: 6.5% → 6.0% on $275K loan saves ~$100/mo, improving DTI by 0.75%–1.0%. Actions: (1) Simply re-run if market rates have moved since original submission. (2) Structure seller concessions as rate buydown — lower payment → lower rate → lower DTI → better AUS. (3) Use temporary 2-1 buydown if permanent rate too expensive. Always re-run AUS after any rate change.', bestFor:'Borrowers when current rates are lower than original AUS submission rate' },
  { id:21, title:'401K Loan vs. Withdrawal for Reserves',          category:'reserves',icon:'💼', impact:'medium', cost:'$50–$150 Fees',          timeline:'1–2 Weeks',      risk:'Medium', programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:75,conventional:78,homeready:78,homepossible:78,va:70,usda:72,nonqm:80}, detail:'401K withdrawal: only 60% of value counts (40% penalty/tax haircut applied by AUS). 401K loan: 100% of value counts as reserves, but the repayment adds to monthly obligations in DTI. Decision matrix: $30K in 401K → withdrawal = $18K in reserves, no DTI impact. Loan = $30K in reserves but adds $200–$400/mo to DTI. Use loan when: DTI has room to absorb repayment AND reserves critically needed. Use withdrawal when: DTI is already tight and can\'t add loan payment.', bestFor:'Borrowers with 401K assets when reserves are the primary approval obstacle' },
  { id:22, title:'Asset Consolidation (60-Day Seasoning Plan)',     category:'reserves',icon:'🏦', impact:'low',    cost:'Free',                  timeline:'2+ Months Planning', risk:'Low', programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:85,conventional:88,homeready:88,homepossible:88,va:82,usda:82,nonqm:80}, detail:'Consolidate multiple small accounts into one account 60+ days before closing application. Avoids large deposit sourcing requirements that require extensive paper trail documentation. Example: 5 accounts × $2K each = sourcing questions on each. 1 account × $10K (seasoned 60+ days) = clean, no documentation questions. Best used as proactive planning strategy 2–3 months before application. Also apply to any large deposits — document them before 60-day window if possible.', bestFor:'Proactive planning — advise borrowers to consolidate 60+ days before application' },
  { id:23, title:'Credit Mix Enhancement (Authorized User Addition)',category:'credit', icon:'💳', impact:'medium', cost:'Free',                  timeline:'30–60 Days',     risk:'Low',    programs:['fha','conventional','homeready','homepossible','va','usda'], notPrograms:['nonqm'], probability:{fha:72,conventional:70,homeready:72,homepossible:72,va:68,usda:68}, detail:'Add borrower as authorized user on a family member\'s well-seasoned account. Ideal account: 10+ year history, perfect payment record throughout, utilization <10%. Adds tradeline age, payment history, and credit mix to borrower\'s credit profile. Score improvement: 15–30 points typical for thin files. Best for first-time buyers with only 2–3 tradelines. Important: confirm borrower has their own active tradelines first — AU addition alone on a thin file may not be sufficient for underwriting.', bestFor:'First-time buyers or borrowers with thin credit files (2–3 tradelines)' },
];

const DUPLICATE_FLAGS = [
  { label:'Authorized user account counted in DTI',          detail:'AU accounts appear on credit report but borrower has no legal liability.',     fix:'Identify AU accounts, remove from DTI. If account has history of late payments, consider also removing as AU to protect score.' },
  { label:'Student loan double-counted (deferred + payment showing)', detail:'Some LOS systems count both the deferred status entry AND the IDR payment when both appear on report.',               fix:'Use only the IDR documented payment or the applicable percentage calculation. Remove duplicate deferred entry from DTI.' },
  { label:'Vehicle lease appearing as both installment and auto', detail:'Car leases sometimes surface in two separate tradeline categories on credit report, inflating DTI.',                  fix:'Pull all three bureaus. Verify only one entry per vehicle obligation. Document and remove duplicate.' },
  { label:'Child support included as both judgment and payment', detail:'Child support can appear as a court judgment AND as a recurring obligation, causing double-counting.',                    fix:'Use official court order to establish exact monthly amount. Remove any duplicate judgment entry.' },
  { label:'Co-signed debt counted for primary borrower',      detail:'Borrower co-signed for someone else. If that person is making all payments, the debt can be excluded.',                     fix:'Provide 12 months of bank statements showing the primary borrower on the co-signed account making all payments from their own account.' },
  { label:'Closed or paid account still in DTI',              detail:'Paid-off or recently closed accounts may still show a minimum payment in AUS.',                                            fix:'Pull payoff/closure letter. Zero out the payment in LOS. Rapid rescore if needed to update tradeline status.' },
  { label:'Business debt included in personal DTI (self-employed)', detail:'Business loans or lines of credit that appear on personal credit but are paid by the business should be excluded.', fix:'Provide 12 months of business bank statements showing the business making all payments on the account from business funds.' },
  { label:'Rental property debt without rental income offset', detail:'If a rental property PITIA is in DTI but the rental income is not being counted, the net obligation is artificially inflated.', fix:'Document rental income via current signed lease plus 2-year Schedule E. Use net rental income to offset the full PITIA obligation.' },
];

const IMPACT_BADGE = { critical:'bg-red-100 text-red-700 border border-red-200', high:'bg-orange-100 text-orange-700 border border-orange-200', medium:'bg-yellow-100 text-yellow-700 border border-yellow-200', low:'bg-slate-100 text-slate-500 border border-slate-200' };
const pColor = p => p >= 85 ? 'text-emerald-600' : p >= 65 ? 'text-amber-600' : 'text-red-500';
const pBar   = p => p >= 85 ? 'bg-emerald-500'   : p >= 65 ? 'bg-amber-500'   : 'bg-red-400';
const LIKELIHOOD_STYLE = { High:'bg-emerald-50 border-emerald-300 text-emerald-700', Medium:'bg-amber-50 border-amber-300 text-amber-700', Low:'bg-red-50 border-red-300 text-red-600' };
const CATS = { dti:{ label:'DTI / Payment', icon:'📊' }, credit:{ label:'Credit', icon:'💳' }, reserves:{ label:'Reserves', icon:'💰' }, income:{ label:'Income', icon:'📈' }, ltv:{ label:'LTV / Occupancy', icon:'🏠' }, program:{ label:'Program Switch', icon:'🔄' } };
const FEAS_STYLE = {
  HIGH:   { banner:'from-emerald-900 to-slate-900 border-emerald-600', badge:'bg-emerald-500/20 text-emerald-300 border-emerald-400/40', dot:'🟢' },
  MEDIUM: { banner:'from-amber-900 to-slate-900 border-amber-600',     badge:'bg-amber-500/20 text-amber-300 border-amber-400/40',       dot:'🟡' },
  LOW:    { banner:'from-red-900 to-slate-900 border-red-700',          badge:'bg-red-500/20 text-red-300 border-red-400/40',             dot:'🔴' },
};
const BLOCKER_COLOR = { dti:'text-red-400', credit:'text-orange-400', downPayment:'text-orange-400', ltv:'text-orange-400', eligibility:'text-amber-400' };
const getDimLabel = score => { if (score >= 80) return 'Excellent'; if (score >= 60) return 'Good'; if (score >= 40) return 'Fair'; return 'Poor'; };

export default function AUSRescue() {
  const [searchParams] = useSearchParams();

  // ── Scenario from Firestore ───────────────────────────────────────────────
  const scenarioIdFromUrl = searchParams.get('scenarioId') || '';
  const [scenarioDoc, setScenarioDoc]     = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  useEffect(() => {
    if (!scenarioIdFromUrl) return;
    setScenarioLoading(true);
    getDoc(doc(db, 'scenarios', scenarioIdFromUrl))
      .then(snap => { if (snap.exists()) setScenarioDoc({ id: snap.id, ...snap.data() }); })
      .catch(console.error)
      .finally(() => setScenarioLoading(false));
  }, [scenarioIdFromUrl]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [scenarios, setScenarios]             = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarioIdFromUrl || '');
  const [selectedScenario, setSelectedScenario]     = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [program, setProgram]                 = useState('conventional');
  const [currentFinding, setCurrentFinding]   = useState('');
  const [programFindings, setProgramFindings] = useState({});
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [profile, setProfile] = useState({ creditScore:'', dti:'', frontEndDTI:'', reserves:'', downPayment:'', interestRate:'', isVeteran:false, isRuralProperty:false, isSelfEmployed:false, hasRecentBankruptcy:false, inCensusEligibleTract:false, exceedsIncomeLimit:false, isRehabProperty:false, isInvestmentProperty:false, isJumboLoan:false, isHighAssetBorrower:false });
  const [selectedCats, setSelectedCats]       = useState([]);
  const [activeTab, setActiveTab]             = useState('dealadvisor');
  const [flaggedDuplicates, setFlaggedDuplicates] = useState([]);
  const [auditLog, setAuditLog]               = useState([]);
  const [expandedId, setExpandedId]           = useState(null);
  const [isParsing, setIsParsing]             = useState(false);
  const [parseResult, setParseResult]         = useState(null);
  const [parseError, setParseError]           = useState('');
  const [writeBackDismissed, setWriteBackDismissed] = useState({});
  const [showMigrationEngine, setShowMigrationEngine] = useState(false);
  const [submissionNumber, setSubmissionNumber] = useState(null);
  const [caseFileId, setCaseFileId]             = useState(null);
  const [ausEngineDetected, setAusEngineDetected] = useState(null);
  const [sonnetResults, setSonnetResults]       = useState(null);
  const [sonnetLoading, setSonnetLoading]       = useState(false);
  const [sonnetError, setSonnetError]           = useState('');
  const [enrichedParseData, setEnrichedParseData] = useState(null);
  const [matchedScenario, setMatchedScenario]     = useState(null);   // auto-matched from PDF
  const [matchConfirmed, setMatchConfirmed]       = useState(false);  // LO confirmed the match
  const [matchWriting, setMatchWriting]           = useState(false);  // writing back to Firestore
  const [matchWritten, setMatchWritten]           = useState(false);  // write-back complete
  const [showScenarioPicker, setShowScenarioPicker] = useState(false); // manual override picker

  const { reportFindings } = useDecisionRecord(selectedScenarioId);
  const [savedRecordId, setSavedRecordId]     = useState(null);
  const [recordSaving, setRecordSaving]       = useState(false);
  const displayRecordId = savedRecordId;

  // ── Load scenarios ────────────────────────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, 'scenarios'))
      .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── When scenarioDoc loads from URL, pre-populate profile ─────────────────
  useEffect(() => {
    if (!scenarioDoc) return;
    setSelectedScenarioId(scenarioDoc.id);
    setSelectedScenario(scenarioDoc);
    setProfile(prev => ({
      ...prev,
      creditScore:  scenarioDoc.creditScore?.toString()   || prev.creditScore,
      dti:          scenarioDoc.backDti?.toString()        || prev.dti,
      frontEndDTI:  scenarioDoc.frontDti?.toString()       || prev.frontEndDTI,
      downPayment:  scenarioDoc.downPayment > 0 && scenarioDoc.propertyValue > 0
                      ? ((scenarioDoc.downPayment / scenarioDoc.propertyValue) * 100).toFixed(1)
                      : prev.downPayment,
      interestRate: scenarioDoc.interestRate?.toString()   || prev.interestRate,
      isVeteran:    scenarioDoc.loanType === 'VA',
    }));
    const lt = (scenarioDoc.loanType || '').toUpperCase();
    if (lt.includes('FHA'))  setProgram('fha');
    else if (lt.includes('VA'))  setProgram('va');
    else if (lt.includes('USDA')) setProgram('usda');
    else setProgram('conventional');
  }, [scenarioDoc]);

  const addLog = msg => setAuditLog(p => [{ msg, time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) }, ...p.slice(0, 24)]);
  const setFinding = (finding, targetProgram = program) => {
    if (targetProgram === program) setCurrentFinding(finding);
    setProgramFindings(prev => ({ ...prev, [targetProgram]: finding }));
    addLog(`Finding [${PROGRAMS[targetProgram]?.label}]: ${finding}`);
  };

  const handleScenarioSelect = id => {
    setSelectedScenarioId(id);
    const sc = scenarios.find(s => s.id === id);
    setSelectedScenario(sc || null);
    setSavedRecordId(null);
    if (sc) {
      setProfile(prev => ({ ...prev, creditScore: sc.creditScore || '', dti: sc.backDti || sc.dti || '', downPayment: '' }));
      addLog(`Loaded: ${sc.scenarioName || id}`);
    }
  };

  // ── Write AUS findings back to scenario in Firestore ─────────────────────
  const writeAUSFindingsToScenario = async (scenarioId, parsed, finding) => {
    if (!scenarioId) return;
    setMatchWriting(true);
    try {
      await updateDoc(doc(db, 'scenarios', scenarioId), {
        ausLastFinding:      finding || '',
        ausLastRunAt:        serverTimestamp(),
        ausSubmissionNumber: parsed.submissionNumber || null,
        ausCaseFileId:       parsed.caseFileId || null,
        ausEngine:           parsed.ausEngine || null,
        ausPrimaryBlocker:   parsed.ineligibilityReasons?.[0] || null,
        ausDTI:              parsed.backEndDTI || null,
        ausLTV:              parsed.ltv || null,
        ausCreditScore:      parsed.creditScore || null,
        ausLoanPurpose:      parsed.loanPurpose || null,
        ausRefiPurpose:      parsed.refiPurpose || null,
        ausDUMessageIds:     parsed.duMessageIds || [],
        // Also update core scenario fields if they were empty
        creditScore:         parsed.creditScore || null,
        backDti:             parsed.backEndDTI || null,
        frontDti:            parsed.frontEndDTI || null,
        interestRate:        (parsed.noteRate || parsed.interestRate) || null,
      });
      setMatchWritten(true);
      addLog(`✓ AUS findings written to scenario`);
    } catch (err) {
      console.error('AUS write-back failed:', err);
      addLog(`Write-back failed: ${err.message}`);
    } finally {
      setMatchWriting(false);
    }
  };

  // ── Confirm matched scenario and write findings ───────────────────────────
  const handleConfirmMatch = () => {
    setMatchConfirmed(true);
    setShowScenarioPicker(false);
    if (matchedScenario && enrichedParseData) {
      writeAUSFindingsToScenario(matchedScenario.id, enrichedParseData, currentFinding);
    }
  };

  const handleRejectMatch = () => {
    setMatchedScenario(null);
    setMatchConfirmed(false);
    setShowScenarioPicker(true);
  };

  const handleManualScenarioSelect = id => {
    const sc = scenarios.find(s => s.id === id);
    if (!sc) return;
    setMatchedScenario(sc);
    setSelectedScenarioId(sc.id);
    setMatchConfirmed(true);
    setShowScenarioPicker(false);
    if (enrichedParseData) {
      writeAUSFindingsToScenario(sc.id, enrichedParseData, currentFinding);
    }
  };

  const ruleEngineInput = profile.creditScore && profile.dti ? {
    creditScore: +profile.creditScore, dti: +profile.dti, frontEndDTI: +profile.frontEndDTI || 0,
    downPct: +profile.downPayment || 0, reserves: +profile.reserves || 0, interestRate: +profile.interestRate || 0,
    isVeteran: profile.isVeteran, isRuralProperty: profile.isRuralProperty, isSelfEmployed: profile.isSelfEmployed,
    hasRecentBankruptcy: profile.hasRecentBankruptcy, inCensusEligibleTract: profile.inCensusEligibleTract,
    exceedsIncomeLimit: profile.exceedsIncomeLimit,
  } : null;

  const ruleResults  = ruleEngineInput ? evaluatePrograms(ruleEngineInput, programFindings) : null;
  const programResults = (ruleResults?.results ?? []).filter(r => r && r.key).map(r => ({
    ...r, label: r.label || PROGRAMS[r.key]?.label || r.key, agency: r.agency || PROGRAMS[r.key]?.agency || '',
    finding: r.finding || '', probability: r.probability ?? 0, likelihood: r.likelihood || 'Low',
    strengths: Array.isArray(r.strengths) ? r.strengths : [], blockers: Array.isArray(r.blockers) ? r.blockers : [],
    notes: r.notes || '', eligible: r.eligible || false,
  }));

  const pathScenario  = { dti: +profile.dti || 0, reservesMonths: +profile.reserves || 0 };
  const scoredPrograms = programResults.map(prog => ({ ...prog, ...calculatePathScore(prog, pathScenario) })).sort((a, b) => b.pathScore - a.pathScore).filter(r => {
    const key = (r.key || '').toLowerCase(), label = (r.label || '').toLowerCase();
    if ((key.includes('va') || label.includes('va')) && !profile.isVeteran) return false;
    if ((key.includes('usda') || label.includes('usda')) && !profile.isRuralProperty) return false;
    if ((key.includes('203k') || label.includes('203k')) && !profile.isRehabProperty) return false;
    if ((key.includes('homestyle') || label.includes('homestyle')) && !profile.isRehabProperty) return false;
    if ((key.includes('dscr') || label.includes('dscr')) && !profile.isInvestmentProperty) return false;
    if ((key.includes('jumbo') || label.includes('jumbo')) && !profile.isJumboLoan) return false;
    if ((key.includes('bank_stmt') || label.includes('bank statement')) && !profile.isSelfEmployed) return false;
    if ((key.includes('asset_dep') || label.includes('asset depletion')) && !profile.isHighAssetBorrower) return false;
    return true;
  });

  // ── PME Profile — maps AUSRescue profile state → programRuleEngine shape ──
  const pmeProfile = useMemo(() => {
    if (!profile.creditScore && !scenarioDoc) return null;

    // If we have a full Firestore scenario doc, use the extractor
    if (scenarioDoc) {
      const base = extractProfileFromScenario(scenarioDoc);
      // Overlay manual profile fields (user may have edited them)
      return {
        ...base,
        fico:               +profile.creditScore || base.fico,
        dti:                +profile.dti         || base.dti,
        vaEligible:         profile.isVeteran    || base.vaEligible,
        ruralEligible:      profile.isRuralProperty || base.ruralEligible,
        investmentProperty: profile.isInvestmentProperty || base.investmentProperty,
        propertyNeedsRehab: profile.isRehabProperty ? true
                          : profile.isRehabProperty === false ? false
                          : base.propertyNeedsRehab,
        selfEmployed:       profile.isSelfEmployed || base.selfEmployed,
        reserves:           +profile.reserves || base.reserves,
      };
    }

    // Manual profile only — build from form fields
    const downPct  = +profile.downPayment || 0;
    const ltv      = downPct > 0 ? +(100 - downPct).toFixed(2) : null;
    return {
      fico:               +profile.creditScore  || null,
      dti:                +profile.dti          || null,
      ltv,
      loanAmount:         null,
      occupancy:          'PRIMARY',
      vaEligible:         profile.isVeteran,
      ruralEligible:      profile.isRuralProperty,
      investmentProperty: profile.isInvestmentProperty,
      propertyNeedsRehab: profile.isRehabProperty || null,
      selfEmployed:       profile.isSelfEmployed,
      reserves:           +profile.reserves || null,
      bankruptcyYearsAgo: null,
      foreclosureYearsAgo:null,
    };
  }, [profile, scenarioDoc]);

  const handleSaveToRecord = async () => {
    if (!currentFinding || !ruleResults || !profile.creditScore || !profile.dti) return;
    setRecordSaving(true);
    try {
      const activeRateSensitivity = ruleEngineInput ? rateSensitivity(ruleEngineInput, PROGRAM_RULES[program] || { maxDTI: 50 }) : null;
      const writtenRecordId = await reportFindings('AUS_RESCUE', {
        creditScore: profile.creditScore, dti: profile.dti, interestRate: profile.interestRate, program,
        feasibilityScore: ruleResults.feasibilityScore, feasibilityLabel: ruleResults.feasibilityLabel,
        primaryBlocker: ruleResults.primaryBlocker, ruleResults: programResults, rateSensitivity: activeRateSensitivity,
        recommendedPath: scoredPrograms[0]?.programCode, pathScore: scoredPrograms[0]?.pathScore,
        scoreBreakdown: scoredPrograms[0]?.scoreBreakdown, scoringModelVersion: scoredPrograms[0]?.scoringModelVersion,
        allProgramScores: scoredPrograms.map(p => ({ programCode: p.programCode || p.key, pathScore: p.pathScore })),
        timestamp: new Date().toISOString(),
      });
      if (writtenRecordId) setSavedRecordId(writtenRecordId);
      addLog('Saved to Decision Record');
    } catch (e) { console.error('Decision Record save failed:', e); }
    finally { setRecordSaving(false); }
  };

  const runAISonnetAnalysis = async () => {
    if (!pmeProfile || !pmeProfile.fico) return;
    setSonnetLoading(true);
    setSonnetError('');
    addLog('Sonnet AI: refining program probabilities…');
    try {
      const { rankPrograms, identifyPrimaryBlocker, assessFeasibility } = await import('../engines/programRuleEngine');
      const ranked      = rankPrograms(pmeProfile);
      const blocker     = identifyPrimaryBlocker(ranked);
      const feasibility = assessFeasibility(ranked);
      const ruleEngineResults = {
        programs:       ranked,
        primaryBlocker: blocker?.rule || 'Unknown',
        feasibility,
      };
      // Map pmeProfile to the shape ausRescueReasoning expects
      const borrowerProfile = {
        fico:             pmeProfile.fico,
        dti:              pmeProfile.dti,
        ltv:              pmeProfile.ltv,
        loanAmount:       pmeProfile.loanAmount,
        propertyType:     pmeProfile.propertyType,
        occupancy:        pmeProfile.occupancy,
        reservesMonths:   pmeProfile.reserves,
        employmentMonths: pmeProfile.employmentMonths,
        isVeteran:        pmeProfile.vaEligible,
        isSelfEmployed:   pmeProfile.selfEmployed,
        bankruptcyMonths: pmeProfile.bankruptcyYearsAgo ? Math.round(pmeProfile.bankruptcyYearsAgo * 12) : null,
        foreclosureMonths:pmeProfile.foreclosureYearsAgo ? Math.round(pmeProfile.foreclosureYearsAgo * 12) : null,
        recentLates:      null,
      };
      const result = await runSonnetReasoning({ borrowerProfile, ruleEngineResults });
      setSonnetResults(result);
      addLog(`Sonnet AI: analysis complete — Feasibility ${result.feasibility}`);
    } catch (err) {
      setSonnetError(err.message || 'Sonnet analysis failed');
      addLog(`Sonnet AI error: ${err.message}`);
    } finally {
      setSonnetLoading(false);
    }
  };

  const parsePDFWithClaude = async (file) => {
    setIsParsing(true); setParseError(''); setParseResult(null); setEnrichedParseData(null);
    addLog(`Parsing: ${file.name}`);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(',')[1]);
        r.onerror = () => reject(new Error('Failed to read file'));
        r.readAsDataURL(file);
      });
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not set in .env file');

      const PARSE_PROMPT = `You are parsing a DU or LPA AUS findings PDF. Return ONLY a valid JSON object — no markdown fences, no explanation, nothing else before or after the JSON.

Extract these fields exactly as shown. Use null for missing fields. Use actual numbers (not strings) for numeric fields.

{
  "ausEngine": "du",
  "recommendation": "Approve/Ineligible",
  "finding": "Approve/Ineligible",
  "program": "conventional",
  "loanPurpose": "Refinance",
  "refiPurpose": "Limited Cash-Out",
  "loanType": "Conventional",
  "loanTerm": 360,
  "loanAmount": 183000,
  "appraisedValue": 325000,
  "ltv": 57.0,
  "cltv": 57.0,
  "noteRate": 6.625,
  "borrowerName": "Tabitha Henderson",
  "propertyAddress": "6510 Carriage Ln, Stone Mountain, GA 30087",
  "propertyType": "Detached",
  "occupancy": "Primary Residence",
  "creditScore": 639,
  "allCreditScores": [531, 639, 644],
  "backEndDTI": 41.9,
  "frontEndDTI": 41.9,
  "reservesMonths": 5,
  "monthlyIncome": 4152.27,
  "totalHousingPayment": 1739.59,
  "cashBack": 682.38,
  "isVeteran": false,
  "isSelfEmployed": false,
  "submissionNumber": 3,
  "caseFileId": "1721702784",
  "ineligibilityReasons": ["Cash taken out exceeds LCOR threshold per MSG 1772", "Does not meet minimum credit standards per MSG 3895"],
  "duMessageIds": ["0007", "0633", "1772", "2375", "3629", "3895"],
  "duMessages": [
    {"id": "0633", "summary": "Loan may be eligible as cash-out refinance instead of limited cash-out"},
    {"id": "1772", "summary": "Cash taken out exceeds the greater of 1% of loan amount or $2000 for LCOR"},
    {"id": "3895", "summary": "Does not satisfy Fannie Mae minimum credit standards"}
  ],
  "liabilitiesToPayoff": [
    {"creditor": "Carrington Mortgage Services", "balance": 137211.26, "payment": 821},
    {"creditor": "Chrysler Capital", "balance": 27013, "payment": 848}
  ],
  "riskFactors": ["Borderline credit score 639", "Payment history unverifiable on Carrington"],
  "strengths": ["Combined Loan-to-Value Ratio"],
  "detectedIssues": ["credit"],
  "secondJob": false,
  "hasSalariedIncome": true
}

CRITICAL RULES:
- loanPurpose: if document says "Loan Purpose: Refinance" it is NOT a purchase — use "Refinance"
- refiPurpose: look for "Refi Purpose" field — use exact value like "Limited Cash-Out" or "Cash-Out"
- cashBack: look for "Cash Back" dollar amount in the Funds section (e.g. $682.38)
- duMessageIds: list every MSG ID number you find in the document
- duMessages: write a plain-English summary for each MSG ID — especially 0633, 1772, 3629, 3895
- liabilitiesToPayoff: list every creditor shown in the payoff table
- allCreditScores: list all three bureau scores if shown
- All numbers must be actual JSON numbers, not strings`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 3000,
          messages: [{ role:'user', content:[
            { type:'document', source:{ type:'base64', media_type:'application/pdf', data:base64Data } },
            { type:'text', text: PARSE_PROMPT }
          ] }],
        }),
      });
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error?.message || `API error ${response.status}`); }
      const data = await response.json();
      const raw  = data.content?.[0]?.text || '';

      // Robust JSON extraction — handles truncation and markdown fences
      let parsed;
      try {
        const cleaned = raw.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to extract just the JSON object if there's extra text
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            // Last resort: truncated JSON — try to close it
            const partial = match[0];
            const fixAttempts = [
              partial + '"}]}',
              partial + '"]}',
              partial + '"}',
              partial + '}',
            ];
            let fixed = false;
            for (const attempt of fixAttempts) {
              try { parsed = JSON.parse(attempt); fixed = true; break; } catch {}
            }
            if (!fixed) throw new Error(`JSON parse failed. Raw response: ${raw.slice(0, 200)}`);
          }
        } else {
          throw new Error('No JSON found in response');
        }
      }

      const engineToProgram = { du:'conventional', lpa:'conventional', fha_total:'fha' };
      const validKeys = Object.keys(PROGRAMS);
      const detectedProgram = (parsed.program && validKeys.includes(parsed.program)) ? parsed.program : (engineToProgram[parsed.ausEngine] || 'conventional');
      const findingMap = { 'approve/eligible':'Approve/Eligible','refer/eligible':'Refer/Eligible','refer with caution':'Refer with Caution','ineligible':'Ineligible','accept/eligible':'Accept/Eligible','accept':'Accept','caution':'Caution','refer':'Refer','approved':'Approved','declined':'Declined','approve/ineligible':'Approve/Ineligible' };
      const normalizedFinding = findingMap[parsed.finding?.toLowerCase().trim()] || findingMap[parsed.recommendation?.toLowerCase().trim()] || parsed.finding || '';

      setProgram(detectedProgram);
      setFinding(normalizedFinding, detectedProgram);
      setProfile(prev => ({
        ...prev,
        creditScore:    parsed.creditScore?.toString()    || prev.creditScore,
        dti:            parsed.backEndDTI?.toString()      || prev.dti,
        frontEndDTI:    parsed.frontEndDTI?.toString()     || prev.frontEndDTI,
        reserves:       parsed.reservesMonths?.toString()  || prev.reserves,
        downPayment:    parsed.loanPurpose === 'Purchase' ? (parsed.downPaymentPct?.toString() || prev.downPayment) : prev.downPayment,
        interestRate:   (parsed.noteRate || parsed.interestRate)?.toString() || prev.interestRate,
        isVeteran:      parsed.isVeteran === true,
        isSelfEmployed: parsed.isSelfEmployed || prev.isSelfEmployed,
      }));
      if (parsed.detectedIssues?.length) setSelectedCats(parsed.detectedIssues.filter(i => i in CATS));
      if (parsed.submissionNumber != null) setSubmissionNumber(parsed.submissionNumber);
      if (parsed.caseFileId)               setCaseFileId(parsed.caseFileId);
      if (parsed.ausEngine)                setAusEngineDetected(parsed.ausEngine);

      // Store full enriched data for DealAdvisor
      setEnrichedParseData(parsed);

      // ── Auto-match borrower to scenario ──────────────────────────────────
      // If we already have a scenario from URL, use it directly
      if (scenarioIdFromUrl && scenarioDoc) {
        setMatchedScenario(scenarioDoc);
        setMatchConfirmed(true);
        writeAUSFindingsToScenario(scenarioDoc.id, parsed, normalizedFinding);
      } else {
        // Try to match by borrower name from parsed PDF
        const parsedName = (parsed.borrowerName || '').toLowerCase().trim();
        if (parsedName && scenarios.length > 0) {
          const match = scenarios.find(s => {
            const scenName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().trim();
            const scenAlt  = (s.borrowerName || s.scenarioName || '').toLowerCase().trim();
            return parsedName.includes(scenName.split(' ')[0]) ||
                   scenName.includes(parsedName.split(' ')[0]) ||
                   parsedName === scenName ||
                   parsedName === scenAlt;
          });
          if (match) {
            setMatchedScenario(match);
            setSelectedScenarioId(match.id);
            setMatchConfirmed(false); // show confirm UI
          }
        }
      }

      const fieldsFound = [
        normalizedFinding && 'Finding',
        parsed.loanPurpose && `Loan Purpose: ${parsed.loanPurpose}`,
        parsed.refiPurpose && `Refi Type: ${parsed.refiPurpose}`,
        parsed.creditScore && `Credit Score: ${parsed.creditScore}`,
        parsed.backEndDTI && `DTI: ${parsed.backEndDTI}%`,
        parsed.loanAmount && `Loan: $${parsed.loanAmount?.toLocaleString()}`,
        parsed.appraisedValue && `Value: $${parsed.appraisedValue?.toLocaleString()}`,
        parsed.ltv && `LTV: ${parsed.ltv}%`,
        parsed.reservesMonths && `Reserves: ${parsed.reservesMonths} mo`,
        parsed.submissionNumber && `Submission #${parsed.submissionNumber}`,
        parsed.duMessageIds?.length && `${parsed.duMessageIds.length} DU Messages`,
        parsed.ineligibilityReasons?.length && `${parsed.ineligibilityReasons.length} ineligibility reason(s)`,
      ].filter(Boolean);
      setParseResult({ fileName: file.name, fieldsFound, riskFactors: parsed.riskFactors || [] });
      addLog(`Parsed: ${parsed.loanPurpose || 'Unknown purpose'} | ${normalizedFinding} | FICO ${parsed.creditScore} | DTI ${parsed.backEndDTI}%`);
    } catch (err) {
      setParseError(err.message.includes('VITE_ANTHROPIC_API_KEY') ? 'Add VITE_ANTHROPIC_API_KEY to your .env file to enable PDF parsing' : `Parse failed: ${err.message}`);
      addLog(`Parse failed: ${err.message}`);
    } finally { setIsParsing(false); }
  };

  const handleFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setParseError('Please upload a PDF file (.pdf)'); return; }
    if (file.size > 10 * 1024 * 1024) { setParseError('File too large — max 10MB'); return; }
    parsePDFWithClaude(file);
    e.target.value = '';
  };

  const isPositive = currentFinding && PROGRAMS[program]?.positiveFindings?.includes(currentFinding);
  const needsRescue = currentFinding && !isPositive;
  const relevantStrategies = STRATEGIES.filter(s => s.programs.includes(program) && (selectedCats.length === 0 || selectedCats.includes(s.category))).sort((a, b) => (b.probability[program] || 0) - (a.probability[program] || 0));
  const toggleCat = cat => setSelectedCats(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);
  const toggleDup = idx => { setFlaggedDuplicates(p => { const next = p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx]; addLog(next.includes(idx) ? `🔍 Flagged: ${DUPLICATE_FLAGS[idx].label}` : `✔ Cleared: ${DUPLICATE_FLAGS[idx].label}`); return next; }); };

  const generateNotes = () => {
    let n = `AUS RESCUE™ v2.0 LO NOTES\n${new Date().toLocaleDateString()} | LoanBeacons™ | Patent Pending\n${'─'.repeat(45)}\nPROGRAM: ${PROGRAMS[program]?.label} | FINDING: ${currentFinding}\n`;
    if (profile.creditScore) n += `Credit: ${profile.creditScore} | DTI: ${profile.dti}% | Reserves: ${profile.reserves} months\n`;
    if (ruleResults?.primaryBlocker) n += `\nPRIMARY BLOCKER: ${ruleResults.primaryBlocker.label}\n${ruleResults.primaryBlocker.detail}\nACTION: ${ruleResults.primaryBlocker.action}\n`;
    if (ruleResults) n += `\nFEASIBILITY: ${ruleResults.feasibilityLabel} (${ruleResults.feasibilityScore}%)\n`;
    if (scoredPrograms.length > 0) n += `\nBEST PATH: ${scoredPrograms[0].label} — Path Score ${scoredPrograms[0].pathScore}/100\n`;
    if (flaggedDuplicates.length) { n += `\nDUPLICATE DEBT FLAGS:\n`; flaggedDuplicates.forEach(i => { n += `  ⚠ ${DUPLICATE_FLAGS[i].label}\n    Fix: ${DUPLICATE_FLAGS[i].fix}\n`; }); }
    n += `\nSTRATEGIES (${PROGRAMS[program]?.label}):\n`;
    relevantStrategies.forEach((s, i) => { n += `\n${i + 1}. [${s.probability[program]}%] ${s.title}\n   ${s.cost} | ${s.timeline} | ${s.detail}\n`; });
    if (scoredPrograms.length > 0) { n += `\nPROGRAM ALTERNATIVES (by Path Score):\n`; scoredPrograms.slice(0, 5).forEach(r => { n += `   ${r.label}: PathScore ${r.pathScore} | Approval ${r.probability}%\n`; }); }
    navigator.clipboard.writeText(n).catch(() => {});
    addLog('Notes exported to clipboard');
    alert('LO Notes copied to clipboard!');
  };

  // ── Borrower display ──────────────────────────────────────────────────────
  const bName = scenarioDoc ? `${scenarioDoc.firstName || ''} ${scenarioDoc.lastName || ''}`.trim() : (selectedScenario ? (selectedScenario.scenarioName || selectedScenario.id) : '');
  const bAddr = scenarioDoc ? [scenarioDoc.streetAddress, scenarioDoc.city, scenarioDoc.state, scenarioDoc.zipCode].filter(Boolean).join(', ') : '';
  const bFico = scenarioDoc?.creditScore || profile.creditScore;
  const bLoan = scenarioDoc?.loanType || '';
  const bDTI  = scenarioDoc?.backDti || profile.dti;
  const bPrice = scenarioDoc?.propertyValue;


  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <ModuleNav moduleNumber={8} />

      {selectedScenarioId && <DecisionRecordBanner scenarioId={selectedScenarioId} moduleKey="AUS_RESCUE" />}

      {/* ── PAGE HEADER ── */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 2 — Lender Fit</span>
            <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 8</span>
            <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">v3.0</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>AUS Rescue™</h1>
          <p className="text-indigo-200 text-sm mt-0.5">Upload your DU or LP findings — Deal Advisor™ takes it from there.</p>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {/* Show matched scenario or prompt to upload */}
            {matchedScenario && matchConfirmed ? (
              <div className="flex items-center gap-3 bg-emerald-900/40 border border-emerald-600/40 rounded-xl px-4 py-2">
                <span className="text-emerald-400 text-sm">✓</span>
                <div>
                  <p className="text-white text-sm font-semibold">{`${matchedScenario.firstName || ''} ${matchedScenario.lastName || ''}`.trim() || matchedScenario.scenarioName}</p>
                  <p className="text-emerald-300 text-xs">{matchWriting ? 'Saving findings to scenario…' : matchWritten ? 'AUS findings saved to scenario' : 'Matched scenario'}</p>
                </div>
                <button onClick={() => setShowScenarioPicker(true)} className="text-slate-400 hover:text-slate-200 text-xs ml-2 underline">Change</button>
              </div>
            ) : matchedScenario && !matchConfirmed ? (
              <div className="flex items-center gap-3 bg-amber-900/40 border border-amber-600/40 rounded-xl px-4 py-2 flex-wrap">
                <span className="text-amber-400 text-sm">🔍</span>
                <div>
                  <p className="text-white text-sm font-semibold">Matched: {`${matchedScenario.firstName || ''} ${matchedScenario.lastName || ''}`.trim() || matchedScenario.scenarioName}</p>
                  <p className="text-amber-300 text-xs">Is this the correct scenario?</p>
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={handleConfirmMatch} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">✓ Yes, save findings</button>
                  <button onClick={handleRejectMatch} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">✗ Wrong scenario</button>
                </div>
              </div>
            ) : showScenarioPicker ? (
              <div className="flex items-center gap-2">
                <select onChange={e => handleManualScenarioSelect(e.target.value)} defaultValue="" className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-w-[220px]">
                  <option value="" disabled>— Select correct scenario —</option>
                  {scenarios.map(s => <option key={s.id} value={s.id}>{`${s.firstName || ''} ${s.lastName || ''}`.trim() || s.scenarioName || s.id.slice(0, 8)}</option>)}
                </select>
                <button onClick={() => setShowScenarioPicker(false)} className="text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Upload a DU or LP PDF above — borrower auto-matches to scenario</p>
            )}
          </div>
        </div>
      </div>

      {/* ── BORROWER BANNER ── */}
      {(bName || bAddr || bFico) && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto">
            <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest mb-1">Borrower Scenario — AUS Rescue™</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              {bName  && <span className="text-white font-bold text-base">{bName}</span>}
              {bAddr  && <span className="text-blue-200 text-sm">{bAddr}</span>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-100">
                {bFico  && <span>FICO <strong className="text-white">{bFico}</strong></span>}
                {bLoan  && <span>Loan <strong className="text-white">{bLoan}</strong></span>}
                {bPrice && <span>Value <strong className="text-white">${Number(bPrice).toLocaleString()}</strong></span>}
                {bDTI   && <span>DTI <strong className="text-white">{bDTI}%</strong></span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

          {/* ── LEFT SIDEBAR ── */}
          <div className="xl:col-span-1 space-y-4">

            {/* PDF Upload */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-slate-900 px-5 py-4">
                <p className="text-white font-bold text-sm" style={{ fontFamily: "'DM Serif Display', serif" }}>Step 1 — Upload Findings</p>
                <p className="text-slate-400 text-xs mt-0.5">DU or LP PDF · fields auto-populate</p>
              </div>
              <div className="p-4">
                <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${isParsing ? 'border-indigo-400 bg-indigo-50/40' : parseResult ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 hover:border-indigo-300 bg-slate-50'}`}>
                  {isParsing ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-indigo-600 font-semibold">Reading findings…</span>
                    </div>
                  ) : parseResult ? (
                    <div>
                      <p className="text-sm font-bold text-emerald-700">✓ {parseResult.fileName}</p>
                      <p className="text-xs text-emerald-600 mt-1">{parseResult.fieldsFound.slice(0, 4).join(' · ')}</p>
                      {currentFinding && (
                        <p className={`text-xs font-black mt-2 ${['Accept/Eligible','Approve/Eligible','Accept'].includes(currentFinding) ? 'text-emerald-600' : currentFinding.includes('Ineligible') ? 'text-red-600' : 'text-amber-600'}`}>
                          {currentFinding.includes('Ineligible') ? '🚫' : '✅'} {currentFinding}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl mb-1">📑</p>
                      <p className="text-sm font-semibold text-slate-600">Upload DU or LPA PDF</p>
                      <p className="text-xs text-slate-400 mt-0.5">Fields auto-fill · Deal Advisor activates</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {!isParsing && (
                    <label className="flex-1 cursor-pointer">
                      <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" />
                      <span className="flex items-center justify-center gap-1.5 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
                        📄 {parseResult ? 'Upload New PDF' : 'Upload PDF'}
                      </span>
                    </label>
                  )}
                  {parseResult && !isParsing && (
                    <button onClick={() => { setParseResult(null); setEnrichedParseData(null); }} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-2 rounded-xl border border-slate-200">Clear</button>
                  )}
                </div>
                {parseError && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-red-600">{parseError}</p>
                    <button onClick={() => setParseError('')} className="text-red-400 text-xs">✕</button>
                  </div>
                )}
              </div>
            </div>

            {/* Feasibility Score */}
            {ruleResults && (
              <div className={`bg-gradient-to-br ${FEAS_STYLE[ruleResults.feasibilityLabel]?.banner || 'from-slate-900 to-slate-800 border-slate-600'} border rounded-2xl p-5 text-white shadow-lg`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Fix Feasibility</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full border ${FEAS_STYLE[ruleResults.feasibilityLabel]?.badge}`}>
                    {FEAS_STYLE[ruleResults.feasibilityLabel]?.dot} {ruleResults.feasibilityLabel}
                  </span>
                </div>
                <div className="text-4xl font-black mb-1">{ruleResults.feasibilityScore}<span className="text-lg text-slate-400">%</span></div>
                {ruleResults.primaryBlocker && (
                  <div className="mt-3 p-3 bg-black/20 rounded-lg">
                    <p className="text-xs font-bold text-slate-300 mb-1">PRIMARY BLOCKER</p>
                    <p className={`text-sm font-bold ${BLOCKER_COLOR[ruleResults.primaryBlocker.type] || 'text-amber-400'}`}>{ruleResults.primaryBlocker.label}</p>
                  </div>
                )}
                <button onClick={handleSaveToRecord} disabled={recordSaving || !currentFinding} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-sm py-2.5 rounded-xl transition-colors">
                  {recordSaving ? 'Saving…' : '💾 Save to Decision Record'}
                </button>
                {savedRecordId && <p className="text-xs text-emerald-400 mt-2 text-center">✔ Saved</p>}
              </div>
            )}

            {/* AUS Run Counter */}
            <AUSRunCounter submissionNumber={submissionNumber} program={program} caseFileId={caseFileId} ausEngine={ausEngineDetected} />

            {/* Edit Profile — collapsed */}
            <details className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group">
              <summary className="px-5 py-4 flex items-center justify-between cursor-pointer select-none list-none">
                <div>
                  <p className="text-sm font-bold text-slate-700">Edit Loan Profile</p>
                  <p className="text-xs text-slate-400 mt-0.5">Override auto-populated fields</p>
                </div>
                <span className="text-slate-400 text-xs">▼</span>
              </summary>
              <div className="px-5 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {[{k:'creditScore',l:'Credit Score',ph:'720'},{k:'dti',l:'Back-End DTI %',ph:'47'},{k:'frontEndDTI',l:'Front DTI %',ph:'32'},{k:'reserves',l:'Reserves (mo)',ph:'5'},{k:'downPayment',l:'Down Payment %',ph:'7.5'},{k:'interestRate',l:'Interest Rate %',ph:'7.250'}].map(f => (
                    <div key={f.k}>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">{f.l}</label>
                      <input type="text" inputMode="decimal" placeholder={f.ph} value={profile[f.k]} onChange={e => setProfile(prev => ({ ...prev, [f.k]: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {[{k:'isVeteran',l:'Veteran / VA'},{k:'isRuralProperty',l:'Rural (USDA)'},{k:'isSelfEmployed',l:'Self-Employed'},{k:'isRehabProperty',l:'Rehab / Reno'},{k:'isInvestmentProperty',l:'Investment'},{k:'isJumboLoan',l:'Jumbo Loan'},{k:'isHighAssetBorrower',l:'High Asset'},{k:'inCensusEligibleTract',l:'Low-Income Tract'},{k:'hasRecentBankruptcy',l:'Bankruptcy'},{k:'exceedsIncomeLimit',l:'Exceeds Income Limit'}].map(f => (
                    <label key={f.k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={profile[f.k]} onChange={e => setProfile(prev => ({ ...prev, [f.k]: e.target.checked }))} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300" />
                      <span className="text-xs text-slate-600">{f.l}</span>
                    </label>
                  ))}
                </div>
                {!currentFinding && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Manual AUS Finding</p>
                    <div className="flex flex-wrap gap-2">
                      {(PROGRAMS[program]?.findings || []).map(f => (
                        <button key={f} onClick={() => setFinding(f)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-indigo-300 transition-all">{f}</button>
                      ))}
                    </div>
                  </div>
                )}
                {currentFinding && (
                  <div className="mt-4 p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                    <p className={`text-sm font-black ${currentFinding.includes('Ineligible') ? 'text-red-600' : 'text-emerald-600'}`}>
                      {currentFinding.includes('Ineligible') ? '🚫' : '✅'} {currentFinding}
                    </p>
                    <button onClick={() => setFinding('')} className="text-[10px] text-slate-400 hover:text-slate-600 underline">Clear</button>
                  </div>
                )}
              </div>
            </details>

          </div>

          {/* ── MAIN CONTENT ── */}
          <div className="xl:col-span-3 space-y-5">

            {/* Tabs — Deal Advisor first */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-0">
              {[
                {k:'dealadvisor', l:'⚡ Deal Advisor™', primary: true},
                {k:'programs',   l:'📊 Program Comparison'},
                {k:'migration',  l:'🔄 Migration Engine'},
                {k:'duplicates', l:'🔍 Duplicate Detector'},
                {k:'strategies', l:'📋 Strategies'},
              ].map(t => (
                <button key={t.k} onClick={() => setActiveTab(t.k)}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                    activeTab === t.k
                      ? t.primary ? 'border-amber-500 text-amber-600 bg-amber-50' : 'border-indigo-500 text-indigo-600 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* ── DEAL ADVISOR™ ── */}
            {activeTab === 'dealadvisor' && (
              <DealAdvisor
                parsedFindings={enrichedParseData}
                strategies={relevantStrategies
                  .filter(s => {
                    const isPrimary = (enrichedParseData?.occupancy || '').toLowerCase().includes('primary') || !profile.isInvestmentProperty;
                    if (isPrimary && s.title?.toLowerCase().includes('dscr')) return false;
                    return true;
                  })
                  .map(s => {
                    const isPrimary = (enrichedParseData?.occupancy || '').toLowerCase().includes('primary') || !profile.isInvestmentProperty;
                    const name = isPrimary ? s.title.replace(/\s*\/\s*DSCR/gi, '').replace(/\s*,\s*DSCR/gi, '').trim() : s.title;
                    return { name, approvalProbability: s.probability[program] || 0, description: s.detail, cost: s.cost, timeframe: s.timeline, risk: s.risk, category: s.category, bestFor: s.bestFor, programWarning: s.programWarning || null };
                  })}
                scenarioId={selectedScenarioId}
                borrowerName={enrichedParseData?.borrowerName || bName || 'Borrower'}
                loName="George Chevalier"
              />
            )}

            {/* ── PROGRAM COMPARISON ── */}
            {activeTab === 'programs' && (
              <div>
                {scoredPrograms.length === 0 ? (
                  <div className="bg-white rounded-xl p-10 text-center border border-gray-100">
                    <p className="text-gray-400 text-sm">Upload a PDF or enter Credit Score and DTI to see program comparison.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scoredPrograms.map((prog, idx) => {
                      const prob = prog.probability || 0;
                      const isTop = idx === 0;
                      return (
                        <div key={prog.key || idx} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isTop ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100'}`}>
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  {isTop && <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">TOP PATH</span>}
                                  <h3 className="text-base font-bold text-gray-900">{prog.label}</h3>
                                  <span className="text-xs text-gray-400">{prog.agency}</span>
                                </div>
                                {prog.finding && <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${PROGRAMS[prog.key]?.positiveFindings?.includes(prog.finding) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{prog.finding}</span>}
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-2xl font-black ${pColor(prob)}`}>{prob}%</div>
                                <div className="text-xs text-gray-400">approval</div>
                              </div>
                            </div>
                            {prog.blockers?.length > 0 && <div className="space-y-1 mb-2">{prog.blockers.map((b, i) => <p key={i} className="text-xs text-red-600 flex gap-1"><span>✗</span>{b}</p>)}</div>}
                            {prog.strengths?.length > 0 && <div className="space-y-1">{prog.strengths.map((s, i) => <p key={i} className="text-xs text-emerald-600 flex gap-1"><span>✓</span>{s}</p>)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── MIGRATION ENGINE ── */}
            {activeTab === 'migration' && (
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Program Migration Engine</p>
                    <p className="text-sm text-slate-500 mt-0.5">AI-powered program ranking</p>
                  </div>
                  <button onClick={runAISonnetAnalysis} disabled={sonnetLoading || !pmeProfile?.fico} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                    {sonnetLoading ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</> : sonnetResults ? '🔁 Re-run' : '🧠 Run AI Analysis'}
                  </button>
                </div>
                {sonnetResults?.overallRecommendation && (
                  <div className="bg-indigo-950 border border-indigo-700 rounded-xl p-4 mb-4">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">AI Recommendation</p>
                    <p className="text-sm text-indigo-100">{sonnetResults.overallRecommendation}</p>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <ProgramMigrationEngine profile={pmeProfile} sonnetResults={sonnetResults} sonnetLoading={sonnetLoading} onSelectProgram={(prog) => addLog(`PME: Selected ${prog.programName} (${prog.approvalProbability}%)`)} />
                </div>
              </div>
            )}

            {/* ── DUPLICATE DETECTOR ── */}
            {activeTab === 'duplicates' && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-800">🔍 Duplicate Debt Detector</p>
                  <p className="text-xs text-amber-700 mt-1">Flag debts that may be double-counted in DTI. Each flag includes the fix.</p>
                </div>
                {DUPLICATE_FLAGS.map((flag, idx) => (
                  <div key={idx} onClick={() => toggleDup(idx)} className={`bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-all hover:border-amber-300 ${flaggedDuplicates.includes(idx) ? 'border-amber-400 bg-amber-50/30' : 'border-gray-100'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 ${flaggedDuplicates.includes(idx) ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300'}`}>
                        {flaggedDuplicates.includes(idx) && <span className="text-xs font-black">✔</span>}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{flag.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{flag.detail}</p>
                        {flaggedDuplicates.includes(idx) && <div className="mt-2 p-2 bg-amber-100 rounded-lg"><p className="text-xs font-semibold text-amber-800">Fix: <span className="font-normal">{flag.fix}</span></p></div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── STRATEGIES (reference) ── */}
            {activeTab === 'strategies' && (
              <div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                  <p className="text-sm font-semibold text-slate-700">📋 Strategy Reference Library</p>
                  <p className="text-xs text-slate-500 mt-1">All 23 strategies ranked by approval probability. Deal Advisor™ selects the right ones automatically — this is for manual reference.</p>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(CATS).map(([key, cat]) => (
                    <button key={key} onClick={() => toggleCat(key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${selectedCats.includes(key) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                      <span>{cat.icon}</span>{cat.label}
                    </button>
                  ))}
                  {selectedCats.length > 0 && <button onClick={() => setSelectedCats([])} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-400">✕ Clear</button>}
                </div>
                <div className="space-y-3">
                  {(showAllFindings ? relevantStrategies : relevantStrategies.slice(0, 8)).map(s => {
                    const prob = s.probability[program] || 0;
                    const isExpanded = expandedId === s.id;
                    return (
                      <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:border-indigo-200 transition-all">
                        <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="text-sm font-bold text-gray-900">{s.title}</h3>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${IMPACT_BADGE[s.impact]}`}>{s.impact.toUpperCase()}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                  <span>💰 {s.cost}</span><span>⏱ {s.timeline}</span><span>⚡ {s.risk} risk</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className={`text-xl font-black ${pColor(prob)}`}>{prob}%</div>
                              <div className="text-[10px] text-gray-400">approval lift</div>
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                            <p className="text-xs text-gray-600 leading-relaxed mt-3">{s.detail}</p>
                            <div className="mt-3 p-3 bg-indigo-50 rounded-lg"><p className="text-xs font-bold text-indigo-700">Best for: <span className="font-normal">{s.bestFor}</span></p></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {relevantStrategies.length > 8 && (
                    <button onClick={() => setShowAllFindings(v => !v)} className="w-full py-2.5 text-sm font-semibold text-indigo-600 border border-indigo-200 rounded-xl bg-white">
                      {showAllFindings ? '▲ Show Less' : `▼ Show All ${relevantStrategies.length} Strategies`}
                    </button>
                  )}
                </div>
                {ruleResults && <button onClick={generateNotes} className="mt-4 w-full py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl bg-white">📋 Copy LO Notes to Clipboard</button>}
              </div>
            )}

          </div>
        </div>
      </div>

</div>
  );
}
