/**
 * ausRescueScoring.js
 * AUS Rescue v2 — Phase 2.5 Path Scoring Engine
 * Pure utility — no React, no Firebase
 * Scoring model version: path-score-v1.0
 */

// ─── Seed Data Maps (module-scoped so all scorers share them) ─────────────────

const COST_BASE = {
  FHA: 65,
  CONVENTIONAL: 80,
  HOMEREADY: 75,
  HOME_POSSIBLE: 75,
  VA: 90,
  USDA: 88,
  FHA_203K: 60,
  HOMESTYLE: 62,
  NON_QM_BANK_STMT: 55,
  DSCR: 58,
  ASSET_DEPLETION: 55,
};

const SPEED = {
  FHA: 80,
  CONVENTIONAL: 82,
  HOMEREADY: 78,
  HOME_POSSIBLE: 78,
  VA: 75,
  USDA: 50,
  FHA_203K: 45,
  HOMESTYLE: 45,
  NON_QM_BANK_STMT: 70,
  DSCR: 72,
  ASSET_DEPLETION: 68,
};

// ─── Dimension Scorers ────────────────────────────────────────────────────────

/**
 * Eligibility Confidence
 * @param {Object} program - program object from Rule Engine
 * @param {string} program.eligibilityStatus - 'PASS' | 'PASS_WITH_CONDITIONS' | 'FAIL'
 * @param {number} program.overlaysTriggered - count of overlays triggered
 * @returns {number} 0–100
 */
export function scoreEligibilityConfidence(program) {
  let score = 0;
  if (program.eligibilityStatus === 'PASS') score = 100;
  else if (program.eligibilityStatus === 'PASS_WITH_CONDITIONS') score = 60;
  else score = 20;
  score -= (program.overlaysTriggered || 0) * 10;
  return Math.max(0, Math.min(100, score));
}

/**
 * Cost Efficiency
 * Seeded base scores by program type + DPA bonus
 * @param {Object} program
 * @returns {number} 0–100
 */
export function scoreCostEfficiency(program) {
  let score = COST_BASE[program.programCode] || 65;
  if (program.dpaProgram) score += 15;
  return Math.min(100, score);
}

/**
 * Speed to Close
 * @param {Object} program
 * @returns {number} 0–100
 */
export function scoreSpeedToClose(program) {
  return SPEED[program.programCode] || 70;
}

/**
 * Borrower Fit
 * @param {Object} program
 * @param {Object} scenario - { dti, reservesMonths }
 * @returns {number} 0–100
 */
export function scoreBorrowerFit(program, scenario) {
  let score = 80;
  const dti = scenario?.dti || 0;
  const reserves = scenario?.reservesMonths || 0;

  if (dti > 50) score -= 10;
  else if (dti > 45) score -= 5;

  if (reserves < 2) score -= 10;
  if (program.ficoSweetSpot) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Operational Friction (inverted — higher = less friction = better)
 * @param {Object} program
 * @returns {number} 0–100
 */
export function scoreOperationalFriction(program) {
  let score = 100;
  if (program.dpaProgram) score -= 15;
  if (program.requiresManualUnderwrite) score -= 10;
  if (['FHA_203K', 'HOMESTYLE'].includes(program.programCode)) score -= 20;
  return Math.max(0, score);
}

// ─── Label Helper ─────────────────────────────────────────────────────────────

/**
 * Converts a raw dimension score to a human-readable label
 * @param {number} score - 0–100
 * @returns {string}
 */
export function scoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Calculates the composite Path Score for a single program
 *
 * Formula:
 *   PathScore = (EC×0.35) + (AP×0.25) + (CE×0.15) + (SC×0.10) + (BF×0.10) + (OF×0.05)
 *
 * @param {Object} program - program object from Rule Engine (with approvalProbability 0–100)
 * @param {Object} scenario - { dti: number, reservesMonths: number }
 * @returns {{ pathScore: number, scoreBreakdown: Object, scoringModelVersion: string }}
 */
export function calculatePathScore(program, scenario) {
  const ec = scoreEligibilityConfidence(program);
  const ap = program.approvalProbability || 0;
  const ce = scoreCostEfficiency(program);
  const sc = scoreSpeedToClose(program);
  const bf = scoreBorrowerFit(program, scenario);
  const of_ = scoreOperationalFriction(program);

  const pathScore =
    ec * 0.35 +
    ap * 0.25 +
    ce * 0.15 +
    sc * 0.10 +
    bf * 0.10 +
    of_ * 0.05;

  return {
    pathScore: Math.round(pathScore * 10) / 10,
    scoreBreakdown: {
      eligibilityConfidence: ec,
      approvalProbability: ap,
      costEfficiency: ce,
      speedToClose: sc,
      borrowerFit: bf,
      operationalFriction: of_,
    },
    scoringModelVersion: 'path-score-v1.0',
  };
}
