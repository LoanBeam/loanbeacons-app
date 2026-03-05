// ============================================================
//  src/services/decisionRecordService.js
//  LoanBeacons — Decision Record Module 21
//
//  THIS IS THE BACKBONE SERVICE.
//  Every module (past, present, future) reports findings here.
//  Never bypass this service to write directly to Firestore.
//
//  Public API:
//    getOrCreateRecord()       — idempotent, call on scenario load
//    reportModuleFindings()    — universal module hook
//    addRiskFlag()             — push a flag from any module
//    addEvidence()             — attach evidence from any module
//    saveLONotes()             — LO free-text notes
//    attestRecord()            — LO certification before lock
//    initiateRecordLock()      — triggers Cloud Function hash + lock
//    createNewVersion()        — versioning workflow
//    getRecord()               — fetch single record
//    getRecordsByScenario()    — all versions for a scenario
//    getRecordsForManager()    — filtered manager review list
//    addManagerComment()       — manager annotation (non-editing)
//    markManagerReviewed()     — manager mark reviewed
//    toggleManagerFlag()       — flag for follow-up
// ============================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  ALL_MODULE_KEYS,
  LIVE_MODULE_KEYS,
  RECORD_STATUS,
  RISK_FLAG_CODES,
  FLAG_SEVERITY,
  COMPLETENESS_THRESHOLDS,
} from '../constants/decisionRecordConstants';

// Firestore collection name — single source of truth
const DR_COLLECTION = 'decisionRecords';

// ─────────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Generate a new Firestore document ID without writing anything.
 */
function newDocId() {
  return doc(collection(db, DR_COLLECTION)).id;
}

/**
 * Calculate completeness score against the set of live modules.
 * Returns { score: 0.0–1.0, missing: string[] }
 */
function calcCompleteness(systemFindings = {}) {
  const reported = Object.keys(systemFindings);
  const expected = LIVE_MODULE_KEYS;
  const covered  = reported.filter(k => expected.includes(k));
  const missing  = expected.filter(k => !reported.includes(k));
  const score    = expected.length > 0 ? covered.length / expected.length : 0;
  return { score, missing };
}

/**
 * Derive completeness-based risk flags.
 * Returns an array of flag objects (may be empty).
 */
function completenessFlags(score, moduleKey) {
  if (score < COMPLETENESS_THRESHOLDS.LOW) {
    return [{
      flag_code:     RISK_FLAG_CODES.COMPLETENESS_LOW,
      source_module: moduleKey,
      severity:      FLAG_SEVERITY.CRITICAL,
      detail:        `Only ${Math.round(score * 100)}% of live modules have reported.`,
      flagged_at:    Timestamp.now(),
    }];
  }
  return [];
}

/**
 * Build a clean empty record shell.
 * Called by getOrCreateRecord — never call directly.
 */
function buildEmptyRecord({ recordId, scenarioId, userId, scenarioData = {} }) {
  return {
    recordId,
    scenarioId,
    status: RECORD_STATUS.DRAFT,
    record_version: 1,
    supersedes_record_id:    null,
    superseded_by_record_id: null,
    change_reason:           null,

    header: {
      scenarioId,
      borrowerName:      scenarioData.borrowerName      || '',
      borrowerAddress:   scenarioData.borrowerAddress   || '',
      loName:            scenarioData.loName            || '',
      loId:              userId,
      branchId:          scenarioData.branchId          || null,
      loanType:          scenarioData.loanType          || '',
      loanPurpose:       scenarioData.loanPurpose       || '',
      propertyAddress:   scenarioData.propertyAddress   || '',
      moduleVersionTags: {},
      createdAt:         serverTimestamp(),
      updatedAt:         serverTimestamp(),
    },

    // Module findings — one key per module that has reported
    system_findings: {},

    // Evidence locker — array of evidence objects
    evidence: [],

    // Risk flags — array of flag objects from any module
    risk_flags: [],

    // Completeness
    completeness_score:   0,
    missing_modules:      [...LIVE_MODULE_KEYS],

    // LO-authored notes (separate lane from system findings)
    lo_notes: {
      text:        '',
      tags:        [],
      authored_at: null,
    },

    // LO attestation — required before lock
    lo_attestation: {
      certified:     false,
      certified_at:  null,
      certified_by:  null,
    },

    // Manager review layer — additive only, never edits above
    manager_review: {
      reviewed:              false,
      reviewed_by:           null,
      reviewed_at:           null,
      flagged_for_followup:  false,
      comments:              [],
    },

    // Set by Cloud Function on lock — tamper-evident
    record_hash:         null,
    locked_at:           null,
    locked_by_user_id:   null,
    lock_initiated_by:   null,
    lock_initiated_at:   null,
  };
}

// ─────────────────────────────────────────────────────────────
//  CREATE / GET
// ─────────────────────────────────────────────────────────────

/**
 * getOrCreateRecord
 * Idempotent entry point. Call this when a scenario is opened or saved.
 * Returns the existing draft record if one exists, otherwise creates one.
 *
 * @param {string} scenarioId
 * @param {string} userId
 * @param {object} scenarioData  — header data from the scenario document
 * @returns {object} record data
 */
export async function getOrCreateRecord(scenarioId, userId, scenarioData = {}) {
  if (!scenarioId) throw new Error('[DecisionRecord] scenarioId is required');
  if (!userId)     throw new Error('[DecisionRecord] userId is required');

  // Check for an existing draft first
  const existing = await getDraftRecord(scenarioId, userId);
  if (existing) return existing;

  // No draft found — create one
  const recordId = newDocId();
  const record   = buildEmptyRecord({ recordId, scenarioId, userId, scenarioData });

  await setDoc(doc(db, DR_COLLECTION, recordId), record);
  console.log(`[DecisionRecord] Created new record ${recordId} for scenario ${scenarioId}`);
  return record;
}

/**
 * getRecord — fetch a single record by its recordId.
 */
export async function getRecord(recordId) {
  if (!recordId) throw new Error('[DecisionRecord] recordId is required');
  const snap = await getDoc(doc(db, DR_COLLECTION, recordId));
  if (!snap.exists()) throw new Error(`[DecisionRecord] Record ${recordId} not found`);
  return snap.data();
}

/**
 * getDraftRecord — find the active draft for a scenario + user.
 * Returns null if no draft exists.
 * NOTE: Requires Firestore composite index:
 *   Collection: decisionRecords
 *   Fields: scenarioId ASC, header.loId ASC, status ASC, header.createdAt DESC
 */
export async function getDraftRecord(scenarioId, userId) {
  const q = query(
    collection(db, DR_COLLECTION),
    where('scenarioId',    '==', scenarioId),
    where('header.loId',   '==', userId),
    where('status',        '==', RECORD_STATUS.DRAFT),
    orderBy('header.createdAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data();
}

/**
 * getRecordsByScenario — all versions of a record for a given scenario.
 * Returns chronological array (v1 → latest).
 */
export async function getRecordsByScenario(scenarioId) {
  if (!scenarioId) throw new Error('[DecisionRecord] scenarioId is required');
  const q = query(
    collection(db, DR_COLLECTION),
    where('scenarioId', '==', scenarioId),
    orderBy('record_version', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

/**
 * getRecordsForManager — filtered list for the Admin Center manager view.
 * All filters are optional. Returns descending by createdAt.
 *
 * @param {object} filters
 *   filters.loId        — filter by specific LO
 *   filters.branchId    — filter by branch
 *   filters.status      — 'draft' | 'locked'
 *   filters.loanType    — e.g. 'FHA', 'Conventional'
 *   filters.flagged     — true = only follow-up flagged records
 *
 * NOTE: Multi-field queries require composite indexes.
 * Add indexes in Firebase console as needed per filter combination.
 */
export async function getRecordsForManager(filters = {}) {
  const constraints = [];

  if (filters.branchId)  constraints.push(where('header.branchId', '==', filters.branchId));
  if (filters.loId)      constraints.push(where('header.loId',     '==', filters.loId));
  if (filters.status)    constraints.push(where('status',          '==', filters.status));
  if (filters.loanType)  constraints.push(where('header.loanType', '==', filters.loanType));
  if (filters.flagged)   constraints.push(where('manager_review.flagged_for_followup', '==', true));

  constraints.push(orderBy('header.createdAt', 'desc'));

  const q     = query(collection(db, DR_COLLECTION), ...constraints);
  const snap  = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// ─────────────────────────────────────────────────────────────
//  UNIVERSAL MODULE REPORTING HOOK
//  *** This is the function every module calls. ***
// ─────────────────────────────────────────────────────────────

/**
 * reportModuleFindings
 * The single hook all modules (past and future) call to report into
 * the Decision Record. Call this after a module computes its results.
 *
 * Usage example (from AUS Rescue):
 *   await reportModuleFindings(
 *     recordId,
 *     MODULE_KEYS.AUS_RESCUE,
 *     {
 *       strategiesAttempted: [...],
 *       selectedProgram: 'FHA 203k',
 *       ausOutcome: 'Approve/Eligible',
 *       disposition: 'Proceed',
 *     },
 *     [
 *       {
 *         type: EVIDENCE_TYPES.AUS_FINDING,
 *         source_name: 'DU 11.1',
 *         source_id: duCaseNumber,
 *         retrieved_at: Timestamp.now(),
 *         retrieved_by: userId,
 *         version_tag: 'DU-11.1',
 *       }
 *     ],
 *     [
 *       {
 *         flag_code: RISK_FLAG_CODES.AUS_REFER_WITH_CAUTION,
 *         source_module: MODULE_KEYS.AUS_RESCUE,
 *         severity: FLAG_SEVERITY.WARNING,
 *         detail: 'DU returned Refer with Caution on first run',
 *       }
 *     ]
 *   );
 *
 * @param {string} recordId       — the active draft record ID
 * @param {string} moduleKey      — MODULE_KEYS constant
 * @param {object} findings       — module's summary data object (any shape)
 * @param {Array}  evidence       — optional: evidence objects for the locker
 * @param {Array}  flags          — optional: risk flag objects
 * @param {string} moduleVersion  — optional: semver string for audit trail
 */
export async function reportModuleFindings(
  recordId,
  moduleKey,
  findings,
  evidence       = [],
  flags          = [],
  moduleVersion  = '1.0.0'
) {
  // ── Pre-flight validation ──────────────────────────────────
  if (!recordId)  throw new Error('[DecisionRecord] recordId is required');
  if (!moduleKey) throw new Error('[DecisionRecord] moduleKey is required');
  if (!findings || typeof findings !== 'object') {
    throw new Error('[DecisionRecord] findings must be a non-null object');
  }

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) {
    throw new Error(`[DecisionRecord] Record ${recordId} does not exist`);
  }

  const record = snap.data();

  // Guard: never write to a locked or locking record
  if (record.status === RECORD_STATUS.LOCKED || record.status === RECORD_STATUS.LOCKING) {
    console.warn(
      `[DecisionRecord] Module "${moduleKey}" attempted to write to ${record.status} record ${recordId}. Write blocked.`
    );
    return;
  }

  // ── Optimistic completeness calculation ───────────────────
  const projectedFindings = {
    ...(record.system_findings || {}),
    [moduleKey]: { ...findings },
  };
  const { score, missing } = calcCompleteness(projectedFindings);

  // ── Auto-derive completeness flags ────────────────────────
  const autoFlags = completenessFlags(score, moduleKey);

  // ── Build the Firestore update ─────────────────────────────
  const updates = {
    // Store findings under the module's key (dotted path = safe partial update)
    [`system_findings.${moduleKey}`]: {
      ...findings,
      reported_at:     Timestamp.now(),
      module_version:  moduleVersion,
    },
    // Version tag on the header
    [`header.moduleVersionTags.${moduleKey}`]: moduleVersion,
    // Refresh completeness
    completeness_score:  score,
    missing_modules:     missing,
    'header.updatedAt':  serverTimestamp(),
  };

  // Append evidence items if provided
  const allEvidence = evidence.filter(Boolean).map(e => ({
    ...e,
    retrieved_at: e.retrieved_at instanceof Timestamp ? e.retrieved_at : Timestamp.now(),
  }));
  if (allEvidence.length > 0) {
    updates.evidence = arrayUnion(...allEvidence);
  }

  // Append risk flags (module-provided + auto-derived)
  const allFlags = [...flags.filter(Boolean), ...autoFlags].map(f => ({
    ...f,
    flagged_at: f.flagged_at instanceof Timestamp ? f.flagged_at : Timestamp.now(),
  }));
  if (allFlags.length > 0) {
    updates.risk_flags = arrayUnion(...allFlags);
  }

  await updateDoc(recordRef, updates);

  console.log(
    `[DecisionRecord] Module "${moduleKey}" reported to record ${recordId}.`,
    `Completeness: ${Math.round(score * 100)}%`
  );
}

// ─────────────────────────────────────────────────────────────
//  RISK FLAGS (standalone — for modules that flag without findings)
// ─────────────────────────────────────────────────────────────

/**
 * addRiskFlag — push a single risk flag from any module.
 * Use when a flag arises outside of reportModuleFindings.
 */
export async function addRiskFlag(recordId, flagCode, sourceModule, severity, detail = '') {
  if (!recordId)     throw new Error('[DecisionRecord] recordId is required');
  if (!flagCode)     throw new Error('[DecisionRecord] flagCode is required');
  if (!sourceModule) throw new Error('[DecisionRecord] sourceModule is required');
  if (!severity)     throw new Error('[DecisionRecord] severity is required');

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) throw new Error(`[DecisionRecord] Record ${recordId} not found`);
  if (snap.data().status !== RECORD_STATUS.DRAFT) {
    console.warn(`[DecisionRecord] Cannot add flag to ${snap.data().status} record.`);
    return;
  }

  await updateDoc(recordRef, {
    risk_flags: arrayUnion({
      flag_code:     flagCode,
      source_module: sourceModule,
      severity,
      detail,
      flagged_at:    Timestamp.now(),
    }),
    'header.updatedAt': serverTimestamp(),
  });
}

/**
 * addEvidence — push a single evidence object from any module.
 * Use when evidence is generated separately from findings.
 */
export async function addEvidence(recordId, evidenceObject) {
  if (!recordId)       throw new Error('[DecisionRecord] recordId is required');
  if (!evidenceObject) throw new Error('[DecisionRecord] evidenceObject is required');

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) throw new Error(`[DecisionRecord] Record ${recordId} not found`);
  if (snap.data().status !== RECORD_STATUS.DRAFT) {
    console.warn(`[DecisionRecord] Cannot add evidence to ${snap.data().status} record.`);
    return;
  }

  await updateDoc(recordRef, {
    evidence: arrayUnion({
      ...evidenceObject,
      retrieved_at: evidenceObject.retrieved_at instanceof Timestamp
        ? evidenceObject.retrieved_at
        : Timestamp.now(),
    }),
    'header.updatedAt': serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
//  LO NOTES + FINAL DISPOSITION
// ─────────────────────────────────────────────────────────────

/**
 * saveLONotes — LO free-text notes and optional tags.
 * These are stored in a separate lane (lo_notes) from system_findings.
 */
export async function saveLONotes(recordId, text, tags = []) {
  if (!recordId) throw new Error('[DecisionRecord] recordId is required');

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) throw new Error(`[DecisionRecord] Record ${recordId} not found`);
  if (snap.data().status !== RECORD_STATUS.DRAFT) {
    throw new Error('[DecisionRecord] Cannot edit notes on a locked record');
  }

  await updateDoc(recordRef, {
    'lo_notes.text':        text,
    'lo_notes.tags':        tags,
    'lo_notes.authored_at': serverTimestamp(),
    'header.updatedAt':     serverTimestamp(),
  });
}

/**
 * saveFinalDisposition — LO's final decision on the loan path.
 * Stores in system_findings under the DECISION_RECORD module key.
 */
export async function saveFinalDisposition(recordId, userId, {
  disposition,
  programSelected,
  lenderSelected,
  loanAmount,
  interestRate,
  notes,
}) {
  if (!disposition) throw new Error('[DecisionRecord] disposition is required');

  return reportModuleFindings(
    recordId,
    'decision_record',
    {
      disposition,
      program_selected: programSelected || '',
      lender_selected:  lenderSelected  || '',
      loan_amount:      loanAmount       || null,
      interest_rate:    interestRate     || null,
      lo_summary:       notes            || '',
      submitted_by:     userId,
    }
  );
}

// ─────────────────────────────────────────────────────────────
//  LO ATTESTATION
// ─────────────────────────────────────────────────────────────

/**
 * attestRecord — LO certifies the record before it can be locked.
 * "I certify this record reflects the information available at the
 *  time of this decision."
 * Attestation is required — lock will fail without it.
 */
export async function attestRecord(recordId, userId) {
  if (!recordId) throw new Error('[DecisionRecord] recordId is required');
  if (!userId)   throw new Error('[DecisionRecord] userId is required');

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) throw new Error(`[DecisionRecord] Record ${recordId} not found`);
  if (snap.data().status !== RECORD_STATUS.DRAFT) {
    throw new Error('[DecisionRecord] Record is not in draft status');
  }

  await updateDoc(recordRef, {
    'lo_attestation.certified':    true,
    'lo_attestation.certified_at': serverTimestamp(),
    'lo_attestation.certified_by': userId,
    'header.updatedAt':            serverTimestamp(),
  });

  console.log(`[DecisionRecord] Record ${recordId} attested by user ${userId}`);
}

// ─────────────────────────────────────────────────────────────
//  LOCK RECORD
// ─────────────────────────────────────────────────────────────

/**
 * initiateRecordLock
 * Sets status to 'locking', which triggers the lockDecisionRecord
 * Cloud Function. The Cloud Function computes SHA-256, writes
 * record_hash, locked_at (server timestamp), and sets status='locked'.
 *
 * Pre-conditions enforced:
 *   1. Record must be in DRAFT status
 *   2. LO attestation must be certified
 *   3. Final disposition must have been saved (decision_record module reported)
 */
export async function initiateRecordLock(recordId, userId) {
  if (!recordId) throw new Error('[DecisionRecord] recordId is required');
  if (!userId)   throw new Error('[DecisionRecord] userId is required');

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) throw new Error(`[DecisionRecord] Record ${recordId} not found`);

  const record = snap.data();

  if (record.status !== RECORD_STATUS.DRAFT) {
    throw new Error(`[DecisionRecord] Record is already ${record.status}`);
  }
  if (!record.lo_attestation?.certified) {
    throw new Error('[DecisionRecord] LO attestation is required before locking');
  }
  if (!record.system_findings?.decision_record) {
    throw new Error('[DecisionRecord] Final disposition must be saved before locking');
  }

  await updateDoc(recordRef, {
    status:               RECORD_STATUS.LOCKING,
    lock_initiated_by:    userId,
    lock_initiated_at:    serverTimestamp(),
    'header.updatedAt':   serverTimestamp(),
  });

  console.log(`[DecisionRecord] Lock initiated for record ${recordId} by user ${userId}`);
}

// ─────────────────────────────────────────────────────────────
//  VERSIONING
// ─────────────────────────────────────────────────────────────

/**
 * createNewVersion
 * Creates an immutable copy of a locked record as a new draft (v2, v3, ...).
 * The old record is marked superseded. changeReason is required.
 *
 * @param {string} oldRecordId
 * @param {string} userId
 * @param {string} changeReason  — must be a value from CHANGE_REASONS
 */
export async function createNewVersion(oldRecordId, userId, changeReason) {
  if (!oldRecordId)   throw new Error('[DecisionRecord] oldRecordId is required');
  if (!userId)        throw new Error('[DecisionRecord] userId is required');
  if (!changeReason)  throw new Error('[DecisionRecord] changeReason is required for versioning');

  const oldRecord = await getRecord(oldRecordId);

  if (oldRecord.status !== RECORD_STATUS.LOCKED) {
    throw new Error('[DecisionRecord] Can only version a LOCKED record');
  }
  if (oldRecord.superseded_by_record_id) {
    throw new Error('[DecisionRecord] This record has already been superseded');
  }

  const newRecordId = newDocId();

  const newRecord = {
    // Carry forward all findings, evidence, header data
    ...oldRecord,
    recordId:                newRecordId,
    status:                  RECORD_STATUS.DRAFT,
    record_version:          (oldRecord.record_version || 1) + 1,
    supersedes_record_id:    oldRecordId,
    superseded_by_record_id: null,
    change_reason:           changeReason,
    // Reset lock / hash fields — Cloud Function will set these on next lock
    record_hash:             null,
    locked_at:               null,
    locked_by_user_id:       null,
    lock_initiated_by:       null,
    lock_initiated_at:       null,
    // Reset attestation — LO must re-certify
    lo_attestation: {
      certified:    false,
      certified_at: null,
      certified_by: null,
    },
    // Reset manager review on new version
    manager_review: {
      reviewed:             false,
      reviewed_by:          null,
      reviewed_at:          null,
      flagged_for_followup: false,
      comments:             [],
    },
    header: {
      ...oldRecord.header,
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    },
  };

  // Mark old record as superseded
  await updateDoc(doc(db, DR_COLLECTION, oldRecordId), {
    superseded_by_record_id: newRecordId,
    'header.updatedAt':      serverTimestamp(),
  });

  // Write the new version
  await setDoc(doc(db, DR_COLLECTION, newRecordId), newRecord);

  console.log(
    `[DecisionRecord] Version ${newRecord.record_version} created.`,
    `New: ${newRecordId} | Supersedes: ${oldRecordId}`
  );

  return newRecord;
}

// ─────────────────────────────────────────────────────────────
//  MANAGER ACTIONS
// ─────────────────────────────────────────────────────────────

/**
 * addManagerComment — manager annotation.
 * Does NOT edit any existing record content — purely additive.
 */
export async function addManagerComment(recordId, managerId, commentText) {
  if (!recordId)    throw new Error('[DecisionRecord] recordId is required');
  if (!managerId)   throw new Error('[DecisionRecord] managerId is required');
  if (!commentText) throw new Error('[DecisionRecord] commentText cannot be empty');

  await updateDoc(doc(db, DR_COLLECTION, recordId), {
    'manager_review.comments': arrayUnion({
      text:        commentText,
      authored_by: managerId,
      authored_at: Timestamp.now(),
    }),
    'header.updatedAt': serverTimestamp(),
  });
}

/**
 * markManagerReviewed — manager confirms they have reviewed the record.
 * Timestamps and user ID are stored for the audit trail.
 */
export async function markManagerReviewed(recordId, managerId) {
  if (!recordId)  throw new Error('[DecisionRecord] recordId is required');
  if (!managerId) throw new Error('[DecisionRecord] managerId is required');

  await updateDoc(doc(db, DR_COLLECTION, recordId), {
    'manager_review.reviewed':    true,
    'manager_review.reviewed_by': managerId,
    'manager_review.reviewed_at': serverTimestamp(),
    'header.updatedAt':           serverTimestamp(),
  });
}

/**
 * toggleManagerFlag — set or clear the follow-up flag.
 * @param {boolean} flagged
 */
export async function toggleManagerFlag(recordId, flagged) {
  if (!recordId) throw new Error('[DecisionRecord] recordId is required');

  await updateDoc(doc(db, DR_COLLECTION, recordId), {
    'manager_review.flagged_for_followup': flagged,
    'header.updatedAt':                    serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
//  HEADER SYNC
//  Call this any time scenario header data changes (name, address, etc.)
//  so the Decision Record stays in sync with the source scenario.
// ─────────────────────────────────────────────────────────────

/**
 * syncRecordHeader — keeps Decision Record header in sync with scenario data.
 * Call from ScenarioCreator or any module that updates borrower/property info.
 */
export async function syncRecordHeader(recordId, scenarioData = {}) {
  if (!recordId) throw new Error('[DecisionRecord] recordId is required');

  const recordRef = doc(db, DR_COLLECTION, recordId);
  const snap      = await getDoc(recordRef);

  if (!snap.exists()) return;
  if (snap.data().status !== RECORD_STATUS.DRAFT) return; // Don't touch locked records

  const updates = {};
  if (scenarioData.borrowerName)    updates['header.borrowerName']    = scenarioData.borrowerName;
  if (scenarioData.borrowerAddress) updates['header.borrowerAddress'] = scenarioData.borrowerAddress;
  if (scenarioData.loName)          updates['header.loName']          = scenarioData.loName;
  if (scenarioData.branchId)        updates['header.branchId']        = scenarioData.branchId;
  if (scenarioData.loanType)        updates['header.loanType']        = scenarioData.loanType;
  if (scenarioData.loanPurpose)     updates['header.loanPurpose']     = scenarioData.loanPurpose;
  if (scenarioData.propertyAddress) updates['header.propertyAddress'] = scenarioData.propertyAddress;

  if (Object.keys(updates).length === 0) return;

  updates['header.updatedAt'] = serverTimestamp();
  await updateDoc(recordRef, updates);
}
