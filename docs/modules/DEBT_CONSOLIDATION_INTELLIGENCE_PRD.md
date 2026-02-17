# Debt Consolidation Intelligence™
## Product Requirements Document (PRD)

**Product:** LoanBeacons™ — Loan Structure Intelligence Platform  
**Module:** Debt Consolidation Intelligence™  
**Stage:** Stage 1 — Pre-Structure & Initial Analysis  
**Route:** `/debt-consolidation`  
**Rules Profile:** `RULES_V1`  
**Version:** 1.0.0  
**Patent:** U.S. Provisional Patent Application No. 63/739,290  
**Last Updated:** 2026-02-17  
**Status:** Planned — Ready for Development  

---

## Table of Contents
1. [Stage Placement & Rationale](#1-stage-placement--rationale)
2. [Module Overview](#2-module-overview)
3. [Why Conservative Detection](#3-why-conservative-detection)
4. [Core User Journeys](#4-core-user-journeys)
5. [UX Microcopy](#5-ux-microcopy-must-match-exactly)
6. [Data Model](#6-data-model)
7. [Enums](#7-enums-exact)
8. [Rules Profile RULES_V1](#8-rules-profile-rules_v1)
9. [Computation Logic](#9-computation-logic)
10. [Duplicate Detection & Actions](#10-duplicate-detection--actions)
11. [Grouped Dedupe API Contract](#11-grouped-dedupe-api-contract)
12. [One-Click Resolve Behaviors](#12-one-click-resolve-behaviors)
13. [Export Requirements](#13-export-requirements)
14. [Validation Rules](#14-validation-rules)
15. [Auto-Population from Scenario Creator](#15-auto-population-from-scenario-creator)
16. [Firestore Schema](#16-firestore-schema)
17. [Component Architecture](#17-component-architecture)
18. [Acceptance Criteria](#18-acceptance-criteria)
19. [Test Fixtures](#19-test-fixtures)
20. [Dashboard Integration](#20-dashboard-integration)
21. [Build Order & Dependencies](#21-build-order--dependencies)
22. [Future Enhancements](#22-future-enhancements)

---

## 1. Stage Placement & Rationale

### ✅ Stage 1 — Pre-Structure & Initial Analysis

**Why Stage 1 (NOT Stage 3):**

Debt Consolidation Intelligence™ belongs in **Stage 1** because it processes and CLEANS raw credit report liability data BEFORE any loan structuring begins.

```
Stage 1 Flow:
Scenario Creator™ (basic borrower data)
        ↓
Debt Consolidation Intelligence™ ← THIS MODULE
- Clean duplicate debts
- Apply student loan payment rules by program
- Calculate accurate qualifying DTI
        ↓
Accurate DTI flows into ALL downstream modules:
- Stage 2: Lender Match (DTI requirements)
- Stage 2: AUS Rescue (DTI diagnosis)
- Stage 3: Rate Buydown (affordability)
- Stage 3: MI Optimizer (qualification)
- Stage 3: Piggyback Optimizer (qualification)
- Stage 4: Intelligent Checklist (conditions)
- Stage 4: Decision Record (audit trail)
```

**The critical insight:** If student loan payments are wrong OR duplicate debts inflate DTI — EVERY other module downstream produces wrong results. This module must run FIRST.

### Sits Alongside in Stage 1:
| Module | Purpose |
|--------|---------|
| ✅ Scenario Creator™ | Basic loan + borrower data |
| 🔨 Debt Consolidation Intelligence™ | Liability cleanup + DTI accuracy |
| ⏳ Bank Statement Intelligence™ | Income documentation |
| ⏳ Income Analysis™ | Qualifying income |
| ⏳ Asset Documentation™ | Asset verification |

---

## 2. Module Overview

### What It Does
1. Applies **student loan qualifying payment rules** based on loan program:
   - FHA (0.5% of balance fallback)
   - VA (5% ÷ 12 threshold)
   - Conventional — Fannie Mae (IDR $0 allowed with verification OR 1% fallback)
   - Conventional — Freddie Mac (0.5% of balance fallback)

2. Automatically detects **duplicate debts** across all liabilities:
   - **Auto-removes** only HIGH confidence duplicates
   - **Flags** MEDIUM/LOW duplicates for LO review
   - **Conservative lock** on student loan SUMMARY vs CHILD groups

3. Provides **One-Click Resolve** UI for flagged duplicates

4. Exports **LO/Underwriter Notes** and **Borrower Summary PDF**

5. Saves cleaned liability data back to Firestore scenario

### What the User Experiences
- LO selects **Fannie vs Freddie** when loan program = Conventional
- Debt table shows computed **Qualifying Payment** and **method badge**
- Duplicate groups appear with clear visual flags and one-click resolution
- DTI impact preview shows before/after effect of each decision
- Full audit trail of every action logged automatically

---

## 3. Why Conservative Detection

**Decision:** We will **NOT auto-remove** student loan SUMMARY vs CHILD duplicates by default.

**Instead:**
- ✅ **FLAG for review** with clear visual indicator
- ✅ Show **Recommended Action** with explanation
- ✅ Give LO **One-Click Apply Recommendation** button
- ✅ Log complete **audit trail** of every decision
- ✅ Require **reason selection** for any override

**Why this is the right approach:**
- Prevents accidental deletion of valid obligations
- Keeps LO in control of underwriting decisions  
- Creates defensible audit trail for VA/FHA audits
- Minimizes "restore" events after incorrect auto-removal
- Compliant with investor guideline requirements

---

## 4. Core User Journeys

### 4.1 LO — Process Liabilities for Scenario
1. LO selects existing scenario from Firestore
2. Module auto-loads: loan program, borrower name, property value, loan amount from Scenario Creator
3. If loan program = CONVENTIONAL → LO selects Fannie or Freddie
4. LO enters or imports liability list from credit report
5. System applies student loan qualifying payment rules
6. System runs duplicate detection
7. HIGH confidence duplicates auto-removed with notification
8. MEDIUM/LOW duplicates flagged with recommended action
9. LO reviews flagged items and clicks One-Click Resolve
10. System recalculates DTI with cleaned liabilities
11. LO saves results back to scenario
12. Results flow into all downstream modules

### 4.2 LO — Review Student Loan Summary/Child Flag
1. System flags SUMMARY vs CHILD group with badge
2. Right panel shows Student Loan Duplicate Review card
3. LO reviews impact preview (current DTI vs projected DTI)
4. LO clicks **Apply Recommendation** (preferred) or selects override
5. If override: LO selects reason from dropdown (required)
6. System logs audit event and updates totals
7. Toast confirmation shown

### 4.3 LO — Export Documentation
1. LO clicks Export after reviewing all flags
2. System generates:
   - LO/Underwriter Notes PDF (with exact required phrasing)
   - Borrower Summary PDF (plain language explanation)
3. Both PDFs use computed numbers from rules engine (not manually entered)

---

## 5. UX Microcopy (Must Match Exactly)

### 5.1 Debt Table Badge
```
Badge Text:    "Possible Duplicate (Student Loan Summary)"
Badge Color:   Yellow warning style
Tooltip:       "We detected a student loan summary line that may 
                duplicate individual child loans. Review recommended 
                before underwriting."
```

### 5.2 Right Panel Card — Student Loan Duplicate Review
```
Title:    "Student Loan Duplicate Review"

Body:     "This credit report shows a summary student loan and 
           individual child loans under the same servicer. 
           Counting both may inflate your DTI."

Section:  "Recommended Action"

Text:     "Use individual child loans and exclude the summary 
           line to avoid double-counting."
```

### 5.3 DTI Impact Preview (show when DTI available)
```
"Estimated DTI Impact if Applied:"
"• Current DTI: {current_dti}%"
"• After Excluding Summary: {projected_dti}%"
```

### 5.4 Buttons
```
Primary:   "Apply Recommendation"
Secondary: "Keep Both"
Tertiary:  "Mark Not Duplicate"
```

### 5.5 Reason Dropdown (required for overrides)
```
Label: "Reason for Decision (Required)"

Options:
1. "Child loans do not sum to summary balance"
2. "Servicer reporting inconsistency – verified separate obligations"
3. "Underwriter direction"
4. "Borrower provided documentation confirming separate loans"
5. "Other (enter note)"
```

### 5.6 Toast Notifications
```
Apply Recommendation:
"Summary line excluded. Individual student loans retained. 
 Audit log updated."

Keep Both:
"Both tradelines retained. Decision logged for underwriting review."

Mark Not Duplicate:
"Tradeline marked as not duplicate. Audit log updated."
```

### 5.7 Working Banner (matches other modules)
```
"✓ Working on: {scenario_name}"
"{loan_amount} loan • LTV: {ltv}% • Program: {loan_program}"
```

---

## 6. Data Model

### 6.1 Scenario (additions to existing)
```
scenario_id              (PK - existing)
loan_program             (enum - LoanProgram)
conventional_investor    (enum nullable - ConventionalInvestor)
                         REQUIRED if loan_program = CONVENTIONAL
rules_profile_id         (string, e.g., "RULES_V1")
created_at               (timestamp)
updated_at               (timestamp)
```

### 6.2 debt_tradeline
**Required baseline fields:**
```
tradeline_id             (PK)
scenario_id              (FK → scenario)
creditor_name_raw        (string)
creditor_name_normalized (string)
debt_type                (enum - DebtType)
status                   (enum)
balance                  (decimal)
reported_monthly_payment (decimal nullable)
account_last4            (string nullable)
account_hash             (string nullable) ← preferred if available
last_reported_date       (date nullable)
source                   (enum)
```

**Student loan computed fields:**
```
student_qualifying_payment   (decimal nullable)
student_qual_payment_method  (enum nullable - StudentQualPaymentMethod)
student_payment_reason_note  (text nullable)
documented_monthly_payment   (decimal nullable)
student_doc_type             (enum nullable)
idr_verified_zero            (boolean default false)
```

**Duplicate detection fields:**
```
dedupe_action            (enum - DedupeAction)
dedupe_group_id          (string nullable)
kept_tradeline_id        (string nullable)
dedupe_reason_code       (enum nullable - DedupeReasonCode)
dedupe_confidence        (enum nullable - ConfidenceLevel)
dedupe_reason_note       (text nullable)
dedupe_rule_version      (string nullable)
user_decision_reason     (text nullable)
                         ← used for override reason dropdown / "Other" note
```

### 6.3 audit_event
```
audit_event_id           (PK)
scenario_id              (FK → scenario)
event_type               (enum - AuditEventType)
subject_id               (tradeline_id OR dedupe_group_id)
metadata_json            (json)
created_by_user_id       (nullable — null = system action)
created_at               (timestamp)
```

---

## 7. Enums (Exact)

### LoanProgram
```
FHA | VA | USDA | CONVENTIONAL | JUMBO | NON_QM | DSCR | REVERSE | OTHER
```

### ConventionalInvestor
```
FANNIE | FREDDIE
```

### DebtType
```
REVOLVING | INSTALLMENT | MORTGAGE | STUDENT_LOAN | COLLECTION | 
CHARGE_OFF | LEASE | ALIMONY_CHILD_SUPPORT | OTHER
```

### StudentQualPaymentMethod
```
DOCUMENTED_PAYMENT        ← actual payment from servicer statement
CREDIT_REPORT_PAYMENT     ← payment shown on credit report
FHA_0_5_PERCENT_BALANCE   ← FHA fallback: 0.5% of balance
VA_5_PERCENT_DIV_12       ← VA threshold: (5% × balance) ÷ 12
FANNIE_IDR_ZERO_ALLOWED   ← Fannie Mae: $0 allowed with IDR verification
FANNIE_1_PERCENT_BALANCE  ← Fannie Mae fallback: 1% of balance
FANNIE_AMORTIZED_PAYMENT  ← Fannie Mae: fully amortized payment
FREDDIE_0_5_PERCENT_BALANCE ← Freddie Mac fallback: 0.5% of balance
CUSTOM_OVERRIDE           ← manual LO override
```

### DedupeAction
```
NONE              ← no action taken
AUTO_REMOVED      ← system auto-removed (HIGH confidence only)
FLAGGED_REVIEW    ← flagged for LO review
MANUAL_EXCLUDED   ← LO applied recommendation
RESTORED_BY_USER  ← LO restored after auto-remove
OVERRIDDEN_KEEP_BOTH ← LO chose to keep both
```

### DedupeReasonCode
```
ACCT_LAST4_MATCH
ACCT_HASH_MATCH
CREDITOR_BALANCE_PAYMENT_MATCH
CREDITOR_BALANCE_MATCH
STUDENT_SERVICER_ORIG_LENDER_PAIR
SUMMARY_CHILD_LOANS_DUPLICATE    ← triggers conservative lock
USER_MARKED_DUPLICATE
```

### ConfidenceLevel
```
HIGH    → AUTO_REMOVED allowed
MEDIUM  → FLAGGED_REVIEW only
LOW     → FLAGGED_REVIEW only
```

### AuditEventType
```
DEDUPE_AUTO_REMOVED
DEDUPE_USER_APPLY_RECOMMENDATION
DEDUPE_USER_KEEP_BOTH
DEDUPE_USER_MARK_NOT_DUPLICATE
DEDUPE_USER_RESTORE
STUDENT_LOAN_PAYMENT_COMPUTED
STUDENT_LOAN_OVERRIDE_APPLIED
SCENARIO_LIABILITIES_SAVED
```

---

## 8. Rules Profile RULES_V1

### 8.1 Student Loan Fallback Factors
```
FHA:
  fallback_rate = 0.005 (0.5% of balance)

VA:
  threshold = (0.05 × balance) ÷ 12

Conventional — Fannie Mae:
  if idr_verified_zero = true  → $0 qualifying payment allowed
  if idr_verified_zero = false → fallback = 0.01 × balance (1%)
  
Conventional — Freddie Mac:
  fallback_rate = 0.005 (0.5% of balance)
```

### 8.2 Duplicate Detection Tolerances
```
balance_tolerance = max($25, 1% of larger balance)
payment_tolerance = max($5,  1% of larger payment)
```

### 8.3 Conservative Lock (MUST ENFORCE)
```
IF dedupe pattern = SUMMARY vs CHILD student loan:
  SET dedupe_action    = FLAGGED_REVIEW
  SET dedupe_reason_code = SUMMARY_CHILD_LOANS_DUPLICATE
  SET dedupe_confidence  = MEDIUM
  
  ⛔ DO NOT set AUTO_REMOVED
  ⛔ Even if balances sum correctly
  ⛔ This is a hard rule — no exceptions in RULES_V1
```

---

## 9. Computation Logic

### 9.1 Student Loan Qualifying Payment (Pseudocode)
```pseudocode
FUNCTION computeStudentLoanPayment(tradeline, scenario):

  // Priority 1: Documented payment from servicer statement
  IF tradeline.documented_monthly_payment > 0:
    RETURN {
      method: DOCUMENTED_PAYMENT,
      qualifying_payment: tradeline.documented_monthly_payment,
      note: "Payment per borrower-provided servicer statement"
    }

  // Priority 2: Payment shown on credit report
  IF tradeline.reported_monthly_payment > 0:
    RETURN {
      method: CREDIT_REPORT_PAYMENT,
      qualifying_payment: tradeline.reported_monthly_payment,
      note: "Payment per credit report"
    }

  // Priority 3: Program fallback
  SWITCH scenario.loan_program:

    CASE FHA:
      RETURN {
        method: FHA_0_5_PERCENT_BALANCE,
        qualifying_payment: tradeline.balance * 0.005,
        note: "FHA guideline: 0.5% of outstanding balance (no payment on credit report)"
      }

    CASE VA:
      RETURN {
        method: VA_5_PERCENT_DIV_12,
        qualifying_payment: (tradeline.balance * 0.05) / 12,
        note: "VA guideline: 5% of balance divided by 12 months"
      }

    CASE CONVENTIONAL:
      IF scenario.conventional_investor == FANNIE:
        IF tradeline.idr_verified_zero == true:
          RETURN {
            method: FANNIE_IDR_ZERO_ALLOWED,
            qualifying_payment: 0,
            note: "Fannie Mae: $0 IDR payment allowed — verified via documentation"
          }
        ELSE:
          RETURN {
            method: FANNIE_1_PERCENT_BALANCE,
            qualifying_payment: tradeline.balance * 0.01,
            note: "Fannie Mae: 1% of balance (no documented IDR payment)"
          }

      IF scenario.conventional_investor == FREDDIE:
        RETURN {
          method: FREDDIE_0_5_PERCENT_BALANCE,
          qualifying_payment: tradeline.balance * 0.005,
          note: "Freddie Mac: 0.5% of outstanding balance"
        }
```

---

## 10. Duplicate Detection & Actions

### 10.1 Confidence Levels & Actions
```
HIGH CONFIDENCE → AUTO_REMOVED (system acts automatically)
Triggers when ANY of:
  ✓ account_hash matches exactly
  ✓ account_last4 matches AND creditor matches AND balance within tolerance

MEDIUM CONFIDENCE → FLAGGED_REVIEW (LO must decide)
Triggers when:
  ✓ creditor matches AND balance within tolerance AND payment within tolerance
  ✗ No account token available

LOW CONFIDENCE → FLAGGED_REVIEW (LO must decide)
Triggers when:
  ✓ Partial matches only
```

### 10.2 Special Student Loan Patterns
```
Pattern A: Servicer vs Original Lender
  IF account_last4 OR account_hash matches → HIGH confidence → AUTO_REMOVED allowed
  IF no token match → MEDIUM confidence → FLAGGED_REVIEW

Pattern B: SUMMARY vs CHILD Group ← Conservative Lock
  ALWAYS → FLAGGED_REVIEW
  ALWAYS → dedupe_confidence = MEDIUM
  ALWAYS → dedupe_reason_code = SUMMARY_CHILD_LOANS_DUPLICATE
  NEVER  → AUTO_REMOVED (regardless of balance match)
```

### 10.3 Which Tradeline to Keep (when auto-removing)
Priority order:
1. More complete field coverage (fewer nulls)
2. Newer `last_reported_date`
3. OPEN/IN_REPAYMENT status over TRANSFERRED/CLOSED

---

## 11. Grouped Dedupe API Contract

Backend returns dedupe groups alongside flat tradelines for easy UI rendering:

```json
{
  "scenario": { "...": "..." },
  "tradelines": [
    // flat list with all dedupe fields populated
  ],
  "dedupe_groups": [
    {
      "dedupe_group_id": "grp_001",
      "group_type": "STUDENT_SUMMARY_CHILD",
      "confidence": "MEDIUM",
      "recommended_action": "EXCLUDE_SUMMARY_KEEP_CHILD",
      "badge_label": "Possible Duplicate (Student Loan Summary)",
      "tooltip": "We detected a student loan summary line that may duplicate individual child loans. Review recommended before underwriting.",
      "members": [
        { "tradeline_id": "tl_sum",     "role": "SUMMARY" },
        { "tradeline_id": "tl_child_1", "role": "CHILD"   },
        { "tradeline_id": "tl_child_2", "role": "CHILD"   }
      ],
      "impact_preview": {
        "current_dti": 41.2,
        "projected_dti_after_apply": 39.8
      }
    }
  ]
}
```

---

## 12. One-Click Resolve Behaviors (Exact)

### 12.1 Apply Recommendation
```
Button:  "Apply Recommendation"
Effect:  Exclude summary line, keep child lines

Data changes — Summary tradeline:
  dedupe_action = MANUAL_EXCLUDED
  user_decision_reason = "User applied recommended action: excluded 
    student loan summary line and retained child tradelines to prevent 
    double counting."

Data changes — Child tradelines:
  dedupe_action = NONE (no change)

Audit event:
  event_type = DEDUPE_USER_APPLY_RECOMMENDATION
  subject_id = dedupe_group_id
  metadata   = { affected_tradeline_ids: [...] }

Toast: "Summary line excluded. Individual student loans retained. 
        Audit log updated."
```

### 12.2 Keep Both
```
Button:  "Keep Both"
Requires: reason dropdown selection (REQUIRED — cannot submit without)

Data changes — Both members:
  dedupe_action = OVERRIDDEN_KEEP_BOTH
  user_decision_reason = "User retained both summary and child student 
    loan tradelines. Reason: {selected_reason}."

Audit event:
  event_type = DEDUPE_USER_KEEP_BOTH
  
Toast: "Both tradelines retained. Decision logged for underwriting review."
```

### 12.3 Mark Not Duplicate
```
Button:  "Mark Not Duplicate"

Data changes — All members:
  dedupe_action = NONE
  user_decision_reason = "User marked student loan summary and child 
    tradelines as not duplicate. Underwriter review may be required."

Audit event:
  event_type = DEDUPE_USER_MARK_NOT_DUPLICATE

Toast: "Tradeline marked as not duplicate. Audit log updated."
```

---

## 13. Export Requirements (Exact Phrasing)

### 13.1 LO / Underwriter Notes PDF

**Section: Student Loan Qualifying Payment Rules Applied**
*(one entry per student loan tradeline)*
```
Creditor/Servicer: {creditor} | Acct: ****{last4_or_na}
Balance:           ${balance}
Reported Payment:  ${reported_payment_or_na}
Documented Payment: ${documented_payment_or_na} ({doc_type_or_na})
Qualifying Payment Used: ${student_qualifying_payment}
Method:            {student_qual_payment_method}
Reason:            {student_payment_reason_note}
```

**Section: Duplicate Debt Handling**
```
Auto-removed duplicates: {count_auto_removed}.
Flagged for review: {count_flagged}.
```

For each FLAGGED_REVIEW student summary/child group:
```
Flagged for Review: Student Loan Summary vs Child Loans
Recommendation: Review tradelines to confirm duplicate status 
before underwriting submission.
```

If LO clicked **Apply Recommendation**:
```
The student loan summary tradeline was excluded after user confirmation 
to prevent double-counting. Individual child loans were retained as 
primary obligations.
```

If **Keep Both**:
```
Both summary and child student loan tradelines were retained per loan 
officer decision. See reason note for justification.
```

If **Mark Not Duplicate**:
```
Tradelines were reviewed and marked as not duplicate by the loan officer. 
No exclusion applied.
```

### 13.2 Borrower Summary PDF
```
We reviewed the debts listed on your credit report and built a payoff 
plan based on your selected loan program.

Credit reports sometimes list the same debt more than once. We removed 
duplicates to avoid counting the same payment twice.

Student loan payments can show as $0 on credit reports. When that 
happens, mortgage guidelines require using a standard estimated payment 
unless you provide a current statement showing the required payment.
```

If any student loan used fallback:
```
To use your exact student loan payment, please provide a current 
servicer statement or payment letter showing the required monthly payment.
```

Always include:
```
Next steps: Your loan officer will confirm any flagged items and 
finalize the payoff amounts before closing.
```

---

## 14. Validation Rules

### 14.1 Hard Validations (Block save/export if violated)
```
✗ scenario.loan_program REQUIRED

✗ if loan_program = CONVENTIONAL:
    conventional_investor REQUIRED (must select Fannie or Freddie)

✗ if loan_program ≠ CONVENTIONAL:
    conventional_investor must be NULL/absent

✗ if dedupe_action = AUTO_REMOVED:
    REQUIRED: kept_tradeline_id
    REQUIRED: dedupe_reason_code
    REQUIRED: dedupe_confidence
    REQUIRED: dedupe_reason_note
    REQUIRED: dedupe_rule_version

✗ if student_qual_payment_method = DOCUMENTED_PAYMENT:
    documented_monthly_payment > 0 REQUIRED
```

### 14.2 Soft Validations (Warning — allow save with acknowledgment)
```
⚠ Student loan reported payment = $0 or missing AND no documentation
  Warning: "Fallback payment method used for {creditor}. 
            Provide servicer statement to use actual payment."

⚠ MEDIUM or LOW confidence duplicate detected
  Warning: "Review flagged duplicates before submitting to underwriting."
```

---

## 15. Auto-Population from Scenario Creator

This module auto-loads from Scenario Creator™ (zero re-entry):

```
loan_program           ← from Scenario Creator loan_type field
loan_amount            ← auto-loaded for DTI calculations
property_value         ← auto-loaded
ltv                    ← auto-calculated
credit_score           ← auto-loaded (affects student loan risk assessment)
borrower_first_name    ← auto-loaded for display
borrower_last_name     ← auto-loaded for display
monthly_income         ← auto-loaded for DTI calculation
existing_debts         ← pre-populated if entered in Scenario Creator
```

**Working Banner (same as all modules):**
```
✓ Working on: {scenario_name}
${loan_amount} loan • LTV: {ltv}% • Program: {loan_program}
[Change Scenario]
```

---

## 16. Firestore Schema

### Collection: `scenarios/{scenarioId}`
```javascript
// Addition to existing scenario document:
{
  loan_program: 'FHA',              // or VA, CONVENTIONAL, etc.
  conventional_investor: null,       // 'FANNIE' or 'FREDDIE' if CONVENTIONAL
  rules_profile_id: 'RULES_V1',
  
  debt_consolidation_analysis: {
    completed_at: Timestamp,
    total_monthly_obligations: 0,    // sum of qualifying payments
    qualifying_dti: 0,               // after debt cleanup
    gross_dti: 0,                    // before cleanup
    tradeline_count: 0,
    auto_removed_count: 0,
    flagged_review_count: 0,
    student_loan_count: 0,
    student_loan_fallback_used: false,
  }
}
```

### Collection: `scenarios/{scenarioId}/tradelines/{tradelineId}`
```javascript
{
  tradeline_id: 'tl_001',
  creditor_name_raw: 'NAVIENT',
  creditor_name_normalized: 'Navient Solutions',
  debt_type: 'STUDENT_LOAN',
  status: 'IN_REPAYMENT',
  balance: 45000,
  reported_monthly_payment: 0,
  account_last4: '1234',
  account_hash: null,
  last_reported_date: Timestamp,
  source: 'CREDIT_REPORT',
  
  // Student loan computed
  student_qualifying_payment: 225,
  student_qual_payment_method: 'FHA_0_5_PERCENT_BALANCE',
  student_payment_reason_note: 'FHA guideline: 0.5% of outstanding balance',
  documented_monthly_payment: null,
  student_doc_type: null,
  idr_verified_zero: false,
  
  // Dedupe
  dedupe_action: 'NONE',
  dedupe_group_id: null,
  kept_tradeline_id: null,
  dedupe_reason_code: null,
  dedupe_confidence: null,
  dedupe_reason_note: null,
  dedupe_rule_version: null,
  user_decision_reason: null,
  
  created_at: Timestamp,
  updated_at: Timestamp,
}
```

### Collection: `scenarios/{scenarioId}/audit_events/{eventId}`
```javascript
{
  audit_event_id: 'evt_001',
  scenario_id: 'scen_001',
  event_type: 'DEDUPE_USER_APPLY_RECOMMENDATION',
  subject_id: 'grp_001',
  metadata_json: {
    affected_tradeline_ids: ['tl_sum', 'tl_child_1'],
    user_decision: 'MANUAL_EXCLUDED',
    dti_before: 41.2,
    dti_after: 39.8,
  },
  created_by_user_id: 'user_123',
  created_at: Timestamp,
}
```

---

## 17. Component Architecture

```
src/pages/
└── DebtConsolidation.jsx          ← main page component

src/components/debt/
├── DebtTable.jsx                  ← liability table with badges
├── DuplicateReviewPanel.jsx       ← right panel for flagged items
├── StudentLoanBadge.jsx           ← method badge component
├── OneClickResolve.jsx            ← resolve buttons + reason dropdown
├── DTIImpactPreview.jsx           ← before/after DTI display
├── DebtSummaryBar.jsx             ← totals bar (monthly obligations, DTI)
└── DebtExportButtons.jsx          ← LO Notes + Borrower PDF export
```

### DebtConsolidation.jsx — Key Functions
```javascript
// Auto-populate from Firestore scenario
const loadScenario = async (scenarioId) => { ... }

// Apply student loan payment rules
const computeStudentLoanPayment = (tradeline, program, investor) => { ... }

// Run duplicate detection
const detectDuplicates = (tradelines) => { ... }

// Conservative lock enforcement
const applyConservativeLock = (group) => {
  // ALWAYS returns FLAGGED_REVIEW for SUMMARY_CHILD pattern
  // Never returns AUTO_REMOVED
}

// One-click resolve handlers
const handleApplyRecommendation = async (groupId) => { ... }
const handleKeepBoth = async (groupId, reason) => { ... }
const handleMarkNotDuplicate = async (groupId) => { ... }

// Save to Firestore
const saveToScenario = async () => { ... }
```

---

## 18. Acceptance Criteria

### 18.1 Conventional Investor Requirement
```
✓ Conventional scenario CANNOT save without Fannie/Freddie selection
✓ Non-conventional scenarios do NOT show investor dropdown
✓ Switching from CONVENTIONAL to FHA clears investor selection
```

### 18.2 Student Loan Qualifying Payment (all 7 methods)
```
✓ FHA:     0.5% fallback = balance × 0.005
✓ VA:      5%/12 = (balance × 0.05) ÷ 12
✓ Fannie:  $0 allowed ONLY when idr_verified_zero = true
✓ Fannie:  1% fallback when idr_verified_zero = false
✓ Freddie: 0.5% fallback = balance × 0.005
✓ Any:     Documented payment takes priority (all programs)
✓ Any:     Credit report payment is second priority (all programs)
```

### 18.3 Duplicate Detection
```
✓ HIGH confidence duplicates → AUTO_REMOVED + audit event logged
✓ MEDIUM confidence → FLAGGED_REVIEW (never auto-removed)
✓ Student SUMMARY vs CHILD → ALWAYS FLAGGED_REVIEW (conservative lock)
✓ Conservative lock cannot be bypassed by RULES_V1
```

### 18.4 One-Click Resolve
```
✓ Apply Recommendation:
  - Summary tradeline → MANUAL_EXCLUDED
  - Child tradelines → NONE (unchanged)
  - Audit event logged with group_id and affected tradeline_ids
  - Toast shown
  - DTI recalculated immediately

✓ Keep Both:
  - Reason dropdown REQUIRED (cannot submit without)
  - Both tradelines → OVERRIDDEN_KEEP_BOTH
  - Audit event logged with reason
  - Toast shown

✓ Mark Not Duplicate:
  - All members → NONE
  - Audit event logged
  - Toast shown
```

### 18.5 Exports
```
✓ LO Notes PDF contains exact required phrasing per section 13.1
✓ Borrower PDF contains exact required phrasing per section 13.2
✓ Fallback note included ONLY when fallback method used
✓ PDFs use computed numbers from rules engine (never manual entry)
```

---

## 19. Test Fixtures

### File Structure
```
/tests/
├── fixtures/
│   ├── student_loan_rules/
│   │   ├── fha_fallback.input.json
│   │   ├── fha_fallback.expected.json
│   │   ├── va_threshold.input.json
│   │   ├── va_threshold.expected.json
│   │   ├── fannie_idr_zero.input.json
│   │   ├── fannie_idr_zero.expected.json
│   │   ├── fannie_1pct_fallback.input.json
│   │   ├── fannie_1pct_fallback.expected.json
│   │   ├── freddie_fallback.input.json
│   │   └── freddie_fallback.expected.json
│   └── dedupe/
│       ├── high_confidence_acct_hash.input.json
│       ├── high_confidence_acct_hash.expected.json
│       ├── medium_confidence_no_token.input.json
│       ├── medium_confidence_no_token.expected.json
│       ├── summary_child_loans_duplicate.input.json
│       └── summary_child_loans_duplicate.expected.json
│           ← Must produce FLAGGED_REVIEW (NOT AUTO_REMOVED)
└── expected/
    ├── conservative_lock_verified.json
    └── dti_recalculation_after_resolve.json
```

### Critical Test: Conservative Lock
```json
// summary_child_loans_duplicate.expected.json
{
  "dedupe_action": "FLAGGED_REVIEW",
  "dedupe_reason_code": "SUMMARY_CHILD_LOANS_DUPLICATE",
  "dedupe_confidence": "MEDIUM",
  "auto_removed": false
}
```
> ⛔ If this test produces `AUTO_REMOVED` — the conservative lock is broken. Block deployment.

---

## 20. Dashboard Integration

### Stage 1 Module Card
```javascript
{
  id: 'debt-consolidation',
  title: 'Debt Consolidation Intelligence™',
  icon: '💳',
  description: 'Clean duplicate debts, apply student loan payment rules, and calculate accurate qualifying DTI.',
  badge: 'NEW',
  status: 'planned',      // → 'live' when built
  path: '/debt-consolidation',
  stage: 'stage1',
}
```

### Updated Stage 1 Module Count: 5 modules
| # | Module | Status |
|---|--------|--------|
| 1 | Scenario Creator™ | ✅ LIVE |
| 2 | **Debt Consolidation Intelligence™** | 🔨 NEW |
| 3 | Bank Statement Intelligence™ | ⏳ Planned |
| 4 | Income Analysis™ | ⏳ Planned |
| 5 | Asset Documentation™ | ⏳ Planned |

### Updated Total: 19 Modules

---

## 21. Build Order & Dependencies

### Prerequisites (must exist before building)
```
✅ Scenario Creator™ — provides loan_program, loan_amount, borrower data
✅ App.jsx routing — add route: /debt-consolidation
✅ Firebase config — src/firebase/config.js
```

### Build Steps
```
1. Update Dashboard.jsx
   - Add Debt Consolidation Intelligence™ to Stage 1
   - Update total count to 19

2. Update Scenario Creator
   - Confirm loan_type field exists (FHA/VA/CONV/etc.)
   - Add conventional_investor field (Fannie/Freddie)
     Shows ONLY when loan_type = CONVENTIONAL

3. Create DebtConsolidation.jsx
   - Scenario selector with auto-load
   - Tradeline entry table
   - Student loan payment computation
   - Duplicate detection engine
   - Conservative lock enforcement
   - One-click resolve UI
   - DTI impact preview
   - Save to Firestore

4. Add route to App.jsx
   import DebtConsolidation from './pages/DebtConsolidation'
   <Route path="/debt-consolidation" element={<DebtConsolidation />} />

5. Test
   - All 7 student loan payment methods
   - Conservative lock (SUMMARY vs CHILD)
   - One-click resolve (all 3 buttons)
   - Save to Firestore
   - Export buttons

6. Update Master Tracker
   - Status: Live
   - Version: v1.0
```

---

## 22. Future Enhancements (Post-MVP)

```
v1.1:
  - Credit report XML/JSON import (auto-populate tradelines)
  - Soft pull integration for real-time liability data

v1.2:
  - Payoff optimization engine
    (which debts to pay off to achieve target DTI)
  - Cash-out scenario comparison
    (how much cash-out needed to eliminate specific debts)
  - Break-even: cash-out refi vs keeping debt

v2.0:
  - Portfolio analysis: identify clients who qualify for debt consolidation
  - Outreach automation: contact clients when rates drop enough
  - Integration with Lender Match™ for cash-out lender matching

Yellow Highlight Feature (per George's earlier request):
  - When citing guideline source for student loan method,
    highlight exact guideline text in yellow
  - Sources: FHA Handbook 4000.1, VA Lender Handbook Ch. 4,
    Fannie Mae SEL-2022-07, Freddie Mac Bulletin 2021-38
```

---

## Sources & References

| Source | URL |
|--------|-----|
| FHA Handbook 4000.1 — Student Loans | https://www.hud.gov/program_offices/housing/sfh/handbook_4000-1 |
| Fannie Mae SEL-2022-07 | https://singlefamily.fanniemae.com/media/29931/display |
| Freddie Mac Bulletin 2021-38 | https://guide.freddiemac.com/app/guide/bulletin/2021-38 |
| VA Lender Handbook Chapter 4 | https://www.benefits.va.gov/HOMELOANS/documents/docs/va_handbook_26_7.pdf |

---

*LoanBeacons™ — Canonical Sequence™*  
*U.S. Provisional Patent Application No. 63/739,290*  
*© 2026 LoanBeacons LLC. All rights reserved.*
