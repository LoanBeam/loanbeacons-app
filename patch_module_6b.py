"""
patch_module_6b.py
Wires Module 6B (Last Resort Path) into LenderMatch.jsx
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
Command:  python patch_module_6b.py
"""

import sys

FILE = "src/modules/LenderMatch.jsx"

with open(FILE, "r", encoding="utf-8") as f:
    c = f.read()

original = c  # keep for rollback check

# ─── CHANGE 1 ─────────────────────────────────────────────────────────────────
# Add LastResortSection import after the IneligibleLenderRow import

old1 = 'import { IneligibleLenderRow }    from "../components/lenderMatch/IneligibleLenderRow";'

new1 = '''import { IneligibleLenderRow }    from "../components/lenderMatch/IneligibleLenderRow";
import LastResortSection           from "../components/lenderMatch/LastResortSection";
import { evaluateHardMoneyPath }   from "../engines/LenderMatchEngine_hardMoney";'''

if old1 not in c:
    print("ERROR: Could not find IneligibleLenderRow import. Aborting.")
    sys.exit(1)

c = c.replace(old1, new1, 1)
print("✓ Change 1: Added LastResortSection and evaluateHardMoneyPath imports")


# ─── CHANGE 2 ─────────────────────────────────────────────────────────────────
# Add hardMoney stats chip to the stats row, after the Alternative Path chip

old2 = '''              <div style={S.statChip}>
                <div style={S.statChipDot(T.amber)} />
                {results.nonQMSection?.totalEligible ?? 0} Alternative Path eligible
              </div>'''

new2 = '''              <div style={S.statChip}>
                <div style={S.statChipDot(T.amber)} />
                {results.nonQMSection?.totalEligible ?? 0} Alternative Path eligible
              </div>
              {(() => {
                const hm = evaluateHardMoneyPath(
                  normalizeScenario(form),
                  results.agencySection?.totalEligible ?? 0,
                  results.nonQMSection?.totalEligible ?? 0
                );
                return hm.triggered || hm.heroMode ? (
                  <div style={S.statChip}>
                    <div style={S.statChipDot("#e8531a")} />
                    {hm.eligibleCount} Last Resort Path eligible
                  </div>
                ) : null;
              })()}'''

if old2 not in c:
    print("ERROR: Could not find Alternative Path stats chip. Aborting.")
    sys.exit(1)

c = c.replace(old2, new2, 1)
print("✓ Change 2: Added Last Resort Path stats chip")


# ─── CHANGE 3 ─────────────────────────────────────────────────────────────────
# Add LastResortSection component just before the closing </div>{/* /results */}

old3 = '''          </div>
        )}{/* /results */}'''

new3 = '''            {/* ──────── LAST RESORT PATH (HARD MONEY / PRIVATE / BRIDGE) ──────── */}
            <LastResortSection
              scenario={normalizeScenario(form)}
              agencyResultCount={results.agencySection?.totalEligible ?? 0}
              nonQMResultCount={results.nonQMSection?.totalEligible ?? 0}
            />

          </div>
        )}{/* /results */}'''

if old3 not in c:
    print("ERROR: Could not find closing results div. Aborting.")
    sys.exit(1)

c = c.replace(old3, new3, 1)
print("✓ Change 3: Added <LastResortSection /> to results layout")


# ─── WRITE OUTPUT ─────────────────────────────────────────────────────────────
if c == original:
    print("\nWARNING: No changes were made. Check that the file matches expected version.")
    sys.exit(1)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(c)

print("\n✅ LenderMatch.jsx patched successfully.")
print("   Run: npm run dev  — and open Lender Match to verify the Last Resort Path section appears.")
