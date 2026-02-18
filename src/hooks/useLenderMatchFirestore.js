/**
 * ============================================================
 * LoanBeacons Lender Match™
 * src/hooks/useLenderMatchFirestore.js
 * Version: 1.0.0 — Lender Match Firestore Hooks
 * Step 12 of Build Sequence | February 18, 2026
 * ============================================================
 *
 * Real-time Firestore listeners for:
 *   1. Agency lender overrides    (collection: lenderOverrides)
 *   2. Non-QM lender overrides    (collection: nonQMOverrides)
 *
 * Both hooks use onSnapshot for real-time updates — when a lender
 * manager updates a guideline doc in Firestore, the engine picks it
 * up on next Run without a page reload.
 *
 * OVERRIDE PRECEDENCE:
 *   Firestore real lender (version >= 1) > Placeholder (version 0)
 *   Firestore partial update (version 0) > Static matrix value
 *
 * COLLECTION SHAPES:
 *   See FIRESTORE_SCHEMA.md (also generated in Step 12)
 *
 * EXPORTS:
 *   useLenderOverrides()     — returns { agencyOverrides, nonQMOverrides,
 *                                        loading, error, firestoreAvailable }
 *   useDecisionRecordLog()   — returns { records, loading, error }
 *                              for reading a loan's Decision Record history
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "@/firebase";


// ─── Constants ────────────────────────────────────────────────────────────────

const COLLECTIONS = {
  AGENCY_OVERRIDES: "lenderOverrides",
  NONQM_OVERRIDES:  "nonQMOverrides",
  DECISION_RECORDS: "decisionRecords",
};

// Max age before we flag guidelines as stale (in milliseconds)
const GUIDELINE_STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000; // 90 days


// ─── useLenderOverrides ───────────────────────────────────────────────────────
/**
 * Subscribes to both lender override collections simultaneously.
 * Returns merged override arrays for passing directly to runLenderMatch().
 *
 * Usage in LenderMatch.jsx:
 *   const { agencyOverrides, nonQMOverrides, firestoreAvailable } =
 *     useLenderOverrides();
 *
 *   const result = runLenderMatch(formInputs, {
 *     agencyOverrides,
 *     nonQMOverrides,
 *     firestoreAvailable,
 *   });
 */
export function useLenderOverrides() {
  const [agencyOverrides,   setAgencyOverrides]   = useState([]);
  const [nonQMOverrides,    setNonQMOverrides]     = useState([]);
  const [loading,           setLoading]            = useState(true);
  const [error,             setError]              = useState(null);
  const [firestoreAvailable, setFirestoreAvailable] = useState(true);
  const [guidelineAgesDays, setGuidelineAgesDays]  = useState({});

  // Track both subscriptions for cleanup
  const unsubAgency = useRef(null);
  const unsubNonQM  = useRef(null);
  const agencyDone  = useRef(false);
  const nonQMDone   = useRef(false);

  // Mark loading complete when both subscriptions have resolved
  const checkBothReady = useCallback(() => {
    if (agencyDone.current && nonQMDone.current) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // ── Agency overrides ────────────────────────────────────────────────────
    const agencyRef = collection(db, COLLECTIONS.AGENCY_OVERRIDES);
    // Only fetch active overrides
    const agencyQ   = query(agencyRef, where("active", "==", true));

    unsubAgency.current = onSnapshot(
      agencyQ,
      (snapshot) => {
        if (cancelled) return;

        const overrides   = [];
        const ageUpdates  = {};

        snapshot.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() };
          overrides.push(data);

          // Compute guideline age for confidence scoring
          if (data.guidelineVersionRef && data.effectiveDate) {
            const ageDays = Math.floor(
              (Date.now() - new Date(data.effectiveDate).getTime()) /
              (1000 * 60 * 60 * 24)
            );
            ageUpdates[data.guidelineVersionRef] = ageDays;
          }
        });

        setAgencyOverrides(overrides);
        setGuidelineAgesDays((prev) => ({ ...prev, ...ageUpdates }));
        setFirestoreAvailable(true);
        agencyDone.current = true;
        checkBothReady();

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[useLenderOverrides] Agency overrides: ${overrides.length} docs ` +
            `(${overrides.filter((o) => o.version >= 1).length} real, ` +
            `${overrides.filter((o) => o.version === 0).length} placeholder updates)`
          );
        }
      },
      (err) => {
        if (cancelled) return;
        console.warn("[useLenderOverrides] Agency snapshot error:", err.code, err.message);
        setFirestoreAvailable(false);
        setError(err);
        agencyDone.current = true;
        checkBothReady();
      }
    );

    // ── Non-QM overrides ────────────────────────────────────────────────────
    const nonQMRef = collection(db, COLLECTIONS.NONQM_OVERRIDES);
    const nonQMQ   = query(nonQMRef, where("active", "==", true));

    unsubNonQM.current = onSnapshot(
      nonQMQ,
      (snapshot) => {
        if (cancelled) return;

        const overrides  = [];
        const ageUpdates = {};

        snapshot.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() };
          overrides.push(data);

          if (data.guidelineVersionRef && data.effectiveDate) {
            const ageDays = Math.floor(
              (Date.now() - new Date(data.effectiveDate).getTime()) /
              (1000 * 60 * 60 * 24)
            );
            ageUpdates[data.guidelineVersionRef] = ageDays;
          }
        });

        setNonQMOverrides(overrides);
        setGuidelineAgesDays((prev) => ({ ...prev, ...ageUpdates }));
        setFirestoreAvailable(true);
        nonQMDone.current = true;
        checkBothReady();

        if (process.env.NODE_ENV !== "production") {
          const realCount = overrides.filter((o) => o.dataSource === "REAL").length;
          console.log(
            `[useLenderOverrides] Non-QM overrides: ${overrides.length} docs ` +
            `(${realCount} real lenders replacing placeholders)`
          );
        }
      },
      (err) => {
        if (cancelled) return;
        console.warn("[useLenderOverrides] Non-QM snapshot error:", err.code, err.message);
        setFirestoreAvailable(false);
        setError(err);
        nonQMDone.current = true;
        checkBothReady();
      }
    );

    return () => {
      cancelled = true;
      unsubAgency.current?.();
      unsubNonQM.current?.();
    };
  }, [checkBothReady]);

  // Stale guidelines warning (derived)
  const hasStaleGuidelines = Object.values(guidelineAgesDays).some(
    (age) => age > 90
  );

  return {
    agencyOverrides,
    nonQMOverrides,
    loading,
    error,
    firestoreAvailable,
    guidelineAgesDays,
    hasStaleGuidelines,
  };
}


// ─── useDecisionRecordLog ─────────────────────────────────────────────────────
/**
 * Fetches the Decision Record history for a given loan file.
 * Used in the Decision Log view (future feature — wired but not displayed in v1.0).
 *
 * @param {string|null} loanId  — Loan file ID. Pass null to skip fetch.
 * @param {number}      limit_  — Max records to return (default: 20)
 */
export function useDecisionRecordLog(loanId = null, limit_ = 20) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!loanId) return;

    setLoading(true);
    setError(null);

    const ref = collection(db, COLLECTIONS.DECISION_RECORDS);
    const q   = query(
      ref,
      where("loanId", "==", loanId),
      orderBy("selectedAt", "desc"),
      limit(limit_)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const recs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setRecords(recs);
        setLoading(false);
      },
      (err) => {
        console.warn("[useDecisionRecordLog] Snapshot error:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [loanId, limit_]);

  return { records, loading, error };
}


// ─── useGuidelineHealth ───────────────────────────────────────────────────────
/**
 * One-shot fetch that checks the freshness of all lender guideline docs.
 * Returns a health report for display in an admin/settings view.
 * Not used in the main LenderMatch flow — available for future Guideline Manager.
 */
export function useGuidelineHealth() {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const run = async () => {
      try {
        const [agencySnap, nonQMSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.AGENCY_OVERRIDES)),
          getDocs(collection(db, COLLECTIONS.NONQM_OVERRIDES)),
        ]);

        const now    = Date.now();
        const health = [];

        const processSnap = (snap, universe) => {
          snap.forEach((doc) => {
            const d       = doc.data();
            const ageMs   = d.effectiveDate
              ? now - new Date(d.effectiveDate).getTime()
              : null;
            const ageDays = ageMs ? Math.floor(ageMs / (1000 * 60 * 60 * 24)) : null;
            health.push({
              id:                  doc.id,
              universe,
              lenderId:            d.id,
              profileName:         d.profileName || d.name,
              guidelineVersionRef: d.guidelineVersionRef,
              effectiveDate:       d.effectiveDate,
              ageDays,
              stale:               ageDays != null && ageDays > 90,
              dataSource:          d.dataSource,
              version:             d.version,
            });
          });
        };

        processSnap(agencySnap, "Agency");
        processSnap(nonQMSnap, "NonQM");

        setReport({
          items:          health,
          staleCount:     health.filter((h) => h.stale).length,
          realCount:      health.filter((h) => h.dataSource === "REAL").length,
          placeholderCount: health.filter((h) => h.dataSource === "PLACEHOLDER").length,
          checkedAt:      new Date().toISOString(),
        });
      } catch (err) {
        console.warn("[useGuidelineHealth] Error:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  return { report, loading, error };
}
