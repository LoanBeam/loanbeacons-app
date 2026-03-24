import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { resolveStage, getModuleCount } from '../utils/scenarioStages';

export function useScenarios() {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    // Matches original ScenarioList.jsx exactly:
    // collection(db, 'scenarios') — no userId filter, no auth gate
    const q = query(
      collection(db, 'scenarios'),
      orderBy('created_at', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            lbStage:     resolveStage(data),
            moduleCount: getModuleCount(data),
          };
        });
        setScenarios(docs);
        setLoading(false);
      },
      (err) => {
        console.error('useScenarios error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const updateStage = useCallback(async (scenarioId, newStage) => {
    try {
      await updateDoc(doc(db, 'scenarios', scenarioId), {
        lbStage:        newStage,
        stageUpdatedAt: serverTimestamp(),
        updated_at:     serverTimestamp(),
      });
    } catch (err) {
      console.error('updateStage error:', err);
      throw err;
    }
  }, []);

  const captureOutcome = useCallback(async (scenarioId, outcomeData) => {
    try {
      await updateDoc(doc(db, 'scenarios', scenarioId), {
        lbStage:        'Closed',
        stageUpdatedAt: serverTimestamp(),
        updated_at:     serverTimestamp(),
        closedOutcome: {
          ...outcomeData,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('captureOutcome error:', err);
      throw err;
    }
  }, []);

  const markDidNotClose = useCallback(async (scenarioId, reason) => {
    try {
      await updateDoc(doc(db, 'scenarios', scenarioId), {
        lbStage:           'Did Not Close',
        stageUpdatedAt:    serverTimestamp(),
        updated_at:        serverTimestamp(),
        didNotCloseReason: reason || '',
      });
    } catch (err) {
      console.error('markDidNotClose error:', err);
      throw err;
    }
  }, []);

  const stats = {
    total:      scenarios.length,
    inProgress: scenarios.filter((s) =>
      !['Qualifying', 'Closed', 'Did Not Close'].includes(s.lbStage)
    ).length,
    nonQM:      scenarios.filter((s) => (s.loanType || s.loanProgram) === 'Non-QM').length,
    hardMoney:  scenarios.filter((s) => (s.loanType || s.loanProgram) === 'Hard Money').length,
    decisionRecords: scenarios.filter((s) =>
      ['Active', 'Sealed'].includes(s.drStatus)
    ).length,
    pipeline: scenarios.reduce(
      (sum, s) => sum + Number(s.loanAmount || 0), 0
    ),
    staleCount: scenarios.filter((s) => {
      if (!['Submitted', 'Approved'].includes(s.lbStage)) return false;
      const ts = s.stageUpdatedAt?.toDate?.();
      if (!ts) return false;
      return Math.floor((Date.now() - ts.getTime()) / 86400000) >= 30;
    }).length,
  };

  return { scenarios, loading, error, stats, updateStage, captureOutcome, markDidNotClose };
}
