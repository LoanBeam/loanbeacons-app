import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";

function calcPI(b, r, m) {
  if (!b || !r || !m) return 0;
  const mo = r / 100 / 12;
  if (mo === 0) return b / m;
  return (b * mo * Math.pow(1+mo,m)) / (Math.pow(1+mo,m)-1);
}
const f$ = n => (isNaN(n)||!isFinite(n)) ? "$—" : "$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fp = n => isNaN(n) ? "—%" : Number(n).toFixed(3)+"%";
const fp4 = n => isNaN(n) ? "—%" : Number(n).toFixed(4)+"%";

const STEPS = ["Eligibility","Seasoning","Loan Type","Loan Details","Pricing & Credits","NTB Analysis","Funding Fee","Doc Checklist","Results"];

function ProgressBar({cur}) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-2">
        {STEPS.map((s,i)=>(
          <div key={i} className="flex flex-col items-center" style={{width:`${100/STEPS.length}%`}}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
              ${i<cur?"bg-green-600 border-green-600 text-white":i===cur?"bg-blue-900 border-blue-400 text-blue-200":"bg-slate-800 border-slate-600 text-slate-500"}`}>
              {i<cur?"✓":i+1}
            </div>
            <span className={`text-xs mt-1 text-center leading-tight hidden xl:block ${i===cur?"text-blue-300 font-semibold":"text-slate-500"}`}>{s}</span>
          </div>
        ))}
      </div>
      <div className="relative h-1.5 bg-slate-700 rounded-full">
        <div className="absolute h-1.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500" style={{width:`${(cur/(STEPS.length-1))*100}%`}}/>
      </div>
    </div>
  );
}

function Card({icon,title,subtitle,badge,children}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 mb-4 shadow-xl">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-900/50 border border-blue-700/50 flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {badge&&<span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-900/60 border border-blue-700/60 text-blue-300 uppercase tracking-wider">{badge}</span>}
          </div>
          {subtitle&&<p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Tip({text}) {
  const [s,set]=useState(false);
  return (
    <span className="relative inline-block ml-1">
      <span onMouseEnter={()=>set(true)} onMouseLeave={()=>set(false)} className="cursor-help text-blue-400 text-xs border border-blue-700 rounded-full w-4 h-4 inline-flex items-center justify-center">?</span>
      {s&&<div className="absolute z-50 bottom-6 left-0 w-72 bg-slate-900 border border-blue-700 rounded-lg p-3 text-xs text-slate-300 shadow-2xl leading-relaxed">{text}</div>}
    </span>
  );
}

function Gate({label,status,tip}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border mb-2 ${status==="pass"?"bg-green-900/20 border-green-700/50":status==="fail"?"bg-red-900/20 border-red-700/50":"bg-slate-700/30 border-slate-600/50"}`}>
      <span className="text-sm text-slate-300 flex items-center gap-1">{label}{tip&&<Tip text={tip}/>}</span>
      <span className={`text-sm font-bold ${status==="pass"?"text-green-400":status==="fail"?"text-red-400":"text-slate-500"}`}>{status==="pass"?"✅ PASS":status==="fail"?"❌ FAIL":"—"}</span>
    </div>
  );
}

function Nav({onBack,onNext,label,disabled}) {
  return (
    <div className="flex justify-between mt-6">
      {onBack?<button onClick={onBack} className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300">← Back</button>:<div/>}
      <button onClick={onNext} disabled={disabled} className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${disabled?"bg-slate-700 text-slate-500 cursor-not-allowed":"bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40"}`}>{label||"Continue →"}</button>
    </div>
  );
}

function Stat({label,value,sub,color="slate"}) {
  const c={green:"bg-green-900/20 border-green-700/50 text-green-300",red:"bg-red-900/20 border-red-700/50 text-red-300",blue:"bg-blue-900/20 border-blue-700/50 text-blue-300",yellow:"bg-yellow-900/20 border-yellow-700/50 text-yellow-300",slate:"bg-slate-700/40 border-slate-600/50 text-slate-200"};
  return (
    <div className={`rounded-xl p-4 border text-center ${c[color]}`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${c[color].split(" ")[2]}`}>{value}</p>
      {sub&&<p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const EXEMPTIONS = [
  {id:"disability_comp",label:"Receiving VA Compensation for Service-Connected Disability",detail:"Veteran currently receives monthly VA disability compensation (any % rating) for a service-connected condition. Verify via COE or VA Award Letter."},
  {id:"disability_entitled",label:"Entitled to VA Compensation but Receiving Retirement or Active Duty Pay",detail:"Veteran is rated service-connected and entitled to VA comp, but receives military retirement or active duty pay instead."},
  {id:"surviving_spouse",label:"Surviving Spouse Receiving DIC Benefits",detail:"Unremarried surviving spouse of veteran who died in service or from service-connected disability, receiving Dependency and Indemnity Compensation."},
  {id:"purple_heart",label:"Active Duty Service Member — Purple Heart Recipient",detail:"Active duty service member awarded the Purple Heart. Applies to loans closed on or after January 1, 2020 (Blue Water Navy Act)."},
  {id:"proposed_rating",label:"Veteran with Proposed or Memorandum Rating for Service-Connected Disability",detail:"Veteran received a proposed or memorandum rating prior to loan closing. Must be documented in loan file."},
];

const DOCS_ALWAYS = [
  {icon:"📋",name:"VA Form 26-8923 — IRRRL Worksheet",how:"Lender's official IRRRL certification worksheet. Required by VA Lender's Handbook Ch. 8. Your LOS system should have this form.",note:"Documents NTB calculation, funding fee, and lender certifications. Required for VA audit."},
  {icon:"📄",name:"NTB Comparison Statement — TWO Required Disclosures",how:"Per VA Circular 26-19-22 §3.d: Present (1) within 3 business days of application AND (2) again at closing. Veteran must acknowledge receipt of BOTH in writing (email, e-signature, or signed letter).",note:"CRITICAL: Both disclosures required for VA to guarantee the loan. Must show VA Loan ID, loan amount, term, rate, monthly P&I, and recoupment period."},
  {icon:"📄",name:"Certificate of Eligibility (COE)",how:"Pull via VA's WebLGY system. If unavailable, submit VA Form 26-1880. COE shows funding fee exemption status.",note:"Always review exemption status on COE before finalizing pricing and disclosures."},
  {icon:"📊",name:"12-Month Mortgage Payment History",how:"Obtain a VOM from servicer, or collect last 12 mortgage statements.",note:"VA baseline: max 1×30 late. Most lender overlays require 0×30 — confirm with your lender."},
  {icon:"📜",name:"Original VA Loan Note & Closing Disclosure",how:"Borrower's closing package; servicer can provide copy if lost.",note:"Confirms loan is VA-guaranteed and establishes the seasoning start date."},
  {icon:"🏠",name:"Prior Occupancy Certification",how:"Included on VA Form 26-8923. Veteran certifies they previously occupied property as primary residence.",note:"Does NOT require current occupancy — veterans who have PCS'd or relocated can still IRRRL."},
  {icon:"🚫",name:"Property Not Listed for Sale — Signed Certification",how:"Borrower signs that property is not currently on MLS or any listing service.",note:"Listing must be canceled and confirmed off-market before application proceeds."},
];

const DOCS_ARM = [{icon:"📐",name:"Full Appraisal (Required — Fixed-to-ARM Only)",how:"Order via AMC. Acceptable: Fannie Mae 1004, 2055, 1073, 1075 per VA Circular 26-19-22 §3.b.2.b. Does NOT need to go through VA's appraisal system.",note:"LTV = total loan amount ÷ appraised value. One appraisal at reasonable/customary cost. Include report and invoice in loan file."}];

const DOCS_OVERLAY = [
  {icon:"💳",name:"Credit Report (Lender Overlay — Confirm First)",how:"Tri-merge credit report. VA has no minimum credit score for IRRRL, but most lenders impose 580–620 overlay.",note:"Ask lender for their credit overlay BEFORE ordering — saves a hard inquiry if not required."},
  {icon:"💼",name:"Income Documentation (Some Lenders — Confirm First)",how:"VA does NOT require income docs for IRRRL. If lender requires: 2 pay stubs + 2 years W-2s; self-employed: 2 years full federal returns.",note:"Confirm upfront. Most lenders waive income docs for IRRRL."},
];

// ─── Fee Definitions ─────────────────────────────────────────────────────────
// bucket: which summary bucket this fee belongs to for display grouping
// est(bal, isARM): pure function that returns the estimated dollar amount
// armOnly: if true, fee only appears on fixed-to-arm path
const FEE_DEFS = [
  // ── Title & Settlement ──
  { bucket:"title", id:"titleSearch",  label:"Title Search & Examination",
    tip:"Search of public records to confirm clear title and identify any existing liens or encumbrances. Required on all refinances.",
    range:"$200–$500",  est:(b)=>300,  vaNote:null, armOnly:false },
  { bucket:"title", id:"titleIns",     label:"Lender's Title Insurance",
    tip:"One-time premium protecting the lender against undiscovered title defects. Calculated as a percentage of the loan amount. Owner's policy is optional on an IRRRL.",
    range:"$400–$1,800", est:(b)=>Math.max(400,Math.min(1800,Math.round((b||150000)*0.0035/25)*25)), vaNote:null, armOnly:false },
  { bucket:"title", id:"settlement",   label:"Settlement / Closing / Escrow Fee",
    tip:"Fee paid to the closing agent (title company, attorney, or escrow company) for coordinating the closing, preparing documents, and disbursing funds.",
    range:"$450–$900",  est:(b)=>600,  vaNote:null, armOnly:false },
  { bucket:"title", id:"attorney",     label:"Attorney Fee (state-dependent)",
    tip:"Some states require a licensed attorney to conduct the closing. Not required in most states — confirm with your title company.",
    range:"$0–$600",    est:(b)=>0,    vaNote:"Required in some states only — verify", armOnly:false },
  // ── Recording & Government ──
  { bucket:"recording", id:"recording",    label:"Recording Fee (Deed of Trust / Mortgage)",
    tip:"County or municipal fee to record the new mortgage or deed of trust in the public record. Amount varies significantly by county.",
    range:"$50–$200",   est:(b)=>125,  vaNote:null, armOnly:false },
  { bucket:"recording", id:"transferTax",  label:"Government Transfer / Stamp Tax",
    tip:"State or county tax applied to mortgage documents. Most states exempt refinances from transfer taxes, but some do not. Confirm with your title company.",
    range:"$0–varies",  est:(b)=>0,    vaNote:"Usually $0 on refinances — verify for your state", armOnly:false },
  // ── Other Lender Fees ──
  { bucket:"other", id:"origination",  label:"Origination Fee (VA cap: 1.00%)",
    tip:"Lender's origination charge. VA allows a maximum of 1% of the loan amount. Many lenders charge 0% on IRRRL. Enter in dollars — see the cap hint below.",
    range:"$0–1% of loan", est:(b)=>0, vaNote:"VA statutory cap: 1.00% of loan amount", armOnly:false },
  { bucket:"other", id:"floodCert",    label:"Flood Certification",
    tip:"Fee to determine whether the property is in a FEMA-designated flood zone. Almost always required by lenders.",
    range:"$15–$25",    est:(b)=>18,   vaNote:null, armOnly:false },
  { bucket:"other", id:"creditReport", label:"Credit Report (lender overlay only)",
    tip:"VA does not require a credit report or minimum score for IRRRL. If your lender requires one due to their overlay, enter the cost here.",
    range:"$35–$75",    est:(b)=>0,    vaNote:"VA has no min score — lender overlay only", armOnly:false },
  { bucket:"other", id:"appraisal",    label:"Appraisal (Fixed-to-ARM only — required)",
    tip:"A full appraisal is required when converting from a fixed-rate loan to an ARM. Acceptable forms: Fannie Mae 1004, 2055, 1073, or 1075 per VA Circular 26-19-22 §3.b.2.b.",
    range:"$550–$900",  est:(b,arm)=>arm?675:0, vaNote:"Required ONLY for Fixed→ARM path", armOnly:true },
  { bucket:"other", id:"miscFees",     label:"Other / Miscellaneous Fees",
    tip:"Any additional legitimate fees not covered above (e.g., courier fee, wire transfer fee, document prep). All fees must be reasonable and customary per VA rules.",
    range:"varies",     est:(b)=>0,    vaNote:null, armOnly:false },
];

function DocItem({d,warn}) {
  return (
    <div className={`border rounded-xl p-4 mb-3 ${warn?"bg-amber-900/20 border-amber-700/40":"bg-slate-800/60 border-slate-700"}`}>
      <div className="flex items-start gap-2 mb-2"><span className="text-lg mt-0.5">{d.icon}</span><p className="font-bold text-white text-sm">{d.name}</p></div>
      <p className="text-xs text-slate-300 mb-1.5 ml-7"><strong className="text-slate-400">How to obtain:</strong> {d.how}</p>
      <div className="ml-7 flex items-start gap-1.5"><span className={`text-xs mt-0.5 flex-shrink-0 ${warn?"text-red-400":"text-yellow-400"}`}>{warn?"⚠️":"💡"}</span><p className={`text-xs ${warn?"text-red-300/80":"text-yellow-300/80"}`}>{d.note}</p></div>
    </div>
  );
}

export default function VAIRRRLIntelligence() {
  const [sp] = useSearchParams();
  const scenarioId = sp.get("scenarioId");
  const [mode, setMode] = useState("irrrl"); // "irrrl" | "cashout"
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState(null);
  const [saved, setSaved] = useState(false);

  // ── Cash-Out Refi state ──
  const [co, setCo] = useState({
    appraisedValue:"", existingBalance:"", cashOutAmount:"",
    purpose:"", purposeNote:"", firstUse:true,
    proposedRate:"", newTerm:"360", closingCosts:"",
    coFfEx:false, coFfReason:"",
  });
  const [coStep, setCoStep] = useState(0);
  const [coSaved, setCoSaved] = useState(false);

  const [gates, setGates] = useState({hasVALoan:null,propertyListed:null,priorOccupancy:null,latePayments:""});
  const [sea, setSea] = useState({firstPaymentDate:"",paymentsOnTime:""});
  const [lt, setLt] = useState({cur:"",prop:""});
  const [cur, setCur] = useState({balance:"",rate:"",remainingMonths:"",servicer:"",loanNumber:""});
  const [prop, setProp] = useState({newBalance:"",rate:"",term:"360",titleFees:"",recordingFees:"",otherFees:""});
  const [pr, setPr] = useState({method:"",dollar:"",parRate:"",cPer125:"",roll:false});
  const [ffEx, setFfEx] = useState(false);
  const [ffReason, setFfReason] = useState("");
  // ── Fee worksheet state ──
  const [feeMode, setFeeMode] = useState("estimate"); // "estimate" | "actual"
  const [feeActuals, setFeeActuals] = useState({});   // {id: "123.00"} — per-line overrides
  const [feeEditRow, setFeeEditRow] = useState(null); // which row is being inline-edited

  useEffect(()=>{
    if(!scenarioId)return;
    (async()=>{
      try{
        const snap=await getDoc(doc(db,"scenarios",scenarioId));
        if(snap.exists()){
          const d=snap.data();setScenario(d);
          if(d.loanAmount){setCur(p=>({...p,balance:String(d.loanAmount)}));setProp(p=>({...p,newBalance:String(Math.round(Number(d.loanAmount)*1.005))}))}
          if(d.interestRate)setCur(p=>({...p,rate:String(d.interestRate)}));
          if(d.loanTerm)setCur(p=>({...p,remainingMonths:String(Number(d.loanTerm)*12)}));
        }
      }catch(e){console.error(e);}
    })();
  },[scenarioId]);

  // ── Core calcs ──
  const curRate=parseFloat(cur.rate)||0;
  const propRate=parseFloat(prop.rate)||0;
  const loanBal=parseFloat(prop.newBalance)||0;
  const path=`${lt.cur}-to-${lt.prop}`;

  const curPI=calcPI(parseFloat(cur.balance)||0,curRate,parseInt(cur.remainingMonths)||0);
  const newPI=calcPI(loanBal,propRate,parseInt(prop.term)||0);
  const piSavings=curPI-newPI;
  const rateDrop=curRate-propRate;
  const ff=ffEx?0:loanBal*0.005;

  // ── Fee template resolution ──
  // resolvedFeeValue: if user has entered an override, use it; else use estimate (in estimate mode) or 0 (in actual mode)
  const resolvedFeeValue = (id) => {
    const entered = feeActuals[id];
    if (entered !== undefined && entered !== "") return parseFloat(entered) || 0;
    const def = FEE_DEFS.find(f => f.id === id);
    if (!def) return 0;
    if (feeMode === "estimate") return def.est(loanBal, path === "fixed-to-arm");
    return 0; // actual mode — user must enter
  };
  const isARM = path === "fixed-to-arm";
  const grossFees = FEE_DEFS
    .filter(f => !f.armOnly || isARM)
    .reduce((s, f) => s + resolvedFeeValue(f.id), 0);

  // Fee bucket subtotals (for display)
  const feeByBucket = (bucket) => FEE_DEFS
    .filter(f => f.bucket === bucket && (!f.armOnly || isARM))
    .reduce((s,f) => s + resolvedFeeValue(f.id), 0);

  // Switch to actual mode: pre-fill any empty actuals with current estimates
  const switchToActual = () => {
    setFeeActuals(prev => {
      const next = {...prev};
      FEE_DEFS.forEach(f => {
        if (!f.armOnly || isARM) {
          if (next[f.id] === undefined || next[f.id] === "") {
            const est = f.est(loanBal, isARM);
            if (est > 0) next[f.id] = String(est);
          }
        }
      });
      return next;
    });
    setFeeMode("actual");
  };

  const totalDisc=ff+grossFees;

  // ── Pricing calcs ──
  const parRate=parseFloat(pr.parRate)||0;
  const cPer125=parseFloat(pr.cPer125)||0;
  const bumps=parRate>0&&propRate>parRate?(propRate-parRate)/0.125:0;
  const creditPct=bumps*cPer125;
  const creditFromRate=loanBal>0?(creditPct/100)*loanBal:0;
  const creditFromDollar=parseFloat(pr.dollar)||0;
  const credit=pr.method==="dollar"?creditFromDollar:pr.method==="rate"?creditFromRate:0;
  const creditApplied=Math.min(credit,totalDisc);
  const excess=Math.max(0,credit-totalDisc);
  const hasExcess=excess>0.01;
  const netFees=Math.max(0,grossFees-credit);
  const remaining=Math.max(0,totalDisc-creditApplied);
  const cashToClose=pr.roll?0:remaining;
  const isNoCost=cashToClose===0&&!hasExcess&&pr.method!=="";

  // ── NTB floor ──
  const floor=(()=>{
    if(path==="arm-to-fixed")return null;
    if(path==="fixed-to-fixed")return curRate-0.5;
    if(path==="fixed-to-arm")return curRate-2.0;
    if(path==="arm-to-arm")return curRate-0.001;
    return null;
  })();
  const passFloor=floor===null?true:propRate<=floor;
  const headroom=floor!==null&&propRate>0?((floor-propRate)*100).toFixed(1):null;

  // ── NTB pass/fail ──
  const ntbRate=(()=>{
    if(!lt.cur||!lt.prop)return null;
    if(path==="arm-to-fixed")return true;
    if(path==="fixed-to-fixed")return rateDrop>=0.5;
    if(path==="fixed-to-arm")return rateDrop>=2.0;
    if(path==="arm-to-arm")return rateDrop>0;
    return false;
  })();
  const piHigher=newPI>0&&curPI>0&&newPI>=curPI;
  const recoupMo=(()=>{
    if(piHigher)return Infinity;
    if(piSavings>0&&netFees>0)return Math.ceil(netFees/piSavings);
    if(piSavings>0&&netFees===0)return 0;
    return Infinity;
  })();
  const ntbRecoup=piHigher?netFees===0:recoupMo<=36;
  const ntbOK=ntbRate===true&&ntbRecoup&&!hasExcess;
  const breakEven=(()=>{
    if(recoupMo===0)return"Immediately (no-cost loan)";
    if(!isFinite(recoupMo))return"N/A";
    const d=new Date();d.setMonth(d.getMonth()+recoupMo);
    return d.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  })();
  const lifetime=piSavings>0?piSavings*(parseInt(prop.term)||0)-totalDisc:0;

  // ── Rate Sensitivity Table ──
  const sensitivityRows = [-0.50,-0.25,0,+0.25,+0.50].map(delta => {
    const r = propRate + delta;
    const pi = calcPI(loanBal, r, parseInt(prop.term)||360);
    const sav = curPI - pi;
    const drop = curRate - r;
    const passRate = path==="fixed-to-fixed"?drop>=0.5:path==="fixed-to-arm"?drop>=2.0:path==="arm-to-arm"?drop>0:true;
    const recoup = sav>0&&netFees>0?Math.ceil(netFees/sav):sav>0&&netFees===0?0:Infinity;
    const passRecoup = isFinite(recoup)?recoup<=36:netFees===0;
    const ok = passRate&&passRecoup;
    return {delta, rate:r, pi, sav, drop, passRate, recoup, passRecoup, ok, isCurrent:delta===0};
  });

  // ── Cash-Out Refi calcs ──
  const coApprVal = parseFloat(co.appraisedValue)||0;
  const coExistBal = parseFloat(co.existingBalance)||0;
  const coCashOut = parseFloat(co.cashOutAmount)||0;
  const coNewBal = coExistBal + coCashOut;
  const coLTV = coApprVal>0?(coNewBal/coApprVal)*100:0;
  const coLTVOK = coLTV<=100;
  const coEquity = coApprVal - coExistBal;
  const coRate = parseFloat(co.proposedRate)||0;
  const coTerm = parseInt(co.newTerm)||360;
  const coNewPI = calcPI(coNewBal, coRate, coTerm);
  const coExistPI = calcPI(coExistBal, curRate, parseInt(cur.remainingMonths)||360);
  const coPaymentIncrease = coNewPI - coExistPI;
  const coFfPct = co.coFfEx?0:co.firstUse?0.0215:0.033;
  const coFf = coNewBal*coFfPct;
  const coClosingCosts = parseFloat(co.closingCosts)||0;
  const coTotalCosts = coFf + coClosingCosts;
  const coNetProceeds = coCashOut - coClosingCosts;
  const CO_STEPS = ["Eligibility","Property & Equity","Loan Details","Funding Fee","Purpose","Results"];
  const CO_PURPOSES = [
    {id:"home_improve",label:"Home Improvement / Renovation",icon:"🏠"},
    {id:"debt_consolidation",label:"Debt Consolidation",icon:"💳"},
    {id:"education",label:"Education Expenses",icon:"🎓"},
    {id:"medical",label:"Medical Expenses",icon:"🏥"},
    {id:"emergency",label:"Emergency Reserve",icon:"🚨"},
    {id:"investment",label:"Investment / Business",icon:"📈"},
    {id:"other",label:"Other (describe below)",icon:"📝"},
  ];

  // ── Seasoning ──
  const seaResult=(()=>{
    if(!sea.firstPaymentDate)return null;
    const fd=new Date(sea.firstPaymentDate+"T00:00:00");
    const e210=new Date(fd);e210.setDate(e210.getDate()+210);
    const pOk=parseInt(sea.paymentsOnTime)>=6;
    const dOk=new Date()>=e210;
    return{e210,pOk,dOk,ok:dOk&&pOk};
  })();

  // ── Gates ──
  const gs={
    va:gates.hasVALoan===true?"pass":gates.hasVALoan===false?"fail":"pending",
    listed:gates.propertyListed===false?"pass":gates.propertyListed===true?"fail":"pending",
    occ:gates.priorOccupancy===true?"pass":gates.priorOccupancy===false?"fail":"pending",
    late:gates.latePayments===""?"pending":parseInt(gates.latePayments)===0?"pass":"fail",
  };
  const gPass=Object.values(gs).every(v=>v==="pass");
  const gFail=Object.values(gs).some(v=>v==="fail");

  const saveCashOut = async() => {
    if(!scenarioId)return;
    try{
      await addDoc(collection(db,"scenarios",scenarioId,"decision_log"),{
        module:"VA Cash-Out Refi Intelligence",timestamp:serverTimestamp(),
        coLTV:parseFloat(coLTV.toFixed(2)), coNewBal:parseFloat(coNewBal.toFixed(2)),
        coCashOut, coFf:parseFloat(coFf.toFixed(2)), coTotalCosts:parseFloat(coTotalCosts.toFixed(2)),
        coNetProceeds:parseFloat(coNetProceeds.toFixed(2)), coRate, purpose:co.purpose,
      });
      setCoSaved(true);
    }catch(e){console.error(e);}
  };

  const save=async()=>{
    if(!scenarioId)return;
    try{
      await addDoc(collection(db,"scenarios",scenarioId,"decision_log"),{
        module:"VA IRRRL Intelligence",timestamp:serverTimestamp(),
        ntbRate,ntbRecoup,ntbOK,curRate,propRate,
        rateDrop:parseFloat(rateDrop.toFixed(3)),
        curPI:parseFloat(curPI.toFixed(2)),newPI:parseFloat(newPI.toFixed(2)),
        piSavings:parseFloat(piSavings.toFixed(2)),
        pricingMethod:pr.method,credit:parseFloat(credit.toFixed(2)),
        grossFees:parseFloat(grossFees.toFixed(2)),netFees:parseFloat(netFees.toFixed(2)),
        cashToClose:parseFloat(cashToClose.toFixed(2)),hasExcess,isNoCost,
        ff:parseFloat(ff.toFixed(2)),ffEx,ffReason:ffEx?ffReason:null,
        totalDisc:parseFloat(totalDisc.toFixed(2)),
        recoupMo:isFinite(recoupMo)?recoupMo:null,
        lifetime:parseFloat(lifetime.toFixed(2)),
        verdict:ntbOK?"IRRRL RECOMMENDED":"IRRRL NOT RECOMMENDED",
        source:"VA Circular 26-19-22 | 38 U.S.C. § 3709",
      });setSaved(true);
    }catch(e){console.error(e);}
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white" style={{fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;600;700&family=DM+Mono:wght@400;500&display=swap');
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
        .pill{cursor:pointer;padding:8px 18px;border-radius:9999px;border:1.5px solid;font-size:.85rem;font-weight:600;transition:all .2s;}
        @media print{body *{visibility:hidden!important;}#printable,#printable *{visibility:visible!important;}#printable{position:fixed;top:0;left:0;width:100%;background:white!important;color:black!important;padding:36px;box-sizing:border-box;}.no-print{display:none!important;}}
      `}</style>

      {/* HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border-b border-blue-900/50 px-6 py-5 no-print">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs font-bold text-blue-400 tracking-widest uppercase">LoanBeacons™</span>
            <h1 className="text-2xl font-bold text-white mt-1">🎖️ VA IRRRL Intelligence™</h1>
            <p className="text-slate-400 text-sm mt-0.5">Interest Rate Reduction Refinance Loan · VA Circular 26-19-22 · 38 U.S.C. § 3709</p>
          </div>
          {scenario?(
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-4 py-2 text-right">
              <div className="text-xs text-blue-400 font-semibold mb-0.5">LINKED SCENARIO</div>
              <div className="text-sm text-white font-bold">{scenario.borrowerName||scenario.lastName||"Unnamed"}</div>
              <div className="text-xs text-slate-400">{scenario.streetAddress||"No address"}</div>
            </div>
          ):(
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-2 text-xs text-yellow-400">No scenario linked — standalone mode</div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 no-print">
        {/* Mode Selector */}
        <div className="flex gap-3 mb-6 p-1 bg-slate-800/60 border border-slate-700 rounded-2xl">
          {[["irrrl","🔄","VA IRRRL","Interest Rate Reduction Refinance"],["cashout","💵","VA Cash-Out Refi","Equity Extraction + Refinance"]].map(([m,icon,label,sub])=>(
            <button key={m} onClick={()=>{setMode(m);setStep(0);setCoStep(0);}}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all text-left ${mode===m?"bg-blue-700 text-white shadow-lg":"text-slate-400 hover:text-slate-200"}`}>
              <span className="mr-2">{icon}</span>{label}
              <p className={`text-xs font-normal mt-0.5 ${mode===m?"text-blue-200":"text-slate-500"}`}>{sub}</p>
            </button>
          ))}
        </div>

        {/* ── IRRRL MODE ── */}
        {mode==="irrrl"&&<>
        <ProgressBar cur={step}/>

        {/* ═══ STEP 1 — ELIGIBILITY ══════════════════════════ */}
        {step===0&&(
          <Card icon="🚦" title="Step 1 — Eligibility Pre-Check" subtitle="Four hard gates. ALL must pass. Any failure stops the IRRRL.">
            {/* Gate 1 */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-200 mb-2">Gate 1: Does the borrower have an existing VA-backed mortgage on this property?<Tip text="VA IRRRL is VA-to-VA ONLY. FHA, conventional, and USDA loans cannot use this program — no exceptions."/></p>
              <div className="flex gap-3 flex-wrap">
                {[["Yes — existing VA loan ✓",true],["No — not a VA loan ✗",false]].map(([l,v])=>(
                  <label key={String(v)} className={`pill ${gates.hasVALoan===v?(v?"bg-green-800 border-green-500 text-green-200":"bg-red-900 border-red-600 text-red-200"):"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                    <input type="radio" className="hidden" onChange={()=>setGates(g=>({...g,hasVALoan:v}))}/>{l}
                  </label>
                ))}
              </div>
              {gates.hasVALoan===false&&<div className="mt-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">❌ <strong>STOP.</strong> VA IRRRL is only for existing VA-guaranteed loans. Consider a VA Cash-Out Refi or conventional refinance.</div>}
            </div>
            {/* Gate 2 */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-200 mb-2">Gate 2: Is the property currently listed for sale?<Tip text="VA prohibits IRRRL on properties listed for sale. Must be canceled and off-market before application."/></p>
              <div className="flex gap-3 flex-wrap">
                {[["Yes — currently listed ✗",true],["No — not listed ✓",false]].map(([l,v])=>(
                  <label key={String(v)} className={`pill ${gates.propertyListed===v?(v?"bg-red-900 border-red-600 text-red-200":"bg-green-800 border-green-500 text-green-200"):"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                    <input type="radio" className="hidden" onChange={()=>setGates(g=>({...g,propertyListed:v}))}/>{l}
                  </label>
                ))}
              </div>
              {gates.propertyListed===true&&<div className="mt-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">❌ <strong>STOP.</strong> Borrower must cancel listing and provide written agent confirmation before proceeding.</div>}
            </div>
            {/* Gate 3 */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-200 mb-2">Gate 3: Did the veteran previously occupy this property as primary residence when the original VA loan closed?<Tip text="IRRRL uses PRIOR occupancy — not current. Veterans who have PCS'd or relocated can still qualify."/></p>
              <div className="flex gap-3 flex-wrap">
                {[["Yes — previously occupied ✓",true],["No — never lived there ✗",false]].map(([l,v])=>(
                  <label key={String(v)} className={`pill ${gates.priorOccupancy===v?(v?"bg-green-800 border-green-500 text-green-200":"bg-red-900 border-red-600 text-red-200"):"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                    <input type="radio" className="hidden" onChange={()=>setGates(g=>({...g,priorOccupancy:v}))}/>{l}
                  </label>
                ))}
              </div>
              <p className="text-xs text-blue-400/70 mt-1.5">💡 Military families who have PCS'd can still IRRRL their former home — a key veteran benefit.</p>
            </div>
            {/* Gate 4 */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-200 mb-2">Gate 4: How many 30-day late payments on this VA mortgage in the last 12 months?<Tip text="VA baseline: max 1×30 late. Most lender overlays require 0×30. Enter actual count from payment history."/></p>
              <div className="flex items-center gap-3">
                <input type="number" min="0" max="12" value={gates.latePayments} onChange={e=>setGates(g=>({...g,latePayments:e.target.value}))} placeholder="0" className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-center text-lg font-bold focus:outline-none focus:border-blue-500"/>
                <span className="text-slate-400 text-sm">30+ day late payment(s)</span>
              </div>
              {gates.latePayments!==""&&parseInt(gates.latePayments)===1&&<div className="mt-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-300">⚠️ VA allows 1×30 late, but most lenders require 0×30. Confirm with lender before proceeding.</div>}
              {gates.latePayments!==""&&parseInt(gates.latePayments)>1&&<div className="mt-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">❌ Multiple late payments will result in lender decline under virtually all overlays.</div>}
            </div>
            <div className="bg-slate-900/60 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Gate Summary</p>
              <Gate label="Existing VA Loan" status={gs.va} tip="VA-to-VA only — no exceptions"/>
              <Gate label="Property Not Listed for Sale" status={gs.listed}/>
              <Gate label="Prior Occupancy Certified" status={gs.occ} tip="Prior occupancy only — not current required"/>
              <Gate label="Payment History (0×30 lender overlay)" status={gs.late}/>
            </div>
            {gFail&&<div className="p-4 bg-red-900/30 border border-red-600/50 rounded-xl text-red-300 text-sm font-semibold text-center mb-4">❌ One or more gates failed. Resolve above before proceeding.</div>}
            <Nav onNext={()=>setStep(1)} label={gPass?"All Gates Pass — Continue →":"Complete All Gates First"} disabled={!gPass}/>
          </Card>
        )}

        {/* ═══ STEP 2 — SEASONING ════════════════════════════ */}
        {step===1&&(
          <Card icon="📅" title="Step 2 — Seasoning Calculator" subtitle="VA requires BOTH rules met simultaneously as of the IRRRL closing date. (VA Circular 26-19-22, §3.c)">
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4 mb-6 text-sm text-blue-200 space-y-1.5">
              <p><strong>Rule A — 210-Day Rule:</strong> First payment due date must be 210+ days before IRRRL closing date.</p>
              <p><strong>Rule B — 6-Payment Rule:</strong> Borrower must have made 6+ consecutive on-time payments.</p>
              <p className="text-xs text-slate-400">VA Example: Loan closed March 8, first payment due May 1, six payments made → seasoned November 27.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1">First Payment Due Date<Tip text="Due date of FIRST payment — NOT closing date. Find on original Note or first billing statement."/></label>
                <input type="date" value={sea.firstPaymentDate} onChange={e=>setSea(s=>({...s,firstPaymentDate:e.target.value}))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1">Consecutive On-Time Payments Made<Tip text="Count only unbroken consecutive on-time payments. A late payment resets the count."/></label>
                <input type="number" min="0" max="360" value={sea.paymentsOnTime} onChange={e=>setSea(s=>({...s,paymentsOnTime:e.target.value}))} placeholder="e.g. 14" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"/>
              </div>
            </div>
            {seaResult&&(
              <div className="bg-slate-900/50 rounded-xl p-5 mb-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-xl border ${seaResult.dOk?"bg-green-900/20 border-green-700/50":"bg-red-900/20 border-red-700/50"}`}>
                    <p className="text-xs text-slate-400 mb-1">Rule A — 210 Days</p>
                    <p className="font-bold text-white">Eligible from: {seaResult.e210.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>
                    <p className={`text-sm font-bold mt-1 ${seaResult.dOk?"text-green-400":"text-red-400"}`}>{seaResult.dOk?"✅ Satisfied":"❌ Not yet reached"}</p>
                  </div>
                  <div className={`p-4 rounded-xl border ${seaResult.pOk?"bg-green-900/20 border-green-700/50":"bg-red-900/20 border-red-700/50"}`}>
                    <p className="text-xs text-slate-400 mb-1">Rule B — 6 Payments</p>
                    <p className="font-bold text-white">{sea.paymentsOnTime||"—"} payments on record</p>
                    <p className={`text-sm font-bold mt-1 ${seaResult.pOk?"text-green-400":"text-red-400"}`}>{seaResult.pOk?"✅ Satisfied":`❌ Need ${Math.max(0,6-parseInt(sea.paymentsOnTime||0))} more`}</p>
                  </div>
                </div>
                <div className={`p-4 rounded-xl text-center font-bold text-lg border ${seaResult.ok?"bg-green-900/30 border-green-600 text-green-300":"bg-red-900/30 border-red-600 text-red-300"}`}>
                  {seaResult.ok?"✅ SEASONED — Eligible to proceed":"❌ NOT SEASONED — Both rules must be met simultaneously"}
                </div>
              </div>
            )}
            <Nav onBack={()=>setStep(0)} onNext={()=>setStep(2)} label={seaResult?.ok?"Seasoning Confirmed — Continue →":"Seasoning Not Yet Met"} disabled={!seaResult?.ok}/>
          </Card>
        )}

        {/* ═══ STEP 3 — LOAN TYPE ════════════════════════════ */}
        {step===2&&(
          <Card icon="🔀" title="Step 3 — Loan Type Matrix" subtitle="Your selection determines the NTB rate threshold, appraisal requirement, and pricing window.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {[["Current Loan Type","cur"],["Proposed New Loan Type","prop"]].map(([heading,field])=>(
                <div key={field}>
                  <p className="text-sm font-bold text-slate-300 mb-3">{heading}</p>
                  {[["fixed","Fixed Rate","Rate locked for life of loan"],["arm","Adjustable Rate (ARM)","Rate changes based on market index"]].map(([val,label,desc])=>(
                    <label key={val} className={`block cursor-pointer p-4 rounded-xl border mb-3 transition-all ${lt[field]===val?"bg-blue-900/30 border-blue-500":"bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                      <input type="radio" className="hidden" checked={lt[field]===val} onChange={()=>setLt(l=>({...l,[field]:val}))}/>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${lt[field]===val?"border-blue-400":"border-slate-500"}`}>{lt[field]===val&&<div className="w-2 h-2 rounded-full bg-blue-400"/>}</div>
                        <span className="font-bold text-white text-sm">{label}</span>
                      </div>
                      <p className="text-xs text-slate-400 ml-6">{desc}</p>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {lt.cur&&lt.prop&&(
              <div className="bg-slate-900/50 rounded-xl p-5 mb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Rules for Your Path</p>
                {path==="fixed-to-fixed"&&<div className="space-y-2 text-sm text-slate-200"><p>✅ <strong>No appraisal required</strong> — most common IRRRL path</p><p>📏 Rate must drop ≥ <strong className="text-white">0.50% (50 bps)</strong> <span className="text-slate-500 text-xs">(§3.b.1)</span></p><p>⏱️ Net fees recouped in ≤ <strong className="text-white">36 months</strong> <span className="text-slate-500 text-xs">(§3709(a))</span></p><p>📋 VA funding fee <strong className="text-white">excluded</strong> from recoupment test <span className="text-slate-500 text-xs">(§3709(a))</span></p></div>}
                {path==="arm-to-fixed"&&<div className="space-y-2 text-sm text-slate-200"><p>✅ <strong>No appraisal required</strong></p><p>✅ <strong>No minimum rate drop</strong> — payment stability IS the NTB</p><p>⏱️ Recoupment test still applies to net fees</p></div>}
                {path==="fixed-to-arm"&&<div className="space-y-2 text-sm text-slate-200"><p>🔴 <strong>Appraisal REQUIRED</strong> <span className="text-slate-500 text-xs">(§3.b.2.b)</span></p><p>📏 Rate must drop ≥ <strong className="text-white">2.00% (200 bps)</strong> — far stricter than fixed-to-fixed <span className="text-slate-500 text-xs">(§3.b.2)</span></p><p>⚠️ ARM risk disclosure required; discount point financed limits apply</p></div>}
                {path==="arm-to-arm"&&<div className="space-y-2 text-sm text-slate-200"><p>⚠️ Uncommon path — confirm lender accepts ARM-to-ARM before proceeding</p><p>📏 Rate must decrease (no statutory minimum)</p></div>}
              </div>
            )}
            <Nav onBack={()=>setStep(1)} onNext={()=>setStep(3)} label="Path Selected — Continue →" disabled={!lt.cur||!lt.prop}/>
          </Card>
        )}

        {/* ═══ STEP 4 — LOAN DETAILS ═════════════════════════ */}
        {step===3&&(
          <Card icon="📊" title="Step 4 — Loan Details" subtitle="Enter current and proposed loan data. Pre-filled from Scenario Creator where available.">
            {scenario&&<div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-2 mb-5 text-xs text-blue-300">✓ Fields pre-populated from Scenario Creator — review and adjust.</div>}
            <p className="text-sm font-bold text-slate-300 mb-4">Current VA Loan</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {[["Current Balance","balance","$","e.g. 285000"],["Current Rate","rate","%","e.g. 7.250"],["Remaining Months","remainingMonths","mo","e.g. 318"]].map(([label,key,suf,ph])=>(
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                  <div className="relative">
                    {suf==="$"&&<span className="absolute left-3 top-2.5 text-slate-400 text-sm pointer-events-none">$</span>}
                    <input type="number" value={cur[key]} onChange={e=>setCur(l=>({...l,[key]:e.target.value}))} placeholder={ph} className={`w-full bg-slate-700 border border-slate-600 rounded-lg py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 ${suf==="$"?"pl-6 pr-3":"pl-3 pr-8"}`}/>
                    {suf!=="$"&&<span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">{suf}</span>}
                  </div>
                </div>
              ))}
              <div><p className="text-xs font-semibold text-slate-400 mb-1">Current P&I<Tip text="Auto-calculated from balance, rate, and remaining months"/></p><div className="bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2.5 text-blue-300 font-bold font-mono text-sm">{cur.balance&&cur.rate&&cur.remainingMonths?f$(curPI):<span className="text-slate-500">Enter above</span>}</div></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-1">Current Servicer</p><input value={cur.servicer} onChange={e=>setCur(l=>({...l,servicer:e.target.value}))} placeholder="e.g. Veterans United" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"/></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-1">VA Loan Number</p><input value={cur.loanNumber} onChange={e=>setCur(l=>({...l,loanNumber:e.target.value}))} placeholder="Existing VA loan #" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"/></div>
            </div>
            <div className="border-t border-slate-700 pt-5 mb-4"><p className="text-sm font-bold text-slate-300 mb-4">Proposed IRRRL Terms</p></div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
              {[["New Loan Balance","newBalance","$","e.g. 286425"],["New Interest Rate","rate","%","e.g. 6.500"],["New Term","term","mo","360=30yr·180=15yr"]].map(([label,key,suf,ph])=>(
                <div key={key+"p"}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                  <div className="relative">
                    {suf==="$"&&<span className="absolute left-3 top-2.5 text-slate-400 text-sm pointer-events-none">$</span>}
                    <input type="number" value={prop[key]} onChange={e=>setProp(l=>({...l,[key]:e.target.value}))} placeholder={ph} className={`w-full bg-slate-700 border border-slate-600 rounded-lg py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 ${suf==="$"?"pl-6 pr-3":"pl-3 pr-8"}`}/>
                    {suf!=="$"&&<span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">{suf}</span>}
                  </div>
                </div>
              ))}
            </div>
            {newPI>0&&curPI>0&&newPI>=curPI&&<div className="p-4 bg-amber-900/30 border border-amber-600 rounded-xl mb-5 text-sm text-amber-200"><p className="font-bold text-amber-300 mb-1">⚠️ Higher/Same Payment IRRRL</p><p>Proposed P&I ({f$(newPI)}) ≥ current P&I ({f$(curPI)}). Per §3709(a)(1)(B), veteran must incur <strong>zero non-exempt fees</strong>. Lender credits must eliminate all closing costs.</p></div>}
            {/* ── CLOSING COST WORKSHEET ── */}
            <div className="border-t border-slate-700 pt-6 mt-2">
              {/* Header + mode toggle */}
              <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Closing Cost Worksheet</p>
                  <p className="text-xs text-blue-400/70 mt-0.5">Gross fees before lender credits · VA funding fee excluded (calculated in Step 7)</p>
                </div>
                <div className="flex rounded-xl overflow-hidden border border-slate-600 flex-shrink-0">
                  <button onClick={()=>{setFeeMode("estimate");setFeeEditRow(null);}}
                    className={`px-4 py-2 text-xs font-bold transition-all ${feeMode==="estimate"?"bg-blue-700 text-white":"bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                    📊 Estimate
                  </button>
                  <button onClick={switchToActual}
                    className={`px-4 py-2 text-xs font-bold transition-all border-l border-slate-600 ${feeMode==="actual"?"bg-green-700 text-white":"bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                    ✏️ Actual Fees
                  </button>
                </div>
              </div>

              {/* Mode description */}
              {feeMode==="estimate"?(
                <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl px-4 py-3 mb-4 text-xs text-blue-200">
                  <strong>Estimate mode:</strong> Fees are auto-calculated from typical national ranges. Override any individual line item by clicking <strong>Override</strong>, or switch to <strong>Actual Fees</strong> mode to enter all fees from a Loan Estimate.
                </div>
              ):(
                <div className="bg-green-900/20 border border-green-700/40 rounded-xl px-4 py-3 mb-4 text-xs text-green-200">
                  <strong>Actual Fees mode:</strong> Enter real fees from the lender's Loan Estimate or title company quote. Fields are pre-filled with typical estimates as a starting point — adjust as needed.
                </div>
              )}

              {/* VA fee rules note */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 mb-5 text-xs text-slate-400 leading-relaxed">
                💡 <strong className="text-slate-300">VA Fee Rules:</strong> All fees must be "reasonable and customary." VA caps origination at 1.00% of loan amount. Veteran cannot be charged: escrow fees on a new escrow account, hazard insurance premiums, or tax service fees. Funding fee excluded from this worksheet — calculated separately in Step 7.
                {loanBal>0&&<span className="ml-2 text-blue-400">1% origination cap = <strong className="text-white">{f$(loanBal*0.01)}</strong> on your {f$(loanBal)} balance.</span>}
              </div>

              {/* Fee categories */}
              {[
                { label:"Title & Settlement", bucket:"title", ids:["titleSearch","titleIns","settlement","attorney"] },
                { label:"Recording & Government", bucket:"recording", ids:["recording","transferTax"] },
                { label:"Other Lender Fees", bucket:"other", ids:["origination","floodCert","creditReport","appraisal","miscFees"] },
              ].map(cat => {
                const catFees = FEE_DEFS.filter(f => cat.ids.includes(f.id) && (!f.armOnly || isARM));
                const catTotal = catFees.reduce((s,f)=>s+resolvedFeeValue(f.id),0);
                return (
                  <div key={cat.label} className="mb-4">
                    {/* Category header */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{cat.label}</p>
                      <p className="text-xs font-bold text-slate-300 font-mono">{f$(catTotal)}</p>
                    </div>
                    {/* Rows */}
                    <div className="bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700">
                      {catFees.map((fee, idx) => {
                        const resolved = resolvedFeeValue(fee.id);
                        const hasOverride = feeActuals[fee.id] !== undefined && feeActuals[fee.id] !== "";
                        const isEditing = feeEditRow === fee.id;
                        const isEstimateMode = feeMode === "estimate";
                        return (
                          <div key={fee.id}
                            className={`flex items-center gap-3 px-4 py-3 transition-all ${idx<catFees.length-1?"border-b border-slate-700/50":""}
                              ${hasOverride&&isEstimateMode?"bg-yellow-900/10":""}
                              ${fee.id==="appraisal"?"bg-amber-900/10":""}`}>
                            {/* Fee name */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-sm text-slate-200 leading-snug">{fee.label}</span>
                                <Tip text={fee.tip}/>
                              </div>
                              {fee.vaNote&&<p className="text-xs text-slate-500 mt-0.5">{fee.vaNote}</p>}
                              {fee.id==="origination"&&loanBal>0&&<p className="text-xs text-blue-400/70 mt-0.5">1% cap = {f$(loanBal*0.01)}</p>}
                            </div>

                            {/* Input or display */}
                            {(isEditing||!isEstimateMode) ? (
                              <div className="relative w-32 flex-shrink-0">
                                <span className="absolute left-2.5 top-2 text-slate-400 text-sm pointer-events-none">$</span>
                                <input type="number"
                                  value={feeActuals[fee.id]||""}
                                  onChange={e=>{setFeeActuals(p=>({...p,[fee.id]:e.target.value}));}}
                                  onBlur={()=>{if(isEditing)setFeeEditRow(null);}}
                                  placeholder={String(fee.est(loanBal,isARM)||"0")}
                                  autoFocus={isEditing}
                                  className="w-full bg-slate-700 border border-blue-500 rounded-lg pl-6 pr-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-400"/>
                              </div>
                            ) : (
                              <span className={`text-sm font-bold font-mono w-24 text-right flex-shrink-0 ${hasOverride?"text-yellow-300":"text-slate-200"}`}>
                                {f$(resolved)}{hasOverride&&<span className="text-xs ml-1 opacity-70">✓</span>}
                              </span>
                            )}

                            {/* Range + override button (estimate mode only) */}
                            {isEstimateMode&&!isEditing&&(
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-slate-600 hidden lg:block w-20 text-right">{fee.range}</span>
                                <button
                                  onClick={()=>setFeeEditRow(fee.id)}
                                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap
                                    ${hasOverride
                                      ?"border-yellow-600/50 text-yellow-400 bg-yellow-900/20 hover:bg-yellow-900/40"
                                      :"border-slate-600 text-slate-400 bg-slate-800/60 hover:bg-slate-700 hover:text-slate-300"}`}>
                                  {hasOverride?"✏️ Edit":"Override"}
                                </button>
                                {hasOverride&&(
                                  <button onClick={()=>setFeeActuals(p=>{const n={...p};delete n[fee.id];return n;})}
                                    className="text-xs text-slate-500 hover:text-slate-300 transition-all" title="Reset to estimate">
                                    ↺
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Range hint in actual mode */}
                            {!isEstimateMode&&(
                              <span className="text-xs text-slate-600 hidden lg:block w-20 text-right flex-shrink-0">{fee.range}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Grand total */}
              <div className={`rounded-xl border p-4 flex items-center justify-between mt-2 ${grossFees>0?"bg-slate-900/70 border-slate-600":"bg-slate-800/40 border-slate-700"}`}>
                <div>
                  <p className="font-bold text-white">Total Non-Exempt Closing Fees</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Gross · Lender credits applied in Step 5 · VA funding fee added in Step 7
                    {feeMode==="estimate"&&Object.keys(feeActuals).length>0&&<span className="text-yellow-400/70 ml-2">({Object.keys(feeActuals).filter(k=>feeActuals[k]!=="").length} item{Object.keys(feeActuals).filter(k=>feeActuals[k]!=="").length!==1?"s":""} overridden)</span>}
                  </p>
                </div>
                <p className={`text-2xl font-bold font-mono ${grossFees>0?"text-blue-300":"text-slate-500"}`}>{f$(grossFees)}</p>
              </div>

              {feeMode==="estimate"&&<p className="text-xs text-slate-600 text-center mt-2">📊 Using estimated fees · Switch to <strong>✏️ Actual Fees</strong> above to enter fees from a real Loan Estimate</p>}
            </div>
            <Nav onBack={()=>setStep(2)} onNext={()=>setStep(4)} label="Details Entered — Continue →" disabled={!prop.newBalance||!prop.rate}/>
          </Card>
        )}

        {/* ═══ STEP 5 — PRICING & CREDITS (NEW) ═════════════ */}
        {step===4&&(
          <Card icon="💹" title="Step 5 — Lender Pricing & Credit Analysis" badge="New in v3" subtitle="Use above-par pricing to generate lender credits that offset closing costs. Same concept as FHA Streamline — determine exact cash to close, or confirm a true no-cost IRRRL.">

            {/* Explainer + Rate Window */}
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-5 mb-6 text-sm text-blue-200">
              <p className="font-semibold text-blue-300 mb-2">How above-par pricing works on VA IRRRL:</p>
              <p className="mb-3">A lender offers a rate <strong>above the par rate</strong> (market rate at zero points). The yield spread premium from that above-par rate generates a <strong>dollar lender credit</strong> that offsets closing costs. Result: the borrower may close with zero cash out of pocket — a true no-cost IRRRL.</p>
              <p className="mb-3">The key constraint: the new rate must still clear the <strong>NTB rate floor</strong>. For fixed-to-fixed, the window is between par rate and (current rate − 0.50%). The LO's job is finding the rate within that window that generates enough credit to cover all costs.</p>

              {lt.cur&&lt.prop&&propRate>0&&curRate>0&&(
                <div className="bg-slate-900/60 border border-blue-800/40 rounded-xl p-4 mt-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Your Pricing Window</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400 mb-1">Current Rate</p><p className="font-bold text-white font-mono text-lg">{fp(curRate)}</p></div>
                    {floor!==null?(
                      <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3"><p className="text-xs text-yellow-400 mb-1">NTB Floor (Max Allowed)</p><p className="font-bold text-yellow-300 font-mono text-lg">{fp(floor)}</p><p className="text-xs text-slate-500">Proposed rate cannot exceed</p></div>
                    ):(
                      <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3"><p className="text-xs text-green-400 mb-1">ARM→Fixed: No Floor</p><p className="font-bold text-green-300 font-mono text-lg">Any rate OK</p><p className="text-xs text-slate-500">Stability is the NTB</p></div>
                    )}
                    <div className={`rounded-lg p-3 border ${passFloor?"bg-green-900/20 border-green-700/50":"bg-red-900/20 border-red-700/50"}`}>
                      <p className="text-xs text-slate-400 mb-1">Your Proposed Rate</p>
                      <p className={`font-bold font-mono text-lg ${passFloor?"text-green-300":"text-red-300"}`}>{fp(propRate)}</p>
                      <p className={`text-xs mt-0.5 ${passFloor?"text-green-500":"text-red-500"}`}>{passFloor?(floor!==null?`✓ ${headroom} bps below floor`:"✓ Passes"):"✗ Fails NTB floor"}</p>
                    </div>
                  </div>
                  {passFloor&&parRate>0&&propRate>parRate&&floor!==null&&(
                    <div className="mt-3 p-2 bg-slate-800/60 rounded-lg text-xs text-center text-slate-400">
                      Above-par spread: <strong className="text-blue-300">{fp4(propRate-parRate)}</strong> above par · Headroom remaining to NTB floor: <strong className="text-yellow-300">{fp4(floor-propRate)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Method Selection */}
            <p className="text-sm font-bold text-slate-300 mb-3">How would you like to enter the lender credit?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {[
                ["dollar","💵 Enter Dollar Amount Directly","I have the credit dollar amount from the lender's rate sheet or Loan Estimate — simplest for most LOs"],
                ["rate","📈 Calculate from Above-Par Rate","I know the par rate and credit % per 0.125% bump — module calculates the dollar credit for me"],
              ].map(([val,label,desc])=>(
                <label key={val} className={`block cursor-pointer p-4 rounded-xl border transition-all ${pr.method===val?"bg-blue-900/30 border-blue-500 shadow-lg":"bg-slate-700/40 border-slate-600 hover:border-slate-500"}`}>
                  <input type="radio" className="hidden" checked={pr.method===val} onChange={()=>setPr(p=>({...p,method:val}))}/>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${pr.method===val?"border-blue-400":"border-slate-500"}`}>{pr.method===val&&<div className="w-2 h-2 rounded-full bg-blue-400"/>}</div>
                    <span className="font-bold text-white text-sm">{label}</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-6">{desc}</p>
                </label>
              ))}
            </div>

            {/* Method A */}
            {pr.method==="dollar"&&(
              <div className="bg-slate-900/50 rounded-xl p-5 mb-5 border border-slate-700">
                <p className="text-sm font-bold text-slate-300 mb-4">Method A — Direct Dollar Credit Entry</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Lender Credit Amount<Tip text="Dollar amount credited toward closing costs in exchange for the above-par rate. Find on lender's rate sheet or Loan Estimate Section J (Lender Credits)."/></label>
                    <div className="relative"><span className="absolute left-3 top-2.5 text-slate-400 text-sm pointer-events-none">$</span>
                      <input type="number" value={pr.dollar} onChange={e=>setPr(p=>({...p,dollar:e.target.value}))} placeholder="e.g. 2850" className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-6 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"/>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">From lender's rate sheet or Loan Estimate Section J</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-600 text-center">
                    <p className="text-xs text-slate-400 mb-1">Credit as % of Loan Balance</p>
                    <p className="text-2xl font-bold font-mono text-blue-300">{loanBal>0&&creditFromDollar>0?((creditFromDollar/loanBal)*100).toFixed(3)+"%":"—"}</p>
                    <p className="text-xs text-slate-500 mt-1">on {f$(loanBal)} balance</p>
                  </div>
                </div>
              </div>
            )}

            {/* Method B */}
            {pr.method==="rate"&&(
              <div className="bg-slate-900/50 rounded-xl p-5 mb-5 border border-slate-700">
                <p className="text-sm font-bold text-slate-300 mb-4">Method B — Above-Par Rate Calculator</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Par Rate (Zero Points / Zero Credit)<Tip text="Market rate at which the loan prices with no lender credits and no discount points. Ask the lender 'what's your par rate?' The proposed rate from Step 4 should be above this."/></label>
                    <div className="relative"><input type="number" value={pr.parRate} onChange={e=>setPr(p=>({...p,parRate:e.target.value}))} placeholder="e.g. 6.375" className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-3 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"/><span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">%</span></div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Credit % per 0.125% Bump Above Par<Tip text="For each 0.125% above par, lender credits this % of loan amount. Example: if 0.125% bump = 0.50% credit, enter 0.500. This is lender-specific — get from lender's pricing grid or AE."/></label>
                    <div className="relative"><input type="number" value={pr.cPer125} onChange={e=>setPr(p=>({...p,cPer125:e.target.value}))} placeholder="e.g. 0.500" className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-3 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"/><span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">%/bump</span></div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Proposed Rate (from Step 4)</label>
                    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-blue-300 font-bold font-mono text-sm">{propRate>0?fp(propRate):<span className="text-slate-500">Set in Step 4</span>}</div>
                  </div>
                </div>
                {parRate>0&&cPer125>0&&propRate>0&&(
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-600">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Credit Calculation Breakdown</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-xs text-slate-400">Par Rate</p><p className="font-bold font-mono text-white">{fp(parRate)}</p></div>
                      <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-xs text-slate-400">Above Par</p><p className="font-bold font-mono text-yellow-300">+{fp4(propRate-parRate)}</p><p className="text-xs text-slate-500">{bumps.toFixed(2)} × 0.125% bumps</p></div>
                      <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-xs text-slate-400">Total Credit %</p><p className="font-bold font-mono text-blue-300">{creditPct.toFixed(3)}%</p></div>
                      <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3"><p className="text-xs text-slate-400">Dollar Credit Generated</p><p className="font-bold font-mono text-green-300 text-lg">{f$(creditFromRate)}</p></div>
                    </div>
                  </div>
                )}
                {parRate>0&&propRate>0&&propRate<=parRate&&<div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-xs text-yellow-300">⚠️ Proposed rate ({fp(propRate)}) is at or below par ({fp(parRate)}). No lender credit generated. Borrower will need to bring cash to close or roll fees into the loan.</div>}
              </div>
            )}

            {/* Roll fees toggle */}
            {pr.method&&(
              <div className="bg-slate-900/50 rounded-xl p-4 mb-5 border border-slate-700 flex items-center gap-3">
                <div onClick={()=>setPr(p=>({...p,roll:!p.roll}))} className={`w-12 h-6 rounded-full flex items-center px-1 cursor-pointer transition-all flex-shrink-0 ${pr.roll?"bg-blue-600":"bg-slate-600"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${pr.roll?"translate-x-6":""}`}/>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Roll remaining fees into new loan balance?<Tip text="If enabled: fees not covered by lender credit are added to the loan balance. $0 cash to close, but borrower pays interest on those fees. Confirm New Loan Balance in Step 4 already reflects this."/></p>
                  <p className="text-xs text-slate-500 mt-0.5">Confirm the New Loan Balance in Step 4 already includes any rolled-in fees. The VA funding fee can always be financed.</p>
                </div>
              </div>
            )}

            {/* Cash to Close Analysis */}
            {pr.method&&(
              <div className="rounded-xl border border-slate-600 p-5 mb-5 bg-slate-900/50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Cash to Close Analysis</p>
                <div className="space-y-0 mb-4">
                  {[
                    ["Total Closing Costs (Disclosure)",f$(totalDisc),null,"slate"],
                    ["  VA Funding Fee",ffEx?"EXEMPT":f$(ff),null,ffEx?"green":"slate"],
                    ["  Non-Exempt Fees (Gross)",f$(grossFees),null,"slate"],
                    ["Lender Credit Applied",credit>0?`− ${f$(creditApplied)}`:"None",null,credit>0?"green":"slate"],
                    ["Remaining After Credit",f$(remaining),null,remaining===0?"green":"yellow"],
                    ["Rolled Into Loan",pr.roll&&remaining>0?`− ${f$(remaining)}`:"—",null,"blue"],
                  ].map(([l,v,s,c])=>(
                    <div key={l} className="flex items-center justify-between py-2 border-b border-slate-700/40">
                      <span className={`text-sm ${l.startsWith("  ")?"pl-4 text-slate-500":"text-slate-300"}`}>{l.trim()}</span>
                      <span className={`font-bold font-mono text-sm ${c==="green"?"text-green-400":c==="yellow"?"text-yellow-300":c==="blue"?"text-blue-300":"text-slate-200"}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className={`flex items-center justify-between p-4 rounded-xl border-2 ${cashToClose===0&&!hasExcess?"bg-green-900/30 border-green-600":cashToClose>0?"bg-yellow-900/30 border-yellow-600":"bg-slate-800 border-slate-600"}`}>
                  <div>
                    <p className="font-bold text-white text-base">Cash to Close (Borrower Owes)</p>
                    {cashToClose===0&&!hasExcess&&<p className="text-xs text-green-400 mt-0.5">✅ True no-cost IRRRL — no cash required from borrower</p>}
                    {cashToClose>0&&<p className="text-xs text-yellow-300 mt-0.5">Borrower must bring this amount to the closing table</p>}
                  </div>
                  <p className={`font-bold font-mono text-2xl ${cashToClose===0&&!hasExcess?"text-green-300":cashToClose>0?"text-yellow-300":"text-slate-300"}`}>{f$(cashToClose)}</p>
                </div>
                <div className="flex gap-2 flex-wrap mt-3">
                  {isNoCost&&<span className="px-3 py-1 rounded-full text-xs font-bold bg-green-900/40 border border-green-700/50 text-green-300">✅ True No-Cost IRRRL</span>}
                  {cashToClose>0&&!hasExcess&&<span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-900/40 border border-yellow-700/50 text-yellow-300">⚠️ Borrower owes {f$(cashToClose)}</span>}
                  {passFloor&&floor!==null&&<span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-900/40 border border-blue-700/50 text-blue-300">✅ Rate clears NTB floor ({fp(floor)})</span>}
                  {!passFloor&&floor!==null&&<span className="px-3 py-1 rounded-full text-xs font-bold bg-red-900/40 border border-red-600/50 text-red-300">❌ Rate exceeds NTB floor — cannot proceed</span>}
                  {credit===0&&pr.method&&<span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-700 border border-slate-600 text-slate-400">No lender credit applied</span>}
                </div>
              </div>
            )}

            {/* 🚨 HARD WARNING — EXCESS CREDIT */}
            {hasExcess&&(
              <div className="rounded-xl border-2 border-red-600 bg-red-950/40 p-5 mb-5">
                <div className="flex items-start gap-3">
                  <span className="text-4xl flex-shrink-0">🚨</span>
                  <div>
                    <p className="font-bold text-red-300 text-lg mb-2">VA IRRRL VIOLATION — CREDIT EXCEEDS CLOSING COSTS</p>
                    <p className="text-sm text-red-200 mb-3">Your lender credit of <strong className="text-red-300">{f$(credit)}</strong> exceeds total closing costs of <strong>{f$(totalDisc)}</strong> by <strong className="text-red-300 text-base">{f$(excess)}</strong>. This excess would flow back to the borrower as cash at closing.</p>
                    <div className="bg-red-950/60 border border-red-800/60 rounded-lg p-4 mb-3 text-sm text-red-200">
                      <p className="font-bold text-red-300 mb-2">Why this violates VA rules:</p>
                      <p>A VA IRRRL is strictly a <strong>rate-reduction refinance</strong> — not a cash-out product. VA explicitly prohibits the borrower from receiving any net proceeds at closing (beyond escrow refunds from the prior loan). A lender credit exceeding closing costs effectively converts the IRRRL into a cash-out transaction, which is not permitted under this program and would cause VA to reject the guaranty.</p>
                    </div>
                    <p className="text-sm font-bold text-red-300 mb-1.5">How to resolve:</p>
                    <ul className="text-sm text-red-200 space-y-1.5 list-disc list-inside">
                      <li><strong>Lower the proposed rate</strong> to reduce the credit generated until credit ≤ total costs</li>
                      <li><strong>Apply excess to discount points</strong> — buy the rate down further (must still clear NTB floor)</li>
                      <li><strong>Do not manufacture fees</strong> to absorb excess — all fees must be legitimate</li>
                    </ul>
                    <p className="text-xs text-red-500 mt-3">Source: VA Lender's Handbook Chapter 6 — IRRRL may not produce net proceeds to the borrower</p>
                  </div>
                </div>
              </div>
            )}

            {!pr.method&&<div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 mb-5 text-center"><p className="text-slate-400 text-sm">Select a method above, or skip this step if no lender credit applies to this scenario.</p></div>}

            <Nav onBack={()=>setStep(3)} onNext={()=>setStep(5)}
              label={hasExcess?"⚠️ Resolve Excess Credit Before Continuing":pr.method?"Pricing Analyzed — Continue →":"Skip (No Credit) — Continue →"}
              disabled={hasExcess}/>
          </Card>
        )}

        {/* ═══ STEP 6 — NTB ANALYSIS ═════════════════════════ */}
        {step===5&&(
          <Card icon="⚖️" title="Step 6 — Net Tangible Benefit Analysis" subtitle="Auto-calculated per VA Circular 26-19-22 and 38 U.S.C. § 3709. Lender credits applied — net fees used in recoupment test.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <Stat label="Current P&I" value={f$(curPI)} color="slate"/>
              <Stat label="New P&I" value={f$(newPI)} color="blue"/>
              <Stat label="Monthly Savings" value={piSavings>0?f$(piSavings):piHigher?"Higher":"—"} color={piSavings>0?"green":piHigher?"yellow":"slate"}/>
              <Stat label="Rate Drop" value={fp(rateDrop)} color={rateDrop>=0.5?"green":rateDrop>0?"yellow":"red"}/>
            </div>
            {credit>0&&<div className="bg-green-900/20 border border-green-700/40 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 text-sm"><span className="text-green-400 text-xl flex-shrink-0">💹</span><span className="text-green-200">Lender credit of <strong className="text-green-300">{f$(credit)}</strong> applied — net fees for recoupment reduced from <strong>{f$(grossFees)}</strong> to <strong className="text-green-300">{f$(netFees)}</strong></span></div>}

            {/* Test 1 — Rate */}
            <div className={`p-5 rounded-xl border mb-4 ${ntbRate===true?"bg-green-900/20 border-green-700/50":ntbRate===false?"bg-red-900/20 border-red-700/50":"bg-slate-700/30 border-slate-600"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-white">NTB Test 1 — Rate Reduction (VA Circular 26-19-22 §3.b)</p>
                <span className={`font-bold text-sm ${ntbRate===true?"text-green-400":ntbRate===false?"text-red-400":"text-slate-400"}`}>{ntbRate===true?"✅ PASS":ntbRate===false?"❌ FAIL":"—"}</span>
              </div>
              {path==="fixed-to-fixed"&&<p className="text-sm text-slate-300">Fixed→Fixed: Rate must drop ≥ <strong className="text-white">0.50%</strong>. Your drop: <strong className={rateDrop>=0.5?"text-green-300":"text-red-300"}>{fp(rateDrop)}</strong>{rateDrop<0.5&&rateDrop>=0&&<span className="text-red-400"> — Need {fp(0.5-rateDrop)} more.</span>}</p>}
              {path==="arm-to-fixed"&&<p className="text-sm text-slate-300">✅ ARM→Fixed: No minimum rate drop required — payment stability is the NTB.</p>}
              {path==="fixed-to-arm"&&<p className="text-sm text-slate-300">Fixed→ARM: Rate must drop ≥ <strong className="text-white">2.00% (200 bps)</strong>. Your drop: <strong className={rateDrop>=2.0?"text-green-300":"text-red-300"}>{fp(rateDrop)}</strong>{rateDrop<2.0&&<span className="text-red-400"> — Need {fp(2.0-rateDrop)} more.</span>}</p>}
              {path==="arm-to-arm"&&<p className="text-sm text-slate-300">ARM→ARM: Rate must decrease. Drop: <strong>{fp(rateDrop)}</strong></p>}
            </div>

            {/* Test 2 — Recoupment */}
            <div className={`p-5 rounded-xl border mb-4 ${ntbRecoup?"bg-green-900/20 border-green-700/50":"bg-red-900/20 border-red-700/50"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-white">NTB Test 2 — Fee Recoupment (38 U.S.C. §3709(a))</p>
                <span className={`font-bold text-sm ${ntbRecoup?"text-green-400":"text-red-400"}`}>{ntbRecoup?"✅ PASS":"❌ FAIL"}</span>
              </div>
              <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 mb-3 text-xs text-blue-300">📋 VA funding fee excluded from this test per §3709(a). Lender credit reduces net fees.</div>
              {piHigher?(
                <div>
                  <p className="text-sm text-amber-200 mb-3">⚠️ Higher/Same Payment: Net fees after credit must be $0 per §3709(a)(1)(B).</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400">Net Fees After Credit</p><p className={`font-bold font-mono text-lg ${netFees===0?"text-green-300":"text-red-300"}`}>{f$(netFees)}</p></div>
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400">Allowed</p><p className="font-bold font-mono text-lg text-white">$0.00</p></div>
                  </div>
                </div>
              ):(
                <div>
                  <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400">Net Fees (After Credit)</p><p className="font-bold font-mono text-white">{f$(netFees)}</p><p className="text-xs text-slate-500">excl. funding fee</p></div>
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400">Monthly P&I Savings</p><p className={`font-bold font-mono ${piSavings>0?"text-green-300":"text-red-300"}`}>{f$(piSavings)}/mo</p></div>
                    <div className="bg-slate-800/60 rounded-lg p-3"><p className="text-xs text-slate-400">Recoupment Period</p><p className={`font-bold font-mono ${ntbRecoup?"text-green-300":"text-red-300"}`}>{netFees===0?"Instant ✅":isFinite(recoupMo)?`${recoupMo} mo`:"N/A"}</p><p className="text-xs text-slate-500">max 36 months</p></div>
                  </div>
                  {isFinite(recoupMo)&&recoupMo>0&&<p className="text-sm text-center text-slate-400">Break-even: <strong className="text-slate-200">{breakEven}</strong></p>}
                  {!ntbRecoup&&isFinite(recoupMo)&&piSavings>0&&<div className="mt-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">To pass: net fees ≤ {f$(piSavings*36)} OR monthly savings ≥ {f$(netFees/36)}/mo. Consider requesting more lender credit from the lender.</div>}
                </div>
              )}
            </div>

            {piSavings>0&&<div className="bg-slate-700/30 rounded-xl p-4 mb-4 text-center border border-slate-600/50"><p className="text-xs text-slate-400 mb-1">Estimated Lifetime P&I Savings (net of all closing costs)</p><p className={`text-3xl font-bold font-mono ${lifetime>0?"text-green-300":"text-red-300"}`}>{f$(lifetime)}</p><p className="text-xs text-slate-500 mt-1">Over {Math.round((parseInt(prop.term)||0)/12)} years</p></div>}
            <Nav onBack={()=>setStep(4)} onNext={()=>setStep(6)} label="NTB Reviewed — Continue →"/>
          </Card>
        )}

        {/* ═══ STEP 7 — FUNDING FEE ══════════════════════════ */}
        {step===6&&(
          <Card icon="💰" title="Step 7 — VA Funding Fee & Exemption Check" subtitle="IRRRL funding fee is 0.5%. Review all exemption categories — always verify via COE before finalizing pricing.">
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 mb-6"><p className="text-sm text-amber-200 font-semibold mb-1">⚠️ Confirm Exemption Status Before Pricing & Disclosures</p><p className="text-sm text-amber-200/80">Exemption is confirmed on the COE. If status changes after disclosures are issued, all disclosures must be reissued.</p></div>
            <p className="text-sm font-bold text-slate-300 mb-3">Does the borrower qualify for any VA funding fee exemption?</p>
            {EXEMPTIONS.map(cat=>(
              <label key={cat.id} className={`block cursor-pointer p-4 rounded-xl border mb-3 transition-all ${ffReason===cat.id?"bg-green-900/30 border-green-600/60":"bg-slate-700/30 border-slate-600 hover:border-slate-500"}`}>
                <input type="radio" className="hidden" checked={ffReason===cat.id} onChange={()=>{setFfReason(cat.id);setFfEx(true);}}/>
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${ffReason===cat.id?"border-green-400":"border-slate-500"}`}>{ffReason===cat.id&&<div className="w-2.5 h-2.5 rounded-full bg-green-400"/>}</div>
                  <div><p className="font-semibold text-white text-sm">{cat.label}</p><p className="text-xs text-slate-400 mt-0.5">{cat.detail}</p></div>
                </div>
              </label>
            ))}
            <label className={`block cursor-pointer p-4 rounded-xl border transition-all ${!ffEx?"bg-slate-700/50 border-slate-500":"bg-slate-700/30 border-slate-600"}`}>
              <input type="radio" className="hidden" checked={!ffEx} onChange={()=>{setFfEx(false);setFfReason("");}}/>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!ffEx?"border-blue-400":"border-slate-500"}`}>{!ffEx&&<div className="w-2.5 h-2.5 rounded-full bg-blue-400"/>}</div>
                <div><p className="font-semibold text-white text-sm">None — Standard 0.5% funding fee applies</p><p className="text-xs text-slate-400">May be financed into the new loan balance</p></div>
              </div>
            </label>
            <div className="bg-slate-800/60 border border-slate-600 rounded-xl p-4 mt-5"><p className="text-sm font-bold text-slate-300 mb-1">📌 Retroactive Disability Rating — Funding Fee Refund</p><p className="text-sm text-slate-400">If a veteran is later awarded a service-connected disability rating retroactive to before the IRRRL closing, they may be entitled to a <strong className="text-slate-200">full funding fee refund</strong>. Advise borrower to contact their VA Regional Loan Center if this occurs after closing.</p></div>
            <div className={`rounded-xl p-5 border text-center mt-5 ${ffEx?"bg-green-900/30 border-green-700/50":"bg-blue-900/20 border-blue-700/50"}`}>
              {ffEx?<><p className="text-green-300 font-bold text-xl">🎖️ FUNDING FEE EXEMPT</p><p className="text-green-400/70 text-sm mt-1">Veteran saves: <strong className="text-green-300">{f$(loanBal*0.005)}</strong></p><p className="text-xs text-slate-400 mt-2">Document via COE or VA Award Letter before closing.</p></>:<><p className="text-slate-400 text-sm mb-1">VA IRRRL Funding Fee (0.5%)</p><p className="text-blue-300 font-bold text-3xl font-mono">{f$(ff)}</p><p className="text-xs text-blue-400/70 mt-2">⚖️ Excluded from 36-month recoupment test per §3709(a)</p></>}
            </div>
            <Nav onBack={()=>setStep(5)} onNext={()=>setStep(7)} label="Funding Fee Set — Continue →"/>
          </Card>
        )}

        {/* ═══ STEP 8 — DOC CHECKLIST ════════════════════════ */}
        {step===7&&(
          <Card icon="📋" title="Step 8 — Document Checklist" subtitle="Auto-generated for your loan path. Plain-English instructions — what to get, how to get it, why it matters.">
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-blue-900/40 border border-blue-700/50 rounded-full text-xs font-bold text-blue-300 uppercase">{path.replace("fixed","Fixed").replace("arm","ARM").replace("-to-"," → ")}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${piHigher?"bg-amber-900/30 border-amber-700/50 text-amber-300":"bg-green-900/30 border-green-700/50 text-green-300"}`}>{piHigher?"Higher Payment — Zero Fees Required":"Lower Payment"}</span>
              {isNoCost&&<span className="px-3 py-1 rounded-full text-xs font-bold bg-green-900/40 border border-green-700/50 text-green-300">✅ No-Cost IRRRL</span>}
            </div>
            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3">VA Required — Always</p>
            {DOCS_ALWAYS.map((d,i)=><DocItem key={i} d={d} warn={false}/>)}
            {path==="fixed-to-arm"&&<><p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3 mt-5">Required for Fixed → ARM Only</p>{DOCS_ARM.map((d,i)=><DocItem key={i} d={d} warn={true}/>)}</>}
            <p className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-3 mt-5">Lender Overlay — Confirm with Your Lender</p>
            {DOCS_OVERLAY.map((d,i)=><DocItem key={i} d={d} warn={true}/>)}
            <Nav onBack={()=>setStep(6)} onNext={()=>setStep(8)} label="Checklist Complete — View Results →"/>
          </Card>
        )}

        {/* ═══ STEP 9 — RESULTS ══════════════════════════════ */}
        {step===8&&(
          <Card icon="🏁" title="Step 9 — Results & NTB Disclosure" subtitle="Full analysis summary. Save to decision log and print as VA-compliant borrower disclosure.">
            <div className={`rounded-2xl p-6 border-2 text-center mb-6 ${ntbOK?"bg-green-900/30 border-green-600/60":"bg-red-900/30 border-red-600/60"}`}>
              <p className="text-5xl mb-2">{ntbOK?"✅":"❌"}</p>
              <p className={`text-2xl font-bold ${ntbOK?"text-green-300":"text-red-300"}`}>{ntbOK?"IRRRL RECOMMENDED":"IRRRL NOT RECOMMENDED"}</p>
              <p className="text-slate-400 text-sm mt-1">{ntbOK?"Net Tangible Benefit confirmed per VA Circular 26-19-22. Eligible to proceed.":"Review failing criteria below before submitting to lender."}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {[
                ["Eligibility Gates","✅ All Pass","green"],
                ["Seasoning",seaResult?.ok?"✅ Satisfied":"⚠️ Check",seaResult?.ok?"green":"yellow"],
                ["Loan Path",path.replace("fixed","Fixed").replace("arm","ARM").replace("-to-"," → "),"blue"],
                ["Rate Drop",fp(rateDrop),ntbRate?"green":"red"],
                ["Lender Credit",credit>0?f$(credit):"None",credit>0?"green":"slate"],
                ["Net Fees (Recoupment)",f$(netFees),netFees===0?"green":"slate"],
                ["Cash to Close",f$(cashToClose),cashToClose===0?"green":"yellow"],
                ["Monthly P&I Savings",piSavings>0?f$(piSavings):"Higher",piSavings>0?"green":"yellow"],
                ["Recoupment",netFees===0?"Instant":isFinite(recoupMo)?`${recoupMo} months`:"N/A",ntbRecoup?"green":"red"],
                ["VA Funding Fee",ffEx?"EXEMPT 🎖️":f$(ff),ffEx?"green":"slate"],
                ["Total Disclosure Costs",f$(totalDisc),"slate"],
                ["Lifetime Savings",piSavings>0?f$(lifetime):"N/A",lifetime>0?"green":"yellow"],
              ].map(([label,value,color])=>(
                <div key={label} className={`rounded-xl p-3 border text-center ${color==="green"?"bg-green-900/20 border-green-800/50":color==="red"?"bg-red-900/20 border-red-800/50":color==="blue"?"bg-blue-900/20 border-blue-800/50":color==="yellow"?"bg-yellow-900/20 border-yellow-800/50":"bg-slate-800/60 border-slate-700"}`}>
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  <p className={`text-sm font-bold ${color==="green"?"text-green-300":color==="red"?"text-red-300":color==="blue"?"text-blue-300":color==="yellow"?"text-yellow-300":"text-slate-200"}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mb-4">
              <button onClick={save} disabled={saved||!scenarioId} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${saved?"bg-green-800/50 border border-green-700/50 text-green-400":scenarioId?"bg-slate-700 hover:bg-slate-600 text-white border border-slate-600":"bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"}`}>{saved?"✅ Saved to Decision Log":scenarioId?"💾 Save to Firestore":"💾 No Scenario Linked"}</button>
              <button onClick={()=>window.print()} className="flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40">🖨️ Print NTB Disclosure PDF</button>
            </div>
            {!scenarioId&&<p className="text-xs text-slate-500 text-center mb-4">Add ?scenarioId=xxx to the URL to enable Firestore saving.</p>}
            <button onClick={()=>{setStep(0);setSaved(false);}} className="w-full py-2.5 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700">← Start New IRRRL Analysis</button>

            {/* ── Rate Sensitivity Table ── */}
            {curRate>0&&propRate>0&&loanBal>0&&(
              <div className="mt-6 bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-900/50 border border-indigo-700/50 flex items-center justify-center text-sm">📊</div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Rate Sensitivity Analysis</h3>
                    <p className="text-xs text-slate-400">How NTB changes at ±0.25% rate increments from your proposed rate</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-600">
                        {["Scenario","Rate","Rate Drop","Monthly Savings","Recoupment","NTB"].map(h=>(
                          <th key={h} className="pb-2 text-left font-semibold text-slate-400 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sensitivityRows.map((row,i)=>(
                        <tr key={i} className={`border-b border-slate-700/50 ${row.isCurrent?"bg-blue-900/20":""}`}>
                          <td className="py-2 pr-4">
                            {row.isCurrent?<span className="px-2 py-0.5 rounded bg-blue-800/60 text-blue-300 font-bold">→ Proposed</span>:
                            <span className={`text-slate-400 ${row.delta<0?"text-green-400/70":"text-red-400/70"}`}>{row.delta>0?"+":""}{row.delta.toFixed(2)}%</span>}
                          </td>
                          <td className="py-2 pr-4 font-mono text-white">{row.rate.toFixed(3)}%</td>
                          <td className="py-2 pr-4 font-mono text-slate-300">{row.drop.toFixed(3)}%</td>
                          <td className={`py-2 pr-4 font-mono font-bold ${row.sav>0?"text-green-300":"text-red-400"}`}>{row.sav>0?f$(row.sav):"Higher"}</td>
                          <td className="py-2 pr-4 text-slate-300">
                            {!isFinite(row.recoup)?"N/A":row.recoup===0?"Instant":`${row.recoup} mo`}
                          </td>
                          <td className="py-2">{row.ok?"✅":"❌"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-3">Net fees held constant at {f$(netFees)}. Table assumes same loan balance and term. Rate drop thresholds: Fixed→Fixed ≥0.50%, Fixed→ARM ≥2.00%.</p>
              </div>
            )}
          </Card>
        )}
        </> /* end IRRRL mode */}

        {/* ══════════════════════════════════════════════════════════════════
            CASH-OUT REFI MODE
        ══════════════════════════════════════════════════════════════════ */}
        {mode==="cashout"&&(
          <div>
            {/* Cash-Out Progress */}
            <div className="mb-8">
              <div className="flex items-start justify-between mb-2">
                {CO_STEPS.map((s,i)=>(
                  <div key={i} className="flex flex-col items-center" style={{width:`${100/CO_STEPS.length}%`}}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                      ${i<coStep?"bg-green-600 border-green-600 text-white":i===coStep?"bg-blue-900 border-blue-400 text-blue-200":"bg-slate-800 border-slate-600 text-slate-500"}`}>
                      {i<coStep?"✓":i+1}
                    </div>
                    <span className={`text-xs mt-1 text-center leading-tight hidden xl:block ${i===coStep?"text-blue-300 font-semibold":"text-slate-500"}`}>{s}</span>
                  </div>
                ))}
              </div>
              <div className="relative h-1.5 bg-slate-700 rounded-full">
                <div className="absolute h-1.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500" style={{width:`${(coStep/(CO_STEPS.length-1))*100}%`}}/>
              </div>
            </div>

            {/* Cash-Out Step 1 — Eligibility */}
            {coStep===0&&(
              <Card icon="🚦" title="Step 1 — VA Cash-Out Eligibility" subtitle="VA Type II Cash-Out allows refinancing any loan type (not just VA). Must requalify with full income/credit documentation.">
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 mb-5">
                  <p className="text-sm font-bold text-amber-300 mb-1">⚠️ Important: Full Requalification Required</p>
                  <p className="text-sm text-slate-300">Unlike IRRRL, a VA Cash-Out requires full income documentation, credit underwriting, and a new appraisal. The veteran must qualify at the new payment with current income documentation.</p>
                </div>
                <div className="space-y-4 mb-6">
                  {[
                    ["Borrower is an eligible veteran, active duty, or surviving spouse","coVet"],
                    ["Property is the veteran's primary residence","coPrimary"],
                    ["Borrower has Certificate of Eligibility (COE) or can obtain one","coCOE"],
                    ["Borrower will requalify with current income documentation","coRequalify"],
                  ].map(([label,key])=>(
                    <div key={key} className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
                      <p className="text-sm text-slate-300 flex-1 mr-4">{label}</p>
                      <div className="flex gap-2">
                        {[true,false].map(v=>(
                          <button key={String(v)} onClick={()=>setCo(p=>({...p,[key]:v}))}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${co[key]===v?(v?"bg-green-700 border-green-500 text-white":"bg-red-700 border-red-500 text-white"):"border-slate-600 text-slate-400"}`}>
                            {v?"Yes ✓":"No ✗"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {co.coVet===false||co.coPrimary===false?(
                  <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 mb-4 text-center">
                    <p className="text-red-300 font-bold">❌ Not eligible for VA Cash-Out Refinance</p>
                    <p className="text-slate-400 text-sm mt-1">VA Cash-Out requires eligible veteran status and primary residence occupancy.</p>
                  </div>
                ):null}
                <Nav onNext={()=>setCoStep(1)}
                  label={co.coVet&&co.coPrimary&&co.coCOE&&co.coRequalify?"Eligibility Confirmed — Continue →":"Complete All Fields First"}
                  disabled={!co.coVet||!co.coPrimary||!co.coCOE||!co.coRequalify}/>
              </Card>
            )}

            {/* Cash-Out Step 2 — Property & Equity */}
            {coStep===1&&(
              <Card icon="🏡" title="Step 2 — Property & Equity Analysis" subtitle="VA Cash-Out Type II allows up to 100% LTV. Calculate available equity and maximum cash-out.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  {[
                    ["Appraised Value","appraisedValue","$","Required — schedule appraisal. VA requires licensed appraiser on VA panel."],
                    ["Existing Loan Balance","existingBalance","$","Payoff amount including per-diem interest. Get 30-day payoff from servicer."],
                    ["Desired Cash-Out Amount","cashOutAmount","$","Amount of equity to extract. New balance = existing payoff + cash-out amount."],
                  ].map(([label,key,pfx,tip])=>(
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}<Tip text={tip}/></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{pfx}</span>
                        <input type="number" value={co[key]} onChange={e=>setCo(p=>({...p,[key]:e.target.value}))}
                          className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400"/>
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">First Use of VA Home Loan?<Tip text="First use gets lower funding fee (2.15%). Subsequent use is 3.30%. Check the COE for prior use."/></label>
                    <div className="flex gap-2">
                      {[true,false].map(v=>(
                        <button key={String(v)} onClick={()=>setCo(p=>({...p,firstUse:v}))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border ${co.firstUse===v?"bg-blue-700 border-blue-500 text-white":"border-slate-600 text-slate-400"}`}>
                          {v?"First Use (2.15%)":"Subsequent (3.30%)"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* LTV Preview */}
                {coApprVal>0&&coNewBal>0&&(
                  <div className={`rounded-xl p-4 border mb-4 ${coLTVOK?"bg-green-900/20 border-green-700/40":"bg-red-900/20 border-red-700/40"}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div><p className="text-xs text-slate-400 mb-1">Appraised Value</p><p className="font-bold text-white font-mono">{f$(coApprVal)}</p></div>
                      <div><p className="text-xs text-slate-400 mb-1">New Loan Amount</p><p className="font-bold text-white font-mono">{f$(coNewBal)}</p></div>
                      <div><p className="text-xs text-slate-400 mb-1">Available Equity</p><p className="font-bold text-green-300 font-mono">{f$(coEquity)}</p></div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">New LTV</p>
                        <p className={`font-bold font-mono text-lg ${coLTVOK?"text-green-300":"text-red-400"}`}>{coLTV.toFixed(1)}%</p>
                        <p className={`text-xs ${coLTVOK?"text-green-400":"text-red-400"}`}>{coLTVOK?"✅ Within 100%":"❌ Exceeds 100% LTV"}</p>
                      </div>
                    </div>
                  </div>
                )}
                <Nav onBack={()=>setCoStep(0)} onNext={()=>setCoStep(2)}
                  label={coApprVal>0&&coExistBal>0&&coCashOut>0&&coLTVOK?"Continue →":"Complete All Fields First"}
                  disabled={!coApprVal||!coExistBal||!coCashOut||!coLTVOK}/>
              </Card>
            )}

            {/* Cash-Out Step 3 — Loan Details */}
            {coStep===2&&(
              <Card icon="📊" title="Step 3 — New Loan Details" subtitle="Proposed rate and term for the Cash-Out refinance. Fees calculated separately from IRRRL — full closing costs apply.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Proposed Rate<Tip text="New interest rate on the Cash-Out refinance. Quote from lender's rate sheet. VA has no minimum rate requirement for Cash-Out (unlike IRRRL NTB rules)."/></label>
                    <div className="relative">
                      <input type="number" step="0.125" value={co.proposedRate} onChange={e=>setCo(p=>({...p,proposedRate:e.target.value}))}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400"/>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">New Loan Term</label>
                    <div className="flex gap-2">
                      {[["360","30-Year"],["240","20-Year"],["180","15-Year"]].map(([v,l])=>(
                        <button key={v} onClick={()=>setCo(p=>({...p,newTerm:v}))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border ${co.newTerm===v?"bg-blue-700 border-blue-500 text-white":"border-slate-600 text-slate-400"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Total Closing Costs<Tip text="Estimate of all closing costs excluding VA funding fee (calculated in Step 4). Include title, appraisal, origination, recording, etc."/></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input type="number" value={co.closingCosts} onChange={e=>setCo(p=>({...p,closingCosts:e.target.value}))}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400"/>
                    </div>
                  </div>
                </div>

                {/* Payment comparison */}
                {coRate>0&&coNewBal>0&&curRate>0&&(
                  <div className="bg-slate-800/60 border border-slate-600 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Payment Comparison</p>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div><p className="text-xs text-slate-400 mb-1">Current P&I</p><p className="font-bold text-white font-mono">{f$(coExistPI)}</p></div>
                      <div><p className="text-xs text-slate-400 mb-1">New P&I</p><p className="font-bold text-blue-300 font-mono">{f$(coNewPI)}</p></div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Payment Change</p>
                        <p className={`font-bold font-mono ${coPaymentIncrease>0?"text-amber-300":"text-green-300"}`}>{coPaymentIncrease>0?"+":""}{f$(coPaymentIncrease)}/mo</p>
                      </div>
                    </div>
                  </div>
                )}
                <Nav onBack={()=>setCoStep(1)} onNext={()=>setCoStep(3)}
                  label={co.proposedRate&&co.closingCosts?"Continue →":"Enter Rate and Closing Costs"}
                  disabled={!co.proposedRate||!co.closingCosts}/>
              </Card>
            )}

            {/* Cash-Out Step 4 — Funding Fee */}
            {coStep===3&&(
              <Card icon="💰" title="Step 4 — VA Funding Fee" subtitle="Cash-Out funding fee is 2.15% (first use) or 3.30% (subsequent use). Significantly higher than IRRRL's 0.50%.">
                <div className={`rounded-xl p-5 border mb-5 ${co.coFfEx?"bg-green-900/20 border-green-700/40":"bg-slate-800/40 border-slate-700"}`}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center mb-3">
                    <div><p className="text-xs text-slate-400 mb-1">New Loan Amount</p><p className="font-bold text-white font-mono">{f$(coNewBal)}</p></div>
                    <div><p className="text-xs text-slate-400 mb-1">Funding Fee Rate</p><p className="font-bold text-amber-300 font-mono">{co.coFfEx?"EXEMPT":`${(coFfPct*100).toFixed(2)}%`}</p></div>
                    <div><p className="text-xs text-slate-400 mb-1">Funding Fee Amount</p><p className={`font-bold font-mono ${co.coFfEx?"text-green-300":"text-white"}`}>{co.coFfEx?"$0.00 — EXEMPT":f$(coFf)}</p></div>
                  </div>
                  <p className="text-xs text-slate-400 text-center">Can be financed into the loan amount</p>
                </div>

                <div className="mb-5">
                  <label className="flex items-center gap-3 cursor-pointer bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                    <input type="checkbox" checked={co.coFfEx} onChange={e=>setCo(p=>({...p,coFfEx:e.target.checked}))} className="w-4 h-4"/>
                    <div>
                      <p className="text-sm font-semibold text-white">Veteran is exempt from funding fee 🎖️</p>
                      <p className="text-xs text-slate-400 mt-0.5">Exempt if: service-connected disability rating, surviving spouse of veteran who died in service/from service-connected disability, or active duty Purple Heart recipient.</p>
                    </div>
                  </label>
                  {co.coFfEx&&(
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Exemption Reason (for file)</label>
                      <input value={co.coFfReason} onChange={e=>setCo(p=>({...p,coFfReason:e.target.value}))}
                        placeholder="e.g. 80% service-connected disability per VA letter dated..."
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400"/>
                    </div>
                  )}
                </div>
                <Nav onBack={()=>setCoStep(2)} onNext={()=>setCoStep(4)} label="Funding Fee Set — Continue →"/>
              </Card>
            )}

            {/* Cash-Out Step 5 — Purpose */}
            {coStep===4&&(
              <Card icon="📋" title="Step 5 — Purpose of Cash-Out" subtitle="Document the veteran's reason for the cash-out. Required for loan file and disclosure. VA does not restrict purpose but lenders and underwriters document it.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                  {CO_PURPOSES.map(p=>(
                    <button key={p.id} onClick={()=>setCo(prev=>({...prev,purpose:p.id}))}
                      className={`p-4 rounded-xl border text-left transition-all ${co.purpose===p.id?"bg-blue-900/30 border-blue-600":"bg-slate-800/40 border-slate-700 hover:border-slate-500"}`}>
                      <span className="text-lg mr-2">{p.icon}</span>
                      <span className={`text-sm font-semibold ${co.purpose===p.id?"text-blue-300":"text-slate-300"}`}>{p.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Additional Notes (optional)</label>
                  <textarea value={co.purposeNote} onChange={e=>setCo(p=>({...p,purposeNote:e.target.value}))}
                    placeholder="Describe specific use of funds for loan file documentation..."
                    rows={3} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400 resize-none"/>
                </div>
                <Nav onBack={()=>setCoStep(3)} onNext={()=>setCoStep(5)} label={co.purpose?"Purpose Documented — Continue →":"Select Purpose First"} disabled={!co.purpose}/>
              </Card>
            )}

            {/* Cash-Out Step 6 — Results */}
            {coStep===5&&(
              <Card icon="🏁" title="Step 6 — Cash-Out Refi Results" subtitle="Full summary of your VA Cash-Out refinance. Save to decision log and print for borrower.">
                <div className="bg-green-900/30 border-2 border-green-600/60 rounded-2xl p-5 text-center mb-6">
                  <p className="text-4xl mb-2">💵</p>
                  <p className="text-2xl font-bold text-green-300">VA CASH-OUT REFINANCE</p>
                  <p className="text-3xl font-extrabold text-white mt-2">{f$(coCashOut)}</p>
                  <p className="text-slate-400 text-sm mt-1">Gross cash-out amount · Net proceeds after costs: {f$(coNetProceeds)}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  {[
                    ["New Loan Amount",f$(coNewBal),"slate"],
                    ["New LTV",`${coLTV.toFixed(1)}%`,coLTV<=80?"green":"blue"],
                    ["Available Equity",f$(coEquity),"green"],
                    ["New Rate",`${coRate}%`,"blue"],
                    ["New Monthly P&I",f$(coNewPI),"slate"],
                    ["Payment Change",`${coPaymentIncrease>0?"+":""}${f$(coPaymentIncrease)}/mo`,coPaymentIncrease>0?"yellow":"green"],
                    ["VA Funding Fee",co.coFfEx?"EXEMPT 🎖️":f$(coFf),co.coFfEx?"green":"slate"],
                    ["Closing Costs",f$(coClosingCosts),"slate"],
                    ["Total Costs",f$(coTotalCosts),"slate"],
                    ["Gross Cash-Out",f$(coCashOut),"green"],
                    ["Less: Closing Costs",`− ${f$(coClosingCosts)}`,"yellow"],
                    ["Net Cash Proceeds",f$(coNetProceeds),coNetProceeds>0?"green":"red"],
                  ].map(([label,value,color])=>(
                    <div key={label} className={`rounded-xl p-3 border text-center ${color==="green"?"bg-green-900/20 border-green-800/50":color==="red"?"bg-red-900/20 border-red-800/50":color==="blue"?"bg-blue-900/20 border-blue-800/50":color==="yellow"?"bg-yellow-900/20 border-yellow-800/50":"bg-slate-800/60 border-slate-700"}`}>
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className={`text-sm font-bold ${color==="green"?"text-green-300":color==="red"?"text-red-300":color==="blue"?"text-blue-300":color==="yellow"?"text-yellow-300":"text-slate-200"}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Purpose summary */}
                <div className="bg-slate-800/60 border border-slate-600 rounded-xl p-4 mb-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Documented Purpose</p>
                  <p className="text-sm text-white">{CO_PURPOSES.find(p=>p.id===co.purpose)?.icon} {CO_PURPOSES.find(p=>p.id===co.purpose)?.label}</p>
                  {co.purposeNote&&<p className="text-sm text-slate-400 mt-1 italic">"{co.purposeNote}"</p>}
                </div>

                <div className="flex gap-3 mb-4">
                  <button onClick={saveCashOut} disabled={coSaved||!scenarioId}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${coSaved?"bg-green-800/50 border border-green-700/50 text-green-400":scenarioId?"bg-slate-700 hover:bg-slate-600 text-white border border-slate-600":"bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"}`}>
                    {coSaved?"✅ Saved to Decision Log":scenarioId?"💾 Save to Firestore":"💾 No Scenario Linked"}
                  </button>
                  <button onClick={()=>window.print()} className="flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40">🖨️ Print Cash-Out Summary</button>
                </div>
                <button onClick={()=>{setCoStep(0);setCoSaved(false);}} className="w-full py-2.5 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700">← Start New Cash-Out Analysis</button>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ═══ PRINT PDF ═════════════════════════════════════════════════════ */}
      <div id="printable" style={{display:"none",fontFamily:"Arial,sans-serif",fontSize:"11pt",color:"#000"}}>
        <div style={{borderBottom:"3px solid #1a3a6b",paddingBottom:"14px",marginBottom:"18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <p style={{fontSize:"8pt",color:"#888",letterSpacing:"2px",margin:"0 0 3px"}}>LOANBEACONS™ — MORTGAGE INTELLIGENCE PLATFORM</p>
              <h1 style={{fontSize:"16pt",fontWeight:"bold",color:"#1a3a6b",margin:"0"}}>VA IRRRL Net Tangible Benefit Disclosure</h1>
              <p style={{fontSize:"9pt",color:"#444",margin:"3px 0 0"}}>Required Comparison Statement · VA Circular 26-19-22 · 38 U.S.C. § 3709</p>
              <p style={{fontSize:"7.5pt",color:"#888",margin:"2px 0 0"}}>Disclosure 1 of 2: Within 3 business days of application · Disclosure 2 of 2: At closing · Veteran must acknowledge receipt of both</p>
            </div>
            <div style={{textAlign:"right",fontSize:"9pt",color:"#666"}}>
              <p style={{margin:"2px 0"}}>Date: {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</p>
              {scenario&&<p style={{margin:"2px 0"}}>Borrower: {scenario.borrowerName||scenario.lastName||"—"}</p>}
              {cur.servicer&&<p style={{margin:"2px 0"}}>Servicer: {cur.servicer}</p>}
              {cur.loanNumber&&<p style={{margin:"2px 0"}}>VA Loan #: {cur.loanNumber}</p>}
            </div>
          </div>
        </div>

        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:"16px"}}>
          <thead><tr style={{background:"#1a3a6b",color:"#fff"}}><th style={{padding:"7px 10px",textAlign:"left",fontSize:"10pt"}}>Parameter</th><th style={{padding:"7px 10px",textAlign:"center",fontSize:"10pt"}}>Current VA Loan</th><th style={{padding:"7px 10px",textAlign:"center",fontSize:"10pt"}}>Proposed IRRRL</th><th style={{padding:"7px 10px",textAlign:"center",fontSize:"10pt"}}>Change</th></tr></thead>
          <tbody>
            {[
              ["Interest Rate",fp(curRate),fp(propRate),fp(rateDrop)+" ↓"],
              ["Loan Amount",f$(parseFloat(cur.balance)),f$(loanBal),"—"],
              ["Term (months)",cur.remainingMonths||"—",prop.term,"—"],
              ["Monthly P&I",f$(curPI),f$(newPI),piSavings>0?f$(piSavings)+" savings":piHigher?"Higher":"—"],
            ].map(([r,c,p,ch],i)=>(
              <tr key={r} style={{background:i%2===0?"#f5f7ff":"#fff"}}>
                <td style={{padding:"7px 10px",fontWeight:"600"}}>{r}</td>
                <td style={{padding:"7px 10px",textAlign:"center"}}>{c}</td>
                <td style={{padding:"7px 10px",textAlign:"center"}}>{p}</td>
                <td style={{padding:"7px 10px",textAlign:"center",color:"#1a6b1a"}}>{ch}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",marginBottom:"16px"}}>
          <div style={{border:"1.5px solid #1a3a6b",borderRadius:"7px",padding:"12px"}}>
            <p style={{fontWeight:"bold",color:"#1a3a6b",marginBottom:"7px",fontSize:"10pt"}}>NTB Results</p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Path: <strong>{path.replace("fixed","Fixed").replace("arm","ARM").replace("-to-"," → ")}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Rate Test: <strong style={{color:ntbRate?"#1a6b1a":"#c00"}}>{ntbRate?"✓ PASS":"✗ FAIL"}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Rate Drop: <strong>{fp(rateDrop)}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Recoupment: <strong style={{color:ntbRecoup?"#1a6b1a":"#c00"}}>{netFees===0?"Instant":isFinite(recoupMo)?recoupMo+" mo":"N/A"}</strong> (max 36)</p>
            {!piHigher&&breakEven!=="N/A"&&<p style={{margin:"3px 0",fontSize:"9.5pt"}}>Break-even: <strong>{breakEven}</strong></p>}
            {piSavings>0&&<p style={{margin:"3px 0",fontSize:"9.5pt"}}>Lifetime Savings: <strong>{f$(lifetime)}</strong></p>}
          </div>
          <div style={{border:"1.5px solid #1a3a6b",borderRadius:"7px",padding:"12px"}}>
            <p style={{fontWeight:"bold",color:"#1a3a6b",marginBottom:"7px",fontSize:"10pt"}}>Closing Costs</p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>VA Funding Fee: <strong>{ffEx?"EXEMPT":f$(ff)}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Title & Settlement: <strong>{f$(feeByBucket("title"))}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Recording Fees: <strong>{f$(feeByBucket("recording"))}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Other Fees: <strong>{f$(feeByBucket("other"))}</strong></p>
            <p style={{margin:"2px 0",fontSize:"7.5pt",color:"#888"}}>{feeMode==="estimate"?"Estimated fees":"Actual fees entered"} · {Object.keys(feeActuals).filter(k=>feeActuals[k]!=="").length} overrides</p>
            <p style={{margin:"8px 0 0",fontWeight:"bold",borderTop:"1px solid #ccc",paddingTop:"6px",fontSize:"9.5pt"}}>Total (Disclosure): {f$(totalDisc)}</p>
            <p style={{margin:"2px 0",fontSize:"8pt",color:"#666"}}>Recoupment uses {f$(netFees)} (net of credit, excl. funding fee per §3709(a))</p>
          </div>
          <div style={{border:"1.5px solid #1a3a6b",borderRadius:"7px",padding:"12px"}}>
            <p style={{fontWeight:"bold",color:"#1a3a6b",marginBottom:"7px",fontSize:"10pt"}}>Pricing & Cash to Close</p>
            {credit>0&&<p style={{margin:"3px 0",fontSize:"9.5pt"}}>Lender Credit: <strong style={{color:"#1a6b1a"}}>− {f$(creditApplied)}</strong></p>}
            {credit>0&&pr.method==="rate"&&<p style={{margin:"3px 0",fontSize:"8pt",color:"#666"}}>Rate {fp(propRate)} vs par {fp(parRate)} (+{fp4(propRate-parRate)})</p>}
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>After Credit: <strong>{f$(remaining)}</strong></p>
            <p style={{margin:"3px 0",fontSize:"9.5pt"}}>Rolled Into Loan: <strong>{pr.roll?"Yes":"No"}</strong></p>
            <p style={{margin:"8px 0 0",fontWeight:"bold",borderTop:"1px solid #ccc",paddingTop:"6px",fontSize:"10pt",color:cashToClose===0?"#1a6b1a":"#333"}}>Cash to Close: {f$(cashToClose)} {cashToClose===0?"✓ No-Cost":""}</p>
          </div>
        </div>

        <div style={{background:ntbOK?"#e8f5e9":"#ffebee",border:`2px solid ${ntbOK?"#2e7d32":"#c62828"}`,borderRadius:"7px",padding:"12px",marginBottom:"16px",textAlign:"center"}}>
          <p style={{fontSize:"13pt",fontWeight:"bold",color:ntbOK?"#1a6b1a":"#c00",margin:"0"}}>{ntbOK?"✓ NET TANGIBLE BENEFIT CONFIRMED — IRRRL RECOMMENDED":"✗ NET TANGIBLE BENEFIT NOT CONFIRMED — REQUIRES REVIEW"}</p>
        </div>

        <div style={{border:"1.5px solid #ccc",borderRadius:"7px",padding:"12px",marginBottom:"16px"}}>
          <p style={{fontWeight:"bold",marginBottom:"6px",fontSize:"10pt"}}>Veteran Acknowledgment — Receipt of Comparison Statement (VA Circular 26-19-22 §3.d)</p>
          <p style={{fontSize:"8.5pt",color:"#444",marginBottom:"12px"}}>Lender must present this comparison statement within 3 business days of application AND again at closing. Sign below to confirm receipt on each occasion. Veteran may acknowledge via written letter, e-signature, email, or system timestamp.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"14px"}}>
            {["Veteran Signature / Date","Co-Borrower Signature / Date","Loan Officer / Date"].map(l=>(
              <div key={l}><p style={{fontSize:"8.5pt",color:"#666"}}>{l}</p><div style={{borderBottom:"1px solid #000",height:"22px",marginBottom:"3px"}}/></div>
            ))}
          </div>
        </div>

        <div style={{fontSize:"7.5pt",color:"#777",borderTop:"1px solid #ccc",paddingTop:"8px"}}>
          <p><strong>Authority:</strong> VA Circular 26-19-22 (Aug 8, 2019) · 38 U.S.C. § 3709 · VA Lender's Handbook Ch. 8. Generated by LoanBeacons™ for loan officer use — not a commitment to lend. NTB analysis: fixed-to-fixed rate drop ≥0.50%; fixed-to-ARM rate drop ≥2.00%; 36-month fee recoupment (VA funding fee excluded per §3709(a)); zero-fee requirement for same/higher payment IRRRLs per §3709(a)(1)(B); lender credits reduce net fees subject to VA prohibition on cash back to borrower. Verify all figures against official Loan Estimates and Closing Disclosures from your lender.</p>
          <p style={{marginTop:"4px"}}>Generated: {new Date().toLocaleString()} · LoanBeacons™ VA IRRRL Intelligence™ v3.1 · {scenarioId?`Scenario: ${scenarioId}`:"Standalone mode"}</p>
        </div>

        {/* Sensitivity Table in PDF */}
        {curRate>0&&propRate>0&&loanBal>0&&(
          <div style={{marginTop:"20px",pageBreakBefore:"always"}}>
            <p style={{fontWeight:"bold",color:"#1a3a6b",fontSize:"12pt",marginBottom:"8px"}}>Rate Sensitivity Analysis</p>
            <p style={{fontSize:"8pt",color:"#666",marginBottom:"10px"}}>How Net Tangible Benefit changes at ±0.50% rate increments. Net fees held constant at {f$(netFees)}.</p>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#1a3a6b",color:"#fff"}}>
                  {["Scenario","Rate","Rate Drop","Monthly Savings","Recoupment","NTB Pass?"].map(h=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:"9pt"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivityRows.map((row,i)=>(
                  <tr key={i} style={{background:row.isCurrent?"#e3f2fd":i%2===0?"#f5f7ff":"#fff"}}>
                    <td style={{padding:"6px 10px",fontSize:"9pt",fontWeight:row.isCurrent?"bold":"normal"}}>{row.isCurrent?"→ PROPOSED":row.delta>0?`+${row.delta.toFixed(2)}%`:row.delta.toFixed(2)+"%"}</td>
                    <td style={{padding:"6px 10px",fontSize:"9pt",fontFamily:"monospace"}}>{row.rate.toFixed(3)}%</td>
                    <td style={{padding:"6px 10px",fontSize:"9pt",fontFamily:"monospace"}}>{row.drop.toFixed(3)}%</td>
                    <td style={{padding:"6px 10px",fontSize:"9pt",fontFamily:"monospace",color:row.sav>0?"#1a6b1a":"#c00"}}>{row.sav>0?f$(row.sav):"Higher"}</td>
                    <td style={{padding:"6px 10px",fontSize:"9pt"}}>{!isFinite(row.recoup)?"N/A":row.recoup===0?"Instant":`${row.recoup} months`}</td>
                    <td style={{padding:"6px 10px",fontSize:"9pt",fontWeight:"bold",color:row.ok?"#1a6b1a":"#c00"}}>{row.ok?"✓ YES":"✗ NO"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:"7.5pt",color:"#888",marginTop:"6px"}}>Rate drop thresholds: Fixed→Fixed ≥0.50% | Fixed→ARM ≥2.00% | ARM→ARM any drop | ARM→Fixed always passes rate test. Recoupment max 36 months (net fees ÷ monthly savings).</p>
          </div>
        )}
      </div>
    </div>
  );
}
