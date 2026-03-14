import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'

const DISCLOSURE_ITEMS = [
  {
    id: 'loan_estimate',
    label: 'Loan Estimate (LE)',
    regulation: 'TRID / Reg Z',
    deadline: '3 business days from application',
    description: 'Must be delivered within 3 business days of receiving a complete loan application.',
  },
  {
    id: 'closing_disclosure',
    label: 'Closing Disclosure (CD)',
    regulation: 'TRID / Reg Z',
    deadline: '3 business days before consummation',
    description: 'Must be received by borrower at least 3 business days before closing.',
  },
  {
    id: 'right_of_rescission',
    label: 'Right of Rescission',
    regulation: 'Reg Z §1026.23',
    deadline: '3 business days after consummation',
    description: 'Required for refinances on primary residences. Does not apply to purchase loans.',
  },
  {
    id: 'charm_booklet',
    label: 'CHARM Booklet',
    regulation: 'Reg Z §1026.19(b)',
    deadline: 'At or before ARM application',
    description: 'Consumer Handbook on Adjustable Rate Mortgages. Required for all ARM products.',
  },
  {
    id: 'special_info_booklet',
    label: 'Special Information Booklet (HUD Guide)',
    regulation: 'RESPA §5',
    deadline: 'Within 3 business days of application',
    description: 'Shopping for your home loan — CFPB homebuying guide. Purchase transactions only.',
  },
  {
    id: 'servicing_disclosure',
    label: 'Mortgage Servicing Disclosure',
    regulation: 'RESPA §6',
    deadline: 'Within 3 business days of application',
    description: 'Discloses whether lender intends to service the loan or transfer servicing.',
  },
  {
    id: 'affiliated_business',
    label: 'Affiliated Business Arrangement (AfBA)',
    regulation: 'RESPA §8(c)(4)',
    deadline: 'At or before referral',
    description: 'Required when referring borrower to affiliated settlement service provider.',
  },
  {
    id: 'appraisal_disclosure',
    label: 'Appraisal Independence / ECOA Notice',
    regulation: 'ECOA / Reg B',
    deadline: 'Within 3 business days of application',
    description: 'Must notify borrower of right to receive copy of appraisal.',
  },
  {
    id: 'fair_lending_notice',
    label: 'Fair Lending / ECOA Adverse Action',
    regulation: 'ECOA / Reg B §1002.9',
    deadline: 'Within 30 days of adverse action',
    description: 'Adverse action notice required if application is denied or withdrawn.',
  },
  {
    id: 'mip_pmi_disclosure',
    label: 'MIP / PMI Disclosure',
    regulation: 'HPA / FHA Guidelines',
    deadline: 'At application',
    description: 'Discloses mortgage insurance premiums, duration, and cancellation rights.',
  },
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  { value: 'issued', label: 'Issued', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  { value: 'received', label: 'Received / Confirmed', color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  { value: 'na', label: 'N/A', color: 'text-gray-400 bg-gray-400/10 border-gray-400/30' },
  { value: 'waived', label: 'Waived / Exception', color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
]

function getStatusStyle(value) {
  return STATUS_OPTIONS.find(s => s.value === value)?.color || 'text-gray-400 bg-gray-400/10 border-gray-400/30'
}

export default function DisclosureIntel() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statuses, setStatuses] = useState(
    Object.fromEntries(DISCLOSURE_ITEMS.map(item => [item.id, 'pending']))
  )
  const [notes, setNotes] = useState(
    Object.fromEntries(DISCLOSURE_ITEMS.map(item => [item.id, '']))
  )
  const [applicationDate, setApplicationDate] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [loanType, setLoanType] = useState('')
  const [loanPurpose, setLoanPurpose] = useState('')
  const [recordSaving, setRecordSaving] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState(null)

  const { reportFindings } = useDecisionRecord(scenarioIdParam)

  useEffect(() => {
    if (!scenarioIdParam) return
    const load = async () => {
      setLoading(true)
      try {
        const snap = await getDoc(doc(db, 'scenarios', scenarioIdParam))
        if (snap.exists()) {
          const data = snap.data()
          setScenario(data)
          setLoanType(data.loanType || data.loan_type || '')
          setLoanPurpose(data.loanPurpose || data.purpose || '')
          // Auto-set N/A for items not applicable to purchase loans
          if ((data.loanPurpose || data.purpose || '').toLowerCase() === 'purchase') {
            setStatuses(prev => ({ ...prev, right_of_rescission: 'na' }))
          }
          // Auto-set N/A for non-ARM
          const lt = (data.loanType || data.loan_type || '').toLowerCase()
          if (!lt.includes('arm') && !lt.includes('adjustable')) {
            setStatuses(prev => ({ ...prev, charm_booklet: 'na' }))
          }
        }
      } catch (err) {
        console.error('Failed to load scenario:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [scenarioIdParam])

  const issuedCount = Object.values(statuses).filter(s => s === 'issued' || s === 'received').length
  const naCount = Object.values(statuses).filter(s => s === 'na' || s === 'waived').length
  const pendingCount = DISCLOSURE_ITEMS.length - issuedCount - naCount
  const complianceScore = Math.round(((issuedCount + naCount) / DISCLOSURE_ITEMS.length) * 100)

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const findings = {
        applicationDate,
        closingDate,
        loanType,
        loanPurpose,
        disclosureStatuses: statuses,
        disclosureNotes: notes,
        summary: {
          total: DISCLOSURE_ITEMS.length,
          issued: issuedCount,
          pending: pendingCount,
          notApplicable: naCount,
          complianceScore,
        },
        disclosureItems: DISCLOSURE_ITEMS.map(item => ({
          id: item.id,
          label: item.label,
          regulation: item.regulation,
          status: statuses[item.id],
          notes: notes[item.id],
        })),
      }
      const writtenId = await reportFindings(MODULE_KEYS.DISCLOSURE_INTEL, findings)
      if (writtenId) setSavedRecordId(writtenId)
    } catch (err) {
      console.error('Failed to save to Decision Record:', err)
    } finally {
      setRecordSaving(false)
    }
  }

  const borrowerName = scenario
    ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || 'Borrower'
    : null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">📋</span>
            <h1 className="text-2xl font-bold text-white">Disclosure Intel™</h1>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
              Module 14
            </span>
          </div>
          <p className="text-gray-400 text-sm ml-9">
            TRID · RESPA · ECOA disclosure tracking &amp; compliance checklist
          </p>
          {borrowerName && (
            <p className="text-indigo-400 text-sm ml-9 mt-1 font-medium">
              📁 {borrowerName}
              {scenario?.propertyAddress || scenario?.streetAddress
                ? ` — ${scenario.streetAddress || scenario.propertyAddress}`
                : ''}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Decision Record Banner */}
        {scenarioIdParam && (
          <DecisionRecordBanner
            scenarioId={scenarioIdParam}
            onSave={handleSaveToRecord}
            saving={recordSaving}
            savedRecordId={savedRecordId}
          />
        )}

        {loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
            Loading scenario data…
          </div>
        )}

        {/* Loan Context */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Loan Context
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Application Date</label>
              <input
                type="date"
                value={applicationDate}
                onChange={e => setApplicationDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Estimated Closing Date</label>
              <input
                type="date"
                value={closingDate}
                onChange={e => setClosingDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Loan Type</label>
              <select
                value={loanType}
                onChange={e => setLoanType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select…</option>
                <option value="Conventional">Conventional</option>
                <option value="FHA">FHA</option>
                <option value="VA">VA</option>
                <option value="USDA">USDA</option>
                <option value="ARM">ARM</option>
                <option value="Jumbo">Jumbo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Loan Purpose</label>
              <select
                value={loanPurpose}
                onChange={e => setLoanPurpose(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select…</option>
                <option value="purchase">Purchase</option>
                <option value="refinance">Rate/Term Refinance</option>
                <option value="cash_out">Cash-Out Refinance</option>
              </select>
            </div>
          </div>
        </div>

        {/* Compliance Score */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className={`text-3xl font-bold ${complianceScore >= 80 ? 'text-green-400' : complianceScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {complianceScore}%
            </div>
            <div className="text-xs text-gray-400 mt-1">Compliance Score</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{issuedCount}</div>
            <div className="text-xs text-gray-400 mt-1">Issued / Confirmed</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">{pendingCount}</div>
            <div className="text-xs text-gray-400 mt-1">Pending</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-gray-400">{naCount}</div>
            <div className="text-xs text-gray-400 mt-1">N/A or Waived</div>
          </div>
        </div>

        {/* Disclosure Checklist */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Disclosure Checklist
            </h2>
          </div>
          <div className="divide-y divide-gray-800">
            {DISCLOSURE_ITEMS.map(item => (
              <div key={item.id} className="p-4 hover:bg-gray-800/30 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{item.label}</span>
                      <span className="text-xs text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 px-2 py-0.5 rounded">
                        {item.regulation}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                    <p className="text-xs text-yellow-500/80 mt-0.5">⏱ {item.deadline}</p>
                    <input
                      type="text"
                      placeholder="Add notes (date issued, tracking #, exception reason…)"
                      value={notes[item.id]}
                      onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="mt-2 w-full bg-gray-800/60 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <select
                      value={statuses[item.id]}
                      onChange={e => setStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className={`text-xs border rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent ${getStatusStyle(statuses[item.id])}`}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value} className="bg-gray-900 text-white">
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        {scenarioIdParam && (
          <div className="flex justify-end">
            <button
              onClick={handleSaveToRecord}
              disabled={recordSaving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              {recordSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </>
              ) : savedRecordId ? (
                '✅ Saved to Decision Record'
              ) : (
                '💾 Save to Decision Record'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
