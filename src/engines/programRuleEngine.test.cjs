/**
 * LoanBeacons™ — Program Rule Engine
 * Acceptance Test: Shanna Arscott Scenario
 *
 * Expected (Sonnet-refined final output):
 *   PRIMARY BLOCKER : DTI
 *   Feasibility     : LOW
 *   HomeReady       : 92%   ← Sonnet layer refines from rule engine estimate
 *   Home Possible   : 85%   ← Sonnet layer refines
 *   Conventional    : 34%
 *   FHA             : 22%
 *
 * Note: approvalProbability from the rule engine is a DETERMINISTIC SEED.
 * Sonnet refines this using compensating factor reasoning, AUS likelihood,
 * and program-specific nuance. The final UI percentages come from Sonnet.
 *
 * Run: node "C:\Users\Sherae's Computer\loanbeacons-app\src\engines\programRuleEngine.test.cjs"
 */

'use strict';

async function runTest() {
  // Dynamic import of ES module from CJS
  // Handles both "type":"module" (named exports) and non-module projects (default wrap)
  const _mod = await import('./programRuleEngine.js');
  const engine = (_mod.rankPrograms) ? _mod : (_mod.default ?? _mod);
  const {
    rankPrograms,
    identifyPrimaryBlocker,
    assessFeasibility,
    PROGRAM_ID,
  } = engine;

  // ─── Shanna Arscott Scenario ────────────────────────────────────────────
  // Profile designed to produce:
  //   - DTI as primary/dominant blocker
  //   - HomeReady and Home Possible as best conditional paths
  //   - Conventional and FHA as lower-probability options
  //   - Feasibility = LOW (no clean eligible programs)

  const shannaProfile = {
    fico:               648,    // Passes HomeReady/Conventional floor (620)
                                // Below Home Possible ideal (660) → warning
    dti:                51.5,   // Above HomeReady standard (50%) → blocker/warning
                                // Above Home Possible max (45%) → blocker
                                // Above Conventional standard (45%) → blocker
                                // Below FHA max (57%) but above standard → warning
    ltv:                96.0,   // Near FHA/HomeReady/HP max — passes but tight
    loanAmount:         285_000,
    occupancy:          'PRIMARY',
    vaEligible:         false,  // No VA
    ruralEligible:      false,  // No USDA
    investmentProperty: false,
    dscrRatio:          null,
    reserves:           1.5,    // Minimal reserves — weakens compensating factors
    selfEmployed:       false,
    firstTimeBuyer:     true,
    bankruptcyYearsAgo: null,
    foreclosureYearsAgo:null,
    propertyNeedsRehab: false,  // Move-in ready — disqualifies FHA 203k
  };

  console.log('\n' + '═'.repeat(70));
  console.log(' LOANBEACONS™ — PROGRAM RULE ENGINE');
  console.log(' Acceptance Test: Shanna Arscott Scenario');
  console.log('═'.repeat(70));
  console.log('\n📋 BORROWER PROFILE:');
  console.log(`   FICO       : ${shannaProfile.fico}`);
  console.log(`   DTI        : ${shannaProfile.dti}%`);
  console.log(`   LTV        : ${shannaProfile.ltv}%`);
  console.log(`   Loan Amt   : $${shannaProfile.loanAmount.toLocaleString()}`);
  console.log(`   Occupancy  : ${shannaProfile.occupancy}`);
  console.log(`   VA         : ${shannaProfile.vaEligible}`);
  console.log(`   USDA Rural : ${shannaProfile.ruralEligible}`);
  console.log(`   Reserves   : ${shannaProfile.reserves} months`);
  console.log(`   FTB        : ${shannaProfile.firstTimeBuyer}`);

  // ─── Run Engine ──────────────────────────────────────────────────────────
  const results         = rankPrograms(shannaProfile);
  const primaryBlocker  = identifyPrimaryBlocker(results);
  const feasibility     = assessFeasibility(results);

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(' ENGINE OUTPUT — SUMMARY');
  console.log('─'.repeat(70));
  console.log(`\n🚧 PRIMARY BLOCKER : ${primaryBlocker?.rule ?? 'None'} — ${primaryBlocker?.label ?? ''}`);
  console.log(`                     (blocks ${primaryBlocker?.count ?? 0} of 11 programs)`);
  console.log(`\n📊 FEASIBILITY     : ${feasibility}`);
  console.log(`   (Expected: LOW)\n`);

  // ─── Program Rankings ─────────────────────────────────────────────────────
  console.log('─'.repeat(70));
  console.log(' PROGRAM RANKINGS (sorted by tier then probability)');
  console.log('─'.repeat(70));

  const HIGHLIGHTS = [
    PROGRAM_ID.HOMEREADY,
    PROGRAM_ID.HOME_POSSIBLE,
    PROGRAM_ID.CONVENTIONAL,
    PROGRAM_ID.FHA,
  ];

  for (const r of results) {
    const isHighlight = HIGHLIGHTS.includes(r.programId);
    const statusIcon  = r.eligible ? '✅' : r.conditional ? '⚠️ ' : '❌';
    const probBar     = _bar(r.approvalProbability, 20);
    const highlight   = isHighlight ? ' ◀ KEY' : '';

    console.log(`\n ${statusIcon} ${r.programName.padEnd(22)} [${r.eligibilityLabel.padEnd(12)}]  ${r.approvalProbability}%  ${probBar}${highlight}`);

    if (r.blockers.length) {
      for (const b of r.blockers) {
        const sev = b.severity === 'DISQUALIFYING' ? '🔴' : b.severity === 'CRITICAL' ? '🔴' : '🟠';
        console.log(`     ${sev} BLOCKER [${b.rule}]: ${b.label}`);
        if (b.borrowerValue != null && b.threshold != null) {
          console.log(`        Borrower: ${b.borrowerValue}  |  Limit: ${b.threshold}  |  Gap: ${b.gap ?? 'N/A'}`);
        }
        console.log(`        → ${b.remediation}`);
      }
    }
    if (r.warnings.length && isHighlight) {
      for (const w of r.warnings) {
        console.log(`     🟡 WARNING  [${w.rule}]: ${w.label}`);
        if (w.note) console.log(`        ${w.note}`);
      }
    }
  }

  // ─── Key Program Deep-Dive ────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(' KEY PROGRAM DETAIL (Acceptance Test Programs)');
  console.log('─'.repeat(70));
  console.log(' Acceptance test expects Sonnet-refined final probabilities:');
  console.log('   HomeReady     → 92%   |  Home Possible   → 85%');
  console.log('   Conventional  → 34%   |  FHA             → 22%');
  console.log(' Rule engine produces deterministic seed — Sonnet refines.\n');

  const keyProgs = [
    PROGRAM_ID.HOMEREADY,
    PROGRAM_ID.HOME_POSSIBLE,
    PROGRAM_ID.CONVENTIONAL,
    PROGRAM_ID.FHA,
  ];

  for (const id of keyProgs) {
    const r = results.find(x => x.programId === id);
    if (!r) continue;
    console.log(`\n ── ${r.fullName} ──`);
    console.log(`    Status      : ${r.eligibilityLabel}`);
    console.log(`    Rule Score  : ${r.ruleScore}/100 (rule compliance)`);
    console.log(`    Base Prob   : ${r.approvalProbability}% (seed for Sonnet)`);
    console.log(`    Passes      : ${r.passes.map(p => p.rule).join(', ') || 'none'}`);
    console.log(`    Warnings    : ${r.warnings.map(w => w.rule).join(', ') || 'none'}`);
    console.log(`    Blockers    : ${r.blockers.map(b => `${b.rule}(+${b.gap ?? '?'})`).join(', ') || 'none'}`);
  }

  // ─── VA / USDA / DSCR — Verify Hard Gates ─────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(' HARD GATE VERIFICATION');
  console.log('─'.repeat(70));

  const hardGateProgs = [PROGRAM_ID.VA, PROGRAM_ID.USDA, PROGRAM_ID.DSCR, PROGRAM_ID.JUMBO, PROGRAM_ID.HARD_MONEY];
  for (const id of hardGateProgs) {
    const r = results.find(x => x.programId === id);
    if (!r) continue;
    const gate = r.disqualifyingBlockers.length > 0
      ? `❌ Disqualified — ${r.disqualifyingBlockers.map(b => b.rule).join(', ')}`
      : r.eligible ? '✅ Eligible' : `⚠️  Conditional`;
    console.log(`    ${r.programName.padEnd(22)}: ${gate}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(' TEST COMPLETE — Review output above against acceptance criteria.');
  console.log(' Primary blocker should be DTI. Feasibility should be LOW.');
  console.log(' VA / USDA / DSCR / Jumbo should be DISQUALIFIED (hard gates).');
  console.log('═'.repeat(70) + '\n');
}

// ─── ASCII Bar Chart ──────────────────────────────────────────────────────────
function _bar(value, width = 20) {
  const filled = Math.round((value / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

// ─── Run ──────────────────────────────────────────────────────────────────────
runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
