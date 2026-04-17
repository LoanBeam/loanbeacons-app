import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function LoginAcknowledgment({ user, onAcknowledged }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAgree = async () => {
    if (!checked) return;
    setLoading(true);
    setError('');
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          acknowledgedTerms: true,
          acknowledgedAt: serverTimestamp(),
          email: user.email,
        },
        { merge: true }
      );
      onAcknowledged();
    } catch (err) {
      console.error('Acknowledgment write failed:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full max-w-2xl overflow-hidden">

        {/* Header bar */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-8 py-6">
          <div className="flex items-center gap-3">
            {/* Beacon icon */}
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L12 6M12 18L12 22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="4" fill="white"/>
              </svg>
            </div>
            <div>
              <p className="text-white/80 text-sm font-medium tracking-wide uppercase">LoanBeacons LLC</p>
              <h1 className="text-white text-xl font-semibold leading-tight">Professional Use Acknowledgment</h1>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-7">

          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            Before accessing LoanBeacons, please read and confirm the following. This acknowledgment is required once and will be stored with your account.
          </p>

          {/* Disclaimer box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-5 mb-6 space-y-4 text-sm text-slate-700 leading-relaxed">

            <div className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">1</span>
              <p>
                <span className="font-semibold text-slate-800">Licensed Professional.</span>{' '}
                I confirm that I am a licensed mortgage professional — including but not limited to a licensed Mortgage Loan Originator (MLO), Mortgage Broker, or similarly credentialed individual — operating under applicable federal and state licensing requirements (including SAFE Act / NMLS requirements where applicable).
              </p>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">2</span>
              <p>
                <span className="font-semibold text-slate-800">Professional Judgment.</span>{' '}
                I understand that LoanBeacons is a decision-support tool designed to assist licensed mortgage professionals. I will not use LoanBeacons as a substitute for my own independent professional judgment, applicable federal or state law, investor guidelines, lender overlays, or agency guidelines (Fannie Mae, Freddie Mac, FHA, VA, USDA, or other governing body).
              </p>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">3</span>
              <p>
                <span className="font-semibold text-slate-800">No Guarantee of Accuracy.</span>{' '}
                I acknowledge that LoanBeacons LLC makes no representations or warranties — express or implied — that any analysis, output, calculation, or recommendation produced by the platform is complete, accurate, current, or suitable for any specific transaction. Guidelines and regulations change frequently, and I am solely responsible for verifying all information against current applicable sources before use.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">4</span>
              <p>
                <span className="font-semibold text-slate-800">Limitation of Liability.</span>{' '}
                I agree that LoanBeacons LLC, its founders, officers, employees, and agents shall not be liable for any loss, damage, regulatory action, or adverse outcome — direct or indirect — arising from my use of or reliance on this platform. My use of LoanBeacons is at my own professional discretion and risk.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">5</span>
              <p>
                <span className="font-semibold text-slate-800">Beta Platform.</span>{' '}
                I understand this platform is currently in invite-only beta. Features, calculations, and outputs may change without notice. I agree to use LoanBeacons responsibly and to provide feedback to help improve the platform.
              </p>
            </div>

          </div>

          {/* Checkbox */}
          <label
            className={`flex items-start gap-3 cursor-pointer rounded-xl border px-5 py-4 transition-all select-none ${
              checked
                ? 'border-orange-400 bg-orange-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                  checked
                    ? 'bg-orange-500 border-orange-500'
                    : 'bg-white border-slate-300'
                }`}
              >
                {checked && (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-slate-700 leading-snug">
              I have read, understand, and agree to all of the above. I confirm I am a licensed mortgage professional and will use LoanBeacons in accordance with all applicable laws, regulations, and lender guidelines.
            </span>
          </label>

          {/* Error */}
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400 leading-snug max-w-xs">
              This acknowledgment is stored securely with your account and will not be shown again.
            </p>
            <button
              onClick={handleAgree}
              disabled={!checked || loading}
              className={`flex-shrink-0 px-7 py-3 rounded-xl text-sm font-semibold transition-all ${
                checked && !loading
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm hover:shadow-md'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Saving…
                </span>
              ) : (
                'I Agree — Enter LoanBeacons'
              )}
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <p className="text-xs text-slate-400 text-center">
            © {new Date().getFullYear()} LoanBeacons LLC · All rights reserved · For licensed mortgage professionals only
          </p>
        </div>

      </div>
    </div>
  );
}
