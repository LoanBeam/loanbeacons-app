import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDecisionRecord } from '../hooks/useDecisionRecord'
import { MODULE_KEYS } from '../constants/decisionRecordConstants'
import DecisionRecordBanner from '../components/DecisionRecordBanner'
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

const FLOOD_ZONES = [
  {
    zone: 'A',
    sfha: true,
    label: 'Zone A — High Risk (No BFE)',
    description: 'Special Flood Hazard Area. No Base Flood Elevation determined. Flood insurance REQUIRED.',
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
    icon: '🔴',
  },
  {
    zone: 'AE',
    sfha: true,
    label: 'Zone AE — High Risk (BFE Determined)',
    description: 'SFHA with Base Flood Elevation established. Most common high-risk zone. Flood insurance REQUIRED.',
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
    icon: '🔴',
  },
  {
    zone: 'AH',
    sfha: true,
    label: 'Zone AH — High Risk (Shallow Flooding)',
    description: 'Shallow flooding 1–3 ft depth with BFE. Flood insurance REQUIRED.',
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
    icon: '🔴',
  },
  {
    zone: 'AO',
    sfha: true,
    label: 'Zone AO — High Risk (Sheet Flow)',
    description: 'River or stream flood prone area with average depths 1–3 ft. Flood insurance REQUIRED.',
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
    icon: '🔴',
  },
  {
    zone: 'AR',
    sfha: true,
    label: 'Zone AR — Restoration Area',
    description: 'Areas with temporary flood risks due to decertified levee. Flood insurance REQUIRED.',
    color: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
    icon: '🟠',
  },
  {
    zone: 'VE',
    sfha: true,
    label: 'Zone VE — Coastal High Risk (Wave Action)',
    description: 'Coastal zone with wave heights ≥3 ft and BFE. Highest-risk zone. Flood insurance REQUIRED.',
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
    icon: '🔴',
  },
  {
    zone: 'X_500',
    sfha: false,
    label: 'Zone X (Shaded) — Moderate Risk',
    description: '0.2% annual chance (500-yr) flood area. Outside SFHA. Insurance RECOMMENDED, not required.',
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    icon: '🟡',
  },
  {
    zone: 'X',
    sfha: false,
    label: 'Zone X (Unshaded) — Minimal Risk',
    description: 'Outside 500-yr floodplain. Lowest flood risk. Insurance recommended but NOT required.',
    color: 'text-green-400 bg-green-400/10 border-green-400/30',
    icon: '🟢',
  },
  {
    zone: 'D',
    sfha: false,
    label: 'Zone D — Undetermined Risk',
    description: 'No flood hazard analysis performed. Risk not determined. Lender may require insurance.',
    color: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
    icon: '⚪',
  },
]

const INSURANCE_TYPES = [
  { value: 'nfip_building', label: 'NFIP — Building Coverage' },
  { value: 'nfip_contents', label: 'NFIP — Contents Coverage' },
  { value: 'private', label: 'Private Flood Insurance' },
  { value: 'excess', label: 'Excess Flood Insurance' },
  { value: 'none', label: 'No Insurance (Zone X)' },
]

const NFIP_LIMITS = {
  residential_building: 250000,
  residential_contents: 100000,
  nonresidential_building: 500000,
  nonresidential_contents: 500000,
}

const CHECKLIST = [
  {
    id: 'determination_ordered',
    label: 'Flood Zone Determination Ordered',
    description: 'Standard Flood Hazard Determination (SFHDF) form completed by certified determination service.',
    required: true,
  },
  {
    id: 'sfha_confirmed',
    label: 'SFHA Status Confirmed',
    description: 'Determination confirms whether property is in a Special Flood Hazard Area (SFHA).',
    required: true,
  },
  {
    id: 'community_participating',
    label: 'Community Participates in NFIP',
    description: 'Confirm community where property is located participates in the NFIP program.',
    required: true,
  },
  {
    id: 'insurance_ordered',
    label: 'Flood Insurance Ordered / In Force',
    description: 'If SFHA, flood insurance policy must be in place at or before closing.',
    required: false,
  },
  {
    id: 'coverage_adequate',
    label: 'Coverage Amount Adequate',
    description: 'Greater of: loan amount, building replacement cost, or NFIP max ($250k). Does not include land.',
    required: false,
  },
  {
    id: 'lender_named',
    label: 'Lender Named as Loss Payee',
    description: 'Lender / its successors & assigns must be named as mortgagee / loss payee on policy.',
    required: false,
  },
  {
    id: 'life_of_loan',
    label: 'Life-of-Loan Monitoring Flagged',
    description: 'Property must be monitored for flood zone changes for the life of the loan.',
    required: true,
  },
  {
    id: 'elevations_cert',
    label: 'Elevation Certificate (LOMA/LOMR)',
    description: 'If disputing zone placement, LOMA or LOMR must be obtained from FEMA.',
    required: false,
  },
  {
    id: 'notice_delivered',
    label: 'Flood Hazard Notice Delivered to Borrower',
    description: 'Borrower must be notified of SFHA status and insurance requirement at least 10 days before closing.',
    required: true,
  },
]

const CHECK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  { value: 'complete', label: 'Complete ✓', color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  { value: 'na', label: 'N/A', color: 'text-gray-400 bg-gray-400/10 border-gray-400/30' },
  { value: 'issue', label: 'Issue ⚠️', color: 'text-red-400 bg-red-400/10 border-red-400/30' },
]

function getCheckStyle(value) {
  return CHECK_STATUS_OPTIONS.find(s => s.value === value)?.color || 'text-blue-400 bg-blue-400/10 border-blue-400/30'
}

export default function FloodIntel() {
  const [searchParams] = useSearchParams()
  const scenarioIdParam = searchParams.get('scenarioId')

  const [scenario, setScenario] = useState(null)
  const [loading, setLoading] = useState(false)

  // Flood zone selection
  const [selectedZone, setSelectedZone] = useState('')
  const [mapNumber, setMapNumber] = useState('')
  const [mapDate, setMapDate] = useState('')
  const [panelNumber, setPanelNumber] = useState('')
  const [determinationDate, setDeterminationDate] = useState('')
  const [determinationProvider, setDeterminationProvider] = useState('')

  // Insurance fields
  const [insuranceRequired, setInsuranceRequired] = useState(null)
  const [insuranceType, setInsuranceType] = useState('')
  const [insuranceCarrier, setInsuranceCarrier] = useState('')
  const [buildingCoverage, setBuildingCoverage] = useState('')
  const [contentsCoverage, setContentsCoverage] = useState('')
  const [annualPremium, setAnnualPremium] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [policyEffective, setPolicyEffective] = useState('')
  const [policyExpiration, setPolicyExpiration] = useState('')

  // Loan data
  const [loanAmount, setLoanAmount] = useState('')
  const [propertyValue, setPropertyValue] = useState('')

  // Checklist
  const [checkStatuses, setCheckStatuses] = useState(
    Object.fromEntries(CHECKLIST.map(c => [c.id, 'pending']))
  )
  const [checkNotes, setCheckNotes] = useState(
    Object.fromEntries(CHECKLIST.map(c => [c.id, '']))
  )

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
          const la = data.loanAmount || data.loan_amount || ''
          const pv = data.propertyValue || data.purchase_price || data.purchasePrice || ''
          if (la) setLoanAmount(String(la))
          if (pv) setPropertyValue(String(pv))
        }
      } catch (err) {
        console.error('Failed to load scenario:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [scenarioIdParam])

  const selectedZoneData = FLOOD_ZONES.find(z => z.zone === selectedZone)
  const isInSFHA = selectedZoneData?.sfha === true

  // Minimum coverage calc
  const minCoverage = Math.min(
    Math.max(parseFloat(loanAmount) || 0, parseFloat(propertyValue) || 0),
    NFIP_LIMITS.residential_building
  )

  // Auto-set insurance required when zone selected
  useEffect(() => {
    if (selectedZoneData) {
      setInsuranceRequired(selectedZoneData.sfha)
      if (!selectedZoneData.sfha) {
        setCheckStatuses(prev => ({ ...prev, insurance_ordered: 'na', coverage_adequate: 'na', lender_named: 'na' }))
      }
    }
  }, [selectedZone])

  const completeCount = Object.values(checkStatuses).filter(s => s === 'complete').length
  const issueCount = Object.values(checkStatuses).filter(s => s === 'issue').length
  const naCount = Object.values(checkStatuses).filter(s => s === 'na').length
  const pendingCount = CHECKLIST.length - completeCount - issueCount - naCount

  const handleSaveToRecord = async () => {
    if (!scenarioIdParam) return
    setRecordSaving(true)
    try {
      const findings = {
        floodZone: selectedZone,
        mapNumber,
        mapDate,
        panelNumber,
        determinationDate,
        determinationProvider,
        isInSFHA: isInSFHA || false,
        insuranceRequired,
        insuranceType,
        insuranceCarrier,
        buildingCoverage: buildingCoverage ? parseFloat(buildingCoverage) : null,
        contentsCoverage: contentsCoverage ? parseFloat(contentsCoverage) : null,
        annualPremium: annualPremium ? parseFloat(annualPremium) : null,
        policyNumber,
        policyEffective,
        policyExpiration,
        minimumRequiredCoverage: minCoverage,
        loanAmount: loanAmount ? parseFloat(loanAmount) : null,
        propertyValue: propertyValue ? parseFloat(propertyValue) : null,
        checkStatuses,
        checkNotes,
        summary: {
          total: CHECKLIST.length,
          complete: completeCount,
          issue: issueCount,
          na: naCount,
          pending: pendingCount,
        },
      }
      const writtenId = await reportFindings(MODULE_KEYS.FLOOD_INTEL, findings)
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
            <span className="text-2xl">🌊</span>
            <h1 className="text-2xl font-bold text-white">Flood Intel™</h1>
            <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
              Module 16
            </span>
          </div>
          <p className="text-gray-400 text-sm ml-9">
            FEMA flood zone determination · NFIP insurance requirements · Compliance checklist
          </p>
          {borrowerName && (
            <p className="text-blue-400 text-sm ml-9 mt-1 font-medium">
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

        {/* Zone Status Alert */}
        {selectedZone && (
          <div className={`rounded-xl border p-4 ${isInSFHA ? 'bg-red-900/20 border-red-500/40' : 'bg-green-900/20 border-green-500/40'}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isInSFHA ? '⚠️' : '✅'}</span>
              <div>
                <p className={`font-bold text-sm ${isInSFHA ? 'text-red-300' : 'text-green-300'}`}>
                  {isInSFHA
                    ? 'Property is in a Special Flood Hazard Area (SFHA) — Flood insurance REQUIRED'
                    : 'Property is NOT in a Special Flood Hazard Area — Flood insurance not mandated'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{selectedZoneData?.description}</p>
              </div>
            </div>
          </div>
        )}

        {/* Flood Zone Determination */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Flood Zone Determination
          </h2>

          {/* Zone Selection */}
          <div className="mb-5">
            <label className="block text-xs text-gray-400 mb-2">Select FEMA Flood Zone</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {FLOOD_ZONES.map(zone => (
                <button
                  key={zone.zone}
                  onClick={() => setSelectedZone(zone.zone)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selectedZone === zone.zone
                      ? zone.color + ' ring-1 ring-current'
                      : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{zone.icon}</span>
                    <span className="text-xs font-semibold">{zone.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* FIRM Details */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">FIRM Map Number</label>
              <input
                type="text"
                value={mapNumber}
                onChange={e => setMapNumber(e.target.value)}
                placeholder="e.g. 13117C0345F"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Map Panel Number</label>
              <input
                type="text"
                value={panelNumber}
                onChange={e => setPanelNumber(e.target.value)}
                placeholder="e.g. 0345"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Map Effective Date</label>
              <input
                type="date"
                value={mapDate}
                onChange={e => setMapDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Determination Date</label>
              <input
                type="date"
                value={determinationDate}
                onChange={e => setDeterminationDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Determination Provider</label>
              <input
                type="text"
                value={determinationProvider}
                onChange={e => setDeterminationProvider(e.target.value)}
                placeholder="e.g. ServiceLink, CoreLogic…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-end">
              <a
                href="https://msc.fema.gov/portal/home"
                target="_blank"
                rel="noreferrer"
                className="w-full text-center bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                🗺️ FEMA Flood Map Service Center ↗
              </a>
            </div>
          </div>
        </div>

        {/* Insurance Section */}
        {(isInSFHA || insuranceRequired) && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
              Flood Insurance Requirements
            </h2>

            {/* Minimum Coverage Calc */}
            {(loanAmount || propertyValue) && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-300 font-medium mb-1">📐 Minimum Required Coverage</p>
                <p className="text-xs text-gray-400">
                  Greater of: loan amount (${parseInt(loanAmount || 0).toLocaleString()}) or building replacement cost,
                  not to exceed NFIP max of $250,000.
                </p>
                <p className="text-lg font-bold text-blue-300 mt-1">${minCoverage.toLocaleString()}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Insurance Type</label>
                <select
                  value={insuranceType}
                  onChange={e => setInsuranceType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select…</option>
                  {INSURANCE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Insurance Carrier</label>
                <input
                  type="text"
                  value={insuranceCarrier}
                  onChange={e => setInsuranceCarrier(e.target.value)}
                  placeholder="e.g. Wright Flood, Allstate…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Building Coverage ($)</label>
                <input
                  type="number"
                  value={buildingCoverage}
                  onChange={e => setBuildingCoverage(e.target.value)}
                  placeholder="250,000"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Contents Coverage ($)</label>
                <input
                  type="number"
                  value={contentsCoverage}
                  onChange={e => setContentsCoverage(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Annual Premium ($)</label>
                <input
                  type="number"
                  value={annualPremium}
                  onChange={e => setAnnualPremium(e.target.value)}
                  placeholder="Annual cost"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Policy Number</label>
                <input
                  type="text"
                  value={policyNumber}
                  onChange={e => setPolicyNumber(e.target.value)}
                  placeholder="Policy #"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Policy Effective Date</label>
                <input
                  type="date"
                  value={policyEffective}
                  onChange={e => setPolicyEffective(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Policy Expiration Date</label>
                <input
                  type="date"
                  value={policyExpiration}
                  onChange={e => setPolicyExpiration(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Compliance Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{completeCount}</div>
            <div className="text-xs text-gray-400 mt-1">Complete</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className={`text-3xl font-bold ${issueCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>{issueCount}</div>
            <div className="text-xs text-gray-400 mt-1">Issues</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className={`text-3xl font-bold ${pendingCount > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>{pendingCount}</div>
            <div className="text-xs text-gray-400 mt-1">Pending</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-gray-400">{naCount}</div>
            <div className="text-xs text-gray-400 mt-1">N/A</div>
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Flood Compliance Checklist
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Per Flood Disaster Protection Act (FDPA) &amp; Biggert-Waters Act requirements
            </p>
          </div>
          <div className="divide-y divide-gray-800">
            {CHECKLIST.map(item => (
              <div key={item.id} className="p-4 hover:bg-gray-800/20 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{item.label}</span>
                      {item.required && (
                        <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded">
                          REQUIRED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                    <input
                      type="text"
                      placeholder="Notes / details…"
                      value={checkNotes[item.id]}
                      onChange={e => setCheckNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="mt-2 w-full bg-gray-800/60 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <select
                      value={checkStatuses[item.id]}
                      onChange={e => setCheckStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className={`text-xs border rounded-lg px-3 py-2 font-medium focus:outline-none bg-transparent ${getCheckStyle(checkStatuses[item.id])}`}
                    >
                      {CHECK_STATUS_OPTIONS.map(s => (
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
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
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
          <CanonicalSequenceBar currentModuleKey="FLOOD_INTEL" scenarioId={scenarioId} recordId={savedRecordId} />
</div>
  )
}
