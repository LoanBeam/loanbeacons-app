# Module 6B — Integration Guide
# Last Resort Path: Hard Money / Private Money / Bridge
# LoanBeacons Platform

---

## Files Delivered

| File | Purpose |
|------|---------|
| `hardMoneyLenderMatrix.js` | 5 hard money lender profiles with ARV-based qualification data |
| `LenderMatchEngine_hardMoney.js` | Engine functions: routing triggers, eligibility check, scoring |
| `HardMoneyLenderCard.jsx` | Card component with ARV panel, comp display, niches, expanded details |
| `LastResortSection.jsx` | Third section component for LenderMatch.jsx |
| `LenderIntakeForm.jsx` | Shareable lender intake form — all 3 categories (Conventional, Non-QM, Hard Money) |

---

## Step 1 — Copy Files Into Project

```
src/
  components/
    HardMoneyLenderCard.jsx     ← copy here
    LastResortSection.jsx       ← copy here
    LenderIntakeForm.jsx        ← copy here
  data/
    hardMoneyLenderMatrix.js    ← copy here
  utils/
    LenderMatchEngine_hardMoney.js  ← copy here (or merge into existing LenderMatchEngine.js)
```

---

## Step 2 — Add Route for Lender Intake Form

In your router file (App.jsx or router config):

```jsx
import LenderIntakeForm from "./components/LenderIntakeForm";

// Add this route:
<Route path="/lender-intake" element={<LenderIntakeForm />} />
<Route path="/lender-intake/:token" element={<LenderIntakeForm />} />
```

This makes the form accessible at:
- `yourapp.com/lender-intake` (open intake)
- `yourapp.com/lender-intake/abc123` (token-prefilled, for lenders you invite)

---

## Step 3 — Add Firestore Collection

The intake form writes to `lenderIntakeSubmissions`. No Firestore rules changes needed if your existing rules allow authenticated writes to new collections. If not, add:

```javascript
// firestore.rules
match /lenderIntakeSubmissions/{docId} {
  allow create: if true;  // public form submission
  allow read, update, delete: if request.auth != null && request.auth.token.admin == true;
}
```

---

## Step 4 — Add LastResortSection to LenderMatch.jsx

In your existing `LenderMatch.jsx`, after the Alternative Path (Non-QM) section closes:

```jsx
import LastResortSection from "./LastResortSection";

// Inside your component, after Non-QM results section:
<LastResortSection
  scenario={scenario}
  agencyResultCount={agencyResults?.length || 0}
  nonQMResultCount={nonQMResults?.length || 0}
/>
```

The component handles its own visibility logic:
- If neither Agency nor Non-QM routing triggers fire, it doesn't render
- If it renders but Agency + Non-QM have results, it shows as tertiary (collapsed by default)
- If Agency + Non-QM both return 0 results, it auto-promotes to hero section (expanded by default)

---

## Step 5 — Add Scenario Fields for Hard Money

Add these fields to your ScenarioCreator (or wherever scenario data is collected). They feed the eligibility engine:

```javascript
// New fields to add to scenario object:
arv                   // After Repair Value — the primary qualification lever
rehabBudget           // Rehab budget amount
desiredTermMonths     // Preferred loan term (6, 12, 18, 24)
exitStrategy          // refinance | sale | construction_perm
borrowerExperience    // none | some | seasoned
daysToClose           // Urgency signal
entityType            // LLC | individual | trust | etc
propertyCondition     // standard | distressed | uninhabitable
constructionType      // standard | ground_up
highLeverageDeal      // boolean — 90%+ of purchase requested
repeatBorrower        // boolean
```

These are additive — they don't affect existing scenario fields.

---

## Step 6 — Canonical Sequence Action Bar

Add "Last Resort Path" to the Canonical Sequence Action Bar as the tertiary step under Lender Match, so LOs know it exists without needing to scroll:

```jsx
// In your CanonicalSequenceActionBar component:
{ label: "Lender Match", steps: ["Agency Path", "Alternative Path", "Last Resort Path"] }
```

---

## Step 7 — Add Lender Intake Link to Admin / Settings

Add a "Lender Profiles" section in your admin area or settings with:
- Link to copy/share: `yourapp.com/lender-intake`
- List of pending intake submissions from Firestore
- Approve/reject workflow (simple status field update)

```javascript
// Query for pending submissions:
const q = query(
  collection(db, "lenderIntakeSubmissions"),
  where("status", "==", "pending_review"),
  orderBy("submittedAt", "desc")
);
```

---

## Step 8 — Stale Broker Status Alerts

The `HardMoneyLenderCard` already flags stale data (>90 days since confirmed) with a yellow badge. To add admin alerts, run a scheduled function or manual query:

```javascript
// Flag lenders whose acceptingNewBrokersConfirmedDate is > 90 days old
const staleLenders = hardMoneyLenders.filter(lender => {
  if (!lender.acceptingNewBrokersConfirmedDate) return true;
  const confirmed = new Date(lender.acceptingNewBrokersConfirmedDate);
  const daysSince = (Date.now() - confirmed.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 90;
});
```

---

## New Form Fields — ScenarioCreator Integration Notes

When adding ARV and rehab fields to ScenarioCreator, follow the existing address autocomplete pattern:

- **ARV** — currency input, show only when loanPurpose = fix_and_flip, fix_to_rent, or ground_up
- **Rehab Budget** — currency input, same visibility condition as ARV
- **Exit Strategy** — select, show for investment/commercial scenarios
- **Desired Term** — select (6mo, 12mo, 18mo, 24mo), show when hard money triggers are possible
- **Days to Close** — number input, already may exist — connect to hard money routing

---

## Decision Record Entries (Module auto-log)

Per your Decision Record architecture (Option B), the hard money evaluation should write:

```javascript
// Auto-log entry when Last Resort Path evaluates:
{
  module: "LenderMatch_LastResortPath",
  timestamp: serverTimestamp(),
  scenarioId: scenario.id,
  triggered: evaluation.triggered,
  heroMode: evaluation.heroMode,
  triggerReasons: evaluation.triggerReasons,
  eligibleLenderCount: evaluation.eligibleCount,
  topMatch: evaluation.results[0]?.lender.name || null,
}
```

---

## What Each File Does — Summary

**hardMoneyLenderMatrix.js**
- 5 lender profiles: Apex Bridge Capital, Ironclad Private Lending, Velocity Bridge Funding, Meridian Private Capital, NationalBridge Direct
- Each profile includes: qualification criteria, comp structure, niches, deal preferences, operations data, stale-detection timestamp
- Drop-in replaceable with Firestore-sourced profiles once intake submissions are approved

**LenderMatchEngine_hardMoney.js**
- `checkHardMoneyRoutingTriggers()` — evaluates scenario for 9 hard money routing triggers
- `checkHardMoneyEligibility()` — per-lender eligibility check (ARV LTV, loan amount, state, borrower exp, etc.)
- `scoreHardMoneyLender()` — scores eligible lenders 0–100 on speed, leverage, niche alignment, comp, operations
- `evaluateHardMoneyPath()` — main export, returns full ranked results + hero mode status

**HardMoneyLenderCard.jsx**
- 4-column metrics row: Max LTV (ARV), Max LTV (purchase), loan range, terms
- 3-column comp row: Lender points, max broker points, YSP
- Rehab row: budget capacity, draws, draw turnaround, extension fee
- Niche pills, match details, warning flags
- Expandable full details: exit strategies, full comp breakdown, operations, insurance, niche details
- Stale broker status badge (>90 days)
- Fast close chip, POF letter chip, scenario desk chip, 3rd party processing chip

**LastResortSection.jsx**
- Auto-shows when routing triggers fire OR when Agency + Non-QM return 0 results
- Hero mode (primary recommendation) vs. tertiary mode with different visual treatment
- Routing trigger explanation panel
- Empty state with guidance
- Compliance disclaimer footer

**LenderIntakeForm.jsx**
- Three lender type paths: Conventional/Agency, Non-QM, Hard Money
- Multi-step form with progress indicator
- All universal fields: basic info, operations, AE details, escalation, 3rd party processing, scenario desk, underwriting, affiliated businesses
- Conventional-specific: FICO by loan type, LTV by occupancy, overlays, 10 niches with detail fields, comp
- Non-QM-specific: 8 products with detail fields, 10 niches, YSP tiers, comp
- Hard money-specific: ARV/LTV qual, terms, rehab params, insurance, 10 niches with detail fields, full comp (lender points, broker points, YSP, fee cap, prepay), deal preferences
- State selector (all 50 states, visual grid)
- Firestore write on submit
- Stale broker status handled at display layer (no form field needed — timestamp auto-set on submit)
