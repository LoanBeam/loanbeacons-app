// src/engines/RehabEngine.js
// Rehab Intelligence™ — Calculation & Eligibility Engine
// LoanBeacons™ Module 17

import REHAB_PRODUCTS, {
  PRODUCT_IDS,
  ELIGIBLE_BY_PURPOSE,
  FHA_LOAN_LIMITS,
  CONFORMING_LOAN_LIMITS,
} from '../data/rehabProducts.js';

// ─────────────────────────────────────────────
// AIV CALCULATION
// ─────────────────────────────────────────────

/**
 * Calculate After-Improved Value (AIV) scenarios
 * @param {number} purchasePrice  - Contract purchase price (or current value for refi)
 * @param {number} rehabCost      - Total renovation costs
 * @param {number} appraisedAIV  - Appraiser's as-completed value (if known)
 * @param {number} appreciationPct - Expected value lift % from renovations (0.0 - 1.0)
 * @returns {object} AIV analysis object
 */
export function calculateAIV({
  purchasePrice = 0,
  rehabCost = 0,
  appraisedAIV = null,
  appreciationPct = null,
}) {
  const costBasis = purchasePrice + rehabCost;

  // Conservative: no appreciation beyond cost
  const conservativeAIV = costBasis;

  // Moderate: some appreciation (default 5% lift if not provided)
  const moderateLift = appreciationPct !== null ? appreciationPct : 0.05;
  const moderateAIV = costBasis * (1 + moderateLift);

  // Appraiser provided
  const confirmedAIV = appraisedAIV || null;

  // 110% rule for FHA 203(k)
  const fha110pctAIV = appraisedAIV ? appraisedAIV * 1.10 : null;

  // Renovation ROI
  const renovationROI = appraisedAIV
    ? ((appraisedAIV - purchasePrice - rehabCost) / rehabCost) * 100
    : null;

  // Value lift from renovation
  const valueLift = appraisedAIV ? appraisedAIV - purchasePrice : null;

  return {
    costBasis,
    conservativeAIV,
    moderateAIV,
    confirmedAIV,
    fha110pctAIV,
    renovationROI,
    valueLift,
    rehabCostPctOfAIV: appraisedAIV ? (rehabCost / appraisedAIV) : (rehabCost / conservativeAIV),
  };
}

// ─────────────────────────────────────────────
// MAX LOAN CALCULATIONS PER PRODUCT
// ─────────────────────────────────────────────

/**
 * Calculate maximum eligible loan amount for each product
 */
export function calculateMaxLoan({
  productId,
  loanPurpose,           // 'PURCHASE' | 'RATE_TERM_REFI' | 'CASH_OUT_REFI'
  purchasePrice = 0,
  currentValue = 0,      // For refi
  rehabCost = 0,
  appraisedAIV = null,
  units = 1,
  isHighCostArea = false,
  borrowerEntitlement = null,  // For VA
}) {
  const product = REHAB_PRODUCTS[productId];
  if (!product) return null;

  const isPurchase = loanPurpose === 'PURCHASE';
  const isRefi = loanPurpose === 'RATE_TERM_REFI' || loanPurpose === 'CASH_OUT_REFI';
  const isCashOut = loanPurpose === 'CASH_OUT_REFI';

  // Effective property value
  const baseValue = isPurchase ? purchasePrice : currentValue;
  const aiValue = appraisedAIV || (baseValue + rehabCost);

  // Max LTV for this scenario
  let maxLTV;
  if (isPurchase) maxLTV = product.maxLTVPurchase;
  else if (isCashOut) maxLTV = product.maxLTVCashOut;
  else maxLTV = product.maxLTVRefinance;

  if (!maxLTV) return { eligible: false, reason: `${product.shortName} does not allow ${loanPurpose}` };

  let programMaxLoan;
  let loanLimitCap;

  // ── FHA products ──
  if (product.agency === 'FHA') {
    const limitKey = isHighCostArea ? 'national_ceiling' : 'national_floor';
    const unitKey = `${limitKey}_${units}unit`;
    loanLimitCap = FHA_LOAN_LIMITS[unitKey] || FHA_LOAN_LIMITS['national_ceiling_1unit'];

    if (productId === 'FHA_203K_STANDARD') {
      // Lesser of: cost basis OR 110% of AIV
      const costBasis = baseValue + rehabCost;
      const cap110 = aiValue * 1.10;
      programMaxLoan = Math.min(costBasis, cap110);
    } else {
      // 203(k) Limited: base + rehab capped at $35k
      const effectiveRehab = Math.min(rehabCost, 35000);
      programMaxLoan = baseValue + effectiveRehab;
    }

    // Apply LTV to AIV
    const ltvBasedMax = aiValue * maxLTV;
    programMaxLoan = Math.min(programMaxLoan, ltvBasedMax, loanLimitCap);
  }

  // ── Conventional products ──
  else if (product.agency === 'Fannie Mae' || product.agency === 'Freddie Mac') {
    const limitKey = isHighCostArea ? 'high_cost' : 'standard';
    const unitKey = `${limitKey}_${units}unit`;
    loanLimitCap = CONFORMING_LOAN_LIMITS[unitKey] || CONFORMING_LOAN_LIMITS['standard_1unit'];

    // Renovation cost cap: 75% of AIV
    const maxRehabAllowed = aiValue * 0.75;
    const effectiveRehab = Math.min(rehabCost, maxRehabAllowed);

    if (isPurchase) {
      // Lesser of: purchase + rehab OR 100% AIV
      programMaxLoan = Math.min(baseValue + effectiveRehab, aiValue);
    } else {
      programMaxLoan = aiValue * maxLTV;
    }

    programMaxLoan = Math.min(programMaxLoan, loanLimitCap);
  }

  // ── VA ──
  else if (product.agency === 'VA') {
    const effectiveRehab = Math.min(rehabCost, 50000);
    programMaxLoan = baseValue + effectiveRehab;
    // VA has no hard loan limit (full entitlement), but lender overlay exists
    loanLimitCap = null;
  }

  // Required down payment (purchase)
  const minDownPayment = isPurchase ? Math.max(0, (baseValue + rehabCost) - programMaxLoan) : 0;
  const downPaymentPct = isPurchase && (baseValue + rehabCost) > 0
    ? minDownPayment / (baseValue + rehabCost)
    : 0;

  // Actual LTV
  const actualLTV = aiValue > 0 ? programMaxLoan / aiValue : 0;

  return {
    eligible: true,
    maxLoanAmount: Math.round(programMaxLoan),
    loanLimitCap,
    minDownPayment: Math.round(minDownPayment),
    downPaymentPct,
    actualLTV,
    maxLTV,
    aiValue,
    rehabCostPctAIV: rehabCost / aiValue,
    rehabWithinLimit: product.maxRepairCost ? rehabCost <= product.maxRepairCost : true,
  };
}

// ─────────────────────────────────────────────
// PRODUCT ELIGIBILITY SCREENING
// ─────────────────────────────────────────────

/**
 * Screen a scenario against all products and return eligibility results
 */
export function screenAllProducts({
  loanPurpose,
  purchasePrice = 0,
  currentValue = 0,
  rehabCost = 0,
  appraisedAIV = null,
  units = 1,
  isHighCostArea = false,
  propertyType = 'SFR',
  borrowerType = 'PRIMARY',   // 'PRIMARY' | 'SECONDARY' | 'INVESTMENT'
  isVAEligible = false,
  creditScore = 700,
  hasStructuralWork = false,
  isOwnerOccupied = true,
}) {
  const results = {};

  for (const productId of PRODUCT_IDS) {
    const product = REHAB_PRODUCTS[productId];
    const flags = [];
    let eligible = true;

    // ── Purpose eligibility ──
    if (!ELIGIBLE_BY_PURPOSE[loanPurpose]?.includes(productId)) {
      eligible = false;
      flags.push(`Not available for ${loanPurpose.replace('_', ' ')}`);
    }

    // ── VA eligibility ──
    if (productId === 'VA_RENOVATION' && !isVAEligible) {
      eligible = false;
      flags.push('Borrower does not have VA eligibility');
    }

    // ── Owner occupancy ──
    if (product.ownerOccupiedOnly && !isOwnerOccupied) {
      eligible = false;
      flags.push('Owner-occupied only');
    }

    if (!product.investorEligible && borrowerType === 'INVESTMENT') {
      eligible = false;
      flags.push('Investment properties not eligible');
    }

    // ── Structural work ──
    if (hasStructuralWork && !product.structuralAllowed) {
      eligible = false;
      flags.push('Structural work not permitted under this product');
    }

    // ── Repair cost limits ──
    if (product.maxRepairCost && rehabCost > product.maxRepairCost) {
      eligible = false;
      flags.push(`Repair costs ($${rehabCost.toLocaleString()}) exceed product maximum ($${product.maxRepairCost.toLocaleString()})`);
    }

    if (product.minRepairCost && rehabCost < product.minRepairCost) {
      eligible = false;
      flags.push(`Repair costs below product minimum ($${product.minRepairCost.toLocaleString()})`);
    }

    // ── Credit score ──
    if (creditScore < product.minCreditScore) {
      eligible = false;
      flags.push(`Credit score (${creditScore}) below minimum (${product.minCreditScore})`);
    }

    // ── Rehab as % of AIV for conventional ──
    if (eligible && appraisedAIV && (product.agency === 'Fannie Mae' || product.agency === 'Freddie Mac')) {
      const rehabPct = rehabCost / appraisedAIV;
      if (rehabPct > 0.75) {
        eligible = false;
        flags.push(`Renovation costs (${(rehabPct * 100).toFixed(1)}% of AIV) exceed 75% limit`);
      }
    }

    // ── Loan calculation ──
    let loanCalc = null;
    if (eligible) {
      loanCalc = calculateMaxLoan({
        productId,
        loanPurpose,
        purchasePrice,
        currentValue,
        rehabCost,
        appraisedAIV,
        units,
        isHighCostArea,
      });
      if (loanCalc && !loanCalc.eligible) {
        eligible = false;
        flags.push(loanCalc.reason);
      }
    }

    // ── Advisory flags (not disqualifying) ──
    const advisories = [];

    if (productId === 'FHA_203K_STANDARD' && eligible) {
      advisories.push('HUD consultant required — add ~$600–$800 to closing costs');
      advisories.push('Timeline: 12-month renovation period; plan for contingency reserve');
    }
    if (productId === 'FHA_203K_LIMITED' && eligible && rehabCost > 30000) {
      advisories.push(`Approaching $35,000 cap — budget for contingency carefully`);
    }
    if ((productId === 'HOMESTYLE' || productId === 'CHOICERENOVATION') && eligible) {
      advisories.push('Renovation funds held in escrow; disbursed upon contractor draw requests');
    }
    if (productId === 'VA_RENOVATION' && eligible) {
      advisories.push('VA funding fee applies (may be financed)');
      advisories.push('Single renovation draw at completion — no progress draws');
    }

    results[productId] = {
      productId,
      product,
      eligible,
      flags,
      advisories,
      loanCalc: eligible ? loanCalc : null,
      score: scoreProduct({ productId, eligible, loanCalc, rehabCost, isVAEligible, hasStructuralWork }),
    };
  }

  // Sort eligible products by score
  const sorted = Object.values(results).sort((a, b) => b.score - a.score);

  return {
    results,
    eligibleProducts: sorted.filter(r => r.eligible),
    ineligibleProducts: sorted.filter(r => !r.eligible),
    recommendedProduct: sorted.find(r => r.eligible) || null,
  };
}

/**
 * Heuristic score to rank products (higher = better fit)
 */
function scoreProduct({ productId, eligible, loanCalc, rehabCost, isVAEligible, hasStructuralWork }) {
  if (!eligible) return -1;

  let score = 50;

  // VA: huge benefit if eligible (no down payment)
  if (productId === 'VA_RENOVATION' && isVAEligible) score += 30;

  // Simplicity bonus
  if (productId === 'FHA_203K_LIMITED') score += 5; // no HUD consultant
  if (productId === 'CHOICERENOVATION') score += 3; // CHOICEReno Express option

  // Structural work fits Standard
  if (productId === 'FHA_203K_STANDARD' && hasStructuralWork) score += 15;
  if ((productId === 'HOMESTYLE' || productId === 'CHOICERENOVATION') && hasStructuralWork) score += 15;

  // Lower down payment better
  if (loanCalc?.downPaymentPct !== undefined) {
    score += (1 - loanCalc.downPaymentPct) * 10;
  }

  return score;
}

// ─────────────────────────────────────────────
// RENOVATION COST ESTIMATOR
// ─────────────────────────────────────────────

export const RENOVATION_COST_RANGES = {
  ROOF_REPLACEMENT: { label: 'Roof replacement', low: 8000, mid: 15000, high: 25000, unit: 'project' },
  HVAC_REPLACE: { label: 'HVAC replacement', low: 5000, mid: 10000, high: 18000, unit: 'project' },
  KITCHEN_REMODEL: { label: 'Kitchen remodel', low: 15000, mid: 40000, high: 80000, unit: 'project' },
  BATH_REMODEL: { label: 'Bathroom remodel', low: 8000, mid: 20000, high: 45000, unit: 'per bath' },
  FLOORING: { label: 'Flooring (whole house)', low: 5000, mid: 12000, high: 25000, unit: 'project' },
  ELECTRICAL: { label: 'Electrical upgrade/panel', low: 2500, mid: 6000, high: 15000, unit: 'project' },
  PLUMBING: { label: 'Plumbing overhaul', low: 3000, mid: 8000, high: 20000, unit: 'project' },
  WINDOWS: { label: 'Window replacement', low: 4000, mid: 10000, high: 20000, unit: 'whole house' },
  FOUNDATION: { label: 'Foundation repair', low: 5000, mid: 15000, high: 50000, unit: 'project' },
  ADDITION: { label: 'Room addition', low: 30000, mid: 70000, high: 150000, unit: 'project' },
  EXTERIOR_PAINT: { label: 'Exterior paint/siding', low: 3000, mid: 8000, high: 20000, unit: 'project' },
  LANDSCAPE: { label: 'Landscaping', low: 2000, mid: 8000, high: 25000, unit: 'project' },
  POOL: { label: 'New swimming pool', low: 30000, mid: 55000, high: 100000, unit: 'project' },
  MOLD_REMEDIATION: { label: 'Mold/environmental remediation', low: 2000, mid: 8000, high: 30000, unit: 'project' },
};

/**
 * Estimate renovation costs and suggest contingency reserve
 */
export function estimateRenovationCosts(selectedItems = []) {
  let totalLow = 0;
  let totalMid = 0;
  let totalHigh = 0;
  let hasStructural = false;
  let hasEnvironmental = false;

  for (const item of selectedItems) {
    const range = RENOVATION_COST_RANGES[item.key];
    if (!range) continue;
    const qty = item.quantity || 1;
    totalLow += range.low * qty;
    totalMid += range.mid * qty;
    totalHigh += range.high * qty;

    if (['FOUNDATION', 'ADDITION'].includes(item.key)) hasStructural = true;
    if (['MOLD_REMEDIATION'].includes(item.key)) hasEnvironmental = true;
  }

  // Contingency
  const contingencyPct = hasStructural || hasEnvironmental ? 0.20 : 0.10;
  const contingencyLow = totalLow * contingencyPct;
  const contingencyMid = totalMid * contingencyPct;

  return {
    subtotalLow: totalLow,
    subtotalMid: totalMid,
    subtotalHigh: totalHigh,
    contingencyPct,
    contingencyAmount: Math.round(contingencyMid),
    totalWithContingencyLow: Math.round(totalLow + contingencyLow),
    totalWithContingencyMid: Math.round(totalMid + contingencyMid),
    totalWithContingencyHigh: Math.round(totalHigh),
    hasStructural,
    hasEnvironmental,
    recommendedBudget: Math.round(totalMid + contingencyMid),
  };
}

// ─────────────────────────────────────────────
// TALKING POINTS GENERATOR
// ─────────────────────────────────────────────

/**
 * Generate borrower-facing talking points for a selected product
 */
export function generateTalkingPoints({ productId, loanCalc, aivData, rehabCost, loanPurpose }) {
  const product = REHAB_PRODUCTS[productId];
  if (!product) return [];

  const points = [];
  const isPurchase = loanPurpose === 'PURCHASE';

  // Lead with the value prop
  if (productId === 'VA_RENOVATION') {
    points.push({
      type: 'strength',
      icon: '🎖️',
      text: `Your VA benefit gets you into this renovation with zero down payment — no mortgage insurance ever.`,
    });
  }

  if (isPurchase && loanCalc?.downPaymentPct <= 0.035) {
    points.push({
      type: 'strength',
      icon: '💰',
      text: `You can purchase AND renovate with as little as ${(loanCalc.downPaymentPct * 100).toFixed(1)}% down — no need to save separately for repairs.`,
    });
  }

  if (aivData?.renovationROI !== null && aivData?.renovationROI > 0) {
    points.push({
      type: 'strength',
      icon: '📈',
      text: `The renovations are projected to return $${Math.round(aivData.valueLift || 0).toLocaleString()} in added value — a ${aivData.renovationROI.toFixed(0)}% return on your rehab investment.`,
    });
  }

  // Product-specific points
  if (productId === 'FHA_203K_STANDARD') {
    points.push({
      type: 'process',
      icon: '📋',
      text: `A HUD-approved consultant will work with you to scope the project and ensure all work meets FHA standards — adds cost but protects you.`,
    });
    points.push({
      type: 'process',
      icon: '⏱️',
      text: `You have 12 months after closing to complete the renovations. If the home is uninhabitable, up to 6 months of mortgage payments can be financed into the loan.`,
    });
  }

  if (productId === 'FHA_203K_LIMITED') {
    points.push({
      type: 'strength',
      icon: '✅',
      text: `The Limited 203(k) has a streamlined process — no HUD consultant needed, faster closing than the Standard version.`,
    });
    if (rehabCost > 28000) {
      points.push({
        type: 'caution',
        icon: '⚠️',
        text: `Watch the $35,000 hard cap — your budget is $${rehabCost.toLocaleString()}, leaving $${(35000 - rehabCost).toLocaleString()} of headroom. Include a 10% contingency.`,
      });
    }
  }

  if (productId === 'HOMESTYLE' || productId === 'CHOICERENOVATION') {
    points.push({
      type: 'strength',
      icon: '🏠',
      text: `No loan-amount ceiling on renovation scope — luxury upgrades, pools, and additions are all eligible.`,
    });
    points.push({
      type: 'process',
      icon: '💳',
      text: `Renovation funds are held in escrow and disbursed to your contractor as work is completed — protects both you and the lender.`,
    });
  }

  if (productId === 'CHOICERENOVATION' && rehabCost <= 50000) {
    points.push({
      type: 'option',
      icon: '⚡',
      text: `Your project qualifies for CHOICEReno Express — a simplified track with potential for borrower self-completion of certain work.`,
    });
  }

  // Universal closing point
  points.push({
    type: 'process',
    icon: '🔑',
    text: `One loan, one closing, one monthly payment — combines the purchase and renovation into a single mortgage.`,
  });

  return points;
}

// ─────────────────────────────────────────────
// SUMMARY BUILDER
// ─────────────────────────────────────────────

/**
 * Build a complete scenario summary object for display / export
 */
export function buildRehabSummary(formData) {
  const {
    loanPurpose,
    purchasePrice,
    currentValue,
    rehabCost,
    appraisedAIV,
    units,
    isHighCostArea,
    propertyType,
    borrowerType,
    isVAEligible,
    creditScore,
    hasStructuralWork,
    isOwnerOccupied,
    selectedProductId,
    borrowerName,
    propertyAddress,
  } = formData;

  const aivData = calculateAIV({
    purchasePrice: loanPurpose === 'PURCHASE' ? purchasePrice : currentValue,
    rehabCost,
    appraisedAIV,
  });

  const screening = screenAllProducts({
    loanPurpose,
    purchasePrice,
    currentValue,
    rehabCost,
    appraisedAIV,
    units,
    isHighCostArea,
    propertyType,
    borrowerType,
    isVAEligible,
    creditScore,
    hasStructuralWork,
    isOwnerOccupied,
  });

  const selectedProduct = selectedProductId ? screening.results[selectedProductId] : screening.recommendedProduct;

  const talkingPoints = selectedProduct?.eligible
    ? generateTalkingPoints({
        productId: selectedProduct.productId,
        loanCalc: selectedProduct.loanCalc,
        aivData,
        rehabCost,
        loanPurpose,
      })
    : [];

  return {
    generatedAt: new Date().toISOString(),
    borrowerName,
    propertyAddress,
    loanPurpose,
    purchasePrice,
    currentValue,
    rehabCost,
    appraisedAIV,
    aivData,
    screening,
    selectedProduct,
    talkingPoints,
    summaryStatus: screening.eligibleProducts.length > 0 ? 'PRODUCTS_AVAILABLE' : 'NO_ELIGIBLE_PRODUCTS',
  };
}

export default {
  calculateAIV,
  calculateMaxLoan,
  screenAllProducts,
  estimateRenovationCosts,
  generateTalkingPoints,
  buildRehabSummary,
  RENOVATION_COST_RANGES,
};
