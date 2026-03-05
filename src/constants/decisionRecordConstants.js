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
  SCENARIO_CREATOR:        'scenario_creator',        // Module 1
  INCOME_ANALYSIS:         'income_analysis',          // Module 2
  ASSET_REVIEW:            'asset_review',             // Module 3
  CREDIT_ANALYSIS:         'credit_analysis',          // Module 4
  PROPERTY_ANALYSIS:       'property_analysis',        // Module 5

  // ── Stage 2: Lender Fit & Program Intelligence ─────────────
  LENDER_MATCH:            'lender_match',             // Module 6
  PROGRAM_ELIGIBILITY:     'program_eligibility',      // Module 7
  AUS_RESCUE:              'aus_rescue',               // Module 8
  NON_QM_PATHWAYS:         'non_qm_pathways',          // Module 9
  DPA_ELIGIBILITY:         'dpa_eligibility',          // Module 10
  LENDER_PROFILE_BUILDER:  'lender_profile_builder',   // Module 11

  // ── Stage 3: Final Structure Optimization ─────────────────
  CRA_INTELLIGENCE:        'cra_intelligence',         // Module 12
  RATE_SCENARIO:           'rate_scenario',            // Module 13
  CLOSING_COST_ESTIMATOR:  'closing_cost_estimator',   // Module 14
  CASH_TO_CLOSE:           'cash_to_close',            // Module 15
  REHAB_INTELLIGENCE:      'rehab_intelligence',       // Module 16 → 17

  // ── Stage 4: Verification & Submit ────────────────────────
  DOCUMENT_CHECKLIST:      'document_checklist',       // Module 17 / future
  COMPLIANCE_REVIEW:       'compliance_review',        // Module 18
  AE_SHARE_SERVICE:        'ae_share_service',         // Module 19
  SUBMISSION_PACKAGE:      'submission_package',       // Module 20
  DECISION_RECORD:         'decision_record',          // Module 21 ← THIS MODULE
};

// Flat array used by the completeness engine
export const ALL_MODULE_KEYS = Object.values(MODULE_KEYS);

// Modules that are currently live (17 of 21).
// Update this list as new modules ship — drives completeness scoring.
export const LIVE_MODULE_KEYS = [
  MODULE_KEYS.SCENARIO_CREATOR,
  MODULE_KEYS.LENDER_MATCH,
  MODULE_KEYS.AUS_RESCUE,
  MODULE_KEYS.NON_QM_PATHWAYS,
  MODULE_KEYS.CRA_INTELLIGENCE,
  MODULE_KEYS.REHAB_INTELLIGENCE,
  MODULE_KEYS.LENDER_PROFILE_BUILDER,
  MODULE_KEYS.AE_SHARE_SERVICE,
  MODULE_KEYS.DECISION_RECORD,
  // Add additional live module keys here as they ship
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
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
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
