import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

function MIOptimizer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scenarioIdFromUrl = searchParams.get('scenarioId');

  // Scenario data
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [scenarioId, setScenarioId] = useState(scenarioIdFromUrl || '');
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
        <div className="text-center">
          <div className="text-4xl mb-4">🛡️</div>
          <div className="text-gray-600">Loading scenarios...</div>
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

        {/* Scenario Selector */}
        {!selectedScenario ? (
          <div className="bg-white rounded-lg shadow p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Select a Scenario
            </h2>
            <p className="text-gray-600 mb-6">
              Choose an active scenario to analyze MI options
            </p>
            
            {scenarios.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">No scenarios found</div>
                <button
                  onClick={() => navigate('/scenario-creator')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                >
                  Create New Scenario
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => loadScenarioData(scenario.id)}
                    className="w-full text-left bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-colors"
                  >
                    <div className="font-semibold text-gray-900">
                      {scenario.scenarioName || 'Unnamed Scenario'}
                    </div>
                    <div className="text-sm text-gray-600">
                      ${scenario.loanAmount?.toLocaleString()} • LTV: {scenario.ltv}% • FICO: {scenario.creditScore}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}

      </div>
    </div>
  );
}

export default MIOptimizer;
