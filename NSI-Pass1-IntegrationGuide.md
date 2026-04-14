# Next Step Intelligence™ — Pass 1 Integration Guide
**LoanBeacons LLC | Patent Pending: U.S. Application No. 63/739,290**

---

## 1. Files Delivered

| File | Location in project |
|---|---|
| `useNextStepIntelligence.js` | `src/hooks/useNextStepIntelligence.js` |
| `NextStepCard.jsx` | `src/components/NextStepCard.jsx` |

---

## 2. Decision Record Schema Extension

Add these two fields to the existing Decision Record entry shape.
**No existing fields are changed. This is additive only.**

```javascript
// In useDecisionRecord.js — extend the entry shape:
{
  // ── existing fields (unchanged) ──
  moduleKey:     string,
  findings:      object,
  flagSeverity:  string,
  reportedAt:    timestamp,
  // ...

  // ── NEW: Next Step Intelligence™ fields ──
  nextStepSuggested: {
    moduleKey:   string,          // suggested destination module key
    moduleLabel: string,          // human-readable label
    reason:      string,          // plain-English rationale
    urgency:     "HIGH" | "MEDIUM" | "LOW",
    loanPurpose: string,          // "purchase" | "rate_term_refi" | "cash_out_refi"
    generatedAt: ISO timestamp,
  },
  nextStepAction: {
    action:          "followed" | "overridden" | "pending",
    followedModule:  string | null,   // only set when action === "followed"
    overrideNote:    string | null,
    actionTimestamp: ISO timestamp | null,
  },
}
```

### Where to write these fields

In `useDecisionRecord.js`, extend `reportFindings()` or add a new `writeNextStepEvent(payload)` method:

```javascript
// Option A — extend reportFindings() return value
// The hook already returns writtenId. After calling reportFindings(),
// the caller passes onWriteToDecisionRecord to useNextStepIntelligence.

// Option B — add a dedicated writer (recommended for clean separation):
const writeNextStepEvent = useCallback(({ type, moduleKey, payload }) => {
  // type: "nextStepSuggested" | "nextStepAction"
  setEntries(prev => prev.map(entry => {
    if (entry.moduleKey !== moduleKey) return entry;
    return {
      ...entry,
      [type === 'nextStepSuggested' ? 'nextStepSuggested' : 'nextStepAction']: payload,
    };
  }));
  // Also persist to Firestore if Decision Record entries are synced
}, []);
```

---

## 3. Wiring Into a Module (Pattern)

```jsx
// Example: QualifyingIntel.jsx

import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';
import { useDecisionRecord } from '../hooks/useDecisionRecord';

function QualifyingIntel() {
  const { scenarioId, scenarioData } = useScenario();
  const { findings, completedModules, writeNextStepEvent, reportFindings } = useDecisionRecord();

  // reportFindings controls whether NextStepCard renders
  const [findingsReported, setFindingsReported] = useState(false);

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'QUALIFYING_INTEL',
      loanPurpose:             scenarioData?.loanPurpose,
      decisionRecordFindings:  findings,
      scenarioData,
      completedModules,
      scenarioId,
      onWriteToDecisionRecord: writeNextStepEvent,
    });

  const handleReportFindings = () => {
    reportFindings({ dti: calculatedDTI, selfEmployed: isSelfEmployed, /* ... */ });
    setFindingsReported(true);
  };

  return (
    <div>
      {/* ... module UI ... */}

      {/* Report Findings button */}
      <button onClick={handleReportFindings}>Report Findings</button>

      {/* Next Step Intelligence™ — renders ONLY after reportFindings */}
      {findingsReported && (
        <NextStepCard
          suggestion={primarySuggestion}
          secondarySuggestions={secondarySuggestions}
          onFollow={logFollow}
          onOverride={logOverride}
          loanPurpose={scenarioData?.loanPurpose}
          scenarioId={scenarioId}
        />
      )}

      {/* Decision Record Banner goes here (below NextStepCard) */}
      <DecisionRecordBanner moduleKey="QUALIFYING_INTEL" />
    </div>
  );
}
```

---

## 4. Module Integration Queue (Pass 1 scope = M01–M09)

Wire in this order. After each, confirm:
- ✅ NextStepCard renders after reportFindings()
- ✅ Decision Record entry shows `nextStepSuggested` field
- ✅ Follow navigates to correct module with `?scenarioId=`
- ✅ Override logs note to Decision Record
- ✅ Loan purpose suppression works (e.g. DPA does not appear on refi)

| # | Module | Key |
|---|---|---|
| M01 | Scenario Creator | `SCENARIO_CREATOR` |
| M02 | Qualifying Intelligence | `QUALIFYING_INTEL` |
| M03 | Income Analysis | `INCOME_ANALYSIS` |
| M04 | Credit Intelligence | `CREDIT_INTEL` |
| M05 | Bank Statement Intelligence | `BANK_STATEMENT_INTEL` |
| M06 | Asset Analyzer | `ASSET_ANALYZER` |
| M07 | Lender Match | `LENDER_MATCH` |
| M08 | DPA Intelligence | `DPA_INTELLIGENCE` |
| M09 | AUS Rescue | `AUS_RESCUE` |

M10–M28 integration = Pass 2.

---

## 5. QA Test Scenarios (Pass 1 verification)

### SGT Holloway (Purchase, VA/FHA)
1. Create purchase scenario → confirm NextStepCard on Scenario Creator shows QUALIFYING_INTEL HIGH
2. Run Qualifying Intel with DTI 47% → confirm DEBT_CONSOLIDATION_INTEL HIGH
3. Run Credit Intel with score 595 → confirm AUS_RESCUE HIGH
4. Loan purpose = refi → confirm DPA_INTELLIGENCE is suppressed (never shows)

### Patricia Moore (FHA Streamline)
1. Create rate/term refi scenario → confirm FHA_STREAMLINE surfaces after Lender Match
2. Confirm VA_IRRRL is suppressed on rate/term refi when not VA
3. Confirm DPA_INTELLIGENCE never appears

### Shanna Arscott (AUS Rescue / DTI)
1. Run AUS Rescue with PRIMARY_BLOCKER = DTI → confirm DEBT_CONSOLIDATION_INTEL HIGH
2. Confirm feasibility HIGH path routes to PROPERTY_INTEL LOW
3. Override suggestion → confirm override note logged in Decision Record

---

## 6. Copy Commands (Windows)

After downloading files from the container:

```cmd
copy /Y "useNextStepIntelligence (1).js" "C:\Users\Sherae's Computer\loanbeacons-app\src\hooks\useNextStepIntelligence.js"
copy /Y "NextStepCard (1).jsx" "C:\Users\Sherae's Computer\loanbeacons-app\src\components\NextStepCard.jsx"
```

*(Adjust trailing number if your browser downloaded with a different suffix.)*

---

*LoanBeacons LLC — Confidential and Proprietary*
*NMLS #1175947 | Patent Pending: U.S. Application No. 63/739,290*
