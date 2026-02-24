import { Link } from 'react-router-dom';
import BeaconLogo from './BeaconLogo';

function Navbar() {
  return (
    <nav className="bg-blue-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <BeaconLogo size={32} />
            <div>
              <span className="text-2xl font-bold tracking-tight">LoanBeacons</span>
              <div className="text-yellow-400 text-[9px] font-semibold tracking-wider uppercase">
                Patent Pending
              </div>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/" className="hover:text-blue-300 transition-colors font-medium">Home</Link>
            <Link to="/scenarios" className="hover:text-blue-300 transition-colors font-medium">My Scenarios</Link>
            <Link to="/scenario-creator" className="hover:text-blue-300 transition-colors font-medium">Scenario Creator</Link>
            <a href="#" className="hover:text-blue-300 transition-colors font-medium">About</a>
          <Link to="/admin" className="hover:text-blue-300 transition-colors font-medium">Admin</Link>
          </div>
          <Link to="/scenario-creator" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-medium transition-colors">
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
