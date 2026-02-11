function Home() {
  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-blue-300 font-semibold text-lg mb-3 tracking-wide uppercase">
            For Mortgage Loan Officers
          </p>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Loan Structure Intelligence Platform
          </h1>
          <p className="text-xl md:text-2xl text-blue-200 mb-10 max-w-3xl mx-auto">
            Built by a 39-Year Mortgage Veteran
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button className="bg-white text-blue-900 font-bold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors text-lg">
              Start Your 7-Day Free Trial
            </button>
            <button className="border-2 border-white text-white font-bold px-8 py-3 rounded-lg hover:bg-white/10 transition-colors text-lg">
              View Demo
            </button>
          </div>
          <p className="text-blue-300 text-sm mt-4">$74.99/month after trial</p>
        </div>
      </section>

      {/* Modules Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            10 Powerful Modules
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Everything a mortgage loan officer needs to structure loans with confidence.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <ModuleCard
              title="Bank Statement Intelligence™"
              description="AI-powered bank statement analysis for self-employed borrowers."
              icon="🏦"
              badge="NEW"
              highlight
            />
            <ModuleCard
              title="Scenario Creator™"
              description="Build and compare multiple loan scenarios side by side."
              icon="🔀"
            />
            <ModuleCard
              title="Income Analysis™"
              description="Automated income calculation across all borrower types."
              icon="💰"
            />
            <ModuleCard
              title="Asset Documentation™"
              description="Streamlined asset verification and documentation tracking."
              icon="📋"
            />
            <ModuleCard
              title="DPA Intelligence™"
              description="Down payment assistance program matching and eligibility."
              icon="🏠"
            />
            <ModuleCard
              title="Lender Match™"
              description="Match loan scenarios to the best lender programs instantly."
              icon="🎯"
            />
            <ModuleCard
              title="AUS Rescue™"
              description="Turn AUS denials into approvals with restructuring guidance."
              icon="🛟"
            />
            <ModuleCard
              title="Smart Chat™"
              description="AI assistant trained on mortgage guidelines and overlays."
              icon="💬"
            />
            <ModuleCard
              title="Decision Record™"
              description="Document every structuring decision for compliance and audit."
              icon="📝"
            />
            <ModuleCard
              title="Analytics Dashboard™"
              description="Track performance metrics and pipeline analytics in real time."
              icon="📊"
            />
          </div>
        </div>
      </section>

      {/* Pricing CTA Section */}
      <section className="py-20 bg-blue-900 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Close More Loans?</h2>
          <p className="text-blue-200 text-lg mb-2">
            Get access to all 10 modules. No contracts. Cancel anytime.
          </p>
          <p className="text-blue-300 text-xl font-semibold mb-8">
            $74.99/month after your free 7-day trial
          </p>
          <button className="bg-white text-blue-900 font-bold px-10 py-4 rounded-lg hover:bg-blue-50 transition-colors text-lg">
            Start Your 7-Day Free Trial
          </button>
        </div>
      </section>
    </main>
  )
}

function ModuleCard({ title, description, icon, badge, highlight }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow relative ${
        highlight ? 'border-2 border-red-500' : ''
      }`}
    >
      {badge && (
        <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
          {badge}
        </span>
      )}
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  )
}

export default Home
