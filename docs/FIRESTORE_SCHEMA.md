# LoanBeacons — Lender Match™ Firestore Schema
**Version:** 1.0.0 | **Step 12** | February 18, 2026

---

## Overview

Lender Match™ uses three Firestore collections.
All are in the default database (`(default)`).

```
Firestore
├── lenderOverrides/       ← Agency lender guideline updates
├── nonQMOverrides/        ← Non-QM real lender data (replaces placeholders)
└── decisionRecords/       ← Sealed Decision Record™ snapshots
```

---

## Collection 1: `lenderOverrides`

Stores partial or full overrides for Agency lender guidelines.
On engine run, these are merged over the static `agencyLenderMatrix.js` records.
A lender manager can update any guideline field without touching source code.

### Document ID
Use the lender's canonical `id` from `agencyLenderMatrix.js` as the document ID.
Example: `agency_001` for UWM.

### Required Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Must match the lender ID in agencyLenderMatrix.js |
| `active` | `boolean` | Set `false` to exclude this override from the engine |
| `guidelineVersionRef` | `string` | Version string, e.g. `"UWM-AGENCY-2026-Q2"` |
| `effectiveDate` | `string (ISO)` | Date these guidelines took effect |
| `updatedBy` | `string` | Who made this update (LO name, "admin", etc.) |
| `notes` | `string?` | Optional admin notes about this override |

### Overrideable Fields (partial updates allowed)

Any field from the Agency lender record can be overridden.
Only include the fields that changed — the engine merges via spread:
```js
{ ...staticLender, ...firestoreOverride }
```

Common fields to override:

| Field | Type | Example |
|---|---|---|
| `priorityWeight` | `number` | `88` |
| `guidelines.Conventional.minFICO` | `number` | `600` |
| `guidelines.Conventional.maxDTI` | `number` | `50` |
| `guidelines.Conventional.maxLTV.purchase` | `number` | `97` |
| `guidelines.FHA.bkSeasoning` | `number` | `24` |
| `guidelines.VA.minFICO` | `number` | `550` |
| `strengths` | `string[]` | `["VA specialist"]` |
| `tierNotes` | `string` | `"Updated Q2 2026"` |

### Example Document

```json
{
  "id": "agency_001",
  "active": true,
  "guidelineVersionRef": "UWM-AGENCY-2026-Q2",
  "effectiveDate": "2026-04-01",
  "updatedBy": "admin",
  "notes": "UWM raised VA FICO floor to 560 effective April 2026",
  "guidelines": {
    "VA": {
      "minFICO": 560
    }
  }
}
```

### Firestore Rules (suggested)

```
match /lenderOverrides/{docId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
               && request.auth.token.role == "admin";
}
```

---

## Collection 2: `nonQMOverrides`

Stores real verified Non-QM lender data that supersedes placeholder profiles.
When a real lender document exists with `dataSource: "REAL"` and `version >= 1`,
the engine uses it instead of the placeholder — borrowers see verified data,
the amber banner disappears, and the score cap rises from 90 to 100.

### Document ID

Assign a permanent canonical ID for each real Non-QM lender.
Convention: `nonqm_real_{lenderSlug}` — example: `nonqm_real_deephaven`.
Do NOT reuse placeholder IDs (`nonqm_placeholder_001`, etc.).

### Required Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Canonical ID for this lender — unique, permanent |
| `dataSource` | `string` | MUST be `"REAL"` for verified lenders |
| `version` | `number` | MUST be `>= 1` for real lenders. `0` = placeholder partial update |
| `active` | `boolean` | Set `false` to exclude from engine |
| `programs` | `string[]` | e.g. `["BankStatement12", "BankStatement24"]` |
| `profileName` | `string` | Display name shown to LO |
| `shortName` | `string` | Abbreviated name for badges |
| `tierBasis` | `string` | `"Aggressive"`, `"Market"`, or `"Conservative"` |
| `priorityWeight` | `number` | 0–100, influences ranking |
| `guidelineVersionRef` | `string` | e.g. `"DEEPHAVEN-NONQM-2026-Q1"` |
| `effectiveDate` | `string (ISO)` | When these guidelines took effect |
| `accentColor` | `string` | Brand hex color, e.g. `"#1e40af"` |
| `disclaimer` | `string` | Required disclosure text |
| `guidelines` | `object` | Program guideline blocks (see below) |

### Guideline Block Structure (per program)

Each program listed in `programs[]` must have a corresponding block in `guidelines`:

**Bank Statement 12/24 block:**
```json
{
  "minFICO": 620,
  "maxLoanAmount": 3000000,
  "maxLTV": {
    "primary":    { "purchase": 85, "rateTerm": 80, "cashOut": 75 },
    "secondHome": { "purchase": 80, "rateTerm": 75, "cashOut": 70 },
    "investment": { "purchase": 75, "rateTerm": 70, "cashOut": 65 }
  },
  "maxDTI": 50,
  "bkSeasoning": 24,
  "fcSeasoning": 36,
  "shortSaleSeasoning": 36,
  "minReserveMonths": 3,
  "cashOutMax": 500000,
  "allowedPropertyTypes": ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
  "allowsShortTermRental": false
}
```

**DSCR block:**
```json
{
  "minFICO": 640,
  "maxLoanAmount": 2000000,
  "minDSCR": 1.0,
  "maxLTV": {
    "investment": { "purchase": 80, "rateTerm": 75, "cashOut": 70 }
  },
  "bkSeasoning": 24,
  "fcSeasoning": 36,
  "minReserveMonths": 6,
  "allowedPropertyTypes": ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
  "allowsShortTermRental": true
}
```

**Asset Depletion block:**
```json
{
  "minFICO": 680,
  "maxLoanAmount": 3000000,
  "minAssets": 750000,
  "depletionMonths": 60,
  "maxLTV": {
    "primary":    { "purchase": 80, "rateTerm": 75, "cashOut": 70 },
    "investment": { "purchase": 70, "rateTerm": 65, "cashOut": 60 }
  },
  "bkSeasoning": 36,
  "fcSeasoning": 48,
  "minReserveMonths": 12,
  "allowedPropertyTypes": ["SFR", "Condo"]
}
```

### Example Full Real Lender Document

```json
{
  "id": "nonqm_real_deephaven",
  "dataSource": "REAL",
  "version": 1,
  "active": true,
  "programs": ["BankStatement12", "BankStatement24", "DSCR"],
  "profileName": "Deephaven Mortgage",
  "shortName": "Deephaven",
  "tierBasis": "Aggressive",
  "priorityWeight": 82,
  "guidelineVersionRef": "DEEPHAVEN-NONQM-2026-Q1",
  "effectiveDate": "2026-01-15",
  "accentColor": "#0f4c81",
  "tierNotes": "Leading Non-QM lender. Strong bank statement and DSCR programs.",
  "typicalUseCase": "Self-employed borrowers with strong deposits but low taxable income. DSCR investors seeking no-income-doc path.",
  "strengths": [
    "Industry-leading bank statement qualification",
    "Competitive DSCR minimums",
    "Fast closings — 15-20 day average"
  ],
  "weaknesses": [
    "No Asset Depletion program",
    "Investment DSCR capped at 80% LTV purchase"
  ],
  "disclaimer": "Guidelines verified as of Q1 2026. Confirm current guidelines with Deephaven AE before quoting.",
  "states": ["ALL"],
  "guidelines": {
    "BankStatement12": {
      "minFICO": 620,
      "maxLoanAmount": 3000000,
      "maxLTV": {
        "primary":    { "purchase": 85, "rateTerm": 80, "cashOut": 75 },
        "secondHome": { "purchase": 80, "rateTerm": 75, "cashOut": 70 },
        "investment": { "purchase": 75, "rateTerm": 70, "cashOut": 65 }
      },
      "maxDTI": 50,
      "bkSeasoning": 24,
      "fcSeasoning": 36,
      "shortSaleSeasoning": 36,
      "minReserveMonths": 3,
      "cashOutMax": 500000,
      "allowedPropertyTypes": ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
      "allowsShortTermRental": false
    },
    "BankStatement24": {
      "minFICO": 620,
      "maxLoanAmount": 3000000,
      "maxLTV": {
        "primary":    { "purchase": 90, "rateTerm": 85, "cashOut": 80 },
        "secondHome": { "purchase": 85, "rateTerm": 80, "cashOut": 75 },
        "investment": { "purchase": 80, "rateTerm": 75, "cashOut": 70 }
      },
      "maxDTI": 55,
      "bkSeasoning": 24,
      "fcSeasoning": 36,
      "shortSaleSeasoning": 36,
      "minReserveMonths": 3,
      "cashOutMax": 500000,
      "allowedPropertyTypes": ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
      "allowsShortTermRental": false
    },
    "DSCR": {
      "minFICO": 640,
      "maxLoanAmount": 2000000,
      "minDSCR": 1.0,
      "maxLTV": {
        "investment": { "purchase": 80, "rateTerm": 75, "cashOut": 70 }
      },
      "bkSeasoning": 24,
      "fcSeasoning": 36,
      "minReserveMonths": 6,
      "allowedPropertyTypes": ["SFR", "Condo", "TwoUnit", "ThreeUnit", "FourUnit"],
      "allowsShortTermRental": true
    }
  }
}
```

### Placeholder Partial Update (version: 0)

To update a single field on a placeholder without replacing it with a real lender,
use `version: 0` and `dataSource: "PLACEHOLDER"`. The engine merges these over
the static placeholder but keeps all governance restrictions (90-pt cap, amber banner, etc.).

```json
{
  "id": "nonqm_placeholder_003",
  "dataSource": "PLACEHOLDER",
  "version": 0,
  "active": true,
  "guidelineVersionRef": "PLACEHOLDER-DSCR-AGGRESSIVE-v0.1",
  "effectiveDate": "2026-02-18",
  "guidelines": {
    "DSCR": {
      "minDSCR": 0.95
    }
  }
}
```

### Firestore Rules (suggested)

```
match /nonQMOverrides/{docId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
               && request.auth.token.role == "admin";
}
```

---

## Collection 3: `decisionRecords`

Append-only audit log. One document per lender selection event.
Written by `decisionRecordService.saveDecisionRecord()`.
Never updated after creation except for the `voided` soft-delete flag.

### Document ID

Auto-generated by Firestore (`addDoc`). Do not set manually.

### All Fields

| Field | Type | Source | Description |
|---|---|---|---|
| `recordType` | `string` | Engine | Always `"LENDER_MATCH_SELECTION"` |
| `schemaVersion` | `number` | Service | Always `1` in v1.0 |
| `selectedLenderId` | `string` | Engine | Lender `id` field |
| `selectedProgramId` | `string` | Engine | `"{lenderId}_{program}"` |
| `profileName` | `string` | Engine | Display name |
| `dataSource` | `string` | Engine | `"REAL"` or `"PLACEHOLDER"` |
| `rulesetVersion` | `number` | Engine | `0` = placeholder, `>=1` = real |
| `guidelineVersionRef` | `string` | Engine | Guideline version at time of selection |
| `fitScore` | `number` | Engine | Score at time of selection (sealed) |
| `eligibilityStatus` | `string` | Engine | `ELIGIBLE`, `CONDITIONAL`, or `INELIGIBLE` |
| `overlayRisk` | `string` | Engine | `LOW`, `MODERATE`, or `HIGH` |
| `confidenceScore` | `number` | Engine | `0.0–1.0` |
| `tierBasis` | `string` | Engine | `Aggressive`, `Market`, `Conservative` |
| `tier` | `string` | Engine | Display tier label |
| `reasonsSnapshot` | `string[]` | Engine | Pass reasons at selection time |
| `narrativeSnapshot` | `string` | Engine | "Why this lender" text at selection |
| `scenarioSnapshot` | `object` | Engine | Full normalized scenario (sealed) |
| `placeholderDisclaimer` | `string?` | Engine | Present when `dataSource === "PLACEHOLDER"` |
| `selectedAt` | `string (ISO)` | Engine | Client timestamp when LO clicked |
| `savedAt` | `Timestamp` | Service | Firestore server timestamp |
| `savedAtISO` | `string (ISO)` | Service | Client ISO string backup |
| `voided` | `boolean` | Service | `false` by default, `true` if retracted |
| `voidReason` | `string?` | Service | Populated when voided |
| `voidedAt` | `Timestamp?` | Service | Populated when voided |
| `loanId` | `string?` | Caller | Optional loan file grouping ID |
| `userId` | `string?` | Caller | Optional LO identifier |
| `loanNumber` | `string?` | Caller | Optional display loan number |
| `borrowerRef` | `string?` | Caller | Optional borrower ref (not PII) |

### Example Document

```json
{
  "recordType": "LENDER_MATCH_SELECTION",
  "schemaVersion": 1,
  "selectedLenderId": "agency_001",
  "selectedProgramId": "agency_001_Conventional",
  "profileName": "United Wholesale Mortgage",
  "dataSource": "REAL",
  "rulesetVersion": 1,
  "guidelineVersionRef": "UWM-AGENCY-2026-Q1",
  "fitScore": 84,
  "eligibilityStatus": "ELIGIBLE",
  "overlayRisk": "LOW",
  "confidenceScore": 0.92,
  "tierBasis": "A+",
  "tier": "Premier Platform",
  "reasonsSnapshot": [
    "FICO 720 meets UWM minimum (620) — 100pt cushion",
    "LTV 85% within UWM Conventional purchase ceiling (97%)",
    "DTI 38% within UWM limit (50%)"
  ],
  "narrativeSnapshot": "UWM is an excellent match for this Conventional purchase. Your 720 FICO is 100 points above their minimum — strong cushion.",
  "scenarioSnapshot": {
    "loanType": "Conventional",
    "transactionType": "purchase",
    "loanAmount": 485000,
    "propertyValue": 570000,
    "creditScore": 720,
    "ltv": 85.09,
    "dti": 38,
    "propertyType": "SFR",
    "occupancy": "Primary",
    "state": "TX",
    "incomeDocType": "fullDoc",
    "selfEmployed": false,
    "creditEvent": "none",
    "creditEventMonths": 0
  },
  "selectedAt": "2026-02-18T14:32:11.000Z",
  "savedAt": "Timestamp",
  "savedAtISO": "2026-02-18T14:32:12.341Z",
  "voided": false,
  "voidReason": null,
  "loanId": "loan_abc123",
  "userId": "lo_george",
  "loanNumber": "2026-0042"
}
```

### Suggested Indexes

Create these composite indexes in the Firebase Console or via `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "decisionRecords",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "loanId",     "order": "ASCENDING" },
        { "fieldPath": "voided",     "order": "ASCENDING" },
        { "fieldPath": "selectedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "decisionRecords",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId",     "order": "ASCENDING" },
        { "fieldPath": "selectedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "lenderOverrides",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "nonQMOverrides",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Firestore Rules (suggested)

```
match /decisionRecords/{docId} {
  // LOs can read their own records
  allow read: if request.auth != null
              && (resource.data.userId == request.auth.uid
                  || request.auth.token.role == "admin");

  // Any authenticated user can create
  allow create: if request.auth != null
                && request.resource.data.voided == false
                && request.resource.data.schemaVersion == 1;

  // Only admins can update (void)
  allow update: if request.auth != null
                && request.auth.token.role == "admin"
                && request.resource.data.keys().hasOnly([
                     "voided", "voidReason", "voidedAt", "voidedAtISO"
                   ]);

  // No deletes — append-only
  allow delete: if false;
}
```

---

## Banned Fields (AC2 Compliance)

The following fields must **never** appear in any Firestore document
that feeds into the Lender Match engine:

```
rate, apr, price, spread, points, interestRate,
margin, cap, estimatedRate, rateRange, rateSpread, pricingTier
```

The engine's `validateNonQMLender()` and `checkAgencyEligibility()` functions
will reject any lender record containing these fields.
The schema validator (`nonQMLenderSchema.js`) enforces this at initialization.

---

## Migration Path: Placeholder → Real Lender

When a real Non-QM lender relationship is established:

1. Create a new document in `nonQMOverrides` with:
   - `dataSource: "REAL"`
   - `version: 1`
   - `id`: the lender's new permanent canonical ID (not a placeholder ID)
   - Full guideline blocks for all offered programs
2. The engine's `mergeNonQMWithOverrides()` will detect `dataSource === "REAL"` and `version >= 1`,
   and return this real lender in results for the matched programs
3. The placeholder profile for the same program will still appear for other programs
   or when the real lender does not cover that scenario
4. The amber governance UI (banner, badge, score cap) disappears automatically
   for results backed by the real lender document
5. No code changes required — the override system handles it entirely via Firestore data

---

## Summary

| Collection | Write path | Read path | Immutable? |
|---|---|---|---|
| `lenderOverrides` | Admin / Firestore Console | `useLenderOverrides()` hook | No — updated as guidelines change |
| `nonQMOverrides` | Admin / Firestore Console | `useLenderOverrides()` hook | No — updated as relationships grow |
| `decisionRecords` | `decisionRecordService.saveDecisionRecord()` | `useDecisionRecordLog()` hook | Yes (soft-delete only) |
