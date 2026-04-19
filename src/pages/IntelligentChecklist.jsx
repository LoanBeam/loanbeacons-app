// src/pages/IntelligentChecklist.jsx
// Intelligent Checklist™ — Module 28
// Stage 4 — Verification & Submit
// Layout: DecisionRecordBanner → ModuleNav → hero → ScenarioHeader

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence'
import DecisionRecordBanner from '../components/DecisionRecordBanner'
import ModuleNav from '../components/ModuleNav'
import ScenarioHeader from '../components/ScenarioHeader'
import NextStepCard from '../components/NextStepCard'

// ─── Condition Library ─────────────────────────────────────────────────────────
const CONDITION_LIBRARY = [
  { id: 'uni_01', category: 'Application & Identity', label: 'Signed 1003 (URLA) — all sections complete',             detail: 'Borrower and co-borrower signatures required. Section VIII declarations reviewed.', show: () => true, priority: 1 },
  { id: 'uni_02', category: 'Application & Identity', label: 'Government ID — borrower & co-borrower',                  detail: "Valid driver's license or passport. Must not be expired.", show: () => true, priority: 1 },
  { id: 'uni_03', category: 'Application & Identity', label: 'Social Security Cards / ITIN documentation',              detail: 'SSN or ITIN verified. Card copy or alternative verification per lender guidelines.', show: () => true, priority: 1 },
  { id: 'uni_04', category: 'Credit',                 label: 'Tri-merge credit report ordered',                         detail: 'All three bureaus pulled. Scores reviewed for all borrowers.', show: () => true, priority: 1 },
  { id: 'uni_05', category: 'Credit',                 label: 'Credit report — all inquiries explained',                 detail: 'Any inquiry within 90 days requires letter of explanation from borrower.', show: () => true, priority: 2 },
  { id: 'uni_06', category: 'Credit',                 label: 'Collections / charge-offs — disposition documented',      detail: 'Medical vs. non-medical collections. Pay-off or exclude per program guidelines.', show: () => true, priority: 2 },
  { id: 'uni_07', category: 'Income',                 label: '30-day paystubs (most recent)',                           detail: 'All employed borrowers. YTD earnings reviewed against W-2.', show: (s) => !isSelfEmployed(s), priority: 1 },
  { id: 'uni_08', category: 'Income',                 label: 'W-2s — 2 years (all employers)',                          detail: 'Both years required. Gap in employment requires explanation letter.', show: (s) => !isSelfEmployed(s), priority: 1 },
  { id: 'uni_09', category: 'Assets',                 label: 'Bank statements — 2 most recent months (all accounts)',   detail: 'All pages including blanks. Large deposits (>=50% monthly income) require sourcing.', show: () => true, priority: 1 },
  { id: 'uni_10', category: 'Assets',                 label: 'Large deposit letters of explanation',                    detail: 'Any deposit >= 50% of gross monthly income must be sourced and documented.', show: () => true, priority: 2 },
  { id: 'uni_11', category: 'Property',               label: 'Signed purchase contract (all addenda)',                  detail: 'Fully executed. All addenda, amendments, and seller concession agreements included.', show: (s) => isPurchase(s), priority: 1 },
  { id: 'uni_12', category: 'Property',               label: 'Appraisal ordered / appraisal waiver confirmed',          detail: 'Full appraisal or DU/LPA PIW. Appraiser independence requirements met.', show: () => true, priority: 1 },
  { id: 'uni_13', category: 'Property',               label: 'Homeowners insurance — binder or policy',                 detail: 'Coverage >= replacement cost or loan amount. Lender named as mortgagee.', show: () => true, priority: 1 },
  { id: 'uni_14', category: 'Title',                  label: 'Title commitment / preliminary title report',             detail: 'All exceptions reviewed. Liens, judgments, easements cleared or addressed.', show: () => true, priority: 1 },
  { id: 'uni_15', category: 'Disclosures',            label: 'Loan Estimate — issued within 3 business days of application', detail: 'TRID requirement. Confirm delivery date and borrower receipt.', show: () => true, priority: 1 },
  { id: 'pur_01', category: 'Property',               label: 'Earnest money deposit — cleared and sourced',             detail: 'EMD must be verified in bank statements or separate documentation.', show: (s) => isPurchase(s), priority: 1 },
  { id: 'pur_02', category: 'Assets',                 label: 'Down payment funds — fully sourced and seasoned',         detail: '60-day seasoning standard. Gift funds require gift letter + donor bank statement.', show: (s) => isPurchase(s), priority: 1 },
  { id: 'pur_03', category: 'Disclosures',            label: 'Special Information Booklet (HUD homebuying guide)',       detail: 'Required for purchase transactions. Delivered within 3 business days of application.', show: (s) => isPurchase(s), priority: 2 },
  { id: 'ref_01', category: 'Property',               label: 'Mortgage statement — 12-month payment history',           detail: '0x30 late payments required for most programs. Review for all existing liens.', show: (s) => isRefi(s), priority: 1 },
  { id: 'ref_02', category: 'Disclosures',            label: 'Right of Rescission — 3-day waiting period confirmed',    detail: 'Required for primary residence refinances. Cannot fund before rescission period expires.', show: (s) => isRefi(s) && isPrimaryResidence(s), priority: 1 },
  { id: 'ref_03', category: 'Assets',                 label: 'Payoff statement — all liens to be retired',              detail: 'Per diem, good-through date, and wire instructions required.', show: (s) => isRefi(s), priority: 1 },
  { id: 'co_01',  category: 'Application & Identity', label: 'Cash-out purpose — documented and disclosed',             detail: 'Letter of explanation from borrower stating purpose of cash-out proceeds.', show: (s) => isCashOut(s), priority: 2 },
  { id: 'co_02',  category: 'Income',                 label: 'Reserves post-closing — verified (2-6 months PITIA)',     detail: 'Cash-out refi typically requires 2-6 months reserves depending on loan type and LTV.', show: (s) => isCashOut(s), priority: 2 },
  { id: 'fha_01', category: 'Program - FHA',          label: 'FHA case number ordered',                                 detail: 'Must be assigned before appraisal is ordered. Verify not transferred from another lender.', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_02', category: 'Program - FHA',          label: 'CAIVRS clearance confirmed',                              detail: 'All borrowers must clear CAIVRS (no federal debt delinquency).', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_03', category: 'Program - FHA',          label: 'MIP disclosed — upfront and annual',                      detail: 'UFMIP (1.75%) and annual MIP rate disclosed. Duration based on LTV and term.', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_04', category: 'Program - FHA',          label: 'FHA appraisal — HUD-approved appraiser, FHA protocols',   detail: 'Appraiser must be FHA-approved. MPR (Minimum Property Requirements) met.', show: (s) => isFHA(s), priority: 1 },
  { id: 'fha_05', category: 'Program - FHA',          label: 'Student loan payment documented (IBR / 0.5% rule)',        detail: 'If IBR payment = $0 or deferred, use 0.5% of outstanding balance per FHA guidelines.', show: (s) => isFHA(s), priority: 2 },
  { id: 'va_01',  category: 'Program - VA',           label: 'Certificate of Eligibility (COE) obtained',               detail: 'VA COE confirms entitlement. Order via ACE portal or Form 26-1880.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_02',  category: 'Program - VA',           label: 'VA appraisal ordered — VA-approved appraiser',            detail: 'VA LAPP/SAPP appraisal. MPR requirements apply.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_03',  category: 'Program - VA',           label: 'Funding fee amount confirmed / exemption verified',        detail: 'Verify if veteran is exempt (disability rating >=10%). Fee varies by usage and down payment.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_04',  category: 'Program - VA',           label: 'Residual income — calculated and documented',             detail: 'VA residual income must meet regional minimums based on family size and loan amount.', show: (s) => isVA(s), priority: 1 },
  { id: 'va_05',  category: 'Program - VA',           label: 'VA Amendatory Clause / FSBO addendum (purchase)',         detail: 'Required for purchase. Allows veteran to exit if appraised value is less than purchase price.', show: (s) => isVA(s) && isPurchase(s), priority: 1 },
  { id: 'usda_01', category: 'Program - USDA',        label: 'USDA property eligibility confirmed (rural map)',         detail: 'Property address must fall in USDA-eligible area per current USDA eligibility map.', show: (s) => isUSDA(s), priority: 1 },
  { id: 'usda_02', category: 'Program - USDA',        label: 'Household income — all members documented',              detail: 'ALL household members income counted (not just borrowers). Must not exceed 115% AMI.', show: (s) => isUSDA(s), priority: 1 },
  { id: 'usda_03', category: 'Program - USDA',        label: 'GUS approval / conditional commitment obtained',          detail: 'GUS Accept or Refer with approved findings from USDA Rural Development.', show: (s) => isUSDA(s), priority: 1 },
  { id: 'conv_01', category: 'Program - Conventional', label: 'DU / LPA AUS findings — final approval obtained',       detail: 'Final AUS run with all conditions cleared. Approve/Eligible required.', show: (s) => isConventional(s), priority: 1 },
  { id: 'conv_02', category: 'Program - Conventional', label: 'PMI ordered / waived (>=20% down confirmed)',            detail: 'If LTV > 80%, PMI required. If LTV <= 80%, PMI waiver documented.', show: (s) => isConventional(s), priority: 1 },
  { id: 'se_01',  category: 'Income - Self-Employed', label: 'Federal tax returns — 2 years (personal 1040)',           detail: 'All pages and schedules. Both years required. Signed by borrower.', show: (s) => isSelfEmployed(s), priority: 1 },
  { id: 'se_02',  category: 'Income - Self-Employed', label: 'Business tax returns — 2 years (1120S / 1065 / Schedule C)', detail: 'All pages. Partnership K-1s included. CPA letter if needed for income analysis.', show: (s) => isSelfEmployed(s), priority: 1 },
  { id: 'se_03',  category: 'Income - Self-Employed', label: 'Year-to-date P&L statement — CPA-prepared or borrower-signed', detail: 'Within 60 days. Required if current year income used for qualifying.', show: (s) => isSelfEmployed(s), priority: 1 },
  { id: 'se_04',  category: 'Income - Self-Employed', label: 'Business license or CPA letter — 2-year history confirmed', detail: 'Must evidence 2+ years of self-employment in same business/industry.', show: (s) => isSelfEmployed(s), priority: 2 },
  { id: 'inv_01', category: 'Property - Investment',  label: 'Schedule E — rental income history (all investment properties)', detail: 'Last 2 years tax returns. Rental income averaged and vacancy factor applied.', show: (s) => isInvestment(s), priority: 1 },
  { id: 'inv_02', category: 'Property - Investment',  label: 'Lease agreement(s) — current, signed',                   detail: 'If rental income used for qualifying. Must be current and fully executed.', show: (s) => isInvestment(s), priority: 2 },
  { id: 'inv_03', category: 'Property - Investment',  label: 'Reserves — 6 months PITIA per investment property',       detail: 'Most conventional investors require 6 months reserves on each rental.', show: (s) => isInvestment(s), priority: 1 },
  { id: 'condo_01', category: 'Property - Condo',     label: 'Condo project approval — FNMA/FHA/VA warranted',          detail: 'Verify project is on approved list or submit for full/PERS review.', show: (s) => isCondo(s), priority: 1 },
  { id: 'condo_02', category: 'Property - Condo',     label: 'HOA budget / financials — 10% reserve funding confirmed', detail: 'HOA must have adequate reserves. Less than 10% funding is a red flag.', show: (s) => isCondo(s), priority: 2 },
  { id: 'condo_03', category: 'Property - Condo',     label: 'HOA master insurance — hazard + liability coverage',      detail: 'Master policy covers structure. Borrower needs HO-6 for interior/contents.', show: (s) => isCondo(s), priority: 1 },
  { id: 'gift_01', category: 'Assets - Gift Funds',   label: 'Gift letter — donor relationship, amount, no repayment',  detail: 'Must state: relationship to borrower, amount, source, and no repayment required.', show: (s) => hasGiftFunds(s), priority: 1 },
  { id: 'gift_02', category: 'Assets - Gift Funds',   label: 'Donor bank statement — gift funds sourced',               detail: 'Show funds in donor account prior to transfer. Wire receipt or cancelled check.', show: (s) => hasGiftFunds(s), priority: 1 },
  { id: 'cls_01', category: 'Closing',                label: 'Closing Disclosure — issued 3 business days before closing', detail: 'CD must be received (not just sent) 3 business days before consummation.', show: () => true, priority: 1 },
  { id: 'cls_02', category: 'Closing',                label: 'Final walkthrough — completed (purchase)',                 detail: 'Buyer right to final walkthrough before closing. Document completion.', show: (s) => isPurchase(s), priority: 2 },
  { id: 'cls_03', category: 'Closing',                label: 'Flood zone determination — SFHDF form on file',            detail: 'Standard Flood Hazard Determination required for all loans.', show: () => true, priority: 1 },
  { id: 'cls_04', category: 'Closing',                label: 'Wire instructions verified — anti-fraud protocol',         detail: 'Verify wire instructions via phone to known number. Never from email alone.', show: () => true, priority: 1 },
]

// ─── Predicates ───────────────────────────────────────────────────────────────
function loanType(s)       { return (s?.loanType || s?.loan_type || '').toLowerCase() }
function purpose(s)        { return (s?.loanPurpose || s?.purpose || '').toLowerCase() }
function occupancy(s)      { return (s?.occupancyType || s?.occupancy || '').toLowerCase() }
function propType(s)       { return (s?.propertyType || s?.property_type || '').toLowerCase() }
function employmentType(s) { return (s?.employmentType || s?.employment_type || '').toLowerCase() }
function isFHA(s)          { return loanType(s).includes('fha') }
function isVA(s)           { return loanType(s).includes('va') }
function isUSDA(s)         { return loanType(s).includes('usda') }
function isConventional(s) { return loanType(s).includes('conv') || loanType(s).includes('conventional') }
function isPurchase(s)     { return purpose(s).includes('purchase') }
function isRefi(s)         { return purpose(s).includes('refi') || purpose(s).includes('refinance') }
function isCashOut(s)      { return purpose(s).includes('cash') }
function isPrimaryResidence(s) { return occupancy(s).includes('primary') || occupancy(s).includes('owner') }
function isInvestment(s)   { return occupancy(s).includes('invest') }
function isCondo(s)        { return propType(s).includes('condo') }
function isSelfEmployed(s) { return employmentType(s).includes('self') }
function hasGiftFunds(s)   { return !!(s?.giftFunds || s?.gift_funds) }

const ITEM_STATUS_OPTIONS = [
  { value: 'pending',   label: 'Pending',               color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'assigned',  label: 'Assigned to Processor', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'received',  label: 'Received',              color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'waived',    label: 'Waived',                color: 'text-slate-500 bg-slate-100 border-slate-200' },
  { value: 'exception', label: 'Exception',             color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'na',        label: 'N/A',                   color: 'text-slate-400 bg-slate-50 border-slate-100' },
]
function getStatusStyle(v) { return ITEM_STATUS_OPTIONS.find(s => s.value === v)?.color || 'text-amber-600 bg-amber-50 border-amber-200' }
const PRIORITY_LABEL = { 1: 'Required', 2: 'Conditional' }
const fmt$ = n => n ? '$' + Number(n).toLocaleString() : ''

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IntelligentChecklist() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const scenarioIdParam = searchParams.get('scenarioId')

  // ─── Decision Record
  const { reportFindings, savedRecordId, setSavedRecordId } = useDecisionRecord('INTELLIGENT_CHECKLIST', scenarioIdParam)
  const [recordSaving, setRecordSaving] = useState(false)

  // ─── Scenario state
  const [scenario,         setScenario]         = useState(null)
  const [loading,          setLoading]           = useState(false)
  const [scenarios,        setScenarios]         = useState([])
  const [search,           setSearch]            = useState('')
  const [showAll,          setShowAll]           = useState(false)
  const [scenariosLoading, setScenariosLoading]  = useState(!scenarioIdParam)

  // ─── Checklist state
  const [statuses,       setStatuses]       = useState({})
  const [notes,          setNotes]          = useState({})
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterStatus,   setFilterStatus]   = useState('All')
  const [activeTab,      setActiveTab]      = useState('checklist')

  // ─── Letter state
  const [generating,      setGenerating]      = useState(false)
  const [generatedLetter, setGeneratedLetter] = useState('')
  const [letterType,      setLetterType]      = useState('')

  // ─── Processor share
  const [sharing,        setSharing]        = useState(false)
  const [shareUrl,       setShareUrl]       = useState('')
  const [shareCopied,    setShareCopied]    = useState(false)
  const [processorEmail, setProcessorEmail] = useState('')

  // ─── Submission package
  const [pkg, setPkg] = useState({
    includeRate: false, interestRate: '', lockPeriod: '', apr: '',
    includeAUS: false, ausFinding: '',
    includeCaseNum: false, caseNumber: '',
    includeComp: false, grossComp: '',
    lenderName: '', targetCloseDate: '', loGamePlan: '',
  })

  // ─── Data loading
  useEffect(() => {
    if (!scenarioIdParam) return
    setLoading(true)
    getDoc(doc(db, 'scenarios', scenarioIdParam))
      .then(snap => { if (snap.exists()) setScenario(snap.data()) })
      .catch(err => console.error('Failed to load scenario:', err))
      .finally(() => setLoading(false))
  }, [scenarioIdParam])

  useEffect(() => {
    if (scenarioIdParam) return
    getDocs(collection(db, 'scenarios'))
      .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setScenariosLoading(false))
  }, [scenarioIdParam])

  const applicableItems = useMemo(() => CONDITION_LIBRARY.filter(item => item.show(scenario || {})), [scenario])

  useEffect(() => {
    setStatuses(prev => { const next = { ...prev }; applicableItems.forEach(item => { if (!next[item.id]) next[item.id] = 'pending' }); return next })
    setNotes(prev => { const next = { ...prev }; applicableItems.forEach(item => { if (!next[item.id]) next[item.id] = '' }); return next })
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

  // ─── NSI — Next Step Intelligence™
  const { primarySuggestion, logFollow } = useNextStepIntelligence({
    currentModuleKey:       'INTELLIGENT_CHECKLIST',
    loanPurpose:            scenario?.loanPurpose || 'PURCHASE',
    scenarioId:             scenarioIdParam,
    decisionRecordFindings: {
      INTELLIGENT_CHECKLIST: {
        completionPct,
        receivedCount,
        pendingCount,
        exceptionCount,
        totalItems: applicableItems.length,
      },
    },
    suggestions: [
      {
        moduleKey:           'DECISION_RECORD',
        moduleLabel:         'Decision Record',
        route:               '/decision-records',
        urgency:             completionPct === 100 ? 'HIGH' : 'MEDIUM',
        stage:               4,
        canSkip:             false,
        loanPurposeRelevant: true,
        reason:              completionPct === 100
          ? 'File is 100% complete — save the full checklist to the Decision Record audit trail before submission.'
          : `Checklist is ${completionPct}% complete with ${pendingCount} condition(s) outstanding. Save progress to the Decision Record to track open items.`,
      },
    ],
  })

  // ─── Save to Decision Record
  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const writtenId = await reportFindings(
        'INTELLIGENT_CHECKLIST',
        {
          totalItems: applicableItems.length, receivedCount, pendingCount, waivedCount, exceptionCount, completionPct,
          loanType: scenario?.loanType || '', loanPurpose: scenario?.loanPurpose || '',
          occupancy: scenario?.occupancyType || '', propertyType: scenario?.propertyType || '',
          items: applicableItems.map(item => ({ id: item.id, category: item.category, label: item.label, priority: item.priority, status: statuses[item.id] || 'pending', notes: notes[item.id] || '' })),
        },
        [],
        [],
        '1.0.0'
      )
      if (writtenId) setSavedRecordId(writtenId)
    } catch (err) { console.error('Failed to save:', err) }
    finally { setRecordSaving(false) }
  }

  const markAllReceived = () => {
    setStatuses(prev => { const next = { ...prev }; filteredItems.forEach(item => { next[item.id] = 'received' }); return next })
  }

  const updPkg = (key, val) => setPkg(p => ({ ...p, [key]: val }))

  // ─── Processor Share
  const handleProcessorShare = async () => {
    if (!scenarioIdParam) return
    setSharing(true)
    try {
      const token = `ps-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      const shareData = {
        token, scenarioId: scenarioIdParam, createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        borrowerName: borrowerName || '', propertyAddr: propertyAddr || '',
        scenario: { loanType: scenario?.loanType || '', loanAmount: scenario?.loanAmount || '', loanPurpose: scenario?.loanPurpose || '', lenderName: pkg.lenderName || '', targetCloseDate: pkg.targetCloseDate || '' },
        checklist: { completionPct, totalItems: applicableItems.length, receivedCount, pendingCount, waivedCount, exceptionCount, pendingItems: pendingItems.map(i => ({ label: i.label, category: i.category, note: notes[i.id] || '' })) },
        pkg: { includeRate: pkg.includeRate, interestRate: pkg.includeRate ? pkg.interestRate : '', lockPeriod: pkg.includeRate ? pkg.lockPeriod : '', apr: pkg.includeRate ? pkg.apr : '', includeAUS: pkg.includeAUS, ausFinding: pkg.includeAUS ? pkg.ausFinding : '', caseNumber: pkg.includeAUS ? pkg.caseNumber : '', includeComp: pkg.includeComp, grossComp: pkg.includeComp ? pkg.grossComp : '', loGamePlan: pkg.loGamePlan || '' },
        processorLetter: letterType === 'processor' ? generatedLetter : '',
        processorEmail: processorEmail || '',
      }
      await setDoc(doc(db, 'processorShares', token), shareData)
      setShareUrl(`${window.location.origin}/processor-share/${token}`)
    } catch (e) { console.error('Processor share failed:', e); alert('Share failed. Please try again.') }
    finally { setSharing(false) }
  }

  const copyShareUrl = () => { navigator.clipboard.writeText(shareUrl).catch(() => {}); setShareCopied(true); setTimeout(() => setShareCopied(false), 2500) }

  // ─── Generate Letter
  const generateLetter = async (type) => {
    setGenerating(true); setLetterType(type); setGeneratedLetter('')
    try {
      const outstandingList = pendingItems.map(i => `- ${i.label}${notes[i.id] ? ': ' + notes[i.id] : ''}`).join('\n')
      const pkgLines = [
        `Loan Program: ${scenario?.loanType || '--'}`, `Loan Purpose: ${scenario?.loanPurpose || '--'}`, `Loan Amount: ${fmt$(scenario?.loanAmount) || '--'}`, `Property: ${propertyAddr || '--'}`,
        pkg.lenderName ? `Lender: ${pkg.lenderName}` : null, pkg.targetCloseDate ? `Target Close Date: ${pkg.targetCloseDate}` : null,
        pkg.includeRate && pkg.interestRate ? `Interest Rate: ${pkg.interestRate}%${pkg.lockPeriod ? ' / ' + pkg.lockPeriod + '-day lock' : ''}` : null,
        pkg.includeRate && pkg.apr ? `APR: ${pkg.apr}%` : null,
        pkg.includeAUS && pkg.ausFinding ? `AUS Finding: ${pkg.ausFinding}` : null,
        pkg.includeAUS && pkg.caseNumber ? `Case Number: ${pkg.caseNumber}` : null,
        pkg.includeComp && pkg.grossComp ? `Gross Origination: ${pkg.grossComp}` : null,
      ].filter(Boolean).join('\n')

      const prompt = type === 'processor'
        ? `You are a mortgage loan officer writing a professional processor handoff memo. Be direct, organized, and thorough.\n\nBORROWER: ${borrowerName}\nCHECKLIST: ${completionPct}% complete (${receivedCount}/${applicableItems.length} conditions received, ${pendingCount} pending)\n\nLOAN DETAILS:\n${pkgLines}\n\nLO GAME PLAN:\n${pkg.loGamePlan || 'No additional notes.'}\n\nOUTSTANDING CONDITIONS (${pendingItems.length}):\n${outstandingList || 'None - file is complete.'}\n\nWrite a professional processor handoff memo with: (1) file summary and key terms, (2) submission strategy based on the LO game plan, (3) clear prioritized list of outstanding items, (4) any flags or special considerations. Sign off as "Loan Officer." Keep it organized and scannable.`
        : `You are a mortgage loan officer writing a friendly, plain-English letter to your borrower about what documents are still needed. Warm, professional, reassuring - not alarming.\n\nBORROWER: ${borrowerName}\nPROPERTY: ${propertyAddr || '--'}\nPROGRAM: ${scenario?.loanType || '--'}\n\nITEMS STILL NEEDED (${pendingItems.length}):\n${outstandingList || 'Great news - we have everything we need!'}\n\nWrite a friendly borrower letter that: (1) thanks them warmly, (2) explains in plain English what is still needed and briefly why, (3) gives a clear action list, (4) reassures them everything is on track, (5) invites questions. Do NOT mention commission, rate lock details, or internal notes. Keep it under 300 words. Sign warmly.`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await response.json()
      setGeneratedLetter(data.content?.map(b => b.text || '').join('') || 'Error generating letter.')
    } catch (e) { setGeneratedLetter('Error generating letter. Please try again.') }
    finally { setGenerating(false) }
  }

  // ─── Picker Page ──────────────────────────────────────────────────────────
  if (!scenarioIdParam) {
    if (scenariosLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>
    const q        = search.toLowerCase().trim()
    const sorted   = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0))
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim()).toLowerCase().includes(q)) : sorted
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5)
    const hasMore   = !q && !showAll && filtered.length > 5
    return (
      <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
        <div className="bg-gradient-to-br from-slate-900 to-emerald-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-emerald-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-emerald-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-emerald-900/40">28</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">Stage 4 — Verification &amp; Submit</span>
                <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-2xl font-normal text-white mt-0.5">Intelligent Checklist™</h1>
              </div>
            </div>
            <p className="text-emerald-300 text-sm leading-relaxed mb-5">Dynamic condition checklist auto-configured from your loan scenario. Track every doc condition, generate submission packages, and share with processors.</p>
            <div className="flex flex-wrap gap-2">
              {['Auto-Configured Conditions', 'Doc Tracking', 'Submission Package', 'Processor Share', 'AI Explanation Letter', 'Decision Record'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-emerald-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5"><h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2><p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p></div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false) }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm"><p className="text-3xl mb-3">📂</p><p className="text-sm font-semibold text-slate-600">No scenarios found</p><button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-emerald-600 hover:text-emerald-800 underline">→ Go to Scenario Creator</button></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm"><p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p><button onClick={() => setSearch('')} className="mt-2 text-xs text-emerald-500 hover:underline">Clear search</button></div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario'
                const amount = parseFloat(s.loanAmount || 0)
                return (
                  <button key={s.id} onClick={() => navigate('/intelligent-checklist?scenarioId=' + s.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-emerald-300 hover:shadow-md hover:bg-emerald-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-emerald-700">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0    && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType    && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-emerald-400 text-lg shrink-0">→</span>
                    </div>
                  </button>
                )
              })}
              {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-emerald-500 py-3 border border-dashed border-emerald-200 rounded-2xl hover:bg-emerald-50 transition-all">View all {filtered.length} scenarios</button>}
              {showAll && filtered.length > 5 && <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2">↑ Show less</button>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Module Page ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* 1 — Decision Record Banner */}
      <DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="INTELLIGENT_CHECKLIST" />

      {/* 2 — Module Nav */}
      <ModuleNav moduleNumber={28} />

      {/* 3 — Hero */}
      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 20%, #059669 0%, transparent 40%)' }} />
        <div className="relative max-w-5xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div style={{ flex: 1 }}>
              <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">Stage 4 — Verification &amp; Submit</span>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2 mt-0.5">Intelligent Checklist™</h1>
              <p className="text-slate-400 text-base">Dynamic condition checklist — auto-configured from your loan scenario</p>
              {borrowerName && (
                <p className="text-white/70 text-sm mt-2">
                  {'📁 '}<span className="font-semibold text-white">{borrowerName}</span>
                  {propertyAddr ? ' — ' + propertyAddr : ''}
                  {scenario?.loanType ? ' · ' + scenario.loanType : ''}
                </p>
              )}
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4 text-center shrink-0">
              <div className={`text-4xl font-black mb-1 ${completionPct >= 80 ? 'text-emerald-400' : completionPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{completionPct}%</div>
              <div className="text-xs text-slate-400">{receivedCount} of {applicableItems.length} received</div>
              <button onClick={() => navigate('/intelligent-checklist')} className="text-xs text-emerald-400 hover:text-emerald-300 mt-2 block transition-colors">Change scenario →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Borrower Bar */}
      {borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {propertyAddr && <span className="text-blue-200 text-xs">{propertyAddr}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {scenario?.loanType    && <span>Type <strong className="text-white">{scenario.loanType}</strong></span>}
              {scenario?.loanPurpose && <span>Purpose <strong className="text-white">{scenario.loanPurpose}</strong></span>}
            </div>
          </div>
        </div>
      )}

      {/* 4 — Scenario Header */}
      <ScenarioHeader moduleTitle="Intelligent Checklist™" moduleNumber="28" scenarioId={scenarioIdParam} />

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Tab Bar */}
        <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 mb-6 w-fit">
          {[{ id: 'checklist', label: '✅ Checklist' }, { id: 'submission', label: '📋 Submission Package' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── CHECKLIST TAB ────────────────────────────── */}
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

            {/* NSI on progress card */}
            {primarySuggestion && <NextStepCard suggestion={primarySuggestion} onFollow={logFollow} />}

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
                ✓ Mark All Visible as Received
              </button>
            </div>

            {/* Condition Groups */}
            {categories.filter(c => c !== 'All').map(cat => {
              const catItems    = filteredItems.filter(i => i.category === cat)
              if (catItems.length === 0) return null
              const catReceived = catItems.filter(i => statuses[i.id] === 'received').length
              return (
                <div key={cat} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">{cat}</h3>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${catReceived === catItems.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {catReceived}/{catItems.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {catItems.map(item => {
                      const status    = statuses[item.id] || 'pending'
                      const statusObj = ITEM_STATUS_OPTIONS.find(s => s.value === status)
                      return (
                        <div key={item.id} className={`px-5 py-4 transition-colors ${status === 'received' ? 'bg-emerald-50/50' : status === 'exception' ? 'bg-orange-50/50' : ''}`}>
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className={`text-sm font-semibold ${status === 'received' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{item.label}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${PRIORITY_LABEL[item.priority] === 'Required' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                  {PRIORITY_LABEL[item.priority]}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mb-2">{item.detail}</p>
                              <input type="text" value={notes[item.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                placeholder="Notes / tracking / exception…"
                                className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50/80" />
                            </div>
                            <select value={status} onChange={e => setStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className={`text-xs border rounded-xl px-3 py-2 font-semibold focus:outline-none cursor-pointer shrink-0 ${statusObj?.color || 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                              {ITEM_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Save & Summary */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-sm font-bold text-slate-700">Save to Decision Record</div>
                <div className="text-xs text-slate-400 mt-0.5">Log {applicableItems.length} conditions and {completionPct}% completion to the audit trail</div>
              </div>
              <button onClick={handleSaveToRecord} disabled={recordSaving || !scenarioIdParam}
                className={`px-6 py-2.5 rounded-2xl text-sm font-bold transition-all ${savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50'}`}>
                {recordSaving ? 'Saving…' : savedRecordId ? '✔ Decision Record Saved' : '💾 Save to Decision Record'}
              </button>
            </div>
          </div>
        )}

        {/* ── SUBMISSION PACKAGE TAB ────────────────────── */}
        {activeTab === 'submission' && (
          <div className="space-y-5">

            {/* Package Builder */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-sm font-bold text-slate-700 mb-1">📋 Submission Package Builder</h2>
              <p className="text-xs text-slate-400 mb-5">Configure what to include in your processor handoff and AI-generated letters.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Lender Name</label>
                  <input type="text" value={pkg.lenderName} onChange={e => updPkg('lenderName', e.target.value)} placeholder="Rocket Mortgage / UWM / etc."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Target Close Date</label>
                  <input type="date" value={pkg.targetCloseDate} onChange={e => updPkg('targetCloseDate', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>

              {/* Rate toggle */}
              <div className="mt-4">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input type="checkbox" checked={pkg.includeRate} onChange={e => updPkg('includeRate', e.target.checked)} className="accent-emerald-600 w-4 h-4" />
                  <span className="text-sm font-semibold text-slate-700">Include Rate / Lock Details</span>
                </label>
                {pkg.includeRate && (
                  <div className="grid grid-cols-3 gap-3 ml-7">
                    {[['interestRate','Rate (%)','7.250'],['lockPeriod','Lock (days)','30'],['apr','APR (%)','7.412']].map(([k,l,p]) => (
                      <div key={k}>
                        <label className="block text-xs text-slate-400 mb-1">{l}</label>
                        <input type="text" value={pkg[k]} onChange={e => updPkg(k, e.target.value)} placeholder={p}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AUS toggle */}
              <div className="mt-3">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input type="checkbox" checked={pkg.includeAUS} onChange={e => updPkg('includeAUS', e.target.checked)} className="accent-emerald-600 w-4 h-4" />
                  <span className="text-sm font-semibold text-slate-700">Include AUS / Case Number</span>
                </label>
                {pkg.includeAUS && (
                  <div className="grid grid-cols-2 gap-3 ml-7">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">AUS Finding</label>
                      <input type="text" value={pkg.ausFinding} onChange={e => updPkg('ausFinding', e.target.value)} placeholder="Approve/Eligible"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Case / File #</label>
                      <input type="text" value={pkg.caseNumber} onChange={e => updPkg('caseNumber', e.target.value)} placeholder="FHA case # / file #"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* LO Game Plan */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">LO Game Plan / Special Notes for Processor</label>
                <textarea value={pkg.loGamePlan} onChange={e => updPkg('loGamePlan', e.target.value)} rows={3}
                  placeholder="Submission strategy, underwriter overlays, rush notes, special circumstances…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
              </div>
            </div>

            {/* AI Letters */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-sm font-bold text-slate-700 mb-1">✉️ AI-Generated Letters</h2>
              <p className="text-xs text-slate-400 mb-4">Generate professional letters instantly using the checklist and package details above.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => generateLetter('processor')} disabled={generating}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-colors">
                  {generating && letterType === 'processor' ? '⏳ Generating…' : '📋 Processor Handoff Memo'}
                </button>
                <button onClick={() => generateLetter('borrower')} disabled={generating}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-colors">
                  {generating && letterType === 'borrower' ? '⏳ Generating…' : '👤 Borrower Conditions Letter'}
                </button>
              </div>
            </div>

            {/* Generated Letter */}
            {generatedLetter && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                  {letterType === 'processor' ? '📋 Processor Handoff Memo' : '👤 Borrower Letter'}
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{generatedLetter}</pre>
                </div>
                <div className="flex gap-3 mt-3">
                  <button onClick={() => generateLetter(letterType)} disabled={generating}
                    className="text-xs text-slate-400 hover:text-slate-600 font-semibold transition-colors">↻ Regenerate</button>
                  <button onClick={() => navigator.clipboard.writeText(generatedLetter).catch(() => {})}
                    className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold px-4 py-1.5 rounded-xl transition-colors">
                    Copy to Clipboard
                  </button>
                </div>
              </div>
            )}

            {/* Processor Share */}
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
                      <button onClick={() => { setShareUrl(''); setProcessorEmail('') }} className="text-xs text-white/40 hover:text-white/70 transition-colors">Generate new link →</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* NSI on submission tab */}
            {primarySuggestion && <NextStepCard suggestion={primarySuggestion} onFollow={logFollow} />}
          </div>
        )}
      </div>
    </div>
  )
}
