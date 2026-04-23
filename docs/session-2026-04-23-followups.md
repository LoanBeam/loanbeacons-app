# Session Follow-ups — 2026-04-23

**Purpose:** Captures new Track B tech debt items accumulated during the 2026-04-23 rules pass and the `processorShares` hotfix, plus completed verifications with evidence chain. This is the input artifact for tomorrow's Track B proposal revision.

**Companion to:** `docs/firestore-collections-audit-2026-04-23.md` (audit table checkpoint, committed as `3afa803`).

---

## Tech debt items to incorporate into Track B proposal

### TD-1. Processor share architectural alignment

**Priority:** Medium (not urgent — current rule is sound)

**Verbatim entry:**

> Consider refactoring `ProcessorSharePage` to fetch via Cloud Function HTTP endpoint (`getProcessorShareByToken`), mirroring AE share architecture. Would allow tighter `processorShares` rule (`allow read, write: if isAuth()`, matching `scenarioShares`) and move all unauth processor access through Admin SDK. Current direct-Firestore-read pattern works but creates rule divergence. Not urgent — current rule is sound.

**Origin:** User observation during `processorShares` hotfix scope discussion. Current rule (`allow get: if true; allow list: if false; allow create: if isAuth(); allow update, delete: if isAdmin();`) is correct for the direct-Firestore pattern but doesn't match the `scenarioShares` pattern which routes through a Cloud Function.

---

### TD-2. Git-vs-production rules drift prevention

**Priority:** High (apply before first Track B deploy)

**Verbatim entry:**

> Wave 1 rule changes shipped to Firebase but were never committed to git, leading to surprise drift during today's `processorShares` hotfix. Establish convention: every `firebase deploy --only firestore:rules` must be preceded by a git commit of the rules file. Implement as npm script:
> ```json
> "deploy:rules": "git diff --exit-code firestore.rules && firebase deploy --only firestore:rules --project loanbeacon"
> ```
> `git diff --exit-code` exits non-zero if there are uncommitted changes, preventing the deploy. Same pattern for `storage.rules`. Apply before first Track B deploy.

**Origin:** Discovered when `git diff firestore.rules` during the `processorShares` hotfix revealed four Wave 1 changes (`users`, `auditLog`, `lenderProfiles` create/delete split, `lenderProfiles` comment) that were live in Firebase but never committed to git.

---

### TD-3. Wave 1 code/config orphan reconciliation

**Priority:** High (schedule dedicated session)

**Verbatim entry:**

> During the 2026-04-23 rules hotfix, seven additional Wave 1 orphans were discovered in the working copy:
> - `firebase.json`
> - `package.json`
> - `package-lock.json`
> - `.gitignore`
> - `src/pages/LoginPage.jsx`
> - Untracked: `firestore.indexes.json`
> - Untracked: `setAdminClaim.cjs`
>
> Also a staged deletion of `src/pages/USDAIntelligence.jsx`.
>
> All shipped to production via Firebase hosting but never committed to git. Schedule a dedicated reconciliation session (30–45 minutes, separate from Track B rules work) to commit each with accurate per-file or per-logical-change commit messages.

**Sensitivity review on `setAdminClaim.cjs` — COMPLETED 2026-04-23:**

- ✅ `.gitignore` confirmed to exclude `serviceAccountKey.json` (two entries, verified via findstr during Wave 1)
- ✅ UID on line 21 (`c2rUZ7QOzvTWhTNU6nminMi9iGE2`) matches Firebase Console record for `george@cvls.loans`
- ✅ No hardcoded secrets, API keys, or credential literals in the script
- **Conclusion:** Safe to commit as-is in tomorrow's reconciliation

**Optional polish during reconciliation:** Consider relocating `setAdminClaim.cjs` to `scripts/admin/setAdminClaim.cjs` so it isn't swept into the broader root-level `.cjs` cleanup (tech debt item from original proposal: 19 prototyping `.cjs` scripts at project root).

**Target:** Tomorrow's session after tonight's `processorShares` smoke test passes.

---

## Completed this session (closed — do not redo)

### ✅ P0 security hotfix — `processorShares` token generation

**Commit:** `3b7b543`

**Change:** `src/pages/IntelligentChecklist.jsx:257`

- Before: `` `ps-${Date.now()}-${Math.random().toString(36).substring(2, 8)}` ``
- After: `` `ps-${crypto.randomUUID()}` ``

**Smoke test status:** Deferred pending commit 2 of the rules reconciliation (see "Currently in progress" below).

**Pre-existing compromised shares in Firestore:** Three `ps-<timestamp>-<shortrand>` format docs in `processorShares`, all Tabitha Henderson test data from April 6. Safe to delete after smoke test passes. No external/customer data involved.

### ✅ Admin claim structure verification

Verified alignment between `setAdminClaim.cjs` CLAIMS constant (`{ role: 'admin' }`) and `firestore.rules` `isAdmin()` helper (`request.auth.token.role == 'admin'`). Confirmed via browser console token introspection during Wave 1 smoke test — token includes `role: 'admin'` field. No further action needed.

### ✅ Storage rules review

**File:** `storage.rules` — reviewed during Finding 3.

- Structure is sound (path-scoped, size caps, content-type validation, default-deny catch-all)
- **Bug S1 flagged:** `lenderDocs` read allows any authenticated user. Comment says "admins only" but rule only checks `request.auth != null`. **Fix deferred to Track B proposal** — no live exposure (only George is authenticated today), but must fix before first beta invite.
- **Bug S2 flagged:** `lenderDocs-archived` uses `request.auth.token.admin == true` but admin claim is `role: 'admin'`. Archive path is currently unreachable (including by George). **Fix deferred to Track B proposal.**
- **Observation A logged (not blocking):** Public create on `lenderDocs` + `lenderLogos` needs App Check before beta for abuse mitigation. Not a rules change — enable in Firebase Console.
- **Observation B logged (not blocking):** Session ID format regex in rules depends on `generateSessionId()` entropy in client code. Verify before beta.

### ✅ Token randomness audit

- `lenderInvites` tokens: `crypto.randomUUID()` — **verified secure** (functions/index.js:768)
- `processorShares` tokens (post-hotfix): `crypto.randomUUID()` — **verified secure**
- `lenderIntakePrefills` tokens: no writer found in codebase — **collection will be locked** in Track B rules

### ✅ Finding 1 schema verification for lenderIntakeSubmissions

Invite schema confirmed from `functions/index.js:771`:
```js
{
  token, nmls, lenderName, aeEmail, aeName,
  loUid, loName, loNmls, personalMessage,
  status: "pending",               // ← unredeemed marker
  createdAt: serverTimestamp(),
  expiresAt,                       // ← 30 days from creation
}
```

Cross-references:
- Intake form submission field name: `sourceToken` (not `token`) — from `LenderIntakeForm.jsx:599`
- Token nullable (supports untokenized submissions via `/lender-intake` route)
- Dedup field: `lenderNMLS` in form maps to `nmls` in invite

**Disposition locked (per user decision on 2026-04-23):** Keep both tokenized + untokenized paths, but simplify to open create with three invariants (`lenderNMLS` non-empty string, `status == 'pending_review'`, `submittedAt == request.time`) — no cross-collection validation. Rate/CAPTCHA protection deferred to App Check or Cloud Function preprocessing.

---

## Currently in progress

### Rules reconciliation split commits

**Plan:** Two-file approach, approved 2026-04-23 evening.

- **Commit 1 (reconciliation):** `firestore.rules` Wave 1-only state (users, auditLog, lenderProfiles create/delete split). Commit message: `chore(rules): reconcile git with Wave 1 deployed rules (users, auditLog, lenderProfiles create/delete split) — shipped to Firebase 2026-04-23 AM, never committed; no production impact on redeploy`
- **Commit 2 (hotfix):** `firestore.rules` add `processorShares` block. Commit message: `hotfix(rules): add processorShares Firestore rule to restore share functionality`
- **Scope:** firestore.rules only. Other seven orphans stay in working copy for TD-3 dedicated session.

**Status at time of writing:** Phase 1 file delivered, copy-to-project completed, `git reset` + `git status` verified clean.

**Next action when resuming:** Run `git diff firestore.rules` → `git add firestore.rules` → `git diff --cached firestore.rules` → commit → deploy. Then Phase 2 (processorShares block) as commit 2.

### P0 smoke test (blocked on Phase 2 deploy)

Once Phase 2 deploys cleanly:
1. Hard refresh browser
2. Submission Package tab → Generate Processor Share Link
3. Verify URL format `/processor-share/ps-<long-uuid>`
4. Open URL in incognito
5. Confirm processor view loads
6. Delete the three pre-existing compromised shares from Console

---

## Stopping point criteria

Tonight closes cleanly when:

- [x] P0 hotfix code shipped (commit `3b7b543`, hosting deployed)
- [ ] Rules reconciliation commit 1 landed + deployed (no-op deploy)
- [ ] Rules hotfix commit 2 landed + deployed
- [ ] Processor share smoke test passes
- [ ] Three compromised shares deleted from `processorShares` Console

At that point: git + production rules are in sync for the first time since Wave 1 began. Track B resumes fresh tomorrow.

Remaining tech debt (TD-1 through TD-3, plus all items from the original proposal's Follow-up Technical Debt section) rolls forward to Track B.
