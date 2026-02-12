import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import ScenarioCreator from './pages/ScenarioCreator'
import ScenarioList from './pages/ScenarioList'

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scenario-creator" element={<ScenarioCreator />} />
          <Route path="/scenarios" element={<ScenarioList />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  )
}

export default App
