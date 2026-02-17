import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Student Loan Payment Rules (RULES_V1) ──────────────────────────
function computeStudentLoanPayment(tradeline, loanProgram, conventionalInvestor) {
  const bal = parseFloat(tradeline.balance) || 0;
  const documented = parseFloat(tradeline.documented_monthly_payment) || 0;
  const reported = parseFloat(tradeline.reported_monthly_payment) || 0;
  if (documented > 0) {
    return { method: 'DOCUMENTED_PAYMENT', payment: documented, note: 'Payment per borrower-provided servicer statement' };
  }
  if (reported > 0) {
    return { method: 'CREDIT_REPORT_PAYMENT', payment: reported, note: 'Payment per credit report' };
  }
  if (loanProgram === 'FHA') {
    return { method: 'FHA_0_5_PERCENT_BALANCE', payment: bal * 0.005, note: 'FHA guideline: 0.5% of outstanding balance (no payment on credit report)' };
  }
  if (loanProgram === 'VA') {
    return { method: 'VA_5_PERCENT_DIV_12', payment: (bal * 0.05) / 12, note: 'VA guideline: 5% of balance divided by 12 months' };
  }
  if (loanProgram === 'CONVENTIONAL') {
    if (conventionalInvestor === 'FANNIE') {
      if (tradeline.idr_verified_zero) {
        return { method: 'FANNIE_IDR_ZERO_ALLOWED', payment: 0, note: 'Fannie Mae: $0 IDR payment allowed – verified via documentation' };
      }
      return { method: 'FANNIE_1_PERCENT_BALANCE', payment: bal * 0.01, note: 'Fannie Mae: 1% of balance (no documented IDR payment)' };
    }
    if (conventionalInvestor === 'FREDDIE') {
      return { method: 'FREDDIE_0_5_PERCENT_BALANCE', payment: bal * 0.005, note: 'Freddie Mac: 0.5% of outstanding balance' };
    }
  }
  return { method: 'FHA_0_5_PERCENT_BALANCE', payment: bal * 0.005, note: '0.5% fallback applied' };
}

// ── Duplicate Detection ────────────────────────────────────────────
function detectDuplicates(tradelines) {
  const groups = [];
  const processed = new Set();
  const BAL_TOL = (a, b) => Math.abs(a - b) <= Math.max(25, Math.max(a, b) * 0.01);
  const PAY_TOL = (a, b) => Math.abs(a - b) <= Math.max(5, Math.max(a, b) * 0.01);

  // Find student loan SUMMARY vs CHILD groups first (conservative lock)
  const studentLoans = tradelines.filter(t => t.debt_type === 'STUDENT_LOAN');
  const byServicer = {};
  studentLoans.forEach(t => {
    const key = (t.creditor_name_normalized || t.creditor_name_raw || '').toLowerCase();
    if (!byServicer[key]) byServicer[key] = [];
    byServicer[key].push(t);
  });
  Object.values(byServicer).forEach(group => {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => b.balance - a.balance);
      const largest = sorted[0];
      const others = sorted.slice(1);
      const othersSum = others.reduce((s, t) => s + (parseFloat(t.balance) || 0), 0);
      const largestBal = parseFloat(largest.balance) || 0;
      if (BAL_TOL(largestBal, othersSum) || largestBal > othersSum * 0.8) {
        const gid = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        groups.push({
          dedupe_group_id: gid,
          group_type: 'STUDENT_SUMMARY_CHILD',
          confidence: 'MEDIUM',
          dedupe_reason_code: 'SUMMARY_CHILD_LOANS_DUPLICATE',
          recommended_action: 'EXCLUDE_SUMMARY_KEEP_CHILD',
          badge_label: 'Possible Duplicate (Student Loan Summary)',
          tooltip: 'We detected a student loan summary line that may duplicate individual child loans. Review recommended before underwriting.',
          members: [
            { tradeline_id: largest.tradeline_id, role: 'SUMMARY' },
            ...others.map(t => ({ tradeline_id: t.tradeline_id, role: 'CHILD' }))
          ],
          impact_preview: null
        });
        group.forEach(t => processed.add(t.tradeline_id));
      }
    }
  });

  // General duplicate detection
  for (let i = 0; i < tradelines.length; i++) {
    for (let j = i + 1; j < tradelines.length; j++) {
      const a = tradelines[i], b = tradelines[j];
      if (processed.has(a.tradeline_id) && processed.has(b.tradeline_id)) continue;
      let confidence = null, reason = null;
      const balA = parseFloat(a.balance) || 0, balB = parseFloat(b.balance) || 0;
      const payA = parseFloat(a.reported_monthly_payment) || 0, payB = parseFloat(b.reported_monthly_payment) || 0;
      if (a.account_hash && b.account_hash && a.account_hash === b.account_hash) {
        confidence = 'HIGH'; reason = 'ACCT_HASH_MATCH';
      } else if (a.account_last4 && b.account_last4 && a.account_last4 === b.account_last4 &&
        (a.creditor_name_raw || '').toLowerCase() === (b.creditor_name_raw || '').toLowerCase() &&
        BAL_TOL(balA, balB)) {
        confidence = 'HIGH'; reason = 'ACCT_LAST4_MATCH';
      } else if ((a.creditor_name_raw || '').toLowerCase() === (b.creditor_name_raw || '').toLowerCase() &&
        BAL_TOL(balA, balB) && PAY_TOL(payA, payB)) {
        confidence = 'MEDIUM'; reason = 'CREDITOR_BALANCE_PAYMENT_MATCH';
      } else if ((a.creditor_name_raw || '').toLowerCase() === (b.creditor_name_raw || '').toLowerCase() &&
        BAL_TOL(balA, balB)) {
        confidence = 'LOW'; reason = 'CREDITOR_BALANCE_MATCH';
      }
      if (confidence) {
        const gid = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const keep = balA >= balB ? a : b;
        const remove = balA >= balB ? b : a;
        groups.push({
          dedupe_group_id: gid,
          group_type: 'GENERAL',
          confidence,
          dedupe_reason_code: reason,
          recommended_action: confidence === 'HIGH' ? 'AUTO_REMOVED' : 'FLAGGED_REVIEW',
          badge_label: `Possible Duplicate (${confidence} confidence)`,
          tooltip: `Duplicate detected based on ${reason}`,
          members: [
            { tradeline_id: keep.tradeline_id, role: 'KEEP' },
            { tradeline_id: remove.tradeline_id, role: 'REMOVE' }
          ],
          impact_preview: null
        });
        processed.add(a.tradeline_id);
        processed.add(b.tradeline_id);
      }
    }
  }
  return groups;
}

const METHOD_BADGES = {
  DOCUMENTED_PAYMENT: { label: 'Documented', color: 'bg-green-100 text-green-800' },
  CREDIT_REPORT_PAYMENT: { label: 'Credit Report', color: 'bg-blue-100 text-blue-800' },
  FHA_0_5_PERCENT_BALANCE: { label: 'FHA 0.5%', color: 'bg-orange-100 text-orange-800' },
  VA_5_PERCENT_DIV_12: { label: 'VA 5%÷12', color: 'bg-purple-100 text-purple-800' },
  FANNIE_IDR_ZERO_ALLOWED: { label: 'Fannie $0 IDR', color: 'bg-green-100 text-green-800' },
  FANNIE_1_PERCENT_BALANCE: { label: 'Fannie 1%', color: 'bg-yellow-100 text-yellow-800' },
  FREDDIE_0_5_PERCENT_BALANCE: { label: 'Freddie 0.5%', color: 'bg-blue-100 text-blue-800' },
  CUSTOM_OVERRIDE: { label: 'Override', color: 'bg-red-100 text-red-800' },
};

const DEBT_TYPES = ['REVOLVING','INSTALLMENT','MORTGAGE','STUDENT_LOAN','COLLECTION','CHARGE_OFF','LEASE','ALIMONY_CHILD_SUPPORT','OTHER'];
const OVERRIDE_REASONS = [
  'Child loans do not sum to summary balance',
  'Servicer reporting inconsistency – verified separate obligations',
  'Underwriter direction',
  'Borrower provided documentation confirming separate loans',
  'Other (enter note)',
];

export default function DebtConsolidation() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [tradelines, setTradelines] = useState([]);
  const [dedupeGroups, setDedupeGroups] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTradeline, setNewTradeline] = useState({
    creditor_name_raw: '', debt_type: 'REVOLVING', balance: '', reported_monthly_payment: '',
    documented_monthly_payment: '', account_last4: '', status: 'OPEN', idr_verified_zero: false,
  });

  useEffect(() => { loadScenarios(); }, []);

  const loadScenarios = async () => {
    try {
      const snap = await getDocs(collection(db, 'scenarios'));
      setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const selectScenario = async (scenario) => {
    setSelectedScenario(scenario);
    try {
      const tlSnap = await getDocs(collection(db, 'scenarios', scenario.id, 'tradelines'));
      const tls = tlSnap.docs.map(d => ({ tradeline_id: d.id, ...d.data() }));
      const computed = tls.map(tl => {
        if (tl.debt_type === 'STUDENT_LOAN') {
          const result = computeStudentLoanPayment(tl, scenario.loan_type || scenario.loanProgram, scenario.conventional_investor);
          return { ...tl, student_qualifying_payment: result.payment, student_qual_payment_method: result.method, student_payment_reason_note: result.note };
        }
        return tl;
      });
      setTradelines(computed);
      runDedupe(computed);
    } catch (e) {
      console.error(e);
      setTradelines([]);
      setDedupeGroups([]);
    }
  };

  const runDedupe = (tls) => {
    const active = tls.filter(t => t.dedupe_action !== 'AUTO_REMOVED' && t.dedupe_action !== 'MANUAL_EXCLUDED');
    const groups = detectDuplicates(active);
    // Auto-remove HIGH confidence non-student-loan groups
    const updatedTls = [...tls];
    groups.forEach(g => {
      if (g.confidence === 'HIGH' && g.group_type !== 'STUDENT_SUMMARY_CHILD') {
        const removeId = g.members.find(m => m.role === 'REMOVE')?.tradeline_id;
        if (removeId) {
          const idx = updatedTls.findIndex(t => t.tradeline_id === removeId);
          if (idx > -1) updatedTls[idx] = { ...updatedTls[idx], dedupe_action: 'AUTO_REMOVED', dedupe_group_id: g.dedupe_group_id };
        }
        g.resolved = true;
      }
    });
    setTradelines(updatedTls);
    setDedupeGroups(groups);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const activeTradelines = tradelines.filter(t => t.dedupe_action !== 'AUTO_REMOVED' && t.dedupe_action !== 'MANUAL_EXCLUDED');
  const loanProgram = selectedScenario?.loan_type || selectedScenario?.loanProgram || '';
  const conventionalInvestor = selectedScenario?.conventional_investor || '';
  const monthlyIncome = parseFloat(selectedScenario?.monthlyIncome) || 0;

  const totalQualifyingPayments = activeTradelines.reduce((sum, t) => {
    const pay = t.debt_type === 'STUDENT_LOAN'
      ? (parseFloat(t.student_qualifying_payment) || 0)
      : (parseFloat(t.reported_monthly_payment) || 0);
    return sum + pay;
  }, 0);

  const grossDTI = monthlyIncome > 0 ? ((totalQualifyingPayments / monthlyIncome) * 100).toFixed(1) : '--';
  const flaggedGroups = dedupeGroups.filter(g => !g.resolved && (g.confidence === 'MEDIUM' || g.confidence === 'LOW' || g.group_type === 'STUDENT_SUMMARY_CHILD'));

  const logAudit = (event_type, subject_id, metadata) => {
    const entry = { event_type, subject_id, metadata, created_at: new Date() };
    setAuditLog(prev => [entry, ...prev]);
    if (selectedScenario) {
      addDoc(collection(db, 'scenarios', selectedScenario.id, 'audit_events'), entry).catch(console.error);
    }
  };

  const handleApplyRecommendation = (group) => {
    const summaryId = group.members.find(m => m.role === 'SUMMARY')?.tradeline_id;
    const removeId = group.members.find(m => m.role === 'REMOVE')?.tradeline_id;
    const targetId = summaryId || removeId;
    setTradelines(prev => prev.map(t =>
      t.tradeline_id === targetId
        ? { ...t, dedupe_action: 'MANUAL_EXCLUDED', dedupe_group_id: group.dedupe_group_id, user_decision_reason: 'User applied recommended action: excluded student loan summary line and retained child tradelines to prevent double counting.' }
        : t
    ));
    setDedupeGroups(prev => prev.map(g => g.dedupe_group_id === group.dedupe_group_id ? { ...g, resolved: true } : g));
    logAudit('DEDUPE_USER_APPLY_RECOMMENDATION', group.dedupe_group_id, { affected_tradeline_ids: group.members.map(m => m.tradeline_id) });
    showToast('Summary line excluded. Individual student loans retained. Audit log updated.');
    setActiveGroup(null);
  };

  const handleKeepBoth = (group) => {
    if (!overrideReason) { alert('Please select a reason for keeping both.'); return; }
    setTradelines(prev => prev.map(t =>
      group.members.some(m => m.tradeline_id === t.tradeline_id)
        ? { ...t, dedupe_action: 'OVERRIDDEN_KEEP_BOTH', dedupe_group_id: group.dedupe_group_id, user_decision_reason: `User retained both summary and child student loan tradelines. Reason: ${overrideReason}.` }
        : t
    ));
    setDedupeGroups(prev => prev.map(g => g.dedupe_group_id === group.dedupe_group_id ? { ...g, resolved: true } : g));
    logAudit('DEDUPE_USER_KEEP_BOTH', group.dedupe_group_id, { reason: overrideReason });
    showToast('Both tradelines retained. Decision logged for underwriting review.');
    setActiveGroup(null); setOverrideReason('');
  };

  const handleMarkNotDuplicate = (group) => {
    setTradelines(prev => prev.map(t =>
      group.members.some(m => m.tradeline_id === t.tradeline_id)
        ? { ...t, dedupe_action: 'NONE', dedupe_group_id: null }
        : t
    ));
    setDedupeGroups(prev => prev.map(g => g.dedupe_group_id === group.dedupe_group_id ? { ...g, resolved: true } : g));
    logAudit('DEDUPE_USER_MARK_NOT_DUPLICATE', group.dedupe_group_id, {});
    showToast('Tradeline marked as not duplicate. Audit log updated.');
    setActiveGroup(null);
  };

  const handleAddTradeline = () => {
    const id = 'tl_' + Date.now();
    let newTl = { ...newTradeline, tradeline_id: id, dedupe_action: 'NONE', source: 'MANUAL' };
    if (newTl.debt_type === 'STUDENT_LOAN') {
      const result = computeStudentLoanPayment(newTl, loanProgram, conventionalInvestor);
      newTl = { ...newTl, student_qualifying_payment: result.payment, student_qual_payment_method: result.method, student_payment_reason_note: result.note };
    }
    const updated = [...tradelines, newTl];
    setTradelines(updated);
    runDedupe(updated);
    setShowAddForm(false);
    setNewTradeline({ creditor_name_raw: '', debt_type: 'REVOLVING', balance: '', reported_monthly_payment: '', documented_monthly_payment: '', account_last4: '', status: 'OPEN', idr_verified_zero: false });
  };

  const handleSave = async () => {
    if (!selectedScenario) return;
    setSaving(true);
    try {
      for (const tl of tradelines) {
        const { tradeline_id, ...data } = tl;
        await setDoc(doc(db, 'scenarios', selectedScenario.id, 'tradelines', tradeline_id), { ...data, updated_at: new Date() });
      }
      const summary = {
        debt_consolidation_analysis: {
          completed_at: new Date(),
          total_monthly_obligations: totalQualifyingPayments,
          qualifying_dti: parseFloat(grossDTI) || 0,
          tradeline_count: tradelines.length,
          auto_removed_count: tradelines.filter(t => t.dedupe_action === 'AUTO_REMOVED').length,
          flagged_review_count: flaggedGroups.length,
          student_loan_count: tradelines.filter(t => t.debt_type === 'STUDENT_LOAN').length,
          student_loan_fallback_used: tradelines.some(t => t.student_qual_payment_method && t.student_qual_payment_method !== 'DOCUMENTED_PAYMENT' && t.student_qual_payment_method !== 'CREDIT_REPORT_PAYMENT'),
        }
      };
      await updateDoc(doc(db, 'scenarios', selectedScenario.id), summary);
      logAudit('SCENARIO_LIABILITIES_SAVED', selectedScenario.id, { tradeline_count: tradelines.length });
      showToast('Liability data saved to scenario successfully!');
    } catch (e) {
      console.error(e);
      showToast('Error saving data. Please try again.');
    } finally { setSaving(false); }
  };

  const handleExportLONotes = () => {
    const studentLoans = activeTradelines.filter(t => t.debt_type === 'STUDENT_LOAN');
    let content = 'STUDENT LOAN QUALIFYING PAYMENT RULES APPLIED\n';
    content += '(one entry per student loan tradeline)\n\n';
    studentLoans.forEach(tl => {
      content += `Creditor/Servicer: ${tl.creditor_name_raw} | Acct: ****${tl.account_last4 || 'N/A'}\n`;
      content += `Balance: $${parseFloat(tl.balance || 0).toLocaleString()}\n`;
      content += `Reported Payment: $${tl.reported_monthly_payment || 'N/A'}\n`;
      content += `Documented Payment: $${tl.documented_monthly_payment || 'N/A'}\n`;
      content += `Qualifying Payment Used: $${parseFloat(tl.student_qualifying_payment || 0).toFixed(2)}\n`;
      content += `Method: ${tl.student_qual_payment_method || 'N/A'}\n`;
      content += `Reason: ${tl.student_payment_reason_note || 'N/A'}\n\n`;
    });
    content += '\nDUPLICATE DEBT HANDLING\n';
    content += `Auto-removed duplicates: ${tradelines.filter(t => t.dedupe_action === 'AUTO_REMOVED').length}.\n`;
    content += `Flagged for review: ${flaggedGroups.length}.\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'LO_Notes_Debt_Consolidation.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBorrower = () => {
    let content = `DEBT REVIEW SUMMARY FOR ${selectedScenario?.firstName || ''} ${selectedScenario?.lastName || ''}\n\n`;
    content += 'We reviewed the debts listed on your credit report and built a payoff plan based on your selected loan program.\n\n';
    content += 'Credit reports sometimes list the same debt more than once. We removed duplicates to avoid counting the same payment twice.\n\n';
    content += 'Student loan payments can show as $0 on credit reports. When that happens, mortgage guidelines require using a standard estimated payment unless you provide a current statement showing the required payment.\n\n';
    if (activeTradelines.some(t => t.student_qual_payment_method && !['DOCUMENTED_PAYMENT','CREDIT_REPORT_PAYMENT'].includes(t.student_qual_payment_method))) {
      content += 'To use your exact student loan payment, please provide a current servicer statement or payment letter showing the required monthly payment.\n\n';
    }
    content += 'Next steps: Your loan officer will confirm any flagged items and finalize the payoff amounts before closing.\n';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Borrower_Summary_Debt_Consolidation.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── SCENARIO SELECTION SCREEN ──────────────────────────────────
  if (!selectedScenario) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4">
          <button onClick={() => navigate('/')} className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2 text-sm">← Back to Dashboard</button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-xl flex items-center justify-center text-white text-xl">💳</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Debt Consolidation Intelligence™</h1>
              <p className="text-sm text-gray-500">Liability Cleanup • DTI Accuracy • Duplicate Detection • Student Loan Rules</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 mt-4">
            <p className="text-sm text-blue-800 font-medium">Stage 1 — Pre-Structure & Initial Analysis</p>
            <p className="text-xs text-blue-600 mt-1">This module cleans your liability data BEFORE loan structuring begins. Accurate DTI flows into all downstream modules.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-800 mb-4">Select a Scenario</h2>
            <p className="text-sm text-gray-500 mb-4">Choose a scenario to analyze and clean liability data.</p>
            {scenarios.length === 0 ? (
              <p className="text-gray-400 text-sm">No scenarios found. Create one in Scenario Creator first.</p>
            ) : (
              <div className="space-y-3">
                {scenarios.map(s => (
                  <button key={s.id} onClick={() => selectScenario(s)}
                    className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all">
                    <div className="font-semibold text-gray-800">{s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ${parseFloat(s.loanAmount || 0).toLocaleString()} loan • LTV: {s.ltv || '--'}% •
                      Program: {s.loan_type || s.loanProgram || '--'}
                      {(s.loan_type === 'CONVENTIONAL' || s.loanProgram === 'CONVENTIONAL') && s.conventional_investor ? ` (${s.conventional_investor})` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN MODULE SCREEN ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-medium animate-pulse">
          {toast}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => setSelectedScenario(null)} className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 mb-1">← Back to Scenarios</button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-green-500 to-teal-600 rounded-xl flex items-center justify-center text-white">💳</div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Debt Consolidation Intelligence™</h1>
                <p className="text-xs text-gray-500">Liability Cleanup • DTI Accuracy • Duplicate Detection</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-800">🏠 Working on: {selectedScenario.scenarioName || `${selectedScenario.firstName || ''} ${selectedScenario.lastName || ''}`}</div>
            <div className="text-xs text-gray-500">${parseFloat(selectedScenario.loanAmount || 0).toLocaleString()} loan • LTV: {selectedScenario.ltv || '--'}% • Program: {loanProgram || '--'}{conventionalInvestor ? ` (${conventionalInvestor})` : ''}</div>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{activeTradelines.length}</div>
            <div className="text-xs text-gray-500 mt-1">Active Tradelines</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">${totalQualifyingPayments.toFixed(0)}</div>
            <div className="text-xs text-gray-500 mt-1">Monthly Obligations</div>
          </div>
          <div className={`rounded-xl border p-4 text-center ${parseFloat(grossDTI) > 43 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className={`text-2xl font-bold ${parseFloat(grossDTI) > 43 ? 'text-red-600' : 'text-gray-900'}`}>{grossDTI}%</div>
            <div className="text-xs text-gray-500 mt-1">Qualifying DTI</div>
          </div>
          <div className={`rounded-xl border p-4 text-center ${flaggedGroups.length > 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
            <div className={`text-2xl font-bold ${flaggedGroups.length > 0 ? 'text-yellow-700' : 'text-gray-900'}`}>{flaggedGroups.length}</div>
            <div className="text-xs text-gray-500 mt-1">Flagged for Review</div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Left: Debt Table */}
          <div className="flex-1 min-w-0">
            {/* Flagged Duplicate Banners */}
            {flaggedGroups.map(g => (
              <div key={g.dedupe_group_id} className="mb-4 bg-yellow-50 border border-yellow-300 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-yellow-800 text-sm">⚠️ {g.badge_label}</div>
                    <div className="text-xs text-yellow-700 mt-0.5">{g.tooltip}</div>
                    {monthlyIncome > 0 && (
                      <div className="text-xs text-yellow-600 mt-1">
                        📊 Current DTI: {grossDTI}%
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActiveGroup(activeGroup?.dedupe_group_id === g.dedupe_group_id ? null : g)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold px-3 py-2 rounded-lg ml-4">
                    {activeGroup?.dedupe_group_id === g.dedupe_group_id ? 'Hide' : 'Review'}
                  </button>
                </div>
                {/* One-Click Resolve Panel */}
                {activeGroup?.dedupe_group_id === g.dedupe_group_id && (
                  <div className="mt-4 pt-4 border-t border-yellow-200">
                    <div className="font-semibold text-gray-800 text-sm mb-2">Student Loan Duplicate Review</div>
                    <div className="text-xs text-gray-600 mb-1">This credit report shows a summary student loan and individual child loans under the same servicer. Counting both may inflate your DTI.</div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs">
                      <div className="font-semibold text-blue-800">Recommended Action</div>
                      <div className="text-blue-700 mt-0.5">Use individual child loans and exclude the summary line to avoid double-counting.</div>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">Reason for Decision (Required for overrides)</label>
                      <select value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs">
                        <option value="">Select reason...</option>
                        {OVERRIDE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApplyRecommendation(g)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-lg">
                        Apply Recommendation
                      </button>
                      <button onClick={() => handleKeepBoth(g)}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold py-2 px-3 rounded-lg">
                        Keep Both
                      </button>
                      <button onClick={() => handleMarkNotDuplicate(g)}
                        className="flex-1 bg-white hover:bg-gray-50 border border-gray-300 text-gray-600 text-xs font-bold py-2 px-3 rounded-lg">
                        Mark Not Duplicate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Debt Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800">Liability Table</h2>
                <button onClick={() => setShowAddForm(!showAddForm)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
                  + Add Tradeline
                </button>
              </div>

              {/* Add Form */}
              {showAddForm && (
                <div className="bg-blue-50 border-b border-blue-200 p-4">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Creditor Name *</label>
                      <input value={newTradeline.creditor_name_raw} onChange={e => setNewTradeline(p => ({ ...p, creditor_name_raw: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="e.g. Chase" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Debt Type *</label>
                      <select value={newTradeline.debt_type} onChange={e => setNewTradeline(p => ({ ...p, debt_type: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                        {DEBT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Balance ($) *</label>
                      <input type="number" value={newTradeline.balance} onChange={e => setNewTradeline(p => ({ ...p, balance: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Reported Monthly Pmt</label>
                      <input type="number" value={newTradeline.reported_monthly_payment} onChange={e => setNewTradeline(p => ({ ...p, reported_monthly_payment: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="0" />
                    </div>
                    {newTradeline.debt_type === 'STUDENT_LOAN' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Documented Monthly Pmt</label>
                        <input type="number" value={newTradeline.documented_monthly_payment} onChange={e => setNewTradeline(p => ({ ...p, documented_monthly_payment: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="0" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Acct Last 4</label>
                      <input value={newTradeline.account_last4} onChange={e => setNewTradeline(p => ({ ...p, account_last4: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="1234" maxLength={4} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddTradeline} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg">Add Tradeline</button>
                    <button onClick={() => setShowAddForm(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Creditor</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Type</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold">Balance</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold">Qualifying Pmt</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">Method</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tradelines.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No tradelines yet. Click "+ Add Tradeline" to begin.</td></tr>
                    ) : tradelines.map(tl => {
                      const isExcluded = tl.dedupe_action === 'AUTO_REMOVED' || tl.dedupe_action === 'MANUAL_EXCLUDED';
                      const qualPay = tl.debt_type === 'STUDENT_LOAN'
                        ? parseFloat(tl.student_qualifying_payment || 0)
                        : parseFloat(tl.reported_monthly_payment || 0);
                      const badge = tl.student_qual_payment_method ? METHOD_BADGES[tl.student_qual_payment_method] : null;
                      const isFlagged = dedupeGroups.some(g => !g.resolved && g.members.some(m => m.tradeline_id === tl.tradeline_id));
                      return (
                        <tr key={tl.tradeline_id} className={`${isExcluded ? 'opacity-40 bg-gray-50' : isFlagged ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{tl.creditor_name_raw}</div>
                            {tl.account_last4 && <div className="text-xs text-gray-400">****{tl.account_last4}</div>}
                            {isFlagged && !isExcluded && <span className="inline-block mt-1 bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-semibold">⚠️ Review</span>}
                            {isExcluded && <span className="inline-block mt-1 bg-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded-full">Excluded</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{(tl.debt_type || '').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-800">${parseFloat(tl.balance || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-800">
                            {isExcluded ? <span className="text-gray-400 line-through">${qualPay.toFixed(0)}</span> : `$${qualPay.toFixed(0)}`}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {badge ? (
                              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold ${badge.color}`}>{badge.label}</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold ${
                              tl.status === 'OPEN' || tl.status === 'IN_REPAYMENT' ? 'bg-green-100 text-green-700' :
                              tl.status === 'CLOSED' || tl.status === 'TRANSFERRED' ? 'bg-gray-100 text-gray-500' :
                              'bg-gray-100 text-gray-600'}`}>
                              {tl.status || 'OPEN'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl disabled:bg-gray-400 text-sm">
                {saving ? 'Saving...' : '💾 Save to Scenario'}
              </button>
              <button onClick={handleExportLONotes}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-3 rounded-xl text-sm">
                📄 Export LO Notes
              </button>
              <button onClick={handleExportBorrower}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-3 rounded-xl text-sm">
                📋 Borrower Summary
              </button>
            </div>
          </div>

          {/* Right: Audit Log */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">📋 Audit Log</h3>
              {auditLog.length === 0 ? (
                <p className="text-xs text-gray-400">No actions recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {auditLog.map((e, i) => (
                    <div key={i} className="text-xs bg-gray-50 rounded-lg p-2">
                      <div className="font-semibold text-gray-700">{e.event_type.replace(/_/g, ' ')}</div>
                      <div className="text-gray-400 mt-0.5">{new Date(e.created_at).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Student Loan Rules Reference */}
            {loanProgram && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">📐 Active Rules ({loanProgram})</h3>
                <div className="text-xs text-gray-600 space-y-1.5">
                  {loanProgram === 'FHA' && <div>• Student loans: <strong>0.5% of balance</strong> fallback</div>}
                  {loanProgram === 'VA' && <div>• Student loans: <strong>5% ÷ 12</strong> fallback</div>}
                  {loanProgram === 'CONVENTIONAL' && conventionalInvestor === 'FANNIE' && <>
                    <div>• IDR $0 allowed <strong>with verification</strong></div>
                    <div>• Otherwise: <strong>1% of balance</strong></div>
                  </>}
                  {loanProgram === 'CONVENTIONAL' && conventionalInvestor === 'FREDDIE' && <div>• Student loans: <strong>0.5% of balance</strong></div>}
                  <div className="pt-1 border-t border-gray-100 mt-1">• HIGH confidence → auto-removed</div>
                  <div>• MEDIUM/LOW → flagged for review</div>
                  <div>• Student loan SUMMARY/CHILD → always flagged</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
