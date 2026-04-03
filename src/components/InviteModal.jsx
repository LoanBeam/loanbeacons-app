import { useState } from "react";
import { db } from "../firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const inp = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-slate-400 placeholder-slate-400";
const lbl = "block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide";

export default function InviteModal({ loProfile, onClose }) {
  const functions = getFunctions();

  // Form state
  const [nmls, setNmls]                 = useState("");
  const [lenderName, setLenderName]     = useState("");
  const [aeName, setAeName]             = useState("");
  const [aeEmail, setAeEmail]           = useState("");
  const [personalMsg, setPersonalMsg]   = useState("");

  // Flow state
  const [step, setStep]         = useState("form");    // form | checking | exists | ready | generating | done | error
  const [existingProfile, setExistingProfile] = useState(null);
  const [inviteUrl, setInviteUrl]       = useState("");
  const [copied, setCopied]             = useState(false);
  const [errMsg, setErrMsg]             = useState("");

  // ── Gate 1 check ──────────────────────────────────────────────────────────
  const checkNMLS = async () => {
    if (!nmls.trim()) return;
    setStep("checking");
    try {
      const checkLenderNMLS = httpsCallable(functions, "checkLenderNMLS");
      const result = await checkLenderNMLS({ nmls: nmls.trim() });
      if (result.data.exists) {
        setExistingProfile(result.data);
        setStep("exists");
      } else {
        setStep("ready");
      }
    } catch (e) {
      console.error("NMLS check failed:", e);
      setStep("ready"); // Fail open — proceed if check fails
    }
  };

  // ── Generate invite link ───────────────────────────────────────────────────
  const generateInvite = async () => {
    if (!lenderName.trim() || !aeEmail.trim()) return;
    setStep("generating");
    try {
      const createLenderInvite = httpsCallable(functions, "createLenderInvite");
      const result = await createLenderInvite({
        nmls: nmls.trim(),
        lenderName: lenderName.trim(),
        aeEmail: aeEmail.toLowerCase().trim(),
        aeName: aeName.trim(),
        loName: loProfile?.name || "",
        loNmls: loProfile?.nmls || "",
        personalMessage: personalMsg.trim(),
      });

      if (result.data.alreadyExists) {
        setExistingProfile({ profileId: result.data.profileId, lenderName: result.data.lenderName });
        setStep("exists");
        return;
      }

      setInviteUrl(result.data.inviteUrl);
      setStep("done");
    } catch (e) {
      console.error("Invite generation failed:", e);
      setErrMsg("Something went wrong generating the invite. Try again.");
      setStep("error");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  const emailTemplate = `Hi ${aeName || "there"},

I'd like to invite ${lenderName || "your company"} to join LoanBeacons™ — the guideline intelligence platform I use to match borrowers with the right lender for every scenario.

${personalMsg ? personalMsg + "\n\n" : ""}Why join LoanBeacons?
• Upload your guidelines once — matched against every scenario I'm actively working
• Your Non-QM matrices are interpreted automatically, even unpublished ones
• Update your guidelines in real time — I see the change instantly

Click below to set up your lender profile (takes about 5 minutes):
${inviteUrl}

This link expires in 30 days.

${loProfile?.name || "Your broker"}
NMLS# ${loProfile?.nmls || ""}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-green-400 tracking-widest uppercase mb-1">Beta Invite</p>
              <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Invite a Lender / AE
              </h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">

          {/* ── STEP: form + Gate 1 check ── */}
          {(step === "form" || step === "checking" || step === "ready") && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 leading-relaxed">
                <strong>SendGrid pending:</strong> Email auto-send is not yet active. This generates a secure invite link you can paste into your own email. Once LoanBeacons.com is verified in SendGrid, auto-send activates with no code change.
              </div>

              {/* NMLS# with Gate 1 check */}
              <div>
                <label className={lbl}>Company NMLS# *</label>
                <div className="flex gap-2">
                  <input
                    value={nmls}
                    onChange={e => { setNmls(e.target.value); setStep("form"); setExistingProfile(null); }}
                    placeholder="e.g. 3038"
                    className={`${inp} flex-1`}
                    onBlur={checkNMLS}
                  />
                  <button
                    onClick={checkNMLS}
                    disabled={!nmls.trim() || step === "checking"}
                    className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-200 disabled:opacity-50"
                  >
                    {step === "checking" ? "Checking..." : "Check"}
                  </button>
                </div>
                {step === "checking" && (
                  <p className="text-xs text-slate-400 mt-1">Checking LoanBeacons platform...</p>
                )}
              </div>

              {step === "ready" && (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
                    ✓ NMLS# {nmls} not yet on the platform — ready to invite.
                  </div>

                  <div>
                    <label className={lbl}>Lender / Company Name *</label>
                    <input value={lenderName} onChange={e => setLenderName(e.target.value)} placeholder="e.g. Acra Lending" className={inp} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>AE Name</label>
                      <input value={aeName} onChange={e => setAeName(e.target.value)} placeholder="e.g. Sarah Johnson" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>AE Email *</label>
                      <input type="email" value={aeEmail} onChange={e => setAeEmail(e.target.value)} placeholder="sarah@lender.com" className={inp} />
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Personal Message (optional)</label>
                    <textarea
                      value={personalMsg}
                      onChange={e => setPersonalMsg(e.target.value)}
                      rows={3}
                      placeholder="Why you're inviting them, your working relationship, etc."
                      className={`${inp} resize-none`}
                    />
                  </div>

                  <button
                    onClick={generateInvite}
                    disabled={!lenderName.trim() || !aeEmail.trim()}
                    className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${lenderName.trim() && aeEmail.trim() ? "bg-green-700 hover:bg-green-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                  >
                    Generate Invite Link
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── STEP: generating ── */}
          {step === "generating" && (
            <div className="text-center py-10">
              <div className="text-3xl mb-3">⚙️</div>
              <p className="font-semibold text-slate-700">Generating secure invite link...</p>
            </div>
          )}

          {/* ── STEP: already exists ── */}
          {step === "exists" && existingProfile && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                <p className="font-bold text-blue-900 mb-1">
                  {existingProfile.lenderName || "This lender"} is already on LoanBeacons
                </p>
                <p className="text-sm text-blue-700">
                  NMLS# {nmls} has an existing profile. You can link to it directly — no invite needed.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">
                  Close
                </button>
                <button onClick={() => { setNmls(""); setLenderName(""); setAeName(""); setAeEmail(""); setStep("form"); setExistingProfile(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-green-700 text-white font-semibold text-sm hover:bg-green-600">
                  Invite a Different Lender
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: done — show invite link ── */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <p className="font-bold text-green-900 mb-1">✓ Invite link ready</p>
                <p className="text-xs text-green-700">This link expires in 30 days. Share it with {aeName || "the AE"} via your own email.</p>
              </div>

              {/* Link copy */}
              <div>
                <label className={lbl}>Invite Link</label>
                <div className="flex gap-2">
                  <input readOnly value={inviteUrl}
                    className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-mono" />
                  <button onClick={copyLink}
                    className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${copied ? "bg-green-600 text-white" : "bg-slate-800 text-white hover:bg-slate-700"}`}>
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Pre-written email template */}
              <div>
                <label className={lbl}>Pre-written email (paste into your email client)</label>
                <textarea
                  readOnly
                  value={emailTemplate}
                  rows={12}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs font-mono resize-none"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(emailTemplate)}
                  className="mt-1 text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  Copy email text
                </button>
              </div>

              <button onClick={onClose} className="w-full py-3 rounded-2xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700">
                Done
              </button>
            </div>
          )}

          {/* ── STEP: error ── */}
          {step === "error" && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
                {errMsg}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("ready")} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                  Try Again
                </button>
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white font-semibold text-sm">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
