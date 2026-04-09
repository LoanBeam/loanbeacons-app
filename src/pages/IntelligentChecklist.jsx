// src/pages/IntelligentChecklist.jsx
// LoanBeacons™ — Module 18 | Stage 4: Verification & Submit
// Intelligent Checklist™ — Dynamic condition checklist + Submission Package

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'
import CanonicalSequenceBar from '../components/CanonicalSequenceBar'

// ─────────────────────────────────────────────────────────────
// CONDITION LIBRARY
// ─────────────────────────────────────────────────────────────
const CONDITION_LIBRARY = [
  { id: 'uni_01', category: 'Application & Identity', label: 'Signed 1003 (URLA) — all sections complete', detail: 'Borrower and co-borrower signatures required. Section VIII declarations reviewed.', show: () => true, priority: 1 },
  { id: 'uni_02', category: 'Application & Identity', label: 'Government ID — borrower & co-borrower', detail: "Valid driver's license or passport. Must not be expired.", show: () => true, priority: 1 },
  { id: 'uni_03', category: 'Application & Identity', label: 'Social Security Cards / ITIN documentation', detail: 'SSN or ITIN verified. Card copy or alternative verification per lender guidelines.', show: () => true, priority: 1 },
  { id: 'uni_04', category: 'Credit', label: 'Tri-merge credit report ordered', detail: 'All three bureaus pulled. Scores reviewed for all borrowers.', show: () => true, priority: 1 },
  { id: 'uni_05', category: 'Credit', label: 'Credit report — all inquiries explained', detail: 'Any inquiry within 90 days requires letter of explanation from borrower.', show: () => true, priority: 2 },
  { id: 'uni_06', category: 'Credit', label: 'Collections / charge-offs — disposition documented', detail: 'Medical vs. non-medical collections. Pay-off or exclude per program guidelines.', show: () => true, priority: 2 },
  { id: 'uni_07', category: 'Income', label: '30-day paystubs (most recent)', detail: 'All employed borrowers. YTD earnings reviewed against W-2.', show: (s) => !isSelfEmployed(s), priority: 1 },
  { id: 'uni_08', category: 'Income', label: 'W-2s — 2 years (all employers)', detail: 'Both years required. Gap in employment requires explanation letter.', show: (s) => !isSelfEmployed(s), priority: 1 },
  { id: 'uni_09', category: 'Assets', label: 'Bank statements — 2 most recent months (all accounts)', detail: 'All pages including blanks. Large deposits (>=50% monthly income) require sourcing.', show: () => true, priority: 1 },
  { id: 'uni_10', category: 'Assets', label: 'Large deposit letters of explanation', detail: 'Any deposit >= 50% of gross monthly income must be sourced and documented.', show: () => true, priority: 2 },
  { id: 'uni_11', category: 'Property', label: 'Signed purchase contract (all addenda)', detail: 'Fully executed. All addenda, amendments, and seller concession agreements included.', show: (s) => isPurchase(s), priority: 1 },
  { id: 'uni_12', category: 'Property', label: 'Appraisal ordered / appraisal waiver confirmed', detail: 'Full appraisal or DU/LPA PIW. Appraiser independence requirements met.', show: () => true, priority: 1 },
  { id: 'uni_13', category: 'Property', label: 'Homeowners insurance — binder or policy', detail: 'Coverage >= replacement cost or loan amount. Lender named as mortgagee.', show: () => true, priority: 1 },
  { id: 'uni_14', category: 'Title', label: 'Title commitment / preliminary title report', detail: 'All exceptions reviewed. Liens, judgments, easements cleared or addressed.', show: () => true, priority: 1 },
  { id: 'uni_15', category: 'Disclosures', label: 'Loan Estimate — issued within 3 business days of application', detail: 'TRID requirement. Confirm delivery date and borrower receipt.', show: () => true, priority: 1 },
  { id: 'pur_01', category: 'Property', label: 'Earnest money deposit — cleared and sourced', detail: 'EMD must be verified in bank statements or separate documentation.', show: (s) => isPurchase(s), priority: 1 },
  { id: 'pur_02', category: 'Assets', label: 'Down payment funds — fully sourced and seasoned', detail: '60-day seasoning standard. Gift funds require gift letter + donor bank statement.', show: (s) => isPurchase(s), priority: 1 },
  { id: 'pur_03', category: 'Disclosures', label: 'Special Information Booklet (HUD homebuying guide)', detail: 'Required for purchase transactions. Delivered within 3 business days of application.', show: (s) => isPurchase(s), priority: 2 },
  { id: 'ref_01', category: 'Property', label: 'Mortgage statement — 12-month payment history', detail: '0x30 late payments required for most programs. Review for all existing liens.', show: (s) => isRefi(s), priority: 1 },
  { id: 'ref_02', category: 'Disclosures', label: 'Right of Rescission — 3-day waiting period confirmed', detail: 'Required for primary residence refinances. Cannot fund before rescission period expires.', show: (s) => isRefi(s) && isPrimaryResidence(s), priority: 1 },
  { id: 'ref_03', category: 'Assets', label: 'Payoff statement — all liens to be retired', detail: 'Per diem, good-through date, and wire instructions required.', show: (s) => isRefi(s), priority: 1 },
  { id: 'co_01', category: 'Application & Identity', label: 'Cash-out purpose — documented and disclosed', detail: 'Letter of explanation from borrower stating purpose of cash-out proceeds.', show: (s) => isCashOut(s), priority: 2 },
  { id: 'co_02', category: 'Income', label: 'Reserves post-closing — verified (2-6 months PITIA)', detail: 'Cash-out refi typically requires 2-6 months reserves depending on loan type and LTV.', show: (s) => isCashOut(s), priority: 2 },
  { id: 'fha_01', category: 'Program - FHA', label: 'FHA case number ordered', detail: 'Must be assigned before appraisal is ordered. Verify not transferred from another lender.', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_02', category: 'Program - FHA', label: 'CAIVRS clearance confirmed', detail: 'All borrowers must clear CAIVRS (no federal debt delinquency).', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_03', category: 'Program - FHA', label: 'MIP disclosed — upfront and annual', detail: 'UFMIP (1.75%) and annual MIP rate disclosed. Duration based on LTV and term.', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_04', category: 'Program - FHA', label: 'FHA appraisal — HUD-approved appraiser, FHA protocols', detail: 'Appraiser must be FHA-approved. MPR (Minimum Property Requirements) met.', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_05', category: 'Program - FHA', label: 'Student loan payment documented (IBR / 0.5% rule)', detail: 'If IBR payment = $0 or deferred, use 0.5% of outstanding balance per FHA guidelines.', show: (s) => isFHA(s), priority: 2 },
  { id: 'va_01', category: 'Program - VA', label: 'Certificate of Eligibility (COE) obtained', detail: 'VA COE confirms entitlement. Order via ACE portal or Form 26-1880.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_02', category: 'Program - VA', label: 'VA appraisal ordered — VA-approved appraiser', detail: 'VA LAPP/SAPP appraisal. MPR requirements apply.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_03', category: 'Program - VA', label: 'Funding fee amount confirmed / exemption verified', detail: 'Verify if veteran is exempt (disability rating >=10%). Fee varies by usage and down payment.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_04', category: 'Program - VA', label: 'Residual income — calculated and documented', detail: 'VA residual income must meet regional minimums based on family size and loan amount.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_05', category: 'Program - VA', label: 'VA Amendatory Clause / FSBO addendum (purchase)', detail: 'Required for purchase. Allows veteran to exit if appraised value is less than purchase price.', show: (s) => isVA(s) && isPurchase(s), priority: 1 },
  { id: 'usda_01', category: 'Program - USDA', label: 'USDA property eligibility confirmed (rural map)', detail: 'Property address must fall in USDA-eligible area per current USDA eligibility map.', show: (s) => isUSDA(s), priority: 1 },
  { id: 'usda_02', category: 'Program - USDA', label: 'Household income — all members documented', detail: 'ALL household members income counted (not just borrowers). Must not exceed 115% AMI.', show: (s) => isUSDA(s), priority: 1 },
  { id: 'usda_03', category: 'Program - USDA', label: 'GUS approval / conditional commitment obtained', detail: 'GUS Accept or Refer with approved findings from USDA Rural Development.', show: (s) => isUSDA(s), priority: 1 },
  { id: 'conv_01', category: 'Program - Conventional', label: 'DU / LPA AUS findings — final approval obtained', detail: 'Final AUS run with all conditions cleared. Approve/Eligible required.', show: (s) => isConventional(s), priority: 1 },
  { id: 'conv_02', category: 'Program - Conventional', label: 'PMI ordered / waived (>=20% down confirmed)', detail: 'If LTV > 80%, PMI required. If LTV <= 80%, PMI waiver documented.', show: (s) => isConventional(s), priority: 1 },
  { id: 'se_01', category: 'Income - Self-Employed', label: 'Federal tax returns — 2 years (personal 1040)', detail: 'All pages and schedules. Both years required. Signed by borrower.', show: (s) => isSelfEmployed(s), priority: 1 },
  { id: 'se_02', category: 'Income - Self-Employed', label: 'Business tax returns — 2 years (1120S / 1065 / Schedule C)', detail: 'All pages. Partnership K-1s included. CPA letter if needed for income analysis.', show: (s) => isSelfEmployed(s), priority: 1 },
  { id: 'se_03', category: 'Income - Self-Employed', label: 'Year-to-date P&L statement — CPA-prepared or borrower-signed', detail: 'Within 60 days. Required if current year income used for qualifying.', show: (s) => isSelfEmployed(s), priority: 1 },
  { id: 'se_04', category: 'Income - Self-Employed', label: 'Business license or CPA letter — 2-year history confirmed', detail: 'Must evidence 2+ years of self-employment in same business/industry.', show: (s) => isSelfEmployed(s), priority: 2 },
  { id: 'inv_01', category: 'Property - Investment', label: 'Schedule E — rental income history (all investment properties)', detail: 'Last 2 years tax returns. Rental income averaged and vacancy factor applied.', show: (s) => isInvestment(s), priority: 1 },
  { id: 'inv_02', category: 'Property - Investment', label: 'Lease agreement(s) — current, signed', detail: 'If rental income used for qualifying. Must be current and fully executed.', show: (s) => isInvestment(s), priority: 2 },
  { id: 'inv_03', category: 'Property - Investment', label: 'Reserves — 6 months PITIA per investment property', detail: 'Most conventional investors require 6 months reserves on each rental.', show: (s) => isInvestment(s), priority: 1 },
  { id: 'condo_01', category: 'Property - Condo', label: 'Condo project approval — FNMA/FHA/VA warranted', detail: 'Verify project is on approved list or submit for full/PERS review.', show: (s) => isCondo(s), priority: 1 },
  { id: 'condo_02', category: 'Property - Condo', label: 'HOA budget / financials — 10% reserve funding confirmed', detail: 'HOA must have adequate reserves. Less than 10% funding is a red flag.', show: (s) => isCondo(s), priority: 2 },
  { id: 'condo_03', category: 'Property - Condo', label: 'HOA master insurance — hazard + liability coverage', detail: 'Master policy covers structure. Borrower needs HO-6 for interior/contents.', show: (s) => isCondo(s), priority: 1 },
  { id: 'gift_01', category: 'Assets - Gift Funds', label: 'Gift letter — donor relationship, amount, no repayment', detail: 'Must state: relationship to borrower, amount, source, and no repayment required.', show: (s) => hasGiftFunds(s), priority: 1 },
  { id: 'gift_02', category: 'Assets - Gift Funds', label: 'Donor bank statement — gift funds sourced', detail: 'Show funds in donor account prior to transfer. Wire receipt or cancelled check.', show: (s) => hasGiftFunds(s), priority: 1 },
  { id: 'cls_01', category: 'Closing', label: 'Closing Disclosure — issued 3 business days before closing', detail: 'CD must be received (not just sent) 3 business days before consummation.', show: () => true, priority: 1 },
  { id: 'cls_02', category: 'Closing', label: 'Final walkthrough — completed (purchase)', detail: 'Buyer right to final walkthrough before closing. Document completion.', show: (s) => isPurchase(s), priority: 2 },
  { id: 'cls_03', category: 'Closing', label: 'Flood zone determination — SFHDF form on file', detail: 'Standard Flood Hazard Determination required for all loans.', show: () => true, priority: 1 },
  { id: 'cls_04', category: 'Closing', label: 'Wire instructions verified — anti-fraud protocol', detail: 'Verify wire instructions via phone to known number. Never from email alone.', show: () => true, priority: 1 },
]

// ─── Predicates ───────────────────────────────────────────────
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
  { value: 'pending',    label: 'Pending',                color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'assigned',  label: 'Assigned to Processor',  color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'received',  label: 'Received',               color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'waived',    label: 'Waived',                 color: 'text-slate-500 bg-slate-100 border-slate-200' },
  { value: 'exception', label: 'Exception',              color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'na',        label: 'N/A',                    color: 'text-slate-400 bg-slate-50 border-slate-100' },
]
function getStatusStyle(v) {
  return ITEM_STATUS_OPTIONS.find(s => s.value === v)?.color || 'text-amber-600 bg-amber-50 border-amber-200'
}
const PRIORITY_LABEL = { 1: 'Required', 2: 'Conditional' }
const fmt$ = n => n ? '$' + Number(n).toLocaleString() : ''

export default function IntelligentChecklist() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario]             = useState(null)
  const [loading, setLoading]               = useState(false)
  const [statuses, setStatuses]             = useState({})
  const [notes, setNotes]                   = useState({})
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterStatus, setFilterStatus]     = useState('All')
  const [recordSaving, setRecordSaving]     = useState(false)
  const [savedRecordId, setSavedRecordId]   = useState(null)
  const [activeTab, setActiveTab]           = useState('checklist')
  const [generating, setGenerating]         = useState(false)
  const [generatedLetter, setGeneratedLetter] = useState('')
  const [letterType, setLetterType]         = useState('')
  const [sharing, setSharing]               = useState(false)
  const [shareUrl, setShareUrl]             = useState('')
  const [shareCopied, setShareCopied]       = useState(false)
  const [processorEmail, setProcessorEmail] = useState('')

  const [pkg, setPkg] = useState({
    includeRate: false, interestRate: '', lockPeriod: '', apr: '',
    includeAUS: false, ausFinding: '',
    includeCaseNum: false, caseNumber: '',
    includeComp: false, grossComp: '',
    lenderName: '', targetCloseDate: '', loGamePlan: '',
  })

  const { reportFindings } = useDecisionRecord(scenarioIdParam)

  useEffect(() => {
    if (!scenarioIdParam) return
    setLoading(true)
    getDoc(doc(db, 'scenarios', scenarioIdParam))
      .then(snap => { if (snap.exists()) setScenario(snap.data()) })
      .catch(err => console.error('Failed to load scenario:', err))
      .finally(() => setLoading(false))
  }, [scenarioIdParam])

  const applicableItems = useMemo(() => CONDITION_LIBRARY.filter(item => item.show(scenario || {})), [scenario])

  useEffect(() => {
    setStatuses(prev => {
      const next = { ...prev }
      applicableItems.forEach(item => { if (!next[item.id]) next[item.id] = 'pending' })
      return next
    })
    setNotes(prev => {
      const next = { ...prev }
      applicableItems.forEach(item => { if (!next[item.id]) next[item.id] = '' })
      return next
    })
  }, [applicableItems])

  const categories    = useMemo(() => ['All', ...[...new Set(applicableItems.map(i => i.category))]], [applicableItems])
  const filteredItems = useMemo(() => applicableItems.filter(item => {
    const catMatch    = filterCategory === 'All' || item.category === filterCategory
    const statusMatch = filterStatus === 'All' || statuses[item.id] === filterStatus
    return catMatch && statusMatch
  }), [applicableItems, filterCategory, filterStatus, statuses])

  const receivedCount  = applicableItems.filter(i => statuses[i.id] === 'received').length
  const assignedCount  = applicableItems.filter(i => statuses[i.id] === 'assigned').length
  const pendingCount   = applicableItems.filter(i => statuses[i.id] === 'pending').length
  const waivedCount    = applicableItems.filter(i => ['waived', 'na'].includes(statuses[i.id])).length
  const exceptionCount = applicableItems.filter(i => statuses[i.id] === 'exception').length
  const completionPct  = applicableItems.length > 0 ? Math.round(((receivedCount + waivedCount) / applicableItems.length) * 100) : 0
  const pendingItems   = applicableItems.filter(i => ['pending', 'assigned'].includes(statuses[i.id]))

  const borrowerName = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || 'Borrower' : null
  const propertyAddr = scenario ? [scenario.streetAddress, scenario.city, scenario.state].filter(Boolean).join(', ') : ''

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const writtenId = await reportFindings(MODULE_KEYS.INTELLIGENT_CHECKLIST, {
        totalItems: applicableItems.length, receivedCount, pendingCount, waivedCount, exceptionCount, completionPct,
        loanType: scenario?.loanType || '', loanPurpose: scenario?.loanPurpose || '',
        occupancy: scenario?.occupancyType || '', propertyType: scenario?.propertyType || '',
        items: applicableItems.map(item => ({ id: item.id, category: item.category, label: item.label, priority: item.priority, status: statuses[item.id] || 'pending', notes: notes[item.id] || '' })),
      })
      if (writtenId) setSavedRecordId(writtenId)
    } catch (err) { console.error('Failed to save:', err) }
    finally { setRecordSaving(false) }
  }

  const markAllReceived = () => {
    setStatuses(prev => {
      const next = { ...prev }
      filteredItems.forEach(item => { next[item.id] = 'received' })
      return next
    })
  }

  const updPkg = (key, val) => setPkg(p => ({ ...p, [key]: val }))

  const handleProcessorShare = async () => {
    if (!scenarioIdParam) return
    setSharing(true)
    try {
      const token = `ps-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      const shareData = {
        token,
        scenarioId: scenarioIdParam,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        borrowerName: borrowerName || '',
        propertyAddr: propertyAddr || '',
        scenario: {
          loanType: scenario?.loanType || '',
          loanAmount: scenario?.loanAmount || '',
          loanPurpose: scenario?.loanPurpose || '',
          lenderName: pkg.lenderName || '',
          targetCloseDate: pkg.targetCloseDate || '',
        },
        checklist: {
          completionPct,
          totalItems: applicableItems.length,
          receivedCount,
          pendingCount,
          waivedCount,
          exceptionCount,
          pendingItems: pendingItems.map(i => ({ label: i.label, category: i.category, note: notes[i.id] || '' })),
        },
        pkg: {
          includeRate: pkg.includeRate,
          interestRate: pkg.includeRate ? pkg.interestRate : '',
          lockPeriod:   pkg.includeRate ? pkg.lockPeriod   : '',
          apr:          pkg.includeRate ? pkg.apr           : '',
          includeAUS:   pkg.includeAUS,
          ausFinding:   pkg.includeAUS ? pkg.ausFinding    : '',
          caseNumber:   pkg.includeAUS ? pkg.caseNumber    : '',
          includeComp:  pkg.includeComp,
          grossComp:    pkg.includeComp ? pkg.grossComp    : '',
          loGamePlan:   pkg.loGamePlan  || '',
        },
        processorLetter: letterType === 'processor' ? generatedLetter : '',
        processorEmail: processorEmail || '',
      }
      await setDoc(doc(db, 'processorShares', token), shareData)
      const url = `${window.location.origin}/processor-share/${token}`
      setShareUrl(url)
    } catch (e) {
      console.error('Processor share failed:', e)
      alert('Share failed. Please try again.')
    } finally {
      setSharing(false)
    }
  }

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {})
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2500)
  }

  const generateLetter = async (type) => {
    setGenerating(true)
    setLetterType(type)
    setGeneratedLetter('')
    try {
      const outstandingList = pendingItems.map(i => `- ${i.label}${notes[i.id] ? ': ' + notes[i.id] : ''}`).join('\n')
      const pkgLines = [
        `Loan Program: ${scenario?.loanType || '--'}`,
        `Loan Purpose: ${scenario?.loanPurpose || '--'}`,
        `Loan Amount: ${fmt$(scenario?.loanAmount) || '--'}`,
        `Property: ${propertyAddr || '--'}`,
        pkg.lenderName ? `Lender: ${pkg.lenderName}` : null,
        pkg.targetCloseDate ? `Target Close Date: ${pkg.targetCloseDate}` : null,
        pkg.includeRate && pkg.interestRate ? `Interest Rate: ${pkg.interestRate}%${pkg.lockPeriod ? ' / ' + pkg.lockPeriod + '-day lock' : ''}` : null,
        pkg.includeRate && pkg.apr ? `APR: ${pkg.apr}%` : null,
        pkg.includeAUS && pkg.ausFinding ? `AUS Finding: ${pkg.ausFinding}` : null,
        pkg.includeAUS && pkg.caseNumber ? `Case Number: ${pkg.caseNumber}` : null,
        pkg.includeComp && pkg.grossComp ? `Gross Origination: ${pkg.grossComp}` : null,
      ].filter(Boolean).join('\n')

      const prompt = type === 'processor'
        ? `You are a mortgage loan officer writing a professional processor handoff memo. Be direct, organized, and thorough.

BORROWER: ${borrowerName}
CHECKLIST: ${completionPct}% complete (${receivedCount}/${applicableItems.length} conditions received, ${pendingCount} pending)

LOAN DETAILS:
${pkgLines}

LO GAME PLAN:
${pkg.loGamePlan || 'No additional notes.'}

OUTSTANDING CONDITIONS (${pendingItems.length}):
${outstandingList || 'None - file is complete.'}

Write a professional processor handoff memo with: (1) file summary and key terms, (2) submission strategy based on the LO game plan, (3) clear prioritized list of outstanding items, (4) any flags or special considerations. Sign off as "Loan Officer." Keep it organized and scannable.`
        : `You are a mortgage loan officer writing a friendly, plain-English letter to your borrower about what documents are still needed. Warm, professional, reassuring - not alarming.

BORROWER: ${borrowerName}
PROPERTY: ${propertyAddr || '--'}
PROGRAM: ${scenario?.loanType || '--'}

ITEMS STILL NEEDED (${pendingItems.length}):
${outstandingList || 'Great news - we have everything we need!'}

Write a friendly borrower letter that: (1) thanks them warmly, (2) explains in plain English what is still needed and briefly why, (3) gives a clear action list, (4) reassures them everything is on track, (5) invites questions. Do NOT mention commission, rate lock details, or internal notes. Keep it under 300 words. Sign warmly.`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await response.json()
      setGeneratedLetter(data.content?.map(b => b.text || '').join('') || 'Error generating letter.')
    } catch (e) {
      setGeneratedLetter('Error generating letter. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-950 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">Stage 4 — Verification & Submit</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded-full border border-emerald-400/30">Module 18</span>
              </div>
              <h1 className="text-2xl font-bold text-white">Intelligent Checklist™</h1>
              <p className="text-emerald-300 text-sm mt-0.5">Dynamic condition checklist — auto-configured from your loan scenario</p>
              {borrowerName && (
                <p className="text-white/70 text-sm mt-2">
                  {'📁 '}<span className="font-semibold text-white">{borrowerName}</span>
                  {propertyAddr ? ' — ' + propertyAddr : ''}
                  {scenario?.loanType ? ' · ' + scenario.loanType : ''}
                  {scenario?.loanPurpose ? ' · ' + scenario.loanPurpose : ''}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              <div className={`text-3xl font-black ${completionPct >= 80 ? 'text-emerald-400' : completionPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{completionPct}%</div>
              <span className="text-xs text-white/40">{receivedCount} of {applicableItems.length} received</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {scenarioIdParam && (
          <DecisionRecordBanner scenarioId={scenarioIdParam} onSave={handleSaveToRecord} saving={recordSaving} savedRecordId={savedRecordId} />
        )}

        {!scenarioIdParam && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center mb-6">
            <p className="text-amber-700 font-semibold text-sm">No scenario loaded</p>
            <p className="text-amber-600/80 text-xs mt-1">Open this checklist from a scenario for a personalized condition list. Showing universal items only.</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 mb-6 w-fit">
          {[{ id: 'checklist', label: '✅ Checklist' }, { id: 'submission', label: '📋 Submission Package' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── CHECKLIST TAB ─────────────────────────── */}
        {activeTab === 'checklist' && (
          <div className="space-y-5">

            {/* Progress Card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-700">{applicableItems.length} Conditions Applicable to This File</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Auto-generated from loan type, purpose, occupancy, and property type</p>
                </div>
                <div className={`text-3xl font-black ${completionPct >= 80 ? 'text-emerald-500' : completionPct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{completionPct}%</div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
                <div className={`h-2.5 rounded-full transition-all duration-500 ${completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${completionPct}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Received',     value: receivedCount,  color: 'text-emerald-600' },
                  { label: 'Assigned',     value: assignedCount,  color: 'text-blue-600'    },
                  { label: 'Pending',      value: pendingCount,   color: 'text-amber-600'   },
                  { label: 'Waived / N/A', value: waivedCount,    color: 'text-slate-500'   },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
              <div className="flex flex-wrap gap-2 flex-1">
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 shadow-sm">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 shadow-sm">
                  <option value="All">All Statuses</option>
                  {ITEM_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <button onClick={markAllReceived}
                className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl transition-colors font-semibold">
                {'✓ Mark All Visible as Received'}
              </button>
            </div>

            {/* Condition Groups */}
            {categories.filter(c => c !== 'All').map(cat => {
              const catItems = filteredItems.filter(i => i.category === cat)
              if (catItems.length === 0) return null
              const catReceived = catItems.filter(i => statuses[i.id] === 'received').length
              return (
                <div key={cat} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">{cat}</h3>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${catReceived === catItems.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {catReceived}/{catItems.length} received
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {catItems.map(item => (
                      <div key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex flex-col md:flex-row md:items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm">{item.label}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${item.priority === 1 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                {item.priority === 1 ? '🔴 Required' : '🟡 Conditional'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.detail}</p>
                            <input type="text" placeholder="Notes / date received / exception reason…"
                              value={notes[item.id] || ''}
                              onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          </div>
                          <div className="flex-shrink-0">
                            <select value={statuses[item.id] || 'pending'}
                              onChange={e => setStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className={`text-xs border rounded-xl px-3 py-2 font-semibold focus:outline-none bg-transparent cursor-pointer ${getStatusStyle(statuses[item.id])}`}>
                              {ITEM_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} className="bg-white text-slate-800">{s.label}</option>)}
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
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">No items match the current filters.</div>
            )}

            {scenarioIdParam && (
              <div className="flex justify-end">
                <button onClick={handleSaveToRecord} disabled={recordSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-2xl transition-colors shadow-sm">
                  {recordSaving ? 'Saving…' : savedRecordId ? '✅ Saved to Decision Record' : '💾 Save to Decision Record'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SUBMISSION PACKAGE TAB ────────────────── */}
        {activeTab === 'submission' && (
          <div className="space-y-5">

            {/* Auto-populated summary */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">📁 Loan File Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  ['Borrower', borrowerName || '--'],
                  ['Property', propertyAddr || '--'],
                  ['Loan Amount', fmt$(scenario?.loanAmount) || '--'],
                  ['Program', scenario?.loanType || '--'],
                  ['Purpose', scenario?.loanPurpose || '--'],
                  ['Checklist', completionPct + '% complete (' + pendingCount + ' pending)'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-slate-800 font-semibold text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Lender & Timeline */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">🏦 Lender & Timeline</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Lender / Investor</label>
                  <input type="text" value={pkg.lenderName} onChange={e => updPkg('lenderName', e.target.value)} placeholder="e.g. UWM, Rocket, PennyMac"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Target Close Date</label>
                  <input type="date" value={pkg.targetCloseDate} onChange={e => updPkg('targetCloseDate', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
            </div>

            {/* Rate Terms — Optional */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">📈 Rate Terms</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={pkg.includeRate} onChange={e => updPkg('includeRate', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  <span className="text-xs text-slate-500 font-semibold">Include in package</span>
                </label>
              </div>
              {!pkg.includeRate
                ? <p className="text-xs text-slate-400 italic mt-2">Optional — skip if the loan has not been locked yet.</p>
                : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {[['Interest Rate (%)', 'interestRate', '6.750'], ['Lock Period (days)', 'lockPeriod', '30'], ['APR (%)', 'apr', '6.891']].map(([label, key, ph]) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
                        <input type="text" value={pkg[key]} onChange={e => updPkg(key, e.target.value)} placeholder={ph}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* AUS & Case Number — Optional */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🖥 AUS Findings</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={pkg.includeAUS} onChange={e => updPkg('includeAUS', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  <span className="text-xs text-slate-500 font-semibold">Include in package</span>
                </label>
              </div>
              {!pkg.includeAUS
                ? <p className="text-xs text-slate-400 italic mt-2">Optional — skip if AUS has not been run or findings are not final.</p>
                : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">AUS Finding</label>
                      <select value={pkg.ausFinding} onChange={e => updPkg('ausFinding', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                        <option value="">Select finding…</option>
                        {['DU — Approve/Eligible', 'DU — Refer/Eligible', 'LPA — Accept/Eligible', 'LPA — Refer/Eligible', 'GUS — Accept', 'Manual Underwrite'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Case # <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                      <input type="text" value={pkg.caseNumber} onChange={e => updPkg('caseNumber', e.target.value)} placeholder="FHA/VA case number if assigned"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    </div>
                  </div>
                )}
            </div>

            {/* Gross Comp — Optional */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">💰 Compensation</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={pkg.includeComp} onChange={e => updPkg('includeComp', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  <span className="text-xs text-slate-500 font-semibold">Include in package</span>
                </label>
              </div>
              {!pkg.includeComp
                ? <p className="text-xs text-slate-400 italic mt-2">Optional — gross origination only. Net commission and splits are never included in any letter.</p>
                : (
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Gross Origination / Points</label>
                    <input type="text" value={pkg.grossComp} onChange={e => updPkg('grossComp', e.target.value)} placeholder="e.g. 1% origination / $3,500"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    <p className="text-xs text-slate-400 mt-1.5">Net commission and split details are never shared with processors or borrowers.</p>
                  </div>
                )}
            </div>

            {/* LO Game Plan */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">📝 LO Game Plan</h2>
              <p className="text-xs text-slate-400 mb-3">Submission strategy, special flags, underwriter notes, or anything the processor needs to know. Goes directly into the processor letter.</p>
              <textarea value={pkg.loGamePlan} onChange={e => updPkg('loGamePlan', e.target.value)} rows={4}
                placeholder="e.g. Rush file — closing in 21 days. Borrower has 2 NSFs — LOE ready. AUS is Refer — going manual, strong comp factors documented. Rate lock expires 4/30..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
            </div>

            {/* Outstanding Conditions */}
            {pendingItems.length > 0
              ? (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
                  <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wide mb-3">{'⏳ Outstanding Conditions (' + pendingItems.length + ')'}</h2>
                  <div className="space-y-1.5">
                    {pendingItems.map(item => (
                      <div key={item.id} className="flex items-start gap-2 text-xs">
                        <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                        <span className="text-amber-800 font-medium">{item.label}{notes[item.id] ? ' — ' + notes[item.id] : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 text-center">
                  <p className="text-emerald-700 font-semibold text-sm">✅ File is complete — no outstanding conditions</p>
                </div>
              )}

            {/* Generate Letters */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">✉️ Generate Letters</h2>
              <p className="text-xs text-slate-400 mb-4">AI-generated letters built from your checklist status and submission details above.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => generateLetter('processor')} disabled={generating}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold px-5 py-3 rounded-2xl text-sm transition-colors">
                  {generating && letterType === 'processor' ? '⏳ Generating…' : '📄 Processor Handoff Letter'}
                </button>
                <button onClick={() => generateLetter('borrower')} disabled={generating}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-5 py-3 rounded-2xl text-sm transition-colors">
                  {generating && letterType === 'borrower' ? '⏳ Generating…' : '👤 Borrower Outstanding Items Letter'}
                </button>
              </div>
            </div>

            {/* Generated Letter */}
            {generatedLetter && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700">{letterType === 'processor' ? '📄 Processor Handoff Letter' : '👤 Borrower Letter'}</h2>
                  <button onClick={() => navigator.clipboard.writeText(generatedLetter).catch(() => {})}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-3 py-1.5 rounded-xl transition-colors">
                    📋 Copy
                  </button>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{generatedLetter}</pre>
                </div>
                <div className="flex gap-3 mt-3">
                  <button onClick={() => generateLetter(letterType)} disabled={generating}
                    className="text-xs text-slate-400 hover:text-slate-600 font-semibold transition-colors">
                    {'↻ Regenerate'}
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(generatedLetter).catch(() => {})}
                    className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold px-4 py-1.5 rounded-xl transition-colors">
                    Copy to Clipboard
                  </button>
                </div>
              </div>
            )}

            {/* ── Processor Share ── */}
            <div className="bg-gradient-to-br from-slate-900 to-emerald-950 rounded-3xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white mb-1">📤 Share with Processor</h2>
                  <p className="text-xs text-emerald-300 leading-relaxed">Generates a secure link your processor can open — shows the loan summary, checklist status, outstanding conditions, and any letters you've included. Net commission and split details are never shared.</p>
                </div>
              </div>
              {!scenarioIdParam ? (
                <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-xs text-emerald-300">
                  Open this checklist from a scenario to enable processor sharing.
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Processor Email <span className="normal-case font-normal">(optional — for your records)</span></label>
                    <input type="email" value={processorEmail} onChange={e => setProcessorEmail(e.target.value)} placeholder="processor@company.com"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  {!shareUrl ? (
                    <button onClick={handleProcessorShare} disabled={sharing}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-2xl text-sm transition-colors shadow-lg shadow-emerald-900/40">
                      {sharing ? '⏳ Generating Link…' : '🔗 Generate Processor Share Link'}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-emerald-200 font-mono truncate flex-1">{shareUrl}</span>
                        <button onClick={copyShareUrl}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shrink-0 ${shareCopied ? 'bg-emerald-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
                          {shareCopied ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-emerald-400">✅ Link active for 30 days. Processor can view without logging in.</p>
                      <button onClick={() => { setShareUrl(''); setProcessorEmail('') }}
                        className="text-xs text-white/40 hover:text-white/70 transition-colors">
                        Generate new link →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        )}
      </div>

      <CanonicalSequenceBar currentModuleKey="INTELLIGENT_CHECKLIST" scenarioId={scenarioIdParam} recordId={savedRecordId} />
    </div>
  )
}
