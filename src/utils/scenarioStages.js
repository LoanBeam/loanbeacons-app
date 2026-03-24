// ─────────────────────────────────────────────────────────────────────────────
// LoanBeacons — Scenario Stage Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const LB_STAGES = [
  {
    name: 'Qualifying',
    description: 'Running initial modules. Scenario is being built.',
    bg: '#F1EFE8', color: '#444441', border: '#B4B2A9',
    trackStaleness: false,
  },
  {
    name: 'Structuring',
    description: 'Full 17-module run underway.',
    bg: '#E6F1FB', color: '#0C447C', border: '#378ADD',
    trackStaleness: false,
  },
  {
    name: 'Decision Ready',
    description: 'Decision Record sealed. Ready to submit.',
    bg: '#EEEDFE', color: '#3C3489', border: '#7F77DD',
    trackStaleness: false,
  },
  {
    name: 'Submitted',
    description: 'Loan is at the lender. Awaiting decision.',
    bg: '#FAEEDA', color: '#633806', border: '#EF9F27',
    trackStaleness: true,
  },
  {
    name: 'Approved',
    description: 'Lender approved. Tracking to close.',
    bg: '#9FE1CB', color: '#085041', border: '#1D9E75',
    trackStaleness: true,
  },
  {
    name: 'Closed',
    description: 'Funded. Outcome data captured.',
    bg: '#EAF3DE', color: '#27500A', border: '#639922',
    trackStaleness: false,
  },
  {
    name: 'Did Not Close',
    description: 'Declined or withdrawn.',
    bg: '#FCEBEB', color: '#791F1F', border: '#E24B4A',
    trackStaleness: false,
  },
];

export const STAGE_MAP = LB_STAGES.reduce((acc, s) => { acc[s.name] = s; return acc; }, {});
export const STAGE_NAMES = LB_STAGES.map((s) => s.name);

export const PROGRAM_COLORS = {
  Conventional: { bg: '#E6F1FB', color: '#0C447C' },
  FHA:          { bg: '#EEEDFE', color: '#3C3489' },
  VA:           { bg: '#E1F5EE', color: '#085041' },
  USDA:         { bg: '#EAF3DE', color: '#27500A' },
  'Non-QM':     { bg: '#FAECE7', color: '#712B13' },
  'Hard Money': { bg: '#FAEEDA', color: '#412402' },
};

export const DR_COLORS = {
  Active:  '#1D9E75',
  Sealed:  '#1D9E75',
  Pending: '#EF9F27',
  None:    '#B4B2A9',
};

export const ALL_PROGRAMS = [
  'All', 'Conventional', 'FHA', 'VA', 'USDA', 'Non-QM', 'Hard Money',
];

// ─────────────────────────────────────────────────────────────────────────────
// Staleness — only fires on Submitted / Approved
// ─────────────────────────────────────────────────────────────────────────────
export function getStaleness(scenario) {
  const stageDef = STAGE_MAP[scenario.lbStage];
  if (!stageDef?.trackStaleness) return null;

  const ts = scenario.stageUpdatedAt?.toDate?.();
  if (!ts) return null;

  const days = Math.floor((Date.now() - ts.getTime()) / 86400000);
  if (days >= 30) return { tier: 'stale', days, color: '#791F1F', bg: '#FCEBEB' };
  if (days >= 8)  return { tier: 'aging', days, color: '#633806', bg: '#FAEEDA' };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field helpers — aligned to ScenarioList.jsx field names
// ─────────────────────────────────────────────────────────────────────────────
export function getBorrowerName(scenario) {
  const first = scenario.firstName || '';
  const last  = scenario.lastName  || '';
  const full  = `${first} ${last}`.trim();
  return full || scenario.scenarioName || scenario.borrowerName || 'Unnamed Borrower';
}

export function getBorrowerInitials(scenario) {
  const name  = getBorrowerName(scenario);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// loanAmount is the primary field per ScenarioList
export function getLoanAmount(scenario) {
  return scenario.loanAmount || scenario.propertyValue || scenario.purchasePrice || 0;
}

export function formatAmount(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString();
}

// loanType is the program field per ScenarioList
export function getLoanProgram(scenario) {
  return scenario.loanType || scenario.loanProgram || scenario.program || 'Conventional';
}

// loanPurpose is the purpose field per ScenarioList
export function getLoanPurpose(scenario) {
  const raw = scenario.loanPurpose || scenario.purpose || scenario.transactionType || 'Purchase';
  // Normalize underscored values e.g. "rate_term_refinance" -> "Refinance"
  if (raw.toLowerCase().includes('refinanc')) return 'Refinance';
  if (raw.toLowerCase().includes('purchase')) return 'Purchase';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Avatar palette — consistent per borrower name
const AV_PALETTES = [
  { bg: '#E1F5EE', color: '#085041' },
  { bg: '#E6F1FB', color: '#0C447C' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#412402' },
  { bg: '#FAECE7', color: '#712B13' },
  { bg: '#FBEAF0', color: '#72243E' },
];

export function getAvatarColors(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AV_PALETTES[Math.abs(hash) % AV_PALETTES.length];
}

// Resolve lbStage — migrate legacy status/stage values
export function resolveStage(scenario) {
  if (scenario.lbStage && STAGE_MAP[scenario.lbStage]) return scenario.lbStage;
  // Map legacy status field values
  const legacy = {
    'active':          'Structuring',
    'draft':           'Qualifying',
    'archived':        'Did Not Close',
    'App Intake':      'Qualifying',
    'Initial Review':  'Structuring',
    'Underwriting':    'Decision Ready',
    'Clear to Close':  'Approved',
    'Prospect':        'Qualifying',
  };
  return legacy[scenario.status] || legacy[scenario.stage] || 'Qualifying';
}

// moduleCount — check multiple possible field names
export function getModuleCount(scenario) {
  return scenario.completedModules || scenario.moduleCount || scenario.modulesCompleted || 0;
}
