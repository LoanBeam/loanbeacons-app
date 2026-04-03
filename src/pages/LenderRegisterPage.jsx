import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams, useNavigate } from "react-router-dom";

const inp = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-slate-400 placeholder-slate-400";
const lbl = "block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide";

export default function LenderRegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = getAuth();
  const functions = getFunctions();

  const token = searchParams.get("token");

  // Token validation state
  const [tokenStatus, setTokenStatus] = useState("loading"); // loading | valid | invalid | consumed | expired
  const [tokenData, setTokenData] = useState(null);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [title, setTitle]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Flow state
  const [step, setStep] = useState("register"); // register | submitting | pending_backup | success | gate2_error
  const [errMsg, setErrMsg] = useState("");

  // ── Validate token on load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setTokenStatus("invalid"); return; }
    const validate = async () => {
      try {
        const snap = await getDoc(doc(db, "lenderInvites", token));
        if (!snap.exists()) { setTokenStatus("invalid"); return; }
        const data = snap.data();
        if (data.status === "consumed") { setTokenStatus("consumed"); return; }
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) { setTokenStatus("expired"); return; }
        setTokenData(data);
        setTokenStatus("valid");
      } catch (e) {
        console.error("Token validation error:", e);
        setTokenStatus("invalid");
      }
    };
    validate();
  }, [token]);

  // ── Handle registration submit ──────────────────────────────────────────────
  const handleSubmit = async () => {
    setErrMsg("");
    if (!firstName.trim() || !lastName.trim()) { setErrMsg("First and last name are required."); return; }
    if (password.length < 8) { setErrMsg("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setErrMsg("Passwords do not match."); return; }

    setStep("submitting");
    const email = tokenData.aeEmail;
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      // Gate 2: Firebase Auth creates account — throws if email already exists
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } catch (authErr) {
        if (authErr.code === "auth/email-already-in-use") {
          // Gate 2 triggered — sign them in and route to portal
          try {
            userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Force token refresh to get latest custom claims
            await userCredential.user.getIdToken(true);
            navigate("/lender-portal");
            return;
          } catch (_) {
            setErrMsg("This email is already registered. Please sign in at loanbeacons.com/login.");
            setStep("gate2_error");
            return;
          }
        }
        throw authErr;
      }

      // Update display name
      await updateProfile(userCredential.user, { displayName: fullName });

      // Gate 3 + profile creation via Cloud Function
      const completeLenderRegistration = httpsCallable(functions, "completeLenderRegistration");
      const result = await completeLenderRegistration({
        token,
        nmls: tokenData.nmls,
        lenderName: tokenData.lenderName,
        aeName: fullName,
        aePhone: phone.trim(),
        aeTitle: title.trim(),
        aeEmail: email,
      });

      // Force token refresh to get custom claims set by Cloud Function
      await userCredential.user.getIdToken(true);

      if (result.data.status === "pending_backup") {
        setStep("pending_backup");
      } else {
        setStep("success");
        setTimeout(() => navigate("/lender-portal"), 2000);
      }
    } catch (e) {
      console.error("Registration error:", e);
      if (e.code === "auth/weak-password") {
        setErrMsg("Password is too weak. Use at least 8 characters.");
      } else {
        setErrMsg("Registration failed. Please try again or contact support.");
      }
      setStep("register");
    }
  };

  // ── Render: token states ────────────────────────────────────────────────────
  if (tokenStatus === "loading") {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="text-3xl mb-3">⏳</div>
          <p className="text-slate-600 font-semibold">Validating your invite link...</p>
        </div>
      </PageShell>
    );
  }

  if (tokenStatus === "invalid") {
    return (
      <PageShell>
        <StatusCard icon="❌" title="Invalid invite link" color="red">
          This link is not recognized. Please contact the broker who invited you for a new link.
        </StatusCard>
      </PageShell>
    );
  }

  if (tokenStatus === "consumed") {
    return (
      <PageShell>
        <StatusCard icon="✓" title="Already registered" color="blue">
          This invite link has already been used. If you already have an account, sign in at{" "}
          <a href="/login" className="text-blue-600 underline font-semibold">loanbeacons.com/login</a>.
        </StatusCard>
      </PageShell>
    );
  }

  if (tokenStatus === "expired") {
    return (
      <PageShell>
        <StatusCard icon="⏰" title="Invite link expired" color="amber">
          This link expired after 30 days. Ask the broker who invited you to generate a new one — it only takes 30 seconds.
        </StatusCard>
      </PageShell>
    );
  }

  // ── Render: Gate 2 error ────────────────────────────────────────────────────
  if (step === "gate2_error") {
    return (
      <PageShell>
        <StatusCard icon="🔐" title="Email already registered" color="blue">
          <p>{errMsg}</p>
          <a href="/login" className="mt-3 inline-block px-6 py-2.5 bg-green-700 text-white rounded-xl font-semibold text-sm">
            Go to Login
          </a>
        </StatusCard>
      </PageShell>
    );
  }

  // ── Render: Gate 3 — pending backup ────────────────────────────────────────
  if (step === "pending_backup") {
    return (
      <PageShell>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 text-center max-w-md mx-auto">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Pending Admin Approval
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-4">
            A primary contact is already managing {tokenData?.lenderName}'s profile on LoanBeacons.
            Your registration has been submitted for review as a backup contact.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 text-left mb-4">
            The LoanBeacons administrator will review your request and assign you as the backup AE contact.
            You'll receive confirmation once approved.
          </div>
          <p className="text-xs text-slate-400">Questions? Contact support@loanbeacons.com</p>
        </div>
      </PageShell>
    );
  }

  // ── Render: success ─────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <PageShell>
        <StatusCard icon="✅" title="Registration complete!" color="green">
          Welcome to LoanBeacons, {firstName}. Taking you to your lender portal...
        </StatusCard>
      </PageShell>
    );
  }

  // ── Render: registration form ───────────────────────────────────────────────
  return (
    <PageShell>
      <div className="max-w-lg mx-auto">
        {/* Lender info banner */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
          <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">You're invited</p>
          <h2 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {tokenData?.lenderName}
          </h2>
          <p className="text-slate-500 text-sm">NMLS# {tokenData?.nmls}</p>
          {tokenData?.personalMessage && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-600 italic leading-relaxed">
              "{tokenData.personalMessage}"
            </div>
          )}
        </div>

        {/* Value prop */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">Why LoanBeacons?</p>
          <div className="space-y-2 text-xs text-amber-800 leading-relaxed">
            <p>📊 Your guidelines are matched against every active scenario — in real time</p>
            <p>📄 Upload your rate matrix PDF — Claude AI interprets it automatically</p>
            <p>🔄 Update guidelines once and every LO on the platform sees the change instantly</p>
            <p>🔒 Your data is private to the platform — never shared or sold</p>
          </div>
        </div>

        {/* Registration form */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Create Your Account
          </h3>
          <p className="text-slate-500 text-xs mb-5">
            Registering as AE for {tokenData?.lenderName} · {tokenData?.aeEmail}
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>First Name *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Sarah" className={inp} />
              </div>
              <div>
                <label className={lbl}>Last Name *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Johnson" className={inp} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Account Executive" className={inp} />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(800) 555-0100" className={inp} />
              </div>
            </div>

            {/* Email (read-only from token) */}
            <div>
              <label className={lbl}>Email (pre-filled from invite)</label>
              <input readOnly value={tokenData?.aeEmail || ""} className={`${inp} bg-slate-50 text-slate-500 cursor-default`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Password *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ characters" className={inp} />
              </div>
              <div>
                <label className={lbl}>Confirm Password *</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" className={inp} />
              </div>
            </div>

            {errMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                {errMsg}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={step === "submitting"}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${step === "submitting" ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-green-700 hover:bg-green-600 text-white shadow-sm"}`}
            >
              {step === "submitting" ? "Creating your account..." : "Create Account & Set Up Profile"}
            </button>

            <p className="text-center text-xs text-slate-400">
              Already have an account?{" "}
              <a href="/login" className="text-green-700 font-semibold hover:underline">Sign in</a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          LoanBeacons™ · Patent Pending · Invite expires in 30 days
        </p>
      </div>
    </PageShell>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: "#f8fafc" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display&display=swap');`}</style>
      <div className="bg-slate-900 px-6 py-5">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-bold text-green-400 tracking-widest uppercase">LoanBeacons™</p>
          <p className="text-slate-400 text-xs mt-0.5">Mortgage Intelligence Platform · Patent Pending</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-10">{children}</div>
    </div>
  );
}

function StatusCard({ icon, title, color, children }) {
  const colorMap = {
    green: "bg-green-50 border-green-200",
    red:   "bg-red-50 border-red-200",
    blue:  "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
  };
  return (
    <div className={`rounded-3xl border p-8 text-center max-w-md mx-auto ${colorMap[color] || "bg-white border-slate-200"}`}>
      <div className="text-4xl mb-4">{icon}</div>
      <h2 className="text-xl font-bold text-slate-900 mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}
