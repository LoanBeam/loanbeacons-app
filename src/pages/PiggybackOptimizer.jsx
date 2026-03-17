import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function monthlyPayment(principal, annualRate, termMonths) {
  if (!principal || !annualRate || !termMonths) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return principal / termMonths
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n) {
  return Math.round(n).toLocaleString('en-US')
}

// Estimate monthly PMI: roughly 0.5–1.2% of loan annually, scaled to LTV
function estimatePMI(loanAmount, ltv) {
  if (ltv <= 80) return 0
  // Higher LTV = higher PMI rate
  let annualRate = 0.0085 // default ~0.85%
  if (ltv > 95) annualRate = 0.012
  else if (ltv > 90) annualRate = 0.010
  else if (ltv > 85) annualRate = 0.0085
  else annualRate = 0.006
  return (loanAmount * annualRate) / 12
}

// Month when PMI drops off (when balance reaches 80% of original value)
function pmiDropOffMonth(principal, annualRate, termMonths, originalHomeValue) {
  const target = originalHomeValue * 0.80
  const r = annualRate / 100 / 12
  let balance = principal
  const pmt = monthlyPayment(principal, annualRate, termMonths)
  for (let m = 1; m <= termMonths; m++) {
    const interest = balance * r
    balance = balance - (pmt - interest)
    if (balance <= target) return m
  }
  return termMonths
}

// 5-year total cost comparison
function fiveYearCost(monthlyPITI, closingCostAdder = 0) {
  return monthlyPITI * 60 + closingCostAdder
}

const SCENARIOS = [
  { id: 'piggyback_8010', label: '80/10/10', description: '10% 2nd lien + 10% down — no PMI' },
  { id: 'piggyback_8015', label: '80/15/5', description: '15% 2nd lien + 5% down — no PMI' },
  { id: 'single_pmi',     label: 'Single Loan + PMI', description: 'One loan at full LTV with PMI' },
]

const COLOR = {
  piggyback_8010: { header: 'bg-blue-600', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30', ring: 'ring-blue-500' },
  piggyback_8015: { header: 'bg-purple-600', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30', ring: 'ring-purple-500' },
  single_pmi:     { header: 'bg-orange-600', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30', ring: 'ring-orange-500' },
}

export default function PiggybackOptimizer() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(false)

  // Inputs
  const [purchasePrice, setPurchasePrice] = useState('')
  const [downPct, setDownPct] = useState('10')  // default 10% down
  const [firstRate, setFirstRate] = useState('')
  const [secondRate8010, setSecondRate8010] = useState('')
  const [secondRate8015, setSecondRate8015] = useState('')
  const [singleRate, setSingleRate] = useState('')
  const [termYears, setTermYears] = useState('30')
  const [secondTerm, setSecondTerm] = useState('15')  // 2nd lien typically 15yr HELOC/fixed
  const [taxesMonthly, setTaxesMonthly] = useState('')
  const [insuranceMonthly, setInsuranceMonthly] = useState('')
  const [bestScenario, setBestScenario] = useState(null)

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
          const pp = data.propertyValue || data.purchasePrice || data.purchase_price || ''
          const ir = data.interestRate || ''
          if (pp) setPurchasePrice(String(pp))
          if (ir) {
            setFirstRate(String(parseFloat(ir).toFixed(3)))
            setSingleRate(String(parseFloat(ir).toFixed(3)))
          }
          // Taxes & insurance from scenario if available
          if (data.monthlyTaxes) setTaxesMonthly(String(data.monthlyTaxes))
          if (data.monthlyInsurance) setInsuranceMonthly(String(data.monthlyInsurance))
        }
      } catch (err) {
        console.error('Failed to load scenario:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [scenarioIdParam])

  // ── Core calculations ──────────────────────────────────────
  const calc = useMemo(() => {
    const pp = parseFloat(purchasePrice) || 0
    const dp = parseFloat(downPct) / 100
    const taxes = parseFloat(taxesMonthly) || 0
    const ins = parseFloat(insuranceMonthly) || 0
    const term = parseInt(termYears) * 12
    const term2 = parseInt(secondTerm) * 12
    const r1 = parseFloat(firstRate) || 0
    const r2_8010 = parseFloat(secondRate8010) || 0
    const r2_8015 = parseFloat(secondRate8015) || 0
    const rSingle = parseFloat(singleRate) || 0

    if (!pp || !r1) return null

    const downAmount = pp * dp

    // ── 80/10/10 ──────────────────────────────────────────────
    const loan1_8010 = pp * 0.80
    const loan2_8010 = pp * 0.10
    const down_8010 = pp * 0.10
    const pmt1_8010 = monthlyPayment(loan1_8010, r1, term)
    const pmt2_8010 = r2_8010 ? monthlyPayment(loan2_8010, r2_8010, term2) : 0
    const totalPI_8010 = pmt1_8010 + pmt2_8010
    const totalPITI_8010 = totalPI_8010 + taxes + ins
    const ltv_8010 = 80

    // ── 80/15/5 ──────────────────────────────────────────────
    const loan1_8015 = pp * 0.80
    const loan2_8015 = pp * 0.15
    const down_8015 = pp * 0.05
    const pmt1_8015 = monthlyPayment(loan1_8015, r1, term)
    const pmt2_8015 = r2_8015 ? monthlyPayment(loan2_8015, r2_8015, term2) : 0
    const totalPI_8015 = pmt1_8015 + pmt2_8015
    const totalPITI_8015 = totalPI_8015 + taxes + ins
    const ltv_8015 = 80

    // ── Single + PMI ──────────────────────────────────────────
    const ltvSingle = (1 - dp) * 100
    const loanSingle = pp * (1 - dp)
    const pmtSingle = monthlyPayment(loanSingle, rSingle || r1, term)
    const pmiMonthly = estimatePMI(loanSingle, ltvSingle)
    const totalPI_single = pmtSingle + pmiMonthly
    const totalPITI_single = totalPI_single + taxes + ins
    const pmiDropMonth = ltvSingle > 80
      ? pmiDropOffMonth(loanSingle, rSingle || r1, term, pp)
      : 0
    const pmiTotalCost = pmiMonthly * pmiDropMonth

    // ── 5-year cost comparison ────────────────────────────────
    const cost5yr_8010 = fiveYearCost(totalPITI_8010)
    const cost5yr_8015 = fiveYearCost(totalPITI_8015)
    const cost5yr_single = fiveYearCost(totalPITI_single)

    // ── Break-even: single+PMI vs piggyback ──────────────────
    // Month where cumulative PMI paid = extra 2nd lien interest paid
    // Simplified: find when 80/10/10 cumulative becomes cheaper than single
    const monthlyDiff_8010_vs_single = totalPITI_8010 - totalPITI_single
    const monthlyDiff_8015_vs_single = totalPITI_8015 - totalPITI_single

    return {
      pp,
      // 80/10/10
      loan1_8010, loan2_8010, down_8010, pmt1_8010, pmt2_8010,
      totalPI_8010, totalPITI_8010, cost5yr_8010, ltv_8010,
      // 80/15/5
      loan1_8015, loan2_8015, down_8015, pmt1_8015, pmt2_8015,
      totalPI_8015, totalPITI_8015, cost5yr_8015, ltv_8015,
      // Single + PMI
      ltvSingle, loanSingle, pmtSingle, pmiMonthly, pmiTotalCost,
      totalPI_single, totalPITI_single, cost5yr_single, pmiDropMonth,
      // Deltas
      monthlyDiff_8010_vs_single, monthlyDiff_8015_vs_single,
      downAmount,
    }
  }, [purchasePrice, downPct, firstRate, secondRate8010, secondRate8015,
      singleRate, termYears, secondTerm, taxesMonthly, insuranceMonthly])

  // Auto-pick best scenario
  useEffect(() => {
    if (!calc) return
    const costs = [
      { id: 'piggyback_8010', cost: calc.cost5yr_8010 },
      { id: 'piggyback_8015', cost: calc.cost5yr_8015 },
      { id: 'single_pmi', cost: calc.cost5yr_single },
    ]
    const best = costs.sort((a, b) => a.cost - b.cost)[0]
    setBestScenario(best.id)
  }, [calc])

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam || !calc) return
    setRecordSaving(true)
    try {
      const findings = {
        inputs: { purchasePrice: calc.pp, downPct, firstRate, secondRate8010, secondRate8015, singleRate, termYears, secondTerm },
        piggyback_8010: {
          firstLoan: calc.loan1_8010, secondLoan: calc.loan2_8010, downPayment: calc.down_8010,
          monthlyPI: calc.totalPI_8010, monthlyPITI: calc.totalPITI_8010, fiveYearCost: calc.cost5yr_8010,
        },
        piggyback_8015: {
          firstLoan: calc.loan1_8015, secondLoan: calc.loan2_8015, downPayment: calc.down_8015,
          monthlyPI: calc.totalPI_8015, monthlyPITI: calc.totalPITI_8015, fiveYearCost: calc.cost5yr_8015,
        },
        single_pmi: {
          loan: calc.loanSingle, ltv: calc.ltvSingle, monthlyPMI: calc.pmiMonthly,
          pmiDropMonth: calc.pmiDropMonth, totalPMICost: calc.pmiTotalCost,
          monthlyPI: calc.totalPI_single, monthlyPITI: calc.totalPITI_single, fiveYearCost: calc.cost5yr_single,
        },
        recommendation: bestScenario,
      }
      const writtenId = await reportFindings(MODULE_KEYS.PIGGYBACK_OPTIMIZER, findings)
      if (writtenId) setSavedRecordId(writtenId)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setRecordSaving(false)
    }
  }

  const borrowerName = scenario
    ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || 'Borrower'
    : null

  const hasSecondRates = secondRate8010 && secondRate8015

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🏗️</span>
            <h1 className="text-2xl font-bold text-white">Piggyback 2nd Optimizer™</h1>
            <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-medium">
              Module 19
            </span>
          </div>
          <p className="text-gray-400 text-sm ml-9">
            80/10/10 · 80/15/5 · Single Loan + PMI — side-by-side payment &amp; cost comparison
          </p>
          {borrowerName && (
            <p className="text-orange-400 text-sm ml-9 mt-1 font-medium">
              📁 {borrowerName}
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

        {loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
            Loading scenario data…
          </div>
        )}

        {/* Inputs */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Loan Parameters
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Purchase Price ($)</label>
              <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                placeholder="450,000"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Actual Down Payment %</label>
              <select value={downPct} onChange={e => setDownPct(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                <option value="5">5%</option>
                <option value="10">10%</option>
                <option value="15">15%</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">1st Lien Rate (%)</label>
              <input type="number" step="0.125" value={firstRate} onChange={e => setFirstRate(e.target.value)}
                placeholder="7.125"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">1st Lien Term</label>
              <select value={termYears} onChange={e => setTermYears(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                <option value="30">30 Years</option>
                <option value="20">20 Years</option>
                <option value="15">15 Years</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">2nd Lien Rate — 80/10/10 (%)</label>
              <input type="number" step="0.125" value={secondRate8010} onChange={e => setSecondRate8010(e.target.value)}
                placeholder="8.500"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">2nd Lien Rate — 80/15/5 (%)</label>
              <input type="number" step="0.125" value={secondRate8015} onChange={e => setSecondRate8015(e.target.value)}
                placeholder="8.750"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Single Loan Rate (%)</label>
              <input type="number" step="0.125" value={singleRate} onChange={e => setSingleRate(e.target.value)}
                placeholder="7.125"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">2nd Lien Term</label>
              <select value={secondTerm} onChange={e => setSecondTerm(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                <option value="10">10 Years</option>
                <option value="15">15 Years</option>
                <option value="20">20 Years</option>
                <option value="30">30 Years</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Monthly Taxes ($) <span className="text-gray-500">optional</span></label>
              <input type="number" value={taxesMonthly} onChange={e => setTaxesMonthly(e.target.value)}
                placeholder="500"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Monthly Insurance ($) <span className="text-gray-500">optional</span></label>
              <input type="number" value={insuranceMonthly} onChange={e => setInsuranceMonthly(e.target.value)}
                placeholder="150"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
            </div>
          </div>
        </div>

        {/* Results */}
        {calc && (firstRate || singleRate) && (
          <>
            {/* Recommendation banner */}
            {bestScenario && (
              <div className={`rounded-xl border p-4 flex items-center gap-3 ${
                bestScenario === 'piggyback_8010' ? 'bg-blue-900/20 border-blue-500/40' :
                bestScenario === 'piggyback_8015' ? 'bg-purple-900/20 border-purple-500/40' :
                'bg-orange-900/20 border-orange-500/40'
              }`}>
                <span className="text-2xl">🏆</span>
                <div>
                  <p className={`font-bold text-sm ${
                    bestScenario === 'piggyback_8010' ? 'text-blue-300' :
                    bestScenario === 'piggyback_8015' ? 'text-purple-300' : 'text-orange-300'
                  }`}>
                    Lowest 5-Year Cost: {SCENARIOS.find(s => s.id === bestScenario)?.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Based on current rates and inputs. Verify 2nd lien availability with lender.
                  </p>
                </div>
              </div>
            )}

            {/* Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* 80/10/10 */}
              <div className={`bg-gray-900 border-2 rounded-xl overflow-hidden ${bestScenario === 'piggyback_8010' ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-700'}`}>
                <div className="bg-blue-600 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white">80/10/10</h3>
                    {bestScenario === 'piggyback_8010' && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">BEST</span>}
                  </div>
                  <p className="text-blue-100 text-xs mt-0.5">10% 2nd lien + 10% down</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-sm border-b border-gray-800 pb-2">
                    <span className="text-gray-400">Down Payment</span>
                    <span className="text-white font-medium">${fmtInt(calc.down_8010)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">1st Lien ({firstRate}%)</span>
                    <span className="text-white">${fmt(calc.pmt1_8010)}/mo</span>
                  </div>
                  {secondRate8010 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">2nd Lien ({secondRate8010}%)</span>
                      <span className="text-white">${fmt(calc.pmt2_8010)}/mo</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">PMI</span>
                    <span className="text-green-400 font-medium">None ✓</span>
                  </div>
                  <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-500/20">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-gray-300">Total P&I</span>
                      <span className="text-blue-300">${fmt(calc.totalPI_8010)}/mo</span>
                    </div>
                    {(taxesMonthly || insuranceMonthly) && (
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-500">Total PITI</span>
                        <span className="text-gray-300">${fmt(calc.totalPITI_8010)}/mo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 pt-1">
                    <span>5-Year Total Cost</span>
                    <span className="text-white font-semibold">${fmtInt(calc.cost5yr_8010)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>vs. Single + PMI</span>
                    <span className={calc.monthlyDiff_8010_vs_single <= 0 ? 'text-green-400' : 'text-red-400'}>
                      {calc.monthlyDiff_8010_vs_single <= 0 ? '▼' : '▲'} ${fmt(Math.abs(calc.monthlyDiff_8010_vs_single))}/mo
                    </span>
                  </div>
                </div>
              </div>

              {/* 80/15/5 */}
              <div className={`bg-gray-900 border-2 rounded-xl overflow-hidden ${bestScenario === 'piggyback_8015' ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-gray-700'}`}>
                <div className="bg-purple-600 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white">80/15/5</h3>
                    {bestScenario === 'piggyback_8015' && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">BEST</span>}
                  </div>
                  <p className="text-purple-100 text-xs mt-0.5">15% 2nd lien + 5% down</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-sm border-b border-gray-800 pb-2">
                    <span className="text-gray-400">Down Payment</span>
                    <span className="text-white font-medium">${fmtInt(calc.down_8015)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">1st Lien ({firstRate}%)</span>
                    <span className="text-white">${fmt(calc.pmt1_8015)}/mo</span>
                  </div>
                  {secondRate8015 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">2nd Lien ({secondRate8015}%)</span>
                      <span className="text-white">${fmt(calc.pmt2_8015)}/mo</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">PMI</span>
                    <span className="text-green-400 font-medium">None ✓</span>
                  </div>
                  <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-500/20">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-gray-300">Total P&I</span>
                      <span className="text-purple-300">${fmt(calc.totalPI_8015)}/mo</span>
                    </div>
                    {(taxesMonthly || insuranceMonthly) && (
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-500">Total PITI</span>
                        <span className="text-gray-300">${fmt(calc.totalPITI_8015)}/mo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 pt-1">
                    <span>5-Year Total Cost</span>
                    <span className="text-white font-semibold">${fmtInt(calc.cost5yr_8015)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>vs. Single + PMI</span>
                    <span className={calc.monthlyDiff_8015_vs_single <= 0 ? 'text-green-400' : 'text-red-400'}>
                      {calc.monthlyDiff_8015_vs_single <= 0 ? '▼' : '▲'} ${fmt(Math.abs(calc.monthlyDiff_8015_vs_single))}/mo
                    </span>
                  </div>
                </div>
              </div>

              {/* Single + PMI */}
              <div className={`bg-gray-900 border-2 rounded-xl overflow-hidden ${bestScenario === 'single_pmi' ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-gray-700'}`}>
                <div className="bg-orange-600 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white">Single + PMI</h3>
                    {bestScenario === 'single_pmi' && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">BEST</span>}
                  </div>
                  <p className="text-orange-100 text-xs mt-0.5">One loan · {downPct}% down · {fmt(calc.ltvSingle)}% LTV</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-sm border-b border-gray-800 pb-2">
                    <span className="text-gray-400">Down Payment</span>
                    <span className="text-white font-medium">${fmtInt(calc.downAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">1st Lien ({singleRate || firstRate}%)</span>
                    <span className="text-white">${fmt(calc.pmtSingle)}/mo</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">PMI (est.)</span>
                    <span className="text-red-400">${fmt(calc.pmiMonthly)}/mo</span>
                  </div>
                  {calc.pmiDropMonth > 0 && (
                    <div className="text-xs text-gray-500">
                      PMI drops ~month {calc.pmiDropMonth} ({Math.floor(calc.pmiDropMonth/12)}y {calc.pmiDropMonth%12}m)
                    </div>
                  )}
                  <div className="bg-orange-900/20 rounded-lg p-3 border border-orange-500/20">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-gray-300">Total P&I+PMI</span>
                      <span className="text-orange-300">${fmt(calc.totalPI_single)}/mo</span>
                    </div>
                    {(taxesMonthly || insuranceMonthly) && (
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-500">Total PITI</span>
                        <span className="text-gray-300">${fmt(calc.totalPITI_single)}/mo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 pt-1">
                    <span>5-Year Total Cost</span>
                    <span className="text-white font-semibold">${fmtInt(calc.cost5yr_single)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Total PMI Paid (est.)</span>
                    <span className="text-red-400">${fmtInt(calc.pmiTotalCost)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Side-by-Side Summary
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Metric</th>
                      <th className="text-right px-4 py-3 text-xs text-blue-400 font-medium">80/10/10</th>
                      <th className="text-right px-4 py-3 text-xs text-purple-400 font-medium">80/15/5</th>
                      <th className="text-right px-4 py-3 text-xs text-orange-400 font-medium">Single + PMI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {[
                      { label: 'Down Payment', v1: `$${fmtInt(calc.down_8010)}`, v2: `$${fmtInt(calc.down_8015)}`, v3: `$${fmtInt(calc.downAmount)}` },
                      { label: '1st Lien Amount', v1: `$${fmtInt(calc.loan1_8010)}`, v2: `$${fmtInt(calc.loan1_8015)}`, v3: `$${fmtInt(calc.loanSingle)}` },
                      { label: '2nd Lien Amount', v1: `$${fmtInt(calc.loan2_8010)}`, v2: `$${fmtInt(calc.loan2_8015)}`, v3: '—' },
                      { label: 'Monthly P&I', v1: `$${fmt(calc.totalPI_8010)}`, v2: `$${fmt(calc.totalPI_8015)}`, v3: `$${fmt(calc.totalPI_single)}` },
                      { label: 'Monthly PMI', v1: 'None', v2: 'None', v3: `$${fmt(calc.pmiMonthly)}` },
                      { label: '5-Year Total Cost', v1: `$${fmtInt(calc.cost5yr_8010)}`, v2: `$${fmtInt(calc.cost5yr_8015)}`, v3: `$${fmtInt(calc.cost5yr_single)}` },
                      { label: 'PMI Duration', v1: 'N/A', v2: 'N/A', v3: calc.pmiDropMonth > 0 ? `~${Math.floor(calc.pmiDropMonth/12)}y ${calc.pmiDropMonth%12}m` : 'N/A' },
                    ].map(row => (
                      <tr key={row.label} className="hover:bg-gray-800/20">
                        <td className="px-5 py-3 text-gray-300">{row.label}</td>
                        <td className="px-4 py-3 text-right text-blue-300 font-medium">{row.v1}</td>
                        <td className="px-4 py-3 text-right text-purple-300 font-medium">{row.v2}</td>
                        <td className="px-4 py-3 text-right text-orange-300 font-medium">{row.v3}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* LO Notes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Key Considerations
              </h2>
              <div className="space-y-2">
                {[
                  '2nd lien rates are typically higher than 1st lien rates — verify current HELOC or fixed 2nd lien pricing.',
                  '80/15/5 reduces the down payment requirement to 5% while still avoiding PMI.',
                  '80/10/10 requires 10% down but lowers the 2nd lien balance vs. 80/15/5.',
                  'Single + PMI may win if 2nd lien rates are high or borrower plans to sell/refi within 2–3 years.',
                  'PMI is tax-deductible for some borrowers — consult tax advisor.',
                  'Conventional 2nd liens may have CLTV limits (typically 89.99%). Verify with lender.',
                ].map((note, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-orange-400 mt-0.5 text-xs">▸</span>
                    <p className="text-xs text-gray-400">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!calc && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-500">
            Enter purchase price and interest rate above to run the comparison.
          </div>
        )}

        {/* Save Button */}
        {scenarioIdParam && calc && (
          <div className="flex justify-end">
            <button
              onClick={handleSaveToRecord}
              disabled={recordSaving}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              {recordSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </>
              ) : savedRecordId ? '✅ Saved to Decision Record' : '💾 Save to Decision Record'}
            </button>
          </div>
        )}
      </div>
          <CanonicalSequenceBar currentModuleKey="PIGGYBACK_OPTIMIZER" scenarioId={scenarioId} recordId={savedRecordId} />
</div>
  )
}
