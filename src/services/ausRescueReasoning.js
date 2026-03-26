// ============================================================
// src/services/ausRescueReasoning.js
// AUS Rescue v2.0 — Sonnet Reasoning Layer
// Refines Rule Engine seed probabilities with nuanced analysis
// Called AFTER Rule Engine, BEFORE PME display
// ============================================================

// ─── 23 Fix Strategies (condensed for prompt) ───────────────
const FIX_STRATEGIES = [
  { id: 1,  name: "Pay Down Revolving Debt",          impact: "DTI/FICO",      effort: "MEDIUM" },
  { id: 2,  name: "Pay Off Installment Loan",          impact: "DTI",           effort: "HIGH"   },
  { id: 3,  name: "Add Co-Borrower Income",            impact: "DTI",           effort: "MEDIUM" },
  { id: 4,  name: "Gift Funds for Down Payment",       impact: "LTV",           effort: "MEDIUM" },
  { id: 5,  name: "Seller Concessions",                impact: "CASH_TO_CLOSE", effort: "LOW"    },
  { id: 6,  name: "Rate Buydown (−0.250%+)",           impact: "DTI",           effort: "MEDIUM" },
  { id: 7,  name: "Increase Down Payment",             impact: "LTV/DTI",       effort: "HIGH"   },
  { id: 8,  name: "Rapid Rescore for Errors",          impact: "FICO",          effort: "LOW"    },
  { id: 9,  name: "Pay for Delete on Collections",     impact: "FICO",          effort: "MEDIUM" },
  { id: 10, name: "Authorized User Tradeline",         impact: "FICO",          effort: "LOW"    },
  { id: 11, name: "Letter of Explanation",             impact: "DEROGATORY",    effort: "LOW"    },
  { id: 12, name: "Document Non-Traditional Credit",   impact: "FICO",          effort: "LOW"    },
  { id: 13, name: "Build Cash Reserves",               impact: "RISK",          effort: "MEDIUM" },
  { id: 14, name: "Bank Statement Income (Non-QM)",    impact: "DTI",           effort: "MEDIUM" },
  { id: 15, name: "Asset Depletion Income",            impact: "DTI",           effort: "LOW"    },
  { id: 16, name: "Switch to FHA Program",             impact: "PROGRAM",       effort: "LOW"    },
  { id: 17, name: "Switch to USDA if Eligible",        impact: "PROGRAM/LTV",   effort: "LOW"    },
  { id: 18, name: "Switch to VA if Eligible",          impact: "PROGRAM",       effort: "LOW"    },
  { id: 19, name: "DPA Program Stacking",              impact: "LTV/CASH",      effort: "MEDIUM" },
  { id: 20, name: "Debt Management Plan",              impact: "DTI",           effort: "HIGH"   },
  { id: 21, name: "Wait for Seasoning",                impact: "DEROGATORY",    effort: "HIGH"   },
  { id: 22, name: "Interest-Only Loan (Non-QM)",       impact: "DTI",           effort: "LOW"    },
  { id: 23, name: "Negotiate Medical Collections",     impact: "FICO",          effort: "MEDIUM" },
];

// ─── System Prompt ───────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior mortgage underwriting analyst with 20+ years of experience across agency (Fannie/Freddie), government (FHA/VA/USDA), and Non-QM lending.

Your task: Given Rule Engine eligibility results and seed approval probabilities, provide nuanced probability refinements and actionable analysis.

HARD RULES — NEVER VIOLATE:
1. You CANNOT change an INELIGIBLE program to eligible. Hard gate failures are absolute and non-negotiable.
2. You CAN only refine probabilities for ELIGIBLE programs.
3. Probability refinements must stay within ±15 percentage points of the seed probability.
4. Return ONLY valid JSON. No preamble, no markdown fences, no explanation outside the JSON structure.

POSITIVE COMPENSATING FACTORS (push probability up):
- Reserves ≥ 6 months PITI = strong positive
- Reserves 3–5 months = moderate positive
- Employment stability ≥ 5 years same employer = positive
- Low payment shock (new payment <10% higher than current) = positive
- FICO trending upward (recent positive history) = positive
- Residual income well above VA guideline = strong for VA
- Low revolving utilization (<20%) despite other issues = positive
- Large down payment (LTV <70%) = strong positive for Non-QM/Jumbo

NEGATIVE LAYERED RISK FACTORS (push probability down):
- Multiple derogatory marks within 24 months = significant negative
- Cash-out refi + high DTI = layered risk
- Non-owner-occupied + borderline FICO = layered risk
- High LTV + borderline FICO + high DTI = triple layered risk (severe)
- Self-employed < 2 years + borderline DTI = negative
- Recent bankruptcy/foreclosure near seasoning minimum = AUS sensitivity
- Thin credit file (fewer than 3 open tradelines) = negative

AUS BEHAVIORAL TENDENCIES TO FACTOR IN:
- DU tends to reward strong reserves and long employment
- LP tends to be slightly more flexible on DTI with good FICO
- Both engines penalize layered risk more than any single factor
- Manual underwrite has wider variance in outcomes`;

// ─── Build User Prompt ────────────────────────────────────────
function buildUserPrompt(profile, ruleEngineResults) {
  const {
    fico, dti, ltv, loanAmount, propertyType, occupancy,
    reservesMonths, employmentMonths, isVeteran, isSelfEmployed,
    bankruptcyMonths, foreclosureMonths, recentLates,
  } = profile;

  const eligiblePrograms  = ruleEngineResults.programs.filter(p => p.eligible);
  const ineligiblePrograms = ruleEngineResults.programs.filter(p => !p.eligible);

  const programSummaries = ruleEngineResults.programs.map(p => ({
    programId:        p.id,
    programName:      p.name,
    eligible:         p.eligible,
    seedProbability:  p.eligible ? (p.approvalProbability ?? p.probability ?? null) : null,
    hardGateFailures: p.hardGateFailures || p.failedGates || [],
    strengths:        p.strengths || [],
    blockers:         p.blockers  || [],
  }));

  return `Analyze this mortgage loan scenario and return refined program probabilities with analysis.

═══════════════════════════════════════════
BORROWER PROFILE
═══════════════════════════════════════════
FICO Score:          ${fico ?? "Unknown"}
DTI Ratio:           ${dti != null ? dti + "%" : "Unknown"}
LTV Ratio:           ${ltv != null ? ltv + "%" : "Unknown"}
Loan Amount:         ${loanAmount ? "$" + Number(loanAmount).toLocaleString() : "Unknown"}
Property Type:       ${propertyType ?? "SFR"}
Occupancy:           ${occupancy ?? "Primary"}
Reserves:            ${reservesMonths != null ? reservesMonths + " months PITI" : "Unknown"}
Employment Duration: ${employmentMonths != null ? (employmentMonths / 12).toFixed(1) + " years" : "Unknown"}
Veteran/VA Eligible: ${isVeteran ? "Yes" : "No"}
Self-Employed:       ${isSelfEmployed ? "Yes" : "No"}
Bankruptcy (months ago): ${bankruptcyMonths ?? "None/N/A"}
Foreclosure (months ago): ${foreclosureMonths ?? "None/N/A"}
Recent Lates (12mo): ${recentLates ?? "Unknown"}

═══════════════════════════════════════════
RULE ENGINE OUTPUT
═══════════════════════════════════════════
Primary Blocker:     ${ruleEngineResults.primaryBlocker ?? "Unknown"}
Feasibility Seed:    ${ruleEngineResults.feasibility ?? "Unknown"}
Eligible Programs:   ${eligiblePrograms.map(p => p.name).join(", ") || "None"}
Ineligible Programs: ${ineligiblePrograms.map(p => p.name).join(", ") || "None"}

PROGRAM DETAILS:
${JSON.stringify(programSummaries, null, 2)}

═══════════════════════════════════════════
AVAILABLE FIX STRATEGIES (reference by id)
═══════════════════════════════════════════
${JSON.stringify(FIX_STRATEGIES, null, 2)}

═══════════════════════════════════════════
REQUIRED RESPONSE FORMAT (JSON only)
═══════════════════════════════════════════
{
  "feasibility": "LOW | MODERATE | HIGH",
  "primaryBlocker": "short string — the dominant underwriting obstacle",
  "feasibilityRationale": "2–3 sentences explaining the overall feasibility conclusion",
  "overallRecommendation": "1–2 sentences of the single most actionable next step for the LO",
  "programs": [
    {
      "programId": "matches id from rule engine",
      "refinedProbability": <number 0–100, or null if ineligible>,
      "probabilityDelta": <refined minus seed, or null if ineligible>,
      "narrative": "2–3 sentences of program-specific underwriting analysis",
      "keyStrengths": ["strength 1", "strength 2"],
      "keyRisks": ["risk 1", "risk 2"],
      "recommendedStrategies": [<strategy id numbers, top 3 max>]
    }
  ]
}`;
}

// ─── Main Export ──────────────────────────────────────────────
/**
 * Calls Claude Sonnet to refine Rule Engine seed probabilities.
 *
 * @param {object} borrowerProfile  — extracted profile from Haiku (FICO, DTI, LTV, etc.)
 * @param {object} ruleEngineResults — output from programRuleEngine (programs[], feasibility, primaryBlocker)
 * @returns {Promise<object>}        — { feasibility, primaryBlocker, feasibilityRationale,
 *                                       overallRecommendation, programs[] }
 */
export async function runSonnetReasoning({ borrowerProfile, ruleEngineResults }) {
  if (!borrowerProfile || !ruleEngineResults) {
    throw new Error("runSonnetReasoning: borrowerProfile and ruleEngineResults are required");
  }

  const userPrompt = buildUserPrompt(borrowerProfile, ruleEngineResults);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sonnet reasoning API error ${response.status}: ${errText}`);
  }

  const data    = await response.json();
  const rawText = data.content?.map(b => b.text || "").join("") ?? "";

  // Strip any accidental markdown fences
  const clean = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i,     "")
    .replace(/\s*```$/,      "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error("[ausRescueReasoning] JSON parse failed. Raw response:", rawText);
    throw new Error("Sonnet returned invalid JSON. See console for raw response.");
  }

  // ── Safety guard: clamp refined probabilities to seed ±15 ────
  if (parsed.programs && ruleEngineResults.programs) {
    const seedMap = {};
    ruleEngineResults.programs.forEach(p => {
      seedMap[p.id] = p.approvalProbability ?? p.probability ?? null;
    });

    parsed.programs = parsed.programs.map(prog => {
      const seed = seedMap[prog.programId];
      if (prog.refinedProbability == null || seed == null) return prog;

      const clamped = Math.max(
        Math.min(prog.refinedProbability, seed + 15),
        Math.max(0, seed - 15)
      );

      return {
        ...prog,
        refinedProbability: Math.round(clamped),
        probabilityDelta:   Math.round(clamped - seed),
      };
    });
  }

  return parsed;
}

// ─── Helper: merge Sonnet results back into Rule Engine programs ──
/**
 * Merges Sonnet refinements into the Rule Engine program array.
 * Returns a new array suitable for PME display.
 */
export function mergeReasoningResults(ruleEnginePrograms, sonnetResults) {
  if (!sonnetResults?.programs) return ruleEnginePrograms;

  const sonnetMap = {};
  sonnetResults.programs.forEach(p => { sonnetMap[p.programId] = p; });

  return ruleEnginePrograms.map(program => {
    const refinement = sonnetMap[program.id];
    if (!refinement) return program;

    return {
      ...program,
      // Prefer refined probability, fall back to seed
      approvalProbability:  refinement.refinedProbability ?? program.approvalProbability,
      probabilityDelta:     refinement.probabilityDelta    ?? 0,
      narrative:            refinement.narrative            ?? "",
      keyStrengths:         refinement.keyStrengths         ?? program.strengths ?? [],
      keyRisks:             refinement.keyRisks             ?? program.blockers  ?? [],
      recommendedStrategies: refinement.recommendedStrategies ?? [],
      sonnetRefined:        refinement.refinedProbability != null,
    };
  });
}

// ─── Helper: get strategy names by IDs ───────────────────────
export function getStrategyNames(ids = []) {
  return ids
    .map(id => FIX_STRATEGIES.find(s => s.id === id))
    .filter(Boolean)
    .map(s => s.name);
}

export { FIX_STRATEGIES };
