import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

const PROPERTY_TYPES = ['Single Family', 'Condo', 'Townhome', '2-4 Unit']
const OCCUPANCY_TYPES = ['Primary Residence', 'Second Home', 'Investment']

const initialFormData = {
  borrower1FirstName: '',
  borrower1LastName: '',
  borrower2FirstName: '',
  borrower2LastName: '',
  loanAmount: '',
  propertyValue: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  propertyType: '',
  occupancy: '',
  creditScore: '',
  monthlyIncome: '',
  monthlyDebts: '',
  loanPurpose: 'Purchase',
}

function ScenarioCreator() {
  const location = useLocation()
  const navigate = useNavigate()
  const editScenario = location.state?.editScenario || null
  const isEditing = !!editScenario

  const [formData, setFormData] = useState(() => {
    if (editScenario) {
      return {
        borrower1FirstName: editScenario.borrower1FirstName || '',
        borrower1LastName: editScenario.borrower1LastName || '',
        borrower2FirstName: editScenario.borrower2FirstName || '',
        borrower2LastName: editScenario.borrower2LastName || '',
        loanAmount: editScenario.loanAmount?.toString() || '',
        propertyValue: editScenario.propertyValue?.toString() || '',
        street: editScenario.street || '',
        city: editScenario.city || '',
        state: editScenario.state || '',
        zip: editScenario.zip || '',
        propertyType: editScenario.propertyType || '',
        occupancy: editScenario.occupancy || '',
        creditScore: editScenario.creditScore?.toString() || '',
        monthlyIncome: editScenario.monthlyIncome?.toString() || '',
        monthlyDebts: editScenario.monthlyDebts?.toString() || '',
        loanPurpose: editScenario.loanPurpose || 'Purchase',
      }
    }
    return initialFormData
  })
  const [showBorrower2, setShowBorrower2] = useState(
    !!(editScenario?.borrower2FirstName || editScenario?.borrower2LastName)
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success' | 'error', text: string }

  const loanAmount = parseFloat(formData.loanAmount) || 0
  const propertyValue = parseFloat(formData.propertyValue) || 0
  const ltv = propertyValue > 0 ? ((loanAmount / propertyValue) * 100).toFixed(2) : '0.00'

  const monthlyIncome = parseFloat(formData.monthlyIncome) || 0
  const monthlyDebts = parseFloat(formData.monthlyDebts) || 0
  const dti = monthlyIncome > 0 ? ((monthlyDebts / monthlyIncome) * 100).toFixed(2) : '0.00'

  function handleChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const scenarioData = {
      ...formData,
      ltv: parseFloat(ltv),
      dti: parseFloat(dti),
      loanAmount,
      propertyValue,
      monthlyIncome,
      monthlyDebts,
      creditScore: parseInt(formData.creditScore) || 0,
    }

    try {
      if (isEditing) {
        const { id, createdAt, ...existing } = editScenario
        await updateDoc(doc(db, 'scenarios', editScenario.id), {
          ...scenarioData,
          updatedAt: serverTimestamp(),
        })
        navigate(`/scenario/${editScenario.id}`)
      } else {
        const docRef = await addDoc(collection(db, 'scenarios'), {
          ...scenarioData,
          status: 'draft',
          createdAt: serverTimestamp(),
        })
        console.log('Scenario saved with ID:', docRef.id)
        setMessage({ type: 'success', text: `Scenario saved successfully! (ID: ${docRef.id})` })
        setFormData(initialFormData)
        setShowBorrower2(false)
      }
    } catch (error) {
      console.error('Error saving scenario:', error)
      setMessage({ type: 'error', text: `Failed to save scenario: ${error.message}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex-1 bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          {isEditing && (
            <Link
              to={`/scenario/${editScenario.id}`}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm inline-flex items-center gap-1 mb-3"
            >
              &larr; Back to Scenario
            </Link>
          )}
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing ? 'Edit Scenario' : 'Scenario Creator'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isEditing ? 'Update the loan scenario details below.' : 'Build a complete loan scenario for your borrower.'}
          </p>
        </div>

        {/* Success / Error Message */}
        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <span>{message.text}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="ml-4 text-lg leading-none opacity-60 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Borrower Information */}
          <Section title="Borrower Information" icon="👤">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="First Name" name="borrower1FirstName" value={formData.borrower1FirstName} onChange={handleChange} required />
              <Input label="Last Name" name="borrower1LastName" value={formData.borrower1LastName} onChange={handleChange} required />
            </div>

            {!showBorrower2 ? (
              <button
                type="button"
                onClick={() => setShowBorrower2(true)}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> Add Co-Borrower
              </button>
            ) : (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">Co-Borrower (Borrower 2)</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBorrower2(false)
                      setFormData(prev => ({ ...prev, borrower2FirstName: '', borrower2LastName: '' }))
                    }}
                    className="text-sm text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="First Name" name="borrower2FirstName" value={formData.borrower2FirstName} onChange={handleChange} />
                  <Input label="Last Name" name="borrower2LastName" value={formData.borrower2LastName} onChange={handleChange} />
                </div>
              </div>
            )}
          </Section>

          {/* Loan Details */}
          <Section title="Loan Details" icon="💰">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Loan Amount" name="loanAmount" value={formData.loanAmount} onChange={handleChange} prefix="$" type="number" min="0" required />
              <Input label="Property Value" name="propertyValue" value={formData.propertyValue} onChange={handleChange} prefix="$" type="number" min="0" required />
              <ReadOnlyField label="LTV" value={`${ltv}%`} highlight={parseFloat(ltv) > 95} />
            </div>
          </Section>

          {/* Property Information */}
          <Section title="Property Information" icon="🏠">
            <div className="grid grid-cols-1 gap-4">
              <Input label="Street Address" name="street" value={formData.street} onChange={handleChange} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <Input label="City" name="city" value={formData.city} onChange={handleChange} required />
              <Input label="State" name="state" value={formData.state} onChange={handleChange} maxLength={2} placeholder="e.g. CA" required />
              <Input label="ZIP Code" name="zip" value={formData.zip} onChange={handleChange} maxLength={5} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Select label="Property Type" name="propertyType" value={formData.propertyType} onChange={handleChange} options={PROPERTY_TYPES} required />
              <Select label="Occupancy" name="occupancy" value={formData.occupancy} onChange={handleChange} options={OCCUPANCY_TYPES} required />
            </div>
          </Section>

          {/* Borrower Financials */}
          <Section title="Borrower Financials" icon="📊">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Credit Score (FICO)" name="creditScore" value={formData.creditScore} onChange={handleChange} type="number" min="300" max="850" required />
              <Input label="Monthly Gross Income" name="monthlyIncome" value={formData.monthlyIncome} onChange={handleChange} prefix="$" type="number" min="0" required />
              <Input label="Monthly Debts" name="monthlyDebts" value={formData.monthlyDebts} onChange={handleChange} prefix="$" type="number" min="0" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <ReadOnlyField label="DTI Ratio" value={`${dti}%`} highlight={parseFloat(dti) > 50} />
            </div>
          </Section>

          {/* Loan Purpose */}
          <Section title="Loan Purpose" icon="🎯">
            <div className="flex gap-6">
              <RadioOption
                label="Purchase"
                name="loanPurpose"
                value="Purchase"
                checked={formData.loanPurpose === 'Purchase'}
                onChange={handleChange}
              />
              <RadioOption
                label="Refinance"
                name="loanPurpose"
                value="Refinance"
                checked={formData.loanPurpose === 'Refinance'}
                onChange={handleChange}
              />
            </div>
          </Section>

          {/* Save Button */}
          <div className="pt-4 pb-8">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold px-10 py-3 rounded-lg transition-colors text-lg shadow-md hover:shadow-lg"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Scenario' : 'Save Scenario'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Input({ label, prefix, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className={prefix ? 'relative' : ''}>
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{prefix}</span>
        )}
        <input
          {...props}
          className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
            prefix ? 'pl-7' : ''
          }`}
        />
      </div>
    </div>
  )
}

function Select({ label, options, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        {...props}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

function ReadOnlyField({ label, value, highlight }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className={`w-full rounded-lg px-3 py-2 font-semibold text-lg ${
        highlight
          ? 'bg-red-50 text-red-700 border border-red-200'
          : 'bg-blue-50 text-blue-800 border border-blue-200'
      }`}>
        {value}
      </div>
    </div>
  )
}

function RadioOption({ label, ...props }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="radio"
        {...props}
        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-gray-700 font-medium group-hover:text-blue-700 transition-colors">{label}</span>
    </label>
  )
}

export default ScenarioCreator
