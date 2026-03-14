import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'

// ─────────────────────────────────────────────────────────────
// CONDITION LIBRARY
// Each condition has a `show` predicate that receives the
// scenario object and returns true if the item is applicable.
// ─────────────────────────────────────────────────────────────
const CONDITION_LIBRARY = [

  // ── UNIVERSAL (always shown) ──────────────────────────────
  {
    id: 'uni_01', category: 'Application & Identity',
    label: 'Signed 1003 (URLA) — all sections complete',
    detail: 'Borrower and co-borrower signatures required. Section VIII declarations reviewed.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_02', category: 'Application & Identity',
    label: 'Government ID — borrower & co-borrower',
    detail: "Valid driver's license or passport. Must not be expired.",
    show: () => true, priority: 1,
  },
  {
    id: 'uni_03', category: 'Application & Identity',
    label: 'Social Security Cards / ITIN documentation',
    detail: 'SSN or ITIN verified. Card copy or alternative verification per lender guidelines.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_04', category: 'Credit',
    label: 'Tri-merge credit report ordered',
    detail: 'All three bureaus pulled. Scores reviewed for all borrowers.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_05', category: 'Credit',
    label: 'Credit report — all inquiries explained',
    detail: 'Any inquiry within 90 days requires letter of explanation from borrower.',
    show: () => true, priority: 2,
  },
  {
    id: 'uni_06', category: 'Credit',
    label: 'Collections / charge-offs — disposition documented',
    detail: 'Medical vs. non-medical collections. Pay-off or exclude per program guidelines.',
    show: () => true, priority: 2,
  },
  {
    id: 'uni_07', category: 'Income',
    label: '30-day paystubs (most recent)',
    detail: 'All employed borrowers. YTD earnings reviewed against W-2.',
    show: (s) => !isSelfEmployed(s), priority: 1,
  },
  {
    id: 'uni_08', category: 'Income',
    label: 'W-2s — 2 years (all employers)',
    detail: 'Both years required. Gap in employment requires explanation letter.',
    show: (s) => !isSelfEmployed(s), priority: 1,
  },
  {
    id: 'uni_09', category: 'Assets',
    label: 'Bank statements — 2 most recent months (all accounts)',
    detail: 'All pages including blanks. Large deposits (≥50% monthly income) require sourcing.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_10', category: 'Assets',
    label: 'Large deposit letters of explanation',
    detail: 'Any deposit ≥ 50% of gross monthly income must be sourced and documented.',
    show: () => true, priority: 2,
  },
  {
    id: 'uni_11', category: 'Property',
    label: 'Signed purchase contract (all addenda)',
    detail: 'Fully executed. All addenda, amendments, and seller concession agreements included.',
    show: (s) => isPurchase(s), priority: 1,
  },
  {
    id: 'uni_12', category: 'Property',
    label: 'Appraisal ordered / appraisal waiver confirmed',
    detail: 'Full appraisal or DU/LPA PIW. Appraiser independence requirements met.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_13', category: 'Property',
    label: 'Homeowners insurance — binder or policy',
    detail: 'Coverage ≥ replacement cost or loan amount. Lender named as mortgagee.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_14', category: 'Title',
    label: 'Title commitment / preliminary title report',
    detail: 'All exceptions reviewed. Liens, judgments, easements cleared or addressed.',
    show: () => true, priority: 1,
  },
  {
    id: 'uni_15', category: 'Disclosures',
    label: 'Loan Estimate — issued within 3 business days of application',
    detail: 'TRID requirement. Confirm delivery date and borrower receipt.',
    show: () => true, priority: 1,
  },

  // ── PURCHASE-SPECIFIC ─────────────────────────────────────
  {
    id: 'pur_01', category: 'Property',
    label: 'Earnest money deposit — cleared and sourced',
    detail: 'EMD must be verified in bank statements or separate documentation.',
    show: (s) => isPurchase(s), priority: 1,
  },
  {
    id: 'pur_02', category: 'Assets',
    label: 'Down payment funds — fully sourced and seasoned',
    detail: '60-day seasoning standard. Gift funds require gift letter + donor bank statement.',
    show: (s) => isPurchase(s), priority: 1,
  },
  {
    id: 'pur_03', category: 'Disclosures',
    label: 'Special Information Booklet (HUD homebuying guide)',
    detail: 'Required for purchase transactions. Delivered within 3 business days of application.',
    show: (s) => isPurchase(s), priority: 2,
  },

  // ── REFINANCE-SPECIFIC ────────────────────────────────────
  {
    id: 'ref_01', category: 'Property',
    label: 'Mortgage statement — 12-month payment history',
    detail: '0x30 late payments required for most programs. Review for all existing liens.',
    show: (s) => isRefi(s), priority: 1,
  },
  {
    id: 'ref_02', category: 'Disclosures',
    label: 'Right of Rescission — 3-day waiting period confirmed',
    detail: 'Required for primary residence refinances. Cannot fund before rescission period expires.',
    show: (s) => isRefi(s) && isPrimaryResidence(s), priority: 1,
  },
  {
    id: 'ref_03', category: 'Assets',
    label: 'Payoff statement — all liens to be retired',
    detail: 'Per diem, good-through date, and wire instructions required.',
    show: (s) => isRefi(s), priority: 1,
  },

  // ── CASH-OUT SPECIFIC ─────────────────────────────────────
  {
    id: 'co_01', category: 'Application & Identity',
    label: 'Cash-out purpose — documented and disclosed',
    detail: 'Letter of explanation from borrower stating purpose of cash-out proceeds.',
    show: (s) => isCashOut(s), priority: 2,
  },
  {
    id: 'co_02', category: 'Income',
    label: 'Reserves post-closing — verified (2–6 months PITIA)',
    detail: 'Cash-out refi typically requires 2–6 months reserves depending on loan type and LTV.',
    show: (s) => isCashOut(s), priority: 2,
  },

  // ── FHA-SPECIFIC ──────────────────────────────────────────
  {
    id: 'fha_01', category: 'Program — FHA',
    label: 'FHA case number ordered',
    detail: 'Must be assigned before appraisal is ordered. Verify not transferred from another lender.',
    show: (s) => isFHA(s), priority: 1,
  },
  {
    id: 'fha_02', category: 'Program — FHA',
    label: 'CAIVRS clearance confirmed',
    detail: 'All borrowers must clear CAIVRS (no federal debt delinquency).',
    show: (s) => isFHA(s), priority: 1,
  },
  {
    id: 'fha_03', category: 'Program — FHA',
    label: 'MIP disclosed — upfront and annual',
    detail: 'UFMIP (1.75%) and annual MIP rate disclosed. Duration based on LTV and term.',
    show: (s) => isFHA(s), priority: 1,
  },
  {
    id: 'fha_04', category: 'Program — FHA',
    label: 'FHA appraisal — HUD-approved appraiser, FHA protocols',
    detail: 'Appraiser must be FHA-approved. MPR (Minimum Property Requirements) met.',
    show: (s) => isFHA(s), priority: 1,
  },
  {
    id: 'fha_05', category: 'Program — FHA',
    label: 'Student loan payment documented (IBR / 0.5% rule)',
    detail: 'If IBR payment = $0 or deferred, use 0.5% of outstanding balance per FHA guidelines.',
    show: (s) => isFHA(s), priority: 2,
  },

  // ── VA-SPECIFIC ───────────────────────────────────────────
  {
    id: 'va_01', category: 'Program — VA',
    label: 'Certificate of Eligibility (COE) obtained',
    detail: 'VA COE confirms entitlement. Order via ACE portal or Form 26-1880.',
    show: (s) => isVA(s), priority: 1,
  },
  {
    id: 'va_02', category: 'Program — VA',
    label: 'VA appraisal ordered — VA-approved appraiser',
    detail: 'VA LAPP/SAPP appraisal. MPR requirements apply.',
    show: (s) => isVA(s), priority: 1,
  },
  {
    id: 'va_03', category: 'Program — VA',
    label: 'Funding fee amount confirmed / exemption verified',
    detail: 'Verify if veteran is exempt (disability rating ≥10%). Fee varies by usage and down payment.',
    show: (s) => isVA(s), priority: 1,
  },
  {
    id: 'va_04', category: 'Program — VA',
    label: 'Residual income — calculated and documented',
    detail: 'VA residual income must meet regional minimums based on family size and loan amount.',
    show: (s) => isVA(s), priority: 1,
  },
  {
    id: 'va_05', category: 'Program — VA',
    label: 'VA Amendatory Clause / FSBO addendum (purchase)',
    detail: 'Required for purchase. Allows veteran to exit if appraised value is less than purchase price.',
    show: (s) => isVA(s) && isPurchase(s), priority: 1,
  },

  // ── USDA-SPECIFIC ─────────────────────────────────────────
  {
    id: 'usda_01', category: 'Program — USDA',
    label: 'USDA property eligibility confirmed (rural map)',
    detail: 'Property address must fall in USDA-eligible area per current USDA eligibility map.',
    show: (s) => isUSDA(s), priority: 1,
  },
  {
    id: 'usda_02', category: 'Program — USDA',
    label: 'Household income — all members documented',
    detail: 'ALL household members income counted (not just borrowers). Must not exceed 115% AMI.',
    show: (s) => isUSDA(s), priority: 1,
  },
  {
    id: 'usda_03', category: 'Program — USDA',
    label: 'GUS approval / conditional commitment obtained',
    detail: 'GUS Accept or Refer with approved findings from USDA Rural Development.',
    show: (s) => isUSDA(s), priority: 1,
  },

  // ── CONVENTIONAL-SPECIFIC ─────────────────────────────────
  {
    id: 'conv_01', category: 'Program — Conventional',
    label: 'DU / LPA AUS findings — final approval obtained',
    detail: 'Final AUS run with all conditions cleared. Approve/Eligible required.',
    show: (s) => isConventional(s), priority: 1,
  },
  {
    id: 'conv_02', category: 'Program — Conventional',
    label: 'PMI ordered / waived (≥20% down confirmed)',
    detail: 'If LTV > 80%, PMI required. If LTV ≤ 80%, PMI waiver documented.',
    show: (s) => isConventional(s), priority: 1,
  },

  // ── SELF-EMPLOYED ─────────────────────────────────────────
  {
    id: 'se_01', category: 'Income — Self-Employed',
    label: 'Federal tax returns — 2 years (personal 1040)',
    detail: 'All pages and schedules. Both years required. Signed by borrower.',
    show: (s) => isSelfEmployed(s), priority: 1,
  },
  {
    id: 'se_02', category: 'Income — Self-Employed',
    label: 'Business tax returns — 2 years (1120S / 1065 / Schedule C)',
    detail: 'All pages. Partnership K-1s included. CPA letter if needed for income analysis.',
    show: (s) => isSelfEmployed(s), priority: 1,
  },
  {
    id: 'se_03', category: 'Income — Self-Employed',
    label: 'Year-to-date P&L statement — CPA-prepared or borrower-signed',
    detail: 'Within 60 days. Required if current year income used for qualifying.',
    show: (s) => isSelfEmployed(s), priority: 1,
  },
  {
    id: 'se_04', category: 'Income — Self-Employed',
    label: 'Business license or CPA letter — 2-year history confirmed',
    detail: 'Must evidence 2+ years of self-employment in same business/industry.',
    show: (s) => isSelfEmployed(s), priority: 2,
  },

  // ── INVESTMENT PROPERTY ────────────────────────────────────
  {
    id: 'inv_01', category: 'Property — Investment',
    label: 'Schedule E — rental income history (all investment properties)',
    detail: 'Last 2 years tax returns. Rental income averaged and vacancy factor applied.',
    show: (s) => isInvestment(s), priority: 1,
  },
  {
    id: 'inv_02', category: 'Property — Investment',
    label: 'Lease agreement(s) — current, signed',
    detail: 'If rental income used for qualifying. Must be current and fully executed.',
    show: (s) => isInvestment(s), priority: 2,
  },
  {
    id: 'inv_03', category: 'Property — Investment',
    label: 'Reserves — 6 months PITIA per investment property',
    detail: 'Most conventional investors require 6 months reserves on each rental.',
    show: (s) => isInvestment(s), priority: 1,
  },

  // ── CONDO SPECIFIC ────────────────────────────────────────
  {
    id: 'condo_01', category: 'Property — Condo',
    label: 'Condo project approval — FNMA/FHA/VA warranted',
    detail: 'Verify project is on approved list or submit for full/PERS review.',
    show: (s) => isCondo(s), priority: 1,
  },
  {
    id: 'condo_02', category: 'Property — Condo',
    label: 'HOA budget / financials — 10% reserve funding confirmed',
    detail: 'HOA must have adequate reserves. Less than 10% funding is a red flag.',
    show: (s) => isCondo(s), priority: 2,
  },
  {
    id: 'condo_03', category: 'Property — Condo',
    label: 'HOA master insurance — hazard + liability coverage',
    detail: 'Master policy covers structure. Borrower needs HO-6 for interior/contents.',
    show: (s) => isCondo(s), priority: 1,
  },

  // ── GIFT FUNDS ────────────────────────────────────────────
  {
    id: 'gift_01', category: 'Assets — Gift Funds',
    label: 'Gift letter — donor relationship, amount, no repayment',
    detail: 'Must state: relationship to borrower, amount, source, and no repayment required.',
    show: (s) => hasGiftFunds(s), priority: 1,
  },
  {
    id: 'gift_02', category: 'Assets — Gift Funds',
    label: 'Donor bank statement — gift funds sourced',
    detail: 'Show funds in donor account prior to transfer. Wire receipt or cancelled check.',
    show: (s) => hasGiftFunds(s), priority: 1,
  },

  // ── CLOSING / FINAL ────────────────────────────────────────
  {
    id: 'cls_01', category: 'Closing',
    label: 'Closing Disclosure — issued 3 business days before closing',
    detail: 'CD must be received (not just sent) 3 business days before consummation.',
    show: () => true, priority: 1,
  },
  {
    id: 'cls_02', category: 'Closing',
    label: 'Final walkthrough — completed (purchase)',
    detail: 'Buyer right to final walkthrough before closing. Document completion.',
    show: (s) => isPurchase(s), priority: 2,
  },
  {
    id: 'cls_03', category: 'Closing',
    label: 'Flood zone determination — SFHDF form on file',
    detail: 'Standard Flood Hazard Determination required for all loans.',
    show: () => true, priority: 1,
  },
  {
    id: 'cls_04', category: 'Closing',
    label: 'Wire instructions verified — anti-fraud protocol',
    detail: 'Verify wire instructions via phone to known number. Never from email alone.',
    show: () => true, priority: 1,
  },
]

// ─────────────────────────────────────────────────────────────
// PREDICATES — read scenario fields to determine applicability
// ─────────────────────────────────────────────────────────────
function loanType(s) { return (s?.loanType || s?.loan_type || '').toLowerCase() }
function purpose(s) { return (s?.loanPurpose || s?.purpose || '').toLowerCase() }
function occupancy(s) { return (s?.occupancyType || s?.occupancy || '').toLowerCase() }
function propType(s) { return (s?.propertyType || s?.property_type || '').toLowerCase() }
function employmentType(s) { return (s?.employmentType || s?.employment_type || '').toLowerCase() }

function isFHA(s) { return loanType(s).includes('fha') }
function isVA(s) { return loanType(s).includes('va') }
function isUSDA(s) { return loanType(s).includes('usda') }
function isConventional(s) { return loanType(s).includes('conv') || loanType(s).includes('conventional') }
function isPurchase(s) { return purpose(s).includes('purchase') }
function isRefi(s) { return purpose(s).includes('refi') || purpose(s).includes('refinance') }
function isCashOut(s) { return purpose(s).includes('cash') }
function isPrimaryResidence(s) { return occupancy(s).includes('primary') || occupancy(s).includes('owner') }
function isInvestment(s) { return occupancy(s).includes('invest') }
function isCondo(s) { return propType(s).includes('condo') }
function isSelfEmployed(s) { return employmentType(s).includes('self') }
function hasGiftFunds(s) { return !!(s?.giftFunds || s?.gift_funds) }

const ITEM_STATUS_OPTIONS = [
  { value: 'pending',   label: 'Pending',       color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  { value: 'received',  label: 'Received ✓',    color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  { value: 'waived',    label: 'Waived',         color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  { value: 'exception', label: 'Exception',      color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  { value: 'na',        label: 'N/A',            color: 'text-gray-400 bg-gray-400/10 border-gray-400/30' },
]

function getStatusStyle(v) {
  return ITEM_STATUS_OPTIONS.find(s => s.value === v)?.color || 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
}

const PRIORITY_LABEL = { 1: '🔴 Required', 2: '🟡 Conditional' }

export default function IntelligentChecklist() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statuses, setStatuses] = useState({})
  const [notes, setNotes] = useState({})
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [recordSaving, setRecordSaving] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState(null)

  const { reportFindings } = useDecisionRecord(scenarioIdParam)

  useEffect(() => {
    if (!scenarioIdParam) return
    const load = async () => {
      setLoading(true)
      try {
        const snap = await getDoc(doc(db, 'scenarios', scenarioIdParam))
        if (snap.exists()) setScenario(snap.data())
      } catch (err) {
        console.error('Failed to load scenario:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [scenarioIdParam])

  // Build applicable items from library based on scenario
  const applicableItems = useMemo(() => {
    return CONDITION_LIBRARY.filter(item => item.show(scenario || {}))
  }, [scenario])

  // Init statuses when applicable items change
  useEffect(() => {
    setStatuses(prev => {
      const next = { ...prev }
      applicableItems.forEach(item => {
        if (!next[item.id]) next[item.id] = 'pending'
      })
      return next
    })
    setNotes(prev => {
      const next = { ...prev }
      applicableItems.forEach(item => {
        if (!next[item.id]) next[item.id] = ''
      })
      return next
    })
  }, [applicableItems])

  const categories = useMemo(() => {
    const cats = [...new Set(applicableItems.map(i => i.category))]
    return ['All', ...cats]
  }, [applicableItems])

  const filteredItems = useMemo(() => {
    return applicableItems.filter(item => {
      const catMatch = filterCategory === 'All' || item.category === filterCategory
      const statusMatch = filterStatus === 'All' || statuses[item.id] === filterStatus
      return catMatch && statusMatch
    })
  }, [applicableItems, filterCategory, filterStatus, statuses])

  // Stats
  const receivedCount = applicableItems.filter(i => statuses[i.id] === 'received').length
  const pendingCount = applicableItems.filter(i => statuses[i.id] === 'pending').length
  const waivedCount = applicableItems.filter(i => ['waived', 'na'].includes(statuses[i.id])).length
  const exceptionCount = applicableItems.filter(i => statuses[i.id] === 'exception').length
  const completionPct = applicableItems.length > 0
    ? Math.round(((receivedCount + waivedCount) / applicableItems.length) * 100)
    : 0

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const findings = {
        totalItems: applicableItems.length,
        receivedCount,
        pendingCount,
        waivedCount,
        exceptionCount,
        completionPct,
        loanType: scenario?.loanType || '',
        loanPurpose: scenario?.loanPurpose || '',
        occupancy: scenario?.occupancyType || '',
        propertyType: scenario?.propertyType || '',
        items: applicableItems.map(item => ({
          id: item.id,
          category: item.category,
          label: item.label,
          priority: item.priority,
          status: statuses[item.id] || 'pending',
          notes: notes[item.id] || '',
        })),
      }
      const writtenId = await reportFindings(MODULE_KEYS.INTELLIGENT_CHECKLIST, findings)
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

  // Mark all visible as received
  const markAllReceived = () => {
    setStatuses(prev => {
      const next = { ...prev }
      filteredItems.forEach(item => { next[item.id] = 'received' })
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">✅</span>
            <h1 className="text-2xl font-bold text-white">Intelligent Checklist™</h1>
            <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full font-medium">
              Module 18
            </span>
          </div>
          <p className="text-gray-400 text-sm ml-9">
            Dynamic condition checklist — auto-configured from your loan scenario
          </p>
          {borrowerName && (
            <p className="text-green-400 text-sm ml-9 mt-1 font-medium">
              📁 {borrowerName}
              {scenario?.streetAddress ? ` — ${scenario.streetAddress}` : ''}
              {scenario?.loanType ? ` · ${scenario.loanType}` : ''}
              {scenario?.loanPurpose ? ` · ${scenario.loanPurpose}` : ''}
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

        {!scenarioIdParam && !loading && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-5 text-center">
            <p className="text-yellow-300 font-medium">No scenario loaded</p>
            <p className="text-yellow-400/70 text-sm mt-1">
              Open this checklist from a scenario to get a personalized condition list. 
              Showing universal items only.
            </p>
          </div>
        )}

        {/* Progress Summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {applicableItems.length} Conditions Applicable to This File
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Auto-generated from loan type, purpose, occupancy, and property type
              </p>
            </div>
            <div className={`text-3xl font-bold ${completionPct >= 80 ? 'text-green-400' : completionPct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {completionPct}%
            </div>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3 mb-4">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Received', value: receivedCount, color: 'text-green-400' },
              { label: 'Pending', value: pendingCount, color: 'text-yellow-400' },
              { label: 'Waived / N/A', value: waivedCount, color: 'text-gray-400' },
              { label: 'Exception', value: exceptionCount, color: 'text-orange-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-800/60 rounded-lg p-2">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters + Mark All */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex-1 flex flex-wrap gap-2">
            <div>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
              >
                <option value="All">All Statuses</option>
                {ITEM_STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={markAllReceived}
            className="text-xs bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 px-4 py-2 rounded-lg transition-colors font-medium"
          >
            ✓ Mark All Visible as Received
          </button>
        </div>

        {/* Checklist Items */}
        {categories.filter(c => c !== 'All').map(cat => {
          const catItems = filteredItems.filter(i => i.category === cat)
          if (catItems.length === 0) return null
          return (
            <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-800/60 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{cat}</h3>
                <span className="text-xs text-gray-500">
                  {catItems.filter(i => statuses[i.id] === 'received').length}/{catItems.length} received
                </span>
              </div>
              <div className="divide-y divide-gray-800">
                {catItems.map(item => (
                  <div key={item.id} className="p-4 hover:bg-gray-800/20 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white text-sm">{item.label}</span>
                          <span className="text-xs text-gray-500">{PRIORITY_LABEL[item.priority]}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{item.detail}</p>
                        <input
                          type="text"
                          placeholder="Notes / date received / exception reason…"
                          value={notes[item.id] || ''}
                          onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="mt-2 w-full bg-gray-800/60 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                        />
                      </div>
                      <div className="flex-shrink-0">
                        <select
                          value={statuses[item.id] || 'pending'}
                          onChange={e => setStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className={`text-xs border rounded-lg px-3 py-2 font-medium focus:outline-none bg-transparent ${getStatusStyle(statuses[item.id])}`}
                        >
                          {ITEM_STATUS_OPTIONS.map(s => (
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
          )
        })}

        {filteredItems.length === 0 && !loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            No items match the current filters.
          </div>
        )}

        {/* Save Button */}
        {scenarioIdParam && (
          <div className="flex justify-end">
            <button
              onClick={handleSaveToRecord}
              disabled={recordSaving}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
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
