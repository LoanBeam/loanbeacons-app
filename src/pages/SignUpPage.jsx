import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';

export default function SignUpPage() {
  const [step, setStep] = useState(1); // 1 = code entry, 2 = account creation
  const [betaCode, setBetaCode] = useState('');
  const [codeDocId, setCodeDocId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nmls, setNmls] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, updateDisplayName } = useAuth();
  const navigate = useNavigate();

  // Step 1 — Validate beta code against Firestore
  async function handleCodeSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const q = query(
        collection(db, 'betaCodes'),
        where('code', '==', betaCode.trim().toUpperCase()),
        where('used', '==', false)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('Invalid or already used beta access code. Contact George at LoanBeacons to request one.');
      } else {
        setCodeDocId(snap.docs[0].id);
        setStep(2);
      }
    } catch (err) {
      setError('Unable to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Step 2 — Create Firebase Auth account
  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      return setError('Passwords do not match.');
    }
    if (password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    setLoading(true);
    try {
      const cred = await register(email, password);
      await updateDisplayName(`${firstName} ${lastName}`);

      // Mark beta code as used
      await updateDoc(doc(db, 'betaCodes', codeDocId), {
        used: true,
        usedBy: cred.user.uid,
        usedAt: serverTimestamp(),
      });

      // Create user profile in Firestore
      await addDoc(collection(db, 'users'), {
        uid: cred.user.uid,
        firstName,
        lastName,
        email,
        nmls: nmls || '',
        company: company || '',
        plan: 'founder',
        betaCode: betaCode.trim().toUpperCase(),
        createdAt: serverTimestamp(),
      });

      navigate('/');
    } catch (err) {
      setError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  function getFriendlyError(code) {
    switch (code) {
      case 'auth/email-already-in-use': return 'An account with this email already exists.';
      case 'auth/invalid-email': return 'Please enter a valid email address.';
      case 'auth/weak-password': return 'Password must be at least 6 characters.';
      default: return 'Registration failed. Please try again.';
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">LB</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">LoanBeacons™</span>
          </div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Beta Access</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
          <div className={`w-12 h-0.5 ${step >= 2 ? 'bg-blue-700' : 'bg-gray-200'}`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* STEP 1 — Beta Code */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Enter Beta Access Code
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                LoanBeacons is currently invite-only. Enter your beta access code to create an account.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Beta Access Code</label>
                  <input
                    type="text"
                    value={betaCode}
                    onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                    required
                    placeholder="e.g. LB-BETA-2026"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>
                <button type="submit" disabled={loading || !betaCode.trim()}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-50">
                  {loading ? 'Verifying...' : 'Verify Code →'}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                Don't have a code?{' '}
                <a href="mailto:george@loanbeacons.com" className="text-blue-600 hover:text-blue-800 font-medium">
                  Request access
                </a>
              </p>
            </>
          )}

          {/* STEP 2 — Account Details */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">✓ Code Verified</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Create your account
              </h2>
              <p className="text-sm text-gray-500 mb-6">You're in! Set up your LoanBeacons profile.</p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">First Name</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="George"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Last Name</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Chevalier"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Company / Brokerage</label>
                  <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Clearview Lending Solutions"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">NMLS # (optional)</label>
                  <input type="text" value={nmls} onChange={(e) => setNmls(e.target.value)} placeholder="e.g. 1234567"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min 8 characters"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Repeat password"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
                  🎉 <strong>Founder Rate:</strong> $97/mo for life — locked in at signup. First 20 accounts only.
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-50">
                  {loading ? 'Creating account...' : 'Create Account →'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium">Sign in</Link>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          LoanBeacons™ · U.S. Provisional Patent No. 63/739,290
        </p>
      </div>
    </div>
  );
}
