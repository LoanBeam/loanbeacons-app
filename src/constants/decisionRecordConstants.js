// ============================================================
//  src/constants/decisionRecordConstants.js
//  LoanBeacons — Decision Record Module 27
//  Central registry for all enums, flag codes, and module keys.
//  All modules reference this file — do not rename existing keys.
//
//  Canonical Sequence™ (M01–M28) — official order as of April 2026
//  CRA_INTEL is background infrastructure, intentionally excluded
//  from the canonical sequence UI but retained here for data integrity.
// ============================================================

// ─────────────────────────────────────────────────────────────
// MODULE REGISTRY
// Every module that exists (live or future) is registered here.
// The completeness engine uses this list to score each record.
// ─────────────────────────────────────────────────────────────
export const MODULE_KEYS = {
  // ── Stage 1: Pre-Structure (M01–M07) ──────────────────────
  SCENARIO_CREATOR:        'SCENARIO_CREATOR',        // M01
  QUALIFYING_INTEL:        'QUALIFYING_INTEL',         // M02
  INCOME_ANALYZER:         'INCOME_ANALYZER',          // M03
  ASSET_ANALYZER:          'ASSET_ANALYZER',           // M04
  CREDIT_INTEL:            'CREDIT_INTEL',             // M05
  DEBT_CONSOLIDATION:      'DEBT_CONSOLIDATION',       // M06
  BANK_STATEMENT_INTEL:    'BANK_STATEMENT_INTEL',     // M07

  // ── Stage 2: Lender Fit (M08–M17) ─────────────────────────
  LENDER_MATCH:            'LENDER_MATCH',             // M08
  DPA_INTEL:               'DPA_INTEL',                // M09
  AUS_RESCUE:              'AUS_RESCUE',               // M10
  FHA_STREAMLINE:          'FHA_STREAMLINE',           // M11
  VA_IRRRL:                'VA_IRRRL',                 // M12
  USDA_INTEL:              'USDA_INTEL',               // M13
  CONVENTIONAL_REFI:       'CONVENTIONAL_REFI',        // M14 (coming soon)
  RATE_BUYDOWN:            'RATE_BUYDOWN',             // M15
  MI_OPTIMIZER:            'MI_OPTIMIZER',             // M16
  ARM_STRUCTURE:           'ARM_STRUCTURE',            // M17

  // ── Stage 3: Optimization (M18–M26) ───────────────────────
  REHAB_INTEL:             'REHAB_INTEL',              // M18
  RATE_INTEL:              'RATE_INTEL',               // M19
  CLOSING_COST_CALC:       'CLOSING_COST_CALC',        // M20
  PROPERTY_INTEL:          'PROPERTY_INTEL',           // M21
  PIGGYBACK_OPTIMIZER:     'PIGGYBACK_OPTIMIZER',      // M22
  TITLE_INTEL:             'TITLE_INTEL',              // M23
  DISCLOSURE_INTEL:        'DISCLOSURE_INTEL',         // M24
  COMPLIANCE_INTEL:        'COMPLIANCE_INTEL',         // M25
  FLOOD_INTEL:             'FLOOD_INTEL',              // M26

  // ── Stage 4: Verify & Submit (M27–M28) ────────────────────
  DECISION_RECORD:         'DECISION_RECORD',          // M27
  INTELLIGENT_CHECKLIST:   'INTELLIGENT_CHECKLIST',    // M28

  // ── Background Infrastructure (no UI, no canonical dot) ───
  CRA_INTEL:               'CRA_INTEL',                // Shared service — enriches all address data

  // ── System / Platform ──────────────────────────────────────
  AE_SHARE_SERVICE:        'AE_SHARE_SERVICE',
  SUBMISSION_PACKAGE:      'SUBMISSION_PACKAGE',
  LENDER_PROFILE_BUILDER:  'LENDER_PROFILE_BUILDER',
};

// Flat array used by the completeness engine
export const ALL_MODULE_KEYS = Object.values(MODULE_KEYS);

// All currently live canonical modules — drives completeness scoring.
// Keys MUST match exactly what each module passes to reportFindings().
// CONVENTIONAL_REFI excluded (not yet built).
// CRA_INTEL excluded (background service, not user-facing).
export const LIVE_MODULE_KEYS = [
  MODULE_KEYS.SCENARIO_CREATOR,
  MODULE_KEYS.QUALIFYING_INTEL,
  MODULE_KEYS.INCOME_ANALYZER,
  MODULE_KEYS.ASSET_ANALYZER,
  MODULE_KEYS.CREDIT_INTEL,
  MODULE_KEYS.DEBT_CONSOLIDATION,
  MODULE_KEYS.BANK_STATEMENT_INTEL,
  MODULE_KEYS.LENDER_MATCH,
  MODULE_KEYS.DPA_INTEL,
  MODULE_KEYS.AUS_RESCUE,
  MODULE_KEYS.FHA_STREAMLINE,
  MODULE_KEYS.VA_IRRRL,
  MODULE_KEYS.USDA_INTEL,
  MODULE_KEYS.RATE_BUYDOWN,
  MODULE_KEYS.MI_OPTIMIZER,
  MODULE_KEYS.ARM_STRUCTURE,
  MODULE_KEYS.REHAB_INTEL,
  MODULE_KEYS.RATE_INTEL,
  MODULE_KEYS.CLOSING_COST_CALC,
  MODULE_KEYS.PROPERTY_INTEL,
  MODULE_KEYS.PIGGYBACK_OPTIMIZER,
  MODULE_KEYS.TITLE_INTEL,
  MODULE_KEYS.DISCLOSURE_INTEL,
  MODULE_KEYS.COMPLIANCE_INTEL,
  MODULE_KEYS.FLOOD_INTEL,
  MODULE_KEYS.DECISION_RECORD,
  MODULE_KEYS.INTELLIGENT_CHECKLIST,
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
