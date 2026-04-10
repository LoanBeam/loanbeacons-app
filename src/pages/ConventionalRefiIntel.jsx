import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase/config";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import CanonicalSequenceBar from "../components/CanonicalSequenceBar";

const MODULE_KEY = "CONVENTIONAL_REFI_INTEL";
const STORAGE_KEY = (scenarioId) => `lb_conventional_refi_${scenarioId}`;

const TABS = [
  { id: "ownership", label: "Loan Ownership" },
  { id: "refinow", label: "RefiNow™ Screener" },
  { id: "refipossible", label: "Refi Possible℠" },
  { id: "comparison", label: "Recommendation" },
  { id: "letter", label: "Borrower Letter" },
];

const AMI_LIMITS = {
  "Newton": 83200,
  "Fulton": 99200,
  "DeKalb": 99200,
  "Gwinnett": 99200,
  "Cobb": 99200,
  "Cherokee": 99200,
  "Hall": 75200,
  "Forsyth": 99200,
  "Clayton": 99200,
  "Henry": 99200,
  "default": 80000,
};

function getAMILimit(county) {
  const clean = county?.replace(" County", "").trim();
  return AMI_LIMITS[clean] || AMI_LIMITS["default"];
}

export default function ConventionalRefiIntel() {
  const [searchParams] = useSearchParams();
  const scenarioId = searchParams.get("scenarioId") || "default";

  // Scenario data
  const [scenario, setScenario] = useState(null);
  const [borrowerName, setBorrowerName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [county, setCounty] = useState("");

  // UI state
  const [activeTab, setActiveTab] = useState("ownership");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Tab 1 — Loan Ownership
  const [ownershipResult, setOwnershipResult] = useState(""); // "fannie" | "freddie" | "neither" | ""
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);

  // Tab 2 — RefiNow
  const [refiNow, setRefiNow] = useState({
    annualIncome: "",
    currentRate: "",
    newRate: "",
    currentBalance: "",
    currentPayment: "",
    ltv: "",
    creditScore: "",
    missedPayments6mo: "no",
    missedPayments12mo: "0",
    subordinateLien: "no",
    occupancy: "primary",
  });
  const [refiNowResult, setRefiNowResult] = useState(null);

  // Tab 3 — Refi Possible
  const [refiPossible, setRefiPossible] = useState({
    annualIncome: "",
    currentRate: "",
    newRate: "",
    currentBalance: "",
    currentPayment: "",
    ltv: "",
    creditScore: "",
    missedPayments6mo: "no",
    missedPayments12mo: "0",
    subordinateLien: "no",
    occupancy: "primary",
  });
  const [refiPossibleResult, setRefiPossibleResult] = useState(null);

  // Tab 4 — AI Recommendation
  const [recommendation, setRecommendation] = useState("");

  // Tab 5 — Letter
  const [borrowerLetter, setBorrowerLetter] = useState("");
  const [letterGenerated, setLetterGenerated] = useState(false);

  // Decision Record
  const [savedToRecord, setSavedToRecord] = useState(false);

  // ── Load Scenario ──────────────────────────────────────────────
  useEffect(() => {
    if (!scenarioId || scenarioId === "default") return;
    const loadScenario = async () => {
      try {
        const snap = await getDoc(doc(db, "scenarios", scenarioId));
        if (snap.exists()) {
          const data = snap.data();
          setScenario(data);
          const name = [data.firstName, data.lastName]
            .filter(Boolean).join(" ") || data.borrowerName || data.scenarioName || "";
          setBorrowerName(name);
          const addr = [data.streetAddress, data.city, data.state, data.zipCode]
            .filter(Boolean).join(", ") || "";
          setPropertyAddress(addr);
          setCounty(data.county || "");
        }
      } catch (err) {
        console.error("Error loading scenario:", err);
      }
    };
    loadScenario();
  }, [scenarioId]);

  // ── localStorage autosave ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY(scenarioId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.ownershipResult) setOwnershipResult(parsed.ownershipResult);
        if (parsed.ownershipConfirmed) setOwnershipConfirmed(parsed.ownershipConfirmed);
        if (parsed.refiNow) setRefiNow((p) => ({ ...p, ...parsed.refiNow }));
        if (parsed.refiPossible) setRefiPossible((p) => ({ ...p, ...parsed.refiPossible }));
        if (parsed.refiNowResult) setRefiNowResult(parsed.refiNowResult);
        if (parsed.refiPossibleResult) setRefiPossibleResult(parsed.refiPossibleResult);
        if (parsed.recommendation) setRecommendation(parsed.recommendation);
        if (parsed.borrowerLetter) setBorrowerLetter(parsed.borrowerLetter);
        if (parsed.letterGenerated) setLetterGenerated(parsed.letterGenerated);
      } catch {}
    }
  }, [scenarioId]);

  const autosave = useCallback((updates) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY(scenarioId)) || "{}");
    localStorage.setItem(STORAGE_KEY(scenarioId), JSON.stringify({ ...current, ...updates }));
  }, [scenarioId]);

  // ── Eligibility Logic ──────────────────────────────────────────
  const amiLimit = getAMILimit(county) * 0.8;

  function checkRefiNowEligibility() {
    const income = parseFloat(refiNow.annualIncome) || 0;
    const currentRate = parseFloat(refiNow.currentRate) || 0;
    const newRate = parseFloat(refiNow.newRate) || 0;
    const ltv = parseFloat(refiNow.ltv) || 0;
    const fico = parseInt(refiNow.creditScore) || 0;
    const rateDrop = currentRate - newRate;

    const checks = {
      ownership: ownershipResult === "fannie",
      income: income > 0 && income <= amiLimit,
      rateDrop: rateDrop >= 0.5,
      ltv: ltv <= 97,
      fico: fico >= 620,
      occupancy: refiNow.occupancy === "primary",
      payments6mo: refiNow.missedPayments6mo === "no",
      payments12mo: parseInt(refiNow.missedPayments12mo) <= 1,
      noSubLien: refiNow.subordinateLien === "no",
    };

    const eligible = Object.values(checks).every(Boolean);
    const monthlySavings = refiNow.currentPayment && refiNow.newRate
      ? estimateSavings(refiNow.currentBalance, refiNow.currentRate, refiNow.newRate)
      : null;

    return { checks, eligible, rateDrop: rateDrop.toFixed(2), monthlySavings };
  }

  function checkRefiPossibleEligibility() {
    const income = parseFloat(refiPossible.annualIncome) || 0;
    const currentRate = parseFloat(refiPossible.currentRate) || 0;
    const newRate = parseFloat(refiPossible.newRate) || 0;
    const ltv = parseFloat(refiPossible.ltv) || 0;
    const fico = parseInt(refiPossible.creditScore) || 0;
    const rateDrop = currentRate - newRate;

    const checks = {
      ownership: ownershipResult === "freddie",
      income: income > 0 && income <= amiLimit,
      rateDrop: rateDrop >= 0.5,
      ltv: ltv <= 97,
      fico: fico >= 620,
      occupancy: refiPossible.occupancy === "primary",
      payments6mo: refiPossible.missedPayments6mo === "no",
      payments12mo: parseInt(refiPossible.missedPayments12mo) <= 1,
      noSubLien: refiPossible.subordinateLien === "no",
    };

    const eligible = Object.values(checks).every(Boolean);
    const monthlySavings = refiPossible.currentBalance && refiPossible.newRate
      ? estimateSavings(refiPossible.currentBalance, refiPossible.currentRate, refiPossible.newRate)
      : null;

    return { checks, eligible, rateDrop: rateDrop.toFixed(2), monthlySavings };
  }

  function estimateSavings(balance, currentRate, newRate) {
    const bal = parseFloat(balance);
    const r1 = parseFloat(currentRate) / 100 / 12;
    const r2 = parseFloat(newRate) / 100 / 12;
    if (!bal || !r1 || !r2) return null;
    const n = 360;
    const p1 = (bal * r1 * Math.pow(1 + r1, n)) / (Math.pow(1 + r1, n) - 1);
    const p2 = (bal * r2 * Math.pow(1 + r2, n)) / (Math.pow(1 + r2, n) - 1);
    return Math.round(p1 - p2);
  }

  // ── AI Analysis ────────────────────────────────────────────────
  async function generateRecommendation() {
    setAiLoading(true);
    const rnResult = checkRefiNowEligibility();
    const rpResult = checkRefiPossibleEligibility();
    setRefiNowResult(rnResult);
    setRefiPossibleResult(rpResult);

    const prompt = `You are a mortgage underwriting expert at LoanBeacons. Analyze this borrower's conventional refinance eligibility and provide a clear, actionable recommendation.

Borrower: ${borrowerName || "Unknown"}
Property: ${propertyAddress || "Unknown"}
County: ${county || "Unknown"}
Loan Owner: ${ownershipResult === "fannie" ? "Fannie Mae" : ownershipResult === "freddie" ? "Freddie Mac" : "Unknown/Neither"}
Area Median Income Limit (80%): $${amiLimit.toLocaleString()}/year

RefiNow™ (Fannie Mae) Eligibility:
${JSON.stringify(rnResult.checks, null, 2)}
Eligible: ${rnResult.eligible}
Rate Drop: ${rnResult.rateDrop}%
Est. Monthly Savings: ${rnResult.monthlySavings ? "$" + rnResult.monthlySavings : "N/A"}

Refi Possible℠ (Freddie Mac) Eligibility:
${JSON.stringify(rpResult.checks, null, 2)}
Eligible: ${rpResult.eligible}
Rate Drop: ${rpResult.rateDrop}%
Est. Monthly Savings: ${rpResult.monthlySavings ? "$" + rpResult.monthlySavings : "N/A"}

Provide:
1. Which program this borrower qualifies for (or why neither applies)
2. Key barriers if not fully eligible and how to address them
3. Recommended next steps for the loan officer
4. Any program-specific advantages to highlight

Write in a professional but plain tone. 3–4 paragraphs max.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      setRecommendation(text);
      autosave({ refiNowResult: rnResult, refiPossibleResult: rpResult, recommendation: text });
    } catch (err) {
      setRecommendation("Unable to generate recommendation. Please check your connection and try again.");
    } finally {
      setAiLoading(false);
    }
  }

  async function generateBorrowerLetter() {
    setAiLoading(true);
    const rnResult = refiNowResult || checkRefiNowEligibility();
    const rpResult = refiPossibleResult || checkRefiPossibleEligibility();
    const eligible = rnResult.eligible ? "RefiNow™" : rpResult.eligible ? "Refi Possible℠" : null;
    const savings = rnResult.monthlySavings || rpResult.monthlySavings;

    const prompt = `Write a professional, warm borrower-facing letter explaining their refinance opportunity under ${eligible || "conventional refinance programs"}.

Borrower Name: ${borrowerName || "Valued Borrower"}
Property: ${propertyAddress || "your property"}
Program: ${eligible || "Conventional Refinance"}
Estimated Monthly Savings: ${savings ? "$" + savings : "To be determined"}
Loan Owner: ${ownershipResult === "fannie" ? "Fannie Mae" : ownershipResult === "freddie" ? "Freddie Mac" : "your current lender"}

The letter should:
- Open with a clear subject line
- Explain what the program is in plain language (no jargon)
- Highlight the key benefit (rate reduction, one appraisal credit if needed, no re-qualification risk)
- State the estimated monthly savings if available
- Explain the simple next steps
- Close professionally

Keep it under 300 words. Do not include placeholder brackets — write it as a complete, ready-to-send letter.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      setBorrowerLetter(text);
      setLetterGenerated(true);
      autosave({ borrowerLetter: text, letterGenerated: true });
    } catch (err) {
      setBorrowerLetter("Unable to generate letter. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── Check Labels ───────────────────────────────────────────────
  const checkLabels = {
    ownership: "Loan owned by correct GSE",
    income: `Income ≤ 80% AMI ($${amiLimit.toLocaleString()}/yr)`,
    rateDrop: "Rate reduction ≥ 0.50%",
    ltv: "LTV ≤ 97%",
    fico: "Credit score ≥ 620",
    occupancy: "Primary residence",
    payments6mo: "No missed payments (last 6 months)",
    payments12mo: "≤ 1 missed payment (last 12 months)",
    noSubLien: "No subordinate financing",
  };

  // ── Render Helpers ─────────────────────────────────────────────
  function CheckRow({ label, pass }) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
          {pass ? "✓" : "✗"}
        </span>
        <span className={`text-sm ${pass ? "text-slate-700" : "text-red-600 font-medium"}`}>{label}</span>
      </div>
    );
  }

  function FieldRow({ label, value, onChange, type = "text", options, placeholder }) {
    return (
      <div className="mb-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
        {options ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        )}
      </div>
    );
  }

  function EligibilityBadge({ eligible }) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${eligible ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
        {eligible ? "✓ ELIGIBLE" : "✗ NOT ELIGIBLE"}
      </span>
    );
  }

  // ── Screener Form (shared for both programs) ───────────────────
  function ScreenerForm({ state, setState, result, programName, onCheck }) {
    const yesNo = [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }];
    const missed12 = [{ value: "0", label: "0" }, { value: "1", label: "1" }, { value: "2", label: "2+" }];
    const occupancyOpts = [{ value: "primary", label: "Primary Residence" }, { value: "second", label: "Second Home" }, { value: "investment", label: "Investment" }];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Inputs */}
        <div className="lg:col-span-2 space-y-0">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Borrower & Loan Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <FieldRow label="Annual Household Income ($)" value={state.annualIncome} onChange={(v) => setState((p) => ({ ...p, annualIncome: v }))} placeholder="e.g. 58000" />
              <FieldRow label="Current Interest Rate (%)" value={state.currentRate} onChange={(v) => setState((p) => ({ ...p, currentRate: v }))} placeholder="e.g. 7.25" />
              <FieldRow label="New/Offered Rate (%)" value={state.newRate} onChange={(v) => setState((p) => ({ ...p, newRate: v }))} placeholder="e.g. 6.50" />
              <FieldRow label="Current Loan Balance ($)" value={state.currentBalance} onChange={(v) => setState((p) => ({ ...p, currentBalance: v }))} placeholder="e.g. 245000" />
              <FieldRow label="Current LTV (%)" value={state.ltv} onChange={(v) => setState((p) => ({ ...p, ltv: v }))} placeholder="e.g. 85" />
              <FieldRow label="Credit Score (Middle)" value={state.creditScore} onChange={(v) => setState((p) => ({ ...p, creditScore: v }))} placeholder="e.g. 680" />
              <FieldRow label="Occupancy" value={state.occupancy} onChange={(v) => setState((p) => ({ ...p, occupancy: v }))} options={occupancyOpts} />
              <FieldRow label="Missed Payments (last 6 mo)" value={state.missedPayments6mo} onChange={(v) => setState((p) => ({ ...p, missedPayments6mo: v }))} options={yesNo} />
              <FieldRow label="Missed Payments (last 12 mo)" value={state.missedPayments12mo} onChange={(v) => setState((p) => ({ ...p, missedPayments12mo: v }))} options={missed12} />
              <FieldRow label="Subordinate Lien Exists?" value={state.subordinateLien} onChange={(v) => setState((p) => ({ ...p, subordinateLien: v }))} options={yesNo} />
            </div>
          </div>

          {/* AMI Info */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-3xl p-4">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">📍 AMI Reference — {county || "Your County"}</p>
            <p className="text-sm text-amber-700">
              80% AMI Limit: <strong>${amiLimit.toLocaleString()}/year</strong> — income must be at or below this threshold to qualify.
            </p>
          </div>
        </div>

        {/* Right — Results */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Eligibility Checklist
              </h3>
              {result && <EligibilityBadge eligible={result.eligible} />}
            </div>
            {result ? (
              <div>
                {Object.entries(result.checks).map(([key, pass]) => (
                  <CheckRow key={key} label={checkLabels[key] || key} pass={pass} />
                ))}
                {result.monthlySavings && (
                  <div className="mt-4 bg-emerald-50 rounded-2xl p-3 text-center">
                    <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Est. Monthly Savings</p>
                    <p className="text-2xl font-bold text-emerald-700">${result.monthlySavings}/mo</p>
                    <p className="text-xs text-emerald-600">${(result.monthlySavings * 12).toLocaleString()}/year</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-400 text-center py-6">
                Complete the form and run the screener to see eligibility results.
              </div>
            )}
          </div>

          <button
            onClick={onCheck}
            className="w-full bg-slate-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            Run {programName} Screener
          </button>
        </div>
      </div>
    );
  }

  // ── Tab: Ownership ─────────────────────────────────────────────
  function OwnershipTab() {
    return (
      <div className="space-y-6">
        {/* Hero Card */}
        <div className="bg-slate-900 text-white rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Step 1: Confirm Loan Ownership
          </h2>
          <p className="text-slate-300 text-sm">
            RefiNow™ requires Fannie Mae ownership. Refi Possible℠ requires Freddie Mac. Both programs are unavailable if neither owns the loan.
          </p>
        </div>

        {/* Borrower Info Banner */}
        {(borrowerName || propertyAddress) && (
          <div className="bg-blue-50 border border-blue-100 rounded-3xl p-4 flex flex-wrap gap-6">
            {borrowerName && (
              <div>
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Borrower</p>
                <p className="text-sm font-semibold text-slate-800">{borrowerName}</p>
              </div>
            )}
            {propertyAddress && (
              <div>
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Property</p>
                <p className="text-sm font-semibold text-slate-800">{propertyAddress}</p>
              </div>
            )}
            {county && (
              <div>
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">County</p>
                <p className="text-sm font-semibold text-slate-800">{county}</p>
              </div>
            )}
          </div>
        )}

        {/* Lookup Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Fannie Mae */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-lg">🏛️</div>
              <div>
                <h3 className="font-semibold text-slate-800">Fannie Mae</h3>
                <p className="text-xs text-slate-400">RefiNow™ Program</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Look up whether the borrower's current loan is owned by Fannie Mae. Use the borrower's name and property address from the scenario above.
            </p>
            <a
              href="https://yourhome.fanniemae.com/calculators-tools/loan-lookup"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-blue-600 text-white rounded-2xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors mb-3"
            >
              🔍 Open Fannie Mae Loan Lookup
            </a>
            <p className="text-xs text-slate-400 text-center">fanniemae.com/loanlookup</p>
          </div>

          {/* Freddie Mac */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-2xl flex items-center justify-center text-lg">🏦</div>
              <div>
                <h3 className="font-semibold text-slate-800">Freddie Mac</h3>
                <p className="text-xs text-slate-400">Refi Possible℠ Program</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Look up whether the borrower's current loan is owned by Freddie Mac. Same address and borrower name applies.
            </p>
            <a
              href="https://www.freddiemac.com/loanlookup/"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-green-600 text-white rounded-2xl py-2.5 text-sm font-semibold hover:bg-green-700 transition-colors mb-3"
            >
              🔍 Open Freddie Mac Loan Lookup
            </a>
            <p className="text-xs text-slate-400 text-center">freddiemac.com/loanlookup</p>
          </div>
        </div>

        {/* Confirm Result */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Confirm Lookup Result
          </h3>
          <p className="text-sm text-slate-500 mb-4">After checking both lookups, record the result here to unlock the appropriate screener.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: "fannie", label: "✓ Fannie Mae", sub: "Proceed to RefiNow™", color: "blue" },
              { value: "freddie", label: "✓ Freddie Mac", sub: "Proceed to Refi Possible℠", color: "green" },
              { value: "neither", label: "✗ Neither / Unknown", sub: "Standard refi options only", color: "slate" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setOwnershipResult(opt.value);
                  setOwnershipConfirmed(true);
                  autosave({ ownershipResult: opt.value, ownershipConfirmed: true });
                }}
                className={`rounded-2xl p-4 text-left border-2 transition-all ${
                  ownershipResult === opt.value
                    ? opt.color === "blue" ? "border-blue-500 bg-blue-50" : opt.color === "green" ? "border-green-500 bg-green-50" : "border-slate-400 bg-slate-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-semibold text-slate-800 text-sm">{opt.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.sub}</p>
              </button>
            ))}
          </div>

          {ownershipConfirmed && ownershipResult && (
            <div className="mt-4 flex items-center justify-between bg-slate-50 rounded-2xl p-3">
              <p className="text-sm text-slate-700">
                Loan ownership confirmed as <strong>{ownershipResult === "fannie" ? "Fannie Mae" : ownershipResult === "freddie" ? "Freddie Mac" : "Neither"}</strong>.
                {ownershipResult === "fannie" && " → Run the RefiNow™ Screener next."}
                {ownershipResult === "freddie" && " → Run the Refi Possible℠ Screener next."}
                {ownershipResult === "neither" && " → These programs are not available for this borrower."}
              </p>
              <button
                onClick={() => setActiveTab(ownershipResult === "fannie" ? "refinow" : ownershipResult === "freddie" ? "refipossible" : "comparison")}
                className="ml-4 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Key Rules Amber Card */}
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">⚑ Key Rules</p>
          <ul className="text-sm text-amber-900 space-y-1">
            <li>• RefiNow™ is <strong>only</strong> available for Fannie Mae-owned loans</li>
            <li>• Refi Possible℠ is <strong>only</strong> available for Freddie Mac-owned loans</li>
            <li>• If the servicer is different from the owner — the lookup determines the owner, not the servicer</li>
            <li>• Both programs require primary residence occupancy only</li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-24" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-1">LoanBeacons™ · Conventional Refi</p>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Conventional Refi Intelligence™
              </h1>
              <p className="text-slate-300 text-sm mt-1">RefiNow™ &amp; Refi Possible℠ Eligibility Advisor</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {borrowerName && <p className="text-sm font-semibold text-white">{borrowerName}</p>}
              {propertyAddress && <p className="text-xs text-slate-400">{propertyAddress}</p>}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 flex-wrap">
            {TABS.map((tab) => {
              const locked =
                (tab.id === "refinow" && ownershipResult && ownershipResult !== "fannie") ||
                (tab.id === "refipossible" && ownershipResult && ownershipResult !== "freddie");
              return (
                <button
                  key={tab.id}
                  onClick={() => !locked && setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-white text-slate-900"
                      : locked
                      ? "text-slate-600 cursor-not-allowed opacity-40"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {tab.label}
                  {locked && " 🔒"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === "ownership" && <OwnershipTab />}

        {activeTab === "refinow" && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-white rounded-3xl p-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>RefiNow™ Eligibility Screener</h2>
                  <p className="text-slate-300 text-sm mt-1">Fannie Mae's low-income conventional refinance program</p>
                </div>
                {refiNowResult && <EligibilityBadge eligible={refiNowResult.eligible} />}
              </div>
            </div>
            <ScreenerForm
              state={refiNow}
              setState={(fn) => { setRefiNow(fn); autosave({ refiNow: typeof fn === "function" ? fn(refiNow) : fn }); }}
              result={refiNowResult}
              programName="RefiNow™"
              onCheck={() => {
                const r = checkRefiNowEligibility();
                setRefiNowResult(r);
                autosave({ refiNowResult: r });
              }}
            />
          </div>
        )}

        {activeTab === "refipossible" && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-white rounded-3xl p-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>Refi Possible℠ Eligibility Screener</h2>
                  <p className="text-slate-300 text-sm mt-1">Freddie Mac's low-income conventional refinance program</p>
                </div>
                {refiPossibleResult && <EligibilityBadge eligible={refiPossibleResult.eligible} />}
              </div>
            </div>
            <ScreenerForm
              state={refiPossible}
              setState={(fn) => { setRefiPossible(fn); autosave({ refiPossible: typeof fn === "function" ? fn(refiPossible) : fn }); }}
              result={refiPossibleResult}
              programName="Refi Possible℠"
              onCheck={() => {
                const r = checkRefiPossibleEligibility();
                setRefiPossibleResult(r);
                autosave({ refiPossibleResult: r });
              }}
            />
          </div>
        )}

        {activeTab === "comparison" && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-white rounded-3xl p-6">
              <h2 className="text-xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>AI Recommendation</h2>
              <p className="text-slate-300 text-sm mt-1">Synthesized analysis of program eligibility and next steps</p>
            </div>

            {/* Side-by-Side Summary */}
            {(refiNowResult || refiPossibleResult) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`bg-white rounded-3xl shadow-sm border-2 p-5 ${refiNowResult?.eligible ? "border-emerald-300" : "border-slate-100"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800">RefiNow™</h3>
                    {refiNowResult ? <EligibilityBadge eligible={refiNowResult.eligible} /> : <span className="text-xs text-slate-400">Not screened</span>}
                  </div>
                  {refiNowResult && (
                    <>
                      <p className="text-sm text-slate-600">Rate drop: <strong>{refiNowResult.rateDrop}%</strong> {parseFloat(refiNowResult.rateDrop) >= 0.5 ? "✓" : "✗ (need ≥ 0.50%)"}</p>
                      {refiNowResult.monthlySavings && <p className="text-sm text-emerald-700 font-semibold mt-1">Est. savings: ${refiNowResult.monthlySavings}/mo</p>}
                    </>
                  )}
                </div>
                <div className={`bg-white rounded-3xl shadow-sm border-2 p-5 ${refiPossibleResult?.eligible ? "border-emerald-300" : "border-slate-100"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800">Refi Possible℠</h3>
                    {refiPossibleResult ? <EligibilityBadge eligible={refiPossibleResult.eligible} /> : <span className="text-xs text-slate-400">Not screened</span>}
                  </div>
                  {refiPossibleResult && (
                    <>
                      <p className="text-sm text-slate-600">Rate drop: <strong>{refiPossibleResult.rateDrop}%</strong> {parseFloat(refiPossibleResult.rateDrop) >= 0.5 ? "✓" : "✗ (need ≥ 0.50%)"}</p>
                      {refiPossibleResult.monthlySavings && <p className="text-sm text-emerald-700 font-semibold mt-1">Est. savings: ${refiPossibleResult.monthlySavings}/mo</p>}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* AI Output */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
              {recommendation ? (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI Analysis</p>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{recommendation}</p>
                  <button
                    onClick={() => { setActiveTab("letter"); }}
                    className="mt-4 bg-slate-900 text-white rounded-2xl px-5 py-2.5 text-sm font-semibold hover:bg-slate-700 transition-colors"
                  >
                    Generate Borrower Letter →
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400 text-sm mb-4">
                    {!refiNowResult && !refiPossibleResult
                      ? "Run at least one screener before generating the recommendation."
                      : "Ready to generate your AI-powered recommendation."}
                  </p>
                  <button
                    onClick={generateRecommendation}
                    disabled={aiLoading || (!refiNowResult && !refiPossibleResult && ownershipResult !== "neither")}
                    className="bg-slate-900 text-white rounded-2xl px-6 py-3 text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-40"
                  >
                    {aiLoading ? "Analyzing..." : "Generate AI Recommendation"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "letter" && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-white rounded-3xl p-6">
              <h2 className="text-xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>Borrower Letter</h2>
              <p className="text-slate-300 text-sm mt-1">Plain-language explanation ready to send or present to the borrower</p>
            </div>

            {borrowerLetter ? (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrower Letter</p>
                  <button
                    onClick={() => { setBorrowerLetter(""); setLetterGenerated(false); }}
                    className="ml-auto text-xs text-slate-400 hover:text-slate-600"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{borrowerLetter}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(borrowerLetter)}
                  className="mt-4 border border-slate-200 text-slate-600 rounded-2xl px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Copy to Clipboard
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 text-center py-12">
                <p className="text-slate-400 text-sm mb-6">
                  {!recommendation
                    ? "Generate the AI Recommendation first, then come back to create the borrower letter."
                    : "Generate a plain-language letter to share with your borrower."}
                </p>
                <button
                  onClick={generateBorrowerLetter}
                  disabled={aiLoading || !recommendation}
                  className="bg-slate-900 text-white rounded-2xl px-6 py-3 text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-40"
                >
                  {aiLoading ? "Writing Letter..." : "Generate Borrower Letter"}
                </button>
              </div>
            )}

            {/* Underwriter Note */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">⚑ LO Note</p>
              <ul className="text-sm text-amber-900 space-y-1">
                <li>• Confirm loan ownership via the official lookup before presenting this letter</li>
                <li>• Rate quoted must be at least 0.50% below current note rate at application</li>
                <li>• If an appraisal is required, lender must provide a $500 credit toward the cost</li>
                <li>• This letter does not constitute a loan commitment or approval</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <CanonicalSequenceBar activeModule={MODULE_KEY} scenarioId={scenarioId} />
    </div>
  );
}
