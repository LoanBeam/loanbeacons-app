import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Dashboard from './components/Dashboard'
import ScenarioCreator from './pages/ScenarioCreator'
import ScenarioList from './pages/ScenarioList'
import ScenarioDetail from './pages/ScenarioDetail'
import RateBuydownCalculator from './pages/RateBuydownCalculator'
import MIOptimizer from './pages/MIOptimizer'
import FHAStreamline from './pages/FHAStreamline'
import DebtConsolidation from './pages/DebtConsolidation'
import AUSRescue from './pages/AUSRescue'
import RehabIntelligence from './modules/RehabIntelligence';
import Admin from './pages/Admin'
import AESharePage from './pages/AESharePage'
import LenderMatch from './modules/LenderMatch'
import DPAIntelligence from './modules/dpa-intelligence/DPAIntelligence'
import VAIRRRLIntelligence from './modules/VAIRRRLIntelligence'
import USDAIntelligence from './modules/USDAIntelligence'
import ARMStructureIntelligence from './modules/ARMStructureIntelligence'
import LenderIntakeForm from './modules/LenderIntakeForm'
import LenderProfileBuilder from './modules/LenderProfileBuilder'
import DecisionRecordDashboard from './modules/DecisionRecord/DecisionRecordDashboard'
import DecisionRecordDetail from './modules/DecisionRecord/DecisionRecordDetail'

const STANDALONE_ROUTES = ['/ae-share']

function AppShell() {
  const location = useLocation()
  const isStandalone = STANDALONE_ROUTES.some(r => location.pathname.startsWith(r))

  return (
    <div className="min-h-screen flex flex-col">
      {!isStandalone && <Navbar />}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scenario-creator" element={<ScenarioCreator />} />
        <Route path="/scenario-creator/:id" element={<ScenarioCreator />} />
        <Route path="/scenarios" element={<ScenarioList />} />
        <Route path="/scenario/:id" element={<ScenarioDetail />} />
        <Route path="/rate-buydown" element={<RateBuydownCalculator />} />
        <Route path="/mi-optimizer" element={<MIOptimizer />} />
        <Route path="/fha-streamline" element={<FHAStreamline />} />
        <Route path="/debt-consolidation" element={<DebtConsolidation />} />
        <Route path="/lender-match" element={<LenderMatch />} />
        <Route path="/dpa-intelligence" element={<DPAIntelligence />} />
        <Route path="/aus-rescue" element={<AUSRescue />} />
        <Route path="/rehab-intelligence" element={<RehabIntelligence />} />
        <Route path="/va-irrrl" element={<VAIRRRLIntelligence />} />
        <Route path="/usda-intelligence" element={<USDAIntelligence />} />
        <Route path="/arm-structure" element={<ARMStructureIntelligence />} />
        <Route path="/lender-profile-builder" element={<LenderProfileBuilder />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/lender-intake" element={<LenderIntakeForm />} />
        <Route path="/lender-intake/:token" element={<LenderIntakeForm />} />
        <Route path="/ae-share/:token" element={<AESharePage />} />
        <Route path="/decision-records" element={<DecisionRecordDashboard />} />
<Route path="/decision-records/:id" element={<DecisionRecordDetail />} />
      </Routes>
      {!isStandalone && <Footer />}
    </div>
  )
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  )
}

export default App