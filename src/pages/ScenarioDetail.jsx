import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

function ScenarioDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    async function fetchScenario() {
      try {
        const snap = await getDoc(doc(db, 'scenarios', id))
        if (!snap.exists()) {
          setError('Scenario not found.')
        } else {
          setScenario({ id: snap.id, ...snap.data() })
        }
      } catch (err) {
        console.error('Error fetching scenario:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchScenario()
  }, [id])

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'scenarios', id))
      navigate('/scenarios')
    } catch (err) {
      console.error('Error deleting scenario:', err)
      setError(`Failed to delete: ${err.message}`)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 bg-gray-50 py-10">
        <div className="text-center py-20">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
          <p className="text-gray-500 mt-4">Loading scenario...</p>
        </div>
     </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 bg-gray-50 py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-medium mb-6">
            {error}
          </div>
          <Link to="/scenarios" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
            &larr; Back to Scenarios
          </Link>
        </div>
      </main>
    )
  }

  const s = scenario
  const borrower1 = `${s.borrower1FirstName || ''} ${s.borrower1LastName || ''}`.trim()
  const borrower2 = `${s.borrower2FirstName || ''} ${s.borrower2LastName || ''}`.trim()
  const fullAddress = [s.street, s.city, s.state, s.zip].filter(Boolean).join(', ')
  const createdDate = s.createdAt?.toDate
    ? s.createdAt.toDate().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Unknown'
  const createdTime = s.createdAt?.toDate
    ? s.createdAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  const formatCurrency = (val) =>
    typeof val === 'number'
      ? val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
      : '$0'

  return (
    <main className="flex-1 bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <Link
            to="/scenarios"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm inline-flex items-center gap-1"
          >
            &larr; Back to Scenarios
          </Link>
          <div className="flex gap-3">
            <Link
              to="/scenario-creator"
              state={{ editScenario: scenario }}
              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 bg-white border border-red-300 text-red-600 hover:bg-red-50 font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Scenario?</h3>
              <p className="text-sm text-gray-600 mb-6">
                This will permanently delete the scenario for <strong>{borrower1 || 'this borrower'}</strong>. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{borrower1 || 'Unnamed Borrower'}</h1>
              <p className="text-gray-500 mt-1">{fullAddress || 'No address provided'}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={s.status} />
              <span className="text-2xl font-bold text-blue-800">{formatCurrency(s.loanAmount)}</span>
            </div>
          </div>
        </div>

        {/* Key Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Loan Amount" value={formatCurrency(s.loanAmount)} />
          <MetricCard label="Property Value" value={formatCurrency(s.propertyValue)} />
          <MetricCard
            label="LTV"
            value={`${(typeof s.ltv === 'number' ? s.ltv : 0).toFixed(2)}%`}
            color={metricColor(s.ltv, 80, 95)}
          />
          <MetricCard
            label="DTI"
            value={`${(typeof s.dti === 'number' ? s.dti : 0).toFixed(2)}%`}
            color={metricColor(s.dti, 43, 50)}
          />
        </div>

        <div className="space-y-6">
          {/* Borrower Information */}
          <Section title="Borrower Information" icon="👤">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Primary Borrower</p>
                <p className="text-lg font-semibold text-gray-900">{borrower1 || '—'}</p>
              </div>
              {borrower2 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Co-Borrower</p>
                  <p className="text-lg font-semibold text-gray-900">{borrower2}</p>
                </div>
              )}
            </div>
          </Section>

          {/* Loan Details */}
          <Section title="Loan Details" icon="💰">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
              <Field label="Loan Amount" value={formatCurrency(s.loanAmount)} />
              <Field label="Property Value" value={formatCurrency(s.propertyValue)} />
              <Field label="Loan-to-Value (LTV)">
                <ColoredValue value={s.ltv} suffix="%" thresholds={[80, 95]} />
              </Field>
            </div>
          </Section>

          {/* Property Information */}
          <Section title="Property Information" icon="🏠">
            <div className="grid grid-cols-1 gap-y-4 mb-4">
              <Field label="Full Address" value={fullAddress || '—'} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Property Type" value={s.propertyType || '—'} />
              <Field label="Occupancy" value={s.occupancy || '—'} />
            </div>
          </Section>

          {/* Borrower Financials */}
          <Section title="Borrower Financials" icon="📊">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
              <Field label="Credit Score (FICO)">
                <span className={`text-lg font-semibold ${
                  (s.creditScore || 0) >= 740 ? 'text-green-700' :
                  (s.creditScore || 0) >= 680 ? 'text-yellow-700' :
                  'text-red-700'
                }`}>
                  {s.creditScore || '—'}
                </span>
              </Field>
              <Field label="Monthly Income" value={formatCurrency(s.monthlyIncome)} />
              <Field label="Monthly Debts" value={formatCurrency(s.monthlyDebts)} />
              <Field label="Debt-to-Income (DTI)">
                <ColoredValue value={s.dti} suffix="%" thresholds={[43, 50]} />
              </Field>
            </div>
          </Section>

          {/* Loan Purpose */}
          <Section title="Loan Purpose" icon="🎯">
            <div className="inline-flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 font-bold text-sm px-4 py-2 rounded-full">
                {s.loanPurpose || '—'}
              </span>
            </div>
          </Section>

          {/* Metadata */}
          <Section title="Scenario Metadata" icon="📋">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
              <Field label="Status">
                <StatusBadge status={s.status} />
              </Field>
              <Field label="Created" value={createdDate} />
              <Field label="Time" value={createdTime} />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Document ID: <span className="font-mono text-gray-500">{s.id}</span>
              </p>
            </div>
          </Section>
        </div>
      </div>
<div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6 mx-4 sm:mx-6 lg:mx-8">
        <h2 className="text-lg font-bold text-gray-900 mb-1">🧭 What's Next?</h2>
        <p className="text-sm text-gray-500 mb-4">Continue the Canonical Sequence with this scenario pre-loaded.</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/lender-match?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">🎯 Lender Match™</a>
          <a href={`/rate-buydown?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">📉 Rate Buydown™</a>
          <a href={`/arm-structure?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">📈 ARM Structure™</a>
          <a href={`/mi-optimizer?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">🛡️ MI Optimizer™</a>
          <a href={`/debt-consolidation?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">💳 Debt Consolidation™</a>
        </div>
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

function Field({ label, value, children }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {children || <p className="text-lg font-semibold text-gray-900">{value}</p>}
    </div>
  )
}

function MetricCard({ label, value, color }) {
  const colorMap = {
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  }
  const classes = color ? colorMap[color] : 'bg-white border-gray-200 text-gray-900'

  return (
    <div className={`rounded-xl border p-4 text-center ${classes}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

function ColoredValue({ value, suffix = '', thresholds }) {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  const [warn, danger] = thresholds
  const color = num > danger ? 'text-red-700' : num >= warn ? 'text-yellow-700' : 'text-green-700'
  return <span className={`text-lg font-semibold ${color}`}>{num.toFixed(2)}{suffix}</span>
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-600',
  }
  const className = styles[status] || styles.draft
  return (
    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full capitalize ${className}`}>
      {status || 'draft'}
    </span>
  )
}

function metricColor(value, warn, danger) {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  if (num > danger) return 'red'
  if (num >= warn) return 'yellow'
  return 'green'
}

export default ScenarioDetail
