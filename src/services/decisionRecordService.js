/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/services/decisionRecordService.js
 * Version: 1.0.0 — Decision Record Write Service
 * Step 12 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * All Firestore write operations for the Decision Record™ system.
 *
 * COLLECTION: decisionRecords
 *
 * This service is the single write path for Decision Records.
 * LenderMatch.jsx calls saveDecisionRecord() from its onSave handler.
 * Nothing else writes to this collection.
 *
 * RECORD IMMUTABILITY:
 *   Decision Records are append-only. Once written, a record is never
 *   modified. If a scenario is re-run with new inputs, a NEW record is
 *   created — the old one is preserved. This is by design: the record
 *   represents a specific decision at a specific point in time.
 *
 * EXPORTS:
 *   saveDecisionRecord(record, options)   — Primary write
 *   markDecisionRecordVoid(docId, reason) — Soft-delete (sets voided: true)
 *   getDecisionRecordsForLoan(loanId)     — One-shot read for export
 * ============================================================
 */

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebase";


// ─── Collection Reference ─────────────────────────────────────────────────────
const DECISION_RECORDS = "decisionRecords";


// ─── saveDecisionRecord ───────────────────────────────────────────────────────
/**
 * Writes a Decision Record™ to Firestore.
 * Called from LenderMatch.jsx → DecisionRecordModal → onSave.
 *
 * @param {object} record     — Full record from buildDecisionRecord()
 * @param {object} options
 *   @param {string} options.loanId      — Optional loan file ID for grouping
 *   @param {string} options.userId      — Optional user/LO identifier
 *   @param {string} options.loanNumber  — Optional display loan number
 *   @param {string} options.borrowerRef — Optional borrower identifier (not PII)
 * @returns {Promise<{success: boolean, docId: string|null, error: Error|null}>}
 */
export async function saveDecisionRecord(record, options = {}) {
  if (!record) {
    return { success: false, docId: null, error: new Error("No record provided") };
  }

  const { loanId, userId, loanNumber, borrowerRef } = options;

  // Validate required provenance fields before writing
  const requiredFields = ["recordType", "selectedLenderId", "dataSource", "guidelineVersionRef"];
  const missing = requiredFields.filter((f) => !record[f]);
  if (missing.length > 0) {
    const err = new Error(`Decision Record missing required fields: ${missing.join(", ")}`);
    console.error("[decisionRecordService]", err.message);
    return { success: false, docId: null, error: err };
  }

  try {
    const payload = {
      // Core record (sealed from buildDecisionRecord)
      ...record,

      // Firestore metadata
      savedAt:      serverTimestamp(),
      savedAtISO:   new Date().toISOString(),
      voided:       false,
      voidReason:   null,

      // Optional loan/user context
      ...(loanId      && { loanId }),
      ...(userId      && { userId }),
      ...(loanNumber  && { loanNumber }),
      ...(borrowerRef && { borrowerRef }),

      // Schema version for future migrations
      schemaVersion: 1,
    };

    const docRef = await addDoc(collection(db, DECISION_RECORDS), payload);

    console.log(
      `[decisionRecordService] ✅ Decision Record saved: ${docRef.id} ` +
      `(lender: ${record.selectedLenderId}, source: ${record.dataSource})`
    );

    return { success: true, docId: docRef.id, error: null };

  } catch (err) {
    console.error("[decisionRecordService] ❌ Save failed:", err.code, err.message);
    return { success: false, docId: null, error: err };
  }
}


// ─── markDecisionRecordVoid ───────────────────────────────────────────────────
/**
 * Soft-deletes a Decision Record by setting voided: true.
 * The record is preserved in Firestore — only filtered out of active views.
 * Used when an LO selects the wrong lender and wants to retract the record.
 *
 * @param {string} docId   — Firestore document ID
 * @param {string} reason  — Reason for voiding (e.g. "Wrong lender selected")
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export async function markDecisionRecordVoid(docId, reason = "Voided by user") {
  if (!docId) return { success: false, error: new Error("No docId provided") };

  try {
    const ref = doc(db, DECISION_RECORDS, docId);
    await updateDoc(ref, {
      voided:     true,
      voidReason: reason,
      voidedAt:   serverTimestamp(),
      voidedAtISO: new Date().toISOString(),
    });

    console.log(`[decisionRecordService] Record ${docId} voided: "${reason}"`);
    return { success: true, error: null };

  } catch (err) {
    console.error("[decisionRecordService] Void failed:", err);
    return { success: false, error: err };
  }
}


// ─── getDecisionRecordsForLoan ────────────────────────────────────────────────
/**
 * One-shot read of all non-voided Decision Records for a loan file.
 * Used for export, audit, and the Decision Log display (future feature).
 *
 * @param {string} loanId  — Loan file ID
 * @returns {Promise<{records: Array, error: Error|null}>}
 */
export async function getDecisionRecordsForLoan(loanId) {
  if (!loanId) return { records: [], error: new Error("No loanId provided") };

  try {
    const ref = collection(db, DECISION_RECORDS);
    const q   = query(
      ref,
      where("loanId",  "==", loanId),
      where("voided",  "==", false),
      orderBy("selectedAt", "desc")
    );

    const snap    = await getDocs(q);
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return { records, error: null };

  } catch (err) {
    console.error("[decisionRecordService] Read failed:", err);
    return { records: [], error: err };
  }
}


// ─── exportDecisionRecordsAsText ─────────────────────────────────────────────
/**
 * Formats an array of Decision Records as a plain-text audit log.
 * Suitable for copying into a loan file or emailing to processing.
 *
 * @param {Array} records  — Array of Decision Record objects
 * @returns {string}       — Formatted text block
 */
export function exportDecisionRecordsAsText(records = []) {
  if (!records.length) return "No Decision Records found for this loan.";

  const lines = [
    "═══════════════════════════════════════════════════",
    "LOANBEACONS — DECISION RECORD™ AUDIT LOG",
    `Generated: ${new Date().toLocaleString()}`,
    "═══════════════════════════════════════════════════",
    "",
  ];

  records.forEach((rec, i) => {
    const s = rec.scenarioSnapshot || {};
    lines.push(`[${i + 1}] ${rec.profileName || rec.selectedLenderId}`);
    lines.push(`    Program:       ${rec.selectedProgramId || "—"}`);
    lines.push(`    Status:        ${rec.eligibilityStatus}`);
    lines.push(`    Fit Score:     ${rec.fitScore}`);
    lines.push(`    Overlay Risk:  ${rec.overlayRisk}`);
    lines.push(`    Confidence:    ${Math.round((rec.confidenceScore ?? 0) * 100)}%`);
    lines.push(`    Data Source:   ${rec.dataSource}`);
    lines.push(`    Guideline Ref: ${rec.guidelineVersionRef}`);
    lines.push(`    Selected:      ${rec.selectedAt || rec.savedAtISO || "—"}`);
    lines.push(`    Loan Amount:   $${Number(s.loanAmount || 0).toLocaleString()}`);
    lines.push(`    FICO:          ${s.creditScore || "—"}`);
    lines.push(`    LTV:           ${s.ltv ? `${s.ltv}%` : "—"}`);
    lines.push(`    State:         ${s.state || "—"}`);
    if (rec.narrativeSnapshot) {
      lines.push(`    Narrative:     ${rec.narrativeSnapshot}`);
    }
    lines.push("");
  });

  lines.push("═══════════════════════════════════════════════════");
  lines.push(`Total records: ${records.length}`);

  return lines.join("\n");
}
