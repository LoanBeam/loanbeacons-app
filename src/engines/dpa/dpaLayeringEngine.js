// DPA Intelligence™ — Layering Engine
// Evaluates program combinations and builds ranked stacks

import { DPA_PROGRAMS, PROGRAM_TYPE_PRIORITY, STATE_AMI_REFERENCE } from '../../data/dpa/dpaPrograms';

// ─── AGENCY CLTV RULES ───────────────────────────────────────────────────────
const AGENCY_CLTV_LIMITS = {
  FHA:          { standard: 96.5, withDPA: 96.5, communitySeconds: 96.5 },
  Conventional: { standard: 97,   withDPA: 97,   communitySeconds: 105 },
  VA:           { standard: 100,  withDPA: 100,  communitySeconds: 100 },
  USDA:         { standard: 100,  withDPA: 100,  communitySeconds: 100 },
};

// ─── ELIGIBLE PROGRAMS ───────────────────────────────────────────────────────
export function getEligiblePrograms({
  state,
  loanType,
  borrowerIncome,
  householdSize,
  purchasePrice,
  creditScore,
  isFirstTimeBuyer,
  specialCategories = [],
}) {
  return DPA_PROGRAMS.filter(program => {
    // Active check
    if (!program.active) return false;

    // Geographic check
    if (program.state !== 'ALL' && program.state !== state) return false;

    // Loan type check
    if (!program.loanTypesEligible.includes(loanType)) return false;

    // Credit score check
    if (creditScore < program.minCreditScore) return false;

    // Purchase price check
    if (program.maxPurchasePrice && purchasePrice > program.maxPurchasePrice) return false;

    // First-time buyer check
    if (program.firstTimeBuyerRequired && !isFirstTimeBuyer) return false;

    // Income limit check
    if (program.incomeLimitType === 'ami_percent') {
      const amiRef = STATE_AMI_REFERENCE[state];
      if (amiRef) {
        const amiLimit = (amiRef.median4Person * (program.incomeLimitAmiPct / 100));
        if (borrowerIncome * 12 > amiLimit) return false;
      }
    }
    if (program.incomeLimitType === 'dollar_cap' || program.incomeLimitType === 'program_table') {
      const limit = program.incomeLimitDollar?.[householdSize] 
        || program.incomeLimitDollar?.['ALL'];
      if (limit && borrowerIncome * 12 > limit) return false;
    }

    // Special categories
    if (program.specialCategories && program.specialCategories.length > 0) {
      const hasCategory = program.specialCategories.some(cat => 
        specialCategories.includes(cat)
      );
      if (!hasCategory) return false;
    }

    return true;
  });
}

// ─── CALCULATE ASSISTANCE AMOUNT ─────────────────────────────────────────────
export function calcAssistanceAmount(program, purchasePrice, loanAmount) {
  if (program.maxAssistanceFlat) return program.maxAssistanceFlat;
  if (program.maxAssistancePct) {
    const base = program.maxAssistancePct <= 5 
      ? purchasePrice 
      : loanAmount;
    return Math.round((program.maxAssistancePct / 100) * base);
  }
  return 0;
}

// ─── BUILD CANDIDATE STACKS ──────────────────────────────────────────────────
export function buildCandidateStacks(eligiblePrograms, {
  purchasePrice,
  loanAmount,
  loanType,
  currentCLTV,
}) {
  const stacks = [];
  const cltvLimit = AGENCY_CLTV_LIMITS[loanType]?.communitySeconds || 100;

  // Single program stacks
  eligiblePrograms.forEach(program => {
    const assistanceAmount = calcAssistanceAmount(program, purchasePrice, loanAmount);
    const newCLTV = ((loanAmount / (purchasePrice - assistanceAmount)) * 100);

    if (newCLTV <= cltvLimit) {
      stacks.push({
        programs: [program],
        totalAssistance: assistanceAmount,
        resultingCLTV: Math.round(newCLTV * 100) / 100,
        monthlyPaymentImpact: getMonthlyImpact([program], assistanceAmount),
        layeringBasis: 'Single program — no layering required',
        agencyCitation: getAgencyCitation(loanType),
        stackType: getStackType([program]),
      });
    }
  });

  // Two-program stacks
  for (let i = 0; i < eligiblePrograms.length; i++) {
    for (let j = i + 1; j < eligiblePrograms.length; j++) {
      const p1 = eligiblePrograms[i];
      const p2 = eligiblePrograms[j];

      if (!canLayer(p1, p2)) continue;

      const a1 = calcAssistanceAmount(p1, purchasePrice, loanAmount);
      const a2 = calcAssistanceAmount(p2, purchasePrice, loanAmount);
      const totalAssistance = a1 + a2;
      const newCLTV = ((loanAmount / (purchasePrice - totalAssistance)) * 100);

      if (newCLTV <= cltvLimit && totalAssistance < purchasePrice) {
        stacks.push({
          programs: [p1, p2],
          totalAssistance,
          resultingCLTV: Math.round(newCLTV * 100) / 100,
          monthlyPaymentImpact: getMonthlyImpact([p1, p2], totalAssistance),
          layeringBasis: `${p1.name} permits layering with ${p2.programType} programs per program guidelines`,
          agencyCitation: getAgencyCitation(loanType),
          stackType: getStackType([p1, p2]),
        });
      }
    }
  }

  return rankStacks(stacks);
}

// ─── LAYERING COMPATIBILITY CHECK ────────────────────────────────────────────
function canLayer(p1, p2) {
  // Neither can be no-layer
  if (p1.canBeLayered === 'no' || p2.canBeLayered === 'no') return false;

  // Can't stack two programs from same admin entity (same HFA bond)
  if (
    p1.adminEntity === p2.adminEntity &&
    p1.fundingSource === 'state_bond' &&
    p2.fundingSource === 'state_bond'
  ) return false;

  // Chenoa Fund cannot layer with other secondary financing
  if (
    (p1.id === 'NAT-001' || p2.id === 'NAT-001') &&
    (p1.programType !== 'grant' && p2.programType !== 'grant')
  ) return false;

  return true;
}

// ─── MONTHLY PAYMENT IMPACT ──────────────────────────────────────────────────
function getMonthlyImpact(programs, totalAssistance) {
  const hasAmortizing = programs.some(p => p.programType === 'standard_second');
  if (hasAmortizing) {
    // Rough estimate: 7% rate, 10yr term on amortizing portion
    const amortizingAmount = programs
      .filter(p => p.programType === 'standard_second')
      .reduce((sum, p) => sum + (p.maxAssistanceFlat || 0), 0);
    return Math.round((amortizingAmount * 0.07) / 12);
  }
  return 0; // Grants, forgivables, and deferreds have no monthly payment
}

// ─── AGENCY CITATION ─────────────────────────────────────────────────────────
function getAgencyCitation(loanType) {
  const citations = {
    FHA: 'FHA Handbook 4000.1 — Secondary Financing Requirements',
    Conventional: 'Fannie Mae Selling Guide B5-5.1-02 — Community Seconds',
    VA: 'VA Lenders Handbook — Secondary Financing Guidelines',
    USDA: 'USDA HB-1-3555 — Down Payment Assistance Provisions',
  };
  return citations[loanType] || 'Agency guidelines apply';
}

// ─── STACK TYPE LABEL ────────────────────────────────────────────────────────
function getStackType(programs) {
  const types = programs.map(p => p.programType);
  if (types.every(t => t === 'grant')) return 'Best Value';
  if (types.includes('grant') || types.includes('forgivable_loan')) return 'Recommended';
  if (types.every(t => t === 'deferred_loan')) return 'Conservative';
  return 'Alternative';
}

// ─── RANK STACKS ─────────────────────────────────────────────────────────────
function rankStacks(stacks) {
  return stacks
    .sort((a, b) => {
      // 1. Max assistance first
      if (b.totalAssistance !== a.totalAssistance) {
        return b.totalAssistance - a.totalAssistance;
      }
      // 2. Lower monthly payment impact
      if (a.monthlyPaymentImpact !== b.monthlyPaymentImpact) {
        return a.monthlyPaymentImpact - b.monthlyPaymentImpact;
      }
      // 3. Fewer programs is simpler
      return a.programs.length - b.programs.length;
    })
    .slice(0, 5); // Top 5 stacks max
}
// ─── AMI CALCULATION ─────────────────────────────────────────────────────────
export function calculateAMIPercent(state, annualIncome) {
  const amiRef = STATE_AMI_REFERENCE[state];
  if (!amiRef) return null;
  return Math.round((annualIncome / amiRef.median4Person) * 100);
}