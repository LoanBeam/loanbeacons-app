/**
 * ============================================================
 * LoanBeacons CRA Eligibility Intelligence™
 * src/hooks/useCRAEligibility.js
 * Version: 1.0.0 | Module 12 | Step 2 of 5
 * February 2026
 * ============================================================
 *
 * React hook that orchestrates CRA snapshot resolution.
 *
 * Called from ScenarioCreator after USPS confirms an address.
 * Automatically fires buildCRASnapshot, manages loading/error
 * state, and saves the result to Firestore if a scenarioId
 * is available.
 *
 * Usage:
 *   const { craSnapshot, craLoading, craError, runCRA } = useCRAEligibility();
 *
 *   // Trigger after USPS confirmation:
 *   runCRA(addressObj, monthlyIncome, scenarioId);
 *
 * The hook is intentionally stateless between renders —
 * the snapshot lives in Firestore and local component state.
 * Other modules (DPA, Lender Match) read from Firestore directly.
 * ============================================================
 */

import { useState, useCallback, useRef } from 'react';
import {
  buildCRASnapshot,
  saveCRASnapshotToScenario,
} from '../services/craService';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCRAEligibility() {
  const [craSnapshot, setCraSnapshot]   = useState(null);
  const [craLoading,  setCraLoading]    = useState(false);
  const [craError,    setCraError]      = useState(null);
  const [craStatus,   setCraStatus]     = useState('idle'); // idle | loading | success | error | partial

  // Prevent stale async results from overwriting newer ones
  const runIdRef = useRef(0);

  /**
   * runCRA — main trigger function.
   *
   * @param {object} addressObj          — confirmed address { streetAddress, city, state, zipCode }
   * @param {number} borrowerMonthlyIncome — from ScenarioCreator monthlyIncome field (optional)
   * @param {string} scenarioId          — Firestore scenario doc ID (optional, saves snapshot)
   */
  const runCRA = useCallback(async (addressObj, borrowerMonthlyIncome = 0, scenarioId = null) => {
    // Guard — need at minimum street + zip
    if (!addressObj?.streetAddress || !addressObj?.zipCode) {
      setCraError('Address incomplete — need street address and ZIP');
      setCraStatus('error');
      return;
    }

    // Increment run ID — any previous in-flight call will be ignored
    const thisRunId = ++runIdRef.current;

    setCraLoading(true);
    setCraError(null);
    setCraStatus('loading');
    setCraSnapshot(null);

    try {
      console.log('[useCRAEligibility] Starting CRA resolution for:', addressObj.streetAddress);

      const snapshot = await buildCRASnapshot(addressObj, borrowerMonthlyIncome);

      // Ignore if a newer run has started
      if (thisRunId !== runIdRef.current) return;

      setCraSnapshot(snapshot);

      // Determine status based on data quality
      const { dataQuality } = snapshot;
      if (dataQuality.fullDataAvailable) {
        setCraStatus('success');
      } else {
        // Partial data — some APIs failed but we have enough to show
        setCraStatus('partial');
        const failedSources = [];
        if (!dataQuality.ffiecAvailable)  failedSources.push('FFIEC');
        if (!dataQuality.hudAvailable)    failedSources.push('HUD');
        if (!dataQuality.acsAvailable)    failedSources.push('ACS Demographics');
        setCraError(`Some data unavailable: ${failedSources.join(', ')}. Showing available data.`);
      }

      // Save to Firestore if we have a scenario ID
      if (scenarioId) {
        saveCRASnapshotToScenario(scenarioId, snapshot).catch(err => {
          console.warn('[useCRAEligibility] Firestore save failed (non-blocking):', err);
        });
      }

      console.log('[useCRAEligibility] ✅ CRA complete. Status:', dataQuality.fullDataAvailable ? 'FULL' : 'PARTIAL');

    } catch (err) {
      if (thisRunId !== runIdRef.current) return;

      console.error('[useCRAEligibility] CRA resolution failed:', err.message);
      setCraStatus('error');
      setCraError(buildUserFacingError(err.message));
      setCraSnapshot(null);
    } finally {
      if (thisRunId === runIdRef.current) {
        setCraLoading(false);
      }
    }
  }, []);

  /**
   * updateIncome — recalculates AMI percentage when borrower income
   * changes without re-fetching all APIs.
   * Call this when monthlyIncome field changes in ScenarioCreator.
   */
  const updateIncomeFlags = useCallback((newMonthlyIncome) => {
    if (!craSnapshot || !craSnapshot.incomeData?.amiOverall) return;

    const amiOverall = craSnapshot.incomeData.amiOverall;
    const annualIncome = newMonthlyIncome * 12;
    const borrowerAmiPct = amiOverall > 0
      ? Math.round((annualIncome / amiOverall) * 10) / 10
      : null;

    let borrowerAmiTier = null;
    if (borrowerAmiPct !== null) {
      if (borrowerAmiPct <= 50)       borrowerAmiTier = 'VERY_LOW';
      else if (borrowerAmiPct <= 80)  borrowerAmiTier = 'LOW';
      else if (borrowerAmiPct <= 100) borrowerAmiTier = 'MODERATE';
      else if (borrowerAmiPct <= 120) borrowerAmiTier = 'ABOVE_MOD';
      else if (borrowerAmiPct <= 150) borrowerAmiTier = 'MIDDLE';
      else                             borrowerAmiTier = 'ABOVE_LIMIT';
    }

    setCraSnapshot(prev => ({
      ...prev,
      flags: {
        ...prev.flags,
        borrowerAmiPct,
        borrowerAmiTier,
        meetsHomeReady:    borrowerAmiPct !== null && borrowerAmiPct <= 80,
        meetsHomePossible: borrowerAmiPct !== null && borrowerAmiPct <= 80,
        meetsMostDPA:      borrowerAmiPct !== null && borrowerAmiPct <= 120,
        meetsUSDAIncome:   borrowerAmiPct !== null && borrowerAmiPct <= 115,
      },
    }));
  }, [craSnapshot]);

  /**
   * clearCRA — reset everything when address is cleared or changed.
   */
  const clearCRA = useCallback(() => {
    runIdRef.current++;
    setCraSnapshot(null);
    setCraLoading(false);
    setCraError(null);
    setCraStatus('idle');
  }, []);

  return {
    craSnapshot,
    craLoading,
    craError,
    craStatus,
    runCRA,
    updateIncomeFlags,
    clearCRA,
  };
}

// ─── Error Message Mapping ────────────────────────────────────────────────────

function buildUserFacingError(message) {
  if (message?.includes('no matches') || message?.includes('geocoded')) {
    return 'Address could not be located — please verify the address and try again.';
  }
  if (message?.includes('Census tract not found')) {
    return 'Census tract not found for this address. Rural or very new addresses may not be in the database.';
  }
  if (message?.includes('incomplete address')) {
    return 'Please confirm your full address (street, city, state, ZIP) before running CRA check.';
  }
  return 'CRA data temporarily unavailable. You can continue — this data will be resolved later.';
}
