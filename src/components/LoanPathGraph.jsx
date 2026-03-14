// src/components/LoanPathGraph.jsx
// LoanBeacons™ — Loan Path Graph Phase 1
// Horizontal timeline: Stage 1 → 2 → 3 → 4
// 3 paths: Agency | Non-QM | Rescue
// Auto-detects active path from scenario data, LO can override

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Path Definitions ────────────────────────────────────────────────────────

const PATHS = {
  AGENCY: {
    id: 'AGENCY',
    label: 'Agency Path',
    icon: '🏛️',
    color: {
      bg: 'bg-blue-600', light: 'bg-blue-50', border: 'border-blue-300',
      text: 'text-blue-700', activeBg: '#2563eb', activeLight: '#eff6ff',
      activeBorder: '#93c5fd', dot: 'bg-blue-500', connector: 'bg-blue-300',
    },
    tagline: 'Conventional · FHA · VA · USDA',
    description: 'Standard agency financing for W-2 borrowers with qualifying credit and DTI.',
    stages: [
      {
        id: 1, label: 'Pre-Structure', icon: '📐',
        modules: [
          { key: 'SCENARIO_CREATOR', label: 'Scenario Creator', route: '/scenario-creator', live: true },
          { key: 'QUALIFYING_INTEL', label: 'Qualifying Intel', route: '/qualifying', live: false },
          { key: 'INCOME_ANALYZER', label: 'Income Analyzer', route: '/income', live: false },
          { key: 'ASSET_ANALYZER', label: 'Asset Analyzer', route: '/assets', live: false },
          { key: 'CREDIT_INTEL', label: 'Credit Intel', route: '/credit', live: false },
        ]
      },
      {
        id: 2, label: 'Lender Fit', icon: '🎯',
        modules: [
          { key: 'LENDER_MATCH', label: 'Lender Match™', route: '/lender-match', live: true },
          { key: 'DPA_INTEL', label: 'DPA Intelligence™', route: '/dpa-intelligence', live: true },
          { key: 'AUS_RESCUE', label: 'AUS Rescue™', route: '/aus-rescue', live: true },
          { key: 'PROPERTY_INTEL', label: 'Property Intel', route: '/property', live: false },
          { key: 'TITLE_INTEL', label: 'Title Intel', route: '/title', live: false },
          { key: 'CLOSING_COST_CALC', label: 'Closing Costs', route: '/closing-costs', live: false },
          { key: 'CRA_INTEL', label: 'CRA Intel', route: '/cra', live: false },
        ]
      },
      {
        id: 3, label: 'Final Structure', icon: '⚙️',
        modules: [
          { key: 'RATE_INTEL', label: 'Rate Intel', route: '/rate', live: false },
          { key: 'DISCLOSURE_INTEL', label: 'Disclosures', route: '/disclosures', live: false },
          { key: 'COMPLIANCE_INTEL', label: 'Compliance', route: '/compliance', live: false },
          { key: 'FLOOD_INTEL', label: 'Flood Intel', route: '/flood', live: false },
          { key: 'REHAB_INTEL', label: 'Rehab Intelligence™', route: '/rehab-intelligence', live: true },
        ]
      },
      {
        id: 4, label: 'Verify & Submit', icon: '✅',
        modules: [
          { key: 'DECISION_RECORD', label: 'Decision Record™', route: '/decision-records', live: true },
        ]
      },
    ]
  },

  NONQM: {
    id: 'NONQM',
    label: 'Non-QM Path',
    icon: '🏦',
    color: {
      bg: 'bg-violet-600', light: 'bg-violet-50', border: 'border-violet-300',
      text: 'text-violet-700', activeBg: '#7c3aed', activeLight: '#f5f3ff',
      activeBorder: '#c4b5fd', dot: 'bg-violet-500', connector: 'bg-violet-300',
    },
    tagline: 'Bank Statement · DSCR · Asset Depletion',
    description: 'Portfolio and Non-QM for self-employed, investors, or high-asset borrowers who don\'t fit agency guidelines.',
    stages: [
      {
        id: 1, label: 'Profile & Docs', icon: '📋',
        modules: [
          { key: 'SCENARIO_CREATOR', label: 'Scenario Creator', route: '/scenario-creator', live: true },
          { key: 'INCOME_ANALYZER', label: 'Income Analyzer', route: '/income', live: false, note: 'Bank stmt / P&L' },
          { key: 'ASSET_ANALYZER', label: 'Asset Analyzer', route: '/assets', live: false, note: 'Asset depletion' },
          { key: 'DEBT_CONSOLIDATION', label: 'Debt Consolidation', route: '/debt-consolidation', live: true },
        ]
      },
      {
        id: 2, label: 'Non-QM Fit', icon: '🎯',
        modules: [
          { key: 'LENDER_MATCH', label: 'Lender Match™', route: '/lender-match', live: true, note: 'Non-QM channel' },
          { key: 'LENDER_PROFILE', label: 'Lender Profile Builder', route: '/lender-profile-builder', live: true },
          { key: 'AUS_RESCUE', label: 'AUS Rescue™', route: '/aus-rescue', live: true, note: 'Program migration' },
        ]
      },
      {
        id: 3, label: 'Structure', icon: '⚙️',
        modules: [
          { key: 'RATE_INTEL', label: 'Rate Intel', route: '/rate', live: false, note: 'Non-QM pricing' },
          { key: 'PROPERTY_INTEL', label: 'Property Intel', route: '/property', live: false },
          { key: 'CLOSING_COST_CALC', label: 'Closing Costs', route: '/closing-costs', live: false },
        ]
      },
      {
        id: 4, label: 'Submit', icon: '✅',
        modules: [
          { key: 'DECISION_RECORD', label: 'Decision Record™', route: '/decision-records', live: true },
        ]
      },
    ]
  },

  RESCUE: {
    id: 'RESCUE',
    label: 'Rescue Path',
    icon: '🚨',
    color: {
      bg: 'bg-red-600', light: 'bg-red-50', border: 'border-red-300',
      text: 'text-red-700', activeBg: '#dc2626', activeLight: '#fef2f2',
      activeBorder: '#fca5a5', dot: 'bg-red-500', connector: 'bg-red-300',
    },
    tagline: 'AUS Denial → Rescue → Migration → Re-Submit',
    description: 'AUS returned Refer or Ineligible. Run targeted rescue strategies, evaluate program migration, and re-submit with the best available path.',
    stages: [
      {
        id: 1, label: 'Diagnose', icon: '🔍',
        modules: [
          { key: 'AUS_RESCUE', label: 'AUS Rescue™', route: '/aus-rescue', live: true, note: 'Primary blocker' },
          { key: 'DEBT_CONSOLIDATION', label: 'Debt Consolidation', route: '/debt-consolidation', live: true, note: 'DTI cleanup' },
          { key: 'CREDIT_INTEL', label: 'Credit Intel', route: '/credit', live: false, note: 'Rapid rescore' },
        ]
      },
      {
        id: 2, label: 'Rescue', icon: '🛠️',
        modules: [
          { key: 'AUS_RESCUE_STRAT', label: 'Rescue Strategies', route: '/aus-rescue', live: true, note: '23 ranked' },
          { key: 'INCOME_ANALYZER', label: 'Income Analyzer', route: '/income', live: false },
          { key: 'ASSET_ANALYZER', label: 'Asset Analyzer', route: '/assets', live: false, note: 'Reserves' },
        ]
      },
      {
        id: 3, label: 'Migration', icon: '🔄',
        modules: [
          { key: 'AUS_RESCUE_MIG', label: 'Program Migration', route: '/aus-rescue', live: true, note: '11 programs' },
          { key: 'LENDER_MATCH', label: 'Lender Match™', route: '/lender-match', live: true },
          { key: 'DPA_INTEL', label: 'DPA Intelligence™', route: '/dpa-intelligence', live: true },
        ]
      },
      {
        id: 4, label: 'Re-Submit', icon: '✅',
        modules: [
          { key: 'DISCLOSURE_INTEL', label: 'Disclosures', route: '/disclosures', live: false },
          { key: 'DECISION_RECORD', label: 'Decision Record™', route: '/decision-records', live: true, note: 'Full audit trail' },
        ]
      },
    ]
  }
};

// ─── Auto-detect path ────────────────────────────────────────────────────────
function detectPath(scenario) {
  if (!scenario) return 'AGENCY';
  const dti = parseFloat(scenario.backDti || scenario.dti || 0);
  const credit = parseInt(scenario.creditScore || 0);
  const loanType = (scenario.loanType || '').toUpperCase();
  const isSelfEmployed = scenario.isSelfEmployed || false;
  const isInvestment = (scenario.occupancy || '').toLowerCase().includes('investment');
  const ausFinding = (scenario.ausFinding || '').toLowerCase();

  if (isSelfEmployed || isInvestment || loanType === 'NON_QM') return 'NONQM';
  if (ausFinding.includes('refer') || ausFinding.includes('ineligible') || ausFinding.includes('caution')) return 'RESCUE';
  if (dti > 50 && credit < 620) return 'RESCUE';
  return 'AGENCY';
}

// ─── Horizontal Timeline ─────────────────────────────────────────────────────
function HorizontalTimeline({ path, isActive, scenarioId }) {
  const [activeStage, setActiveStage] = useState(0);
  const color = path.color;
  const stages = path.stages;

  return (
    <div>
      {/* Stage tabs row */}
      <div className="flex items-center mb-0">
        {stages.map((stage, i) => {
          const isSelected = activeStage === i;
          const isPast = i < activeStage;
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              {/* Stage button */}
              <button
                onClick={() => setActiveStage(isSelected ? -1 : i)}
                className={`flex-1 flex flex-col items-center px-2 py-3 rounded-xl border-2 transition-all min-w-0
                  ${isSelected && isActive
                    ? `border-2 shadow-md text-white`
                    : isSelected
                    ? 'border-slate-300 bg-slate-50 text-slate-700 shadow-sm'
                    : 'border-transparent bg-transparent text-slate-500 hover:bg-slate-50'
                  }`}
                style={isSelected && isActive ? { backgroundColor: color.activeBg, borderColor: color.activeBg } : {}}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-1.5 transition-all
                  ${isSelected && isActive ? 'bg-white/20' : isSelected ? 'bg-slate-200' : 'bg-slate-100'}`}>
                  {stage.icon}
                </div>
                <div className={`text-xs font-bold leading-tight text-center
                  ${isSelected && isActive ? 'text-white' : isSelected ? 'text-slate-700' : 'text-slate-400'}`}>
                  <span className="block opacity-60 text-xs font-normal">Stage {stage.id}</span>
                  {stage.label}
                </div>
                <div className={`text-xs mt-1 font-semibold
                  ${isSelected && isActive ? 'text-white/70' : 'text-slate-400'}`}>
                  {stage.modules.filter(m => m.live).length}/{stage.modules.length} live
                </div>
              </button>

              {/* Connector arrow */}
              {i < stages.length - 1 && (
                <div className="flex items-center px-1 shrink-0">
                  <div className={`h-0.5 w-4 ${isActive && i < activeStage ? color.connector : 'bg-slate-200'}`} />
                  <svg width="8" height="12" viewBox="0 0 8 12" className="shrink-0">
                    <path d="M0 0 L8 6 L0 12" fill="none"
                      stroke={isActive && i < activeStage ? color.activeBg : '#cbd5e1'}
                      strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Module list for selected stage */}
      {activeStage >= 0 && (
        <div className={`mt-3 rounded-xl border-2 overflow-hidden`}
          style={{ borderColor: isActive ? color.activeBorder : '#e2e8f0' }}>
          <div className={`px-4 py-2.5 flex items-center gap-2`}
            style={{ backgroundColor: isActive ? color.activeLight : '#f8fafc' }}>
            <span className="text-base">{stages[activeStage].icon}</span>
            <span className={`text-sm font-bold ${isActive ? color.text : 'text-slate-600'}`}>
              Stage {stages[activeStage].id} — {stages[activeStage].label}
            </span>
            <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full
              ${isActive ? `${color.light} ${color.text}` : 'bg-slate-200 text-slate-500'}`}>
              {stages[activeStage].modules.filter(m => m.live).length} live · {stages[activeStage].modules.filter(m => !m.live).length} coming
            </span>
          </div>
          <div className="p-3 bg-white grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stages[activeStage].modules.map(mod => (
              <a
                key={mod.key}
                href={mod.live ? (scenarioId ? `${mod.route}?scenarioId=${scenarioId}` : mod.route) : undefined}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all
                  ${mod.live
                    ? `bg-white border-slate-200 hover:shadow-sm cursor-pointer`
                    : 'bg-slate-50 border-dashed border-slate-200 opacity-60 cursor-default'
                  }`}
                style={mod.live ? { '--hover-border': color.activeBorder } : {}}
                onMouseEnter={e => { if (mod.live) e.currentTarget.style.borderColor = color.activeBorder; }}
                onMouseLeave={e => { if (mod.live) e.currentTarget.style.borderColor = ''; }}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${mod.live ? color.dot : 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-bold truncate ${mod.live ? 'text-slate-800' : 'text-slate-400'}`}>
                    {mod.label}
                  </div>
                  {mod.note && (
                    <div className="text-xs text-slate-400 truncate">{mod.note}</div>
                  )}
                </div>
                {mod.live
                  ? <span className={`text-xs font-bold shrink-0 ${color.text}`}>Open →</span>
                  : <span className="text-xs text-slate-300 font-medium shrink-0">Soon</span>
                }
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Path Card ────────────────────────────────────────────────────────────────
function PathCard({ path, isActive, isOverride, onSelect, scenarioId }) {
  const [expanded, setExpanded] = useState(isActive);
  const color = path.color;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all
      ${isActive ? 'shadow-lg' : 'shadow-sm hover:shadow-md'}`}
      style={{ borderColor: isActive ? color.activeBg : '#e2e8f0' }}>

      {/* Header */}
      <div
        className="px-5 py-4 cursor-pointer flex items-center gap-3"
        style={{ backgroundColor: isActive ? color.activeLight : 'white' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0
          ${isActive ? 'shadow-md' : 'bg-slate-100'}`}
          style={isActive ? { backgroundColor: color.activeBg } : {}}>
          {path.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-black text-base ${isActive ? color.text : 'text-slate-700'}`}>
              {path.label}
            </h3>
            {isActive && !isOverride && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: color.activeBg }}>
                ● Active Path
              </span>
            )}
            {isOverride && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                ✏️ Override
              </span>
            )}
          </div>
          <p className={`text-xs mt-0.5 ${isActive ? color.text : 'text-slate-400'}`}
            style={isActive ? { opacity: 0.75 } : {}}>
            {path.tagline}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isActive && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(path.id); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-all font-semibold"
            >
              Switch
            </button>
          )}
          {isActive && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(null); }}
              className="text-xs px-3 py-1.5 rounded-lg border text-slate-400 hover:text-slate-600 transition-all font-semibold"
              style={{ borderColor: color.activeBorder }}
            >
              {isOverride ? 'Revert' : ''}
            </button>
          )}
          <span className="text-slate-300 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Timeline body */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 bg-white border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">{path.description}</p>
          <HorizontalTimeline path={path} isActive={isActive} scenarioId={scenarioId} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LoanPathGraph({ scenario: propScenario, embedded = false }) {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scenarioIdFromUrl = searchParams.get('scenarioId') || routeId;

  const [scenario, setScenario] = useState(propScenario || null);
  const [loading, setLoading] = useState(!propScenario && !!scenarioIdFromUrl);
  const [activePath, setActivePath] = useState('AGENCY');
  const [overridePath, setOverridePath] = useState(null);

  useEffect(() => {
    if (propScenario) { setScenario(propScenario); return; }
    if (!scenarioIdFromUrl) { setLoading(false); return; }
    getDoc(doc(db, 'scenarios', scenarioIdFromUrl))
      .then(snap => { if (snap.exists()) setScenario({ id: snap.id, ...snap.data() }); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scenarioIdFromUrl, propScenario]);

  useEffect(() => {
    if (scenario) setActivePath(detectPath(scenario));
  }, [scenario]);

  const displayPath = overridePath || activePath;
  const scenarioId = scenario?.id || scenarioIdFromUrl;
  const borrower = scenario
    ? `${scenario.firstName || ''} ${scenario.lastName || ''}`.trim() || scenario.borrowerName || null
    : null;

  const handleOverride = (pathId) => {
    if (!pathId || pathId === activePath) { setOverridePath(null); return; }
    setOverridePath(pathId);
  };

  if (loading) return (
    <div className={`flex items-center justify-center ${embedded ? 'py-8' : 'min-h-screen bg-slate-50'}`}>
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading loan path…</span>
      </div>
    </div>
  );

  return (
    <div className={embedded ? '' : 'min-h-screen bg-slate-50'}>

      {/* Full-screen header */}
      {!embedded && (
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg">
                <span className="text-white font-black text-sm">LG</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-white text-xl font-black">Loan Path Graph™</h1>
                  <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded font-mono">Phase 1</span>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">
                  {borrower ? `${borrower} · ` : ''}3 paths · Stage 1 → 2 → 3 → 4
                </p>
              </div>
            </div>
            {scenarioId && (
              <button onClick={() => navigate(`/scenario/${scenarioId}`)}
                className="text-slate-400 hover:text-white text-sm transition-colors">
                ← Back to Scenario
              </button>
            )}
          </div>
        </div>
      )}

      <div className={embedded ? '' : 'max-w-5xl mx-auto px-6 py-6'}>

        {/* Auto-detect banner */}
        {scenario && activePath && (
          <div className={`rounded-xl border px-4 py-2.5 mb-4 flex items-center gap-3
            ${overridePath ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
            <span className="text-base">{overridePath ? '✏️' : '🤖'}</span>
            <span className="text-xs text-slate-600 flex-1">
              {overridePath
                ? <><strong className="text-amber-700">Path overridden</strong> to {PATHS[overridePath].label} — click Revert to restore auto-detection</>
                : <><strong className="text-slate-700">Auto-detected:</strong> {PATHS[activePath].label}
                  {scenario.isSelfEmployed ? ' — self-employed borrower'
                    : scenario.backDti > 50 ? ` — DTI ${scenario.backDti}%`
                    : ' — based on borrower profile'}
                  . Click Switch on any path to override.</>
              }
            </span>
          </div>
        )}

        {/* Path cards */}
        <div className="space-y-4">
          {Object.values(PATHS).map(path => (
            <PathCard
              key={path.id}
              path={path}
              isActive={displayPath === path.id}
              isOverride={!!overridePath && overridePath === path.id}
              onSelect={handleOverride}
              scenarioId={scenarioId}
            />
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Loan Path Graph™ Phase 1 · 3 paths · 4 stages each · Click any stage to expand modules
        </p>
      </div>
    </div>
  );
}
