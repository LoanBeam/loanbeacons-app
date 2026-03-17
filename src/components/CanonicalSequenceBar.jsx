// src/components/CanonicalSequenceBar.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

const SEQ = [
  { key: 'SCENARIO_CREATOR',     num: 1,  label: 'Scenario Creator',     route: '/scenario-creator',      stage: 1, live: true  },
  { key: 'QUALIFYING_INTEL',     num: 2,  label: 'Qualifying Intel',      route: '/qualifying-intel',      stage: 1, live: true  },
  { key: 'INCOME_ANALYZER',      num: 3,  label: 'Income Analyzer',       route: '/income-analyzer',       stage: 1, live: true  },
  { key: 'ASSET_ANALYZER',       num: 4,  label: 'Asset Analyzer',        route: '/asset-analyzer',        stage: 1, live: false },
  { key: 'CREDIT_INTEL',         num: 5,  label: 'Credit Intel',          route: '/credit-intel',          stage: 1, live: false },
  { key: 'LENDER_MATCH',         num: 6,  label: 'Lender Match',          route: '/lender-match',          stage: 2, live: true  },
  { key: 'DPA_INTEL',            num: 7,  label: 'DPA Intelligence',      route: '/dpa-intelligence',      stage: 2, live: true  },
  { key: 'AUS_RESCUE',           num: 8,  label: 'AUS Rescue',            route: '/aus-rescue',            stage: 2, live: true  },
  { key: 'PROPERTY_INTEL',       num: 9,  label: 'Property Intel',        route: '/property-intel',        stage: 2, live: false },
  { key: 'TITLE_INTEL',          num: 10, label: 'Title Intel',           route: '/title-intel',           stage: 2, live: false },
  { key: 'CLOSING_COST_CALC',    num: 11, label: 'Closing Costs',         route: '/closing-cost-calc',     stage: 2, live: false },
  { key: 'CRA_INTEL',            num: 12, label: 'CRA Intel',             route: '/cra-intel',             stage: 2, live: true  },
  { key: 'RATE_INTEL',           num: 13, label: 'Rate Intel',            route: '/rate-intel',            stage: 3, live: false },
  { key: 'DISCLOSURE_INTEL',     num: 14, label: 'Disclosure Intel',      route: '/disclosure-intel',      stage: 3, live: true  },
  { key: 'COMPLIANCE_INTEL',     num: 15, label: 'Compliance Intel',      route: '/compliance-intel',      stage: 3, live: true  },
  { key: 'FLOOD_INTEL',          num: 16, label: 'Flood Intel',           route: '/flood-intel',           stage: 3, live: true  },
  { key: 'REHAB_INTEL',          num: 17, label: 'Rehab Intelligence',    route: '/rehab-intelligence',    stage: 3, live: true  },
  { key: 'INTELLIGENT_CHECKLIST',num: 18, label: 'Checklist',             route: '/intelligent-checklist', stage: 3, live: true  },
  { key: 'PIGGYBACK_OPTIMIZER',  num: 19, label: 'Piggyback Optimizer',   route: '/piggyback-optimizer',   stage: 3, live: true  },
  { key: 'BANK_STATEMENT_INTEL', num: 20, label: 'Bank Statement',        route: '/bank-statement-intel',  stage: 3, live: false },
  { key: 'FHA_STREAMLINE',       num: 21, label: 'FHA Streamline',        route: '/fha-streamline',        stage: 4, live: true  },
  { key: 'VA_IRRRL',             num: 22, label: 'VA IRRRL',              route: '/va-irrrl',              stage: 4, live: true  },
  { key: 'DEBT_CONSOLIDATION',   num: 23, label: 'Debt Consolidation',    route: '/debt-consolidation',    stage: 4, live: true  },
  { key: 'MI_OPTIMIZER',         num: 24, label: 'MI Optimizer',          route: '/mi-optimizer',          stage: 4, live: true  },
  { key: 'RATE_BUYDOWN',         num: 25, label: 'Rate Buydown',          route: '/rate-buydown',          stage: 4, live: true  },
  { key: 'ARM_STRUCTURE',        num: 26, label: 'ARM Structure',         route: '/arm-structure',         stage: 4, live: true  },
  { key: 'DECISION_RECORD',      num: 27, label: 'Decision Record',       route: '/decision-records',      stage: 4, live: true  },
];

// Matches platform color palette exactly
const NAVY = '#0d1117';
const NAVY2 = '#161b27';
const INDIGO = '#6366f1';
const INDIGO_LIGHT = '#818cf8';
const INDIGO_BG = 'rgba(99,102,241,0.15)';
const INDIGO_BORDER = 'rgba(99,102,241,0.4)';
const GREEN = '#10b981';
const GREEN_BG = 'rgba(16,185,129,0.15)';
const GREEN_BORDER = 'rgba(16,185,129,0.4)';
const WHITE = '#ffffff';
const WHITE60 = 'rgba(255,255,255,0.6)';
const WHITE30 = 'rgba(255,255,255,0.3)';
const WHITE15 = 'rgba(255,255,255,0.15)';
const WHITE08 = 'rgba(255,255,255,0.08)';

const STAGE_COLORS = { 1: INDIGO, 2: '#f59e0b', 3: GREEN, 4: '#3b82f6' };
const STAGE_LABELS = { 1: 'Pre-Structure', 2: 'Lender Fit', 3: 'Final Structure', 4: 'Verify & Submit' };

export default function CanonicalSequenceBar({ currentModuleKey, scenarioId, recordId }) {
  const navigate = useNavigate();
  const [logged, setLogged] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!scenarioId) return;
    getDocs(query(collection(db, 'decisionRecords'), where('scenarioId', '==', scenarioId), limit(1)))
      .then(snap => {
        if (!snap.empty) {
          const d = snap.docs[0].data();
          setLogged(d.header?.moduleVersionTags || d.moduleVersionTags || {});
        }
      }).catch(() => {});
  }, [scenarioId, recordId]);

  const ci = SEQ.findIndex(m => m.key === currentModuleKey);
  const prev = ci > 0 ? SEQ[ci - 1] : null;
  const next = ci < SEQ.length - 1 ? SEQ[ci + 1] : null;
  const currentMod = ci >= 0 ? SEQ[ci] : null;
  const stageColor = currentMod ? STAGE_COLORS[currentMod.stage] : INDIGO;

  const go = (mod) => {
    if (!mod || !mod.live) return;
    const path = mod.route === '/decision-records'
      ? (recordId ? `/decision-records/${recordId}` : '/decision-records')
      : scenarioId ? `${mod.route}?scenarioId=${scenarioId}` : mod.route;
    navigate(path);
    setExpanded(false);
  };

  const st = (mod) => mod.key === currentModuleKey ? 'cur' : logged[mod.key] ? 'log' : 'pnd';
  const logCount = Object.keys(logged).length;
  const liveCount = SEQ.filter(m => m.live).length;
  const pct = Math.round((logCount / liveCount) * 100);

  const bar = (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2147483647, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── EXPANDED PANEL ── */}
      {expanded && (
        <div style={{ background: NAVY, borderTop: `1px solid ${INDIGO_BORDER}` }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>

            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: '-0.01em' }}>
                  Canonical Sequence™
                  <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: INDIGO_LIGHT, background: INDIGO_BG, border: `1px solid ${INDIGO_BORDER}`, borderRadius: 20, padding: '2px 10px' }}>
                    27 Modules
                  </span>
                </div>
                <div style={{ fontSize: 12, color: WHITE30, marginTop: 3 }}>
                  Your scenario data auto-populates every module — click any live module to navigate
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: WHITE60 }}>
                  <span style={{ color: GREEN, fontWeight: 800, fontSize: 16 }}>{logCount}</span>/{liveCount} logged
                </span>
                <div style={{ width: 140, height: 6, background: WHITE08, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${INDIGO}, ${GREEN})`, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{pct}%</span>
              </div>
            </div>

            {/* Stage columns */}
            <div style={{ display: 'flex', gap: 10 }}>
              {[1,2,3,4].map(s => {
                const sc = STAGE_COLORS[s];
                const mods = SEQ.filter(m => m.stage === s);
                const sLogged = mods.filter(m => logged[m.key]).length;
                const sLive = mods.filter(m => m.live).length;
                return (
                  <div key={s} style={{ flex: 1, borderRadius: 10, overflow: 'hidden', border: `1px solid ${sc}33`, background: NAVY2 }}>
                    {/* Stage header */}
                    <div style={{ padding: '10px 12px', background: `${sc}15`, borderBottom: `1px solid ${sc}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: sc, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Stage {s}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: WHITE }}>{STAGE_LABELS[s]}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc, background: `${sc}20`, border: `1px solid ${sc}44`, borderRadius: 20, padding: '2px 8px' }}>
                        {sLogged}/{sLive}
                      </span>
                    </div>
                    {/* Module list */}
                    <div style={{ padding: '8px' }}>
                      {mods.map(mod => {
                        const state = st(mod);
                        const isCur = state === 'cur';
                        const isLog = state === 'log';
                        return (
                          <button key={mod.key} onClick={() => go(mod)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '6px 8px', marginBottom: 3, borderRadius: 7, textAlign: 'left',
                            cursor: mod.live ? 'pointer' : 'default', opacity: mod.live ? 1 : 0.35,
                            background: isCur ? `${sc}20` : isLog ? GREEN_BG : 'transparent',
                            border: isCur ? `1px solid ${sc}` : isLog ? `1px solid ${GREEN_BORDER}` : `1px solid transparent`,
                          }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                              background: isCur ? sc : isLog ? GREEN : WHITE08,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: isCur || isLog ? '#000' : WHITE30 }}>
                                {isLog && !isCur ? '✓' : mod.num}
                              </span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: isCur ? 700 : 500, color: isCur ? sc : isLog ? GREEN : WHITE60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {mod.label}
                            </span>
                            {isCur && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: sc, background: `${sc}20`, border: `1px solid ${sc}44`, borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>HERE</span>
                            )}
                            {!mod.live && (
                              <span style={{ fontSize: 9, color: WHITE30, flexShrink: 0 }}>soon</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN BAR ── */}
      <div style={{
        background: NAVY,
        borderTop: `2px solid ${stageColor}`,
        height: 60,
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.8)',
      }}>

        {/* Brand pill */}
        <div style={{ flexShrink: 0, paddingRight: 14, borderRight: `1px solid ${WHITE15}` }}>
          <div style={{ fontSize: 8, fontWeight: 800, color: INDIGO_LIGHT, textTransform: 'uppercase', letterSpacing: '0.15em', lineHeight: 1.3 }}>Canonical</div>
          <div style={{ fontSize: 8, fontWeight: 800, color: INDIGO_LIGHT, textTransform: 'uppercase', letterSpacing: '0.15em', lineHeight: 1.3 }}>Sequence™</div>
        </div>

        {/* Prev */}
        <button onClick={() => go(prev)} disabled={!prev} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7,
          border: `1px solid ${WHITE15}`, background: prev ? WHITE08 : 'transparent',
          color: prev ? WHITE : WHITE30, fontSize: 13, fontWeight: 700,
          cursor: prev ? 'pointer' : 'default', flexShrink: 0,
        }}>
          ← {prev ? prev.num : ''}
        </button>

        {/* Current module badge — matches platform header style */}
        <div style={{
          flexShrink: 0, background: `${stageColor}20`, border: `1px solid ${stageColor}55`,
          borderRadius: 8, padding: '5px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: stageColor, textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1 }}>
            Stage {currentMod?.stage} · Module {currentMod?.num}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: WHITE, lineHeight: 1.4 }}>
            {currentMod?.label || 'Unknown'}
          </div>
        </div>

        {/* Module dots */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
          {SEQ.map((mod, i) => {
            const state = st(mod);
            const isCur = state === 'cur';
            const isLog = state === 'log';
            const c = STAGE_COLORS[mod.stage];
            return (
              <div key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, position: 'relative' }}>
                {i > 0 && SEQ[i-1].stage !== mod.stage && (
                  <div style={{ width: 1, height: 18, background: WHITE15, margin: '0 3px', borderRadius: 1 }} />
                )}
                <button
                  onClick={() => mod.live && go(mod)}
                  onMouseEnter={() => setTip(mod.key)}
                  onMouseLeave={() => setTip(null)}
                  style={{
                    width: isCur ? 34 : 22, height: isCur ? 34 : 22,
                    borderRadius: isCur ? 9 : '50%',
                    border: isCur ? `2px solid ${c}` : isLog ? `1.5px solid ${c}88` : `1px solid ${WHITE15}`,
                    background: isCur ? c : isLog ? `${c}25` : WHITE08,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: mod.live ? 'pointer' : 'default', flexShrink: 0,
                    opacity: mod.live ? 1 : 0.22,
                    boxShadow: isCur ? `0 0 14px ${c}99` : 'none',
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: isCur ? 12 : 9, fontWeight: 900, color: isCur ? '#000' : isLog ? c : WHITE30, lineHeight: 1 }}>
                    {isLog && !isCur ? '✓' : mod.num}
                  </span>
                  {tip === mod.key && (
                    <div style={{
                      position: 'absolute', bottom: '150%', left: '50%', transform: 'translateX(-50%)',
                      background: NAVY2, border: `1px solid ${isCur ? c : isLog ? GREEN : WHITE15}`,
                      borderRadius: 8, padding: '7px 12px', whiteSpace: 'nowrap',
                      zIndex: 2147483647, pointerEvents: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isCur ? c : isLog ? GREEN : WHITE }}>
                        {mod.num}. {mod.label}
                      </div>
                      <div style={{ fontSize: 10, color: WHITE30, marginTop: 2 }}>
                        {isCur ? '● You are here' : isLog ? '✓ Logged to Decision Record' : mod.live ? 'Click to navigate' : 'Coming soon'}
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Progress */}
        <div style={{ flexShrink: 0, textAlign: 'right', paddingLeft: 14, borderLeft: `1px solid ${WHITE15}` }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: GREEN, lineHeight: 1 }}>
            {logCount}<span style={{ fontSize: 11, color: WHITE30, fontWeight: 500 }}>/{liveCount}</span>
          </div>
          <div style={{ fontSize: 9, color: WHITE30, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Logged</div>
        </div>

        {/* All Modules — matches platform button style */}
        <button onClick={() => setExpanded(e => !e)} style={{
          padding: '7px 16px', borderRadius: 8,
          border: expanded ? `1px solid ${INDIGO}` : `1px solid ${INDIGO_BORDER}`,
          background: expanded ? INDIGO : INDIGO_BG,
          color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {expanded ? '▼ Close' : '▲ All Modules'}
        </button>

        {/* Next */}
        <button onClick={() => go(next)} disabled={!next?.live} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7,
          border: next?.live ? `1px solid ${stageColor}55` : `1px solid ${WHITE15}`,
          background: next?.live ? `${stageColor}20` : 'transparent',
          color: next?.live ? stageColor : WHITE30,
          fontSize: 13, fontWeight: 700, cursor: next?.live ? 'pointer' : 'default', flexShrink: 0,
        }}>
          {next ? `${next.num} →` : '→'}
        </button>

      </div>
    </div>
  );

  return createPortal(bar, document.body);
}
