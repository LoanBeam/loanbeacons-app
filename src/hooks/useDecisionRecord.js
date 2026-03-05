// ============================================================
//  src/hooks/useDecisionRecord.js
//  LoanBeacons — Decision Record Module 21
//
//  Universal hook for all modules to report into the Decision Record.
//  Every module uses this hook — no module talks to Firestore directly.
//
//  USAGE IN ANY MODULE:
//
//    import { useDecisionRecord } from '../hooks/useDecisionRecord';
//
//    // Inside your component:
//    const { reportFindings } = useDecisionRecord(scenarioId);
//
//    // After your module computes results, call:
//    await reportFindings(MODULE_KEYS.YOUR_MODULE, {
//      ...yourResultsObject
//    });
//
//  That's it. The hook handles:
//    - Finding or creating the Decision Record for this scenario
//    - Writing findings under the correct module key
//    - Updating completeness score
//    - Error handling (silent — never breaks your module's flow)
// ============================================================

import { useCallback, useRef } from 'react';
import {
  getOrCreateRecord,
  reportModuleFindings,
  addRiskFlag,
  addEvidence,
} from '../services/decisionRecordService';
import { RISK_FLAG_CODES, FLAG_SEVERITY } from '../constants/decisionRecordConstants';

/**
 * useDecisionRecord
 *
 * @param {string} scenarioId  — the active scenario's Firestore ID
 * @returns {{ reportFindings, pushFlag, pushEvidence }}
 */
export function useDecisionRecord(scenarioId) {
  // Cache the recordId so we don't re-fetch on every call
  const recordIdRef = useRef(null);

  /**
   * getRecordId
   * Internal helper — lazily fetches or creates the Decision Record
   * and caches the ID for subsequent calls in the same session.
   */
  const getRecordId = useCallback(async () => {
    if (recordIdRef.current) return recordIdRef.current;
    if (!scenarioId) return null;

    try {
      const record = await getOrCreateRecord(scenarioId, 'default', {});
      recordIdRef.current = record.recordId;
      return record.recordId;
    } catch (err) {
      console.warn('[useDecisionRecord] Could not get/create record:', err.message);
      return null;
    }
  }, [scenarioId]);

  /**
   * reportFindings
   * The primary function every module calls after computing results.
   *
   * @param {string} moduleKey     — MODULE_KEYS constant (e.g. MODULE_KEYS.AUS_RESCUE)
   * @param {object} findings      — your module's result object (any shape)
   * @param {Array}  evidence      — optional evidence objects
   * @param {Array}  flags         — optional risk flag objects
   * @param {string} moduleVersion — optional semver string
   *
   * SILENT FAILURE: if anything goes wrong, your module's flow is never disrupted.
   */
  const reportFindings = useCallback(async (
    moduleKey,
    findings,
    evidence      = [],
    flags         = [],
    moduleVersion = '1.0.0'
  ) => {
    if (!scenarioId) return;
    if (!moduleKey)  return;
    if (!findings || typeof findings !== 'object') return;

    try {
      const recordId = await getRecordId();
      if (!recordId) return;

      await reportModuleFindings(
        recordId,
        moduleKey,
        findings,
        evidence,
        flags,
        moduleVersion
      );
    } catch (err) {
      // Silent failure — Decision Record issues never break module flow
      console.warn(`[useDecisionRecord] reportFindings failed for "${moduleKey}":`, err.message);
    }
  }, [scenarioId, getRecordId]);

  /**
   * pushFlag
   * Push a standalone risk flag from any module.
   *
   * @param {string} flagCode     — RISK_FLAG_CODES constant
   * @param {string} sourceModule — MODULE_KEYS constant
   * @param {string} severity     — FLAG_SEVERITY constant
   * @param {string} detail       — human-readable explanation
   */
  const pushFlag = useCallback(async (flagCode, sourceModule, severity, detail = '') => {
    if (!scenarioId) return;
    try {
      const recordId = await getRecordId();
      if (!recordId) return;
      await addRiskFlag(recordId, flagCode, sourceModule, severity, detail);
    } catch (err) {
      console.warn('[useDecisionRecord] pushFlag failed:', err.message);
    }
  }, [scenarioId, getRecordId]);

  /**
   * pushEvidence
   * Attach a single evidence item to the record.
   *
   * @param {object} evidenceObject — { type, source_name, source_id, source_url, retrieved_by, version_tag }
   */
  const pushEvidence = useCallback(async (evidenceObject) => {
    if (!scenarioId) return;
    try {
      const recordId = await getRecordId();
      if (!recordId) return;
      await addEvidence(recordId, evidenceObject);
    } catch (err) {
      console.warn('[useDecisionRecord] pushEvidence failed:', err.message);
    }
  }, [scenarioId, getRecordId]);

  return { reportFindings, pushFlag, pushEvidence };
}
