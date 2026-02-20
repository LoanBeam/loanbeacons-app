import DebtConsolidation from './pages/DebtConsolidation'
import LenderMatch from './modules/LenderMatch'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Dashboard from './components/Dashboard'
import ScenarioCreator from './pages/ScenarioCreator'
import ScenarioList from './pages/ScenarioList'
import ScenarioDetail from './pages/ScenarioDetail'
import RateBuydownCalculator from './pages/RateBuydownCalculator'
import MIOptimizer from './pages/MIOptimizer'
import FHAStreamline from './pages/FHAStreamline'
import DPAIntelligence from './modules/dpa-intelligence/DPAIntelligence'
import AUSRescue from './pages/AUSRescue';
function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scenario-creator" element={<ScenarioCreator />} />
          <Route path="/scenarios" element={<ScenarioList />} />
          <Route path="/scenario/:id" element={<ScenarioDetail />} />
          <Route path="/rate-buydown" element={<RateBuydownCalculator />} />
          <Route path="/mi-optimizer" element={<MIOptimizer />} />
          <Route path="/fha-streamline" element={<FHAStreamline />} /> 
	  <Route path="/debt-consolidation" element={<DebtConsolidation />} />
          <Route path="/lender-match" element={<LenderMatch />} />
          <Route path="/dpa-intelligence" element={<DPAIntelligence />} />
	  <Route path="/aus-rescue" element={<AUSRescue />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  )
}
export default App