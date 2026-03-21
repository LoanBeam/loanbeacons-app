const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");
require("dotenv").config();

initializeApp();

const db = getFirestore();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HELPER: Build Scenario Snapshot
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function buildScenarioSnapshot(shareDoc) {
  const { scenarioId, userId, aeEmails, shareType, message, moduleContext, dpaContext } = shareDoc;

  // Fetch scenario
  const scenarioSnap = await db.collection("scenarios").doc(scenarioId).get();
  if (!scenarioSnap.exists) throw new Error("Scenario not found: " + scenarioId);
  const s = scenarioSnap.data();

  // Fetch LO profile â€” try userId first, then loProfiles, then userProfiles/default
  let lo = {};
  if (userId) {
    const loSnap = await db.collection("loProfiles").doc(userId).get();
    if (loSnap.exists) {
      lo = loSnap.data();
    } else {
      const upSnap = await db.collection("userProfiles").doc(userId).get();
      if (upSnap.exists) lo = upSnap.data();
    }
  }
  if (!lo.email) {
    const fallbackSnap = await db.collection("userProfiles").doc("default").get();
    if (fallbackSnap.exists) lo = { ...fallbackSnap.data(), ...lo };
  }

  // Fetch lender profile
  let lender = {};
  const lenderId = s.selectedLenderId || s.lenderId;
  if (lenderId) {
    const lenderSnap = await db.collection("lenderProfiles").doc(lenderId).get();
    if (lenderSnap.exists) lender = lenderSnap.data();
    if (!lender.lenderName) {
      const l2Snap = await db.collection("lenders").doc(lenderId).get();
      if (l2Snap.exists) lender = l2Snap.data();
    }
  }

  // â”€â”€ Borrower name â€” support both storage patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const borrowerName =
    s.borrowerName ||
    (`${s.firstName || ""} ${s.lastName || ""}`.trim()) ||
    s.scenarioName ||
    "Unknown Borrower";

  // â”€â”€ Property address â€” support both storage patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const propertyAddress =
    s.propertyAddress ||
    s.subjectPropertyAddress ||
    [s.streetAddress, s.city, s.state, s.zipCode].filter(Boolean).join(", ") ||
    "";

  // â”€â”€ Annual income â†’ monthly â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const monthlyIncome =
    s.monthlyIncome ||
    s.grossMonthlyIncome ||
    (s.totalIncome ? s.totalIncome : null) ||
    (s.annualIncome ? (s.annualIncome / 12) : null) ||
    "";

  return {
    scenarioId,
    shareType,
    message:       message || "",
    moduleContext: moduleContext || null,
    dpaContext:    dpaContext    || null,
    lo: {
    name:    lo.displayName || lo.name || [lo.firstName, lo.lastName].filter(Boolean).join(' ') || 'Loan Officer',
      email:   lo.email    || "",
      phone:   lo.phone    || "",
      nmls:    lo.nmlsId   || lo.nmls || "",
      company: lo.company  || lo.brokerage || "",
    },
    lender: {
      name:    lender.lenderName || lender.name || s.lenderName || "",
      logoUrl: lender.logoUrl    || "",
    },
    borrower: {
      name:        borrowerName,
      creditScore: s.creditScore || "",
      income:      monthlyIncome,
    },
    property: {
      address:     propertyAddress,
      city:        s.city        || s.propertyCity        || "",
      state:       s.state       || s.propertyState       || "",
      zipCode:     s.zipCode     || "",
      value:       s.propertyValue || s.estimatedValue    || "",
      loanAmount:  s.loanAmount  || s.baseLoanAmount      || "",
      ltv:         s.ltv         || "",
      loanType:    s.loanType    || s.loanPurpose         || "",
      loanProduct: s.loanProduct || s.loanProgram         || "",
    },
    piti: {
      principal: s.principalAndInterest || s.piPayment           || "",
      taxes:     s.monthlyTaxes         || s.propertyTaxMonthly  || "",
      insurance: s.monthlyInsurance     || s.hazardInsuranceMonthly || "",
      hoa:       s.hoaMonthly           || s.monthlyHOA          || "",
      mip:       s.mipMonthly           || s.monthlyMIP          || "",
      total:     s.totalHousing         || s.totalPITI           || "",
    },
    dti: {
      front: s.frontDti    || s.frontEndDTI || s.frontDTI || "",
      back:  s.backDti     || s.backEndDTI  || s.backDTI  || s.dtiRatio || "",
    },
    intelligence: {
      ausResult:    s.ausResult    || s.ausFindings || "",
      dpaEligible:  s.dpaEligible  || false,
      craFlag:      s.craEligible  || s.craFlag     || false,
      usdaEligible: s.usdaEligible || false,
      vaEligible:   s.vaEligible   || false,
    },
    aeEmails,
    timestamp: new Date().toISOString(),
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HELPER: Build HTML Email
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildEmailHtml(snap) {
  const {
    lo, lender, borrower, property, piti, dti, intelligence,
    shareType, message, scenarioId, publicShareToken,
    moduleContext, dpaContext,
  } = snap;

  const shareTypeLabel = {
    AE_SUPPORT:       "I need AE support on this scenario",
    SCENARIO_REVIEW:  "Please review this scenario for eligibility",
    FINAL_SUBMISSION: "This is ready â€” please prepare for submission",
  }[shareType] || shareType || "Scenario Share";

  const flag        = (val) => val ? "âœ… Yes" : "â€”";
  const fmt         = (val) => val || "â€”";
  const fmtCurrency = (val) => val ? `$${Number(val).toLocaleString()}` : "â€”";
  const fmtPct      = (val) => val ? `${Number(val).toFixed(2)}%` : "â€”";

  const viewUrl = `https://loanbeacons.com/ae-share/${publicShareToken}`;
  const replySubject = (dpaContext && dpaContext.programName)
    ? `Re: ${dpaContext.programName} â€” ${borrower.name || ''}`
    : `Re: Loan Scenario â€” ${borrower.name || ''}`;
  const replyHref = lo.email ? `mailto:${lo.email}?subject=${encodeURIComponent(replySubject)}` : '#';

  // â”€â”€ DPA Program Section (when sent from a program card) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dpaProgramSection = dpaContext ? `
  <div class="section" style="background:#f0fdf4;border-left:4px solid #16a34a;">
    <div class="section-title" style="color:#16a34a;">DPA Program â€” ${fmt(dpaContext.programName)}</div>
    <div class="grid">
      <div class="field"><div class="label">Program Type</div><div class="value">${fmt(dpaContext.programType)}</div></div>
      <div class="field"><div class="label">DPA Amount</div><div class="value">${fmt(dpaContext.dpaAmount)}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${fmt(dpaContext.programStatus)}</div></div>
      <div class="field"><div class="label">Max CLTV</div><div class="value">${fmt(dpaContext.ltvLimit)}</div></div>
      ${dpaContext.adminAgency ? `<div class="field"><div class="label">Admin Agency</div><div class="value">${dpaContext.adminAgency}</div></div>` : ""}
      ${dpaContext.incomeLimit ? `<div class="field"><div class="label">Income Limit</div><div class="value">${fmtCurrency(dpaContext.incomeLimit)}</div></div>` : ""}
    </div>
    ${dpaContext.layeringRules ? `<div style="margin-top:10px;padding:8px 12px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534;"><strong>Stacking Rules:</strong> ${dpaContext.layeringRules}</div>` : ""}
    ${dpaContext.fitReasons && dpaContext.fitReasons.length > 0 ? `
    <div style="margin-top:12px;">
      <div style="font-size:12px;font-weight:bold;color:#166534;margin-bottom:6px;">Why This Program Fits:</div>
      ${dpaContext.fitReasons.map(r => `<div style="font-size:12px;color:#166534;padding:3px 0;">âœ“ ${r}</div>`).join("")}
    </div>` : ""}
    ${dpaContext.warnings && dpaContext.warnings.length > 0 ? `
    <div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border-radius:6px;">
      ${dpaContext.warnings.map(w => `<div style="font-size:12px;color:#d97706;">âš ï¸ ${w}</div>`).join("")}
    </div>` : ""}
  </div>` : "";

  // â”€â”€ Module Context Section (when sent from header button) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const moduleSection = (!dpaContext && moduleContext) ? `
  <div class="section" style="background:#eff6ff;border-left:4px solid #2563eb;">
    <div class="section-title" style="color:#2563eb;">Sent from: ${fmt(moduleContext.moduleName)}</div>
    <div style="font-size:13px;color:#1e40af;">Module ${fmt(moduleContext.moduleNumber)} â€” LO is requesting AE review from this analysis module.</div>
  </div>` : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
  .wrapper { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 28px 32px; text-align: center; }
  .header h1 { color: #f5c842; margin: 0; font-size: 22px; }
  .header p { color: #a0aec0; margin: 4px 0 0; font-size: 13px; }
  .badge { display: inline-block; background: #f5c842; color: #1a1a2e; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 8px; }
  .section { padding: 20px 32px; border-bottom: 1px solid #e2e8f0; }
  .section-title { font-size: 13px; font-weight: bold; color: #f5c842; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field { font-size: 13px; }
  .field .label { color: #718096; margin-bottom: 2px; }
  .field .value { font-weight: 600; color: #1a1a2e; }
  .full { grid-column: 1 / -1; }
  .message-box { background: #f0f4f8; border-left: 4px solid #f5c842; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #2d3748; }
  .cta { text-align: center; padding: 28px 32px; }
  .cta a { background: #f5c842; color: #1a1a2e; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; }
  .footer { background: #f7fafc; text-align: center; padding: 16px; font-size: 11px; color: #a0aec0; }
  .lender-logo { max-height: 36px; margin-bottom: 4px; }
</style></head>
<body>
<div class="wrapper">

  <div class="header">
    <h1>ðŸ¦ LoanBeaconsâ„¢</h1>
    <p>Loan Scenario from ${fmt(lo.name)}${lo.company ? ` Â· ${lo.company}` : ""}</p>
    <span class="badge">${shareTypeLabel}</span>
  </div>

  <div style="background:#161b22;padding:14px 32px;text-align:center;border-bottom:2px solid #f5c842;">
    <a href="${replyHref}" style="display:inline-flex;align-items:center;gap:8px;background:#f5c842;color:#1a1a2e;padding:11px 28px;border-radius:8px;text-decoration:none;font-weight:800;font-size:14px;">&#9993; Reply to ${fmt(lo.name)}</a>
    <p style="font-size:11px;color:#a0aec0;margin:6px 0 0;">${fmt(lo.email)} &middot; ${fmt(lo.phone)}</p>
  </div>

  ${lender.logoUrl ? `<div style="text-align:center;padding:16px 0 0;"><img src="${lender.logoUrl}" class="lender-logo" alt="${lender.name}"></div>` : ""}
  ${lender.name ? `<div style="text-align:center;padding:4px 0 12px;font-size:13px;color:#4a5568;font-weight:600;">${lender.name}</div>` : ""}

  <div style="background:#1a1a2e;padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2d3748;">
    <div>
      <div style="font-size:10px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;">Loan Officer</div>
      <div style="font-size:14px;font-weight:700;color:#f5c842;">${fmt(lo.name)}</div>
      <div style="font-size:12px;color:#a0aec0;">${fmt(lo.company)} Â· NMLS# ${fmt(lo.nmls)}</div>
    </div>
    <a href="mailto:${lo.email}?subject=RE: \${borrower?.name || 'Loan Scenario'} â€” LoanBeaconsâ„¢" style="display:inline-block;background:#f5c842;color:#1a1a2e;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:800;font-size:13px;white-space:nowrap;">
      âœ‰ï¸ Reply to LO
    </a>
  </div>

  ${message ? `<div class="section"><div class="section-title">Message from LO</div><div class="message-box">${message}</div></div>` : ""}

  ${dpaProgramSection}
  ${moduleSection}

  <div class="section">
    <div class="section-title">Borrower</div>
    <div class="grid">
      <div class="field full"><div class="label">Name</div><div class="value">${fmt(borrower.name)}</div></div>
      <div class="field"><div class="label">Credit Score</div><div class="value">${fmt(borrower.creditScore)}</div></div>
      <div class="field"><div class="label">Gross Monthly Income</div><div class="value">${fmtCurrency(borrower.income)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Property & Loan</div>
    <div class="grid">
      <div class="field full"><div class="label">Property Address</div><div class="value">${fmt(property.address)}</div></div>
      <div class="field"><div class="label">Property Value</div><div class="value">${fmtCurrency(property.value)}</div></div>
      <div class="field"><div class="label">Loan Amount</div><div class="value">${fmtCurrency(property.loanAmount)}</div></div>
      <div class="field"><div class="label">LTV</div><div class="value">${fmtPct(property.ltv)}</div></div>
      <div class="field"><div class="label">Loan Type</div><div class="value">${fmt(property.loanType)}</div></div>
      <div class="field"><div class="label">Loan Product</div><div class="value">${fmt(property.loanProduct)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">PITI Breakdown</div>
    <div class="grid">
      <div class="field"><div class="label">Principal & Interest</div><div class="value">${fmtCurrency(piti.principal)}</div></div>
      <div class="field"><div class="label">Taxes</div><div class="value">${fmtCurrency(piti.taxes)}</div></div>
      <div class="field"><div class="label">Insurance</div><div class="value">${fmtCurrency(piti.insurance)}</div></div>
      <div class="field"><div class="label">HOA</div><div class="value">${fmtCurrency(piti.hoa)}</div></div>
      <div class="field"><div class="label">MIP/PMI</div><div class="value">${fmtCurrency(piti.mip)}</div></div>
      <div class="field"><div class="label">Total PITI</div><div class="value">${fmtCurrency(piti.total)}</div></div>
      <div class="field"><div class="label">Front DTI</div><div class="value">${fmtPct(dti.front)}</div></div>
      <div class="field"><div class="label">Back DTI</div><div class="value">${fmtPct(dti.back)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Intelligence Flags</div>
    <div class="grid">
      <div class="field"><div class="label">AUS Result</div><div class="value">${fmt(intelligence.ausResult)}</div></div>
      <div class="field"><div class="label">DPA Eligible</div><div class="value">${flag(intelligence.dpaEligible)}</div></div>
      <div class="field"><div class="label">CRA Flag</div><div class="value">${flag(intelligence.craFlag)}</div></div>
      <div class="field"><div class="label">USDA Eligible</div><div class="value">${flag(intelligence.usdaEligible)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Loan Officer Contact</div>
    <div class="grid">
      <div class="field"><div class="label">Name</div><div class="value">${fmt(lo.name)}</div></div>
      <div class="field"><div class="label">NMLS#</div><div class="value">${fmt(lo.nmls)}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${fmt(lo.email)}</div></div>
      <div class="field"><div class="label">Phone</div><div class="value">${fmt(lo.phone)}</div></div>
      <div class="field"><div class="label">Company</div><div class="value">${fmt(lo.company)}</div></div>
    </div>
  </div>

  <div class="cta">
    <a href="${viewUrl}">View Full Scenario Online â†’</a>
    <p style="font-size:11px;color:#a0aec0;margin-top:12px;">Scenario ID: ${scenarioId}</p>
  </div>

  <div class="footer">
    Sent via LoanBeaconsâ„¢ Â· ${new Date().toLocaleDateString()} Â· <a href="mailto:${lo.email}" style="color:#f5c842;">Reply to LO</a>
  </div>

</div>
</body>
</html>`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FUNCTION 1: createScenarioShare (Firestore trigger)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.createScenarioShare = onDocumentCreated(
  "scenarioShares/{shareId}",
  async (event) => {
    const shareId  = event.params.shareId;
    const shareDoc = event.data.data();

    if (!shareDoc.aeEmails || shareDoc.aeEmails.length === 0 || shareDoc.aeEmails.length > 5) {
      await db.collection("scenarioShares").doc(shareId).update({
        status:    "failed",
        lastError: "aeEmails must be between 1 and 5 addresses.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    try {
      const publicShareToken = crypto.randomUUID();
      const snapshot = await buildScenarioSnapshot(shareDoc);
      snapshot.publicShareToken = publicShareToken;

      const emailPromises = shareDoc.aeEmails.map((aeEmail) => {
        const programName = shareDoc.dpaContext?.programName;
        const lbRef = snapshot.scenarioId ? `[LB-${snapshot.scenarioId.substring(0,8).toUpperCase()}]` : "";
        const subject = programName
          ? `${lbRef} DPA Review Request: ${programName} â€” ${snapshot.borrower.name} | ${snapshot.lender.name || snapshot.lo.company}`
          : `${lbRef} Scenario Share: ${snapshot.borrower.name} | ${snapshot.property.loanType || "Loan"} â€” ${snapshot.lo.name} Â· ${snapshot.lo.company}`;

        return sgMail.send({
          to:      aeEmail,
          from:    { email: process.env.SENDGRID_FROM || "noreply@loanbeacons.com", name: "LoanBeaconsâ„¢" },
          replyTo: snapshot.lo.email || undefined,
          subject,
          html:    buildEmailHtml(snapshot),
        });
      });

      await Promise.all(emailPromises);

      await db.collection("scenarioShares").doc(shareId).update({
        status:          "sent",
        publicShareToken,
        snapshotPayload: snapshot,
        sentAt:          FieldValue.serverTimestamp(),
        updatedAt:       FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("createScenarioShare error:", err);
      await db.collection("scenarioShares").doc(shareId).update({
        status:    "failed",
        lastError: err.message || "Unknown error",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FUNCTION 2: getShareByToken (Public HTTP endpoint)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getShareByToken = onRequest(
  { cors: true },
  async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: "Missing token" });

    try {
      const snap = await db
        .collection("scenarioShares")
        .where("publicShareToken", "==", token)
        .where("status", "==", "sent")
        .limit(1)
        .get();

      if (snap.empty) return res.status(404).json({ error: "Share not found or not yet sent" });

      const doc = snap.docs[0];

      await doc.ref.update({
        viewedAt:  FieldValue.serverTimestamp(),
        viewCount: FieldValue.increment(1),
      });

      return res.status(200).json({
        shareId: doc.id,
        ...doc.data().snapshotPayload,
        ae_response: doc.data().ae_response || null,
      });
    } catch (err) {
      console.error("getShareByToken error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FUNCTION 3: retryScenarioShare (Callable)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.retryScenarioShare = onCall(async (request) => {
  const { shareId } = request.data;
  if (!shareId) throw new Error("shareId is required");

  const shareRef  = db.collection("scenarioShares").doc(shareId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) throw new Error("Share document not found");

  const shareDoc = shareSnap.data();
  if (shareDoc.status === "sent") return { success: false, message: "Already sent successfully" };

  try {
    const publicShareToken = shareDoc.publicShareToken || crypto.randomUUID();
    const snapshot = await buildScenarioSnapshot(shareDoc);
    snapshot.publicShareToken = publicShareToken;

    const emailPromises = shareDoc.aeEmails.map((aeEmail) => {
      const programName = shareDoc.dpaContext?.programName;
      const subject = programName
        ? `DPA Program Review: ${programName} â€” ${snapshot.borrower.name} | ${snapshot.lo.name}`
        : `Loan Scenario from ${snapshot.lo.name} | ${snapshot.property.loanType || "Loan"} â€” ${snapshot.borrower.name}`;
      return sgMail.send({
        to:      aeEmail,
        from:    { email: process.env.SENDGRID_FROM || "noreply@loanbeacons.com", name: "LoanBeaconsâ„¢" },
        replyTo: snapshot.lo.email || undefined,
        subject,
        html:    buildEmailHtml(snapshot),
      });
    });

    await Promise.all(emailPromises);

    await shareRef.update({
      status:          "sent",
      publicShareToken,
      snapshotPayload: snapshot,
      sentAt:          FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
      lastError:       FieldValue.delete(),
    });

    return { success: true };
  } catch (err) {
    await shareRef.update({
      status:    "failed",
      lastError: err.message,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new Error("Retry failed: " + err.message);
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FUNCTION 4: lockDecisionRecord
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { lockDecisionRecord } = require('./src/lockDecisionRecord.cjs');
exports.lockDecisionRecord = lockDecisionRecord;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FUNCTION 5: respondToScenarioShare
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { respondToScenarioShare } = require('./src/respondToScenarioShare.cjs');
exports.respondToScenarioShare = respondToScenarioShare;
