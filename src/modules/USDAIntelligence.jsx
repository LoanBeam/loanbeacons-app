import { useState } from "react";
import { db } from "../firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// ─── Constants ────────────────────────────────────────────────────────────────
const GUARANTEE_FEE_PCT = 1.00;
const ANNUAL_FEE_PCT = 0.35;
const DTI_FRONT_LIMIT = 0.29;
const DTI_BACK_LIMIT = 0.41;
const DTI_BACK_EXTENDED = 0.44;
const FHA_UPFRONT_MIP = 0.0175;
const FHA_ANNUAL_MIP = 0.0055;

// 2024 USDA Income Limits — national baseline (verify county-specific at rd.usda.gov)
const USDA_BASE_LIMITS = { 1: 110650, 2: 110650, 3: 110650, 4: 110650, 5: 146050, 6: 146050, 7: 146050, 8: 146050 };

const STEPS = [
  { id: 1, label: "Property" },
  { id: 2, label: "Household" },
  { id: 3, label: "Income Limits" },
  { id: 4, label: "Loan Setup" },
  { id: 5, label: "Guarantee Fee" },
  { id: 6, label: "Qualifying" },
  { id: 7, label: "Comparison" },
  { id: 8, label: "Rescue™" },
  { id: 9, label: "Results" },
];

const PROPERTY_FLAGS = [
  { id: "privateRoad", label: "Private Road Access", severity: "warn", note: "Requires recorded private road maintenance agreement signed by all parties with access." },
  { id: "outbuildings", label: "Income-Producing Outbuildings / Barns", severity: "fail", note: "Income-producing structures disqualify the property. Site must be non-commercial." },
  { id: "farmParcel", label: "Farm-Like Parcel (>10 acres / agricultural use)", severity: "fail", note: "USDA guaranteed loans are not for farms. Site must be typical residential size for the area." },
  { id: "wellSeptic", label: "Well and/or Septic System", severity: "warn", note: "State-specific USDA requirements apply. Water potability test and septic inspection typically required." },
  { id: "vacantForeclosed", label: "Vacant / Foreclosed Property", severity: "warn", note: "Property must meet USDA Thermal and Site Standards. Inspect for deferred maintenance prior to appraisal." },
  { id: "oversizeLot", label: "Lot Size Atypical for Area", severity: "warn", note: "Site must be typical for the neighborhood. Oversized lots trigger underwriter review." },
  { id: "condo", label: "Condominium", severity: "fail", note: "Condos are rarely USDA-approved. Requires USDA project approval — check USDA condo project list." },
  { id: "manufactured", label: "Manufactured / Mobile Home", severity: "warn", note: "Must be new, permanently affixed, titled as real property, and meet HUD standards. Special USDA rules apply." },
  { id: "leasehold", label: "Leasehold / Tribal Land", severity: "warn", note: "Special documentation required. Contact your USDA RD State Office for guidance before proceeding." },
  { id: "newConstruction", label: "New Construction", severity: "warn", note: "Requires builder approval and three-stage inspections. Builder must be USDA-approved." },
];

const COMP_FACTORS = [
  { id: "strongCredit", label: "Credit Score ≥ 680", autoKey: "creditScore", autoFn: (v) => parseInt(v) >= 680 },
  { id: "reserves", label: "Verified Cash Reserves (≥ 3 months PITI)" },
  { id: "lowPaymentShock", label: "Low Payment Shock (new PITI ≤ 125% of current housing)" },
  { id: "stableEmployment", label: "2+ Years Same Employer or Field" },
  { id: "minimalDebt", label: "Minimal Use of Credit / Low Revolving Balances" },
  { id: "residualIncome", label: "Strong Residual Income After All Debts" },
];

const RESCUE_INCOME = [
  { title: "Apply All Dependent Deductions", detail: "$480 per dependent under 18 is deducted from adjusted annual household income. Ensure all dependents are documented." },
  { title: "Apply Elderly Household Deduction", detail: "$400 annual deduction available if any household member is age 62+ or disabled. Check if eligible." },
  { title: "Document Childcare Expenses", detail: "Childcare costs for children under 12 that allow borrower or co-borrower to work are fully deductible. Get a signed letter and statements." },
  { title: "Document Medical Expenses", detail: "For elderly or disabled household members, medical expenses exceeding 3% of gross household income are deductible. Collect 12-month history." },
  { title: "Exclude Full-Time Student Earned Income", detail: "For full-time students in the household, only earned income above $480/year is counted. Verify enrollment status." },
  { title: "Confirm Foster Care Exclusions", detail: "Foster care payments are fully excluded from USDA household income. Document care arrangement." },
  { title: "Verify Non-Borrower Income Requirement", detail: "Non-borrower adult income is required to be counted. If an adult will not live in the home, they should not be included in household size." },
];

const RESCUE_DTI = [
  { title: "Pay Down or Close Small Revolving Debts", detail: "Eliminating credit card balances under $500 before application removes minimum monthly payments and directly improves back-end DTI." },
  { title: "Document All Allowable Income Sources", detail: "Part-time, overtime, and bonus income may be counted with a 2-year history. Check for seasonal income or side work the borrower forgot to mention." },
  { title: "Reduce Purchase Price", detail: "Lowering the sales price reduces P&I and front-end DTI. Negotiate a price reduction or find a less expensive comparable property." },
  { title: "Seller-Paid Rate Buydown", detail: "Seller can contribute up to 6% toward closing costs and prepaids, including a 2-1 or permanent rate buydown to reduce the qualifying payment." },
  { title: "Build a Compensating Factor File", detail: "Document reserves, low payment shock, and 2+ years stable employment. With one or more strong factors, back-end DTI may extend to 44% under manual underwrite." },
  { title: "Switch to FHA If USDA DTI Fails", detail: "FHA allows higher DTIs with a strong AUS Approve/Eligible. Run the FHA comparison before issuing a denial." },
];

const RESCUE_PROPERTY = [
  { title: "Re-Verify Property Eligibility on Official Map", detail: "USDA eligibility maps are updated every 3–5 years and some boundaries are incorrect in third-party tools. Always verify at eligibility.sc.egov.usda.gov using the exact parcel address." },
  { title: "Obtain Private Road Maintenance Agreement", detail: "Draft and record a private road maintenance agreement before the appraisal is ordered. All parties with road access must sign. Failure to obtain this will cause a lender condition." },
  { title: "Order Well Water Test Immediately", detail: "USDA requires a potability test for well water. Results take 7–10 days. Order at contract signing — do not wait for appraisal." },
  { title: "Address Property Condition Issues Before Appraisal", detail: "Repair or escrow for items that do not meet USDA Thermal or Site Standards before the appraiser arrives. Issues found on appraisal are more difficult to resolve." },
  { title: "Verify Ineligible 'Donut Hole' Using Parcel-Level Map", detail: "Some ineligible pockets exist within eligible counties. Use the USDA map at parcel level — not just zip code — to confirm exact eligibility." },
];

// ─── Math ─────────────────────────────────────────────────────────────────────
const pmt = (annualRate, nper, pv) => {
  if (!annualRate || !nper || !pv) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return pv / nper;
  return (pv * r * Math.pow(1 + r, nper)) / (Math.pow(1 + r, nper) - 1);
};
const n = (v) => parseFloat(v) || 0;
const fmt = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
const fmtD = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

// ─── UI ───────────────────────────────────────────────────────────────────────
const Chip = ({ status, children }) => {
  const cls = { pass: "bg-green-900/30 border-green-700/50 text-green-300", fail: "bg-red-900/30 border-red-700/50 text-red-300", warn: "bg-yellow-900/30 border-yellow-700/50 text-yellow-300", info: "bg-blue-900/30 border-blue-700/50 text-blue-300", neutral: "bg-slate-700/40 border-slate-600 text-slate-300" };
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${cls[status] || cls.neutral}`}>{children}</span>;
};

const Input = ({ label, value, onChange, note, prefix = "$", type = "number" }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
    {note && <p className="text-xs text-slate-500 mb-1">{note}</p>}
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        className={`w-full bg-slate-700 border border-slate-600 rounded-xl ${prefix ? "pl-7" : "px-4"} pr-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-500`}
      />
    </div>
  </div>
);

const NavRow = ({ onBack, onNext, nextLabel = "Next →" }) => (
  <div className="flex justify-between pt-2 print:hidden">
    {onBack ? <button onClick={onBack} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-sm">← Back</button> : <span />}
    {onNext && <button onClick={onNext} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm">{nextLabel}</button>}
  </div>
);

const InfoBox = ({ children, color = "blue" }) => {
  const cls = { blue: "bg-blue-900/15 border-blue-700/40 text-blue-200", yellow: "bg-yellow-900/15 border-yellow-700/40 text-yellow-200", green: "bg-green-900/15 border-green-700/40 text-green-200", red: "bg-red-900/15 border-red-700/40 text-red-200" };
  return <div className={`rounded-xl border p-4 text-sm leading-relaxed ${cls[color]}`}>{children}</div>;
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-800 rounded-2xl border border-slate-700 p-6 ${className}`}>{children}</div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function USDAIntelligence() {
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [address, setAddress] = useState("");
  const [ruralStatus, setRuralStatus] = useState("");
  const [donutHole, setDonutHole] = useState(false);
  const [propFlags, setPropFlags] = useState({});

  // Step 2
  const [hhSize, setHhSize] = useState(2);
  const [borrowerInc, setBorrowerInc] = useState("");
  const [coBorrowerInc, setCoBorrowerInc] = useState("");
  const [nonBorrowerInc, setNonBorrowerInc] = useState("");
  const [numDependents, setNumDependents] = useState(0);
  const [elderlyMember, setElderlyMember] = useState(false);
  const [childcareCosts, setChildcareCosts] = useState("");
  const [medicalExp, setMedicalExp] = useState("");
  const [studentInc, setStudentInc] = useState("");
  const [assets, setAssets] = useState("");

  // Step 3
  const [useDefaultLimit, setUseDefaultLimit] = useState(true);
  const [countyLimit, setCountyLimit] = useState("");

  // Step 4
  const [purchasePrice, setPurchasePrice] = useState("");
  const [baseLoan, setBaseLoan] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState(360);
  const [taxesAnnual, setTaxesAnnual] = useState("");
  const [insuranceAnnual, setInsuranceAnnual] = useState("");
  const [hoaMonthly, setHoaMonthly] = useState("");
  const [otherDebts, setOtherDebts] = useState("");
  const [creditScore, setCreditScore] = useState("");
  const [sellerCredits, setSellerCredits] = useState("");

  // Step 5
  const [financeGF, setFinanceGF] = useState(true);

  // Step 6
  const [compFactors, setCompFactors] = useState({});
  const [manualUW, setManualUW] = useState(false);

  // Step 9
  const [loNotes, setLoNotes] = useState("");

  // ─── Derived ──────────────────────────────────────────────────────────────
  const grossMonthly = n(borrowerInc) + n(coBorrowerInc);
  const grossAnnual = grossMonthly * 12;

  // USDA Household Income deductions
  const depDeduction = numDependents * 480;
  const elderlyDed = elderlyMember ? 400 : 0;
  const childcareDed = n(childcareCosts);
  const medicalDed = Math.max(0, n(medicalExp) - grossAnnual * 0.03);
  const studentExclusion = Math.max(0, n(studentInc) - 480);
  const assetImputed = Math.max(0, (n(assets) - 50000) * 0.005);
  const nonBorrowerAnnual = n(nonBorrowerInc) * 12;
  const totalDeductions = depDeduction + elderlyDed + childcareDed + medicalDed + studentExclusion;
  const adjustedHHIncome = Math.max(0, grossAnnual + nonBorrowerAnnual + assetImputed - totalDeductions);

  // Income limit
  const effectiveLimit = useDefaultLimit
    ? (USDA_BASE_LIMITS[Math.min(hhSize, 8)] || 110650)
    : n(countyLimit);
  const incomeRatio = effectiveLimit > 0 ? adjustedHHIncome / effectiveLimit : 0;

  // Loan math
  const baseLoanNum = n(baseLoan);
  const gfAmt = baseLoanNum * GUARANTEE_FEE_PCT / 100;
  const totalLoan = financeGF ? baseLoanNum + gfAmt : baseLoanNum;
  const annualFeeMonthly = totalLoan * ANNUAL_FEE_PCT / 100 / 12;
  const rate = n(interestRate);
  const pi = pmt(rate, termMonths, totalLoan);
  const taxMo = n(taxesAnnual) / 12;
  const insMo = n(insuranceAnnual) / 12;
  const hoaMo = n(hoaMonthly);
  const piti = pi + taxMo + insMo + hoaMo + annualFeeMonthly;

  // DTI
  const frontDTI = grossMonthly > 0 ? piti / grossMonthly : 0;
  const backDTI = grossMonthly > 0 ? (piti + n(otherDebts)) / grossMonthly : 0;
  const cfCount = Object.values(compFactors).filter(Boolean).length;
  const hasCompFactors = cfCount >= 1;
  const dtiStatus = frontDTI <= DTI_FRONT_LIMIT && backDTI <= DTI_BACK_LIMIT ? "PASS"
    : frontDTI <= DTI_FRONT_LIMIT && backDTI <= DTI_BACK_EXTENDED && hasCompFactors ? "BORDERLINE"
    : "FAIL";

  // GUS simulation
  const cs = parseInt(creditScore) || 0;
  const gus = (() => {
    if (ruralStatus !== "eligible") return { verdict: "REFER", reason: "Property eligibility not confirmed" };
    if (incomeRatio > 1.15) return { verdict: "REFER WITH CAUTION", reason: "Household income exceeds 115% of USDA limit" };
    if (dtiStatus === "FAIL") return { verdict: "REFER", reason: "DTI exceeds allowable limits even with compensating factors" };
    if (cs >= 640 && dtiStatus === "PASS" && incomeRatio <= 1.0) return { verdict: "ACCEPT", reason: "All primary eligibility conditions met" };
    if (cs >= 620 && dtiStatus !== "FAIL" && incomeRatio <= 1.15) return { verdict: "REFER", reason: "Marginal profile — manual underwrite review likely" };
    return { verdict: "REFER WITH CAUTION", reason: "Multiple risk factors present — manual underwrite required" };
  })();

  // Property issues
  const hardFlags = PROPERTY_FLAGS.filter(f => propFlags[f.id] && f.severity === "fail");
  const warnFlags = PROPERTY_FLAGS.filter(f => propFlags[f.id] && f.severity === "warn");

  // Overall verdict
  const verdict = (() => {
    if (ruralStatus === "ineligible" || hardFlags.length > 0) return "NOT_ELIGIBLE";
    if (incomeRatio > 1.15) return "NOT_ELIGIBLE";
    if (dtiStatus === "FAIL") return "NOT_ELIGIBLE";
    if (dtiStatus === "BORDERLINE" || incomeRatio > 1.0 || warnFlags.length > 0 || donutHole) return "BORDERLINE";
    if (ruralStatus !== "eligible") return "BORDERLINE";
    return "ELIGIBLE";
  })();

  // Comparison
  const pp = n(purchasePrice);
  const usdaMonthly = piti;
  const usdaCash = financeGF ? 0 : gfAmt;
  const usdaTotal = usdaMonthly * 360;

  const fhaDown = pp * 0.035;
  const fhaBase = pp - fhaDown;
  const fhaTL = fhaBase + fhaBase * FHA_UPFRONT_MIP;
  const fhaPI = pmt(rate, termMonths, fhaTL);
  const fhaMIPMo = fhaBase * FHA_ANNUAL_MIP / 12;
  const fhaMonthly = fhaPI + taxMo + insMo + hoaMo + fhaMIPMo;
  const fhaCash = fhaDown;
  const fhaTotal = fhaMonthly * 360;

  const convDown = pp * 0.05;
  const convLoan = pp - convDown;
  const convPMI = (convLoan / pp > 0.9 ? 0.0085 : convLoan / pp > 0.85 ? 0.007 : 0.006);
  const convPI = pmt(rate + 0.375, termMonths, convLoan);
  const convPMIMo = convLoan * convPMI / 12;
  const convMonthly = convPI + taxMo + insMo + hoaMo + convPMIMo;
  const convCash = convDown;
  const convTotal = convMonthly * 360;

  const saveDecisionRecord = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, "decisionRecords"), {
        module: "USDA Intelligence™",
        timestamp: serverTimestamp(),
        address, ruralStatus, verdict, gus,
        adjustedHHIncome, effectiveLimit, incomeRatio,
        frontDTI, backDTI, dtiStatus,
        gfAmt, totalLoan, annualFeeMonthly, piti,
        compFactors: Object.keys(compFactors).filter(k => compFactors[k]),
        hardFlags: hardFlags.map(f => f.label),
        warnFlags: warnFlags.map(f => f.label),
        comparison: { usda: { monthly: usdaMonthly, cash: usdaCash, total: usdaTotal }, fha: { monthly: fhaMonthly, cash: fhaCash, total: fhaTotal }, conv: { monthly: convMonthly, cash: convCash, total: convTotal } },
        loNotes,
      });
      setSaved(true);
    } catch (err) {
      console.error(err);
      alert("Save failed — check Firestore connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }} className="min-h-screen bg-slate-900 text-slate-100">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-5 print:hidden">
        <div className="max-w-5xl mx-auto flex items-start justify-between">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">LOANBEACONS™</div>
            <h1 className="text-2xl font-bold text-slate-100">🌾 USDA Intelligence™</h1>
            <p className="text-sm text-slate-400 mt-0.5">Rural Development Guaranteed Loan · 7 CFR Part 3555</p>
          </div>
          {verdict && (
            <Chip status={verdict === "ELIGIBLE" ? "pass" : verdict === "BORDERLINE" ? "warn" : "fail"}>
              {verdict === "ELIGIBLE" ? "✓ ELIGIBLE" : verdict === "BORDERLINE" ? "⚠ BORDERLINE" : "✗ NOT ELIGIBLE"}
            </Chip>
          )}
        </div>
      </div>

      {/* Step tabs */}
      <div className="bg-slate-800/60 border-b border-slate-700 print:hidden">
        <div className="max-w-5xl mx-auto flex overflow-x-auto">
          {STEPS.map(s => (
            <button key={s.id} onClick={() => setStep(s.id)}
              className={`flex flex-col items-center px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${step === s.id ? "border-green-500 text-green-400" : step > s.id ? "border-green-800/50 text-green-600" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 text-xs ${step >= s.id ? "bg-green-700 text-white" : "bg-slate-700 text-slate-400"}`}>{s.id}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── STEP 1: Property ──────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 1 — Property Eligibility</h2>
              <p className="text-sm text-slate-400 mt-1">Confirm rural eligibility and flag any property condition issues before ordering the appraisal.</p>
            </div>

            <Card className="space-y-5">
              <Input label="Property Address" value={address} onChange={setAddress} prefix="" type="text" note="Full address including city, state, ZIP" />

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-3">USDA Rural Eligibility</label>
                <div className="flex flex-wrap gap-3">
                  {[["eligible", "✅ USDA Eligible", "green"], ["ineligible", "❌ Not Eligible", "red"], ["unknown", "🔍 Not Verified", "blue"]].map(([v, l, c]) => (
                    <button key={v} onClick={() => setRuralStatus(v)}
                      className={`px-5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all ${ruralStatus === v ? c === "green" ? "bg-green-900/25 border-green-500 text-green-300" : c === "red" ? "bg-red-900/25 border-red-500 text-red-300" : "bg-blue-900/25 border-blue-500 text-blue-300" : "bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">Verify at <a href="https://eligibility.sc.egov.usda.gov" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">eligibility.sc.egov.usda.gov</a> — always use parcel-level search.</p>
              </div>

              <label className="flex items-center gap-3 p-4 bg-yellow-900/10 border border-yellow-700/30 rounded-xl cursor-pointer">
                <input type="checkbox" checked={donutHole} onChange={e => setDonutHole(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                <span className="text-sm text-yellow-200"><strong>Ineligible "Donut Hole"</strong> — property appears to be in an ineligible pocket within an otherwise eligible county. Requires parcel-level verification.</span>
              </label>
            </Card>

            <Card className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-100 mb-1">Property Condition Flags</h3>
                <p className="text-sm text-slate-400">Check all conditions that apply. Flagged items appear in the Decision Record and USDA Rescue™.</p>
              </div>
              <div className="space-y-3">
                {PROPERTY_FLAGS.map(flag => (
                  <div key={flag.id} className={`rounded-xl border p-4 transition-all ${propFlags[flag.id] ? flag.severity === "fail" ? "bg-red-900/15 border-red-700/50" : "bg-yellow-900/15 border-yellow-700/50" : "bg-slate-700/15 border-slate-600/30 hover:border-slate-500"}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!propFlags[flag.id]} onChange={e => setPropFlags(p => ({ ...p, [flag.id]: e.target.checked }))} className="w-4 h-4 mt-0.5 accent-green-500" />
                      <div>
                        <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                          {flag.label}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${flag.severity === "fail" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>{flag.severity === "fail" ? "Disqualifying" : "Condition"}</span>
                        </div>
                        {propFlags[flag.id] && <p className="text-xs text-slate-400 mt-1">{flag.note}</p>}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </Card>

            {hardFlags.length > 0 && <InfoBox color="red">⛔ <strong>Disqualifying Issues:</strong> {hardFlags.map(f => f.label).join(", ")}. This property does not qualify for USDA. Switch to FHA or Conventional.</InfoBox>}

            <NavRow onNext={() => setStep(2)} nextLabel="Next: Household →" />
          </div>
        )}

        {/* ── STEP 2: Household Income ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 2 — Household Income Engine™</h2>
              <p className="text-sm text-slate-400 mt-1">USDA counts all adults in the household — not just borrowers. Apply all available deductions to reduce adjusted income.</p>
            </div>

            <InfoBox color="blue"><strong>Critical:</strong> Non-borrower adults living in the property must have their income counted in household income, even if they are not on the loan. Foster care, SNAP, and TANF payments are excluded.</InfoBox>

            <Card className="space-y-5">
              <h3 className="font-bold text-slate-100">Household Composition</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">Total Household Size</label>
                  <select value={hhSize} onChange={e => setHhSize(parseInt(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100">
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} person{n > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">Dependents Under 18</label>
                  <select value={numDependents} onChange={e => setNumDependents(parseInt(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100">
                    {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 p-4 bg-slate-700/40 rounded-xl cursor-pointer">
                <input type="checkbox" checked={elderlyMember} onChange={e => setElderlyMember(e.target.checked)} className="w-4 h-4 accent-green-500" />
                <span className="text-sm text-slate-200">Household member age 62+ or disabled — unlocks <strong className="text-green-400">$400 elderly deduction</strong></span>
              </label>
            </Card>

            <Card className="space-y-5">
              <h3 className="font-bold text-slate-100">Monthly Income Sources</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Borrower Gross Monthly Income" value={borrowerInc} onChange={setBorrowerInc} />
                <Input label="Co-Borrower Gross Monthly Income" value={coBorrowerInc} onChange={setCoBorrowerInc} />
                <Input label="Non-Borrower Adult Income (Monthly)" value={nonBorrowerInc} onChange={setNonBorrowerInc} note="Adults living in home not on loan" />
                <Input label="Full-Time Student Earned Income (Monthly)" value={studentInc} onChange={setStudentInc} note="Only income above $480/yr is counted" />
              </div>
            </Card>

            <Card className="space-y-5">
              <h3 className="font-bold text-slate-100">Allowable Annual Deductions</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Childcare Expenses (Annual)" value={childcareCosts} onChange={setChildcareCosts} note="For children under 12 enabling borrower to work" />
                <Input label="Medical Expenses — Elderly/Disabled (Annual)" value={medicalExp} onChange={setMedicalExp} note="Amount exceeding 3% of gross HH income" />
                <Input label="Total Household Assets" value={assets} onChange={setAssets} note="0.5% of assets over $50,000 added as imputed income" />
              </div>
            </Card>

            {/* Income Summary */}
            <Card className="border-green-700/30">
              <h3 className="font-bold text-green-400 mb-4">Household Income Transformer™ — Summary</h3>
              <div className="space-y-2 text-sm">
                {[
                  ["Borrower + Co-Borrower (Annual)", fmt(grossAnnual)],
                  ["Non-Borrower Adult Income (Annual)", fmt(nonBorrowerAnnual)],
                  ["Asset Imputed Income", fmt(assetImputed), assetImputed > 0 ? "text-yellow-300" : ""],
                  ["— Dependent Deductions", `−${fmt(depDeduction)}`, "text-green-400"],
                  ["— Elderly Deduction", `−${fmt(elderlyDed)}`, "text-green-400"],
                  ["— Childcare Deduction", `−${fmt(childcareDed)}`, "text-green-400"],
                  ["— Medical Deduction", `−${fmt(medicalDed)}`, "text-green-400"],
                  ["— Student Income Exclusion", `−${fmt(studentExclusion)}`, "text-green-400"],
                ].map(([label, value, cls]) => (
                  <div key={label} className="flex justify-between text-slate-400">
                    <span>{label}</span>
                    <span className={cls || "text-slate-200"}>{value}</span>
                  </div>
                ))}
                <div className="border-t border-slate-600 pt-2 mt-1 flex justify-between font-bold text-base">
                  <span className="text-slate-100">Adjusted Annual Household Income</span>
                  <span className="text-green-400">{fmt(adjustedHHIncome)}</span>
                </div>
                <p className="text-xs text-slate-500">Total deductions applied: {fmt(totalDeductions)}</p>
              </div>
            </Card>

            <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Next: Income Limits →" />
          </div>
        )}

        {/* ── STEP 3: Income Limits ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 3 — Income Eligibility</h2>
              <p className="text-sm text-slate-400 mt-1">USDA limits are county-specific and based on 115% of area median income. Adjusted HH income must be at or below the county limit.</p>
            </div>

            <Card className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={useDefaultLimit} onChange={e => setUseDefaultLimit(e.target.checked)} className="w-4 h-4 accent-green-500" />
                <span className="text-sm text-slate-200">
                  Use 2024 national baseline limit — <strong>{hhSize <= 4 ? "$110,650" : "$146,050"}</strong> for {hhSize}-person household
                  <span className="text-slate-500 ml-2">(uncheck to enter county-specific limit)</span>
                </span>
              </label>
              {!useDefaultLimit && (
                <Input label="County-Specific USDA Income Limit (Annual)" value={countyLimit} onChange={setCountyLimit} note={<span>Look up at <a href="https://www.rd.usda.gov/resources/regulations-guidelines/income-limits" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">rd.usda.gov Income Limits</a></span>} />
              )}
            </Card>

            <Card className="space-y-5">
              <h3 className="font-bold text-slate-100">Income Limit Analysis</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[["Adjusted HH Income", fmt(adjustedHHIncome), ""], ["USDA Limit", fmt(effectiveLimit), ""], ["Income Ratio", `${(incomeRatio * 100).toFixed(1)}%`, incomeRatio <= 1.0 ? "text-green-400" : incomeRatio <= 1.15 ? "text-yellow-400" : "text-red-400"]].map(([l, v, c]) => (
                  <div key={l} className="bg-slate-700/40 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-1">{l}</div>
                    <div className={`text-xl font-bold ${c || "text-slate-100"}`}>{v}</div>
                  </div>
                ))}
              </div>

              {effectiveLimit > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>$0</span>
                    <span>100% — {fmt(effectiveLimit)}</span>
                    <span>115% — {fmt(effectiveLimit * 1.15)}</span>
                  </div>
                  <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-green-800/60" style={{ width: `${(1/1.15)*100}%` }} />
                    <div className="absolute inset-y-0 bg-yellow-800/60" style={{ left: `${(1/1.15)*100}%`, right: 0 }} />
                    <div className={`absolute top-0 bottom-0 w-1 ${incomeRatio <= 1.0 ? "bg-green-400" : incomeRatio <= 1.15 ? "bg-yellow-400" : "bg-red-400"}`} style={{ left: `${Math.min(incomeRatio/1.15, 1) * 100}%` }} />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-green-400">✓ PASS ≤100%</span>
                    <span className="text-yellow-400">⚠ BORDERLINE 100–115%</span>
                    <span className="text-red-400">✗ FAIL &gt;115%</span>
                  </div>
                </div>
              )}

              <Chip status={incomeRatio <= 1.0 ? "pass" : incomeRatio <= 1.15 ? "warn" : "fail"}>
                {incomeRatio <= 1.0 ? "✓ PASS — Within USDA Limit" : incomeRatio <= 1.15 ? "⚠ BORDERLINE — Manual Review Required" : "✗ FAIL — Exceeds USDA Limit"}
              </Chip>

              {incomeRatio > 1.0 && incomeRatio <= 1.15 && (
                <InfoBox color="yellow">Income is between 100%–115% of the limit. Apply all deductions in Step 2 to reduce adjusted income. Manual underwrite pathway may be available — see USDA Rescue™ in Step 8.</InfoBox>
              )}
            </Card>

            <NavRow onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Next: Loan Setup →" />
          </div>
        )}

        {/* ── STEP 4: Loan Parameters ──────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 4 — Loan Parameters</h2>
              <p className="text-sm text-slate-400 mt-1">USDA allows 100% LTV (plus financed guarantee fee). Escrow is mandatory. No renovation loans.</p>
            </div>

            <Card>
              <div className="grid grid-cols-2 gap-5">
                <Input label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} />
                <Input label="Base Loan Amount" value={baseLoan} onChange={setBaseLoan} note="Max = appraised value (before guarantee fee)" />
                <Input label="Interest Rate (%)" value={interestRate} onChange={setInterestRate} prefix="" />
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">Loan Term</label>
                  <select value={termMonths} onChange={e => setTermMonths(parseInt(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100">
                    <option value={360}>30-Year Fixed</option>
                    <option value={240}>20-Year Fixed</option>
                  </select>
                </div>
                <Input label="Annual Property Taxes" value={taxesAnnual} onChange={setTaxesAnnual} />
                <Input label="Annual Homeowners Insurance" value={insuranceAnnual} onChange={setInsuranceAnnual} />
                <Input label="HOA Monthly" value={hoaMonthly} onChange={setHoaMonthly} note="Enter 0 if none" />
                <Input label="Other Monthly Debts" value={otherDebts} onChange={setOtherDebts} note="From credit report — car, student loans, cards" />
                <Input label="Credit Score (Representative)" value={creditScore} onChange={setCreditScore} note="Middle score of lower-scoring borrower" prefix="" />
                <Input label="Seller Credits" value={sellerCredits} onChange={setSellerCredits} note="USDA allows up to 6% seller concessions" />
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-slate-100 mb-4">USDA Loan Parameter Rules</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Max LTV", "100% of appraised value (not purchase price)"],
                  ["Escrow", "MANDATORY — taxes, insurance, annual fee"],
                  ["Seller Concessions", "Up to 6% of purchase price"],
                  ["Renovation", "NOT ALLOWED — no USDA 203k equivalent"],
                  ["LTV with GF Financed", pp > 0 ? `${((baseLoanNum + gfAmt) / pp * 100).toFixed(1)}% (base + 1% GF)` : "—"],
                  ["Loan Limit", "No statutory limit — appraised value controls"],
                  ["Condos", "Rarely approved — USDA project approval required"],
                  ["Manufactured", "Special rules — new only, permanently affixed"],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between bg-slate-700/30 rounded-xl p-3">
                    <span className="text-slate-400">{l}</span>
                    <span className="text-slate-200 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            <NavRow onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="Next: Guarantee Fee →" />
          </div>
        )}

        {/* ── STEP 5: Guarantee Fee ────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 5 — Guarantee Fee Engine™</h2>
              <p className="text-sm text-slate-400 mt-1">1.00% upfront + 0.35% annual. Compare financing vs paying upfront, and see USDA fees vs FHA MIP over 30 years.</p>
            </div>

            <Card className="space-y-5">
              <h3 className="font-bold text-slate-100">Upfront Guarantee Fee</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[["Base Loan", fmt(baseLoanNum), ""], ["1.00% Guarantee Fee", fmt(gfAmt), "text-green-400"], ["Total Loan (if financed)", fmt(baseLoanNum + gfAmt), ""]].map(([l, v, c]) => (
                  <div key={l} className="bg-slate-700/40 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-1">{l}</div>
                    <div className={`text-xl font-bold ${c || "text-slate-100"}`}>{v}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[[true, "Finance into Loan", `Adds ${fmt(gfAmt)} to loan. Zero cash required for GF. Slightly higher monthly payment.`], [false, "Pay Upfront at Closing", `${fmt(gfAmt)} cash required at closing. Lower loan balance and monthly P&I.`]].map(([val, label, desc]) => (
                  <button key={label} onClick={() => setFinanceGF(val)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${financeGF === val ? "bg-green-900/20 border-green-500" : "bg-slate-700/20 border-slate-600 hover:border-slate-500"}`}>
                    <div className="font-bold text-sm text-slate-100 mb-1">{label}</div>
                    <div className="text-xs text-slate-400">{desc}</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h3 className="font-bold text-slate-100">Annual Fee (0.35%) — Collected Monthly</h3>
              <div className="space-y-2 text-sm">
                {[["Basis (total loan)", fmt(totalLoan)], ["Annual fee", `${fmt(totalLoan * ANNUAL_FEE_PCT / 100)}/yr`], ["Monthly escrow", fmtD(annualFeeMonthly)]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-slate-400">
                    <span>{l}</span>
                    <span className="text-slate-200 font-semibold">{v}</span>
                  </div>
                ))}
              </div>
              <InfoBox color="blue">The 0.35% annual fee is calculated on the outstanding loan balance, so it decreases as you pay down the principal — unlike FHA MIP which is fixed on the original loan amount for the life of the loan.</InfoBox>
            </Card>

            {pp > 0 && rate > 0 && (
              <Card>
                <h3 className="font-bold text-slate-100 mb-4">USDA Fee vs FHA MIP — Cost Comparison</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[["🌾 USDA", fmt(gfAmt), fmtD(annualFeeMonthly), "Annual fee decreases with balance; may reach $0 at low LTV", "green"],
                    ["🏦 FHA (3.5% down)", fmt(fhaBase * FHA_UPFRONT_MIP), fmtD(fhaMIPMo), "MIP is permanent for the full life of loan if less than 10% down", "blue"]].map(([prog, up, mo, note, c]) => (
                    <div key={prog} className={`rounded-xl border p-4 ${c === "green" ? "bg-green-900/10 border-green-700/30" : "bg-blue-900/10 border-blue-700/30"}`}>
                      <div className="font-bold text-slate-100 mb-3">{prog}</div>
                      <div className="text-sm space-y-1">
                        <div className="text-slate-300">{up} upfront (financeable)</div>
                        <div className={`font-bold ${c === "green" ? "text-green-400" : "text-blue-400"}`}>{mo}/mo</div>
                        <div className="text-xs text-slate-500 mt-2">{note}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {fhaMIPMo > annualFeeMonthly && (
                  <div className="mt-4 bg-green-900/15 border border-green-700/30 rounded-xl p-4 text-sm text-green-200">
                    <strong>USDA Monthly Savings vs FHA:</strong> {fmtD(fhaMIPMo - annualFeeMonthly)}/mo · {fmt((fhaMIPMo - annualFeeMonthly) * 360)} over 30 years
                  </div>
                )}
              </Card>
            )}

            <NavRow onBack={() => setStep(4)} onNext={() => setStep(6)} nextLabel="Next: Qualifying →" />
          </div>
        )}

        {/* ── STEP 6: Qualifying ───────────────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 6 — Qualifying Analysis</h2>
              <p className="text-sm text-slate-400 mt-1">DTI limits, compensating factor detection, GUS simulation, and manual underwrite pathway.</p>
            </div>

            <Card className="space-y-5">
              <h3 className="font-bold text-slate-100">DTI Analysis</h3>
              <div className="grid grid-cols-2 gap-4">
                {[[frontDTI, DTI_FRONT_LIMIT, "Front-End DTI (Housing)", "Limit: 29%"], [backDTI, dtiBackLimit, "Back-End DTI (Total)", `Limit: 41%${hasCompFactors ? " / 44% w/ comp factors" : ""}`]].map(([val, limit, label, sublabel], i) => {
                  const pass = val <= limit;
                  const borderline = i === 1 && val > DTI_BACK_LIMIT && val <= DTI_BACK_EXTENDED && hasCompFactors;
                  return (
                    <div key={label} className={`rounded-xl border p-5 text-center ${pass ? "bg-green-900/15 border-green-700/40" : borderline ? "bg-yellow-900/15 border-yellow-700/40" : "bg-red-900/15 border-red-700/40"}`}>
                      <div className="text-xs text-slate-400 mb-2">{label}</div>
                      <div className={`text-4xl font-black mb-2 ${pass ? "text-green-400" : borderline ? "text-yellow-400" : "text-red-400"}`}>{fmtPct(val)}</div>
                      <div className="text-xs text-slate-500 mb-2">{sublabel}</div>
                      <Chip status={pass ? "pass" : borderline ? "warn" : "fail"}>{pass ? "PASS" : borderline ? "BORDERLINE" : "FAIL"}</Chip>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-700/30 rounded-xl p-4 space-y-2 text-sm">
                <div className="font-semibold text-slate-200 mb-2">Payment Breakdown</div>
                {[["P&I", fmtD(pi)], ["Property Taxes", fmtD(taxMo)], ["Homeowners Insurance", fmtD(insMo)], ["HOA", fmtD(hoaMo)], ["USDA Annual Fee", fmtD(annualFeeMonthly)]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-slate-400"><span>{l}</span><span className="text-slate-200">{v}</span></div>
                ))}
                <div className="border-t border-slate-600 pt-2 flex justify-between font-bold">
                  <span className="text-slate-100">Total Monthly Payment</span>
                  <span className="text-green-400">{fmtD(piti)}</span>
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <h3 className="font-bold text-slate-100">Compensating Factors Analyzer™</h3>
              <p className="text-sm text-slate-400">One or more strong factors may allow back-end DTI up to 44% via manual underwrite pathway.</p>
              <div className="space-y-2">
                {COMP_FACTORS.map(cf => {
                  const auto = cf.autoFn ? cf.autoFn(creditScore) : false;
                  const checked = auto || !!compFactors[cf.id];
                  return (
                    <label key={cf.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${checked ? "bg-green-900/15 border-green-700/40" : "bg-slate-700/15 border-slate-600/30 hover:border-slate-500"}`}>
                      <input type="checkbox" checked={checked} disabled={auto} onChange={e => setCompFactors(p => ({ ...p, [cf.id]: e.target.checked }))} className="w-4 h-4 accent-green-500" />
                      <span className="text-sm text-slate-200 flex items-center gap-2">
                        {cf.label}
                        {auto && <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">Auto-detected</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="flex items-center gap-3 p-4 bg-blue-900/10 border border-blue-700/30 rounded-xl cursor-pointer">
                <input type="checkbox" checked={manualUW} onChange={e => setManualUW(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm text-blue-200"><strong>Manual Underwrite Pathway</strong> — GUS likely to return Refer; this file will be manually underwritten</span>
              </label>
            </Card>

            <div className={`rounded-2xl border p-6 space-y-3 ${gus.verdict === "ACCEPT" ? "bg-green-900/15 border-green-700/40" : gus.verdict === "REFER" ? "bg-yellow-900/15 border-yellow-700/40" : "bg-red-900/15 border-red-700/40"}`}>
              <h3 className="font-bold text-slate-100">GUS Simulation™</h3>
              <div className="flex items-center gap-4">
                <div className={`text-2xl font-black ${gus.verdict === "ACCEPT" ? "text-green-400" : gus.verdict === "REFER" ? "text-yellow-400" : "text-red-400"}`}>{gus.verdict}</div>
                <div className="text-sm text-slate-300">{gus.reason}</div>
              </div>
              <p className="text-xs text-slate-500">This simulation is based on primary USDA criteria. Actual GUS results depend on full credit file, employment history, and lender overlays.</p>
            </div>

            <NavRow onBack={() => setStep(5)} onNext={() => setStep(7)} nextLabel="Next: Comparison →" />
          </div>
        )}

        {/* ── STEP 7: Comparison ──────────────────────────────────────────── */}
        {step === 7 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 7 — Multi-Comparison Structuring Engine™</h2>
              <p className="text-sm text-slate-400 mt-1">Side-by-side comparison: payment, cash to close, and 30-year total cost. Use this to make the borrower recommendation.</p>
            </div>

            {pp > 0 && rate > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { name: "🌾 USDA", down: "0% / Zero Down", monthly: usdaMonthly, cash: usdaCash, total: usdaTotal, mi: `${fmtD(annualFeeMonthly)}/mo annual fee`, note: "Zero down. Best for rural buyers with limited cash. No monthly mortgage insurance — only a small annual fee.", eligible: ruralStatus === "eligible" && verdict !== "NOT_ELIGIBLE", highlight: true },
                    { name: "🏦 FHA", down: `3.5% / ${fmt(fhaDown)}`, monthly: fhaMonthly, cash: fhaCash, total: fhaTotal, mi: `${fmtD(fhaMIPMo)}/mo MIP (life of loan)`, note: "Best for non-rural areas or borrowers who don't qualify for USDA. Higher cash requirement.", eligible: true, highlight: false },
                    { name: "📊 Conventional", down: `5% / ${fmt(convDown)}`, monthly: convMonthly, cash: convCash, total: convTotal, mi: `${fmtD(convPMIMo)}/mo PMI (removable)`, note: "PMI can be removed at 80% LTV. Best for borrowers with stronger credit and down payment.", eligible: true, highlight: false },
                  ].map(prog => (
                    <div key={prog.name} className={`rounded-2xl border p-5 space-y-4 ${prog.highlight ? "bg-green-900/15 border-green-500/50" : "bg-slate-800 border-slate-700"}`}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-100 text-sm">{prog.name}</h3>
                        {prog.highlight && <span className="text-xs bg-green-700/40 text-green-300 px-2 py-0.5 rounded-full">Zero Down</span>}
                        {!prog.eligible && <Chip status="fail">Not Eligible</Chip>}
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Down</span><span className="text-slate-200">{prog.down}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Monthly</span><span className={`font-bold ${prog.highlight ? "text-green-400" : "text-slate-200"}`}>{fmtD(prog.monthly)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Cash to Close</span><span className="text-slate-200">{fmt(prog.cash)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">MI / Fee</span><span className="text-slate-300 text-xs text-right">{prog.mi}</span></div>
                        <div className="flex justify-between border-t border-slate-600 pt-2"><span className="text-slate-400">30yr Total</span><span className="text-slate-200">{fmt(prog.total)}</span></div>
                      </div>
                      <p className="text-xs text-slate-500">{prog.note}</p>
                    </div>
                  ))}
                </div>

                <Card className="border-green-700/30">
                  <h3 className="font-bold text-green-400 mb-4">USDA Advantage vs FHA</h3>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    {[["Monthly Savings", fmtD(Math.max(0, fhaMonthly - usdaMonthly)), "/mo"], ["Less Cash to Close", fmt(Math.max(0, fhaDown - usdaCash)), ""], ["30yr Total Savings", fmt(Math.max(0, fhaTotal - usdaTotal)), ""]].map(([l, v, s]) => (
                      <div key={l}>
                        <div className="text-xs text-slate-400 mb-1">{l}</div>
                        <div className="text-2xl font-bold text-green-400">{v}<span className="text-sm font-normal text-slate-400">{s}</span></div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            ) : (
              <InfoBox color="yellow">Complete Steps 4–5 (purchase price, rate, loan amount) to see the comparison.</InfoBox>
            )}

            <NavRow onBack={() => setStep(6)} onNext={() => setStep(8)} nextLabel="Next: Rescue™ →" />
          </div>
        )}

        {/* ── STEP 8: USDA Rescue™ ────────────────────────────────────────── */}
        {step === 8 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 8 — USDA Rescue™</h2>
              <p className="text-sm text-slate-400 mt-1">Targeted strategies to resolve income, DTI, and property issues before they become lender conditions or denial reasons.</p>
            </div>

            {verdict === "ELIGIBLE" && dtiStatus === "PASS" && incomeRatio <= 1.0 && hardFlags.length === 0 && ruralStatus === "eligible" ? (
              <InfoBox color="green">✅ <strong>No rescue needed.</strong> This scenario passes all primary USDA tests. Proceed to Results and save the Decision Record.</InfoBox>
            ) : (
              <>
                {incomeRatio > 1.0 && (
                  <Card className="border-yellow-700/40 space-y-4">
                    <h3 className="font-bold text-yellow-300">⚠ Income Reduction Strategies</h3>
                    <div className="space-y-3">
                      {RESCUE_INCOME.map(s => (
                        <div key={s.title} className="bg-slate-700/30 rounded-xl p-4">
                          <div className="font-semibold text-slate-100 text-sm mb-1">{s.title}</div>
                          <div className="text-xs text-slate-400">{s.detail}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {dtiStatus !== "PASS" && (
                  <Card className="border-red-700/40 space-y-4">
                    <h3 className="font-bold text-red-300">🔧 DTI Rescue Strategies</h3>
                    <div className="space-y-3">
                      {RESCUE_DTI.map(s => (
                        <div key={s.title} className="bg-slate-700/30 rounded-xl p-4">
                          <div className="font-semibold text-slate-100 text-sm mb-1">{s.title}</div>
                          <div className="text-xs text-slate-400">{s.detail}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {(ruralStatus !== "eligible" || hardFlags.length > 0 || warnFlags.length > 0 || donutHole) && (
                  <Card className="border-blue-700/40 space-y-4">
                    <h3 className="font-bold text-blue-300">🏠 Property Issue Strategies</h3>
                    <div className="space-y-3">
                      {RESCUE_PROPERTY.map(s => (
                        <div key={s.title} className="bg-slate-700/30 rounded-xl p-4">
                          <div className="font-semibold text-slate-100 text-sm mb-1">{s.title}</div>
                          <div className="text-xs text-slate-400">{s.detail}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}

            <NavRow onBack={() => setStep(7)} onNext={() => setStep(9)} nextLabel="Next: Results →" />
          </div>
        )}

        {/* ── STEP 9: Results & Decision Record ───────────────────────────── */}
        {step === 9 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Step 9 — Results & USDA Decision Record™</h2>
              <p className="text-sm text-slate-400 mt-1">Full eligibility summary, red flags, and Firestore Decision Record save.</p>
            </div>

            {/* Verdict banner */}
            <div className={`rounded-2xl border p-8 text-center ${verdict === "ELIGIBLE" ? "bg-green-900/20 border-green-600/50" : verdict === "BORDERLINE" ? "bg-yellow-900/20 border-yellow-600/50" : "bg-red-900/20 border-red-600/50"}`}>
              <div className={`text-5xl font-black mb-3 ${verdict === "ELIGIBLE" ? "text-green-400" : verdict === "BORDERLINE" ? "text-yellow-400" : "text-red-400"}`}>
                {verdict === "ELIGIBLE" ? "✅ ELIGIBLE" : verdict === "BORDERLINE" ? "⚠ BORDERLINE" : "⛔ NOT ELIGIBLE"}
              </div>
              <p className="text-slate-300 text-sm">
                {verdict === "ELIGIBLE" && "Scenario passes all primary USDA requirements. Submit to GUS."}
                {verdict === "BORDERLINE" && "One or more conditions require manual review or additional documentation."}
                {verdict === "NOT_ELIGIBLE" && "Scenario fails a hard USDA requirement. See flags below. Consider FHA."}
              </p>
            </div>

            {/* Full Summary */}
            <Card className="space-y-6">
              <h3 className="font-bold text-slate-100">Decision Record™ — Full Summary</h3>

              {/* Property */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Property</div>
                <div className="flex flex-wrap gap-2">
                  <Chip status={ruralStatus === "eligible" ? "pass" : ruralStatus === "ineligible" ? "fail" : "warn"}>Rural: {ruralStatus === "eligible" ? "Confirmed" : ruralStatus === "ineligible" ? "Ineligible" : "Not Verified"}</Chip>
                  {hardFlags.map(f => <Chip key={f.id} status="fail">⛔ {f.label}</Chip>)}
                  {warnFlags.map(f => <Chip key={f.id} status="warn">⚠ {f.label}</Chip>)}
                  {donutHole && <Chip status="warn">⚠ Donut Hole Risk</Chip>}
                  {hardFlags.length === 0 && warnFlags.length === 0 && ruralStatus === "eligible" && !donutHole && <Chip status="pass">No Property Issues</Chip>}
                </div>
              </div>

              {/* Income */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Household Income</div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  {[["Adj. HH Income", fmt(adjustedHHIncome)], ["USDA Limit", fmt(effectiveLimit)], ["Income Ratio", `${(incomeRatio*100).toFixed(1)}%`], ["Total Deductions", fmt(totalDeductions)]].map(([l, v]) => (
                    <div key={l} className="bg-slate-700/30 rounded-xl p-3"><div className="text-xs text-slate-400">{l}</div><div className="font-bold text-slate-100">{v}</div></div>
                  ))}
                </div>
                <div className="mt-2">
                  <Chip status={incomeRatio <= 1.0 ? "pass" : incomeRatio <= 1.15 ? "warn" : "fail"}>Income: {incomeRatio <= 1.0 ? "PASS" : incomeRatio <= 1.15 ? "BORDERLINE" : "FAIL"}</Chip>
                </div>
              </div>

              {/* Loan */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Loan Structure</div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  {[["Base Loan", fmt(baseLoanNum)], ["Guarantee Fee", `${fmt(gfAmt)} (${financeGF ? "financed" : "upfront"})`], ["Total Loan", fmt(totalLoan)], ["Annual Fee/mo", fmtD(annualFeeMonthly)]].map(([l, v]) => (
                    <div key={l} className="bg-slate-700/30 rounded-xl p-3"><div className="text-xs text-slate-400">{l}</div><div className="font-bold text-slate-100">{v}</div></div>
                  ))}
                </div>
              </div>

              {/* DTI */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">DTI & Qualifying</div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  {[["Total PITI", fmtD(piti)], ["Front-End DTI", fmtPct(frontDTI)], ["Back-End DTI", fmtPct(backDTI)], ["GUS Simulation", gus.verdict]].map(([l, v]) => (
                    <div key={l} className="bg-slate-700/30 rounded-xl p-3"><div className="text-xs text-slate-400">{l}</div><div className="font-bold text-slate-100">{v}</div></div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip status={dtiStatus === "PASS" ? "pass" : dtiStatus === "BORDERLINE" ? "warn" : "fail"}>DTI: {dtiStatus}</Chip>
                  {manualUW && <Chip status="info">Manual Underwrite</Chip>}
                  {cfCount > 0 && <Chip status="info">{cfCount} Compensating Factor{cfCount > 1 ? "s" : ""}</Chip>}
                </div>
              </div>

              {/* Comparison */}
              {pp > 0 && rate > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Program Comparison</div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[["🌾 USDA", fmtD(usdaMonthly), fmt(usdaCash)], ["🏦 FHA", fmtD(fhaMonthly), fmt(fhaCash)], ["📊 Conv", fmtD(convMonthly), fmt(convCash)]].map(([p, m, c]) => (
                      <div key={p} className="bg-slate-700/30 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">{p}</div><div className="font-bold text-slate-100">{m}/mo</div><div className="text-xs text-slate-400">{c} CTC</div></div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* LO Notes */}
            <Card>
              <label className="block text-sm font-semibold text-slate-300 mb-2">LO Notes for Decision Record</label>
              <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={4}
                placeholder="Document manual verifications needed, lender overlays, compensating factor details, borrower-specific considerations..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-500 text-sm" />
            </Card>

            {/* Red Flags */}
            {(warnFlags.length > 0 || manualUW || incomeRatio > 1.0 || donutHole) && (
              <div className="bg-red-900/10 border border-red-700/30 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-red-300 mb-3">🚩 Red Flags Requiring LO Verification</h3>
                <ul className="space-y-2 text-sm text-red-200">
                  {warnFlags.map(f => <li key={f.id}>• <strong>{f.label}:</strong> {f.note}</li>)}
                  {donutHole && <li>• <strong>Donut Hole Risk:</strong> Verify parcel eligibility at USDA map — address-level check may be incorrect</li>}
                  {incomeRatio > 1.0 && <li>• <strong>Income at {(incomeRatio*100).toFixed(1)}% of limit:</strong> Verify all deductions are applied and documented before submission</li>}
                  {manualUW && <li>• <strong>Manual Underwrite:</strong> Compile full compensating factor file — reserves, employment, payment shock</li>}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 print:hidden">
              <button onClick={saveDecisionRecord} disabled={saving || saved}
                className="flex-1 py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all">
                {saving ? "Saving..." : saved ? "✓ Saved to Decision Record" : "💾 Save Decision Record™"}
              </button>
              <button onClick={() => window.print()}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-sm">
                🖨 Print PDF
              </button>
            </div>

            <NavRow onBack={() => setStep(8)} />
          </div>
        )}

      </div>
    </div>
  );
}
