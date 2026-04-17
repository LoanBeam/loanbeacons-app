import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAuth, signOut, onAuthStateChanged } from 'firebase/auth';
import BeaconLogo from './BeaconLogo';

const auth = getAuth();

function Navbar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

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
          <div className="flex items-center gap-3">
            <Link to="/scenario-creator" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-medium transition-colors">
              Get Started
            </Link>
            {user && (
              <button
                onClick={handleLogout}
                className="bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
              >
                Log Out
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
