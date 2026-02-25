// ============================================================
// LenderMatchEngine_hardMoney.js
// Module 6B — Last Resort Path Engine Functions
//
// INTEGRATION: Merge these functions into your existing
// LenderMatchEngine.js file. Import hardMoneyLenders from
// hardMoneyLenderMatrix.js at the top of your engine file.
//
// Qualification logic: ARV and equity — NOT FICO and DTI
// ============================================================

import { hardMoneyLenders } from "../data/hardMoneyLenderMatrix";

// ============================================================
// ROUTING TRIGGERS
// Determines if a scenario should surface the Last Resort Path
// Returns: { triggered: bool, reasons: string[] }
// ============================================================
export function checkHardMoneyRoutingTriggers(scenario) {
  const reasons = [];

  const fico = parseInt(scenario.creditScore) || 0;
  const bkMonths = parseInt(scenario.monthsSinceBankruptcy) || 999;
  const foreclosureMonths = parseInt(scenario.monthsSinceForeclosure) || 999;
  const closingDays = parseInt(scenario.daysToClose) || 999;

  // FICO below any Non-QM floor
  if (fico < 500 && fico > 0) {
    reasons.push("FICO below 500 — ineligible for conventional and Non-QM paths");
  }

  // Recent BK or foreclosure
  if (bkMonths < 12) {
    reasons.push(`Bankruptcy discharged ${bkMonths} months ago — below 12-month seasoning`);
  }
  if (foreclosureMonths < 12) {
    reasons.push(`Foreclosure ${foreclosureMonths} months ago — below 12-month seasoning`);
  }

  // Property condition / type triggers
  if (scenario.propertyCondition === "distressed" || scenario.propertyCondition === "uninhabitable") {
    reasons.push("Distressed or uninhabitable property — will not appraise for conventional or Non-QM");
  }
  if (scenario.loanPurpose === "fix_and_flip" || scenario.loanPurpose === "fix_to_rent") {
    reasons.push("Fix-and-flip purpose — ARV-based hard money path appropriate");
  }
  if (scenario.propertyType === "land" || scenario.propertyType === "raw_land") {
    reasons.push("Land/raw land — ineligible for agency and most Non-QM products");
  }
  if (scenario.constructionType === "ground_up") {
    reasons.push("Ground-up construction — hard money or construction bridge required");
  }

  // Borrower profile triggers
  if (scenario.citizenshipStatus === "foreign_national" && !scenario.usCredit) {
    reasons.push("Foreign national with no US credit history");
  }

  // Speed trigger
  if (closingDays <= 10 && closingDays > 0) {
    reasons.push(`${closingDays}-day close required — hard money is fastest path`);
  }

  // High LTV investment with no income
  const ltv = parseFloat(scenario.ltv) || 0;
  const incomeDocType = scenario.incomeDocType || "";
  if (ltv > 90 && scenario.occupancy === "investment" && incomeDocType === "none") {
    reasons.push("Investment property over 90% LTV with no income documentation");
  }

  // Non-warrantable condo that failed all paths
  if (scenario.condoWarrantability === "non_warrantable" && scenario.allPathsFailed) {
    reasons.push("Non-warrantable condo — failed all agency and Non-QM paths");
  }

  // Commercial / mixed-use ineligible elsewhere
  if (
    (scenario.propertyType === "commercial" || scenario.propertyType === "mixed_use") &&
    scenario.residentialPathsExhausted
  ) {
    reasons.push("Commercial/mixed-use ineligible on all residential paths");
  }

  return {
    triggered: reasons.length > 0,
    reasons,
    triggerCount: reasons.length,
  };
}

// ============================================================
// ELIGIBILITY CHECK
// Evaluates if a specific hard money lender can do this deal
// Returns: { eligible: bool, flags: string[], disqualifiers: string[] }
// ============================================================
export function checkHardMoneyEligibility(lender, scenario) {
  const flags = [];
  const disqualifiers = [];

  const { qualification, terms, niches, statesActive, operations } = lender;

  // === STATE CHECK ===
  const propertyState = scenario.propertyState || scenario.state;
  if (propertyState && !statesActive.includes(propertyState)) {
    disqualifiers.push(`Not actively lending in ${propertyState}`);
  }

  // === BROKER ACCEPTANCE ===
  if (!lender.acceptingNewBrokers && !scenario.existingRelationship?.[lender.id]) {
    disqualifiers.push("Not currently accepting new brokers");
  }

  // === LOAN AMOUNT ===
  const loanAmount = parseFloat(scenario.loanAmount) || 0;
  if (loanAmount < qualification.minLoanAmount) {
    disqualifiers.push(
      `Loan amount $${loanAmount.toLocaleString()} below minimum $${qualification.minLoanAmount.toLocaleString()}`
    );
  }
  if (loanAmount > qualification.maxLoanAmount) {
    disqualifiers.push(
      `Loan amount $${loanAmount.toLocaleString()} exceeds maximum $${qualification.maxLoanAmount.toLocaleString()}`
    );
  }

  // === ARV-BASED LTV CHECK ===
  const arv = parseFloat(scenario.arv) || 0;
  const purchasePrice = parseFloat(scenario.purchasePrice) || parseFloat(scenario.propertyValue) || 0;

  if (arv > 0) {
    const ltvOnARV = (loanAmount / arv) * 100;
    if (ltvOnARV > qualification.maxLTVonARV) {
      disqualifiers.push(
        `LTV on ARV ${ltvOnARV.toFixed(1)}% exceeds max ${qualification.maxLTVonARV}%`
      );
    } else {
      flags.push(`LTV on ARV: ${ltvOnARV.toFixed(1)}% ✓`);
    }
  }

  if (purchasePrice > 0) {
    const ltvOnPurchase = (loanAmount / purchasePrice) * 100;
    if (ltvOnPurchase > qualification.maxLTVonPurchase) {
      flags.push(
        `LTV on purchase price ${ltvOnPurchase.toFixed(1)}% exceeds ${qualification.maxLTVonPurchase}% — verify with ARV`
      );
    }
  }

  // === REHAB BUDGET ===
  const rehabBudget = parseFloat(scenario.rehabBudget) || 0;
  if (rehabBudget > lender.rehab.rehabBudgetCapacity) {
    disqualifiers.push(
      `Rehab budget $${rehabBudget.toLocaleString()} exceeds lender capacity $${lender.rehab.rehabBudgetCapacity.toLocaleString()}`
    );
  }

  // === TERM CHECK ===
  const desiredTermMonths = parseInt(scenario.desiredTermMonths) || 12;
  if (!terms.available.includes(desiredTermMonths)) {
    const closestTerm = terms.available.reduce((a, b) =>
      Math.abs(b - desiredTermMonths) < Math.abs(a - desiredTermMonths) ? b : a
    );
    flags.push(`Desired term ${desiredTermMonths}mo not available — closest: ${closestTerm}mo`);
  }

  // === FAST CLOSE CHECK ===
  const daysToClose = parseInt(scenario.daysToClose) || 30;
  if (daysToClose <= 10 && !terms.fastCloseCapable) {
    disqualifiers.push(`Fast close (${daysToClose} days) required but not available`);
  }

  // === BORROWER EXPERIENCE ===
  const borrowerExperience = scenario.borrowerExperience || "none";
  const expLevels = { none: 0, some: 1, seasoned: 2 };
  const requiredLevel = expLevels[qualification.borrowerExperienceRequired] || 0;
  const borrowerLevel = expLevels[borrowerExperience] || 0;
  if (borrowerLevel < requiredLevel) {
    disqualifiers.push(
      `Lender requires ${qualification.borrowerExperienceRequired} experience — borrower has ${borrowerExperience}`
    );
  }

  // === ENTITY REQUIREMENT ===
  if (qualification.entityRequired === "LLC_required" && !scenario.entityType?.includes("LLC")) {
    disqualifiers.push("LLC required — borrower must hold title in entity");
  }

  // === PROPERTY TYPE ===
  const propertyType = scenario.propertyType || "";
  if (propertyType && !lender.propertyTypesAccepted.includes(propertyType)) {
    disqualifiers.push(`Property type "${propertyType}" not accepted by this lender`);
  }

  // === NICHE MATCH FLAGS ===
  if (scenario.loanPurpose === "fix_and_flip" && !niches.fixAndFlipSpecialist) {
    flags.push("Not a fix-and-flip specialist — confirm deal eligibility");
  }
  if (scenario.constructionType === "ground_up" && !niches.groundUpConstruction) {
    disqualifiers.push("Ground-up construction not offered");
  }
  if (scenario.citizenshipStatus === "foreign_national" && !niches.foreignNational) {
    disqualifiers.push("Foreign national program not available");
  }
  if (scenario.propertyType === "land" && !niches.landLoans) {
    disqualifiers.push("Land loans not offered");
  }
  if (scenario.exitStrategy === "construction_perm" && !niches.bridgeToPermanent) {
    flags.push("Construction-to-perm exit — confirm bridge-to-perm availability");
  }

  // === THIRD PARTY PROCESSING ===
  if (scenario.usingThirdPartyProcessor && operations.thirdPartyProcessingAllowed === "no") {
    disqualifiers.push("Third party processing not permitted");
  }

  return {
    eligible: disqualifiers.length === 0,
    flags,
    disqualifiers,
    eligibilityScore: disqualifiers.length === 0 ? 100 - flags.length * 5 : 0,
  };
}

// ============================================================
// SCORING FUNCTION
// Scores eligible hard money lenders and returns ranked results
// Returns: array of { lender, score, matchDetails }
// ============================================================
export function scoreHardMoneyLender(lender, scenario) {
  let score = 0;
  const matchDetails = [];
  const warnings = [];

  // === SPEED SCORE (0-25 points) ===
  const daysToClose = parseInt(scenario.daysToClose) || 30;
  if (daysToClose <= 7 && lender.terms.fastCloseCapable) {
    score += 25;
    matchDetails.push("Fast close capable ✓");
  } else if (daysToClose <= 14 && lender.terms.typicalFundingDays <= 10) {
    score += 20;
    matchDetails.push("Meets close timeline ✓");
  } else if (lender.terms.typicalFundingDays <= daysToClose) {
    score += 15;
    matchDetails.push("Timeline achievable ✓");
  }

  // === LEVERAGE SCORE (0-25 points) ===
  const arv = parseFloat(scenario.arv) || 0;
  const loanAmount = parseFloat(scenario.loanAmount) || 0;
  if (arv > 0 && loanAmount > 0) {
    const requestedLTVonARV = (loanAmount / arv) * 100;
    const headroom = lender.qualification.maxLTVonARV - requestedLTVonARV;
    if (headroom >= 10) {
      score += 25;
      matchDetails.push(`Strong ARV headroom (${headroom.toFixed(0)}% below max LTV) ✓`);
    } else if (headroom >= 5) {
      score += 15;
      matchDetails.push(`Adequate ARV headroom ✓`);
    } else if (headroom >= 0) {
      score += 5;
      warnings.push("Close to max ARV LTV — limited buffer");
    }
  }

  // === NICHE ALIGNMENT SCORE (0-20 points) ===
  let nicheScore = 0;
  if (scenario.loanPurpose === "fix_and_flip" && lender.niches.fixAndFlipSpecialist) nicheScore += 7;
  if (scenario.constructionType === "ground_up" && lender.niches.groundUpConstruction) nicheScore += 7;
  if (scenario.exitStrategy === "construction_perm" && lender.niches.bridgeToPermanent) nicheScore += 5;
  if (scenario.citizenshipStatus === "foreign_national" && lender.niches.foreignNational) nicheScore += 7;
  if (scenario.propertyType === "non_warrantable_condo" && lender.niches.nonWarrantableCondo) nicheScore += 6;
  if (scenario.propertyType === "land" && lender.niches.landLoans) nicheScore += 7;
  if (
    (scenario.propertyType === "commercial" || scenario.propertyType === "mixed_use") &&
    lender.niches.commercialMixedUse
  )
    nicheScore += 6;
  if (lender.niches.highLeverageRehab && scenario.highLeverageDeal) nicheScore += 5;
  score += Math.min(nicheScore, 20);
  if (nicheScore > 0) matchDetails.push("Niche alignment confirmed ✓");

  // === COMP SCORE (0-15 points) ===
  // Score on how broker-friendly the comp structure is
  const maxBrokerPoints = lender.compensation.maxBrokerPointsAllowed || 0;
  if (maxBrokerPoints >= 3) {
    score += 15;
    matchDetails.push(`Up to ${maxBrokerPoints} broker points allowed ✓`);
  } else if (maxBrokerPoints >= 2) {
    score += 10;
    matchDetails.push(`Up to ${maxBrokerPoints} broker points allowed ✓`);
  } else if (maxBrokerPoints >= 1) {
    score += 5;
  }
  if (lender.compensation.yspAvailable) {
    score += 3;
    matchDetails.push("YSP available ✓");
  }

  // === OPERATIONS SCORE (0-15 points) ===
  if (lender.operations.scenarioDeskAvailable) {
    score += 5;
    matchDetails.push("Live scenario desk available ✓");
  }
  if (lender.operations.dedicatedAEAssigned) {
    score += 5;
    matchDetails.push("Dedicated AE assigned ✓");
  }
  if (lender.qualification.sameDayTermSheet) {
    score += 5;
    matchDetails.push("Same-day term sheet available ✓");
  }

  // === REPEAT BORROWER BONUS ===
  if (scenario.repeatBorrower && lender.niches.portfolioRepeatBorrower) {
    score += 5;
    matchDetails.push("Repeat borrower program available ✓");
  }

  return {
    lender,
    score: Math.min(score, 100),
    matchDetails,
    warnings,
    totalBorrowerPoints:
      lender.compensation.lenderOriginationPoints.min + lender.compensation.lenderProcessingFee / 1000,
    maxBrokerPoints: lender.compensation.maxBrokerPointsAllowed,
    yspAvailable: lender.compensation.yspAvailable,
    estimatedFundingDays: lender.terms.typicalFundingDays,
  };
}

// ============================================================
// MAIN EVALUATOR
// Call this from LenderMatch to get the full Last Resort Path results
// Returns: { triggered, triggerReasons, results, heroMode }
// heroMode = true when both Agency and NonQM returned 0 eligible lenders
// ============================================================
export function evaluateHardMoneyPath(scenario, agencyResultCount = 0, nonQMResultCount = 0) {
  const routing = checkHardMoneyRoutingTriggers(scenario);
  const heroMode = agencyResultCount === 0 && nonQMResultCount === 0;

  // Only evaluate if triggered OR in hero mode
  if (!routing.triggered && !heroMode) {
    return {
      triggered: false,
      heroMode: false,
      triggerReasons: [],
      results: [],
    };
  }

  const results = [];

  for (const lender of hardMoneyLenders) {
    if (!lender.active) continue;

    const eligibility = checkHardMoneyEligibility(lender, scenario);

    if (eligibility.eligible) {
      const scored = scoreHardMoneyLender(lender, scenario);
      results.push({
        ...scored,
        eligibilityFlags: eligibility.flags,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return {
    triggered: routing.triggered,
    heroMode,
    triggerReasons: routing.reasons,
    results,
    eligibleCount: results.length,
  };
}
