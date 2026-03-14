// ============================================================
//  src/constants/decisionRecordConstants.js
//  LoanBeacons — Decision Record Module 21
//  Central registry for all enums, flag codes, and module keys.
//  All 21 modules reference this file — do not rename keys.
// ============================================================

// ─────────────────────────────────────────────────────────────
// MODULE REGISTRY
// Every module that exists (live or future) is registered here.
// The completeness engine uses this list to score each record.
// When you build modules 18–20, add their keys here.
// ─────────────────────────────────────────────────────────────
export const MODULE_KEYS = {
  // ── Stage 1: Pre-Structure & Initial Analysis ──────────────
  SCENARIO_CREATOR:        'SCENARIO_CREATOR',        // Module 1
  QUALIFYING_INTEL:        'QUALIFYING_INTEL',         // Module 2
  INCOME_ANALYZER:         'INCOME_ANALYZER',          // Module 3
  ASSET_ANALYZER:          'ASSET_ANALYZER',           // Module 4
  CREDIT_INTEL:            'CREDIT_INTEL',             // Module 5

  // ── Stage 2: Lender Fit & Program Intelligence ─────────────
  LENDER_MATCH:            'LENDER_MATCH',             // Module 6
  DPA_INTEL:               'DPA_INTEL',                // Module 7
  AUS_RESCUE:              'AUS_RESCUE',               // Module 8
  PROPERTY_INTEL:          'PROPERTY_INTEL',           // Module 9
  TITLE_INTEL:             'TITLE_INTEL',              // Module 10
  CLOSING_COST_CALC:       'CLOSING_COST_CALC',        // Module 11
  CRA_INTEL:               'CRA_INTEL',                // Module 12

  // ── Stage 3: Final Structure Optimization ─────────────────
  RATE_INTEL:              'RATE_INTEL',               // Module 13
  DISCLOSURE_INTEL:        'DISCLOSURE_INTEL',         // Module 14
  COMPLIANCE_INTEL:        'COMPLIANCE_INTEL',         // Module 15
  FLOOD_INTEL:             'FLOOD_INTEL',              // Module 16
  REHAB_INTEL:             'REHAB_INTEL',              // Module 17

  // ── Stage 4: Verification & Submit (future) ───────────────
  AE_SHARE_SERVICE:        'AE_SHARE_SERVICE',         // Module 18
  SUBMISSION_PACKAGE:      'SUBMISSION_PACKAGE',       // Module 19
  DECISION_RECORD:         'DECISION_RECORD',          // Module 20
  LENDER_PROFILE_BUILDER:  'LENDER_PROFILE_BUILDER',   // Module 21
};

// Flat array used by the completeness engine
export const ALL_MODULE_KEYS = Object.values(MODULE_KEYS);

// All 17 currently live modules — drives completeness scoring.
// Keys MUST match exactly what each module passes to reportFindings().
export const LIVE_MODULE_KEYS = [
  MODULE_KEYS.SCENARIO_CREATOR,
  MODULE_KEYS.QUALIFYING_INTEL,
  MODULE_KEYS.INCOME_ANALYZER,
  MODULE_KEYS.ASSET_ANALYZER,
  MODULE_KEYS.CREDIT_INTEL,
  MODULE_KEYS.LENDER_MATCH,
  MODULE_KEYS.DPA_INTEL,
  MODULE_KEYS.AUS_RESCUE,
  MODULE_KEYS.PROPERTY_INTEL,
  MODULE_KEYS.TITLE_INTEL,
  MODULE_KEYS.CLOSING_COST_CALC,
  MODULE_KEYS.CRA_INTEL,
  MODULE_KEYS.RATE_INTEL,
  MODULE_KEYS.DISCLOSURE_INTEL,
  MODULE_KEYS.COMPLIANCE_INTEL,
  MODULE_KEYS.FLOOD_INTEL,
  MODULE_KEYS.REHAB_INTEL,
];

// ─────────────────────────────────────────────────────────────
// RECORD STATUS
// ─────────────────────────────────────────────────────────────
export const RECORD_STATUS = {
  DRAFT:   'draft',    // LO is still working — all writes allowed
  LOCKING: 'locking',  // Cloud Function is computing hash — writes blocked
  LOCKED:  'locked',   // Immutable. Hash is set. Audit-ready.
};

// ─────────────────────────────────────────────────────────────
// RISK FLAG CODES
// Standardized enum pushed by any module into risk_flags[].
// severity: 'info' | 'warning' | 'critical'
// ─────────────────────────────────────────────────────────────
export const RISK_FLAG_CODES = {
  DATA_MISSING:               'data_missing',
  GUIDELINE_CONFLICT:         'guideline_conflict',
  INCOME_INCONSISTENT:        'income_inconsistent',
  PROPERTY_RISK:              'property_risk',
  AUS_REFER_WITH_CAUTION:     'aus_refer_with_caution',
  CRA_ELIGIBILITY_UNVERIFIED: 'cra_eligibility_unverified',
  LENDER_OVERLAY_BREACH:      'lender_overlay_breach',
  NON_QM_FALLBACK:            'non_qm_fallback',
  MANUAL_REVIEW_REQUIRED:     'manual_review_required',
  ATTESTATION_MISSING:        'attestation_missing',
  REHAB_BUDGET_EXCEEDED:      'rehab_budget_exceeded',
  LTV_THRESHOLD_BREACHED:     'ltv_threshold_breached',
  DTI_THRESHOLD_BREACHED:     'dti_threshold_breached',
  PROGRAM_SWITCH_OCCURRED:    'program_switch_occurred',
  COMPLETENESS_LOW:           'completeness_low',        // < 50% modules reported
};

export const FLAG_SEVERITY = {
  INFO:     'INFO',
  WARNING:  'WARNING',
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  LOW:      'LOW',
};

// ─────────────────────────────────────────────────────────────
// FINAL DISPOSITION OPTIONS
// Drives the LO's closing selection in the Decision Record UI.
// ─────────────────────────────────────────────────────────────
export const DISPOSITION_OPTIONS = [
  'Proceed — Program Confirmed',
  'Restructure — Adjustments Needed',
  'Decline — Does Not Qualify',
  'Refer to Underwriter',
  'Refer to Non-QM Channel',
  'Refer to Hard Money / Private Lender',
];

// ─────────────────────────────────────────────────────────────
// CHANGE REASON OPTIONS (required when versioning a locked record)
// ─────────────────────────────────────────────────────────────
export const CHANGE_REASONS = [
  'Borrower information corrected',
  'Program switch',
  'Lender change',
  'AUS re-run with updated findings',
  'Underwriter feedback incorporated',
  'Property valuation updated',
  'Income documentation revised',
  'Other — explanation required',
];

// ─────────────────────────────────────────────────────────────
// EVIDENCE TYPES
// Used in evidence[] locker attached to each record.
// ─────────────────────────────────────────────────────────────
export const EVIDENCE_TYPES = {
  AUS_FINDING:       'aus_finding',
  CRA_LOOKUP:        'cra_lookup',
  LENDER_GUIDELINE:  'lender_guideline',
  DPA_RULE:          'dpa_rule',
  REHAB_ESTIMATE:    'rehab_estimate',
  DOCUMENT_UPLOAD:   'document_upload',
  RATE_QUOTE:        'rate_quote',
  COMPLIANCE_CHECK:  'compliance_check',
};

// ─────────────────────────────────────────────────────────────
// LO NOTE TAGS
// Optional tags on lo_notes for quick categorization.
// ─────────────────────────────────────────────────────────────
export const LO_NOTE_TAGS = [
  'compensating_factor',
  'layered_risk',
  'exception_requested',
  'borrower_explanation',
  'rate_lock_strategy',
  'seller_concession',
  'gift_funds',
  'co_borrower_note',
];

// ─────────────────────────────────────────────────────────────
// COMPLETENESS THRESHOLDS
// Used to auto-flag records with low module coverage.
// ─────────────────────────────────────────────────────────────
export const COMPLETENESS_THRESHOLDS = {
  LOW:      0.50,   // < 50%  → CRITICAL flag
  MODERATE: 0.75,   // < 75%  → WARNING flag
  GOOD:     0.90,   // ≥ 90%  → clean
};
export const SCORING_VERSION = 'path-score-v1.0';