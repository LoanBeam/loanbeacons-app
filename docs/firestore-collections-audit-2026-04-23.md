# Firestore Collections Audit — 2026-04-23

**Purpose:** Checkpoint artifact documenting the Firestore rules drift discovered during Wave 1 of the admin tools build. This cross-references collection names in client code against deployed `firestore.rules` to identify missing rules and deployed-vs-code name mismatches. Serves as the recovery point if this session goes sideways or spans multiple sessions.

**Session context:** Wave 1 (admin claim setup + Firestore rules merge) deployed a rules file that replaced a production catch-all (`allow read, write: if true`) with explicit per-collection rules. Because the merged rules file did not cover every collection used in production code, several collections were implicitly denied after deploy. `users` was caught during Wave 1 verification when LoginAcknowledgment writes failed. This audit documents the remaining drift before Wave 2 proceeds.

---

## Summary

- **Collections referenced in client code:** 21 (18 top-level + 3 subcollections)
- **Collections with rules deployed:** 15
- **Collections missing rules (will fail reads/writes under current deploy):** 8
- **Deployed-vs-code name mismatches:** 1 (`aeShares` rule exists; code writes to `scenarioShares`)

---

## Full audit table

| # | Collection | In deployed rules? | Referenced by | Notes |
|---|---|---|---|---|
| 1 | `scenarios` | ✅ yes | Many modules/pages | Top-level loan scenario records |
| 2 | `scenarios/{id}/decision_log` | ❌ NO (subcollection) | ARM, VA, USDA modules | Subcollection — needs rule |
| 3 | `scenarios/{id}/tradelines` | ❌ NO (subcollection) | DebtConsolidation | Subcollection — needs rule |
| 4 | `scenarios/{id}/audit_events` | ❌ NO (subcollection) | DebtConsolidation | Subcollection — needs rule |
| 5 | `loProfiles` | ✅ yes | Admin, DPA, DebtConsol | LO identity data |
| 6 | `userProfiles` | ✅ yes | Admin, Disclosure | User profile data (possibly redundant with `users`) |
| 7 | `users` | ✅ yes (added Wave 1) | LoginAck, SignUp, QualifyingIntel | Firebase Auth canonical user doc |
| 8 | `decisionRecords` | ✅ yes | Many | Decision Record system |
| 9 | `dpaPrograms` | ✅ yes | DPA | User-scoped DPA programs |
| 10 | `platform_activity` | ✅ yes | LenderProfileBuilder | Admin-readable activity log |
| 11 | `lenderProfiles` | ✅ yes | Builder, Portal | Canonical lender docs |
| 12 | `lenderAccounts` | ✅ yes | Portal | Cloud Function-managed lender accounts |
| 13 | `lenderInvites` | ✅ yes | RegisterPage, IntakeForm | Tokenized invitation docs |
| 14 | `backupAERequests` | ✅ yes | (rules only, no client code found in scan) | Backup AE approval queue |
| 15 | `auditLog` | ✅ yes (added Wave 1) | (Wave 2 target — no writes yet) | Immutable admin action trail |
| 16 | `scenarioShares` | ❌ NO — deployed rule says `aeShares` | ScenarioHeader | **Name mismatch** — rule needs rename or addition |
| 17 | `lenderIntakeSubmissions` | ❌ NO | LenderIntakeForm (Surface A) | **Wave 2 target** — tokenized-only create |
| 18 | `lenderIntakePrefills` | ❌ NO | LenderIntakeForm | Tokenized prefill reads |
| 19 | `processorShares` | ❌ NO | IntelligentChecklist, ProcessorSharePage | Tokenized share docs |
| 20 | `betaCodes` | ❌ NO | SignUpPage | Beta code validation |
| 21 | `lenders` | ❌ NO | DealAdvisor | **Status unknown — under investigation** |
| 22 | `lenderOverrides` (const: `AGENCY_OVERRIDES`) | ❌ NO | useLenderMatchFirestore | **Status unknown — under investigation** |
| 23 | `nonQMOverrides` (const: `NONQM_OVERRIDES`) | ❌ NO | useLenderMatchFirestore | **Status unknown — under investigation** |

---

## Deprecated files noted during scan

Files present in codebase that reference these collections but are not the active code path:

- `src/pages/LenderIntakeForm.DEPRECATED-see-modules.jsx` — older copy of intake form at pages/ path. Active version is at `src/modules/LenderIntakeForm.jsx`. Cleanup task for a future session.
- `src/pages/MIOptimizer.jsxy` — typo file (extension `.jsxy` instead of `.jsx`). Should be reviewed and removed. Cleanup task for a future session.

---

## Investigations pending

- [ ] `lenders` (DealAdvisor) — codebase read/write trace + Firebase Console doc count + schema comparison vs `lenderProfiles`
- [ ] `lenderOverrides` / `nonQMOverrides` (LenderMatch hook) — active vs dead-code determination + Firebase Console doc counts
- [ ] `betaCodes` — confirm SignUpPage reads by doc ID (not query with `where()`) before finalizing `allow get / allow list: if false` rule pattern

---

## Confirmed decisions (awaiting rule-writing step)

- **`lenderIntakeSubmissions` + `lenderIntakePrefills`** — tokenized create only. Rule must validate: (a) request includes a `token` field, (b) token exists in `lenderInvites`, (c) invite is not redeemed or expired, (d) submission's `lenderId`/`aeEmail` matches the invite. Real token validation, not presence check.
- **`betaCodes` write pattern** — manual creation via Firebase Console only. Rule: `allow get: if true; allow list: if false; allow write: if false;`. Pending confirmation that SignUpPage reads by doc ID.
- **`auditLog` entry schema** (Wave 2) — full doc snapshots in `before` and `after` fields. No diff-only shortcuts.
- **Default post-login route** — always `/` (dashboard). LoginPage.jsx updated and deployed during Wave 1.

---

## Rules deployed during Wave 1

Full file at project root: `firestore.rules` (as deployed 2026-04-23).

Collections covered by deployed rules (15):
`lenderProfiles`, `lenderInvites`, `lenderAccounts`, `backupAERequests`, `auditLog`, `users`, `scenarios` (top-level only), `loProfiles`, `userProfiles`, `decisionRecords`, `dpaPrograms`, `platform_activity`, `aeShares` (dead rule), plus default rules.

---

## Protocol for remainder of session

1. Complete investigations (lenders, lenderOverrides, nonQMOverrides)
2. Verify SignUpPage betaCodes read pattern
3. Produce rule proposal document (markdown, not rules file)
4. Per-collection review and approval
5. Only after full approval: write `firestore.rules`
6. Diff review before deploy
7. Post-deploy smoke test sequence: signup → scenario creation → lender intake submission → AE share

---

## Recovery instructions (if session is interrupted)

If this session ends before Wave 2 completes:

1. Read this file first.
2. Check `firestore.rules` (committed state) against the "Full audit table" above. Collections marked ❌ NO that have not been added to rules are still broken.
3. Most urgent breakages: `lenderIntakeSubmissions` (Surface A form non-functional), `scenarioShares` (AE share service non-functional), `scenarios/{id}/tradelines` (DebtConsolidation non-functional).
4. Next session should resume at whichever investigation / proposal / approval step was interrupted.
