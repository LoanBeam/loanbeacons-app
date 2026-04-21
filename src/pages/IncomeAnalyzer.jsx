// src/pages/IncomeAnalyzer.jsx
// LoanBeacons™ — Module 2 | Stage 1: Pre-Structure
// Income Analyzer™ v4.2.3 — Firestore reconstruct on load + debounced autosave
// Upload 1040 once → AI auto-detects all income types

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDecisionRecord } from '../hooks/useDecisionRecord';
import DecisionRecordBanner from '../components/DecisionRecordBanner';
import { useNextStepIntelligence } from '../hooks/useNextStepIntelligence';
import NextStepCard from '../components/NextStepCard';
import ScenarioHeader from '../components/ScenarioHeader';
import ModuleNav from '../components/ModuleNav';

// ─── Constants ────────────────────────────────────────────────────────────────
const API = 'https://api.anthropic.com/v1/messages';
const HDRS = () => ({
  'Content-Type': 'application/json',
  'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
});
const fmt$ = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => '_' + Math.random().toString(36).slice(2, 9);

// ─── Income method calc logic ─────────────────────────────────────────────────
const CALCS = {
  SELF_EMPLOYED: f => {
    const y1 = parseFloat(f.yr1_net) || 0, y2 = parseFloat(f.yr2_net) || 0;
    const add = (parseFloat(f.depreciation) || 0) + (parseFloat(f.depletion) || 0) + (parseFloat(f.home_office) || 0);
    const a1 = y1 + add, a2 = y2 + add;
    if (y2 > 0 && a2 < a1 * 0.90) return a2 / 12;
    if (y1 > 0 && y2 > 0) return ((a1 + a2) / 2) / 12;
    return (y1 > 0 ? a1 : a2) / 12;
  },
  RENTAL: f => {
    const y1net = parseFloat(f.yr1_net) || 0, y2net = parseFloat(f.yr2_net) || 0;
    const y1dep = parseFloat(f.yr1_depr) || 0, y2dep = parseFloat(f.yr2_depr) || 0;
    const y1adj = y1net + y1dep, y2adj = y2net + y2dep;
    if (y1adj !== 0 || y2adj !== 0) {
      if (y1adj !== 0 && y2adj !== 0) return ((y1adj + y2adj) / 2) / 12;
      return (y1adj !== 0 ? y1adj : y2adj) / 12;
    }
    return (parseFloat(f.gross_rents) || 0) * (1 - (parseFloat(f.vacancy_pct) || 25) / 100);
  },
  W2: f => (parseFloat(f.base_monthly) || 0) + (parseFloat(f.overtime_monthly) || 0) + (parseFloat(f.bonus_monthly) || 0) + (parseFloat(f.commission_monthly) || 0),
  SOCIAL_SECURITY: f => {
    const gross = parseFloat(f.monthly_benefit) || 0;
    const nonTaxable = parseFloat(f.non_taxable_monthly) || 0;
    if (f.gross_up === 'yes') {
      if (nonTaxable > 0 && nonTaxable < gross) {
        // Partial gross-up: only non-taxable portion × 1.25 per Fannie B3-3.1-09 / FHA 4000.1
        return (gross - nonTaxable) + (nonTaxable * 1.25);
      }
      // Fully non-taxable (e.g. SSA award letter with no tax return) — gross up entire amount
      return gross * 1.25;
    }
    return gross;
  },
  PENSION: f => {
    const total = parseFloat(f.monthly_amount) || 0;
    const nontaxable = parseFloat(f.nontaxable_portion) || 0;
    const taxable = parseFloat(f.taxable_portion) || 0;
    // IRS Simplified Method: partial non-taxable — only gross up that portion
    if (nontaxable > 0 && taxable > 0) return taxable + (nontaxable * 1.25);
    // Fully non-taxable
    if (nontaxable > 0 && taxable === 0) return nontaxable * 1.25;
    // Fallback: use is_taxable flag on total
    return total * (f.taxable === 'no' ? 1.25 : 1);
  },
  MILITARY: f => (parseFloat(f.base_pay) || 0) + ((parseFloat(f.bah) || 0) * 1.25) + ((parseFloat(f.bas) || 0) * 1.25) + (parseFloat(f.other) || 0),
  CHILD_SUPPORT: f => (parseFloat(f.months_remaining) || 0) >= 36 ? (parseFloat(f.monthly_amount) || 0) : 0,
  CAPITAL_GAINS: f => ((parseFloat(f.yr1_gains) || 0) + (parseFloat(f.yr2_gains) || 0)) / 2 / 12,
  S_CORP: f => {
    const own = Math.min(1, Math.max(0, (parseFloat(f.ownership_pct) || 100) / 100));
    return (((parseFloat(f.yr1_k1) || 0) + (parseFloat(f.yr2_k1) || 0)) / 2 * own + (parseFloat(f.w2_from_biz) || 0) + (parseFloat(f.depr_addback) || 0)) / 12;
  },
  CONTRACTOR_1099: f => {
    const n1 = (parseFloat(f.yr1_income) || 0) - (parseFloat(f.yr1_expenses) || 0);
    const n2 = (parseFloat(f.yr2_income) || 0) - (parseFloat(f.yr2_expenses) || 0);
    if (n2 > 0 && n2 < n1 * 0.90 && n1 > 0) return n2 / 12;
    if (n1 > 0 && n2 > 0) return ((n1 + n2) / 2) / 12;
    return (n1 > 0 ? n1 : n2) / 12;
  },
};

const METHOD_META = {
  SELF_EMPLOYED: { label: 'Self-employed (Schedule C)', icon: '🏢', multiYear: true },
  RENTAL: { label: 'Rental income (Schedule E)', icon: '🏠', multiYear: true },
  W2: { label: 'W-2 / Salaried', icon: '💼', multiYear: false },
  SOCIAL_SECURITY: { label: 'Social Security / SSI', icon: '🛡️', multiYear: false },
  PENSION: { label: 'Pension / retirement', icon: '💰', multiYear: false },
  MILITARY: { label: 'Military / BAH / BAS', icon: '🎖️', multiYear: false },
  CHILD_SUPPORT: { label: 'Child support / alimony', icon: '👨‍👧', multiYear: false },
  CAPITAL_GAINS: { label: 'Capital gains', icon: '📈', multiYear: true },
  S_CORP: { label: 'S-Corp / Partnership (K-1)', icon: '🏛️', multiYear: true },
  CONTRACTOR_1099: { label: '1099 Contractor', icon: '📋', multiYear: true },
};

// ─── Extraction prompts ───────────────────────────────────────────────────────
const TAX_RETURN_PROMPT = `Extract ALL income data from this federal tax return. Return ONLY valid JSON. Schema:
{"doc_type":"1040","tax_year":0,"taxpayer_name":"","filing_status":"",
"w2_wages":0,
"schedule_c_net":0,"schedule_c_gross":0,"schedule_c_depreciation":0,"schedule_c_home_office":0,"schedule_c_meals":0,"schedule_c_mileage":0,"schedule_c_sep_ira":0,"business_name":"",
"schedule_e_net":0,"schedule_e_gross_rents":0,"schedule_e_depreciation":0,
"schedule_d_net":0,
"k1_ordinary":0,"k1_ownership_pct":0,
"social_security_annual":0,"social_security_monthly":0,"ss_taxable_portion":0,"ss_non_taxable_annual":0,
"agi":0,"sep_ira_deduction":0,"self_employed_health_ins":0,
"flags":[]}
CRITICAL EXTRACTION RULES:
(1) w2_wages = Form 1040 Line 1a ONLY — employer W-2 Box 1 wages. NEVER put Social Security, pension, or retirement income here. If no employer W-2 exists, w2_wages = 0.
(2) social_security_annual = Form 1040 Line 6a GROSS (total SS benefits received) — NOT Line 6b. Line 6b is taxable only — never use Line 6b for social_security_annual.
(3) social_security_monthly = Line 6a divided by 12.
(4) ss_taxable_portion = Form 1040 Line 6b (taxable SS only).
(5) ss_non_taxable_annual = Line 6a minus Line 6b.
(6) schedule_c_net = Schedule C Line 31. schedule_e_net = Schedule E Part I total. schedule_c_depreciation = Schedule C Line 13. schedule_e_depreciation = Schedule E depreciation column total.
(7) SEP IRA is NOT an addback. Meals are NOT an addback. Flag any traps.`;

const W2_PROMPT = `Extract employment income. Return ONLY valid JSON, no markdown.
Schema: {"doc_type":"pay_stub","employee_name":"","employer_name":"","employer_ein":"","pay_period_start":"","pay_period_end":"","check_date":"","pay_frequency":"biweekly","current_gross":0,"ytd_gross":0,"earnings":{"base":0,"overtime":0,"bonus":0,"commission":0,"shift_differential":0},"ytd_earnings":{"base":0,"overtime":0,"bonus":0,"commission":0},"net_pay":0,"hire_date":"","prior_employer_ytd_included":false,"prior_employer_amount":0,"prior_employer_name":"","flags":[]}
CRITICAL: earnings.base = Regular Pay CURRENT period only (NOT total gross). earnings.overtime = Overtime CURRENT period. earnings.shift_differential = Shift Differential CURRENT period. Check footnotes for prior employer YTD contamination. Flag OT spikes, hire date discrepancies, short tenure.`;

const W2_ONLY_PROMPT = `Extract W-2 tax document data. Return ONLY valid JSON, no markdown.
Schema: {"doc_type":"w2","tax_year":0,"employer_name":"","employee_name":"","employer_ein":"","box1_wages":0,"box2_fed_withheld":0,"box3_ss_wages":0,"box5_medicare_wages":0,"flags":[]}`;

const OTHER_PROMPTS = {
  SOCIAL_SECURITY: '{"doc_type":"ssa","monthly_benefit":0,"annual_benefit":0,"non_taxable":true,"recipient_name":"","effective_date":"","flags":[]}',
  PENSION: '{"doc_type":"pension","monthly_amount":0,"annual_amount":0,"taxable_portion":0,"nontaxable_portion":0,"non_taxable":false,"pension_name":"","source":"","flags":[]} CRITICAL: Check for IRS Simplified Method — pension may be PARTIALLY non-taxable. If so, extract taxable_portion and nontaxable_portion separately. non_taxable=true only if FULLY non-taxable. Flag partial non-taxable status. Flag if pension is from government/military (often non-taxable). CORRECT CALC: qualifying = taxable_portion + (nontaxable_portion × 1.25). Never gross-up the taxable portion.',
  MILITARY: '{"doc_type":"les","base_pay":0,"bah":0,"bas":0,"special_pay":0,"ets_date":"","branch":"","rank":"","service_member_name":"","flags":[]} CRITICAL: base_pay = monthly base pay (taxable). bah = Basic Allowance for Housing monthly (non-taxable, gross-up 25%). bas = Basic Allowance for Subsistence monthly (non-taxable, gross-up 25%). ets_date = Expiration Term of Service date. If ETS within 12 months: flag "CONTINUANCE RISK: ETS in X months — verify re-enlistment or continued service documentation required". Flag if ETS within 3 years (may not meet continuance requirement).',
  CHILD_SUPPORT: '{"doc_type":"court_order","monthly_amount":0,"months_remaining":0,"payor_name":"","recipient_name":"","termination_date":"","missed_payments":false,"flags":[]} CRITICAL: monthly_amount = the court-ordered monthly payment amount (NEVER leave as 0 if a dollar amount appears). months_remaining = count from today to termination date. Flag any missed payments in payment history. Flag if months_remaining < 36 (minimum for qualifying).',
};

// ─── Extract PDF via Haiku — with retry + exponential backoff ────────────────
// Prevents 429 rate limit errors on rapid sequential uploads
const _extractQueue = { running: false, queue: [] };

async function _drainQueue() {
  if (_extractQueue.running) return;
  _extractQueue.running = true;
  while (_extractQueue.queue.length > 0) {
    const { resolve, reject, task } = _extractQueue.queue.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    }
    // Minimum 1.2s gap between Haiku calls to stay under rate limit
    if (_extractQueue.queue.length > 0) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  _extractQueue.running = false;
}

function queueExtract(task) {
  return new Promise((resolve, reject) => {
    _extractQueue.queue.push({ resolve, reject, task });
    _drainQueue();
  });
}

async function _doExtract(file, prompt) {
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });

  const MAX_RETRIES = 3;
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 3s, 8s
      const wait = attempt === 1 ? 3000 : 8000;
      console.log(`[extractPDF] 429 retry ${attempt}/${MAX_RETRIES - 1} — waiting ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
    try {
      const resp = await fetch(API, {
        method: 'POST',
        headers: { ...HDRS(), 'anthropic-beta': 'pdfs-2024-09-25' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract income data from this document. Return ONLY valid JSON, no markdown. ' + prompt },
          ]}],
        }),
      });
      if (resp.status === 429) {
        lastErr = new Error('API 429');
        continue; // retry
      }
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const clean = text.replace(/```json|```/gi, '').trim();
      try { return JSON.parse(clean); } catch (_) {
        const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
        if (s !== -1 && e > s) return JSON.parse(clean.slice(s, e + 1));
        return { parse_error: true, raw_text: text };
      }
    } catch (err) {
      lastErr = err;
      if (!err.message.includes('429')) throw err; // non-429 errors fail immediately
    }
  }
  throw lastErr || new Error('Max retries exceeded');
}

async function extractPDF(file, prompt) {
  return queueExtract(() => _doExtract(file, prompt));
}

// ─── Build income sources from tax return extraction ─────────────────────────
function buildSourcesFromTaxReturn(extracted, yearSlot, existingSources) {
  const sources = [...existingSources];
  const isYr1 = yearSlot === 'prior';

  const findOrCreate = (method) => {
    const idx = sources.findIndex(s => s.method === method);
    if (idx >= 0) return idx;
    sources.push({ id: uid(), method, fields: {}, calculated: 0, yr1Data: null, yr2Data: null, manualDocs: [] });
    return sources.length - 1;
  };

  const updateFields = (idx, patch) => {
    sources[idx] = { ...sources[idx], fields: { ...sources[idx].fields, ...patch } };
    sources[idx].calculated = Math.max(0, CALCS[sources[idx].method](sources[idx].fields));
  };

  if (extracted.schedule_c_net && Math.abs(extracted.schedule_c_net) > 0) {
    const idx = findOrCreate('SELF_EMPLOYED');
    if (isYr1) {
      sources[idx].yr1Data = extracted;
      updateFields(idx, { yr1_net: String(extracted.schedule_c_net), depreciation: String(extracted.schedule_c_depreciation || 0), home_office: String(extracted.schedule_c_home_office || 0) });
    } else {
      sources[idx].yr2Data = extracted;
      updateFields(idx, { yr2_net: String(extracted.schedule_c_net), depreciation: String(extracted.schedule_c_depreciation || 0), home_office: String(extracted.schedule_c_home_office || 0) });
    }
  }

  if (extracted.schedule_e_net && Math.abs(extracted.schedule_e_net) > 0) {
    const idx = findOrCreate('RENTAL');
    if (isYr1) {
      sources[idx].yr1Data = extracted;
      updateFields(idx, { yr1_net: String(extracted.schedule_e_net), yr1_depr: String(extracted.schedule_e_depreciation || 0), gross_rents: String((extracted.schedule_e_gross_rents || 0) / 12) });
    } else {
      sources[idx].yr2Data = extracted;
      updateFields(idx, { yr2_net: String(extracted.schedule_e_net), yr2_depr: String(extracted.schedule_e_depreciation || 0) });
    }
  }

  if (extracted.schedule_d_net && Math.abs(extracted.schedule_d_net) > 0) {
    const idx = findOrCreate('CAPITAL_GAINS');
    if (isYr1) { sources[idx].yr1Data = extracted; updateFields(idx, { yr1_gains: String(extracted.schedule_d_net) }); }
    else { sources[idx].yr2Data = extracted; updateFields(idx, { yr2_gains: String(extracted.schedule_d_net) }); }
  }

  if (extracted.k1_ordinary && Math.abs(extracted.k1_ordinary) > 0) {
    const idx = findOrCreate('S_CORP');
    if (isYr1) { sources[idx].yr1Data = extracted; updateFields(idx, { yr1_k1: String(extracted.k1_ordinary), ownership_pct: String(extracted.k1_ownership_pct || 100) }); }
    else { sources[idx].yr2Data = extracted; updateFields(idx, { yr2_k1: String(extracted.k1_ordinary) }); }
  }

  // SS: monthly_benefit = Line 6a gross / 12 (NOT Line 6b taxable)
  // Only gross-up the non-taxable portion per Fannie B3-3.1-09 / FHA 4000.1
  if (extracted.social_security_monthly && extracted.social_security_monthly > 0) {
    const idx = findOrCreate('SOCIAL_SECURITY');
    sources[idx].yr1Data = extracted;
    const grossMonthly = extracted.social_security_monthly; // Line 6a / 12
    const taxableMonthly = (extracted.ss_taxable_portion || 0) / 12;
    const nonTaxableMonthly = Math.max(0, grossMonthly - taxableMonthly);
    updateFields(idx, {
      monthly_benefit: String(grossMonthly.toFixed(2)),
      non_taxable_monthly: String(nonTaxableMonthly.toFixed(2)),
      gross_up: nonTaxableMonthly > 0 ? 'yes' : 'no',
    });
  }

  // W2: guard against SS/pension amounts bleeding into W2 card
  // Haiku sometimes puts SS Line 6a or pension into w2_wages — detect and block
  if (extracted.w2_wages && extracted.w2_wages > 0) {
    const ssGrossAnnual = extracted.social_security_annual || (extracted.social_security_monthly * 12) || 0;
    const isSSBleed = ssGrossAnnual > 0 && Math.abs(extracted.w2_wages - ssGrossAnnual) < 200;
    const isPensionBleed = extracted.schedule_c_net > 0 && !extracted.w2_wages;
    if (!isSSBleed && !isPensionBleed) {
      const idx = findOrCreate('W2');
      sources[idx].yr1Data = extracted;
      updateFields(idx, { base_monthly: String((extracted.w2_wages / 12).toFixed(2)) });
    }
  }

  return sources;
}

// ─── YearPanel — side by side extraction display ──────────────────────────────
function YearPanel({ label, yearKey, data, loading, onUpload, onRemove }) {
  if (loading) return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span>⏳</span><span>Extracting…</span>
      </div>
    </div>
  );
  if (data && !data.parse_error) return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {data.tax_year && <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 10 }}>{data.tax_year}</span>}
          <button onClick={onRemove} style={{ fontSize: 11, color: 'var(--color-text-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
      </div>
      <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px', fontSize: 12 }}>
        {data.schedule_c_net > 0 && <Row l="Sch C net" v={fmt$(data.schedule_c_net)} />}
        {data.schedule_c_depreciation > 0 && <Row l="+ Depreciation" v={fmt$(data.schedule_c_depreciation)} />}
        {data.schedule_c_home_office > 0 && <Row l="+ Home office" v={fmt$(data.schedule_c_home_office)} />}
        {data.schedule_e_net !== 0 && data.schedule_e_net !== undefined && <Row l="Sch E net" v={fmt$(data.schedule_e_net)} />}
        {data.schedule_e_depreciation > 0 && <Row l="+ Sch E depr" v={fmt$(data.schedule_e_depreciation)} />}
        {data.social_security_monthly > 0 && <Row l="SS monthly" v={fmt$(data.social_security_monthly)} />}
        {data.schedule_d_net > 0 && <Row l="Capital gains" v={fmt$(data.schedule_d_net)} />}
        {(data.flags || []).slice(0, 3).map((fl, i) => <div key={i} style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>⚠️ {fl}</div>)}
      </div>
    </div>
  );
  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
      <label style={{ cursor: 'pointer', border: '0.5px dashed var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'var(--color-background-secondary)' }}>
        <span style={{ fontSize: 18 }}>📤</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Upload 1040 PDF</span>
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = ''; } }} />
      </label>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{l}</span>
      <span style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
    </div>
  );
}

// ─── TaxReturnUploader ────────────────────────────────────────────────────────
function TaxReturnUploader({ taxReturns, onUpload, onRemove }) {
  const prior = taxReturns.prior, current = taxReturns.current;
  const detectedTypes = [];
  [prior.extracted, current.extracted].forEach(ext => {
    if (!ext || ext.parse_error) return;
    if (ext.schedule_c_net && Math.abs(ext.schedule_c_net) > 0) detectedTypes.push('🏢 Schedule C');
    if (ext.schedule_e_net && Math.abs(ext.schedule_e_net) > 0) detectedTypes.push('🏠 Schedule E');
    if (ext.social_security_monthly > 0) detectedTypes.push('🛡️ SS income');
    if (ext.schedule_d_net > 0) detectedTypes.push('📈 Capital gains');
    if (ext.w2_wages > 0) {
      // Same SS-bleed guard as buildSourcesFromTaxReturn — don't badge W-2 if it's really SS
      const ssGross = ext.social_security_annual || (ext.social_security_monthly * 12) || 0;
      const isSSBleed = ssGross > 0 && Math.abs(ext.w2_wages - ssGross) < 200;
      if (!isSSBleed) detectedTypes.push('💼 W-2 wages');
    }
  });
  const uniqueTypes = [...new Set(detectedTypes)];
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: '#eef2ff' }}>
        <span style={{ fontSize: 20 }}>📄</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#3730a3' }}>Federal tax returns (1040)</div>
          <div style={{ fontSize: 11, color: '#6366f1' }}>Upload both years — AI auto-detects all income types from a single PDF</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: uniqueTypes.length > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
        <div style={{ borderRight: '0.5px solid var(--color-border-tertiary)' }}>
          <YearPanel label="Prior year" yearKey="prior" data={prior.extracted} loading={prior.extracting} onUpload={f => onUpload('prior', f)} onRemove={() => onRemove('prior')} />
        </div>
        <div>
          <YearPanel label="Current year" yearKey="current" data={current.extracted} loading={current.extracting} onUpload={f => onUpload('current', f)} onRemove={() => onRemove('current')} />
        </div>
      </div>
      {uniqueTypes.length > 0 && (
        <div style={{ padding: '10px 16px', background: '#eef2ff' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#3730a3', marginBottom: 6 }}>Auto-detected income types — cards created below</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {uniqueTypes.map((t, i) => (
              <span key={i} style={{ fontSize: 11, background: '#fff', border: '0.5px solid #c7d2fe', color: '#3730a3', padding: '3px 10px', borderRadius: 12 }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── W2Uploader ───────────────────────────────────────────────────────────────
function W2Uploader({ w2Docs, onUpload, onRemove, currentEmployerName, currentHireDate, onUpdateField }) {
  // Calculate months at current employer
  const monthsAtEmployer = (() => {
    if (!currentHireDate) return null;
    const hire = new Date(currentHireDate);
    const now = new Date();
    if (isNaN(hire.getTime())) return null;
    return Math.floor((now - hire) / (1000 * 60 * 60 * 24 * 30.44));
  })();
  const otEligible = monthsAtEmployer !== null && monthsAtEmployer >= 24;
  const otMonthsNeeded = monthsAtEmployer !== null ? Math.max(0, 24 - monthsAtEmployer) : null;

  // Check for employer mismatches in uploaded W-2s
  const mismatchedW2s = w2Docs.filter(d => {
    if (!d.extracted || d.extracted.parse_error || !currentEmployerName) return false;
    const w2emp = (d.extracted.employer_name || '').toLowerCase();
    const curremp = currentEmployerName.toLowerCase();
    return w2emp && curremp && !w2emp.includes(curremp.split(' ')[0]) && !curremp.includes(w2emp.split(' ')[0]);
  });

  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: '#f0fdf4' }}>
        <span style={{ fontSize: 20 }}>💼</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#166534' }}>W-2 / Employment income</div>
          <div style={{ fontSize: 11, color: '#16a34a' }}>Upload pay stubs for current rate · Upload W-2s for 2-year OT/bonus history</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Current employer name</label>
          <input type="text" value={currentEmployerName} onChange={e => onUpdateField('currentEmployerName', e.target.value)} placeholder="e.g. Piedmont Healthcare" style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Hire date at current employer</label>
          <input type="date" value={currentHireDate} onChange={e => onUpdateField('currentHireDate', e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxSizing: 'border-box' }} />
        </div>
      </div>
      {currentHireDate && (
        <div style={{ padding: '8px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: otEligible ? '#f0fdf4' : '#fffbeb', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>{otEligible ? '✅' : '⚠️'}</span>
          <div style={{ fontSize: 11 }}>
            {otEligible
              ? <span style={{ color: '#15803d', fontWeight: 500 }}>OT/bonus eligible — {monthsAtEmployer} months at current employer (24-month requirement met)</span>
              : <span style={{ color: '#92400e', fontWeight: 500 }}>OT/bonus excluded — {monthsAtEmployer} months at current employer · need {otMonthsNeeded} more months · eligible {new Date(new Date(currentHireDate).getTime() + 24*30.44*24*60*60*1000).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</span>
            }
          </div>
        </div>
      )}
      {mismatchedW2s.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: '#fef2f2' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#dc2626' }}>🚨 W-2 employer mismatch detected</div>
          {mismatchedW2s.map((d, i) => (
            <div key={i} style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
              {d.extracted.employer_name} ≠ {currentEmployerName} — W-2 OT history applies to prior employer, not current
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>OT from mismatched W-2s excluded from qualifying per FHA 4000.1 / Fannie B3-3.1</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: w2Docs.length > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
        <div style={{ padding: '10px 14px', borderRight: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Pay stubs (last 30 days)</div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, color: '#166534', background: '#fff', border: '0.5px solid #bbf7d0', borderRadius: 'var(--border-radius-md)', padding: '6px 10px' }}>
            <span>📤</span> Upload stub
            <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0], 'paystub'); e.target.value = ''; } }} />
          </label>
        </div>
        <div style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>W-2s (last 2 years — for OT/bonus avg)</div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, color: '#166534', background: '#fff', border: '0.5px solid #bbf7d0', borderRadius: 'var(--border-radius-md)', padding: '6px 10px' }}>
            <span>📤</span> Upload W-2
            <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0], 'w2'); e.target.value = ''; } }} />
          </label>
        </div>
      </div>
      {w2Docs.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 12 }}>
          {d.loading ? <span style={{ color: 'var(--color-text-secondary)' }}>⏳ Extracting…</span> : (
            <>
              <span style={{ color: '#16a34a' }}>✓</span>
              <span style={{ color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              {d.extracted && !d.extracted.parse_error && d.extracted.employer_name && <span style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', padding: '2px 7px', borderRadius: 10 }}>{d.extracted.employer_name}</span>}
              <button onClick={() => onRemove(i)} style={{ fontSize: 11, color: 'var(--color-text-danger)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── OtherIncomeSelector ──────────────────────────────────────────────────────
function OtherIncomeSelector({ onAdd }) {
  const types = [
    { method: 'SOCIAL_SECURITY', label: 'Social Security / SSI', icon: '🛡️' },
    { method: 'PENSION', label: 'Pension / retirement', icon: '💰' },
    { method: 'MILITARY', label: 'Military / BAH / BAS', icon: '🎖️' },
    { method: 'CHILD_SUPPORT', label: 'Child support / alimony', icon: '👨‍👧' },
  ];
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: '#fffbeb' }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#92400e' }}>Other income</div>
          <div style={{ fontSize: 11, color: '#b45309' }}>Award letters, LES, court orders — upload the document and we'll extract the qualifying amount</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {types.map((t, i) => (
          <button key={t.method} onClick={() => onAdd(t.method)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', borderRight: i % 2 === 0 ? '0.5px solid var(--color-border-tertiary)' : 'none', borderBottom: i < 2 ? '0.5px solid var(--color-border-tertiary)' : 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-primary)' }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── SourceCard — income type aware layout ────────────────────────────────────
function SourceCard({ source, onRemove, onUpdateField, onUploadOtherDoc }) {
  const meta = METHOD_META[source.method] || {};
  const calc = Math.max(0, CALCS[source.method] ? CALCS[source.method](source.fields) : 0);
  const f = source.fields;

  const renderMultiYear = () => {
    const y1 = source.yr1Data, y2 = source.yr2Data;
    let y1adj = 0, y2adj = 0, qualifying = 0, method = '', declining = false;

    if (source.method === 'SELF_EMPLOYED') {
      const add = (parseFloat(f.depreciation) || 0) + (parseFloat(f.depletion) || 0) + (parseFloat(f.home_office) || 0);
      const yr1 = parseFloat(f.yr1_net) || 0, yr2 = parseFloat(f.yr2_net) || 0;
      y1adj = yr1 + add; y2adj = yr2 + add;
      if (yr2 > 0 && y2adj < y1adj * 0.90) { declining = true; qualifying = y2adj / 12; method = 'Lower year (declining)'; }
      else if (yr1 > 0 && yr2 > 0) { qualifying = ((y1adj + y2adj) / 2) / 12; method = '2-year average'; }
      else { qualifying = (yr1 > 0 ? y1adj : y2adj) / 12; method = 'Single year'; }
    } else if (source.method === 'RENTAL') {
      const y1n = parseFloat(f.yr1_net) || 0, y1d = parseFloat(f.yr1_depr) || 0;
      const y2n = parseFloat(f.yr2_net) || 0, y2d = parseFloat(f.yr2_depr) || 0;
      y1adj = y1n + y1d; y2adj = y2n + y2d;
      if (y1adj !== 0 && y2adj !== 0) { qualifying = ((y1adj + y2adj) / 2) / 12; method = '2-year average'; }
      else { qualifying = (y1adj !== 0 ? y1adj : y2adj) / 12; method = 'Single year'; }
    } else {
      qualifying = calc;
      method = '2-year average';
    }

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ padding: '12px 14px', borderRight: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Prior year {y1 && y1.tax_year ? '— ' + y1.tax_year : ''}</div>
            {y1 && !y1.parse_error ? (
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px', fontSize: 12 }}>
                {source.method === 'SELF_EMPLOYED' && <>
                  <Row l="Net profit" v={fmt$(y1.schedule_c_net || 0)} />
                  {(y1.schedule_c_depreciation || 0) > 0 && <Row l="+ Depreciation" v={fmt$(y1.schedule_c_depreciation)} />}
                  {(y1.schedule_c_home_office || 0) > 0 && <Row l="+ Home office" v={fmt$(y1.schedule_c_home_office)} />}
                  <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: 4, paddingTop: 4 }}><Row l="Adjusted" v={fmt$(y1adj)} /></div>
                </>}
                {source.method === 'RENTAL' && <>
                  <Row l="Sch E net" v={fmt$(y1.schedule_e_net || 0)} />
                  {(y1.schedule_e_depreciation || 0) > 0 && <Row l="+ Depreciation" v={fmt$(y1.schedule_e_depreciation)} />}
                  <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: 4, paddingTop: 4 }}><Row l="Adjusted" v={fmt$(y1adj)} /></div>
                </>}
                {source.method === 'CAPITAL_GAINS' && <Row l="Capital gains" v={fmt$(y1.schedule_d_net || 0)} />}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Auto-populated from tax return upload</div>
            )}
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Current year {y2 && y2.tax_year ? '— ' + y2.tax_year : ''}</div>
            {y2 && !y2.parse_error ? (
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px', fontSize: 12 }}>
                {source.method === 'SELF_EMPLOYED' && <>
                  <Row l="Net profit" v={fmt$(y2.schedule_c_net || 0)} />
                  {(y2.schedule_c_depreciation || 0) > 0 && <Row l="+ Depreciation" v={fmt$(y2.schedule_c_depreciation)} />}
                  {(y2.schedule_c_home_office || 0) > 0 && <Row l="+ Home office" v={fmt$(y2.schedule_c_home_office)} />}
                  <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: 4, paddingTop: 4 }}><Row l="Adjusted" v={fmt$(y2adj)} /></div>
                </>}
                {source.method === 'RENTAL' && <>
                  <Row l="Sch E net" v={fmt$(y2.schedule_e_net || 0)} />
                  {(y2.schedule_e_depreciation || 0) > 0 && <Row l="+ Depreciation" v={fmt$(y2.schedule_e_depreciation)} />}
                  <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: 4, paddingTop: 4 }}><Row l="Adjusted" v={fmt$(y2adj)} /></div>
                </>}
                {source.method === 'CAPITAL_GAINS' && <Row l="Capital gains" v={fmt$(y2.schedule_d_net || 0)} />}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Auto-populated from tax return upload</div>
            )}
          </div>
        </div>
        {declining && (
          <div style={{ padding: '8px 14px', background: '#fffbeb', borderBottom: '0.5px solid #fde68a' }}>
            <div style={{ fontSize: 11, color: '#92400e' }}>
              ⚠️ <strong>Declining income</strong> — {fmt$(y2adj)} is {((y2adj / y1adj) * 100).toFixed(1)}% of prior year (threshold 90%) · lower year used per Fannie B3-3.4-02
            </div>
            <div style={{ fontSize: 11, color: '#92400e', fontFamily: 'var(--font-mono)', marginTop: 3, background: '#fef3c7', borderRadius: 4, padding: '3px 8px', display: 'inline-block' }}>
              {fmt$(y2adj)} ÷ 12 = {fmt$(qualifying)}/mo
            </div>
          </div>
        )}
        {!declining && qualifying > 0 && (
          <div style={{ padding: '8px 14px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {method}{y1adj > 0 && y2adj > 0 ? ': (' + fmt$(y1adj) + ' + ' + fmt$(y2adj) + ') ÷ 2 ÷ 12 = ' : ': '}<strong style={{ color: 'var(--color-text-primary)' }}>{fmt$(qualifying)}/mo</strong>
          </div>
        )}
        <ManualFieldsEditor source={source} onUpdateField={onUpdateField} />
      </div>
    );
  };

  const renderSinglePeriod = () => {
    const ext = source.yr1Data;
    return (
      <div>
        <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          {!ext && (
            <label style={{ cursor: 'pointer', border: '0.5px dashed var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>📤</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Upload award letter / LES / court order</span>
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) { onUploadOtherDoc(source.id, e.target.files[0]); e.target.value = ''; } }} />
            </label>
          )}
          {ext && !ext.parse_error && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              {source.method === 'SOCIAL_SECURITY' && <>
                <MetricTile label="Gross monthly" value={fmt$(ext.monthly_benefit || 0)} />
                <MetricTile label="Non-taxable" value="Confirmed" color="#16a34a" />
                <MetricTile label="Grossed up 1.25×" value={fmt$((ext.monthly_benefit || 0) * 1.25)} color="#3730a3" highlight />
              </>}
              {source.method === 'MILITARY' && <>
                <MetricTile label="Base pay" value={fmt$(ext.base_pay || 0)} />
                <MetricTile label="BAH (grossed up)" value={fmt$((ext.bah || 0) * 1.25)} color="#3730a3" />
                <MetricTile label="BAS (grossed up)" value={fmt$((ext.bas || 0) * 1.25)} color="#3730a3" />
              </>}
              {source.method === 'PENSION' && <>
                <MetricTile label="Gross monthly" value={fmt$(ext.monthly_amount || 0)} />
                {ext.nontaxable_portion > 0 && ext.taxable_portion > 0
                  ? <MetricTile label="Non-taxable portion" value={fmt$(ext.nontaxable_portion)} color="#16a34a" />
                  : <MetricTile label="Non-taxable" value={ext.non_taxable ? 'Yes' : 'No'} color={ext.non_taxable ? '#16a34a' : 'var(--color-text-secondary)'} />
                }
                {ext.nontaxable_portion > 0 && ext.taxable_portion > 0
                  ? <MetricTile label="Qualifying (IRS Simplified)" value={fmt$(ext.taxable_portion + ext.nontaxable_portion * 1.25)} color="#3730a3" highlight />
                  : ext.non_taxable
                  ? <MetricTile label="Grossed up 1.25×" value={fmt$((ext.monthly_amount || 0) * 1.25)} color="#3730a3" highlight />
                  : <MetricTile label="Qualifying" value={fmt$(ext.monthly_amount || 0)} />
                }
              </>}
              {source.method === 'CHILD_SUPPORT' && <>
                <MetricTile label="Court-ordered monthly" value={fmt$(ext.monthly_amount || parseFloat(source.fields.monthly_amount) || 0)} />
                <MetricTile label="Months remaining" value={(ext.months_remaining || parseFloat(source.fields.months_remaining) || 0) + ' mo'} color={(ext.months_remaining || parseFloat(source.fields.months_remaining) || 0) >= 36 ? '#16a34a' : '#dc2626'} />
                <MetricTile label="Qualifying" value={(ext.months_remaining || parseFloat(source.fields.months_remaining) || 0) >= 36 ? fmt$(ext.monthly_amount || 0) : '$0.00 — excluded'} color={(ext.months_remaining || parseFloat(source.fields.months_remaining) || 0) >= 36 ? '#3730a3' : '#dc2626'} highlight />
              </>}
            </div>
          )}
          <ManualFieldsEditor source={source} onUpdateField={onUpdateField} compact={!!ext} />
        </div>
        {ext && !ext.parse_error && (
          <div style={{ padding: '8px 14px', background: 'var(--color-background-secondary)', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {source.method === 'SOCIAL_SECURITY' && (() => {
              const grossMo = parseFloat(source.fields.monthly_benefit) || 0;
              const nonTaxMo = parseFloat(source.fields.non_taxable_monthly) || 0;
              const taxMo = Math.max(0, grossMo - nonTaxMo);
              return <>{source.fields.gross_up === 'yes' && nonTaxMo > 0
                ? `$${taxMo.toFixed(2)} taxable + $${nonTaxMo.toFixed(2)} non-taxable × 1.25`
                : `$${grossMo.toFixed(2)}/mo`} = <strong style={{ color: 'var(--color-text-primary)' }}>{fmt$(calc)}/mo</strong> — Fannie B3-3.1-09</>;
            })()}
            {source.method === 'MILITARY' && <>Base pay + BAH × 1.25 + BAS × 1.25 = <strong style={{ color: 'var(--color-text-primary)' }}>{fmt$(calc)}/mo</strong></>}
            {source.method === 'PENSION' && <><strong style={{ color: 'var(--color-text-primary)' }}>{fmt$(calc)}/mo</strong> {source.fields.taxable === 'no' ? '(non-taxable gross-up applied)' : '(taxable — no gross-up)'}</>}
            {source.method === 'CHILD_SUPPORT' && <><strong style={{ color: (parseFloat(source.fields.months_remaining) || 0) >= 36 ? 'var(--color-text-primary)' : '#dc2626' }}>{fmt$(calc)}/mo</strong> — {(parseFloat(source.fields.months_remaining) || 0) >= 36 ? 'qualifies (36+ months remaining)' : 'excluded (< 36 months)'}</>}
          </div>
        )}
      </div>
    );
  };

  const renderW2 = () => {
    const docs = source.manualDocs || [];
    const latestExt = docs.length > 0 ? docs[docs.length - 1].extracted : null;
    return (
      <div>
        <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          {docs.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 'var(--border-radius-md)', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: '#16a34a' }}>✓</span>
              <span style={{ color: '#15803d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              {d.extracted?.employer_name && <span style={{ fontSize: 10, color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: 8 }}>{d.extracted.employer_name}</span>}
            </div>
          ))}
          {latestExt && !latestExt.parse_error && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, marginBottom: 8 }}>
                {latestExt.hourly_rate > 0 && <MetricTile label="Hourly rate" value={'$'+latestExt.hourly_rate.toFixed(2)+'/hr'} />}
                {latestExt.hours_regular > 0 && <MetricTile label="Regular hours/period" value={latestExt.hours_regular+' hrs'} />}
                {latestExt.current_gross > 0 && <MetricTile label="Current gross/period" value={fmt$(latestExt.current_gross)} />}
              {latestExt.current_base > 0 && <MetricTile label="Regular Pay (base)" value={fmt$(latestExt.current_base)} color="#16a34a" highlight />}
              {latestExt.hourly_rate > 0 && <MetricTile label="Hourly rate" value={'$'+latestExt.hourly_rate.toFixed(2)+'/hr'} />}
              {latestExt.current_overtime > 0 && <MetricTile label="OT this period" value={fmt$(latestExt.current_overtime)} />}
                {latestExt.current_overtime > 0 && <MetricTile label="OT this period" value={fmt$(latestExt.current_overtime)} />}
                {latestExt.ytd_overtime > 0 && <MetricTile label="OT YTD" value={fmt$(latestExt.ytd_overtime)} />}
                {latestExt.clean_ytd > 0 && <MetricTile label="Clean YTD (ex prior emp)" value={fmt$(latestExt.clean_ytd)} color="#16a34a" />}
              </div>
              {latestExt.prior_employer_contamination && (
                <div style={{ background: '#fef2f2', border: '0.5px solid #fecaca', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#dc2626' }}>🚨 YTD contamination: {fmt$(latestExt.prior_employer_amount)} from {latestExt.prior_employer_name} included in YTD — excluded from qualifying</div>
                </div>
              )}
              {latestExt.hire_date && (
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Current employer hire date: <strong style={{ color: 'var(--color-text-primary)' }}>{latestExt.hire_date}</strong>
                  {latestExt.hire_date > '2025-01-01' && <span style={{ color: '#d97706', marginLeft: 8 }}>⚠️ Less than 2 years at current employer — verify continuance</span>}
                </div>
              )}
              {!parseFloat(source.fields.base_monthly) && latestExt.current_gross > 0 && (
                <div style={{background:'#fef9c3',border:'0.5px solid #fde047',borderRadius:'var(--border-radius-md)',padding:'8px 10px',marginTop:6}}>
                  <div style={{fontSize:11,fontWeight:500,color:'#854d0e'}}>📝 Base pay needs manual entry</div>
                  <div style={{fontSize:11,color:'#92400e',marginTop:2}}>Gross/period: {fmt$(latestExt.current_gross)} — enter base pay only below (exclude OT, shift diff, holiday). Expected: {fmt$((latestExt.current_gross-(latestExt.current_overtime||0)-(latestExt.current_shift_diff||0))*({biweekly:26,weekly:52,semimonthly:24,monthly:12}[latestExt.pay_frequency]||26)/12)}/mo</div>
                </div>
              )}
              {(latestExt.flags || []).map((fl, fi) => (
                <div key={fi} style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>⚠️ {fl}</div>
              ))}
            </div>
          )}
        </div>
        <ManualFieldsEditor source={source} onUpdateField={onUpdateField} />
        <div style={{ padding: '8px 14px', background: 'var(--color-background-secondary)', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          {docs.length > 0 && docs[0].extracted?.hourly_rate > 0
            ? `$${docs[0].extracted.hourly_rate}/hr × ${docs[0].extracted.hours_regular}hrs × ${({weekly:52,biweekly:26,semimonthly:24,monthly:12}[docs[0].extracted.pay_frequency]||26)} periods ÷ 12 = `
            : docs.length > 0 && docs[0].extracted?.current_base > 0
            ? `$${fmt$(docs[0].extracted.current_base)}/period × ${({weekly:52,biweekly:26,semimonthly:24,monthly:12}[docs[0].extracted.pay_frequency]||26)} ÷ 12 = `
            : 'Base '}
          <strong style={{ color: '#3730a3' }}>{fmt$(parseFloat(f.base_monthly) || 0)}/mo base</strong>
          {parseFloat(f.overtime_monthly) > 0 && <span> + OT {fmt$(parseFloat(f.overtime_monthly))}</span>}
          {parseFloat(f.bonus_monthly) > 0 && <span> + Bonus {fmt$(parseFloat(f.bonus_monthly))}</span>}
          {' = '}<strong style={{ color: 'var(--color-text-primary)' }}>{fmt$(calc)}/mo</strong>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{meta.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>qualifying monthly</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#3730a3', fontFamily: 'var(--font-mono)' }}>{fmt$(calc)}</div>
          </div>
          <button onClick={onRemove} style={{ color: 'var(--color-text-tertiary)', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
      </div>
      {meta.multiYear && renderMultiYear()}
      {!meta.multiYear && source.method === 'W2' && renderW2()}
      {!meta.multiYear && source.method !== 'W2' && renderSinglePeriod()}
    </div>
  );
}

function MetricTile({ label, value, color, highlight }) {
  return (
    <div style={{ background: highlight ? '#eef2ff' : 'var(--color-background-secondary)', border: highlight ? '0.5px solid #c7d2fe' : 'none', borderRadius: 'var(--border-radius-md)', padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: highlight ? '#6366f1' : 'var(--color-text-secondary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: color || 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}

const FIELD_DEFS = {
  SELF_EMPLOYED: [['yr1_net', 'Year 1 net profit ($)'], ['yr2_net', 'Year 2 net profit ($)'], ['depreciation', 'Depreciation addback ($)'], ['depletion', 'Depletion addback ($)'], ['home_office', 'Home office addback ($)']],
  RENTAL: [['yr1_net', 'Year 1 Sch E net ($)'], ['yr1_depr', 'Year 1 depreciation ($)'], ['yr2_net', 'Year 2 Sch E net ($)'], ['yr2_depr', 'Year 2 depreciation ($)'], ['gross_rents', 'Gross monthly rents ($)'], ['vacancy_pct', 'Vacancy factor (%)']],
  W2: [['base_monthly', 'Base monthly ($)'], ['overtime_monthly', 'OT monthly (2yr avg, $)'], ['bonus_monthly', 'Bonus monthly (2yr avg, $)'], ['commission_monthly', 'Commission monthly ($)']],
  SOCIAL_SECURITY: [['monthly_benefit', 'Gross monthly benefit ($)'], ['non_taxable_monthly', 'Non-taxable portion ($/mo)'], ['gross_up', 'Gross-up non-taxable?']],
  PENSION: [['monthly_amount', 'Monthly amount ($)'], ['taxable', 'Is taxable?'], ['taxable_portion', 'Taxable portion ($/mo)'], ['nontaxable_portion', 'Non-taxable portion ($/mo)']],
  MILITARY: [['base_pay', 'Base pay ($/mo)'], ['bah', 'BAH ($/mo)'], ['bas', 'BAS ($/mo)'], ['other', 'Other allotments ($/mo)']],
  CHILD_SUPPORT: [['monthly_amount', 'Monthly amount ($)'], ['months_remaining', 'Months remaining']],
  CAPITAL_GAINS: [['yr1_gains', 'Year 1 gains ($)'], ['yr2_gains', 'Year 2 gains ($)']],
  S_CORP: [['yr1_k1', 'K-1 Year 1 ($)'], ['yr2_k1', 'K-1 Year 2 ($)'], ['ownership_pct', 'Ownership %'], ['w2_from_biz', 'W-2 from business ($)'], ['depr_addback', 'Depreciation addback ($)']],
  CONTRACTOR_1099: [['yr1_income', 'Year 1 gross ($)'], ['yr1_expenses', 'Year 1 expenses ($)'], ['yr2_income', 'Year 2 gross ($)'], ['yr2_expenses', 'Year 2 expenses ($)']],
};
const SELECT_FIELDS = new Set(['gross_up', 'taxable']);

function ManualFieldsEditor({ source, onUpdateField, compact }) {
  const defs = FIELD_DEFS[source.method] || [];
  const [open, setOpen] = useState(!compact);
  if (!defs.length) return null;
  return (
    <div style={{ padding: '8px 14px 12px', borderTop: compact ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
      <button onClick={() => setOpen(v => !v)} style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? 10 : 0 }}>
        {open ? '▲ Hide manual fields' : '▼ Edit fields manually'}
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {defs.map(([key, label]) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</label>
              {SELECT_FIELDS.has(key) ? (
                <select value={source.fields[key] || 'no'} onChange={e => onUpdateField(source.id, key, e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                  <option value="yes">Yes</option><option value="no">No</option>
                </select>
              ) : (
                <input type="number" value={source.fields[key] || ''} onChange={e => onUpdateField(source.id, key, e.target.value)} placeholder="0"
                  style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxSizing: 'border-box' }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Income Summary Bar ───────────────────────────────────────────────────────
function IncomeSummary({ sources, groupName }) {
  const total = sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0);
  if (sources.length === 0) return null;
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{groupName} — qualifying income summary</div>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {sources.map(src => {
          const m = METHOD_META[src.method] || {};
          const amt = Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0);
          return (
            <div key={src.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{m.icon} {m.label}</span>
              <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{fmt$(amt)}/mo</span>
            </div>
          );
        })}
        {sources.length > 1 && (
          <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: 4, paddingTop: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
              {sources.map(src => fmt$(Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0))).join(' + ')}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#eef2ff', border: '0.5px solid #c7d2fe', borderRadius: 'var(--border-radius-md)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#3730a3' }}>Total qualifying income</div>
            <div style={{ fontSize: 11, color: '#6366f1' }}>{groupName}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#3730a3', fontFamily: 'var(--font-mono)' }}>{fmt$(total)}<span style={{ fontSize: 12, fontWeight: 400 }}>/mo</span></div>
            <div style={{ fontSize: 11, color: '#6366f1', fontFamily: 'var(--font-mono)' }}>{fmt$(total * 12)}/yr</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Income Worksheet ─────────────────────────────────────────────────────────
function IncomeWorksheet({ borrowerGroups, scenario, notes, totalQualifying, verification }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bName = scenario ? [scenario.firstName, scenario.lastName].filter(Boolean).join(' ') || scenario.scenarioName || '' : '';
  return (
    <div>
      <button onClick={() => window.print()} className="mb-5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700">Print / Save as PDF</button>
      <div style={{ background: '#fff', color: '#0f172a', padding: '32px 36px', fontFamily: "'Georgia',serif", maxWidth: 900, border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <div style={{ borderBottom: '2.5px solid #1e3a5f', paddingBottom: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f' }}>LoanBeacons</div><div style={{ fontSize: 11, color: '#64748b' }}>Powered by AI · Patent Pending</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>INCOME ANALYSIS WORKSHEET</div><div style={{ fontSize: 11, color: '#64748b' }}>Prepared: {today}</div></div>
        </div>
        {scenario && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 22, fontSize: 12, border: '0.5px solid #e2e8f0' }}>
            <tbody>
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#475569', width: '16%', borderRight: '0.5px solid #e2e8f0' }}>Borrower</td>
                <td style={{ padding: '6px 10px', width: '34%', borderRight: '0.5px solid #e2e8f0' }}>{bName || '—'}</td>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#475569', width: '16%', borderRight: '0.5px solid #e2e8f0' }}>Loan amount</td>
                <td style={{ padding: '6px 10px' }}>{scenario.loanAmount ? fmt$(parseFloat(scenario.loanAmount)) : '—'}</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#475569', borderRight: '0.5px solid #e2e8f0' }}>Property</td>
                <td style={{ padding: '6px 10px', borderRight: '0.5px solid #e2e8f0' }}>{scenario.propertyAddress || scenario.address || '—'}</td>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#475569', borderRight: '0.5px solid #e2e8f0' }}>Loan type</td>
                <td style={{ padding: '6px 10px' }}>{scenario.loanType || '—'}</td>
              </tr>
            </tbody>
          </table>
        )}
        {borrowerGroups.map(group => {
          const gt = group.sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0);
          return (
            <div key={group.id} style={{ marginBottom: 28 }}>
              <div style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px', borderRadius: '4px 4px 0 0', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                <span>{group.name || (group.role === 'primary' ? 'Primary Borrower' : 'Co-Borrower')}</span>
                <span>Total: {fmt$(gt)}/mo · {fmt$(gt * 12)}/yr</span>
              </div>
              {group.sources.map(src => {
                const m = METHOD_META[src.method] || {};
                const amt = Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0);
                const y1 = src.yr1Data, y2 = src.yr2Data;
                return (
                  <div key={src.id} style={{ border: '0.5px solid #e2e8f0', borderTop: 'none' }}>
                    <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.icon} {m.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', fontFamily: 'monospace' }}>{fmt$(amt)}/mo · {fmt$(amt * 12)}/yr</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <tbody>
                        {y1 && !y1.parse_error && y2 && !y2.parse_error && (
                          <tr><td style={{ padding: '6px 12px', fontWeight: 600, color: '#64748b', width: '18%', borderBottom: '0.5px solid #f1f5f9', borderRight: '0.5px solid #f1f5f9' }}>Two-year</td>
                          <td style={{ padding: '6px 12px', borderBottom: '0.5px solid #f1f5f9', fontFamily: 'monospace', fontSize: 11 }}>
                            {y1.tax_year}: {fmt$(y1.schedule_c_net || y1.schedule_e_net || 0)} adj · {y2.tax_year}: {fmt$(y2.schedule_c_net || y2.schedule_e_net || 0)} adj
                          </td></tr>
                        )}
                        <tr style={{ background: '#f8fafc' }}><td style={{ padding: '6px 12px', fontWeight: 600, color: '#64748b', borderBottom: '0.5px solid #f1f5f9', borderRight: '0.5px solid #f1f5f9' }}>Guideline</td>
                        <td style={{ padding: '6px 12px', fontSize: 11, fontStyle: 'italic', color: '#64748b', borderBottom: '0.5px solid #f1f5f9' }}>
                          {src.method === 'SELF_EMPLOYED' ? 'FHA 4000.1 / Fannie B3-3.4-02 — 2-year avg; declining >10% = lower year' : src.method === 'RENTAL' ? '2-year avg Schedule E + depreciation addback' : src.method === 'SOCIAL_SECURITY' ? 'Non-taxable SS grossed up 25% per FHA 4000.1 / Fannie B3-3.1-09' : ''}
                        </td></tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '0.5px solid #1e3a5f', borderTop: 'none' }}>
                <tbody><tr style={{ background: '#dbeafe' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1e3a5f', fontSize: 12 }}>{group.name} — subtotal</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f', fontSize: 14, fontFamily: 'monospace' }}>{fmt$(gt)}/mo</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#1e3a5f', fontSize: 12, fontFamily: 'monospace' }}>{fmt$(gt * 12)}/yr</td>
                </tr></tbody>
              </table>
            </div>
          );
        })}
        <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 8, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.75 }}>Total qualifying income</div><div style={{ fontSize: 11, opacity: 0.5 }}>All borrowers</div></div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace' }}>{fmt$(totalQualifying)}<span style={{ fontSize: 14, opacity: 0.6 }}>/mo</span></div>
            <div style={{ fontSize: 13, opacity: 0.65, fontFamily: 'monospace' }}>{fmt$(totalQualifying * 12)}/yr</div>
          </div>
        </div>
        {verification && (
          <div style={{ marginTop: 16, border: '1px solid', borderColor: verification.agree ? '#16a34a' : '#dc2626', borderRadius: 8, padding: '12px 16px', background: verification.agree ? '#f0fdf4' : '#fef2f2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{verification.agree ? '✅' : '⚠️'}</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: verification.agree ? '#15803d' : '#b91c1c' }}>
                {verification.agree ? 'Calculation Verified — AI confirmed ' + fmt$(totalQualifying) + '/mo' : 'Discrepancy Detected — LO Review Required'}
              </div>
            </div>
          </div>
        )}
        {notes && <div style={{ marginTop: 20, border: '0.5px solid #e2e8f0', borderRadius: 6, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>LO Notes</div><div style={{ fontSize: 12, color: '#374151', lineHeight: 1.7 }}>{notes}</div></div>}
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 20, fontStyle: 'italic', lineHeight: 1.6 }}>I certify that the income analysis above accurately reflects the income documentation reviewed in this file and complies with applicable agency guidelines.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {['Loan Officer Signature', 'Date Prepared', 'LO Name (Print) / NMLS #', 'Company / Branch / NMLS'].map(l => (
              <div key={l}><div style={{ borderTop: '1px solid #0f172a', paddingTop: 5, fontSize: 11, color: '#475569' }}>{l}</div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IncomeAnalyzer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioId = searchParams.get('scenarioId');
  const lsKey = scenarioId ? `lb_income_v4_${scenarioId}` : null;

  const [scenario, setScenario] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [notes, setNotes] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [verification, setVerification] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);

  const [borrowerGroups, setBorrowerGroups] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [firestoreSaving, setFirestoreSaving] = useState(false);
  const initialLoadDone = useRef(false);

  const { reportFindings } = useDecisionRecord(scenarioId);

  const makeGroup = useCallback((role, name) => ({
    id: uid(), role, name,
    currentEmployerName: '',
    currentHireDate: '',
    taxReturns: {
      prior: { extracted: null, extracting: false, fileName: null, error: null },
      current: { extracted: null, extracting: false, fileName: null, error: null },
    },
    w2Docs: [],
    sources: [],
  }), []);

  const saveToStorage = useCallback(() => {
    if (!lsKey) return;
    const saveable = borrowerGroups.map(g => ({
      ...g,
      taxReturns: {
        prior: { ...g.taxReturns.prior, extracting: false },
        current: { ...g.taxReturns.current, extracting: false },
      },
      w2Docs: g.w2Docs.map(d => ({ ...d, loading: false })),
    }));
    localStorage.setItem(lsKey, JSON.stringify({ borrowerGroups: saveable, notes, aiAnalysis, savedRecordId, verification }));
  }, [lsKey, borrowerGroups, notes, aiAnalysis, savedRecordId, verification]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  // Mark dirty when income data changes (skip on initial load)
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setHasUnsavedChanges(true);
  }, [borrowerGroups, notes]);

  // Warn before browser close / tab close if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ─── Debounced Firestore autosave (3s after last change) ─────────────────
  // Writes income snapshot to scenario doc so it survives across devices/browsers
  useEffect(() => {
    if (!scenarioId || !initialLoadDone.current || !hasUnsavedChanges) return;
    const totalQual = borrowerGroups.reduce(
      (s, g) => s + g.sources.reduce((s2, src) => s2 + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0), 0
    );
    if (totalQual === 0) return; // don't autosave empty state
    const timer = setTimeout(async () => {
      try {
        const snapshot = {
          totalQualifyingMonthly: totalQual,
          totalQualifyingAnnual: totalQual * 12,
          borrowers: borrowerGroups.map(g => ({
            name: g.name, role: g.role,
            monthlyIncome: g.sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0),
            sources: g.sources.map(s => ({
              method: s.method,
              label: METHOD_META[s.method]?.label || s.method,
              monthly: Math.max(0, CALCS[s.method] ? CALCS[s.method](s.fields) : 0),
              fields: s.fields,
            })),
          })),
          loNotes: notes,
          savedAt: new Date().toISOString(),
          moduleVersion: '4.2',
        };
        await updateDoc(doc(db, 'scenarios', scenarioId), {
          income: snapshot,
          incomeUpdatedAt: serverTimestamp(),
        });
        console.log('[M02] Autosaved income to Firestore');
      } catch (e) { console.warn('[M02] Autosave failed:', e.message); }
    }, 3000);
    return () => clearTimeout(timer);
  }, [borrowerGroups, notes, scenarioId, hasUnsavedChanges]);

  useEffect(() => {
    if (!scenarioId) {
      getDocs(collection(db, 'scenarios')).then(snap => setScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(console.error).finally(() => setLoading(false));
      return;
    }
    if (lsKey) {
      try {
        const saved = localStorage.getItem(lsKey);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.borrowerGroups) setBorrowerGroups(s.borrowerGroups);
          if (s.notes) setNotes(s.notes);
          if (s.aiAnalysis) setAiAnalysis(s.aiAnalysis);
          if (s.savedRecordId) setSavedRecordId(s.savedRecordId);
          if (s.verification) setVerification(s.verification);
        }
      } catch (_) {}
    }
    getDoc(doc(db, 'scenarios', scenarioId)).then(snap => {
      if (!snap.exists()) return;
      const d = { id: snap.id, ...snap.data() };
      setScenario(d);
      const saved = lsKey ? localStorage.getItem(lsKey) : null;
      const hasLocalData = saved && JSON.parse(saved).borrowerGroups?.length > 0;

      if (!hasLocalData) {
        // ── Priority 1: Reconstruct from scenario.income (Firestore) ──────────
        // This is the source of truth — works across devices, browsers, localhost vs prod
        if (d.income?.borrowers?.length > 0) {
          const reconstructed = d.income.borrowers.map(b => ({
            ...makeGroup(b.role || 'primary', b.name || 'Primary Borrower'),
            sources: (b.sources || []).map(s => ({
              id: uid(),
              method: s.method,
              fields: s.fields || {},
              calculated: s.monthly || 0,
              yr1Data: null,
              yr2Data: null,
              manualDocs: [],
            })),
          }));
          setBorrowerGroups(reconstructed);
          // Also restore notes/savedRecordId from income snapshot
          if (d.income.loNotes) setNotes(d.income.loNotes);
          if (d.income.savedAt) setSavedRecordId('restored'); // prevents re-prompt
          console.log('[M02] Restored income from Firestore scenario.income');
        } else {
          // ── Priority 2: Fresh empty groups from scenario fields ────────────
          const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || d.scenarioName || 'Primary Borrower';
          const groups = [makeGroup('primary', name)];
          if (d.coBorrowerFirstName || d.coFirstName) {
            const cbName = [d.coBorrowerFirstName || d.coFirstName, d.coBorrowerLastName || d.coLastName].filter(Boolean).join(' ') || 'Co-Borrower';
            groups.push(makeGroup('co-borrower', cbName));
          }
          setBorrowerGroups(groups);
        }
      }
      // Mark load complete — dirty tracking starts AFTER this
      setTimeout(() => { initialLoadDone.current = true; }, 100);
    }).catch(console.error).finally(() => setLoading(false));
  }, [scenarioId, lsKey, makeGroup]);

  const handleTaxReturnUpload = async (groupId, yearSlot, file) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, taxReturns: { ...g.taxReturns, [yearSlot]: { ...g.taxReturns[yearSlot], extracting: true, error: null, fileName: file.name } }
    }));
    try {
      const extracted = await extractPDF(file, TAX_RETURN_PROMPT);
      setBorrowerGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        const newSources = buildSourcesFromTaxReturn(extracted, yearSlot, g.sources);
        return {
          ...g,
          taxReturns: { ...g.taxReturns, [yearSlot]: { extracted, extracting: false, fileName: file.name, error: null } },
          sources: newSources,
        };
      }));
    } catch (err) {
      setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
        ...g, taxReturns: { ...g.taxReturns, [yearSlot]: { ...g.taxReturns[yearSlot], extracting: false, error: err.message } }
      }));
    }
  };

  const handleTaxReturnRemove = (groupId, yearSlot) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g,
      taxReturns: { ...g.taxReturns, [yearSlot]: { extracted: null, extracting: false, fileName: null, error: null } },
      sources: g.sources.map(s => yearSlot === 'prior' ? { ...s, yr1Data: null, fields: { ...s.fields, yr1_net: '', yr1_depr: '' } } : { ...s, yr2Data: null, fields: { ...s.fields, yr2_net: '', yr2_depr: '' } }).map(s => ({ ...s, calculated: Math.max(0, CALCS[s.method] ? CALCS[s.method](s.fields) : 0) })),
    }));
  };

  const handleW2Upload = async (groupId, file, subType) => {
    const tempId = uid();
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, w2Docs: [...g.w2Docs, { id: tempId, name: file.name, loading: true, extracted: null }]
    }));
    try {
      const prompt = subType === 'w2' ? W2_ONLY_PROMPT : W2_PROMPT;
      const extracted = await extractPDF(file, prompt);
      setBorrowerGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        const w2Docs = g.w2Docs.map(d => d.id !== tempId ? d : { ...d, loading: false, extracted });
        let sources = [...g.sources];
        const idx = sources.findIndex(s => s.method === 'W2');
        if (idx < 0) {
          sources.push({ id: uid(), method: 'W2', fields: {}, calculated: 0, yr1Data: extracted, yr2Data: null, manualDocs: [{ name: file.name, extracted }] });
        } else {
          sources[idx] = { ...sources[idx], yr1Data: extracted, manualDocs: [...(sources[idx].manualDocs || []), { name: file.name, extracted }] };
        }
        if (extracted && !extracted.parse_error) {
          const i2 = sources.findIndex(s => s.method === 'W2');
          const f = { ...sources[i2].fields };
          const periods = {weekly:52,biweekly:26,semimonthly:24,monthly:12}[extracted.pay_frequency]||26;
          // ── v48 proven logic: earnings.base = Regular Pay current period ──
          // This is what worked. earnings is a nested object — Haiku extracts it reliably.
          if (extracted.doc_type === 'pay_stub') {
            // base_monthly = earnings.base (Regular Pay current period) x pay periods / 12
            if (extracted.earnings?.base && !parseFloat(f.base_monthly))
              f.base_monthly = String(((extracted.earnings.base * periods) / 12).toFixed(2));
            // OT and bonus: NOT auto-populated from pay stubs
            // FHA 4000.1 / Fannie B3-3.1: variable income requires 2-year W-2 history
            // Upload W-2s in the W-2 slot above to qualify OT/bonus
          }
          // W-2 upload: Box 1 wages for base verification + OT/bonus if eligible
          if (extracted.doc_type === 'w2' && (extracted.box1_wages || extracted.total_box1_wages)) {
            const wages = extracted.total_box1_wages || extracted.box1_wages;
            // NOTE: W-2 does NOT set base_monthly.
            // Base pay comes from pay stubs only (earnings.base × periods).
            // W-2s establish OT/bonus 2-year history only.
            // OT/bonus from W-2: only if 24+ months at current employer AND W-2 is from current employer
            const hireDate = g.currentHireDate;
            const empName = (g.currentEmployerName || '').toLowerCase();
            const w2emp = (extracted.employer_name || '').toLowerCase();
            // For multi-employer W-2s, check if ANY employer matches
            const allEmps = extracted.all_employers ? extracted.all_employers.map(e=>(e.employer_name||'').toLowerCase()) : [w2emp];
            const empMatch = !empName || !w2emp || allEmps.some(e => e.includes(empName.split(' ')[0]) || empName.split(' ')[0] && e && empName.includes(e.split(' ')[0]));
            const monthsAtEmp = hireDate ? Math.floor((new Date() - new Date(hireDate)) / (1000*60*60*24*30.44)) : 0;
            if (empMatch && monthsAtEmp >= 24) {
              const expectedBase = (parseFloat(f.base_monthly) || 0) * 12;
              const excess = extracted.box1_wages - expectedBase;
              if (excess > 500 && !parseFloat(f.bonus_monthly))
                f.bonus_monthly = String((excess / 12).toFixed(2));
            }
          }
          const calcResult = Math.max(0, CALCS.W2(f));
          console.log('[W2 v48] earnings.base:', extracted.earnings?.base, 'periods:', periods, '→ base_monthly:', f.base_monthly, 'calc:', calcResult);
          sources[i2] = { ...sources[i2], fields: f, calculated: calcResult };
        }
        return { ...g, w2Docs, sources };
      }));
    } catch (err) {
      setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
        ...g, w2Docs: g.w2Docs.map(d => d.id !== tempId ? d : { ...d, loading: false, error: err.message })
      }));
    }
  };

  const handleW2Remove = (groupId, docIndex) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, w2Docs: g.w2Docs.filter((_, i) => i !== docIndex)
    }));
  };

  const handleUpdateGroupField = (groupId, field, value) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : { ...g, [field]: value }));
  };

  const handleAddOtherIncome = (groupId, method) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, sources: [...g.sources, { id: uid(), method, fields: {}, calculated: 0, yr1Data: null, yr2Data: null, manualDocs: [] }]
    }));
  };

  const handleRemoveSource = (groupId, sourceId) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, sources: g.sources.filter(s => s.id !== sourceId)
    }));
  };

  const handleUpdateField = (groupId, sourceId, key, value) => {
    setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, sources: g.sources.map(s => {
        if (s.id !== sourceId) return s;
        const f = { ...s.fields, [key]: value };
        return { ...s, fields: f, calculated: Math.max(0, CALCS[s.method] ? CALCS[s.method](f) : 0) };
      })
    }));
  };

  const handleUploadOtherDoc = async (groupId, sourceId, file) => {
    const src = borrowerGroups.find(g => g.id === groupId)?.sources.find(s => s.id === sourceId);
    if (!src) return;
    const prompt = OTHER_PROMPTS[src.method] || '';
    try {
      const extracted = await extractPDF(file, 'Extract income data from this document. Return ONLY valid JSON. ' + prompt);
      setBorrowerGroups(prev => prev.map(g => g.id !== groupId ? g : {
        ...g, sources: g.sources.map(s => {
          if (s.id !== sourceId) return s;
          const f = { ...s.fields };
          if (extracted.monthly_benefit && !parseFloat(f.monthly_benefit)) f.monthly_benefit = String(extracted.monthly_benefit);
          if (extracted.non_taxable) f.gross_up = 'yes';
          if (extracted.monthly_amount && !parseFloat(f.monthly_amount)) f.monthly_amount = String(extracted.monthly_amount);
          if (extracted.months_remaining && !parseFloat(f.months_remaining)) f.months_remaining = String(extracted.months_remaining);
          // Pension IRS Simplified Method partial non-taxable
          if (extracted.taxable_portion > 0 && !parseFloat(f.taxable_portion)) f.taxable_portion = String(extracted.taxable_portion);
          if (extracted.nontaxable_portion > 0 && !parseFloat(f.nontaxable_portion)) f.nontaxable_portion = String(extracted.nontaxable_portion);
          if (extracted.base_pay && !parseFloat(f.base_pay)) f.base_pay = String(extracted.base_pay);
          if (extracted.bah && !parseFloat(f.bah)) f.bah = String(extracted.bah);
          if (extracted.bas && !parseFloat(f.bas)) f.bas = String(extracted.bas);
          if (extracted.special_pay && !parseFloat(f.other)) f.other = String(extracted.special_pay);
          if (extracted.special_pay && !parseFloat(f.other)) f.other = String(extracted.special_pay);
          return { ...s, yr1Data: extracted, fields: f, calculated: Math.max(0, CALCS[s.method] ? CALCS[s.method](f) : 0) };
        })
      }));
    } catch (err) { console.error('Upload error:', err); }
  };

  const handleAddCoBorrower = () => {
    if (borrowerGroups.length >= 4) return;
    setBorrowerGroups(prev => [...prev, makeGroup('co-borrower', `Co-Borrower ${prev.length}`)]);
  };

  const totalQualifying = borrowerGroups.reduce((s, g) => s + g.sources.reduce((s2, src) => s2 + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0), 0);

  const handleAIAnalysis = async () => {
    setAiAnalyzing(true);
    setActiveTab(2);
    setAiAnalysis('');
    setVerification(null);
    const detail = borrowerGroups.map(g => ({
      borrower: g.name,
      totalMonthly: g.sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0),
      sources: g.sources.map(s => ({ type: METHOD_META[s.method]?.label, monthly: Math.max(0, CALCS[s.method] ? CALCS[s.method](s.fields) : 0), fields: s.fields })),
    }));
    try {
      const r1 = await fetch(API, { method: 'POST', headers: HDRS(), body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 3000, messages: [{ role: 'user', content: 'Senior mortgage underwriter: analyze this income file. DATA:' + JSON.stringify(detail) + ' TOTAL:' + fmt$(totalQualifying) + '/mo LOAN:' + (scenario?.loanType || '') + ' ' + (scenario?.loanAmount ? '$' + parseInt(scenario.loanAmount).toLocaleString() : '') + ' NOTES:' + (notes || 'None') + ' Provide: 1.INCOME NARRATIVE(3-4 paragraphs) 2.QUALIFYING INCOME SUMMARY(each source) 3.RISK FLAGS & RESOLUTION(guideline citations) 4.UNDERWRITER SCRUTINY POINTS 5.RECOMMENDATION' }] }) });
      if (!r1.ok) throw new Error('Pass 1 ' + r1.status);
      const d1 = await r1.json();
      const narrative = d1.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (narrative) setAiAnalysis(narrative);
      const r2 = await fetch(API, { method: 'POST', headers: HDRS(), body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: 'Independent mortgage income auditor. Recalculate from raw fields WITHOUT using pre-calculated amounts. RAW:' + JSON.stringify(detail.map(g => ({ borrower: g.borrower, sources: g.sources.map(s => ({ type: s.type, rawFields: s.fields })) }))) + ' Rules: SE=(yr1+add+yr2+add)/2/12 or lower year if declining>10%. Rental=(yr1net+yr1depr+yr2net+yr2depr)/2/12. SS=monthly_benefit*(gross_up=yes?1.25:1). Military=base_pay+bah*1.25+bas*1.25+other. Return ONLY JSON:{"verified":true,"grandTotalMonthly":0,"discrepancies":[],"notes":""}' }] }) });
      if (!r2.ok) throw new Error('Pass 2 ' + r2.status);
      const d2 = await r2.json();
      const raw = d2.content.filter(b => b.type === 'text').map(b => b.text).join('');
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const vr = JSON.parse(match[0]);
          vr.primaryTotal = totalQualifying;
          vr.agree = Math.abs((vr.grandTotalMonthly || 0) - totalQualifying) < 2;
          vr.diff = Math.abs((vr.grandTotalMonthly || 0) - totalQualifying);
          setVerification(vr);
        }
      } catch (_) {}
    } catch (err) { console.error(err); setAiAnalysis('Error: ' + err.message); }
    setAiAnalyzing(false);
  };

  const handleSaveToRecord = async () => {
    setRecordSaving(true);
    setFirestoreSaving(true);
    try {
      const riskFlags = [];
      borrowerGroups.forEach(g => g.sources.forEach(s => {
        if (s.method === 'CHILD_SUPPORT' && (parseFloat(s.fields.months_remaining) || 0) < 36)
          riskFlags.push({ flagCode: 'CS_CONTINUANCE', sourceModule: 'INCOME_ANALYZER', severity: 'HIGH', detail: 'Child support < 36 months continuance' });
        if (s.method === 'W2' && (parseFloat(s.fields.overtime_monthly) > 0 || parseFloat(s.fields.bonus_monthly) > 0))
          riskFlags.push({ flagCode: 'VARIABLE_INCOME', sourceModule: 'INCOME_ANALYZER', severity: 'MEDIUM', detail: 'Variable income — verify 2-year history' });
        if (s.method === 'SELF_EMPLOYED') {
          const y1 = parseFloat(s.fields.yr1_net) || 0;
          const y2 = parseFloat(s.fields.yr2_net) || 0;
          if (y1 > 0 && y2 > 0 && y2 < y1 * 0.90)
            riskFlags.push({ flagCode: 'SE_DECLINING', sourceModule: 'INCOME_ANALYZER', severity: 'HIGH', detail: `SE income declining — lower year used per Fannie B3-3.4-02` });
        }
      }));

      const incomeSnapshot = {
        totalQualifyingMonthly: totalQualifying,
        totalQualifyingAnnual: totalQualifying * 12,
        borrowers: borrowerGroups.map(g => ({
          name: g.name,
          role: g.role,
          monthlyIncome: g.sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0),
          sources: g.sources.map(s => ({
            method: s.method,
            label: METHOD_META[s.method]?.label || s.method,
            monthly: Math.max(0, CALCS[s.method] ? CALCS[s.method](s.fields) : 0),
            fields: s.fields,
          })),
        })),
        loNotes: notes,
        aiAnalysis,
        savedAt: new Date().toISOString(),
        moduleVersion: '4.2',
      };

      // Save to Firestore scenario doc so M03+ can read qualifying income
      if (scenarioId) {
        await updateDoc(doc(db, 'scenarios', scenarioId), {
          income: incomeSnapshot,
          incomeUpdatedAt: serverTimestamp(),
        });
      }

      // Report to Decision Record
      const writtenId = await reportFindings('INCOME_ANALYZER', incomeSnapshot, [], riskFlags, '4.2.0');
      if (writtenId) setSavedRecordId(writtenId);
      setHasUnsavedChanges(false);
    } catch (e) { console.error('Save error:', e); }
    setRecordSaving(false);
    setFirestoreSaving(false);
  };

  const rawPurpose = (scenario?.loanPurpose || '').toLowerCase();
  const loanPurpose = rawPurpose.includes('cash') ? 'cash_out_refi' : rawPurpose.includes('rate') || rawPurpose.includes('refi') ? 'rate_term_refi' : 'purchase';
  const { primarySuggestion, secondarySuggestions, logFollow, logOverride } = useNextStepIntelligence({ currentModuleKey: 'INCOME_ANALYZER', loanPurpose, decisionRecordFindings: { INCOME_ANALYZER: { incomeConfirmed: totalQualifying > 0 } }, scenarioData: scenario || {}, completedModules: [], scenarioId, onWriteToDecisionRecord: null });
  const allNames = borrowerGroups.map(g => g.name).filter(Boolean).join(' · ');
  const TABS = [{ id: 0, label: 'Income Entry', icon: '💼' }, { id: 1, label: 'Income Worksheet', icon: '📋' }, { id: 2, label: 'AI Analysis', icon: '🤖' }];

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">💼</div><div className="text-slate-500">Loading…</div></div>
    </div>
  );

  if (!scenarioId) {
    const q = search.toLowerCase().trim();
    const sorted = [...scenarios].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    const filtered = q ? sorted.filter(s => (s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim()).toLowerCase().includes(q)) : sorted;
    const displayed = q ? filtered : showAll ? filtered : filtered.slice(0, 5);
    const hasMore = !q && !showAll && filtered.length > 5;
    return (
      <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-semibold mb-6 transition-colors">← Back to Dashboard</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-sm">02</div>
              <div>
                <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Stage 1 — Pre-Structure</span>
                <h1 style={{ fontFamily: "'DM Serif Display',Georgia,serif" }} className="text-2xl font-normal text-white mt-0.5">Income Analyzer™</h1>
              </div>
            </div>
            <p className="text-indigo-300 text-sm leading-relaxed mb-5">Upload federal tax returns once — AI auto-detects all income types. W-2, Schedule C, E, D, and more from a single PDF.</p>
            <div className="flex flex-wrap gap-2">
              {['Smart 1040 Upload', 'Auto Income Detection', 'Declining Income Analysis', '4-Borrower Support', 'AI Verification', 'Decision Record'].map(tag => (
                <span key={tag} className="text-xs bg-white/10 border border-white/10 text-indigo-200 px-3 py-1 rounded-full font-medium">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Search borrower name…" className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100"><p className="text-sm text-slate-500">No matches for "{search}"</p></div>
          ) : (
            <div className="space-y-2.5">
              {displayed.map(s => {
                const sName = s.scenarioName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed Scenario';
                return (
                  <button key={s.id} onClick={() => navigate('/income-analyzer?scenarioId=' + s.id)} className="w-full text-left bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700">{sName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {s.loanAmount && <span className="text-xs text-slate-500 font-mono">${parseFloat(s.loanAmount).toLocaleString()}</span>}
                          {s.loanType && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s.loanType}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 text-lg">→</span>
                    </div>
                  </button>
                );
              })}
              {hasMore && <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-indigo-500 py-3 border border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50">View all {filtered.length} scenarios</button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <DecisionRecordBanner recordId={savedRecordId} moduleName="Income Analyzer™" moduleKey="INCOME_ANALYZER" onSave={handleSaveToRecord} saving={recordSaving} />
      </div>
      <div className="max-w-7xl mx-auto px-6">
        <ModuleNav moduleNumber={2} />
      </div>
      <div className="max-w-7xl mx-auto px-6 mb-4">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl px-6 py-5">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <button onClick={() => {
                if (hasUnsavedChanges && !window.confirm('You have unsaved income results.\n\nSave to Decision Record before leaving?\n\nClick Cancel to go back and save.')) return;
                navigate('/');
              }} className="text-slate-400 hover:text-white text-xs mb-2 block">← Dashboard</button>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'DM Serif Display,serif' }}>Income Analyzer™</h1>
              <p className="text-slate-400 text-sm mt-1">{allNames || 'Smart upload · Auto income detection · AI verification'}</p>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, marginLeft: 24 }}>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-xs font-bold tracking-widest text-indigo-300 uppercase bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-400/30">Stage 1 — Pre-Structure</span>
                <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full border border-white/20">Module 2</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-400/30 font-semibold">● LIVE</span>
              </div>
              {scenario && (
                <div className="bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-right" style={{ minWidth: 190 }}>
                  <p className="text-xs text-slate-300 truncate" style={{ maxWidth: 200 }}>{allNames || scenario.scenarioName || 'No Borrower'}</p>
                  <p className="text-lg font-black text-white">{scenario.loanAmount ? '$' + parseInt(scenario.loanAmount).toLocaleString() : '—'}</p>
                  <p className="text-xs text-slate-400">{scenario.loanType || 'Purchase'}{totalQualifying > 0 && <span className="text-indigo-300 font-bold"> · {fmt$(totalQualifying)}/mo</span>}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6">
        <ScenarioHeader moduleTitle="Income Analyzer™" moduleNumber={2} scenarioId={scenarioId} />
      </div>
      {savedRecordId && primarySuggestion && (
        <div className="max-w-7xl mx-auto px-6">
          <NextStepCard suggestion={primarySuggestion} secondarySuggestions={secondarySuggestions} onFollow={logFollow} onOverride={logOverride} loanPurpose={loanPurpose} scenarioId={scenarioId} />
        </div>
      )}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.icon} {t.label}</button>
            ))}
            <div className="ml-auto flex items-center px-4 gap-3">
              {hasUnsavedChanges && (
                <button
                  onClick={handleSaveToRecord}
                  disabled={recordSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                  title="Save income to Decision Record — also persists across devices"
                >
                  {recordSaving ? '⏳ Saving…' : '💾 Save'}
                </button>
              )}
              {!hasUnsavedChanges && savedRecordId && savedRecordId !== 'restored' && (
                <span className="text-xs text-emerald-600 font-semibold">✅ Saved</span>
              )}
              {savedRecordId === 'restored' && hasUnsavedChanges === false && (
                <span className="text-xs text-blue-500 font-semibold">🔄 Restored</span>
              )}
              <span className="text-xs text-slate-400">Total:</span>
              <span className="text-base font-black text-indigo-600">{fmt$(totalQualifying)}/mo</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              {borrowerGroups.map((group, gi) => (
                <div key={group.id} className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${group.role === 'primary' ? 'bg-indigo-500' : 'bg-violet-500'}`} />
                      <span className="font-bold text-slate-800">{group.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${group.role === 'primary' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-violet-100 text-violet-700 border-violet-200'}`}>{group.role}</span>
                    </div>
                    <div className={`text-base font-black ${group.role === 'primary' ? 'text-indigo-600' : 'text-violet-600'}`}>
                      {fmt$(group.sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0))}/mo
                    </div>
                  </div>
                  <TaxReturnUploader taxReturns={group.taxReturns} onUpload={(slot, file) => handleTaxReturnUpload(group.id, slot, file)} onRemove={slot => handleTaxReturnRemove(group.id, slot)} />
                  <W2Uploader w2Docs={group.w2Docs} onUpload={(file, subType) => handleW2Upload(group.id, file, subType)} onRemove={i => handleW2Remove(group.id, i)} currentEmployerName={group.currentEmployerName||''} currentHireDate={group.currentHireDate||''} onUpdateField={(field,val) => handleUpdateGroupField(group.id, field, val)} />
                  <OtherIncomeSelector onAdd={method => handleAddOtherIncome(group.id, method)} />
                  {group.sources.map(src => (
                    <SourceCard key={src.id} source={src} onRemove={() => handleRemoveSource(group.id, src.id)} onUpdateField={(sid, key, val) => handleUpdateField(group.id, sid, key, val)} onUploadOtherDoc={(sid, file) => handleUploadOtherDoc(group.id, sid, file)} />
                  ))}
                  {group.sources.length > 0 && <IncomeSummary sources={group.sources} groupName={group.name} />}
                </div>
              ))}
              {borrowerGroups.length < 4 && (
                <button onClick={handleAddCoBorrower} className="w-full py-3 border-2 border-dashed border-violet-200 rounded-xl text-sm font-semibold text-violet-400 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-all mb-6">+ Add Co-Borrower</button>
              )}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">📝 LO Notes</h2>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Income rationale, addback justifications, compensating factors…" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={handleAIAnalysis} disabled={aiAnalyzing} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">{aiAnalyzing ? '⏳ Analyzing…' : '🤖 Run AI Analysis'}</button>
                <button onClick={() => setActiveTab(1)} className="px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 text-sm font-bold rounded-xl hover:bg-indigo-50">📋 Income Worksheet</button>
                <button onClick={handleSaveToRecord} disabled={recordSaving} className={`px-5 py-2.5 text-sm font-bold rounded-xl border transition-colors ${savedRecordId ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{savedRecordId ? '✅ Saved to Decision Record' : recordSaving ? '⏳ Saving…' : '💾 Save to Decision Record'}</button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">All Borrowers — Total</h3>
                {borrowerGroups.map(g => {
                  const gt = g.sources.reduce((s, src) => s + Math.max(0, CALCS[src.method] ? CALCS[src.method](src.fields) : 0), 0);
                  const style = g.role === 'primary' ? { dot: 'bg-indigo-500', total: 'text-indigo-600', bar: 'bg-indigo-400' } : { dot: 'bg-violet-500', total: 'text-violet-600', bar: 'bg-violet-400' };
                  return (
                    <div key={g.id} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-semibold">{g.name}</span>
                        <span className={`font-bold ${style.total}`}>{fmt$(gt)}/mo</span>
                      </div>
                      {totalQualifying > 0 && <div className="h-1.5 bg-slate-100 rounded-full"><div className={`h-full ${style.bar} rounded-full`} style={{ width: `${(gt / totalQualifying) * 100}%` }} /></div>}
                    </div>
                  );
                })}
                <div className="border-t border-slate-100 pt-3 flex justify-between">
                  <span className="text-sm font-bold text-slate-600">Grand Total</span>
                  <span className="text-sm font-black text-indigo-600">{fmt$(totalQualifying)}/mo</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1"><span>Annual</span><span className="font-semibold">{fmt$(totalQualifying * 12)}</span></div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⚠️ Key Guidelines</h3>
                <div className="text-xs text-amber-700 space-y-1.5">
                  <p>• SE: 2-year avg; decline &gt;10% = lower year</p>
                  <p>• Rental: Sch E net + depreciation addback</p>
                  <p>• OT/bonus: 2-year history required</p>
                  <p>• Non-taxable income: gross up 25%</p>
                  <p>• Child support: 36+ months remaining</p>
                  <p>• SEP IRA / meals: NOT addbacks</p>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 1 && <IncomeWorksheet borrowerGroups={borrowerGroups} scenario={scenario} notes={notes} totalQualifying={totalQualifying} verification={verification} />}
        {activeTab === 2 && (
          <div className="max-w-4xl">
            {aiAnalyzing && (
              <div className="text-center py-16">
                <div className="text-5xl mb-5">🤖</div>
                <div className="text-base font-semibold text-slate-600">Analyzing income file…</div>
                <div className="text-sm mt-3 text-slate-400">Pass 1 — Income narrative &amp; risk flags</div>
                <div className="text-sm mt-1 text-slate-400">Pass 2 — Independent verification</div>
              </div>
            )}
            {!aiAnalyzing && !aiAnalysis && (
              <div className="text-center py-16 text-slate-400">
                <div className="text-4xl mb-4">📊</div>
                <p className="text-sm">Go to <strong>Income Entry</strong> and click <span className="text-indigo-600 font-bold">Run AI Analysis</span>.</p>
              </div>
            )}
            {aiAnalysis && !aiAnalyzing && (
              <div>
                <div className="flex gap-3 mb-5 flex-wrap">
                  <button onClick={handleAIAnalysis} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700">🔄 Re-run</button>
                  <button onClick={() => setActiveTab(1)} className="px-4 py-2 bg-white border border-indigo-200 text-indigo-600 text-sm font-bold rounded-xl hover:bg-indigo-50">📋 Worksheet</button>
                  <button onClick={() => window.print()} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50">🖨️ Print</button>
                </div>
                {verification && (
                  <div className={`mb-5 rounded-xl p-4 border flex items-start gap-3 ${verification.agree ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <span className="text-2xl">{verification.agree ? '✅' : '⚠️'}</span>
                    <div>
                      <div className={`font-bold text-sm ${verification.agree ? 'text-emerald-700' : 'text-red-700'}`}>
                        {verification.agree ? 'Calculation Verified — AI confirmed ' + fmt$(totalQualifying) + '/mo' : 'Discrepancy Detected — LO Review Required'}
                      </div>
                      {!verification.agree && <div className="text-xs text-red-600 mt-1">Primary: {fmt$(verification.primaryTotal)}/mo · Verification: {fmt$(verification.grandTotalMonthly)}/mo · Diff: {fmt$(verification.diff || 0)}</div>}
                      {(verification.discrepancies || []).map((d, di) => <div key={di} className="text-xs text-amber-700 mt-1">{d.source}: expected {fmt$(d.expected)} · got {fmt$(d.calculated)} — {d.reason}</div>)}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
