// src/pages/AssetAnalyzer.jsx
// LoanBeacons™ — Module 4 | Stage 1: Pre-Structure
// Asset Analyzer™ — All 4 Phases
// Phase 1: Haircut engine, seasoning dates, source of funds, program-aware reserves
// Phase 2: AI statement upload (Haiku extraction pipeline)
// Phase 3: Gift fund workflow, large deposit auto-detection
// Phase 4: Submit-Ready Confidence Score

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import ModuleNav from '../components/ModuleNav';

const ASSET_TYPES = [
  { id: 'checking',        label: 'Checking Account',               icon: '🏦', pct: 100, docs: '2 months bank statements',                                                                    seasoned: true  },
  { id: 'savings',         label: 'Savings Account',                icon: '💰', pct: 100, docs: '2 months bank statements',                                                                    seasoned: true  },
  { id: 'stocks',          label: 'Stocks / Bonds / Mutual Funds',  icon: '📈', pct: 100, docs: '2 months statements (most recent)',                                                           seasoned: true  },
  { id: 'retirement_401k', label: '401K / IRA / 403b',              icon: '🏢', pct: 60,  docs: '2 months statements — 60% of vested balance counted (penalty/tax haircut)',                  seasoned: false },
  { id: 'gift',            label: 'Gift Funds',                     icon: '🎁', pct: 100, docs: 'Gift letter + donor bank statement showing withdrawal + transfer evidence',                   seasoned: false },
  { id: 'sale_of_home',    label: 'Net Proceeds from Sale',         icon: '🏡', pct: 100, docs: 'Executed HUD-1 / Closing Disclosure from sale',                                               seasoned: true  },
  { id: 'crypto',          label: 'Crypto / Digital Assets',        icon: '₿',  pct: 0,   docs: 'NOT acceptable — must be converted to cash 60+ days prior',                                  seasoned: false },
  { id: 'business',        label: 'Business Assets',                icon: '🏛', pct: 0,   docs: 'Generally not allowed unless ownership ≥ 25% and CPA letter confirms no impact',             seasoned: false },
];

const SOURCE_OF_FUNDS = [
  '', 'Payroll / Direct Deposit', 'Personal Savings', 'Gift (Family)',
  'Gift (Non-Family)', 'Sale of Asset', 'Inheritance', 'Business Funds',
  'Tax Refund', 'Insurance Proceeds', 'Other',
];

const PROGRAM_RESERVE_REQS = {
  FHA:          { label: 'FHA',          months: 0,  note: 'No reserve requirement for 1-2 unit properties. 3 months for 3-4 unit.'     },
  CONVENTIONAL: { label: 'Conventional', months: 2,  note: '2 months standard. Higher DTI may require 6-12 months.'                     },
  VA:           { label: 'VA',           months: 0,  note: 'No statutory minimum. Residual income serves as reserve test.'               },
  USDA:         { label: 'USDA',         months: 0,  note: 'No minimum. Reserves as compensating factor for borderline DTI.'             },
  JUMBO:        { label: 'Jumbo',        months: 12, note: '6-12 months typical. Lender-specific.'                                       },
  NON_QM:       { label: 'Non-QM',       months: 12, note: '6-12 months typical. Lender overlay applies.'                               },
};

const GIFT_CHECKLIST_ITEMS = [
  { id: 'letter',     label: 'Gift letter obtained (signed by donor)'           },
  { id: 'relation',   label: 'Donor relationship documented'                    },
  { id: 'withdrawal', label: 'Donor bank statement showing withdrawal'          },
  { id: 'transfer',   label: 'Transfer evidence (wire / cashier\'s check)'      },
  { id: 'norepay',    label: 'No repayment clause confirmed'                    },
];

const fmt$  = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt$d = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const daysSince = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// ── Phase 4: Submit-Ready Confidence Score ────────────────────────────────────
function computeConfidence({ assets, sufficientFunds, reservePass, largeDeposits }) {
  const issues   = [];
  const warnings = [];

  if (!sufficientFunds) issues.push('Insufficient funds for closing');
  if (!reservePass)     issues.push('Reserve requirement not met');

  assets.forEach(a => {
    const type = ASSET_TYPES.find(t => t.id === a.type);
    if (type?.pct === 0) {
      issues.push(`${type.label} is not an acceptable asset type`);
    }
    if (type?.seasoned && a.statementDate) {
      const days = daysSince(a.statementDate);
      if (days !== null && days < 60)
        warnings.push(`${type.label}: statement only ${days} days old (60+ required)`);
    }
    if (a.type === 'gift') {
      const missing = GIFT_CHECKLIST_ITEMS.filter(i => !a.giftChecklist?.[i.id]).length;
      if (missing > 0) warnings.push(`Gift funds: ${missing} documentation item(s) incomplete`);
    }
  });

  const undoc = largeDeposits.filter(d => !d.documented).length;
  if (undoc > 0) warnings.push(`${undoc} large deposit(s) not yet documented`);

  if (issues.length > 0)   return { level: 'red',    label: 'Blocking Issues',  issues, warnings };
  if (warnings.length > 0) return { level: 'yellow', label: 'Needs Attention',  issues, warnings };
  return                          { level: 'green',  label: 'Submit-Ready',     issues, warnings };
}

export default function AssetAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const scenarioId     = searchParams.get('scenarioId');
  const fileRef        = useRef(null);

  const { reportFindings }                  = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId]   = useState(null);
  const [recordSaving,  setRecordSaving]    = useState(false);

  const [scenario,   setScenario]           = useState(null);
  const [loading,    setLoading]            = useState(!!scenarioId);
  const [scenarios,  setScenarios]          = useState([]);
  const [search,   setSearch]   = useState('');
  const [showAll,  setShowAll]  = useState(false);

  const [assets,       setAssets]           = useState([]);
  const [downPayment,  setDownPayment]      = useState('');
  const [closingCosts, setClosingCosts]     = useState('');
  const [monthlyPITI,  setMonthlyPITI]      = useState('');
  const [loanProgram,  setLoanProgram]      = useState('CONVENTIONAL');
  const [largeDeposits,setLargeDeposits]    = useState([]);
  const [notes,        setNotes]            = useState('');
  const [showAddAsset, setShowAddAsset]     = useState(false);

  // Phase 2 — AI Upload state
  const [uploadFile,    setUploadFile]      = useState(null);
  const [uploadLoading, setUploadLoading]   = useState(false);
  const [uploadResult,  setUploadResult]    = useState(null);
  const [uploadError,   setUploadError]     = useState('');
  const [showUpload,    setShowUpload]      = useState(false);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios'))
        .then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(console.error);
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.downPayment)  setDownPayment(String(d.downPayment));
        if (d.totalHousing) setMonthlyPITI(String(d.totalHousing));
        if (d.loanType)     setLoanProgram(d.loanType);
        // Auto-estimate closing costs at 2% of loan amount if not in scenario
        if (!d.closingCosts && d.loanAmount)
          setClosingCosts(String(Math.round(parseFloat(d.loanAmount) * 0.02)));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ── Asset CRUD ──────────────────────────────────────────────────────────────
  const addAsset = (typeId) => {
    setAssets(p => [...p, {
      id: Date.now(), type: typeId, balance: '', note: '',
      statementDate: '', source: '',
      giftChecklist: { letter: false, relation: false, withdrawal: false, transfer: false, norepay: false },
    }]);
    setShowAddAsset(false);
  };
  const updateAsset     = (id, field, val) => setAssets(p => p.map(a => a.id === id ? { ...a, [field]: val } : a));
  const updateGiftCheck = (id, key, val)   => setAssets(p => p.map(a => a.id === id ? { ...a, giftChecklist: { ...a.giftChecklist, [key]: val } } : a));
  const removeAsset     = (id)             => setAssets(p => p.filter(a => a.id !== id));

  // ── Large Deposit CRUD ──────────────────────────────────────────────────────
  const addLargeDeposit = ()           => setLargeDeposits(p => [...p, { id: Date.now(), amount: '', source: '', documented: false, date: '' }]);
  const updateDeposit   = (id, f, v)   => setLargeDeposits(p => p.map(d => d.id === id ? { ...d, [f]: v } : d));
  const removeDeposit   = (id)         => setLargeDeposits(p => p.filter(d => d.id !== id));

  // ── Calculations ────────────────────────────────────────────────────────────
  const totalAssets = assets.reduce((s, a) => {
    const type = ASSET_TYPES.find(t => t.id === a.type);
    const bal  = parseFloat(a.balance) || 0;
    return s + (type ? bal * type.pct / 100 : 0);
  }, 0);

  const downPmt         = parseFloat(downPayment)  || 0;
  const closing         = parseFloat(closingCosts) || 0;
  const cashNeeded      = downPmt + closing;
  const piti            = parseFloat(monthlyPITI)  || 0;
  const postCloseAssets = totalAssets - cashNeeded;
  const reserveMonths   = piti > 0 ? postCloseAssets / piti : 0;
  const reqMonths       = PROGRAM_RESERVE_REQS[loanProgram]?.months || 0;
  const reservePass     = reserveMonths >= reqMonths;
  const sufficientFunds = totalAssets >= cashNeeded && cashNeeded > 0;

  const confidence = computeConfidence({ assets, sufficientFunds, reservePass, largeDeposits });

  // ── Phase 2: AI Statement Upload ────────────────────────────────────────────
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setUploadFile(f); setUploadResult(null); setUploadError(''); }
  };

  const handleAIReview = async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    setUploadError('');
    setUploadResult(null);
    try {
      const base64Data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(uploadFile);
      });

      const isImage   = uploadFile.type.startsWith('image/');
      const mediaType = isImage ? uploadFile.type : 'application/pdf';

      const prompt = `You are a senior mortgage processor reviewing an asset statement.
Extract the following and return ONLY valid JSON with no markdown, no preamble, no backticks:
{
  "institution": "bank name",
  "accountType": "checking|savings|retirement|investment|other",
  "accountNumberLast4": "last 4 digits or null",
  "statementEndDate": "YYYY-MM-DD or null",
  "endingBalance": number,
  "largeDeposits": [{"date":"YYYY-MM-DD","amount":number,"description":"string"}],
  "flags": ["array of underwriting concern strings"],
  "summary": "one sentence summary"
}
Flag large deposits as any single deposit over $2,000 or appearing unusual/non-payroll.
Flags should cover: seasoning issues, unverified deposits, overdrafts, non-payroll large credits, account age concerns.`;

      const msgContent = isImage
        ? [{ type: 'image',    source: { type: 'base64', media_type: mediaType,          data: base64Data } }, { type: 'text', text: prompt }]
        : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf',  data: base64Data } }, { type: 'text', text: prompt }];

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':                          'application/json',
          'x-api-key':                             import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version':                     '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5',
          max_tokens: 1024,
          messages:   [{ role: 'user', content: msgContent }],
        }),
      });

      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data   = await resp.json();
      const text   = data.content?.find(b => b.type === 'text')?.text || '';
      const clean  = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setUploadResult(parsed);
    } catch (e) {
      setUploadError('Could not extract statement data. Check the file and try again.');
      console.error(e);
    } finally {
      setUploadLoading(false);
    }
  };

  const applyExtractedAsset = () => {
    if (!uploadResult) return;
    const typeMap = { checking: 'checking', savings: 'savings', retirement: 'retirement_401k', investment: 'stocks', other: 'checking' };
    const typeId  = typeMap[uploadResult.accountType] || 'checking';
    const newAsset = {
      id: Date.now(), type: typeId,
      balance:       String(uploadResult.endingBalance || ''),
      note:          uploadResult.accountNumberLast4 ? `Acct ...${uploadResult.accountNumberLast4}` : '',
      statementDate: uploadResult.statementEndDate || '',
      source:        'Payroll / Direct Deposit',
      giftChecklist: { letter: false, relation: false, withdrawal: false, transfer: false, norepay: false },
    };
    setAssets(p => [...p, newAsset]);
    if (uploadResult.largeDeposits?.length > 0) {
      const newDeps = uploadResult.largeDeposits.map(ld => ({
        id: Date.now() + Math.random(), amount: String(ld.amount),
        source: ld.description || '', documented: false, date: ld.date || '',
      }));
      setLargeDeposits(p => [...p, ...newDeps]);
    }
    setUploadResult(null);
    setUploadFile(null);
    setShowUpload(false);
  };

  // ── Decision Record ─────────────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('ASSET_ANALYZER', {
        totalVerifiedAssets:     Math.round(totalAssets),
        cashNeededToClose:       Math.round(cashNeeded),
        postCloseReserves:       Math.round(postCloseAssets),
        reserveMonths:           parseFloat(reserveMonths.toFixed(1)),
        sufficientFunds, reservePass, loanProgram,
        confidenceLevel:         confidence.level,
        assetTypes:              assets.map(a => a.type),
        largeDepositCount:       largeDeposits.length,
        largeDepositsDocumented: largeDeposits.filter(d => d.documented).length,
        blockingIssues:          confidence.issues,
        warnings:                confidence.warnings,
        loNotes:                 notes,
        timestamp:               new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  // ── Loading / Scenario Picker ───────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ModuleNav moduleNumber={4} />
      <div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
    </div>
  );

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">04</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 1 — Pre-Structure</span>
                <h1 className="text-2xl font-bold text-white mt-0.5">Asset Analyzer™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Verify, document, and analyze all borrower assets. Flags sourcing issues, calculates reserves, and confirms cash-to-close across all asset types and account classes.</p>
            <div className="flex flex-wrap gap-2">
              {['Asset Source Verification', 'Gift Fund Tracking', 'Reserve Analysis', 'Large Deposit Review', '401k / IRA Accounts', 'Cash-to-Close'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Select a Scenario</h2>
            <p className="text-xs text-slate-400">Search by name or pick from your most recent files.</p>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm font-semibold text-slate-600">No scenarios found</p>
              <p className="text-xs text-slate-400 mt-1">Create one in Scenario Creator first.</p>
              <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">→ Go to Scenario Creator</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-slate-600">No matches for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs indigo-500 hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!q && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recently Updated</p>}
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed Scenario';
                const amount = parseFloat(s.loanAmount || 0);
                return (
                  <button key={s.id} onClick={() => navigate(`/asset-analyzer?scenarioId=${s.id}`)}
                    className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{sName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {amount > 0 && <span className="text-xs text-slate-500 font-mono">${amount.toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{s.loanType}</span>}
                          {s.creditScore && <span className="text-xs bg-indigo-50 text-indigo-600 border-indigo-100 border px-2 py-0.5 rounded-full font-mono">FICO {s.creditScore}</span>}
                          {s.stage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{s.stage}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors shrink-0">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 border-indigo-200 hover:bg-indigo-50 py-3 border border-dashed rounded-2xl transition-all">
                  View all {filtered.length} scenarios
                </button>
              )}
              {showAll && filtered.length > 5 && (
                <button onClick={() => setShowAll(false)} className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2 transition-colors">↑ Show less</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const borrowerName         = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() : null;
  const monthlyIncome        = parseFloat(scenario?.totalIncome || scenario?.monthlyIncome || 0);
  const largeDepositThreshold = monthlyIncome > 0 ? monthlyIncome * 0.5 : 0;

  const confidenceBg   = { red: 'bg-red-50 border-red-300', yellow: 'bg-amber-50 border-amber-300', green: 'bg-emerald-50 border-emerald-300' }[confidence.level];
  const confidenceText = { red: 'text-red-700',             yellow: 'text-amber-700',                green: 'text-emerald-700'                }[confidence.level];
  const confidenceIcon = { red: '🔴',                       yellow: '🟡',                             green: '🟢'                              }[confidence.level];

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">

        {/* ── Header ── */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30">Module 4</span>
              </div>
              <h1 className="text-2xl font-bold">Asset Analyzer™</h1>
              <p className="text-indigo-200 text-sm mt-0.5">
                {borrowerName ? `${borrowerName} · ` : ''}Down Payment · Reserves · Gift Funds · Large Deposits
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Verified Assets</div>
              <div className={`text-3xl font-black ${sufficientFunds ? 'text-emerald-400' : totalAssets > 0 ? 'text-red-400' : 'text-white'}`}>
                {fmt$(totalAssets)}
              </div>
              <div className="text-xs text-slate-400">
                {sufficientFunds ? '✔ Sufficient for closing' : cashNeeded > 0 ? '✗ Shortfall: ' + fmt$(cashNeeded - totalAssets) : 'Enter assets below'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">

            {/* ── Transaction Setup ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">💳 Transaction Setup</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Down Payment ($)',       val: downPayment,  set: setDownPayment,  ph: '17250' },
                  { label: 'Est. Closing Costs ($)',  val: closingCosts, set: setClosingCosts, ph: '7500'  },
                  { label: 'Monthly PITI ($)',        val: monthlyPITI,  set: setMonthlyPITI,  ph: '2100'  },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                    <input type="number" value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Loan Program</label>
                  <select value={loanProgram} onChange={e => setLoanProgram(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                    {Object.entries(PROGRAM_RESERVE_REQS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {cashNeeded > 0 && (
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-6 text-sm">
                  <div><span className="text-slate-400">Down Payment </span><span className="font-bold text-slate-700">{fmt$d(downPmt)}</span></div>
                  <div><span className="text-slate-400">+ Closing Costs </span><span className="font-bold text-slate-700">{fmt$d(closing)}</span></div>
                  <div><span className="text-slate-400">= Total Cash Needed </span><span className="font-black text-slate-900">{fmt$d(cashNeeded)}</span></div>
                </div>
              )}
            </div>

            {/* ── Phase 2: AI Statement Review ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">🤖 AI Statement Review</h2>
                <button onClick={() => setShowUpload(v => !v)}
                  className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">
                  {showUpload ? 'Hide' : '+ Upload Statement'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Upload a bank or asset statement — AI extracts balance, seasoning, and flags underwriting issues before submission.
              </p>

              {showUpload && (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 text-center bg-indigo-50/40">
                    <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
                    {uploadFile ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 font-semibold">📄 {uploadFile.name}</span>
                        <button onClick={() => { setUploadFile(null); setUploadResult(null); }}
                          className="text-xs text-slate-400 hover:text-red-400">✕ Remove</button>
                      </div>
                    ) : (
                      <button onClick={() => fileRef.current?.click()}
                        className="text-sm text-indigo-600 font-semibold hover:text-indigo-800">
                        Click to upload PDF or image
                      </button>
                    )}
                  </div>

                  {uploadFile && !uploadResult && (
                    <button onClick={handleAIReview} disabled={uploadLoading}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all">
                      {uploadLoading ? '⏳ Analyzing statement...' : '🔍 Run AI Review'}
                    </button>
                  )}

                  {uploadError && <p className="text-xs text-red-500 font-semibold">{uploadError}</p>}

                  {uploadResult && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-indigo-800">Extraction Results</h3>
                        <span className="text-xs text-indigo-500 font-semibold">{uploadResult.institution}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-400">Account Type: </span><span className="font-semibold capitalize">{uploadResult.accountType}</span></div>
                        <div><span className="text-slate-400">Ending Balance: </span><span className="font-bold text-emerald-700">{fmt$d(uploadResult.endingBalance)}</span></div>
                        <div><span className="text-slate-400">Statement Date: </span><span className="font-semibold">{uploadResult.statementEndDate || 'Not found'}</span></div>
                        <div><span className="text-slate-400">Acct #: </span><span className="font-semibold">...{uploadResult.accountNumberLast4 || 'N/A'}</span></div>
                      </div>
                      {uploadResult.summary && (
                        <p className="text-xs text-slate-500 italic">{uploadResult.summary}</p>
                      )}
                      {uploadResult.flags?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-xs font-bold text-amber-700 mb-1">⚠ Underwriting Flags</p>
                          {uploadResult.flags.map((f, i) => <p key={i} className="text-xs text-amber-700">• {f}</p>)}
                        </div>
                      )}
                      {uploadResult.largeDeposits?.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                          <p className="text-xs font-bold text-orange-700 mb-1">🔍 Large Deposits Found ({uploadResult.largeDeposits.length})</p>
                          {uploadResult.largeDeposits.map((d, i) => (
                            <p key={i} className="text-xs text-orange-700">• {d.date} — {fmt$d(d.amount)} — {d.description}</p>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={applyExtractedAsset}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all">
                          ✓ Apply to Asset Accounts
                        </button>
                        <button onClick={() => setUploadResult(null)}
                          className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Asset Accounts ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">🏦 Asset Accounts</h2>
              {assets.length === 0 && <p className="text-sm text-slate-400 mb-4">No assets entered yet. Add accounts below.</p>}

              <div className="space-y-4 mb-4">
                {assets.map(asset => {
                  const type         = ASSET_TYPES.find(t => t.id === asset.type);
                  const bal          = parseFloat(asset.balance) || 0;
                  const counted      = type ? bal * type.pct / 100 : 0;
                  const days         = daysSince(asset.statementDate);
                  const isSeasoned   = days === null || days >= 60;
                  const isGift       = asset.type === 'gift';
                  const giftDone     = isGift ? GIFT_CHECKLIST_ITEMS.filter(i => asset.giftChecklist?.[i.id]).length : 0;
                  const giftComplete = isGift && giftDone === GIFT_CHECKLIST_ITEMS.length;

                  return (
                    <div key={asset.id}
                      className={`rounded-xl border p-4 ${
                        type?.pct === 0  ? 'bg-red-50 border-red-200'      :
                        isGift           ? 'bg-purple-50 border-purple-200' :
                                           'bg-slate-50 border-slate-200'
                      }`}>

                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xl">{type?.icon}</span>
                          <div className="flex-1">
                            <div className="text-sm font-bold text-slate-800">{type?.label}</div>
                            <div className="text-xs text-slate-400 mt-0.5">📋 {type?.docs}</div>
                          </div>
                        </div>
                        <button onClick={() => removeAsset(asset.id)} className="text-slate-300 hover:text-red-400 text-lg leading-none">✕</button>
                      </div>

                      {/* Row 1: Balance / Qualifying / Note */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Balance ($)</label>
                          <input type="number" value={asset.balance} placeholder="0"
                            onChange={e => updateAsset(asset.id, 'balance', e.target.value)}
                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 ${
                              type?.pct === 0 ? 'bg-red-50 border-red-200' : 'border-slate-200'}`} />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Qualifying Amount</label>
                          <div className={`border rounded-lg px-3 py-2 text-sm font-bold ${
                            type?.pct === 0
                              ? 'bg-red-100 border-red-200 text-red-600'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            {type?.pct === 0 ? '✗ Not Allowed' : `${fmt$d(counted)} (${type?.pct}%)`}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Account Note</label>
                          <input type="text" value={asset.note} placeholder="acct last 4, etc."
                            onChange={e => updateAsset(asset.id, 'note', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                        </div>
                      </div>

                      {/* Row 2: Statement Date + Source of Funds */}
                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Statement Date</label>
                          <input type="date" value={asset.statementDate}
                            onChange={e => updateAsset(asset.id, 'statementDate', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300" />
                          {asset.statementDate && days !== null && (
                            <div className={`mt-1 text-xs font-semibold ${isSeasoned ? 'text-emerald-600' : 'text-red-500'}`}>
                              {isSeasoned ? `✓ ${days} days — seasoned` : `⚠ Only ${days} days — needs 60+`}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Source of Funds</label>
                          <select value={asset.source} onChange={e => updateAsset(asset.id, 'source', e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300">
                            {SOURCE_OF_FUNDS.map(s => <option key={s} value={s}>{s || '— Select source —'}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Phase 3: Gift Fund Checklist */}
                      {isGift && (
                        <div className="mt-3 bg-purple-100 border border-purple-200 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-purple-800">
                              🎁 Gift Fund Documentation ({giftDone}/{GIFT_CHECKLIST_ITEMS.length})
                            </p>
                            {giftComplete && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">✓ Complete</span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {GIFT_CHECKLIST_ITEMS.map(item => (
                              <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox"
                                  checked={!!asset.giftChecklist?.[item.id]}
                                  onChange={e => updateGiftCheck(asset.id, item.id, e.target.checked)}
                                  className="accent-purple-600" />
                                <span className={`text-xs ${asset.giftChecklist?.[item.id] ? 'text-purple-400 line-through' : 'text-purple-800'}`}>
                                  {item.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {type?.pct === 0 && (
                        <p className="text-xs text-red-600 font-semibold mt-2">
                          ⚠ This asset type is not acceptable for down payment or reserves
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {showAddAsset ? (
                <div className="border border-indigo-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Select Asset Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ASSET_TYPES.map(t => (
                      <button key={t.id} onClick={() => addAsset(t.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                          t.pct === 0
                            ? 'border-red-200 hover:bg-red-50 opacity-75'
                            : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}>
                        <span className="text-lg">{t.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-slate-700">{t.label}</div>
                          <div className={`text-xs ${t.pct === 0 ? 'text-red-500' : 'text-slate-400'}`}>{t.pct}% counted</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowAddAsset(false)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowAddAsset(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                  + Add Asset Account
                </button>
              )}
            </div>

            {/* ── Phase 3: Large Deposit Tracker ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">🔍 Large Deposit Tracker</h2>
                <button onClick={addLargeDeposit} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">+ Add Deposit</button>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Large deposits (typically &gt; 50% of monthly income
                {largeDepositThreshold > 0 ? ` — ${fmt$(largeDepositThreshold)} for this borrower` : ''}) require sourcing documentation.
              </p>
              {largeDeposits.length === 0 ? (
                <p className="text-sm text-slate-300 italic">No large deposits flagged.</p>
              ) : (
                <div className="space-y-2">
                  {largeDeposits.map(d => (
                    <div key={d.id}
                      className={`p-3 rounded-xl border ${d.documented ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="number" value={d.amount} placeholder="Amount $"
                          onChange={e => updateDeposit(d.id, 'amount', e.target.value)}
                          className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                        <input type="text" value={d.source} placeholder="Source (e.g. gift from mother)"
                          onChange={e => updateDeposit(d.id, 'source', e.target.value)}
                          className="flex-1 min-w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                        <input type="date" value={d.date || ''}
                          onChange={e => updateDeposit(d.id, 'date', e.target.value)}
                          className="w-36 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={d.documented}
                            onChange={e => updateDeposit(d.id, 'documented', e.target.checked)}
                            className="accent-emerald-600" />
                          <span className={d.documented ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                            Documented
                          </span>
                        </label>
                        <button onClick={() => removeDeposit(d.id)} className="text-slate-300 hover:text-red-400">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── LO Notes ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📝 LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Asset sourcing notes, gift fund details, seasoning explanations..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {scenarioId && (
              <DecisionRecordBanner
                recordId={savedRecordId}
                moduleName="Asset Analyzer™"
                onSave={handleSaveToRecord}
                saving={recordSaving}
              />
            )}
          </div>

          {/* ── Right Panel ── */}
          <div className="space-y-4">

            {/* Phase 4: Submit-Ready Confidence Score */}
            <div className={`rounded-xl border p-4 ${confidenceBg}`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Submit-Ready Score</h3>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{confidenceIcon}</span>
                <span className={`text-base font-black ${confidenceText}`}>{confidence.label}</span>
              </div>
              {confidence.issues.map((iss, i) => (
                <p key={i} className="text-xs text-red-700 font-semibold mb-1">🔴 {iss}</p>
              ))}
              {confidence.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 mb-0.5">⚠ {w}</p>
              ))}
              {confidence.level === 'green' && (
                <p className="text-xs text-emerald-700">All checks passed. Asset documentation is ready for submission.</p>
              )}
            </div>

            {/* Asset Summary */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Asset Summary</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Total Verified Assets', fmt$(totalAssets),                   totalAssets >= cashNeeded && cashNeeded > 0 ? 'text-emerald-600' : totalAssets > 0 ? 'text-slate-700' : 'text-slate-400'],
                  ['Cash Needed to Close',  fmt$(cashNeeded),                    'text-slate-700'],
                  ['Post-Close Reserves',   fmt$(postCloseAssets),              postCloseAssets >= 0 ? 'text-emerald-600' : 'text-red-500'],
                  ['Reserve Months',        reserveMonths.toFixed(1) + ' mo',   reservePass ? 'text-emerald-600' : 'text-amber-600'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-400">{l}</span>
                    <span className={`font-bold ${c}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sufficient Funds */}
            <div className={`rounded-xl border p-4 text-center ${
              sufficientFunds           ? 'bg-emerald-50 border-emerald-200' :
              cashNeeded > 0 && totalAssets > 0 ? 'bg-red-50 border-red-200'     :
                                                   'bg-slate-50 border-slate-200'
            }`}>
              <div className="text-2xl mb-1">
                {sufficientFunds ? '✅' : cashNeeded > 0 && totalAssets > 0 ? '❌' : '—'}
              </div>
              <div className={`text-sm font-bold ${sufficientFunds ? 'text-emerald-700' : 'text-red-600'}`}>
                {sufficientFunds
                  ? 'Sufficient Funds'
                  : cashNeeded > 0 && totalAssets > 0
                    ? `Shortfall: ${fmt$(cashNeeded - totalAssets)}`
                    : 'Enter assets + transaction details'}
              </div>
            </div>

            {/* Reserve Requirement */}
            {piti > 0 && totalAssets > 0 && (
              <div className={`rounded-xl border p-4 ${reservePass ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Reserve Requirement</h3>
                <div className={`text-2xl font-black ${reservePass ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {reserveMonths.toFixed(1)} mo
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {PROGRAM_RESERVE_REQS[loanProgram]?.label}: {reqMonths > 0 ? `${reqMonths} months required` : 'No minimum'}
                </div>
                <div className="text-xs text-slate-400 mt-1">{PROGRAM_RESERVE_REQS[loanProgram]?.note}</div>
              </div>
            )}

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠ Key Rules</h3>
              <div className="text-xs text-amber-700 space-y-1.5">
                <p>• 401K/IRA: only 60% counted (tax haircut)</p>
                <p>• Gift funds: need letter + transfer docs</p>
                <p>• Crypto: NOT acceptable until converted &gt; 60 days</p>
                <p>• Large deposits: must source and document</p>
                <p>• Business assets: need CPA letter</p>
                <p>• Seasoning: 60+ days in account = clean</p>
              </div>
            </div>

            {/* Large Deposits summary */}
            {largeDeposits.length > 0 && (
              <div className={`rounded-xl border p-4 ${
                largeDeposits.every(d => d.documented) ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'
              }`}>
                <h3 className="text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Large Deposits</h3>
                <div className="text-2xl font-black text-amber-600">{largeDeposits.filter(d => !d.documented).length}</div>
                <div className="text-xs text-slate-500">undocumented of {largeDeposits.length} total</div>
              </div>
            )}

            {/* Asset Breakdown by Type */}
            {assets.some(a => (parseFloat(a.balance) || 0) > 0) && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Asset Breakdown</h3>
                <div className="space-y-1.5">
                  {ASSET_TYPES.filter(t => t.pct > 0).map(t => {
                    const typeAssets = assets.filter(a => a.type === t.id);
                    if (typeAssets.length === 0) return null;
                    const total = typeAssets.reduce((s, a) => s + (parseFloat(a.balance) || 0) * t.pct / 100, 0);
                    if (total === 0) return null;
                    return (
                      <div key={t.id} className="flex justify-between text-xs">
                        <span className="text-slate-400">{t.icon} {t.label}</span>
                        <span className="font-bold text-slate-700">{fmt$(total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
