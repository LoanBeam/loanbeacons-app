// =============================================================================
//  src/hooks/useDecisionRecord.js
//  LoanBeacons → Decision Record Module 21
// =============================================================================

import { useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  getOrCreateRecord,
  reportModuleFindings,
  addRiskFlag,
  addEvidence,
} from '../services/decisionRecordService';

/**
 * Build a header object from a Firestore scenario document.
 */
function buildHeaderFromScenario(scenarioData) {
  if (!scenarioData) return {};
  const d = scenarioData;
  const firstName = d.firstName || d.borrower?.firstName || '';
  const lastName  = d.lastName  || d.borrower?.lastName  || '';
  const borrowerName = (firstName || lastName)
    ? `${firstName} ${lastName}`.trim()
    : (d.borrowerName || d.name || '');

  return {
    borrowerName:    borrowerName || '',
    borrowerAddress: d.streetAddress || d.propertyAddress || d.address || '',
    scenarioId:      d.id || '',
    loId:            d.loId || d.userId || 'default',
    loName:          d.loName || '',
    loanPurpose:     d.loanPurpose || d.purpose || '',
    loanType:        d.loanType || d.program || '',
    propertyAddress: d.streetAddress || d.propertyAddress || d.address || '',
  };
}

export function useDecisionRecord(scenarioId) {
  const recordIdRef = useRef(null);

  const getRecordId = useCallback(async () => {
    if (recordIdRef.current) return recordIdRef.current;
    if (!scenarioId) return null;

    try {
      // Fetch scenario data to populate header fields
      let headerData = {};
      try {
        const scenarioSnap = await getDoc(doc(db, 'scenarios', scenarioId));
        if (scenarioSnap.exists()) {
          headerData = buildHeaderFromScenario({ id: scenarioSnap.id, ...scenarioSnap.data() });
        }
      } catch (headerErr) {
        console.warn('[useDecisionRecord] Could not fetch scenario for header:', headerErr.message);
      }

      const record = await getOrCreateRecord(scenarioId, headerData.loId || 'default', headerData);
      recordIdRef.current = record.recordId;
      return record.recordId;
    } catch (err) {
      console.warn('[useDecisionRecord] Could not get/create record:', err.message);
      return null;
    }
  }, [scenarioId]);

  const reportFindings = useCallback(async (
    moduleKey,
    findings,
    evidence      = [],
    flags         = [],
    moduleVersion = '1.0.0'
  ) => {
    if (!scenarioId) return null;
    if (!moduleKey) return null;
    if (!findings || typeof findings !== 'object') return null;

    try {
      const recordId = await getRecordId();
      if (!recordId) return null;
      await reportModuleFindings(recordId, moduleKey, findings, evidence, flags, moduleVersion);
      return recordId; // ← return the actual recordId written to
    } catch (err) {
      console.warn(`[useDecisionRecord] reportFindings failed for "${moduleKey}":`, err.message);
      return null;
    }
  }, [scenarioId, getRecordId]);

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

export default useDecisionRecord;
