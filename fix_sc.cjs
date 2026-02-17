const fs = require('fs');
const content = `import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const LoanTypeSection = ({ loanType, setLoanType, conventionalInvestor, setConventionalInvestor, loanPurpose, setLoanPurpose }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
    <h3 className="font-bold text-gray-800 mb-4">Loan Program Details</h3>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Loan Purpose *</label>
        <select value={loanPurpose} onChange={e=>setLoanPurpose(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Select Purpose</option>
          <option value="PURCHASE">Purchase</option>
          <option value="REFINANCE">Rate/Term Refinance</option>
          <option value="CASH_OUT">Cash-Out Refinance</option>
          <option value="STREAMLINE">Streamline Refinance</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Loan Type *</label>
        <select value={loanType} onChange={e=>{setLoanType(e.target.value);setConventionalInvestor('');}} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Select Type</option>
          <option value="FHA">FHA</option>
          <option value="VA">VA</option>
          <option value="CONVENTIONAL">Conventional</option>
          <option value="USDA">USDA</option>
          <option value="JUMBO">Jumbo</option>
          <option value="NON_QM">Non-QM</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      {loanType === 'CONVENTIONAL' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Conventional Investor * <span className="text-red-500">(Required)</span></label>
          <select value={conventionalInvestor} onChange={e=>setConventionalInvestor(e.target.value)} className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">Select Investor</option>
            <option value="FANNIE">Fannie Mae</option>
            <option value="FREDDIE">Freddie Mac</option>
          </select>
        </div>
      )}
      {loanType === 'FHA' && loanPurpose === 'STREAMLINE' && (
        <div className="col-span-2 mt-2 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-blue-800 text-sm">FHA Streamline Detected</div>
            <div className="text-xs text-blue-600 mt-0.5">Use FHA Streamline Intelligence for full eligibility & NTB analysis</div>
          </div>
          <a href="/fha-streamline" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all">Open Module</a>
        </div>
      )}
      {loanType === 'VA' && loanPurpose === 'STREAMLINE' && (
        <div className="col-span-2 mt-2 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-red-800 text-sm">VA IRRRL Detected</div>
            <div className="text-xs text-red-600 mt-0.5">Use VA IRRRL Intelligence for seasoning, NTB & recoupment analysis</div>
          </div>
          <span className="bg-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg">Coming Soon</span>
        </div>
      )}
    </div>
  </div>
);

function ScenarioCreator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

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
  const [loanPurpose, setLoanPurpose] = useState('');
  const [loanType, setLoanType] = useState('');
  const [conventionalInvestor, setConventionalInvestor] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEditMode) { loadScenario(); }
  }, [id]);

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
        setLoanPurpose(data.loanPurpose || '');
        setLoanType(data.loanType || '');
        setConventionalInvestor(data.conventionalInvestor || '');
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const scenarioData = {
      scenarioName: scenarioName || \`\${firstName} \${lastName} - \${streetAddress}\`,
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
      loan_type: loanType,
      conventional_investor: conventionalInvestor || null,
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
          <button onClick={() => navigate('/')} className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2">
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
            <h2 className="text-xl font-bold text-gray-900 mb-4"><span>👤</span> Borrower Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">First Name</label>
                <input type="text" value={firstName} onChange={e=>setFirstName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Last Name</label>
                <input type="text" value={lastName} onChange={e=>setLastName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4"><span>🏠</span> Property & Loan Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Loan Amount</label>
                <input type="number" value={loanAmount} onChange={e=>setLoanAmount(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="$" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Property Value</label>
                <input type="number" value={propertyValue} onChange={e=>setPropertyValue(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="$" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">LTV % (auto-calculated)</label>
                <input type="number" value={ltv} readOnly className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Interest Rate %</label>
                <input type="number" step="0.01" value={interestRate} onChange={e=>setInterestRate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Loan Term (months)</label>
                <select value={term} onChange={e=>setTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="360">30 Year (360)</option>
                  <option value="240">20 Year (240)</option>
                  <option value="180">15 Year (180)</option>
                  <option value="120">10 Year (120)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Property Type</label>
                <select value={propertyType} onChange={e=>setPropertyType(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option>Single Family</option>
                  <option>Condo</option>
                  <option>Multi-Family</option>
                  <option>Townhouse</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Occupancy</label>
                <select value={occupancy} onChange={e=>setOccupancy(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option>Primary Residence</option>
                  <option>Second Home</option>
                  <option>Investment Property</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4"><span>📍</span> Property Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Street Address</label>
                <input type="text" value={streetAddress} onChange={e=>setStreetAddress(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">City</label>
                <input type="text" value={city} onChange={e=>setCity(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">State</label>
                <input type="text" value={state} onChange={e=>setState(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Zip Code</label>
                <input type="text" value={zipCode} onChange={e=>setZipCode(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4"><span>📊</span> Borrower Financials</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Credit Score (FICO)</label>
                <input type="number" value={creditScore} onChange={e=>setCreditScore(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Monthly Gross Income</label>
                <input type="number" value={monthlyIncome} onChange={e=>setMonthlyIncome(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="$" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Monthly Debts</label>
                <input type="number" value={monthlyDebts} onChange={e=>setMonthlyDebts(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="$" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">DTI Ratio</label>
                <input type="number" value={dtiRatio} readOnly className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50" placeholder="%" />
              </div>
            </div>
          </div>

          <LoanTypeSection
            loanType={loanType}
            setLoanType={setLoanType}
            conventionalInvestor={conventionalInvestor}
            setConventionalInvestor={setConventionalInvestor}
            loanPurpose={loanPurpose}
            setLoanPurpose={setLoanPurpose}
          />

          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400">
              {loading ? 'Saving...' : isEditMode ? 'Update Scenario' : 'Create Scenario'}
            </button>
            <button type="button" onClick={() => navigate('/scenarios')} className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-300 font-semibold">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ScenarioCreator;`;
fs.writeFileSync('src/pages/ScenarioCreator.jsx', content);
console.log('ScenarioCreator.jsx rebuilt successfully!');
```

Save, close Notepad, then run:
```
node fix_sc.js