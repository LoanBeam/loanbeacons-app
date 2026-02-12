import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

function ScenarioList() {
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchScenarios() {
      try {
        const q = query(collection(db, 'scenarios'), orderBy('createdAt', 'desc'))
        const snapshot = await getDocs(q)
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))
        setScenarios(docs)
      } catch (err) {
        console.error('Error fetching scenarios:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchScenarios()
  }, [])

  return (
    <main className="flex-1 bg-gray-50 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Scenarios</h1>
            <p className="text-gray-500 mt-1">
              {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''} saved
            </p>
          </div>
          <Link
            to="/scenario-creator"
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold px-6 py-3 rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            <span className="text-xl leading-none">+</span>
            New Scenario
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
            <p className="text-gray-500 mt-4">Loading scenarios...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-medium">
            Failed to load scenarios: {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && scenarios.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
            <p className="text-5xl mb-4">📋</p>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No scenarios yet</h2>
            <p className="text-gray-500 mb-6">Create your first loan scenario to get started.</p>
            <Link
              to="/scenario-creator"
              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold px-6 py-3 rounded-lg transition-colors"
            >
              <span className="text-xl leading-none">+</span>
              Create Scenario
            </Link>
          </div>
        )}

        {/* Scenario Cards */}
        {!loading && !error && scenarios.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {scenarios.map(scenario => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function ScenarioCard({ scenario }) {
  const {
    id,
    borrower1FirstName,
    borrower1LastName,
    city,
    state,
    loanAmount,
    ltv,
    dti,
    status,
    loanPurpose,
    propertyType,
    createdAt,
  } = scenario

  const borrowerName = `${borrower1FirstName || ''} ${borrower1LastName || ''}`.trim() || 'Unnamed'
  const location = [city, state].filter(Boolean).join(', ') || 'No address'
  const formattedAmount = typeof loanAmount === 'number'
    ? loanAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
    : '$0'

  const createdDate = createdAt?.toDate
    ? createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex flex-col">
      {/* Card Header */}
      <div className="p-5 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">{borrowerName}</h3>
            <p className="text-sm text-gray-500 truncate">{location}</p>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 pt-4 flex-1 space-y-3">
        {/* Loan Amount */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Loan Amount</span>
          <span className="text-lg font-bold text-gray-900">{formattedAmount}</span>
        </div>

        {/* LTV & DTI Row */}
        <div className="flex gap-3">
          <MetricPill label="LTV" value={ltv} thresholds={[80, 95]} />
          <MetricPill label="DTI" value={dti} thresholds={[43, 50]} />
        </div>

        {/* Details Row */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {loanPurpose && (
            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">{loanPurpose}</span>
          )}
          {propertyType && (
            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">{propertyType}</span>
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">{createdDate}</span>
        <Link
          to={`/scenario/${id}`}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          View &rarr;
        </Link>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-600',
  }
  const className = styles[status] || styles.draft

  return (
    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full capitalize shrink-0 ${className}`}>
      {status || 'draft'}
    </span>
  )
}

function MetricPill({ label, value, thresholds }) {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  const [warn, danger] = thresholds

  let colorClasses
  if (num > danger) {
    colorClasses = 'bg-red-50 text-red-700 border-red-200'
  } else if (num >= warn) {
    colorClasses = 'bg-yellow-50 text-yellow-700 border-yellow-200'
  } else {
    colorClasses = 'bg-green-50 text-green-700 border-green-200'
  }

  return (
    <div className={`flex-1 text-center rounded-lg border px-3 py-2 ${colorClasses}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-lg font-bold">{num.toFixed(2)}%</p>
    </div>
  )
}

export default ScenarioList
