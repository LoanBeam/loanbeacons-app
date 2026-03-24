import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScenarios } from '../hooks/useScenarios';
import OutcomeCaptureModal from '../components/scenarios/OutcomeCaptureModal';
import {
  LB_STAGES, STAGE_MAP, STAGE_NAMES, PROGRAM_COLORS, DR_COLORS, ALL_PROGRAMS,
  getStaleness, getBorrowerName, getLoanAmount, getLoanProgram, getLoanPurpose,
  getAvatarColors, formatAmount,
} from '../utils/scenarioStages';
import './ScenariosPage.css';

const ProgPill = ({ program }) => {
  const c = PROGRAM_COLORS[program] || { bg: '#F1EFE8', color: '#444441' };
  return <span className="sp-prog-pill" style={{ background: c.bg, color: c.color }}>{program}</span>;
};

const StagePill = ({ stage }) => {
  const def = STAGE_MAP[stage] || LB_STAGES[0];
  return <span className="sp-stage-pill" style={{ background: def.bg, color: def.color }}>{stage}</span>;
};

const SegBar = ({ count, total = 17 }) => (
  <div className="sp-seg-bar">
    {Array.from({ length: total }, (_, i) => (
      <div key={i} className="sp-seg" style={{
        background: i < count ? '#1D9E75' : i === count && count < total ? '#EF9F27' : '#f0f0ef',
        border: i >= count && !(i === count && count < total) ? '0.5px solid #e8e8e7' : 'none',
      }} />
    ))}
  </div>
);

const MiniSegs = ({ count, total = 17 }) => (
  <div className="sp-mini-segs">
    {Array.from({ length: total }, (_, i) => (
      <div key={i} className="sp-mseg" style={{
        background: i < count ? '#1D9E75' : i === count && count < total ? '#EF9F27' : '#f0f0ef',
      }} />
    ))}
  </div>
);

const Avatar = ({ scenario }) => {
  const name = getBorrowerName(scenario);
  const c = getAvatarColors(name);
  const initials = (() => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  })();
  return <div className="sp-avatar" style={{ background: c.bg, color: c.color }}>{initials}</div>;
};

// ─── Page-level dropdown menu (escapes card stacking context) ─────────────────
const MORE_MENU_ITEMS = (id) => [
  { label: 'View scenario',     path: `/scenario/${id}` },
  { label: 'Edit scenario',     path: `/scenario-creator/${id}` },
  { label: 'AUS Rescue',        path: `/aus-rescue?scenarioId=${id}` },
  { label: 'Lender Match',      path: `/lender-match?scenarioId=${id}` },
  { label: 'Decision Record',   path: `/decision-records?scenarioId=${id}` },
  { label: 'DPA Intelligence',  path: `/dpa-intelligence?scenarioId=${id}` },
  { label: 'Mark Did Not Close', path: null, danger: true },
];

export default function ScenariosPage() {
  const navigate = useNavigate();
  const { scenarios, loading, error, stats, updateStage, captureOutcome } = useScenarios();

  const [view,        setView]        = useState('cards');
  const [sortBy,      setSortBy]      = useState('recent');
  const [stageFilter, setStageFilter] = useState('All');
  const [progFilter,  setProgFilter]  = useState('All');
  const [search,      setSearch]      = useState('');
  const [closingId,   setClosingId]   = useState(null);
  const [menu,        setMenu]        = useState(null); // { scenarioId, top, left }

  const handlePageClick = useCallback(() => setMenu(null), []);

  function openMoreMenu(e, scenario) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu(prev =>
      prev?.scenarioId === scenario.id ? null : {
        scenarioId: scenario.id,
        scenario,
        top:  rect.bottom + window.scrollY + 6,
        left: Math.max(8, rect.right + window.scrollX - 190),
      }
    );
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scenarios
      .filter((s) => {
        if (q) {
          const name    = getBorrowerName(s).toLowerCase();
          const program = getLoanProgram(s).toLowerCase();
          const note    = (s.note || s.scenarioNote || '').toLowerCase();
          if (!name.includes(q) && !s.id?.toLowerCase().includes(q) &&
              !program.includes(q) && !note.includes(q) &&
              !s.lbStage?.toLowerCase().includes(q)) return false;
        }
        if (stageFilter !== 'All' && s.lbStage !== stageFilter) return false;
        if (progFilter  !== 'All' && getLoanProgram(s) !== progFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name')   return getBorrowerName(a).localeCompare(getBorrowerName(b));
        if (sortBy === 'amount') return getLoanAmount(b) - getLoanAmount(a);
        return 0;
      });
  }, [scenarios, search, stageFilter, progFilter, sortBy]);

  const openScenario = useCallback((s) => navigate(`/scenario/${s.id}`), [navigate]);

  const closingScenario = scenarios.find((s) => s.id === closingId);

  async function handleConfirmClose(outcomeData) {
    await captureOutcome(closingId, outcomeData);
    setClosingId(null);
  }

  function chipClass(value, type) {
    const active = type === 'stage' ? stageFilter === value : progFilter === value;
    if (!active) return 'sp-chip';
    if (value === 'Non-QM')     return 'sp-chip on-nonqm';
    if (value === 'Hard Money') return 'sp-chip on-hm';
    return 'sp-chip on';
  }

  // ── Card action buttons ──────────────────────────────────────────────────
  function CardActions({ s }) {
    const isClosed   = s.lbStage === 'Closed';
    const isApproved = s.lbStage === 'Approved';
    return (
      <div className="sp-qa-row" onClick={(e) => e.stopPropagation()}>
        {isApproved ? (
          <button className="sp-qa close-btn" onClick={() => setClosingId(s.id)}>
            ✓ Mark Closed
          </button>
        ) : !isClosed ? (
          <button className="sp-qa sp-qa-open" onClick={() => openScenario(s)}>
            Open
          </button>
        ) : null}
        {!isClosed && (
          <button
            className="sp-qa sp-qa-ae"
            onClick={() => navigate(`/dpa-intelligence?scenarioId=${s.id}`)}
          >
            AE Share
          </button>
        )}
        {!isClosed && (
          <button
            className="sp-qa sp-qa-aus"
            onClick={() => navigate(`/aus-rescue?scenarioId=${s.id}`)}
          >
            AUS
          </button>
        )}
        <button
          className="sp-qa sp-qa-more"
          onClick={(e) => openMoreMenu(e, s)}
        >
          ···
        </button>
      </div>
    );
  }

  // ── Single card ──────────────────────────────────────────────────────────
  function renderCard(s) {
    const stale    = getStaleness(s);
    const isClosed = s.lbStage === 'Closed';
    const program  = getLoanProgram(s);
    const purpose  = getLoanPurpose(s);
    const amount   = getLoanAmount(s);
    const modules  = s.moduleCount || 0;
    const pct      = Math.round((modules / 17) * 100);
    const drStatus = s.drStatus || 'None';
    const stageDef = STAGE_MAP[s.lbStage] || LB_STAGES[0];
    const isAlt    = program === 'Non-QM' || program === 'Hard Money';
    const progClr  = PROGRAM_COLORS[program] || { bg: '#F1EFE8', color: '#444441' };
    const note     = s.note || s.scenarioNote || '';
    const stars    = isClosed && s.closedOutcome
      ? '▪'.repeat(s.closedOutcome.accuracyRating || 0) + '▫'.repeat(5 - (s.closedOutcome.accuracyRating || 0))
      : '';

    return (
      <div
        key={s.id}
        className={`sp-card${isClosed ? ' closed' : ''}${stale?.tier === 'stale' ? ' stale-red' : ''}`}
        style={{
          borderLeftColor: stageDef.border,
          ...(isAlt ? { borderTop: `2px solid ${progClr.color}` } : {}),
        }}
        onClick={() => openScenario(s)}
      >
        <div className="sp-card-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <Avatar scenario={s} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sp-card-name">{getBorrowerName(s)}</div>
              <div className="sp-card-id">{s.id}</div>
            </div>
          </div>
          <StagePill stage={s.lbStage} />
        </div>

        <div className="sp-card-chips">
          <span className="sp-meta-chip">{purpose}</span>
          <ProgPill program={program} />
          {s.ltv  && <span className="sp-meta-chip">{s.ltv} LTV</span>}
          {s.frontDti && <span className="sp-meta-chip">DTI {s.frontDti}%</span>}
          {note && (
            <span className="sp-meta-chip" style={{ background: progClr.bg, color: progClr.color, border: 'none' }}>
              {note}
            </span>
          )}
        </div>

        {!isClosed && (
          <div className="sp-card-mid">
            <div className="sp-prog-head">
              <span className="sp-prog-lbl">Module progress</span>
              <span className="sp-prog-val">{modules}/17 &nbsp;{pct}%</span>
            </div>
            <SegBar count={modules} />
          </div>
        )}

        {stale && (
          <div className="sp-stale-banner" style={{ background: stale.bg, color: stale.color }}>
            ⚠ {stale.days} day{stale.days !== 1 ? 's' : ''} since last update
            {stale.tier === 'stale' ? ' — action needed' : ''}
          </div>
        )}

        {isClosed && s.closedOutcome && (
          <div className="sp-closed-outcome">
            <div style={{ fontSize: 11, fontWeight: 600, color: '#3B6D11', marginBottom: 5 }}>
              Outcome — {s.closedOutcome.closeDate || 'Closed'}
            </div>
            <div className="sp-co-row"><span className="sp-co-lbl">Lender</span><span className="sp-co-val">{s.closedOutcome.lenderUsed || '—'}</span></div>
            <div className="sp-co-row"><span className="sp-co-lbl">Program</span><span className="sp-co-val">{s.closedOutcome.programAtClose || program}</span></div>
            <div className="sp-co-row"><span className="sp-co-lbl">AUS 1st sub</span><span className="sp-co-val">{s.closedOutcome.ausFirstSub || '—'}</span></div>
            <div style={{ marginTop: 5, fontSize: 11, color: '#3B6D11' }}>
              Accuracy: <span className="sp-co-rating">{stars}</span>
            </div>
          </div>
        )}

        <div className="sp-card-bot">
          <div>
            <div className="sp-amt">{formatAmount(amount)} <span className="sp-amt-sub">{purpose.toLowerCase()}</span></div>
            {!isClosed && (
              <div className="sp-dr-row">
                <div className="sp-dr-dot" style={{ background: DR_COLORS[drStatus] || '#B4B2A9' }} />
                Decision Record: {drStatus}
              </div>
            )}
          </div>
          <CardActions s={s} />
        </div>
      </div>
    );
  }

  // ── Cards view ────────────────────────────────────────────────────────────
  function renderCards() {
    if (!filtered.length) return <EmptyState />;
    return <div className="sp-cards-grid">{filtered.map(renderCard)}</div>;
  }

  // ── List view ─────────────────────────────────────────────────────────────
  function renderList() {
    if (!filtered.length) return <EmptyState />;
    return (
      <div className="sp-list-wrap">
        <div className="sp-list-head">
          <div className="sp-lh" />
          <div className="sp-lh" onClick={() => setSortBy('name')}>Borrower {sortBy === 'name' ? '↑' : ''}</div>
          <div className="sp-lh">Purpose</div>
          <div className="sp-lh" onClick={() => setSortBy('amount')}>Amount {sortBy === 'amount' ? '↓' : ''}</div>
          <div className="sp-lh">Program</div>
          <div className="sp-lh">Stage</div>
          <div className="sp-lh">Modules (17)</div>
          <div className="sp-lh">Actions</div>
        </div>
        {filtered.map((s) => {
          const stale   = getStaleness(s);
          const program = getLoanProgram(s);
          const purpose = getLoanPurpose(s);
          const amount  = getLoanAmount(s);
          const modules = s.moduleCount || 0;
          const pct     = Math.round((modules / 17) * 100);
          const note    = s.note || s.scenarioNote || '';
          return (
            <div
              key={s.id}
              className={`sp-lrow${stale?.tier === 'stale' ? ' stale-red' : ''}`}
              onClick={() => openScenario(s)}
            >
              <div className="sp-lc"><Avatar scenario={s} /></div>
              <div className="sp-lc">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getBorrowerName(s)}</div>
                <div style={{ fontSize: 11, color: '#B4B2A9' }}>{s.id}</div>
              </div>
              <div className="sp-lc"><span className="sp-meta-chip">{purpose}</span></div>
              <div className="sp-lc">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2A' }}>{formatAmount(amount)}</div>
                <div style={{ fontSize: 11, color: '#B4B2A9' }}>{s.ltv ? `${s.ltv} LTV` : ''}</div>
              </div>
              <div className="sp-lc">
                <ProgPill program={program} />
                {note && <div style={{ fontSize: 10, color: '#B4B2A9', marginTop: 2 }}>{note}</div>}
              </div>
              <div className="sp-lc">
                <StagePill stage={s.lbStage} />
                {stale && <div style={{ fontSize: 10, color: stale.color, marginTop: 3 }}>⚠ {stale.days}d stale</div>}
              </div>
              <div className="sp-lc">
                <MiniSegs count={modules} />
                <div style={{ fontSize: 11, color: '#B4B2A9', marginTop: 3 }}>{modules}/17 · {pct}%</div>
              </div>
              <div className="sp-lc" onClick={(e) => e.stopPropagation()}>
                <div className="sp-qa-row">
                  {s.lbStage === 'Approved' ? (
                    <button className="sp-qa close-btn" onClick={() => setClosingId(s.id)}>✓ Close</button>
                  ) : (
                    <button className="sp-qa sp-qa-open" onClick={() => openScenario(s)}>Open</button>
                  )}
                  <button className="sp-qa sp-qa-ae" onClick={() => navigate(`/dpa-intelligence?scenarioId=${s.id}`)}>AE</button>
                  <button className="sp-qa sp-qa-aus" onClick={() => navigate(`/aus-rescue?scenarioId=${s.id}`)}>AUS</button>
                  <button className="sp-qa sp-qa-more" onClick={(e) => openMoreMenu(e, s)}>···</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Pipeline view ─────────────────────────────────────────────────────────
  function renderPipeline() {
    return (
      <div className="sp-pipe-wrap">
        <div className="sp-pipe-grid">
          {LB_STAGES.map((stageDef) => {
            const cards    = filtered.filter((s) => s.lbStage === stageDef.name);
            const colTotal = cards.reduce((sum, s) => sum + getLoanAmount(s), 0);
            return (
              <div key={stageDef.name} className="sp-pcol">
                <div className="sp-pcol-head">
                  <div className="sp-pct">
                    <span className="sp-pcn">{stageDef.name}</span>
                    <span className="sp-pcc" style={{ background: stageDef.bg, color: stageDef.color }}>{cards.length}</span>
                  </div>
                  <div className="sp-pca">{colTotal > 0 ? formatAmount(colTotal) : '—'}</div>
                  <div className="sp-pcol-bar" style={{ background: stageDef.border }} />
                </div>
                {cards.length === 0 && (
                  <div style={{ fontSize: 11, color: '#B4B2A9', textAlign: 'center', paddingTop: 16 }}>Empty</div>
                )}
                {cards.map((s) => {
                  const stale   = getStaleness(s);
                  const program = getLoanProgram(s);
                  const modules = s.moduleCount || 0;
                  const pct     = Math.round((modules / 17) * 100);
                  return (
                    <div
                      key={s.id}
                      className={`sp-pcard${stale?.tier === 'stale' ? ' stale-red' : ''}`}
                      style={{ borderLeftColor: stageDef.border }}
                      onClick={() => openScenario(s)}
                    >
                      <div className="sp-pc-name">{getBorrowerName(s)}</div>
                      <div className="sp-pc-id">{s.id}</div>
                      <div style={{ marginBottom: 5 }}><ProgPill program={program} /></div>
                      <div className="sp-pc-segs">
                        {Array.from({ length: 17 }, (_, i) => (
                          <div key={i} className="sp-pc-seg" style={{
                            background: i < modules ? '#1D9E75' : i === modules && modules < 17 ? '#EF9F27' : '#f0f0ef',
                          }} />
                        ))}
                      </div>
                      <div className="sp-pc-footer">
                        <span className="sp-pc-pct">{pct}%</span>
                        <span className="sp-pc-amt">{formatAmount(getLoanAmount(s))}</span>
                      </div>
                      {stale && <div className="sp-pc-stale" style={{ color: stale.color }}>⚠ {stale.days}d stale</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function EmptyState() {
    return (
      <div className="sp-empty">
        <div>No scenarios match your search or filters</div>
        <div className="sp-empty-hint">Try adjusting the stage, program, or search term above</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sp-page">
        <div className="sp-empty"><div>Error loading scenarios</div><div className="sp-empty-hint">{error}</div></div>
      </div>
    );
  }

  return (
    <div className="sp-page" onClick={handlePageClick}>

      {/* Stats bar */}
      <div className="sp-stats">
        {[
          { dot: '#1D9E75', num: stats.total,           label: 'Total scenarios'    },
          { dot: '#378ADD', num: stats.inProgress,       label: 'In progress'        },
          stats.nonQM     > 0 ? { dot: '#D85A30', num: stats.nonQM,     label: 'Non-QM'      } : null,
          stats.hardMoney > 0 ? { dot: '#BA7517', num: stats.hardMoney, label: 'Hard Money'  } : null,
          stats.staleCount > 0 ? { dot: '#E24B4A', num: stats.staleCount, label: 'Stale — need update' } : null,
          { dot: '#7F77DD', num: stats.decisionRecords,  label: 'Decision Records'   },
          { dot: '#B4B2A9', num: formatAmount(stats.pipeline), label: 'Pipeline value' },
        ].filter(Boolean).map((item) => (
          <div key={item.label} className="sp-stat">
            <div className="sp-stat-dot" style={{ background: item.dot }} />
            <div><div className="sp-stat-num">{item.num}</div><div className="sp-stat-label">{item.label}</div></div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="sp-toolbar">
        <div className="sp-view-group">
          {[{ key: 'cards', label: 'Cards' }, { key: 'list', label: 'List' }, { key: 'pipeline', label: 'Pipeline' }].map(({ key, label }) => (
            <button key={key} className={`sp-vbtn${view === key ? ' on' : ''}`} onClick={() => setView(key)}>{label}</button>
          ))}
        </div>
        <div className="sp-search-wrap">
          <span className="sp-search-icon">⌕</span>
          <input
            className="sp-search"
            placeholder="Search borrower, ID, program, note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sp-sort-group">
          <span className="sp-sort-label">Sort:</span>
          {[{ key: 'recent', label: 'Recent' }, { key: 'name', label: 'A–Z' }, { key: 'amount', label: '$ High–Low' }].map(({ key, label }) => (
            <button key={key} className={`sp-sbtn${sortBy === key ? ' on' : ''}`} onClick={() => setSortBy(key)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="sp-filters">
        <span className="sp-filter-label">Stage</span>
        <div className="sp-filter-chips">
          {['All', ...STAGE_NAMES].map((s) => (
            <button key={s} className={chipClass(s, 'stage')} onClick={() => setStageFilter(s)}>{s}</button>
          ))}
        </div>
        <div className="sp-fdiv" />
        <span className="sp-filter-label">Program</span>
        <div className="sp-filter-chips">
          {ALL_PROGRAMS.map((p) => (
            <button key={p} className={chipClass(p, 'prog')} onClick={() => setProgFilter(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* Staleness legend */}
      <div className="sp-stale-strip">
        {[
          { dot: '#1D9E75', label: 'Fresh — updated within 7 days' },
          { dot: '#BA7517', label: 'Aging — 8–29 days' },
          { dot: '#E24B4A', label: 'Stale — 30+ days, action needed' },
          { dot: '#639922', label: 'Closed — outcome captured' },
        ].map(({ dot, label }) => (
          <div key={label} className="sp-stale-item"><div className="sp-stale-dot" style={{ background: dot }} />{label}</div>
        ))}
        <span className="sp-results">{filtered.length} of {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Content */}
      <div className="sp-content">
        {loading ? (
          <div className="sp-loading">
            <div className="sp-loading-dot" /><div className="sp-loading-dot" /><div className="sp-loading-dot" />
          </div>
        ) : view === 'cards' ? renderCards() : view === 'list' ? renderList() : renderPipeline()}
      </div>

      {/* Page-level ··· dropdown — renders outside card stacking context */}
      {menu && (
        <div
          style={{
            position: 'absolute', top: menu.top, left: menu.left,
            background: '#fff', border: '0.5px solid #d1d1d0', borderRadius: 10,
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)', minWidth: 190, zIndex: 9999,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {MORE_MENU_ITEMS(menu.scenarioId).map(({ label, path, danger }) => (
            <button
              key={label}
              onClick={() => {
                if (!path) {
                  updateStage(menu.scenarioId, 'Did Not Close');
                } else {
                  navigate(path);
                }
                setMenu(null);
              }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                background: 'transparent', border: 'none', borderBottom: '0.5px solid #f0f0ef',
                cursor: 'pointer', fontSize: 13, color: danger ? '#791F1F' : '#2C2C2A',
                fontFamily: 'inherit', fontWeight: danger ? 500 : 400,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f4'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Outcome Capture Modal */}
      {closingId && closingScenario && (
        <OutcomeCaptureModal
          scenario={closingScenario}
          onConfirm={handleConfirmClose}
          onCancel={() => setClosingId(null)}
        />
      )}
    </div>
  );
}
