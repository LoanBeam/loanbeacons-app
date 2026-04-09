import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Dashboard from './components/Dashboard'
import ScenarioCreator from './pages/ScenarioCreator'
import ScenariosPage from './pages/ScenariosPage'
import ScenarioDetail from './pages/ScenarioDetail'
import RateBuydownCalculator from './pages/RateBuydownCalculator'
import MIOptimizer from './pages/MIOptimizer'
import FHAStreamline from './pages/FHAStreamline'
import DebtConsolidation from './pages/DebtConsolidation'
import AUSRescue from './pages/AUSRescue'
import RehabIntelligence from './modules/RehabIntelligence';
import Admin from './pages/Admin'
import AESharePage from './pages/AESharePage'
import ProcessorSharePage from './pages/ProcessorSharePage'
import LenderMatch from './modules/LenderMatch'
import DPAIntelligence from './modules/DPAIntelligence';
import VAIRRRL from './modules/VAIRRRL'
import USDAIntelligence from './modules/USDAIntelligence'
import ARMStructureIntelligence from './modules/ARMStructureIntelligence'
import LenderIntakeForm from './modules/LenderIntakeForm'
import LenderProfileBuilder from './modules/LenderProfileBuilder'
import DecisionRecordDashboard from './modules/DecisionRecord/DecisionRecordDashboard'
import DecisionRecordDetail from './modules/DecisionRecord/DecisionRecordDetail'
import LoanPathGraph from './components/LoanPathGraph'
import QualifyingIntel from './pages/QualifyingIntel'
import IncomeAnalyzer from './pages/IncomeAnalyzer'
import AssetAnalyzer from './pages/AssetAnalyzer'
import CreditIntel from './pages/CreditIntel'
import PropertyIntel from './pages/PropertyIntel'
import TitleIntel from './pages/TitleIntel'
import ClosingCostCalc from './pages/ClosingCostCalc'
import RateIntel from './pages/RateIntel'
import IntelligentChecklist from './pages/IntelligentChecklist'
import PiggybackOptimizer from './pages/PiggybackOptimizer'
import DisclosureIntel from './pages/DisclosureIntel'
import ComplianceIntel from './pages/ComplianceIntel'
import FloodIntel from './pages/FloodIntel'
import BankStatementIntel from './pages/BankStatementIntel'

const STANDALONE_ROUTES = ['/ae-share', '/processor-share']

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
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/scenario/:id" element={<ScenarioDetail />} />
        <Route path="/rate-buydown" element={<RateBuydownCalculator />} />
        <Route path="/mi-optimizer" element={<MIOptimizer />} />
        <Route path="/fha-streamline" element={<FHAStreamline />} />
        <Route path="/debt-consolidation" element={<DebtConsolidation />} />
        <Route path="/lender-match" element={<LenderMatch />} />
        <Route path="/dpa-intelligence" element={<DPAIntelligence />} />
        <Route path="/aus-rescue" element={<AUSRescue />} />
        <Route path="/rehab-intelligence" element={<RehabIntelligence />} />
        <Route path="/va-irrrl" element={<VAIRRRL />} />
        <Route path="/usda-intelligence" element={<USDAIntelligence />} />
        <Route path="/arm-structure" element={<ARMStructureIntelligence />} />
        <Route path="/lender-profile-builder" element={<LenderProfileBuilder />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/lender-intake" element={<LenderIntakeForm />} />
        <Route path="/lender-intake/:token" element={<LenderIntakeForm />} />
        <Route path="/processor-share/:token" element={<ProcessorSharePage />} />
        <Route path="/ae-share/:token" element={<AESharePage />} />
        <Route path="/decision-records" element={<DecisionRecordDashboard />} />
        <Route path="/decision-records/:id" element={<DecisionRecordDetail />} />
        <Route path="/loan-path-graph" element={<LoanPathGraph />} />
        <Route path="/loan-path-graph/:id" element={<LoanPathGraph />} />
        <Route path="/qualifying-intel" element={<QualifyingIntel />} />
        <Route path="/income-analyzer" element={<IncomeAnalyzer />} />
        <Route path="/asset-analyzer" element={<AssetAnalyzer />} />
        <Route path="/credit-intel" element={<CreditIntel />} />
        <Route path="/property-intel" element={<PropertyIntel />} />
        <Route path="/title-intel" element={<TitleIntel />} />
        <Route path="/closing-cost-calc" element={<ClosingCostCalc />} />
        <Route path="/rate-intel" element={<RateIntel />} />
        <Route path="/disclosure-intel" element={<DisclosureIntel />} />
        <Route path="/compliance-intel" element={<ComplianceIntel />} />
        <Route path="/flood-intel" element={<FloodIntel />} />
        <Route path="/intelligent-checklist" element={<IntelligentChecklist />} />
        <Route path="/piggyback-optimizer" element={<PiggybackOptimizer />} />
        <Route path="/bank-statement-intel" element={<BankStatementIntel />} />
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
