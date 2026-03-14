import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'

// QM Safe Harbor thresholds
const QM_APR_THRESHOLDS = {
  first_lien_conforming: 1.5,   // APR spread over APOR
  first_lien_jumbo: 2.5,
  subordinate: 3.5,
}

const HMDA_FIELDS = [
  { id: 'loan_type', label: 'Loan Type' },
  { id: 'loan_purpose', label: 'Loan Purpose' },
  { id: 'occupancy_type', label: 'Occupancy Type' },
  { id: 'loan_amount', label: 'Loan Amount' },
  { id: 'action_taken', label: 'Action Taken' },
  { id: 'property_address', label: 'Property Address / Census Tract' },
  { id: 'borrower_demographics', label: 'Borrower Ethnicity / Race / Sex' },
  { id: 'income', label: 'Gross Annual Income' },
  { id: 'rate_spread', label: 'Rate Spread (if HPML)' },
  { id: 'hoepa_status', label: 'HOEPA Status' },
  { id: 'lien_status', label: 'Lien Status' },
  { id: 'credit_score', label: 'Credit Score & Scoring Model' },
]

const ATR_FACTORS = [
  'Current or reasonably expected income or assets',
  'Current employment status',
  'Monthly payment on the covered transaction',
  'Monthly payment on any simultaneous loan',
  'Monthly payment for mortgage-related obligations',
  'Current debt obligations, alimony, and child support',
  'Monthly debt-to-income ratio or residual income',
  'Credit history',
]

const COMPLIANCE_CHECKS = [
  {
    id: 'qm_status',
    category: 'QM / ATR',
    label: 'Qualified Mortgage Status',
    description: 'Loan meets QM definition under Reg Z §1026.43 (Safe Harbor or Rebuttable Presumption).',
    risk: 'high',
  },
  {
    id: 'atr_documented',
    category: 'QM / ATR',
    label: 'ATR Documentation Complete',
    description: 'All 8 ATR factors documented per Reg Z §1026.43(c). Income, assets, debts, credit verified.',
    risk: 'high',
  },
  {
    id: 'hpml_check',
    category: 'HPML',
    label: 'HPML Threshold Check',
    description: 'APR tested against APOR. First-lien: ≥1.5% over APOR = HPML. Triggers escrow + appraisal requirements.',
    risk: 'high',
  },
  {
    id: 'hoepa_check',
    category: 'HOEPA',
    label: 'HOEPA / Section 32 Check',
    description: 'Points & fees ≤5% of loan amount (or $1,099 for small loans). APR test vs APOR thresholds.',
    risk: 'high',
  },
  {
    id: 'points_fees',
    category: 'QM / ATR',
    label: 'Points & Fees Cap (3%)',
    description: 'QM requires points and fees ≤3% of loan amount. Verify all affiliated fees included.',
    risk: 'high',
  },
  {
    id: 'balloon_arm',
    category: 'Loan Features',
    label: 'Prohibited Loan Features',
    description: 'QM prohibits balloon payments (except rural/seasonal), negative amortization, IO periods >10 yrs, terms >30 yrs.',
    risk: 'medium',
  },
  {
    id: 'hmda_reportable',
    category: 'HMDA',
    label: 'HMDA Reportable Loan',
    description: 'Determine if transaction is HMDA reportable under Reg C. Covered institution, dwelling-secured, closed-end.',
    risk: 'medium',
  },
  {
    id: 'hmda_data_complete',
    category: 'HMDA',
    label: 'HMDA LAR Data Collection',
    description: 'All required HMDA data points collected at application. Demographic info offered to borrower.',
    risk: 'medium',
  },
  {
    id: 'fair_lending',
    category: 'Fair Lending',
    label: 'Fair Lending / ECOA Compliance',
    description: 'No disparate treatment on prohibited basis. Consistent underwriting standards applied.',
    risk: 'high',
  },
  {
    id: 'cra_eligibility',
    category: 'CRA',
    label: 'CRA Eligibility Flagged',
    description: 'Loan qualifies for CRA credit if in LMI census tract or to LMI borrower. Flag for institution CRA tracking.',
    risk: 'low',
  },
  {
    id: 'state_predatory',
    category: 'State Law',
    label: 'State Anti-Predatory Lending Check',
    description: 'Loan reviewed against applicable state mini-HOEPA laws and rate/fee caps.',
    risk: 'medium',
  },
  {
    id: 'servicing_transfer',
    category: 'RESPA',
    label: 'Servicing Transfer Protections',
    description: 'RESPA §6 servicing disclosure issued. Transfer notice procedures in place if applicable.',
    risk: 'low',
  },
]

const RESULT_OPTIONS = [
  { value: 'pass', label: 'Pass ✓', color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  { value: 'review', label: 'Needs Review', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  { value: 'fail', label: 'Flag / Fail', color: 'text-red-400 bg-red-400/10 border-red-400/30' },
  { value: 'na', label: 'N/A', color: 'text-gray-400 bg-gray-400/10 border-gray-400/30' },
  { value: 'pending', label: 'Pending', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
]

function getResultStyle(value) {
  return RESULT_OPTIONS.find(r => r.value === value)?.color || 'text-blue-400 bg-blue-400/10 border-blue-400/30'
}

const RISK_BADGE = {
  high: 'text-red-400 bg-red-400/10 border border-red-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20',
  low: 'text-green-400 bg-green-400/10 border border-green-400/20',
}

const CATEGORIES = [...new Set(COMPLIANCE_CHECKS.map(c => c.category))]

export default function ComplianceIntel() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(
    Object.fromEntries(COMPLIANCE_CHECKS.map(c => [c.id, 'pending']))
  )
  const [notes, setNotes] = useState(
    Object.fromEntries(COMPLIANCE_CHECKS.map(c => [c.id, '']))
  )
  const [hmda, setHmda] = useState(
    Object.fromEntries(HMDA_FIELDS.map(f => [f.id, 'pending']))
  )
  const [activeTab, setActiveTab] = useState('checks')
  const [aprSpread, setAprSpread] = useState('')
  const [loanApr, setLoanApr] = useState('')
  const [aporRate, setAporRate] = useState('')
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
          // Pre-populate APR if available
          if (data.interestRate) {
            setLoanApr(parseFloat(data.interestRate).toFixed(3))
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

  // Auto-calc APR spread
  useEffect(() => {
    const apr = parseFloat(loanApr)
    const apor = parseFloat(aporRate)
    if (!isNaN(apr) && !isNaN(apor)) {
      setAprSpread((apr - apor).toFixed(3))
    } else {
      setAprSpread('')
    }
  }, [loanApr, aporRate])

  const passCount = Object.values(results).filter(r => r === 'pass').length
  const failCount = Object.values(results).filter(r => r === 'fail').length
  const reviewCount = Object.values(results).filter(r => r === 'review').length
  const naCount = Object.values(results).filter(r => r === 'na').length
  const complianceScore = Math.round(((passCount + naCount) / COMPLIANCE_CHECKS.length) * 100)

  const isHPML = aprSpread !== '' && parseFloat(aprSpread) >= 1.5

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const findings = {
        loanApr,
        aporRate,
        aprSpread,
        isHPML,
        complianceResults: results,
        complianceNotes: notes,
        hmdaStatus: hmda,
        summary: {
          total: COMPLIANCE_CHECKS.length,
          pass: passCount,
          fail: failCount,
          review: reviewCount,
          na: naCount,
          complianceScore,
        },
        checks: COMPLIANCE_CHECKS.map(c => ({
          id: c.id,
          label: c.label,
          category: c.category,
          risk: c.risk,
          result: results[c.id],
          notes: notes[c.id],
        })),
      }
      const writtenId = await reportFindings(MODULE_KEYS.COMPLIANCE_INTEL, findings)
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
            <span className="text-2xl">⚖️</span>
            <h1 className="text-2xl font-bold text-white">Compliance Intel™</h1>
            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-medium">
              Module 15
            </span>
          </div>
          <p className="text-gray-400 text-sm ml-9">
            QM · ATR · HPML · HMDA · Fair Lending compliance review
          </p>
          {borrowerName && (
            <p className="text-purple-400 text-sm ml-9 mt-1 font-medium">
              📁 {borrowerName}
              {scenario?.streetAddress ? ` — ${scenario.streetAddress}` : ''}
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

        {/* HPML / APR Calculator */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            HPML / APR Spread Calculator
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Loan APR (%)</label>
              <input
                type="number"
                step="0.001"
                value={loanApr}
                onChange={e => setLoanApr(e.target.value)}
                placeholder="e.g. 7.125"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Current APOR (%)</label>
              <input
                type="number"
                step="0.001"
                value={aporRate}
                onChange={e => setAporRate(e.target.value)}
                placeholder="e.g. 6.500"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                <a href="https://www.ffiec.gov/ratespread/newcalc.aspx" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">
                  FFIEC Rate Spread Calculator ↗
                </a>
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">APR Spread</label>
              <div className={`w-full rounded-lg px-3 py-2 text-sm font-bold border ${
                aprSpread === ''
                  ? 'bg-gray-800 border-gray-700 text-gray-400'
                  : isHPML
                  ? 'bg-red-900/30 border-red-500/50 text-red-400'
                  : 'bg-green-900/30 border-green-500/50 text-green-400'
              }`}>
                {aprSpread !== '' ? `${parseFloat(aprSpread) >= 0 ? '+' : ''}${aprSpread}%` : '—'}
              </div>
              {aprSpread !== '' && (
                <p className={`text-xs mt-1 font-medium ${isHPML ? 'text-red-400' : 'text-green-400'}`}>
                  {isHPML ? '⚠️ HPML — Escrow + Appraisal requirements apply' : '✓ Not HPML (below 1.5% threshold)'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Score Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Compliance Score', value: `${complianceScore}%`, color: complianceScore >= 80 ? 'text-green-400' : complianceScore >= 50 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Pass', value: passCount, color: 'text-green-400' },
            { label: 'Flag / Fail', value: failCount, color: failCount > 0 ? 'text-red-400' : 'text-gray-400' },
            { label: 'Needs Review', value: reviewCount, color: reviewCount > 0 ? 'text-yellow-400' : 'text-gray-400' },
            { label: 'N/A', value: naCount, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {['checks', 'atr', 'hmda'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab === 'checks' && '📋 Compliance Checks'}
              {tab === 'atr' && '📄 ATR Factors'}
              {tab === 'hmda' && '📊 HMDA Data'}
            </button>
          ))}
        </div>

        {/* Compliance Checks Tab */}
        {activeTab === 'checks' && (
          <div className="space-y-4">
            {CATEGORIES.map(cat => (
              <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-800">
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{cat}</h3>
                </div>
                <div className="divide-y divide-gray-800">
                  {COMPLIANCE_CHECKS.filter(c => c.category === cat).map(check => (
                    <div key={check.id} className="p-4 hover:bg-gray-800/20 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-white text-sm">{check.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${RISK_BADGE[check.risk]}`}>
                              {check.risk.toUpperCase()} RISK
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{check.description}</p>
                          <input
                            type="text"
                            placeholder="Notes / evidence / exception…"
                            value={notes[check.id]}
                            onChange={e => setNotes(prev => ({ ...prev, [check.id]: e.target.value }))}
                            className="mt-2 w-full bg-gray-800/60 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div className="flex-shrink-0">
                          <select
                            value={results[check.id]}
                            onChange={e => setResults(prev => ({ ...prev, [check.id]: e.target.value }))}
                            className={`text-xs border rounded-lg px-3 py-2 font-medium focus:outline-none bg-transparent ${getResultStyle(results[check.id])}`}
                          >
                            {RESULT_OPTIONS.map(r => (
                              <option key={r.value} value={r.value} className="bg-gray-900 text-white">
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ATR Factors Tab */}
        {activeTab === 'atr' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Ability-to-Repay (ATR) — 8 Required Factors
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Per Reg Z §1026.43(c)(2). All 8 factors must be considered and documented.
              </p>
            </div>
            <div className="space-y-3">
              {ATR_FACTORS.map((factor, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-600/20 border border-purple-500/30 rounded text-purple-400 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </div>
                  <span className="text-sm text-gray-200">{factor}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-300">
                <strong>QM Safe Harbor:</strong> Loans meeting QM definition receive a conclusive presumption of ATR compliance if APR ≤ APOR + 1.5%. Rebuttable Presumption applies if APR {'>'} 1.5% over APOR (HPML QM).
              </p>
            </div>
          </div>
        )}

        {/* HMDA Tab */}
        {activeTab === 'hmda' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                HMDA LAR Data Collection Checklist
              </h2>
              <p className="text-xs text-gray-500 mt-1">Regulation C — Required data points for covered institutions</p>
            </div>
            <div className="divide-y divide-gray-800">
              {HMDA_FIELDS.map(field => (
                <div key={field.id} className="flex items-center justify-between p-4 hover:bg-gray-800/20">
                  <span className="text-sm text-gray-200">{field.label}</span>
                  <select
                    value={hmda[field.id]}
                    onChange={e => setHmda(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={`text-xs border rounded-lg px-3 py-1.5 font-medium focus:outline-none bg-transparent ${
                      hmda[field.id] === 'collected' ? 'text-green-400 bg-green-400/10 border-green-400/30' :
                      hmda[field.id] === 'missing' ? 'text-red-400 bg-red-400/10 border-red-400/30' :
                      'text-blue-400 bg-blue-400/10 border-blue-400/30'
                    }`}
                  >
                    <option value="pending" className="bg-gray-900 text-white">Pending</option>
                    <option value="collected" className="bg-gray-900 text-white">Collected ✓</option>
                    <option value="missing" className="bg-gray-900 text-white">Missing ⚠️</option>
                    <option value="na" className="bg-gray-900 text-white">N/A</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        {scenarioIdParam && (
          <div className="flex justify-end">
            <button
              onClick={handleSaveToRecord}
              disabled={recordSaving}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
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
