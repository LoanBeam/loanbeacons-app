import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { collection, query, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import ModuleNav from '../components/ModuleNav';
function MIOptimizer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scenarioIdFromUrl = searchParams.get('scenarioId');

  // Scenario data
  const [scenarios, setScenarios] = useState([]);
  const [search,   setSearch]   = useState('');
  const [showAll,  setShowAll]  = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [scenarioId, setScenarioId] = useState(scenarioIdFromUrl || '');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('MI_OPTIMIZER', {
        scenarioId,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error('Decision Record save failed:', e); }
    finally { setRecordSaving(false); }
  };
  const [loading, setLoading] = useState(true);

  // Auto-populated from scenario
  const [loanAmount, setLoanAmount] = useState(0);
  const [propertyValue, setPropertyValue] = useState(0);
  const [ltv, setLtv] = useState(0);
  const [creditScore, setCreditScore] = useState(0);
  const [interestRate, setInterestRate] = useState(0);
  const [loanTerm, setLoanTerm] = useState(360);

  // User inputs
  const [monthlyMIFactor, setMonthlyMIFactor] = useState('0.52'); // Default factor for 740 FICO, 85% LTV
  const [singlePremiumRate, setSinglePremiumRate] = useState('2.20'); // % of loan amount
  const [splitPremiumUpfront, setSplitPremiumUpfront] = useState('1.00'); // % of loan amount
  const [splitPremiumMonthlyFactor, setSplitPremiumMonthlyFactor] = useState('0.26');
  const [lpmiRateIncrease, setLpmiRateIncrease] = useState('0.25'); // Rate increase %
  const [planningHorizon, setPlanningHorizon] = useState(84); // months (7 years average)

  // Results
  const [computedOptions, setComputedOptions] = useState([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    loadScenarios();
  }, []);

  useEffect(() => {
    if (scenarioIdFromUrl && scenarios.length > 0) {
      loadScenarioData(scenarioIdFromUrl);
    }
  }, [scenarioIdFromUrl, scenarios]);

  const loadScenarios = async () => {
    try {
      const q = query(collection(db, 'scenarios'));
      const querySnapshot = await getDocs(q);
      const scenarioList = [];
      querySnapshot.forEach((doc) => {
        scenarioList.push({ id: doc.id, ...doc.data() });
      });
      setScenarios(scenarioList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading scenarios:', error);
      setLoading(false);
    }
  };

  const loadScenarioData = async (id) => {
    try {
      const docRef = doc(db, 'scenarios', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSelectedScenario({ id: docSnap.id, ...data });
        setScenarioId(id);
        
        // Auto-populate from scenario
        setLoanAmount(data.loanAmount || 0);
        setPropertyValue(data.propertyValue || 0);
        setLtv(data.ltv || 0);
        setCreditScore(data.creditScore || 0);
        setInterestRate(data.interestRate || 0);
        setLoanTerm(data.term || 360);
        
        // Load previous analysis if exists
        if (data.mi_optimizer_analysis) {
          setMonthlyMIFactor(data.mi_optimizer_analysis.monthly_mi_factor || '0.52');
          setSinglePremiumRate(data.mi_optimizer_analysis.single_premium_rate || '2.20');
          setSplitPremiumUpfront(data.mi_optimizer_analysis.split_premium_upfront || '1.00');
          setSplitPremiumMonthlyFactor(data.mi_optimizer_analysis.split_premium_monthly_factor || '0.26');
          setLpmiRateIncrease(data.mi_optimizer_analysis.lpmi_rate_increase || '0.25');
          setPlanningHorizon(data.mi_optimizer_analysis.planning_horizon || 84);
        }
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
    }
  };

  // Calculate months until MI drops off (at 78% LTV)
  const calculateMIDropOffMonths = () => {
    if (ltv <= 78) return 0; // Already below 78%
    
    const monthlyRate = interestRate / 100 / 12;
    const originalBalance = loanAmount;
    const targetBalance = propertyValue * 0.78;
    const monthlyPayment = originalBalance * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / 
                          (Math.pow(1 + monthlyRate, loanTerm) - 1);
    
    let balance = originalBalance;
    let months = 0;
    
    while (balance > targetBalance && months < loanTerm) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      balance -= principalPayment;
      months++;
    }
    
    return months;
  };

  const calculateResults = () => {
    if (!loanAmount || !interestRate || ltv < 80) {
      alert('MI is not required for loans with LTV below 80%');
      return;
    }

    const monthlyRate = interestRate / 100 / 12;
    const baseMonthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / 
                               (Math.pow(1 + monthlyRate, loanTerm) - 1);
    
    const miDropOffMonths = calculateMIDropOffMonths();
    const actualMIMonths = Math.min(miDropOffMonths, planningHorizon);

    const options = [];

    // Option 1: Monthly BPMI
    const monthlyMI = (loanAmount * parseFloat(monthlyMIFactor)) / 100 / 12;
    const totalMonthlyMICost = monthlyMI * actualMIMonths;
    options.push({
      type: 'Monthly BPMI',
      upfrontCost: 0,
      monthlyMI: monthlyMI,
      totalPayment: baseMonthlyPayment + monthlyMI,
      miDropOffMonths: miDropOffMonths,
      totalMICost: totalMonthlyMICost,
      effectiveCostAtHorizon: totalMonthlyMICost
    });

    // Option 2: Single Premium
    const singlePremiumCost = loanAmount * (parseFloat(singlePremiumRate) / 100);
    options.push({
      type: 'Single Premium',
      upfrontCost: singlePremiumCost,
      monthlyMI: 0,
      totalPayment: baseMonthlyPayment,
      miDropOffMonths: 0,
      totalMICost: singlePremiumCost,
      effectiveCostAtHorizon: singlePremiumCost
    });

    // Option 3: Split Premium
    const splitUpfrontCost = loanAmount * (parseFloat(splitPremiumUpfront) / 100);
    const splitMonthlyMI = (loanAmount * parseFloat(splitPremiumMonthlyFactor)) / 100 / 12;
    const totalSplitMonthlyCost = splitMonthlyMI * actualMIMonths;
    const totalSplitCost = splitUpfrontCost + totalSplitMonthlyCost;
    options.push({
      type: 'Split Premium',
      upfrontCost: splitUpfrontCost,
      monthlyMI: splitMonthlyMI,
      totalPayment: baseMonthlyPayment + splitMonthlyMI,
      miDropOffMonths: miDropOffMonths,
      totalMICost: totalSplitCost,
      effectiveCostAtHorizon: totalSplitCost
    });

    // Option 4: LPMI (Lender-Paid)
    const lpmiRate = interestRate + parseFloat(lpmiRateIncrease);
    const lpmiMonthlyRate = lpmiRate / 100 / 12;
    const lpmiMonthlyPayment = loanAmount * (lpmiMonthlyRate * Math.pow(1 + lpmiMonthlyRate, loanTerm)) / 
                               (Math.pow(1 + lpmiMonthlyRate, loanTerm) - 1);
    const lpmiExtraCost = lpmiMonthlyPayment - baseMonthlyPayment;
    const lpmiTotalExtraCost = lpmiExtraCost * planningHorizon; // LPMI never drops off
    options.push({
      type: 'LPMI (Lender-Paid)',
      upfrontCost: 0,
      monthlyMI: 0,
      rateIncrease: parseFloat(lpmiRateIncrease),
      newRate: lpmiRate,
      totalPayment: lpmiMonthlyPayment,
      extraMonthlyCost: lpmiExtraCost,
      miDropOffMonths: 999, // Never drops off
      totalMICost: lpmiTotalExtraCost,
      effectiveCostAtHorizon: lpmiTotalExtraCost
    });

    // Assign badges
    const lowestTotal = options.reduce((prev, curr) => 
      curr.effectiveCostAtHorizon < prev.effectiveCostAtHorizon ? curr : prev
    );
    lowestTotal.badge = 'Best Overall';

    const lowestMonthly = options.reduce((prev, curr) => 
      curr.totalPayment < prev.totalPayment ? curr : prev
    );
    if (!lowestMonthly.badge) {
      lowestMonthly.badge = 'Lowest Monthly';
    }

    const lowestUpfront = options.reduce((prev, curr) => 
      curr.upfrontCost < prev.upfrontCost ? curr : prev
    );
    if (!lowestUpfront.badge) {
      lowestUpfront.badge = 'Lowest Upfront';
    }

    setComputedOptions(options);
    setShowResults(true);
  };

  const saveResults = async () => {
    if (!scenarioId) {
      alert('No scenario selected');
      return;
    }

    try {
      const docRef = doc(db, 'scenarios', scenarioId);
      await updateDoc(docRef, {
        mi_optimizer_analysis: {
          monthly_mi_factor: monthlyMIFactor,
          single_premium_rate: singlePremiumRate,
          split_premium_upfront: splitPremiumUpfront,
          split_premium_monthly_factor: splitPremiumMonthlyFactor,
          lpmi_rate_increase: lpmiRateIncrease,
          planning_horizon: planningHorizon,
          computed_options: computedOptions,
          analyzed_at: new Date()
        },
        updated_at: new Date()
      });
      alert('MI Optimizer analysis saved!');
    } catch (error) {
      console.error('Error saving results:', error);
      alert('Error saving results');
    }
  };

  const exportToPDF = () => {
    alert('PDF export feature coming soon!');
  };

  const getBadgeColor = (badge) => {
    if (badge === 'Best Overall') return 'bg-blue-500 text-white';
    if (badge === 'Lowest Monthly') return 'bg-green-500 text-white';
    if (badge === 'Lowest Upfront') return 'bg-purple-500 text-white';
    return 'bg-gray-500 text-white';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ModuleNav moduleNumber={18} />
        <div className="text-center">
          <div className="text-4xl mb-4">🛡️</div>
          <div className="text-gray-600">Loading scenarios...</div>
        </div>
      </div>
    );
  }

  if (!selectedScenario) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">05</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 2 — Lender Fit</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">MI Optimizer™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Compare all four MI structures side by side — Monthly, Single, Split, and Lender-Paid. Find the lowest true cost of MI for every LTV and FICO combination.</p>
            <div className="flex flex-wrap gap-2">
              {['Monthly MI', 'Single Premium', 'Split Premium', 'LPMI', 'Break-Even Analysis', 'MI Elimination Path'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2>
            <p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => loadScenarioData(s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">
                  View all {filtered.length} scenarios
                </button>
              )}
              {showAll && filtered.length > 5 && (
                <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
          <div className="flex items-center gap-4">
            <div className="text-5xl">🛡️</div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                MI Optimizer™
              </h1>
              <p className="text-gray-600">
                Compare Monthly, Single, Split, and Lender-Paid MI options
              </p>
            </div>
          </div>
        </div>


        {/* Loaded Scenario Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-600 font-bold">✓</span>
                    <span className="font-semibold text-gray-900">
                      Working on: {selectedScenario.scenarioName}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    ${loanAmount.toLocaleString()} loan • LTV: {ltv}% • FICO: {creditScore} • Rate: {interestRate}%
                  </div>
                  {ltv < 80 && (
                    <div className="text-sm text-orange-600 font-semibold mt-1">
                      ⚠️ MI not required (LTV below 80%)
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedScenario(null);
                    setScenarioId('');
                    setShowResults(false);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Change Scenario
                </button>
              </div>
            </div>

            {/* Input Section */}
            <div className="bg-white rounded-lg shadow p-8 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                MI Factor Inputs
              </h2>

              <div className="mb-6 pb-6 border-b">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Planning Horizon (months)
                </label>
                <input
                  type="number"
                  value={planningHorizon}
                  onChange={(e) => setPlanningHorizon(parseInt(e.target.value))}
                  className="w-48 px-4 py-2 border border-gray-300 rounded-lg"
                  min="12"
                  max="360"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How long do you expect to keep this loan?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Monthly BPMI Factor (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={monthlyMIFactor}
                      onChange={(e) => setMonthlyMIFactor(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Annual MI rate (e.g., 0.52 for 0.52%)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Single Premium Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={singlePremiumRate}
                      onChange={(e) => setSinglePremiumRate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      One-time upfront MI (% of loan amount)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Split Premium Upfront (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={splitPremiumUpfront}
                      onChange={(e) => setSplitPremiumUpfront(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Split Premium Monthly Factor (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={splitPremiumMonthlyFactor}
                      onChange={(e) => setSplitPremiumMonthlyFactor(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LPMI Rate Increase (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={lpmiRateIncrease}
                  onChange={(e) => setLpmiRateIncrease(e.target.value)}
                  className="w-48 px-4 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Rate increase for lender-paid MI (typically 0.25%)
                </p>
              </div>

              <div className="mt-8 flex gap-4">
                <button
                  onClick={calculateResults}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold"
                  disabled={ltv < 80}
                >
                  Calculate & Compare
                </button>
              </div>
            </div>

            {/* Results Section */}
            {showResults && computedOptions.length > 0 && (
              <div className="bg-white rounded-lg shadow p-8 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    MI Comparison Results
                  </h2>
                  <div className="flex gap-3">
                    {scenarioId && (
                      <DecisionRecordBanner
                        recordId={savedRecordId}
                        moduleName="MI Optimizer™"
                        onSave={handleSaveToRecord}
                        saving={recordSaving}
                      />
                    )}
                    <button
                      onClick={saveResults}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
                    >
                      💾 Save to Scenario
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
                    >
                      📄 Export PDF
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">MI Type</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Upfront Cost</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Monthly MI</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Total Payment</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">MI Drops Off</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          Total MI Cost @ {planningHorizon}mo
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Badge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedOptions.map((option, index) => (
                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4 text-sm font-semibold">
                            {option.type}
                            {option.type === 'LPMI (Lender-Paid)' && (
                              <div className="text-xs text-gray-500 font-normal">
                                Rate: {option.newRate.toFixed(3)}% (+{option.rateIncrease}%)
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 text-sm text-right">
                            ${option.upfrontCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-sm text-right">
                            {option.monthlyMI > 0 ? 
                              `$${option.monthlyMI.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                              option.type === 'LPMI (Lender-Paid)' ? 
                                `+$${option.extraMonthlyCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                                '$0.00'
                            }
                          </td>
                          <td className="py-4 px-4 text-sm text-right font-semibold">
                            ${option.totalPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-sm text-right">
                            {option.miDropOffMonths < 999 ? `${option.miDropOffMonths} months` : 'Never'}
                          </td>
                          <td className="py-4 px-4 text-sm text-right font-semibold text-blue-600">
                            ${option.effectiveCostAtHorizon.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-center">
                            {option.badge && (
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getBadgeColor(option.badge)}`}>
                                {option.badge}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-2">💡 Key Insights:</div>
                    <ul className="space-y-1 text-sm">
                      <li>• <strong>Best Overall:</strong> Lowest total MI cost over your {planningHorizon}-month planning horizon</li>
                      <li>• <strong>Lowest Monthly:</strong> Smallest total monthly payment (P&I + MI)</li>
                      <li>• <strong>Lowest Upfront:</strong> Minimum cash needed at closing</li>
                      <li>• Monthly MI drops off at 78% LTV (based on scheduled payments)</li>
                      <li>• LPMI never drops off but may have tax benefits (consult tax advisor)</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
        </div>
</div>
  );
}

export default MIOptimizer;
