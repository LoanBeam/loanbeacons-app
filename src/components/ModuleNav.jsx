// src/components/ModuleNav.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { MODULE_GROUPS, ALL_MODULES } from '../constants/moduleRegistry'

export default function ModuleNav({ moduleNumber, isHome = false }) {
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()
  const scenarioId     = searchParams.get('scenarioId')
  const [open,         setOpen]         = useState(false)
  const [scenarioName, setScenarioName] = useState('')
  const [drCount,      setDrCount]      = useState(0)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!scenarioId) return
    const candidates = [`lb_scenario_${scenarioId}`, `lb_scenario_creator_${scenarioId}`]
    for (const key of candidates) {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const data = JSON.parse(raw)
        const name = data.borrowerName || data.scenarioName || data.borrower?.name || data.name || ''
        if (name) { setScenarioName(name); break }
      } catch { }
    }
  }, [scenarioId])

  useEffect(() => {
    if (!scenarioId) return
    let cancelled = false
    const fetchCount = async () => {
      try {
        const q = query(collection(db, 'decisionRecords'), where('scenarioId', '==', scenarioId))
        const snap = await getDocs(q)
        if (!cancelled) setDrCount(snap.size)
      } catch { }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [scenarioId])

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentIndex  = isHome ? -1 : ALL_MODULES.findIndex(m => m.num === moduleNumber)
  const currentModule = currentIndex >= 0 ? ALL_MODULES[currentIndex] : null
  const prevModule    = currentIndex > 0 ? ALL_MODULES[currentIndex - 1] : null
  const nextModule    = currentIndex >= 0 && currentIndex < ALL_MODULES.length - 1 ? ALL_MODULES[currentIndex + 1] : null

  const goTo = (route) => {
    setOpen(false)
    navigate(scenarioId ? `${route}?scenarioId=${scenarioId}` : route)
  }

  return (
    <div style={s.bar}>
      <button onClick={() => navigate('/scenarios')} style={s.logoBtn}>
        🔦 <span style={{ marginLeft: 4 }}>LoanBeacons</span>
      </button>
      <div style={s.divider} />
      <span style={s.csLabel}>Canonical Sequence™</span>
      <div style={s.divider} />
      {!isHome ? (
        <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setOpen(o => !o)} style={s.moduleBtn}>
            <span style={s.numBadge}>M{String(moduleNumber).padStart(2, '0')}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentModule?.name ?? 'Select module'}
            </span>
            <span style={{ marginLeft: 'auto', paddingLeft: 8, fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
          </button>
          {open && (
            <div style={s.dropdown}>
              {MODULE_GROUPS.map((group, gi) => (
                <div key={gi}>
                  <div style={s.groupLabel}>{group.label}</div>
                  {group.modules.map(mod => (
                    <button key={mod.num} onClick={() => goTo(mod.route)} style={{
                      ...s.ddItem,
                      background: mod.num === moduleNumber ? '#EFF6FF' : 'transparent',
                      color: mod.num === moduleNumber ? '#1D4ED8' : '#1e293b',
                    }}>
                      <span style={s.ddNum}>M{String(mod.num).padStart(2, '0')}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{mod.name}</span>
                      {mod.num === moduleNumber && <span style={{ fontSize: '10px', color: '#3B82F6', flexShrink: 0 }}>current</span>}
                    </button>
                  ))}
                  {gi < MODULE_GROUPS.length - 1 && <div style={s.ddDivider} />}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>My Scenarios</span>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ ...s.scenarioPill, opacity: scenarioName ? 1 : 0, pointerEvents: scenarioName ? 'auto' : 'none' }}>
        {scenarioName || '\u00A0'}
      </div>
      <div style={{ ...s.drBadge, opacity: drCount > 0 ? 1 : 0, pointerEvents: drCount > 0 ? 'auto' : 'none' }}>
        <span style={s.drDot} />{drCount} logged
      </div>
      {!isHome && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={() => prevModule && goTo(prevModule.route)} disabled={!prevModule} title={prevModule ? `← ${prevModule.name}` : undefined} style={{ ...s.arrowBtn, opacity: prevModule ? 1 : 0.3, cursor: prevModule ? 'pointer' : 'default' }}>‹</button>
          <button onClick={() => nextModule && goTo(nextModule.route)} disabled={!nextModule} title={nextModule ? `${nextModule.name} →` : undefined} style={{ ...s.arrowBtn, opacity: nextModule ? 1 : 0.3, cursor: nextModule ? 'pointer' : 'default' }}>›</button>
        </div>
      )}
    </div>
  )
}

const s = {
  bar: { position: 'sticky', top: 0, zIndex: 50, height: '48px', minHeight: '48px', maxHeight: '48px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '10px', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', overflow: 'visible' },
  logoBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#185FA5', padding: 0, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', flexShrink: 0 },
  csLabel: { fontSize: '11px', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.01em' },
  divider: { width: '1px', height: '20px', background: '#e2e8f0', flexShrink: 0 },
  moduleBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#1e293b', width: '230px', height: '32px', overflow: 'hidden' },
  numBadge: { fontSize: '11px', fontWeight: 600, background: '#DBEAFE', color: '#1D4ED8', padding: '1px 6px', borderRadius: '4px', flexShrink: 0 },
  dropdown: { position: 'absolute', top: '40px', left: 0, width: '300px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '6px', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.10)', maxHeight: '480px', overflowY: 'auto' },
  groupLabel: { fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94a3b8', padding: '8px 8px 4px' },
  ddItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', width: '100%', border: 'none', fontFamily: '"DM Sans", sans-serif', transition: 'background 0.1s' },
  ddNum: { fontSize: '10px', color: '#94a3b8', minWidth: '28px', fontFamily: 'monospace', flexShrink: 0 },
  ddDivider: { height: '1px', background: '#f1f5f9', margin: '4px 0' },
  scenarioPill: { fontSize: '12px', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '3px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px', flexShrink: 0, transition: 'opacity 0.2s' },
  drBadge: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, color: '#15803D', background: '#DCFCE7', borderRadius: '99px', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0, transition: 'opacity 0.2s' },
  drDot: { display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#16A34A', flexShrink: 0 },
  arrowBtn: { width: '28px', height: '28px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#64748b', padding: 0, lineHeight: 1 },
}
