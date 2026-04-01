// ===========================================================================
// LoanBeacons™ — Cloud Functions index.js
// All functions Gen2 | Secrets via Secret Manager (NOT .env)
// ANTHROPIC_KEY + SENDGRID_API_KEY both stored in Secret Manager
// Last updated: March 2026
// ===========================================================================

const { onDocumentCreated }    = require("firebase-functions/v2/firestore");
const { onCall, onRequest }    = require("firebase-functions/v2/https");
const { defineSecret }         = require("firebase-functions/params");
const { initializeApp }        = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const sgMail                   = require("@sendgrid/mail");
const crypto                   = require("crypto");

initializeApp();

const db = getFirestore();

// ── Secrets ─────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY    = defineSecret("ANTHROPIC_KEY");
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

// ===========================================================================
// HELPERS
// ===========================================================================

// ---------------------------------------------------------------------------
// callAnthropic — shared Node https helper (no SDK dependency)
// ---------------------------------------------------------------------------
function callAnthropic(apiKey, body) {
  const https = require("https");
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`Anthropic ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error("Failed to parse Anthropic response: " + data.substring(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Build Scenario Snapshot
// ---------------------------------------------------------------------------
async function buildScenarioSnapshot(shareDoc) {
  const { scenarioId, userId, aeEmails, shareType, message, moduleContext, dpaContext } = shareDoc;
  if (!scenarioId) throw new Error("scenarioId is required but was empty");

  const scenarioSnap = await db.collection("scenarios").doc(scenarioId).get();
  if (!scenarioSnap.exists) throw new Error("Scenario not found: " + scenarioId);
  const s = scenarioSnap.data();

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

  const borrowerName =
    s.borrowerName ||
    (`${s.firstName || ""} ${s.lastName || ""}`.trim()) ||
    s.scenarioName || "Unknown Borrower";

  const propertyAddress =
    s.propertyAddress || s.subjectPropertyAddress ||
    [s.streetAddress, s.city, s.state, s.zipCode].filter(Boolean).join(", ") || "";

  const monthlyIncome =
    s.monthlyIncome || s.grossMonthlyIncome ||
    (s.totalIncome ? s.totalIncome : null) ||
    (s.annualIncome ? (s.annualIncome / 12) : null) || "";

  return {
    scenarioId, shareType,
    message: message || "",
    moduleContext: moduleContext || null,
    dpaContext: dpaContext || null,
    lo: {
      name:    lo.displayName || lo.name || [lo.firstName, lo.lastName].filter(Boolean).join(" ") || "Loan Officer",
      email:   lo.email    || "",
      phone:   lo.phone    || "",
      nmls:    lo.nmlsId   || lo.nmls || "",
      company: lo.company  || lo.brokerage || "",
    },
    lender: { name: lender.lenderName || lender.name || s.lenderName || "", logoUrl: lender.logoUrl || "" },
    borrower: { name: borrowerName, creditScore: s.creditScore || "", income: monthlyIncome },
    property: {
      address: propertyAddress,
      city: s.city || s.propertyCity || "",
      state: s.state || s.propertyState || "",
      zipCode: s.zipCode || "",
      value: s.propertyValue || s.estimatedValue || "",
      loanAmount: s.loanAmount || s.baseLoanAmount || "",
      ltv: s.ltv || "",
      loanType: s.loanType || s.loanPurpose || "",
      loanProduct: s.loanProduct || s.loanProgram || "",
    },
    piti: {
      principal: s.principalAndInterest || s.piPayment || "",
      taxes:     s.monthlyTaxes || s.propertyTaxMonthly || "",
      insurance: s.monthlyInsurance || s.hazardInsuranceMonthly || "",
      hoa:       s.hoaMonthly || s.monthlyHOA || "",
      mip:       s.mipMonthly || s.monthlyMIP || "",
      total:     s.totalHousing || s.totalPITI || "",
    },
    dti: {
      front: s.frontDti || s.frontEndDTI || s.frontDTI || "",
      back:  s.backDti  || s.backEndDTI  || s.backDTI  || s.dtiRatio || "",
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

// ---------------------------------------------------------------------------
// Build HTML Email
// ---------------------------------------------------------------------------
function buildEmailHtml(snap) {
  const { lo, lender, borrower, property, piti, dti, intelligence, shareType, message, scenarioId, publicShareToken, moduleContext, dpaContext } = snap;
  const shareTypeLabel = {
    AE_SUPPORT: "I need AE support on this scenario",
    SCENARIO_REVIEW: "Please review this scenario for eligibility",
    FINAL_SUBMISSION: "This is ready — please prepare for submission",
  }[shareType] || shareType || "Scenario Share";

  const flag        = (val) => val ? "✓ Yes" : "—";
  const fmt         = (val) => val || "—";
  const fmtCurrency = (val) => val ? `$${Number(val).toLocaleString()}` : "—";
  const fmtPct      = (val) => val ? `${Number(val).toFixed(2)}%` : "—";
  const appBaseUrl  = "https://loanbeacon.web.app";
  const viewUrl     = publicShareToken ? `${appBaseUrl}/ae-share/${publicShareToken}` : "#";
  const replySubject = (dpaContext && dpaContext.programName)
    ? `Re: ${dpaContext.programName} — ${borrower.name || ""}`
    : `Re: Loan Scenario — ${borrower.name || ""}`;
  const replyHref = lo.email ? `mailto:${lo.email}?subject=${encodeURIComponent(replySubject)}` : "#";

  const dpaProgramSection = dpaContext ? `
  <div class="section" style="background:#f0fdf4;border-left:4px solid #16a34a;">
    <div class="section-title" style="color:#16a34a;">DPA Program — ${fmt(dpaContext.programName)}</div>
    <div class="grid">
      <div class="field"><div class="label">Program Type</div><div class="value">${fmt(dpaContext.programType)}</div></div>
      <div class="field"><div class="label">DPA Amount</div><div class="value">${fmt(dpaContext.dpaAmount)}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${fmt(dpaContext.programStatus)}</div></div>
      <div class="field"><div class="label">Max CLTV</div><div class="value">${fmt(dpaContext.ltvLimit)}</div></div>
    </div>
  </div>` : "";

  const moduleSection = (!dpaContext && moduleContext) ? `
  <div class="section" style="background:#eff6ff;border-left:4px solid #2563eb;">
    <div class="section-title" style="color:#2563eb;">Sent from: ${fmt(moduleContext.moduleName)}</div>
    <div style="font-size:13px;color:#1e40af;">Module ${fmt(moduleContext.moduleNumber)} — LO is requesting AE review.</div>
  </div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#1a1a2e;background:#f5f7fa;margin:0;padding:0}
  .wrapper{max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}
  .header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 32px;text-align:center}
  .header h1{color:#f5c842;margin:0;font-size:22px}.header p{color:#a0aec0;margin:4px 0 0;font-size:13px}
  .badge{display:inline-block;background:#f5c842;color:#1a1a2e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold;margin-top:8px}
  .section{padding:20px 32px;border-bottom:1px solid #e2e8f0}
  .section-title{font-size:13px;font-weight:bold;color:#f5c842;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{font-size:13px}
  .field .label{color:#718096;margin-bottom:2px}.field .value{font-weight:600;color:#1a1a2e}
  .full{grid-column:1/-1}.message-box{background:#f0f4f8;border-left:4px solid #f5c842;padding:12px 16px;border-radius:4px;font-size:13px;color:#2d3748}
  .cta{text-align:center;padding:28px 32px}.cta a{background:#f5c842;color:#1a1a2e;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px}
  .footer{background:#f7fafc;text-align:center;padding:16px;font-size:11px;color:#a0aec0}
  </style></head><body><div class="wrapper">
  <div class="header"><h1>LoanBeacons™</h1><p>Loan Scenario from ${fmt(lo.name)}${lo.company ? ` · ${lo.company}` : ""}</p><span class="badge">${shareTypeLabel}</span></div>
  ${message ? `<div class="section"><div class="section-title">Message from LO</div><div class="message-box">${message}</div></div>` : ""}
  ${dpaProgramSection}${moduleSection}
  <div class="section"><div class="section-title">Borrower</div><div class="grid">
    <div class="field full"><div class="label">Name</div><div class="value">${fmt(borrower.name)}</div></div>
    <div class="field"><div class="label">Credit Score</div><div class="value">${fmt(borrower.creditScore)}</div></div>
    <div class="field"><div class="label">Monthly Income</div><div class="value">${fmtCurrency(borrower.income)}</div></div>
  </div></div>
  <div class="section"><div class="section-title">Property &amp; Loan</div><div class="grid">
    <div class="field full"><div class="label">Address</div><div class="value">${fmt(property.address)}</div></div>
    <div class="field"><div class="label">Value</div><div class="value">${fmtCurrency(property.value)}</div></div>
    <div class="field"><div class="label">Loan Amount</div><div class="value">${fmtCurrency(property.loanAmount)}</div></div>
    <div class="field"><div class="label">LTV</div><div class="value">${fmtPct(property.ltv)}</div></div>
    <div class="field"><div class="label">Loan Type</div><div class="value">${fmt(property.loanType)}</div></div>
  </div></div>
  <div class="section"><div class="section-title">PITI</div><div class="grid">
    <div class="field"><div class="label">P&amp;I</div><div class="value">${fmtCurrency(piti.principal)}</div></div>
    <div class="field"><div class="label">Taxes</div><div class="value">${fmtCurrency(piti.taxes)}</div></div>
    <div class="field"><div class="label">Insurance</div><div class="value">${fmtCurrency(piti.insurance)}</div></div>
    <div class="field"><div class="label">Total PITI</div><div class="value">${fmtCurrency(piti.total)}</div></div>
    <div class="field"><div class="label">Front DTI</div><div class="value">${fmtPct(dti.front)}</div></div>
    <div class="field"><div class="label">Back DTI</div><div class="value">${fmtPct(dti.back)}</div></div>
  </div></div>
  <div class="section"><div class="section-title">LO Contact</div><div class="grid">
    <div class="field"><div class="label">Name</div><div class="value">${fmt(lo.name)}</div></div>
    <div class="field"><div class="label">NMLS#</div><div class="value">${fmt(lo.nmls)}</div></div>
    <div class="field"><div class="label">Email</div><div class="value">${fmt(lo.email)}</div></div>
    <div class="field"><div class="label">Phone</div><div class="value">${fmt(lo.phone)}</div></div>
  </div></div>
  <div class="cta"><a href="${viewUrl}">View Full Scenario Online &rarr;</a><p style="font-size:11px;color:#a0aec0;margin-top:12px;">Scenario ID: ${scenarioId}</p></div>
  <div class="footer">Sent via LoanBeacons™ · ${new Date().toLocaleDateString()}</div>
  </div></body></html>`;
}

// ===========================================================================
// FUNCTION 1: createScenarioShare
// ===========================================================================
exports.createScenarioShare = onDocumentCreated(
  { document: "scenarioShares/{shareId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    sgMail.setApiKey(SENDGRID_API_KEY.value());
    const shareId  = event.params.shareId;
    const shareDoc = event.data.data();

    if (!shareDoc.aeEmails || shareDoc.aeEmails.length === 0 || shareDoc.aeEmails.length > 5) {
      await db.collection("scenarioShares").doc(shareId).update({
        status: "failed", lastError: "aeEmails must be between 1 and 5 addresses.",
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
        const lbRef = snapshot.scenarioId ? `[LB-${snapshot.scenarioId.substring(0, 8).toUpperCase()}]` : "";
        const subject = programName
          ? `${lbRef} DPA Review Request: ${programName} — ${snapshot.borrower.name}`
          : `${lbRef} Scenario Share: ${snapshot.borrower.name} | ${snapshot.lo.name}`;
        return sgMail.send({
          to: aeEmail,
          from: { email: "george@cvls.loans", name: "LoanBeacons™" },
          replyTo: snapshot.lo.email || undefined,
          subject,
          html: buildEmailHtml(snapshot),
        });
      });

      await Promise.all(emailPromises);
      await db.collection("scenarioShares").doc(shareId).update({
        status: "sent", publicShareToken, snapshotPayload: snapshot,
        sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("createScenarioShare error:", err);
      await db.collection("scenarioShares").doc(shareId).update({
        status: "failed", lastError: err.message || "Unknown error",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

// ===========================================================================
// FUNCTION 2: getShareByToken
// ===========================================================================
exports.getShareByToken = onRequest({ cors: true }, async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Missing token" });
  try {
    const snap = await db.collection("scenarioShares")
      .where("publicShareToken", "==", token)
      .where("status", "==", "sent")
      .limit(1).get();
    if (snap.empty) return res.status(404).json({ error: "Share not found" });
    const docRef = snap.docs[0];
    await docRef.ref.update({ viewedAt: FieldValue.serverTimestamp(), viewCount: FieldValue.increment(1) });
    return res.status(200).json({ shareId: docRef.id, ...docRef.data().snapshotPayload, ae_response: docRef.data().ae_response || null });
  } catch (err) {
    console.error("getShareByToken error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ===========================================================================
// FUNCTION 3: retryScenarioShare
// ===========================================================================
exports.retryScenarioShare = onCall(
  { secrets: [SENDGRID_API_KEY] },
  async (request) => {
    sgMail.setApiKey(SENDGRID_API_KEY.value());
    const { shareId } = request.data;
    if (!shareId) throw new Error("shareId is required");
    const shareRef  = db.collection("scenarioShares").doc(shareId);
    const shareSnap = await shareRef.get();
    if (!shareSnap.exists) throw new Error("Share document not found");
    const shareDoc = shareSnap.data();
    if (shareDoc.status === "sent") return { success: false, message: "Already sent" };
    try {
      const publicShareToken = shareDoc.publicShareToken || crypto.randomUUID();
      const snapshot = await buildScenarioSnapshot(shareDoc);
      snapshot.publicShareToken = publicShareToken;
      const emailPromises = shareDoc.aeEmails.map((aeEmail) => {
        const subject = `Loan Scenario from ${snapshot.lo.name} | ${snapshot.borrower.name}`;
        return sgMail.send({
          to: aeEmail,
          from: { email: "george@cvls.loans", name: "LoanBeacons™" },
          replyTo: snapshot.lo.email || undefined,
          subject, html: buildEmailHtml(snapshot),
        });
      });
      await Promise.all(emailPromises);
      await shareRef.update({
        status: "sent", publicShareToken, snapshotPayload: snapshot,
        sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        lastError: FieldValue.delete(),
      });
      return { success: true };
    } catch (err) {
      await shareRef.update({ status: "failed", lastError: err.message, updatedAt: FieldValue.serverTimestamp() });
      throw new Error("Retry failed: " + err.message);
    }
  }
);

// ===========================================================================
// FUNCTION 4: lockDecisionRecord
// ===========================================================================
const { lockDecisionRecord } = require("./src/lockDecisionRecord.cjs");
exports.lockDecisionRecord = lockDecisionRecord;

// ===========================================================================
// FUNCTION 5: respondToScenarioShare
// ===========================================================================
const { respondToScenarioShare } = require("./src/respondToScenarioShare.cjs");
exports.respondToScenarioShare = respondToScenarioShare;

// ===========================================================================
// FUNCTION 6: extractFHADocument → Gen2 | M10 FHA Streamline
// Supports multi-doc { documents: [{label, base64, mediaType}] }
// and legacy single-doc { documentBase64, mediaType, documentType }
//
// EXTRACTION IMPROVEMENTS (March 2026):
// - Per-field source priority rules (Mortgage Statement vs CD)
// - Rate disambiguation: existing rate only, never proposed/new rate
// - Confidence scoring per field (high/medium/low)
// - Post-extraction validation with warnings
// - docs_identified array to confirm what was found
// ===========================================================================
exports.extractFHADocument = onCall(
  { secrets: [ANTHROPIC_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {

    const promptText = `You are a mortgage document extraction specialist. You will extract FHA loan data from one or more documents provided. Documents may include a Closing Disclosure (CD), HUD-1 Settlement Statement, mortgage/account statement, or payment history.

DOCUMENT SOURCE PRIORITY RULES — follow these strictly:

existing_upb (current outstanding balance):
  SOURCE = Mortgage Statement ONLY.
  Look for labels: "Current Balance", "Unpaid Principal Balance", "Outstanding Balance", "Principal Balance".
  Do NOT use the original loan amount from the CD — that is always higher than the current balance.

existing_note_rate (the interest rate on the loan being refinanced):
  SOURCE = Mortgage Statement first, then Original CD "Loan Terms" section.
  CRITICAL: FHA Streamline documents contain TWO interest rates — the EXISTING rate on the current loan, and a PROPOSED new rate for the refinance. You MUST return ONLY the EXISTING rate.
  The existing rate appears under labels: "Interest Rate", "Current Rate", "Original Rate", "Note Rate", "Current Interest Rate".
  NEVER return a rate from any section labeled: "New Loan", "Proposed", "Option A", "Option B", "Refinance Rate", "New Rate", "Pricing".
  RULE: If you see two different rates in the documents, return the HIGHER one. In a streamline refinance, the existing rate is always higher than the proposed rate.

existing_monthly_pi (current P&I payment on the loan being paid off):
  SOURCE = Mortgage Statement.
  Look for: "Monthly P&I", "Principal & Interest", "P&I Payment", "P&I".
  Return current payment as a dollar amount. Do NOT use a proposed new payment.

existing_monthly_mip (current monthly mortgage insurance premium):
  SOURCE = Mortgage Statement.
  Look for: "Monthly MIP", "Mortgage Insurance", "MIP", "MI Payment".
  Return as a dollar amount (e.g. 96.25), NOT as a percentage.

original_ufmip (upfront MIP paid at original closing):
  SOURCE = Original CD or HUD-1 ONLY.
  Look for: "UFMIP", "Upfront MIP", "Upfront Mortgage Insurance Premium", "MIP Financed", "FHA MIP".
  This is the dollar amount financed at original closing (e.g. 3097.50).
  Do NOT use the new loan's UFMIP if this is a refinance document.

endorsement_date (date the original FHA loan closed/was endorsed):
  SOURCE = Original CD or mortgage statement.
  Look for: "FHA Endorsement Date", "Closing Date", "Disbursement Date", "Origination Date", "Original Closing Date".
  Return as YYYY-MM-DD format.

existing_case_number:
  SOURCE = Any document. FHA case numbers follow format: 3 digits, hyphen, 7 digits, hyphen, 3 digits (e.g. 105-1234567-703).
  Extract exactly as printed.

property_value:
  SOURCE = CD purchase price or appraised value.
  For streamlines with no appraisal, use the original purchase/sale price.

lates_last_6 and lates_months_7_12:
  SOURCE = Payment history document only.
  Count only 30-day late payment events.
  If payment history shows all payments current with no lates, return 0 (not null).

is_delinquent:
  Return true ONLY if the most recent payment is currently unpaid or overdue.
  Return false if all payments are current.

in_forbearance:
  Return true ONLY if forbearance is explicitly mentioned.
  Return false if not mentioned anywhere in the documents.

loan_number:
  SOURCE = Mortgage Statement.
  Look for: "Loan Number", "Account Number", "Loan #", "Account #".
  This is the servicer's internal number, NOT the FHA case number.

CONFIDENCE SCORING — for each field include a confidence level:
  "high" = value found explicitly with a clear matching label in the document
  "medium" = value inferred from context or calculated from other stated values
  "low" = best guess, ambiguous label, or only one of multiple possible values

Return ONLY a valid JSON object — no markdown, no backticks, no explanation, no preamble. Use exactly this structure:

{
  "existing_upb": number or null,
  "existing_upb_confidence": "high" or "medium" or "low" or null,
  "existing_note_rate": number as percent e.g. 7.25 (NOT decimal 0.0725) or null,
  "existing_note_rate_confidence": "high" or "medium" or "low" or null,
  "existing_monthly_pi": number or null,
  "existing_monthly_pi_confidence": "high" or "medium" or "low" or null,
  "existing_monthly_mip": number or null,
  "existing_monthly_mip_confidence": "high" or "medium" or "low" or null,
  "original_ufmip": number or null,
  "original_ufmip_confidence": "high" or "medium" or "low" or null,
  "endorsement_date": "YYYY-MM-DD" or null,
  "endorsement_date_confidence": "high" or "medium" or "low" or null,
  "existing_case_number": "string e.g. 105-1234567-703" or null,
  "existing_case_number_confidence": "high" or "medium" or "low" or null,
  "property_value": number or null,
  "property_value_confidence": "high" or "medium" or "low" or null,
  "state": "2-letter state code" or null,
  "county": "county name without the word County e.g. Bibb not Bibb County" or null,
  "borrower_name": "full borrower name string" or null,
  "property_address": "full property address string" or null,
  "lates_last_6": number of 30-day lates in last 6 months or null,
  "lates_months_7_12": number of 30-day lates in months 7-12 or null,
  "in_forbearance": true or false or null,
  "is_delinquent": true or false or null,
  "loan_number": "servicer loan number string" or null,
  "docs_identified": array of document types found from this list: ["closing_disclosure", "mortgage_statement", "payment_history", "hud1", "unknown"]
}`;

    let contentBlocks = [];

    // ── Multi-doc format: { documents: [{ label, base64, mediaType }] }
    if (request.data.documents && Array.isArray(request.data.documents)) {
      if (request.data.documents.length === 0) throw new Error("documents array is empty");
      for (const docItem of request.data.documents) {
        if (!docItem.base64) throw new Error(`Document '${docItem.label || "unknown"}' is missing base64 data`);
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: docItem.mediaType || "application/pdf",
            data: docItem.base64,
          },
        });
      }
    }
    // ── Legacy single-doc format: { documentBase64, mediaType, documentType }
    else if (request.data.documentBase64) {
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: request.data.mediaType || "application/pdf",
          data: request.data.documentBase64,
        },
      });
    }
    else {
      throw new Error("Provide either 'documents' array or 'documentBase64'");
    }

    contentBlocks.push({ type: "text", text: promptText });

    const response = await callAnthropic(ANTHROPIC_KEY.value(), {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const raw     = response.content[0].text.trim();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("Haiku returned non-JSON. Raw: " + raw.substring(0, 200));
    }

    // ── Post-extraction validation — flag suspicious values, do not block
    const warnings = [];

    if (parsed.existing_note_rate !== null && parsed.existing_note_rate !== undefined) {
      if (parsed.existing_note_rate < 2.0 || parsed.existing_note_rate > 14.0) {
        warnings.push(`existing_note_rate ${parsed.existing_note_rate}% is outside expected range 2.0–14.0% — may be a decimal (e.g. 0.0725 instead of 7.25)`);
        parsed.existing_note_rate_confidence = "low";
      }
    }
    if (parsed.existing_upb !== null && parsed.existing_upb !== undefined) {
      if (parsed.existing_upb < 10000 || parsed.existing_upb > 2000000) {
        warnings.push(`existing_upb $${parsed.existing_upb} is outside expected range $10,000–$2,000,000`);
        parsed.existing_upb_confidence = "low";
      }
    }
    if (parsed.original_ufmip !== null && parsed.original_ufmip !== undefined) {
      // UFMIP is a dollar amount (~1.75% of loan). If < 100 it's likely a rate decimal, not dollars.
      if (parsed.original_ufmip > 0 && parsed.original_ufmip < 100) {
        warnings.push(`original_ufmip ${parsed.original_ufmip} looks like a rate or percentage, not a dollar amount — expected range $500–$15,000`);
        parsed.original_ufmip_confidence = "low";
      }
    }
    if (parsed.existing_monthly_mip !== null && parsed.existing_monthly_mip !== undefined) {
      if (parsed.existing_monthly_mip > 0 && parsed.existing_monthly_mip < 10) {
        warnings.push(`existing_monthly_mip ${parsed.existing_monthly_mip} looks like a rate, not a monthly dollar amount — expected range $30–$500`);
        parsed.existing_monthly_mip_confidence = "low";
      }
    }

    if (warnings.length > 0) {
      console.warn("extractFHADocument validation warnings:", warnings);
      parsed._extraction_warnings = warnings;
    }

    return { data: parsed };
  }
);

// ===========================================================================
// FUNCTION 7: extractVADocument → Gen2 | M11 VA IRRRL
// Supports multi-doc { documents: [{label, base64, mediaType}] }
// and legacy single-doc { documentBase64, mediaType }
//
// EXTRACTION IMPROVEMENTS (March 2026):
// - Per-field source priority rules (Mortgage Statement vs VA Note vs COE)
// - Rate disambiguation: existing rate only, never proposed/new rate
// - Confidence scoring per field (high/medium/low)
// - Post-extraction validation with warnings
// - closingDate + monthsSeasonedCount for seasoning check
// - docs_identified array to confirm what was found
// ===========================================================================
exports.extractVADocument = onCall(
  { secrets: [ANTHROPIC_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {

    const promptText = `You are a mortgage document extraction specialist. You will extract VA loan data from one or more documents provided. Documents may include a VA Certificate of Eligibility (COE), mortgage/account statement, or VA Note (promissory note).

DOCUMENT SOURCE PRIORITY RULES — follow these strictly:

veteranName:
  SOURCE = Any document.
  Look for: "Borrower", "Veteran", "Name", "Applicant".
  Return full legal name as printed.

vaLoanNumber:
  SOURCE = COE or mortgage statement.
  Look for: "VA Loan Number", "VA Case Number", "Loan #", "VA Loan #".
  VA loan numbers typically follow format: XXXXXXXXXX or XX-XX-X-XXXXXXX.

currentNoteRate (the interest rate on the loan being refinanced):
  SOURCE = Mortgage Statement first, then VA Note.
  CRITICAL: VA IRRRL documents may contain BOTH the existing loan rate and a proposed new rate. You MUST return ONLY the EXISTING rate on the loan currently being paid.
  Look for: "Interest Rate", "Current Rate", "Note Rate", "Original Rate".
  Return as a DECIMAL — e.g. return 0.0675 for 6.75%, return 0.0750 for 7.50%.
  NEVER return a rate from any section labeled: "New Loan", "Proposed", "New Rate", "Refinance Rate", "Option".
  RULE: If you see two rates, return the HIGHER one expressed as a decimal. The existing rate is always higher in an IRRRL.

currentPIPayment (current monthly P&I payment on the loan being paid off):
  SOURCE = Mortgage Statement.
  Look for: "Monthly P&I", "Principal & Interest", "P&I Payment", "P&I".
  Return as a dollar amount (e.g. 1850.00). Do NOT use a proposed new payment.

originalLoanAmount (amount at origination, before any paydown):
  SOURCE = VA Note or original CD.
  Look for: "Original Loan Amount", "Note Amount", "Principal Amount", "Loan Amount".
  This is always greater than the current remaining balance.

remainingBalance (current outstanding payoff balance):
  SOURCE = Mortgage Statement ONLY.
  Look for: "Current Balance", "Unpaid Principal Balance", "Outstanding Balance", "Remaining Balance".
  This is always less than originalLoanAmount.

originalTermMonths:
  SOURCE = VA Note or CD.
  Look for: "Loan Term", "Term", "Maturity".
  Convert years to months: 30 years = 360, 20 years = 240, 15 years = 180.

remainingTermMonths:
  SOURCE = Mortgage Statement.
  Look for: "Payments Remaining", "Remaining Term", "Months Remaining".
  If not explicit, calculate: remainingTermMonths = originalTermMonths - paymentsMade.

fundingFeeExempt:
  Return true ONLY if documents explicitly mention: service-connected disability, disability rating, VA disability compensation, or funding fee exemption/waiver.
  Return false if documents confirm veteran is NOT exempt or no disability is mentioned.
  Return null if the documents contain no mention of disability status or funding fee exemption.

propertyAddress:
  SOURCE = Any document.
  Return full street address including city, state, and zip code.

closingDate (date the original VA loan closed):
  SOURCE = VA Note or original CD.
  Look for: "Closing Date", "Origination Date", "Note Date", "Loan Date".
  Return as YYYY-MM-DD.

monthsSeasonedCount:
  Calculate as the number of full months between closingDate and March 2026.
  If closingDate not found, return null.

CONFIDENCE SCORING — for each field include a confidence level:
  "high" = value found explicitly with a clear matching label
  "medium" = value inferred or calculated from other stated values
  "low" = best guess, ambiguous label, or multiple possible values

Return ONLY a valid JSON object — no markdown, no backticks, no explanation, no preamble. Use exactly this structure:

{
  "veteranName": "full name string" or null,
  "vaLoanNumber": "VA loan number string" or null,
  "currentNoteRate": number as decimal e.g. 0.0675 for 6.75% or null,
  "currentNoteRate_confidence": "high" or "medium" or "low" or null,
  "currentPIPayment": number e.g. 1850.00 or null,
  "currentPIPayment_confidence": "high" or "medium" or "low" or null,
  "originalLoanAmount": number or null,
  "originalLoanAmount_confidence": "high" or "medium" or "low" or null,
  "remainingBalance": number or null,
  "remainingBalance_confidence": "high" or "medium" or "low" or null,
  "originalTermMonths": number e.g. 360 or null,
  "remainingTermMonths": number e.g. 324 or null,
  "fundingFeeExempt": true or false or null,
  "fundingFeeExempt_confidence": "high" or "medium" or "low" or null,
  "propertyAddress": "full address string" or null,
  "closingDate": "YYYY-MM-DD" or null,
  "monthsSeasonedCount": number or null,
  "docs_identified": array of document types found from this list: ["coe", "mortgage_statement", "va_note", "closing_disclosure", "unknown"]
}`;

    let contentBlocks = [];

    // ── Multi-doc format: { documents: [{ label, base64, mediaType }] }
    if (request.data.documents && Array.isArray(request.data.documents)) {
      if (request.data.documents.length === 0) throw new Error("documents array is empty");
      for (const doc of request.data.documents) {
        if (!doc.base64) throw new Error(`Document '${doc.label}' is missing base64 data`);
        contentBlocks.push({
          type: "document",
          source: { type: "base64", media_type: doc.mediaType || "application/pdf", data: doc.base64 },
        });
      }
    }
    // ── Legacy single-doc format: { documentBase64, mediaType }
    else if (request.data.documentBase64) {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: request.data.mediaType || "application/pdf", data: request.data.documentBase64 },
      });
    }
    else {
      throw new Error("Provide either 'documents' array or 'documentBase64'");
    }

    contentBlocks.push({ type: "text", text: promptText });

    const response = await callAnthropic(ANTHROPIC_KEY.value(), {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const raw     = response.content[0].text.trim();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("Haiku returned non-JSON. Raw: " + raw.substring(0, 200));
    }

    // ── Post-extraction validation — flag suspicious values, do not block
    const warnings = [];

    if (parsed.currentNoteRate !== null && parsed.currentNoteRate !== undefined) {
      // Rate should be decimal (0.0675), not percent (6.75)
      if (parsed.currentNoteRate > 0.20) {
        warnings.push(`currentNoteRate ${parsed.currentNoteRate} looks like a percentage, not a decimal — expected e.g. 0.0675 for 6.75%`);
        parsed.currentNoteRate_confidence = "low";
      }
      if (parsed.currentNoteRate < 0.01) {
        warnings.push(`currentNoteRate ${parsed.currentNoteRate} is suspiciously low — verify it is expressed as a decimal`);
        parsed.currentNoteRate_confidence = "low";
      }
    }
    if (
      parsed.remainingBalance !== null && parsed.remainingBalance !== undefined &&
      parsed.originalLoanAmount !== null && parsed.originalLoanAmount !== undefined
    ) {
      if (parsed.remainingBalance > parsed.originalLoanAmount * 1.05) {
        warnings.push(`remainingBalance ${parsed.remainingBalance} exceeds originalLoanAmount ${parsed.originalLoanAmount} — values may be swapped`);
        parsed.remainingBalance_confidence = "low";
        parsed.originalLoanAmount_confidence = "low";
      }
    }

    if (warnings.length > 0) {
      console.warn("extractVADocument validation warnings:", warnings);
      parsed._extraction_warnings = warnings;
    }

    return { data: parsed };
  }
);
