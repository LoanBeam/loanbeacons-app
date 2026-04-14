// src/pages/AssetAnalyzer.jsx
// LoanBeacons™ — Module 4 | Stage 1: Pre-Structure
// Asset Analyzer™ v2.0 — Agency-Grade Bank Statement Intelligence
// Multi-borrower · Multi-account · Multi-statement · Letter Generator
// Patent Pending: U.S. Application No. 63/739,290

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import NextStepCard from '../components/NextStepCard';
import ModuleNav from '../components/ModuleNav';

// ─── Program Guidelines ──────────────────────────────────────────────────────
const PROGRAM_GUIDELINES = {
  FHA:          { label: 'FHA',           guideline: 'FHA 4000.1 §II.A.4.b',    threshold: 'amt_percent', thresholdPct: 0.01,  months: 2, note: 'Large deposit = >1% of adjusted property value' },
  VA:           { label: 'VA',            guideline: 'VA Lenders Handbook Ch.4', threshold: 'any_unusual', thresholdPct: null,  months: 2, note: 'Flag any unusual or unexplained deposit' },
  CONVENTIONAL: { label: 'Conventional',  guideline: 'Fannie Mae B3-4.2-02',    threshold: 'income_pct',  thresholdPct: 0.50,  months: 2, note: 'Large deposit = >50% gross monthly income' },
  HOMEREADY:    { label: 'HomeReady',     guideline: 'Fannie Mae B3-4.2-02',    threshold: 'income_pct',  thresholdPct: 0.50,  months: 2, note: 'Large deposit = >50% gross monthly income' },
  HOMEPOSSIBLE: { label: 'Home Possible', guideline: 'Freddie Mac 5501.3',      threshold: 'income_pct',  thresholdPct: 0.50,  months: 2, note: 'Large deposit = >50% gross monthly income' },
  USDA:         { label: 'USDA',          guideline: 'HB-1-3555 Ch. 9',         threshold: 'income_pct',  thresholdPct: 0.50,  months: 2, note: 'Large deposit = >50% gross monthly income' },
};

const ACCOUNT_TYPES = ['Checking','Savings','Business Checking','Business Savings','Investment','Retirement (401k/IRA)','Money Market'];

const LETTER_TYPES = {
  ACCESS_CONTROL: { label: 'Access & Control Letter',   desc: 'Non-borrower on account — documents borrower has full unrestricted access' },
  GIFT:           { label: 'Gift Letter',                desc: 'Non-borrower large deposit — certifies funds are a gift, not a loan' },
  EXPLANATION:    { label: 'Deposit Explanation Letter', desc: 'Unidentified or irregular deposit — borrower explains source of funds' },
};

const FLAG_SEVERITY_CONFIG = {
  HIGH:   { color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200',   dot: 'bg-red-500'   },
  MEDIUM: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  LOW:    { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt$ = n => (isNaN(Number(n)) || n === '' || n === null) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt$0 = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const uid = () => Math.random().toString(36).slice(2, 9);

function getLargeDepositThreshold(program, propertyValue, monthlyIncome) {
  const pg = PROGRAM_GUIDELINES[(program || '').toUpperCase()] || PROGRAM_GUIDELINES.CONVENTIONAL;
  if (pg.threshold === 'amt_percent') return (parseFloat(propertyValue) || 0) * pg.thresholdPct;
  if (pg.threshold === 'income_pct')  return (parseFloat(monthlyIncome)  || 0) * pg.thresholdPct;
  return 0;
}

function getProgramGuideline(loanType) {
  const key = (loanType || '').toUpperCase().replace(/[^A-Z]/g, '');
  return PROGRAM_GUIDELINES[key] || PROGRAM_GUIDELINES.CONVENTIONAL;
}

// ─── Haiku Extraction ────────────────────────────────────────────────────────
async function extractStatement(base64Data, mediaType, borrowerNames, loanType, largeDepositThreshold) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const borrowerList = borrowerNames.filter(Boolean).join(', ');
  const thresholdStr = largeDepositThreshold > 0 ? fmt$0(largeDepositThreshold) : 'any unusual amount';

  const prompt = `You are a mortgage underwriting AI. Extract all data from this bank statement.

Borrower names on file: ${borrowerList}
Loan program: ${loanType || 'Conventional'}
Large deposit threshold for this file: ${thresholdStr}

Return ONLY valid JSON (no markdown, no explanation). Use this exact schema:
{
  "statementMonth": "YYYY-MM",
  "statementYear": 2026,
  "accountHolderName": "string",
  "accountLastFour": "string",
  "institution": "string",
  "accountType": "string",
  "openingBalance": 0,
  "closingBalance": 0,
  "calculatedClosing": 0,
  "balanceDiscrepancy": false,
  "totalDeposits": 0,
  "totalWithdrawals": 0,
  "averageDailyBalance": 0,
  "nsfCount": 0,
  "nsfDates": [],
  "largeDeposits": [{"date":"MM/DD","amount":0,"description":"string","requiresSourcing":true}],
  "nonBorrowerNames": [{"name":"string","source":"string","date":"MM/DD","amount":0,"type":"PERSONAL_TRANSFER"}],
  "flaggedItems": [{"date":"MM/DD","description":"string","amount":0,"flag":"string","severity":"HIGH","note":"string"}],
  "possibleAddbacks": [{"description":"string","amount":0,"type":"string","note":"string"}],
  "recurringDeposits": [{"description":"string","avgAmount":0,"occurrences":0}],
  "aiSummary": "2-3 sentence plain English summary of findings",
  "aiVerdict": "CLEAN",
  "confidence": 85
}

Critical rules:
- statementMonth MUST match the actual statement period (e.g. "2026-02" for February 2026)
- nonBorrowerNames: flag any name NOT matching the borrower names provided above
- largeDeposits: flag any single credit above ${thresholdStr}
- Flag NSF fees, returned items, trust transfers, bonus payments, unidentified credits
- balanceDiscrepancy: true if |closingBalance - calculatedClosing| > 50
- aiVerdict: CLEAN if no flags, REVIEW_REQUIRED if minor flags, FLAGGED if HIGH severity flags exist`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

// ── Agency Context Header ────────────────────────────────────────────────────
function AgencyContextHeader({ scenario, allComplete, loanType, largeDepositThreshold }) {
  const pg = getProgramGuideline(loanType);
  return (
    <div className={`rounded-2xl border-l-4 px-5 py-4 mb-5 flex items-start justify-between gap-4 flex-wrap
      ${allComplete ? 'bg-green-50 border-green-500 border border-green-100' : 'bg-amber-50 border-amber-500 border border-amber-100'}`}>
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className={`text-xs font-black tracking-widest uppercase px-2.5 py-1 rounded-full font-['DM_Sans']
            ${allComplete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {allComplete ? '✓ Statements Complete' : '⚠ Statements Required'}
          </span>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full font-['DM_Sans']">
            {pg.label} {scenario?.loanPurpose || 'Purchase'}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-800 font-['DM_Sans']">
          {pg.months} consecutive months of bank statements required per account per borrower
        </p>
        <p className="text-xs text-slate-500 font-['DM_Sans'] mt-0.5">
          Guideline: <span className="font-semibold">{pg.guideline}</span> — {pg.note}
          {largeDepositThreshold > 0 && (
            <span className="ml-2 font-semibold text-amber-700">
              Threshold: {fmt$0(largeDepositThreshold)} requires sourcing
            </span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        {scenario?.purchasePrice && <p className="text-xs text-slate-500 font-['DM_Sans']">Purchase: <span className="font-bold">{fmt$0(scenario.purchasePrice)}</span></p>}
        {scenario?.loanAmount    && <p className="text-xs text-slate-500 font-['DM_Sans']">Loan: <span className="font-bold">{fmt$0(scenario.loanAmount)}</span></p>}
      </div>
    </div>
  );
}

// ── Statement Slot ────────────────────────────────────────────────────────────
function StatementSlot({ slot, label, onUpload }) {
  const [dragging,  setDragging]  = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [copied,    setCopied]    = useState(false);
  const inputId = `slot-${slot.id}`;

  const handleFile = (file) => { if (file) onUpload(slot.id, file); };

  const verdictConfig = {
    CLEAN:           { bg: 'bg-green-100',  text: 'text-green-800',  label: '✓ Clean'          },
    REVIEW_REQUIRED: { bg: 'bg-amber-100',  text: 'text-amber-800',  label: '⚠ Review Required' },
    FLAGGED:         { bg: 'bg-red-100',    text: 'text-red-800',    label: '● Flagged'          },
  };

  if (slot.uploading) return (
    <div className="border-2 border-indigo-200 bg-indigo-50 rounded-2xl p-4 flex items-center gap-3 min-h-[100px]">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
      <div>
        <p className="text-sm font-semibold text-indigo-700 font-['DM_Sans']">AI reading statement…</p>
        <p className="text-xs text-indigo-400 font-['DM_Sans'] truncate max-w-[180px]">{slot.fileName}</p>
      </div>
    </div>
  );

  if (slot.extraction) {
    const ex = slot.extraction;
    const vc = verdictConfig[ex.aiVerdict] || verdictConfig.REVIEW_REQUIRED;
    return (
      <div className="border-2 border-slate-200 bg-white rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-700 font-['DM_Sans']">{ex.statementMonth || label} — {ex.institution}</p>
            <p className="text-xs text-slate-400 font-['DM_Sans']">****{ex.accountLastFour} · {ex.accountType}</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${vc.bg} ${vc.text}`}>{vc.label}</span>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-2 text-xs font-['DM_Sans']">
          <div><span className="text-slate-400">Opening</span> <span className="font-bold text-slate-700 ml-1 font-mono">{fmt$(ex.openingBalance)}</span></div>
          <div><span className="text-slate-400">Closing</span> <span className="font-bold text-slate-700 ml-1 font-mono">{fmt$(ex.closingBalance)}</span></div>
          <div><span className="text-slate-400">Deposits</span> <span className="font-bold text-green-700 ml-1 font-mono">{fmt$(ex.totalDeposits)}</span></div>
          <div><span className="text-slate-400">Withdrawals</span> <span className="font-bold text-red-700 ml-1 font-mono">{fmt$(ex.totalWithdrawals)}</span></div>
        </div>
        <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
          {ex.nsfCount > 0 && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{ex.nsfCount} NSF</span>}
          {(ex.flaggedItems?.length || 0) > 0 && <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{ex.flaggedItems.length} flags</span>}
          {ex.balanceDiscrepancy && <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">⚠ Discrepancy</span>}
          <button onClick={() => setExpanded(e => !e)} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-semibold font-['DM_Sans']">
            {expanded ? 'Hide' : 'Details'}
          </button>
          <label htmlFor={`re-${inputId}`} className="text-xs text-slate-400 hover:text-slate-600 font-['DM_Sans'] cursor-pointer underline">Re-upload</label>
          <input id={`re-${inputId}`} type="file" accept=".pdf,image/*" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        </div>
        {expanded && (
          <div className="border-t border-slate-100">
            {ex.flaggedItems?.length > 0 && (
              <div className="px-4 py-3 space-y-2">
                {ex.flaggedItems.map((f, i) => {
                  const sc = FLAG_SEVERITY_CONFIG[f.severity] || FLAG_SEVERITY_CONFIG.LOW;
                  return (
                    <div key={i} className={`rounded-xl border px-3 py-2 text-xs font-['DM_Sans'] ${sc.bg} ${sc.border}`}>
                      <span className={`font-bold ${sc.color}`}>{f.severity}</span>
                      <span className="text-slate-600 ml-2">{f.date} — {f.description}{f.amount ? ` (${fmt$(f.amount)})` : ''}</span>
                      <p className="text-slate-500 mt-0.5 italic">{f.note}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {ex.aiSummary && (
              <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100">
                <p className="text-xs font-bold text-indigo-700 font-['DM_Sans'] mb-1">AI Summary</p>
                <p className="text-xs text-indigo-600 font-['DM_Sans'] leading-relaxed">{ex.aiSummary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      className={`flex flex-col items-center justify-center gap-2 min-h-[100px] rounded-2xl border-2 border-dashed cursor-pointer transition-all
        ${dragging ? 'border-indigo-400 bg-indigo-50' : slot.error ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
      <input id={inputId} type="file" accept=".pdf,image/*" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      {slot.error
        ? <><span className="text-red-400 text-lg">⚠</span><p className="text-xs text-red-600 font-['DM_Sans'] text-center px-3">{slot.error}</p></>
        : <><span className="text-2xl text-slate-300">📄</span>
           <p className="text-xs font-semibold text-slate-500 font-['DM_Sans']">{label}</p>
           <p className="text-xs text-slate-400 font-['DM_Sans']">Click or drag PDF / image</p></>
      }
    </label>
  );
}

// ── Borrower Statement Grid ───────────────────────────────────────────────────
function BorrowerStatementGrid({ borrowerId, borrowerName, accounts, onAddAccount, onUpdateAccount, onDeleteAccount, onUpload }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 font-['DM_Sans']">
            {borrowerId === 'primary' ? 'Primary Borrower' : 'Co-Borrower'}
          </p>
          <h3 className="text-base font-bold text-white font-['DM_Serif_Display']">{borrowerName}</h3>
        </div>
        <button onClick={() => onAddAccount(borrowerId)}
          className="text-xs font-bold text-indigo-300 hover:text-white border border-indigo-400/50 hover:border-white px-3 py-1.5 rounded-xl transition-colors font-['DM_Sans']">
          + Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-400 font-['DM_Sans']">No accounts added yet.</p>
          <button onClick={() => onAddAccount(borrowerId)} className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 font-['DM_Sans']">
            + Add first account
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {accounts.map(acc => (
            <div key={acc.id} className="px-5 py-5">
              {/* Account info row */}
              <div className="grid grid-cols-12 gap-2 items-end mb-4">
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 font-['DM_Sans']">Nickname</label>
                  <input value={acc.nickname} onChange={e => onUpdateAccount(acc.id, 'nickname', e.target.value)}
                    placeholder="e.g. Chase Checking"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 font-['DM_Sans']">Type</label>
                  <select value={acc.accountType} onChange={e => onUpdateAccount(acc.id, 'accountType', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-2 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none">
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 font-['DM_Sans']">Institution</label>
                  <input value={acc.institution} onChange={e => onUpdateAccount(acc.id, 'institution', e.target.value)}
                    placeholder="Bank name"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 font-['DM_Sans']">Last 4</label>
                  <input value={acc.lastFour} onChange={e => onUpdateAccount(acc.id, 'lastFour', e.target.value.slice(0, 4))}
                    placeholder="****" maxLength={4}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                </div>
                <div className="col-span-1 flex items-end pb-0.5">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap font-['DM_Sans']
                    ${acc.slots.every(s => s.extraction) ? 'bg-green-100 text-green-700' : acc.slots.some(s => s.extraction) ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                    {acc.slots.filter(s => s.extraction).length}/2
                  </span>
                </div>
                <div className="col-span-1 flex items-end pb-0.5">
                  <button onClick={() => onDeleteAccount(acc.id)}
                    className="flex items-center justify-center w-8 h-8 text-slate-300 hover:text-red-400 transition-colors rounded-xl border border-slate-200 hover:border-red-200">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Upload slots */}
              <div className="grid grid-cols-2 gap-3">
                <StatementSlot slot={acc.slots[0]} label="Month 1 — Older Statement" onUpload={onUpload} />
                <StatementSlot slot={acc.slots[1]} label="Month 2 — Most Recent" onUpload={onUpload} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Red Flag Summary ──────────────────────────────────────────────────────────
function RedFlagSummary({ allFlags, grossAssets, excludedAmount, cashNeeded }) {
  if (allFlags.length === 0) return null;
  const net = grossAssets - excludedAmount;

  return (
    <div className="bg-white rounded-3xl border border-red-100 shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-red-500 text-lg">🚩</span>
          <h3 className="text-sm font-bold text-red-800 font-['DM_Serif_Display']">Red Flag Summary</h3>
          <span className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full font-['DM_Sans']">
            {allFlags.length} flag{allFlags.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2 text-xs font-['DM_Sans']">
          {allFlags.filter(f => f.severity === 'HIGH').length   > 0 && <span className="bg-red-100    text-red-700    border border-red-200    px-2 py-0.5 rounded-full font-bold">{allFlags.filter(f => f.severity === 'HIGH').length} HIGH</span>}
          {allFlags.filter(f => f.severity === 'MEDIUM').length > 0 && <span className="bg-amber-100  text-amber-700  border border-amber-200  px-2 py-0.5 rounded-full font-bold">{allFlags.filter(f => f.severity === 'MEDIUM').length} MED</span>}
          {allFlags.filter(f => f.severity === 'LOW').length    > 0 && <span className="bg-slate-100  text-slate-600  border border-slate-200  px-2 py-0.5 rounded-full font-bold">{allFlags.filter(f => f.severity === 'LOW').length} LOW</span>}
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {allFlags.map((f, i) => {
          const sc = FLAG_SEVERITY_CONFIG[f.severity] || FLAG_SEVERITY_CONFIG.LOW;
          return (
            <div key={i} className={`px-5 py-3 flex items-start gap-3 ${sc.bg}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${sc.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${sc.color} font-['DM_Sans']`}>{f.severity}</span>
                  <span className="text-xs font-semibold text-slate-700 font-['DM_Sans']">{f.description}</span>
                  {f.amount > 0 && <span className="text-xs text-slate-500 font-mono">{fmt$(f.amount)}</span>}
                  {f.borrowerName  && <span className="text-xs text-slate-400 font-['DM_Sans']">· {f.borrowerName}</span>}
                  {f.statementMonth && <span className="text-xs text-slate-400 font-['DM_Sans']">· {f.statementMonth}</span>}
                </div>
                <p className="text-xs text-slate-500 font-['DM_Sans'] mt-0.5 italic">{f.note}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adjusted totals */}
      <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 font-['DM_Sans']">Asset Totals After Flag Exclusions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Gross Verified',      val: fmt$(grossAssets),    color: 'text-slate-700' },
            { label: 'Excluded (Flagged)',  val: `(${fmt$(excludedAmount)})`, color: 'text-red-600' },
            { label: 'Net Qualifying',      val: fmt$(net),            color: net >= cashNeeded ? 'text-green-700' : 'text-red-700' },
            { label: 'Cash to Close',       val: fmt$(cashNeeded),     color: 'text-slate-700' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-2xl border border-slate-200 px-4 py-3 text-center">
              <p className="text-xs text-slate-400 font-['DM_Sans'] mb-1">{item.label}</p>
              <p className={`text-sm font-black font-mono ${item.color}`}>{item.val}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 font-['DM_Sans'] mt-2">All flags are logged to the Decision Record on save.</p>
      </div>
    </div>
  );
}

// ── Non-Borrower Letter Generator ─────────────────────────────────────────────
function NonBorrowerLetterGenerator({ flags, scenario, completedLetters, onCompleteLetter }) {
  const actionableFlags = flags.filter(f =>
    ['NON_BORROWER_SOURCE', 'UNIDENTIFIED_CREDIT', 'PERSONAL_TRANSFER'].includes(f.flag)
  );
  if (actionableFlags.length === 0) return null;

  const borrowerName    = scenario ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() : '';
  const propertyAddress = scenario ? [scenario.streetAddress, scenario.city, scenario.state, scenario.zipCode].filter(Boolean).join(', ') : '';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="bg-white rounded-3xl border border-amber-100 shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
        <span className="text-amber-500 text-lg">📝</span>
        <h3 className="text-sm font-bold text-amber-800 font-['DM_Serif_Display']">Non-Borrower Account Detector</h3>
        <span className="text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-['DM_Sans']">
          {actionableFlags.length - completedLetters.length} letter{actionableFlags.length - completedLetters.length !== 1 ? 's' : ''} required
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {actionableFlags.map((flag, i) => (
          <LetterRow
            key={i}
            flag={flag}
            index={i}
            borrowerName={borrowerName}
            propertyAddress={propertyAddress}
            today={today}
            isComplete={completedLetters.includes(i)}
            onComplete={() => onCompleteLetter(i)}
          />
        ))}
      </div>
    </div>
  );
}

function LetterRow({ flag, index, borrowerName, propertyAddress, today, isComplete, onComplete }) {
  const [showGen,    setShowGen]    = useState(false);
  const [letterType, setLetterType] = useState('EXPLANATION');
  const [fields,     setFields]     = useState({});
  const [letterText, setLetterText] = useState('');
  const [copied,     setCopied]     = useState(false);

  function generateText() {
    if (letterType === 'ACCESS_CONTROL') {
      return `RE: Access and Control Letter — Account Ending ****${fields.accountLastFour || '____'}

Date: ${today}

To Whom It May Concern:

I, ${borrowerName}, hereby certify that I have full, unrestricted access to and control of the ${fields.accountType || 'bank'} account ending in ****${fields.accountLastFour || '____'} held at ${fields.institution || '____'}. The account holder listed as ${fields.nonBorrowerName || '____'} (${fields.relationship || 'relationship'}) does not restrict my access to or use of the funds in this account.

The balance of ${fields.balance ? fmt$(parseFloat(fields.balance)) : '____'} is available for use in connection with the purchase of the property located at ${propertyAddress || '____'}.

I understand that the lender is relying on this certification in connection with my mortgage application.

Borrower Signature: ___________________________ Date: _______________
Printed Name: ${borrowerName}`;
    }
    if (letterType === 'GIFT') {
      return `GIFT LETTER

Date: ${today}

I/We, ${fields.donorName || '____'}, residing at ${fields.donorAddress || '____'}, hereby certify that I/we have made a gift of ${fields.giftAmount ? fmt$(parseFloat(fields.giftAmount)) : '____'} to ${borrowerName} for the purpose of purchasing the property located at ${propertyAddress || '____'}.

This gift does not need to be repaid. No repayment is expected or implied in any form. There is no agreement, expressed or implied, regarding repayment of this gift.

Relationship of donor to borrower: ${fields.relationship || '____'}
Source of gifted funds: ${fields.sourceOfFunds || '____'}

Donor Signature: ___________________________ Date: _______________
Printed Name: ${fields.donorName || '____'}
Address: ${fields.donorAddress || '____'}

Borrower Signature: ___________________________ Date: _______________
Printed Name: ${borrowerName}`;
    }
    return `LETTER OF EXPLANATION — DEPOSIT SOURCE

Date: ${today}
RE: Deposit of ${fmt$(flag.amount)} on ${flag.date || '____'}

To Whom It May Concern:

I, ${borrowerName}, am writing to explain the deposit of ${fmt$(flag.amount)} on ${flag.date || '____'} described as "${flag.description || '____'}".

${fields.explanation || '[Please describe the source of these funds — e.g. sale of personal property, tax refund, inheritance, etc.]'}

These funds are my own and are not a loan from any party. I have full access to and control of these funds, and they are available for use in connection with my mortgage application.

Borrower Signature: ___________________________ Date: _______________
Printed Name: ${borrowerName}`;
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 font-['DM_Sans']">
            {flag.description}
            {flag.amount > 0 && <span className="ml-2 text-red-600 font-mono text-xs">{fmt$(flag.amount)}</span>}
          </p>
          <p className="text-xs text-slate-500 font-['DM_Sans'] mt-0.5">{flag.date} · {flag.note}</p>
        </div>
        {isComplete
          ? <span className="text-xs font-bold bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 rounded-full shrink-0 font-['DM_Sans']">✓ Complete</span>
          : <button onClick={() => setShowGen(s => !s)}
              className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition-colors font-['DM_Sans'] shrink-0">
              {showGen ? 'Close' : 'Generate Letter'}
            </button>
        }
      </div>

      {showGen && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 font-['DM_Sans']">Letter Type</label>
            <select value={letterType} onChange={e => { setLetterType(e.target.value); setLetterText(''); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white">
              {Object.entries(LETTER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 font-['DM_Sans'] mt-1">{LETTER_TYPES[letterType]?.desc}</p>
          </div>

          {letterType === 'ACCESS_CONTROL' && (
            <div className="grid grid-cols-2 gap-3">
              {[['nonBorrowerName','Name on Account'],['relationship','Relationship'],['institution','Bank Name'],['accountLastFour','Acct Last 4'],['accountType','Account Type'],['balance','Balance ($)']].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 font-['DM_Sans']">{l}</label>
                  <input value={fields[k]||''} onChange={e => setFields(p => ({...p,[k]:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-['DM_Sans'] bg-white focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                </div>
              ))}
            </div>
          )}
          {letterType === 'GIFT' && (
            <div className="grid grid-cols-2 gap-3">
              {[['donorName','Donor Full Name'],['donorAddress','Donor Address'],['relationship','Relationship'],['giftAmount','Gift Amount ($)'],['sourceOfFunds','Source of Funds']].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 font-['DM_Sans']">{l}</label>
                  <input value={fields[k]||''} onChange={e => setFields(p => ({...p,[k]:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-['DM_Sans'] bg-white focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                </div>
              ))}
            </div>
          )}
          {letterType === 'EXPLANATION' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 font-['DM_Sans']">Borrower Explanation</label>
              <textarea value={fields.explanation||''} onChange={e => setFields(p => ({...p,explanation:e.target.value}))}
                rows={3} placeholder="Describe the source of these funds…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] bg-white focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none" />
            </div>
          )}

          <button onClick={() => setLetterText(generateText())}
            className="text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl transition-colors font-['DM_Sans']">
            Generate Letter
          </button>

          {letterText && (
            <div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                {letterText}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { navigator.clipboard.writeText(letterText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition-colors font-['DM_Sans']">
                  {copied ? '✓ Copied' : 'Copy Letter'}
                </button>
                <button onClick={() => { onComplete(); setShowGen(false); }}
                  className="text-xs font-bold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl transition-colors font-['DM_Sans']">
                  ✓ Mark Complete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function AssetAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const scenarioId     = searchParams.get('scenarioId');

  const { reportFindings } = useDecisionRecord(scenarioId);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [recordSaving,  setRecordSaving]  = useState(false);

  // ── Scenario ─────────────────────────────────────────────────────────────
  const [scenario,  setScenario]  = useState(null);
  const [loading,   setLoading]   = useState(!!scenarioId);
  const [scenarios, setScenarios] = useState([]);
  const [search,    setSearch]    = useState('');
  const [showAll,   setShowAll]   = useState(false);

  // ── Transaction Setup ─────────────────────────────────────────────────────
  const [downPayment,  setDownPayment]  = useState('');
  const [closingCosts, setClosingCosts] = useState('');
  const [monthlyPITI,  setMonthlyPITI]  = useState('');
  const [loanProgram,  setLoanProgram]  = useState('Conventional');
  const cashNeeded = (parseFloat(downPayment)||0) + (parseFloat(closingCosts)||0);

  // ── Multi-statement accounts ──────────────────────────────────────────────
  const [accounts, setAccounts] = useState([]);

  // ── Other state ───────────────────────────────────────────────────────────
  const [manualAssets,      setManualAssets]      = useState([]);
  const [largeDepositItems, setLargeDepositItems] = useState([]);
  const [completedLetters,  setCompletedLetters]  = useState([]);
  const [notes,             setNotes]             = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap =>
        setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );
      setLoading(false);
      return;
    }

    // localStorage restore
    try {
      const stored = JSON.parse(localStorage.getItem(`lb_asset_analyzer_${scenarioId}`) || '{}');
      if (stored.downPayment)       setDownPayment(stored.downPayment);
      if (stored.closingCosts)      setClosingCosts(stored.closingCosts);
      if (stored.monthlyPITI)       setMonthlyPITI(stored.monthlyPITI);
      if (stored.loanProgram)       setLoanProgram(stored.loanProgram);
      if (stored.accounts)          setAccounts(stored.accounts);
      if (stored.manualAssets)      setManualAssets(stored.manualAssets);
      if (stored.largeDeposits)     setLargeDepositItems(stored.largeDeposits);
      if (stored.completedLetters)  setCompletedLetters(stored.completedLetters);
      if (stored.notes)             setNotes(stored.notes);
      if (stored.savedRecordId)     setSavedRecordId(stored.savedRecordId);
    } catch (e) { console.error(e); }

    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setScenario(d);
        if (d.loanType)         setLoanProgram(d.loanType);
        if (d.downPayment)      setDownPayment(String(d.downPayment));
        if (d.estimatedClosing) setClosingCosts(String(d.estimatedClosing));
        if (d.monthlyPayment)   setMonthlyPITI(String(d.monthlyPayment));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId]);

  // ── Autosave ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId) return;
    const t = setTimeout(() => {
      localStorage.setItem(`lb_asset_analyzer_${scenarioId}`, JSON.stringify({
        downPayment, closingCosts, monthlyPITI, loanProgram,
        accounts, manualAssets, largeDeposits: largeDepositItems,
        completedLetters, notes, savedRecordId,
      }));
    }, 800);
    return () => clearTimeout(t);
  }, [scenarioId, downPayment, closingCosts, monthlyPITI, loanProgram, accounts, manualAssets, largeDepositItems, completedLetters, notes, savedRecordId]);

  // ── Derived: borrowers ────────────────────────────────────────────────────
  const borrowers = useMemo(() => {
    if (!scenario) return [{ id: 'primary', name: 'Primary Borrower' }];
    const list = [{ id: 'primary', name: `${scenario.firstName||''} ${scenario.lastName||''}`.trim() || 'Primary Borrower' }];
    (scenario.coBorrowers || []).forEach((cb, i) => {
      const name = `${cb.firstName||''} ${cb.lastName||''}`.trim();
      if (name) list.push({ id: `co_${i}`, name });
    });
    return list;
  }, [scenario]);

  const borrowerNames = borrowers.map(b => b.name);

  // ── Derived: all extractions & flags ─────────────────────────────────────
  const allExtractions = useMemo(() =>
    accounts.flatMap(acc =>
      acc.slots.filter(s => s.extraction).map(s => ({
        ...s.extraction,
        borrowerName: borrowers.find(b => b.id === acc.borrowerId)?.name || '',
        accountLabel: acc.nickname || `${acc.accountType} ****${acc.lastFour}`,
      }))
    ), [accounts, borrowers]);

  const allFlags = useMemo(() => {
    const flags = [];
    allExtractions.forEach(ex => {
      (ex.flaggedItems || []).forEach(f => flags.push({
        ...f, borrowerName: ex.borrowerName, statementMonth: ex.statementMonth,
      }));
      for (let n = 0; n < (ex.nsfCount || 0); n++) {
        flags.push({
          flag: 'NSF_EVENT', severity: 'HIGH', description: `NSF Event — ${ex.accountLabel || ''}`,
          date: ex.nsfDates?.[n] || ex.statementMonth, amount: 0,
          note: 'NSF events may cause underwriter to decline. All instances must be documented.',
          borrowerName: ex.borrowerName, statementMonth: ex.statementMonth,
        });
      }
    });
    return flags;
  }, [allExtractions]);

  const grossAssets = useMemo(() =>
    allExtractions.reduce((s, ex) => s + (ex.closingBalance || 0), 0) +
    manualAssets.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0)
  , [allExtractions, manualAssets]);

  const excludedAmount = useMemo(() =>
    allFlags
      .filter(f => ['NON_BORROWER_SOURCE','UNIDENTIFIED_CREDIT','PERSONAL_TRANSFER'].includes(f.flag))
      .reduce((s, f) => s + (f.amount || 0), 0)
  , [allFlags]);

  const largeDepositThreshold = useMemo(() =>
    getLargeDepositThreshold(loanProgram, scenario?.purchasePrice, parseFloat(monthlyPITI) || 0)
  , [loanProgram, scenario, monthlyPITI]);

  const allComplete = useMemo(() =>
    accounts.length > 0 && accounts.every(acc => acc.slots.every(s => s.extraction))
  , [accounts]);

  const postCloseReserves = grossAssets - excludedAmount - cashNeeded;
  const reserveMonths     = monthlyPITI > 0 ? postCloseReserves / parseFloat(monthlyPITI) : 0;

  // ── Submit score ──────────────────────────────────────────────────────────
  const submitScore = useMemo(() => {
    const passing = [
      accounts.length > 0 && allComplete,
      allFlags.filter(f => f.flag === 'NSF_EVENT').length === 0,
      allFlags.filter(f => ['NON_BORROWER_SOURCE','UNIDENTIFIED_CREDIT'].includes(f.flag)).length <= completedLetters.length,
      !allFlags.some(f => f.flag === 'BALANCE_DISCREPANCY'),
      postCloseReserves >= 0,
    ].filter(Boolean).length;
    if (passing >= 5) return 'GREEN';
    if (passing >= 3) return 'AMBER';
    return 'RED';
  }, [accounts, allComplete, allFlags, completedLetters, postCloseReserves]);

  const scoreConfig = {
    GREEN: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500', label: '✓ Submit Ready' },
    AMBER: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', label: '⚠ Review Required' },
    RED:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   dot: 'bg-red-500',   label: '● Blocking Issues' },
  };
  const sc = scoreConfig[submitScore];

  // ── Account management ────────────────────────────────────────────────────
  const handleAddAccount = useCallback((borrowerId) => {
    setAccounts(prev => [...prev, {
      id: uid(), borrowerId,
      nickname: '', accountType: 'Checking', institution: '', lastFour: '',
      slots: [
        { id: uid(), uploading: false, extraction: null, error: null, fileName: '' },
        { id: uid(), uploading: false, extraction: null, error: null, fileName: '' },
      ],
    }]);
  }, []);

  const handleUpdateAccount = useCallback((accId, field, value) => {
    setAccounts(prev => prev.map(a => a.id === accId ? { ...a, [field]: value } : a));
  }, []);

  const handleDeleteAccount = useCallback((accId) => {
    setAccounts(prev => prev.filter(a => a.id !== accId));
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (slotId, file) => {
    setAccounts(prev => prev.map(acc => ({
      ...acc,
      slots: acc.slots.map(s => s.id === slotId
        ? { ...s, uploading: true, fileName: file.name, error: null, extraction: null }
        : s),
    })));

    try {
      const mediaType = file.type || 'application/pdf';
      const base64    = await fileToBase64(file);
      const extraction = await extractStatement(base64, mediaType, borrowerNames, loanProgram, largeDepositThreshold);

      setAccounts(prev => prev.map(acc => ({
        ...acc,
        slots: acc.slots.map(s => s.id === slotId
          ? { ...s, uploading: false, extraction, fileName: file.name }
          : s),
      })));

      // Auto-populate large deposits
      if (extraction.largeDeposits?.length > 0) {
        setLargeDepositItems(prev => {
          const newItems = extraction.largeDeposits
            .filter(ld => !prev.some(p => p.description === ld.description && p.date === ld.date))
            .map(ld => ({ ...ld, id: uid(), resolved: false }));
          return [...prev, ...newItems];
        });
      }
    } catch (e) {
      setAccounts(prev => prev.map(acc => ({
        ...acc,
        slots: acc.slots.map(s => s.id === slotId
          ? { ...s, uploading: false, error: `Extraction failed: ${e.message}` }
          : s),
      })));
    }
  }, [borrowerNames, loanProgram, largeDepositThreshold]);

  // ── NSI ───────────────────────────────────────────────────────────────────
  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash') ? 'cash_out_refi'
    : rawPurpose.includes('rate') || rawPurpose.includes('term') || rawPurpose.includes('refi') ? 'rate_term_refi'
    : 'purchase';

  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } =
    useNextStepIntelligence({
      currentModuleKey:        'ASSET_ANALYZER',
      loanPurpose,
      decisionRecordFindings:  { ASSET_ANALYZER: { sufficientFunds: postCloseReserves >= 0, reservePass: reserveMonths >= 2 } },
      scenarioData:            scenario || {},
      completedModules:        [],
      scenarioId,
      onWriteToDecisionRecord: null,
    });

  // ── Decision Record save ──────────────────────────────────────────────────
  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    try {
      const writtenId = await reportFindings('ASSET_ANALYZER', {
        totalAccountsReviewed:      accounts.length,
        totalStatementsUploaded:    allExtractions.length,
        grossVerifiedAssets:        Math.round(grossAssets),
        excludedAmounts:            Math.round(excludedAmount),
        netQualifyingAssets:        Math.round(grossAssets - excludedAmount),
        cashNeededToClose:          Math.round(cashNeeded),
        postCloseReserves:          Math.round(postCloseReserves),
        reserveMonths:              parseFloat(reserveMonths.toFixed(1)),
        nsfEventCount:              allFlags.filter(f => f.flag === 'NSF_EVENT').length,
        totalFlagCount:             allFlags.length,
        largeDepsRequiringSourcing: largeDepositItems.filter(l => !l.resolved).length,
        nonBorrowerFlagsResolved:   completedLetters.length,
        submitReadyScore:           submitScore,
        programGuideline:           getProgramGuideline(loanProgram).guideline,
        statementMonths:            [...new Set(allExtractions.map(e => e.statementMonth).filter(Boolean))],
        loNotes: notes,
        timestamp: new Date().toISOString(),
      });
      if (writtenId) setSavedRecordId(writtenId);
    } catch (e) { console.error(e); }
    finally { setRecordSaving(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-['DM_Sans']">Loading scenario…</span>
      </div>
    </div>
  );

  // ── Scenario Picker ───────────────────────────────────────────────────────
  if (!scenarioId) {
    const query     = search.toLowerCase().trim();
    const sorted    = [...scenarios].sort((a,b) => (b.updatedAt?.seconds||b.createdAt?.seconds||0) - (a.updatedAt?.seconds||a.createdAt?.seconds||0));
    const filtered  = query ? sorted.filter(s => ((s.scenarioName||`${s.firstName||''} ${s.lastName||''}`.trim()).toLowerCase()).includes(query)) : sorted;
    const displayed = query ? filtered : showAll ? filtered : filtered.slice(0,5);
    const hasMore   = !query && !showAll && filtered.length > 5;

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors font-['DM_Sans']">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-900/40">04</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase font-['DM_Sans']">Stage 1 — Pre-Structure</span>
                <h1 className="text-2xl font-bold text-white font-['DM_Serif_Display'] mt-0.5">Asset Analyzer™ v2.0</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5 font-['DM_Sans']">
              Agency-grade bank statement intelligence. Multi-borrower, multi-account, multi-statement upload with AI extraction, red flag detection, and automatic letter generation.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Multi-Statement Grid','Agency Guidelines','AI Extraction','Red Flag Detection','Letter Generator','NSF Detection'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium font-['DM_Sans']">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1 font-['DM_Sans']">Select a Scenario</h2>
            <p className="text-xs text-slate-400 font-['DM_Sans']">Search by name or pick from your most recent files.</p>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-['DM_Sans'] placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg">✕</button>}
          </div>
          <div className="space-y-2.5">
            {displayed.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-3xl mb-3">📂</p>
                <p className="text-sm font-semibold text-slate-600 font-['DM_Sans']">No scenarios found</p>
                <button onClick={() => navigate('/scenario-creator')} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline font-['DM_Sans']">→ Go to Scenario Creator</button>
              </div>
            ) : (
              <>
                {!query && !showAll && <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1 font-['DM_Sans']">Recently Updated</p>}
                {displayed.map(s => {
                  const name = s.scenarioName || `${s.firstName||''} ${s.lastName||''}`.trim() || 'Unnamed';
                  return (
                    <button key={s.id} onClick={() => navigate(`/asset-analyzer?scenarioId=${s.id}`)}
                      className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 font-['DM_Sans']">{name}</div>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {s.loanAmount && <span className="text-xs text-slate-500 font-mono">${Number(s.loanAmount).toLocaleString()}</span>}
                            {s.loanType   && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-['DM_Sans']">{s.loanType}</span>}
                          </div>
                        </div>
                        <span className="text-slate-300 group-hover:text-indigo-400 text-lg transition-colors">→</span>
                      </div>
                    </button>
                  );
                })}
                {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 hover:text-indigo-700 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all font-['DM_Sans']">View all {filtered.length} scenarios</button>}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN MODULE CONTENT
  // ─────────────────────────────────────────────────────────────────────────
  const borrowerLabel = scenario ? `${scenario.firstName||''} ${scenario.lastName||''}`.trim() : '';

  return (
    <div className="min-h-screen bg-slate-50 py-6 pb-24">
      <div className="max-w-6xl mx-auto px-4">
        <ModuleNav moduleNumber={4} />

        {/* ── Header ── */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl px-6 py-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase font-['DM_Sans']">Stage 1 — Pre-Structure</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30 font-['DM_Sans']">Module 4</span>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full border border-indigo-400/30 font-['DM_Sans']">v2.0</span>
              </div>
              <h1 className="text-2xl font-bold font-['DM_Serif_Display']">Asset Analyzer™</h1>
              {borrowerLabel && (
                <p className="text-indigo-300 text-sm mt-0.5 font-['DM_Sans']">
                  {borrowerLabel}
                  {borrowers.filter(b => b.id !== 'primary').map(b => ` · ${b.name}`).join('')}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold font-['DM_Sans']">● LIVE</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border font-['DM_Sans'] ${sc.bg} ${sc.text} ${sc.border}`}>{sc.label}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-0">

            {/* Zone 1 — Agency Context Header */}
            <AgencyContextHeader
              scenario={scenario}
              allComplete={allComplete}
              loanType={loanProgram}
              largeDepositThreshold={largeDepositThreshold}
            />

            {/* Zone 2 — Transaction Setup */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2 font-['DM_Sans']">
                <span>💰</span> Transaction Setup
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Down Payment ($)',      downPayment,  setDownPayment,  '58500'],
                  ['Est. Closing Costs ($)',closingCosts, setClosingCosts, '10530'],
                  ['Monthly PITI ($)',      monthlyPITI,  setMonthlyPITI,  '4365' ],
                ].map(([label, val, setter, ph]) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 font-['DM_Sans']">{label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                      <input type="number" value={val} placeholder={ph} onChange={e => setter(e.target.value)}
                        className="w-full pl-7 border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                    </div>
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1 font-['DM_Sans']">Loan Program</label>
                  <select value={loanProgram} onChange={e => setLoanProgram(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none">
                    {Object.entries(PROGRAM_GUIDELINES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {cashNeeded > 0 && (
                <div className="mt-3 bg-slate-900 rounded-xl px-5 py-3 flex items-center justify-between">
                  <div className="flex gap-6 text-xs flex-wrap font-['DM_Sans']">
                    <div><span className="text-slate-400">Down Payment </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(downPayment))}</span></div>
                    <div><span className="text-slate-400">+ Closing Costs </span><span className="text-white font-bold font-mono">{fmt$(parseFloat(closingCosts))}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 font-['DM_Sans']">Total Cash Needed</div>
                    <div className="text-xl font-black text-white font-mono">{fmt$(cashNeeded)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Zone 3 — Multi-Statement Grid */}
            <div className="mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2 font-['DM_Sans']">
                <span>🏦</span> Bank Statement Review
                <span className="text-xs font-normal text-slate-400 ml-1">2 months per account required</span>
              </h2>
              {borrowers.map(b => (
                <BorrowerStatementGrid
                  key={b.id}
                  borrowerId={b.id}
                  borrowerName={b.name}
                  accounts={accounts.filter(a => a.borrowerId === b.id)}
                  onAddAccount={handleAddAccount}
                  onUpdateAccount={handleUpdateAccount}
                  onDeleteAccount={handleDeleteAccount}
                  onUpload={handleUpload}
                />
              ))}
            </div>

            {/* Zone 4 — Red Flag Summary */}
            <RedFlagSummary
              allFlags={allFlags}
              grossAssets={grossAssets}
              excludedAmount={excludedAmount}
              cashNeeded={cashNeeded}
            />

            {/* Zone 5 — Manual Asset Accounts */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 font-['DM_Sans']"><span>🏠</span> Additional Asset Accounts</h2>
                <button onClick={() => setManualAssets(prev => [...prev, { id: uid(), type: 'Checking', institution: '', balance: '' }])}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-xl transition-colors font-['DM_Sans']">
                  + Add Account
                </button>
              </div>
              {manualAssets.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4 italic font-['DM_Sans']">Add retirement, investment, or other accounts not covered by uploaded statements.</p>
                : (
                  <div className="space-y-3">
                    {manualAssets.map(a => (
                      <div key={a.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3">
                          <select value={a.type} onChange={e => setManualAssets(prev => prev.map(x => x.id===a.id ? {...x,type:e.target.value}:x))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none">
                            {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="col-span-5">
                          <input value={a.institution} onChange={e => setManualAssets(prev => prev.map(x => x.id===a.id ? {...x,institution:e.target.value}:x))}
                            placeholder="Institution" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                        </div>
                        <div className="col-span-3">
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                            <input type="number" value={a.balance} onChange={e => setManualAssets(prev => prev.map(x => x.id===a.id ? {...x,balance:e.target.value}:x))}
                              className="w-full pl-7 border border-slate-200 rounded-xl px-3 py-2 text-sm font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                          </div>
                        </div>
                        <div className="col-span-1">
                          <button onClick={() => setManualAssets(prev => prev.filter(x => x.id !== a.id))} className="text-slate-300 hover:text-red-400 text-lg">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>

            {/* Zone 6 — Large Deposit Tracker */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 font-['DM_Sans']">
                  <span>🔍</span> Large Deposit Tracker
                </h2>
                <button onClick={() => setLargeDepositItems(prev => [...prev, { id: uid(), date:'', description:'', amount:'', resolved:false }])}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-xl transition-colors font-['DM_Sans']">
                  + Add Deposit
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4 font-['DM_Sans']">
                Deposits {largeDepositThreshold > 0 ? `>${fmt$0(largeDepositThreshold)}` : '>50% monthly income'} require sourcing documentation.
                {largeDepositItems.filter(l => !l.resolved).length > 0 && <span className="ml-2 text-amber-700 font-bold">{largeDepositItems.filter(l => !l.resolved).length} unresolved</span>}
              </p>
              {largeDepositItems.length === 0
                ? <p className="text-sm text-slate-300 italic font-['DM_Sans']">No large deposits flagged. AI extractions auto-populate this section.</p>
                : (
                  <div className="space-y-2">
                    {largeDepositItems.map(ld => (
                      <div key={ld.id} className={`grid grid-cols-12 gap-2 items-center p-3 rounded-xl border text-xs font-['DM_Sans'] ${ld.resolved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="col-span-2"><input value={ld.date||''} onChange={e => setLargeDepositItems(p => p.map(i => i.id===ld.id?{...i,date:e.target.value}:i))} placeholder="MM/DD" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" /></div>
                        <div className="col-span-5"><input value={ld.description||''} onChange={e => setLargeDepositItems(p => p.map(i => i.id===ld.id?{...i,description:e.target.value}:i))} placeholder="Description" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" /></div>
                        <div className="col-span-2"><div className="relative"><span className="absolute left-2 top-1.5 text-slate-400">$</span><input type="number" value={ld.amount||''} onChange={e => setLargeDepositItems(p => p.map(i => i.id===ld.id?{...i,amount:e.target.value}:i))} className="w-full pl-5 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" /></div></div>
                        <div className="col-span-2"><label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={!!ld.resolved} onChange={e => setLargeDepositItems(p => p.map(i => i.id===ld.id?{...i,resolved:e.target.checked}:i))} className="w-3.5 h-3.5 accent-green-600" /><span className="font-semibold">Sourced</span></label></div>
                        <div className="col-span-1"><button onClick={() => setLargeDepositItems(p => p.filter(i => i.id !== ld.id))} className="text-slate-300 hover:text-red-400 text-base">✕</button></div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>

            {/* Zone 7 — Non-Borrower Letter Generator */}
            <NonBorrowerLetterGenerator
              flags={allFlags}
              scenario={scenario}
              completedLetters={completedLetters}
              onCompleteLetter={(flagIndex) => {
                setCompletedLetters(prev =>
                  prev.includes(flagIndex) ? prev : [...prev, flagIndex]
                );
              }}
            />

            {/* Zone 8 — LO Notes */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2 font-['DM_Sans']"><span>📝</span> LO Notes</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                placeholder="Asset sourcing notes, gift fund details, seasoning explanations, large deposit documentation…"
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 font-['DM_Sans'] focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none" />
            </div>

            {/* Zone 9 — NSI + Decision Record */}
            {savedRecordId && primarySuggestion && (
              <div className="mb-5">
                <NextStepCard
                  suggestion={primarySuggestion}
                  secondarySuggestions={secondarySuggestions}
                  onFollow={logFollow}
                  onOverride={logOverride}
                  loanPurpose={loanPurpose}
                  scenarioId={scenarioId}
                />
              </div>
            )}

            {scenarioId && (
              <DecisionRecordBanner recordId={savedRecordId} moduleName="Asset Analyzer™" onSave={handleSaveToRecord} saving={recordSaving} />
            )}
          </div>

          {/* ── Right Sidebar ── */}
          <div className="space-y-4">

            {/* Submit-Ready Score */}
            <div className={`rounded-2xl border p-4 ${sc.bg} ${sc.border}`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 font-['DM_Sans']">Submit-Ready Score</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-3 h-3 rounded-full ${sc.dot}`} />
                <span className={`text-base font-black font-['DM_Serif_Display'] ${sc.text}`}>{sc.label}</span>
              </div>
              {allFlags.filter(f => f.severity === 'HIGH').map((f,i) => (
                <p key={i} className="text-xs text-red-700 font-semibold mb-1 font-['DM_Sans']">🔴 {f.description}</p>
              ))}
              {submitScore === 'GREEN' && <p className="text-xs text-green-700 font-['DM_Sans']">All checks passed. Asset documentation is ready for submission.</p>}
            </div>

            {/* Asset Summary */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 font-['DM_Sans']">Asset Summary</h3>
              <div className="space-y-2 text-xs font-['DM_Sans']">
                {[
                  ['Gross Verified Assets',  fmt$(grossAssets),           'text-slate-700'],
                  ['Excluded (Flagged)',      `(${fmt$(excludedAmount)})`, 'text-red-600'  ],
                  ['Net Qualifying Assets',  fmt$(grossAssets - excludedAmount), grossAssets - excludedAmount >= cashNeeded ? 'text-green-700' : 'text-red-700'],
                  ['Cash Needed to Close',   fmt$(cashNeeded),            'text-slate-700'],
                  ['Post-Close Reserves',    fmt$(postCloseReserves),     postCloseReserves >= 0 ? 'text-green-700' : 'text-red-600'],
                  ['Reserve Months',         reserveMonths > 0 ? `${reserveMonths.toFixed(1)} mo` : '—', reserveMonths >= 2 ? 'text-green-700' : 'text-amber-600'],
                ].map(([l,v,c]) => (
                  <div key={l} className="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span className="text-slate-400">{l}</span>
                    <span className={`font-bold font-mono ${c}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Statement Status */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 font-['DM_Sans']">Statement Status</h3>
              {accounts.length === 0
                ? <p className="text-xs text-slate-400 italic font-['DM_Sans']">No accounts added yet.</p>
                : (
                  <div className="space-y-2">
                    {accounts.map(acc => {
                      const done = acc.slots.filter(s => s.extraction).length;
                      return (
                        <div key={acc.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate font-['DM_Sans']">{acc.nickname || `${acc.accountType} ****${acc.lastFour}`}</p>
                            <p className="text-xs text-slate-400 font-['DM_Sans'] truncate">{borrowers.find(b => b.id === acc.borrowerId)?.name}</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 font-['DM_Sans'] ${done===2 ? 'bg-green-100 text-green-700' : done===1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                            {done}/2
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>

            {/* Key Rules */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 font-['DM_Sans']">⚠ Key Rules</h3>
              <ul className="space-y-1.5">
                {[
                  '401k/IRA: only 60% counted (tax haircut)',
                  'Gift funds: need letter + transfer docs',
                  'Crypto: NOT acceptable until converted >60 days',
                  'Large deposits: must source and document',
                  'Business assets: need CPA letter',
                  'Seasoning: 60+ days in account = clean',
                  'NSF events: must document — underwriter discretion',
                ].map(r => (
                  <li key={r} className="text-xs text-amber-800 flex items-start gap-1.5 font-['DM_Sans']">
                    <span className="shrink-0 mt-0.5">•</span>{r}
                  </li>
                ))}
              </ul>
            </div>

            {/* Extractions summary */}
            {allExtractions.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2 font-['DM_Sans']">Statements Analyzed</h3>
                <div className="text-2xl font-black text-indigo-600 mb-1">{allExtractions.length}</div>
                <p className="text-xs text-indigo-600 font-['DM_Sans']">
                  {allExtractions.filter(e => e.aiVerdict === 'CLEAN').length} clean ·{' '}
                  {allExtractions.filter(e => e.aiVerdict === 'FLAGGED').length} flagged
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
