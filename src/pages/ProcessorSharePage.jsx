// src/pages/ProcessorSharePage.jsx
// LoanBeacons™ — Processor Share Landing Page
// Accessed via /processor-share/:token — no login required

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const fmt$ = n => n ? '$' + Number(n).toLocaleString() : ''

export default function ProcessorSharePage() {
  const { token } = useParams()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expired, setExpired]   = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [permError, setPermError] = useState(false)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    getDoc(doc(db, 'processorShares', token))
      .then(snap => {
        if (!snap.exists()) { setNotFound(true); return }
        const d = snap.data()
        if (d.expiresAt?.toDate && d.expiresAt.toDate() < new Date()) {
          setExpired(true); return
        }
        setData(d)
      })
      .catch(err => {
        if (err?.code === 'permission-denied') { setPermError(true) }
        else { setNotFound(true) }
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Loading submission package…</p>
      </div>
    </div>
  )

  if (notFound || expired || permError) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">{expired ? '⏰' : permError ? '🔒' : '🔍'}</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">
          {expired ? 'Link Expired' : permError ? 'Access Configuration Needed' : 'Link Not Found'}
        </h1>
        <p className="text-sm text-slate-500">
          {expired
            ? 'This processor share link has expired (30-day limit). Please ask the loan officer to generate a new link.'
            : permError
            ? 'This share link exists but the database needs a quick configuration update. Please notify the loan officer.'
            : 'This link is invalid or has been removed. Please contact your loan officer for an updated link.'}
        </p>
        <div className="mt-6 bg-slate-100 rounded-2xl p-4">
          <p className="text-xs text-slate-400">Powered by <span className="font-bold text-slate-600">LoanBeacons™</span></p>
        </div>
      </div>
    </div>
  )

  const { borrowerName, propertyAddr, scenario, checklist, pkg, processorLetter } = data
  const completionColor = checklist.completionPct >= 80 ? 'text-emerald-500' : checklist.completionPct >= 50 ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-950 px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <span className="text-white font-black text-sm">LB</span>
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-emerald-400 uppercase">LoanBeacons™ — Processor Submission Package</p>
              <p className="text-white/50 text-xs mt-0.5">Shared by your loan officer · Confidential</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{borrowerName || 'Borrower File'}</h1>
          {propertyAddr && <p className="text-emerald-300 text-sm">📍 {propertyAddr}</p>}
          <div className="flex items-center gap-4 mt-3">
            <div className={`text-3xl font-black ${completionColor}`}>{checklist.completionPct}%</div>
            <div>
              <p className="text-white text-sm font-semibold">{checklist.receivedCount} of {checklist.totalItems} conditions received</p>
              <p className="text-white/50 text-xs">{checklist.pendingCount} outstanding · {checklist.waivedCount} waived/N/A</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">

        {/* Loan File Summary */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">📁 Loan File Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              ['Program', scenario.loanType],
              ['Loan Amount', fmt$(scenario.loanAmount)],
              ['Purpose', scenario.loanPurpose],
              scenario.lenderName && ['Lender', scenario.lenderName],
              scenario.targetCloseDate && ['Target Close', new Date(scenario.targetCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
              ['File Completion', checklist.completionPct + '%'],
            ].filter(Boolean).map(([label, value]) => value ? (
              <div key={label}>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-slate-800 font-semibold text-sm">{value}</p>
              </div>
            ) : null)}
          </div>
        </div>

        {/* Rate Terms — only if included */}
        {pkg.includeRate && (pkg.interestRate || pkg.apr) && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">📈 Rate Terms</h2>
            <div className="grid grid-cols-3 gap-4">
              {pkg.interestRate && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Interest Rate</p>
                  <p className="text-slate-800 font-bold text-lg">{pkg.interestRate}%</p>
                </div>
              )}
              {pkg.lockPeriod && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Lock Period</p>
                  <p className="text-slate-800 font-semibold text-sm">{pkg.lockPeriod} days</p>
                </div>
              )}
              {pkg.apr && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">APR</p>
                  <p className="text-slate-800 font-semibold text-sm">{pkg.apr}%</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AUS Findings — only if included */}
        {pkg.includeAUS && pkg.ausFinding && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">🖥 AUS Findings</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Finding</p>
                <p className="text-slate-800 font-semibold text-sm">{pkg.ausFinding}</p>
              </div>
              {pkg.caseNumber && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Case Number</p>
                  <p className="text-slate-800 font-mono font-semibold text-sm">{pkg.caseNumber}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gross Comp — only if included */}
        {pkg.includeComp && pkg.grossComp && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">💰 Origination</h2>
            <p className="text-slate-800 font-semibold text-sm">{pkg.grossComp}</p>
          </div>
        )}

        {/* LO Game Plan */}
        {pkg.loGamePlan && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5">
            <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">📝 LO Game Plan</h2>
            <p className="text-sm text-emerald-900 leading-relaxed whitespace-pre-wrap">{pkg.loGamePlan}</p>
          </div>
        )}

        {/* Outstanding Conditions */}
        {checklist.pendingItems?.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
            <h2 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">
              ⏳ Outstanding Conditions ({checklist.pendingItems.length})
            </h2>
            <div className="space-y-2">
              {checklist.pendingItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2 bg-white rounded-2xl px-4 py-3 border border-amber-100">
                  <span className="text-amber-400 mt-0.5 shrink-0 font-bold text-sm">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    {item.category && <p className="text-xs text-slate-400 mt-0.5">{item.category}</p>}
                    {item.note && <p className="text-xs text-amber-700 mt-1 italic">Note: {item.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 text-center">
            <p className="text-emerald-700 font-semibold text-sm">✅ File is complete — no outstanding conditions</p>
          </div>
        )}

        {/* Processor Handoff Letter */}
        {processorLetter && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">📄 Processor Handoff Letter</h2>
              <button onClick={() => navigator.clipboard.writeText(processorLetter).catch(() => {})}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-3 py-1.5 rounded-xl transition-colors">
                📋 Copy
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{processorLetter}</pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6">
          <p className="text-xs text-slate-400">
            Generated by <span className="font-bold text-slate-600">LoanBeacons™</span> · Confidential — for processor use only
          </p>
          <p className="text-xs text-slate-300 mt-1">Net commission, split details, and internal LO notes are never included in processor shares.</p>
        </div>

      </div>
    </div>
  )
}
