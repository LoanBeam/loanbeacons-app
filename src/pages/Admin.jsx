import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { getAuth } from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import LenderProfileBuilder from "../modules/LenderProfileBuilder";

const EMPTY_LO = {
  firstName: "", lastName: "", nmls: "", email: "", phone: "",
  licenseStates: "", title: "", company: "", companyNmls: "",
  tagline: "", notes: "",
};

const inp = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-slate-400 placeholder-slate-400";
const lbl = "block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide";
const card = "bg-white border border-slate-200 rounded-3xl p-6 shadow-sm";

// ── My LO Profile ─────────────────────────────────────────────────────────────
function MyLOProfile() {
  const LO_DOC = "lo_profile_default";
  const [profile, setProfile] = useState(EMPTY_LO);
  const [aeOverrides, setAeOverrides] = useState({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [branchLenders, setBranchLenders] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "loProfiles", LO_DOC));
        if (snap.exists()) {
          const d = snap.data();
          setProfile(d.profile || EMPTY_LO);
          setAeOverrides(d.aeOverrides || {});
        }
        const lenderSnap = await getDocs(collection(db, "lenderProfiles"));
        setBranchLenders(lenderSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    try {
      await setDoc(doc(db, "loProfiles", LO_DOC), {
        profile, aeOverrides, updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, "userProfiles", "default"), {
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        displayName: `${profile.firstName} ${profile.lastName}`.trim(),
        email: profile.email,
        phone: profile.phone,
        nmlsId: profile.nmls,
        company: profile.company,
        companyNmls: profile.companyNmls,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
  };

  const f = (field, val) => setProfile(p => ({ ...p, [field]: val }));

  if (loading) return <div className="text-center py-16 text-slate-400">Loading profile...</div>;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
          My LO Profile
        </h3>
        <p className="text-slate-500 text-sm">Your personal identity — displayed on scenario reports, borrower letters, and AE share emails.</p>
      </div>

      {/* LO Identity */}
      <div className={`${card} mb-5`}>
        <h4 className="text-base font-bold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>Identity & Licensing</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            ["First Name","firstName"], ["Last Name","lastName"],
            ["NMLS#","nmls"],          ["Email","email"],
            ["Phone","phone"],          ["License States","licenseStates"],
            ["Title","title"],          ["Company Name","company"],
            ["Company NMLS#","companyNmls"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className={lbl}>{label}</label>
              <input value={profile[key]} onChange={e => f(key, e.target.value)} placeholder={label} className={inp} />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className={lbl}>Tagline / Specialty</label>
            <input value={profile.tagline} onChange={e => f("tagline", e.target.value)}
              placeholder="e.g. VA & FHA specialist, 15 years experience" className={inp} />
          </div>
          <div className="md:col-span-2">
            <label className={lbl}>Notes</label>
            <textarea value={profile.notes} onChange={e => f("notes", e.target.value)} rows={3}
              placeholder="Anything else to capture about your LO profile..." className={`${inp} resize-none`} />
          </div>
        </div>
      </div>

      {/* AE Contacts */}
      <div className={`${card} mb-6`}>
        <h4 className="text-base font-bold text-slate-800 mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>My AE Contacts</h4>
        <p className="text-xs text-slate-400 mb-5">Your personal AE contacts per lender. These override the branch default in Lender Match — useful when you've built your own relationship with a different rep.</p>

        {branchLenders.length === 0 && (
          <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl">
            <p className="text-slate-500 text-sm">No branch lenders added yet.</p>
            <p className="text-slate-400 text-xs mt-1">Go to Branch Lenders tab to add lenders first.</p>
          </div>
        )}

        <div className="space-y-4">
          {branchLenders.map(lender => {
            const key = lender.id;
            const typeIcon = lender.type === "nonqm" ? "📊" : lender.type === "hardmoney" ? "🔨" : "🏦";
            return (
              <div key={key} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                    {lender.logoDataUrl
                      ? <img src={lender.logoDataUrl} alt={lender.name} className="w-full h-full object-contain p-0.5" />
                      : <span className="text-base">{typeIcon}</span>}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{lender.name}</p>
                    <p className="text-xs text-slate-500">NMLS# {lender.nmls} · {(lender.agencies || []).join(", ") || lender.type}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[["AE Name","name","aeContact"],["Email","email","aeEmail"],["Phone","phone","aePhone"]].map(([label, field, branchField]) => {
                    const branchDefault = lender[branchField] || "";
                    const loValue = aeOverrides[key]?.[field];
                    const hasOverride = loValue !== undefined && loValue !== "" && loValue !== branchDefault;
                    const displayValue = loValue !== undefined ? loValue : branchDefault;
                    return (
                      <div key={field}>
                        <div className="flex items-center justify-between mb-1">
                          <label className={lbl}>{label}</label>
                          {hasOverride
                            ? <span className="text-xs text-violet-600 font-bold">My override</span>
                            : branchDefault ? <span className="text-xs text-slate-400">Branch default</span> : null}
                        </div>
                        <input value={displayValue}
                          onChange={e => setAeOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: e.target.value } }))}
                          className={`${inp} ${hasOverride ? "border-violet-300 bg-violet-50" : ""}`}
                          placeholder={label} />
                        {hasOverride && (
                          <button onClick={() => setAeOverrides(prev => { const u = { ...prev }; if (u[key]) { delete u[key][field]; } return u; })}
                            className="text-xs text-slate-400 hover:text-slate-600 mt-0.5">
                            ↩ Revert to branch default
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={save}
        className="px-8 py-3.5 rounded-2xl font-bold text-sm bg-green-700 hover:bg-green-600 text-white shadow-sm transition-all">
        {saved ? "✅ Profile Saved" : "💾 Save My Profile"}
      </button>
    </div>
  );
}

// ── Admin Page ─────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState("lenders");

  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: "#f8fafc" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
      `}</style>

      {/* Hero */}
      <div className="bg-slate-900 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-green-400 tracking-widest uppercase mb-2">LoanBeacons™</p>
          <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Admin Center
          </h1>
          <p className="text-slate-400 text-sm">Manage branch lender profiles, Non-QM matrix data, and your personal LO settings.</p>
          <div className="flex gap-2 mt-6">
            {[["lenders","🏦 Branch Lenders"],["profile","👤 My LO Profile"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${tab === id ? "bg-green-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {tab === "lenders" && <LenderProfileBuilder />}
        {tab === "profile" && <MyLOProfile />}
      </div>
    </div>
  );
}
