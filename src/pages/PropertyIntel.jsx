// src/pages/CollateralIntel.jsx
// LoanBeacons™ — Module 09 | Stage 2: Lender Fit
// Collateral Intelligence™ — Property analysis, appraisal review, waiver coach

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ScenarioHeader from '../components/ScenarioHeader';
import CanonicalSequenceBar from '../components/CanonicalSequenceBar';

// ─── Data ─────────────────────────────────────────────────────────────────────
const PROPERTY_TYPES = [
  { id: 'sfr',          label: 'Single Family Residence',    icon: '🏠', eligible: ['FHA','VA','USDA','Conventional','Jumbo'], notes: 'All programs. Standard guidelines apply.' },
  { id: 'condo',        label: 'Condominium',                icon: '🏢', eligible: ['FHA','VA','Conventional'],                notes: 'FHA/VA require project approval. USDA rarely approves condos.' },
  { id: 'townhouse',    label: 'Townhouse / PUD',            icon: '🏘️', eligible: ['FHA','VA','USDA','Conventional'],       notes: 'Standard guidelines. HOA docs required.' },
  { id: '2unit',        label: '2-Unit (Duplex)',             icon: '🏗️', eligible: ['FHA','VA','Conventional'],              notes: 'Owner-occupied required for FHA/VA. 25% down for conventional investment.' },
  { id: '3_4unit',      label: '3-4 Unit',                   icon: '🏦', eligible: ['FHA','VA','Conventional'],               notes: 'Owner-occupied only for FHA/VA. Higher reserves required.' },
  { id: 'manufactured', label: 'Manufactured / Mobile Home', icon: '🚐', eligible: ['FHA','VA','Conventional'],              notes: 'Must be permanently affixed, titled as real property, HUD standards.' },
  { id: 'mixed_use',    label: 'Mixed-Use Property',         icon: '🏪', eligible: ['FHA','Conventional'],                    notes: 'Residential use must be primary. Commercial portion ≤ 49%.' },
  { id: 'farm',         label: 'Farm / Agricultural',        icon: '🌾', eligible: [],                                        notes: 'Typically ineligible for agency programs. Non-QM or portfolio only.' },
  { id: 'coop',         label: 'Cooperative (Co-op)',        icon: '🏛️', eligible: ['Conventional'],                         notes: 'Limited to specific markets (NYC primarily). Fannie Mae approved co-ops only.' },
];

const OCCUPANCY_TYPES = [
  { id: 'primary',    label: 'Primary Residence',   icon: '🏠', note: 'Best rates. All programs available.' },
  { id: 'second',     label: 'Second Home',         icon: '🏖️', note: '10% min down. Higher rate. Must be reasonable distance from primary.' },
  { id: 'investment', label: 'Investment Property', icon: '📈', note: '15-25% down. Higher rate. No FHA/VA/USDA.' },
];

const PROPERTY_FLAGS = [
  { id: 'deferred_maint', label: 'Deferred Maintenance / Poor Condition',  severity: 'critical', programs: 'All',            note: 'Property must meet minimum property standards (MPS) for all agency programs. FHA is strictest — appraiser will call out any visible defects.' },
  { id: 'roof_issues',    label: 'Roof Issues / Remaining Life < 2 Years', severity: 'high',     programs: 'FHA/VA/USDA',    note: 'Appraiser will flag and require repair or escrow. Remaining economic life must support the loan term.' },
  { id: 'foundation',     label: 'Foundation / Structural Issues',         severity: 'critical', programs: 'All',            note: 'Major structural issues can kill any agency loan. Licensed engineer report required. May be unlendable.' },
  { id: 'mold_water',     label: 'Mold / Water Damage / Flooding',         severity: 'critical', programs: 'All',            note: 'Must be fully remediated before closing. Flood zone disclosure mandatory. Active flooding is an immediate deal-killer.' },
  { id: 'mechanical',     label: 'Mechanical Systems Non-Functional',      severity: 'high',     programs: 'FHA/VA',         note: 'HVAC, electrical, plumbing must be functional at time of appraisal for FHA/VA. Appraiser must confirm operation.' },
  { id: 'unpermitted',    label: 'Unpermitted Additions / Structures',     severity: 'medium',   programs: 'All',            note: 'Appraiser may call out unpermitted work. May need permit, removal, or as-built survey. Can affect value and marketability.' },
  { id: 'environmental',  label: 'Environmental Hazards (Lead, Asbestos)', severity: 'critical', programs: 'All',            note: 'Pre-1978 homes require lead paint disclosure. Testing and remediation may be required before loan can close.' },
  { id: 'private_road',   label: 'Private Road / No Public Access',        severity: 'medium',   programs: 'USDA/FHA',       note: 'Recorded private road maintenance agreement required. All parties with access must sign. Must be obtained before appraisal.' },
  { id: 'well_septic',    label: 'Well / Septic System',                   severity: 'medium',   programs: 'FHA/VA/USDA',    note: 'Water potability test and septic inspection required. Results take 7-10 days. Order at contract signing.' },
  { id: 'flood_zone',     label: 'Located in FEMA Flood Zone',             severity: 'medium',   programs: 'All',            note: 'Flood insurance required if in Special Flood Hazard Area (SFHA). Can significantly increase monthly housing expense.' },
  { id: 'hoa_issues',     label: 'HOA Litigation / Budget Issues',         severity: 'high',     programs: 'FHA/VA/Conv',    note: 'HOA must not be in active litigation. Reserves must meet minimum requirements. FHA: 10% budget toward reserves.' },
  { id: 'listed_sale',    label: 'Property Currently Listed for Sale',     severity: 'high',     programs: 'VA IRRRL',       note: 'Property must be removed from MLS before application for VA IRRRL. Must be owner-occupied primary residence.' },
];

const WAIVER_TYPES = [
  {
    id: 'piw', label: 'PIW', fullLabel: 'Property Inspection Waiver (Fannie Mae)', color: 'blue',
    description: 'Fannie Mae\'s automated collateral assessment that may waive the appraisal requirement entirely for eligible refinances and some purchases.',
    criteria: ['Conventional loan only (Fannie Mae/DU)', 'LTV ≤ 80% for purchases (90% for rate/term refi)', 'Single family, primary residence or second home', 'Property must have prior appraisal in Fannie database', 'No recent fire, flood, or major damage', 'DU must return PIW offer — not guaranteed'],
    benefits: ['Eliminates appraisal fee ($500-$900 savings)', 'Faster closing — removes appraisal timeline', 'No appraisal contingency needed'],
    risks: ['Fannie Mae retains rep/warrant relief rights', 'If waiver granted but property has issues, lender has no protection', 'Cannot be used for cash-out refinances above certain LTV'],
  },
  {
    id: 'ace', label: 'ACE', fullLabel: 'Automated Collateral Evaluation (Freddie Mac)', color: 'violet',
    description: 'Freddie Mac\'s appraisal alternative that uses data models and public records to assess collateral risk, potentially waiving the full appraisal.',
    criteria: ['Conventional loan only (Freddie Mac/LP)', 'LTV ≤ 80% for purchases (97% for rate/term refi with ACE)', 'Single family, PUD, or condo (approved project)', 'Primary residence, second home, or investment', 'LP must return ACE offer — not all files qualify', 'Property must have clean title and no known issues'],
    benefits: ['No appraisal required if LP returns ACE offer', 'Rep/warrant relief on collateral value', 'ACE+ PDR option provides enhanced value confirmation'],
    risks: ['Available only when LP returns ACE offer', 'Investment properties have stricter eligibility', 'Requires clean MLS/public data on the property'],
  },
  {
    id: 'va_waiver', label: 'VA Waiver', fullLabel: 'VA Appraisal Flexibility (VA IRRRL)', color: 'red',
    description: 'For VA Interest Rate Reduction Refinance Loans (IRRRL), the VA may allow an appraisal waiver if specific net tangible benefit and seasoning requirements are met.',
    criteria: ['VA IRRRL (refinance) only — not available for purchase', 'Loan must be properly seasoned (6+ payments, 210+ days)', 'Net tangible benefit must be demonstrated', 'No cash out beyond $6,000 for energy efficiency improvements', 'Borrower must still occupy the property as primary residence'],
    benefits: ['Eliminates VA appraisal cost and timeline', 'Allows refinance even if value declined', 'Reduces closing costs and time to close'],
    risks: ['If property has undisclosed damage, lender has no valuation protection', 'Not available on purchase loans', 'Some lenders require appraisal regardless of VA waiver eligibility'],
  },
];

const fmt0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d instanceof Date && !isNaN(d) ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '--';
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };

// ─── Stale date helper — parses common appraisal date formats ─────────────────
function parseAppraisalDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const d = new Date(s);
  if (!isNaN(d)) return d;
  const mmyy = s.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmyy) return new Date(parseInt('20' + mmyy[2]), parseInt(mmyy[1]) - 1, 1);
  const mmyyyy = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmyyyy) return new Date(parseInt(mmyyyy[2]), parseInt(mmyyyy[1]) - 1, 1);
  const monyy = s.match(/^([A-Za-z]{3})-?(\d{2})$/);
  if (monyy) return new Date(Date.parse(monyy[1] + ' 1, 20' + monyy[2]));
  return null;
}

// ─── Flip Eligibility Timeline Component ─────────────────────────────────────
function FlipEligibilityTimeline({ priorDate, pctGain, loanType }) {
  if (!priorDate) return null;
  const today = new Date();
  const daysHeld = Math.round((today - priorDate) / (1000 * 60 * 60 * 24));
  const gain     = parseFloat(pctGain || 0);

  // Key dates
  const fhaDay91  = addDays(priorDate, 91);
  const fhaDay181 = addDays(priorDate, 181);
  const daysTo91  = Math.ceil((fhaDay91  - today) / (1000 * 60 * 60 * 24));
  const daysTo181 = Math.ceil((fhaDay181 - today) / (1000 * 60 * 60 * 24));

  // FHA / USDA status
  const fhaHardStop     = daysHeld < 91;
  const fha2ndApprZone  = daysHeld >= 91 && daysHeld <= 180 && gain >= 100;
  const fhaClean        = daysHeld >= 181 || (daysHeld >= 91 && gain < 100);

  // Conventional / VA — no hard rule
  const convWarning = daysHeld < 365;

  const Row = ({ icon, label, status, note, highlight }) => (
    <div className={'flex items-start gap-3 px-4 py-3 rounded-xl ' + (highlight === 'red' ? 'bg-red-50 border border-red-200' : highlight === 'amber' ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200')}>
      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className={'text-xs font-bold ' + (highlight === 'red' ? 'text-red-700' : highlight === 'amber' ? 'text-amber-700' : 'text-emerald-700')}>{label}</div>
        <div className={'text-xs font-semibold mt-0.5 ' + (highlight === 'red' ? 'text-red-800' : highlight === 'amber' ? 'text-amber-800' : 'text-emerald-800')}>{status}</div>
        {note && <div className="text-xs text-slate-500 mt-0.5">{note}</div>}
      </div>
    </div>
  );

  return (
    <div className="mt-4 border-t border-slate-200 pt-4 space-y-2">
      <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">📅 Flip Rule — Eligibility by Program</div>

      {/* FHA */}
      {fhaHardStop ? (
        <Row icon="🚫" label="FHA" highlight="red"
          status={`Not eligible — hard stop until ${fmtDate(fhaDay91)}`}
          note={`${Math.abs(daysTo91)} days remaining · Seller acquired property ${daysHeld} days ago (must be 91+)`} />
      ) : fha2ndApprZone ? (
        <Row icon="⚠️" label="FHA" highlight="amber"
          status={`Eligible — but 2nd appraisal REQUIRED (price increase ≥100%)`}
          note={`2nd appraisal zone clears ${fmtDate(fhaDay181)} · ${Math.abs(daysTo181)} days until fully clean`} />
      ) : (
        <Row icon="✅" label="FHA" highlight="green"
          status="Eligible — no flip restrictions"
          note={`Seller held property ${daysHeld} days · ${daysHeld >= 181 ? 'Beyond 180-day window — fully clear' : 'Within 91-180 days but appreciation < 100% — no 2nd appraisal required'}`} />
      )}

      {/* USDA — mirrors FHA */}
      {fhaHardStop ? (
        <Row icon="🚫" label="USDA" highlight="red"
          status={`Not eligible — hard stop until ${fmtDate(fhaDay91)}`}
          note={`USDA follows FHA seasoning rules — same 91-day requirement`} />
      ) : (
        <Row icon="✅" label="USDA" highlight="green"
          status="Eligible — follows FHA seasoning rules"
          note={`${daysHeld} days held · USDA mirrors FHA flip guidance`} />
      )}

      {/* VA */}
      <Row icon={convWarning ? '⚠️' : '✅'} label="VA" highlight={convWarning ? 'amber' : 'green'}
        status={convWarning ? `No hard rule — underwriter scrutiny likely (${daysHeld} days held)` : 'No flip restrictions — well beyond 12-month window'}
        note={convWarning ? `VA appraisers flag rapid appreciation. ${gain > 10 ? gain + '% gain will require value justification in appraisal.' : 'Recommend LO document value increase with market data.'}` : `Seller held property ${daysHeld} days — no concerns`} />

      {/* Conventional */}
      <Row icon={convWarning ? '⚠️' : '✅'} label="Conventional" highlight={convWarning ? 'amber' : 'green'}
        status={convWarning ? `No hard rule — appraiser must comment on price difference (${daysHeld} days held)` : 'No flip restrictions'}
        note={convWarning ? `Fannie/Freddie require appraiser to reconcile prior sale. ${gain > 20 ? 'Gain of ' + gain + '% may trigger lender-ordered 2nd appraisal.' : 'Document value increase with renovations or market conditions.'}` : `${daysHeld} days held — no additional requirements`} />

      {/* Summary callout if still in hard stop */}
      {fhaHardStop && (
        <div className="bg-red-100 border border-red-300 rounded-xl px-4 py-3 mt-2">
          <div className="text-xs font-black text-red-800">⏳ Earliest FHA/USDA Closing Date</div>
          <div className="text-sm font-black text-red-700 mt-1">{fmtDate(fhaDay91)}</div>
          <div className="text-xs text-red-600 mt-0.5">{Math.abs(daysTo91)} days from today · {91 - daysHeld} days for seller to meet 91-day seasoning</div>
          {gain >= 100 && (
            <div className="text-xs text-red-600 mt-1 font-bold">⚠ Even after day 91, price increase of {gain}% triggers 2nd appraisal requirement until {fmtDate(fhaDay181)}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rebuttal Letter Builder ──────────────────────────────────────────────────
function buildRebuttalLetter(borrowerName, scenarioName, subjectAddress, appraisedValue, loanType, concerns, comparables, loNotes) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(today); lines.push('');
  lines.push('To: Appraisal Review Department');
  lines.push('Re: Appraisal Rebuttal Request — ' + (subjectAddress || scenarioName || 'Subject Property'));
  lines.push('Borrower: ' + (borrowerName || 'See file'));
  lines.push('Loan Type: ' + (loanType || 'Not specified'));
  lines.push('Appraised Value: ' + fmt0(appraisedValue));
  lines.push('Date: ' + today); lines.push('');
  lines.push('Dear Appraisal Review Team,'); lines.push('');
  lines.push('I am writing to respectfully request a reconsideration of value (ROV) for the above-referenced property. After reviewing the appraisal report in detail, I have identified the following specific concerns that I believe warrant review by a qualified appraiser or the appraisal management company.');
  lines.push('');
  lines.push('IMPORTANT: This rebuttal is based on factual data and documented comparables. It is not a request to change the appraised value without merit — it is a professional request to review specific methodology, comparable selection, and adjustments that appear inconsistent with the subject property characteristics and local market data.');
  lines.push('');
  if (concerns && concerns.length > 0) {
    lines.push('IDENTIFIED CONCERNS IN THE APPRAISAL REPORT'); lines.push('');
    concerns.forEach((concern, i) => {
      lines.push((i + 1) + '. ' + concern.title);
      lines.push('   Issue: ' + concern.detail);
      if (concern.recommendation) lines.push('   Requested Action: ' + concern.recommendation);
      lines.push('');
    });
  }
  if (comparables && comparables.length > 0) {
    lines.push('COMPARABLE SALES FOR CONSIDERATION');
    lines.push('The following comparable sales were identified that may better reflect the subject property\'s market value:');
    lines.push('');
    comparables.forEach((comp, i) => { lines.push((i + 1) + '. ' + comp); });
    lines.push('');
  }
  lines.push('REQUESTED ACTIONS');
  lines.push('1. Review the comparable selection methodology and consider the additional sales provided above.');
  lines.push('2. Verify all square footage and GLA figures against county records and listing data.');
  lines.push('3. Confirm that all applicable adjustments are supported by paired sales analysis.');
  lines.push('4. Review the condition rating and reconciliation narrative for consistency with the inspection notes.');
  lines.push('');
  if (loNotes) { lines.push('ADDITIONAL SUPPORTING INFORMATION'); lines.push(loNotes); lines.push(''); }
  lines.push('I am available to discuss these concerns and provide any additional documentation that would assist in the review. I respectfully request a written response within 5 business days.');
  lines.push(''); lines.push('Thank you for your professional consideration of this request.');
  lines.push(''); lines.push('Respectfully submitted,'); lines.push('');
  lines.push('George Jules Chevalier IV, NMLS #1175947');
  lines.push('Clearview Lending Solutions');
  lines.push('george@cvls.loans | cvls.loans'); lines.push('');
  lines.push('Attachments: Appraisal report, supporting comparable sales data, property records');
  return lines.join('\n');
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CollateralIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);

  const [scenario, setScenario]       = useState(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [loading, setLoading]          = useState(!!scenarioId);
  const [scenarios, setScenarios]      = useState([]);
  const [search,    setSearch]         = useState('');
  const [showAll,   setShowAll]        = useState(false);
  const [activeTab, setActiveTab]      = useState(0);

  const [propertyType,  setPropertyType]  = useState('sfr');
  const [occupancy,     setOccupancy]     = useState('primary');
  const [yearBuilt,     setYearBuilt]     = useState('');
  const [sqft,          setSqft]          = useState('');
  const [purchasePrice,  setPurchasePrice]  = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [loanAmount,     setLoanAmount]     = useState('');
  const [loanType,       setLoanType]       = useState('');
  const [flags,          setFlags]          = useState({});
  const [condoProjectApproved, setCondoProjectApproved] = useState('unknown');
  const [loNotes, setLoNotes] = useState('');

  const [appraisalExtracting, setAppraisalExtracting] = useState(false);
  const [appraisalData,       setAppraisalData]       = useState(null);
  const [appraisalConcerns,   setAppraisalConcerns]   = useState(null);
  const [appraisalError,      setAppraisalError]      = useState('');
  const [showRebuttal,        setShowRebuttal]        = useState(false);
  const [rebuttalCopied,      setRebuttalCopied]      = useState(false);
  const [additionalComps,     setAdditionalComps]     = useState('');

  const [selectedWaiver, setSelectedWaiver] = useState('piw');
  const [waiverLTV,      setWaiverLTV]      = useState('');
  const [waiverPurpose,  setWaiverPurpose]  = useState('purchase');

  const lsKey = scenarioId ? `lb_collateral_${scenarioId}` : null;

  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    localStorage.setItem(lsKey, JSON.stringify({
      propertyType, occupancy, yearBuilt, sqft, purchasePrice, estimatedValue,
      loanAmount, loanType, flags, condoProjectApproved, loNotes,
      appraisalData, appraisalConcerns, additionalComps,
      waiverLTV, waiverPurpose, selectedWaiver, savedRecordId,
    }));
  }, [lsKey, propertyType, occupancy, yearBuilt, sqft, purchasePrice, estimatedValue,
      loanAmount, loanType, flags, condoProjectApproved, loNotes,
      appraisalData, appraisalConcerns, additionalComps,
      waiverLTV, waiverPurpose, selectedWaiver, savedRecordId]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then((snap) => setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch(console.error);
      setLoading(false); return;
    }
    if (lsKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
        if (saved) {
          if (saved.propertyType)         setPropertyType(saved.propertyType);
          if (saved.occupancy)            setOccupancy(saved.occupancy);
          if (saved.yearBuilt)            setYearBuilt(saved.yearBuilt);
          if (saved.sqft)                 setSqft(saved.sqft);
          if (saved.purchasePrice)        setPurchasePrice(saved.purchasePrice);
          if (saved.estimatedValue)       setEstimatedValue(saved.estimatedValue);
          if (saved.loanAmount)           setLoanAmount(saved.loanAmount);
          if (saved.loanType)             setLoanType(saved.loanType);
          if (saved.flags)                setFlags(saved.flags);
          if (saved.condoProjectApproved) setCondoProjectApproved(saved.condoProjectApproved);
          if (saved.loNotes)              setLoNotes(saved.loNotes);
          if (saved.appraisalData)        setAppraisalData(saved.appraisalData);
          if (saved.appraisalConcerns)    setAppraisalConcerns(saved.appraisalConcerns);
          if (saved.additionalComps)      setAdditionalComps(saved.additionalComps);
          if (saved.waiverLTV)            setWaiverLTV(saved.waiverLTV);
          if (saved.waiverPurpose)        setWaiverPurpose(saved.waiverPurpose);
          if (saved.selectedWaiver)       setSelectedWaiver(saved.selectedWaiver);
          if (saved.savedRecordId)        setSavedRecordId(saved.savedRecordId);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then((snap) => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (name) setBorrowerName(name.trim());
        if (d.propertyType) { const map = { 'Single Family': 'sfr', 'Single Family (SFR)': 'sfr', 'Condo': 'condo', 'Townhouse': 'townhouse', 'Townhouse / PUD': 'townhouse', '2-Unit': '2unit', '3-Unit': '3_4unit', '4-Unit': '3_4unit', 'Manufactured': 'manufactured' }; setPropertyType((prev) => prev || map[d.propertyType] || 'sfr'); }
        if (d.occupancy) { const map = { 'Primary Residence': 'primary', 'Second Home': 'second', 'Investment Property': 'investment' }; setOccupancy((prev) => prev || map[d.occupancy] || 'primary'); }
        if (d.propertyValue) { setPurchasePrice((p) => p || String(d.propertyValue)); setEstimatedValue((p) => p || String(d.propertyValue)); }
        if (d.loanAmount) { setLoanAmount((p) => p || String(d.loanAmount)); setWaiverLTV((p) => p || (d.loanAmount && d.propertyValue ? ((d.loanAmount / d.propertyValue) * 100).toFixed(1) : '')); }
        if (d.loanType) setLoanType((p) => p || d.loanType);
        if (d.loanPurpose === 'RATE_TERM_REFI' || d.loanPurpose === 'STREAMLINE') setWaiverPurpose((p) => p || 'refi');
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey]);

  const propType      = PROPERTY_TYPES.find((p) => p.id === propertyType);
  const ltv           = estimatedValue && loanAmount ? ((parseFloat(loanAmount) / parseFloat(estimatedValue)) * 100).toFixed(1) : null;
  const flaggedItems  = PROPERTY_FLAGS.filter((f) => flags[f.id]);
  const criticalFlags = flaggedItems.filter((f) => f.severity === 'critical');
  const highFlags     = flaggedItems.filter((f) => f.severity === 'high');
  const isCondo       = propertyType === 'condo';
  const preIs78       = yearBuilt && parseInt(yearBuilt) < 1978;
  const eligible      = propType?.eligible || [];
  const isFHAorVA     = loanType === 'FHA' || loanType === 'VA';

  const appraisalRisk = appraisalConcerns?.overallRisk;
  const overallVerdict =
    criticalFlags.length > 0 || appraisalRisk === 'CRITICAL' ? 'CRITICAL' :
    highFlags.length > 0     || appraisalRisk === 'HIGH'     ? 'FLAGS' :
    flaggedItems.length > 0  || appraisalRisk === 'MEDIUM'   ? 'REVIEW' : 'CLEAR';

  const handleAppraisalUpload = async (file) => {
    if (!file) return;
    setAppraisalExtracting(true); setAppraisalError(''); setAppraisalData(null); setAppraisalConcerns(null);
    try {
      const base64 = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = () => res(reader.result.split(',')[1]); reader.onerror = () => rej(new Error('File read failed')); reader.readAsDataURL(file); });

      const extractResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: `Extract key data from this real estate appraisal report. For comparable sales, extract BOTH the contract date (c/) and settlement/closing date (s/) if shown separately. Return ONLY valid JSON, no markdown:\n{"subjectAddress":"full address","appraisedValue":number_or_null,"effectiveDate":"date string","propertyType":"string","gla":number_or_null,"yearBuilt":number_or_null,"condition":"C1|C2|C3|C4|C5|C6 or string","siteSize":"string","neighborhood":"string","appraiserName":"string","subjectPriorSale":{"date":"date string or null","price":number_or_null,"daysOwned":number_or_null},"comparables":[{"address":"string","salePrice":number,"contractDate":"contract date if shown as c/date, else null","settlementDate":"closing date if shown as s/date, else null","saleDate":"best available date string","gla":number,"distanceMiles":number,"adjustedValue":number,"priorSaleDate":"string or null","priorSalePrice":number_or_null}],"appraisalType":"URAR|Desktop|Drive-by|Other","form":"1004|2055|1073|Other","incomingConditions":["list of conditions or required repairs"],"appraiserComments":"brief summary"}` },
          ]}],
        }),
      });
      if (!extractResp.ok) throw new Error('Extraction API error ' + extractResp.status);
      const extractData = await extractResp.json();
      const extractText = extractData.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const extractMatch = extractText.match(/\{[\s\S]*\}/);
      if (!extractMatch) throw new Error('Could not parse appraisal data');
      const extracted = JSON.parse(extractMatch[0]);
      setAppraisalData(extracted);
      if (extracted.yearBuilt && !yearBuilt) setYearBuilt(String(extracted.yearBuilt));
      if (extracted.gla       && !sqft)      setSqft(String(extracted.gla));

      const analyzeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 6000,
          messages: [{ role: 'user', content: `You are a senior mortgage underwriter and appraisal review expert. Analyze this appraisal data for a ${loanType || 'conventional'} loan.\n\nIMPORTANT — Stale comp rule: A comparable is stale if its CONTRACT date (c/ date, NOT settlement date) is more than 6 months before the appraisal effective date.\n\nAppraisal effective date: ${extracted.effectiveDate || 'unknown'}\nAppraisal data: ${JSON.stringify(extracted)}\n\nIdentify ALL concerns: stale comps (by contract date vs effective date), distance >1mi, different property type, large adjustments >10%, condition concerns, required repairs, ${loanType || 'conventional'} guideline violations, value support issues, flip risk (prior sale <12mo at lower price).\n\nReturn ONLY valid JSON, no markdown:\n{"overallRisk":"LOW|MEDIUM|HIGH|CRITICAL","summary":"2-3 sentence assessment","staleCompCount":number,"staleCompAddresses":["address — reason"],"concerns":[{"title":"short title","severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"Comparable|Condition|Value|Repairs|Guideline|FlipRisk|Other","detail":"specific concern","recommendation":"specific action","rebuttable":true}],"compsAssessment":{"strongComps":["address"],"weakComps":["address — reason"]},"valueOpinion":"Supported|Questionable|Unsupported","loanTypeFlags":["specific guideline issues"],"flipRisk":{"detected":true,"summary":"description or null"}}` }],
        }),
      });
      if (!analyzeResp.ok) throw new Error('Analysis API error ' + analyzeResp.status);
      const analyzeData  = await analyzeResp.json();
      const analyzeText  = analyzeData.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const analyzeMatch = analyzeText.match(/\{[\s\S]*\}/);
      if (!analyzeMatch) throw new Error('Could not parse analysis');
      setAppraisalConcerns(JSON.parse(analyzeMatch[0]));
    } catch (err) { setAppraisalError('Analysis failed: ' + err.message); }
    setAppraisalExtracting(false);
  };

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const riskFlags = [];
      criticalFlags.forEach((f) => riskFlags.push({ field: f.id, message: f.label, severity: 'HIGH' }));
      highFlags.forEach((f)     => riskFlags.push({ field: f.id, message: f.label, severity: 'MEDIUM' }));
      if (appraisalConcerns?.overallRisk === 'CRITICAL' || appraisalConcerns?.overallRisk === 'HIGH') riskFlags.push({ field: 'appraisalReview', message: 'Appraisal review: ' + appraisalConcerns.overallRisk + ' risk — ' + (appraisalConcerns.concerns?.length || 0) + ' concerns', severity: appraisalConcerns.overallRisk === 'CRITICAL' ? 'HIGH' : 'MEDIUM' });
      if (appraisalConcerns?.flipRisk?.detected) riskFlags.push({ field: 'flipRisk', message: 'Flip risk: ' + (appraisalConcerns.flipRisk.summary || ''), severity: 'HIGH' });
      const writtenId = await reportFindings(
        'PROPERTY_INTEL',
        {
          verdict: overallVerdict === 'CLEAR' ? 'Collateral Clear' : overallVerdict === 'CRITICAL' ? 'Critical Issues — ' + criticalFlags.length + ' flag(s)' : 'Review Required — ' + flaggedItems.length + ' flag(s)',
          summary: 'Collateral Intelligence — ' + (propType?.label || 'Property') + '. LTV: ' + (ltv || 'N/A') + '%. ' + (flaggedItems.length > 0 ? flaggedItems.length + ' condition flag(s). ' : '') + (appraisalData ? 'Appraisal: ' + fmt0(appraisalData.appraisedValue) + '. ' : '') + (appraisalConcerns?.overallRisk ? 'Risk: ' + appraisalConcerns.overallRisk + '.' : ''),
          propertyType, occupancy, yearBuilt: parseInt(yearBuilt) || null, sqft: parseInt(sqft) || null,
          purchasePrice: parseFloat(purchasePrice) || null, estimatedValue: parseFloat(estimatedValue) || null,
          loanAmount: parseFloat(loanAmount) || null, loanType, ltv: ltv ? parseFloat(ltv) : null,
          eligiblePrograms: eligible, flaggedItems: flaggedItems.map((f) => f.id),
          criticalFlagCount: criticalFlags.length, condoProjectApproved: isCondo ? condoProjectApproved : null,
          preIs78, appraisalData: appraisalData || null, appraisalConcerns: appraisalConcerns || null,
          loNotes, flipRisk: appraisalConcerns?.flipRisk || null,
          completeness: { propertyTypeSet: !!propertyType, occupancySet: !!occupancy, loanAmountEntered: !!loanAmount, appraisalReviewed: !!appraisalData },
        },
        [],
        riskFlags,
      );
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    setRecordSaving(false);
  };

  const subjectAddress = appraisalData?.subjectAddress || (scenario ? [scenario.streetAddress, scenario.city, scenario.state].filter(Boolean).join(', ') : '');
  const rebuttalLetter = buildRebuttalLetter(borrowerName, scenario?.scenarioName, subjectAddress, appraisalData?.appraisedValue, loanType, appraisalConcerns?.concerns?.filter((c) => c.rebuttable) || [], additionalComps ? additionalComps.split('\n').filter(Boolean) : [], loNotes);

  if (loading) return (<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center"><div className="text-5xl mb-4">🏠</div><div className="text-slate-500">Loading...</div></div></div>);

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted    = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered  = q ? sorted.filter(s => (s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore   = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">09</div>
              <div><span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 2 — Lender Fit</span><h1 className="text-2xl font-bold text-white mt-0.5">Collateral Intelligence™</h1></div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Evaluate collateral risk before it reaches underwriting. Detects stale comps, condition issues, flip history, and FHA/VA property eligibility concerns.</p>
            <div className="flex flex-wrap gap-2">{['Appraisal Review', 'Stale Listing Detection', 'Comparable Analysis', 'FHA/VA Condition Flags', 'Flip Risk Assessment', 'AI Property Report'].map(tag => (<span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>))}</div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5"><h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2><p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p></div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…" className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (<div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm"><p className="text-3xl mb-3">📂</p><p className="text-sm font-semibold text-slate-600">No scenarios found</p><button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button></div>
          ) : filtered.length === 0 ? (<div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm"><p className="text-2xl mb-2">🔍</p><p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p><button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button></div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate('/property-intel?scenarioId=' + s.id)} className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all">View all {filtered.length} scenarios</button>}
              {showAll && filtered.length > 5 && <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  const TABS = [
    { id: 0, label: 'Property Analysis', icon: '🏠' },
    { id: 1, label: 'Appraisal Review™', icon: '📋' },
    { id: 2, label: 'Waiver Coach™',     icon: '✅' },
    { id: 3, label: 'Notes & Record',    icon: '💾' },
  ];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      <div className="bg-slate-900 relative overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 20%, #f59e0b 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm mb-6 flex items-center gap-2">← Dashboard</button>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">LOANBEACONS™ — Module 09</div>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif" }} className="text-4xl font-normal text-white mb-2">Collateral Intelligence™</h1>
              <p className="text-slate-400 text-base max-w-xl leading-relaxed">Property analysis · AI appraisal review · Waiver eligibility · Rebuttal letter generation</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4" style={{ minWidth: '240px' }}>
              {scenario ? (<>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Active Scenario</div>
                <div className="text-white font-bold">{borrowerName || scenario.scenarioName}</div>
                <div className="text-slate-400 text-sm mt-1">{fmt0(parseFloat(loanAmount))} · {loanType || 'N/A'} · {scenario.state || ''}</div>
                <div className={'text-sm font-bold mt-1 ' + (overallVerdict === 'CLEAR' ? 'text-emerald-400' : overallVerdict === 'CRITICAL' ? 'text-red-400' : 'text-amber-400')}>
                  {overallVerdict === 'CLEAR' ? '✓ Collateral Clear' : overallVerdict === 'CRITICAL' ? '⛔ Critical Issues' : '⚠ Review Required'}
                </div>
                <button onClick={() => navigate('/property-intel')} className="text-xs text-blue-400 hover:text-blue-300 mt-2 block">Change scenario →</button>
              </>) : <div className="text-slate-400 text-sm">No scenario loaded</div>}
            </div>
          </div>
        </div>
      </div>

      {scenarioId && borrowerName && (
        <div className="bg-[#1B3A6B] px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-bold text-sm">{borrowerName}</span>
            {scenario?.streetAddress && <span className="text-blue-200 text-xs">{[scenario.streetAddress, scenario.city, scenario.state].filter(Boolean).join(', ')}</span>}
            <div className="flex flex-wrap gap-x-4 text-xs text-blue-200">
              {loanAmount && <span>Loan <strong className="text-white">{fmt0(parseFloat(loanAmount))}</strong></span>}
              {loanType   && <span>Type <strong className="text-white">{loanType}</strong></span>}
              {ltv        && <span>LTV <strong className="text-white">{ltv}%</strong></span>}
              {propType   && <span>Property <strong className="text-white">{propType.label}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <ScenarioHeader moduleTitle="Collateral Intelligence™" moduleNumber="09" scenarioId={scenarioId} />
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-2"><DecisionRecordBanner savedRecordId={savedRecordId} moduleKey="COLLATERAL_INTEL" /></div>

      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={'flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all ' + (activeTab === tab.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tab.id === 1 && appraisalConcerns?.overallRisk && (<span className={'text-xs px-1.5 py-0.5 rounded-full font-black ' + (appraisalConcerns.overallRisk === 'CRITICAL' || appraisalConcerns.overallRisk === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{appraisalConcerns.concerns?.length || 0}</span>)}
                {tab.id === 0 && flaggedItems.length > 0 && (<span className={'text-xs px-1.5 py-0.5 rounded-full font-black ' + (criticalFlags.length > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{flaggedItems.length}</span>)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">

            {/* ══ TAB 0: PROPERTY ANALYSIS ══════════════════════════════ */}
            {activeTab === 0 && (
              <>
                {isFHAorVA && !flags.well_septic && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl px-6 py-4">
                    <div className="font-bold text-amber-800 text-sm mb-1">⚠️ {loanType} Loan — Well / Septic Checklist</div>
                    <p className="text-xs text-amber-700 leading-relaxed">If the subject property has a private well or septic system, check the Well/Septic flag below. {loanType} requires: <strong>water potability test</strong> (results 7-10 days — order at contract signing), <strong>licensed septic inspection</strong>, appraiser confirmation of condition, and minimum 10-foot separation between well and any hazard source.</p>
                  </div>
                )}

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Property Type</h2><p className="text-slate-400 text-sm mt-1">Property type determines program eligibility, underwriting guidelines, and documentation requirements.</p></div>
                  <div className="p-8">
                    <div className="grid grid-cols-3 gap-3">
                      {PROPERTY_TYPES.map((pt) => (
                        <button key={pt.id} onClick={() => setPropertyType(pt.id)} className={'rounded-2xl border-2 p-4 text-left transition-all ' + (propertyType === pt.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <div className="text-2xl mb-2">{pt.icon}</div>
                          <div className={'text-xs font-bold ' + (propertyType === pt.id ? 'text-emerald-700' : 'text-slate-700')}>{pt.label}</div>
                        </button>
                      ))}
                    </div>
                    {propType && (
                      <div className={'mt-4 rounded-2xl border px-5 py-4 ' + (propType.eligible.length === 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
                        <p className={'text-sm font-semibold ' + (propType.eligible.length === 0 ? 'text-red-700' : 'text-emerald-700')}>{propType.notes}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {['FHA','VA','USDA','Conventional','Jumbo'].map((p) => (<span key={p} className={'text-xs px-2 py-1 rounded-lg font-bold ' + (propType.eligible.includes(p) ? 'bg-emerald-200 text-emerald-800' : 'bg-red-100 text-red-600 line-through')}>{p}</span>))}
                        </div>
                      </div>
                    )}
                    {isCondo && (
                      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-2xl p-4">
                        <div className="text-sm font-bold text-blue-800 mb-3">Condo Project Approval Status</div>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {[['approved','✓ Approved','emerald'],['pending','⏳ Pending','amber'],['unknown','? Unknown','slate'],['not_approved','✗ Not Approved','red']].map(([v, l, c]) => (
                            <button key={v} onClick={() => setCondoProjectApproved(v)} className={'p-3 rounded-xl border-2 text-xs font-bold text-center transition-all ' + (condoProjectApproved === v ? `border-${c}-500 bg-${c}-50 text-${c}-700` : 'border-slate-200 text-slate-500')}>{l}</button>
                          ))}
                        </div>
                        <div className="space-y-1 text-xs text-blue-700"><p>• FHA: hud.gov/program_offices/housing/ramh/rams/hicl</p><p>• VA: benefits.va.gov/homeloans/purchaseco_condos.asp</p><p>• Conventional: Fannie/Freddie PERS approval required</p></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Occupancy</h2><p className="text-slate-400 text-sm mt-1">Occupancy type affects rate, down payment requirements, and program eligibility.</p></div>
                  <div className="p-8">
                    <div className="grid grid-cols-3 gap-4">
                      {OCCUPANCY_TYPES.map((ot) => (
                        <button key={ot.id} onClick={() => setOccupancy(ot.id)} className={'rounded-2xl border-2 p-5 text-left transition-all ' + (occupancy === ot.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300')}>
                          <div className="text-3xl mb-2">{ot.icon}</div>
                          <div className={'text-sm font-bold mb-1 ' + (occupancy === ot.id ? 'text-emerald-700' : 'text-slate-700')}>{ot.label}</div>
                          <div className="text-xs text-slate-500">{ot.note}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Property Details</h2><p className="text-slate-400 text-sm mt-1">Auto-populated from scenario. Year Built and Sq Ft auto-fill from uploaded appraisal PDF.</p></div>
                  <div className="p-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                      {[
                        { label: 'Year Built', val: yearBuilt, set: setYearBuilt, ph: '1998', type: 'number' },
                        { label: 'Square Footage', val: sqft, set: setSqft, ph: '2400', type: 'number' },
                        { label: 'Purchase Price ($)', val: purchasePrice, set: setPurchasePrice, ph: '585000', type: 'number' },
                        { label: 'Estimated / Appraised Value ($)', val: estimatedValue, set: setEstimatedValue, ph: '585000', type: 'number' },
                        { label: 'Loan Amount ($)', val: loanAmount, set: setLoanAmount, ph: '526500', type: 'number' },
                      ].map((f) => (
                        <div key={f.label}><label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{f.label}</label><input type={f.type} value={f.val} placeholder={f.ph} onChange={(e) => f.set(e.target.value)} className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-400 bg-slate-50" /></div>
                      ))}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">LTV (auto)</label>
                        <div className={'rounded-2xl border-2 px-4 py-3 text-sm font-black text-center ' + (ltv && parseFloat(ltv) > 97 ? 'border-red-300 bg-red-50 text-red-600' : ltv && parseFloat(ltv) > 90 ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700')}>{ltv ? ltv + '%' : '--'}</div>
                      </div>
                    </div>
                    {preIs78 && (<div className="mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4"><p className="text-sm font-bold text-amber-800">⚠️ Pre-1978 Construction — Lead Paint Disclosure Required</p><p className="text-xs text-amber-700 mt-1">Federal law requires a lead paint disclosure for all homes built before 1978. For FHA/VA, appraiser must note any deteriorating paint and may require testing or remediation.</p></div>)}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Property Condition Flags</h2><p className="text-slate-400 text-sm mt-1">Check all conditions that apply. Flagged items are logged to the Decision Record.</p></div>
                  <div className="p-8 space-y-3">
                    {PROPERTY_FLAGS.map((flag) => (
                      <label key={flag.id} className={'flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ' + (flags[flag.id] ? (flag.severity === 'critical' ? 'bg-red-50 border-red-300' : flag.severity === 'high' ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-200') : 'bg-slate-50 border-slate-200 hover:border-slate-300')}>
                        <input type="checkbox" checked={!!flags[flag.id]} onChange={(e) => setFlags((p) => ({ ...p, [flag.id]: e.target.checked }))} className={'w-5 h-5 mt-0.5 shrink-0 ' + (flag.severity === 'critical' ? 'accent-red-600' : 'accent-orange-500')} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-slate-800">{flag.label}</span>
                            <span className={'text-xs px-2 py-0.5 rounded-full font-black ' + (flag.severity === 'critical' ? 'bg-red-100 text-red-700' : flag.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700')}>{flag.severity.toUpperCase()}</span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{flag.programs}</span>
                          </div>
                          {flags[flag.id] && (
                            <>
                              <p className="text-xs text-slate-600 leading-relaxed">{flag.note}</p>
                              {flag.id === 'well_septic' && isFHAorVA && (
                                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                  <p className="text-xs font-bold text-red-700">{loanType} SPECIFIC REQUIREMENTS:</p>
                                  <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                                    <li>• Water potability test by certified lab — order NOW (7-10 day turnaround)</li>
                                    <li>• Licensed septic inspector must certify system is functioning</li>
                                    <li>• Appraiser must note condition and confirm no visible issues</li>
                                    <li>• Minimum 10-ft separation between well and property line; 50-ft from septic tank</li>
                                    <li>• Test results and inspection must be in file before closing</li>
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══ TAB 1: APPRAISAL REVIEW ═══════════════════════════════ */}
            {activeTab === 1 && (
              <>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Appraisal Review™</h2><p className="text-slate-400 text-sm mt-1">Upload the appraisal PDF. AI extracts key data, then analyzes concerns specific to {loanType || 'your loan type'}.</p></div>
                  <div className="p-8 space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4"><p className="text-xs text-slate-600 leading-relaxed"><strong>How it works:</strong> Step 1 — Haiku extracts subject data, appraised value, comparables (with <strong>contract dates</strong>), prior sale history, and conditions. Step 2 — Sonnet analyzes against {loanType || 'agency'} guidelines, counts stale comps from effective date, detects flip risk. Step 3 — Generate rebuttal letter for rebuttable concerns.</p></div>
                    <div>
                      <label className={'flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-all ' + (appraisalExtracting ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50')}>
                        <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleAppraisalUpload(e.target.files[0])} disabled={appraisalExtracting} />
                        {appraisalExtracting ? (
                          <div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-emerald-400 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px', borderStyle: 'solid' }} /><div className="text-sm font-bold text-emerald-600">Analyzing appraisal...</div><div className="text-xs text-slate-400">Step 1: Extracting data · Step 2: Reviewing concerns</div></div>
                        ) : (
                          <div className="flex flex-col items-center gap-2"><div className="text-4xl">📋</div><div className="text-sm font-bold text-slate-700">{appraisalData ? 'Re-upload Appraisal PDF' : 'Upload Appraisal PDF'}</div><div className="text-xs text-slate-400">Click to select · URAR, 1004, 2055, or any appraisal form</div></div>
                        )}
                      </label>
                    </div>
                    {appraisalError && (<div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4"><p className="text-sm font-bold text-red-700">Analysis Failed</p><p className="text-xs text-red-600 mt-1">{appraisalError}</p></div>)}
                  </div>
                </div>

                {appraisalData && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-900 to-slate-800 px-8 py-5">
                      <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Appraisal Data Extracted</div>
                      <h2 className="text-xl font-bold text-white">{appraisalData.subjectAddress || 'Subject Property'}</h2>
                      <p className="text-slate-400 text-sm mt-1">{appraisalData.form || 'Appraisal'} · Effective {appraisalData.effectiveDate || 'date not found'} · {appraisalData.appraisalType || 'Full'}</p>
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          ['Appraised Value', fmt0(appraisalData.appraisedValue), 'text-2xl font-black text-emerald-600'],
                          ['GLA (sq ft)', appraisalData.gla ? appraisalData.gla.toLocaleString() : '--', 'text-xl font-bold text-slate-800'],
                          ['Year Built', appraisalData.yearBuilt || '--', 'text-xl font-bold text-slate-800'],
                          ['Condition', appraisalData.condition || '--', 'text-xl font-bold ' + (appraisalData.condition && (appraisalData.condition.includes('C4') || appraisalData.condition.includes('C5') || appraisalData.condition.includes('C6')) ? 'text-red-600' : 'text-slate-800')],
                        ].map(([label, val, cls]) => (
                          <div key={label} className="bg-slate-50 rounded-2xl p-4 text-center"><div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">{label}</div><div className={cls}>{val}</div></div>
                        ))}
                      </div>

                      {/* ── Flip History + Eligibility Timeline ────────────────── */}
                      {appraisalData.subjectPriorSale?.date && (() => {
                        const priorDate  = parseAppraisalDate(appraisalData.subjectPriorSale.date);
                        const today      = new Date();
                        const daysHeld   = priorDate ? Math.round((today - priorDate) / (1000 * 60 * 60 * 24)) : null;
                        const priorPrice = appraisalData.subjectPriorSale.price;
                        const appraisedV = appraisalData.appraisedValue;
                        const pctGain    = priorPrice && appraisedV ? (((appraisedV - priorPrice) / priorPrice) * 100).toFixed(1) : null;
                        const isFlipRisk = daysHeld !== null && daysHeld <= 365 && pctGain !== null && parseFloat(pctGain) > 10;
                        return (
                          <div className={'rounded-2xl border p-5 ' + (isFlipRisk ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200')}>
                            <div className={'text-xs font-bold uppercase tracking-widest mb-2 ' + (isFlipRisk ? 'text-red-700' : 'text-slate-500')}>
                              {isFlipRisk ? '🚨 Flip Risk Detected — Subject Prior Sale' : '📅 Subject Prior Sale History'}
                            </div>
                            <div className="flex flex-wrap gap-6 text-sm">
                              <div><span className="text-slate-500 text-xs">Prior Sale Date</span><div className={'font-bold ' + (isFlipRisk ? 'text-red-700' : 'text-slate-800')}>{appraisalData.subjectPriorSale.date}</div></div>
                              {priorPrice && <div><span className="text-slate-500 text-xs">Prior Sale Price</span><div className="font-bold text-slate-800">{fmt0(priorPrice)}</div></div>}
                              {daysHeld !== null && <div><span className="text-slate-500 text-xs">Days Held</span><div className={'font-bold ' + (isFlipRisk ? 'text-red-700' : 'text-slate-800')}>{daysHeld} days</div></div>}
                              {pctGain !== null && <div><span className="text-slate-500 text-xs">Appreciation</span><div className={'font-bold ' + (parseFloat(pctGain) > 10 ? 'text-red-700' : 'text-emerald-700')}>{pctGain > 0 ? '+' : ''}{pctGain}%</div></div>}
                            </div>
                            {isFlipRisk && (<p className="text-xs text-red-700 mt-2 leading-relaxed">Property held {daysHeld} days and appraised at {pctGain}% higher than prior sale. Lenders may require additional scrutiny or a second appraisal.</p>)}
                            {/* ── NEW: Per-program eligibility timeline ── */}
                            <FlipEligibilityTimeline priorDate={priorDate} pctGain={pctGain} loanType={loanType} />
                          </div>
                        );
                      })()}

                      {/* Comparables */}
                      {appraisalData.comparables && appraisalData.comparables.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                            Comparable Sales
                            {appraisalData.effectiveDate && <span className="ml-2 text-slate-400 normal-case font-normal">· Stale = contract date &gt;6 months before effective date ({appraisalData.effectiveDate})</span>}
                          </div>
                          <div className="space-y-3">
                            {appraisalData.comparables.map((comp, i) => {
                              const effectiveDateRef = parseAppraisalDate(appraisalData.effectiveDate) || new Date();
                              const compDateStr = comp.contractDate || comp.saleDate;
                              const compDate    = parseAppraisalDate(compDateStr);
                              const isOld = compDate && !isNaN(compDate) && (effectiveDateRef - compDate) > 1000 * 60 * 60 * 24 * 180;
                              const isFar = comp.distanceMiles && comp.distanceMiles > 1;
                              const hasIssue = isOld || isFar;
                              return (
                                <div key={i} className={'rounded-2xl border px-5 py-4 ' + (hasIssue ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}>
                                  <div className="flex items-start justify-between flex-wrap gap-2">
                                    <div>
                                      <div className="font-bold text-slate-800 text-sm">{comp.address || 'Comp ' + (i + 1)}</div>
                                      <div className="text-xs text-slate-500 mt-0.5">
                                        {comp.contractDate ? 'Contract: ' + comp.contractDate : comp.saleDate || '--'}
                                        {comp.settlementDate && comp.contractDate ? ' · Settlement: ' + comp.settlementDate : ''}
                                        {' · '}{comp.distanceMiles ? comp.distanceMiles + ' mi' : '--'}
                                        {' · '}{comp.gla ? comp.gla.toLocaleString() + ' sq ft' : '--'}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-black text-slate-800">{fmt0(comp.salePrice)}</div>
                                      {comp.adjustedValue && comp.adjustedValue !== comp.salePrice && (<div className="text-xs text-slate-500">Adj: {fmt0(comp.adjustedValue)}</div>)}
                                    </div>
                                  </div>
                                  {hasIssue && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {isOld && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-lg font-bold">⚠ Stale — contract date &gt;6 months before effective date</span>}
                                      {isFar && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-lg font-bold">⚠ Distance &gt;1 mile from subject</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {appraisalData.incomingConditions && appraisalData.incomingConditions.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                          <div className="text-xs font-bold text-red-700 uppercase tracking-widest mb-3">Conditions Noted by Appraiser</div>
                          <ul className="space-y-2">{appraisalData.incomingConditions.map((c, i) => (<li key={i} className="flex gap-2 text-sm text-red-800"><span className="shrink-0 text-red-500">•</span><span>{c}</span></li>))}</ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {appraisalConcerns && appraisalConcerns.concerns && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className={'bg-gradient-to-r px-8 py-5 ' + (appraisalConcerns.overallRisk === 'CRITICAL' || appraisalConcerns.overallRisk === 'HIGH' ? 'from-red-900 to-slate-800' : appraisalConcerns.overallRisk === 'MEDIUM' ? 'from-amber-900 to-slate-800' : 'from-emerald-900 to-slate-800')}>
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">AI Appraisal Analysis</div>
                          <h2 className="text-xl font-bold text-white">{appraisalConcerns.concerns.length} Concern{appraisalConcerns.concerns.length !== 1 ? 's' : ''} Identified</h2>
                          <p className="text-slate-300 text-sm mt-1">{appraisalConcerns.summary}</p>
                          {appraisalConcerns.staleCompCount > 0 && (<div className="mt-2 text-xs text-amber-300 font-bold">⚠ {appraisalConcerns.staleCompCount} stale comp{appraisalConcerns.staleCompCount !== 1 ? 's' : ''} detected (contract date &gt;6 months before effective date)</div>)}
                        </div>
                        <div className={'text-2xl font-black px-4 py-2 rounded-2xl ' + (appraisalConcerns.overallRisk === 'CRITICAL' ? 'bg-red-500/30 text-red-300' : appraisalConcerns.overallRisk === 'HIGH' ? 'bg-orange-500/30 text-orange-300' : appraisalConcerns.overallRisk === 'MEDIUM' ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300')}>{appraisalConcerns.overallRisk}</div>
                      </div>
                    </div>
                    <div className="p-8 space-y-4">
                      {appraisalConcerns.concerns.map((concern, i) => (
                        <div key={i} className={'rounded-2xl border p-5 ' + (concern.severity === 'CRITICAL' ? 'bg-red-50 border-red-200' : concern.severity === 'HIGH' ? 'bg-orange-50 border-orange-200' : concern.severity === 'MEDIUM' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}>
                          <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800 text-sm">{concern.title}</span>
                              <span className={'text-xs px-2 py-0.5 rounded-full font-black ' + (concern.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' : concern.severity === 'HIGH' ? 'bg-orange-200 text-orange-800' : concern.severity === 'MEDIUM' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600')}>{concern.severity}</span>
                              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">{concern.category}</span>
                            </div>
                            {concern.rebuttable && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg font-semibold">Rebuttable</span>}
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed mb-2">{concern.detail}</p>
                          {concern.recommendation && (<div className="bg-white/70 rounded-xl px-4 py-2 border border-white"><span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Action: </span><span className="text-xs text-slate-700">{concern.recommendation}</span></div>)}
                        </div>
                      ))}

                      {appraisalConcerns.staleCompAddresses?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Stale Comps ({appraisalConcerns.staleCompAddresses.length})</div>
                          {appraisalConcerns.staleCompAddresses.map((addr, i) => (<div key={i} className="text-xs text-amber-800 flex gap-2 mb-1"><span className="shrink-0">•</span><span>{addr}</span></div>))}
                        </div>
                      )}

                      {appraisalConcerns.valueOpinion && (
                        <div className={'rounded-2xl border p-4 text-center ' + (appraisalConcerns.valueOpinion === 'Supported' ? 'bg-emerald-50 border-emerald-200' : appraisalConcerns.valueOpinion === 'Questionable' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200')}>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Value Opinion</div>
                          <div className={'text-xl font-black ' + (appraisalConcerns.valueOpinion === 'Supported' ? 'text-emerald-700' : appraisalConcerns.valueOpinion === 'Questionable' ? 'text-amber-700' : 'text-red-700')}>{appraisalConcerns.valueOpinion}</div>
                        </div>
                      )}

                      {appraisalConcerns.concerns.some((c) => c.rebuttable) && (
                        <div className="border-2 border-blue-200 rounded-2xl overflow-hidden">
                          <button onClick={() => setShowRebuttal((v) => !v)} className="w-full flex items-center justify-between px-6 py-4 bg-blue-50 hover:bg-blue-100 transition-colors">
                            <div className="flex items-center gap-3"><span className="text-xl">✉️</span><div className="text-left"><div className="font-bold text-blue-800">Generate Rebuttal Letter</div><div className="text-xs text-blue-600">{appraisalConcerns.concerns.filter((c) => c.rebuttable).length} rebuttable concern(s) — letter auto-generated</div></div></div>
                            <span className="text-blue-500">{showRebuttal ? '▲ Hide' : '▼ Show'}</span>
                          </button>
                          {showRebuttal && (
                            <div className="p-6 space-y-4">
                              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Additional Comparable Sales (one per line)</label><textarea value={additionalComps} onChange={(e) => setAdditionalComps(e.target.value)} rows={3} placeholder="123 Main St — $425,000 — 2,100 sq ft — 0.3 mi — Sold 02/2026&#10;456 Oak Ave — $418,000 — 2,050 sq ft — 0.5 mi — Sold 03/2026" className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none" /></div>
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5"><pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{rebuttalLetter}</pre></div>
                              <div className="flex gap-3">
                                <button onClick={() => { navigator.clipboard.writeText(rebuttalLetter); setRebuttalCopied(true); setTimeout(() => setRebuttalCopied(false), 2500); }} className={'px-5 py-2.5 rounded-xl text-sm font-bold ' + (rebuttalCopied ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white')}>{rebuttalCopied ? 'Copied!' : 'Copy Letter'}</button>
                                <button onClick={() => window.print()} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl">Print</button>
                              </div>
                              <p className="text-xs text-slate-400">Review and customize before submitting. Addresses rebuttable concerns identified by AI analysis.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!appraisalData && !appraisalExtracting && !appraisalError && (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl p-12 text-center"><div className="text-5xl mb-4">📋</div><div className="font-bold text-slate-600 text-lg mb-2">No Appraisal Uploaded Yet</div><p className="text-slate-400 text-sm max-w-md mx-auto">Upload the appraisal PDF above to run the AI analysis.</p></div>
                )}
              </>
            )}

            {/* ══ TAB 2: WAIVER COACH ═══════════════════════════════════ */}
            {activeTab === 2 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">Waiver Coach™</h2><p className="text-slate-400 text-sm mt-1">Determine if your loan qualifies for an appraisal waiver (PIW, ACE, or VA waiver) to save time and cost.</p></div>
                <div className="p-8 space-y-6">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4"><p className="text-sm text-indigo-800 leading-relaxed"><strong>What is an appraisal waiver?</strong> GSEs (Fannie Mae and Freddie Mac) and the VA allow certain loans to skip the full appraisal using automated data models. A waiver can save the borrower $500-$900, eliminate 7-14 days from the timeline, and remove the appraisal contingency — but it must be offered by the AUS (DU or LP) and the property must meet eligibility criteria.</p></div>
                  <div className="grid grid-cols-3 gap-4">
                    {WAIVER_TYPES.map((wt) => (
                      <button key={wt.id} onClick={() => setSelectedWaiver(wt.id)} className={'rounded-2xl border-2 p-4 text-left transition-all ' + (selectedWaiver === wt.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300')}>
                        <div className={'text-lg font-black mb-1 ' + (selectedWaiver === wt.id ? 'text-indigo-700' : 'text-slate-700')}>{wt.label}</div>
                        <div className="text-xs text-slate-500 leading-relaxed">{wt.fullLabel}</div>
                      </button>
                    ))}
                  </div>
                  {WAIVER_TYPES.filter((w) => w.id === selectedWaiver).map((wt) => (
                    <div key={wt.id} className="space-y-5">
                      <p className="text-sm text-slate-600 leading-relaxed">{wt.description}</p>
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5"><div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Eligibility Criteria</div><div className="space-y-2">{wt.criteria.map((c, i) => (<div key={i} className="flex items-start gap-2 text-sm"><span className="text-indigo-400 shrink-0 mt-0.5">•</span><span className="text-slate-700">{c}</span></div>))}</div></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"><div className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Benefits</div>{wt.benefits.map((b, i) => (<div key={i} className="flex gap-2 text-xs text-emerald-800 mb-2"><span className="shrink-0 text-emerald-500">✓</span><span>{b}</span></div>))}</div>
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">Risks to Know</div>{wt.risks.map((r, i) => (<div key={i} className="flex gap-2 text-xs text-amber-800 mb-2"><span className="shrink-0 text-amber-500">⚠</span><span>{r}</span></div>))}</div>
                      </div>
                      <div className="bg-slate-900 rounded-2xl p-5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Eligibility Check</div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div><label className="block text-xs font-bold text-slate-400 mb-2">Current LTV (%)</label><input type="number" value={waiverLTV} onChange={(e) => setWaiverLTV(e.target.value)} placeholder="90.0" className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-indigo-400" /></div>
                          <div><label className="block text-xs font-bold text-slate-400 mb-2">Loan Purpose</label><select value={waiverPurpose} onChange={(e) => setWaiverPurpose(e.target.value)} className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"><option value="purchase">Purchase</option><option value="refi">Rate/Term Refi</option><option value="cashout">Cash-Out Refi</option></select></div>
                        </div>
                        <div className="space-y-2">
                          {(() => {
                            const ltvNum = parseFloat(waiverLTV) || 0;
                            const checks = [];
                            if (wt.id === 'piw') {
                              checks.push({ pass: ltvNum <= (waiverPurpose === 'purchase' ? 80 : 90), text: 'LTV ' + (waiverPurpose === 'purchase' ? '≤ 80% for purchase' : '≤ 90% for refi') + ' — current: ' + (ltvNum > 0 ? ltvNum + '%' : 'not entered') });
                              checks.push({ pass: loanType === 'CONVENTIONAL' || loanType === 'HOMEREADY' || loanType === 'HOME_POSSIBLE', text: 'Conventional/DU loan required — current: ' + (loanType || 'not set') });
                              checks.push({ pass: propertyType === 'sfr' || propertyType === 'condo' || propertyType === 'townhouse', text: 'SFR, condo, or PUD required — current: ' + (propType?.label || 'not set') });
                              checks.push({ pass: occupancy !== 'investment', text: 'Not investment property — current: ' + (OCCUPANCY_TYPES.find((o) => o.id === occupancy)?.label || '') });
                              checks.push({ pass: waiverPurpose !== 'cashout', text: 'Not cash-out refi (PIW not available for cash-out)' });
                            } else if (wt.id === 'ace') {
                              checks.push({ pass: ltvNum <= 97, text: 'LTV ≤ 97% — current: ' + (ltvNum > 0 ? ltvNum + '%' : 'not entered') });
                              checks.push({ pass: loanType === 'CONVENTIONAL' || loanType === 'HOMEREADY' || loanType === 'HOME_POSSIBLE', text: 'Conventional/LP loan required — current: ' + (loanType || 'not set') });
                              checks.push({ pass: propertyType === 'sfr' || propertyType === 'condo' || propertyType === 'townhouse', text: 'SFR, PUD, or condo required — current: ' + (propType?.label || 'not set') });
                              checks.push({ pass: propertyType !== 'manufactured' && propertyType !== 'farm', text: 'Standard property type (not manufactured or farm)' });
                            } else {
                              checks.push({ pass: loanType === 'VA', text: 'VA loan required — current: ' + (loanType || 'not set') });
                              checks.push({ pass: waiverPurpose === 'refi', text: 'IRRRL (refi) only — purchase loans require full appraisal' });
                              checks.push({ pass: occupancy === 'primary', text: 'Primary residence required — current: ' + (OCCUPANCY_TYPES.find((o) => o.id === occupancy)?.label || '') });
                            }
                            const allPass = checks.every((c) => c.pass);
                            return (<>{checks.map((c, i) => (<div key={i} className={'flex items-center gap-3 text-xs px-3 py-2 rounded-xl ' + (c.pass ? 'bg-emerald-900/30 text-emerald-300' : 'bg-red-900/30 text-red-300')}><span className={'text-base ' + (c.pass ? 'text-emerald-400' : 'text-red-400')}>{c.pass ? '✓' : '✗'}</span><span>{c.text}</span></div>))}<div className={'mt-2 rounded-xl px-4 py-3 text-center font-black ' + (allPass ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-400')}>{allPass ? 'LIKELY ELIGIBLE — Run through AUS to confirm' : 'One or more criteria not met — full appraisal required'}</div></>);
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ TAB 3: NOTES & RECORD ════════════════════════════════ */}
            {activeTab === 3 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5"><h2 className="text-xl font-bold text-white">LO Notes</h2><p className="text-slate-400 text-sm mt-1">Document property observations, appraisal concerns, repair requirements, and special conditions.</p></div>
                <div className="p-8 space-y-6">
                  <textarea value={loNotes} onChange={(e) => setLoNotes(e.target.value)} rows={8} placeholder="Property condition observations, appraisal concerns, HOA status, repair requirements, waiver strategy, borrower disclosures..." className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 resize-none" />
                  <div className="bg-slate-900 rounded-2xl p-6">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Collateral Summary</div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {[
                        ['Property Type',    propType?.label || '--'],
                        ['Occupancy',        OCCUPANCY_TYPES.find((o) => o.id === occupancy)?.label || '--'],
                        ['Year Built',       yearBuilt || '--'],
                        ['Square Footage',   sqft ? Number(sqft).toLocaleString() + ' sq ft' : '--'],
                        ['LTV',              ltv ? ltv + '%' : '--'],
                        ['Programs Eligible', eligible.length > 0 ? eligible.join(', ') : 'None'],
                        ['Condition Flags',  flaggedItems.length > 0 ? flaggedItems.length + ' flag(s)' : 'None'],
                        ['Critical Flags',   criticalFlags.length > 0 ? criticalFlags.length + ' CRITICAL' : 'None'],
                        ['Appraisal Reviewed', appraisalData ? 'Yes — ' + fmt0(appraisalData.appraisedValue) : 'No'],
                        ['Appraisal Risk',   appraisalConcerns?.overallRisk || '--'],
                        ['Stale Comps',      appraisalConcerns?.staleCompCount != null ? appraisalConcerns.staleCompCount + ' of ' + (appraisalData?.comparables?.length || '--') : '--'],
                        ['Concerns Found',   appraisalConcerns?.concerns?.length > 0 ? appraisalConcerns.concerns.length + ' concern(s)' : appraisalData ? 'None' : '--'],
                        ['Flip Risk',        appraisalConcerns?.flipRisk?.detected ? '⚠ DETECTED' : appraisalConcerns ? 'None' : '--'],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800">
                          <span className="text-slate-400">{l}</span>
                          <span className={'font-bold text-right ' + (v === '⚠ DETECTED' ? 'text-red-400' : 'text-slate-200')}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleSaveToRecord} disabled={recordSaving} className={'px-8 py-3 rounded-2xl text-sm font-bold ' + (savedRecordId ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50')}>
                      {recordSaving ? 'Saving...' : savedRecordId ? '✓ Decision Record Saved' : '💾 Save Decision Record™'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Panel ─────────────────────────────────────────── */}
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-3xl p-6 sticky top-24">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Collateral Summary</div>
              <div className={'rounded-2xl p-4 text-center mb-5 ' + (overallVerdict === 'CLEAR' ? 'bg-emerald-900/30 border border-emerald-700/40' : overallVerdict === 'CRITICAL' ? 'bg-red-900/30 border border-red-700/40' : 'bg-amber-900/30 border border-amber-700/40')}>
                <div className={'text-2xl font-black ' + (overallVerdict === 'CLEAR' ? 'text-emerald-400' : overallVerdict === 'CRITICAL' ? 'text-red-400' : 'text-amber-400')}>
                  {overallVerdict === 'CLEAR' ? '✓ CLEAR' : overallVerdict === 'CRITICAL' ? '⛔ CRITICAL' : overallVerdict === 'FLAGS' ? '🚩 FLAGS' : '⚠ REVIEW'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {overallVerdict === 'CLEAR' ? 'No condition issues detected' : appraisalRisk && (appraisalRisk === 'CRITICAL' || appraisalRisk === 'HIGH') && criticalFlags.length === 0 ? 'Appraisal risk: ' + appraisalRisk : criticalFlags.length + ' critical, ' + highFlags.length + ' high flag(s)'}
                </div>
              </div>
              <div className="space-y-2">
                {[['Type', propType?.label], ['Occupancy', OCCUPANCY_TYPES.find((o) => o.id === occupancy)?.label], ['Year Built', yearBuilt || '—'], ['Sq Ft', sqft ? Number(sqft).toLocaleString() : '—'], ['Purchase Price', purchasePrice ? fmt0(parseFloat(purchasePrice)) : '—'], ['Est. Value', estimatedValue ? fmt0(parseFloat(estimatedValue)) : '—'], ['LTV', ltv ? ltv + '%' : '—']].map(([l, v]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-slate-800"><span className="text-slate-400 text-sm">{l}</span><span className="font-bold text-slate-200 text-sm">{v || '—'}</span></div>
                ))}
              </div>
              <div className="mt-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Program Eligibility</div>
                {['FHA','VA','USDA','Conventional','Jumbo'].map((prog) => {
                  const ok = eligible.includes(prog) && (occupancy !== 'investment' || prog === 'Conventional' || prog === 'Jumbo');
                  return (<div key={prog} className={'flex items-center justify-between px-3 py-2 rounded-xl mb-1.5 ' + (ok ? 'bg-emerald-900/30' : 'bg-slate-800/30')}><span className={'text-sm font-semibold ' + (ok ? 'text-emerald-300' : 'text-slate-500')}>{prog}</span><span className={'font-black ' + (ok ? 'text-emerald-400' : 'text-red-400')}>{ok ? '✓' : '✗'}</span></div>);
                })}
              </div>
              {flaggedItems.length > 0 && (
                <div className={'mt-5 rounded-2xl border p-4 ' + (criticalFlags.length > 0 ? 'bg-red-900/20 border-red-700/40' : 'bg-amber-900/20 border-amber-700/40')}>
                  <div className={'text-xs font-bold uppercase tracking-wide mb-2 ' + (criticalFlags.length > 0 ? 'text-red-400' : 'text-amber-400')}>{criticalFlags.length > 0 ? 'Critical Issues' : 'Flags to Resolve'}</div>
                  {flaggedItems.map((f) => (<div key={f.id} className={'text-xs mb-1 flex gap-1.5 ' + (f.severity === 'critical' ? 'text-red-300' : f.severity === 'high' ? 'text-orange-300' : 'text-amber-300')}><span className="shrink-0">•</span><span>{f.label}</span></div>))}
                </div>
              )}
              {appraisalData && (
                <div className={'mt-4 rounded-2xl border p-4 ' + (appraisalConcerns?.overallRisk === 'CRITICAL' || appraisalConcerns?.overallRisk === 'HIGH' ? 'bg-red-900/20 border-red-700/40' : 'bg-indigo-900/20 border-indigo-700/40')}>
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">Appraisal</div>
                  <div className="text-lg font-black text-white">{fmt0(appraisalData.appraisedValue)}</div>
                  <div className="text-xs text-slate-400">{appraisalConcerns?.concerns?.length || 0} concern(s) · {appraisalConcerns?.overallRisk || 'not analyzed'}{appraisalConcerns?.staleCompCount > 0 && ' · ' + appraisalConcerns.staleCompCount + ' stale'}{appraisalConcerns?.flipRisk?.detected && ' · ⚠ Flip risk'}</div>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="font-bold text-amber-800 text-sm mb-3">⚠️ Key Rules</div>
              <ul className="space-y-2">
                {['FHA: property must meet Minimum Property Standards (MPS)', 'Pre-1978 homes: lead paint disclosure required by federal law', 'Condos: project approval required for FHA and VA', 'Investment property: no FHA/VA/USDA eligible', 'FHA flip rule: hard stop < 91 days · 2nd appraisal 91-180 days if gain ≥100%', 'USDA: follows FHA flip seasoning rules', 'VA/Conventional: no hard flip rule — underwriter scrutiny if < 12 months', 'Stale comps: use CONTRACT date (c/), not settlement date (s/)', 'Well/septic: water potability test required for FHA/VA', 'PIW/ACE: must be offered by AUS — not guaranteed'].map((rule) => (
                  <li key={rule} className="flex gap-2 text-xs text-amber-800"><span className="shrink-0">•</span><span>{rule}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <CanonicalSequenceBar currentModuleKey="PROPERTY_INTEL" scenarioId={scenarioId} recordId={savedRecordId} />
    </div>
  );
}
