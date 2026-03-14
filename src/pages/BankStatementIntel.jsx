import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const ANALYSIS_PERIODS = [
  { value: '12', label: '12-Month Analysis' },
  { value: '24', label: '24-Month Analysis' },
]

const ACCOUNT_TYPES = [
  { value: 'personal', label: 'Personal Account' },
  { value: 'business', label: 'Business Account' },
]

const EXPENSE_RATIOS = {
  // IRS-based standard expense ratios by business type
  consulting:    0.10,
  retail:        0.50,
  restaurant:    0.55,
  construction:  0.40,
  real_estate:   0.30,
  healthcare:    0.35,
  transportation:0.60,
  manufacturing: 0.55,
  technology:    0.20,
  other:         0.35,
}

const BUSINESS_TYPES = [
  { value: 'consulting',     label: 'Consulting / Professional Services (10%)' },
  { value: 'technology',     label: 'Technology / Software (20%)' },
  { value: 'real_estate',    label: 'Real Estate (30%)' },
  { value: 'healthcare',     label: 'Healthcare (35%)' },
  { value: 'other',          label: 'Other / General (35%)' },
  { value: 'construction',   label: 'Construction / Trades (40%)' },
  { value: 'retail',         label: 'Retail / E-commerce (50%)' },
  { value: 'restaurant',     label: 'Restaurant / Food Service (55%)' },
  { value: 'manufacturing',  label: 'Manufacturing (55%)' },
  { value: 'transportation', label: 'Transportation / Logistics (60%)' },
]

const NSF_SEVERITY = {
  0: { label: 'None', color: 'text-green-400', score: 0 },
  1: { label: '1–2 (Minor)', color: 'text-yellow-400', score: 1 },
  2: { label: '3–5 (Moderate)', color: 'text-orange-400', score: 2 },
  3: { label: '6+ (Significant)', color: 'text-red-400', score: 3 },
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtInt(n) {
  return Math.round(n).toLocaleString('en-US')
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Generate month labels for N months ending at current month
function getMonthLabels(count) {
  const now = new Date()
  const labels = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    labels.push(`${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`)
  }
  return labels
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function BankStatementIntel() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('deposits')

  // Config
  const [analysisPeriod, setAnalysisPeriod] = useState('24')
  const [accountType, setAccountType] = useState('business')
  const [businessType, setBusinessType] = useState('other')
  const [customExpenseRatio, setCustomExpenseRatio] = useState('')
  const [useCustomRatio, setUseCustomRatio] = useState(false)
  const [borrowerName2, setBorrowerName2] = useState('')

  // Monthly deposits — array of { deposits, transfers, notes }
  const monthCount = parseInt(analysisPeriod)
  const monthLabels = useMemo(() => getMonthLabels(monthCount), [monthCount])

  const [monthlyData, setMonthlyData] = useState(() =>
    Array(24).fill(null).map(() => ({ deposits: '', transfers: '', nsf: false, large: '' }))
  )

  // Add-backs
  const [depreciation, setDepreciation] = useState('')
  const [depletion, setDepletion] = useState('')
  const [mileage, setMileage] = useState('')
  const [mileageRate] = useState(0.67) // 2024 IRS rate
  const [amortization, setAmortization] = useState('')
  const [otherAddback, setOtherAddback] = useState('')
  const [otherAddbackLabel, setOtherAddbackLabel] = useState('')

  // Flags
  const [nsfCount, setNsfCount] = useState(0)
  const [risingIncome, setRisingIncome] = useState(null)  // true/false/null
  const [decliningIncome, setDecliningIncome] = useState(false)
  const [largeDepositsExplained, setLargeDepositsExplained] = useState(null)
  const [businessAccountVerified, setBusinessAccountVerified] = useState(null)
  const [ownershipPct, setOwnershipPct] = useState('100')

  // LO notes
  const [loNotes, setLoNotes] = useState('')

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
        }
      } catch (err) {
        console.error('Failed to load scenario:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [scenarioIdParam])

  const updateMonthlyData = (index, field, value) => {
    setMonthlyData(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  // ── Core income calculation ───────────────────────────────
  const calc = useMemo(() => {
    const months = monthLabels.length
    const expenseRatio = useCustomRatio
      ? (parseFloat(customExpenseRatio) / 100 || 0)
      : EXPENSE_RATIOS[businessType] || 0.35
    const ownership = parseFloat(ownershipPct) / 100 || 1

    // Slice relevant months
    const relevant = monthlyData.slice(0, months)
    const grossDeposits = relevant.map(m => parseFloat(m.deposits) || 0)
    const transfers = relevant.map(m => parseFloat(m.transfers) || 0)

    // Net deposits per month (subtract transfers/non-business)
    const netDeposits = grossDeposits.map((g, i) => Math.max(0, g - transfers[i]))
    const totalNetDeposits = netDeposits.reduce((a, b) => a + b, 0)
    const avgMonthlyDeposits = months > 0 ? totalNetDeposits / months : 0

    // Apply expense ratio for business accounts
    const incomeAfterExpenses = accountType === 'business'
      ? avgMonthlyDeposits * (1 - expenseRatio)
      : avgMonthlyDeposits

    // Apply ownership percentage
    const incomeAfterOwnership = incomeAfterExpenses * ownership

    // Add-backs (annualized → monthly)
    const deprMonthly = (parseFloat(depreciation) || 0) / 12
    const deplMonthly = (parseFloat(depletion) || 0) / 12
    const mileageAmount = ((parseFloat(mileage) || 0) * mileageRate) / 12
    const amorMonthly = (parseFloat(amortization) || 0) / 12
    const otherMonthly = (parseFloat(otherAddback) || 0) / 12
    const totalAddbacks = deprMonthly + deplMonthly + mileageAmount + amorMonthly + otherMonthly

    const qualifyingMonthly = incomeAfterOwnership + totalAddbacks
    const qualifyingAnnual = qualifyingMonthly * 12

    // Trend analysis — compare first half vs second half
    const mid = Math.floor(months / 2)
    const firstHalf = netDeposits.slice(0, mid)
    const secondHalf = netDeposits.slice(mid)
    const firstAvg = firstHalf.length ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0
    const secondAvg = secondHalf.length ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0
    const trendPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0

    // Risk flags
    const flags = []
    if (nsfCount >= 2) flags.push({ label: 'NSF/Overdraft activity detected', severity: nsfCount >= 3 ? 'critical' : 'warning' })
    if (trendPct < -15) flags.push({ label: `Declining income trend: ${fmt(trendPct)}% vs prior period`, severity: 'critical' })
    if (trendPct < -5 && trendPct >= -15) flags.push({ label: `Slight income decline: ${fmt(trendPct)}% vs prior period`, severity: 'warning' })
    if (largeDepositsExplained === false) flags.push({ label: 'Large deposits not explained/sourced', severity: 'warning' })
    if (businessAccountVerified === false) flags.push({ label: 'Business account ownership not verified', severity: 'warning' })
    if (ownership < 1) flags.push({ label: `Partial ownership (${ownershipPct}%) — income pro-rated`, severity: 'info' })
    if (accountType === 'personal') flags.push({ label: 'Personal account used — no expense ratio applied; lender review required', severity: 'warning' })

    return {
      months, expenseRatio, ownership,
      grossDeposits, transfers, netDeposits,
      totalNetDeposits, avgMonthlyDeposits,
      incomeAfterExpenses, incomeAfterOwnership,
      deprMonthly, deplMonthly, mileageAmount, amorMonthly, otherMonthly, totalAddbacks,
      qualifyingMonthly, qualifyingAnnual,
      firstAvg, secondAvg, trendPct,
      flags,
    }
  }, [monthlyData, monthLabels, analysisPeriod, accountType, businessType,
      customExpenseRatio, useCustomRatio, ownershipPct, depreciation, depletion,
      mileage, mileageRate, amortization, otherAddback, nsfCount,
      largeDepositsExplained, businessAccountVerified])

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const findings = {
        analysisPeriod,
        accountType,
        businessType,
        expenseRatio: calc.expenseRatio,
        ownershipPct: parseFloat(ownershipPct),
        totalNetDeposits: calc.totalNetDeposits,
        avgMonthlyDeposits: calc.avgMonthlyDeposits,
        incomeAfterExpenses: calc.incomeAfterExpenses,
        totalAddbacks: calc.totalAddbacks,
        qualifyingMonthly: calc.qualifyingMonthly,
        qualifyingAnnual: calc.qualifyingAnnual,
        trendPct: calc.trendPct,
        nsfCount,
        flags: calc.flags,
        loNotes,
        monthlyDeposits: monthLabels.map((label, i) => ({
          month: label,
          grossDeposits: parseFloat(monthlyData[i]?.deposits) || 0,
          transfers: parseFloat(monthlyData[i]?.transfers) || 0,
          netDeposits: calc.netDeposits[i] || 0,
        })),
        addbacks: {
          depreciation: parseFloat(depreciation) || 0,
          depletion: parseFloat(depletion) || 0,
          mileage: parseFloat(mileage) || 0,
          amortization: parseFloat(amortization) || 0,
          other: parseFloat(otherAddback) || 0,
          totalMonthly: calc.totalAddbacks,
        },
      }
      const writtenId = await reportFindings(MODULE_KEYS.BANK_STATEMENT_INTEL, findings)
      if (writtenId) setSavedRecordId(writtenId)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setRecordSaving(false)
    }
  }

  const scenarioBorrower = scenario
    ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim()
    : null

  const nsfSeverity = nsfCount === 0 ? NSF_SEVERITY[0] : nsfCount <= 2 ? NSF_SEVERITY[1] : nsfCount <= 5 ? NSF_SEVERITY[2] : NSF_SEVERITY[3]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🏦</span>
            <h1 className="text-2xl font-bold text-white">Bank Statement Intelligence™</h1>
            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-medium">
              Module 20
            </span>
            <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full font-medium">
              PREMIUM
            </span>
          </div>
          <p className="text-gray-400 text-sm ml-9">
            Self-employed income analysis · 12 or 24-month · Add-backs · Non-QM qualifying
          </p>
          {scenarioBorrower && (
            <p className="text-purple-400 text-sm ml-9 mt-1 font-medium">
              📁 {scenarioBorrower}
              {scenario?.streetAddress ? ` — ${scenario.streetAddress}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {scenarioIdParam && (
          <DecisionRecordBanner
            scenarioId={scenarioIdParam}
            onSave={handleSaveToRecord}
            saving={recordSaving}
            savedRecordId={savedRecordId}
          />
        )}

        {/* Risk Flags */}
        {calc.flags.length > 0 && (
          <div className="space-y-2">
            {calc.flags.map((flag, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
                flag.severity === 'critical' ? 'bg-red-900/20 border-red-500/40 text-red-300' :
                flag.severity === 'warning' ? 'bg-yellow-900/20 border-yellow-500/40 text-yellow-300' :
                'bg-blue-900/20 border-blue-500/40 text-blue-300'
              }`}>
                <span>{flag.severity === 'critical' ? '🚨' : flag.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                {flag.label}
              </div>
            ))}
          </div>
        )}

        {/* Configuration */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Analysis Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Analysis Period</label>
              <select value={analysisPeriod} onChange={e => setAnalysisPeriod(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                {ANALYSIS_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Account Type</label>
              <select value={accountType} onChange={e => setAccountType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ownership %</label>
              <select value={ownershipPct} onChange={e => setOwnershipPct(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                {['100','75','50','25'].map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">NSF / Overdrafts</label>
              <select value={nsfCount} onChange={e => setNsfCount(parseInt(e.target.value))}
                className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 ${nsfSeverity.color}`}>
                <option value={0}>None</option>
                <option value={1}>1–2 events</option>
                <option value={3}>3–5 events</option>
                <option value={6}>6+ events</option>
              </select>
            </div>
          </div>

          {/* Business type + expense ratio */}
          {accountType === 'business' && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Business Type (Expense Ratio)</label>
                <select value={businessType} onChange={e => { setBusinessType(e.target.value); setUseCustomRatio(false) }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                  {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Override Expense Ratio
                  <span className="text-gray-500 ml-1">(optional — enter % manually)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0" max="100" step="1"
                    value={customExpenseRatio}
                    onChange={e => { setCustomExpenseRatio(e.target.value); setUseCustomRatio(!!e.target.value) }}
                    placeholder={`${Math.round((EXPENSE_RATIOS[businessType] || 0.35) * 100)}% (default)`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                  {useCustomRatio && (
                    <button onClick={() => { setCustomExpenseRatio(''); setUseCustomRatio(false) }}
                      className="text-xs text-gray-400 hover:text-white px-2">Reset</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['deposits', 'addbacks', 'flags', 'summary'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {tab === 'deposits' && '💰 Monthly Deposits'}
              {tab === 'addbacks' && '➕ Add-Backs'}
              {tab === 'flags' && `🚩 Quality Flags ${calc.flags.length > 0 ? `(${calc.flags.length})` : ''}`}
              {tab === 'summary' && '📊 Income Summary'}
            </button>
          ))}
        </div>

        {/* DEPOSITS TAB */}
        {activeTab === 'deposits' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Monthly Deposit Entry — {analysisPeriod} Months
              </h2>
              <p className="text-xs text-gray-500">Most recent month first</p>
            </div>
            <div className="divide-y divide-gray-800">
              {monthLabels.map((label, i) => (
                <div key={i} className="px-5 py-3 hover:bg-gray-800/20">
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-2">
                      <span className="text-xs font-medium text-gray-300">{label}</span>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs text-gray-500 mb-1">Gross Deposits ($)</label>
                      <input
                        type="number"
                        value={monthlyData[i]?.deposits || ''}
                        onChange={e => updateMonthlyData(i, 'deposits', e.target.value)}
                        placeholder="0"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs text-gray-500 mb-1">Non-Business / Transfers ($)</label>
                      <input
                        type="number"
                        value={monthlyData[i]?.transfers || ''}
                        onChange={e => updateMonthlyData(i, 'transfers', e.target.value)}
                        placeholder="0"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="block text-xs text-gray-500 mb-1">Net</label>
                      <span className={`text-sm font-medium ${(calc.netDeposits[i] || 0) > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                        ${fmtInt(calc.netDeposits[i] || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Deposit Totals */}
            <div className="px-5 py-4 bg-gray-800/40 border-t border-gray-700 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-white">${fmtInt(calc.totalNetDeposits)}</div>
                <div className="text-xs text-gray-400">Total Net Deposits</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-400">${fmt(calc.avgMonthlyDeposits)}</div>
                <div className="text-xs text-gray-400">Avg Monthly Deposits</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${calc.trendPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calc.trendPct >= 0 ? '+' : ''}{fmt(calc.trendPct)}%
                </div>
                <div className="text-xs text-gray-400">Income Trend</div>
              </div>
            </div>
          </div>
        )}

        {/* ADD-BACKS TAB */}
        {activeTab === 'addbacks' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-1">
                Add-Back Items
              </h2>
              <p className="text-xs text-gray-500">Annual amounts — converted to monthly automatically. Add-backs increase qualifying income.</p>
            </div>
            {[
              { label: 'Depreciation (Schedule C / Form 4562)', value: depreciation, set: setDepreciation, monthly: calc.deprMonthly, tip: 'From tax returns. Non-cash expense added back.' },
              { label: 'Depletion', value: depletion, set: setDepletion, monthly: calc.deplMonthly, tip: 'Oil, gas, or mineral depletion. Rare but allowed.' },
              { label: 'Amortization', value: amortization, set: setAmortization, monthly: calc.amorMonthly, tip: 'From Schedule C or K-1. Non-cash expense.' },
            ].map(item => (
              <div key={item.label} className="grid grid-cols-2 gap-4 p-4 bg-gray-800/40 rounded-lg border border-gray-700">
                <div>
                  <label className="block text-xs text-gray-300 mb-1 font-medium">{item.label}</label>
                  <p className="text-xs text-gray-500 mb-2">{item.tip}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">$</span>
                    <input type="number" value={item.value} onChange={e => item.set(e.target.value)}
                      placeholder="Annual amount"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    <span className="text-gray-500 text-xs">/yr</span>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-400">+${fmt(item.monthly)}/mo</div>
                    <div className="text-xs text-gray-500">Monthly add-back</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Mileage */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/40 rounded-lg border border-gray-700">
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">Business Mileage (Annual Miles)</label>
                <p className="text-xs text-gray-500 mb-2">IRS rate: ${mileageRate}/mile (2024). From Schedule C line 9.</p>
                <div className="flex items-center gap-2">
                  <input type="number" value={mileage} onChange={e => setMileage(e.target.value)}
                    placeholder="e.g. 12000"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                  <span className="text-gray-500 text-xs">miles</span>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <div className="text-right">
                  <div className="text-lg font-bold text-green-400">+${fmt(calc.mileageAmount)}/mo</div>
                  <div className="text-xs text-gray-500">${fmtInt((parseFloat(mileage)||0)*mileageRate)}/yr</div>
                </div>
              </div>
            </div>

            {/* Other add-back */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/40 rounded-lg border border-gray-700">
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">Other Add-Back</label>
                <input type="text" value={otherAddbackLabel} onChange={e => setOtherAddbackLabel(e.target.value)}
                  placeholder="Description (e.g. Meals & Entertainment)"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 mb-2" />
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">$</span>
                  <input type="number" value={otherAddback} onChange={e => setOtherAddback(e.target.value)}
                    placeholder="Annual amount"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                  <span className="text-gray-500 text-xs">/yr</span>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <div className="text-right">
                  <div className="text-lg font-bold text-green-400">+${fmt(calc.otherMonthly)}/mo</div>
                  <div className="text-xs text-gray-500">Monthly add-back</div>
                </div>
              </div>
            </div>

            {/* Add-back total */}
            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg flex items-center justify-between">
              <span className="text-sm font-semibold text-green-300">Total Monthly Add-Backs</span>
              <span className="text-xl font-bold text-green-400">+${fmt(calc.totalAddbacks)}/mo</span>
            </div>
          </div>
        )}

        {/* FLAGS TAB */}
        {activeTab === 'flags' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Income Quality Flags</h2>
              <div className="space-y-4">

                {/* Large deposits */}
                <div className="p-4 bg-gray-800/40 rounded-lg border border-gray-700">
                  <p className="text-sm font-medium text-gray-200 mb-2">Large Deposits Identified & Explained</p>
                  <p className="text-xs text-gray-500 mb-3">Deposits ≥ 50% of average monthly income must be sourced. Have all large deposits been explained?</p>
                  <div className="flex gap-3">
                    {[{v: true, l: 'Yes — All explained'}, {v: false, l: 'No — Gaps exist'}, {v: null, l: 'N/A'}].map(opt => (
                      <button key={String(opt.v)} onClick={() => setLargeDepositsExplained(opt.v)}
                        className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          largeDepositsExplained === opt.v
                            ? opt.v === true ? 'bg-green-600/30 border-green-500 text-green-300'
                            : opt.v === false ? 'bg-red-600/30 border-red-500 text-red-300'
                            : 'bg-gray-600/30 border-gray-500 text-gray-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}>{opt.l}</button>
                    ))}
                  </div>
                </div>

                {/* Business account verified */}
                <div className="p-4 bg-gray-800/40 rounded-lg border border-gray-700">
                  <p className="text-sm font-medium text-gray-200 mb-2">Business Account Ownership Verified</p>
                  <p className="text-xs text-gray-500 mb-3">Account title matches borrower's business name. Business license or CPA letter confirms.</p>
                  <div className="flex gap-3">
                    {[{v: true, l: 'Verified'}, {v: false, l: 'Not verified'}, {v: null, l: 'Personal acct'}].map(opt => (
                      <button key={String(opt.v)} onClick={() => setBusinessAccountVerified(opt.v)}
                        className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          businessAccountVerified === opt.v
                            ? opt.v === true ? 'bg-green-600/30 border-green-500 text-green-300'
                            : opt.v === false ? 'bg-red-600/30 border-red-500 text-red-300'
                            : 'bg-gray-600/30 border-gray-500 text-gray-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}>{opt.l}</button>
                    ))}
                  </div>
                </div>

                {/* Income trend narrative */}
                <div className="p-4 bg-gray-800/40 rounded-lg border border-gray-700">
                  <p className="text-sm font-medium text-gray-200 mb-1">Income Trend</p>
                  <div className={`mt-2 px-3 py-2 rounded text-sm font-medium ${
                    calc.trendPct >= 5 ? 'bg-green-900/30 text-green-300' :
                    calc.trendPct >= -5 ? 'bg-gray-700 text-gray-300' :
                    calc.trendPct >= -15 ? 'bg-yellow-900/30 text-yellow-300' :
                    'bg-red-900/30 text-red-300'
                  }`}>
                    {calc.trendPct >= 5 && `📈 Rising income — 2nd half avg $${fmtInt(calc.secondAvg)} vs 1st half $${fmtInt(calc.firstAvg)} (+${fmt(calc.trendPct)}%)`}
                    {calc.trendPct >= -5 && calc.trendPct < 5 && `➡️ Stable income — minimal variance between periods (${fmt(calc.trendPct)}%)`}
                    {calc.trendPct >= -15 && calc.trendPct < -5 && `⚠️ Slight decline — 2nd half avg $${fmtInt(calc.secondAvg)} vs 1st half $${fmtInt(calc.firstAvg)} (${fmt(calc.trendPct)}%)`}
                    {calc.trendPct < -15 && `🚨 Declining income — 2nd half avg $${fmtInt(calc.secondAvg)} vs 1st half $${fmtInt(calc.firstAvg)} (${fmt(calc.trendPct)}%)`}
                    {calc.avgMonthlyDeposits === 0 && 'Enter deposits above to calculate trend'}
                  </div>
                </div>

                {/* LO Notes */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">LO Notes / Compensating Factors</label>
                  <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)}
                    rows={3} placeholder="Document explanations for flags, compensating factors, lender-specific notes..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUMMARY TAB */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {/* Qualifying Income Card */}
            <div className="bg-gradient-to-br from-purple-900/40 to-gray-900 border border-purple-500/40 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-purple-300 uppercase tracking-wider mb-4">
                Qualifying Income — {analysisPeriod}-Month {accountType === 'business' ? 'Business' : 'Personal'} Statement Analysis
              </h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-4xl font-bold text-white">${fmt(calc.qualifyingMonthly)}</div>
                  <div className="text-sm text-purple-300 mt-1">Monthly Qualifying Income</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-purple-300">${fmtInt(calc.qualifyingAnnual)}</div>
                  <div className="text-sm text-gray-400 mt-1">Annual Qualifying Income</div>
                </div>
              </div>
            </div>

            {/* Calculation Waterfall */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Income Calculation Waterfall</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {[
                  { label: `Avg Monthly Gross Deposits (${analysisPeriod} mo)`, value: calc.avgMonthlyDeposits, color: 'text-white', prefix: '$' },
                  ...(accountType === 'business' ? [{
                    label: `Less: Expense Ratio (${Math.round(calc.expenseRatio * 100)}% — ${BUSINESS_TYPES.find(b => b.value === businessType)?.label.split('(')[0].trim() || 'Custom'})`,
                    value: -(calc.avgMonthlyDeposits * calc.expenseRatio),
                    color: 'text-red-400', prefix: '-$'
                  }] : []),
                  ...(parseFloat(ownershipPct) < 100 ? [{
                    label: `Ownership Adjustment (${ownershipPct}%)`,
                    value: calc.incomeAfterOwnership - calc.incomeAfterExpenses,
                    color: 'text-red-400', prefix: '-$'
                  }] : []),
                  ...(calc.deprMonthly > 0 ? [{ label: 'Add-back: Depreciation', value: calc.deprMonthly, color: 'text-green-400', prefix: '+$' }] : []),
                  ...(calc.deplMonthly > 0 ? [{ label: 'Add-back: Depletion', value: calc.deplMonthly, color: 'text-green-400', prefix: '+$' }] : []),
                  ...(calc.mileageAmount > 0 ? [{ label: `Add-back: Mileage (${mileage} mi × $${mileageRate})`, value: calc.mileageAmount, color: 'text-green-400', prefix: '+$' }] : []),
                  ...(calc.amorMonthly > 0 ? [{ label: 'Add-back: Amortization', value: calc.amorMonthly, color: 'text-green-400', prefix: '+$' }] : []),
                  ...(calc.otherMonthly > 0 ? [{ label: `Add-back: ${otherAddbackLabel || 'Other'}`, value: calc.otherMonthly, color: 'text-green-400', prefix: '+$' }] : []),
                ].map((row, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-300">{row.label}</span>
                    <span className={`text-sm font-medium ${row.color}`}>
                      {row.prefix === '-$' ? `-$${fmt(Math.abs(row.value))}` : `${row.prefix}${fmt(Math.abs(row.value))}`}
                    </span>
                  </div>
                ))}
                <div className="px-5 py-4 bg-purple-900/20 flex items-center justify-between border-t-2 border-purple-500/30">
                  <span className="text-sm font-bold text-purple-300">= Monthly Qualifying Income</span>
                  <span className="text-lg font-bold text-purple-300">${fmt(calc.qualifyingMonthly)}</span>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Analysis Period', value: `${analysisPeriod} Months` },
                { label: 'Account Type', value: accountType === 'business' ? 'Business' : 'Personal' },
                { label: 'Expense Ratio', value: accountType === 'business' ? `${Math.round(calc.expenseRatio * 100)}%` : 'N/A' },
                { label: 'Income Trend', value: `${calc.trendPct >= 0 ? '+' : ''}${fmt(calc.trendPct)}%`,
                  color: calc.trendPct >= 0 ? 'text-green-400' : 'text-red-400' },
              ].map(m => (
                <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <div className={`text-lg font-bold ${m.color || 'text-white'}`}>{m.value}</div>
                  <div className="text-xs text-gray-400 mt-1">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Lender Notes */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-300 mb-2">📋 Underwriter Notes</p>
              <div className="space-y-1">
                {[
                  `${analysisPeriod}-month ${accountType} account analysis. Avg gross deposits: $${fmt(calc.avgMonthlyDeposits)}/mo.`,
                  accountType === 'business' ? `Expense ratio: ${Math.round(calc.expenseRatio * 100)}% applied per ${BUSINESS_TYPES.find(b => b.value === businessType)?.label.split('(')[0].trim()} industry standard.` : 'Personal account — no expense ratio applied. Lender review required.',
                  parseFloat(ownershipPct) < 100 ? `Business ownership: ${ownershipPct}% — income pro-rated accordingly.` : '',
                  calc.totalAddbacks > 0 ? `Total monthly add-backs: $${fmt(calc.totalAddbacks)} documented from tax returns.` : '',
                  `Income trend: ${fmt(calc.trendPct)}% (${calc.trendPct >= 0 ? 'favorable' : 'declining — additional documentation may be required'}).`,
                ].filter(Boolean).map((note, i) => (
                  <p key={i} className="text-xs text-blue-200/80">• {note}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        {scenarioIdParam && (
          <div className="flex justify-end">
            <button onClick={handleSaveToRecord} disabled={recordSaving}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
              {recordSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>Saving…
                </>
              ) : savedRecordId ? '✅ Saved to Decision Record' : '💾 Save to Decision Record'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
