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

  const flag        = (val) => val ? "✅ Yes" : "—";
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
  <div class="header"><h1>🏦 LoanBeacons™</h1><p>Loan Scenario from ${fmt(lo.name)}${lo.company ? ` · ${lo.company}` : ""}</p><span class="badge">${shareTypeLabel}</span></div>
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
  <div class="cta"><a href="${viewUrl}">View Full Scenario Online →</a><p style="font-size:11px;color:#a0aec0;margin-top:12px;">Scenario ID: ${scenarioId}</p></div>
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
// ===========================================================================
exports.extractFHADocument = onCall(
  { secrets: [ANTHROPIC_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const promptText = `You are extracting FHA loan data from one or more documents.
Documents may include a Closing Disclosure, HUD-1, mortgage statement, or payment history.
Combine information from all documents provided. Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

{
  "existing_upb": number or null,
  "existing_note_rate": number as percent e.g. 7.25 or null,
  "existing_monthly_pi": number or null,
  "existing_monthly_mip": number or null,
  "original_ufmip": number or null,
  "endorsement_date": "YYYY-MM-DD" or null,
  "existing_case_number": "FHA case number string e.g. 105-1234567-703" or null,
  "property_value": number or null,
  "state": "2-letter state code" or null,
  "county": "county name without the word County" or null,
  "borrower_name": "full borrower name string" or null,
  "property_address": "full property address string" or null,
  "lates_last_6": number of 30-day lates in last 6 months or null,
  "lates_months_7_12": number of 30-day lates in months 7-12 or null,
  "in_forbearance": true or false or null,
  "is_delinquent": true or false or null,
  "loan_number": "servicer loan number string" or null
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
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const raw     = response.content[0].text.trim();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    try {
      return { data: JSON.parse(cleaned) };
    } catch (e) {
      throw new Error("Haiku returned non-JSON. Raw: " + raw.substring(0, 200));
    }
  }
);

// ===========================================================================
// FUNCTION 7: extractVADocument → Gen2 | M11 VA IRRRL
// Supports multi-doc { documents: [{label, base64, mediaType}] }
// and legacy single-doc { documentBase64, mediaType }
// ===========================================================================
exports.extractVADocument = onCall(
  { secrets: [ANTHROPIC_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const promptText = `You are extracting VA loan data from one or more documents (COE, mortgage statement, or VA Note).
Combine information from all documents provided. Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

{
  "veteranName": "full name string or null",
  "vaLoanNumber": "VA loan number string or null",
  "currentNoteRate": number as decimal e.g. 0.0675 for 6.75% or null,
  "currentPIPayment": number e.g. 1850.00 or null,
  "originalLoanAmount": number or null,
  "remainingBalance": number or null,
  "originalTermMonths": number e.g. 360 or null,
  "remainingTermMonths": number e.g. 324 or null,
  "fundingFeeExempt": true if service-connected disability mentioned, false if no exemption, null if unknown,
  "propertyAddress": "full address string or null",
  "documentType": "COE" or "mortgage_statement" or "note" or "unknown"
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
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const raw     = response.content[0].text.trim();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error("Haiku returned non-JSON. Raw: " + raw.substring(0, 200));
    }
  }
);
