// ============================================================
//  functions/src/lockDecisionRecord.cjs
//  LoanBeacons — Decision Record Module 21
//
//  Cloud Function: lockDecisionRecord
//  Triggered when: a decisionRecord document status → 'locking'
//
//  Responsibilities:
//    1. Re-fetch the record to get the authoritative server state
//    2. Build a canonical, deterministic JSON payload for hashing
//    3. Compute SHA-256 hash of that payload
//    4. Write back: status='locked', record_hash, locked_at (server),
//       locked_by_user_id
//    5. On any failure: revert status to 'draft' + log the error
//
//  Why this must be a Cloud Function (not client-side):
//    - locked_at uses FieldValue.serverTimestamp() — untamperable
//    - The hash is computed from the server-fetched document — not
//      the client's version, which could differ
//    - Clients cannot alter the hash after it is written (Firestore
//      security rules will enforce read-only on locked records)
// ============================================================

'use strict';

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin  = require('firebase-admin');
const crypto = require('crypto');

// Initialize admin if not already initialized (safe for multi-function files)
if (!admin.apps.length) {
  admin.initializeApp();
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * toHashable
 * Recursively converts a Firestore document to a plain,
 * deterministically serializable object.
 *
 * Handles:
 *   - Firestore Timestamps  → integer milliseconds
 *   - Arrays               → mapped recursively
 *   - Objects              → keys sorted alphabetically, values mapped
 *   - Primitives           → returned as-is
 *   - null / undefined     → null
 *
 * Sorting keys at every level ensures the same document always
 * produces the same JSON string regardless of insertion order.
 */
function toHashable(value) {
  if (value === null || value === undefined) {
    return null;
  }

  // Firestore Timestamp (has .toMillis() method)
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  // Array
  if (Array.isArray(value)) {
    return value.map(toHashable);
  }

  // Plain object — sort keys for determinism
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = toHashable(value[key]);
        return acc;
      }, {});
  }

  // Primitive (string, number, boolean)
  return value;
}

/**
 * buildHashPayload
 * Strips the fields that the lock operation itself will write
 * (record_hash, locked_at, locked_by_user_id, status, lock_initiated_*)
 * so they don't create a circular dependency in the hash.
 *
 * Everything else — system_findings, evidence, risk_flags, lo_notes,
 * lo_attestation, header, completeness, versioning — is included.
 *
 * Returns a deterministic JSON string.
 */
function buildHashPayload(record) {
  // Destructure out the fields set by the lock operation itself
  const {
    record_hash,          // will be set by this function
    locked_at,            // will be set by this function
    locked_by_user_id,    // will be set by this function
    status,               // changing from 'locking' → 'locked'
    lock_initiated_at,    // operational field, not part of content
    lock_initiated_by,    // operational field, not part of content
    ...contentPayload     // everything else is part of the hash
  } = record;

  // Convert all Timestamps and sort all keys recursively
  const hashable = toHashable(contentPayload);

  // JSON.stringify on the already-sorted object is deterministic
  return JSON.stringify(hashable);
}

// ─────────────────────────────────────────────────────────────
//  CLOUD FUNCTION
// ─────────────────────────────────────────────────────────────

exports.lockDecisionRecord = onDocumentUpdated(
  'decisionRecords/{recordId}',
  async (event) => {
    const before   = event.data.before.data();
    const after    = event.data.after.data();
    const recordId = event.params.recordId;

    // ── Guard: only fire on the DRAFT → LOCKING transition ────
    if (before.status === after.status) return null;
    if (after.status !== 'locking')     return null;

    const db        = admin.firestore();
    const recordRef = db.collection('decisionRecords').doc(recordId);

    console.log(`[lockDecisionRecord] Locking record ${recordId}...`);

    try {
      // ── Step 1: Re-fetch for authoritative server state ──────
      // We do NOT use the trigger payload as the source of truth —
      // we fetch fresh to guarantee we hash what Firestore actually holds.
      const freshSnap = await recordRef.get();

      if (!freshSnap.exists) {
        console.error(`[lockDecisionRecord] Record ${recordId} not found. Aborting.`);
        return null;
      }

      const record = freshSnap.data();

      // ── Step 2: Safety re-check (guard against race conditions) ─
      if (record.status !== 'locking') {
        console.warn(
          `[lockDecisionRecord] Record ${recordId} status is "${record.status}", not "locking". Aborting.`
        );
        return null;
      }

      // ── Step 3: Build canonical payload and compute hash ─────
      const canonicalJson = buildHashPayload(record);
      const hash = crypto
        .createHash('sha256')
        .update(canonicalJson, 'utf8')
        .digest('hex');

      console.log(`[lockDecisionRecord] SHA-256 computed for ${recordId}: ${hash.substring(0, 16)}...`);

      // ── Step 4: Write the lock (server timestamp, hash, status) ─
      await recordRef.update({
        status:            'locked',
        record_hash:       hash,
        locked_at:         admin.firestore.FieldValue.serverTimestamp(),
        locked_by_user_id: record.lock_initiated_by || null,
      });

      console.log(`[lockDecisionRecord] Record ${recordId} successfully locked.`);
      return null;

    } catch (err) {
      // ── Step 5: Revert to draft on any failure ───────────────
      console.error(`[lockDecisionRecord] Error locking ${recordId}:`, err);

      try {
        await recordRef.update({
          status: 'draft',
          lock_initiated_by:  null,
          lock_initiated_at:  null,
        });
        console.warn(`[lockDecisionRecord] Record ${recordId} reverted to draft after error.`);
      } catch (revertErr) {
        // Log but don't throw — the original error is already logged
        console.error(`[lockDecisionRecord] Failed to revert record ${recordId}:`, revertErr);
      }

      return null;
    }
  }
);
