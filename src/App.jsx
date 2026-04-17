import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase/config'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import LoginAcknowledgment from './components/LoginAcknowledgment'
import Dashboard from './components/Dashboard'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import ScenarioCreator from './pages/ScenarioCreator'
import ScenariosPage from './pages/ScenariosPage'
import ScenarioDetail from './pages/ScenarioDetail'
import RateBuydownCalculator from './pages/RateBuydownCalculator'
import MIOptimizer from './pages/MIOptimizer'
import FHAStreamline from './pages/FHAStreamline'
import DebtConsolidation from './pages/DebtConsolidation'
import AUSRescue from './pages/AUSRescue'
import RehabIntelligence from './modules/RehabIntelligence'
import Admin from './pages/Admin'
import AESharePage from './pages/AESharePage'
import ProcessorSharePage from './pages/ProcessorSharePage'
import LenderMatch from './modules/LenderMatch'
import DPAIntelligence from './modules/DPAIntelligence'
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
import ConventionalRefiIntel from './pages/ConventionalRefiIntel'

const STANDALONE_ROUTES = ['/ae-share', '/processor-share', '/login', '/signup']

function AppShell() {
  const location = useLocation()
  const { user } = useAuth()
  const isStandalone = STANDALONE_ROUTES.some(r => location.pathname.startsWith(r))

  const [termsAcknowledged, setTermsAcknowledged] = useState(null) // null = checking

  useEffect(() => {
    if (!user) {
      setTermsAcknowledged(null)
      return
    }
    const check = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (snap.exists() && snap.data().acknowledgedTerms === true) {
          setTermsAcknowledged(true)
        } else {
          setTermsAcknowledged(false)
        }
      } catch (err) {
        console.error('Ack check failed:', err)
        setTermsAcknowledged(false)
      }
    }
    check()
  }, [user])

  // Show spinner while checking ack status for logged-in user
  if (user && !isStandalone && termsAcknowledged === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Show acknowledgment gate if user is logged in but hasn't agreed yet
  if (user && !isStandalone && termsAcknowledged === false) {
    return (
      <LoginAcknowledgment
        user={user}
        onAcknowledged={() => setTermsAcknowledged(true)}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {!isStandalone && <Navbar />}
      <Routes>

        {/* -- Public routes -- */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/ae-share/:token" element={<AESharePage />} />
        <Route path="/processor-share/:token" element={<ProcessorSharePage />} />
        <Route path="/lender-intake" element={<LenderIntakeForm />} />
        <Route path="/lender-intake/:token" element={<LenderIntakeForm />} />

        {/* -- Protected routes -- */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/scenario-creator" element={<ProtectedRoute><ScenarioCreator /></ProtectedRoute>} />
        <Route path="/scenario-creator/:id" element={<ProtectedRoute><ScenarioCreator /></ProtectedRoute>} />
        <Route path="/scenarios" element={<ProtectedRoute><ScenariosPage /></ProtectedRoute>} />
        <Route path="/scenario/:id" element={<ProtectedRoute><ScenarioDetail /></ProtectedRoute>} />
        <Route path="/qualifying-intel" element={<ProtectedRoute><QualifyingIntel /></ProtectedRoute>} />
        <Route path="/income-analyzer" element={<ProtectedRoute><IncomeAnalyzer /></ProtectedRoute>} />
        <Route path="/asset-analyzer" element={<ProtectedRoute><AssetAnalyzer /></ProtectedRoute>} />
        <Route path="/credit-intel" element={<ProtectedRoute><CreditIntel /></ProtectedRoute>} />
        <Route path="/bank-statement-intel" element={<ProtectedRoute><BankStatementIntel /></ProtectedRoute>} />
        <Route path="/debt-consolidation" element={<ProtectedRoute><DebtConsolidation /></ProtectedRoute>} />
        <Route path="/lender-match" element={<ProtectedRoute><LenderMatch /></ProtectedRoute>} />
        <Route path="/dpa-intelligence" element={<ProtectedRoute><DPAIntelligence /></ProtectedRoute>} />
        <Route path="/aus-rescue" element={<ProtectedRoute><AUSRescue /></ProtectedRoute>} />
        <Route path="/fha-streamline" element={<ProtectedRoute><FHAStreamline /></ProtectedRoute>} />
        <Route path="/va-irrrl" element={<ProtectedRoute><VAIRRRL /></ProtectedRoute>} />
        <Route path="/usda-intelligence" element={<ProtectedRoute><USDAIntelligence /></ProtectedRoute>} />
        <Route path="/conventional-refi" element={<ProtectedRoute><ConventionalRefiIntel /></ProtectedRoute>} />
        <Route path="/rate-buydown" element={<ProtectedRoute><RateBuydownCalculator /></ProtectedRoute>} />
        <Route path="/mi-optimizer" element={<ProtectedRoute><MIOptimizer /></ProtectedRoute>} />
        <Route path="/arm-structure" element={<ProtectedRoute><ARMStructureIntelligence /></ProtectedRoute>} />
        <Route path="/rehab-intelligence" element={<ProtectedRoute><RehabIntelligence /></ProtectedRoute>} />
        <Route path="/rate-intel" element={<ProtectedRoute><RateIntel /></ProtectedRoute>} />
        <Route path="/closing-cost-calc" element={<ProtectedRoute><ClosingCostCalc /></ProtectedRoute>} />
        <Route path="/property-intel" element={<ProtectedRoute><PropertyIntel /></ProtectedRoute>} />
        <Route path="/piggyback-optimizer" element={<ProtectedRoute><PiggybackOptimizer /></ProtectedRoute>} />
        <Route path="/title-intel" element={<ProtectedRoute><TitleIntel /></ProtectedRoute>} />
        <Route path="/disclosure-intel" element={<ProtectedRoute><DisclosureIntel /></ProtectedRoute>} />
        <Route path="/compliance-intel" element={<ProtectedRoute><ComplianceIntel /></ProtectedRoute>} />
        <Route path="/flood-intel" element={<ProtectedRoute><FloodIntel /></ProtectedRoute>} />
        <Route path="/intelligent-checklist" element={<ProtectedRoute><IntelligentChecklist /></ProtectedRoute>} />
        <Route path="/decision-records" element={<ProtectedRoute><DecisionRecordDashboard /></ProtectedRoute>} />
        <Route path="/decision-records/:id" element={<ProtectedRoute><DecisionRecordDetail /></ProtectedRoute>} />
        <Route path="/loan-path-graph" element={<ProtectedRoute><LoanPathGraph /></ProtectedRoute>} />
        <Route path="/loan-path-graph/:id" element={<ProtectedRoute><LoanPathGraph /></ProtectedRoute>} />
        <Route path="/lender-profile-builder" element={<ProtectedRoute><LenderProfileBuilder /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />

      </Routes>
      {!isStandalone && <Footer />}
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </Router>
  )
}

export default App
