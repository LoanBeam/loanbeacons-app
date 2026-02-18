import { useNavigate } from 'react-router-dom';

const modules = {
  stage1: [
    {
      id: 'scenario-creator',
      title: 'Scenario Creator™',
      icon: '📋',
      description: 'Build your loan scenario. All data flows to every module automatically.',
      badge: null,
      status: 'live',
      path: '/scenario-creator',
      color: 'blue',
    },
    {
      id: 'debt-consolidation',
      title: 'Debt Consolidation Intelligence™',
      icon: '💳',
      description: 'Clean duplicate debts, apply student loan payment rules, and calculate accurate qualifying DTI.',
      badge: 'NEW',
      status: 'live',
      path: '/debt-consolidation',
      color: 'blue',
    },
    {
      id: 'bank-statement',
      title: 'Bank Statement Intelligence™',
      icon: '🏦',
      description: 'Analyze bank statements for self-employed and non-QM borrowers.',
      badge: 'PREMIUM',
      status: 'planned',
      path: null,
      color: 'purple',
    },
    {
      id: 'income-analysis',
      title: 'Income Analysis™',
      icon: '💼',
      description: 'Calculate qualifying income across all documentation types.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'green',
    },
    {
      id: 'asset-documentation',
      title: 'Asset Documentation™',
      icon: '🏧',
      description: 'Verify and document assets for closing and reserves.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'green',
    },
     ],
  stage2: [
    {
      id: 'lender-match',
      title: 'Lender Match™',
      icon: '🎯',
      description: 'Match your scenario to the best lender based on guidelines and pricing.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'blue',
    },
    {
      id: 'dpa-intelligence',
      title: 'DPA Intelligence™',
      icon: '🏠',
      description: 'Find eligible down payment assistance programs for your borrower.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'green',
    },
    {
      id: 'aus-rescue',
      title: 'AUS Rescue™',
      icon: '🚨',
      description: 'Diagnose AUS findings and identify paths to approval.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'red',
    },
    {
      id: 'fha-streamline',
      title: 'FHA Streamline Intelligence™',
      icon: '📋',
      description: 'Eligibility, NTB, MIP analysis, and borrower disclosures for FHA Streamline refis.',
      badge: null,
      status: 'live',
      path: '/fha-streamline',
      color: 'blue',
    },
    {
      id: 'va-irrrl',
      title: 'VA IRRRL Intelligence™',
      icon: '🎖️',
      description: 'Seasoning, NTB, recoupment, funding fee, and Veteran comparison statement for VA IRRRLs.',
      badge: 'NEW',
      status: 'planned',
      path: null,
      color: 'red',
    },
  ],
  stage3: [
    {
      id: 'rate-buydown',
      title: 'Rate Buydown Calculator™',
      icon: '📉',
      description: 'Compare rate options with points, break-even, and long-term savings analysis.',
      badge: null,
      status: 'live',
      path: '/rate-buydown',
      color: 'blue',
    },
    {
      id: 'mi-optimizer',
      title: 'MI Optimizer™',
      icon: '🛡️',
      description: 'Compare Monthly, Single, Split, and Lender-Paid MI options side by side.',
      badge: null,
      status: 'live',
      path: '/mi-optimizer',
      color: 'blue',
    },
    {
      id: 'piggyback',
      title: 'Piggyback 2nd Optimizer™',
      icon: '🏗️',
      description: 'Compare 80/10/10 vs 80/15/5 vs single mortgage with PMI structures.',
      badge: 'NEW',
      status: 'planned',
      path: null,
      color: 'orange',
    },
    {
      id: 'rehab',
      title: 'Rehab Intelligence™',
      icon: '🔨',
      description: 'Structure 203k, HomeStyle, and bridge rehab loans with risk scoring.',
      badge: 'NEW',
      status: 'planned',
      path: null,
      color: 'orange',
    },
    {
      id: 'appraisal',
      title: 'Appraisal Intelligence™',
      icon: '🏡',
      description: 'Appraisal waiver coaching, value risk assessment, and PIW optimization.',
      badge: 'ENHANCED',
      status: 'planned',
      path: null,
      color: 'green',
    },
  ],
  stage4: [
    {
      id: 'checklist',
      title: 'Intelligent Checklist™',
      icon: '✅',
      description: 'Dynamic condition checklist that auto-populates from your scenario data.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'green',
    },
    {
      id: 'decision-record',
      title: 'Decision Record™',
      icon: '📁',
      description: 'Immutable audit trail of every decision, override, and approval in your file.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'blue',
    },
  ],
  additional: [
    {
      id: 'smart-chat',
      title: 'Smart Chat™',
      icon: '💬',
      description: 'AI-powered mortgage assistant trained on guidelines and your scenario data.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'purple',
    },
    {
      id: 'analytics',
      title: 'Analytics Dashboard™',
      icon: '📊',
      description: 'Pipeline performance, conversion metrics, and borrower outcome tracking.',
      badge: null,
      status: 'planned',
      path: null,
      color: 'blue',
    },
  ],
};

const badgeColors = {
  NEW: 'bg-green-100 text-green-800 border border-green-300',
  PREMIUM: 'bg-purple-100 text-purple-800 border border-purple-300',
  ENHANCED: 'bg-blue-100 text-blue-800 border border-blue-300',
};

const stageColors = {
  stage1: { bg: 'bg-blue-50', border: 'border-blue-200', header: 'bg-blue-600', dot: 'bg-blue-500' },
  stage2: { bg: 'bg-indigo-50', border: 'border-indigo-200', header: 'bg-indigo-600', dot: 'bg-indigo-500' },
  stage3: { bg: 'bg-orange-50', border: 'border-orange-200', header: 'bg-orange-600', dot: 'bg-orange-500' },
  stage4: { bg: 'bg-green-50', border: 'border-green-200', header: 'bg-green-600', dot: 'bg-green-500' },
};

function ModuleCard({ module, onClick }) {
  const isLive = module.status === 'live';

  return (
    <div
      onClick={() => isLive && onClick(module.path)}
      className={`
        relative bg-white rounded-xl border-2 p-4 transition-all duration-200
        ${isLive
          ? 'border-blue-200 hover:border-blue-400 hover:shadow-lg cursor-pointer hover:-translate-y-0.5'
          : 'border-gray-200 opacity-70 cursor-not-allowed'
        }
      `}
    >
      {/* Live indicator */}
      {isLive && (
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold text-green-600">LIVE</span>
        </div>
      )}

      {/* Badge */}
      {module.badge && (
        <div className={`absolute top-3 ${isLive ? 'right-16' : 'right-3'} text-xs font-bold px-2 py-0.5 rounded-full ${badgeColors[module.badge]}`}>
          {module.badge}
        </div>
      )}

      {/* Icon + Title */}
      <div className="flex items-start gap-3 mb-2">
        <span className="text-2xl">{module.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-sm leading-tight ${isLive ? 'text-gray-900' : 'text-gray-500'}`}>
            {module.title}
          </h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed ml-9">
        {module.description}
      </p>

      {/* Coming soon */}
      {!isLive && (
        <div className="mt-2 ml-9">
          <span className="text-xs text-gray-400 italic">Coming soon</span>
        </div>
      )}
    </div>
  );
}

function StageSection({ stageKey, title, subtitle, moduleList, onNavigate }) {
  const colors = stageColors[stageKey];
  const liveCount = moduleList.filter(m => m.status === 'live').length;

  return (
    <div className={`rounded-2xl border-2 ${colors.border} overflow-hidden mb-6`}>
      {/* Stage Header */}
      <div className={`${colors.header} px-5 py-3 flex items-center justify-between`}>
        <div>
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">{title}</h2>
          <p className="text-white/80 text-xs mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-white text-xs font-medium">
            {liveCount}/{moduleList.length} Live
          </div>
          <div className="w-20 bg-white/30 rounded-full h-1.5 mt-1">
            <div
              className="bg-white rounded-full h-1.5 transition-all"
              style={{ width: `${moduleList.length > 0 ? (liveCount / moduleList.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Module Grid */}
      <div className={`${colors.bg} p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {moduleList.map(module => (
            <ModuleCard key={module.id} module={module} onClick={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const totalModules = Object.values(modules).flat().length;
  const liveModules = Object.values(modules).flat().filter(m => m.status === 'live').length;
  const progressPct = Math.round((liveModules / totalModules) * 100);

  const handleNavigate = (path) => {
    if (path) navigate(path);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Hero */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 text-white px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                LoanBeacons™
                <span className="ml-2 text-xs font-normal bg-white/20 px-2 py-0.5 rounded-full align-middle">
                  Patent Pending
                </span>
              </h1>
              <p className="text-blue-100 text-sm mt-1">
                Canonical Sequence™ — Loan Structure Intelligence Platform
              </p>
            </div>

            {/* Platform Progress */}
            <div className="bg-white/10 rounded-xl px-5 py-3 min-w-[220px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-blue-100 font-medium">Platform Progress</span>
                <span className="text-sm font-bold text-white">{liveModules}/{totalModules} Modules</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-green-400 rounded-full h-2 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-right text-xs text-blue-100 mt-1">{progressPct}% Complete</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Workflow Intro */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">🧭</span>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">Follow the Canonical Sequence™</h2>
            <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">
              Work through each stage in order. Data you enter in Stage 1 auto-populates into every module below — 
              enter once, use everywhere. Green modules are live and ready to use.
            </p>
          </div>
        </div>

        {/* Stage 1 */}
        <StageSection
          stageKey="stage1"
          title="Stage 1: Pre-Structure & Initial Analysis"
          subtitle="Enter borrower and loan data once — flows to all modules automatically"
          moduleList={modules.stage1}
          onNavigate={handleNavigate}
        />

        {/* Stage 2 */}
        <StageSection
          stageKey="stage2"
          title="Stage 2: Lender Fit & Program Intelligence"
          subtitle="Match loan to the right program and lender before structuring"
          moduleList={modules.stage2}
          onNavigate={handleNavigate}
        />

        {/* Stage 3 */}
        <StageSection
          stageKey="stage3"
          title="Stage 3: Final Structure Optimization"
          subtitle="Optimize rate, MI, piggyback, and property analysis for the best structure"
          moduleList={modules.stage3}
          onNavigate={handleNavigate}
        />

        {/* Stage 4 */}
        <StageSection
          stageKey="stage4"
          title="Stage 4: Verification & Submit"
          subtitle="Final checklist, audit trail, and submission package"
          moduleList={modules.stage4}
          onNavigate={handleNavigate}
        />

        {/* Additional Tools */}
        <div className="rounded-2xl border-2 border-gray-200 overflow-hidden mb-6">
          <div className="bg-gray-700 px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-sm uppercase tracking-wide">Additional Tools</h2>
              <p className="text-white/80 text-xs mt-0.5">AI assistant and analytics across your pipeline</p>
            </div>
          </div>
          <div className="bg-gray-50 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modules.additional.map(module => (
                <ModuleCard key={module.id} module={module} onClick={handleNavigate} />
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {[
            { label: 'Total Modules', value: totalModules, icon: '📦', color: 'text-blue-600' },
            { label: 'Live Now', value: liveModules, icon: '✅', color: 'text-green-600' },
            { label: 'Coming Soon', value: totalModules - liveModules, icon: '🔨', color: 'text-orange-500' },
            { label: 'Platform Progress', value: `${progressPct}%`, icon: '🚀', color: 'text-purple-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <div className="text-xl mb-1">{stat.icon}</div>
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Patent Footer */}
        <div className="text-center mt-6 pb-4">
          <p className="text-xs text-gray-400">
            LoanBeacons™ Canonical Sequence™ — U.S. Provisional Patent Application No. 63/739,290
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            © 2026 LoanBeacons LLC. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
