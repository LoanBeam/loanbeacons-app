import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import LenderProfileBuilder from "../modules/LenderProfileBuilder";

const EMPTY_LO = {
  firstName: "", lastName: "", nmls: "", email: "", phone: "",
  licenseStates: "", title: "", company: "", companyNmls: "",
  tagline: "", notes: "",
};

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
        // Load LO profile
        const snap = await getDoc(doc(db, "loProfiles", LO_DOC));
        if (snap.exists()) {
          const d = snap.data();
          setProfile(d.profile || EMPTY_LO);
          setAeOverrides(d.aeOverrides || {});
        }
        // Load branch lenders dynamically
        const { getDocs, collection: col } = await import("firebase/firestore");
        const lenderSnap = await getDocs(col(db, "lenderProfiles"));
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
  };

  const f = (field, val) => setProfile(p => ({ ...p, [field]: val }));

  if (loading) return <div className="text-center py-12 text-slate-400">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Personal Info */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-300 mb-4">👤 LO Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[["First Name","firstName"],["Last Name","lastName"],["NMLS#","nmls"],["Email","email"],["Phone","phone"],["License States","licenseStates"],["Title","title"],["Company Name","company"],["Company NMLS#","companyNmls"]].map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
              <input value={profile[key]} onChange={e => f(key, e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-600 rounded-lg text-white text-sm"
                placeholder={label} />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Tagline / Specialty</label>
            <input value={profile.tagline} onChange={e => f("tagline", e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-600 rounded-lg text-white text-sm"
              placeholder="e.g. VA & FHA specialist, 15 years experience" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
            <textarea value={profile.notes} onChange={e => f("notes", e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-600 rounded-lg text-white text-sm" />
          </div>
        </div>
      </div>

      {/* AE Overrides */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-300 mb-1">📞 My AE Contacts</h3>
        <p className="text-xs text-slate-500 mb-4">Your personal Account Executive contacts per lender. These override the branch default when you run Lender Match.</p>
        {branchLenders.length === 0 && (
          <div className="text-center py-8 bg-slate-900/40 border border-slate-700 rounded-xl">
            <p className="text-slate-400 text-sm">No branch lenders added yet.</p>
            <p className="text-slate-500 text-xs mt-1">Go to Branch Lenders tab to add lenders first.</p>
          </div>
        )}
        <div className="space-y-3">
          {branchLenders.map(lender => {
            const key = lender.id;
            return (
              <div key={key} className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold text-slate-300">{lender.name}</p>
                  <span className="text-xs text-slate-500">NMLS# {lender.nmls}</span>
                  {(lender.agencies || []).map(a => (
                    <span key={a} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">{a}</span>
                  ))}
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
                          <label className="text-xs text-slate-500">{label}</label>
                          {hasOverride
                            ? <span className="text-xs text-purple-400 font-semibold">My override</span>
                            : branchDefault
                            ? <span className="text-xs text-slate-600">Branch default</span>
                            : null}
                        </div>
                        <input
                          value={displayValue}
                          onChange={e => setAeOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: e.target.value }}))}
                          className={"w-full px-3 py-1.5 border rounded-lg text-white text-sm " +
                            (hasOverride ? "bg-purple-900/30 border-purple-600" : "bg-slate-800 border-slate-600")}
                          placeholder={label} />
                        {hasOverride && (
                          <button
                            onClick={() => setAeOverrides(prev => { const u = {...prev}; if(u[key]) { delete u[key][field]; } return u; })}
                            className="text-xs text-slate-500 hover:text-slate-300 mt-0.5">
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
        className="bg-green-700 hover:bg-green-600 text-white font-bold px-6 py-3 rounded-xl transition-all">
        {saved ? "✅ Profile Saved" : "💾 Save My Profile"}
      </button>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("lenders");
  const tabs = [
    { id: "lenders", label: "🏦 Branch Lenders" },
    { id: "profile", label: "👤 My LO Profile" },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800/80 border-b border-slate-700 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">LoanBeacons™ — Admin</p>
          <h1 className="text-2xl font-extrabold text-white">⚙️ Admin Center</h1>
          <p className="text-sm text-slate-400 mt-1">Manage branch lender profiles and your personal LO settings.</p>
          <div className="flex gap-2 mt-4">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={"px-4 py-2 rounded-xl text-sm font-bold transition-all " +
                  (tab === t.id ? "bg-green-700 text-white shadow-lg" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                {t.label}
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
