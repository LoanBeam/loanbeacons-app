import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

function RateBuydownCalculator() {
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
  const [loanTerm, setLoanTerm] = useState(360);
  const [baselineRate, setBaselineRate] = useState(0);

  // User inputs
  const [rateOptions, setRateOptions] = useState([
    { rate: '', points: '', price: '' }
  ]);
  const [planningHorizon, setPlanningHorizon] = useState(60); // months

  // Results
  const [computedOptions, setComputedOptions] = useState([]);
  const [showResults, setShowResults] = useState(false);

  // Load user's scenarios on mount
  useEffect(() => {
    loadScenarios();
  }, []);

  // Auto-load scenario if ID in URL
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
        setLoanTerm(data.term || 360);
        setBaselineRate(data.interestRate || 0);
        
        // Load previous analysis if exists
        if (data.rate_buydown_analysis) {
          setRateOptions(data.rate_buydown_analysis.rate_options || [{ rate: '', points: '', price: '' }]);
          setPlanningHorizon(data.rate_buydown_analysis.planning_horizon || 60);
        }
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
    }
  };

  const addRateOption = () => {
    setRateOptions([...rateOptions, { rate: '', points: '', price: '' }]);
  };

  const removeRateOption = (index) => {
    const newOptions = rateOptions.filter((_, i) => i !== index);
    setRateOptions(newOptions);
  };

  const updateRateOption = (index, field, value) => {
    const newOptions = [...rateOptions];
    newOptions[index][field] = value;
    setRateOptions(newOptions);
  };

  const calculateResults = () => {
    if (!loanAmount || !baselineRate || rateOptions.length === 0) {
      alert('Please load a scenario and enter at least one rate option');
      return;
    }

    // Calculate baseline payment
    const baselineMonthlyRate = baselineRate / 100 / 12;
    const baselinePayment = loanAmount * (baselineMonthlyRate * Math.pow(1 + baselineMonthlyRate, loanTerm)) / 
                            (Math.pow(1 + baselineMonthlyRate, loanTerm) - 1);

    const computed = rateOptions.map((option, index) => {
      const rate = parseFloat(option.rate);
      const price = parseFloat(option.price);
      
      if (!rate || isNaN(rate)) return null;

      // Calculate upfront cost
      const upfrontCostUsd = loanAmount * (price - 100) / 100;
      
      // Calculate monthly payment
      const monthlyRate = rate / 100 / 12;
      const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / 
                     (Math.pow(1 + monthlyRate, loanTerm) - 1);
      
      // Calculate savings
      const monthlySavings = baselinePayment - payment;
      
      // Break-even months
      const breakEvenMonths = monthlySavings > 0 
        ? Math.ceil(upfrontCostUsd / monthlySavings) 
        : 999;
      
      // Net savings at planning horizon
      const netSavingsHorizon = (monthlySavings * planningHorizon) - upfrontCostUsd;
      
      // Benefit score (0-100)
      let benefitScore = 50;
      if (monthlySavings > 0 && breakEvenMonths <= planningHorizon) {
        benefitScore = Math.min(100, 50 + (netSavingsHorizon / 1000));
      } else if (monthlySavings <= 0 && upfrontCostUsd > 0) {
        benefitScore = 0;
      }

      return {
        index,
        rate,
        price,
        upfrontCostUsd,
        payment,
        monthlySavings,
        breakEvenMonths,
        netSavingsHorizon,
        benefitScore
      };
    }).filter(o => o !== null);

    // Assign badges
    const validOptions = computed.filter(o => o.monthlySavings > 0);
    
    if (validOptions.length > 0) {
      // Best Long-Term
      const bestLongTerm = validOptions.reduce((prev, curr) => 
        curr.netSavingsHorizon > prev.netSavingsHorizon ? curr : prev
      );
      bestLongTerm.badge = 'Best Long-Term';

      // Best Short-Term (lowest break-even with positive savings)
      const bestShortTerm = validOptions.reduce((prev, curr) => 
        curr.breakEvenMonths < prev.breakEvenMonths ? curr : prev
      );
      if (bestShortTerm.index !== bestLongTerm.index) {
        bestShortTerm.badge = 'Best Short-Term';
      }

      // Lowest Cash-to-Close
      const lowestCash = computed.reduce((prev, curr) => 
        curr.upfrontCostUsd < prev.upfrontCostUsd ? curr : prev
      );
      if (!lowestCash.badge) {
        lowestCash.badge = 'Lowest Cash';
      }
    }

    // Mark "Avoid" options
    computed.forEach(option => {
      if (option.monthlySavings <= 0 && option.upfrontCostUsd > 0) {
        option.badge = 'Avoid';
      }
    });

    setComputedOptions(computed);
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
        rate_buydown_analysis: {
          baseline_rate: baselineRate,
          rate_options: rateOptions,
          planning_horizon: planningHorizon,
          computed_options: computedOptions,
          analyzed_at: new Date()
        },
        updated_at: new Date()
      });
      alert('Rate buydown analysis saved!');
    } catch (error) {
      console.error('Error saving results:', error);
      alert('Error saving results');
    }
  };

  const exportToPDF = () => {
    alert('PDF export feature coming soon!');
  };

  const getBenefitColor = (score) => {
    if (score >= 70) return 'bg-green-100 text-green-800';
    if (score >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getBadgeColor = (badge) => {
    if (badge === 'Best Long-Term') return 'bg-blue-500 text-white';
    if (badge === 'Best Short-Term') return 'bg-green-500 text-white';
    if (badge === 'Lowest Cash') return 'bg-purple-500 text-white';
    if (badge === 'Avoid') return 'bg-red-500 text-white';
    return 'bg-gray-500 text-white';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">💰</div>
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
            <div className="text-5xl">💰</div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Rate Buydown Calculator™
              </h1>
              <p className="text-gray-600">
                Compare rate options with break-even analysis and cost-benefit scoring
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
              Choose an active scenario to analyze rate options
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
                      ${scenario.loanAmount?.toLocaleString()} loan @ {scenario.interestRate}% • {scenario.term} months
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
                    ${loanAmount.toLocaleString()} loan • {loanTerm} months • Baseline rate: {baselineRate}%
                  </div>
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
                Rate Options
              </h2>

              {/* Planning Horizon */}
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

              {/* Rate Options Table */}
              <div className="space-y-4">
                {rateOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="font-semibold text-gray-600 w-8">
                      #{index + 1}
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Interest Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          value={option.rate}
                          onChange={(e) => updateRateOption(index, 'rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          placeholder="6.500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Points
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          value={option.points}
                          onChange={(e) => updateRateOption(index, 'points', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          placeholder="1.000"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Price (%)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          value={option.price}
                          onChange={(e) => updateRateOption(index, 'price', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          placeholder="100.000 or -1.500"
                        />
                      </div>
                    </div>
                    {rateOptions.length > 1 && (
                      <button
                        onClick={() => removeRateOption(index)}
                        className="text-red-600 hover:text-red-700 px-3 py-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={addRateOption}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  + Add Rate Option
                </button>
              </div>

              {/* Calculate Button */}
              <div className="mt-8 flex gap-4">
                <button
                  onClick={calculateResults}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold"
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
                    Comparison Results
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

                {/* Results Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">#</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Rate</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Upfront Cost</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Monthly P&I</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Monthly Savings</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Break-Even</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          Net Savings @ {planningHorizon}mo
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Benefit Score</th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Badge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedOptions.map((option) => (
                        <tr key={option.index} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4 text-sm">{option.index + 1}</td>
                          <td className="py-4 px-4 text-sm font-semibold">{option.rate.toFixed(3)}%</td>
                          <td className="py-4 px-4 text-sm text-right">
                            ${option.upfrontCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-sm text-right">
                            ${option.payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-4 px-4 text-sm text-right font-semibold ${
                            option.monthlySavings > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${option.monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-sm text-right">
                            {option.breakEvenMonths < 999 ? `${option.breakEvenMonths} mo` : 'N/A'}
                          </td>
                          <td className={`py-4 px-4 text-sm text-right font-semibold ${
                            option.netSavingsHorizon > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${option.netSavingsHorizon.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getBenefitColor(option.benefitScore)}`}>
                              {Math.round(option.benefitScore)}
                            </span>
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

                {/* Summary Notes */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-2">💡 Key Insights:</div>
                    <ul className="space-y-1 text-sm">
                      <li>• <strong>Best Long-Term:</strong> Maximizes net savings over {planningHorizon} months</li>
                      <li>• <strong>Best Short-Term:</strong> Lowest break-even period with positive savings</li>
                      <li>• <strong>Lowest Cash:</strong> Minimizes upfront cash needed</li>
                      <li>• <strong>Avoid:</strong> Negative monthly savings with upfront cost</li>
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

export default RateBuydownCalculator;
