// DPA Intelligence™ — Module 7 | Stage 2: Lender Fit
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  getEligiblePrograms,
  buildCandidateStacks,
  calculateAMIPercent,
} from '../../engines/dpa/dpaLayeringEngine.js';
import { PROGRAM_TYPE_LABELS } from '../../data/dpa/dpaPrograms.js';

const STEPS = ['Scenario Setup', 'Eligible Programs', 'Stack Builder', 'Lender Match & Output'];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

export default function DPAIntelligence() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scenarioLoaded, setScenarioLoaded] = useState(false);

  // Form state
  const [form, setForm] = useState({
    state: 'GA',
    loanType: 'FHA',
    purchasePrice: '',
    loanAmount: '',
    borrowerIncome: '',
    householdSize: '2',
    creditScore: '',
    isFirstTimeBuyer: true,
    specialCategories: [],
  });

  // Results state
  const [eligiblePrograms, setEligiblePrograms] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [candidateStacks, setCandidateStacks] = useState([]);
  const [selectedStack, setSelectedStack] = useState(null);
  const [amiPercent, setAmiPercent] = useState(null);
  const [loanTypeFilter, setLoanTypeFilter] = useState('ALL');
  const [programTypeFilter, setProgramTypeFilter] = useState('ALL');

  // Auto-populate from scenarioId
  useEffect(() => {
    const scenarioId = searchParams.get('scenarioId');
    if (scenarioId && !scenarioLoaded) {
      setLoading(true);
      getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setForm(prev => ({
            ...prev,
            state: d.state || prev.state,
            loanType: d.loanType || prev.loanType,
            purchasePrice: d.propertyValue || d.purchasePrice || '',
            loanAmount: d.loanAmount || '',
            borrowerIncome: d.monthlyIncome || '',
            creditScore: d.creditScore || '',
          }));
          setScenarioLoaded(true);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [searchParams]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleRunEligibility = () => {
    const programs = getEligiblePrograms({
      state: form.state,
      loanType: form.loanType,
      borrowerIncome: parseFloat(form.borrowerIncome) || 0,
      householdSize: parseInt(form.householdSize),
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      creditScore: parseInt(form.creditScore) || 0,
      isFirstTimeBuyer: form.isFirstTimeBuyer,
      specialCategories: form.specialCategories,
    });
    const ami = calculateAMIPercent(
      form.state,
      (parseFloat(form.borrowerIncome) || 0) * 12
    );
    setEligiblePrograms(programs);
    setAmiPercent(ami);
    setStep(1);
  };

  const handleBuildStacks = () => {
    const purchasePrice = parseFloat(form.purchasePrice) || 0;
    const loanAmount = parseFloat(form.loanAmount) || purchasePrice * 0.965;
    const stacks = buildCandidateStacks(eligiblePrograms, {
      purchasePrice,
      loanAmount,
      loanType: form.loanType,
      currentCLTV: (loanAmount / purchasePrice) * 100,
    });
    setCandidateStacks(stacks);
    setStep(2);
  };

  const filteredPrograms = eligiblePrograms.filter(p => {
    if (loanTypeFilter !== 'ALL' && !p.loanTypesEligible.includes(loanTypeFilter)) return false;
    if (programTypeFilter !== 'ALL' && p.programType !== programTypeFilter) return false;
    return true;
  });

  const formatCurrency = (n) => n ? `$${Number(n).toLocaleString()}` : '—';
  const formatPct = (n) => n ? `${n}%` : '—';

  const programTypeColor = (type) => {
    const colors = {
      grant: 'bg-green-100 text-green-800',
      forgivable_loan: 'bg-blue-100 text-blue-800',
      deferred_loan: 'bg-yellow-100 text-yellow-800',
      standard_second: 'bg-red-100 text-red-800',
      lender_grant: 'bg-green-100 text-green-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const layeringColor = (val) => {
    if (val === 'yes') return 'text-green-600';
    if (val === 'conditional') return 'text-yellow-600';
    return 'text-red-600';
  };

  const stackTypeColor = (type) => {
    if (type === 'Best Value') return 'bg-green-600';
    if (type === 'Recommended') return 'bg-blue-600';
    if (type === 'Conservative') return 'bg-gray-600';
    return 'bg-purple-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">💰</span>
            <div>
              <h1 className="text-3xl font-bold">DPA Intelligence™</h1>
              <p className="text-blue-200 text-sm">Stage 2 — Lender Fit | Module 7 of 21</p>
            </div>
          </div>
          <p className="text-blue-100 mt-2 max-w-2xl">
            Identify eligible down payment assistance programs for your borrower's scenario —
            stacked for maximum benefit, matched to your lender, and documented for your file.
          </p>
          {scenarioLoaded && (
            <div className="mt-3 inline-flex items-center gap-2 bg-blue-800 rounded-full px-4 py-1 text-sm">
              <span className="text-green-400">✓</span>
              Scenario auto-populated
            </div>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <button
                onClick={() => i < step + 1 && setStep(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  i === step
                    ? 'bg-blue-600 text-white'
                    : i < step
                    ? 'text-blue-600 hover:bg-blue-50 cursor-pointer'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === step ? 'bg-white text-blue-600' :
                  i < step ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                }`}>{i < step ? '✓' : i + 1}</span>
                <span className="hidden sm:block">{s}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < step ? 'bg-blue-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── STEP 0: SCENARIO SETUP ── */}
        {step === 0 && (
          <div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Scenario Setup</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter the borrower's scenario to find eligible DPA programs.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">State</label>
                  <select
                    value={form.state}
                    onChange={e => updateForm('state', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Loan Type</label>
                  <select
                    value={form.loanType}
                    onChange={e => updateForm('loanType', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {['FHA', 'Conventional', 'VA', 'USDA'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Purchase Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={form.purchasePrice}
                      onChange={e => updateForm('purchasePrice', e.target.value)}
                      placeholder="350000"
                      className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Loan Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={form.loanAmount}
                      onChange={e => updateForm('loanAmount', e.target.value)}
                      placeholder="337750"
                      className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Monthly Income</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={form.borrowerIncome}
                      onChange={e => updateForm('borrowerIncome', e.target.value)}
                      placeholder="6500"
                      className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Household Size</label>
                  <select
                    value={form.householdSize}
                    onChange={e => updateForm('householdSize', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Credit Score</label>
                  <input
                    type="number"
                    value={form.creditScore}
                    onChange={e => updateForm('creditScore', e.target.value)}
                    placeholder="680"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">First-Time Homebuyer?</label>
                  <div className="flex gap-3 mt-1">
                    {[true, false].map(val => (
                      <button
                        key={String(val)}
                        onClick={() => updateForm('isFirstTimeBuyer', val)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                          form.isFirstTimeBuyer === val
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {val ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Special Categories */}
              <div className="mt-5">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Special Categories <span className="text-gray-400 font-normal">(select all that apply)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'military', label: '🎖️ Military / Veteran' },
                    { id: 'public_employee', label: '🏛️ Public Employee' },
                    { id: 'healthcare', label: '🏥 Healthcare Worker' },
                    { id: 'teacher', label: '📚 Teacher / Educator' },
                    { id: 'first_responder', label: '🚒 First Responder' },
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        const cats = form.specialCategories.includes(cat.id)
                          ? form.specialCategories.filter(c => c !== cat.id)
                          : [...form.specialCategories, cat.id];
                        updateForm('specialCategories', cats);
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                        form.specialCategories.includes(cat.id)
                          ? 'bg-blue-100 text-blue-700 border-blue-400'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 mb-6">
              ⚠️ Results are based on program eligibility rules and available data. Always verify directly with the program administrator before disclosing to your borrower.
            </div>

            <button
              onClick={handleRunEligibility}
              disabled={!form.purchasePrice || !form.borrowerIncome || !form.creditScore}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-lg transition-all"
            >
              Find Eligible Programs →
            </button>
          </div>
        )}

        {/* ── STEP 1: ELIGIBLE PROGRAMS ── */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Eligible Programs</h2>
                <p className="text-gray-500 text-sm">
                  {eligiblePrograms.length} program{eligiblePrograms.length !== 1 ? 's' : ''} found for {form.state} — {form.loanType}
                  {amiPercent && <span className="ml-2 text-blue-600 font-medium">| Borrower: {amiPercent}% AMI</span>}
                </p>
              </div>
              <button onClick={() => setStep(0)} className="text-sm text-blue-600 hover:underline">← Edit Scenario</button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-5 flex-wrap">
              <select
                value={programTypeFilter}
                onChange={e => setProgramTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="ALL">All Types</option>
                {Object.entries(PROGRAM_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {filteredPrograms.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-1">No programs found</h3>
                <p className="text-gray-500 text-sm">Try adjusting the filters or borrower scenario.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPrograms.map(program => (
                  <div key={program.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-gray-900">{program.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${programTypeColor(program.programType)}`}>
                            {PROGRAM_TYPE_LABELS[program.programType]}
                          </span>
                          {program.state === 'ALL' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">National</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-3">{program.adminEntity}</p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <div className="text-xs text-gray-500">Max Assistance</div>
                            <div className="font-bold text-gray-900 text-sm">
                              {program.maxAssistanceFlat
                                ? formatCurrency(program.maxAssistanceFlat)
                                : `${program.maxAssistancePct}% of price`}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <div className="text-xs text-gray-500">Min Credit</div>
                            <div className="font-bold text-gray-900 text-sm">{program.minCreditScore}</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <div className="text-xs text-gray-500">Purchase Cap</div>
                            <div className="font-bold text-gray-900 text-sm">
                              {program.maxPurchasePrice ? formatCurrency(program.maxPurchasePrice) : 'None'}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <div className="text-xs text-gray-500">Layering</div>
                            <div className={`font-bold text-sm ${layeringColor(program.canBeLayered)}`}>
                              {program.canBeLayered === 'yes' ? '✓ Allowed' :
                               program.canBeLayered === 'conditional' ? '~ Conditional' : '✗ Not Allowed'}
                            </div>
                          </div>
                        </div>

                        {program.layeringNotes && (
                          <p className="text-xs text-gray-400 mt-2 italic">
                            Layering note: {program.layeringNotes}
                          </p>
                        )}

                        <div className="flex gap-2 mt-2 flex-wrap">
                          {program.loanTypesEligible.map(lt => (
                            <span key={lt} className={`px-2 py-0.5 text-xs rounded font-medium ${
                              lt === form.loanType ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                            }`}>{lt}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Source: {program.source} | Last verified: {program.lastVerified}
                      </span>
                      <span className="text-xs text-amber-600">
                        ⚠️ Verify with program administrator before disclosing
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {eligiblePrograms.length > 0 && (
              <button
                onClick={handleBuildStacks}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-lg transition-all"
              >
                Build DPA Stacks →
              </button>
            )}
          </div>
        )}

        {/* ── STEP 2: STACK BUILDER ── */}
        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">DPA Stack Options</h2>
                <p className="text-gray-500 text-sm">
                  {candidateStacks.length} stack{candidateStacks.length !== 1 ? 's' : ''} evaluated for {form.loanType} — ranked by maximum benefit
                </p>
              </div>
              <button onClick={() => setStep(1)} className="text-sm text-blue-600 hover:underline">← Back to Programs</button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 mb-6">
              Stacks are ranked by estimated borrower benefit while staying within agency CLTV limits.
              These are potential scenarios — not pre-approvals. Subject to lender underwriting and program confirmation.
            </div>

            {candidateStacks.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="text-4xl mb-3">📊</div>
                <h3 className="text-lg font-semibold text-gray-700">No stackable combinations found</h3>
                <p className="text-gray-500 text-sm mt-1">Individual programs may still be available. Review eligible programs above.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {candidateStacks.map((stack, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedStack(idx)}
                    className={`bg-white rounded-xl border-2 shadow-sm p-5 cursor-pointer transition-all ${
                      selectedStack === idx ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${stackTypeColor(stack.stackType)}`}>
                            {idx === 0 ? '★ ' : ''}{stack.stackType}
                          </span>
                          {stack.programs.map(p => (
                            <span key={p.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                              {p.name}
                            </span>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                          <div className="bg-green-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Total Assistance</div>
                            <div className="font-bold text-green-700 text-lg">{formatCurrency(stack.totalAssistance)}</div>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Resulting CLTV</div>
                            <div className="font-bold text-blue-700 text-lg">{stack.resultingCLTV}%</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Monthly Impact</div>
                            <div className="font-bold text-gray-900 text-lg">
                              {stack.monthlyPaymentImpact === 0 ? '$0' : `+${formatCurrency(stack.monthlyPaymentImpact)}/mo`}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Programs</div>
                            <div className="font-bold text-gray-900 text-lg">{stack.programs.length}</div>
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-gray-500">
                          <span className="font-semibold">Layering basis:</span> {stack.layeringBasis}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="font-semibold">Agency compliance:</span> {stack.agencyCitation}
                        </div>
                      </div>

                      <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 mt-1 ${
                        selectedStack === idx ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}>
                        {selectedStack === idx && <span className="text-white text-xs flex items-center justify-center h-full">✓</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              disabled={selectedStack === null && candidateStacks.length > 0 ? false : false}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-lg transition-all"
            >
              View Lender Match & Generate Output →
            </button>
          </div>
        )}

        {/* ── STEP 3: LENDER MATCH & OUTPUT ── */}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Lender Match & Decision Record</h2>
                <p className="text-gray-500 text-sm">Review lender compatibility and generate your output</p>
              </div>
              <button onClick={() => setStep(2)} className="text-sm text-blue-600 hover:underline">← Back to Stacks</button>
            </div>

            {/* Selected Stack Summary */}
            {candidateStacks.length > 0 && (
              <div className="bg-blue-900 text-white rounded-xl p-5 mb-6">
                <div className="text-sm text-blue-300 mb-2">Selected Stack</div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="text-2xl font-bold">
                      {formatCurrency(candidateStacks[selectedStack ?? 0]?.totalAssistance)}
                    </div>
                    <div className="text-blue-300 text-sm">Total Assistance</div>
                  </div>
                  <div className="text-blue-400">|</div>
                  <div>
                    <div className="text-xl font-bold">{candidateStacks[selectedStack ?? 0]?.resultingCLTV}%</div>
                    <div className="text-blue-300 text-sm">Combined CLTV</div>
                  </div>
                  <div className="text-blue-400">|</div>
                  <div className="flex-1">
                    {candidateStacks[selectedStack ?? 0]?.programs.map(p => (
                      <div key={p.id} className="text-sm font-medium">{p.name}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Lender Compatibility */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
              <h3 className="font-bold text-gray-900 mb-1">Lender Compatibility</h3>
              <p className="text-sm text-gray-500 mb-4">
                Confirm DPA participation with your lender's AE or product team before submitting.
              </p>
              <div className="space-y-2">
                {[
                  { name: 'UWM (United Wholesale)', status: 'verify', note: 'Participates in many state HFA programs — confirm with AE' },
                  { name: 'Rocket Pro TPO', status: 'verify', note: 'DPA participation varies by state — verify current eligibility' },
                  { name: 'Pennymac', status: 'verify', note: 'Contact your AE to confirm current DPA program availability' },
                ].map((lender, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium text-gray-900 text-sm">{lender.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{lender.note}</span>
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">⚠️ Verify with AE</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Full lender DPA compatibility matrix available when Lender Profile Builder™ is live at Module 10.
              </p>
            </div>

            {/* Decision Record */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-amber-900 mb-2">📋 Decision Record</h3>
              <div className="text-sm text-amber-800 space-y-1">
                <div><span className="font-semibold">Generated:</span> {new Date().toLocaleString()}</div>
                <div><span className="font-semibold">State:</span> {form.state} | <span className="font-semibold">Loan Type:</span> {form.loanType}</div>
                <div><span className="font-semibold">Programs Evaluated:</span> {eligiblePrograms.length} eligible, {candidateStacks.length} stacks generated</div>
                <div><span className="font-semibold">Data Source:</span> LoanBeacons DPA Program Database | HFA Manual Data</div>
                <div className="mt-2 p-2 bg-amber-100 rounded text-xs">
                  This record documents the DPA programs identified and stacking logic applied for this scenario.
                  It is for loan file documentation only and does not constitute program approval or lender commitment.
                  All recommendations are subject to lender underwriting, program administrator approval, and final borrower qualification.
                </div>
              </div>
            </div>

            {/* Borrower Disclaimer */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-xs text-red-700">
              <strong>Required Disclosure:</strong> Down payment assistance program availability, income limits, and funding are subject to change without notice.
              This information is provided for informational purposes only and does not constitute a loan commitment, program approval, or guarantee of eligibility.
              Contact your loan officer for the most current program details. Equal Housing Lender.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all"
              >
                🖨️ Print Decision Record
              </button>
              <button
                onClick={() => { setStep(0); setEligiblePrograms([]); setCandidateStacks([]); setSelectedStack(null); }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-all"
              >
                ↩ Run New Scenario
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}