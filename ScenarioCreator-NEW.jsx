import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

function ScenarioCreator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  // Form state
  const [scenarioName, setScenarioName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [ltv, setLtv] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [term, setTerm] = useState('360');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [propertyType, setPropertyType] = useState('Single Family');
  const [occupancy, setOccupancy] = useState('Primary Residence');
  const [creditScore, setCreditScore] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyDebts, setMonthlyDebts] = useState('');
  const [dtiRatio, setDtiRatio] = useState('');
  const [loanPurpose, setLoanPurpose] = useState('Purchase');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      loadScenario();
    }
  }, [id]);

  const loadScenario = async () => {
    try {
      const docRef = doc(db, 'scenarios', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setScenarioName(data.scenarioName || '');
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setLoanAmount(data.loanAmount || '');
        setPropertyValue(data.propertyValue || '');
        setLtv(data.ltv || '');
        setInterestRate(data.interestRate || '');
        setTerm(data.term || '360');
        setStreetAddress(data.streetAddress || '');
        setCity(data.city || '');
        setState(data.state || '');
        setZipCode(data.zipCode || '');
        setPropertyType(data.propertyType || 'Single Family');
        setOccupancy(data.occupancy || 'Primary Residence');
        setCreditScore(data.creditScore || '');
        setMonthlyIncome(data.monthlyIncome || '');
        setMonthlyDebts(data.monthlyDebts || '');
        setDtiRatio(data.dtiRatio || '');
        setLoanPurpose(data.loanPurpose || 'Purchase');
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
    }
  };

  useEffect(() => {
    if (loanAmount && propertyValue) {
      const calculatedLtv = ((parseFloat(loanAmount) / parseFloat(propertyValue)) * 100).toFixed(2);
      setLtv(calculatedLtv);
    }
  }, [loanAmount, propertyValue]);

  useEffect(() => {
    if (monthlyDebts && monthlyIncome) {
      const calculatedDti = ((parseFloat(monthlyDebts) / parseFloat(monthlyIncome)) * 100).toFixed(2);
      setDtiRatio(calculatedDti);
    }
  }, [monthlyDebts, monthlyIncome]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const scenarioData = {
      scenarioName: scenarioName || `${firstName} ${lastName} - ${streetAddress}`,
      firstName,
      lastName,
      loanAmount: parseFloat(loanAmount),
      propertyValue: parseFloat(propertyValue),
      ltv: parseFloat(ltv),
      interestRate: parseFloat(interestRate),
      term: parseInt(term),
      streetAddress,
      city,
      state,
      zipCode,
      propertyType,
      occupancy,
      creditScore: parseInt(creditScore),
      monthlyIncome: parseFloat(monthlyIncome),
      monthlyDebts: parseFloat(monthlyDebts),
      dtiRatio: parseFloat(dtiRatio),
      loanPurpose,
      updated_at: new Date()
    };

    try {
      if (isEditMode) {
        const docRef = doc(db, 'scenarios', id);
        await updateDoc(docRef, scenarioData);
        alert('Scenario updated successfully!');
      } else {
        scenarioData.created_at = new Date();
        await addDoc(collection(db, 'scenarios'), scenarioData);
        alert('Scenario created successfully!');
      }
      navigate('/scenarios');
    } catch (error) {
      console.error('Error saving scenario:', error);
      alert('Error saving scenario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Scenario' : 'Create New Scenario'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isEditMode ? 'Update the loan scenario details below.' : 'Build and compare multiple loan scenarios side by side.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Scenario Name</h2>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g., Smith Purchase - 123 Main St (auto-generated if left blank)"
            />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>👤</span>
              Borrower Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>💰</span>
              Loan Details
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loan Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Property Value
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={propertyValue}
                    onChange={(e) => setPropertyValue(e.target.value)}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LTV
                </label>
                <input
                  type="text"
                  value={ltv}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="6.500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the baseline interest rate for this scenario
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loan Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="360">30 Years (360 months)</option>
                  <option value="300">25 Years (300 months)</option>
                  <option value="240">20 Years (240 months)</option>
                  <option value="180">15 Years (180 months)</option>
                  <option value="120">10 Years (120 months)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🏠</span>
              Property Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address
                </label>
                <input
                  type="text"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    maxLength="2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    maxLength="5"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Property Type
                  </label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option>Single Family</option>
                    <option>Condo</option>
                    <option>Townhouse</option>
                    <option>Multi-Family (2-4 units)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Occupancy
                  </label>
                  <select
                    value={occupancy}
                    onChange={(e) => setOccupancy(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option>Primary Residence</option>
                    <option>Second Home</option>
                    <option>Investment Property</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>📊</span>
              Borrower Financials
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Credit Score (FICO)
                </label>
                <input
                  type="number"
                  value={creditScore}
                  onChange={(e) => setCreditScore(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Gross Income
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Debts
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={monthlyDebts}
                    onChange={(e) => setMonthlyDebts(e.target.value)}
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                DTI Ratio
              </label>
              <input
                type="text"
                value={`${dtiRatio}%`}
                readOnly
                className="w-48 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🎯</span>
              Loan Purpose
            </h2>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="Purchase"
                  checked={loanPurpose === 'Purchase'}
                  onChange={(e) => setLoanPurpose(e.target.value)}
                  className="w-4 h-4"
                />
                <span>Purchase</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="Refinance"
                  checked={loanPurpose === 'Refinance'}
                  onChange={(e) => setLoanPurpose(e.target.value)}
                  className="w-4 h-4"
                />
                <span>Refinance</span>
              </label>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400"
            >
              {loading ? 'Saving...' : isEditMode ? 'Update Scenario' : 'Create Scenario'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/scenarios')}
              className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Cancel
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

export default ScenarioCreator;