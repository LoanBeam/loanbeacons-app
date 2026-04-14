import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import DecisionRecordBanner from '../components/DecisionRecordBanner'
import { useNextStepIntelligence, MODULE_REGISTRY } from '../hooks/useNextStepIntelligence'
import NextStepCard from '../components/NextStepCard'

// ── Build full query string from scenario object ──────────────────────────────
function buildParams(s) {
  const p = new URLSearchParams({
    scenarioId:     s.id                                                        || '',
    firstName:      s.firstName                                                 || '',
    lastName:       s.lastName                                                  || '',
    streetAddress:  s.streetAddress                                             || '',
    city:           s.city                                                      || '',
    state:          s.state                                                     || 'GA',
    zipCode:        s.zipCode                                                   || '',
    county:         s.county                                                    || '',
    loanType:       s.loanType                                                  || 'FHA',
    purchasePrice:  s.propertyValue   || s.purchasePrice                        || 0,
    loanAmount:     s.loanAmount                                                || 0,
    creditScore:    s.creditScore                                               || 0,
    annualIncome:   s.annualIncome    || (s.totalIncome   ? s.totalIncome * 12
                                       : s.monthlyIncome ? s.monthlyIncome * 12
                                       : 0),
    householdSize:  s.householdSize                                             || 1,
    firstTimeBuyer: s.firstTimeBuyer                                            || false,
    backendDTI:     ((s.backEndDTI || s.backDti || s.dtiRatio || 0) / 100),
    occupancy:      s.occupancy                                                 || 'primary',
    lenderId:       s.lenderId                                                  || '',
    lenderName:     s.lenderName                                                || '',
    interestRate:   s.interestRate                                              || '',
    loanPurpose:    s.loanPurpose                                               || '',
    propertyType:   s.propertyType                                              || '',
  })
  return p.toString()
}

function ScenarioDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [recordSaving, setRecordSaving] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState(null)
  const [completedModules, setCompletedModules] = useState([])

  const { reportFindings } = useDecisionRecord(id)

  // Fetch completed modules from Decision Records for this scenario
  useEffect(() => {
    if (!id) return
    const fetchCompleted = async () => {
      try {
        const q = query(collection(db, 'decisionRecords'), where('scenarioId', '==', id))
        const snap = await getDocs(q)
        const keys = snap.docs.map(d => d.data().moduleKey).filter(Boolean)
        setCompletedModules([...new Set(keys)])
      } catch (e) { console.error(e) }
    }
    fetchCompleted()
  }, [id, savedRecordId])

  const handleSaveToRecord = async () => {
    if (!scenario) return
    setRecordSaving(true)
    try {
      const writtenId = await reportFindings('SCENARIO_CREATOR', {
        borrowerName: scenario.borrowerName || '',
        loanAmount: scenario.loanAmount || null,
        loanType: scenario.loanType || null,
        loanPurpose: scenario.loanPurpose || null,
        propertyAddress: scenario.streetAddress || scenario.propertyAddress || null,
        creditScore: scenario.creditScore || null,
        dti: scenario.backEndDTI || scenario.dti || null,
        timestamp: new Date().toISOString(),
      })
      if (writtenId) setSavedRecordId(writtenId)
    } catch (e) {
      console.error('ScenarioDetail DR save failed:', e)
    } finally {
      setRecordSaving(false)
    }
  }

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

  // ── Next Step Intelligence™ ──────────────────────────────────────────────
  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase()
  const loanPurpose = rawPurpose.includes('cash') ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('term') || rawPurpose.includes('refi') ? 'rate_term_refi'
    : 'purchase'

  const nsiFindings = {
    dti:         parseFloat(scenario?.backEndDTI || scenario?.dti || 0),
    creditScore: parseInt(scenario?.creditScore || 0),
    selfEmployed: false,
  }

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'SCENARIO_CREATOR',
      loanPurpose,
      decisionRecordFindings:  { SCENARIO_CREATOR: nsiFindings },
      scenarioData:            scenario || {},
      completedModules,
      scenarioId:              id,
      onWriteToDecisionRecord: null,
    })

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
  const params = buildParams(s)
  const borrower1 = [s.firstName || '', s.lastName || ''].join(' ').trim() || s.scenarioName || ''
  const borrower2 = [s.coBorrowerFirstName || '', s.coBorrowerLastName || ''].join(' ').trim()
  const fullAddress = [s.streetAddress, s.city, s.state, s.zipCode].filter(Boolean).join(', ')
  const _ds = s.created_at || s.updated_at
  const _dateObj = _ds?.toDate ? _ds.toDate() : _ds instanceof Date ? _ds : null
  const createdDate = _dateObj
    ? _dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Not recorded'
  const createdTime = _dateObj
    ? _dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  const formatCurrency = (val) =>
    typeof val === 'number'
      ? val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
      : '$0'

  return (
    <main className="flex-1 bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        <DecisionRecordBanner
          recordId={savedRecordId}
          moduleName="Scenario Creator™"
          onSave={handleSaveToRecord}
          saving={recordSaving}
        />

        {/* ── NEXT STEP INTELLIGENCE™ — TOP OF PAGE ───────────────────────────── */}
        <div className="space-y-4 mb-8">

          {/* Module Completion Tracker */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide font-['DM_Sans']">
                  File Progress — Canonical Sequence™
                </h2>
                <p className="text-xs text-slate-400 font-['DM_Sans'] mt-0.5">
                  {completedModules.length} of {Object.keys(MODULE_REGISTRY).length} modules logged to Decision Record
                </p>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full font-['DM_Sans'] border
                ${completedModules.length === 0 ? 'bg-slate-100 text-slate-500 border-slate-200'
                : completedModules.length >= 20 ? 'bg-green-100 text-green-700 border-green-200'
                : 'bg-indigo-100 text-indigo-700 border-indigo-200'}`}>
                {completedModules.length === 0 ? 'Not started' : `${Math.round((completedModules.length / Object.keys(MODULE_REGISTRY).length) * 100)}% complete`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MODULE_REGISTRY).map(([key, mod], idx) => {
                const done = completedModules.includes(key)
                const isCurrent = key === 'SCENARIO_CREATOR'
                return (
                  <a key={key} href={`${mod.route}?scenarioId=${s.id}`} title={mod.label}
                    className={`group relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all hover:scale-110
                      ${done      ? 'bg-green-500  border-green-400  text-white'
                      : isCurrent ? 'bg-indigo-600 border-indigo-500 text-white'
                      :             'bg-slate-100  border-slate-200  text-slate-400 hover:border-indigo-300'}`}>
                    <span className="text-[10px] font-black leading-none">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {mod.label}{done ? ' ✓' : ''}
                    </span>
                  </a>
                )
              })}
            </div>
            <div className="flex gap-4 mt-3 flex-wrap">
              {[
                { color: 'bg-slate-400',   label: 'Stage 1 — Pre-Structure'  },
                { color: 'bg-indigo-400',  label: 'Stage 2 — Lender Fit'     },
                { color: 'bg-violet-400',  label: 'Stage 3 — Optimization'   },
                { color: 'bg-emerald-400', label: 'Stage 4 — Verify & Submit' },
                { color: 'bg-green-500',   label: 'Logged to Decision Record' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-xs text-slate-400 font-['DM_Sans']">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* NSI Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 font-['DM_Sans']">
              Recommended Next Action
            </p>
            {primarySuggestion ? (
              <NextStepCard
                suggestion={primarySuggestion}
                secondarySuggestions={secondarySuggestions}
                onFollow={logFollow}
                onOverride={logOverride}
                loanPurpose={loanPurpose}
                scenarioId={id}
              />
            ) : (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-semibold text-slate-600 font-['DM_Sans']">No pending actions</p>
                <p className="text-xs text-slate-400 font-['DM_Sans'] mt-1">All recommended modules for this scenario have been completed.</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <Link to="/scenarios" className="text-blue-600 hover:text-blue-800 font-medium text-sm inline-flex items-center gap-1">
            &larr; Back to Scenarios
          </Link>
          <div className="flex gap-3">
            <Link
              to={`/scenario-creator/${s.id}`}
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
                <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <MetricCard label="Loan Amount" value={formatCurrency(s.loanAmount)} />
          <MetricCard label="Property Value" value={formatCurrency(s.propertyValue)} />
          <MetricCard label="LTV" value={`${(typeof s.ltv === 'number' ? s.ltv : 0).toFixed(2)}%`} color={metricColor(s.ltv, 80, 95)} />
          <MetricCard label="Front DTI" value={`${(typeof s.frontDti === 'number' ? s.frontDti : 0).toFixed(2)}%`} color={metricColor(s.frontDti, 28, 36)} />
          <MetricCard label="Back DTI" value={`${(typeof s.backDti === 'number' ? s.backDti : s.dtiRatio || 0).toFixed(2)}%`} color={metricColor(s.backDti || s.dtiRatio, 43, 50)} />
        </div>

        <div className="space-y-6">
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

          <Section title="Loan Details" icon="💰">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
              <Field label="Loan Amount" value={formatCurrency(s.loanAmount)} />
              <Field label="Property Value" value={formatCurrency(s.propertyValue)} />
              <Field label="Loan-to-Value (LTV)">
                <ColoredValue value={s.ltv} suffix="%" thresholds={[80, 95]} />
              </Field>
            </div>
          </Section>

          <Section title="Property Information" icon="🏠">
            <div className="grid grid-cols-1 gap-y-4 mb-4">
              <Field label="Full Address" value={fullAddress || '—'} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
              <Field label="County" value={s.county || '—'} />
              <Field label="Property Type" value={s.propertyType || '—'} />
              <Field label="Occupancy" value={s.occupancy || '—'} />
            </div>
          </Section>

          <Section title="Borrower Financials" icon="📊">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
              <Field label="Credit Score (FICO)">
                <span className={`text-lg font-semibold ${(s.creditScore||0) >= 740 ? 'text-green-700' : (s.creditScore||0) >= 680 ? 'text-yellow-700' : 'text-red-700'}`}>
                  {s.creditScore || '—'}
                </span>
              </Field>
              <Field label="Monthly Income" value={formatCurrency(s.monthlyIncome)} />
              <Field label="Monthly Debts" value={formatCurrency(s.monthlyDebts)} />
              <Field label="Consumer DTI">
                <ColoredValue value={s.dtiRatio} suffix="%" thresholds={[43, 50]} />
              </Field>
            </div>
          </Section>

          <Section title="Loan Purpose" icon="🎯">
            <div className="flex flex-wrap items-center gap-3">
              {s.loanPurpose && (
                <span className="bg-blue-100 text-blue-800 font-bold text-sm px-4 py-2 rounded-full capitalize">
                  {s.loanPurpose.replace(/_/g, ' ').toLowerCase()}
                </span>
              )}
              {s.loanType && (
                <span className="bg-indigo-100 text-indigo-800 font-bold text-sm px-4 py-2 rounded-full">{s.loanType}</span>
              )}
              {s.interestRate && (
                <span className="bg-gray-100 text-gray-700 font-semibold text-sm px-4 py-2 rounded-full">
                  {s.interestRate}% / {s.term ? Math.round(s.term/12) + ' yr' : '30 yr'}
                </span>
              )}
            </div>
          </Section>

          {s.totalHousing > 0 && (
            <Section title="Monthly Housing Expenses (PITI)" icon="🏠">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4 mb-4">
                <Field label="P&I Payment" value={s.piPayment ? formatCurrency(s.piPayment) : '—'} />
                <Field label="Property Taxes" value={s.propTaxes ? formatCurrency(s.propTaxes) + (s.taxEstimated ? ' (est.)' : '') : '—'} />
                <Field label="Homeowners Ins." value={s.homeInsurance ? formatCurrency(s.homeInsurance) + (s.insEstimated ? ' (est.)' : '') : '—'} />
                <Field label="MIP / PMI" value={s.mortgageInsurance ? formatCurrency(s.mortgageInsurance) : '$0'} />
                {s.hoaDues > 0 && <Field label="HOA Dues" value={formatCurrency(s.hoaDues)} />}
                {s.floodInsurance > 0 && <Field label="Flood Insurance" value={formatCurrency(s.floodInsurance)} />}
                {s.secondMortgage > 0 && <Field label="2nd Mortgage P&I" value={formatCurrency(s.secondMortgage)} />}
              </div>
              <div className="bg-gray-900 rounded-xl px-5 py-3 flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-gray-300">Total Monthly Housing (PITI)</span>
                <span className="text-2xl font-bold text-white">{formatCurrency(s.totalHousing)}</span>
              </div>
              {s.totalIncome > 0 && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold text-blue-500 mb-1">FRONT-END DTI</p>
                    <p className={`text-2xl font-bold ${s.frontDti > 36 ? 'text-red-700' : s.frontDti > 28 ? 'text-yellow-700' : 'text-green-700'}`}>
                      {s.frontDti ? s.frontDti.toFixed(1) + '%' : '—'}
                    </p>
                    <p className="text-xs text-blue-400 mt-0.5">PITI ÷ {formatCurrency(s.totalIncome)}/mo</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold text-purple-500 mb-1">BACK-END DTI</p>
                    <p className={`text-2xl font-bold ${(s.backDti||s.dtiRatio||0) > 50 ? 'text-red-700' : (s.backDti||s.dtiRatio||0) > 43 ? 'text-yellow-700' : 'text-green-700'}`}>
                      {(s.backDti || s.dtiRatio) ? (s.backDti || s.dtiRatio).toFixed(1) + '%' : '—'}
                    </p>
                    <p className="text-xs text-purple-400 mt-0.5">PITI+Debts ÷ Income</p>
                  </div>
                </div>
              )}
            </Section>
          )}

          <Section title="Scenario Metadata" icon="📋">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
              <Field label="Status"><StatusBadge status={s.status} /></Field>
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

    </main>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span>{icon}</span>{title}
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
    green:  'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red:    'bg-red-50 border-red-200 text-red-800',
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
    draft:    'bg-yellow-100 text-yellow-800',
    active:   'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full capitalize ${styles[status] || styles.draft}`}>
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
